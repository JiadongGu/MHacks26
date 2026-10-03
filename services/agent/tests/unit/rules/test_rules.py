from datetime import UTC, datetime, time, timedelta

from app.rules import evaluate, thresholds
from tests.unit.rules.helpers import build_context, event_in, kinds, sleep_goal, steps_goal

BASE_TWIN = {
    "baselines": {"resting_hr": 62, "hrv_sdnn": 48, "sleep_min": 432},
    "thresholds": {"rhr_delta_warn": 8},
    "status": "normal",
}
HYPERTENSIVE_TWIN = {
    "conditions": [{"display": "Hypertensive disorder", "status": "active"}],
    "risk_flags": ["hypertension"],
    "medications": [{"display": "lisinopril 10 mg", "class": "ACE inhibitor"}],
}
BETA_TWIN = {"medications": [{"display": "metoprolol 50 mg", "class": "Beta blocker"}]}


def t(s: str) -> datetime:
    return datetime.fromisoformat(s).astimezone(UTC)


# R1
def test_r1_workout_detected():
    ctx = build_context("workout")
    out = evaluate(ctx)
    assert kinds(out) == ["workout_detected"]
    assert out[0].severity == "nudge"
    assert out[0].facts["duration_min"] == 13
    assert out[0].facts["peak_hr"] == 166


def test_r1_not_enough_minutes():
    ctx = build_context("workout", now=t("2026-10-14T21:04:00+00:00"))
    assert kinds(evaluate(ctx)) == []


# R2
def test_r2_illness_onset_with_event_proposal():
    now = t("2026-10-14T13:00:00+00:00")
    ctx = build_context("illness_onset", twin=BASE_TWIN, events=[event_in(now, 30)])
    out = evaluate(ctx)
    assert kinds(out) == ["illness_onset"]
    f = out[0]
    assert f.severity == "warning"
    assert f.facts["rhr_delta"] == 10
    assert f.facts["triggers"] == ["short_sleep", "low_hrv"]
    p = f.proposal
    assert p is not None
    assert p["title"] == "Sleep block (Pulse)"
    s, e = datetime.fromisoformat(p["starts_at"]), datetime.fromisoformat(p["ends_at"])
    assert s.utcoffset() is not None
    assert (s.hour, s.minute, e.hour, e.minute) == (22, 0, 6, 0)
    assert e - s == timedelta(hours=8)
    assert "72" in p["rationale"] and "Board presentation" in p["rationale"]


def test_r2_proposal_uses_wake_and_bed_time():
    now = t("2026-10-14T13:00:00+00:00")
    ctx = build_context("illness_onset", twin=BASE_TWIN, events=[event_in(now, 30)],
                        bed_time=time(23, 0), wake_time=time(7, 30))
    p = evaluate(ctx)[0].proposal
    assert p is not None
    s, e = datetime.fromisoformat(p["starts_at"]), datetime.fromisoformat(p["ends_at"])
    assert (s.hour, s.minute, e.hour, e.minute) == (23, 0, 7, 30)


def test_r2_no_event_no_proposal():
    out = evaluate(build_context("illness_onset", twin=BASE_TWIN))
    assert kinds(out) == ["illness_onset"]
    assert out[0].proposal is None


def test_r2_event_beyond_48h_no_proposal():
    now = t("2026-10-14T13:00:00+00:00")
    out = evaluate(build_context("illness_onset", twin=BASE_TWIN, events=[event_in(now, 60)]))
    assert out[0].proposal is None


def test_r2_needs_second_signal():
    ctx = build_context("illness_onset", twin=BASE_TWIN)
    today = max(ctx.daily["sleep_total_min"])
    ctx.daily["sleep_total_min"][today] = ctx.daily["sleep_total_min"][today].model_copy(
        update={"sum": 430.0, "avg": 430.0})
    ctx.daily["hrv_sdnn"][today] = ctx.daily["hrv_sdnn"][today].model_copy(update={"avg": 47.0})
    assert kinds(evaluate(ctx)) == []


def test_r2_hypertension_tightens_default_delta():
    twin = {**HYPERTENSIVE_TWIN, "baselines": {"resting_hr": 66, "hrv_sdnn": 48}}
    assert thresholds(twin)["rhr_delta_warn"] == 6
    out = evaluate(build_context("illness_onset", twin=twin))
    assert kinds(out) == ["illness_onset"]
    assert out[0].facts["rhr_delta"] == 6


# R3
def test_r3_low_spo2_warning():
    out = evaluate(build_context("low_spo2"))
    assert kinds(out) == ["low_spo2"]
    assert out[0].severity == "warning"
    assert out[0].facts["readings"] == [91, 89]


