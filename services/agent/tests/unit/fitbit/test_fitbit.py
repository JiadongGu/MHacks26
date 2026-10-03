import time
from datetime import timedelta
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

    async def ingest(self, batch):
        self.calls.append(("ingest", batch.source, len(batch.samples)))
        return len(batch.samples)

    async def tz(self, _):
        return "America/Detroit"

    def fetch(self, row, uid, minutes, days, tz):
        self.calls.append(("fetch", minutes, days, tz))
        return IngestBatch(source="fitbit", samples=self.samples), self.new_row


def _wire(monkeypatch, rec):
    monkeypatch.setattr(sync.store, "load", rec.load)
    monkeypatch.setattr(sync.store, "save", rec.save)
    monkeypatch.setattr(sync.store, "mark_synced", rec.mark_synced)
    monkeypatch.setattr(sync, "ingest_batch", rec.ingest)
    monkeypatch.setattr(sync, "user_timezone", rec.tz)
    monkeypatch.setattr(sync, "_fetch", rec.fetch)


async def test_sync_user_saves_refreshed_token_then_ingests_then_marks_synced(monkeypatch):
    rec = Recorder(row={"x": 1}, new_row={"refreshed": True})
    _wire(monkeypatch, rec)
    assert await sync.sync_user(UID) == 1
    assert rec.calls == [
        ("fetch", 30, 2, "America/Detroit"),
        ("save", {"refreshed": True}),
        ("ingest", "fitbit", 1),
        ("mark_synced",),
    ]


async def test_sync_user_with_no_samples_still_marks_synced(monkeypatch):
    rec = Recorder(row={"x": 1}, samples=[])
    _wire(monkeypatch, rec)
    assert await sync.sync_user(UID) == 0
    assert rec.calls[1:] == [("ingest", "fitbit", 0), ("mark_synced",)]


async def test_sync_user_not_connected(monkeypatch):
    rec = Recorder(row=None)
    _wire(monkeypatch, rec)
    with pytest.raises(LookupError):
        await sync.sync_user(UID)


# Shapes below were recorded from the live Google Health API (Inspire 3).
RHR = {"dailyRestingHeartRate": {"date": {"year": 2026, "month": 10, "day": 3}, "beatsPerMinute": "60"}}
HRV = {
    "dailyHeartRateVariability": {
        "date": {"year": 2026, "month": 10, "day": 3},
        "averageHeartRateVariabilityMilliseconds": 95.6,
    }
}
SPO2 = {"oxygenSaturation": {"sampleTime": {"physicalTime": "2026-10-03T11:36:33Z"}, "percentage": 95}}
SLEEP = {
    "sleep": {
        "interval": {"startTime": "2026-10-03T06:01:00Z", "endTime": "2026-10-03T12:23:00Z"},
        "type": "STAGES",
        "summary": {
            "minutesAsleep": "361",
            "stagesSummary": [
                {"type": "AWAKE", "minutes": "21"},
                {"type": "LIGHT", "minutes": "201"},
                {"type": "DEEP", "minutes": "90"},
                {"type": "REM", "minutes": "70"},
            ],
        },
    }
}


def _active(start, **levels):
    by_level = [{"activityLevel": k.upper(), "activeMinutes": str(v)} for k, v in levels.items()]
    return {"activeMinutes": {"interval": {"startTime": start}, "activeMinutesByActivityLevel": by_level}}


def test_daily_normalizers_land_on_the_civil_day():
    (rhr,) = normalize.resting_hr_samples(UID, [RHR])
    assert (rhr.metric, rhr.value, rhr.unit) == ("resting_heart_rate", 60.0, "bpm")
    assert rhr.ts.isoformat() == "2026-10-03T12:00:00+00:00"
    (hrv,) = normalize.hrv_samples(UID, [HRV])
    assert (hrv.metric, hrv.value, hrv.meta) == ("hrv_sdnn", 95.6, {"measure": "rmssd"})


def test_spo2_normalizer():
    (s,) = normalize.spo2_samples(UID, [SPO2])
    assert (s.metric, s.value, s.unit, s.ts.isoformat()) == ("spo2", 95.0, "%", "2026-10-03T11:36:33+00:00")


def test_active_minutes_count_only_moderate_and_vigorous():
    pts = [
        _active("2026-10-03T18:00:00Z", light=1),
        _active("2026-10-03T18:01:00Z", moderate=1),
        _active("2026-10-03T18:02:00Z", light=1, vigorous=1),
    ]
    out = normalize.active_minutes_samples(UID, pts)
    assert [(s.ts.minute, s.value) for s in out] == [(1, 1.0), (2, 1.0)]


def test_sleep_session_becomes_total_and_stage_minutes_at_wake_time():
    out = {s.metric: s.value for s in normalize.sleep_samples(UID, [SLEEP])}
    assert out == {
        "sleep_total_min": 361.0,
        "sleep_core_min": 201.0,
        "sleep_deep_min": 90.0,
        "sleep_rem_min": 70.0,
        "sleep_awake_min": 21.0,
    }
    assert {s.ts.isoformat() for s in normalize.sleep_samples(UID, [SLEEP])} == {"2026-10-03T12:23:00+00:00"}


def test_sleep_falls_back_to_stage_intervals_without_a_summary():
    sleep = {
        "interval": {"endTime": "2026-10-03T12:00:00Z"},
        "stages": [
            {"type": "LIGHT", "startTime": "2026-10-03T08:00:00Z", "endTime": "2026-10-03T09:00:00Z"},
            {"type": "DEEP", "startTime": "2026-10-03T09:00:00Z", "endTime": "2026-10-03T09:30:00Z"},
            {"type": "AWAKE", "startTime": "2026-10-03T09:30:00Z", "endTime": "2026-10-03T09:40:00Z"},
        ],
    }
    out = {s.metric: s.value for s in normalize.sleep_samples(UID, [{"sleep": sleep}])}
    assert out["sleep_total_min"] == 90.0 and out["sleep_awake_min"] == 10.0 and "sleep_rem_min" not in out


