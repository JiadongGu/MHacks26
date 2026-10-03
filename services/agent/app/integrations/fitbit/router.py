import os
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.integrations.gcal.store import FileTokenStore, TokenStore

from . import normalize, oauth
from .client import HealthClient

router = APIRouter()
store: TokenStore = FileTokenStore(".data/fitbit_tokens.json")


def sync_recent(user_id: str, minutes: int = 60, tz: str | None = None) -> dict:
    tz = tz or os.environ.get("TIME_ZONE", "UTC")
    client = HealthClient(user_id, store)
    end = datetime.now(timezone.utc)
    samples = normalize.heart_rate_samples(user_id, client.heart_rate(end - timedelta(minutes=minutes), end))
    samples += normalize.steps_samples(user_id, client.daily_rollup("steps", date.today()), tz)
    return normalize.to_batch(samples)


@router.get("/integrations/fitbit/authorize")
def authorize(user_id: str):
    return RedirectResponse(oauth.authorization_url(user_id))


@router.get("/integrations/fitbit/callback")
def callback(code: str | None = None, state: str | None = None, error: str | None = None):
    web = os.environ.get("PUBLIC_WEB_URL", "")
    if error or not code or not state:
        return RedirectResponse(f"{web}/settings?fitbit=denied")
    try:
        oauth.complete(code, state, store)
    except ValueError:
        return RedirectResponse(f"{web}/settings?fitbit=error")
    return RedirectResponse(f"{web}/settings?fitbit=connected")


@router.post("/integrations/fitbit/sync")
def sync(user_id: str, minutes: int = 60):
    try:
        return sync_recent(user_id, minutes)
    except LookupError:
        raise HTTPException(404, "fitbit not connected")


@router.get("/integrations/fitbit/raw")
def raw(user_id: str, data_type: str = "heart-rate", minutes: int = 30):
    end = datetime.now(timezone.utc)
    client = HealthClient(user_id, store)
    if data_type == "heart-rate":
        return client.heart_rate(end - timedelta(minutes=minutes), end)[:20]
    return client.daily_rollup(data_type, date.today())
