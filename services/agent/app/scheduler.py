from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler(timezone="UTC", job_defaults={"coalesce": True, "misfire_grace_time": 300})
last_tick: datetime | None = None


async def _heartbeat() -> None:
    global last_tick
    last_tick = datetime.now(UTC)


def start() -> None:
    from app.agents.live import sweep_all
    from app.integrations.gcal.sync import refresh_all as gcal_refresh

    scheduler.add_job(_heartbeat, "interval", minutes=1, id="heartbeat", next_run_time=datetime.now(UTC))
    scheduler.add_job(sweep_all, "interval", minutes=1, id="live_sweep", max_instances=1)
    scheduler.add_job(gcal_refresh, "interval", minutes=30, id="gcal_refresh", max_instances=1)
    scheduler.start()


def stop() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
