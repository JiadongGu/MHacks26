from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.channels.link import mask
from app.core import db
from app.core.auth import require_internal

router = APIRouter(prefix="/channels", tags=["channels"], dependencies=[Depends(require_internal)])


class ChannelState(BaseModel):
    linked: bool
    external_id_masked: str | None = None


class ChannelStatus(BaseModel):
    imessage: ChannelState


@router.get("/status", response_model=ChannelStatus)
async def status(user_id: UUID) -> ChannelStatus:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select external_id from channel_links where user_id = %s and channel = 'imessage' "
            "and status = 'linked' order by linked_at desc nulls last limit 1", (user_id,))
        row = await cur.fetchone()
    if not row:
        return ChannelStatus(imessage=ChannelState(linked=False))
    return ChannelStatus(imessage=ChannelState(linked=True, external_id_masked=mask(row["external_id"])))
