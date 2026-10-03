"""Pure goal progress math. No I/O.

Units: `pct` is a percentage (0 to 100 and above), `current` is in the metric's own unit.

Metric kinds:
- count: `workout`. Current is the number of workouts (sum of `n`).
- cumulative: steps, active_minutes, active_energy_kcal. Current is the sum over the period.
  An at_least goal is on track when pct >= the share of the period that has passed.
- level: every other metric (sleep, resting HR, HRV, SpO2, weight, BP). A day value is the daily sum
  for sleep_* (one night) and the daily average for the rest. A week value is the mean of the day values.
  An at_least goal is on track when current >= target. Pace does not apply to a level.
An at_most goal is on track when current <= target. With no data current is 0, so it is on track.
"""

from __future__ import annotations

import statistics
from collections.abc import Iterable, Mapping
from datetime import date, datetime, timedelta
from typing import Any, Literal

from app.contracts import Goal, GoalProgress

COUNT_METRICS = {"workout"}
CUMULATIVE_METRICS = {"steps", "active_minutes", "active_energy_kcal"}


def kind(metric: str) -> Literal["count", "cumulative", "level"]:
    if metric in COUNT_METRICS:
        return "count"
    if metric in CUMULATIVE_METRICS:
        return "cumulative"
    return "level"


def period_start(period: str, today: date) -> date:
    """Day goal: today. Week goal: the Monday of this week."""
    return today if period == "day" else today - timedelta(days=today.weekday())


def elapsed_fraction(period: str, now_local: datetime) -> float:
    """Share of the period that has passed, from 0 to 1."""
    day_part = (now_local.hour * 3600 + now_local.minute * 60 + now_local.second) / 86400
    if period == "day":
        return day_part
    return (now_local.weekday() + day_part) / 7


def _num(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def _day(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _row_value(metric: str, row: Mapping[str, Any]) -> float | None:
    k = kind(metric)
    if k == "count":
        return _num(row.get("n"))
    if k == "cumulative" or metric.startswith("sleep_"):
        total = _num(row.get("sum"))
        if total is not None:
            return total
        avg, n = _num(row.get("avg")), _num(row.get("n"))
        return avg * n if avg is not None and n else None
    return _num(row.get("avg"))


def current_value(
    metric: str, period: str, rows: Iterable[Mapping[str, Any]], start: date, today: date
) -> float:
    """Aggregate the rows of one metric inside [start, today]. Returns 0.0 when there is no data."""
    per_day: dict[date, float] = {}
    for row in rows:
        if row.get("metric") != metric:
            continue
        day = _day(row.get("day"))
        value = _row_value(metric, row)
        if day is None or value is None or not (start <= day <= today):
            continue
        per_day[day] = value
    if not per_day:
        return 0.0
    if kind(metric) == "level" and period == "week":
        return statistics.fmean(per_day.values())
    if kind(metric) == "level":
        return per_day.get(today, 0.0)
    return sum(per_day.values())


def compute_progress(goal: Goal, rows: Iterable[Mapping[str, Any]], now_local: datetime) -> GoalProgress:
    today = now_local.date()
    start = period_start(goal.period, today)
    current = current_value(goal.metric, goal.period, rows, start, today)

    if goal.target > 0:
        pct = current / goal.target * 100
    elif goal.direction == "at_least":
        pct = 100.0
    else:
        pct = 0.0 if current <= 0 else 100.0

    if goal.direction == "at_most":
        on_track = current <= goal.target
    elif kind(goal.metric) == "level":
        on_track = current >= goal.target
    else:
        on_track = pct >= elapsed_fraction(goal.period, now_local) * 100

    return GoalProgress(
        goal_id=goal.id, period_start=start, current=round(current, 2), pct=round(pct, 1), on_track=on_track
    )


def earliest_start(goals: Iterable[Goal], today: date) -> date:
    return min((period_start(g.period, today) for g in goals), default=today)
