from uuid import UUID

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.agents import compass
from app.core.config import settings
from app.demo import router as demo
from app.main import app

USER = UUID("00000000-0000-0000-0000-000000000001")
HEADERS = {"X-Internal-Token": "dev-internal-token"}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PUBLIC_AGENT_URL", "http://agent.test")
    settings.cache_clear()
    yield
    settings.cache_clear()


@pytest.fixture
def briefing_calls(monkeypatch):
    calls = []

    async def run_briefing(user_id, force=False):
        calls.append((user_id, force))
        return True

    monkeypatch.setattr(compass, "run_briefing", run_briefing)
    return calls


@pytest.fixture
def sim_calls(monkeypatch):
    calls = []

    async def activate(user_id, scenario, fast_forward_min=None):
        calls.append((user_id, scenario, fast_forward_min))
        return 30

    monkeypatch.setattr(demo.engine, "activate", activate)
    return calls


async def test_scenario_calls_simulator_in_process(sim_calls):
    body = demo.ScenarioRequest(user_id=USER, scenario="illness_onset", fast_forward_min=30)
    out = await demo.forward_scenario(body)
    assert out == {"forwarded": True, "upstream": {"scenario": "illness_onset", "emitted": 30}}
    assert sim_calls == [(USER, "illness_onset", 30)]


async def test_great_sleep_forces_briefing(sim_calls, briefing_calls):
    out = await demo.scenario(demo.ScenarioRequest(user_id=USER, scenario="great_sleep"))
    assert out["forwarded"] is True and out["briefing"] is True and briefing_calls == [(USER, True)]


async def test_other_scenarios_do_not_force_briefing(sim_calls, briefing_calls):
    out = await demo.scenario(demo.ScenarioRequest(user_id=USER, scenario="workout_now"))
    assert "briefing" not in out and briefing_calls == []


async def test_simulator_errors_become_502(monkeypatch):
    async def boom(*_a, **_k):
        raise RuntimeError("down")

    monkeypatch.setattr(demo.engine, "activate", boom)
    with pytest.raises(HTTPException) as e:
        await demo.forward_scenario(demo.ScenarioRequest(user_id=USER, scenario="normal"))
    assert e.value.status_code == 502


def test_endpoints_require_internal_token_and_validate(briefing_calls, monkeypatch):
    async def run_rebuild(user_id, force=False):
        return True

    monkeypatch.setattr(compass, "run_rebuild", run_rebuild)
    c = TestClient(app)
    assert c.post(f"/demo/briefing?user_id={USER}").status_code == 401
    assert c.post(f"/demo/briefing?user_id={USER}", headers=HEADERS).json() == {"ran": True}
    assert briefing_calls == [(USER, True)]
    assert c.post(f"/demo/rebuild?user_id={USER}", headers=HEADERS).json() == {"ran": True}
    assert c.post("/demo/briefing?user_id=not-a-uuid", headers=HEADERS).status_code == 422
    assert c.post("/demo/scenario", headers=HEADERS,
                  json={"user_id": str(USER), "scenario": "bogus"}).status_code == 422


async def test_evening_endpoint_forces_the_evening_job(monkeypatch):
    calls = []

    async def run_evening(user_id, force=False):
        calls.append((user_id, force))
        return True

    monkeypatch.setattr(compass, "run_evening", run_evening)
    assert await demo.evening(USER) == {"ran": True}
    assert calls == [(USER, True)]


def test_reset_calls_compass(monkeypatch):
    calls = []

    async def reset_demo(user_id):
        calls.append(user_id)
        return {"proposals_expired": 1, "alerts_cleared": 3}

    monkeypatch.setattr(compass, "reset_demo", reset_demo)
    with TestClient(app) as c:
        r = c.post(f"/demo/reset?user_id={USER}", headers=HEADERS)
        assert c.post(f"/demo/reset?user_id={USER}").status_code == 401
    assert r.status_code == 200
    assert r.json() == {"proposals_expired": 1, "alerts_cleared": 3}
    assert calls == [USER]
