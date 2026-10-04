from datetime import UTC, date, datetime, timedelta
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import require_internal
from app.twin.tz import DEFAULT_TIMEZONE

from . import checkin, service, store

router = APIRouter(prefix="/plan", tags=["plan"], dependencies=[Depends(require_internal)])


@router.get("")
async def get_plan(user_id: UUID, day: date | None = None) -> dict:
    """The saved plan for a day (default today), or {"plan": null}."""
    if day is None:
        tz = (await store.load_profile(user_id)).get("timezone") or DEFAULT_TIMEZONE
        day = datetime.now(UTC).astimezone(ZoneInfo(tz)).date()
    row = await store.get_plan(user_id, day)
    if row is None:
        return {"plan": None}
    return {"plan": {**row, "day": row["day"].isoformat(), "created_at": row["created_at"].isoformat()}}


@router.post("/rebuild")
async def rebuild(user_id: UUID, day: Literal["today", "tomorrow", "both"] = "today") -> dict:
    """Plan a day, or today and tomorrow, now and write it to the calendar. For the demo panel and tests."""
    tz = (await store.load_profile(user_id)).get("timezone") or DEFAULT_TIMEZONE
    now = datetime.now(UTC)
    if day == "both":
        return {"plans": [p.as_json() for p in await service.build_plans(user_id, now)]}
    local_day = now.astimezone(ZoneInfo(tz)).date()
    plan = await service.build_plan(user_id, local_day + timedelta(days=1 if day == "tomorrow" else 0), now)
    return plan.as_json()


class DoneIn(BaseModel):
    user_id: UUID
    day: date
    start: datetime
    done: bool = True


@router.post("/done")
async def mark_done(body: DoneIn) -> dict:
    """Tick (or untick) one planned item, found by its start time."""
    row = await store.get_plan(body.user_id, body.day)
    if row is None:
        raise HTTPException(404, "no plan for that day")
    items, found = checkin.mark_done(list(row["items"] or []), body.start, body.done)
    if not found:
        raise HTTPException(404, "no planned item starts then")
    await store.set_items(body.user_id, body.day, items)
    return {"ok": True, "done": body.done}
