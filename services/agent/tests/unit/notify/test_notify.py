import json
from datetime import UTC, datetime
from uuid import UUID

import httpx
import pytest
import respx

import app.notify as notify
from app.core.config import settings
from app.notify import NotifyState, build_text, in_quiet_hours

USER = UUID("00000000-0000-0000-0000-000000000001")
ALERT_ID = UUID(int=42)
QUIET = {"start": "22:30", "end": "07:00"}
TZ = "America/Detroit"


def utc(s: str) -> datetime:
    return datetime.fromisoformat(s).astimezone(UTC)


def alert(severity="nudge", proposal_id=None):
    return {"id": ALERT_ID, "kind": "workout_detected", "severity": severity, "title": "Workout detected",
            "body": "Nice workout!", "proposal_id": proposal_id}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("GATEWAY_URL", "http://gateway.test")
    monkeypatch.setenv("GATEWAY_SECRET", "s3cret")
    settings.cache_clear()
    yield
    settings.cache_clear()


@pytest.fixture
def store(monkeypatch):
    rec = {"persist": [], "state": NotifyState(tz=TZ, quiet_hours=QUIET, imessage_to="+15551234567")}

    async def load(user_id, proposal_id):
        return rec["state"]

    async def persist(user_id, alert_id, channels, text):
        rec["persist"].append((alert_id, channels, text))

    monkeypatch.setattr(notify, "_load_state", load)
    monkeypatch.setattr(notify, "_persist", persist)
    monkeypatch.setattr(notify, "_now", lambda: rec["now"])
    rec["now"] = utc("2026-10-14T18:00:00+00:00")  # 14:00 local
    return rec


def test_quiet_hours_wrap_midnight():
    # 22:30-07:00 in Detroit (UTC-4 in October)
    assert in_quiet_hours(utc("2026-10-15T03:00:00+00:00"), TZ, QUIET)  # 23:00 local
    assert in_quiet_hours(utc("2026-10-15T09:00:00+00:00"), TZ, QUIET)  # 05:00 local
    assert not in_quiet_hours(utc("2026-10-15T11:00:00+00:00"), TZ, QUIET)  # 07:00 local
    assert not in_quiet_hours(utc("2026-10-14T18:00:00+00:00"), TZ, QUIET)  # 14:00 local


def test_quiet_hours_same_day_and_missing():
    q = {"start": "13:00", "end": "15:00"}
    assert in_quiet_hours(utc("2026-10-14T18:00:00+00:00"), TZ, q)
    assert not in_quiet_hours(utc("2026-10-14T18:00:00+00:00"), TZ, None)
    assert not in_quiet_hours(utc("2026-10-14T18:00:00+00:00"), TZ, {"start": "bad", "end": "07:00"})


def test_build_text_adds_hint_only_for_pending_proposal():
    assert build_text(alert(), NotifyState()) == "Nice workout!"
    text = build_text(alert(), NotifyState(proposal_pending=True, proposal_title="Sleep block (Pulse)"))
    assert text.startswith("Nice workout!")
    assert "Reply YES to approve" in text and "Sleep block (Pulse)" in text


@respx.mock
async def test_sends_imessage_and_records(store):
    route = respx.post("http://gateway.test/send").mock(return_value=httpx.Response(200, json={"ok": True}))
    channels = await notify.dispatch(USER, alert())
    assert channels == ["web", "imessage"]
    req = route.calls.last.request
    assert req.headers["authorization"] == "Bearer s3cret"
    assert json.loads(req.content) == {"to": "+15551234567", "text": "Nice workout!"}
    assert store["persist"] == [(ALERT_ID, ["web", "imessage"], "Nice workout!")]


@respx.mock
async def test_proposal_hint_in_message(store):
    store["state"].proposal_pending = True
    store["state"].proposal_title = "Sleep block (Pulse)"
    route = respx.post("http://gateway.test/send").mock(return_value=httpx.Response(200))
    await notify.dispatch(USER, alert(proposal_id=UUID(int=9)))
    assert "Reply YES to approve" in json.loads(route.calls.last.request.content)["text"]


@respx.mock
async def test_quiet_hours_skip_imessage(store):
    store["now"] = utc("2026-10-15T03:00:00+00:00")
    route = respx.post("http://gateway.test/send").mock(return_value=httpx.Response(200))
    assert await notify.dispatch(USER, alert()) == ["web"]
    assert not route.called
    assert store["persist"] == [(ALERT_ID, ["web"], None)]


@respx.mock
async def test_urgent_bypasses_quiet_hours(store):
    store["now"] = utc("2026-10-15T03:00:00+00:00")
    route = respx.post("http://gateway.test/send").mock(return_value=httpx.Response(200))
    assert await notify.dispatch(USER, alert("urgent")) == ["web", "imessage"]
    assert route.called


@respx.mock
async def test_no_imessage_link_means_web_only(store):
    store["state"].imessage_to = None
    route = respx.post("http://gateway.test/send").mock(return_value=httpx.Response(200))
    assert await notify.dispatch(USER, alert()) == ["web"]
    assert not route.called


@respx.mock
@pytest.mark.parametrize("effect", [httpx.Response(500), httpx.ConnectTimeout("timeout")])
async def test_gateway_failure_never_raises(store, effect):
    respx.post("http://gateway.test/send").mock(side_effect=[effect])
    assert await notify.dispatch(USER, alert()) == ["web"]
    assert store["persist"] == [(ALERT_ID, ["web"], None)]


async def test_db_failures_never_raise(monkeypatch):
    async def boom(*a, **k):
        raise RuntimeError("db down")

    monkeypatch.setattr(notify, "_load_state", boom)
    monkeypatch.setattr(notify, "_persist", boom)
    assert await notify.dispatch(USER, alert()) == ["web"]


async def test_no_gateway_url_skips_send(store, monkeypatch):
    monkeypatch.setenv("GATEWAY_URL", "")
    settings.cache_clear()
    assert await notify.dispatch(USER, alert()) == ["web"]
