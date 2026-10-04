from datetime import date, datetime
from typing import Any
from uuid import UUID

from psycopg.types.json import Jsonb

from app.core import db


async def load_profile(user_id: UUID) -> dict[str, Any]:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select display_name, timezone, bed_time, wake_time from profiles where user_id = %s", (user_id,)
        )
        return await cur.fetchone() or {}


async def events_between(user_id: UUID, start: datetime, end: datetime) -> list[dict[str, Any]]:
    """Cached primary-calendar events that overlap [start, end)."""
    async with db.neon() as conn:
        cur = await conn.execute(
            "select title, starts_at, ends_at, is_important from calendar_events_cache "
            "where user_id = %s and starts_at < %s and ends_at > %s order by starts_at",
            (user_id, end, start),
        )
        return await cur.fetchall()


async def get_plan(user_id: UUID, day: date) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select day, load, headline, bed_time, wake_time, items, created_at from daily_plans "
            "where user_id = %s and day = %s",
            (user_id, day),
        )
        return await cur.fetchone()


async def save_plan(
    user_id: UUID, day: date, load: str, headline: str, bed: str | None, wake: str | None, items: list[dict]
) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "insert into daily_plans (user_id, day, load, headline, bed_time, wake_time, items) "
            "values (%s, %s, %s, %s, %s, %s, %s) on conflict (user_id, day) do update set "
            "load = excluded.load, headline = excluded.headline, bed_time = excluded.bed_time, "
            "wake_time = excluded.wake_time, items = excluded.items, created_at = now()",
            (user_id, day, load, headline, bed, wake, Jsonb(items)),
        )


async def set_items(user_id: UUID, day: date, items: list[dict]) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "update daily_plans set items = %s where user_id = %s and day = %s", (Jsonb(items), user_id, day)
        )
