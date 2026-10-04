import hashlib
import hmac
import json
import time
from datetime import date
from uuid import uuid4

import httpx
import pytest
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import settings
from app.twin import builder, finchlive, live, live_api, live_store

SECRET = "whsec_test"
BASE = finchlive.BASE_URL

NORMALIZED = {
    "demographics": {"gender": "female", "birthDate": "1988-04-17"},
    "conditions": [
        {
            "name": "Type 2 diabetes mellitus",
            "status": "active",
            "verificationStatus": "confirmed",
            "codes": [{"system": "http://snomed.info/sct", "code": "44054006", "display": "Type 2 diabetes"}],
        },
        {"name": "Old sprain", "status": "resolved", "verificationStatus": "confirmed", "codes": []},
    ],
    "medications": [
        {
            "name": "Metformin 500 mg tablet",
            "status": "active",
            "codes": [
                {
                    "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
                    "code": "861007",
                    "display": "Metformin",
                }
            ],
        },
        {"name": "Stopped drug", "status": "stopped", "codes": []},
    ],
    "allergies": [{"substance": "Allergy to penicillin", "status": "active", "codes": []}],
    "labs": [
        {
            "name": "Hemoglobin A1c",
            "value": 7.2,
            "unit": "%",
            "date": "2026-08-01",
            "codes": [{"system": "http://loinc.org", "code": "4548-4", "display": "Hemoglobin A1c"}],
        }
    ],
}


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("FINCHNODE_API_KEY", "ck_test_abc")
    monkeypatch.setenv("FINCHNODE_WEBHOOK_SECRET", SECRET)
    settings.cache_clear()
    yield
    settings.cache_clear()


def test_adapter_feeds_the_existing_twin_builder():
    twin = builder.from_finchnode(finchlive.to_fhir_record(NORMALIZED), today=date(2026, 10, 3))
    assert twin["profile"]["sex"] == "female" and twin["profile"]["age"] == 38
    assert [c["display"] for c in twin["conditions"] if c["status"] == "active"] == ["Type 2 diabetes"]
    assert [m["display"] for m in twin["medications"]] == ["Metformin 500 mg tablet"]
    assert twin["allergies"] == ["penicillin"]
    assert twin["labs"][0]["loinc"] == "4548-4" and twin["labs"][0]["value"] == 7.2
    assert twin["provenance"]["finchnode_synthetic"] is False


def sign(body: bytes, ts: int | None = None, secret: str = SECRET) -> str:
    ts = ts or int(time.time())
    return f"t={ts},v1=" + hmac.new(secret.encode(), f"{ts}.".encode() + body, hashlib.sha256).hexdigest()


def event(kind="consent.granted", **data):
    return {"id": "evt_1", "type": kind, "data": data}


def test_verify_accepts_a_genuine_event_and_rejects_everything_else():
    raw = json.dumps(event(sessionId="cs_1")).encode()
    assert finchlive.verify_webhook(raw, sign(raw), "evt_1")["type"] == "consent.granted"
    assert finchlive.verify_webhook(raw, sign(raw, secret="whsec_other"), "evt_1") is None
    assert finchlive.verify_webhook(raw + b" ", sign(raw), "evt_1") is None
    assert finchlive.verify_webhook(raw, sign(raw), "evt_2") is None
    assert finchlive.verify_webhook(raw, sign(raw, ts=int(time.time()) - 3600), "evt_1") is None
    assert finchlive.verify_webhook(raw, "", "evt_1") is None
    assert finchlive.verify_webhook(raw, "t=1,v1=zz", "evt_1") is None


def test_verify_refuses_everything_when_no_secret_is_set(monkeypatch):
    monkeypatch.setenv("FINCHNODE_WEBHOOK_SECRET", "")
    settings.cache_clear()
    raw = b"{}"
    assert finchlive.verify_webhook(raw, sign(raw), "evt_1") is None


