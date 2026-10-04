import json
from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.auth import require_internal
from app.rules import TITLES, Finding, RuleContext, evaluate
from app.rules import api as explain_api
from app.rules.explain import explain, explain_kinds
from tests.unit.rules.helpers import build_context, event_in, sleep_goal, steps_goal

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
SOURCES = {"wearable", "baseline", "goal", "calendar"}
KEYS = {"rule", "summary", "comparisons", "twin_rules", "data_used", "watch_next"}
CMP_KEYS = {"label", "today", "baseline_or_threshold", "unit", "delta", "flagged"}


def t(s: str) -> datetime:
    return datetime.fromisoformat(s).astimezone(UTC)


def only(findings, kind):
    (f,) = [f for f in findings if f.kind == kind]
    return f


def check_shape(out: dict, kind: str) -> None:
    assert KEYS <= set(out) and out["rule"] == kind
    assert out["summary"].endswith(".") and out["watch_next"].endswith(".")
    assert out["data_used"], "every rule reads some data"
    for c in out["comparisons"]:
        assert set(c) == CMP_KEYS
    for d in out["data_used"]:
        assert set(d) == {"metric", "window", "source"} and d["source"] in SOURCES
    assert all(isinstance(s, str) for s in out["twin_rules"])
    json.dumps(out)


def flagged(out: dict) -> dict[str, bool]:
    return {c["label"]: c["flagged"] for c in out["comparisons"]}


def test_every_rule_kind_has_a_builder():
    assert set(explain_kinds()) == set(TITLES)


def test_workout():
    ctx = build_context("workout")
    f = only(evaluate(ctx), "workout_detected")
    out = explain(f, ctx)
    check_shape(out, "workout_detected")
    peak = out["comparisons"][0]
    got = (peak["today"], peak["baseline_or_threshold"], peak["delta"], peak["unit"])
    assert got == (166, 135, 31, "bpm")
    assert peak["flagged"] is True
    assert out["twin_rules"] == []


def test_workout_beta_blocker_twin_rule():
    ctx = build_context("beta_blocker", twin=BETA_TWIN)
    f = only(evaluate(ctx), "workout_detected")
    out = explain(f, ctx)
    check_shape(out, "workout_detected")
    assert out["comparisons"][0]["baseline_or_threshold"] == 115
    assert out["twin_rules"] and "Beta blocker on your record" in out["twin_rules"][0]
    assert "115 bpm" in out["twin_rules"][0]


def test_illness_onset_hypertension_tightens_rhr():
    now = t("2026-10-14T13:00:00+00:00")
    twin = {**BASE_TWIN, **HYPERTENSIVE_TWIN, "thresholds": {}}
    ctx = build_context("illness_onset", twin=twin, events=[event_in(now, 30)])
    f = only(evaluate(ctx), "illness_onset")
    out = explain(f, ctx)
    check_shape(out, "illness_onset")
    assert "resting heart rate alert at +6 bpm (tightened for hypertension)" in out["twin_rules"][0]
    rhr = out["comparisons"][0]
    assert (rhr["today"], rhr["baseline_or_threshold"], rhr["delta"]) == (72, 62, 10)
    assert flagged(out)["Resting heart rate"] is True
    assert {"calendar"} <= {d["source"] for d in out["data_used"]}
    assert "short sleep" in out["summary"] and "low heart rate variability" in out["summary"]


def test_illness_onset_default_threshold_has_no_twin_rule():
    ctx = build_context("illness_onset", twin=BASE_TWIN)
    out = explain(only(evaluate(ctx), "illness_onset"), ctx)
    check_shape(out, "illness_onset")
    assert out["twin_rules"] == []
    labels = [c["label"] for c in out["comparisons"]]
    assert labels == ["Resting heart rate", "Sleep", "Heart rate variability"]
    hrv = out["comparisons"][2]
    assert hrv["baseline_or_threshold"] == pytest.approx(38.4) and hrv["unit"] == "ms"


