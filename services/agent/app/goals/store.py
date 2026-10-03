"""Neon access for goals. Table and column names follow PLAN section 5.2."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from app.contracts import GoalProgress
from app.core import db

_COLUMNS = "id, user_id, metric, target, period, direction, active"


async def list_goals(user_id: UUID, include_inactive: bool = False) -> list[dict[str, Any]]:
    sql = f"select {_COLUMNS} from goals where user_id = %s"
    if not include_inactive:
        sql += " and active"
    async with db.neon() as conn:
        cur = await conn.execute(sql + " order by created_at", (user_id,))
        return await cur.fetchall()


async def create_goal(
    user_id: UUID, metric: str, target: float, period: str, direction: str, active: bool
) -> dict[str, Any]:
    async with db.neon() as conn:
        cur = await conn.execute(
            "insert into goals (user_id, metric, target, period, direction, active, created_at) "
            f"values (%s, %s, %s, %s, %s, %s, now()) returning {_COLUMNS}",
            (user_id, metric, target, period, direction, active),
        )
        return await cur.fetchone()


async def update_goal(
    goal_id: UUID,
    user_id: UUID | None,
    target: float | None,
    period: str | None,
    direction: str | None,
    active: bool | None,
) -> dict[str, Any] | None:
    async with db.neon() as conn:
        cur = await conn.execute(
            "update goals set target = coalesce(%(target)s, target), period = coalesce(%(period)s, period), "
            "direction = coalesce(%(direction)s, direction), active = coalesce(%(active)s, active) "
            "where id = %(id)s and (%(user_id)s::uuid is null or user_id = %(user_id)s::uuid) "
            f"returning {_COLUMNS}",
            {
                "id": goal_id,
                "user_id": user_id,
                "target": target,
                "period": period,
                "direction": direction,
                "active": active,
            },
        )
        return await cur.fetchone()


async def upsert_progress(rows: list[GoalProgress]) -> None:
    if not rows:
        return
    async with db.neon() as conn, conn.cursor() as cur:
        await cur.executemany(
            'insert into goal_progress (goal_id, period_start, "current", pct, on_track, computed_at) '
            "values (%s, %s, %s, %s, %s, now()) on conflict (goal_id, period_start) do update set "
            '"current" = excluded."current", pct = excluded.pct, on_track = excluded.on_track, '
            "computed_at = excluded.computed_at",
            [(r.goal_id, r.period_start, r.current, r.pct, r.on_track) for r in rows],
        )
