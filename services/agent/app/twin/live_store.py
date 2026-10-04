"""Rows that link a Pulse user to their FinchNode Connect session and subject."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.core import db


async def upsert_pending(user_id: UUID, session_id: str) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "insert into finchnode_connections (user_id, session_id, status) values (%s, %s, 'pending') "
            "on conflict (user_id) do update set session_id = excluded.session_id, subject = null, "
            "status = 'pending', imported_at = null, created_at = now()",
            (user_id, session_id),
        )


async def load(user_id: UUID) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select user_id, session_id, subject, status, imported_at "
            "from finchnode_connections where user_id = %s",
            (user_id,),
        )
        return await cur.fetchone()


async def by_session(session_id: str) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select user_id, session_id, subject, status, imported_at from finchnode_connections "
            "where session_id = %s",
            (session_id,),
        )
        return await cur.fetchone()


async def by_subject(subject: str) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select user_id, session_id, subject, status, imported_at from finchnode_connections "
            "where subject = %s",
            (subject,),
        )
        return await cur.fetchone()


async def set_connected(user_id: UUID, subject: str) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "update finchnode_connections set subject = %s, status = 'connected' where user_id = %s",
            (subject, user_id),
        )


async def set_status(user_id: UUID, status: str) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "update finchnode_connections set status = %s where user_id = %s", (status, user_id)
        )


async def mark_imported(user_id: UUID) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "update finchnode_connections set imported_at = now() where user_id = %s", (user_id,)
        )


async def delete(user_id: UUID) -> None:
    async with db.neon() as conn:
        await conn.execute("delete from finchnode_connections where user_id = %s", (user_id,))


async def first_seen(event_id: str) -> bool:
    """Record a webhook event id. False if it was already handled."""
    async with db.neon() as conn:
        cur = await conn.execute(
            "insert into finchnode_events (id) values (%s) on conflict (id) do nothing returning id",
            (event_id,),
        )
        return await cur.fetchone() is not None
