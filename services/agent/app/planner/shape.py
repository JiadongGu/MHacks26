"""Turn a day's calendar into busy time, free windows, and a load label. Pure code, no I/O."""

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

BUFFER_MIN = 10  # breathing room around every meeting
MIN_FREE_MIN = 15  # a gap shorter than this is not worth planning into


@dataclass(frozen=True)
class Slot:
    start: datetime
    end: datetime

    @property
    def minutes(self) -> int:
        return int((self.end - self.start).total_seconds() // 60)


def is_all_day(starts_at: datetime, ends_at: datetime) -> bool:
    """The calendar cache stores all-day events as whole UTC days. They do not block time."""
    span = ends_at - starts_at
    return (
        starts_at.astimezone(UTC).time() == time(0, 0)
        and span >= timedelta(hours=24)
        and span % timedelta(hours=24) == timedelta(0)
    )


def timed_busy(events: list[dict[str, Any]], tz: str) -> list[tuple[datetime, datetime]]:
    """Timed events as local (start, end) pairs, soonest first. All-day events are dropped."""
    zone = ZoneInfo(tz)
    out = [
        (e["starts_at"].astimezone(zone), e["ends_at"].astimezone(zone))
        for e in events
        if not is_all_day(e["starts_at"], e["ends_at"]) and e["ends_at"] > e["starts_at"]
    ]
    return sorted(out)


def merge(intervals: list[tuple[datetime, datetime]]) -> list[tuple[datetime, datetime]]:
    merged: list[tuple[datetime, datetime]] = []
    for start, end in sorted(intervals):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def waking_window(day: date, tz: str, wake: time, bed: time) -> tuple[datetime, datetime]:
    """When to plan things: an hour after waking until 90 minutes before bed."""
    zone = ZoneInfo(tz)
    start = datetime.combine(day, wake, tzinfo=zone) + timedelta(hours=1)
    bed_day = day + timedelta(days=1) if bed < time(12, 0) else day
    end = datetime.combine(bed_day, bed, tzinfo=zone) - timedelta(minutes=90)
    if end - start < timedelta(hours=4):
        end = start + timedelta(hours=10)
    return start, end


def free_windows(
    busy: list[tuple[datetime, datetime]],
    start: datetime,
    end: datetime,
    buffer: int = BUFFER_MIN,
    min_len: int = MIN_FREE_MIN,
) -> list[Slot]:
    """Gaps between meetings inside [start, end], keeping `buffer` minutes clear of each meeting."""
    pad = timedelta(minutes=buffer)
    slots: list[Slot] = []
    cursor = start
    for b_start, b_end in merge(busy):
        gap_end = min(b_start - pad, end)
        if gap_end - cursor >= timedelta(minutes=min_len):
            slots.append(Slot(cursor, gap_end))
        cursor = max(cursor, b_end + pad)
        if cursor >= end:
            break
    if end - cursor >= timedelta(minutes=min_len):
        slots.append(Slot(cursor, end))
    return slots


def busy_minutes(busy: list[tuple[datetime, datetime]], start: datetime, end: datetime) -> int:
    total = timedelta(0)
    for b_start, b_end in merge(busy):
        lo, hi = max(b_start, start), min(b_end, end)
        if hi > lo:
            total += hi - lo
    return int(total.total_seconds() // 60)


def classify(busy_min: int, event_count: int, free_min: int) -> str:
    """light, normal, or packed."""
    if busy_min >= 360 or event_count >= 6 or free_min < 90:
        return "packed"
    if busy_min < 120 and event_count <= 2:
        return "light"
    return "normal"
