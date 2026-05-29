#!/bin/bash

SERVER_URL="${SERVER_URL:-http://localhost:3000}"
STATS_KEY="${STATS_KEY:-developer_super_secret_analytics_token}"
DIGEST="a3f5b9d7e1c8b2a59a7d3e5f1c4b6a8d9e0f1234567890abcdef1234567890ab"

echo "Starting telemetry server verification"
echo "------------------------------------"

echo
echo "1. Health check"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" "$SERVER_URL/api/health"

echo
echo "2. First telemetry ping"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"dailyToken\":\"$DIGEST\",\"version\":\"1.0.0\",\"platform\":\"android\"}" \
  "$SERVER_URL/api/ping"

echo
echo "3. Duplicate telemetry ping"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" -X POST \
  -H "Content-Type: application/json" \
  -d "{\"dailyToken\":\"$DIGEST\",\"version\":\"1.0.0\",\"platform\":\"android\"}" \
  "$SERVER_URL/api/ping"

echo
echo "4. Protected stats endpoint"
curl -s -w "\nHTTP_STATUS:%{http_code}\n" \
  -H "Authorization: Bearer $STATS_KEY" \
  "$SERVER_URL/api/stats"

echo
echo "Done"