![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

# Pulse — your health agent in iMessage

Pulse reads live wearable vitals (Fitbit via the Google Health API, plus a simulated Apple Watch that emits Health Auto Export JSON), builds a digital twin from the user's medical record (FinchNode synthetic EHR) and onboarding answers, watches the live stream with a deterministic rules engine, and uses Gemini to phrase alerts. It acts with approval: resting heart rate +10 bpm and 5 h of sleep with an exam tomorrow → it texts a proposed sleep block; reply YES and it writes the event to Google Calendar.

Live: https://pulse-mhacks.vercel.app

## What it does

- Live alerts (workout, illness onset, low SpO2, high BP, inactivity, goal pace, sleep debt, recovery) within ~60 s to iMessage and the web dashboard
- Digital twin with twin-aware thresholds (hypertension tightens BP to 130/80; beta-blockers suppress low-HR alerts)
- Approval-gated calendar actions
- Chat in iMessage or ASI:One with tools (steps, sleep, goals, approve/reject, propose a block, log a symptom)
- Morning briefing, spoken via ElevenLabs
- Judge demo panel at `/demo`

## Demo flow (verified live)

1. Sign up and onboard: import Morgan Rivera from FinchNode, connect Google Calendar, text the `PULSE-XXXXXX` code to the Pulse iMessage line.
2. Workout scenario → "nice workout, peak 154 bpm" alert.
3. Illness onset with "EECS 281 Midterm Exam" tomorrow → iMessage proposal → reply YES → "Sleep block (Pulse)" 11 PM–7 AM appears in the "Pulse Health" Google calendar and Pulse texts a confirmation.
4. Ask "how did I sleep?" in iMessage or ASI:One.

## Architecture

```
Wearables (Fitbit / Google Health API, Apple Watch simulator)
    ↓
FastAPI agent /ingest
    ↓
SpacetimeDB live pool (sample + minute_agg)  +  Neon daily_summary
    ↓
Rules engine (Pulse live agent)  +  Compass scheduled jobs
  (briefing 7 am, evening check, nightly twin rebuild, proposal sweep)
    ↓
Gemini phrasing → notify → Photon iMessage gateway (spectrum-ts) / web dashboard
Fetch.ai uAgent (ASI:One) → /agent/inbound      Google Calendar module ← approved proposals
```

## Tech and sponsors

| Sponsor | How Pulse uses it |
|---|---|
| Photon | Spectrum iMessage gateway: inbound chat and proactive alerts |
| FinchNode | EHR import seeds the digital twin |
| Neon | Postgres long-term store, Neon Auth sign-in, branch-per-test workflow |
| SpacetimeDB | Live vitals pool: idempotent ingest reducer, minute rollups, retention, admin views |
| Google Gemini | Alert phrasing with structured output; chat with function calling; template fallback so a 429 never blocks an alert |
| Fetch.ai | Mailbox uAgent on Agentverse, chat protocol, discoverable in ASI:One |
| ElevenLabs | Spoken morning briefing |
| Figma | Design |

## Fetch.ai agent

- Name: Pulse Health Agent
- Address: `agent1qw9glwdgrmg9tmd7fj9u6wst50d38hwcaat09nck0aml3jvdkrrf6n7pxcv`
- Protocol: Agent Chat Protocol
- Details: [services/agent/app/fetchai/README.md](services/agent/app/fetchai/README.md)

## Repo layout

- `apps/web` — Next.js 16, Neon Auth, Drizzle, Tailwind, shadcn
- `services/agent` — Python 3.12 FastAPI: rules, twin, chat, Compass jobs, integrations, Fetch.ai
- `services/gateway` — Node + spectrum-ts (Photon iMessage)
- `infra/spacetime` — TypeScript SpacetimeDB module
- `infra` — Dockerfile, Railway configs, deploy guide
- `contracts` — Pydantic → JSON Schema, fixtures

## Run locally

```bash
cd services/agent && uv sync && uv run uvicorn app.main:app --reload --reload-dir app
cd apps/web && npm i && npm run dev
cd services/gateway && npm i && npx tsx --env-file=.env src/index.ts
```

Env vars are listed in `.env.example`. Tests: `uv run pytest` in `services/agent`, `npm test` in `apps/web` and `services/gateway`.

## Team

J (Jiadong Gu) and P (Gavin Mordhorst).

---

Pulse gives wellness guidance, not medical advice.

## Evaluation

A live Gemini evaluation harness lives in `services/agent/evals/` (`uv run python -m evals.gemini_eval`, uses a throwaway Neon branch). The first run (141 cases: alert phrasing across 3 patient personas, 47 chat conversations incl. emergencies, injection and cross-user requests, and robustness under bad keys/timeouts/quota) is in [`services/agent/evals/report.md`](services/agent/evals/report.md); its findings were fixed in #37, #46, #50 and #52.
