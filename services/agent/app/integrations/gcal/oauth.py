import json
import secrets
import time

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow

from app.core.config import settings

from .store import fernet

SCOPES = ["https://www.googleapis.com/auth/calendar"]
STATE_TTL = 600


def _flow(state: str | None = None, code_verifier: str | None = None) -> Flow:
    cfg = {
        "web": {
            "client_id": settings().google_client_id,
            "client_secret": settings().google_client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
        }
    }
    flow = Flow.from_client_config(cfg, scopes=SCOPES, state=state)
    flow.redirect_uri = settings().google_redirect_uri
    flow.code_verifier = code_verifier
    return flow


def authorization_url(user_id: str) -> str:
    verifier = secrets.token_urlsafe(64)
    state = fernet().encrypt(
        json.dumps({"u": user_id, "v": verifier, "t": int(time.time())}).encode()
    ).decode()
    url, _ = _flow(code_verifier=verifier).authorization_url(
        access_type="offline", prompt="consent select_account", include_granted_scopes="true", state=state
    )
    return url


def complete(code: str, state: str) -> tuple[str, str]:
    """Returns (user_id, refresh_token)."""
    payload = json.loads(fernet().decrypt(state.encode()))
    if time.time() - payload["t"] > STATE_TTL:
        raise ValueError("state expired")
    flow = _flow(code_verifier=payload["v"])
    flow.fetch_token(code=code)
    creds = flow.credentials
    if not creds.refresh_token:
        raise ValueError("no refresh token returned")
    return payload["u"], creds.refresh_token


def credentials_for(refresh_token: str) -> Credentials:
    creds = Credentials(
        None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=settings().google_client_id,
        client_secret=settings().google_client_secret,
        scopes=SCOPES,
    )
    creds.refresh(Request())
    return creds
