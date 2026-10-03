/**
 * GENERATED — do not edit.
 * Source: contracts/schemas/*.schema.json. Run `npm run contracts` to regenerate.
 */

export type Id = string;
export type UserId = string;
export type Kind = string;
export type Severity = "info" | "nudge" | "warning" | "urgent";
export type Title = string;
export type Body = string;
export type Id1 = string;
export type UserId1 = string;
export type Title1 = string;
export type StartsAt = string;
export type EndsAt = string;
export type Rationale = string;
export type Status = "pending" | "approved" | "rejected" | "applied" | "failed" | "expired";
export type GoogleEventId = string | null;
export type AlertId = string | null;
export type Channels = string[];
export type CreatedAt = string;
export type ReadAt = string | null;
export type AckAt = string | null;
export type EventId = string;
export type Title2 = string;
export type StartsAt1 = string;
export type EndsAt1 = string;
export type IsImportant = boolean;
export type AllDay = boolean;
export type UserId2 = string;
export type Day = string;
export type Metric =
  | "heart_rate"
  | "resting_heart_rate"
  | "hrv_sdnn"
  | "steps"
  | "active_minutes"
  | "active_energy_kcal"
  | "spo2"
  | "respiratory_rate"
  | "skin_temp_delta"
  | "bp_systolic"
  | "bp_diastolic"
  | "weight_kg"
  | "sleep_total_min"
  | "sleep_deep_min"
  | "sleep_rem_min"
  | "sleep_core_min"
  | "sleep_awake_min"
  | "stress_score"
  | "workout";
export type Avg = number | null;
export type Min = number | null;
export type Max = number | null;
export type Sum = number | null;
export type N = number;
export type UserId3 = string;
export type Version = number;
export type Summary = string;
export type Id2 = string;
export type UserId4 = string;
export type Metric1 =
  | "heart_rate"
  | "resting_heart_rate"
  | "hrv_sdnn"
  | "steps"
  | "active_minutes"
  | "active_energy_kcal"
  | "spo2"
  | "respiratory_rate"
  | "skin_temp_delta"
  | "bp_systolic"
  | "bp_diastolic"
  | "weight_kg"
  | "sleep_total_min"
  | "sleep_deep_min"
  | "sleep_rem_min"
  | "sleep_core_min"
  | "sleep_awake_min"
  | "stress_score"
  | "workout";
export type Target = number;
export type Period = "day" | "week";
export type Direction = "at_least" | "at_most";
export type Active = boolean;
export type GoalId = string;
export type PeriodStart = string;
export type Current = number;
export type Pct = number;
export type OnTrack = boolean;
export type Ok = boolean;
export type Db = boolean;
export type Tiger = boolean;
export type SchedulerLastTick = string | null;
export type Gateway = boolean;
export type Channel = "imessage" | "web" | "asi_one" | "relay";
export type ExternalId = string;
export type Text = string;
export type MessageId = string;
export type Reply = string;
export type Type = string;
export type Actions = ReplyAction[];
export type Source = "fitbit" | "apple_watch_sim" | "presage" | "manual" | "finchnode";
export type UserId5 = string;
export type Metric2 =
  | "heart_rate"
  | "resting_heart_rate"
  | "hrv_sdnn"
  | "steps"
  | "active_minutes"
  | "active_energy_kcal"
  | "spo2"
  | "respiratory_rate"
  | "skin_temp_delta"
  | "bp_systolic"
  | "bp_diastolic"
  | "weight_kg"
  | "sleep_total_min"
  | "sleep_deep_min"
  | "sleep_rem_min"
  | "sleep_core_min"
  | "sleep_awake_min"
  | "stress_score"
  | "workout";
export type Value = number;
export type Unit = string;
export type Ts = string;
export type Source1 = "fitbit" | "apple_watch_sim" | "presage" | "manual" | "finchnode";
export type Meta = {
  [k: string]: unknown | undefined;
} | null;
export type Samples = VitalsSample[];
export type Connected = boolean;
export type LastSync = string | null;
export type Email = string | null;
export type UserId6 = string;
export type Channel1 = "imessage" | "web" | "asi_one" | "relay";
export type Text1 = string;
export type AlertId1 = string | null;
export type UserId7 = string;
export type Title3 = string;
export type StartsAt2 = string;
export type EndsAt2 = string;
export type Rationale1 = string;
export type Decision = "approved" | "rejected";
export type Via = "imessage" | "web" | "asi_one" | "relay";
export type UserId8 = string;
export type Scenario = "normal" | "workout_now" | "illness_onset" | "great_sleep" | "sedentary_day" | "low_spo2";
export type FastForwardMin = number | null;

