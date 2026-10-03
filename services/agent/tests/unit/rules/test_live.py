from datetime import UTC, date, datetime, time
from uuid import UUID

import pytest

from app.agents import live
from app.core.config import settings
from tests.unit.rules.helpers import USER_ID, build_context, event_in, steps_goal

NOW = datetime(2026, 10, 14, 22, 30, tzinfo=UTC)  # 18:30 in Detroit


def test_assemble_builds_context_from_rows():
    ctx, summary = live.assemble(
        NOW, USER_ID,
        profile={"timezone": "America/Detroit", "wake_time": time(6, 30), "bed_time": "22:15:00"},
        twin_row={"model": {"baselines": {"resting_hr": 62}}, "summary": "Active adult."},
        goal_rows=[
            {"id": UUID(int=1), "metric": "steps", "target": 10000.0, "period": "day",
             "direction": "at_least", "active": True},
            {"id": UUID(int=2), "metric": "not_a_metric", "target": 1.0, "period": "day",
             "direction": "at_least", "active": True},
        ],
        series_rows=[
            {"metric": "heart_rate", "ts": NOW, "v": 80.0},
            {"metric": "heart_rate", "ts": NOW.replace(minute=0), "v": 70.0},
        ],
        daily_rows=[{"day": date(2026, 10, 14), "metric": "steps", "avg": 100.0, "min": 0.0, "max": 300.0,
                     "sum": 3900.0, "n": 39}],
        event_rows=[{"event_id": "e1", "title": "Demo", "starts_at": NOW, "ends_at": NOW}],
        alert_rows=[{"kind": "workout_detected", "created_at": NOW}],
    )
    assert ctx.tz == "America/Detroit"
    assert (ctx.wake_time, ctx.bed_time) == (time(6, 30), time(22, 15))
    assert [g.metric for g in ctx.goals] == ["steps"]
    assert [v for _, v in ctx.series["heart_rate"]] == [70.0, 80.0]
    assert ctx.daily["steps"][date(2026, 10, 14)].sum == 3900.0
    assert ctx.events[0].is_important
    assert ctx.recent_alerts == [("workout_detected", NOW)]
    assert summary == "Active adult. Goals: steps at_least 10000/day"


def test_assemble_defaults_without_rows():
    ctx, summary = live.assemble(NOW, USER_ID, None, None, [], [], [], [], [])
    assert ctx.tz == "UTC" and ctx.twin == {} and summary == ""


def test_assemble_bad_timezone_falls_back_to_utc():
    ctx, _ = live.assemble(NOW, USER_ID, {"timezone": "Mars/Base"}, None, [], [], [], [], [])
    assert ctx.tz == "UTC"


@pytest.fixture
def pipeline(monkeypatch):
    monkeypatch.setenv("LLM_FAKE", "true")
    settings.cache_clear()
    rec: dict = {"persisted": [], "dispatched": [], "ctx": None}

    async def load(user_id, now):
        return rec["ctx"], "Summary"

    async def persist(user_id, finding, title, body):
        rec["persisted"].append((finding, title, body))
        return {"id": UUID(int=len(rec["persisted"])), "kind": finding.kind, "severity": finding.severity,
                "title": title, "body": body, "proposal_id": None}

    async def dispatch(user_id, alert_row):
        rec["dispatched"].append(alert_row)
        return ["web"]

    monkeypatch.setattr(live, "_load", load)
    monkeypatch.setattr(live, "_persist", persist)
    monkeypatch.setattr(live.notify, "dispatch", dispatch)
    yield rec
    settings.cache_clear()


async def test_evaluate_user_persists_and_dispatches(pipeline):
    pipeline["ctx"] = build_context("workout")
    assert await live.evaluate_user(USER_ID) == 1
    finding, title, body = pipeline["persisted"][0]
    assert (finding.kind, title) == ("workout_detected", "Workout detected")
    assert "166" in body
    assert pipeline["dispatched"][0]["kind"] == "workout_detected"


async def test_evaluate_user_with_proposal_finding(pipeline):
    now = datetime(2026, 10, 14, 13, 0, tzinfo=UTC)
    twin = {"baselines": {"resting_hr": 62, "hrv_sdnn": 48}}
    pipeline["ctx"] = build_context("illness_onset", twin=twin, events=[event_in(now, 30)],
                                    goals=[steps_goal()])
    await live.evaluate_user(USER_ID)
    finding = pipeline["persisted"][0][0]
    assert finding.kind == "illness_onset" and finding.proposal is not None
    assert live.TWIN_STATUS[finding.kind] == "possibly_ill"


async def test_on_samples_ingested_never_raises(monkeypatch):
    async def boom(user_id, now=None):
        raise RuntimeError("db down")

    monkeypatch.setattr(live, "evaluate_user", boom)
    await live.on_samples_ingested(USER_ID, ["heart_rate"])


async def test_on_samples_ingested_skips_irrelevant_metrics(monkeypatch):
    called = []

    async def spy(user_id, now=None):
        called.append(user_id)
        return 0

    monkeypatch.setattr(live, "evaluate_user", spy)
    await live.on_samples_ingested(USER_ID, ["weight_kg"])
    assert called == []
    await live.on_samples_ingested(USER_ID, ["weight_kg", "spo2"])
    await live.on_samples_ingested(USER_ID, [])
    assert called == [USER_ID, USER_ID]


async def test_sweep_all_never_raises_without_db():
    await live.sweep_all()
