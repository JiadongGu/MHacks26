from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from app.core import db
from app.integrations.gcal.store import fernet

# fitbit_connections.fitbit_user_id is NOT NULL, but the Google Health API exposes no legacy Fitbit id.
HEALTH_USER_PLACEHOLDER = "google-health"


async def save(user_id: UUID, row: dict[str, Any]) -> None:
    f = fernet()
    async with db.neon() as conn:
        await conn.execute(
            "insert into fitbit_connections "
            "(user_id, fitbit_user_id, access_token_enc, refresh_token_enc, expires_at, scopes) "
            "values (%s, %s, %s, %s, %s, %s) on conflict (user_id) do update set "
            "access_token_enc = excluded.access_token_enc, refresh_token_enc = excluded.refresh_token_enc, "
            "expires_at = excluded.expires_at, scopes = excluded.scopes",
            (
                user_id,
                HEALTH_USER_PLACEHOLDER,
                f.encrypt(row["access_token"].encode()).decode(),
                f.encrypt(row["refresh_token"].encode()).decode(),
                datetime.fromtimestamp(row["expires_at"], UTC),
                " ".join(row.get("scopes", [])),
            ),
        )


async def load(user_id: UUID) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select access_token_enc, refresh_token_enc, expires_at, scopes, last_sync_at "
            "from fitbit_connections where user_id = %s",
            (user_id,),
        )
        r = await cur.fetchone()
    if not r:
        return None
    f = fernet()
    return {
        "access_token": f.decrypt(r["access_token_enc"].encode()).decode(),
        "refresh_token": f.decrypt(r["refresh_token_enc"].encode()).decode(),
        "expires_at": r["expires_at"].timestamp(),
        "scopes": (r["scopes"] or "").split(),
        "last_sync_at": r["last_sync_at"],
    }


async def connected_users() -> list[UUID]:
    async with db.neon() as conn:
        cur = await conn.execute("select user_id from fitbit_connections")
        return [r["user_id"] for r in await cur.fetchall()]


async def mark_synced(user_id: UUID) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "update fitbit_connections set last_sync_at = now() where user_id = %s", (user_id,)
        )


async def delete(user_id: UUID) -> None:
    async with db.neon() as conn:
        await conn.execute("delete from fitbit_connections where user_id = %s", (user_id,))
