from datetime import UTC, date, datetime, timedelta
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends

from app.core.auth import require_internal
from app.twin.tz import DEFAULT_TIMEZONE

from . import service, store

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
async def rebuild(user_id: UUID, day: Literal["today", "tomorrow"] = "today") -> dict:
    """Plan a day now and write it to the calendar. Used by the demo panel and for testing."""
    tz = (await store.load_profile(user_id)).get("timezone") or DEFAULT_TIMEZONE
    now = datetime.now(UTC)
    local_day = now.astimezone(ZoneInfo(tz)).date()
    plan = await service.build_plan(user_id, local_day + timedelta(days=1 if day == "tomorrow" else 0), now)
    return plan.as_json()
