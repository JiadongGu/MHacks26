"""Neon access for the twin. Table and column names follow PLAN section 5.2."""

from __future__ import annotations

from datetime import date
from typing import Any
from uuid import UUID

from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb

from app.core import db
from app.core.logging import log

_INSERT_TWIN = """
insert into digital_twin (user_id, version, model, summary, created_at)
select %s, coalesce(max(version), 0) + 1, %s, %s, now() from digital_twin where user_id = %s
returning version, created_at
"""


async def profile_row(user_id: UUID) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select dob, sex, height_cm, weight_kg, timezone from profiles where user_id = %s", (user_id,)
        )
        return await cur.fetchone()


async def latest_twin(user_id: UUID) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select version, model, summary, created_at from digital_twin where user_id = %s "
            "order by version desc limit 1",
            (user_id,),
        )
        return await cur.fetchone()


async def list_versions(user_id: UUID) -> list[dict[str, Any]]:
    async with db.neon() as conn:
        cur = await conn.execute(
            "select version, created_at, summary from digital_twin where user_id = %s order by version desc",
            (user_id,),
        )
        return await cur.fetchall()


async def daily_rows(user_id: UUID, start: date, end: date, metrics: list[str]) -> list[dict[str, Any]]:
    async with db.neon() as conn:
        cur = await conn.execute(
            'select day, metric, avg, "min", "max", "sum", n from daily_summary '
            "where user_id = %s and day between %s and %s and metric = any(%s)",
            (user_id, start, end, metrics),
        )
        return await cur.fetchall()


async def _insert_twin(conn: Any, user_id: UUID, model: dict[str, Any], summary: str) -> int:
    # Two writers can pick the same version. The primary key rejects one, so retry that one.
    for attempt in range(5):
        try:
            async with conn.transaction():
                cur = await conn.execute(_INSERT_TWIN, (user_id, Jsonb(model), summary, user_id))
                row = await cur.fetchone()
            return int(row["version"])
        except UniqueViolation:
            log.warning("event=twin_version_conflict user=%s attempt=%d", user_id, attempt + 1)
    raise RuntimeError("twin version conflict")


async def insert_twin(user_id: UUID, model: dict[str, Any], summary: str) -> int:
    async with db.neon() as conn:
        return await _insert_twin(conn, user_id, model, summary)


async def save_import(
    user_id: UUID, scenario_id: str | None, categories: dict[str, Any], model: dict[str, Any], summary: str
) -> int:
    """Replace the user's FinchNode rows and insert the new twin version in one transaction."""
    async with db.neon() as conn, conn.transaction():
        await conn.execute("delete from ehr_records where user_id = %s and source = 'finchnode'", (user_id,))
        if categories:
            async with conn.cursor() as cur:
                await cur.executemany(
                    "insert into ehr_records (user_id, source, scenario_id, category, payload, imported_at) "
                    "values (%s, 'finchnode', %s, %s, %s, now())",
                    [(user_id, scenario_id, name, Jsonb(payload)) for name, payload in categories.items()],
                )
        return await _insert_twin(conn, user_id, model, summary)
