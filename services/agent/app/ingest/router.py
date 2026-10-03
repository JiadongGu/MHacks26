from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.contracts import IngestBatch
from app.core.auth import require_internal

from .hae import parse_hae
from .writer import ingest_batch

router = APIRouter(dependencies=[Depends(require_internal)])


@router.post("/ingest/samples")
async def ingest_samples(batch: IngestBatch):
    return {"n": await ingest_batch(batch)}


@router.post("/ingest/hae")
async def ingest_hae(user_id: UUID, payload: dict[str, Any]):
    try:
        batch = parse_hae(payload, user_id)
    except (KeyError, ValueError, TypeError) as e:
        raise HTTPException(422, f"bad Health Auto Export payload: {e}") from e
    return {"n": await ingest_batch(batch)}
