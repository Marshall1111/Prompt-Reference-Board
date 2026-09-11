#!/bin/bash
SESSION_FILE=$(ls -t /srv/prompt-gallery/data/admin-sessions/*.json | head -1)
SESSION_ID=$(basename "$SESSION_FILE" .json)
COOKIE="Cookie: pg_admin=$SESSION_ID"
for i in 1 2 3 4; do
  curl -s -o /dev/null -w "req #$i: HTTP %{http_code}, %{time_total}s\n" -H "$COOKIE" "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20"
  sleep 2
done
