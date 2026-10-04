# Pulse — table demo (MHacks 2026)

## How judging works
- **Science-fair style** (Devpost rules): we stay at our table, judges rotate to us. No slides, no stage, unless we make finalists.
- Expect **~3 min demo + ~1 min questions per visit**, several visits. **Sponsor judges** (Fetch.ai, Neon, ElevenLabs, FinchNode, Photon, Figma…) likely come separately; use the 30-second sponsor cuts below.
- Rubric: **Innovation, Technical Complexity, Usability, Adherence to Theme** ("Come build something that grows!"). The script hits each one; the closing line hits the theme.
- **Devpost deadline: 12:00 PM EDT Sunday** (rules page; the main page says 12:15, go by 12:00).

## Roles
- **J** narrates and drives the laptop. **Gavin** holds the phone toward the judge, hands it to them for the YES, and takes record and agent questions.
- If a judge asks something mid-demo, answer in one sentence and keep going.

## Process

### Once, before judging (about 30 min before)
1. Robin's data: Setup → Focus: **Sleep, Steps, Sun care**. Setup → Health history: add **Skin cancer (melanoma)**. Check the dashboard shows a filled plan with sunscreen and the reapply.
2. Robin's Google Calendar has an exam or interview in the next 48 h (dashboard "Next 48 hours"); otherwise the illness alert comes without a sleep-block proposal.
3. Laptop tabs, in order: landing · /demo · /twin · /dashboard · /alerts · /trends · ASI:One. Browser zoom 110%. Signed in as Robin.
4. ASI:One tab: pre-type (don't send) the agent address plus "I have crushing chest pain and my left arm is numb".
5. Phone: unlocked, Do Not Disturb with Messages allowed, blue Pulse iMessage thread open, volume up.
6. Hotspot on standby, backup video saved on the laptop.
7. Rehearse the 3:00 twice with a timer, pressing **Reset demo** before each run.

### Every judge
1. **Greet (5 s):** "Hi, we're Jiadong and Gavin. This is Pulse. Can we show you a 3-minute demo?" Ask: "Are you judging a sponsor prize?" If yes, add that sponsor's 30-second cut at the end.
2. **Run the 3:00 below.**
3. **Questions (about 1 min):** answers below. End with "It's live at pulse-mhacks.vercel.app, and the Devpost has the video."
4. **Reset (after they leave):**
   - Press **Reset demo** on /demo.
   - Delete the "Sleep block (Pulse)" event the judge approved from Google Calendar.
   - Re-type the emergency message in the ASI:One input.
   - Go back to the landing tab.

### If the main flow fails
- No text after about 20 s: keep talking over /dashboard and show the alert on **/conversations**.
- Illness alert won't fire (cooldown or no event): run **Workout now** instead; its text arrives in seconds.
- Something breaks: say what broke in one sentence and switch to the backup video. Never say "it normally works".

## The 3 minutes
The trick: **press "Illness onset" at 0:20 and talk while the text is on its way.**

| Time | Who | On screen | Say |
|---|---|---|---|
| 0:00–0:20 | J | Landing; move the cursor over the pulsing field | Your watch, your medical record and your calendar each know something about you, but none of them talk. Your watch can see your resting heart rate climb the night before a midterm and do nothing. Pulse is a health agent that texts you first, and asks before it acts. |
| 0:20–0:30 | J | /demo, press **Illness onset** | This is Robin. Today Robin's vitals come from our Apple Watch simulator. I'm going to make Robin get sick. |
| 0:30–1:05 | J | /twin, then /dashboard plan | While that runs: Pulse built a digital twin from Robin's health record through FinchNode: type 2 diabetes, hypertension, metformin, lisinopril. The hypertension tightens the blood pressure alert to 130 over 80. A skin cancer history puts sunscreen and a reapply into Robin's day, which is exactly what Gavin wished he'd had. And it learns Robin's own normal. Pulse grows with you. |
| 1:05–1:35 | Gavin | Phone toward the judge, then /dashboard | Here's the text. Resting heart rate is up, sleep was short, and there's a midterm tomorrow, so Pulse proposes blocking tonight for sleep. The rules engine caught that from live data in SpacetimeDB within seconds; Gemini only writes the words. On the web, Robin's status just flipped to "Possibly ill". |
| 1:35–1:55 | Judge | Hand them the phone, then show Google Calendar | Nothing changes until Robin says yes. Want to reply YES? *(judge sends YES)* It's now on Robin's Pulse Health calendar, and Pulse confirms. |
| 1:55–2:20 | J | /alerts, expand **Why Pulse flagged this**, then /trends | Every alert explains itself: today's numbers against Robin's baseline, which part of the record mattered, what data it used. No black box. Trends shows Robin's vitals against their normal range, and one click prints a summary for the doctor. |
| 2:20–2:45 | Gavin | ASI:One, press Enter on the pre-typed message | Same agent, everywhere: this is ASI:One through our Fetch.ai agent. And safety first: if you text something like this, Pulse doesn't ask an AI. It answers right away with 911 guidance. |
| 2:45–3:00 | J | /dashboard | Under the hood: a FastAPI agent on Railway, SpacetimeDB for live vitals, Neon Postgres for history, Gemini for language, Photon for iMessage, Next.js on Vercel. Pulse grows with you: it learns your normal, and acts only with your yes. |

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
