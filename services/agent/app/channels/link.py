"""Link-code flow. The web app creates `channel_links` rows with a code. The first inbound text links them."""

import logging
import re
from typing import Any
from uuid import UUID

from app.core import db
from app.core.config import settings

log = logging.getLogger("pulse.channels")

LINK_RE = re.compile(r"PULSE-[A-Z0-9]{4}", re.IGNORECASE)


def extract_code(text: str) -> str | None:
    """Return the first link code in the text, upper-cased, or None."""
    m = LINK_RE.search(text or "")
    return m.group(0).upper() if m else None


def mask(external_id: str | None) -> str | None:
    """Keep the last 4 characters only."""
    if not external_id:
        return None
    tail = external_id[-4:]
    return f"***{tail}"


def welcome_text(display_name: str | None) -> str:
    name = (display_name or "").strip()
    who = f", {name}" if name else ""
    return (f"Welcome to Pulse{who}! You are linked. I will text you health alerts and calendar "
            "suggestions. Reply STATUS any time, or ask me about your steps, sleep, or heart rate.")


def unknown_text(url: str, bad_code: bool) -> str:
    base = f"Text your PULSE-XXXX code from onboarding, or sign up at {url}"
    return f"That code did not match. {base}" if bad_code else base


async def claim_code(channel: str, external_id: str, code: str) -> UUID | None:
    """Atomically move a pending row to linked. Returns the user id, or None when no pending row matches."""
    async with db.neon() as conn:
        cur = await conn.execute(
            "update channel_links set external_id = %s, status = 'linked', linked_at = now() "
            "where link_code = %s and channel = %s and status = 'pending' returning user_id",
            (external_id, code, channel))
        row = await cur.fetchone()
    return row["user_id"] if row else None


async def display_name(user_id: UUID) -> str | None:
    async with db.neon() as conn:
        cur = await conn.execute("select display_name from profiles where user_id = %s", (user_id,))
        row: dict[str, Any] | None = await cur.fetchone()
    return row["display_name"] if row else None


async def handle_unknown(channel: str, external_id: str, text: str) -> str:
    """Reply for a sender that has no linked row. Never raises."""
    url = settings().public_web_url
    code = extract_code(text)
    try:
        if code:
            user_id = await claim_code(channel, external_id, code)
            if user_id is not None:
                log.info("channels.linked channel=%s user=%s", channel, user_id)
                try:
                    name = await display_name(user_id)
                except Exception:
                    name = None
                return welcome_text(name)
    except Exception as exc:
        log.warning("channels.link_failed channel=%s err=%s", channel, type(exc).__name__)
        return "Sorry, I could not link your account right now. Please try again in a minute."
    return unknown_text(url, bad_code=code is not None)
