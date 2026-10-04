# Deploy

Three Railway services run the backend; the web app is a separate Vercel project (J). Vercel cannot host the agent or gateway: they are long-running processes.

| Service | What | Railway settings (the `.toml` files apply only to GitHub deploys; the CLI deploys below use variables instead) |
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
2. Publish the agent's handle and README (and create its mailbox) once, **from a local copy, never from Railway**: the uAgents library answers `/connect` only to `127.0.0.1` (a request through the public URL gets a 403, which the Inspector shows as "Something went wrong while proving mailbox connection"). Run `cd services/agent && uv run python -m app.fetchai.agent` with the same `AGENT_SEED` as production, open the Inspector link it prints (`...uri=http%3A//127.0.0.1%3A8001...`) in a browser on that machine, click Connect, then Mailbox, and stop the local copy afterwards. The deployed agent keeps polling the same mailbox. Repeat whenever the README or handle changes.
3. In Testing mode, add every demo Google account as a test user, and re-consent within 7 days of judging (Testing-mode refresh tokens expire).
4. Run `AGENT_URL=... INTERNAL_TOKEN=... GATEWAY_URL=... WEB_URL=... DEMO_USER_ID=... scripts/smoke.sh`, and again 10 minutes before the demo.

## Uptime monitors (UptimeRobot, free, alerts to both phones)
- `https://<agent-api>/health` (keyword `"ok":true`)
- `https://<gateway>/health` if it has a public domain, otherwise rely on the agent's `gateway` field in `/health`
- the Vercel app root URL

## Deployed state (2026-10-03, Railway project `pulse-mhacks`, deployed from a local checkout with the CLI)
- `agent-api`: https://agent-api-production-4666.up.railway.app. Variables beyond the table: `SERVICE=api`, `RAILWAY_DOCKERFILE_PATH=infra/Dockerfile.agent`, `PORT=8000`, `HOST=0.0.0.0`, `SCHEDULER_ENABLED=true`
- `agent-fetchai`: variables `SERVICE=fetchai`, `RAILWAY_DOCKERFILE_PATH=infra/Dockerfile.agent`, `AGENT_SEED`, `INTERNAL_TOKEN`, `PUBLIC_AGENT_URL` (the public agent URL). Public domain `agent-fetchai-production.up.railway.app` (port 8001) only for the Agentverse Inspector
- `gateway`: deployed from `services/gateway`, `AGENT_URL` is the public agent URL

Redeploy: `railway up --service agent-api --ci` and `railway up --service agent-fetchai --ci` from the repo root; the gateway from `services/gateway` with `railway up --service gateway --project <id> --environment production --ci`. A deploy is manual: pushing to `main` does not redeploy until the Railway GitHub app is installed on the repo (J, as the repo owner).

## Things that bit us
- **Bind to `0.0.0.0`, not `::`.** With `--host ::` the app ran but the public URL answered 502 and no request reached the app; the edge connects over IPv4. `infra/entrypoint.sh` now defaults to `0.0.0.0`.
- **Set the domain's target port.** A generated domain had no port (`railway domain list` shows `-`); set it with `railway domain update <domain> --port 8000 --service agent-api`.
- **Private networking is one-way verified.** `agent-api` reaches `gateway.railway.internal:8789`. The reverse (an IPv4-only app reached from the gateway) was not verified, so the gateway and the uAgent call the agent through its public URL, which still requires `X-Internal-Token`.
- Production `SECRET_KEY` and `INTERNAL_TOKEN` come from J, not from a local `.env`: the key decrypts the stored Calendar tokens, and the token must match Vercel.

