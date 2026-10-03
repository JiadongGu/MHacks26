from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.contracts import Goal, GoalProgress, Metric
from app.core.auth import require_internal
from app.goals import service, store

router = APIRouter(prefix="/goals", tags=["goals"], dependencies=[Depends(require_internal)])


class GoalCreate(BaseModel):
    """Goal without id."""

    user_id: UUID
    metric: Metric
    target: float = Field(gt=0, le=1_000_000)
    period: str = Field(pattern="^(day|week)$")
    direction: str = Field(pattern="^(at_least|at_most)$")
    active: bool = True


class GoalPatch(BaseModel):
    target: float | None = Field(default=None, gt=0, le=1_000_000)
    period: str | None = Field(default=None, pattern="^(day|week)$")
    direction: str | None = Field(default=None, pattern="^(at_least|at_most)$")
    active: bool | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> GoalPatch:
        if not self.model_fields_set:
            raise ValueError("send at least one field")
        return self


@router.get("", response_model=list[Goal])
async def list_goals(user_id: UUID, include_inactive: bool = False) -> list[dict]:
    return await store.list_goals(user_id, include_inactive)


@router.get("/progress", response_model=list[GoalProgress])
async def goal_progress(user_id: UUID) -> list[GoalProgress]:
    return await service.compute_for_user(user_id)


@router.post("", response_model=Goal, status_code=201)
async def create_goal(body: GoalCreate) -> dict:
    return await store.create_goal(
        body.user_id, body.metric, body.target, body.period, body.direction, body.active
    )


@router.patch("/{goal_id}", response_model=Goal)
async def patch_goal(goal_id: UUID, body: GoalPatch, user_id: UUID | None = None) -> dict:
    """Pass user_id to scope the update to that user's goal."""
    row = await store.update_goal(goal_id, user_id, body.target, body.period, body.direction, body.active)
    if row is None:
        raise HTTPException(404, "goal not found")
    return row
