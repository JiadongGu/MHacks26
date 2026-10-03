from datetime import UTC, datetime, timedelta
from typing import Annotated, get_args
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.contracts import DailySummary, Metric
from app.core import db, spacetime
from app.core.auth import require_internal
from app.core.logging import log
from app.ingest.daily import local_day
from app.ingest.writer import user_timezone

from . import service

router = APIRouter(dependencies=[Depends(require_internal)])

RETENTION = timedelta(hours=48)
DEFAULT_WINDOW = timedelta(hours=3)
LATEST_DEFAULT = "heart_rate,steps,spo2"
KNOWN = set(get_args(Metric))


def _ms(t: datetime) -> int:
    return int(t.timestamp() * 1000)


async def _minute_rows(user_id: UUID, where: str, start: datetime, end: datetime) -> list[dict]:
    try:
        return await spacetime.sql(
            f"SELECT * FROM minute_agg WHERE user_id = '{user_id}' AND {where} "
            f"minute_ms >= {_ms(start)} AND minute_ms < {_ms(end)}"
        )
    except httpx.HTTPError as e:
        log.warning("event=vitals_read_failed err=%s", e)
        raise HTTPException(503, "live pool unavailable") from e


@router.get("/vitals/series")
async def vitals_series(
    user_id: UUID,
    metric: Metric,
    from_: Annotated[datetime | None, Query(alias="from")] = None,
    to: datetime | None = None,
    bucket: service.Bucket = "1m",
) -> list[dict]:
    """[{ts, value}] oldest first, from the live pool (48 h). Empty until Spacetime is configured."""
    end = to or datetime.now(UTC)
    start = from_ or end - DEFAULT_WINDOW
    if start >= end or end - start > RETENTION:
        raise HTTPException(422, "window must be positive and at most 48 hours; use /vitals/daily for longer")
    if not spacetime.configured():
        return []
    rows = await _minute_rows(user_id, f"metric = '{metric}' AND ", start, end)
    return service.series(rows, metric, bucket)


@router.get("/vitals/latest")
async def vitals_latest(user_id: UUID, metrics: str = LATEST_DEFAULT) -> dict[str, dict]:
    """Latest value per metric from the last 24 h, e.g. {"heart_rate": {"ts": "...", "value": 72.0}}."""
    wanted = [m for m in (x.strip() for x in metrics.split(",")) if m]
    unknown = [m for m in wanted if m not in KNOWN]
    if unknown or not wanted:
        raise HTTPException(422, f"unknown metrics: {unknown or metrics}")
    if not spacetime.configured():
        return {}
    now = datetime.now(UTC)
    clause = "(" + " OR ".join(f"metric = '{m}'" for m in wanted) + ") AND "
    return service.latest(
        await _minute_rows(user_id, clause, now - timedelta(hours=24), now + timedelta(minutes=1))
    )


@router.get("/vitals/daily", response_model=list[DailySummary])
async def vitals_daily(user_id: UUID, days: Annotated[int, Query(ge=1, le=60)] = 7) -> list[DailySummary]:
    since = local_day(datetime.now(UTC), await user_timezone(user_id)) - timedelta(days=days - 1)
    async with db.neon() as conn:
        cur = await conn.execute(
            "select day, metric, avg, min, max, sum, n from daily_summary "
            "where user_id = %s and day >= %s order by day, metric",
            (user_id, since),
        )
        rows = await cur.fetchall()
    return [DailySummary(user_id=user_id, **r) for r in rows]
