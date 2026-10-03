from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, tzinfo
from typing import Any
from zoneinfo import ZoneInfo

from app.contracts import CalendarEvent, DailySummary, Goal

Series = dict[str, list[tuple[datetime, float]]]

TITLES: dict[str, str] = {
    "workout_detected": "Workout detected",
    "illness_onset": "Possible illness onset",
    "low_spo2": "Low blood oxygen",
    "inactivity": "Time to move",
    "goal_pace": "Step goal check-in",
    "high_bp": "Elevated blood pressure",
    "sleep_debt": "Sleep debt building",
    "recovery": "Recovery on track",
    "low_hr": "Low heart rate",
}


@dataclass
class Finding:
    kind: str
    severity: str
    facts: dict[str, Any]
    proposal: dict[str, Any] | None = None


@dataclass
class RuleContext:
    """Input of every rule.

    series: metric -> ascending (ts, value) per minute. Holds at least the last 3 hours.
    bp_systolic and bp_diastolic hold the last 24 hours. Steps are summed per minute.
    daily: metric -> local day -> DailySummary, for the last week.
    recent_alerts: (kind, created_at) of alerts from the last 48 hours.
    """

    now: datetime
    tz: str = "UTC"
    twin: dict[str, Any] = field(default_factory=dict)
    goals: list[Goal] = field(default_factory=list)
    series: Series = field(default_factory=dict)
    daily: dict[str, dict[date, DailySummary]] = field(default_factory=dict)
    events: list[CalendarEvent] = field(default_factory=list)
    recent_alerts: list[tuple[str, datetime]] = field(default_factory=list)
    wake_time: time | None = None
    bed_time: time | None = None

    @property
    def zone(self) -> tzinfo:
        try:
            return ZoneInfo(self.tz)
        except Exception:
            return UTC

    @property
    def local_now(self) -> datetime:
        return self.now.astimezone(self.zone)
