from datetime import UTC, date, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

import pytest

from app.contracts import DailySummary
from app.ingest.hae import parse_hae
from app.integrations.apple_sim import engine
from app.integrations.apple_sim.persona import Baselines, daily_values, minute_values
from app.rules import RuleContext, evaluate

UID = UUID("00000000-0000-0000-0000-000000000001")
SEED = str(UID)
TZ = "America/Detroit"
NOW = datetime(2026, 10, 3, 18, 0, tzinfo=UTC)  # 14:00 local, awake
BASE = Baselines()
TWIN = {"baselines": {"resting_hr": 60, "hrv_sdnn": 55, "sleep_min": 450}}


def minutes(start, end):
    t, out = start, []
    while t <= end:
        out.append(t)
        t += timedelta(minutes=1)
    return out


def series(scenario, started, back_min=190):
    out = {"heart_rate": [], "steps": [], "spo2": []}
    for t in minutes(NOW - timedelta(minutes=back_min), NOW):
        v = minute_values(SEED, BASE, scenario, t, TZ, started)
        out["heart_rate"].append((t, v["heart_rate"]["Avg"]))
        out["steps"].append((t, float(v["step_count"])))
        out["spo2"].append((t, v["blood_oxygen_saturation"]))
    return out


def kinds(scenario, started, **kw):
    ctx = RuleContext(now=NOW, tz=TZ, twin=TWIN, series=series(scenario, started), **kw)
    return {f.kind for f in evaluate(ctx)}


def daily_rows(scenario):
    today = NOW.astimezone(ZoneInfo(TZ)).date()
    out = {}
    for back in range(7):
        day = today - timedelta(days=back)
        for key, metric in (
            ("resting_heart_rate", "resting_heart_rate"),
            ("heart_rate_variability", "hrv_sdnn"),
            ("sleep_minutes", "sleep_total_min"),
        ):
            v = daily_values(SEED, BASE, scenario, day, back == 0)[key]
            out.setdefault(metric, {})[day] = DailySummary(
                user_id=UID, day=day, metric=metric, avg=v, min=v, max=v, sum=v, n=1
            )
    return out


def test_deterministic():
    t = NOW - timedelta(minutes=5)
    a = minute_values(SEED, BASE, "normal", t, TZ, NOW)
    assert a == minute_values(SEED, BASE, "normal", t, TZ, NOW)
    assert a != minute_values("other-user", BASE, "normal", t, TZ, NOW)


def test_normal_day_is_quiet():
    assert kinds("normal", NOW) == set()


def test_workout_now_triggers_workout_rule_once_fast_forwarded():
    assert "workout_detected" in kinds("workout_now", NOW - timedelta(minutes=14))


def test_workout_now_not_yet_after_two_minutes():
    assert "workout_detected" not in kinds("workout_now", NOW - timedelta(minutes=2))


def test_workout_hr_returns_toward_resting_afterwards():
    started = NOW - timedelta(minutes=60)
    late = minute_values(SEED, BASE, "workout_now", NOW, TZ, started)["heart_rate"]["Avg"]
    assert late < 90


def test_low_spo2_triggers():
    assert "low_spo2" in kinds("low_spo2", NOW - timedelta(minutes=3))


def test_sedentary_day_triggers_inactivity():
    assert "inactivity" in kinds("sedentary_day", NOW - timedelta(minutes=190))


def test_illness_onset_triggers_with_sleep_and_rhr_from_daily_values():
    ctx = RuleContext(now=NOW, tz=TZ, twin=TWIN, daily=daily_rows("illness_onset"))
    assert "illness_onset" in {f.kind for f in evaluate(ctx)}
    assert "illness_onset" not in {
        f.kind for f in evaluate(RuleContext(now=NOW, tz=TZ, twin=TWIN, daily=daily_rows("normal")))
    }


def test_great_sleep_values():
    v = daily_values(SEED, BASE, "great_sleep", date(2026, 10, 3), True)
    assert v["sleep_minutes"] == 510 and v["resting_heart_rate"] < BASE.resting_hr


def test_scenario_only_applies_from_start():
    before = minute_values(SEED, BASE, "low_spo2", NOW - timedelta(minutes=10), TZ, NOW)
    assert before["blood_oxygen_saturation"] >= 94