@respx.mock
def test_client_asks_for_whole_civil_days_for_daily_types_and_sleep():
    from datetime import date

    daily = respx.get(API + "/dataTypes/daily-resting-heart-rate/dataPoints").mock(
        return_value=httpx.Response(200, json={"dataPoints": []})
    )
    sleep = respx.get(API + "/dataTypes/sleep/dataPoints").mock(return_value=httpx.Response(200, json={}))
    c = HealthClient({"access_token": "t", "refresh_token": "r", "expires_at": time.time() + 3600})
    c.daily("daily-resting-heart-rate", date(2026, 10, 2), date(2026, 10, 3))
    c.sleep(date(2026, 10, 2), date(2026, 10, 3))
    assert dict(daily.calls[0].request.url.params)["filter"] == (
        'daily_resting_heart_rate.date >= "2026-10-02" AND daily_resting_heart_rate.date < "2026-10-04"'
    )
    assert dict(sleep.calls[0].request.url.params)["filter"] == (
        'sleep.interval.civil_end_time >= "2026-10-02T00:00:00" '
        'AND sleep.interval.civil_end_time < "2026-10-04T00:00:00"'
    )


NOT_LINKED = {
    "error": {
        "code": 400,
        "message": "The account is not linked to Google Health.",
        "status": "FAILED_PRECONDITION",
        "details": [{"reason": "ACCOUNT_NOT_LINKED", "domain": "health.googleapis.com"}],
    }
}


def _client():
    return HealthClient({"access_token": "t", "refresh_token": "r", "expires_at": time.time() + 3600})


@respx.mock
def test_unlinked_google_account_raises_a_typed_error():
    from app.integrations.fitbit.client import AccountNotLinked

    respx.get(API + "/dataTypes/heart-rate/dataPoints").mock(
        return_value=httpx.Response(400, json=NOT_LINKED)
    )
    with pytest.raises(AccountNotLinked):
        _client().list_points("heart-rate", "f")


@respx.mock
def test_other_client_errors_still_raise_http_status_error():
    other = {"error": {"message": "bad filter", "details": [{"reason": "INVALID_DATA_POINT_FILTER"}]}}
    respx.get(API + "/dataTypes/heart-rate/dataPoints").mock(return_value=httpx.Response(400, json=other))
    with pytest.raises(httpx.HTTPStatusError):
        _client().list_points("heart-rate", "f")


class CallbackFakes:
    def __init__(self, backfill_error=None):
        self.backfill_error, self.deleted, self.saved = backfill_error, [], []

    def complete(self, code, state):
        return str(UID), {"access_token": "a", "refresh_token": "r", "expires_at": 0, "scopes": []}

    async def save(self, user_id, row):
        self.saved.append(user_id)

    async def delete(self, user_id):
        self.deleted.append(user_id)

    async def sync_user(self, user_id, minutes, days):
        if self.backfill_error:
            raise self.backfill_error
        return 3


def _callback(monkeypatch, fakes):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.integrations.fitbit import router as fr

    monkeypatch.setattr(fr.oauth, "complete", fakes.complete)
    monkeypatch.setattr(fr.store, "save", fakes.save)
    monkeypatch.setattr(fr.store, "delete", fakes.delete)
    monkeypatch.setattr(fr.sync, "sync_user", fakes.sync_user)
    app = FastAPI()
    app.include_router(fr.public)
    r = TestClient(app).get("/integrations/fitbit/callback?code=c&state=s", follow_redirects=False)
    return r.headers["location"].split("/settings")[1]


def test_callback_reports_an_unlinked_account_and_removes_the_unusable_connection(monkeypatch):
    from app.integrations.fitbit.client import AccountNotLinked

    fakes = CallbackFakes(AccountNotLinked("x"))
    assert _callback(monkeypatch, fakes) == "?fitbit=notlinked"
    assert fakes.deleted == [UID]


def test_callback_keeps_the_connection_when_the_backfill_fails_for_another_reason(monkeypatch):
    fakes = CallbackFakes(RuntimeError("boom"))
    assert _callback(monkeypatch, fakes) == "?fitbit=connected"
    assert fakes.deleted == []


def test_callback_success(monkeypatch):
    fakes = CallbackFakes()
    assert _callback(monkeypatch, fakes) == "?fitbit=connected"
    assert fakes.saved == [UID] and fakes.deleted == []


def test_steps_and_active_minutes_cover_whole_local_days_but_heart_rate_stays_short(monkeypatch):
    from datetime import UTC, datetime
    from zoneinfo import ZoneInfo

    calls = {}

    class FakeClient:
        refreshed = False
        row = {}

        def __init__(self, row):
            pass

        def _rec(self, name):
            def f(start, end):
                calls[name] = (start, end)
                return []

            return f

        def __getattr__(self, name):
            if name in ("heart_rate", "steps", "spo2", "active_minutes"):
                return self._rec(name)
            return lambda *a, **k: []

    monkeypatch.setattr(sync, "HealthClient", FakeClient)
    sync._fetch({}, UID, 30, 2, "America/Detroit")
    now_local = datetime.now(UTC).astimezone(ZoneInfo("America/Detroit"))
    local_midnight_yesterday = (now_local - timedelta(days=1)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    for name in ("steps", "active_minutes"):
        start, end = calls[name]
        assert start == local_midnight_yesterday and (end - start) > timedelta(hours=24)
    for name in ("heart_rate", "spo2"):
        start, end = calls[name]
        assert end - start == timedelta(minutes=30)
