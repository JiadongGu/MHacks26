"""Long-term agent "Compass". Scheduled jobs: morning briefing, evening check, twin rebuild, proposal sweep.

The scheduler runs `tick` every 5 minutes. A job acts only when the user's local time is inside its window.
`job_runs` (job_name, user_id, detail = local date) makes every job idempotent for one day.
"""

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from datetime import time as dtime
from typing import Any
from uuid import UUID

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from app import notify
from app.agents import chat
from app.core import db
from app.focus import store as focus_store
from app.focus.catalog import BY_KEY
from app.integrations.gcal import sync as gcal_sync
from app.planner import render as plan_render
from app.planner import service as planner
from app.rules.engine import _block
from app.rules.types import RuleContext
from app.twin import service as twin_service
from app.twin import store as twin_store
from app.twin.tz import DEFAULT_TIMEZONE, local_now

log = logging.getLogger("pulse.compass")

WINDOW_MIN = 10
JOB_HOURS: dict[str, int] = {"briefing": 7, "evening": 21, "rebuild": 3}
JOB_TIMEOUT_S = 120
SWEEP_EXPIRE_H = 24
MAX_BRIEFING_CHARS = 800
DEFAULT_SLEEP_MIN = 450


@dataclass(frozen=True)
class UserRef:
    user_id: UUID
    tz: str


# ------------------------------------------------------------------ pure window and idempotency logic


def in_window(local: datetime, hour: int, minutes: int = WINDOW_MIN) -> bool:
    """True from hour:00 up to, not including, hour:minutes."""
    return local.hour == hour and local.minute < minutes


def due_jobs(local: datetime) -> list[str]:
    return [job for job, hour in JOB_HOURS.items() if in_window(local, hour)]


def period_key(local: datetime) -> str:
    """The period key of a daily job is the user's local date."""
    return local.date().isoformat()


def pending_runs(users: list[UserRef], now: datetime,
                 done: set[tuple[str, UUID, str]]) -> list[tuple[str, UUID, str]]:
    """(job, user_id, key) triples that are due now and not done yet."""
    out = []
    for u in users:
        local = local_now(u.tz or DEFAULT_TIMEZONE, now)
        key = period_key(local)
        for job in due_jobs(local):
            if (job, u.user_id, key) not in done:
                out.append((job, u.user_id, key))
    return out


def tomorrow_bounds(local: datetime) -> tuple[datetime, datetime]:
    start = datetime.combine(local.date() + timedelta(days=1), dtime(0, 0), tzinfo=local.tzinfo)
    return start, start + timedelta(days=1)


# ------------------------------------------------------------------ pure text


def goal_line(g: dict[str, Any]) -> str:
    """Goal in words ('8,000 steps a day', '7.5 h of sleep a night'); the briefing is read aloud."""
    m, t, per = g["metric"], g["target"], g["period"]
    when = "night" if m.startswith("sleep") and per == "day" else per
    if m.startswith("sleep") and m.endswith("_min"):
        what = f"{t / 60:g} h of sleep"
    elif m == "steps":
        what = f"{chat.num(t)} steps"
    elif m == "active_minutes":
        what = f"{chat.num(t)} active minutes"
    elif m == "workout":
        what = f"{chat.num(t)} workouts"
    else:
        sign = ">=" if g["direction"] == "at_least" else "<="
        return f"{chat.metric_label(m)} {sign} {chat.num(t)}/{per}"
    return f"{'at most ' if g['direction'] == 'at_most' else ''}{what} a {when}"


def recommend(facts: dict[str, Any]) -> str:
    sleep = facts.get("sleep_min")
    if facts.get("status") == "possibly_ill":
        return "Take it easy today, drink water, and skip hard workouts."
    if sleep is not None and sleep < 360:
        return "Short night. Keep today light and aim for an early bedtime."
    steps_goal = next((g for g in facts.get("goals", []) if g["metric"] == "steps" and g["period"] == "day"),
                      None)
    if steps_goal:
        return "A brisk 20 minute walk is an easy way to add steps."
    return "Keep your routine steady and drink water."


def first_name(name: str | None) -> str:
    return (name or "").split()[0] if (name or "").strip() else ""


