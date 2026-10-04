# Pulse — table demo (MHacks 2026)

## How judging works
- **Science-fair style** (Devpost rules): we stay at our table, judges rotate to us. No slides, no stage, unless we make finalists.
- Expect **~3 min demo + ~1 min questions per visit**, several visits. **Sponsor judges** (Fetch.ai, Neon, ElevenLabs, FinchNode, Photon, Figma…) likely come separately; use the 30-second sponsor cuts below.
- Rubric: **Innovation, Technical Complexity, Usability, Adherence to Theme** ("Come build something that grows!"). The script hits each one; the closing line hits the theme.
- **Devpost deadline: 12:00 PM EDT Sunday** (rules page; the main page says 12:15, go by 12:00).

## Roles
- **J narrates** and drives the laptop. **P holds the phone** (iMessage thread open, screen turned to the judge) and takes the record/agent questions.
- If a judge asks a question mid-demo, answer in one sentence and keep going.

## Table setup (before the first judge, and after every judge)
- Laptop tabs, in order: landing · /dashboard · /demo · /twin · /alerts · /trends · /share · ASI:One chat. Browser zoom 110%.
- Phone: unlocked, Do Not Disturb with Messages allowed, blue Pulse iMessage thread open, volume up.
- Hotspot ready. Backup video downloaded locally.
- **Between judges: press Reset demo on /demo** (clears cooldowns and leftover approvals; nothing is deleted). Delete the "Sleep block (Pulse)" event from Google Calendar if a judge approved one.
- Robin's calendar needs an exam or interview in the next 48 h (dashboard "Next 48 hours"), or the alert comes without a sleep-block proposal.

## The 3 minutes
The trick: **press "Illness onset" at 0:30 and talk about the twin while the text is on its way.**

| Time | On screen | Say |
|---|---|---|
| 0:00–0:20 | Landing page, move the cursor over the pulsing field | Your watch, your medical record and your calendar each know something about you, but none of them talk. Your watch can see your resting heart rate climb the night before a midterm and do nothing. Pulse is a health agent that texts you first, and asks before it acts. |
| 0:20–0:30 | /demo | This is Robin. Robin wears a watch; today we're streaming from our Apple Watch simulator. I'm going to make Robin get sick. *(press Illness onset)* |
| 0:30–1:05 | /twin | While that runs: Pulse built a digital twin from Robin's health record through FinchNode: type 2 diabetes, hypertension, metformin, lisinopril, HbA1c 6.4. Because of the hypertension, the blood pressure alert is tightened to 130/80. It also learned Robin's own normal: resting heart rate 74, HRV 60, about 7 hours of sleep. Pulse grows with you: the more it sees, the more personal the thresholds get. |
| 1:05–1:40 | Phone (P holds it up) → /dashboard | *(phone buzzes)* Here's the text. Resting heart rate is up, sleep was short, and Robin has a midterm tomorrow, so Pulse proposes blocking tonight for sleep. The rules engine found that from live data in SpacetimeDB within seconds; Gemini only writes the words. On the web the status just flipped to "Possibly ill". |
| 1:40–2:00 | Phone: reply YES → Google Calendar | Nothing happens until Robin says yes. *(reply YES)* Now it's on Robin's Pulse Health calendar, and Pulse confirms. |
| 2:00–2:25 | /alerts → Why Pulse flagged this; /trends | Every alert explains itself: today's numbers against Robin's baseline, which part of the record mattered, what data it used. No black box. Trends shows 7 to 90 days against Robin's normal range, and Share with clinician prints a one-page summary for the doctor. |
| 2:25–2:45 | ASI:One tab | It's one agent everywhere: the same Pulse answers in iMessage, on the web, and in ASI:One through our Fetch.ai agent. *(ask "how did I sleep?")* Emergency words get a fixed 911 message before any AI runs, and calendar changes always wait for a clear yes. |
| 2:45–3:00 | /dashboard | Under the hood: a FastAPI agent on Railway, SpacetimeDB for live vitals, Neon Postgres for history, Gemini for language, Photon for iMessage, Next.js on Vercel. Pulse grows with you: it learns your normal, and acts only with your yes. |

If the text is slow: keep talking over /dashboard, then show it in **/conversations**. If something breaks: say what broke in one sentence and switch to the backup video. Never say "it normally works".

## 30-second sponsor cuts
Open with one line of what Pulse is, then show exactly where the sponsor's tool sits.
- **Fetch.ai / ASI:One:** the same chat core runs as a uAgent in Agentverse with the chat protocol and a mailbox. Link with a 6-character code, then ask "how did I sleep?" live in ASI:One.
- **Neon:** Postgres for everything long-term (daily summaries, versioned twins, alerts, approvals), Neon Auth for sign-in, a Neon branch per teammate so nobody tested on production.
- **SpacetimeDB:** TypeScript module; an admin-only, idempotent ingest reducer keeps per-minute rollups in the same transaction, so the rules read fresh data seconds after a sample lands. Admin views let a non-owner read safely.
- **Photon:** a Node gateway on spectrum-ts sends alerts and streams replies back; YES on the phone writes the calendar event. Show the phone.
- **ElevenLabs:** press Play on the morning check-in; audio loads only on Play.
- **FinchNode:** the twin comes from the record: conditions, meds, labs, allergies. Connect handles sessions, a signed webhook, import, revoke and delete.
- **Gemini:** writes alerts and briefings from rule facts only, and runs the chat agent with function calling. Fallback chain across models; we ran a 141-case live eval.
- **Figma:** first pass looked generic, so we rebuilt the system on the Apple Health UI kit; clickable prototype of this exact story.

## Questions to expect
- **What's real and what's simulated?** Real: Fitbit via the Google Health API (Gavin's Inspire 3), iMessage, Google Calendar, ASI:One, Neon, SpacetimeDB, Gemini, ElevenLabs. Simulated: the Apple Watch stream, and Robin's record is a FinchNode sample patient. FinchNode Connect for a person's own record is built.
- **What did you build this weekend?** All of it: five services, about 690 tests in CI.
- **False alarms?** Baselines are personal (7-day medians), the illness rule needs two signals (resting heart rate up *and* short sleep or low HRV), low oxygen needs two low readings, cooldowns and daily caps stop repeats, and every alert shows its numbers.
- **Privacy?** Tokens encrypted at rest, every request scoped to the signed-in user, records can be revoked and deleted, Pulse only writes to its own calendar unless you approve. Not a medical device; wellness guidance only.
- **Why iMessage?** People read texts; nobody opens a health dashboard daily. No app to install.
- **Why not just let the AI decide?** Models are good at words, not safety. Decisions are deterministic rules on numbers; emergencies and approvals are handled in code first.
- **How does it scale / what's next?** A dedicated iMessage number, a real Apple Watch via Health Auto Export, rules learned from your own history, thresholds shaped with clinicians.
- **Who is it for?** Anyone managing a condition between doctor visits (Gavin's skin cancer history turns on sunscreen reminders; hypertension tightens the BP alert), and students under load.

## If we make finalists (stage)
Same story, bigger screen: mirror the phone, keep the same 3:00 table, cut the sponsor list to one line.
