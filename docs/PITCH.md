# Pulse — 3-Minute Live Demo Pitch (MHacks 2026)

Two presenters. J (Jiadong Gu) built the web app, Google Calendar, Spacetime, the iMessage gateway, and the design. P (Gavin Mordhorst) built the Fitbit / Google Health ingest, the Apple Watch simulator, FinchNode health records, the Fetch.ai agent, and deployment. Total runtime is exactly 3:00, about 400 spoken words at a calm pace.

| Time | Who | On screen | Say |
|---|---|---|---|
| 0:00–0:20 | J | Landing page, pulse field idle | Your watch, your health record, and your calendar all know things about you. But none of them talk to each other. Your watch can watch your resting heart rate climb the night before an exam, and it does nothing. We built Pulse so something does. |
| 0:20–0:45 | J | pulse-mhacks.vercel.app: move the cursor over the hero, click once for a ripple | That background beats like a heart and follows your cursor. One line for what this is: Pulse is a health agent that texts you first, and asks before it acts. It lives where you already are — your messages. No new app to learn. |
| 0:45–1:10 | P | Health record page — Morgan Rivera's digital twin | Now the digital twin. Our demo user Robin connected a record through FinchNode, here their sample patient Morgan Rivera, and the Health record page shows type 2 diabetes, hypertension, metformin and lisinopril, HbA1c 6.4. Pulse builds a twin from that and tightens the blood pressure threshold to 130 over 80. Your record sets your rules. |
| 1:10–1:50 | J | /demo "Illness onset" → dashboard status → phone iMessage (hold it up / mirror) → Google Calendar "Pulse Health" → confirmation text | Here's the live loop. I press Illness onset on the demo panel, and the dashboard status flips to "Possibly ill." Vitals stream into the live pool in Spacetime, rules fire in seconds, and Gemini just writes the words. Watch the phone: a text says resting heart is up, sleep was short, and proposes blocking tonight for sleep, because there's a midterm on the calendar. I reply YES, the event lands in our Pulse Health calendar, and a confirmation follows. Nothing happens until you say yes. |
| 1:50–2:15 | J | "Why Pulse alerted you" panel → Trends page → Share with clinician summary | And this is the part we're most proud of. The Why panel: every alert shows your numbers against your baseline, which twin rules fired, and the data behind them. No black box. Then the Trends page — seven, thirty, ninety days against your normal range — and one tap to print a one-page summary for your clinician. So your doctor sees what Pulse saw. |
| 2:15–2:40 | P | ASI:One chat ("how did I sleep?") → dashboard briefing card, ElevenLabs play | The same agent runs everywhere. Ask "how did I sleep?" in ASI:One and you get the same answer you'd get in iMessage. Every morning, hit play and ElevenLabs reads your briefing. On safety: an emergency word fires a fixed 911 message before any AI runs, the model never approves anything, and only an exact yes does. It's wellness guidance, not a diagnosis. |
| 2:40–3:00 | J | Dashboard recap; presenters at the podium | Here's the whole stack in one breath: Next.js on Vercel, a FastAPI agent on Railway, Neon Postgres and Auth, Spacetime for live data, Gemini for the words, Photon for iMessage, plus Fetch.ai, ElevenLabs, FinchNode, and Figma. Pulse: your health, in the texts you already read. Thank you. |

## Backup plan

- If iMessage is slow, show the alert on the web Conversations page instead.
- If Wi-Fi dies, cut to the pre-recorded demo video.
- Keep the phone on Do Not Disturb except Messages, so nothing else interrupts the thread.

## Pre-demo checklist

- Sign in as Robin at https://pulse-mhacks.vercel.app; open tabs: landing, /demo, /dashboard, /twin, /trends, /share.
- On /demo press **Reset demo** right before going on stage. Alerts have cooldowns (illness: 24 h), so a rehearsal blocks the live run without it.
- Robin's Google Calendar needs an important event (exam, interview) in the next 48 hours, or the illness alert comes without a sleep-block proposal. Check /dashboard "Next 48 hours".
- Phone unlocked, Do Not Disturb on with Messages allowed, the Pulse thread open. It must be a blue iMessage thread.
- ASI:One tab open, message starts with the agent address, already linked.
- Volume up for the ElevenLabs briefing; press Play once beforehand so the audio is cached.
- Pre-recorded backup video downloaded locally, not streamed.
