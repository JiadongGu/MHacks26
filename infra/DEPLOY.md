# Deploy

Three Railway services run the backend; the web app is a separate Vercel project (J). Vercel cannot host the agent or gateway: they are long-running processes.

| Service | What | Railway settings |
|---|---|---|
| `agent-api` | FastAPI agent (`/health`, rules, ingest, chat, vitals) | Root Directory: repo root. Config file: `/infra/railway.agent-api.toml`. Env `SERVICE=api` (default). Public domain on |
| `agent-fetchai` | Fetch.ai uAgent (ASI:One) | Root Directory: repo root. Config file: `/infra/railway.agent-fetchai.toml`. Env `SERVICE=fetchai`. No public domain needed |
| `gateway` | Photon iMessage gateway | Root Directory: `services/gateway`. Config file: `/infra/railway.gateway.toml` (set the path by hand if the dashboard asks). Private networking is enough |

The agent image is built from the repo root: `docker build -f infra/Dockerfile.agent .` (Docker is not needed locally; Railway builds it).

## Environment variables
Set on each service. Secrets are never committed. `INTERNAL_TOKEN` must be the same value on `agent-api`, `agent-fetchai`, `gateway`, and the Vercel project.

| Variable | agent-api | agent-fetchai | gateway | web (Vercel) |
|---|:-:|:-:|:-:|:-:|
| `INTERNAL_TOKEN` | yes | yes | yes | yes |
| `DATABASE_URL` (Neon, pooled, **production** branch) | yes | | | yes |
| `SECRET_KEY` (Fernet key for stored OAuth tokens; losing it orphans every connection) | yes | | | |
| `SPACETIME_HOST`, `SPACETIME_DB=pulse-live-t8ng8` | yes | | | |
| `SPACETIME_TOKEN` (the **owner** token) and leave `SPACETIME_ADMIN_VIEWS` unset | yes | | | |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (Calendar client) | yes | | | |
| `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET` (the Google Health client, "Client Learning") | yes | | | |
| `PUBLIC_AGENT_URL` (the `agent-api` public URL; also used by `agent-fetchai` to reach it) | yes | yes | | |
| `PUBLIC_WEB_URL` | yes | | | |
| `GATEWAY_URL`, `GATEWAY_SECRET` | yes | | | |
| `GEMINI_API_KEY`, `GEMINI_MODEL_FAST`, `GEMINI_MODEL_SMART`; `LLM_FAKE=0` | yes | | | |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` | yes | | | |
| `AGENT_SEED` (the same value that produced `agent1qw9glwdg...`; a new seed means a new address) | | yes | | |
| `AGENT_URL` (the `agent-api` URL), `GATEWAY_SECRET` | | | yes | |
| `SPECTRUM_PROJECT_ID`, `SPECTRUM_PROJECT_SECRET`, `PORT` | | | yes | |
| `AGENT_URL`, `NEXT_PUBLIC_APP_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `DATABASE_URL_UNPOOLED`, `TEAM_EMAILS` | | | | yes |

## After the first deploy
1. Add the deployed callbacks to the Google OAuth clients: `https://<agent-api>/integrations/google/callback` (Calendar client) and `https://<agent-api>/integrations/fitbit/callback` (Health client). Keep the localhost ones for development.
2. Open the Agentverse Inspector link for the **deployed** `agent-fetchai` once and click Connect, then Mailbox. The deployed agent has its own mailbox.
3. In Testing mode, add every demo Google account as a test user, and re-consent within 7 days of judging (Testing-mode refresh tokens expire).
4. Run `AGENT_URL=... INTERNAL_TOKEN=... GATEWAY_URL=... WEB_URL=... DEMO_USER_ID=... scripts/smoke.sh`, and again 10 minutes before the demo.

## Uptime monitors (UptimeRobot, free, alerts to both phones)
- `https://<agent-api>/health` (keyword `"ok":true`)
- `https://<gateway>/health` if it has a public domain, otherwise rely on the agent's `gateway` field in `/health`
- the Vercel app root URL
