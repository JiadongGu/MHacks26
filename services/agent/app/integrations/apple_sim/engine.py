"""Simulated Apple Watch: builds Health Auto Export JSON, then uses the real HAE parser and ingest writer."""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from app.core import db
from app.core.logging import log
from app.ingest.hae import parse_hae
from app.ingest.writer import ingest_batch, user_timezone

from .persona import Baselines, daily_values, minute_values, sleep_entry

SOURCE = "apple_watch_sim"
FIRST_HISTORY_MIN = 240  # R4 needs 150 min of coverage
CATCHUP_MAX_MIN = 60
DAILY_BACKFILL_DAYS = 6
# History emitted when the caller gives no fast_forward_min, so a rule can fire immediately.
DEFAULT_FAST_FORWARD = {"workout_now": 14, "low_spo2": 3, "sedentary_day": 190}
# The web demo panel sends 30 for every scenario. A 20-minute workout is over after 30 minutes, and the
# inactivity rule needs 150 minutes of coverage, so those two scenarios bound the caller's value.
WORKOUT_FAST_FORWARD = (12, 18)


def effective_fast_forward(scenario: str, requested: int | None) -> int:
    ff = DEFAULT_FAST_FORWARD.get(scenario, 0) if requested is None else max(0, requested)
    if scenario == "workout_now":
        return min(max(ff, WORKOUT_FAST_FORWARD[0]), WORKOUT_FAST_FORWARD[1])
    if scenario == "sedentary_day":
        return max(ff, DEFAULT_FAST_FORWARD["sedentary_day"])
    return ff


@dataclass
class SimState:
    scenario: str
    started: datetime
    tz: str
    base: Baselines
    last_minute: datetime | None = None
    daily_day: date | None = None


_states: dict[UUID, SimState] = {}


def _floor(dt: datetime) -> datetime:
    return dt.replace(second=0, microsecond=0)


def _fmt(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S %z")


async def baselines(user_id: UUID) -> Baselines:
    try:
        async with db.neon() as conn:
            cur = await conn.execute(
                "select model->'baselines' as b from digital_twin where user_id = %s "
                "order by version desc limit 1",
                (user_id,),
            )
            b = ((await cur.fetchone()) or {}).get("b") or {}
    except RuntimeError:  # DATABASE_URL not configured (local dev)
        return Baselines()
    d = Baselines()
    return Baselines(
        b.get("resting_hr") or d.resting_hr,
        b.get("hrv_sdnn") or d.hrv_sdnn,
        b.get("sleep_min") or d.sleep_min,
    )


def build_hae(
    user_id: UUID, state: SimState, minutes: list[datetime], days: list[date], now: datetime
) -> dict[str, Any]:
    seed = str(user_id)
    series: dict[str, list[dict[str, Any]]] = {
        "heart_rate": [],
        "step_count": [],
        "blood_oxygen_saturation": [],
        "respiratory_rate": [],
    }
    for t in minutes:
        for name, value in minute_values(
            seed, state.base, state.scenario, t, state.tz, state.started
        ).items():
            entry = {"date": _fmt(t)}
            entry.update(value if isinstance(value, dict) else {"qty": value})
            series[name].append(entry)

    zone = ZoneInfo(state.tz)
    today = now.astimezone(zone).date()
    daily: dict[str, list[dict[str, Any]]] = {
        "resting_heart_rate": [],
        "heart_rate_variability": [],
        "skin_temp_delta": [],
        "sleep_analysis": [],
    }
    for day in days:
        ts = min(datetime.combine(day, time(7), tzinfo=zone), now)
        vals = daily_values(seed, state.base, state.scenario, day, day == today)
        for hae, key in (
            ("resting_heart_rate", "resting_heart_rate"),
            ("heart_rate_variability", "heart_rate_variability"),
            ("skin_temp_delta", "skin_temp_delta"),
        ):
            if key in vals:
                daily[hae].append({"date": _fmt(ts), "qty": round(vals[key], 1)})
        daily["sleep_analysis"].append(sleep_entry(ts, vals["sleep_minutes"]))

    metrics = [{"name": n, "data": d} for n, d in {**series, **daily}.items() if d]
    return {"data": {"metrics": metrics, "workouts": []}}


async def _emit(
    user_id: UUID, state: SimState, minutes: list[datetime], days: list[date], now: datetime
) -> int:
    payload = build_hae(user_id, state, minutes, days, now)
    return await ingest_batch(parse_hae(payload, user_id, SOURCE))


def _range(start: datetime, end: datetime) -> list[datetime]:
    out, t = [], start
    while t <= end:
        out.append(t)
        t += timedelta(minutes=1)
    return out


async def activate(user_id: UUID, scenario: str, fast_forward_min: int | None = None) -> int:
    """Start or switch the simulation. History is emitted immediately so judges do not wait."""
    now = _floor(datetime.now(UTC))
    ff = effective_fast_forward(scenario, fast_forward_min)
    first = user_id not in _states
    tz = await user_timezone(user_id)
    state = SimState(scenario, now - timedelta(minutes=ff), tz, await baselines(user_id))
    begin = min(state.started, now - timedelta(minutes=FIRST_HISTORY_MIN)) if first else state.started
    today = now.astimezone(ZoneInfo(tz)).date()
    days = [today - timedelta(days=i) for i in range(DAILY_BACKFILL_DAYS, -1, -1)] if first else [today]
    n = await _emit(user_id, state, _range(begin, now), days, now)
    state.last_minute, state.daily_day = now, today
    _states[user_id] = state
    return n


async def tick() -> None:
    """Scheduler job, every minute: emit the minutes since the last tick for each active user."""
    now = _floor(datetime.now(UTC))
    for user_id, state in list(_states.items()):
        try:
            start = max(
                (state.last_minute or now) + timedelta(minutes=1), now - timedelta(minutes=CATCHUP_MAX_MIN)
            )
            if start > now:
                continue
            today = now.astimezone(ZoneInfo(state.tz)).date()
            days = [today] if state.daily_day != today else []
            await _emit(user_id, state, _range(start, now), days, now)
            state.last_minute, state.daily_day = now, today
        except Exception as e:  # one user's failure must not stop the others
            log.warning("event=sim_tick_failed user=%s err=%s", user_id, e)
