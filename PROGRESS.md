# Progress

## Done
- Contracts (Pydantic → 19 JSON schemas), agent skeleton, Neon project + Neon Auth + Drizzle schema (16 tables, migrated to production)
- Twin: FinchNode import → versioned digital twin, onboarding merge, rebuild, goals CRUD + progress (verified on Neon)
- Rules R1–R8 + live agent + notify + Gemini phrasing (template fallback). Verified on Neon: illness onset + exam tomorrow → warning alert + pending "Sleep block (Pulse)" 22:00–06:30 local, twin `possibly_ill`, cooldown holds
- Google Calendar (J): OAuth (account chooser), Neon token store, "Pulse Health" calendar, 30-min event cache, proposals API, approve → event inserted, reject → event cancelled. **Live-verified** with Google
- Web: onboarding (7 steps), dashboard, twin, goals, alerts, settings, `/demo`; builds/lints/tests. Not yet run with real sign-in
- Spacetime module (J) published as `pulse-live-t8ng8`: idempotent admin-only `ingest`, `minute_agg`, retention; live-verified incl. access control and the rules reader
- Fitbit (P): Google Health API, live-verified on an Inspire 3 (HR + per-minute steps), Neon token store, 5-min poll → Spacetime `ingest` → `on_samples_ingested`
- Photon gateway built on a worktree branch (9 tests); not live yet

## Next — J
- Spacetime: per-user views for the dashboard (+ identity linking); add P as admin once P sends their identity
- Run web locally with real sign-in → onboarding → Google connect; then Vercel + .tech domain
- `/agent/inbound` chat handler (fast paths YES/NO, Gemini tools), link codes, Compass jobs (briefing, evening, twin rebuild, proposal sweep)
- Photon gateway live (needs SPECTRUM_PROJECT_ID/SECRET + demo phones registered as Photon users)
- Dashboard HR sparkline from Spacetime views; Gemini key; ElevenLabs briefing; Figma file for Best Design

## Next — P (priority order)
1. **Apple Watch simulator** (`app/integrations/apple_sim/`): personas + scenarios `normal | workout_now | illness_onset | great_sleep | sedentary_day | low_spo2`, `fast_forward_min`, 1-min emission as Health Auto Export JSON → `/ingest/hae`; `POST /sim/scenario` (PLAN §8.2). **The whole live demo depends on this.**
2. **Shared ingest writer + `/ingest/samples`, `/ingest/hae`** (PLAN §8.4): Spacetime `ingest` + **upsert Neon `daily_summary`** (user's local day) + `on_samples_ingested`. Route Fitbit sync through it — today Fitbit writes Spacetime only, so R2/R5/R7/R8 and goal progress never see Fitbit days
3. Fitbit: resting HR, sleep (total/deep/REM), active minutes from the Health API
4. Fetch.ai uAgent: mailbox agent, chat protocol, tools → `/agent/inbound`, `/proposals`; Agentverse profile + README badges; ASI:One submission (PLAN §7.6)
5. Deploy: Dockerfiles, Railway services (`agent-api`, `agent-fetchai`, `gateway`), CI (ruff, pytest, contracts `--check`, web build), `scripts/smoke.sh`, UptimeRobot
6. **FinchNode (moved to P)**: owns the client, `from_finchnode()` mapping, `/twin/import`, `/twin/finchnode/patients`, fixtures. Ideas for the sponsor track: use the authenticated `/api/v1` with a `ck_test_` key, import more categories (immunizations, encounters), FHIR endpoints, provenance shown in `/twin`. Keep `DigitalTwin.model` keys stable — rules read them
7. Google OAuth consent screen: rename "Rest Recommender" → "Pulse", publish to "In production" (Testing-mode refresh tokens expire in 7 days), add prod redirect URIs once deployed

## Known bugs
- Gateway stream-restart after end unverified on live Photon line
