import asyncio
from uuid import UUID

from fastapi import HTTPException
from googleapiclient.errors import HttpError

from app.core import db
from app.core.logging import log

from . import oauth, service, store

CACHE_HOURS = 24 * 7


async def refresh_user(user_id: UUID) -> int:
    row = await store.load(user_id)
    if not row:
        return 0
    creds = await asyncio.to_thread(oauth.credentials_for, row["refresh_token"])
    events = await asyncio.to_thread(service.list_upcoming, creds, CACHE_HOURS)
    await store.replace_cache(user_id, events)
    return len(events)


async def refresh_all() -> None:
    for user_id in await store.connected_users():
        try:
            await refresh_user(user_id)
        except Exception as e:  # one bad token must not stop the sweep
            log.warning("event=gcal_refresh_failed user=%s err=%s", user_id, e)


async def _proposal(proposal_id: UUID) -> dict:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select id, user_id, title, starts_at, ends_at, rationale, status, google_event_id "
            "from calendar_proposals where id = %s",
            (proposal_id,),
        )
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "proposal not found")
    return row


async def _set(proposal_id: UUID, status: str, event_id: str | None = None) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "update calendar_proposals set status = %s, google_event_id = coalesce(%s, google_event_id), "
            "applied_at = case when %s = 'applied' then now() else applied_at end where id = %s",
            (status, event_id, status, proposal_id),
        )


async def apply_proposal(proposal_id: UUID) -> str:
    p = await _proposal(proposal_id)
    if p["status"] == "applied":
        return p["google_event_id"]
    if p["status"] != "approved":
        raise HTTPException(409, f"proposal is {p['status']}, not approved")
    row = await store.load(p["user_id"])
    if not row or not row["health_calendar_id"]:
        await _set(proposal_id, "failed")
        raise HTTPException(409, "google not connected")
    try:
        creds = await asyncio.to_thread(oauth.credentials_for, row["refresh_token"])
        event_id = await asyncio.to_thread(
            service.insert_proposal_event, creds, row["health_calendar_id"],
            p["title"], p["starts_at"], p["ends_at"], p["rationale"],
        )
    except (HttpError, ValueError) as e:
        log.warning("event=gcal_apply_failed proposal=%s err=%s", proposal_id, e)
        await _set(proposal_id, "failed")
        raise HTTPException(502, "calendar insert failed") from e
    await _set(proposal_id, "applied", event_id)
    return event_id


async def remove_proposal_event(proposal_id: UUID) -> None:
    p = await _proposal(proposal_id)
    row = await store.load(p["user_id"])
    if p["google_event_id"] and row:
        creds = await asyncio.to_thread(oauth.credentials_for, row["refresh_token"])
        await asyncio.to_thread(service.delete_event, creds, row["health_calendar_id"], p["google_event_id"])
    await _set(proposal_id, "rejected")
