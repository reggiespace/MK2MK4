#!/bin/sh
set -eu
: "${WEB_BASE_URL:=http://web:3000}"
: "${CRON_SECRET:=}"
echo "[cron] daily-run $(date -u +%FT%TZ)"
if ! curl -fsS -X POST "$WEB_BASE_URL/api/cron/daily-run" \
  --connect-timeout 10 \
  --max-time 300 \
  --retry 2 \
  --retry-delay 5 \
  --retry-connrefused \
  -H "x-cron-secret: $CRON_SECRET" \
  -H "content-type: application/json"; then
  echo "[cron] daily-run failed"
  exit 1
fi
