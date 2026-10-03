import json
import os
import secrets
import time

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from .store import TokenStore, fernet

SCOPES = ["https://www.googleapis.com/auth/calendar"]
STATE_TTL = 600


def _flow(state: str | None = None, code_verifier: str | None = None) -> Flow:
    cfg = {
        "web": {
            "client_id": os.environ["GOOGLE_CLIENT_ID"],
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    flow = Flow.from_client_config(cfg, scopes=SCOPES, state=state)
    flow.redirect_uri = os.environ["GOOGLE_REDIRECT_URI"]
    flow.code_verifier = code_verifier
    return flow


def authorization_url(user_id: str) -> str:
    verifier = secrets.token_urlsafe(64)
    state = fernet().encrypt(
        json.dumps({"u": user_id, "v": verifier, "t": int(time.time())}).encode()
    ).decode()
    url, _ = _flow(code_verifier=verifier).authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="true", state=state
    )
    return url


def complete(code: str, state: str, store: TokenStore) -> str:
    payload = json.loads(fernet().decrypt(state.encode()))
    if time.time() - payload["t"] > STATE_TTL:
        raise ValueError("state expired")
    flow = _flow(code_verifier=payload["v"])
    flow.fetch_token(code=code)
    creds = flow.credentials
    if not creds.refresh_token:
        raise ValueError("no refresh token returned")
    store.save(payload["u"], {"refresh_token": creds.refresh_token, "scopes": list(creds.scopes or [])})
    return payload["u"]


def credentials_for(user_id: str, store: TokenStore) -> Credentials | None:
    row = store.load(user_id)
    if not row:
        return None
    creds = Credentials(
        None,
        refresh_token=row["refresh_token"],
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.environ["GOOGLE_CLIENT_ID"],
        client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return creds
