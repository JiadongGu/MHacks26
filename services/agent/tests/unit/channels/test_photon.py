import httpx
import pytest
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.channels import photon, photon_api
from app.core.config import settings

URL = f"{photon.BASE_URL}/projects/proj-1/users/"
HEADERS = {"X-Internal-Token": "dev-internal-token"}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("SPECTRUM_PROJECT_ID", "proj-1")
    monkeypatch.setenv("SPECTRUM_PROJECT_SECRET", "s3cret")
    settings.cache_clear()
    yield
    settings.cache_clear()


def ok(line="+14156035536"):
    return httpx.Response(200, json={"succeed": True, "data": {"assignedPhoneNumber": line}})


def test_clean_phone_strips_formatting():
    assert photon.clean_phone("+1 (858) 866-6676") == "+18588666676"
    assert photon.clean_phone("") == ""


@respx.mock
async def test_register_posts_a_shared_user_with_basic_auth_and_returns_the_assigned_line():
    route = respx.post(URL).mock(return_value=ok())
    line = await photon.register_user("+1 858 866 6676", "Gavin", "g@example.com")
    assert line == "+14156035536"
    req = route.calls[0].request
    assert req.headers["authorization"].startswith("Basic ")
    import json

    assert json.loads(req.read()) == {
        "type": "shared",
        "phoneNumber": "+18588666676",
        "firstName": "Gavin",
        "email": "g@example.com",
    }


async def test_register_rejects_a_bad_number_and_a_missing_config(monkeypatch):
    with pytest.raises(ValueError):
        await photon.register_user("8588666676")
    monkeypatch.setenv("SPECTRUM_PROJECT_SECRET", "")
    settings.cache_clear()
    with pytest.raises(photon.NotConfigured):
        await photon.register_user("+18588666676")


@respx.mock
async def test_register_maps_a_full_project_and_other_failures():
    respx.post(URL).mock(return_value=httpx.Response(403, json={"error": "maxSharedUsers reached"}))
    with pytest.raises(photon.LineFull):
        await photon.register_user("+18588666676")
    respx.post(URL).mock(return_value=httpx.Response(500))
    with pytest.raises(photon.PhotonError):
        await photon.register_user("+18588666676")
    respx.post(URL).mock(return_value=httpx.Response(200, json={"data": {}}))
    with pytest.raises(photon.PhotonError):
        await photon.register_user("+18588666676")


@pytest.fixture
def client(monkeypatch):
    app = FastAPI()
    app.include_router(photon_api.router)
    saved = {}

    async def profile(user_id):
        return {"display_name": "Gavin Mordhorst", "phone_e164": saved.get("phone")}

    monkeypatch.setattr(photon_api, "_profile", profile)
    return TestClient(app)


def test_the_line_endpoint_needs_the_internal_token_and_a_phone(client):
    body = {"user_id": "00000000-0000-0000-0000-000000000001"}
    assert client.post("/channels/imessage/line", json=body).status_code == 401
    assert client.post("/channels/imessage/line", json=body, headers=HEADERS).status_code == 422


@respx.mock
def test_the_line_endpoint_returns_the_assigned_number(client, monkeypatch):
    class Conn:
        async def execute(self, *a, **k):
            return None

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

    monkeypatch.setattr(photon_api.db, "neon", lambda: Conn())
    respx.post(URL).mock(return_value=ok("+14156035536"))
    body = {"user_id": "00000000-0000-0000-0000-000000000001", "phone": "+1 858 866 6676"}
    r = client.post("/channels/imessage/line", json=body, headers=HEADERS)
    assert r.status_code == 200 and r.json() == {"line": "+14156035536", "phone": "+18588666676"}
