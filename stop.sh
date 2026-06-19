#!/bin/bash
# Stop script for Gastric IQ Social Studio (preserves data)

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "⏹️  Stopping Gastric IQ Social Content Studio..."
echo "📁 Working directory: $REPO_ROOT"

docker compose \
  -f "$REPO_ROOT/infra/docker-compose.yml" \
  down

echo "✅ All containers stopped (data preserved)"
echo ""
echo "To restart: ./restart.sh"
echo "To start fresh: ./start.sh"
