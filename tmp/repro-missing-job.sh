#!/bin/bash
# 复现实验：创建测试任务后轮询列表，观察新任务何时出现
set -e
SESSION_FILE=$(ls -t /srv/prompt-gallery/data/admin-sessions/*.json | head -1)
SESSION_ID=$(basename "$SESSION_FILE" .json)
COOKIE="Cookie: pg_admin=$SESSION_ID"

echo "== create test job =="
RESP=$(curl -s -H "$COOKIE" -X POST "http://127.0.0.1:3000/api/image-jobs" \
  -F "prompt=cache-debug-test-0911-delete-me" \
  -F "size=1024x1024")
echo "$RESP" | head -c 300; echo
JOBID=$(echo "$RESP" | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).jobId||"")}catch(e){console.log("")}})')
echo "JOBID=$JOBID"
if [ -z "$JOBID" ]; then echo "create failed"; exit 1; fi

echo "== poll list 8 times (2s interval) =="
for i in 1 2 3 4 5 6 7 8; do
  sleep 2
  RESULT=$(curl -s -H "$COOKIE" "http://127.0.0.1:3000/api/image-jobs?page=1&limit=20" | node -e '
let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{
  const j=JSON.parse(d);
  const target="'"$JOBID"'";
  console.log("total="+j.total+" hasJob="+j.jobs.some(x=>x.jobId===target));
})')
  echo "poll #$i: $RESULT"
done

echo "== cleanup: cancel + delete test job =="
curl -s -H "$COOKIE" -X POST "http://127.0.0.1:3000/api/image-jobs/$JOBID/cancel" -o /dev/null -w "cancel: %{http_code}\n"
curl -s -H "$COOKIE" -X DELETE "http://127.0.0.1:3000/api/image-jobs/$JOBID" -o /dev/null -w "delete: %{http_code}\n"
