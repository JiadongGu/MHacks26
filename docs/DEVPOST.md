# Pulse — your health agent in iMessage

**Tagline:** Your watch, your health record, and your calendar, in one agent that texts you what to do — and only acts with your yes.

## Inspiration

Wearables collect a lot of data, but nobody acts on it. Your steps, your diagnoses and your schedule live in three apps that never talk to each other, so a watch can see your resting heart rate climb the night before an exam and do nothing about it. We wanted an agent that sees the whole picture, reaches you where you already are (your texts), and asks before it changes anything.

## What it does

Pulse is a personal AI health agent that lives in iMessage. You connect a wearable (Fitbit via the Google Health API, or a simulated Apple Watch), your health record through FinchNode, and your Google Calendar. Pulse builds a digital twin from your record — diagnoses, medications, recent labs — and uses it to set personal thresholds on your live vitals. When something crosses a threshold, Pulse texts you. If it proposes a calendar change, it waits for you to reply YES; routine daily plans go into a separate Pulse Health calendar you can hide. You can also just ask it questions, and each morning it produces a briefing you can listen to.

- **Explainable alerts** — a "Why Pulse alerted you" panel: every alert shows the numbers vs your baseline and the twin rules behind it.
- **Trends page** — 7/30/90-day charts against your normal range.
- **Share with clinician** — a printable one-page summary of conditions, meds, labs, 30-day vitals, and alerts.
- **Daily planner** — fits up to three focus areas into free time in a separate "Pulse Health" calendar.
- **Evening check** — at 9 pm, today's numbers, a bedtime, and tomorrow's plan in one message.
- **Deterministic emergency guard** — an emergency word returns a fixed 911 message before any AI runs.

## How we built it (by layer)

- **Data** — SpacetimeDB holds the live vitals pool; Neon Postgres holds the long-term pool. Neon Auth is the app's identity.
- **Agent** — A Python FastAPI service on Railway: rules engine, APScheduler jobs, and Gemini with structured output, function calling, and a model fallback chain.
- **iMessage** — A small Node (TypeScript) gateway using Photon's spectrum-ts, handling alerts out and replies in.
- **Web** — Next.js 16 on Vercel with auto-deploy from main; landing page with a canvas "pulse field" background that beats like a heart and reacts to the cursor (no animation libraries); ⌘K command palette; Apple-Health-inspired design.
- **ASI:One** — The same agent exposed as a Fetch.ai uAgent in Agentverse.

## Sponsor technologies

**Photon** — Photon's free shared line is how Pulse reaches your iMessage on a hackathon budget. Our gateway runs spectrum-ts against it: alerts go out as iMessage, and your replies come back to the agent.

**FinchNode** — FinchNode supplies the health record behind the digital twin: synthetic demo patients for testing, and FinchNode Connect (sessions, a signed webhook, import, revoke) so a patient can connect their own record. The twin turns it into conditions, medications, labs like HbA1c, and personal alert thresholds.

**Neon** — Neon Postgres is our long-term store: vitals history, focus areas, approval state. Neon Auth handles app sign-in, and the serverless database meant a two-day project never had to babysit one.

**SpacetimeDB** — SpacetimeDB is the live vitals pool on maincloud. Every sample is written through an idempotent ingest reducer that keeps per-minute rollups up to date in the same transaction, and the rules read those rollups right after ingest, which is why the workout text arrives in seconds, not minutes.

**Google Gemini** — Gemini writes the messages, parses your replies, and calls our tools, using structured output and function calling. We added a model fallback chain because free-tier quota is real — see below.

**Fetch.ai / ASI:One** — The same agent runs as a uAgent in Fetch.ai's Agentverse, so a linked user can ask "how did I sleep?" in ASI:One and get the same answer they get in iMessage.

**ElevenLabs** — ElevenLabs speaks the morning briefing. Press Play on the dashboard card and the overnight summary is read to you out loud.

**Figma** — Our first design pass looked generic, so we rebuilt the design system and every screen. Version 3 is based on the Apple Health UI kit (light, one sans-serif, one color per health category, status always as icon + word), with a clickable prototype of the demo story.

## Challenges we ran into

- **Photon's free shared line only works after the user texts it first — and only from a blue iMessage, not SMS.** Our first "nothing happens" bug turned out to be a green SMS bubble; Photon's CLI and debug bot showed us each tester also needs to be registered and gets their own assigned line. We documented the flow in our demo guide.
- **Gemini's free-tier daily quota ran out mid-testing.** We added a model fallback chain and deterministic fallbacks, so a quota hit degrades to a plain message instead of a dead app.
- **Google OAuth "Scope has changed" in production**, triggered when the same Google account had already granted Health scopes to a different client. We fixed it by requesting only the calendar scope on that client.
- **Vercel renders in UTC**, so a 2 PM event displayed as 6 PM. Every time in the UI now goes through one timezone-aware formatter.
- **Stacked pull requests merged into feature branches instead of main**, breaking the rule that main always deploys. We untangled the stack and fixed the merge order.

## Accomplishments

We verified the full loop on a real phone: live alert, texted YES, real Google Calendar event. About 670 automated tests (481 agent, 180 web, 9 gateway) run in CI on every pull request, plus a 141-case live evaluation of Gemini in the conversation loop, whose findings we fixed.

## What we learned

A model is good at words and bad at safety: emergency replies and permission checks live in deterministic code, and the model never overrides them. Time zones are a rendering problem, not a data problem — but they look like a data problem to the user. And free-tier quotas are a design input, not an afterthought.

## What's next

A dedicated iMessage line instead of the shared one; a real Apple Watch via Health Auto Export; rules learned from your own history; and more rules in the engine.

## Built with

python, fastapi, typescript, next.js, react, tailwind, postgresql, neon, spacetimedb, gemini, fetch.ai, uagents, photon, spectrum-ts, elevenlabs, google-calendar-api, google-health-api, finchnode, vercel, railway, figma

## Try it

- Web app: https://pulse-mhacks.vercel.app
- Repo: https://github.com/JiadongGu/MHacks26
- ASI:One agent: `agent1qw9glwdgrmg9tmd7fj9u6wst50d38hwcaat09nck0aml3jvdkrrf6n7pxcv` (handle @pulse-health once published)

Pulse gives wellness guidance, not medical advice.
