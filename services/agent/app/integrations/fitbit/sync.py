import asyncio
import json
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from app.agents.live import on_samples_ingested
from app.contracts import IngestBatch
from app.core import spacetime
from app.core.logging import log

from . import normalize, store
from .client import HealthClient

LOOKBACK_MIN = 30
BACKFILL_MIN = 360
CHUNK = 1000


def spacetime_rows(batch: IngestBatch) -> list[dict[str, Any]]:
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
        for s in batch.samples
    ]


def _fetch(row: dict[str, Any], user_id: UUID, minutes: int) -> tuple[IngestBatch, dict[str, Any] | None]:
    client = HealthClient(row)
    end = datetime.now(UTC)
    start = end - timedelta(minutes=minutes)
    samples = normalize.heart_rate_samples(user_id, client.heart_rate(start, end))
    samples += normalize.steps_samples(user_id, client.steps(start, end))
    return IngestBatch(source="fitbit", samples=samples), (client.row if client.refreshed else None)


async def sync_user(user_id: UUID, minutes: int = LOOKBACK_MIN) -> int:
    """Pull the last `minutes` from Google Health and write them to the live pool.

    Windows overlap between polls, so the Spacetime `ingest` reducer must be idempotent on
    (user_id, metric, source, ts_ms). Raises LookupError if the user has not connected Fitbit.
    """
    row = await store.load(user_id)
    if not row:
        raise LookupError("fitbit not connected")
    batch, new_row = await asyncio.to_thread(_fetch, row, user_id, minutes)
    if new_row:
        await store.save(user_id, new_row)
    rows = spacetime_rows(batch)
    for i in range(0, len(rows), CHUNK):
        await spacetime.call("ingest", [rows[i : i + CHUNK]])
    await store.mark_synced(user_id)
    if rows:
        await on_samples_ingested(user_id, sorted({s.metric for s in batch.samples}))
    return len(rows)


async def sync_all() -> None:
    for user_id in await store.connected_users():
        try:
            await sync_user(user_id)
        except Exception as e:  # one bad token must not stop the sweep
            log.warning("event=fitbit_sync_failed user=%s err=%s", user_id, e)