def test_low_spo2():
    ctx = build_context("low_spo2")
    f = only(evaluate(ctx), "low_spo2")
    out = explain(f, ctx)
    check_shape(out, "low_spo2")
    c = out["comparisons"][0]
    assert c["unit"] == "%" and c["baseline_or_threshold"] == 92 and c["today"] < 92 and c["delta"] < 0
    assert c["flagged"] is True


def test_low_spo2_asthma_twin_rule():
    twin = {"risk_flags": ["asthma"], "thresholds": {"spo2_warn": 93}}
    ctx = build_context("low_spo2", twin=twin)
    out = explain(only(evaluate(ctx), "low_spo2"), ctx)
    assert out["twin_rules"] == ["Asthma on your record → blood oxygen alert below 93%"]


def test_inactivity():
    ctx = build_context("inactivity")
    out = explain(only(evaluate(ctx), "inactivity"), ctx)
    check_shape(out, "inactivity")
    c = out["comparisons"][0]
    assert c["baseline_or_threshold"] == 200 and c["delta"] < 0 and c["flagged"] is True


def test_goal_pace():
    ctx = build_context("sedentary_goal", goals=[steps_goal()])
    f = only(evaluate(ctx), "goal_pace")
    out = explain(f, ctx)
    check_shape(out, "goal_pace")
    steps, pct = out["comparisons"]
    assert steps["baseline_or_threshold"] == 10000 and steps["delta"] == steps["today"] - 10000
    assert pct["baseline_or_threshold"] == 60 and pct["today"] == f.facts["pct"]
    assert "goal" in {d["source"] for d in out["data_used"]}


def test_high_bp_hypertension_threshold_rule():
    ctx = build_context("high_bp_hypertensive", twin=HYPERTENSIVE_TWIN)
    f = only(evaluate(ctx), "high_bp")
    out = explain(f, ctx)
    check_shape(out, "high_bp")
    assert out["twin_rules"] == ["Hypertension on your record → blood pressure alert at 130/80"]
    sys_c, dia_c, count = out["comparisons"]
    assert sys_c["baseline_or_threshold"] == 130 and sys_c["unit"] == "mmHg"
    assert sys_c["delta"] == sys_c["today"] - 130
    assert count["today"] == f.facts["count"]


def test_sleep_debt():
    ctx = build_context("illness_onset", goals=[sleep_goal(450)], twin={})
    ctx.daily["resting_heart_rate"].clear()
    days = sorted(ctx.daily["sleep_total_min"])
    for d in days[-3:]:
        ctx.daily["sleep_total_min"][d] = ctx.daily["sleep_total_min"][d].model_copy(
            update={"sum": 360.0, "avg": 360.0})
    f = only(evaluate(ctx), "sleep_debt")
    out = explain(f, ctx)
    check_shape(out, "sleep_debt")
    c = out["comparisons"][0]
    assert (c["today"], c["baseline_or_threshold"], c["delta"]) == (360, 450, -90)
    assert {d["source"] for d in out["data_used"]} == {"wearable", "goal"}


def test_recovery():
    twin = {**BASE_TWIN, "status": "possibly_ill"}
    ctx = build_context("recovery", twin=twin)
    out = explain(only(evaluate(ctx), "recovery"), ctx)
    check_shape(out, "recovery")
    assert all(c["flagged"] is False for c in out["comparisons"])
    assert all(c["delta"] <= 3 for c in out["comparisons"])


def test_low_hr_states_no_beta_blocker():
    now = t("2026-10-14T18:30:00+00:00")
    ctx = build_context("beta_blocker", now=now)
    f = only(evaluate(ctx), "low_hr")
    out = explain(f, ctx)
    check_shape(out, "low_hr")
    assert out["comparisons"][0]["today"] == 36 and out["comparisons"][0]["baseline_or_threshold"] == 40
    assert out["twin_rules"] == ["No beta blocker on your record → low heart rate alerts are on"]


def test_explain_is_deterministic_and_does_not_change_finding():
    ctx = build_context("workout")
    f = only(evaluate(ctx), "workout_detected")
    before = dict(f.facts)
    assert explain(f, ctx) == explain(f, ctx)
    assert f.facts == before


