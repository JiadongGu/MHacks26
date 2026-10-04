# Decisions

One line each: choice, reason.

- Track: Actually Intelligent (AI). The agent detects, reasons over twin + calendar, proposes, and executes on approval.
- LLM: Gemini (`gemini-3.5-flash-lite` fast, `gemini-3.8-flash` smart). Free tier covers a multi-day run; MLH prize. Rules engine is deterministic so LLM failure never blocks an alert (`LLM_FAKE` templates).
- Stack: Next.js web on Vercel + Python FastAPI agent on Railway + tiny Node gateway. Photon Spectrum is TS-only, uAgents is Python-only, Vercel can't run long processes.
- Long-term DB + auth: Neon with Neon Auth (managed Better Auth) and Drizzle. Sponsor prize; one place for users, twin, goals, alerts, proposals.
- Live pool: SpacetimeDB on maincloud (replaced Tiger, 2026-10-03). Bigger sponsor prize, and live push to the dashboard instead of polling. Contract: contracts/SPACETIME.md. Python reads via HTTP SQL (no SDK); rollups precomputed in `minute_agg`.
- Messaging: Photon iMessage, user texts a link code first (free shared line may not message cold). Twilio skipped: A2P/toll-free verification takes days.
- Fitbit: legacy Web API with P's existing app (works until 2026-10-30), subscriptions webhook + 15-min poll. Go/no-go at hour 1; fallback is a simulator persona with `source=fitbit`.
- Apple Watch: simulated, emitting Health Auto Export JSON into `/ingest/hae` so a real iPhone export can drop in later.
- Digital twin seed: FinchNode demo API (`api.finchnode.com/demo/v1`, no key). Family history is self-reported because FinchNode has no such category.
- Calendar: separate Google OAuth client (Testing mode, test users, `calendar` scope); re-consent within 7 days of judging. Events go into a "Pulse Health" secondary calendar.
- Hosting: Railway Hobby ($5) for agent + gateway; Render free spins down, Vercel cron is daily-only. Neon may be bumped to Launch (~$8) for judging.
- Scheduling: APScheduler in the agent process, idempotent jobs tracked in `job_runs`.
- Contracts: Pydantic is the source of truth; JSON Schema exported; TS types generated; CI fails on drift. Frozen at hour 2, additive only after.
- Skipped: Presage (Node sidecar, 4-6h), Relay, Tiger, Nessie, Solana, SpaceXAI, Free-WILi.
- Google Calendar integration owned by J (moved from P, 2026-10-03): it closes J's approval loop (proposal -> apply) without a cross-owner dependency.
- Spacetime module owned by J (moved from P, 2026-10-03): J owns both the module and every reader (rules, dashboard views); P only calls the `ingest` reducer.
- FinchNode integration owned by P (moved from J, 2026-10-03): client, record → twin mapping, import endpoints, fixtures, FinchNode sponsor track. J keeps the twin model (baselines, thresholds, versions) that the rules depend on.
- Daily plan events are written to the separate "Pulse Health" Google calendar without asking (decided by J, 2026-10-03): they are routine, tagged so Pulse only replaces its own events, and the calendar can be hidden. Anything that changes the user's real schedule (e.g. illness sleep blocks) still needs YES.
