from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI

from app import scheduler
from app.contracts import Health
from app.core import db
from app.core.config import settings
from app.core.logging import setup as setup_logging


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_logging()
    await db.open_pools()
    if settings().scheduler_enabled:
        scheduler.start()
    yield
    scheduler.stop()
    await db.close_pools()


app = FastAPI(title="Pulse agent", lifespan=lifespan)


@app.get("/health", response_model=Health)
async def health() -> Health:
    s = settings()
    gateway = False
    if s.gateway_url:
        try:
            async with httpx.AsyncClient(timeout=3) as c:
                gateway = (await c.get(f"{s.gateway_url}/health")).is_success
        except httpx.HTTPError:
            pass
    neon_ok = await db.ping("neon") if s.database_url else False
    tiger_ok = await db.ping("tiger") if (s.tiger_database_url or s.database_url) else False
    return Health(ok=True, db=neon_ok, tiger=tiger_ok, scheduler_last_tick=scheduler.last_tick,
                  gateway=gateway)


# Router registration: append one line per router, never reorder.
from app.twin.api import router as twin_router  # noqa: E402

app.include_router(twin_router)
from app.goals.api import router as goals_router  # noqa: E402

app.include_router(goals_router)
from app.integrations.gcal.router import public as gcal_public  # noqa: E402
from app.integrations.gcal.router import router as gcal_router  # noqa: E402

app.include_router(gcal_public)
app.include_router(gcal_router)
from app.proposals.api import router as proposals_router  # noqa: E402

app.include_router(proposals_router)
from app.integrations.fitbit.router import public as fitbit_public  # noqa: E402
from app.integrations.fitbit.router import router as fitbit_router  # noqa: E402

app.include_router(fitbit_public)
app.include_router(fitbit_router)
from app.ingest.router import router as ingest_router  # noqa: E402
from app.integrations.apple_sim.router import router as sim_router  # noqa: E402

app.include_router(ingest_router)
app.include_router(sim_router)
from app.vitals.router import router as vitals_router  # noqa: E402

app.include_router(vitals_router)