def test_r3_urgent_below_88():
    ctx = build_context("low_spo2")
    ctx.series["spo2"][-2:] = [(ts, 86.0) for ts, _ in ctx.series["spo2"][-2:]]
    assert evaluate(ctx)[0].severity == "urgent"


def test_r3_single_low_reading_is_not_enough():
    ctx = build_context("low_spo2")
    ctx.series["spo2"][-2] = (ctx.series["spo2"][-2][0], 96.0)
    assert kinds(evaluate(ctx)) == []


# R4
def test_r4_inactivity():
    out = evaluate(build_context("inactivity"))
    assert kinds(out) == ["inactivity"]
    assert out[0].facts["steps_3h"] < 200


def test_r4_outside_active_hours():
    ctx = build_context("inactivity")
    ctx.now = t("2026-10-15T02:00:00+00:00")
    assert kinds(evaluate(ctx)) == []


def test_r4_not_without_data_coverage():
    ctx = build_context("inactivity", now=t("2026-10-14T16:00:00+00:00"))
    assert kinds(evaluate(ctx)) == []


# R5
def test_r5_goal_pace():
    out = evaluate(build_context("sedentary_goal", goals=[steps_goal()]))
    assert kinds(out) == ["goal_pace"]
    assert out[0].facts["remaining"] == 6100
    assert out[0].facts["pct"] == 39


def test_r5_before_18_local():
    ctx = build_context("sedentary_goal", goals=[steps_goal()], now=t("2026-10-14T20:00:00+00:00"))
    assert kinds(evaluate(ctx)) == []


def test_r5_goal_met_or_missing():
    assert kinds(evaluate(build_context("sedentary_goal", goals=[steps_goal(5000)]))) == []
    assert kinds(evaluate(build_context("sedentary_goal"))) == []


# R6
def test_r6_high_bp_hypertensive():
    out = evaluate(build_context("high_bp_hypertensive", twin=HYPERTENSIVE_TWIN))
    assert kinds(out) == ["high_bp"]
    f = out[0]
    assert f.facts["count"] == 3
    assert f.facts["max_systolic"] == 142
    assert f.facts["hypertension"] is True
    assert f.facts["threshold"] == [130, 80]


def test_r6_one_high_reading_with_looser_threshold():
    twin = {"thresholds": {"bp_warn": [140, 90]}}
    assert kinds(evaluate(build_context("high_bp_hypertensive", twin=twin))) == []


def test_r6_ignores_readings_older_than_24h():
    ctx = build_context("high_bp_hypertensive", now=t("2026-10-14T23:00:00+00:00"))
    assert evaluate(ctx)[0].facts["count"] == 2


# R7
def test_r7_sleep_debt_with_proposal():
    ctx = build_context("illness_onset", goals=[sleep_goal(450)], twin={})
    ctx.daily["resting_heart_rate"].clear()
    sums = {d: s for d, s in ctx.daily["sleep_total_min"].items()}
    days = sorted(sums)
    for d in days[-3:]:
        ctx.daily["sleep_total_min"][d] = sums[d].model_copy(update={"sum": 360.0, "avg": 360.0})
    out = evaluate(ctx)
    assert kinds(out) == ["sleep_debt"]
    assert out[0].facts["debt_min"] == 90
    assert out[0].proposal is not None
    assert datetime.fromisoformat(out[0].proposal["starts_at"]).hour == 21


def test_r7_no_goal_no_baseline():
    ctx = build_context("illness_onset", twin={})
    for d in ctx.daily["sleep_total_min"]:
        ctx.daily["sleep_total_min"][d] = ctx.daily["sleep_total_min"][d].model_copy(update={"sum": 300.0})
    assert "sleep_debt" not in kinds(evaluate(ctx))


# R8
def test_r8_recovery():
    twin = {**BASE_TWIN, "status": "possibly_ill"}
    out = evaluate(build_context("recovery", twin=twin))
    assert kinds(out) == ["recovery"]
    assert out[0].severity == "info"


def test_r8_requires_possibly_ill():
    assert kinds(evaluate(build_context("recovery", twin=BASE_TWIN))) == []


def test_r8_not_if_yesterday_still_high():
    twin = {**BASE_TWIN, "status": "possibly_ill"}
    ctx = build_context("recovery", twin=twin)
    yesterday = sorted(ctx.daily["resting_heart_rate"])[-2]
    ctx.daily["resting_heart_rate"][yesterday] = ctx.daily["resting_heart_rate"][yesterday].model_copy(
        update={"avg": 70.0})
    assert kinds(evaluate(ctx)) == []


