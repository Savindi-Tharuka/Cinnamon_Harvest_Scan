#!/usr/bin/env bash

set -euo pipefail

APP_DIR="/opt/cinnomon-api"
LOG_DIR="${LOG_DIR:-$APP_DIR/logs}"
HOST="${GUNICORN_HOST:-0.0.0.0}"
PORT="${GUNICORN_PORT:-8010}"
WORKERS="${GUNICORN_WORKERS:-3}"
TIMEOUT="${GUNICORN_TIMEOUT:-120}"
GRACEFUL_TIMEOUT="${GUNICORN_GRACEFUL_TIMEOUT:-30}"
KEEP_ALIVE="${GUNICORN_KEEP_ALIVE:-5}"
MAX_REQUESTS="${GUNICORN_MAX_REQUESTS:-1000}"
MAX_REQUESTS_JITTER="${GUNICORN_MAX_REQUESTS_JITTER:-50}"

cd "$APP_DIR"
mkdir -p "$APP_DIR/uploads" "$LOG_DIR"

if [[ -n "${MONGODB_URI:-}" ]]; then
  echo "Waiting for MongoDB..."
  for ((attempt=1; attempt<=30; attempt++)); do
    if uv run python -c "import os; from pymongo import MongoClient; MongoClient(os.environ['MONGODB_URI'], serverSelectionTimeoutMS=2000).admin.command('ping')" >/dev/null 2>&1; then
      echo "MongoDB is ready."
      break
    fi

    if [[ "$attempt" -eq 30 ]]; then
      echo "MongoDB did not become ready after 30 attempts." >&2
      exit 1
    fi

    echo "Waiting for MongoDB (${attempt}/30)..."
    sleep 2
  done
fi

echo "Starting Flask API with Gunicorn..."
exec uv run gunicorn main:app \
  --bind "$HOST:$PORT" \
  --workers "$WORKERS" \
  --timeout "$TIMEOUT" \
  --graceful-timeout "$GRACEFUL_TIMEOUT" \
  --keep-alive "$KEEP_ALIVE" \
  --max-requests "$MAX_REQUESTS" \
  --max-requests-jitter "$MAX_REQUESTS_JITTER" \
  --access-logfile "$LOG_DIR/access.log" \
  --error-logfile "$LOG_DIR/error.log" \
  --capture-output
