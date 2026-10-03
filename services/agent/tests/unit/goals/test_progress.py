from datetime import date, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from app.contracts import Goal
from app.goals import progress

TZ = ZoneInfo("America/Detroit")
# Wednesday 2026-09-30 12:00 local. The week started Monday 2026-09-28.
WED_NOON = datetime(2026, 9, 30, 12, 0, tzinfo=TZ)


def goal(metric, target, period="day", direction="at_least"):
    return Goal(id=uuid4(), user_id=uuid4(), metric=metric, target=target, period=period, direction=direction)


def row(day, metric, **kw):
    return {"day": day, "metric": metric, "avg": None, "min": None, "max": None, "sum": None, "n": 0, **kw}


def test_period_start_day_and_week():
    assert progress.period_start("day", date(2026, 9, 30)) == date(2026, 9, 30)
    assert progress.period_start("week", date(2026, 9, 30)) == date(2026, 9, 28)  # Monday
    assert progress.period_start("week", date(2026, 9, 28)) == date(2026, 9, 28)
    assert progress.period_start("week", date(2026, 10, 4)) == date(2026, 9, 28)  # Sunday


def test_elapsed_fraction():
    assert progress.elapsed_fraction("day", WED_NOON) == 0.5
    assert progress.elapsed_fraction("week", WED_NOON) == (2 + 0.5) / 7
    monday_start = datetime(2026, 9, 28, 0, 0, tzinfo=TZ)
    assert progress.elapsed_fraction("week", monday_start) == 0


def test_steps_day_on_track_when_ahead_of_pace():
    g = goal("steps", 8000)
    rows = [row(date(2026, 9, 30), "steps", sum=4500.0, n=40), row(date(2026, 9, 29), "steps", sum=9000.0)]
    p = progress.compute_progress(g, rows, WED_NOON)
    assert p.period_start == date(2026, 9, 30)
    assert p.current == 4500 and p.pct == 56.2
    assert p.on_track is True  # 56% done at 50% of the day


def test_steps_day_behind_pace():
    p = progress.compute_progress(
        goal("steps", 8000), [row(date(2026, 9, 30), "steps", sum=2000.0)], WED_NOON
    )
    assert p.pct == 25.0 and p.on_track is False


def test_no_data_cumulative_goal_current_zero():
    p = progress.compute_progress(goal("steps", 8000), [], WED_NOON)
    assert (p.current, p.pct, p.on_track) == (0.0, 0.0, False)
    early = datetime(2026, 9, 30, 0, 0, tzinfo=TZ)
    assert progress.compute_progress(goal("steps", 8000), [], early).on_track is True  # nothing expected yet


def test_active_minutes_week_sums_since_monday_only():
    g = goal("active_minutes", 150, "week")
    rows = [
        row(date(2026, 9, 27), "active_minutes", sum=500.0),  # last week
        row(date(2026, 9, 28), "active_minutes", sum=40.0),
        row(date(2026, 9, 29), "active_minutes", sum=35.0),
        row(date(2026, 9, 30), "active_minutes", sum=30.0),
        row(date(2026, 10, 1), "active_minutes", sum=999.0),
    ]  # future relative to now
    p = progress.compute_progress(g, rows, WED_NOON)
    assert p.period_start == date(2026, 9, 28)
    assert p.current == 105 and p.pct == 70.0
    assert p.on_track is True  # 70% vs 35.7% of the week


def test_workout_counts_n_not_duration():
    g = goal("workout", 3, "week")
    rows = [
        row(date(2026, 9, 28), "workout", sum=45.0, avg=45.0, n=1),
        row(date(2026, 9, 30), "workout", sum=90.0, avg=45.0, n=2),
    ]
    p = progress.compute_progress(g, rows, WED_NOON)
    assert p.current == 3 and p.pct == 100.0 and p.on_track is True


