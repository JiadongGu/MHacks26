from collections.abc import Iterable
from datetime import date, datetime, time, timedelta
from typing import Any
from zoneinfo import ZoneInfo

# One value per day. The batch holds the whole day for these, so a repeat replaces the row.
POINT_METRICS = {
    "resting_heart_rate",
    "hrv_sdnn",
    "weight_kg",
    "skin_temp_delta",
    "stress_score",
    "sleep_total_min",
    "sleep_deep_min",
    "sleep_rem_min",
    "sleep_core_min",
    "sleep_awake_min",
}
EVENT_METRICS = {"workout"}


def local_day(ts: datetime, tz: str) -> date:
    return ts.astimezone(ZoneInfo(tz)).date()


def day_bounds_ms(day: date, tz: str) -> tuple[int, int]:
    zone = ZoneInfo(tz)
    start = datetime.combine(day, time(0), tzinfo=zone)
    end = datetime.combine(day + timedelta(days=1), time(0), tzinfo=zone)
    return int(start.timestamp() * 1000), int(end.timestamp() * 1000)


def aggregate_values(values: Iterable[float]) -> dict[str, Any] | None:
    vals = list(values)
    if not vals:
        return None
    total = sum(vals)
    return {"avg": total / len(vals), "min": min(vals), "max": max(vals), "sum": total, "n": len(vals)}


def aggregate_minutes(rows: Iterable[dict[str, Any]]) -> dict[str, Any] | None:
    """Combine Spacetime minute_agg rows; idempotent because minute_agg is keyed per minute."""
    rows = list(rows)
    n = sum(int(r["n"]) for r in rows)
    if not rows or n == 0:
        return None
    total = sum(float(r["sum"]) for r in rows)
    return {
        "avg": total / n,
        "min": min(float(r["min"]) for r in rows),
        "max": max(float(r["max"]) for r in rows),
        "sum": total,
        "n": n,
    }
