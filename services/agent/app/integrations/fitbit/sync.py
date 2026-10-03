import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from app.contracts import IngestBatch
from app.core.logging import log
from app.ingest.writer import ingest_batch, user_timezone

from . import normalize, store
from .client import AccountNotLinked, HealthClient

LOOKBACK_MIN = 30
BACKFILL_MIN = 360
# Daily metrics (resting HR, HRV, sleep) are fetched by whole civil days. The writer replaces a day's
# row from the batch, so each poll must carry every point for the days it covers.
DAILY_LOOKBACK_DAYS = 2
BACKFILL_DAYS = 7


def _fetch(
    row: dict[str, Any], user_id: UUID, minutes: int, days: int, tz: str
) -> tuple[IngestBatch, dict[str, Any] | None]:
    client = HealthClient(row)
    end = datetime.now(UTC)
    start = end - timedelta(minutes=minutes)
    today = end.astimezone(ZoneInfo(tz)).date()
    since = today - timedelta(days=days - 1)
    samples = normalize.heart_rate_samples(user_id, client.heart_rate(start, end))
    samples += normalize.steps_samples(user_id, client.steps(start, end))
    samples += normalize.spo2_samples(user_id, client.spo2(start, end))
    samples += normalize.active_minutes_samples(user_id, client.active_minutes(start, end))
    samples += normalize.resting_hr_samples(user_id, client.daily("daily-resting-heart-rate", since, today))
    samples += normalize.hrv_samples(user_id, client.daily("daily-heart-rate-variability", since, today))
    samples += normalize.sleep_samples(user_id, client.sleep(since, today))
    return IngestBatch(source="fitbit", samples=samples), (client.row if client.refreshed else None)


async def sync_user(user_id: UUID, minutes: int = LOOKBACK_MIN, days: int = DAILY_LOOKBACK_DAYS) -> int:
    """Pull recent data from Google Health and hand it to the shared ingest writer.

    Windows overlap between polls; the writer and the Spacetime `ingest` reducer are idempotent on
    (user_id, metric, source, ts_ms). Raises LookupError if the user has not connected Fitbit.
    """
    row = await store.load(user_id)
    if not row:
        raise LookupError("fitbit not connected")
    tz = await user_timezone(user_id)
    batch, new_row = await asyncio.to_thread(_fetch, row, user_id, minutes, days, tz)
    if new_row:
        await store.save(user_id, new_row)
    n = await ingest_batch(batch)
    await store.mark_synced(user_id)
    return n


async def sync_all() -> None:
    for user_id in await store.connected_users():
        try:
            await sync_user(user_id)
        except AccountNotLinked:
            # Nothing will ever sync for this account. Drop the connection so the UI offers Connect again.
            log.warning("event=fitbit_account_not_linked_removed user=%s", user_id)
            await store.delete(user_id)
        except Exception as e:  # one bad token must not stop the sweep
            log.warning("event=fitbit_sync_failed user=%s err=%s", user_id, e)
