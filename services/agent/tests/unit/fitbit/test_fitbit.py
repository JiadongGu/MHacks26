import time
from uuid import UUID

import httpx
import pytest
import respx
from cryptography.fernet import Fernet

from app.contracts import IngestBatch
from app.core.config import settings
from app.integrations.fitbit import normalize, oauth, sync
from app.integrations.fitbit.client import API, HealthClient

UID = UUID("00000000-0000-0000-0000-000000000001")


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("FITBIT_CLIENT_ID", "cid")
    monkeypatch.setenv("FITBIT_CLIENT_SECRET", "sec")
    settings.cache_clear()
    yield
    settings.cache_clear()


HR = {"heartRate": {"sampleTime": {"physicalTime": "2026-10-03T12:00:00Z"}, "beatsPerMinute": "72"}}
STEPS = {"steps": {"interval": {"startTime": "2026-10-03T18:23:00Z"}, "count": "8"}}


def test_normalizers():
    (hr,) = normalize.heart_rate_samples(UID, [HR])
    assert (hr.metric, hr.value, hr.unit, hr.source) == ("heart_rate", 72.0, "bpm", "fitbit")
    (st,) = normalize.steps_samples(UID, [STEPS])
    assert (st.metric, st.value, st.ts.isoformat()) == ("steps", 8.0, "2026-10-03T18:23:00+00:00")


def test_spacetime_rows_use_epoch_ms():
    batch = IngestBatch(source="fitbit", samples=normalize.heart_rate_samples(UID, [HR]))
    (row,) = sync.spacetime_rows(batch)
    assert row == {
        "user_id": str(UID), "metric": "heart_rate", "value": 72.0, "unit": "bpm",
        "source": "fitbit", "ts_ms": 1791028800000, "meta_json": "",
    }


def test_authorize_url_is_google_offline_with_chooser(monkeypatch):
    url = oauth.authorization_url(str(UID))
    assert url.startswith("https://accounts.google.com/")
    assert "access_type=offline" in url and "select_account" in url
    assert "googlehealth.sleep.readonly" in url and "code_challenge=" in url


@respx.mock
def test_client_refreshes_once_on_401():
    respx.get(API + "/dataTypes/heart-rate/dataPoints").mock(
        side_effect=[httpx.Response(401), httpx.Response(200, json={"dataPoints": [{"x": 1}]})]
    )
    token = {"access_token": "new", "expires_in": 3600}
    respx.post(oauth.TOKEN_URL).mock(return_value=httpx.Response(200, json=token))
    c = HealthClient({"access_token": "old", "refresh_token": "r1", "expires_at": time.time() + 3600})
    assert c.list_points("heart-rate", "f") == [{"x": 1}]
    assert c.refreshed and c.row["access_token"] == "new" and c.row["refresh_token"] == "r1"


class Recorder:
    def __init__(self, row, new_row=None, samples=None):
        self.row, self.new_row, self.calls = row, new_row, []
        self.samples = samples if samples is not None else normalize.heart_rate_samples(UID, [HR])

    async def load(self, _):
        return self.row

    async def save(self, uid, row):
        self.calls.append(("save", row))

    async def mark_synced(self, _):
        self.calls.append(("mark_synced",))

    async def call(self, reducer, args):
        self.calls.append(("call", reducer, args))

    async def hook(self, uid, metrics):
        self.calls.append(("hook", metrics))

    def fetch(self, row, uid, minutes):
        return IngestBatch(source="fitbit", samples=self.samples), self.new_row


def _wire(monkeypatch, rec):
    monkeypatch.setattr(sync.store, "load", rec.load)
    monkeypatch.setattr(sync.store, "save", rec.save)
    monkeypatch.setattr(sync.store, "mark_synced", rec.mark_synced)
    monkeypatch.setattr(sync.spacetime, "call", rec.call)
    monkeypatch.setattr(sync, "on_samples_ingested", rec.hook)
    monkeypatch.setattr(sync, "_fetch", rec.fetch)


async def test_sync_user_ingests_marks_and_notifies(monkeypatch):
    rec = Recorder(row={"x": 1}, new_row={"refreshed": True})
    _wire(monkeypatch, rec)
    assert await sync.sync_user(UID) == 1
    kinds = [c[0] for c in rec.calls]
    assert kinds == ["save", "call", "mark_synced", "hook"]
    assert rec.calls[0][1] == {"refreshed": True}
    assert rec.calls[1][1] == "ingest" and len(rec.calls[1][2][0]) == 1
    assert rec.calls[3] == ("hook", ["heart_rate"])


async def test_sync_user_with_no_samples_skips_ingest_and_hook(monkeypatch):
    rec = Recorder(row={"x": 1}, samples=[])
    _wire(monkeypatch, rec)
    assert await sync.sync_user(UID) == 0
    assert rec.calls == [("mark_synced",)]


async def test_sync_user_not_connected(monkeypatch):
    rec = Recorder(row=None)
    _wire(monkeypatch, rec)
    with pytest.raises(LookupError):
        await sync.sync_user(UID)
