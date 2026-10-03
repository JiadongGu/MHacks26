from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

Metric = Literal[
    "heart_rate", "resting_heart_rate", "hrv_sdnn", "steps", "active_minutes", "active_energy_kcal",
    "spo2", "respiratory_rate", "skin_temp_delta", "bp_systolic", "bp_diastolic", "weight_kg",
    "sleep_total_min", "sleep_deep_min", "sleep_rem_min", "sleep_core_min", "sleep_awake_min",
    "stress_score", "workout",
]
Source = Literal["fitbit", "apple_watch_sim", "presage", "manual", "finchnode"]
Severity = Literal["info", "nudge", "warning", "urgent"]
ProposalStatus = Literal["pending", "approved", "rejected", "applied", "failed", "expired"]
Channel = Literal["imessage", "web", "asi_one", "relay"]
Scenario = Literal["normal", "workout_now", "illness_onset", "great_sleep", "sedentary_day", "low_spo2"]
TwinStatus = Literal["normal", "recovering", "strained", "possibly_ill"]


class VitalsSample(BaseModel):
    user_id: UUID
    metric: Metric
    value: float
    unit: str
    ts: datetime
    source: Source
    meta: dict[str, Any] | None = None


class IngestBatch(BaseModel):
    source: Source
    samples: list[VitalsSample]


class DailySummary(BaseModel):
    user_id: UUID
    day: date
    metric: Metric
    avg: float | None = None
    min: float | None = None
    max: float | None = None
    sum: float | None = None
    n: int = 0


class Goal(BaseModel):
    id: UUID
    user_id: UUID
    metric: Metric
    target: float
    period: Literal["day", "week"]
    direction: Literal["at_least", "at_most"]
    active: bool = True


class GoalProgress(BaseModel):
    goal_id: UUID
    period_start: date
    current: float
    pct: float
    on_track: bool


class CalendarProposal(BaseModel):
    id: UUID
    user_id: UUID
    title: str
    starts_at: datetime
    ends_at: datetime
    rationale: str
    status: ProposalStatus = "pending"
    google_event_id: str | None = None
    alert_id: UUID | None = None


class Alert(BaseModel):
    id: UUID
    user_id: UUID
    kind: str
    severity: Severity
    title: str
    body: str
    payload: dict[str, Any] = Field(default_factory=dict)
    proposal: CalendarProposal | None = None
    channels: list[str] = Field(default_factory=list)
    created_at: datetime
    read_at: datetime | None = None
    ack_at: datetime | None = None


class CalendarEvent(BaseModel):
    event_id: str
    title: str
    starts_at: datetime
    ends_at: datetime
    is_important: bool = False
    all_day: bool = False


class DigitalTwin(BaseModel):
    user_id: UUID
    version: int
    model: dict[str, Any]
    summary: str


class InboundMessage(BaseModel):
    channel: Channel
    external_id: str
    text: str
    message_id: str


class ReplyAction(BaseModel):
    type: str
    payload: dict[str, Any] = Field(default_factory=dict)


class InboundReply(BaseModel):
    reply: str
    actions: list[ReplyAction] = Field(default_factory=list)


class OutboundMessage(BaseModel):
    user_id: UUID
    channel: Channel
    text: str
    alert_id: UUID | None = None


class ScenarioRequest(BaseModel):
    user_id: UUID
    scenario: Scenario
    fast_forward_min: int | None = None


class ProposalCreate(BaseModel):
    user_id: UUID
    title: str
    starts_at: datetime
    ends_at: datetime
    rationale: str


class ProposalDecision(BaseModel):
    decision: Literal["approved", "rejected"]
    via: Channel


class IntegrationState(BaseModel):
    connected: bool = False
    last_sync: datetime | None = None
    email: str | None = None


class IntegrationStatus(BaseModel):
    fitbit: IntegrationState = Field(default_factory=IntegrationState)
    google: IntegrationState = Field(default_factory=IntegrationState)


class Health(BaseModel):
    ok: bool
    db: bool
    tiger: bool
    scheduler_last_tick: datetime | None = None
    gateway: bool


EXPORTED: list[type[BaseModel]] = [
    VitalsSample, IngestBatch, DailySummary, Goal, GoalProgress, CalendarProposal, Alert, CalendarEvent,
    DigitalTwin, InboundMessage, ReplyAction, InboundReply, OutboundMessage, ScenarioRequest, ProposalCreate,
    ProposalDecision, IntegrationState, IntegrationStatus, Health,
]