/**
 * Index of every contract type. Use the named exports in application code.
 */
export interface PulseContracts {
  Alert?: Alert;
  CalendarEvent?: CalendarEvent;
  CalendarProposal?: CalendarProposal;
  DailySummary?: DailySummary;
  DigitalTwin?: DigitalTwin;
  Goal?: Goal;
  GoalProgress?: GoalProgress;
  Health?: Health;
  InboundMessage?: InboundMessage;
  InboundReply?: InboundReply;
  IngestBatch?: IngestBatch;
  IntegrationState?: IntegrationState;
  IntegrationStatus?: IntegrationStatus;
  OutboundMessage?: OutboundMessage;
  ProposalCreate?: ProposalCreate;
  ProposalDecision?: ProposalDecision;
  ReplyAction?: ReplyAction;
  ScenarioRequest?: ScenarioRequest;
  VitalsSample?: VitalsSample;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "Alert".
 */
export interface Alert {
  id: Id;
  user_id: UserId;
  kind: Kind;
  severity: Severity;
  title: Title;
  body: Body;
  payload?: Payload;
  proposal?: CalendarProposal | null;
  channels?: Channels;
  created_at: CreatedAt;
  read_at?: ReadAt;
  ack_at?: AckAt;
}
export interface Payload {
  [k: string]: unknown | undefined;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "CalendarProposal".
 */
export interface CalendarProposal {
  id: Id1;
  user_id: UserId1;
  title: Title1;
  starts_at: StartsAt;
  ends_at: EndsAt;
  rationale: Rationale;
  status?: Status;
  google_event_id?: GoogleEventId;
  alert_id?: AlertId;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "CalendarEvent".
 */
export interface CalendarEvent {
  event_id: EventId;
  title: Title2;
  starts_at: StartsAt1;
  ends_at: EndsAt1;
  is_important?: IsImportant;
  all_day?: AllDay;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "DailySummary".
 */
export interface DailySummary {
  user_id: UserId2;
  day: Day;
  metric: Metric;
  avg?: Avg;
  min?: Min;
  max?: Max;
  sum?: Sum;
  n?: N;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "DigitalTwin".
 */
export interface DigitalTwin {
  user_id: UserId3;
  version: Version;
  model: Model;
  summary: Summary;
}
export interface Model {
  [k: string]: unknown | undefined;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "Goal".
 */
export interface Goal {
  id: Id2;
  user_id: UserId4;
  metric: Metric1;
  target: Target;
  period: Period;
  direction: Direction;
  active?: Active;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "GoalProgress".
 */
export interface GoalProgress {
  goal_id: GoalId;
  period_start: PeriodStart;
  current: Current;
  pct: Pct;
  on_track: OnTrack;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "Health".
 */
export interface Health {
  ok: Ok;
  db: Db;
  tiger: Tiger;
  scheduler_last_tick?: SchedulerLastTick;
  gateway: Gateway;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "InboundMessage".
 */
export interface InboundMessage {
  channel: Channel;
  external_id: ExternalId;
  text: Text;
  message_id: MessageId;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "InboundReply".
 */
export interface InboundReply {
  reply: Reply;
  actions?: Actions;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "ReplyAction".
 */
export interface ReplyAction {
  type: Type;
  payload?: Payload1;
}
export interface Payload1 {
  [k: string]: unknown | undefined;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "IngestBatch".
 */
export interface IngestBatch {
  source: Source;
  samples: Samples;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "VitalsSample".
 */
export interface VitalsSample {
  user_id: UserId5;
  metric: Metric2;
  value: Value;
  unit: Unit;
  ts: Ts;
  source: Source1;
  meta?: Meta;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "IntegrationState".
 */
export interface IntegrationState {
  connected?: Connected;
  last_sync?: LastSync;
  email?: Email;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "IntegrationStatus".
 */
export interface IntegrationStatus {
  fitbit?: IntegrationState;
  google?: IntegrationState;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "OutboundMessage".
 */
export interface OutboundMessage {
  user_id: UserId6;
  channel: Channel1;
  text: Text1;
  alert_id?: AlertId1;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "ProposalCreate".
 */
export interface ProposalCreate {
  user_id: UserId7;
  title: Title3;
  starts_at: StartsAt2;
  ends_at: EndsAt2;
  rationale: Rationale1;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "ProposalDecision".
 */
export interface ProposalDecision {
  decision: Decision;
  via: Via;
}
/**
 * This interface was referenced by `PulseContracts`'s JSON-Schema
 * via the `definition` "ScenarioRequest".
 */
export interface ScenarioRequest {
  user_id: UserId8;
  scenario: Scenario;
  fast_forward_min?: FastForwardMin;
}
