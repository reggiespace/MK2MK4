#!/usr/bin/env bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting ReggieSpace Social Studio...${NC}"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
  exit 1
fi

# Start Postgres and Redis with local dev overrides (ports mapped to localhost)
echo -e "${YELLOW}Starting PostgreSQL and Redis...${NC}"
docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml up -d postgres redis
if [ $? -ne 0 ]; then
  echo -e "${RED}Failed to start database services${NC}"
  exit 1
fi

# Wait for services to be healthy
echo -e "${YELLOW}Waiting for database services to be healthy...${NC}"
for i in {1..30}; do
  if docker compose -f infra/docker-compose.yml exec postgres pg_isready -U giq > /dev/null 2>&1 && \
     docker compose -f infra/docker-compose.yml exec redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}Services are healthy${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}Services failed to become healthy${NC}"
    exit 1
  fi
  echo "  Waiting... ($i/30)"
  sleep 1
done

# Create named pipes for output
mkfifo /tmp/web_pipe /tmp/worker_pipe 2>/dev/null || true

# Regenerate Prisma client to ensure schema is up-to-date
echo -e "${YELLOW}Ensuring Prisma client is up-to-date...${NC}"
(cd apps/web && npx prisma generate > /dev/null 2>&1)

# Start the web app (Next.js frontend + API)
echo -e "${YELLOW}Starting Next.js web app (frontend + API)...${NC}"
(cd apps/web && npm run dev) > /tmp/web_pipe 2>&1 &
WEB_PID=$!

# Start the worker service (Python)
echo -e "${YELLOW}Starting Python worker service...${NC}"
npm run worker:dev > /tmp/worker_pipe 2>&1 &
WORKER_PID=$!

# Trap to clean up on exit
cleanup() {
  echo -e "\n${YELLOW}Shutting down services...${NC}"
  kill $WEB_PID 2>/dev/null || true
  kill $WORKER_PID 2>/dev/null || true
  docker compose -f infra/docker-compose.yml down
  rm -f /tmp/web_pipe /tmp/worker_pipe
}
trap cleanup EXIT

echo -e "${GREEN}All services started!${NC}"
echo -e "${GREEN}Web app: http://localhost:3000${NC}"
echo -e "${GREEN}Worker: http://localhost:8000${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

# Wait for processes
wait
