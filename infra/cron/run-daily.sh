#!/bin/sh
set -eu
: "${WEB_BASE_URL:=http://web:3000}"
: "${CRON_SECRET:=}"
echo "[cron] daily-run $(date -u +%FT%TZ)"
curl -fsS -X POST "$WEB_BASE_URL/api/cron/daily-run" \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "content-type: application/json" \
  || echo "[cron] daily-run failed"
