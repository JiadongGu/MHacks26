from uuid import UUID

from app.core import db


async def list_picks(user_id: UUID) -> list[str]:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select key from focus_areas where user_id = %s order by picked_at, key", (user_id,)
        )
        return [r["key"] for r in await cur.fetchall()]


async def replace_picks(user_id: UUID, keys: list[str]) -> None:
    """Make the saved picks exactly `keys`. Existing picks keep their original picked_at."""
    async with db.neon() as conn, conn.transaction():
        await conn.execute("delete from focus_areas where user_id = %s and key <> all(%s)", (user_id, keys))
        for key in keys:
            await conn.execute(
                "insert into focus_areas (user_id, key) values (%s, %s) on conflict do nothing",
                (user_id, key),
            )
