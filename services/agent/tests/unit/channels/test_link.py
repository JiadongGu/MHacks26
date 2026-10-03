from contextlib import asynccontextmanager
from uuid import UUID

import pytest
from fastapi.testclient import TestClient

from app.channels import link
from app.core import db
from app.core.config import settings
from app.main import app

USER = UUID("00000000-0000-0000-0000-000000000001")
HEADERS = {"X-Internal-Token": "dev-internal-token"}


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("PUBLIC_WEB_URL", "https://pulse.test")
    settings.cache_clear()
    yield
    settings.cache_clear()


def test_extract_code():
    assert link.extract_code("hi my code is pulse-7qk2 thanks") == "PULSE-7QK2"
    assert link.extract_code("PULSE-ABCD") == "PULSE-ABCD"
    assert link.extract_code("PULSE-ABC") is None
    assert link.extract_code("hello") is None
    assert link.extract_code("") is None


def test_mask_keeps_last_four():
    assert link.mask("+15551234567") == "***4567"
    assert link.mask(None) is None
    assert "5551" not in (link.mask("+15551234567") or "")


def test_welcome_names_user():
    assert "Ada" in link.welcome_text("Ada")
    assert "None" not in link.welcome_text(None)


async def test_known_code_links_and_welcomes(monkeypatch):
    seen = {}

    async def claim(channel, external_id, code):
        seen.update(channel=channel, external_id=external_id, code=code)
        return USER

    async def name(user_id):
        return "Ada"

    monkeypatch.setattr(link, "claim_code", claim)
    monkeypatch.setattr(link, "display_name", name)
    reply = await link.handle_unknown("imessage", "+15550001111", "hey pulse-7qk2")
    assert seen == {"channel": "imessage", "external_id": "+15550001111", "code": "PULSE-7QK2"}
    assert "Welcome to Pulse, Ada" in reply


async def test_unmatched_code_replies_with_signup(monkeypatch):
    async def claim(channel, external_id, code):
        return None

    monkeypatch.setattr(link, "claim_code", claim)
    reply = await link.handle_unknown("imessage", "+1", "PULSE-ZZZZ")
    assert "PULSE-XXXX" in reply
    assert "https://pulse.test" in reply


async def test_no_code_replies_with_signup():
    reply = await link.handle_unknown("imessage", "+1", "hello there")
    assert reply == "Text your PULSE-XXXX code from onboarding, or sign up at https://pulse.test"


async def test_db_failure_does_not_raise(monkeypatch):
    async def claim(channel, external_id, code):
        raise RuntimeError("db down")

    monkeypatch.setattr(link, "claim_code", claim)
    reply = await link.handle_unknown("imessage", "+1", "PULSE-7QK2")
    assert "try again" in reply


def fake_neon(row):
    class Cur:
        async def fetchone(self):
            return row

    class Conn:
        async def execute(self, sql, params=None):
            return Cur()

    @asynccontextmanager
    async def neon():
        yield Conn()

    return neon


def test_status_endpoint_masks(monkeypatch):
    monkeypatch.setattr(db, "neon", fake_neon({"external_id": "+15551234567"}))
    r = TestClient(app).get(f"/channels/status?user_id={USER}", headers=HEADERS)
    assert r.status_code == 200
    assert r.json() == {"imessage": {"linked": True, "external_id_masked": "***4567"}}


def test_status_endpoint_unlinked_and_auth(monkeypatch):
    monkeypatch.setattr(db, "neon", fake_neon(None))
    c = TestClient(app)
    r = c.get(f"/channels/status?user_id={USER}", headers=HEADERS)
    assert r.json() == {"imessage": {"linked": False, "external_id_masked": None}}
    assert c.get(f"/channels/status?user_id={USER}").status_code == 401
