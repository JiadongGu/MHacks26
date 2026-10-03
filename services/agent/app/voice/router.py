"""Spoken briefing endpoints. Internal auth only."""

from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response

from app.core.auth import require_internal
from app.voice import service

router = APIRouter(prefix="/voice", tags=["voice"], dependencies=[Depends(require_internal)])


@router.get("/briefing")
async def briefing(user_id: UUID) -> Response:
    try:
        audio = await service.briefing_audio(user_id)
    except service.ElevenLabsError as exc:
        raise HTTPException(503, "voice is unavailable") from exc
    if audio is None:
        raise HTTPException(404, "no briefing")
    return Response(content=audio, media_type="audio/mpeg", headers={"Cache-Control": "private, no-cache"})


@router.get("/briefing/text")
async def briefing_text(user_id: UUID) -> dict[str, Any]:
    found = await service.todays_briefing(user_id, generate=False)
    if found is None:
        raise HTTPException(404, "no briefing")
    day, row = found
    return {"day": day.isoformat(), "text": row["text"],
            "has_audio": row.get("audio_url") == service.AUDIO_URL}
