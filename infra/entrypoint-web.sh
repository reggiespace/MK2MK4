#!/bin/sh
set -e

# Run SQL migrations directly (idempotent — each file is guarded by IF NOT EXISTS).
# We avoid prisma migrate deploy because it requires @prisma/engines native binaries
# which are not included in the slim runtime image.
if [ -n "$DATABASE_URL" ]; then
  echo "[entrypoint] Running database migrations..."
  node /run-migrations.js 2>&1 || echo "[entrypoint] Migration warning (may already be applied)"
fi

# Bootstrap the workspace, sign-in user and brand accounts (idempotent).
node /init-workspace.js || echo "[entrypoint] Workspace bootstrap warning"


exec node apps/web/server.js
