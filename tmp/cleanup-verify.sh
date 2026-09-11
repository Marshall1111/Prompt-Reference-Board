#!/bin/bash
# 收尾：确认测试任务已清理 + 测量最终响应耗时
SESSION_FILE=$(ls -t /srv/prompt-gallery/data/admin-sessions/*.json | head -1)
SESSION_ID=$(basename "$SESSION_FILE" .json)
COOKIE="Cookie: pg_admin=$SESSION_ID"

echo "== leftover test jobs on disk =="
ls /srv/prompt-gallery/data/image-jobs/ | grep -E '57aba189|26b54e33|c2dfb0fc' || echo "(none)"

for OLD in 57aba189-e0be-4216-9c3a-c31889d69cbc 26b54e33-f041-441a-9f94-686874e8a7e6 c2dfb0fc-1b2c-4bde-927f-5a9bfa2f601d; do
  if [ -f "/srv/prompt-gallery/data/image-jobs/$OLD.json" ]; then
    CODE=$(curl -s -H "$COOKIE" -X DELETE "http://127.0.0.1:3000/api/image-jobs/$OLD" -o /dev/null -w "%{http_code}")
    echo "delete $OLD: $CODE"
  fi
done

echo "== timing (3 requests) =="
for i in 1 2 3; do
  START=$(date +%s%N)
  C=$(curl -s -H "$COOKIE" "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20" -o /dev/null -w "%{http_code}")
  END=$(date +%s%N)
  echo "req #$i: HTTP $C, $(( (END-START)/1000000 ))ms"
  sleep 1
done

echo "== final total =="
curl -s -H "$COOKIE" "http://127.0.0.1:3000/api/image-jobs?page=1&limit=1" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const j=JSON.parse(d);console.log("total:",j.total)})'
