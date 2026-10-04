# Demo script (~4 min)

Setup: `/demo` panel open on laptop, team iPhone mirrored via QuickTime, Google Calendar open in a tab, ASI:One chat open. Demo user seeded with `scripts/seed_demo.py` (FinchNode "Morgan Rivera", goals, an "Exam" event tomorrow on the connected calendar). Run `scripts/smoke.sh` 10 min before.

1. **Sign-up + onboarding (45s)** — create account; "Import my records" -> Morgan Rivera -> twin shows hypertension, T2DM, lisinopril, HbA1c 6.4, thresholds tightened to 130/80; add family history chip; set goals; Fitbit already connected (P's account); toggle "Simulate Apple Watch"; text `PULSE-XXXXXX` to the Photon number -> welcome iMessage.
2. **Live processing (30s)** — press "Simulate workout" -> HR sparkline climbs -> within ~60s iMessage: "Nice 20-min session, peak 152 bpm…".
3. **Autonomy (60s)** — press "Simulate illness onset" -> iMessage: "Resting HR 71 vs your usual 62, 5h sleep, HRV down 30%. With your exam Thursday I'd protect tonight: block 10pm–6am for sleep? Reply YES." Reply YES -> event appears in Google Calendar "Pulse Health" -> confirmation text -> dashboard status "possibly ill".
4. **Conversation (30s)** — text "how am I doing on steps this week?" -> tool-backed answer. Same question on ASI:One.
5. **Briefing (20s)** — press "Run morning briefing" -> dashboard card -> play ElevenLabs audio.
6. **Architecture (30s)** — two pools (Spacetime live / Neon long-term), two agents (Pulse live, Compass long-term), FinchNode twin, Photon, Fetch.ai, Gemini.

Fallbacks: if iMessage is slow, show the alert on the dashboard and the `messages` log in `/demo`. If Gemini 429s, templates fire (say nothing). If Calendar insert fails, show the proposal state in `/demo` and the apply error.

Talking points: wellness guidance not diagnosis; every autonomous action is approval-gated; data is synthetic (FinchNode) plus one real Fitbit.

## iMessage on Photon's free plan (read before demoing)
- Only phones registered as users on the Photon project can text Pulse, and each user gets their **own** assigned Pulse line:
  - J (+1 425-300-7915) texts **+1 (628) 999-4232**
  - P (+1 858-866-6676) texts **+1 (415) 603-5536**
- Register another phone: `npx @photon-ai/cli spectrum users add -p 0798a828-2dd6-4e93-b944-b623e195ca25 --first-name X --last-name Y --email E --phone +1...` (max 10 on the free plan). `spectrum users ls --json` shows each user's `assignedPhoneNumber`.
- Text from an iPhone as a **blue iMessage**; a green SMS never reaches Photon. Delete any old SMS thread first.
- The user texts first (link code); after that Pulse can send proactive alerts to them.
- Onboarding shows J's line to everyone (PHOTON_NUMBER_DISPLAY), so run the iMessage part of the demo from J's phone. Say it on stage: "on Photon's free plan testers are allowlisted; production would use a dedicated line."
- ASI:One: message `@pulse-health` (once the Agentverse handle is published) or start a message with `@agent1qw9glwdgrmg9tmd7fj9u6wst50d38hwcaat09nck0aml3jvdkrrf6n7pxcv`.