def test_workout_week_behind_pace():
    g = goal("workout", 3, "week")
    thu_evening = datetime(2026, 10, 1, 20, 0, tzinfo=TZ)
    p = progress.compute_progress(g, [row(date(2026, 9, 28), "workout", n=1)], thu_evening)
    assert p.current == 1 and p.pct == 33.3
    assert p.on_track is False  # 33% done, 57% of the week gone


def test_sleep_is_a_level_not_a_pace():
    g = goal("sleep_total_min", 450)
    short = progress.compute_progress(
        g, [row(date(2026, 9, 30), "sleep_total_min", sum=240.0, n=1)], WED_NOON
    )
    assert short.current == 240 and short.on_track is False  # would pass a pace test at noon
    enough = progress.compute_progress(
        g, [row(date(2026, 9, 30), "sleep_total_min", sum=460.0, n=1)], WED_NOON
    )
    assert enough.on_track is True and enough.pct == 102.2


def test_sleep_week_is_nightly_mean():
    g = goal("sleep_total_min", 450, "week")
    rows = [
        row(date(2026, 9, 28), "sleep_total_min", sum=400.0),
        row(date(2026, 9, 29), "sleep_total_min", sum=500.0),
        row(date(2026, 9, 30), "sleep_total_min", sum=480.0),
    ]
    p = progress.compute_progress(g, rows, WED_NOON)
    assert p.current == 460 and p.on_track is True


def test_at_most_resting_hr_uses_average():
    g = goal("resting_heart_rate", 62, direction="at_most")
    ok = progress.compute_progress(g, [row(date(2026, 9, 30), "resting_heart_rate", avg=60.0, n=5)], WED_NOON)
    assert ok.current == 60 and ok.on_track is True and ok.pct == 96.8
    over = progress.compute_progress(
        g, [row(date(2026, 9, 30), "resting_heart_rate", avg=64.0, n=5)], WED_NOON
    )
    assert over.on_track is False and over.pct == 103.2


def test_at_most_week_mean_and_equal_target():
    g = goal("resting_heart_rate", 62, "week", "at_most")
    rows = [
        row(date(2026, 9, 28), "resting_heart_rate", avg=60.0),
        row(date(2026, 9, 29), "resting_heart_rate", avg=64.0),
    ]
    p = progress.compute_progress(g, rows, WED_NOON)
    assert p.current == 62 and p.on_track is True


def test_at_most_with_no_data_is_on_track():
    p = progress.compute_progress(goal("resting_heart_rate", 62, direction="at_most"), [], WED_NOON)
    assert p.current == 0 and p.on_track is True


def test_ignores_other_metrics_and_bad_rows():
    rows = [
        row(date(2026, 9, 30), "active_minutes", sum=100.0),
        row("garbage", "steps", sum=1.0),
        row(date(2026, 9, 30), "steps"),
        {"day": "2026-09-30", "metric": "steps", "sum": 3000.0},
    ]
    p = progress.compute_progress(goal("steps", 6000), rows, WED_NOON)
    assert p.current == 3000 and p.pct == 50.0


def test_sum_falls_back_to_avg_times_n():
    p = progress.compute_progress(
        goal("steps", 1000), [row(date(2026, 9, 30), "steps", avg=10.0, n=30)], WED_NOON
    )
    assert p.current == 300


def test_zero_target_does_not_divide_by_zero():
    assert progress.compute_progress(goal("steps", 0), [], WED_NOON).pct == 100.0
    p = progress.compute_progress(goal("resting_heart_rate", 0, direction="at_most"), [], WED_NOON)
    assert p.pct == 0.0


def test_earliest_start_covers_week_goals():
    goals = [goal("steps", 1), goal("active_minutes", 1, "week")]
    assert progress.earliest_start(goals, date(2026, 9, 30)) == date(2026, 9, 28)
    assert progress.earliest_start([], date(2026, 9, 30)) == date(2026, 9, 30)
