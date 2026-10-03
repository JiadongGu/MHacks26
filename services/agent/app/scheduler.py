from datetime import UTC, datetime

from apscheduler.schedulers.asyncio import AsyncIOScheduler

scheduler = AsyncIOScheduler(timezone="UTC", job_defaults={"coalesce": True, "misfire_grace_time": 300})
last_tick: datetime | None = None


async def _heartbeat() -> None:
    global last_tick
    last_tick = datetime.now(UTC)


def start() -> None:
    scheduler.add_job(_heartbeat, "interval", minutes=1, id="heartbeat", next_run_time=datetime.now(UTC))
    scheduler.start()


def stop() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
