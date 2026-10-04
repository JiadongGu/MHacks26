"""FinchNode Connect endpoints. `router` needs the internal token; `public` is FinchNode's webhook."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Request

from app.core.auth import require_internal
from app.core.logging import log
from app.twin import finchlive, live, live_store

router = APIRouter(prefix="/twin/finchnode", tags=["twin"], dependencies=[Depends(require_internal)])
public = APIRouter(prefix="/twin/finchnode", tags=["twin"])


def _fail(exc: finchlive.LiveError) -> HTTPException:
    if isinstance(exc, finchlive.NotConfigured):
        return HTTPException(503, "FinchNode is not configured")
    return HTTPException(502, "FinchNode unavailable")


@router.post("/connect")
async def connect(body: dict[str, Any]) -> dict[str, str]:
    try:
        return await live.start(UUID(str(body.get("user_id"))))
    except (ValueError, TypeError) as exc:
        raise HTTPException(422, "user_id must be a uuid") from exc
    except finchlive.LiveError as exc:
        raise _fail(exc) from exc


@router.get("/status")
async def connection_status(user_id: UUID) -> dict[str, Any]:
    try:
        return await live.status(user_id)
    except finchlive.LiveError as exc:
        raise _fail(exc) from exc


@public.post("/webhook")
async def webhook(
    request: Request,
    background: BackgroundTasks,
    finchnode_signature: str = Header(default=""),
    finchnode_event_id: str = Header(default=""),
) -> dict[str, bool]:
    """Signature-checked, deduplicated, answered at once; the work runs after the response."""
    event = finchlive.verify_webhook(await request.body(), finchnode_signature, finchnode_event_id)
    if event is None:
        raise HTTPException(401, "bad signature")
    if not await live_store.first_seen(event["id"]):
        return {"duplicate": True}
    background.add_task(_handle, event)
    return {"ok": True}


async def _handle(event: dict[str, Any]) -> None:
    try:
        await live.handle_event(event)
    except Exception as exc:  # the event is already recorded; log without the payload
        log.warning("event=finchnode_webhook_failed type=%s error=%s", event.get("type"), type(exc).__name__)
