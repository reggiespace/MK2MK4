#!/bin/bash
# Quick-start script for ReggieSpace Social Studio

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$REPO_ROOT/.env"
# The override file is what publishes postgres/redis to the host (5432/6379).
# Compose only auto-loads it when invoked with no -f flag at all, so every
# invocation below names it explicitly.
COMPOSE_FILES=(-f "$REPO_ROOT/infra/docker-compose.yml" -f "$REPO_ROOT/infra/docker-compose.override.yml")

echo "🚀 Starting ReggieSpace Social Studio..."
echo "📁 Working directory: $REPO_ROOT"

# Check if .env exists
if [ ! -f "$ENV_FILE" ]; then
    echo "❌ .env file not found at $ENV_FILE"
    echo "⚠️  Please create .env with your API keys (SESSION_SECRET, FAL_KEY, OPENAI_API_KEY, etc.)"
    exit 1
fi

# Load .env into shell
set -a
source "$ENV_FILE"
set +a

# Start containers with proper env file loading (use absolute path)
# Note: docker-compose may warn about unset variables below, but --env-file ensures
# all variables are actually loaded into the containers. These warnings are harmless.
docker compose \
  --env-file "$ENV_FILE" \
  "${COMPOSE_FILES[@]}" \
  up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
until docker compose "${COMPOSE_FILES[@]}" ps | grep -q "web.*Up"; do
    sleep 2
done

echo "✅ Services are ready!"
echo ""
echo "🌐 Web app: http://localhost:3000"
echo "⚙️  Worker API: http://localhost:8000"
echo "📊 Database: localhost:5432"
echo "🔴 Redis: localhost:6379"
echo ""
echo "📝 Login with:"
echo "   Email: $(grep OPERATOR_EMAIL "$ENV_FILE" | cut -d= -f2)"
echo "   Password: $(grep OPERATOR_PASSWORD "$ENV_FILE" | cut -d= -f2)"
