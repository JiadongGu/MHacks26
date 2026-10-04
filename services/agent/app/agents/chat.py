"""Conversational handler. `POST /agent/inbound`: fast paths, then Gemini function calling, then keywords."""

import asyncio
import logging
import math
import re
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from datetime import time as dtime
from typing import Any, Protocol, cast, get_args
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from google import genai
from google.genai import types
from psycopg.types.json import Jsonb

import app.llm as llm_budget
from app.channels import link
from app.contracts import (
    Channel,
    InboundMessage,
    InboundReply,
    Metric,
    ProposalCreate,
    ProposalDecision,
    ReplyAction,
)
from app.core import db, spacetime
from app.core.auth import require_internal
from app.core.config import settings
from app.focus import store as focus_store
from app.focus.guide import guide_for
from app.goals import service as goals_service
from app.goals import store as goals_store
from app.proposals import api as proposals_api
from app.twin import store as twin_store
from app.twin.tz import local_now

log = logging.getLogger("pulse.chat")

router = APIRouter(prefix="/agent", tags=["agent"], dependencies=[Depends(require_internal)])

MAX_REPLY = 480
MAX_INPUT = 1000
MAX_ROUNDS = 4
CALL_TIMEOUT_S = 10.0
TOTAL_TIMEOUT_S = 28.0
HISTORY_LIMIT = 20
MAX_BLOCK = timedelta(hours=12)
GENERIC_ERROR = "Sorry, something went wrong on my side. Please try again in a moment."
HELP_TEXT = ("I can tell you your steps, sleep, heart rate, goals, or upcoming events. "
             "Reply STATUS for a summary.")

# The whole message must be the answer: "ok thanks" or "no worries" are not decisions (eval found both).
APPROVE_RE = re.compile(
    r"^(yes|y|yep|yeah|yes please|approve|approved|do it|sure|ok|okay|go ahead)[\s.!👍]*$", re.IGNORECASE)
REJECT_RE = re.compile(r"^(no|n|nope|nah|no thanks|reject|skip|skip it|don'?t)[\s.!]*$", re.IGNORECASE)
EMERGENCY_RE = re.compile(
    r"chest (pain|pressure|tight)|can'?t breathe|cannot breathe|trouble breathing|short(ness)? of breath|"
    r"(face|arm|left arm).{0,20}(numb|droop|weak)|slurr|stroke|faint(ed|ing)?|passed out|"
    r"suicid|kill myself|end my life|overdos|severe bleeding|seizure", re.IGNORECASE)
EMERGENCY_TEXT = (
    "This could be an emergency. Call 911 now (or your local emergency number), or have someone take you "
    "to the nearest emergency room. In the US you can also call or text 988 for a crisis line. "
    "I'm a wellness assistant and can't help with emergencies.")
SET_GOAL_RE = re.compile(r"\b(step|steps|sleep)\b.*\bgoal\b.*?(\d[\d,\.]*)\s*(h|hours?)?", re.IGNORECASE)
SYMPTOM_RE = re.compile(
    r"\b(i have|i'?ve got|i feel|feeling|my .{0,15}(hurts|aches))\b.*"
    r"(sore|pain|ache|fever|cough|nause|dizz|headache|tired|sick|chills|congest)", re.IGNORECASE)
STATUS_RE = re.compile(r"^status\W*$", re.IGNORECASE)
FAST_MAX_WORDS = 6

METRICS: tuple[str, ...] = get_args(Metric)
MINUTE_METRICS = {"heart_rate", "steps", "spo2", "respiratory_rate", "skin_temp_delta", "bp_systolic",
                  "bp_diastolic", "stress_score"}
LOWER_IS_BETTER = {"resting_heart_rate", "stress_score", "sleep_awake_min", "bp_systolic", "bp_diastolic"}
LABELS: dict[str, tuple[str, str]] = {
    "heart_rate": ("heart rate", "bpm"), "resting_heart_rate": ("resting heart rate", "bpm"),
    "hrv_sdnn": ("HRV", "ms"), "steps": ("steps", ""), "active_minutes": ("active minutes", "min"),
    "active_energy_kcal": ("active energy", "kcal"), "spo2": ("blood oxygen", "%"),
    "respiratory_rate": ("breathing rate", "/min"), "skin_temp_delta": ("skin temperature change", "C"),
    "bp_systolic": ("systolic blood pressure", "mmHg"),
    "bp_diastolic": ("diastolic blood pressure", "mmHg"),
    "weight_kg": ("weight", "kg"), "sleep_total_min": ("sleep", "min"),
    "sleep_deep_min": ("deep sleep", "min"),
    "sleep_rem_min": ("REM sleep", "min"), "sleep_core_min": ("core sleep", "min"),
    "sleep_awake_min": ("awake time", "min"), "stress_score": ("stress score", ""),
    "workout": ("workouts", ""),
}


# ------------------------------------------------------------------ pure helpers


def classify(text: str) -> str | None:
    """Fast-path intent: approve, reject, status, or None. Long or question-like text goes to the LLM."""
    t = text.strip()
    if STATUS_RE.match(t):
        return "status"
    if "?" in t or len(t.split()) > FAST_MAX_WORDS:
        return None
    if APPROVE_RE.match(t):
        return "approve"
    if REJECT_RE.match(t):
        return "reject"
    return None


