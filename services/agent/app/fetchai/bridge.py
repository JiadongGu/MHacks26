"""Glue between ASI:One chat messages and the agent API. No uAgents imports, so it is easy to test."""

import logging
from typing import Any

import httpx

from app.core.config import settings

log = logging.getLogger("pulse.fetchai")

TIMEOUT = httpx.Timeout(30.0)
MAX_REPLY = 4000
FALLBACK = "Sorry, I could not reach Pulse just now. Please try again in a minute."
GREETING = (
    "Hi, I am Pulse, your personal health agent. Ask me how you slept, how your steps look this week, "
    "or to block sleep on your calendar. New here? Send your PULSE-XXXXXX code from the ASI:One step of onboarding."
)


def extract_text(content: list[Any]) -> str:
    """Join the text parts of a chat message. Other content types are ignored."""
    return "\n".join(c.text for c in content if getattr(c, "type", None) == "text" and getattr(c, "text", ""))


async def ask_pulse(sender: str, text: str, message_id: str, client: httpx.AsyncClient | None = None) -> str:
    """Send one message to /agent/inbound as channel asi_one. Never raises."""
    s = settings()
    url = f"{s.public_agent_url.rstrip('/')}/agent/inbound"
    body = {"channel": "asi_one", "external_id": sender, "text": text, "message_id": message_id}
    headers = {"X-Internal-Token": s.internal_token}
    try:
        if client is not None:
            resp = await client.post(url, json=body, headers=headers)
        else:
            async with httpx.AsyncClient(timeout=TIMEOUT) as c:
                resp = await c.post(url, json=body, headers=headers)
        resp.raise_for_status()
        reply = str(resp.json()["reply"]).strip()
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as exc:
        log.warning("fetchai.inbound_failed err=%s", type(exc).__name__)
        return FALLBACK
    return reply[:MAX_REPLY] or FALLBACK
