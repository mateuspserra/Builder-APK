#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
  else
    corepack pnpm "$@"
  fi
}

docker compose up -d redis
run_pnpm prisma generate
run_pnpm prisma migrate dev --name init
run_pnpm --filter @apk-builder/shared build

run_pnpm --filter api dev &
api_pid=$!

run_pnpm --filter worker dev &
worker_pid=$!

trap 'kill "$api_pid" "$worker_pid" 2>/dev/null || true' INT TERM EXIT
wait
