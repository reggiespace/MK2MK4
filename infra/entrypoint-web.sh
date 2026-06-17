#!/bin/sh
set -e
# Run any pending migrations on startup (idempotent in production).
node apps/web/node_modules/.bin/prisma migrate deploy --schema=apps/web/prisma/schema.prisma 2>/dev/null || true

# Initialize operator account if env vars are set (idempotent via upsert).
node init-operator.js 2>/dev/null || true

exec node apps/web/server.js
