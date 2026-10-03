# Plan: "Pulse" — personal AI health agent for MHacks 2026

## Context

Repo `JiadongGu/MHacks26` is empty scaffolding (CLAUDE.md, SPEC.md, PROGRESS.md, DECISIONS.md, HACKATHON.md, `.env.example`, a permissions allowlist). The hackathon clock is running; **~20 hours remain until code freeze**, and the deployment must stay alive unattended for ~2–3 days of judging. Two people: **J (you)** and **P (partner)**. Budget for paid APIs ~$100.

Decisions already made with you:
- Devices: real **Fitbit** (P already holds a legacy Fitbit developer app → legacy Web API works until **2026-10-30**), **simulated Apple Watch**.
- LLM: **Gemini** (free tier, MLH prize). Stack: **Next.js web (Vercel) + Python FastAPI agent service (Railway)**. Live-vitals pool in **Tiger Data**, everything else in **Neon**.

This plan's deliverable (on approval) is a set of files written into the repo so another agent can execute without this conversation: `PLAN.md` (everything below), plus filled-in `SPEC.md`, `CLAUDE.md`, `DECISIONS.md`, `PROGRESS.md`, `.env.example`, and `contracts/README.md`. No application code is written in this step.

Research was done by three subagents (Neon/Tiger/GCal/hosting; Photon/Fetch.ai/Relay/ElevenLabs/Twilio; FinchNode/Fitbit/Apple/Presage/Gemini). Key verified facts are folded in below; `UNVERIFIED` marks what must be checked by hand in hour 0.

---

## 1. Product in one paragraph

**Pulse** is a personal health agent that lives in your iMessage and on the web. It pools live wearable vitals (Fitbit, Apple Watch) into a short-term time-series store and a long-term profile store, builds a **digital twin** from your medical record (FinchNode synthetic EHR) and your own answers, watches the live stream with a deterministic rules engine, and uses Gemini to turn findings into human messages: "nice workout", "your resting HR is up 9 bpm and you slept 5h — you may be getting sick; you have an exam Thursday, want me to block 10pm–6am for sleep?" One reply ("yes") and it writes the block to Google Calendar. It tracks goals, sends a spoken morning briefing, and is discoverable as an agent on ASI:One.

Agent persona name: **Pulse**. Working .tech domain candidates: `getpulse.tech`, `pulseagent.tech`, `mypulse.tech` (claim at get.tech/mlh with the MLH coupon from the hacker email, hour 0).

---

## 2. Track and sponsor matrix

**Primary track: Actually Intelligent (AI)** — the agent takes autonomous, multi-step action (detect → reason over twin + calendar → propose → execute on approval). Also submit for the Grand Prize.

| Sponsor | Use in Pulse | Effort | Priority | Owner |
|---|---|---|---|---|
| **Photon** (iMessage) | Primary notification + conversation channel via Spectrum (TS gateway) | 3h | P0 | J |
| **FinchNode** | Onboarding "Import medical records" → seeds digital twin (conditions, meds, labs, vitals baseline, allergies); twin-aware thresholds | 2h | P0 | J |
| **Neon** | Postgres (long-term pool), **Neon Auth** (managed Better Auth) for sign-up/login, Drizzle, branch-per-PR in CI, pgvector (stretch) | 3h | P0 | J (schema), P (CI branch) |
| **Gemini (MLH)** | All LLM calls: message phrasing (structured output), inbound chat with function calling, twin insights, briefing | — | P0 | J |
| **Tiger Data (MLH)** | `vitals_raw` hypertable + continuous aggregates (1m/1h/1d) + retention policy = the short-term pool | 3h timeboxed | P1 | P |
| **Fetch.ai / ASI:One** | Mailbox uAgent implementing chat protocol with 3 visible tools (`get_status`, `get_sleep_summary`, `propose_sleep_block`); registered on Agentverse; separate submission via Submission Agent | 2.5h | P1 | P |
| **ElevenLabs** | Spoken morning briefing on dashboard (TTS, cached per day) | 1.5h | P2 | J |
| **Figma (Best Design)** | J designs in Figma via MCP on another account; dashboard follows it | parallel | P1 | J |
| **.Tech domain (MLH)** | `*.tech` pointed at Vercel | 0.5h | P0 | J |
| **Notability** | Architecture + wireframe sketches during hour 0–1; 2 screenshots in Devpost | 0.3h | P0 | both |
| **Presage (MLH)** | Webcam vitals check-in (Node sidecar, 4–6h) | 5h | **Stretch only** | — |
| Relay | Second text channel via webhook | 2h | Stretch only | — |
| Twilio SMS | **Skip** — A2P/toll-free verification takes days; Photon free tier includes RCS/SMS fallback | — | Skip | — |
| Spacetime, Nessie, Solana, SpaceXAI, Free-WILi, Sustainability/FinTech/Hardware tracks | Don't fit; skip | — | Skip | — |

Devpost: tag Photon, FinchNode, Neon, Gemini, Tiger Data, Fetch.ai, ElevenLabs, Figma, Notability, .Tech.

---

## 3. Architecture

```
 Fitbit (real; legacy Web API, Subscriptions webhook + 15-min poll) ──┐
 Apple Watch SIMULATOR (emits Health-Auto-Export JSON) ───────────────┤
 Manual entry (web) / FinchNode vitals history ───────────────────────┤
                                                                      ▼
                                   [P] FastAPI /ingest/*  → normalize → VitalsSample[]
                                                                      │
                     ┌────────────────────────────────────────────────┤
                     ▼                                                ▼
   TIGER: vitals_raw hypertable, CAGGs vitals_1m/1h/1d      NEON: daily_summary upsert
   (short-term live pool, 30-day retention)                 then in-process hook on_samples_ingested(user_id, metrics)
                                                                      │
                                                                      ▼
                     [J] LIVE AGENT "Pulse"  = rules engine (deterministic) → Gemini phrasing (structured JSON) → Alert
                     [J] LONG-TERM AGENT "Compass" = APScheduler: 07:00 briefing, 21:00 evening check, 03:00 twin rebuild,
                                                    Sun 19:00 weekly goals, */15 proposal sweep
                     [J] Digital twin builder (FinchNode import + onboarding + computed baselines) → NEON digital_twin (versioned)
                                                                      │
                            ┌──────────────────────┬──────────────────┼──────────────────────┐
                            ▼                      ▼                  ▼                      ▼
             [J] Node gateway (spectrum-ts)  [J] Web notifications  [P] Fetch.ai uAgent    [J] ElevenLabs TTS
                 → iMessage (Photon cloud)       (Neon alerts)        (ASI:One chat)         (briefing mp3)
                            ▲ inbound text → POST /agent/inbound → Gemini + tools → reply / approve proposal
                                                                      │ approved CalendarProposal
                                                                      ▼
                                                   [J] Google Calendar module → events.insert in "Pulse Health" calendar
```

