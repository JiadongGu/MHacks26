import json
from collections import defaultdict
from datetime import date
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from app.agents.live import on_samples_ingested
from app.contracts import IngestBatch, VitalsSample
from app.core import db, spacetime
from app.core.logging import log

from .daily import EVENT_METRICS, POINT_METRICS, aggregate_minutes, aggregate_values, day_bounds_ms, local_day

CHUNK = 1000


def spacetime_rows(samples: list[VitalsSample]) -> list[dict[str, Any]]:
    return [
        {
            "user_id": str(s.user_id),
            "metric": s.metric,
            "value": s.value,
            "unit": s.unit,
            "source": s.source,
            "ts_ms": int(s.ts.timestamp() * 1000),
            "meta_json": json.dumps(s.meta) if s.meta else "",
        }
        for s in samples
    ]


async def user_timezone(user_id: UUID) -> str:
    """profiles.timezone, else the twin's profile timezone, else UTC."""
    tz = None
    try:
        async with db.neon() as conn:
            cur = await conn.execute("select timezone from profiles where user_id = %s", (user_id,))
            tz = ((await cur.fetchone()) or {}).get("timezone")
            if not tz:
                cur = await conn.execute(
                    "select model->'profile'->>'timezone' as tz from digital_twin "
                    "where user_id = %s order by version desc limit 1",
                    (user_id,),
                )
                tz = ((await cur.fetchone()) or {}).get("tz")
    except RuntimeError:  # DATABASE_URL not configured (local dev)
        return "UTC"
    try:
        ZoneInfo(tz or "UTC")
    except Exception:
        return "UTC"
    return tz or "UTC"


async def _minute_aggregate(user_id: UUID, metric: str, day: date, tz: str) -> dict[str, Any] | None:
    if not spacetime.configured():
        return None
    start, end = day_bounds_ms(day, tz)
    await spacetime.ensure_watching(user_id)
    rows = await spacetime.sql(
        f"SELECT * FROM {spacetime.table('minute_agg')} "
        f"WHERE user_id = '{UUID(str(user_id))}' AND metric = '{metric}' "
        f"AND minute_ms >= {start} AND minute_ms < {end}"
    )
    return aggregate_minutes(rows)


async def _upsert_daily(user_id: UUID, samples: list[VitalsSample], tz: str) -> None:
    groups: dict[tuple[date, str], list[float]] = defaultdict(list)
    for s in samples:
        if s.metric not in EVENT_METRICS:
            groups[(local_day(s.ts, tz), s.metric)].append(s.value)
    for (day, metric), values in groups.items():
        agg = (
            aggregate_values(values)
            if metric in POINT_METRICS
            else await _minute_aggregate(user_id, metric, day, tz)
        )
        if agg is None:
            continue
        async with db.neon() as conn:
            await conn.execute(
                "insert into daily_summary (user_id, day, metric, avg, min, max, sum, n) "
                "values (%s, %s, %s, %s, %s, %s, %s, %s) on conflict (user_id, day, metric) do update set "
                "avg = excluded.avg, min = excluded.min, max = excluded.max, "
                "sum = excluded.sum, n = excluded.n",
                (user_id, day, metric, agg["avg"], agg["min"], agg["max"], agg["sum"], agg["n"]),
            )


async def _log(user_id: UUID, source: str, n: int) -> None:
    async with db.neon() as conn:
        await conn.execute(
            "insert into ingest_log (user_id, source, n) values (%s, %s, %s)", (user_id, source, n)
        )


async def ingest_batch(batch: IngestBatch) -> int:
    """Write to the live pool, refresh daily_summary, then let the live agent react. Idempotent on resend."""
    if not batch.samples:
        return 0
    if spacetime.configured():
        rows = spacetime_rows(batch.samples)
        for i in range(0, len(rows), CHUNK):
            await spacetime.call("ingest", [rows[i : i + CHUNK]])
    else:
        log.warning("event=ingest_spacetime_skipped reason=not_configured n=%s", len(batch.samples))
    by_user: dict[UUID, list[VitalsSample]] = defaultdict(list)
    for s in batch.samples:
        by_user[s.user_id].append(s)
    for user_id, samples in by_user.items():
        try:
            await _upsert_daily(user_id, samples, await user_timezone(user_id))
            await _log(user_id, batch.source, len(samples))
        except Exception as e:  # the live-pool write already succeeded; do not fail the batch
            log.warning("event=ingest_daily_failed user=%s err=%s", user_id, e)
        await on_samples_ingested(user_id, sorted({s.metric for s in samples}))
    return len(batch.samples)