def day_label(dt: datetime, local: datetime, tz: str) -> str:
    """today, tomorrow, or the weekday. A check-in says which day, never the clock time."""
    days = (local_now(tz, dt).date() - local.date()).days
    if days == 0:
        return "today"
    return "tomorrow" if days == 1 else local_now(tz, dt).strftime("%A")


def coming_up(events: list[dict[str, Any]], with_day: bool = True) -> str | None:
    """'A and B tomorrow.' with no times. Mixed days keep their own label."""
    if not events:
        return None
    titles = [e["title"] for e in events]
    days = {e.get("day") for e in events}
    if len(days) == 1 and None not in days:
        names = titles[0] if len(titles) == 1 else ", ".join(titles[:-1]) + " and " + titles[-1]
        return f"{names} {days.pop()}." if with_day else f"{names}."
    return "; ".join(f"{e['title']} ({e.get('day', 'soon')})" for e in events) + "."


OUTDOOR_WORDS = ("fair", "picnic", "tailgate", "game", "run", "hike", "walk", "tour", "festival", "bonding",
                 "practice", "rush", "cookout", "beach", "field")


def heads_up(facts: dict[str, Any]) -> str | None:
    """One personal observation for today, from the calendar, the plan and what the person is working on."""
    today = [e for e in facts.get("events", []) if e.get("day") == "today"]
    n = len(today)
    outdoors = any(w in e["title"].lower() for e in today for w in OUTDOOR_WORDS)
    sun_care = facts.get("skin_cancer") or "sun" in facts.get("focus_keys", [])
    load = facts.get("plan_load")
    if sun_care and (n >= 3 or outdoors):
        why = f"You have {n} events today" if n >= 3 else "You have an event that may be outdoors today"
        return f"{why}, so remember to reapply your sunscreen if you are outside."
    if load == "packed":
        return "It is a packed day, so protect one real break, even a short one."
    if "study" in facts.get("focus_keys", []) and load == "light":
        return "Your day is open, which makes it a good one to get ahead on studying."
    if "sleep" in facts.get("focus_keys", []) and facts.get("tonight_early"):
        return "You start early tomorrow, so aim for an earlier night."
    return None


def compose_briefing(facts: dict[str, Any]) -> str:
    """Broad strokes: how you are, what you are working on today, what is coming up, and why.

    Exact times live on the calendar and in Today's plan, so none appear here.
    """
    who = first_name(facts.get("name"))
    out = [f"Good morning{', ' + who if who else ''}.", ""]
    if facts.get("sleep_min") is not None:
        out.append(f"Last night: you slept {chat.minutes_text(facts['sleep_min'])}. "
                   f"Status: {str(facts.get('status', 'unknown')).replace('_', ' ')}.")
    else:
        status = str(facts.get("status", "unknown")).replace("_", " ")
        out.append(f"Last night: no sleep data. Status: {status}.")
    short_night = (facts.get("sleep_min") or 999) < 360
    if facts.get("status") == "possibly_ill" or short_night or not facts.get("focus_lines"):
        out.append(f"Takeaway: {recommend(facts)}")
    if facts.get("focus_lines"):
        out += ["", "Focus today:"] + list(facts["focus_lines"])
    elif facts.get("focus"):
        out += ["", "Focus: " + ", ".join(facts["focus"]) + "."]
    tip = heads_up(facts)
    if tip:
        out += ["", "Heads-up: " + tip]
    soon = coming_up([e for e in facts.get("events", []) if e["important"]][:3])
    if soon:
        out += ["", "Coming up: " + soon]
    if facts.get("plan_why"):
        out += ["", "Why: " + facts["plan_why"]]
    if facts.get("focus_lines"):
        out += ["", "Times are in Today's plan and on your calendar."]
    return chat.clip_lines("\n".join(out), MAX_BRIEFING_CHARS)


def sleep_recommendation(facts: dict[str, Any]) -> str:
    if facts.get("tonight_bed"):
        base = f"Aim for lights out by {facts['tonight_bed']}. {facts.get('tonight_reason', '')}".strip()
        return base + (" Your body needs the rest." if facts.get("status") == "possibly_ill" else "")
    target = facts.get("sleep_goal_min") or DEFAULT_SLEEP_MIN
    bed = facts.get("bed_time") or "22:30"
    base = f"Aim for {chat.minutes_text(target)} of sleep. Lights out by {bed}."
    if facts.get("status") == "possibly_ill":
        return base + " Your body needs the rest."
    return base


