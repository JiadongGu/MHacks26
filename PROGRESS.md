# Progress

## Live
- Web: https://pulse-mhacks.vercel.app (Vercel; **auto-deploys on every merge to main**, root `apps/web`)
- Agent API, Fetch.ai agent, iMessage gateway: Railway (P deploys with the Railway CLI; infra/DEPLOY.md)
- Neon production (wispy-wind-94465979), Spacetime `pulse-live-t8ng8`, Photon project `0798a828…` (free shared pool)

## Done (verified end to end)
- iMessage loop on a real phone: alert → proposal → YES → event in Google Calendar ("Pulse Health") → confirmation text
- Rules R1–R8 + low HR; illness onset with calendar-aware sleep block; Gemini phrasing with template + model fallback (429/500/503)
- Digital twin from FinchNode (demo records + FinchNode Connect), onboarding (own history, focus areas, US units)
- Live vitals: Fitbit (Google Health API) + Apple Watch simulator → Spacetime → rules; live HR chart on the dashboard
- Chat (iMessage, ASI:One, web): tools, link codes (6-char, 15-min expiry, rate limited), deterministic 911 guard, exact YES/NO
- ElevenLabs spoken briefing; daily planner (writes to Pulse Health calendar without asking — decided); evening check
- Pages: dashboard, twin, goals, alerts (+ "Why?" explanations), calendar & approvals, conversations, settings, demo, privacy
- Focus areas carry meaning for the planner and chat (`app/focus/guide.py`, new `sun` area); skin cancer history turns on sunscreen, a reapply ≥2 h later and a monthly skin check (#68, #75)
- Dashboard: Your numbers under the status hero with per-metric settings toggles, plan for today and tomorrow (#74, #76); focus save 405 fixed, connect returns to setup (#73)
- Gemini eval harness (services/agent/evals) with findings fixed; README, Devpost draft, video script; Figma file; testreel skill (video/)

## Waiting on
- P: redeploy agent-api + agent-fetchai from current main ("Why?" explanations, 911 guard, model fallback are not live until then); Agentverse Inspector → Connect → Mailbox (Pulse shows inactive, no handle)
- P: publish the Google OAuth consent screen to "In production" (Testing tokens expire after 7 days); rename it to Pulse
- Figma clinical redesign (in progress) → decide whether to port the light theme + Home / Vitals & Trends / Health record

## Next
- Port the redesign; Vitals & Trends page; Share-with-clinician summary
- Uptime monitors + `scripts/smoke.sh` against production; check Neon compute hours before judging
- Record the demo video (docs/VIDEO_SCRIPT.md) with testreel + phone capture; submit Devpost + ASI:One

- Dashboard (2026-10-04): Your focus today (progress per focus area; sleep, steps and workouts measured, the rest counted from ticked plan items via `POST /plan/done`), one Check-ins section (morning and evening share a card, newest first, broad goals with no clock times), Your numbers as a compact side panel with per-metric hide toggles in settings (`profiles.hidden_metrics`), events colored peacock/lavender/tangerine, plans cover today and tomorrow
- Readable AI text: labelled lines for the briefing, evening check and twin summary; `chat.clip_lines` keeps line breaks
- iMessage for anyone (free plan): `POST /channels/imessage/line` registers a phone as a Photon shared user and returns the line they were assigned; the Finish step shows that line. Limit is Photon's 10 shared users on Free (100 Pro); Business has one dedicated number and no list. `SPECTRUM_PROJECT_ID` and `SPECTRUM_PROJECT_SECRET` are on agent-api. Verified live for Gavin's phone

## Next — Gavin's demo (real data)
- Redo onboarding with real accounts: Calendar, Fitbit, then **Connect my health record** (FinchNode, production). Fix whatever the first real run shows
- Add the skin cancer history (or let FinchNode supply it) and check the plan shows sunscreen and the monthly skin check
- Text the Pulse line +1 (415) 603-5536 as a blue iMessage after linking with a new code
- Decide simulator vs real Fitbit for the demo; first real 9 pm evening run is unverified
- Ask Photon (sponsor) to enable the Business plan: one dedicated number, no allowlist, no 10-user cap
- Improve the chat answers (iMessage / ASI:One replies) the way the briefing was reworked
- Publish the Google consent screen (7-day token expiry); rotate every secret that was pasted in chat (Spacetime token, FinchNode keys and webhook secret, others) after the demo

## Known bugs
- Photon free plan: testers must be registered and each gets their own line (docs/DEMO.md); onboarding shows J's line
- Spacetime with a non-owner admin token: set `SPACETIME_ADMIN_VIEWS=1`; the writer, `/vitals/*`, `live._series` and `sweep_all` all read the `admin_*` views then

## Dev access (how P reaches Neon and Spacetime)
- Neon: P's account (gavinmo) is an Editor in J's org (`org-flat-fog-88476672`), project `wispy-wind-94465979`. Repo linked with `neon link` (`.neon`, gitignored). Test branch `p-test` (schema only, no user data, expires 2026-10-10): `neon connection-string p-test --project-id wispy-wind-94465979 --pooled` into `services/agent/.env` as `DATABASE_URL`. Never point tests at `production`
- `neon checkout` needs `npm install` at the repo root first (it evaluates `neon.ts`, which imports `@neon/config`); `neon branches create ... --schema-only --expires-at` works without it
- `.env` values can contain `&` (Neon URLs), so do not `source` it in a shell; `app.core.config.settings()` reads it directly
- Spacetime: P's token is an admin, not the owner. Set `SPACETIME_ADMIN_VIEWS=1` locally; the deployed agent uses the owner token with it unset
- Local `.env` leaks into tests (`Settings` reads it). Run `INTERNAL_TOKEN=dev-internal-token uv run pytest` if the twin tests fail
