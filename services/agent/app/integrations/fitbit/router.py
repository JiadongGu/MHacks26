import asyncio
from uuid import UUID

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse

from app.core.auth import require_internal
from app.core.config import settings
from app.core.logging import log

from . import oauth, store, sync

public = APIRouter()
router = APIRouter(dependencies=[Depends(require_internal)])


@router.get("/integrations/fitbit/authorize")
async def authorize(user_id: UUID):
    return RedirectResponse(oauth.authorization_url(str(user_id)))


@public.get("/integrations/fitbit/callback")
async def callback(code: str | None = None, state: str | None = None, error: str | None = None):
    web = settings().public_web_url
    if error or not code or not state:
        return RedirectResponse(f"{web}/settings?fitbit=denied")
    try:
        user_id, row = await asyncio.to_thread(oauth.complete, code, state)
        await store.save(UUID(user_id), row)
    except (ValueError, InvalidToken, KeyError) as e:
        log.warning("event=fitbit_callback_failed err=%s", e)
        return RedirectResponse(f"{web}/settings?fitbit=error")
    try:
        await sync.sync_user(UUID(user_id), sync.BACKFILL_MIN)
    except Exception as e:  # a failed backfill must not undo the connection
        log.warning("event=fitbit_backfill_failed user=%s err=%s", user_id, e)
    return RedirectResponse(f"{web}/settings?fitbit=connected")


@router.get("/integrations/fitbit/status")
async def status(user_id: UUID):
    row = await store.load(user_id)
    return {"connected": bool(row), "last_sync": row["last_sync_at"] if row else None}


@router.post("/integrations/fitbit/sync")
async def sync_now(user_id: UUID, minutes: int = sync.LOOKBACK_MIN):
    try:
        return {"n": await sync.sync_user(user_id, minutes)}
    except LookupError:
        raise HTTPException(404, "fitbit not connected") from None
