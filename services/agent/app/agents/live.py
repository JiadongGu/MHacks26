"""Live agent "Pulse". Loads context, runs the rules, phrases findings, writes alerts, notifies."""

import asyncio
import logging
import time
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from datetime import time as dtime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from psycopg.types.json import Jsonb

from app import llm, notify
from app.contracts import CalendarEvent, DailySummary, Goal
from app.core import db, spacetime
from app.rules import TITLES, Finding, RuleContext, evaluate
from app.rules.explain import explain

log = logging.getLogger("pulse.live")

SERIES_METRICS = ["heart_rate", "steps", "spo2"]
BP_METRICS = ["bp_systolic", "bp_diastolic"]
DAILY_METRICS = ["resting_heart_rate", "hrv_sdnn", "sleep_total_min", "steps"]
RELEVANT = set(SERIES_METRICS + BP_METRICS + DAILY_METRICS + ["workout"])
TWIN_STATUS = {"illness_onset": "possibly_ill", "recovery": "normal"}
SWEEP_WINDOW_MIN = 10

_locks: dict[UUID, asyncio.Lock] = defaultdict(asyncio.Lock)


def _to_time(value: Any) -> dtime | None:
    if value is None or isinstance(value, dtime):
        return value
    try:
        return dtime.fromisoformat(str(value))
    except ValueError:
        return None


def assemble(
    now: datetime,
    user_id: UUID,
    profile: dict[str, Any] | None,
    twin_row: dict[str, Any] | None,
    goal_rows: list[dict[str, Any]],
    series_rows: list[dict[str, Any]],
    daily_rows: list[dict[str, Any]],
    event_rows: list[dict[str, Any]],
    alert_rows: list[dict[str, Any]],
) -> tuple[RuleContext, str]:
    """Pure step. Turns database rows into a RuleContext and a twin summary for the LLM."""
    twin = (twin_row or {}).get("model") or {}
    profile = profile or {}
    tz = profile.get("timezone") or (twin.get("profile") or {}).get("timezone") or "UTC"
    try:
        ZoneInfo(tz)
    except Exception:
        tz = "UTC"

    goals: list[Goal] = []
    for r in goal_rows:
        try:
            goals.append(Goal.model_validate({**r, "user_id": user_id}))
        except Exception:
            log.warning("live.bad_goal user=%s", user_id)

    series: dict[str, list[tuple[datetime, float]]] = defaultdict(list)
    for r in series_rows:
        series[r["metric"]].append((r["ts"], float(r["v"])))
    for pts in series.values():
        pts.sort(key=lambda p: p[0])

    daily: dict[str, dict[date, DailySummary]] = defaultdict(dict)
    for r in daily_rows:
        daily[r["metric"]][r["day"]] = DailySummary(
            user_id=user_id, day=r["day"], metric=r["metric"], avg=r["avg"], min=r["min"], max=r["max"],
            sum=r["sum"], n=r["n"] or 0)

    events = [CalendarEvent(event_id=r["event_id"], title=r["title"], starts_at=r["starts_at"],
                            ends_at=r["ends_at"], is_important=True) for r in event_rows]

    ctx = RuleContext(
        now=now, tz=tz, twin=twin, goals=goals, series=dict(series), daily=dict(daily), events=events,
        recent_alerts=[(r["kind"], r["created_at"]) for r in alert_rows],
        wake_time=_to_time(profile.get("wake_time")), bed_time=_to_time(profile.get("bed_time")))
    summary = str((twin_row or {}).get("summary") or "")
    if goals:
        summary += " Goals: " + "; ".join(f"{g.metric} {g.direction} {g.target:g}/{g.period}" for g in goals)
    return ctx, summary.strip()


def _ms(t: datetime) -> int:
    return int(t.timestamp() * 1000)


async def _series(user_id: UUID, now: datetime) -> list[dict[str, Any]]:
    """Minute series from Spacetime `minute_agg` (contracts/SPACETIME.md): last 3h, BP last 24h."""
    if not spacetime.configured():
        return []
    uid = str(UUID(str(user_id)))
    await spacetime.ensure_watching(uid)
    base = f"SELECT * FROM {spacetime.table('minute_agg')} WHERE user_id = '{uid}' AND minute_ms >= "
    recent = await spacetime.sql(base + str(_ms(now - timedelta(hours=3))))
    bp = await spacetime.sql(
        base + str(_ms(now - timedelta(hours=24)))
        + " AND (metric = 'bp_systolic' OR metric = 'bp_diastolic')")
    out = [r for r in recent if r["metric"] in SERIES_METRICS] + bp
    rows = [{"metric": r["metric"], "ts": datetime.fromtimestamp(int(r["minute_ms"]) / 1000, UTC),
             "v": r["sum"] if r["metric"] == "steps" else r["avg"]} for r in out]
    return sorted(rows, key=lambda r: (r["metric"], r["ts"]))