Three deployables:
1. `apps/web` — Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, Drizzle + `@neondatabase/serverless`, Neon Auth. **Vercel Hobby.**
2. `services/agent` — Python 3.12, FastAPI, `uv`, APScheduler (in-process), `google-genai`, `psycopg[binary,pool]`, `httpx`, `uagents`. **Railway Hobby ($5/mo, always-on).** Two Railway services from the same image: `agent-api` (uvicorn) and `agent-fetchai` (`python -m app.fetchai.agent`).
3. `services/gateway` — Bun/Node TypeScript, `spectrum-ts`. ~150 lines. **Railway** (same project).

Why not fewer: Photon Spectrum is TypeScript-only (no Python SDK); uAgents is Python-only; Vercel cannot host long-running processes. The gateway is deliberately dumb (no business logic) so it never needs to change after hour 6.

Hosting facts (verified): Railway Hobby has no spin-down; Railway *trial* restricts outbound traffic if GitHub isn't verified — pay the $5. Render free spins down after 15 min (kills APScheduler) — don't use. Vercel Hobby cron is once/day only — all scheduling lives in the Python service. Neon free = 100 CU-hours/month, scale-to-zero after 5 min (can't disable on free); the agent polls every minute so compute stays awake ≈ 24 CU-h/day at 1 CU → **upgrade Neon to Launch (~$8 for 3 days) before judging** or accept the risk. Tiger free tier (beta, 750 MiB, us-east-1) — pause behavior UNVERIFIED; smoke-test hourly.

---

## 4. Repository layout and ownership (merge-conflict firewall)

```
MHacks26/
├── apps/web/                          J
│   ├── app/(auth)/sign-in, sign-up    J
│   ├── app/(app)/onboarding, dashboard, twin, goals, alerts, settings, demo   J
│   ├── app/api/auth/[...path]/route.ts  (Neon Auth)   J
│   ├── app/api/agent/[...path]/route.ts (server-side proxy to agent with X-Internal-Token)   J
│   ├── drizzle/schema/{core,integrations}.ts   core=J, integrations=P (fitbit_connections, ingest_log) + J (calendar_connections, calendar_events_cache)
│   ├── drizzle/migrations/            generated; whoever changes schema runs `drizzle-kit generate` and commits same PR
│   ├── lib/contracts.ts               GENERATED from contracts/ — never hand-edit
│   └── tests/ (vitest), e2e/ (playwright)   J
├── services/agent/                    split by package below
│   ├── app/main.py                    SHARED (append-only router registration; one line per router)
│   ├── app/core/{config,db,auth,logging}.py   SHARED, frozen after hour 2
│   ├── app/contracts/*.py             SHARED, frozen after hour 2 (Pydantic source of truth)
│   ├── app/ingest/                    P   (/ingest/samples, /ingest/hae, Tiger writer, daily_summary upsert)
│   ├── app/vitals/                    P   (/vitals/latest, /vitals/series, /vitals/daily — reads Tiger CAGGs)
│   ├── app/integrations/fitbit/       P
│   ├── app/integrations/apple_sim/    P   (simulator personas + scenario switch)
│   ├── app/integrations/gcal/         J   (/integrations/google/*, /calendar/*)
│   ├── app/fetchai/                   P   (uAgent + tools calling our own REST)
│   ├── app/agents/live.py             J   (on_samples_ingested, evaluate window)
│   ├── app/agents/compass.py          J   (scheduled jobs)
│   ├── app/agents/chat.py             J   (/agent/inbound, Gemini tools)
│   ├── app/rules/                     J   (rule functions + cooldowns)
│   ├── app/twin/                      J   (FinchNode import, baselines, thresholds, versions)
│   ├── app/llm/                       J   (Gemini client, prompts, fake mode)
│   ├── app/notify/                    J   (dispatch to gateway/web/log; quiet hours)
│   ├── app/channels/                  J   (/channels/imessage/*, link codes)
│   ├── app/goals/                     J
│   ├── app/demo/                      J   (/demo/scenario → calls apple_sim.set_scenario + forces jobs)
│   ├── app/scheduler.py               J
│   ├── app/voice/                     J   (ElevenLabs briefing)
│   └── tests/{unit,integration,contract}/<package>/   owner of package owns its tests
├── services/gateway/                  J   (spectrum-ts; src/index.ts, src/routes.ts)
├── contracts/                         SHARED, frozen after hour 2; changes = both agree in chat, one PR
│   ├── schemas/*.schema.json          exported from Pydantic by scripts/export_contracts.py
│   ├── fixtures/*.json                golden vitals series + sample payloads used by both sides' tests
│   └── README.md                      endpoint table (section 6)
├── infra/
│   ├── tiger/001_vitals.sql           P   (hypertable, CAGGs, policies; portable fallback DDL in 001_vitals_pg.sql)
│   ├── railway.toml, Dockerfile.agent, Dockerfile.gateway    P
│   └── uptime.md                      P   (UptimeRobot monitors)
├── scripts/
│   ├── export_contracts.py            J
│   ├── seed_demo.py                   J   (demo user + FinchNode import + goals)
│   ├── smoke.sh                       P   (post-deploy end-to-end check)
│   └── simulate.py                    P   (CLI to drive scenarios against staging)
├── .github/workflows/ci.yml           P
└── PLAN.md, API.md (= contracts/README.md symlink), DEMO.md, SUBMISSION.md
```

**Git rules**
- Branches: `j/<topic>`, `p/<topic>`. PRs into `main`, squash merge, self-merge allowed when CI green and only your own files changed.
- `main` must always deploy (Vercel + Railway auto-deploy from `main`). Broken main = drop everything and fix.
- Files marked SHARED: after the hour-2 freeze, any change needs a message to the other person *before* merging. Keep changes additive (new fields optional with defaults; never rename).
- `pull --rebase` before every push. Never force-push `main`.
- Never commit `.env`. All secrets in Vercel/Railway dashboards.

---

## 5. Data model

### 5.1 Tiger (short-term live pool) — `infra/tiger/001_vitals.sql` (P)
```sql
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE TABLE vitals_raw (
  user_id uuid NOT NULL, metric text NOT NULL, value double precision NOT NULL,
  unit text NOT NULL, source text NOT NULL, ts timestamptz NOT NULL, meta jsonb,
  PRIMARY KEY (user_id, metric, source, ts));
SELECT create_hypertable('vitals_raw','ts', chunk_time_interval => interval '1 day');
CREATE MATERIALIZED VIEW vitals_1m WITH (timescaledb.continuous) AS
  SELECT user_id, metric, time_bucket('1 minute', ts) AS bucket, avg(value) avg, min(value) min, max(value) max, count(*) n
  FROM vitals_raw GROUP BY 1,2,3;
-- same for vitals_1h (from vitals_1m, hierarchical) and vitals_1d
SELECT add_continuous_aggregate_policy('vitals_1m', start_offset=>'1 hour', end_offset=>'1 minute', schedule_interval=>'1 minute');
SELECT add_retention_policy('vitals_raw', interval '30 days');
ALTER MATERIALIZED VIEW vitals_1m SET (timescaledb.materialized_only = false); -- real-time aggregation
```
Fallback `001_vitals_pg.sql`: same table as plain Postgres in Neon + views using `date_trunc`. The `app/vitals` read module takes `TIGER_DATABASE_URL`; if unset it uses `DATABASE_URL` (Neon) and the fallback views. **Decide at hour 5: if Tiger CAGGs don't work on the free service (UNVERIFIED), flip to fallback and move on.**

Metric enum (string, in `contracts`): `heart_rate, resting_heart_rate, hrv_sdnn, steps, active_minutes, active_energy_kcal, spo2, respiratory_rate, skin_temp_delta, bp_systolic, bp_diastolic, weight_kg, sleep_total_min, sleep_deep_min, sleep_rem_min, sleep_core_min, sleep_awake_min, stress_score, workout` (workout: value = duration_min, meta = {type, avg_hr, max_hr}).
Source enum: `fitbit, apple_watch_sim, presage, manual, finchnode`.

### 5.2 Neon (long-term pool) — Drizzle schema (J core, P integrations)
Users come from Neon Auth (`neon_auth.user`); every table references `user_id uuid` without a cross-schema FK.
```
profiles(user_id PK, display_name, dob, sex, height_cm, weight_kg, timezone, phone_e164, wake_time, bed_time, quiet_hours jsonb, onboarding_step int, created_at)
ehr_records(id, user_id, source 'finchnode', scenario_id, category, payload jsonb, imported_at)
digital_twin(user_id, version int, model jsonb, summary text, created_at, PK(user_id,version))
goals(id, user_id, metric, target float, period 'day'|'week', direction 'at_least'|'at_most', active bool, created_at)
goal_progress(goal_id, period_start date, current float, pct float, on_track bool, computed_at, PK(goal_id,period_start))
daily_summary(user_id, day date, metric, avg,min,max,sum,n, PK(user_id,day,metric))        -- written by P ingest
alerts(id, user_id, kind, severity 'info'|'nudge'|'warning'|'urgent', title, body, payload jsonb, proposal_id, channels jsonb, created_at, read_at, ack_at)
calendar_proposals(id, user_id, title, starts_at, ends_at, rationale, status 'pending'|'approved'|'rejected'|'applied'|'failed'|'expired', google_event_id, alert_id, created_at, decided_at, applied_at)
calendar_events_cache(user_id, event_id, title, starts_at, ends_at, is_important bool, fetched_at, PK(user_id,event_id))   -- J
messages(id, user_id, channel, direction 'in'|'out', text, tool_calls jsonb, external_id, created_at)
channel_links(id, user_id, channel 'imessage'|'asi_one'|'relay', external_id, link_code, status 'pending'|'linked', created_at, linked_at)
fitbit_connections(user_id PK, fitbit_user_id, access_token_enc, refresh_token_enc, expires_at, scopes, subscription_id, last_sync_at)   -- P
calendar_connections(user_id PK, google_email, refresh_token_enc, health_calendar_id, sync_token, last_sync_at)   -- J
job_runs(id, job_name, user_id, started_at, finished_at, status, detail)   -- idempotency + "agent last seen"
briefings(user_id, day, text, audio_url, created_at, PK(user_id,day))
```
Token encryption: Fernet with `SECRET_KEY` in the Python service (both connection tables are written only by Python).

### 5.3 Digital twin JSON (`digital_twin.model`)
```json
{"profile":{"age":38,"sex":"female","height_cm":168,"weight_kg":71,"timezone":"America/Detroit"},
 "conditions":[{"code":"38341003","system":"SNOMED","display":"Hypertensive disorder","status":"active","source":"finchnode"}],
 "medications":[{"rxnorm":"...","display":"lisinopril 10 mg","class":"ACE inhibitor"}],
 "allergies":["penicillin"],
 "family_history":[{"relation":"father","condition":"type 2 diabetes"}],
 "labs":[{"loinc":"4548-4","display":"HbA1c","value":6.4,"unit":"%","date":"2026-07-18"}],
 "baselines":{"resting_hr":62,"hrv_sdnn":48,"sleep_min":432,"steps":7800,"computed_from_days":7,"clinical_bp":"124/78"},
 "thresholds":{"rhr_delta_warn":8,"spo2_warn":92,"bp_warn":[130,80],"workout_hr":135,"inactivity_steps_3h":200},
 "status":"normal|recovering|strained|possibly_ill",
 "risk_flags":["hypertension","t2dm"],
 "insights":["Resting HR has trended down 3 bpm over 2 weeks."],
 "provenance":{"finchnode_scenario":"baseline-adult","onboarding_at":"...","last_rebuild":"..."}}
```
Rules: FinchNode cannot provide family history → onboarding asks for it (chips + free text) and labels it self-reported. Hypertension → `bp_warn` tightens to 130/80 and `rhr_delta_warn` to 6. Beta-blocker → suppress low-HR alerts. Atrial fibrillation → irregular-rhythm wording. Baselines = 7-day median from `daily_summary`; fall back to FinchNode `vitals` history, then population defaults by age/sex.

---

## 6. The common interface (contracts)

Source of truth: Pydantic models in `services/agent/app/contracts/`. `scripts/export_contracts.py` writes `contracts/schemas/*.schema.json`; `apps/web` runs `json-schema-to-typescript` → `lib/contracts.ts`; CI fails if either generated artifact is stale. Both sides' tests load `contracts/fixtures/*.json`.

Auth between services: header `X-Internal-Token: $INTERNAL_TOKEN` on every non-public agent endpoint. Public: `/health`, `/integrations/*/callback`, `/integrations/fitbit/webhook`, `/channels/imessage/inbound` (HMAC via `GATEWAY_SECRET`).

### 6.1 Types (abridged; full in `contracts/README.md`)
```
VitalsSample   {user_id, metric, value, unit, ts, source, meta?}
IngestBatch    {source, samples: VitalsSample[]}
DailySummary   {user_id, day, metric, avg, min, max, sum, n}
Goal / GoalProgress   as in 5.2
Alert          as in 5.2 (+ proposal?: CalendarProposal)
CalendarProposal      as in 5.2
CalendarEvent  {event_id, title, starts_at, ends_at, is_important, all_day}
DigitalTwin    {user_id, version, model, summary}
InboundMessage {channel, external_id, text, message_id}
InboundReply   {reply: str, actions: [{type, payload}]}
OutboundMessage {user_id, channel, text, alert_id?}
ScenarioRequest {user_id, scenario: 'normal'|'workout_now'|'illness_onset'|'great_sleep'|'sedentary_day'|'low_spo2', fast_forward_min?: int}
```

### 6.2 Endpoints by owner
**P implements, J consumes**
| Endpoint | Purpose |
|---|---|
| `POST /ingest/samples` (IngestBatch) | write to Tiger + daily_summary; then call `live.on_samples_ingested` |
| `POST /ingest/hae` (Health Auto Export JSON) | parse → IngestBatch → same path; simulator posts here |
| `GET /vitals/latest?user_id&metrics=a,b` | latest value per metric |
| `GET /vitals/series?user_id&metric&from&to&bucket=raw\|1m\|1h\|1d` | from CAGGs |
| `GET /vitals/daily?user_id&days=7` | DailySummary[] |
| `GET /integrations/fitbit/authorize?user_id` → 302; `GET /integrations/fitbit/callback`; `GET/POST /integrations/fitbit/webhook`; `POST /integrations/fitbit/sync?user_id` | Fitbit |
| `GET /integrations/google/authorize?user_id` → 302; `GET /integrations/google/callback`; `GET /integrations/status?user_id` → `{fitbit:{connected,last_sync}, google:{connected,email}}` | GCal connect |
| `GET /calendar/upcoming?user_id&hours=48` → CalendarEvent[] | context for rules/briefing |
| `GET /calendar/freebusy?user_id&from&to` | pick proposal slot |
| `POST /calendar/proposals/{id}/apply` → `{google_event_id}` | insert into "Pulse Health" calendar; on failure sets status failed |
| `DELETE /calendar/proposals/{id}/event` | remove if user later rejects |
| `POST /sim/scenario` (ScenarioRequest) | simulator mode switch (called by J's `/demo/scenario`) |
| Python fn `apple_sim.set_scenario(user_id, scenario, fast_forward_min)` and `apple_sim.emit_now(user_id)` | in-process |

**J implements, P consumes**
| Endpoint / fn | Purpose |
|---|---|
| Python fn `agents.live.on_samples_ingested(user_id: UUID, metrics: list[str]) -> None` (async, never raises) | P's ingest calls after commit |
| `POST /agent/inbound` (InboundMessage) → InboundReply | used by gateway, Fetch.ai agent, web chat |
| `GET /twin/{user_id}` → DigitalTwin; `GET /goals?user_id`; `GET /goals/progress?user_id` | used by Fetch.ai tools |
| `POST /proposals` {user_id,title,starts_at,ends_at,rationale} → CalendarProposal | Fetch.ai `propose_sleep_block` tool |
| `POST /proposals/{id}/decide` {decision: approved\|rejected, via} | web button, iMessage "yes", ASI:One |
| `POST /demo/scenario` (ScenarioRequest) | demo panel; also forces Compass jobs when `scenario=great_sleep` etc. |
| `GET /health` → `{ok, db, tiger, scheduler_last_tick, gateway}` | uptime |

Frozen at hour 2. After that: additive only.

---

## 7. Agents

### 7.1 LLM layer (`app/llm/`, J)
- `google-genai` SDK. Models: `GEMINI_MODEL_FAST=gemini-3.5-flash-lite` (phrasing, chat), `GEMINI_MODEL_SMART=gemini-3.8-flash` (twin insights, briefing). Verified free-tier models; **RPD limits are undocumented and reports conflict (20 RPD vs 1,500 RPD for 3.8-flash)** → hour 0: read https://aistudio.google.com/rate-limit, and enable billing on the GCP project with a $15 budget alert as a safety net.
- Every call uses structured output (`response_schema`) and a 10s timeout. `LLM_FAKE=1` returns deterministic template text (used in CI and as runtime fallback when Gemini errors/429s — **a 429 must never block an alert**).
- Budget guard: `llm_calls` counter per day in `job_runs`; above 800/day switch to templates.

### 7.2 Live agent "Pulse" (`app/agents/live.py` + `app/rules/`, J)
Triggered by `on_samples_ingested` and by a 1-minute APScheduler sweep (fallback). For the user: load twin, goals, last 20 min of `vitals_1m` + today's `daily_summary` + upcoming important events (from `calendar_events_cache`, no live GCal call), run rules, dedupe via cooldown (query `alerts` for same `kind` within window), phrase with Gemini, write `alerts`, dispatch via `notify`.

| id | Rule (deterministic) | Severity | Cooldown | Action |
|---|---|---|---|---|
| R1 workout_detected | HR ≥ `thresholds.workout_hr` for ≥10 of last 15 min | nudge | 2h | congratulate, cite duration + peak HR |
| R2 illness_onset | today's resting HR ≥ baseline + `rhr_delta_warn` AND (last sleep < 6h OR HRV < 0.8·baseline) | warning | 24h | status→possibly_ill; if important event in 48h → create CalendarProposal "Sleep block 22:00–06:00" (respect wake_time, check freebusy) and attach to alert |
| R3 low_spo2 | 2 consecutive SpO2 < `spo2_warn` | warning | 6h | advise; urgent if < 88 |
| R4 inactivity | 09:00–20:00 local and steps in last 3h < `inactivity_steps_3h` | nudge | 3h, max 2/day | short walk nudge |
| R5 goal_pace | 18:00 local and today's steps < 60% of daily goal | nudge | daily | nudge with exact remaining count |
| R6 high_bp | ≥2 readings ≥ `bp_warn` in 24h | warning | 24h | advise rest/recheck; mention condition if hypertension in twin |
| R7 sleep_debt | 3-day avg sleep < goal − 60 min | nudge | 48h | propose earlier bed block tonight |
| R8 recovery | status possibly_ill and resting HR back within baseline+3 for 2 days | info | — | status→normal, celebrate |
Twin modifiers: beta-blocker suppresses low-HR findings; AF adds irregular-rhythm wording; pediatric/senior thresholds by age.

Each rule returns `Finding{kind, severity, facts: dict, proposal?: dict}`. Gemini prompt gets persona, twin summary, finding facts, goals, and must return `{text ≤ 320 chars, tone}`. Template fallback per rule.

### 7.3 Long-term agent "Compass" (`app/agents/compass.py`, J)
APScheduler (timezone-aware per user, iterate users each tick):
- **07:00** morning briefing: sleep + readiness status + goals for today + important events + 1 recommendation → `briefings`, alert(info) → iMessage + web; ElevenLabs audio generated lazily on first dashboard play.
- **21:00** evening check: goal results, tomorrow's events, sleep recommendation; propose a block if R2/R7 active and none pending.
- **03:00** twin rebuild: recompute baselines from `daily_summary`, status, Gemini insights (SMART model) → new `digital_twin` version.
- **Sun 19:00** weekly goal review.
- **every 15 min** proposals sweep: expire pending > 24h; apply `approved` via P's `/calendar/proposals/{id}/apply`; notify result.
- **every 1 min** live sweep (fallback for R1–R6) + heartbeat row in `job_runs`.
All jobs idempotent (check `job_runs` for (job, user, period)). `misfire_grace_time=300`, `coalesce=True`.

### 7.4 Conversational handler (`app/agents/chat.py`, J) — `/agent/inbound`
1. Resolve user via `channel_links` (external_id). Unknown sender: if text matches `PULSE-\w{4}` link code → link, reply welcome; else reply with sign-up URL.
2. Fast paths (regex, no LLM): `yes|approve|ok|do it` → approve newest pending proposal; `no|reject|skip` → reject; `status` → template status.
3. Otherwise Gemini FAST with function calling, tools: `get_status`, `get_vitals_summary(metric, range)`, `get_goal_progress`, `set_goal(metric,target,period)`, `approve_proposal(id)`, `reject_proposal(id)`, `propose_calendar_block(title,start,end,rationale)`, `get_upcoming_events(hours)`, `log_symptom(text)`, `explain_last_alert`. Memory: last 20 `messages`. Reply ≤ 480 chars for iMessage.
4. Persist both directions in `messages`.

### 7.5 Notifications (`app/notify/`, J)
`notify(user_id, alert)`: respects `quiet_hours` (urgent bypasses); always writes web notification (the `alerts` row); if `channel_links.imessage` linked → `POST gateway/send {to, text}`; logs channels into `alerts.channels`. Gateway failure never raises.

### 7.6 Fetch.ai uAgent (`app/fetchai/agent.py`, P)
Mailbox agent (`mailbox=True, publish_agent_details=True`, stable `AGENT_SEED`), chat protocol (`uagents_core.contrib.protocols.chat`), `publish_manifest=True`. On message: resolve/link user (ASI:One sender address ↔ `channel_links.asi_one`, linked via code the same way as iMessage), then call `/agent/inbound` with `channel=asi_one`. Also expose explicit tool-like intents in README (judges look for "tool execution inside ASI:One"): status, sleep summary, propose sleep block (→ `/proposals`). Startup prints Inspector URL → click Connect → Mailbox once on the deployed instance; set name/handle/README on Agentverse. README badges `![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)` `![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)` + agent address. Redeem promo `MHACKS26` / `MHACKSAV` on asi1.ai. Separate submission via the MHacks Submission Agent (3–5 min video required).

---

## 8. Integrations (P)

### 8.1 Fitbit (legacy Web API; P has credentials)
- OAuth 2.0 Authorization Code + PKCE; authorize `https://www.fitbit.com/oauth2/authorize`, token `https://api.fitbit.com/oauth2/token`; access token 8h, store refresh token (encrypted) in `fitbit_connections`. Scopes: `activity heartrate sleep oxygen_saturation respiratory_rate temperature weight profile`. If the app type is **Personal**, intraday HR is available for the owner's account (demo uses P's account; app type changeable in dev portal).
- On connect: backfill 7 days (daily activity summary → steps/active_minutes; `/1/user/-/activities/heart/date/{d}/1d/1min.json` → heart_rate + resting_heart_rate; `/1.2/user/-/sleep/date/{d}.json` → sleep_* minutes; `/1/user/-/br/date/{d}.json`; HRV/SpO2/temp endpoints UNVERIFIED — try `/1/user/-/hrv/date/{d}.json`, `/1/user/-/spo2/date/{d}.json`, `/1/user/-/temp/skin/date/{d}.json`, skip on 404).
- Subscriptions: register subscriber in dev portal with URL `https://<agent>/integrations/fitbit/webhook`; verification = two GETs `?verify=` (correct code → 204, wrong → 404 within 5s). POST body = array of `{collectionType,date,ownerId,subscriptionId}`; respond 204 immediately, enqueue fetch for that date (`BackgroundTasks`). Subscribe collections `activities`, `sleep`, `body`. HR has no collection — fetch intraday HR on every `activities` notification. Failed deliveries aren't retried → also poll every 15 min per connected user (≤5 calls/poll ≪ 150/h limit).
- Normalize → `IngestBatch(source=fitbit)` → shared ingest writer. Dedupe by PK.
- Fitbit device syncs via phone roughly every 15 min; force sync from the Fitbit app before the demo.
- **Go/no-go at hour 1:** confirm P's app still authorizes and returns intraday HR. If blocked, Fitbit becomes a second simulator persona (`source=fitbit`, same normalizer) and we say so.

### 8.2 Apple Watch simulator (`app/integrations/apple_sim/`)
- Deterministic persona generator (seeded per user). Circadian resting HR ~ baseline ± noise; steps bursts (commute/meals); workouts; nightly sleep stages; SpO2 ~97±1; HRV; respiratory rate at night.
- Scenarios: `normal`, `workout_now` (HR ramps to 150 for 20 min starting now), `illness_onset` (resting HR +10, HRV −30%, last night sleep 5h, temp +0.6), `great_sleep`, `sedentary_day`, `low_spo2`. `fast_forward_min` emits a compressed history immediately so judges don't wait.
- Runs on APScheduler every minute: emits the last minute's samples as a **Health Auto Export–shaped JSON** (`{"data":{"metrics":[{"name":"heart_rate","units":"bpm","data":[{"date":"2026-10-03 14:30:00 -0400","Min":65,"Avg":72,"Max":85}]}, …],"workouts":[]}}`) and POSTs to its own `/ingest/hae`. This proves a real iPhone running Health Auto Export could drop in later; parser is case-insensitive on `Avg/avg`, accepts `yyyy-MM-dd HH:mm:ss Z` and ISO-8601.

### 8.3 Google Calendar (`app/integrations/gcal/`) — owned by J (moved from P on 2026-10-03)
- Own Google Cloud project, OAuth client (web), consent screen in **Testing** (add every demo Google account as test user; refresh tokens expire after 7 days in Testing → consent within 7 days of judging). Request `access_type=offline&prompt=consent`. Scope: `https://www.googleapis.com/auth/calendar` (single scope keeps it simple; `calendar.events` + `calendar.app.created` is the narrower alternative).
- On connect: create secondary calendar "Pulse Health" (store id), initial `events.list` for next 7 days on primary → `calendar_events_cache`; refresh every 30 min with `syncToken` (handle 410 → full sync). `is_important` heuristic: title matches `exam|interview|flight|presentation|race|final|midterm|deadline|wedding` or attendees ≥ 3 or user marks it in UI (stretch).
- `apply` proposal: `freebusy.query` to confirm slot, `events.insert` into "Pulse Health" with description = rationale + "Created by Pulse with your approval". Store `google_event_id`.
- Libraries: `google-api-python-client google-auth-oauthlib`.

### 8.4 Ingest + Tiger (`app/ingest/`, `app/vitals/`)
- Writer: `executemany` with `ON CONFLICT DO NOTHING`; upsert `daily_summary` (Neon) for affected (user, day, metric); then `await live.on_samples_ingested(user_id, metrics)` wrapped in try/except.
- Reads: `vitals_1m/1h/1d` views; `latest` from `vitals_raw` with `ORDER BY ts DESC LIMIT 1` per metric (use `DISTINCT ON`).

---

## 9. Channels (J)

### 9.1 Photon gateway (`services/gateway/`)
- `spectrum-ts`, env `SPECTRUM_PROJECT_ID/SECRET` from app.photon.codes; provider `imessage.config()`. Free tier: 10 users, shared number pool, 50 new conversations/line/day, 5,000 outbound/day.
- Loop `for await (const [space, m] of app.messages)`: dedupe on `m.id`; POST `{channel:'imessage', external_id: sender phone, text, message_id}` to `/agent/inbound` with `X-Internal-Token`; `space.send(reply)`.
- HTTP `POST /send {to, text}` (auth `GATEWAY_SECRET`): `im.user(to)` → `im.space.create(user)` → `space.send(text)`. **Hour-0 experiment:** can the free shared line message a number that never texted it? Photon docs show `space.create` but the deliverability guide says "users text you". Design assumes **user texts first**: onboarding step 6 shows the Photon number + code `PULSE-XXXX`; linking happens on the first inbound. Add every demo phone to the Photon project users list.
- `GET /health`. Local dev with the `terminal` provider (no credentials needed).

### 9.2 Web notifications
`alerts` table rendered on dashboard; `read_at` on view. Simple polling every 15s (no websockets).

### 9.3 ElevenLabs (`app/voice/`, P2)
`elevenlabs` SDK, `text_to_speech.convert(model_id="eleven_flash_v2_5", voice_id=<pick from library>)`; cache mp3 per (user, day) in Neon `briefings.audio_url` (store bytes in Railway volume or return inline `audio/mpeg`); free tier 10k credits ≈ 11 briefings — fine for demo; `$1 Starter` if needed.

---

## 10. Web app (J) — pages and flows

- **Auth**: Neon Auth (`@neondatabase/auth`, route `app/api/auth/[...path]`, `proxy.ts` guarding `(app)` routes). Email+password + Google (Neon's shared dev Google credentials work for login; Calendar uses P's separate OAuth client — keep them separate).
- **Onboarding** (`/onboarding`, stepper persisted in `profiles.onboarding_step`):
  1. Profile: name, DOB, sex, height, weight, timezone (auto), usual wake/bed time, phone.
  2. Health history: **"Import my records" (FinchNode)** → scenario picker styled as a patient-authorized connect (`baseline-adult` Morgan Rivera; `polypharmacy-senior`; `pediatric-asthma`; `sparse-record`) → `POST /twin/import {scenario}` → Python fetches `https://api.finchnode.com/demo/v1/patients/{id}/records` (no key, 120 req/min/IP; use `ck_test_` key against `/api/v1` if signup works) → prefill conditions/meds/allergies/labs → user edits + adds family history chips.
  3. Devices: "Connect Fitbit" (→ `/integrations/fitbit/authorize`), "Simulate Apple Watch" toggle (→ `/sim/scenario normal`).
  4. Google Calendar connect (→ `/integrations/google/authorize`), skippable.
  5. Goals: presets (8k steps/day, 7.5h sleep, 150 active min/week, 3 workouts/week, resting HR ≤ X) with editing.
  6. iMessage: show Photon number + `PULSE-XXXX`; poll `/channels/status`; "I'll do this later".
  7. Done → builds twin v1 → dashboard.
- **Dashboard** (`/dashboard`): status hero (twin status + one-line Gemini summary), live HR sparkline (last 3h, `bucket=1m`, refresh 30s), today's steps/active minutes vs goal rings, last night sleep, HRV/SpO2 tiles, pending proposals with Approve/Reject, alerts feed, morning briefing card with ▶ (ElevenLabs), upcoming important events, "agent last seen" from heartbeat.
- `/twin`: profile, conditions, meds, labs, family history, baselines, thresholds, insights, version timeline.
- `/goals`, `/alerts`, `/settings` (channels, quiet hours, disconnect, delete account).
- **`/demo`** (judge control panel, auth-gated to team accounts): buttons for each scenario + "Run morning briefing now" + "Rebuild twin" + live log of the last 10 alerts/messages. This is how the live demo is driven.
- Design: J's Figma file (other account/MCP) → tokens in `tailwind.config`; shadcn components; mobile-first (judges will look on phones); dark mode.
- Data access: server components read Neon via Drizzle for alerts/goals/twin/proposals; vitals via `/api/agent/vitals/*` proxy (adds internal token).

---

## 11. Environment variables

`services/agent`: `DATABASE_URL` (Neon pooled), `TIGER_DATABASE_URL`, `INTERNAL_TOKEN`, `GATEWAY_URL`, `GATEWAY_SECRET`, `SECRET_KEY` (Fernet), `GEMINI_API_KEY`, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_SMART`, `LLM_FAKE`, `FITBIT_CLIENT_ID/SECRET`, `FITBIT_SUBSCRIBER_VERIFY_CODE`, `GOOGLE_CLIENT_ID/SECRET`, `GOOGLE_REDIRECT_URI`, `FINCHNODE_API_KEY` (optional), `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `AGENT_SEED`, `PUBLIC_WEB_URL`, `PUBLIC_AGENT_URL`, `PHOTON_NUMBER_DISPLAY`.
`services/gateway`: `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `AGENT_URL`, `INTERNAL_TOKEN`, `GATEWAY_SECRET`, `PORT`.
`apps/web`: `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (migrations), `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `AGENT_URL`, `INTERNAL_TOKEN`, `NEXT_PUBLIC_APP_URL`, `TEAM_EMAILS` (demo panel gate).

Budget: Railway $5, Neon Launch ~$8 (3 days, optional), ElevenLabs $0–1, Gemini $0 (+ ≤$15 cap if billing enabled), .tech $0, Photon $0, Tiger $0, FinchNode $0. **≈ $15–30 of $100.**

---

## 12. Testing plan

**Principles:** CI never calls a paid/remote API (`LLM_FAKE=1`, recorded fixtures); every rule has a golden test; contracts drift fails CI; a post-deploy smoke run is mandatory before anyone sleeps.

Python (`services/agent/tests`, pytest + pytest-asyncio + httpx + respx):
- `unit/rules/`: one test per rule from `contracts/fixtures/series_*.json` (workout, illness_onset, low_spo2, inactivity, sedentary_goal, high_bp_hypertensive, beta_blocker_suppression, recovery), plus cooldown tests. (J)
- `unit/twin/`: FinchNode import from recorded `patient-demo-001` and `polypharmacy` JSON → expected twin fields/thresholds; baseline computation; defaults when sparse. (J)
- `unit/chat/`: fast-path regexes; tool dispatch with fake LLM; link-code flow. (J)
- `unit/ingest/`: HAE parser (official field casing + lowercase variant + both date formats); Fitbit normalizers from recorded API JSON; dedupe. (P)
- `unit/gcal/`: proposal→event body mapping; importance heuristic; syncToken 410 handling (respx). (J)
- `unit/fitbit/`: webhook verify (204/404), POST ack 204 + enqueue, token refresh on 401 (respx). (P)
- `integration/`: real Postgres via `docker run timescale/timescaledb:latest-pg16` (serves both the Tiger DDL and the Neon tables) — ingest → CAGG read → rules → alert row; Compass job idempotency; proposals state machine. GitHub Actions service container. (P sets up, both add tests)
- `contract/`: export schemas and diff against `contracts/schemas/`; validate every fixture against its schema. (J writes, P wires in CI)
- `live/` (marked, manual): Gemini real call, Photon send to team phone, Fitbit sync, GCal insert into a test calendar.

Web (`apps/web`): `tsc --noEmit`, eslint, vitest for goal math/formatters/contract type guards, Playwright e2e `signup → onboarding (FinchNode import, simulate watch, goals) → dashboard shows twin + alert after /demo/scenario workout_now` against a Neon branch with `LLM_FAKE=1` agent (runs on `main` only; PRs run unit + types).

Gateway: vitest with the `terminal` provider mocked; `/send` auth test.

CI (`.github/workflows/ci.yml`, P): jobs `agent` (ruff, pytest unit+contract, integration with service container), `web` (install, generate contracts, tsc, eslint, vitest), `gateway` (tsc, vitest), `e2e` (main only). Neon branch per PR via `neondatabase/create-branch-action` (P1).

Post-deploy `scripts/smoke.sh` (P): `GET /health` on agent/gateway/web; `POST /demo/scenario workout_now fast_forward_min=20` for the demo user; poll `alerts` for `workout_detected` ≤ 90s; check `messages` has an outbound iMessage row; `GET /vitals/series bucket=1m` returns ≥ 15 points; exit non-zero otherwise. Run after every deploy and from UptimeRobot-style cron every hour during judging.

Reliability for the unattended window: UptimeRobot (free) on three `/health` URLs with phone alerts; Railway restart policy `on-failure`; APScheduler heartbeat row; dashboard "agent last seen"; `LLM_FAKE` fallback on Gemini errors; Neon upgraded to Launch or compute verified under 100 CU-h; re-consent Google Calendar within 7 days of judging; keep the Fitbit phone app open and synced.

---

## 13. Timeline (20 hours, two lanes)

| Hour | J (you) | P (partner) | Gate |
|---|---|---|---|
| 0–1 | Accounts: Neon project + Auth, Vercel, Photon project (+ test proactive send), Gemini key + check RPD, .tech domain, FinchNode signup. Write `contracts/` Pydantic + export. Notability sketch. | Accounts: Railway, Tiger Cloud, Fitbit app check (authorize + intraday HR → **go/no-go**), Agentverse/ASI:One promo. Dockerfiles + Railway services + CI skeleton. | Contracts frozen at h2 |
| 1–3 | Scaffold `apps/web` (Neon Auth, Drizzle schema incl. P's tables, migrations applied), `services/agent` skeleton (`main.py`, core, scheduler, `/health`), deploy both empty to prod. | `infra/tiger/001_vitals.sql` applied; `app/ingest` + `/ingest/hae` + Tiger writer; simulator persona `normal` emitting every minute to staging. | **h3: samples visible in Tiger via `/vitals/series`** |
| 3–6 | Rules engine + live agent + notify + fake LLM; gateway deployed and linked to your phone; first "nice workout" iMessage from `/demo/scenario workout_now`. | Fitbit OAuth + backfill + webhook + poll; `/vitals/*` read API; simulator scenarios + `/sim/scenario`. | **h6: thin slice end-to-end live** (sim → rules → iMessage + dashboard row) |
| 6–10 | Onboarding (7 steps) incl. FinchNode import → twin v1; dashboard v1 with live sparkline, goals, alerts, proposals, demo panel. Real Gemini phrasing. | (GCal moved to J) | **h10: demo path 1–4 (section 14) works on prod** |
| 10–14 | Compass jobs (briefing, evening, twin rebuild, proposals sweep); `/agent/inbound` with tools + "yes" approval; settings/quiet hours. | Fetch.ai uAgent deployed, mailbox connected, Agentverse profile + README badges; integration tests + CI green; `smoke.sh`. | h14: ASI:One chat answers "how did I sleep" |
| 14–17 | ElevenLabs briefing; Figma polish applied; `/twin` page; Playwright e2e. | Tiger CAGGs hierarchical + retention; Neon branch-per-PR; UptimeRobot; Fitbit real data verified on dashboard; fix list. | h17: **feature freeze** |
| 17–20 | Demo video (3–5 min, also needed for Fetch.ai), Devpost text + screenshots (Notability, Figma), README. | ASI:One Submission Agent; final `smoke.sh`; Google re-consent; Neon plan check; seed demo user; rehearsal. | Submit ≥30 min early |

Cut order if behind (first to go): Presage/Relay (already out) → Tiger CAGG polish (fallback to Neon views) → ElevenLabs → Fetch.ai tools beyond forwarding → `/twin` page → weekly review job → evening check.

---

## 14. Demo script (judges, ~4 min, driven from `/demo` + a phone mirrored via QuickTime)

1. **Sign-up + onboarding (45s):** create account, import "Morgan Rivera" FinchNode record → twin shows hypertension + T2DM + lisinopril, thresholds auto-tightened; set goals; connect Fitbit (already connected on P's account) and simulate Apple Watch; link iMessage by texting the code — welcome message arrives.
2. **Live processing (30s):** press "Simulate workout" → HR sparkline climbs → within ~60s iMessage: "Nice 20-min session, peak 152 bpm…".
3. **Autonomy (60s):** press "Simulate illness onset" (+ an "Exam" event already on the calendar tomorrow) → iMessage: "Resting HR 71 vs your usual 62, 5h sleep, HRV down 30%. With your exam Thursday I'd protect tonight: block 10pm–6am for sleep? Reply YES." Reply YES → event appears in Google Calendar ("Pulse Health") → confirmation text; dashboard status → "possibly ill".
4. **Conversation (30s):** text "how am I doing on steps this week?" → tool-backed answer; ask the same on ASI:One.
5. **Briefing (20s):** press "Run morning briefing" → card on dashboard, play ElevenLabs audio.
6. **Architecture slide (30s):** two pools (Tiger live / Neon long-term), two agents, FinchNode twin, Photon, Fetch.ai, Gemini.

---

## 15. Subagent plan for execution (for the Claude Code sessions)

Each person runs Claude Code in their own clone; spawn subagents **only within your own ownership paths** (section 4), each in an isolated worktree, and merge via PRs. Suggested parallel subagents:

**J's session**
- `web-scaffold`: Next.js + Neon Auth + Drizzle schema + migrations + deploy to Vercel (depends on nothing; starts at h1).
- `agent-core`: FastAPI skeleton, contracts, export script, scheduler, `/health`, Dockerfile usage (h1).
- `rules-live`: rules + fixtures + golden tests + live agent + notify (after `agent-core`).
- `twin-finchnode`: FinchNode client, import endpoint, baselines, thresholds, tests (parallel with `rules-live`).
- `gateway-photon`: spectrum-ts gateway + `/send` + link-code flow (parallel).
- `web-onboarding-dashboard`: pages (after `web-scaffold`; consumes contracts).
- `chat-compass`: inbound handler + scheduled jobs (after `rules-live`).
- `voice-elevenlabs` (P2), `e2e-playwright` (P2).
Research-only subagents during build (cheap, run when a blocker appears): "Photon proactive send on free tier — empirical test instructions", "Gemini free-tier limits as shown in AI Studio for this project", "Neon Auth: read Google refresh token from `account` table?" (only if you want to merge login and Calendar consent — default is NOT to).

**P's session**
- `tiger-ingest`: DDL + writer + HAE parser + `/vitals/*` + tests.
- `apple-sim`: personas + scenarios + scheduler emission.
- `fitbit`: OAuth, backfill, webhook, poll, normalizers, tests.
- `fetchai-agent`: uAgent + Agentverse registration + README section.
- `ci-deploy-smoke`: workflows, Dockerfiles, Railway config, `smoke.sh`, UptimeRobot.

Subagent prompt template: paste section 4 (ownership), section 6 (contracts), the relevant subsection of 7/8/9/10, and the testing bullets for that package; instruct "do not touch files outside these paths; add tests; run `uv run pytest tests/<pkg>` / `npm test` before reporting; report unverified assumptions."

---

## 16. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Fitbit legacy app can't authorize / intraday denied | medium | h1 go/no-go; fallback = Fitbit persona in simulator with `source=fitbit`; still show the integration code |
| Photon free line can't message first | medium | user texts link code first (designed in); SMS fallback is built into Photon |
| Gemini free RPD exhausted | medium | deterministic rules + templates; `LLM_FAKE` fallback; enable billing with $15 cap |
| Tiger free tier CAGGs unsupported / pauses | medium | portable DDL; `TIGER_DATABASE_URL` unset → Neon views; decide at h5 |
| Neon free CU-hours run out mid-judging | low-medium | monitor usage; upgrade to Launch (~$8) |
| Google Testing-mode refresh token expiry (7 days) | low | consent on day of submission; token error → alert in `job_runs` + dashboard banner |
| Railway/scheduler dies overnight | low | UptimeRobot alerts to both phones; restart policy; idempotent jobs |
| Merge conflicts in shared files | medium | freeze at h2; additive-only; append-only `main.py`; separate Drizzle schema files per owner |
| Scope creep | high | cut order in section 13; `/demo` panel exists by h10 regardless |
| Health advice liability optics | — | footer + onboarding disclaimer "wellness guidance, not medical advice"; urgent alerts say "seek care if…" |

---

## 17. Files to write on approval (this step's actual edits)

1. `PLAN.md` — sections 1–16 verbatim (the hand-off document).
2. `SPEC.md` — pitch, 3 must-have features (live rules→iMessage; twin from FinchNode + onboarding; approval-gated calendar action), demo flow (section 14), stretch, out of scope.
3. `CLAUDE.md` — description, stack, commands (`uv run uvicorn app.main:app --reload`, `uv run pytest`, `npm run dev`, `npm test`, `bun run src/index.ts`), layout (5 lines), ownership pointer to `PLAN.md §4`, contracts rule.
4. `DECISIONS.md` — one line each: Gemini; Next.js+FastAPI+Node gateway; Neon+Neon Auth; Tiger for live pool w/ fallback; Photon over Twilio; legacy Fitbit until Oct 30; simulated Apple Watch via HAE format; FinchNode demo API for twin; Railway Hobby; AI track; skip Presage/Relay/others.
5. `PROGRESS.md` — Done: plan; Next: hour 0–1 checklist for J and P.
6. `.env.example` — section 11 variables, grouped by service.
7. `contracts/README.md` — endpoint tables from section 6 (so it exists before code).
8. `docs/DEMO.md`, `docs/SUBMISSION.md` — sections 14 and the Devpost/ASI:One checklist.

## 18. Verification of this step
- Files exist and render; `PLAN.md` is self-contained (someone with no chat context can start at section 13 hour 0).
- A second agent given only `CLAUDE.md` + `PLAN.md` can list P's first three tasks and J's first three tasks without asking questions.
- Commit on a branch `j/plan` and open a PR for P to read; do not push to `main` directly.
