import base64
import hashlib
import json
import secrets
import time
from typing import Any
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.integrations.gcal.store import fernet

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = " ".join(
    f"https://www.googleapis.com/auth/googlehealth.{s}.readonly"
    for s in ("activity_and_fitness", "health_metrics_and_measurements", "sleep")
)
STATE_TTL = 600


def redirect_uri() -> str:
    return settings().public_agent_url.rstrip("/") + "/integrations/fitbit/callback"


def _client() -> dict[str, str]:
    s = settings()
    return {"client_id": s.fitbit_client_id, "client_secret": s.fitbit_client_secret}


def authorization_url(user_id: str) -> str:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    payload = {"u": user_id, "v": verifier, "t": int(time.time())}
    state = fernet().encrypt(json.dumps(payload).encode()).decode()
    return AUTH_URL + "?" + urlencode({
        "response_type": "code",
        "client_id": settings().fitbit_client_id,
        "redirect_uri": redirect_uri(),
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent select_account",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })


def _token_row(resp: dict[str, Any]) -> dict[str, Any]:
    return {
        "access_token": resp["access_token"],
        "refresh_token": resp["refresh_token"],
        "expires_at": time.time() + resp["expires_in"],
        "scopes": resp.get("scope", "").split(),
    }


def complete(code: str, state: str) -> tuple[str, dict[str, Any]]:
    """Returns (user_id, token row); the caller persists the row."""
    payload = json.loads(fernet().decrypt(state.encode()))
    if time.time() - payload["t"] > STATE_TTL:
        raise ValueError("state expired")
    r = httpx.post(
        TOKEN_URL,
        data={
            **_client(),
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri(),
            "code_verifier": payload["v"],
        },
    )
    if r.status_code != 200:
        raise ValueError(f"token exchange failed: {r.status_code}")
    return payload["u"], _token_row(r.json())


def refresh(row: dict[str, Any]) -> dict[str, Any]:
    """Google keeps the refresh token stable, so only the access token and expiry change."""
    data = {**_client(), "grant_type": "refresh_token", "refresh_token": row["refresh_token"]}
    r = httpx.post(TOKEN_URL, data=data)
    if r.status_code != 200:
        raise PermissionError("health refresh failed; user must reconnect")
    j = r.json()
    return {**row, "access_token": j["access_token"], "expires_at": time.time() + j["expires_in"]}
