from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.contracts import DigitalTwin
from app.core.auth import require_internal
from app.core.logging import log
from app.twin import finchnode, service, store

router = APIRouter(prefix="/twin", tags=["twin"], dependencies=[Depends(require_internal)])

TZ_PATTERN = r"^[A-Za-z_]+(/[A-Za-z0-9_+\-]+){0,2}$"


class ImportRequest(BaseModel):
    user_id: UUID
    scenario: str | None = Field(default=None, pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")
    patient_id: str | None = Field(default=None, pattern=finchnode.PATIENT_ID_RE.pattern)

    @model_validator(mode="after")
    def _one_of(self) -> ImportRequest:
        if (self.scenario is None) == (self.patient_id is None):
            raise ValueError("send exactly one of scenario or patient_id")
        return self


class ProfileIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    dob: date | None = None
    sex: str | None = Field(default=None, max_length=20)
    height_cm: float | None = Field(default=None, ge=30, le=260)
    weight_kg: float | None = Field(default=None, ge=2, le=500)
    timezone: str | None = Field(default=None, max_length=64, pattern=TZ_PATTERN)


class FamilyHistoryIn(BaseModel):
    relation: str = Field(min_length=1, max_length=200)
    condition: str = Field(min_length=1, max_length=200)


class ConditionAdd(BaseModel):
    display: str = Field(min_length=1, max_length=200)
    code: str | None = Field(default=None, max_length=40)
    system: str | None = Field(default=None, max_length=40)


class MedicationAdd(BaseModel):
    display: str = Field(min_length=1, max_length=200)
    rxnorm: str | None = Field(default=None, max_length=40)


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
Removals = Annotated[list[str], Field(default_factory=list, max_length=50)]


class ConditionEdits(BaseModel):
    add: list[ConditionAdd] = Field(default_factory=list, max_length=50)
    remove: Removals


class MedicationEdits(BaseModel):
    add: list[MedicationAdd] = Field(default_factory=list, max_length=50)
    remove: Removals


class AllergyEdits(BaseModel):
    add: list[Name] = Field(default_factory=list, max_length=50)
    remove: Removals


class EditsIn(BaseModel):
    conditions: ConditionEdits = Field(default_factory=ConditionEdits)
    medications: MedicationEdits = Field(default_factory=MedicationEdits)
    allergies: AllergyEdits = Field(default_factory=AllergyEdits)


class OnboardingRequest(BaseModel):
    profile: ProfileIn = Field(default_factory=ProfileIn)
    family_history: list[FamilyHistoryIn] = Field(default_factory=list, max_length=50)
    edits: EditsIn = Field(default_factory=EditsIn)


class VersionOut(BaseModel):
    version: int
    created_at: datetime
    summary: str


@router.get("/finchnode/patients")
async def finchnode_patients() -> list[dict[str, Any]]:
    """Patients for the onboarding picker. Falls back to a static list when FinchNode is down."""
    try:
        patients = await finchnode.list_patients()
    except finchnode.FinchNodeError:
        log.warning("event=finchnode_list_fallback")
        return finchnode.STATIC_PATIENTS
    return [{k: p.get(k) for k in ("id", "scenario", "displayName", "birthDate")} for p in patients]


@router.post("/import", response_model=DigitalTwin)
async def import_records(body: ImportRequest) -> DigitalTwin:
    try:
        return await service.import_from_finchnode(body.user_id, body.scenario, body.patient_id)
    except finchnode.FinchNodeNotFound as exc:
        raise HTTPException(404, "unknown FinchNode scenario or patient") from exc
    except finchnode.FinchNodeError as exc:
        raise HTTPException(502, "FinchNode unavailable") from exc


@router.post("/{user_id}/onboarding", response_model=DigitalTwin)
async def onboarding(user_id: UUID, body: OnboardingRequest) -> DigitalTwin:
    return await service.apply_onboarding(
        user_id,
        body.profile.model_dump(exclude_none=True),
        [f.model_dump() for f in body.family_history],
        body.edits.model_dump(),
    )


@router.post("/{user_id}/rebuild", response_model=DigitalTwin)
async def rebuild(user_id: UUID) -> DigitalTwin:
    try:
        return await service.rebuild(user_id)
    except service.TwinNotFound as exc:
        raise HTTPException(404, "no twin for user") from exc


@router.get("/{user_id}/versions", response_model=list[VersionOut])
async def versions(user_id: UUID) -> list[dict[str, Any]]:
    return await store.list_versions(user_id)


@router.get("/{user_id}", response_model=DigitalTwin)
async def get_twin(user_id: UUID) -> DigitalTwin:
    try:
        return await service.get_latest(user_id)
    except service.TwinNotFound as exc:
        raise HTTPException(404, "no twin for user") from exc
