#!/bin/bash
# 观察测试任务 c2dfb0fc 是否出现在列表接口，然后清理
SESSION_FILE=$(ls -t /srv/prompt-gallery/data/admin-sessions/*.json | head -1)
SESSION_ID=$(basename "$SESSION_FILE" .json)
COOKIE="Cookie: pg_admin=$SESSION_ID"
JOBID="c2dfb0fc-1b2c-4bde-927f-5a9bfa2f601d"

cat > /tmp/check-one.js <<'EOF'
const fs = require("fs");
const j = JSON.parse(fs.readFileSync("/tmp/jt.json", "utf8"));
const target = process.argv[2];
console.log("total=" + j.total + " hasJob=" + j.jobs.some((x) => x.jobId === target));
EOF

for i in 1 2 3; do
  curl -s -H "$COOKIE" "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20" -o /tmp/jt.json
  echo "poll #$i: $(node /tmp/check-one.js "$JOBID")"
  sleep 2
done

echo "== cleanup =="
curl -s -H "$COOKIE" -X POST "http://127.0.0.1:3000/api/image-jobs/$JOBID/cancel" -o /dev/null -w "cancel: %{http_code}\n"
sleep 1
curl -s -H "$COOKIE" -X DELETE "http://127.0.0.1:3000/api/image-jobs/$JOBID" -o /dev/null -w "delete: %{http_code}\n"
curl -s -H "$COOKIE" "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20" -o /tmp/jt.json
echo "after cleanup: $(node /tmp/check-one.js "$JOBID")"