@pytest.fixture
def client(monkeypatch):
    seen: set[str] = set()
    handled: list[dict] = []

    async def first_seen(event_id):
        if event_id in seen:
            return False
        seen.add(event_id)
        return True

    async def handle(ev):
        handled.append(ev)

    monkeypatch.setattr(live_store, "first_seen", first_seen)
    monkeypatch.setattr(live, "handle_event", handle)
    app = FastAPI()
    app.include_router(live_api.public)
    app.include_router(live_api.router)
    c = TestClient(app)
    c.handled = handled
    return c


def post(client, ev, signature=None, event_id=None):
    raw = json.dumps(ev).encode()
    return client.post(
        "/twin/finchnode/webhook",
        content=raw,
        headers={
            "Content-Type": "application/json",
            "FinchNode-Signature": signature or sign(raw),
            "FinchNode-Event-Id": event_id or ev["id"],
        },
    )


def test_webhook_needs_no_internal_token_but_needs_a_valid_signature(client):
    assert post(client, event(sessionId="cs_1")).status_code == 200
    assert post(client, {**event(), "id": "evt_2"}, signature="t=1,v1=" + "0" * 64).status_code == 401
    assert [e["id"] for e in client.handled] == ["evt_1"]


def test_webhook_ignores_a_repeated_event(client):
    assert post(client, event(sessionId="cs_1")).json() == {"ok": True}
    assert post(client, event(sessionId="cs_1")).json() == {"duplicate": True}
    assert len(client.handled) == 1


def test_connect_and_status_need_the_internal_token(client):
    assert client.post("/twin/finchnode/connect", json={"user_id": str(uuid4())}).status_code == 401
    assert client.get("/twin/finchnode/status", params={"user_id": str(uuid4())}).status_code == 401


@respx.mock
async def test_read_category_follows_the_cursor():
    route = respx.get(f"{BASE}/users/u_1/records/labs").mock(
        side_effect=[
            httpx.Response(
                200, json={"data": [{"id": "a"}], "hasMore": True, "nextCursor": "c1", "meta": {}}
            ),
            httpx.Response(200, json={"data": [{"id": "b"}], "hasMore": False, "nextCursor": None}),
        ]
    )
    records, _ = await finchlive.read_category("u_1", "labs")
    assert [r["id"] for r in records] == ["a", "b"]
    assert route.calls[1].request.url.params["cursor"] == "c1"
    assert route.calls[0].request.headers["authorization"] == "Bearer ck_test_abc"


@respx.mock
async def test_inactive_consent_and_missing_subject_are_distinct_errors():
    respx.get(f"{BASE}/users/u_1/records/labs").respond(410, json={"error": {}})
    with pytest.raises(finchlive.ConsentInactive):
        await finchlive.read_category("u_1", "labs")
    respx.get(f"{BASE}/users/u_2/records/labs").respond(404, json={"error": {}})
    with pytest.raises(finchlive.SubjectGone):
        await finchlive.read_category("u_2", "labs")


async def test_no_key_means_not_configured(monkeypatch):
    monkeypatch.setenv("FINCHNODE_API_KEY", "")
    settings.cache_clear()
    with pytest.raises(finchlive.NotConfigured):
        await finchlive.get_session("cs_1")


@respx.mock
async def test_status_imports_once_sharing_is_approved(monkeypatch):
    uid = uuid4()
    row = {"user_id": uid, "session_id": "cs_1", "subject": None, "status": "pending", "imported_at": None}
    calls: list = []

    async def load(_):
        return row

    async def set_connected(user_id, subject):
        calls.append(("connected", subject))

    async def import_now(user_id, subject):
        calls.append(("import", subject))

    monkeypatch.setattr(live_store, "load", load)
    monkeypatch.setattr(live_store, "set_connected", set_connected)
    monkeypatch.setattr(live, "import_now", import_now)
    respx.get(f"{BASE}/connect/sessions/cs_1").respond(
        json={"id": "cs_1", "status": "completed", "subject": "u_abc"}
    )
    out = await live.status(uid)
    assert calls == [("connected", "u_abc"), ("import", "u_abc")]
    assert out == {"status": "connected", "imported": True}
