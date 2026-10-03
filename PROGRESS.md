# Progress

## Done
- Repo set up with context files
- PLAN.md written (architecture, ownership, contracts, timeline). Research done on all sponsor APIs.

- P: gcal module (PR #5): OAuth, upcoming, freebusy, "Pulse Health" calendar; live-verified. Missing: `apply` endpoint, syncToken refresh, Neon token store
- P: fitbit module on Google Health API (legacy API dies 2026-10-30): go/no-go PASSED (live HR ~1300 samples/3h + steps). Account must be linked to Google Health. Polling only (no webhook). Missing: resting HR, sleep, active minutes; /raw debug endpoint to remove

## In progress
- Hour 0-1 setup (see PLAN.md §13)

## Next — J (hour 0-1)
- Neon project + Neon Auth, Vercel project, .tech domain (get.tech/mlh), FinchNode signup
- Photon project at app.photon.codes; add team phones as users; TEST whether the free line can message a number that hasn't texted first
- Gemini API key; read actual free-tier limits at aistudio.google.com/rate-limit; enable billing with $15 cap
- Write `services/agent/app/contracts/*.py` + `scripts/export_contracts.py`; freeze at hour 2
- Notability sketch of architecture (2 screenshots for Devpost)

## Next — P (hour 0-1)
- Railway project (Hobby, $5), Tiger Cloud free service, Google Cloud project with Calendar API + OAuth client + test users
- Fitbit go/no-go: authorize with existing app, fetch intraday HR for today
- Agentverse + ASI:One accounts; redeem `MHACKS26` / `MHACKSAV`
- Dockerfiles, Railway services (`agent-api`, `agent-fetchai`, `gateway`), CI skeleton

## Known bugs
-
