# Progress

## Done
- PLAN.md written (architecture, ownership, contracts, timeline)
- Contracts: Pydantic models in services/agent/app/contracts, scripts/export_contracts.py (--check), 19 JSON schemas — PR #2
- services/agent skeleton: FastAPI /health, config/db/auth/logging, APScheduler heartbeat; uv + py3.12
- Neon project wispy-wind-94465979 linked (production branch), Auth enabled via neon.ts, Neon skills + MCP — PR #3
- Step 2 (PR #4): Drizzle schema (16 tables) migrated to Neon production; twin + goals APIs verified end-to-end on a Neon test branch (Morgan Rivera import → v1, onboarding → v2, rebuild → v3; goals CRUD + progress); web scaffold (Next 16, Neon Auth, agent proxy, app shell) builds/lints/tests
- Photon gateway built on a worktree branch (Node 22 + tsx, terminal fallback, 9 tests); not yet tested live
- Rules R1–R8 + live agent + notify + Gemini phrasing built on a worktree branch (67 tests); not yet run against Neon

## Next — J (one step at a time, each tested on real infra before the next)
- 3) rules + live agent writing alerts/proposals against Neon
- 4) Google Calendar (moved from P): Google Cloud OAuth client, `app/integrations/gcal/`, `/calendar/*`, apply approved proposals
- 5) web app on Vercel with real sign-in
- 6) Photon gateway live (needs SPECTRUM_PROJECT_ID/SECRET; free tier: registered users only)
- Gemini key once rules are verified with templates

## Next — P
- PLAN.md §13 hour 0–1: Railway, Tiger, Agentverse. Fitbit go/no-go PASSED on Google Health API (live HR ~1300 samples/3h + steps; account must be linked to Google Health); missing resting HR, sleep, active minutes; remove `/integrations/fitbit/raw` before prod
- `neon link --project-id wispy-wind-94465979 --branch production -y` for env
- Confirm: `steps` samples are per-interval deltas (not cumulative); `daily_summary.day` is the user's local day

## Known bugs
- Gateway stream-restart after end unverified on live Photon line