def clip(text: str, limit: int = MAX_REPLY) -> str:
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    space = cut.rfind(" ")
    if space > limit // 2:
        cut = cut[:space]
    return cut.rstrip(" ,;:") + "…"


def clip_lines(text: str, limit: int = MAX_REPLY) -> str:
    """Like clip, but keeps line breaks and single blank lines between sections. Cuts at a line boundary."""
    lines = [" ".join(line.split()) for line in text.splitlines()]
    out: list[str] = []
    for line in lines:
        if line == "" and (not out or out[-1] == ""):
            continue
        out.append(line)
    while out and out[-1] == "":
        out.pop()
    joined = "\n".join(out)
    if len(joined) <= limit:
        return joined
    kept: list[str] = []
    for line in out:
        if len("\n".join([*kept, line])) > limit - 1:
            break
        kept.append(line)
    while kept and kept[-1] == "":
        kept.pop()
    return ("\n".join(kept) + "…") if kept else clip(text, limit)


def fmt_dt(dt: datetime, tz: str) -> str:
    return local_now(tz, dt).strftime("%a %b %-d, %-I:%M %p")


def fmt_range(start: datetime, end: datetime, tz: str) -> str:
    s, e = local_now(tz, start), local_now(tz, end)
    end_txt = e.strftime("%-I:%M %p") if s.date() == e.date() else e.strftime("%a %-I:%M %p")
    return f"{s.strftime('%a %b %-d, %-I:%M %p')} to {end_txt}"


def num(value: float | None) -> str:
    if value is None:
        return "?"
    return f"{value:,.0f}" if abs(value) >= 100 or float(value).is_integer() else f"{value:.1f}"


def _whole(v: float | None) -> float | None:
    """Big numbers go to the model as whole numbers, so 6770.7 can never be read as 67,707."""
    return round(v) if isinstance(v, int | float) and abs(v) >= 100 else v


def minutes_text(minutes: float | None) -> str:
    return "?" if minutes is None else f"{minutes / 60:.1f} h"


def metric_label(metric: str) -> str:
    return LABELS.get(metric, (metric, ""))[0]


def default_direction(metric: str) -> str:
    return "at_most" if metric in LOWER_IS_BETTER else "at_least"


