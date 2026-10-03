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
1. ~~Apple Watch simulator~~ built (PR): personas + 6 scenarios + fast_forward + per-minute tick; tested against the real rules. Needs a run against live Neon + Spacetime
2. ~~Shared ingest writer + `/ingest/samples`, `/ingest/hae`~~ built (PR): Spacetime `ingest`, idempotent Neon `daily_summary` (point metrics replace; minute metrics recomputed from `minute_agg`), `ingest_log`, `on_samples_ingested`; Fitbit now routes through it
3. ~~Fitbit: resting HR, sleep, active minutes~~ built (PR) and checked against a real week of Inspire 3 data: also SpO2 and HRV. Daily metrics are fetched by whole civil days (2 per poll, 7 on connect) and replace the day's `daily_summary` row. Fitbit reports RMSSD, stored as `hrv_sdnn` with `meta.measure=rmssd`
4. Fetch.ai uAgent: built (`app/fetchai`, PR): mailbox agent + chat protocol, forwards to `/agent/inbound` as `asi_one`; boots, registers on Almanac, publishes the chat manifest. Address `agent1qw9glwdgrmg9tmd7fj9u6wst50d38hwcaat09nck0aml3jvdkrrf6n7pxcv` comes from `AGENT_SEED` (the deployed service must use the same seed). Left: click Connect > Mailbox in the Agentverse Inspector once, set profile, test in ASI:One, and **ASI:One account linking** (web only creates `imessage` link codes; needs an `asi_one` code from the web or a P-side claim endpoint). Then Agentverse profile + README badges + ASI:One submission (PLAN §7.6)
5. Deploy: Dockerfiles, Railway services (`agent-api`, `agent-fetchai`, `gateway`), CI (ruff, pytest, contracts `--check`, web build), `scripts/smoke.sh`, UptimeRobot
6. **FinchNode (P)**: live-verified for all 6 scenarios; offline fixtures now cover all 6; twin also carries `immunizations`, `encounters` and richer provenance (additive keys). Not done: show provenance on `/twin` (J's page); authenticated `/api/v1` mode (needs a key from finchnode.com); FHIR bundle endpoints. Dropped: seeding FinchNode vitals into the live pool (record dates are months to years old, Spacetime keeps 48h)
7. Google OAuth consent screen: rename "Rest Recommender" → "Pulse", publish to "In production" (Testing-mode refresh tokens expire in 7 days), add prod redirect URIs once deployed

## Known bugs
- Gateway stream-restart after end unverified on live Photon line
- Spacetime reads with a non-owner admin token: fixed by J's #27 views; the agent switches with `SPACETIME_ADMIN_VIEWS=1` (writer and `/vitals/*` read `admin_minute_agg` after `watch_user`; live-verified: simulator to Spacetime to `/vitals/series|latest`, resend leaves n unchanged). J's `live._series` and `sweep_all` still read `minute_agg` directly, so they need the owner token (deployed) or `spacetime.table()`