def goal_result(g: dict[str, Any]) -> str:
    met = g["on_track"] if g["direction"] == "at_most" else g["pct"] >= 100
    label = chat.metric_label(g["metric"])
    if met:
        return f"{label} goal reached"
    if g["metric"].startswith("sleep"):
        return f"{label} {chat.minutes_text(g['current'])} so far"
    return f"{label} {chat.num(g['current'])} so far"


def compose_evening(facts: dict[str, Any]) -> str:
    out = ["Evening check.", ""]
    day_goals = [g for g in facts.get("goals", []) if g["period"] == "day"]
    if day_goals:
        out.append("Today: " + "; ".join(goal_result(g) for g in day_goals[:3]) + ".")
    soon = coming_up(facts.get("tomorrow_events", [])[:3], with_day=False)
    out.append("Tomorrow: " + (soon if soon else "nothing on your calendar."))
    if facts.get("plan_headline"):
        out.append(facts["plan_headline"])
    if facts.get("focus_lines"):
        out += ["", "Focus for tomorrow:"] + list(facts["focus_lines"])
    if facts.get("plan_why"):
        out += ["", "Why: " + facts["plan_why"]]
    out += ["", "Tonight: " + sleep_recommendation(facts)]
    return chat.clip_lines("\n".join(out), MAX_BRIEFING_CHARS)


def wants_sleep_block(facts: dict[str, Any]) -> bool:
    return facts.get("status") == "possibly_ill" and not facts.get("pending_proposal")


# ------------------------------------------------------------------ data access (patched in tests)


async def list_users() -> list[UserRef]:
    """Users that have a digital twin, with their time zone."""
    async with db.neon() as conn:
        cur = await conn.execute(
            "select t.user_id, p.timezone from (select distinct user_id from digital_twin) t "
            "left join profiles p on p.user_id = t.user_id")
        rows = await cur.fetchall()
    return [UserRef(r["user_id"], r["timezone"] or DEFAULT_TIMEZONE) for r in rows]


async def done_runs(user_ids: list[UUID]) -> set[tuple[str, UUID, str]]:
    if not user_ids:
        return set()
    async with db.neon() as conn:
        cur = await conn.execute(
            "select job_name, user_id, detail from job_runs where job_name = any(%s) and user_id = any(%s) "
            "and status = 'ok' and started_at > now() - interval '2 days'",
            (list(JOB_HOURS), user_ids))
        rows = await cur.fetchall()
    return {(r["job_name"], r["user_id"], r["detail"]) for r in rows}


async def start_run(job: str, user_id: UUID | None, detail: str) -> Any:
    async with db.neon() as conn:
        cur = await conn.execute(
            "insert into job_runs (job_name, user_id, status, detail) values (%s, %s, 'running', %s) "
            "returning id", (job, user_id, detail))
        row = await cur.fetchone()
    return row["id"]


async def finish_run(run_id: Any, status: str, detail: str) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "update job_runs set status = %s, detail = %s, finished_at = now() where id = %s",
            (status, detail, run_id))


async def load_profile(user_id: UUID) -> dict[str, Any]:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select display_name, timezone, bed_time, wake_time from profiles where user_id = %s",
            (user_id,))
        row = await cur.fetchone()
    return row or {}


async def persist_alert(user_id: UUID, kind: str, title: str, body: str, payload: dict[str, Any],
                        proposal: dict[str, Any] | None = None) -> dict[str, Any]:
    """Write an info alert and an optional pending proposal in one transaction."""
    async with db.neon() as conn, conn.transaction():
        cur = await conn.execute(
            "insert into alerts (user_id, kind, severity, title, body, payload, channels) "
            "values (%s, %s, 'info', %s, %s, %s, %s) returning id, created_at",
            (user_id, kind, title, body, Jsonb(payload), Jsonb([])))
        alert = await cur.fetchone()
        assert alert is not None
        proposal_id = None
        if proposal:
            cur = await conn.execute(
                "insert into calendar_proposals (user_id, title, starts_at, ends_at, rationale, status, "
                "alert_id) values (%s, %s, %s, %s, %s, 'pending', %s) returning id",
                (user_id, proposal["title"], proposal["starts_at"], proposal["ends_at"],
                 proposal["rationale"], alert["id"]))
            row = await cur.fetchone()
            assert row is not None
            proposal_id = row["id"]
            await conn.execute("update alerts set proposal_id = %s where id = %s", (proposal_id, alert["id"]))
    return {"id": alert["id"], "user_id": user_id, "kind": kind, "severity": "info", "title": title,
            "body": body, "proposal_id": proposal_id, "created_at": alert["created_at"]}


