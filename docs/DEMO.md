# Demo script (~4 min)

Setup: `/demo` panel open on laptop, team iPhone mirrored via QuickTime, Google Calendar open in a tab, ASI:One chat open. Demo user seeded with `scripts/seed_demo.py` (FinchNode "Morgan Rivera", goals, an "Exam" event tomorrow on the connected calendar). Run `scripts/smoke.sh` 10 min before.

1. **Sign-up + onboarding (45s)** — create account; "Import my records" -> Morgan Rivera -> twin shows hypertension, T2DM, lisinopril, HbA1c 6.4, thresholds tightened to 130/80; add family history chip; set goals; Fitbit already connected (P's account); toggle "Simulate Apple Watch"; text `PULSE-XXXX` to the Photon number -> welcome iMessage.
2. **Live processing (30s)** — press "Simulate workout" -> HR sparkline climbs -> within ~60s iMessage: "Nice 20-min session, peak 152 bpm…".
3. **Autonomy (60s)** — press "Simulate illness onset" -> iMessage: "Resting HR 71 vs your usual 62, 5h sleep, HRV down 30%. With your exam Thursday I'd protect tonight: block 10pm–6am for sleep? Reply YES." Reply YES -> event appears in Google Calendar "Pulse Health" -> confirmation text -> dashboard status "possibly ill".
4. **Conversation (30s)** — text "how am I doing on steps this week?" -> tool-backed answer. Same question on ASI:One.
5. **Briefing (20s)** — press "Run morning briefing" -> dashboard card -> play ElevenLabs audio.
6. **Architecture (30s)** — two pools (Tiger live / Neon long-term), two agents (Pulse live, Compass long-term), FinchNode twin, Photon, Fetch.ai, Gemini.

Fallbacks: if iMessage is slow, show the alert on the dashboard and the `messages` log in `/demo`. If Gemini 429s, templates fire (say nothing). If Calendar insert fails, show the proposal state in `/demo` and the apply error.

Talking points: wellness guidance not diagnosis; every autonomous action is approval-gated; data is synthetic (FinchNode) plus one real Fitbit.
