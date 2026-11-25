#!/bin/sh
# Container start-up: bring the database schema up to date, optionally add demo data, then serve.
set -e

alembic upgrade head

if [ "${SEED_DEMO:-false}" = "true" ]; then
  python -m app.seed   # only seeds an empty database, so restarts don't duplicate data
fi

# Render tells us which port to listen on through $PORT.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --proxy-headers --forwarded-allow-ips="*"