async def save_briefing(user_id: UUID, day: date, text: str) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "insert into briefings (user_id, day, text) values (%s, %s, %s) "
            "on conflict (user_id, day) do update set text = excluded.text, audio_url = null, "
            "created_at = now()", (user_id, day, text))


# ------------------------------------------------------------------ job bodies


async def _facts(user_id: UUID, now: datetime) -> dict[str, Any]:
    profile = await load_profile(user_id)
    tz = profile.get("timezone") or DEFAULT_TIMEZONE
    local = local_now(tz, now)
    tools = chat.Toolbox(user_id, "web", tz)
    status = await tools.t_get_status()
    goals = (await tools.t_get_goal_progress())["goals"]
    events = await chat.upcoming_events(user_id, 48)
    tomorrow_start, tomorrow_end = tomorrow_bounds(local)
    sleep_goal = next((g["target"] for g in goals if g["metric"] == "sleep_total_min"
                       and g["period"] == "day"), None)
    pending = await chat.pending_proposal(user_id)
    bed = profile.get("bed_time")
    picks = await focus_store.list_picks(user_id)
    focus = [BY_KEY[k].label.lower() for k in picks if k in BY_KEY]
    twin = await twin_store.latest_twin(user_id)
    flags = ((twin or {}).get("model") or {}).get("risk_flags") or []
    return {
        "focus": focus,
        "focus_keys": picks,
        "skin_cancer": "skin_cancer" in flags,
        "name": (profile.get("display_name") or "").strip() or None, "tz": tz, "local": local,
        "status": status["status"], "sleep_min": status["sleep_min"], "goals": goals,
        "sleep_goal_min": sleep_goal, "bed_time": bed.strftime("%H:%M") if hasattr(bed, "strftime") else bed,
        "wake_time": profile.get("wake_time"), "pending_proposal": pending is not None,
        "events": [{"title": e["title"], "when": chat.fmt_dt(e["starts_at"], tz),
                    "day": day_label(e["starts_at"], local, tz),
                    "important": bool(e["is_important"]) and e["starts_at"] < now + timedelta(hours=24)}
                   for e in events],
        "tomorrow_events": [{"title": e["title"], "when": chat.fmt_dt(e["starts_at"], tz), "day": "tomorrow"}
                            for e in events if tomorrow_start <= e["starts_at"] < tomorrow_end],
    }


async def _briefing_body(user_id: UUID, now: datetime) -> None:
    facts = await _facts(user_id, now)
    try:
        today_plan, _tomorrow = await planner.build_plans(user_id, now)
        facts["plan_text"] = today_plan.text
        facts["focus_lines"] = today_plan.focus_lines
        facts["plan_load"] = today_plan.load
        facts["tonight_early"] = today_plan.shifted_min > 0
        facts["plan_why"] = today_plan.why
    except Exception as exc:  # the briefing still goes out without a plan
        log.warning("compass.plan_failed job=briefing user=%s err=%s", user_id, type(exc).__name__)
    text = compose_briefing(facts)
    await save_briefing(user_id, facts["local"].date(), text)
    alert = await persist_alert(user_id, "morning_briefing", "Good morning", text,
                                {"facts": {"status": facts["status"], "sleep_min": facts["sleep_min"]}})
    await notify.dispatch(user_id, alert)


def sleep_block(facts: dict[str, Any], now: datetime) -> dict[str, Any]:
    """Next sleep block from bed time to wake time, like rule R2."""
    ctx = RuleContext(now=now, tz=facts["tz"])
    bed = _to_time(facts.get("bed_time")) or dtime(22, 0)
    wake = _to_time(facts.get("wake_time")) or dtime(6, 0)
    start, end = _block(ctx, bed, wake)
    return {"title": "Sleep block (Pulse)", "starts_at": start, "ends_at": end,
            "rationale": "Your status is possibly ill. A full night of sleep can help you recover."}


