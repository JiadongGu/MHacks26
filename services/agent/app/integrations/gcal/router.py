import asyncio
from datetime import datetime
from uuid import UUID

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from app.contracts import CalendarEvent
from app.core.auth import require_internal
from app.core.config import settings
from app.core.logging import log

from . import oauth, service, store, sync

public = APIRouter()
router = APIRouter(dependencies=[Depends(require_internal)])


async def _creds(user_id: UUID):
    row = await store.load(user_id)
    if not row:
        raise HTTPException(404, "google not connected")
    return await asyncio.to_thread(oauth.credentials_for, row["refresh_token"]), row


@router.get("/integrations/google/authorize")
async def authorize(user_id: UUID):
    return RedirectResponse(oauth.authorization_url(str(user_id)))


@public.get("/integrations/google/callback")
async def callback(code: str | None = None, state: str | None = None, error: str | None = None):
    web = settings().public_web_url
    if error or not code or not state:
        return RedirectResponse(f"{web}/settings?google=denied")
    try:
        user_id, refresh_token = await asyncio.to_thread(oauth.complete, code, state)
        creds = await asyncio.to_thread(oauth.credentials_for, refresh_token)
        email = await asyncio.to_thread(service.primary_email, creds)
        cal_id = await asyncio.to_thread(service.ensure_health_calendar, creds)
        await store.save(UUID(user_id), refresh_token, email, cal_id)
        await sync.refresh_user(UUID(user_id))
    except (ValueError, InvalidToken, KeyError) as e:
        log.warning("event=gcal_callback_failed err=%s", e)
        return RedirectResponse(f"{web}/settings?google=error")
    return RedirectResponse(f"{web}/settings?google=connected")


@router.get("/integrations/google/status")
async def status(user_id: UUID):
    row = await store.load(user_id)
    return {"connected": bool(row), "email": row["google_email"] if row else None,
            "last_sync": row["last_sync_at"] if row else None}


@router.get("/calendar/upcoming", response_model=list[CalendarEvent])
async def upcoming(user_id: UUID, hours: int = 48):
    creds, _ = await _creds(user_id)
    return await asyncio.to_thread(service.list_upcoming, creds, hours)


@router.get("/calendar/freebusy")
async def freebusy(user_id: UUID, start: datetime, end: datetime):
    creds, _ = await _creds(user_id)
    return await asyncio.to_thread(service.freebusy, creds, start, end)


@router.post("/calendar/proposals/{proposal_id}/apply")
async def apply(proposal_id: UUID):
    return {"google_event_id": await sync.apply_proposal(proposal_id)}


@router.delete("/calendar/proposals/{proposal_id}/event")
async def remove_event(proposal_id: UUID):
    await sync.remove_proposal_event(proposal_id)
    return {"ok": True}
