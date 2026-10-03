#!/usr/bin/env bash
# Smoke test for a running deployment. Exits non-zero if any check fails.
#   AGENT_URL=https://agent.example INTERNAL_TOKEN=... [GATEWAY_URL=...] [WEB_URL=...] [DEMO_USER_ID=<uuid>] scripts/smoke.sh
# With DEMO_USER_ID it also drives the simulator and reads the vitals back (needs INTERNAL_TOKEN).
set -u

: "${AGENT_URL:?set AGENT_URL}"
AGENT_URL="${AGENT_URL%/}"
fail=0
ok() { printf 'ok    %s\n' "$1"; }
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }
warn() { printf 'warn  %s\n' "$1"; }

# status_of METHOD URL [curl args...] prints the HTTP status, or 000 on a network failure.
status_of() { local m="$1" u="$2"; shift 2; curl -sS -m 15 -o /dev/null -w '%{http_code}' -X "$m" "$u" "$@" 2>/dev/null || echo 000; }
# field JSON EXPR evaluates a python expression against the parsed JSON `d`.
field() { printf '%s' "$1" | python3 -c "import sys,json; d=json.load(sys.stdin); print($2)" 2>/dev/null; }

health=$(curl -sS -m 15 "$AGENT_URL/health" 2>/dev/null || true)
if [ "$(field "$health" "d['ok']")" = "True" ]; then ok "agent /health"; else bad "agent /health ($health)"; fi
if [ "$(field "$health" "d['db']")" = "True" ]; then ok "agent reaches Neon"; else bad "agent cannot reach Neon"; fi
if [ "$(field "$health" "d['scheduler_last_tick'] is not None")" = "True" ]; then ok "scheduler is ticking"; else bad "scheduler has not ticked"; fi
if [ "$(field "$health" "d['gateway']")" = "True" ]; then ok "agent reaches the gateway"; else warn "agent cannot reach the gateway"; fi

if [ -n "${GATEWAY_URL:-}" ]; then
  [ "$(status_of GET "${GATEWAY_URL%/}/health")" = "200" ] && ok "gateway /health" || bad "gateway /health"
fi
if [ -n "${WEB_URL:-}" ]; then
  code=$(status_of GET "${WEB_URL%/}/")
  case "$code" in 200|301|302|307|308) ok "web responds ($code)" ;; *) bad "web responds ($code)" ;; esac
fi

# Internal routes must refuse a missing token.
[ "$(status_of POST "$AGENT_URL/sim/scenario" -H 'content-type: application/json' -d '{}')" = "401" ] \
  && ok "internal routes need the token" || bad "internal routes accept a request with no token"

if [ -n "${DEMO_USER_ID:-}" ] && [ -n "${INTERNAL_TOKEN:-}" ]; then
  auth=(-H "X-Internal-Token: $INTERNAL_TOKEN")
  code=$(status_of POST "$AGENT_URL/sim/scenario" "${auth[@]}" -H 'content-type: application/json' \
    -d "{\"user_id\":\"$DEMO_USER_ID\",\"scenario\":\"normal\"}")
  [ "$code" = "200" ] && ok "simulator accepted a scenario" || bad "simulator scenario ($code)"
  sleep 3
  latest=$(curl -sS -m 15 "${auth[@]}" "$AGENT_URL/vitals/latest?user_id=$DEMO_USER_ID" 2>/dev/null || true)
  age=$(field "$latest" "int(__import__('time').time() - __import__('datetime').datetime.fromisoformat(d['heart_rate']['ts']).timestamp())")
  if [ -n "$age" ] && [ "$age" -lt 600 ]; then ok "heart rate is fresh (${age}s old)"; else bad "no recent heart rate in the live pool ($latest)"; fi
  [ "$(status_of GET "$AGENT_URL/twin/$DEMO_USER_ID" "${auth[@]}")" = "200" ] && ok "demo user has a twin" || bad "demo user has no twin"
  [ "$(status_of GET "$AGENT_URL/integrations/google/status?user_id=$DEMO_USER_ID" "${auth[@]}")" = "200" ] \
    && ok "google status answers" || bad "google status"
fi

[ "$fail" = "0" ] && echo "smoke: PASS" || echo "smoke: FAIL"
exit "$fail"
