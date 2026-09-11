#!/bin/bash
# 决定性实验：重启后首次请求（缓存必为空）能否看到新任务
set -e
SESSION_FILE=$(ls -t /srv/prompt-gallery/data/admin-sessions/*.json | head -1)
SESSION_ID=$(basename "$SESSION_FILE" .json)

echo "== restart service =="
sudo systemctl restart prompt-gallery
sleep 2

echo "== request 1 (cache cold, should be slow) =="
START=$(date +%s%N)
CODE=$(curl -s -H "Cookie: pg_admin=$SESSION_ID" \
  "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20" \
  -o /tmp/jobs-test1.json -w "%{http_code}")
END=$(date +%s%N)
echo "HTTP $CODE, elapsed $(( (END-START)/1000000 ))ms"

echo "== request 2 (cache warm, should be fast) =="
START=$(date +%s%N)
curl -s -H "Cookie: pg_admin=$SESSION_ID" \
  "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20" \
  -o /tmp/jobs-test2.json -o /tmp/jobs-test2.json -w "HTTP %{http_code}"
END=$(date +%s%N)
echo ", elapsed $(( (END-START)/1000000 ))ms"

node -e '
const fs = require("fs");
for (const f of ["/tmp/jobs-test1.json", "/tmp/jobs-test2.json"]) {
  const j = JSON.parse(fs.readFileSync(f, "utf8"));
  if (!j.jobs) { console.log(f, "unexpected:", JSON.stringify(j).slice(0, 150)); continue; }
  console.log(f, "| total:", j.total, "| first:", j.jobs[0].jobId.slice(0,8), j.jobs[0].createdAt, "| has 095205d6:", j.jobs.some((x) => x.jobId === "095205d6-7298-489c-a7a3-9c64a2cdc4bc"));
}
'
