# MHacks26 — Pulse

Personal AI health agent: wearable vitals -> two data pools -> rules + Gemini agents -> iMessage/web alerts, digital twin, approval-gated Google Calendar actions. Full details in SPEC.md and PLAN.md.

## Stack
- Web: Next.js 15 App Router, TypeScript, Tailwind, shadcn/ui, Drizzle, Neon Auth. Vercel.
- Agent: Python 3.12, FastAPI, uv, APScheduler, google-genai, psycopg, uagents. Railway.
- Gateway: Bun/Node TypeScript, spectrum-ts (Photon iMessage). Railway.
- Data: Neon Postgres (long-term pool, auth), SpacetimeDB on maincloud (live vitals pool; contract in contracts/SPACETIME.md).

## Commands
- Install: `cd apps/web && npm i` / `cd services/agent && uv sync` / `cd services/gateway && bun i`
- Dev: `npm run dev` / `uv run uvicorn app.main:app --reload` / `bun run src/index.ts`
- Test: `npm test` / `uv run pytest` / `bun test`
- Build: `npm run build` / `docker build -f infra/Dockerfile.agent .`
- Contracts: `uv run python scripts/export_contracts.py` then `npm run contracts` in apps/web

## Layout
- FinchNode integration (P): `app/twin/finchnode.py`, `from_finchnode()`, `/twin/import`, `/twin/finchnode/patients`, `contracts/fixtures/finchnode_*`
- `apps/web` web app (J) · `services/agent` FastAPI agents + integrations (split by package) · `services/gateway` Photon (J)
- `contracts/` shared schemas + fixtures, frozen after hour 2 · `infra/spacetime` Spacetime module (J) · `infra/` Dockerfiles, Railway (P) · `scripts/` export, seed, smoke
- Ownership table and merge rules: PLAN.md §4. Endpoint contracts: PLAN.md §6 / contracts/README.md.

## Context files
- SPEC.md: what we're building and what's out of scope
- PLAN.md: the full build plan. Read §4 (ownership) and §6 (contracts) before touching anything.
- PROGRESS.md: current state. Read it at the start of a new session.
- DECISIONS.md: settled choices. Don't revisit them unless asked.

## Rules
- Only edit files in your owner's paths (PLAN.md §4). Shared files: additive changes only, tell the other person first.
- Never hand-edit generated files (`apps/web/lib/contracts.ts`, `contracts/schemas/*`).
- CI never calls paid/remote APIs; use `LLM_FAKE=1` and fixtures.
- `main` must always deploy.

## Communication
- Be terse. No preamble, no recap of the request.
- Don't summarize changes after editing; I'll read the diff.
- Don't explain code unless asked.
- Ask at most one clarifying question; otherwise pick a sensible default and proceed.

## Working style
- Use grep/search before opening whole files; read only the relevant part of large files.
- Don't re-read files you just edited.
- Make the smallest change that works. No speculative refactors or extra features.
- Don't add comments, docs, or tests unless asked — except tests listed in PLAN.md §12, which are required.
- Don't add dependencies beyond those in PLAN.md without asking.
- Delegate boilerplate, simple edits, and drafting docs to the `qwen` agent; review its output before moving on.
- Before ending a session, update PROGRESS.md.
