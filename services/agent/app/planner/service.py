"""Build a person's plan for one day from their calendar and focus areas, and put it on their calendar."""

import asyncio
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from app.core.logging import log
from app.focus import store as focus_store
from app.goals import store as goals_store
from app.integrations.gcal import oauth as gcal_oauth
from app.integrations.gcal import service as gcal_service
from app.integrations.gcal import store as gcal_store
from app.integrations.gcal import sync as gcal_sync
from app.twin import builder as twin_builder
from app.twin import store as twin_store
from app.twin.tz import DEFAULT_TIMEZONE

from . import render, schedule, shape, store

DEFAULT_BED = time(22, 30)
DEFAULT_WAKE = time(7, 0)
LEAD_MIN = 20  # nothing is planned sooner than this after "now"


@dataclass
class Plan:
    day: date
    load: str
    headline: str
    text: str
    items: list[dict[str, Any]]  # key, title, start, end, why (datetimes), event_id when written
    bed: datetime
    wake: datetime
    calendar_written: bool
    shifted_min: int = 0
    reason: str = ""
    why: str = ""

    def as_json(self) -> dict[str, Any]:
        return {
            "day": self.day.isoformat(),
            "load": self.load,
            "headline": self.headline,
            "text": self.text,
            "bed_time": self.bed.strftime("%H:%M"),
            "wake_time": self.wake.strftime("%H:%M"),
            "calendar_written": self.calendar_written,
            "why": self.why,
            "items": [_item_json(i) for i in self.items],
        }


def _item_json(i: dict[str, Any]) -> dict[str, Any]:
    out = {**i, "start": i["start"].isoformat(), "end": i["end"].isoformat()}
    return {k: v for k, v in out.items() if v is not None}


def _to_time(value: Any) -> time | None:
    if value is None or isinstance(value, time):
        return value
    try:
        return time.fromisoformat(str(value))
    except ValueError:
        return None


def _round_up(dt: datetime, step: int = 5) -> datetime:
    dt = dt.replace(second=0, microsecond=0)
    extra = (-dt.minute) % step
    return dt + timedelta(minutes=extra)


def _when(day: date, today: date) -> str:
    if day == today:
        return "today"
    return "tomorrow" if day == today + timedelta(days=1) else day.strftime("%A")


async def _sleep_need(user_id: UUID) -> int | None:
    for g in await goals_store.list_goals(user_id):
        if g["metric"] == "sleep_total_min" and g["period"] == "day":
            return int(g["target"])
    return None


async def _risk_flags(user_id: UUID) -> set[str]:
    model = ((await twin_store.latest_twin(user_id)) or {}).get("model") or {}
    flags = model.get("risk_flags")
    return set(flags if flags is not None else twin_builder.risk_flags_for(model))


async def _write_calendar(
    user_id: UUID, day: date, now: datetime, items: list[dict[str, Any]]
) -> list[str] | None:
    """Replace the day's unstarted plan events. Returns the new event ids, or None if nothing was written."""
    cal = await gcal_store.load(user_id)
    if not cal or not cal.get("health_calendar_id"):
        return None
    try:
        creds = await asyncio.to_thread(gcal_oauth.credentials_for, cal["refresh_token"])
        return await asyncio.to_thread(
            gcal_service.replace_plan_events, creds, cal["health_calendar_id"], day.isoformat(), now, items
        )
    except Exception as exc:  # a calendar problem must never stop the briefing
        log.warning("event=plan_calendar_failed user=%s err=%s", user_id, type(exc).__name__)
        return None


async def build_plan(user_id: UUID, day: date, now: datetime, write_calendar: bool = True) -> Plan:
    """Plan `day` around the calendar. Safe to run again: unstarted events are replaced, past ones stay."""
    profile = await store.load_profile(user_id)
    tz = profile.get("timezone") or DEFAULT_TIMEZONE
    zone = ZoneInfo(tz)
    bed = _to_time(profile.get("bed_time")) or DEFAULT_BED
    wake = _to_time(profile.get("wake_time")) or DEFAULT_WAKE
    picks = await focus_store.list_picks(user_id)
    keys = schedule.planned_keys(picks, await _risk_flags(user_id), day)
    try:
        await gcal_sync.refresh_user(user_id)
    except Exception as exc:
        log.warning("event=plan_calendar_refresh_failed user=%s err=%s", user_id, type(exc).__name__)

    day_start = datetime.combine(day, time(0), tzinfo=zone)
    day_end = day_start + timedelta(days=1)
    busy = shape.timed_busy(await store.events_between(user_id, day_start, day_end), tz)
    next_busy = shape.timed_busy(
        await store.events_between(user_id, day_end, day_end + timedelta(days=1)), tz
    )

    win_start, win_end = shape.waking_window(day, tz, wake, bed)
    all_free = shape.free_windows(busy, win_start, win_end)
    load = shape.classify(
        shape.busy_minutes(busy, win_start, win_end), len(busy), sum(s.minutes for s in all_free)
    )
    now_local = now.astimezone(zone)
    usable = all_free
    if day == now_local.date():
        usable = shape.free_windows(
            busy, max(win_start, _round_up(now_local + timedelta(minutes=LEAD_MIN))), win_end
        )

    night = schedule.night_plan(
        day, tz, next_busy[0][0] if next_busy else None, bed, wake, await _sleep_need(user_id)
    )
    items = [i.__dict__ | {"event_id": None} for i in schedule.place(keys, usable, load)]
    wd = schedule.wind_down(picks, night)
    if wd is not None and wd.start > now_local + timedelta(minutes=5):
        items.append(wd.__dict__ | {"event_id": None})
    items.sort(key=lambda i: i["start"])

    ids = await _write_calendar(user_id, day, now, items) if write_calendar else None
    if ids is not None:
        for item, event_id in zip(items, ids, strict=True):
            item["event_id"] = event_id

    previous = await store.get_plan(user_id, day)
    kept = [i for i in (previous or {}).get("items", []) if datetime.fromisoformat(i["end"]) <= now]
    text = render.plan_text(
        _when(day, now_local.date()), load, items, night.bed, night.shifted_min, ids is not None
    )
    headline = render.headline(load, _when(day, now_local.date()))
    await store.save_plan(
        user_id,
        day,
        load,
        headline,
        night.bed.strftime("%H:%M"),
        night.wake.strftime("%H:%M"),
        kept + [_item_json(i) for i in items],
    )
    log.info(
        "event=plan_built user=%s day=%s load=%s items=%d calendar=%s",
        user_id,
        day,
        load,
        len(items),
        ids is not None,
    )
    return Plan(
        day,
        load,
        headline,
        text,
        items,
        night.bed,
        night.wake,
        ids is not None,
        night.shifted_min,
        night.reason,
        render.why_text(load, night.shifted_min, night.reason),
    )


async def build_plans(user_id: UUID, now: datetime, write_calendar: bool = True) -> list[Plan]:
    """Plan today and tomorrow, so the calendar is never empty for the day ahead."""
    profile = await store.load_profile(user_id)
    zone = ZoneInfo(profile.get("timezone") or DEFAULT_TIMEZONE)
    today = now.astimezone(zone).date()
    return [await build_plan(user_id, d, now, write_calendar) for d in (today, today + timedelta(days=1))]