async def _load(user_id: UUID, now: datetime) -> tuple[RuleContext, str]:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select timezone, wake_time, bed_time from profiles where user_id = %s", (user_id,))
        profile = await cur.fetchone()
        cur = await conn.execute(
            "select model, summary from digital_twin where user_id = %s order by version desc limit 1",
            (user_id,))
        twin_row = await cur.fetchone()
        cur = await conn.execute(
            "select id, metric, target, period, direction, active from goals "
            "where user_id = %s and active", (user_id,))
        goal_rows = await cur.fetchall()
        tz = (profile or {}).get("timezone") or ((twin_row or {}).get("model") or {}).get(
            "profile", {}).get("timezone") or "UTC"
        try:
            local_day = now.astimezone(ZoneInfo(tz)).date()
        except Exception:
            local_day = now.date()
        cur = await conn.execute(
            "select day, metric, avg, min, max, sum, n from daily_summary "
            "where user_id = %s and day >= %s and metric = any(%s)",
            (user_id, local_day - timedelta(days=7), DAILY_METRICS))
        daily_rows = await cur.fetchall()
        cur = await conn.execute(
            "select event_id, title, starts_at, ends_at from calendar_events_cache "
            "where user_id = %s and is_important and starts_at < %s and ends_at > %s",
            (user_id, now + timedelta(hours=48), now))
        event_rows = await cur.fetchall()
        cur = await conn.execute(
            "select kind, created_at from alerts where user_id = %s and created_at > %s",
            (user_id, now - timedelta(hours=48)))
        alert_rows = await cur.fetchall()
    series_rows = await _series(user_id, now)
    return assemble(now, user_id, profile, twin_row, goal_rows, series_rows, daily_rows, event_rows,
                    alert_rows)


async def _persist(user_id: UUID, finding: Finding, title: str, body: str,
                   explained: dict[str, Any] | None = None) -> dict[str, Any]:
    """Write the alert, the optional proposal, and the twin status in one transaction."""
    async with db.neon() as conn:
        cur = await conn.execute(
            "insert into alerts (user_id, kind, severity, title, body, payload, channels) "
            "values (%s, %s, %s, %s, %s, %s, %s) returning id, created_at",
            (user_id, finding.kind, finding.severity, title, body,
             Jsonb({"facts": finding.facts, "explain": explained}), Jsonb([])))
        alert = await cur.fetchone()
        assert alert is not None
        proposal_id = None
        if finding.proposal:
            p = finding.proposal
            cur = await conn.execute(
                "insert into calendar_proposals (user_id, title, starts_at, ends_at, rationale, status, "
                "alert_id) values (%s, %s, %s, %s, %s, 'pending', %s) returning id",
                (user_id, p["title"], datetime.fromisoformat(p["starts_at"]),
                 datetime.fromisoformat(p["ends_at"]), p["rationale"], alert["id"]))
            row = await cur.fetchone()
            assert row is not None
            proposal_id = row["id"]
            await conn.execute("update alerts set proposal_id = %s where id = %s", (proposal_id, alert["id"]))
        status = TWIN_STATUS.get(finding.kind)
        if status:
            await conn.execute(
                "update digital_twin set model = jsonb_set(model, '{status}', to_jsonb(%s::text)) "
                "where user_id = %s and version = (select max(version) from digital_twin where user_id = %s)",
                (status, user_id, user_id))
    return {"id": alert["id"], "user_id": user_id, "kind": finding.kind, "severity": finding.severity,
            "title": title, "body": body, "proposal_id": proposal_id, "created_at": alert["created_at"]}


async def evaluate_user(user_id: UUID, now: datetime | None = None) -> int:
    """Run the rules for one user. Returns the number of alerts written."""
    started = time.monotonic()
    now = now or datetime.now(UTC)
    written = 0
    async with _locks[user_id]:
        ctx, summary = await _load(user_id, now)
        findings = evaluate(ctx)
        for f in findings:
            title = TITLES.get(f.kind, f.kind)
            body = await llm.phrase(f.kind, f.facts, summary)
            alert_row = await _persist(user_id, f, title, body, explain(f, ctx))
            written += 1
            await notify.dispatch(user_id, alert_row)
    log.info("live.evaluate user=%s findings=%d ms=%d", user_id, written, (time.monotonic() - started) * 1000)
    return written


async def on_samples_ingested(user_id: UUID, metrics: list[str]) -> None:
    """Called by ingest after commit. Never raises."""
    try:
        if metrics and not RELEVANT.intersection(metrics):
            return
        await evaluate_user(user_id)
    except Exception as exc:
        log.exception("live.on_samples_failed user=%s err=%s", user_id, type(exc).__name__)


async def sweep_all() -> None:
    """Run the rules for every user with samples in the last 10 minutes. Never raises."""
    started = time.monotonic()
    if not spacetime.configured():
        return
    try:
        since = int((datetime.now(UTC) - timedelta(minutes=SWEEP_WINDOW_MIN)).timestamp() * 1000)
        rows = await spacetime.sql(
            f"SELECT user_id FROM {spacetime.table('minute_agg')} WHERE minute_ms >= {since}")
        users = sorted({UUID(r["user_id"]) for r in rows})
    except Exception as exc:
        log.exception("live.sweep_failed err=%s", type(exc).__name__)
        return
    for uid in users:
        try:
            await evaluate_user(uid)
        except Exception as exc:
            log.exception("live.sweep_user_failed user=%s err=%s", uid, type(exc).__name__)
    log.info("live.sweep users=%d ms=%d", len(users), (time.monotonic() - started) * 1000)
