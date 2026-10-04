"""Demo controls. Drive the simulator and run Compass jobs."""

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.agents import compass
from app.contracts import ScenarioRequest
from app.core.auth import require_internal
from app.integrations.apple_sim import engine

log = logging.getLogger("pulse.demo")

router = APIRouter(prefix="/demo", tags=["demo"], dependencies=[Depends(require_internal)])

async def forward_scenario(body: ScenarioRequest) -> dict[str, Any]:
    """Switch the in-process Apple Watch simulator (P's `apple_sim.engine`)."""
    try:
        n = await engine.activate(body.user_id, body.scenario, body.fast_forward_min)
    except Exception as exc:
        log.exception("demo.scenario_failed user=%s scenario=%s", body.user_id, body.scenario)
        raise HTTPException(502, f"simulator failed ({type(exc).__name__})") from exc
    return {"forwarded": True, "upstream": {"scenario": body.scenario, "emitted": n}}


@router.post("/scenario")
async def scenario(body: ScenarioRequest) -> dict[str, Any]:
    out = await forward_scenario(body)
    if body.scenario == "great_sleep":
        out["checkin"] = await compass.run_checkin(body.user_id)
    return out


@router.post("/checkin")
async def checkin(user_id: UUID) -> dict[str, bool]:
    """A check-in now, any time of day. Saved to the dashboard, never texted."""
    return {"ran": await compass.run_checkin(user_id)}


@router.post("/rebuild")
async def rebuild(user_id: UUID) -> dict[str, bool]:
    return {"ran": await compass.run_rebuild(user_id, force=True)}


@router.post("/reset")
async def reset(user_id: UUID) -> dict[str, int]:
    """Clear cooldowns and leftover approvals so the next scenario fires on stage."""
    return await compass.reset_demo(user_id)
