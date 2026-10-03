from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.contracts import CalendarProposal, ProposalCreate, ProposalDecision
from app.core import db
from app.core.auth import require_internal
from app.core.logging import log
from app.integrations.gcal import sync

router = APIRouter(prefix="/proposals", tags=["proposals"], dependencies=[Depends(require_internal)])

_COLS = "id, user_id, title, starts_at, ends_at, rationale, status, google_event_id, alert_id"


async def _get(proposal_id: UUID) -> CalendarProposal:
    async with db.neon() as conn:
        cur = await conn.execute(f"select {_COLS} from calendar_proposals where id = %s", (proposal_id,))
        row = await cur.fetchone()
    if not row:
        raise HTTPException(404, "proposal not found")
    return CalendarProposal(**row)


@router.post("", response_model=CalendarProposal, status_code=201)
async def create(body: ProposalCreate) -> CalendarProposal:
    if body.ends_at <= body.starts_at:
        raise HTTPException(422, "ends_at must be after starts_at")
    async with db.neon() as conn:
        cur = await conn.execute(
            "insert into calendar_proposals (user_id, title, starts_at, ends_at, rationale) "
            f"values (%s, %s, %s, %s, %s) returning {_COLS}",
            (body.user_id, body.title, body.starts_at, body.ends_at, body.rationale),
        )
        return CalendarProposal(**await cur.fetchone())


@router.get("", response_model=list[CalendarProposal])
async def list_(user_id: UUID, status: str | None = None) -> list[CalendarProposal]:
    async with db.neon() as conn:
        cur = await conn.execute(
            f"select {_COLS} from calendar_proposals where user_id = %s "
            "and (%s::text is null or status = %s) order by created_at desc limit 50",
            (user_id, status, status),
        )
        return [CalendarProposal(**r) for r in await cur.fetchall()]


@router.post("/{proposal_id}/decide", response_model=CalendarProposal)
async def decide(proposal_id: UUID, body: ProposalDecision, user_id: UUID | None = None) -> CalendarProposal:
    p = await _get(proposal_id)
    if user_id and p.user_id != user_id:
        raise HTTPException(404, "proposal not found")
    if body.decision == "approved" and p.status in ("pending", "failed"):
        async with db.neon() as conn:
            await conn.execute(
                "update calendar_proposals set status = 'approved', decided_at = now() where id = %s",
                (proposal_id,),
            )
        try:
            await sync.apply_proposal(proposal_id)
        except HTTPException as e:
            log.warning("event=proposal_apply_deferred proposal=%s detail=%s", proposal_id, e.detail)
    elif body.decision == "rejected" and p.status in ("pending", "approved", "applied", "failed"):
        if p.status == "applied":
            await sync.remove_proposal_event(proposal_id)
        async with db.neon() as conn:
            await conn.execute(
                "update calendar_proposals set status = 'rejected', decided_at = now() where id = %s",
                (proposal_id,),
            )
    log.info("event=proposal_decided proposal=%s decision=%s via=%s", proposal_id, body.decision, body.via)
    return await _get(proposal_id)
