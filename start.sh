#!/usr/bin/env bash
# Proposal & Grant Development Workspace — local development starter
set -euo pipefail
cd "$(dirname "$0")"

# Portfolio-level OpenRouter credentials (optional), then local overrides.
if [ -f ../.openrouter.env ]; then
  set -a; source ../.openrouter.env; set +a
fi
if [ -f .env ]; then
  set -a; source .env; set +a
fi

if [ ! -d node_modules ]; then
  npm install
fi

if [ -n "${DATABASE_URL:-}" ]; then
  npx prisma generate
  npx prisma migrate deploy
else
  echo "DATABASE_URL is not set. Copy .env.example to .env first." >&2
  exit 1
fi

if [[ "${LOAD_DEMO_DATA:-false}" == true ]]; then npm run demo-data:load; fi

exec npm run dev
