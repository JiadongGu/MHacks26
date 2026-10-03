from fastapi import APIRouter, Depends

from app.contracts import ScenarioRequest
from app.core.auth import require_internal

from . import engine

router = APIRouter(dependencies=[Depends(require_internal)])


# The web demo panel and onboarding call /demo/scenario; /sim/scenario is the contract name.
@router.post("/sim/scenario")
@router.post("/demo/scenario")
async def set_scenario(req: ScenarioRequest):
    n = await engine.activate(req.user_id, req.scenario, req.fast_forward_min)
    return {"user_id": str(req.user_id), "scenario": req.scenario, "emitted": n}
