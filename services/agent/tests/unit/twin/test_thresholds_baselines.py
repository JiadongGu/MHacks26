from datetime import date, timedelta

from app.twin import builder


def twin(age=40, flags=(), classes=()):
    return {
        "profile": {"age": age},
        "risk_flags": list(flags),
        "medications": [{"display": c, "class": c} for c in classes],
    }


def test_default_thresholds():
    assert builder.derive_thresholds(twin()) == {
        "rhr_delta_warn": 8,
        "spo2_warn": 92,
        "bp_warn": [140, 90],
        "workout_hr": 135,
        "inactivity_steps_3h": 200,
    }


def test_hypertension_tightens_bp_and_rhr():
    t = builder.derive_thresholds(twin(flags=["hypertension"]))
    assert t["bp_warn"] == [130, 80] and t["rhr_delta_warn"] == 6


def test_beta_blocker_suppresses_low_hr_and_lowers_workout_hr():
    t = builder.derive_thresholds(twin(classes=["beta blocker"]))
    assert t["suppress_low_hr"] is True and t["workout_hr"] == 120


def test_senior_and_pediatric():
    senior = builder.derive_thresholds(twin(age=65))
    assert senior["spo2_warn"] == 91 and senior["workout_hr"] == 120
    assert builder.derive_thresholds(twin(age=64))["spo2_warn"] == 92
    kid = builder.derive_thresholds(twin(age=9))
    assert kid["workout_hr"] == 160
    assert builder.derive_thresholds(twin(age=18))["workout_hr"] == 135


def test_afib_and_asthma():
    assert builder.derive_thresholds(twin(flags=["afib"]))["irregular_rhythm_wording"] is True
    assert builder.derive_thresholds(twin(flags=["asthma"]))["spo2_warn"] == 93
    assert builder.derive_thresholds(twin(age=80, flags=["asthma"]))["spo2_warn"] == 93


def test_unknown_age_and_missing_profile():
    assert builder.derive_thresholds({"risk_flags": []})["workout_hr"] == 135
    assert builder.derive_thresholds(twin(age=None))["spo2_warn"] == 92


def test_risk_flags_computed_when_missing():
    t = {
        "profile": {"age": 50},
        "conditions": [{"code": "I10", "system": "ICD-10", "display": "x", "status": "active"}],
    }
    assert builder.derive_thresholds(t)["bp_warn"] == [130, 80]


# ------------------------------------------------------------------ baselines

TODAY = date(2026, 10, 3)


def rows(metric, values, stat="avg", end=TODAY):
    return [{"day": end - timedelta(days=i), "metric": metric, stat: v, "n": 5} for i, v in enumerate(values)]


def test_baselines_median_of_daily_summary():
    daily = (
        rows("resting_heart_rate", [60, 62, 64, 100, 61, 63, 59])
        + rows("hrv_sdnn", [50, 40, 45, 48, 52, 49, 47])
        + rows("sleep_total_min", [420, 400, 450, 380, 440, 430, 410], "sum")
        + rows("steps", [8000, 9000, 7000, 7500, 8200, 6000, 9500], "sum", end=TODAY - timedelta(days=1))
    )
    b = builder.compute_baselines(daily, age=38, sex="female", today=TODAY)
    assert b["resting_hr"] == 62
    assert b["hrv_sdnn"] == 48
    assert b["sleep_min"] == 420
    assert b["steps"] == 8000
    assert b["computed_from_days"] == 7
    assert set(b["sources"].values()) == {"daily_summary"}


def test_baselines_use_only_the_last_seven_days():
    daily = rows("resting_heart_rate", [60] * 7 + [100] * 10)
    assert builder.compute_baselines(daily)["resting_hr"] == 60


def test_baselines_ignore_partial_today_steps():
    daily = rows("steps", [300, 8000, 8200, 7800], "sum")  # today has 300 so far
    assert builder.compute_baselines(daily, today=TODAY)["steps"] == 8000
    assert builder.compute_baselines(daily)["steps"] == 7900


def test_baselines_accept_objects_and_skip_bad_rows():
    class Row:
        day, metric, avg, min, max, sum, n = TODAY, "hrv_sdnn", 44.0, None, None, None, 3

    daily = [
        Row(),
        {"day": "bad", "metric": "hrv_sdnn", "avg": 1},
        {"day": TODAY, "metric": "steps"},
        {"day": TODAY, "metric": "spo2", "avg": 97},
    ]
    b = builder.compute_baselines(daily)
    assert b["hrv_sdnn"] == 44 and b["sources"]["hrv_sdnn"] == "daily_summary"
    assert b["sources"]["steps"] == "default"


def test_baselines_fall_back_to_finchnode_then_defaults():
    b = builder.compute_baselines([], {"resting_hr": 74, "clinical_bp": "124/78"}, age=38, sex="female")
    assert b["resting_hr"] == 74 and b["sources"]["resting_hr"] == "finchnode"
    assert b["hrv_sdnn"] == 50 and b["sources"]["hrv_sdnn"] == "default"
    assert b["computed_from_days"] == 0
    assert b["clinical_bp"] == "124/78"


def test_baselines_without_any_data_use_population_defaults():
    adult_f = builder.compute_baselines(None, None, age=30, sex="female")
    adult_m = builder.compute_baselines(None, None, age=30, sex="male")
    senior = builder.compute_baselines(None, None, age=78, sex="female")
    child = builder.compute_baselines(None, None, age=9, sex="male")
    assert adult_f["resting_hr"] == 72 and adult_m["resting_hr"] == 70
    assert senior["steps"] < adult_m["steps"] and senior["hrv_sdnn"] < adult_m["hrv_sdnn"]
    assert child["sleep_min"] > adult_m["sleep_min"]
    assert builder.compute_baselines(None)["resting_hr"] == 70  # unknown age and sex


def test_rebuild_keeps_previous_values_and_sources_without_new_data():
    first = builder.compute_baselines(rows("resting_heart_rate", [58, 60, 62]))
    second = builder.compute_baselines([], first)
    assert second["resting_hr"] == 60 and second["sources"]["resting_hr"] == "daily_summary"
    assert second["computed_from_days"] == 0


def test_finalize_rebuild_stamps_provenance_and_keeps_status():
    from datetime import UTC, datetime

    base = {
        "profile": {"age": 38, "sex": "female"},
        "conditions": [],
        "medications": [],
        "baselines": {},
        "status": "recovering",
        "insights": ["x"],
        "provenance": {"a": 1},
    }
    now = datetime(2026, 10, 3, tzinfo=UTC)
    out = builder.finalize(base, rows("resting_heart_rate", [61, 63]), today=TODAY, now=now, rebuild=True)
    assert out["status"] == "recovering" and out["insights"] == ["x"]
    assert out["provenance"] == {"a": 1, "last_rebuild": now.isoformat()}
    assert out["baselines"]["resting_hr"] == 62
