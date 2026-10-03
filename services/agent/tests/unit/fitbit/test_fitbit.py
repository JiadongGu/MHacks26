import time

import httpx
import respx
from cryptography.fernet import Fernet

from app.core.config import settings
from app.integrations.fitbit import normalize, oauth
from app.integrations.fitbit.client import API, HealthClient
from app.integrations.fitbit.store import FileTokenStore


def _env(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("FITBIT_CLIENT_ID", "cid")
    monkeypatch.setenv("FITBIT_CLIENT_SECRET", "sec")
    monkeypatch.setenv("PUBLIC_AGENT_URL", "http://localhost:8000")
    settings.cache_clear()


def test_heart_rate_normalizer():
    points = [{"heartRate": {"sampleTime": {"physicalTime": "2026-10-03T12:00:00Z"}, "beatsPerMinute": "72"}}]
    (s,) = normalize.heart_rate_samples("u1", points)
    assert s["metric"] == "heart_rate" and s["value"] == 72.0
    assert s["ts"] == "2026-10-03T12:00:00+00:00" and s["source"] == "fitbit"


def test_steps_normalizer():
    rollup = {
        "rollupDataPoints": [
            {"civilStartTime": {"date": {"year": 2026, "month": 10, "day": 3}}, "steps": {"countSum": "9000"}}
        ]
    }
    (s,) = normalize.steps_samples("u1", rollup, "America/Detroit")
    assert s["metric"] == "steps" and s["value"] == 9000.0
    assert s["ts"] == "2026-10-03T23:59:00-04:00"


def test_authorize_url_uses_google_with_offline_access(monkeypatch):
    _env(monkeypatch)
    url = oauth.authorization_url("u1")
    assert url.startswith("https://accounts.google.com/")
    assert "access_type=offline" in url and "googlehealth.sleep.readonly" in url and "code_challenge=" in url


@respx.mock
def test_refresh_on_401(monkeypatch, tmp_path):
    _env(monkeypatch)
    store = FileTokenStore(str(tmp_path / "t.json"))
    store.save("u1", {"access_token": "old", "refresh_token": "r1", "expires_at": time.time() + 3600})
    respx.get(API + "/dataTypes/heart-rate/dataPoints").mock(
        side_effect=[httpx.Response(401), httpx.Response(200, json={"dataPoints": [{"x": 1}]})]
    )
    respx.post(oauth.TOKEN_URL).mock(
        return_value=httpx.Response(200, json={"access_token": "new", "expires_in": 3600})
    )
    assert HealthClient("u1", store).list_points("heart-rate", "f") == [{"x": 1}]
    row = store.load("u1")
    assert row["access_token"] == "new" and row["refresh_token"] == "r1"
