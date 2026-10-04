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


class WelcomeIn(BaseModel):
    user_id: UUID


def welcome_text(first_name: str | None, focus_labels: list[str]) -> str:
    who = f", {first_name}" if first_name else ""
    lines = [f"Welcome to Pulse{who}. I am your health companion."]
    if focus_labels:
        lines.append("You are working on: " + ", ".join(focus_labels) + ".")
    lines += [
        "",
        "Each morning and evening I will check in, and I plan your focus areas around your calendar.",
        'You can ask me things any time, like "how did I sleep?" or "what is my plan today?".',
        "",
        "Here is your first check-in:",
    ]
    return "\n".join(lines)


@router.post("/welcome")
async def welcome(body: WelcomeIn) -> dict[str, bool]:
    """Text the person first, once, when setup is done: a welcome and then a first check-in.

    Does nothing if they were already welcomed. The text only goes out if their iMessage is linked.
    """
    from app.agents import compass  # imported here: compass pulls in the whole agent
    from app.focus.catalog import BY_KEY
    from app.focus.store import list_picks
    from app.notify import dispatch
    from app.twin.tz import local_now

    async with db.neon() as conn:
        cur = await conn.execute(
            "select 1 as n from alerts where user_id = %s and kind = 'welcome' limit 1", (body.user_id,)
        )
        if await cur.fetchone():
            return {"sent": False}
    profile = await _profile(body.user_id)
    first = (profile.get("display_name") or "").split()[:1]
    picks = [BY_KEY[k].label.lower() for k in await list_picks(body.user_id) if k in BY_KEY]
    alert = await compass.persist_alert(
        body.user_id, "welcome", "Welcome to Pulse", welcome_text(first[0] if first else None, picks), {}
    )
    await dispatch(body.user_id, alert)
    # A first check-in right after: the evening one when it is already late in the day.
    async with db.neon() as conn:
        cur = await conn.execute("select timezone from profiles where user_id = %s", (body.user_id,))
        tz = ((await cur.fetchone()) or {}).get("timezone") or "America/Detroit"
    if local_now(tz).hour >= 17:
        await compass.run_evening(body.user_id, force=True)
    else:
        await compass.run_briefing(body.user_id, force=True)
    return {"sent": True}