def _to_time(value: Any) -> dtime | None:
    if value is None or isinstance(value, dtime):
        return value
    try:
        return dtime.fromisoformat(str(value))
    except ValueError:
        return None


async def _evening_body(user_id: UUID, now: datetime) -> None:
    facts = await _facts(user_id, now)
    today = facts["local"].date()
    try:
        tonight = await planner.build_plan(user_id, today, now)  # refreshes tonight's wind-down
        tomorrow = await planner.build_plan(user_id, today + timedelta(days=1), now)
        facts["tonight_bed"] = plan_render.clock(tonight.bed)
        facts["tonight_reason"] = tonight.reason if tonight.shifted_min > 0 else ""
        facts["plan_text"] = tomorrow.text
        facts["focus_lines"] = tomorrow.focus_lines
        facts["plan_headline"] = tomorrow.headline
        facts["plan_why"] = tomorrow.why
    except Exception as exc:  # the evening message still goes out without a plan
        log.warning("compass.plan_failed job=evening user=%s err=%s", user_id, type(exc).__name__)
    text = compose_evening(facts)
    proposal = None
    if wants_sleep_block(facts):
        proposal = sleep_block(facts, now)
    alert = await persist_alert(user_id, "evening_check", "Evening check", text,
                                {"facts": {"status": facts["status"]}}, proposal)
    await notify.dispatch(user_id, alert)


async def _rebuild_body(user_id: UUID, now: datetime) -> None:
    try:
        await twin_service.rebuild(user_id)
    except twin_service.TwinNotFound:
        log.info("compass.rebuild_skipped user=%s reason=no_twin", user_id)


BODIES: dict[str, Callable[[UUID, datetime], Awaitable[None]]] = {
    "briefing": _briefing_body, "evening": _evening_body, "rebuild": _rebuild_body}


# ------------------------------------------------------------------ runner


async def _run(job: str, user_id: UUID, key: str) -> bool:
    """Run one job with a job_runs row. Never raises. Returns True on success."""
    started = time.monotonic()
    try:
        run_id = await start_run(job, user_id, key)
    except Exception as exc:
        log.warning("compass.run_start_failed job=%s err=%s", job, type(exc).__name__)
        return False
    status, detail = "ok", key
    try:
        await asyncio.wait_for(BODIES[job](user_id, datetime.now(UTC)), timeout=JOB_TIMEOUT_S)
    except Exception as exc:
        status, detail = "error", f"{key} err={type(exc).__name__}"
        log.warning("compass.job_failed job=%s user=%s err=%s", job, user_id, type(exc).__name__)
    try:
        await finish_run(run_id, status, detail)
    except Exception as exc:
        log.warning("compass.run_finish_failed job=%s err=%s", job, type(exc).__name__)
    log.info("compass.job job=%s user=%s status=%s ms=%d", job, user_id, status,
             (time.monotonic() - started) * 1000)
    return status == "ok"


async def _run_for_user(job: str, user_id: UUID, force: bool) -> bool:
    tz = (await load_profile(user_id)).get("timezone") or DEFAULT_TIMEZONE
    key = period_key(local_now(tz))
    if not force and (job, user_id, key) in await done_runs([user_id]):
        return False
    return await _run(job, user_id, key)


async def run_briefing(user_id: UUID, force: bool = False) -> bool:
    return await _run_for_user("briefing", user_id, force)


async def run_evening(user_id: UUID, force: bool = False) -> bool:
    return await _run_for_user("evening", user_id, force)


async def run_rebuild(user_id: UUID, force: bool = False) -> bool:
    return await _run_for_user("rebuild", user_id, force)


async def tick() -> None:
    """Every 5 minutes. Runs the jobs whose local-time window is open. Writes a heartbeat row."""
    started = time.monotonic()
    ran = 0
    status = "ok"
    try:
        users = await list_users()
        now = datetime.now(UTC)
        due = pending_runs(users, now, set())
        if due:
            done = await done_runs(sorted({u for _, u, _ in due}, key=str))
            for job, user_id, key in pending_runs(users, now, done):
                ran += int(await _run(job, user_id, key))
    except Exception as exc:
        status = "error"
        log.exception("compass.tick_failed err=%s", type(exc).__name__)
    await _heartbeat("compass_tick", status, f"ran={ran}")
    log.info("compass.tick ran=%d ms=%d", ran, (time.monotonic() - started) * 1000)


