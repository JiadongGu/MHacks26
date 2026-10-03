import logging
import time
from dataclasses import dataclass
from datetime import UTC, datetime
from datetime import time as dtime
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

import httpx
from psycopg.types.json import Jsonb

from app.core import db
from app.core.config import settings

log = logging.getLogger("pulse.notify")

GATEWAY_TIMEOUT_S = 5.0


@dataclass
class NotifyState:
    tz: str = "UTC"
    quiet_hours: dict[str, str] | None = None
    imessage_to: str | None = None
    proposal_title: str | None = None
    proposal_pending: bool = False


def _now() -> datetime:
    return datetime.now(UTC)


def _parse_hhmm(value: Any) -> dtime | None:
    if isinstance(value, dtime):
        return value
    try:
        return dtime.fromisoformat(str(value))
    except ValueError:
        return None


def in_quiet_hours(now: datetime, tz: str, quiet: dict[str, Any] | None) -> bool:
    """True when the local time is inside {start, end}. The range can wrap past midnight."""
    if not quiet:
        return False
    start, end = _parse_hhmm(quiet.get("start")), _parse_hhmm(quiet.get("end"))
    if start is None or end is None or start == end:
        return False
    try:
        zone = ZoneInfo(tz)
    except Exception:
        zone = UTC
    t = now.astimezone(zone).time()
    return start <= t < end if start < end else (t >= start or t < end)


def build_text(alert_row: dict[str, Any], state: NotifyState) -> str:
    text = str(alert_row.get("body") or alert_row.get("title") or "")
    if state.proposal_pending:
        name = f' "{state.proposal_title}"' if state.proposal_title else ""
        text += f"\n\nReply YES to approve{name} or NO to skip."
    return text


async def _load_state(user_id: UUID, proposal_id: Any) -> NotifyState:
    state = NotifyState()
    async with db.neon() as conn:
        cur = await conn.execute("select timezone, quiet_hours from profiles where user_id = %s", (user_id,))
        prof = await cur.fetchone()
        if prof:
            state.tz = prof["timezone"] or "UTC"
            state.quiet_hours = prof["quiet_hours"]
        cur = await conn.execute(
            "select external_id from channel_links where user_id = %s and channel = 'imessage' "
            "and status = 'linked' order by linked_at desc nulls last limit 1", (user_id,))
        link = await cur.fetchone()
        if link:
            state.imessage_to = link["external_id"]
        if proposal_id:
            cur = await conn.execute(
                "select title, status from calendar_proposals where id = %s", (proposal_id,))
            prop = await cur.fetchone()
            if prop and prop["status"] == "pending":
                state.proposal_pending, state.proposal_title = True, prop["title"]
    return state


async def _send_imessage(to: str, text: str) -> bool:
    s = settings()
    if not s.gateway_url:
        return False
    try:
        async with httpx.AsyncClient(timeout=GATEWAY_TIMEOUT_S) as client:
            r = await client.post(f"{s.gateway_url.rstrip('/')}/send", json={"to": to, "text": text},
                                  headers={"Authorization": f"Bearer {s.gateway_secret}"})
            r.raise_for_status()
        return True
    except Exception as exc:
        log.warning("notify.gateway_failed err=%s", type(exc).__name__)
        return False


async def _persist(user_id: UUID, alert_id: Any, channels: list[str], imessage_text: str | None) -> None:
    async with db.neon() as conn:
        if imessage_text is not None:
            await conn.execute(
                "insert into messages (user_id, channel, direction, text) values (%s, 'imessage', 'out', %s)",
                (user_id, imessage_text))
        await conn.execute("update alerts set channels = %s where id = %s", (Jsonb(channels), alert_id))


async def dispatch(user_id: UUID, alert_row: dict[str, Any]) -> list[str]:
    """Deliver an alert. Returns the channels used. Never raises."""
    started = time.monotonic()
    channels = ["web"]
    try:
        try:
            state = await _load_state(user_id, alert_row.get("proposal_id"))
        except Exception as exc:
            log.warning("notify.state_failed err=%s", type(exc).__name__)
            state = NotifyState()
        urgent = alert_row.get("severity") == "urgent"
        quiet = in_quiet_hours(_now(), state.tz, state.quiet_hours)
        text = build_text(alert_row, state)
        sent_text = None
        if state.imessage_to and (urgent or not quiet) and await _send_imessage(state.imessage_to, text):
            channels.append("imessage")
            sent_text = text
        elif state.imessage_to and quiet and not urgent:
            log.info("notify.quiet_hours alert=%s", alert_row.get("id"))
        try:
            await _persist(user_id, alert_row.get("id"), channels, sent_text)
        except Exception as exc:
            log.warning("notify.persist_failed alert=%s err=%s", alert_row.get("id"), type(exc).__name__)
    except Exception as exc:
        log.warning("notify.failed alert=%s err=%s", alert_row.get("id"), type(exc).__name__)
    log.info("notify.dispatch alert=%s channels=%s ms=%d", alert_row.get("id"), ",".join(channels),
             (time.monotonic() - started) * 1000)
    return channels
