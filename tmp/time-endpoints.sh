#!/bin/bash
# 分段计时：定位 2.2s 花在哪个环节
set -e
SESSION_FILE=$(ls -t /srv/prompt-gallery/data/admin-sessions/*.json | head -1)
SESSION_ID=$(basename "$SESSION_FILE" .json)
COOKIE="Cookie: pg_admin=$SESSION_ID"

time_url () {
  local LABEL="$1"; local URL="$2"
  local START=$(date +%s%N)
  local CODE=$(curl -s -H "$COOKIE" "$URL" -o /dev/null -w "%{http_code}")
  local END=$(date +%s%N)
  echo "$LABEL: HTTP $CODE, $(( (END-START)/1000000 ))ms"
}

time_url "health (baseline)        " "http://127.0.0.1:3000/api/health"
time_url "styles (readStyles)      " "http://127.0.0.1:3000/api/styles"
time_url "image-jobs #1            " "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20"
time_url "image-jobs #2            " "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20"
time_url "image-jobs #3            " "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20"

echo "--- styles.json size ---"
ls -lh /srv/prompt-gallery/data/styles.json
node -e 'const s=require("/srv/prompt-gallery/data/styles.json"); console.log("styles count:", s.length)'
