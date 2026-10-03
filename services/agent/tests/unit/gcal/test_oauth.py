import os
from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.fernet import Fernet

from app.core.config import settings
from app.integrations.gcal import oauth


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setenv("SECRET_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "sec")
    monkeypatch.setenv("GOOGLE_REDIRECT_URI", "https://agent.example/integrations/google/callback")
    settings.cache_clear()
    yield
    settings.cache_clear()


def test_authorize_url_asks_for_calendar_only_and_does_not_merge_earlier_grants():
    q = parse_qs(urlparse(oauth.authorization_url("u1")).query)
    assert q["scope"] == ["https://www.googleapis.com/auth/calendar"]
    assert "include_granted_scopes" not in q
    assert q["access_type"] == ["offline"] and "select_account" in q["prompt"][0]


def test_extra_scopes_in_the_token_response_cannot_fail_a_connect():
    assert os.environ["OAUTHLIB_RELAX_TOKEN_SCOPE"] == "1"
