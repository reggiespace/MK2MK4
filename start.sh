#!/bin/bash
# Quick-start script for Gastric IQ Social Studio

set -e

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Starting Gastric IQ Social Content Studio..."
echo "📁 Working directory: $REPO_ROOT"

cd "$REPO_ROOT"

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Creating from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env with your API keys (SESSION_SECRET, FAL_KEY, OPENAI_API_KEY, etc.)"
    echo "    Then run this script again."
    exit 1
fi

# Start containers with proper env file loading
docker compose --env-file .env -f infra/docker-compose.yml up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to be ready..."
until docker compose -f infra/docker-compose.yml ps | grep -q "web.*Up"; do
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
echo "   Email: $(grep OPERATOR_EMAIL .env | cut -d= -f2)"
echo "   Password: $(grep OPERATOR_PASSWORD .env | cut -d= -f2)"
