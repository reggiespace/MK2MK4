#!/bin/bash
# Stop script for ReggieSpace Social Studio (preserves data)

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "⏹️  Stopping ReggieSpace Social Studio..."
echo "📁 Working directory: $REPO_ROOT"

# Named to match the file set start.sh/restart.sh brought up — `down` doesn't
# strictly need it to find the containers, but keeping it consistent avoids
# Compose warning about orphaned config.
docker compose \
  -f "$REPO_ROOT/infra/docker-compose.yml" \
  -f "$REPO_ROOT/infra/docker-compose.override.yml" \
  down

echo "✅ All containers stopped (data preserved)"
echo ""
echo "To restart: ./restart.sh"
echo "To start fresh: ./start.sh"
