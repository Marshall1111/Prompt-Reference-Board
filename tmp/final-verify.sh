#!/bin/bash
# 最终端到端验证：新任务应在下一次轮询立即出现在列表
SESSION_FILE=$(ls -t /srv/prompt-gallery/data/admin-sessions/*.json | head -1)
SESSION_ID=$(basename "$SESSION_FILE" .json)
COOKIE="Cookie: pg_admin=$SESSION_ID"

echo "== verify deployed code =="
echo "saveImageJob invalidate: $(grep -A 6 'async function saveImageJob' /srv/prompt-gallery/server/index.js | grep -c invalidate)"
echo "listAdminAccountsCached refs: $(grep -c 'listAdminAccountsCached' /srv/prompt-gallery/server/index.js)"
echo "qij-timing leftovers: $(grep -c 'qij-timing' /srv/prompt-gallery/server/index.js || true)"

echo "== create test job =="
RESP=$(curl -s -H "$COOKIE" -X POST "http://127.0.0.1:3000/api/image-jobs" \
  -F "prompt=cache-debug-test2-0911-delete-me" \
  -F "size=1024x1024")
JOBID=$(echo "$RESP" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).jobId||"")}catch(e){console.log("")}})')
echo "JOBID=$JOBID"
if [ -z "$JOBID" ]; then echo "create failed"; exit 1; fi

cat > /tmp/check-one.js <<EOF
const fs = require("fs");
const j = JSON.parse(fs.readFileSync("/tmp/jt.json", "utf8"));
const target = "$JOBID";
console.log("total=" + j.total + " hasJob=" + j.jobs.some((x) => x.jobId === target));
EOF

echo "== poll =="
for i in 1 2 3; do
  curl -s -H "$COOKIE" "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20" -o /tmp/jt.json
  echo "poll #$i: $(node /tmp/check-one.js)"
  sleep 2
done

echo "== timing =="
START=$(date +%s%N)
curl -s -H "$COOKIE" "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20" -o /dev/null -w "HTTP %{http_code}"
END=$(date +%s%N)
echo ", $(( (END-START)/1000000 ))ms"

echo "== cleanup =="
curl -s -H "$COOKIE" -X POST "http://127.0.0.1:3000/api/image-jobs/$JOBID/cancel" -o /dev/null -w "cancel: %{http_code}\n"
sleep 1
curl -s -H "$COOKIE" -X DELETE "http://127.0.0.1:3000/api/image-jobs/$JOBID" -o /dev/null -w "delete: %{http_code}\n"
# 清理上一个残留测试任务
OLDID="c2dfb0fc-1b2c-4bde-927f-5a9bfa2f601d"
curl -s -H "$COOKIE" -X DELETE "http://127.0.0.1:3000/api/image-jobs/$OLDID" -o /dev/null -w "cleanup old: %{http_code}\n"
curl -s -H "$COOKIE" "http://127.0.0.1:3000/api/image-jobs?page=1&limit=5" -o /tmp/jt.json
echo "after cleanup: $(node /tmp/check-one.js)"
