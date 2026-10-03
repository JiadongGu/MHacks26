# Progress

## Done
- Contracts (Pydantic → 19 JSON schemas), agent skeleton, Neon project + Neon Auth + Drizzle schema (16 tables, migrated to production)
- Twin: FinchNode import → versioned digital twin, onboarding merge, rebuild, goals CRUD + progress (verified on Neon)
- Rules R1–R8 + live agent + notify + Gemini phrasing (template fallback). Verified on Neon: illness onset + exam tomorrow → warning alert + pending "Sleep block (Pulse)" 22:00–06:30 local, twin `possibly_ill`, cooldown holds
- Google Calendar (J): OAuth (account chooser), Neon token store, "Pulse Health" calendar, 30-min event cache, proposals API, approve → event inserted, reject → event cancelled. **Live-verified** with Google
- Web: onboarding (7 steps), dashboard, twin, goals, alerts, settings, `/demo`; builds/lints/tests. Not yet run with real sign-in
- Spacetime module (J) published as `pulse-live-t8ng8`: idempotent admin-only `ingest`, `minute_agg`, retention; live-verified incl. access control and the rules reader
- Fitbit + ingest (P), **live-verified on a Neon test branch and Spacetime** with a real Inspire 3: Google Health API (HR, steps, SpO2, active minutes, sleep stages, resting HR, HRV), encrypted token store in `fitbit_connections`, shared writer (Spacetime `ingest`, idempotent Neon `daily_summary` in the user's local day, `ingest_log`), 7 nights and 7 days of daily rows, resend changes nothing, `/vitals/daily` and `/integrations/fitbit/status` answer. Apple Watch simulator + `/ingest/*` + `/vitals/*` merged (#28)
- Photon gateway built on a worktree branch (9 tests); not live yet

## Next — J
- Spacetime: per-user views for the dashboard (+ identity linking); add P as admin once P sends their identity
- Run web locally with real sign-in → onboarding → Google connect; then Vercel + .tech domain
- `/agent/inbound` chat handler (fast paths YES/NO, Gemini tools), link codes, Compass jobs (briefing, evening, twin rebuild, proposal sweep)
- Photon gateway live (needs SPECTRUM_PROJECT_ID/SECRET + demo phones registered as Photon users)
- Dashboard HR sparkline from Spacetime views; Gemini key; ElevenLabs briefing; Figma file for Best Design

## Next — P (priority order)
1. ~~Apple Watch simulator~~ merged (#28): personas, 6 scenarios, fast_forward, per-minute tick. Live-verified into Spacetime; the full rules run waits on J's `live._series` reading an admin view (see Known bugs)
2. ~~Shared ingest writer + `/ingest/samples`, `/ingest/hae`~~ merged (#28), live-verified on Neon (see Done)
3. ~~Fitbit: resting HR, sleep, active minutes, HRV, SpO2~~ merged (#26), live-verified. Fitbit reports RMSSD, stored as `hrv_sdnn` with `meta.measure=rmssd`
4. Fetch.ai uAgent: merged (#31); mailbox connected; ASI:One linking merged (#32, 6-char codes, 15 min expiry). Address `agent1qw9glwdgrmg9tmd7fj9u6wst50d38hwcaat09nck0aml3jvdkrrf6n7pxcv` comes from `AGENT_SEED` (the deployed service must use the same seed). Left: end-to-end test in ASI:One (needs a signed-in user to create a code on onboarding step 6 and the agent on Neon), Agentverse profile, repo README with badges + address, MHacks submission agent, promo codes
5. Deploy: Dockerfiles, Railway services (`agent-api`, `agent-fetchai`, `gateway`), CI (ruff, pytest, contracts `--check`, web build), `scripts/smoke.sh`, UptimeRobot
6. **FinchNode (P)**: live-verified for all 6 scenarios; offline fixtures now cover all 6; twin also carries `immunizations`, `encounters` and richer provenance (additive keys). Not done: show provenance on `/twin` (J's page); authenticated `/api/v1` mode (needs a key from finchnode.com); FHIR bundle endpoints. Dropped: seeding FinchNode vitals into the live pool (record dates are months to years old, Spacetime keeps 48h)
7. Google OAuth consent screen: rename "Rest Recommender" → "Pulse", publish to "In production" (Testing-mode refresh tokens expire in 7 days), add prod redirect URIs once deployed

## Known bugs
- Gateway stream-restart after end unverified on live Photon line
- Spacetime reads with a non-owner admin token: fixed by J's #27 views for P's code; the agent switches with `SPACETIME_ADMIN_VIEWS=1` (writer and `/vitals/*` read `admin_minute_agg` after `watch_user`; live-verified: simulator to Spacetime to `/vitals/series|latest`, resend leaves n unchanged). J's `live._series` and `sweep_all` still read `minute_agg` directly, so they need the owner token (deployed) or `spacetime.table()`
- J's `live.on_samples_ingested` logs an `HTTPStatusError` after every ingest when the agent runs with a non-owner admin token (it reads `minute_agg`, which is private). It never raises, so nothing breaks; with the owner token (deployed) it works. A 3-line fix in `live._series` / `sweep_all` using `spacetime.table()` + `ensure_watching()` would let the rules run locally too

## Dev access (how P reaches Neon and Spacetime)
- Neon: P's account (gavinmo) is an Editor in J's org (`org-flat-fog-88476672`), project `wispy-wind-94465979`. Repo linked with `neon link` (`.neon`, gitignored). Test branch `p-test` (schema only, no user data, expires 2026-10-10): `neon connection-string p-test --project-id wispy-wind-94465979 --pooled` into `services/agent/.env` as `DATABASE_URL`. Never point tests at `production`
- `neon checkout` needs `npm install` at the repo root first (it evaluates `neon.ts`, which imports `@neon/config`); `neon branches create ... --schema-only --expires-at` works without it
- `.env` values can contain `&` (Neon URLs), so do not `source` it in a shell; `app.core.config.settings()` reads it directly
- Spacetime: P's token is an admin, not the owner. Set `SPACETIME_ADMIN_VIEWS=1` locally; the deployed agent uses the owner token with it unset
- Local `.env` leaks into tests (`Settings` reads it). Run `INTERNAL_TOKEN=dev-internal-token uv run pytest` if the twin tests fail

