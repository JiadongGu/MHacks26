#!/bin/sh
set -eu
case "${SERVICE:-api}" in
  api) exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" ;;
  fetchai) exec python -m app.fetchai.agent ;;
  *) echo "unknown SERVICE '${SERVICE}' (use api or fetchai)" >&2; exit 2 ;;
esac
