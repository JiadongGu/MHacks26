import os
from datetime import datetime

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from . import oauth, service
from .store import FileTokenStore, TokenStore

router = APIRouter()
store: TokenStore = FileTokenStore()


def _creds(user_id: str):
    creds = oauth.credentials_for(user_id, store)
    if not creds:
        raise HTTPException(404, "google not connected")
    return creds


@router.get("/integrations/google/authorize")
def authorize(user_id: str):
    return RedirectResponse(oauth.authorization_url(user_id))


@router.get("/integrations/google/callback")
def callback(code: str | None = None, state: str | None = None, error: str | None = None):
    web = os.environ.get("PUBLIC_WEB_URL", "")
    if error or not code or not state:
        return RedirectResponse(f"{web}/settings?google=denied")
    try:
        user_id = oauth.complete(code, state, store)
    except ValueError:
        return RedirectResponse(f"{web}/settings?google=error")
    creds = _creds(user_id)
    row = store.load(user_id)
    row["email"] = service.primary_email(creds)
    row["health_calendar_id"] = service.ensure_health_calendar(creds)
    store.save(user_id, row)
    return RedirectResponse(f"{web}/settings?google=connected")


@router.get("/integrations/google/status")
def status(user_id: str):
    row = store.load(user_id)
    return {"connected": bool(row), "email": row.get("email") if row else None}


@router.get("/calendar/upcoming")
def upcoming(user_id: str, hours: int = 48):
    return service.list_upcoming(_creds(user_id), hours)


@router.get("/calendar/freebusy")
def freebusy(user_id: str, start: datetime, end: datetime):
    return service.freebusy(_creds(user_id), start, end)
