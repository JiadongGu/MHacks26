"""Link-code flow. The web app creates `channel_links` rows with a code. The first inbound text links them."""

import logging
import re
import time
from collections import defaultdict, deque
from typing import Any
from uuid import UUID

from app.core import db
from app.core.config import settings

log = logging.getLogger("pulse.channels")

LINK_RE = re.compile(r"PULSE-[A-Z0-9]{6}", re.IGNORECASE)
CODE_TTL_MIN = 15
MAX_FAILED = 5
FAILED_WINDOW_S = 600
_failed: dict[str, deque[float]] = defaultdict(deque)


def _too_many_failures(channel: str, external_id: str, now: float | None = None) -> bool:
    q = _failed[f"{channel}:{external_id}"]
    now = time.monotonic() if now is None else now
    while q and now - q[0] > FAILED_WINDOW_S:
        q.popleft()
    return len(q) >= MAX_FAILED


def _record_failure(channel: str, external_id: str, now: float | None = None) -> None:
    _failed[f"{channel}:{external_id}"].append(time.monotonic() if now is None else now)


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


def welcome_text(display_name: str | None, channel: str = "imessage") -> str:
    name = (display_name or "").strip()
    who = f", {name}" if name else ""
    if channel == "asi_one":
        return (f"Welcome to Pulse{who}! You are linked. Ask me here about your sleep, steps, heart rate "
                "or goals, or ask me to block time on your calendar. Health alerts still arrive by iMessage.")
    return (f"Welcome to Pulse{who}! You are linked. I will text you health alerts and calendar "
            "suggestions. Reply STATUS any time, or ask me about your steps, sleep, or heart rate.")


def unknown_text(url: str, bad_code: bool, channel: str = "imessage") -> str:
    if channel == "asi_one":
        base = f"Send the PULSE-XXXXXX code from the ASI:One step of Pulse onboarding, or sign up at {url}"
    else:
        base = f"Text your PULSE-XXXXXX code from Pulse onboarding, or sign up at {url}"
    return f"That code did not match or has expired. {base}" if bad_code else base


async def claim_code(channel: str, external_id: str, code: str) -> UUID | None:
    """Atomically move a pending row to linked. Returns the user id, or None when no pending row matches."""
    async with db.neon() as conn:
        cur = await conn.execute(
            "update channel_links set external_id = %s, status = 'linked', linked_at = now() "
            "where link_code = %s and channel = %s and status = 'pending' "
            "and created_at > now() - make_interval(mins => %s) returning user_id",
            (external_id, code, channel, CODE_TTL_MIN))
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
    if code and _too_many_failures(channel, external_id):
        return "Too many wrong codes. Wait 10 minutes, then send the code shown in Pulse onboarding."
    try:
        if code:
            user_id = await claim_code(channel, external_id, code)
            if user_id is None:
                _record_failure(channel, external_id)
            else:
                log.info("channels.linked channel=%s user=%s", channel, user_id)
                try:
                    name = await display_name(user_id)
                except Exception:
                    name = None
                return welcome_text(name, channel)
    except Exception as exc:
        log.warning("channels.link_failed channel=%s err=%s", channel, type(exc).__name__)
        return "Sorry, I could not link your account right now. Please try again in a minute."
    return unknown_text(url, bad_code=code is not None, channel=channel)