async def _heartbeat(job: str, status: str, detail: str) -> None:
    try:
        run_id = await start_run(job, None, detail)
        await finish_run(run_id, status, detail)
    except Exception as exc:
        log.warning("compass.heartbeat_failed job=%s err=%s", job, type(exc).__name__)


# ------------------------------------------------------------------ demo reset


async def reset_demo(user_id: UUID) -> dict[str, int]:
    """Let scenarios fire again: expire pending proposals, clear rule cooldowns, status back to normal.
    Nothing is deleted; cleared alerts keep their history and only stop counting toward cooldowns."""
    async with db.neon() as conn:
        cur = await conn.execute(
            "update calendar_proposals set status = 'expired' where user_id = %s and status = 'pending' "
            "returning id", (user_id,))
        proposals = len(await cur.fetchall())
        cur = await conn.execute(
            "update alerts set payload = coalesce(payload, '{}'::jsonb) "
            "|| '{\"cooldown_cleared\": true}'::jsonb "
            "where user_id = %s and created_at > now() - interval '48 hours' and kind <> 'symptom_log' "
            "returning id", (user_id,))
        alerts = len(await cur.fetchall())
        await conn.execute(
            "update digital_twin set model = jsonb_set(model, '{status}', '\"normal\"'::jsonb) "
            "where user_id = %s and version = (select max(version) from digital_twin where user_id = %s)",
            (user_id, user_id))
    log.info("compass.reset_demo user=%s proposals=%d alerts=%d", user_id, proposals, alerts)
    return {"proposals_expired": proposals, "alerts_cleared": alerts}


# ------------------------------------------------------------------ proposal sweep


async def expire_pending() -> int:
    async with db.neon() as conn:
        cur = await conn.execute(
            "update calendar_proposals set status = 'expired' where status = 'pending' "
            "and created_at < now() - make_interval(hours => %s) returning id", (SWEEP_EXPIRE_H,))
        return len(await cur.fetchall())


async def retry_candidates() -> list[dict[str, Any]]:
    """Approved or failed proposals decided in the last 24 h, for users with Google connected."""
    async with db.neon() as conn:
        cur = await conn.execute(
            "select p.id, p.user_id, p.title, p.status from calendar_proposals p "
            "where p.status in ('approved', 'failed') "
            "and coalesce(p.decided_at, p.created_at) > now() - make_interval(hours => %s) "
            "and exists (select 1 from calendar_connections c where c.user_id = p.user_id "
            "and c.health_calendar_id is not null) order by p.created_at limit 50", (SWEEP_EXPIRE_H,))
        return await cur.fetchall()


async def reopen(proposal_id: UUID) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "update calendar_proposals set status = 'approved' where id = %s and status = 'failed'",
            (proposal_id,))


async def sweep_proposals() -> None:
    """Every 15 minutes. Expire old pending proposals. Retry the calendar insert. Notify a success once."""
    started = time.monotonic()
    expired = applied = 0
    status = "ok"
    try:
        expired = await expire_pending()
        for p in await retry_candidates():
            if p["status"] == "failed":
                await reopen(p["id"])
            try:
                await gcal_sync.apply_proposal(p["id"])
            except HTTPException as exc:
                log.info("compass.apply_retry_failed proposal=%s detail=%s", p["id"], exc.detail)
                continue
            except Exception as exc:
                log.warning("compass.apply_retry_error proposal=%s err=%s", p["id"], type(exc).__name__)
                continue
            applied += 1
            alert = await persist_alert(
                p["user_id"], "proposal_applied", "Added to your calendar",
                f'Added "{p["title"]}" to your calendar.', {"proposal_id": str(p["id"])})
            await notify.dispatch(p["user_id"], alert)
    except Exception as exc:
        status = "error"
        log.exception("compass.sweep_failed err=%s", type(exc).__name__)
    await _heartbeat("proposal_sweep", status, f"expired={expired} applied={applied}")
    log.info("compass.sweep expired=%d applied=%d ms=%d", expired, applied,
             (time.monotonic() - started) * 1000)
