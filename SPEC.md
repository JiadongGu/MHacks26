# Spec

## Pitch
Pulse is a personal health agent that lives in your iMessage and on the web. It pools live wearable vitals (Fitbit, Apple Watch) into a short-term time-series store and a long-term profile store, builds a digital twin from your medical record (FinchNode) and your own answers, and acts on what it sees: congratulates a workout, spots an illness coming, and with one "yes" blocks sleep on your Google Calendar before a big event.

Full detail: PLAN.md.

## Core features (must have for demo)
1. Live processing: wearable samples -> Spacetime live pool -> rules engine -> Gemini-phrased alert -> iMessage (Photon) + dashboard, within 60s.
2. Digital twin: onboarding + FinchNode record import -> conditions, meds, labs, baselines, twin-aware thresholds; rebuilt nightly, versioned.
3. Approval-gated action: illness signal + important event within 48h -> proposed sleep block -> user replies YES (iMessage or web) -> event written to Google Calendar.

Also required: sign-up + 7-step onboarding, goals with progress, morning briefing, judge demo panel (`/demo`).

## Demo flow
1. Sign up, import "Morgan Rivera" FinchNode record, set goals, connect Fitbit, simulate Apple Watch, link iMessage by texting the code.
2. "Simulate workout" -> HR sparkline climbs -> iMessage "nice workout" within ~60s.
3. "Simulate illness onset" with an exam on tomorrow's calendar -> iMessage proposes a 10pm-6am sleep block -> reply YES -> event appears in Google Calendar.
4. Text "how am I doing on steps this week?" -> tool-backed answer; same question on ASI:One.
5. "Run morning briefing" -> dashboard card + ElevenLabs audio.
6. Architecture slide.

## Stretch goals
- ElevenLabs spoken briefing (P2)
- Spacetime live views driving the dashboard (HR sparkline, alerts, proposal approve sync)
- Neon branch-per-PR, pgvector memory
- Presage webcam check-in, Relay channel (only if everything else is done)

## Out of scope
- Twilio SMS (verification takes days; Photon has SMS fallback)
- Native iOS app / real Apple Watch (simulated via Health Auto Export JSON format)
- Tiger, Nessie, Solana, SpaceXAI, Free-WILi, non-AI tracks
- Medical diagnosis; everything is wellness guidance with a disclaimer
