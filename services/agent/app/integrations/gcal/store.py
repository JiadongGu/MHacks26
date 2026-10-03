from typing import Any
from uuid import UUID

from cryptography.fernet import Fernet

from app.core import db
from app.core.config import settings


def fernet() -> Fernet:
    return Fernet(settings().secret_key.encode())


async def save(user_id: UUID, refresh_token: str, email: str | None, health_calendar_id: str | None) -> None:
    enc = fernet().encrypt(refresh_token.encode()).decode()
    async with db.neon() as conn:
        await conn.execute(
            "insert into calendar_connections (user_id, google_email, refresh_token_enc, health_calendar_id) "
            "values (%s, %s, %s, %s) on conflict (user_id) do update set "
            "google_email = excluded.google_email, refresh_token_enc = excluded.refresh_token_enc, "
            "health_calendar_id = excluded.health_calendar_id",
            (user_id, email, enc, health_calendar_id),
        )


async def load(user_id: UUID) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select google_email, refresh_token_enc, health_calendar_id, last_sync_at "
            "from calendar_connections where user_id = %s",
            (user_id,),
        )
        row = await cur.fetchone()
    if not row:
        return None
    row["refresh_token"] = fernet().decrypt(row.pop("refresh_token_enc").encode()).decode()
    return row


async def connected_users() -> list[UUID]:
    async with db.neon() as conn:
        cur = await conn.execute("select user_id from calendar_connections")
        return [r["user_id"] for r in await cur.fetchall()]


async def replace_cache(user_id: UUID, events: list[Any]) -> None:
    async with db.neon() as conn, conn.transaction():
        await conn.execute("delete from calendar_events_cache where user_id = %s", (user_id,))
        if events:
            async with conn.cursor() as cur:
                await cur.executemany(
                    "insert into calendar_events_cache "
                    "(user_id, event_id, title, starts_at, ends_at, is_important) "
                    "values (%s, %s, %s, %s, %s, %s)",
                    [(user_id, e.event_id, e.title, e.starts_at, e.ends_at, e.is_important) for e in events],
                )
        await conn.execute(
            "update calendar_connections set last_sync_at = now() where user_id = %s", (user_id,)
        )
