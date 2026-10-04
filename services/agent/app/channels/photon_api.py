"""Give a person their iMessage line: register their phone with Photon and say which number to text."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.channels import photon
from app.core import db
from app.core.auth import require_internal

router = APIRouter(prefix="/channels/imessage", tags=["channels"], dependencies=[Depends(require_internal)])


class LineRequest(BaseModel):
    user_id: UUID
    phone: str | None = None  # defaults to the phone saved on the profile


class LineOut(BaseModel):
    line: str
    phone: str


async def _profile(user_id: UUID) -> dict:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select display_name, phone_e164 from profiles where user_id = %s", (user_id,)
        )
        return await cur.fetchone() or {}


@router.post("/line", response_model=LineOut)
async def get_line(body: LineRequest) -> LineOut:
    """Register the phone with Photon (safe to repeat) and return the number to text. Saves a phone that was
    typed here onto the profile."""
    profile = await _profile(body.user_id)
    phone = photon.clean_phone(body.phone or profile.get("phone_e164") or "")
    if not phone:
        raise HTTPException(422, "Add your phone number first.")
    first = (profile.get("display_name") or "").split()[:1]
    try:
        line = await photon.register_user(phone, first[0] if first else None)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except photon.NotConfigured as exc:
        raise HTTPException(503, "iMessage is not set up on this server.") from exc
    except photon.LineFull as exc:
        msg = "Pulse's iMessage line is full right now. ASI:One and the web work for everyone."
        raise HTTPException(409, msg) from exc
    except photon.PhotonError as exc:
        raise HTTPException(502, "Could not reach the iMessage service. Try again in a minute.") from exc
    if body.phone and not profile.get("phone_e164"):
        async with db.neon() as conn:
            await conn.execute(
                "update profiles set phone_e164 = %s where user_id = %s and phone_e164 is null",
                (phone, body.user_id),
            )
    return LineOut(line=line, phone=phone)