def aggregate_minutes(rows: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Fold Spacetime `minute_agg` rows of one metric. avg is sum of sums over sum of counts."""
    if not rows:
        return None
    n = sum(int(r["n"]) for r in rows)
    total = sum(float(r["sum"]) for r in rows)
    last = max(rows, key=lambda r: int(r["minute_ms"]))
    return {"avg": round(total / n, 1) if n else None, "min": min(float(r["min"]) for r in rows),
            "max": max(float(r["max"]) for r in rows), "total": round(total, 1), "n": n,
            "latest": round(float(last["avg"]), 1)}


def aggregate_days(rows: list[dict[str, Any]], metric: str) -> dict[str, Any] | None:
    rows = sorted((r for r in rows if r["metric"] == metric), key=lambda r: r["day"])
    if not rows:
        return None
    days = [{"day": str(r["day"]), "avg": r["avg"], "sum": r["sum"]} for r in rows]
    avgs = [r["avg"] for r in rows if r["avg"] is not None]
    sums = [r["sum"] for r in rows if r["sum"] is not None]
    return {"days": days, "avg": round(sum(avgs) / len(avgs), 1) if avgs else None,
            "min": min((r["min"] for r in rows if r["min"] is not None), default=None),
            "max": max((r["max"] for r in rows if r["max"] is not None), default=None),
            "total": round(sum(sums), 1) if sums else None, "latest": rows[-1]["avg"],
            "latest_sum": rows[-1]["sum"]}


def sleep_minutes(rows: list[dict[str, Any]], today: date) -> float | None:
    """Last night's sleep, stored on the wake day. None until today's night has synced."""
    r = next((r for r in rows if r["metric"] == "sleep_total_min" and r["day"] == today), None)
    if r is None:
        return None
    v = r["sum"] if r["sum"] is not None else r["avg"]
    return None if v is None else float(v)


def build_status(twin: dict[str, Any] | None, rows: list[dict[str, Any]], goals: list[dict[str, Any]],
                 today: date) -> dict[str, Any]:
    """Pure. Twin status, today's steps against the step goal, and last night's sleep."""
    model = (twin or {}).get("model") or {}
    steps_row = next((r for r in rows if r["metric"] == "steps" and r["day"] == today), None)
    steps = None if steps_row is None or steps_row["sum"] is None else round(steps_row["sum"])
    goal = next((g for g in goals if g["metric"] == "steps" and g["period"] == "day"), None)
    target = float(goal["target"]) if goal else (model.get("baselines") or {}).get("steps")
    target = None if target is None else round(target)
    rhr = next((r for r in rows if r["metric"] == "resting_heart_rate" and r["day"] == today), None)
    return {"status": model.get("status") or "unknown", "steps_today": steps,
            "steps_goal": target, "steps_goal_is_user_goal": goal is not None,
            "steps_pct": round(steps / target * 100) if steps is not None and target else None,
            "sleep_min": sleep_minutes(rows, today),
            "resting_hr": None if rhr is None or rhr["avg"] is None else round(rhr["avg"]),
            "insights": list(model.get("insights") or [])[:2]}


def fmt_status(s: dict[str, Any]) -> str:
    parts = [f"Status: {str(s.get('status', 'unknown')).replace('_', ' ')}."]
    if s.get("steps_today") is not None:
        text = f"Steps today: {num(s['steps_today'])}"
        if s.get("steps_goal"):
            text += f" of {num(s['steps_goal'])} ({s.get('steps_pct')}%)"
        parts.append(text + ".")
    elif s.get("steps_goal"):
        parts.append(f"No steps logged today yet (goal {num(s['steps_goal'])}).")
    if s.get("sleep_min") is not None:
        parts.append(f"Sleep last night: {minutes_text(s['sleep_min'])}.")
    if s.get("resting_hr") is not None:
        parts.append(f"Resting heart rate: {s['resting_hr']} bpm.")
    if s.get("insights"):
        parts.append(str(s["insights"][0]))
    return " ".join(parts)


def fmt_steps(s: dict[str, Any]) -> str:
    if s.get("steps_today") is None:
        return "I have no steps logged for you today yet."
    text = f"Steps today: {num(s['steps_today'])}"
    if s.get("steps_goal"):
        text += f" of {num(s['steps_goal'])} ({s.get('steps_pct')}%)"
    return text + "."


def fmt_vitals(r: dict[str, Any]) -> str:
    metric = r.get("metric", "")
    label, unit = LABELS.get(metric, (metric, ""))
    if r.get("error"):
        return f"I could not read your {label} data."
    if not r.get("found"):
        return f"I have no {label} data for the last {r.get('window_hours')} hours."
    hrs = r["window_hours"]
    span = f"last {hrs} h" if hrs <= 48 else f"last {hrs // 24} days"
    if metric == "steps":
        return f"Steps in the {span}: {num(r.get('total'))}."
    if metric.startswith("sleep_"):
        v = r.get("latest_sum") if r.get("latest_sum") is not None else r.get("total")
        return f"{label.capitalize()} ({span}): {minutes_text(v)}."
    u = f" {unit}" if unit else ""
    return (f"{label.capitalize()} in the {span}: average {num(r.get('avg'))}{u}, range "
            f"{num(r.get('min'))} to {num(r.get('max'))}{u}.")


def fmt_goals(goals: list[dict[str, Any]]) -> str:
    if not goals:
        return "You have no active goals yet. Say, for example, set a goal of 8000 steps a day."
    out = []
    for g in goals[:4]:
        sign = "at least" if g["direction"] == "at_least" else "at most"
        out.append(f"{metric_label(g['metric'])} {num(g['current'])} of {sign} {num(g['target'])} per "
                   f"{g['period']} ({round(g['pct'])}%, {'on track' if g['on_track'] else 'behind'})")
    return "Goals: " + "; ".join(out) + "."


def fmt_events(res: dict[str, Any]) -> str:
    events = res.get("events") or []
    if not events:
        return f"No events on your calendar in the next {res.get('hours')} hours."
    items = [f"{e['title']} ({e['when']})" for e in events[:4]]
    more = f" and {len(events) - 4} more" if len(events) > 4 else ""
    return f"Next {res.get('hours')} h: " + "; ".join(items) + more + "."


def decision_text(res: dict[str, Any]) -> str:
    """Reply for approve and reject results. Times are local."""
    if not res.get("ok"):
        return str(res.get("message") or "I could not do that.")
    title, when = res.get("title", "the block"), res.get("when", "")
    status = res.get("status")
    if status == "rejected":
        return f'Skipped "{title}". I will not add it.'
    if status == "applied":
        return f'Done. "{title}" is on your calendar: {when}.'
    if status == "failed":
        return ("Approved, but I couldn't add it to your calendar — connect Google Calendar in settings")
    return f'Approved "{title}" ({when}). I will add it to your calendar shortly.'


def detect_intent(text: str) -> str | None:
    t = text.lower()
    rules = [("block", r"\bblock\b.*\b(sleep|bed|night|tonight)\b|\bprotect\b.*\bsleep\b|sleep block"),
             ("calendar", r"calendar|event|schedule|meeting|appointment|agenda"),
             ("goal", r"\bgoals?\b|target"),
             ("sleep", r"sleep|slept|bed ?time|rest\b"),
             ("heart", r"heart|pulse|bpm|\bhr\b"),
             ("steps", r"\bsteps?\b|walk|activity"),
             ("status", r"status|how am i|how are i|summary|doing")]
    for name, pattern in rules:
        if re.search(pattern, t):
            return name
    return None


def build_contents(history: list[dict[str, Any]], text: str) -> list[tuple[str, str]]:
    """(role, text) pairs for the model. Merge same-role neighbours and drop leading model turns."""
    pairs: list[tuple[str, str]] = []
    for m in [*history, {"direction": "in", "text": text}]:
        role = "user" if m["direction"] == "in" else "model"
        body = str(m["text"])
        if pairs and pairs[-1][0] == role:
            pairs[-1] = (role, pairs[-1][1] + "\n" + body)
        else:
            pairs.append((role, body))
    while pairs and pairs[0][0] == "model":
        pairs.pop(0)
    return pairs


# ------------------------------------------------------------------ data access (patched in tests)


async def resolve_user(channel: str, external_id: str) -> UUID | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select user_id from channel_links where channel = %s and external_id = %s "
            "and status = 'linked' order by linked_at desc nulls last limit 1", (channel, external_id))
        row = await cur.fetchone()
    return row["user_id"] if row else None


async def load_history(user_id: UUID) -> list[dict[str, Any]]:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select direction, text from messages where user_id = %s order by created_at desc limit %s",
            (user_id, HISTORY_LIMIT))
        rows = await cur.fetchall()
    return list(reversed(rows))


async def save_message(user_id: UUID, channel: str, direction: str, text: str,
                       tool_calls: list[dict[str, Any]] | None, external_id: str | None) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "insert into messages (user_id, channel, direction, text, tool_calls, external_id) "
            "values (%s, %s, %s, %s, %s, %s)",
            (user_id, channel, direction, text, Jsonb(tool_calls) if tool_calls else None, external_id))


async def tz_of(user_id: UUID) -> str:
    row = await twin_store.profile_row(user_id)
    return (row or {}).get("timezone") or "America/Detroit"


async def pending_proposal(user_id: UUID) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select id, title, starts_at, ends_at from calendar_proposals "
            "where user_id = %s and status = 'pending' order by created_at desc limit 1", (user_id,))
        return await cur.fetchone()


async def upcoming_events(user_id: UUID, hours: int) -> list[dict[str, Any]]:
    now = datetime.now(UTC)
    async with db.neon() as conn:
        cur = await conn.execute(
            "select title, starts_at, ends_at, is_important from calendar_events_cache "
            "where user_id = %s and starts_at < %s and ends_at > %s order by starts_at limit 20",
            (user_id, now + timedelta(hours=hours), now))
        return await cur.fetchall()


async def minute_rows(user_id: UUID, metric: str, hours: int) -> list[dict[str, Any]]:
    """Spacetime `minute_agg` rows of one metric. `metric` is validated against the enum by the caller."""
    if metric not in METRICS or not spacetime.configured():
        return []
    since = int((datetime.now(UTC) - timedelta(hours=hours)).timestamp() * 1000)
    return await spacetime.sql(
        f"SELECT * FROM minute_agg WHERE user_id = '{UUID(str(user_id))}' AND minute_ms >= {since} "
        f"AND metric = '{metric}'")


async def insert_symptom(user_id: UUID, text: str, urgent: bool = False) -> None:
    severity, title = ("urgent", "Emergency words in a message") if urgent else ("info", "Symptom logged")
    async with db.neon() as conn:
        await conn.execute(
            "insert into alerts (user_id, kind, severity, title, body, payload, channels) "
            "values (%s, 'symptom_log', %s, %s, %s, %s, %s)",
            (user_id, severity, title, text, Jsonb({"source": "chat", "emergency": urgent}), Jsonb([])))


async def last_alert(user_id: UUID) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select kind, severity, title, body, payload, created_at from alerts "
            "where user_id = %s and kind <> 'symptom_log' order by created_at desc limit 1", (user_id,))
        return await cur.fetchone()


# ------------------------------------------------------------------ tools


class Toolbox:
    """Every tool is scoped to one user. No tool accepts a user id from the model."""

    def __init__(self, user_id: UUID, channel: str, tz: str):
        self.user_id, self.channel, self.tz = user_id, channel, tz

    def _today(self) -> date:
        return local_now(self.tz).date()

    async def call(self, name: str, args: dict[str, Any] | None) -> dict[str, Any]:
        fn = getattr(self, f"t_{name}", None) if name in TOOL_NAMES else None
        if fn is None:
            return {"error": f"unknown tool {name}"}
        try:
            return await fn(**(args or {}))
        except TypeError:
            return {"error": "bad arguments"}
        except Exception as exc:
            log.warning("chat.tool_failed tool=%s err=%s", name, type(exc).__name__)
            return {"error": "tool failed"}

    async def t_get_status(self) -> dict[str, Any]:
        today = self._today()
        twin = await twin_store.latest_twin(self.user_id)
        rows = await twin_store.daily_rows(self.user_id, today - timedelta(days=1), today,
                                           ["steps", "sleep_total_min", "resting_heart_rate"])
        goals = await goals_store.list_goals(self.user_id)
        out = build_status(twin, rows, goals, today)
        try:
            flags = set(((twin or {}).get("model") or {}).get("risk_flags") or [])
            out.update(guide_for(await focus_store.list_picks(self.user_id), flags))
        except Exception as exc:  # the guide is extra context; status must still answer
            log.warning("chat.focus_guide_failed err=%s", type(exc).__name__)
        return out

    async def t_get_vitals_summary(self, metric: str, hours: float = 24) -> dict[str, Any]:
        if metric not in METRICS:
            return {"error": f"unknown metric {metric}", "valid_metrics": list(METRICS)}
        hrs = max(1, min(int(hours), 24 * 30))
        out: dict[str, Any] = {"metric": metric, "window_hours": hrs, "found": False}
        agg = None
        if hrs <= 24 and metric in MINUTE_METRICS:
            try:
                agg = aggregate_minutes(await minute_rows(self.user_id, metric, hrs))
                out["source"] = "live"
            except Exception as exc:
                log.warning("chat.minute_read_failed err=%s", type(exc).__name__)
        if agg is None:
            today = self._today()
            days = max(1, math.ceil(hrs / 24))
            rows = await twin_store.daily_rows(self.user_id, today - timedelta(days=days - 1), today,
                                               [metric])
            agg = aggregate_days(rows, metric)
            out["source"] = "daily"
        if agg is not None:
            out.update(agg)
            out["found"] = True
        return out

    async def t_get_goal_progress(self) -> dict[str, Any]:
        goals = await goals_store.list_goals(self.user_id)
        progress = {p.goal_id: p for p in await goals_service.compute_for_user(self.user_id)}
        items = []
        for g in goals:
            p = progress.get(g["id"])
            if p is None:
                continue
            items.append({"metric": g["metric"], "target": _whole(g["target"]), "period": g["period"],
                          "direction": g["direction"], "current": _whole(p.current), "pct": p.pct,
                          "on_track": p.on_track})
        return {"goals": items}

    async def t_set_goal(self, metric: str, target: float, period: str = "day") -> dict[str, Any]:
        if metric not in METRICS:
            return {"error": f"unknown metric {metric}", "valid_metrics": list(METRICS)}
        if period not in ("day", "week"):
            return {"error": "period must be day or week"}
        target = float(target)
        if not 0 < target <= 1_000_000:
            return {"error": "target must be between 0 and 1000000"}
        direction = default_direction(metric)
        existing = next((g for g in await goals_store.list_goals(self.user_id)
                         if g["metric"] == metric and g["period"] == period), None)
        if existing:
            await goals_store.update_goal(existing["id"], self.user_id, target, None, direction, True)
        else:
            await goals_store.create_goal(self.user_id, metric, target, period, direction, True)
        return {"ok": True, "metric": metric, "target": target, "period": period, "direction": direction}

    async def _decide(self, decision: str) -> dict[str, Any]:
        p = await pending_proposal(self.user_id)
        if p is None:
            return {"ok": False, "message": "Nothing is waiting for your approval right now."}
        when = fmt_range(p["starts_at"], p["ends_at"], self.tz)
        status = "failed" if decision == "approved" else "rejected"
        try:
            res = await proposals_api.decide(
                p["id"], ProposalDecision(decision=decision, via=cast(Channel, self.channel)),
                user_id=self.user_id)
            status = res.status
        except HTTPException as exc:
            return {"ok": False, "message": f"I could not update that proposal ({exc.detail})."}
        except Exception as exc:
            # The decision row is written before the calendar call, so the proposal stays approved.
            log.warning("chat.decide_failed err=%s", type(exc).__name__)
        return {"ok": True, "decision": decision, "status": status, "title": p["title"], "when": when}

    async def t_approve_proposal(self) -> dict[str, Any]:
        return await self._decide("approved")

    async def t_reject_proposal(self) -> dict[str, Any]:
        return await self._decide("rejected")

    async def _supersede_pending(self, keep: UUID) -> None:
        """A new proposal replaces the user's other pending ones (\"make that 6:30 instead\")."""
        async with db.neon() as conn:
            await conn.execute(
                "update calendar_proposals set status = 'expired', decided_at = now() "
                "where user_id = %s and status = 'pending' and id <> %s", (self.user_id, keep))

    async def t_propose_calendar_block(self, title: str, start_iso: str, end_iso: str,
                                       rationale: str = "") -> dict[str, Any]:
        try:
            start, end = datetime.fromisoformat(start_iso), datetime.fromisoformat(end_iso)
        except ValueError:
            return {"error": "start_iso and end_iso must be ISO 8601 date-times"}
        zone = local_now(self.tz).tzinfo
        start = start if start.tzinfo else start.replace(tzinfo=zone)
        end = end if end.tzinfo else end.replace(tzinfo=zone)
        title = " ".join(str(title).split())[:80]
        if not title:
            return {"error": "title is required"}
        if end <= start or end - start > MAX_BLOCK:
            return {"error": "end must be after start and the block at most 12 hours"}
        if end < datetime.now(UTC):
            return {"error": "the block is in the past"}
        created = await proposals_api.create(ProposalCreate(
            user_id=self.user_id, title=title, starts_at=start, ends_at=end,
            rationale=(rationale or "Suggested in chat")[:300]))
        try:
            await self._supersede_pending(created.id)
        except Exception as exc:  # replacing older proposals is best effort; the new one stands
            log.warning("chat.supersede_failed err=%s", type(exc).__name__)
        when = fmt_range(created.starts_at, created.ends_at, self.tz)
        return {"ok": True, "title": created.title, "when": when,
                "next": "Ask the user to reply YES to add it to the calendar or NO to skip."}

    async def t_get_upcoming_events(self, hours: float = 24) -> dict[str, Any]:
        hrs = max(1, min(int(hours), 24 * 7))
        rows = await upcoming_events(self.user_id, hrs)
        return {"hours": hrs, "events": [
            {"title": r["title"], "when": fmt_dt(r["starts_at"], self.tz),
             "important": bool(r["is_important"])}
            for r in rows]}

    async def t_log_symptom(self, text: str) -> dict[str, Any]:
        body = " ".join(str(text).split())[:500]
        if not body:
            return {"error": "text is required"}
        await insert_symptom(self.user_id, body)
        return {"ok": True}

    async def t_explain_last_alert(self) -> dict[str, Any]:
        a = await last_alert(self.user_id)
        if a is None:
            return {"found": False}
        return {"found": True, "kind": a["kind"], "severity": a["severity"], "title": a["title"],
                "body": a["body"], "facts": (a["payload"] or {}).get("facts"),
                "when": fmt_dt(a["created_at"], self.tz)}


TOOL_NAMES = {"get_status", "get_vitals_summary", "get_goal_progress", "set_goal", "approve_proposal",
              "reject_proposal", "propose_calendar_block", "get_upcoming_events", "log_symptom",
              "explain_last_alert"}

_STR = {"type": "string"}
TOOL_SPECS: list[dict[str, Any]] = [
    {"name": "get_status",
     "description": "Digital twin status, today's steps against goal, last night's sleep."},
    {"name": "get_vitals_summary",
     "description": "Summary of one metric over the last N hours (live minutes up to 24 h, daily beyond).",
     "schema": {"type": "object", "properties": {"metric": {"type": "string", "enum": list(METRICS)},
                                                 "hours": {"type": "integer", "minimum": 1, "maximum": 720}},
                "required": ["metric"]}},
    {"name": "get_goal_progress", "description": "Progress of every active goal."},
    {"name": "set_goal", "description": "Create or update a goal.",
     "schema": {"type": "object", "properties": {"metric": {"type": "string", "enum": list(METRICS)},
                                                 "target": {"type": "number"},
                                                 "period": {"type": "string", "enum": ["day", "week"]}},
                "required": ["metric", "target", "period"]}},
    {"name": "approve_proposal",
     "description": "Approve the newest pending calendar proposal. Only when the user clearly agrees."},
    {"name": "reject_proposal",
     "description": "Reject the newest pending calendar proposal. Only when the user clearly declines."},
    {"name": "propose_calendar_block",
     "description": "Propose a calendar block. The user must reply YES to add it.",
     "schema": {"type": "object", "properties": {"title": _STR, "start_iso": _STR, "end_iso": _STR,
                                                 "rationale": _STR},
                "required": ["title", "start_iso", "end_iso", "rationale"]}},
    {"name": "get_upcoming_events", "description": "Calendar events in the next N hours.",
     "schema": {"type": "object",
                "properties": {"hours": {"type": "integer", "minimum": 1, "maximum": 168}}}},
    {"name": "log_symptom", "description": "Record a symptom the user reports.",
     "schema": {"type": "object", "properties": {"text": _STR}, "required": ["text"]}},
    {"name": "explain_last_alert", "description": "Facts behind the most recent alert."},
]


# ------------------------------------------------------------------ LLM loop


@dataclass
class ToolCall:
    name: str
    args: dict[str, Any]


@dataclass
class Turn:
    text: str | None = None
    calls: list[ToolCall] = field(default_factory=list)


class ChatModel(Protocol):
    async def turn(self, results: list[tuple[str, dict[str, Any]]] | None, allow_tools: bool) -> Turn: ...


def system_prompt(tz: str) -> str:
    now = local_now(tz)
    return (
        "You are Pulse, a warm personal health companion that texts the user. Give wellness guidance, "
        "never a diagnosis. Use the tools to get facts. Never invent numbers. Never ask for a user id. "
        f"Reply in at most {MAX_REPLY} characters, plain text, no markdown. If something sounds dangerous, "
        "advise medical care. Approve or reject a proposal only when the user explicitly says yes/approve "
        "or no/reject to it; for unclear replies ('not sure', 'ok thanks', 'no worries') ask what they "
        "want and do not call approve or reject. To change a pending proposal (e.g. 'make that 6:30'), "
        "call propose_calendar_block with the same title and the new time; it replaces the old one. "
        "You can only see this user's own data: if asked about another person or a user id, say so "
        "plainly. After "
        "propose_calendar_block, tell the user to reply YES to add it. "
        f"The user's local time is {now.isoformat(timespec='minutes')} ({tz}). Use that offset for times.")


class GeminiChat:
    """One conversation against Gemini with manual function calling (automatic calling disabled)."""

    def __init__(self, pairs: list[tuple[str, str]], tz: str):
        self.contents: list[types.Content] = [
            types.Content(role=role, parts=[types.Part(text=body)]) for role, body in pairs]
        decls = [types.FunctionDeclaration(
            name=s["name"], description=s["description"],
            **({"parameters_json_schema": s["schema"]} if "schema" in s else {})) for s in TOOL_SPECS]
        self._tools = [types.Tool(function_declarations=decls)]
        self._system = system_prompt(tz)
        self._client = genai.Client(api_key=settings().gemini_api_key)

    def _config(self, allow_tools: bool) -> types.GenerateContentConfig:
        return types.GenerateContentConfig(
            system_instruction=self._system, temperature=0.4, max_output_tokens=1024,
            tools=self._tools if allow_tools else None,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            http_options=types.HttpOptions(timeout=int(CALL_TIMEOUT_S * 1000)))

    async def turn(self, results: list[tuple[str, dict[str, Any]]] | None, allow_tools: bool) -> Turn:
        if results:
            self.contents.append(types.Content(role="user", parts=[
                types.Part.from_function_response(name=n, response={"result": r}) for n, r in results]))
        llm_budget._count_call()
        resp = await asyncio.wait_for(
            llm_budget.generate_with_fallback(
                self._client, settings().gemini_model_fast, contents=self.contents,
                config=self._config(allow_tools)),
            timeout=(CALL_TIMEOUT_S + 2) * 2)
        if resp.candidates and resp.candidates[0].content is not None:
            self.contents.append(resp.candidates[0].content)
        calls = [ToolCall(fc.name or "", dict(fc.args or {})) for fc in (resp.function_calls or [])]
        return Turn(text=None if calls else (resp.text or ""), calls=calls)


async def run_loop(model: ChatModel, tools: Toolbox) -> tuple[str, list[dict[str, Any]]]:
    """At most MAX_ROUNDS rounds of tool calls, then one forced text turn. Raises on an empty answer."""
    results: list[tuple[str, dict[str, Any]]] | None = None
    log_calls: list[dict[str, Any]] = []
    for rnd in range(MAX_ROUNDS + 1):
        turn = await model.turn(results, allow_tools=rnd < MAX_ROUNDS)
        if not turn.calls:
            if turn.text and turn.text.strip():
                return turn.text.strip(), log_calls
            raise ValueError("empty model answer")
        results = []
        for c in turn.calls[:4]:
            out = await tools.call(c.name, c.args)
            log_calls.append({"name": c.name, "args": c.args})
            results.append((c.name, out))
    raise RuntimeError("tool rounds exceeded")


def llm_enabled() -> bool:
    s = settings()
    return bool(s.gemini_api_key) and not s.llm_fake and llm_budget.calls_today() < llm_budget.DAILY_LIMIT


async def tonight_sleep_window(tools: Toolbox) -> tuple[datetime, datetime]:
    """Tonight from the user's bed time to tomorrow's wake time (defaults 22:00 to 06:30)."""
    bed, wake = dtime(22, 0), dtime(6, 30)
    try:
        async with db.neon() as conn:
            cur = await conn.execute(
                "select bed_time, wake_time from profiles where user_id = %s", (tools.user_id,))
            row = await cur.fetchone()
        if row:
            bed, wake = row["bed_time"] or bed, row["wake_time"] or wake
    except Exception as exc:
        log.warning("chat.profile_read_failed err=%s", type(exc).__name__)
    now = local_now(tools.tz)
    start = datetime.combine(now.date(), bed, tzinfo=now.tzinfo)
    if start <= now:
        start = now.replace(second=0, microsecond=0) + timedelta(minutes=15 - now.minute % 15)
    end = datetime.combine(start.date() + timedelta(days=1 if wake <= bed else 0), wake, tzinfo=now.tzinfo)
    return start, end


async def fallback_reply(tools: Toolbox, text: str) -> tuple[str, list[dict[str, Any]]]:
    """Deterministic answer by keyword. Uses the same tools as the LLM."""
    goal = SET_GOAL_RE.search(text)
    if goal and re.search(r"\b(set|change|make|update)\b", text, re.IGNORECASE):
        what, num = goal.group(1).lower(), float(goal.group(2).replace(",", ""))
        metric, target = ("sleep_total_min", num * 60 if goal.group(3) or num < 24 else num) \
            if what == "sleep" else ("steps", num)
        r = await tools.call("set_goal", {"metric": metric, "target": target, "period": "day"})
        if r.get("error"):
            return "I couldn't change that goal. Try again in a minute.", [{"name": "set_goal"}]
        shown = f"{target / 60:g} h of sleep" if metric.startswith("sleep") else f"{num:,.0f} steps"
        return f"Done. Your daily goal is now {shown}.", [{"name": "set_goal", "args": {"metric": metric}}]
    if SYMPTOM_RE.search(text):
        await tools.call("log_symptom", {"text": text})
        return ("Sorry you're not feeling well. I logged it and will keep an eye on your vitals. Rest, "
                "drink water, and contact a clinician if it gets worse or you're worried.",
                [{"name": "log_symptom"}])
    intent = detect_intent(text)
    if intent == "block":
        start, end = await tonight_sleep_window(tools)
        args = {"title": "Sleep block (Pulse)", "start_iso": start.isoformat(), "end_iso": end.isoformat(),
                "rationale": "You asked to protect tonight's sleep."}
        r = await tools.call("propose_calendar_block", args)
        if not r.get("ok"):
            return ("I couldn't set that up right now. Try again in a minute.",
                    [{"name": "propose_calendar_block"}])
        return (f'I proposed "{r["title"]}" for {r["when"]}. '
                "Reply YES to add it to your calendar or NO to skip.",
                [{"name": "propose_calendar_block", "args": args}])
    if intent == "steps":
        s = await tools.call("get_status", None)
        return fmt_steps(s), [{"name": "get_status", "args": {}}]
    if intent == "status":
        return fmt_status(await tools.call("get_status", None)), [{"name": "get_status", "args": {}}]
    if intent == "sleep":
        r = await tools.call("get_vitals_summary", {"metric": "sleep_total_min", "hours": 24})
        return fmt_vitals(r), [{"name": "get_vitals_summary", "args": {"metric": "sleep_total_min"}}]
    if intent == "heart":
        r = await tools.call("get_vitals_summary", {"metric": "heart_rate", "hours": 1})
        if not r.get("found"):
            r = await tools.call("get_vitals_summary", {"metric": "resting_heart_rate", "hours": 24})
        return fmt_vitals(r), [{"name": "get_vitals_summary", "args": {"metric": "heart_rate"}}]
    if intent == "goal":
        r = await tools.call("get_goal_progress", None)
        return fmt_goals(r.get("goals") or []), [{"name": "get_goal_progress", "args": {}}]
    if intent == "calendar":
        r = await tools.call("get_upcoming_events", {"hours": 24})
        return fmt_events(r), [{"name": "get_upcoming_events", "args": {"hours": 24}}]
    return HELP_TEXT, []


async def answer(tools: Toolbox, history: list[dict[str, Any]], text: str,
                 model_factory: Callable[[list[tuple[str, str]], str], ChatModel] | None = None
                 ) -> tuple[str, list[dict[str, Any]]]:
    """LLM answer with fallback. Never raises."""
    if model_factory is None and not llm_enabled():
        return await fallback_reply(tools, text)
    started = time.monotonic()
    try:
        factory = model_factory or GeminiChat
        model = factory(build_contents(history, text), tools.tz)
        reply, calls = await asyncio.wait_for(run_loop(model, tools), timeout=TOTAL_TIMEOUT_S)
        log.info("chat.llm ok=1 tools=%d ms=%d", len(calls), (time.monotonic() - started) * 1000)
        return reply, calls
    except Exception as exc:
        log.warning("chat.llm ok=0 err=%s ms=%d", type(exc).__name__, (time.monotonic() - started) * 1000)
        return await fallback_reply(tools, text)


# ------------------------------------------------------------------ orchestration


async def respond(user_id: UUID, channel: str, text: str, history: list[dict[str, Any]]
                  ) -> tuple[str, list[dict[str, Any]], list[ReplyAction]]:
    tools = Toolbox(user_id, channel, await tz_of(user_id))
    if EMERGENCY_RE.search(text):
        await insert_symptom(user_id, " ".join(text.split())[:500], urgent=True)
        return EMERGENCY_TEXT, [{"name": "emergency_guard"}], []
    intent = classify(text)
    if intent in ("approve", "reject"):
        res = await tools.call("approve_proposal" if intent == "approve" else "reject_proposal", None)
        actions = ([ReplyAction(type="proposal_decided", payload={"status": res["status"]})]
                   if res.get("ok") else [])
        return decision_text(res), [{"name": f"{intent}_proposal", "args": {}}], actions
    if intent == "status":
        return fmt_status(await tools.call("get_status", None)), [{"name": "get_status", "args": {}}], []
    reply, calls = await answer(tools, history, text)
    return reply, calls, []


async def handle(msg: InboundMessage) -> InboundReply:
    """Never raises. Never returns another user's data: every lookup keys on the resolved user id."""
    started = time.monotonic()
    text = msg.text.strip()[:MAX_INPUT]
    external_id = msg.external_id.strip()
    try:
        user_id = await resolve_user(msg.channel, external_id)
        if user_id is None:
            return InboundReply(reply=await link.handle_unknown(msg.channel, external_id, text))
        try:
            history = await load_history(user_id)
        except Exception as exc:
            log.warning("chat.history_failed err=%s", type(exc).__name__)
            history = []
        await _safe_save(user_id, msg.channel, "in", text, None, external_id)
        if not text:
            reply, calls, actions = HELP_TEXT, [], []
        else:
            reply, calls, actions = await respond(user_id, msg.channel, text, history)
        reply = clip(reply) or GENERIC_ERROR
        await _safe_save(user_id, msg.channel, "out", reply, calls, external_id)
        log.info("chat.inbound user=%s channel=%s tools=%d ms=%d", user_id, msg.channel, len(calls),
                 (time.monotonic() - started) * 1000)
        return InboundReply(reply=reply, actions=actions)
    except Exception as exc:
        log.exception("chat.inbound_failed channel=%s err=%s", msg.channel, type(exc).__name__)
        return InboundReply(reply=GENERIC_ERROR)


async def _safe_save(user_id: UUID, channel: str, direction: str, text: str,
                     calls: list[dict[str, Any]] | None, external_id: str) -> None:
    try:
        await save_message(user_id, channel, direction, text, calls, external_id)
    except Exception as exc:
        log.warning("chat.save_failed direction=%s err=%s", direction, type(exc).__name__)


@router.post("/inbound", response_model=InboundReply)
async def inbound(body: InboundMessage) -> InboundReply:
    return await handle(body)
