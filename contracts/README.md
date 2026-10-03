# Contracts — the common interface

Source of truth: Pydantic models in `services/agent/app/contracts/`. `scripts/export_contracts.py` writes `schemas/*.schema.json`; `apps/web` generates `lib/contracts.ts` from them. CI fails if either is stale. Fixtures in `fixtures/` are shared by both sides' tests.

**Frozen at hour 2.** After that: additive only (new optional fields with defaults). Never rename. Tell the other person before merging a change here.

Auth: every non-public agent endpoint requires `X-Internal-Token`. Public: `/health`, `/integrations/*/callback`, `/integrations/fitbit/webhook`, `/channels/imessage/inbound` (HMAC with `GATEWAY_SECRET`).

## Types

```
VitalsSample      {user_id: uuid, metric: Metric, value: float, unit: str, ts: datetime, source: Source, meta?: dict}
IngestBatch       {source: Source, samples: VitalsSample[]}
DailySummary      {user_id, day: date, metric, avg, min, max, sum, n}
Goal              {id, user_id, metric, target: float, period: 'day'|'week', direction: 'at_least'|'at_most', active: bool}
GoalProgress      {goal_id, period_start: date, current, pct, on_track: bool}
Alert             {id, user_id, kind, severity: 'info'|'nudge'|'warning'|'urgent', title, body, payload, proposal?: CalendarProposal, channels: str[], created_at, read_at?, ack_at?}
CalendarProposal  {id, user_id, title, starts_at, ends_at, rationale, status: 'pending'|'approved'|'rejected'|'applied'|'failed'|'expired', google_event_id?, alert_id?}
CalendarEvent     {event_id, title, starts_at, ends_at, is_important: bool, all_day: bool}
DigitalTwin       {user_id, version: int, model: dict (PLAN.md §5.3), summary: str}
InboundMessage    {channel: 'imessage'|'web'|'asi_one'|'relay', external_id: str, text: str, message_id: str}
InboundReply      {reply: str, actions: [{type: str, payload: dict}]}
OutboundMessage   {user_id, channel, text, alert_id?}
ScenarioRequest   {user_id, scenario: 'normal'|'workout_now'|'illness_onset'|'great_sleep'|'sedentary_day'|'low_spo2', fast_forward_min?: int}

Metric = heart_rate | resting_heart_rate | hrv_sdnn | steps | active_minutes | active_energy_kcal | spo2 | respiratory_rate
       | skin_temp_delta | bp_systolic | bp_diastolic | weight_kg | sleep_total_min | sleep_deep_min | sleep_rem_min
       | sleep_core_min | sleep_awake_min | stress_score | workout   (workout: value = duration_min, meta = {type, avg_hr, max_hr})
Source = fitbit | apple_watch_sim | presage | manual | finchnode
```

## Endpoints P implements, J consumes

| Endpoint | Purpose |
|---|---|
| `POST /ingest/samples` (IngestBatch) | write Spacetime (`ingest` reducer) + daily_summary, then call `live.on_samples_ingested` |
| `POST /ingest/hae?user_id=` (Health Auto Export JSON body) | parse -> IngestBatch -> same path; the simulator runs the same parser in-process |
| `GET /vitals/latest?user_id&metrics=a,b` | latest value per metric from the last 24 h: `{metric: {ts, value}}`; default `heart_rate,steps,spo2`; unknown metric 422 |
| `GET /vitals/series?user_id&metric&from&to&bucket=raw\|1m\|1h\|1d` | `[{ts, value}]` oldest first (the web `VitalPoint`); value is the average, or the sum for `steps`/`active_*`; default window the last 3 h, max 48 h (422 beyond); `[]` when Spacetime is unconfigured, 503 when it fails; buckets align to UTC |
| `GET /vitals/daily?user_id&days=7` | DailySummary[] |
| `GET /integrations/fitbit/authorize?user_id` -> 302 · `GET /integrations/fitbit/callback` · `GET/POST /integrations/fitbit/webhook` · `POST /integrations/fitbit/sync?user_id` | Fitbit |
| `GET /integrations/google/authorize?user_id` -> 302 · `GET /integrations/google/callback` · `GET /integrations/status?user_id` -> `{fitbit:{connected,last_sync}, google:{connected,email}}` | Google Calendar connect |
| `GET /calendar/upcoming?user_id&hours=48` -> CalendarEvent[] | context for rules/briefing (from cache) |
| `GET /calendar/freebusy?user_id&from&to` | pick a proposal slot |
| `POST /calendar/proposals/{id}/apply` -> `{google_event_id}` | insert into "Pulse Health" calendar; sets `failed` on error |
| `DELETE /calendar/proposals/{id}/event` | remove event if later rejected |
| `POST /sim/scenario` (ScenarioRequest), also served as `POST /demo/scenario` (the web demo panel's path) | simulator mode switch; first call for a user also backfills 4h of minutes and 7 days of daily values. Omitted `fast_forward_min` defaults to 14 (`workout_now`), 3 (`low_spo2`), 190 (`sedentary_day`), else 0. `workout_now` is clamped to 12-18 and `sedentary_day` raised to at least 190, because the web panel always sends 30 and the rules would not fire |
| py `apple_sim.set_scenario(user_id, scenario, fast_forward_min)` · `apple_sim.emit_now(user_id)` | in-process |

## Endpoints J implements, P consumes

| Endpoint / fn | Purpose |
|---|---|
| py `agents.live.on_samples_ingested(user_id: UUID, metrics: list[str]) -> None` (async, never raises) | ingest calls after commit |
| `POST /agent/inbound` (InboundMessage) -> InboundReply | gateway, Fetch.ai agent, web chat |
| `GET /twin/{user_id}` -> DigitalTwin · `GET /goals?user_id` · `GET /goals/progress?user_id` | Fetch.ai tools |
| `POST /proposals` {user_id,title,starts_at,ends_at,rationale} -> CalendarProposal | Fetch.ai `propose_sleep_block` |
| `POST /proposals/{id}/decide` {decision: 'approved'\|'rejected', via} | web button, iMessage "yes", ASI:One |
| `POST /demo/scenario` (ScenarioRequest) | demo panel; forwards to `/sim/scenario`, may force Compass jobs |
| `GET /health` -> `{ok, db, tiger, scheduler_last_tick, gateway}` | uptime |

## Fixtures (to create)
- `fixtures/series_workout.json`, `series_illness_onset.json`, `series_low_spo2.json`, `series_inactivity.json`, `series_sedentary_goal.json`, `series_high_bp_hypertensive.json`, `series_beta_blocker.json`, `series_recovery.json` — VitalsSample[] windows for rule golden tests
- `fixtures/hae_sample.json` — official Health Auto Export shape (capitalised `Min/Avg/Max`, `yyyy-MM-dd HH:mm:ss Z`)
- `fixtures/hae_lowercase.json` — variant seen in the wild
- `fixtures/finchnode_patient_demo_001.json`, `finchnode_polypharmacy.json` — recorded from `api.finchnode.com/demo/v1`
- `fixtures/fitbit_*.json` — recorded Fitbit API responses (intraday HR, sleep, activity summary, webhook POST)
