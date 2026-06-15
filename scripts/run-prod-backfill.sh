#!/usr/bin/env bash
# Backfill ClevaFarm entity registry to ERPNext outbox (production).
# Requires DATABASE_URL and migration 047 applied.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ DATABASE_URL is required"
  echo "   Example: DATABASE_URL=postgres://... $0 --dry-run"
  exit 1
fi
cd "$ROOT/server"
npm run verify:migration-047 || exit 1
cd "$ROOT"
node scripts/backfill-clevafarm-sync.js "$@"
