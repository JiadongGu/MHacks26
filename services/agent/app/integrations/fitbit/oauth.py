import base64
import hashlib
import json
import os
import secrets
import time
from urllib.parse import urlencode

import httpx

from app.integrations.gcal.store import fernet

from .store import TokenStore

AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SCOPES = " ".join(
    f"https://www.googleapis.com/auth/googlehealth.{s}.readonly"
    for s in ("activity_and_fitness", "health_metrics_and_measurements", "sleep")
)
STATE_TTL = 600


def redirect_uri() -> str:
    return os.environ["PUBLIC_AGENT_URL"].rstrip("/") + "/integrations/fitbit/callback"


def _client() -> dict:
    return {"client_id": os.environ["FITBIT_CLIENT_ID"], "client_secret": os.environ["FITBIT_CLIENT_SECRET"]}


def authorization_url(user_id: str) -> str:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state = (
        fernet().encrypt(json.dumps({"u": user_id, "v": verifier, "t": int(time.time())}).encode()).decode()
    )
    return (
        AUTH_URL
        + "?"
        + urlencode(
            {
                "response_type": "code",
                "client_id": os.environ["FITBIT_CLIENT_ID"],
                "redirect_uri": redirect_uri(),
                "scope": SCOPES,
                "access_type": "offline",
                "prompt": "consent select_account",
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }
        )
    )


def _token_row(resp: dict) -> dict:
    return {
        "access_token": resp["access_token"],
        "refresh_token": resp["refresh_token"],
        "expires_at": time.time() + resp["expires_in"],
        "scopes": resp.get("scope", "").split(),
    }


def complete(code: str, state: str, store: TokenStore) -> str:
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
    store.save(payload["u"], _token_row(r.json()))
    return payload["u"]


def refresh(user_id: str, store: TokenStore) -> dict:
    row = store.load(user_id)
    r = httpx.post(
        TOKEN_URL, data={**_client(), "grant_type": "refresh_token", "refresh_token": row["refresh_token"]}
    )
    if r.status_code != 200:
        raise PermissionError("health refresh failed; user must reconnect")
    j = r.json()
    new = {**row, "access_token": j["access_token"], "expires_at": time.time() + j["expires_in"]}
    store.save(user_id, new)
    return new