def test_missing_facts_do_not_raise():
    ctx = RuleContext(now=datetime(2026, 10, 14, tzinfo=UTC))
    for kind in explain_kinds():
        out = explain(Finding(kind, "info", {}), ctx)
        assert out["rule"] == kind and out["summary"]
        assert all(c["flagged"] is False for c in out["comparisons"] if c["today"] is None)


def test_unknown_kind_is_generic():
    ctx = RuleContext(now=datetime(2026, 10, 14, tzinfo=UTC))
    out = explain(Finding("morning_briefing", "info", {}), ctx)
    assert out["rule"] == "morning_briefing" and out["comparisons"] == [] and out["data_used"] == []


# ---------------------------------------------------------------- endpoint

UID = UUID("00000000-0000-0000-0000-000000000001")
AID = UUID("00000000-0000-0000-0000-0000000000aa")
CREATED = datetime(2026, 10, 14, 21, 0, tzinfo=UTC)


class FakeConn:
    def __init__(self, alert, twin):
        self.alert, self.twin, self.queries = alert, twin, []

    async def execute(self, sql, params=()):
        self.queries.append((sql, params))
        row = None
        if "from alerts" in sql:
            row = self.alert if self.alert and params == (AID, UID) else None
        elif "from digital_twin" in sql:
            row = {"model": self.twin} if self.twin is not None else None
        return FakeCursor(row)


class FakeCursor:
    def __init__(self, row):
        self.row = row

    async def fetchone(self):
        return self.row


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(explain_api.router)
    app.dependency_overrides[require_internal] = lambda: None
    state = {"conn": FakeConn(None, None)}

    class Ctx:
        async def __aenter__(self):
            return state["conn"]

        async def __aexit__(self, *a):
            return False

    monkeypatch.setattr(explain_api.db, "neon", lambda: Ctx())
    return TestClient(app), state


def alert_row(payload):
    return {"kind": "high_bp", "severity": "warning", "payload": payload, "created_at": CREATED}


def test_endpoint_returns_stored_explain(client):
    c, state = client
    stored = {"rule": "high_bp", "summary": "Stored.", "comparisons": [], "twin_rules": [], "data_used": [],
              "watch_next": "Soon."}
    state["conn"] = FakeConn(alert_row({"facts": {}, "explain": stored}), None)
    r = c.get(f"/alerts/{AID}/explain", params={"user_id": str(UID)})
    assert r.status_code == 200 and r.json() == stored
    assert not any("digital_twin" in q for q, _ in state["conn"].queries)


def test_endpoint_rebuilds_for_older_alert_from_facts_and_twin(client):
    c, state = client
    facts = {"count": 3, "max_systolic": 152, "max_diastolic": 96, "threshold": [130, 80],
             "hypertension": True}
    state["conn"] = FakeConn(alert_row({"facts": facts}), HYPERTENSIVE_TWIN)
    r = c.get(f"/alerts/{AID}/explain", params={"user_id": str(UID)})
    body = r.json()
    assert r.status_code == 200 and body["rule"] == "high_bp" and body["estimated"] is True
    assert body["comparisons"][0]["today"] == 152
    assert body["twin_rules"] == ["Hypertension on your record → blood pressure alert at 130/80"]


def test_endpoint_handles_payload_without_facts_or_twin(client):
    c, state = client
    state["conn"] = FakeConn(alert_row(None), None)
    r = c.get(f"/alerts/{AID}/explain", params={"user_id": str(UID)})
    assert r.status_code == 200 and r.json()["rule"] == "high_bp"


def test_endpoint_scopes_to_user(client):
    c, state = client
    state["conn"] = FakeConn(alert_row({"facts": {}}), None)
    other = "00000000-0000-0000-0000-000000000002"
    assert c.get(f"/alerts/{AID}/explain", params={"user_id": other}).status_code == 404
    assert c.get(f"/alerts/{AID}/explain").status_code == 422
    assert c.get("/alerts/not-a-uuid/explain", params={"user_id": str(UID)}).status_code == 422
