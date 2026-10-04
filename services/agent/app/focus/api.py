from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from app.core.auth import require_internal
from app.core.logging import log

from . import service, store
from .catalog import CATALOG, MAX_PICKS

router = APIRouter(prefix="/focus", tags=["focus"], dependencies=[Depends(require_internal)])


class FocusItem(BaseModel):
    key: str
    label: str
    blurb: str
    area: str
    measurable: bool


class Catalog(BaseModel):
    max_picks: int
    items: list[FocusItem]


class FocusSet(BaseModel):
    user_id: UUID
    keys: list[str]


class FocusOut(BaseModel):
    keys: list[str]


@router.get("/catalog", response_model=Catalog)
async def catalog() -> Catalog:
    items = [
        FocusItem(key=f.key, label=f.label, blurb=f.blurb, area=f.area, measurable=f.metric is not None)
        for f in CATALOG
    ]
    return Catalog(max_picks=MAX_PICKS, items=items)


@router.get("", response_model=FocusOut)
async def get_focus(user_id: UUID) -> FocusOut:
    return FocusOut(keys=await store.list_picks(user_id))


@router.put("", response_model=FocusOut)
async def put_focus(body: FocusSet, background: BackgroundTasks) -> FocusOut:
    try:
        keys = await service.set_focus(body.user_id, body.keys)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    background.add_task(_replan, body.user_id)
    return FocusOut(keys=keys)


async def _replan(user_id: UUID) -> None:
    """New picks should show up on the calendar now, for today and tomorrow, not at the next briefing."""
    from datetime import UTC, datetime

    from app.planner import service as planner

    try:
        await planner.build_plans(user_id, datetime.now(UTC))
    except Exception as exc:  # the pick is already saved
        log.warning("event=focus_replan_failed user=%s err=%s", user_id, type(exc).__name__)