# Beta-blocker
def test_beta_blocker_suppresses_low_hr():
    now = t("2026-10-14T18:30:00+00:00")
    plain = evaluate(build_context("beta_blocker", now=now))
    assert kinds(plain) == ["low_hr"]
    assert plain[0].facts["min_hr"] == 36
    assert kinds(evaluate(build_context("beta_blocker", now=now, twin=BETA_TWIN))) == []


def test_beta_blocker_lowers_workout_threshold():
    assert thresholds(BETA_TWIN)["workout_hr"] == 115
    assert kinds(evaluate(build_context("beta_blocker"))) == []
    out = evaluate(build_context("beta_blocker", twin=BETA_TWIN))
    assert kinds(out) == ["workout_detected"]
    assert out[0].facts["beta_blocker"] is True


def test_beta_blocker_detected_by_name_only():
    twin = {"medications": [{"display": "Propranolol 40 mg"}]}
    assert thresholds(twin)["workout_hr"] == 115


def test_default_thresholds():
    assert thresholds({}) == {
        "rhr_delta_warn": 8, "spo2_warn": 92, "bp_warn": [130, 80], "workout_hr": 135,
        "inactivity_steps_3h": 200, "low_hr": 40}


# Cooldowns
def test_cooldown_blocks_repeat_within_window():
    ctx = build_context("workout")
    ctx.recent_alerts = [("workout_detected", ctx.now - timedelta(minutes=119))]
    assert kinds(evaluate(ctx)) == []


def test_cooldown_expires():
    ctx = build_context("workout")
    ctx.recent_alerts = [("workout_detected", ctx.now - timedelta(minutes=121))]
    assert kinds(evaluate(ctx)) == ["workout_detected"]


def test_cooldown_is_per_kind():
    ctx = build_context("workout")
    ctx.recent_alerts = [("low_spo2", ctx.now - timedelta(minutes=5))]
    assert kinds(evaluate(ctx)) == ["workout_detected"]


def test_cooldown_24h_illness():
    now = t("2026-10-14T13:00:00+00:00")
    ctx = build_context("illness_onset", twin=BASE_TWIN, events=[event_in(now, 30)])
    ctx.recent_alerts = [("illness_onset", now - timedelta(hours=23))]
    assert kinds(evaluate(ctx)) == []
    ctx.recent_alerts = [("illness_onset", now - timedelta(hours=25))]
    assert kinds(evaluate(ctx)) == ["illness_onset"]


def test_cooldown_spo2_6h():
    ctx = build_context("low_spo2")
    ctx.recent_alerts = [("low_spo2", ctx.now - timedelta(hours=5))]
    assert kinds(evaluate(ctx)) == []


def test_inactivity_cooldown_3h_and_two_per_day_cap():
    ctx = build_context("inactivity")
    ctx.recent_alerts = [("inactivity", ctx.now - timedelta(hours=2))]
    assert kinds(evaluate(ctx)) == []
    ctx.recent_alerts = [("inactivity", ctx.now - timedelta(hours=4))]
    assert kinds(evaluate(ctx)) == ["inactivity"]
    ctx.recent_alerts = [("inactivity", ctx.now - timedelta(hours=4)),
                         ("inactivity", ctx.now - timedelta(hours=3, minutes=30))]
    assert kinds(evaluate(ctx)) == []
    yesterday = ctx.now - timedelta(hours=30)
    ctx.recent_alerts = [("inactivity", yesterday), ("inactivity", yesterday - timedelta(hours=4))]
    assert kinds(evaluate(ctx)) == ["inactivity"]


def test_when_words_today_tonight_tomorrow_weekday():
    from datetime import datetime
    from types import SimpleNamespace
    from zoneinfo import ZoneInfo

    from app.rules.engine import _when

    tz = ZoneInfo("America/Detroit")
    ctx = SimpleNamespace(zone=tz, local_now=datetime(2026, 10, 3, 16, 0, tzinfo=tz))
    assert _when(ctx, datetime(2026, 10, 3, 17, 30, tzinfo=tz)) == "today at 5:30 PM"
    assert _when(ctx, datetime(2026, 10, 3, 23, 0, tzinfo=tz)) == "tonight at 11:00 PM"
    assert _when(ctx, datetime(2026, 10, 4, 14, 0, tzinfo=tz)) == "tomorrow at 2:00 PM"
    assert _when(ctx, datetime(2026, 10, 6, 7, 0, tzinfo=tz)) == "Tuesday at 7:00 AM"
