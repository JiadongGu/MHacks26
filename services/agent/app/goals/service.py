from __future__ import annotations

import time
from datetime import UTC, datetime
from uuid import UUID

from app.contracts import Goal, GoalProgress
from app.core.logging import log
from app.goals import progress, store
from app.twin import store as twin_store
from app.twin.tz import local_now


async def compute_for_user(user_id: UUID, now_utc: datetime | None = None) -> list[GoalProgress]:
    """Progress of every active goal. Two reads, no query in a loop. Caches the result in goal_progress."""
    started = time.monotonic()
    goals = [Goal(**row) for row in await store.list_goals(user_id)]
    if not goals:
        return []
    profile = await twin_store.profile_row(user_id)
    now_local = local_now((profile or {}).get("timezone"), now_utc or datetime.now(UTC))
    today = now_local.date()
    start = progress.earliest_start(goals, today)
    rows = await twin_store.daily_rows(user_id, start, today, sorted({g.metric for g in goals}))
    results = [progress.compute_progress(g, rows, now_local) for g in goals]
    try:
        await store.upsert_progress(results)
    except Exception:
        log.exception("event=goal_progress_cache_failed user=%s", user_id)
    log.info(
        "event=goal_progress user=%s goals=%d ms=%d",
        user_id,
        len(goals),
        int((time.monotonic() - started) * 1000),
    )
    return results
