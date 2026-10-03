import json
from collections import defaultdict
from datetime import date, datetime, time, timedelta
from pathlib import Path
from uuid import UUID
from zoneinfo import ZoneInfo

from app.contracts import CalendarEvent, DailySummary, Goal, VitalsSample
from app.rules import RuleContext

FIXTURES = Path(__file__).resolve().parents[5] / "contracts" / "fixtures"
USER_ID = UUID("00000000-0000-0000-0000-000000000001")
TZ = "America/Detroit"
SERIES_METRICS = {"heart_rate", "steps", "spo2", "bp_systolic", "bp_diastolic"}
LONG_SERIES = {"bp_systolic", "bp_diastolic"}
DAILY_METRICS = {"resting_heart_rate", "hrv_sdnn", "sleep_total_min", "steps"}


def load_samples(name: str) -> list[VitalsSample]:
    raw = json.loads((FIXTURES / f"series_{name}.json").read_text())
    return [VitalsSample.model_validate(r) for r in raw]


def steps_goal(target: float = 10000) -> Goal:
    return Goal(id=UUID(int=7), user_id=USER_ID, metric="steps", target=target, period="day",
                direction="at_least")


def sleep_goal(target: float = 450) -> Goal:
    return Goal(id=UUID(int=8), user_id=USER_ID, metric="sleep_total_min", target=target, period="day",
                direction="at_least")


def event_in(now: datetime, hours: float, title: str = "Board presentation") -> CalendarEvent:
    start = now + timedelta(hours=hours)
    return CalendarEvent(event_id="ev1", title=title, starts_at=start, ends_at=start + timedelta(hours=1),
                         is_important=True)


def build_context(
    name: str,
    *,
    now: datetime | None = None,
    twin: dict | None = None,
    goals: list[Goal] | None = None,
    events: list[CalendarEvent] | None = None,
    recent_alerts: list[tuple[str, datetime]] | None = None,
    wake_time: time | None = None,
    bed_time: time | None = None,
    tz: str = TZ,
) -> RuleContext:
    """Build a RuleContext from a fixture. `now` defaults to the newest sample timestamp."""
    samples = load_samples(name)
    now = now or max(s.ts for s in samples)
    zone = ZoneInfo(tz)
    samples = [s for s in samples if s.ts <= now]

    buckets: dict[tuple[str, datetime], list[float]] = defaultdict(list)
    for s in samples:
        if s.metric in SERIES_METRICS:
            age = now - s.ts
            if age < (timedelta(hours=24) if s.metric in LONG_SERIES else timedelta(hours=3)):
                buckets[(s.metric, s.ts.replace(second=0, microsecond=0))].append(s.value)
    series: dict[str, list[tuple[datetime, float]]] = defaultdict(list)
    for (metric, ts), vals in sorted(buckets.items(), key=lambda kv: kv[0][1]):
        series[metric].append((ts, sum(vals) if metric == "steps" else sum(vals) / len(vals)))

    by_day: dict[tuple[str, date], list[float]] = defaultdict(list)
    for s in samples:
        if s.metric in DAILY_METRICS:
            by_day[(s.metric, s.ts.astimezone(zone).date())].append(s.value)
    daily: dict[str, dict[date, DailySummary]] = defaultdict(dict)
    for (metric, day), vals in by_day.items():
        daily[metric][day] = DailySummary(user_id=USER_ID, day=day, metric=metric, avg=sum(vals) / len(vals),
                                          min=min(vals), max=max(vals), sum=sum(vals), n=len(vals))

    return RuleContext(
        now=now, tz=tz, twin=twin or {}, goals=goals or [], series=dict(series), daily=dict(daily),
        events=events or [], recent_alerts=recent_alerts or [], wake_time=wake_time, bed_time=bed_time)


def kinds(findings) -> list[str]:
    return [f.kind for f in findings]