def test_hae_roundtrip_has_every_metric_the_rules_read():
    state = engine.SimState("normal", NOW, TZ, BASE)
    today = NOW.astimezone(ZoneInfo(TZ)).date()
    payload = engine.build_hae(UID, state, minutes(NOW - timedelta(minutes=2), NOW), [today], NOW)
    batch = parse_hae(payload, UID, engine.SOURCE)
    got = {s.metric for s in batch.samples}
    assert {
        "heart_rate",
        "steps",
        "spo2",
        "respiratory_rate",
        "resting_heart_rate",
        "hrv_sdnn",
        "sleep_total_min",
    } <= got
    assert batch.source == "apple_watch_sim"


class Emitted:
    def __init__(self):
        self.batches = []

    async def ingest(self, batch):
        self.batches.append(batch)
        return len(batch.samples)


@pytest.fixture
def emitted(monkeypatch):
    e = Emitted()
    monkeypatch.setattr(engine, "ingest_batch", e.ingest)

    async def tz(_):
        return TZ

    async def base(_):
        return BASE

    monkeypatch.setattr(engine, "user_timezone", tz)
    monkeypatch.setattr(engine, "baselines", base)
    monkeypatch.setattr(
        engine, "datetime", type("D", (datetime,), {"now": classmethod(lambda cls, tz=None: NOW)})
    )
    engine._states.clear()
    yield e
    engine._states.clear()


async def test_first_activation_backfills_history_and_a_week_of_daily_values(emitted):
    await engine.activate(UID, "normal", 0)
    (batch,) = emitted.batches
    hr = [s for s in batch.samples if s.metric == "heart_rate"]
    assert len(hr) == 241  # 240 minutes of history plus the current minute
    sleep_days = {
        s.ts.astimezone(ZoneInfo(TZ)).date() for s in batch.samples if s.metric == "sleep_total_min"
    }
    assert len(sleep_days) == 7


async def test_switching_scenario_emits_only_its_window_and_today(emitted):
    await engine.activate(UID, "normal", 0)
    emitted.batches.clear()
    await engine.activate(UID, "workout_now", None)  # default fast-forward is 14 minutes
    (batch,) = emitted.batches
    assert len([s for s in batch.samples if s.metric == "heart_rate"]) == 15
    assert len([s for s in batch.samples if s.metric == "sleep_total_min"]) == 1


async def test_tick_emits_new_minutes_once(emitted, monkeypatch):
    await engine.activate(UID, "normal", 0)
    emitted.batches.clear()
    await engine.tick()  # same minute as activation: nothing new
    assert emitted.batches == []
    later = NOW + timedelta(minutes=3)
    monkeypatch.setattr(
        engine, "datetime", type("D", (datetime,), {"now": classmethod(lambda cls, tz=None: later)})
    )
    await engine.tick()
    (batch,) = emitted.batches
    assert sorted({s.ts for s in batch.samples if s.metric == "heart_rate"}) == minutes(
        NOW + timedelta(minutes=1), later
    )
    assert not [s for s in batch.samples if s.metric == "sleep_total_min"]  # daily values only once a day


def test_effective_fast_forward_bounds():
    ff = engine.effective_fast_forward
    assert [ff("workout_now", v) for v in (None, 3, 14, 30)] == [14, 12, 14, 18]
    assert [ff("sedentary_day", v) for v in (None, 30, 300)] == [190, 190, 300]
    assert ff("low_spo2", 30) == 30 and ff("normal", None) == 0 and ff("normal", -5) == 0


@pytest.mark.parametrize(
    ("scenario", "rule"),
    [("workout_now", "workout_detected"), ("sedentary_day", "inactivity"), ("low_spo2", "low_spo2")],
)
def test_the_web_demo_panels_fixed_30_minutes_still_triggers_each_rule(scenario, rule):
    ff = engine.effective_fast_forward(scenario, 30)
    assert rule in kinds(scenario, NOW - timedelta(minutes=ff))


@pytest.mark.parametrize("path", ["/sim/scenario"])
def test_demo_and_sim_routes_share_one_handler(monkeypatch, path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.core.auth import require_internal
    from app.integrations.apple_sim import router as sim_router

    calls = []

    async def fake_activate(user_id, scenario, ff):
        calls.append((user_id, scenario, ff))
        return 7

    monkeypatch.setattr(sim_router.engine, "activate", fake_activate)
    app = FastAPI()
    app.include_router(sim_router.router)
    app.dependency_overrides[require_internal] = lambda: None
    body = {"user_id": str(UID), "scenario": "workout_now", "fast_forward_min": 30}
    r = TestClient(app).post(path, json=body)
    assert r.status_code == 200 and r.json()["emitted"] == 7
    assert calls == [(UID, "workout_now", 30)]
