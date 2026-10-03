# Submission checklist

Submit at least 30 minutes before the deadline.

## Devpost
- [ ] Title: Pulse — your health agent in iMessage
- [ ] Track: Actually Intelligent (AI). Also Grand Prize.
- [ ] Sponsor tags: Photon, FinchNode, Neon, Spacetime, Google Gemini (MLH), Fetch.ai, ElevenLabs, Figma, .Tech
- [ ] Figma file link + 2 design screenshots
- [ ] Live URL (.tech domain) + demo account credentials for judges
- [ ] 3-5 min video (also required by Fetch.ai)
- [ ] Repo link; tech list; "how we used X" paragraph per sponsor

## Fetch.ai / ASI:One (separate)
- [ ] README has `![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)` `![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)`, agent name(s) + `agent1q…` address(es), Agentverse profile URL
- [ ] Agent is mailbox-connected and answers in ASI:One ("how did I sleep", "block sleep tonight")
- [ ] Submit via the MHacks ASI:One Submission Agent (hackpack: fetch.ai/events/hackathons/mhacks-2026/hackpack); include video + repo
- [ ] Promo redeemed: `MHACKS26` / `MHACKSAV`

## Pre-freeze ops (so it survives judging)
- [ ] `scripts/smoke.sh` green against prod
- [ ] UptimeRobot monitors on web, agent, gateway `/health`, alerts to both phones
- [ ] Google Calendar re-consented within 7 days of judging (Testing-mode tokens expire)
- [ ] Neon compute usage checked; upgrade to Launch if < 30 CU-hours left
- [ ] Fitbit app on phone synced; Photon project has all demo phones as users
- [ ] Gemini billing cap set; `LLM_FAKE` fallback verified by killing the key once
- [ ] Demo user reseeded; "Exam" event tomorrow on calendar
