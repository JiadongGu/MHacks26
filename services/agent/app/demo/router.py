"""Demo controls. Forward scenarios to the simulator and force Compass jobs."""

import logging
from typing import Any
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.agents import compass
from app.contracts import ScenarioRequest
from app.core.auth import require_internal
from app.core.config import settings

log = logging.getLogger("pulse.demo")

router = APIRouter(prefix="/demo", tags=["demo"], dependencies=[Depends(require_internal)])

FORWARD_TIMEOUT_S = 15.0


async def forward_scenario(body: ScenarioRequest) -> dict[str, Any]:
    """POST the scenario to the simulator. A 404 means the simulator is not deployed yet."""
    s = settings()
    url = f"{s.public_agent_url.rstrip('/')}/sim/scenario"
    try:
        async with httpx.AsyncClient(timeout=FORWARD_TIMEOUT_S) as client:
            r = await client.post(url, json=body.model_dump(mode="json"),
                                  headers={"X-Internal-Token": s.internal_token})
    except httpx.HTTPError as exc:
        raise HTTPException(502, f"simulator unreachable ({type(exc).__name__})") from exc
    if r.status_code == 404:
        return {"forwarded": False}
    if r.is_error:
        raise HTTPException(502, f"simulator returned {r.status_code}")
    try:
        upstream: Any = r.json()
    except ValueError:
        upstream = None
    return {"forwarded": True, "upstream": upstream}


@router.post("/scenario")
async def scenario(body: ScenarioRequest) -> dict[str, Any]:
    out = await forward_scenario(body)
    if body.scenario == "great_sleep":
        out["briefing"] = await compass.run_briefing(body.user_id, force=True)
    return out


@router.post("/briefing")
async def briefing(user_id: UUID) -> dict[str, bool]:
    return {"ran": await compass.run_briefing(user_id, force=True)}


@router.post("/rebuild")
async def rebuild(user_id: UUID) -> dict[str, bool]:
    return {"ran": await compass.run_rebuild(user_id, force=True)}
