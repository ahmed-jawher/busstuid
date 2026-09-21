#!/bin/sh
# Applies migrations and database roles before starting the API. Safe on every start: both steps
# are idempotent. Set SKIP_MIGRATIONS=1 for extra API replicas or the backup service.
set -e
if [ "${SKIP_MIGRATIONS:-0}" != "1" ]; then
  npx --no-install prisma migrate deploy
  node dist/ops/cli.js roles
fi
exec "$@"
