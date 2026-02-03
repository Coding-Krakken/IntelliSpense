#!/usr/bin/env bash
set -euo pipefail

# Ensure a safe, test/dev database is targeted before running a destructive reset.
# Usage: DATABASE_URL="..." ./scripts/ensure_test_db.sh

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL must be set"
  exit 2
fi

safe=false

# Basic safety checks: prefer localhost, 127.0.0.1, or database name containing dev or test
if echo "$DATABASE_URL" | grep -Eqi "(localhost|127\.0\.0\.1)"; then
  safe=true
fi
if echo "$DATABASE_URL" | grep -Eqi "intellispense(_|-)?(dev|test)"; then
  safe=true
fi

if [ "$safe" != true ]; then
  echo "Refusing to run destructive reset: DATABASE_URL does not look like a local/dev DB"
  echo "DATABASE_URL=$DATABASE_URL"
  exit 3
fi

echo "Safe target detected. Running non-interactive Prisma reset..."

# Use pnpm exec so package scripts arg forwarding is not required
pnpm --filter @intellispense/database exec prisma migrate reset --force

echo "Database reset complete."
