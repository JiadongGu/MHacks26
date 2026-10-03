from uuid import UUID

import httpx
import pytest
import respx
from fastapi.testclient import TestClient

from app.agents import compass
from app.core.config import settings
from app.demo import router as demo
from app.main import app

USER = UUID("00000000-0000-0000-0000-000000000001")
HEADERS = {"X-Internal-Token": "dev-internal-token"}
SIM = "http://agent.test/sim/scenario"


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


@respx.mock
async def test_forward_sends_token_and_body():
    route = respx.post(SIM).mock(return_value=httpx.Response(200, json={"ok": True}))
    body = demo.ScenarioRequest(user_id=USER, scenario="illness_onset", fast_forward_min=30)
    out = await demo.forward_scenario(body)
    assert out == {"forwarded": True, "upstream": {"ok": True}}
    req = route.calls[0].request
    assert req.headers["x-internal-token"] == "dev-internal-token"
    assert b'"illness_onset"' in req.content and b'"fast_forward_min":30' in req.content.replace(b" ", b"")


@respx.mock
async def test_forward_tolerates_404():
    respx.post(SIM).mock(return_value=httpx.Response(404))
    body = demo.ScenarioRequest(user_id=USER, scenario="normal")
    assert await demo.forward_scenario(body) == {"forwarded": False}


@respx.mock
async def test_great_sleep_forces_briefing(briefing_calls):
    respx.post(SIM).mock(return_value=httpx.Response(200, json={}))
    out = await demo.scenario(demo.ScenarioRequest(user_id=USER, scenario="great_sleep"))
    assert out["forwarded"] is True and out["briefing"] is True
    assert briefing_calls == [(USER, True)]


@respx.mock
async def test_other_scenarios_do_not_force_briefing(briefing_calls):
    respx.post(SIM).mock(return_value=httpx.Response(200, json={}))
    await demo.scenario(demo.ScenarioRequest(user_id=USER, scenario="low_spo2"))
    assert briefing_calls == []


@respx.mock
async def test_great_sleep_still_briefs_when_simulator_missing(briefing_calls):
    respx.post(SIM).mock(return_value=httpx.Response(404))
    out = await demo.scenario(demo.ScenarioRequest(user_id=USER, scenario="great_sleep"))
    assert out["forwarded"] is False and briefing_calls == [(USER, True)]


@respx.mock
async def test_simulator_errors_become_502():
    respx.post(SIM).mock(return_value=httpx.Response(500))
    with pytest.raises(demo.HTTPException) as e:
        await demo.forward_scenario(demo.ScenarioRequest(user_id=USER, scenario="normal"))
    assert e.value.status_code == 502
    respx.post(SIM).mock(side_effect=httpx.ConnectError("down"))
    with pytest.raises(demo.HTTPException) as e:
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
