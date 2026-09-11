#!/bin/bash
# 测量 queryImageJobs 各数据源的读盘耗时
cd /srv/prompt-gallery
for dir in data/image-jobs data/visitor-states data/visit-sessions data/styles; do
  COUNT=$(ls "$dir" 2>/dev/null | wc -l)
  SIZE=$(du -sh "$dir" 2>/dev/null | cut -f1)
  echo "$dir: $COUNT files, $SIZE"
done

node -e '
const fs = require("fs");
const path = require("path");

async function timeDir(label, dir) {
  const start = Date.now();
  let count = 0, bytes = 0;
  let entries = [];
  try { entries = fs.readdirSync(dir); } catch (e) { console.log(label, "readdir failed:", e.code); return; }
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    try {
      const buf = fs.readFileSync(path.join(dir, name));
      bytes += buf.length;
      JSON.parse(buf.toString("utf8"));
      count++;
    } catch (e) { /* malformed */ }
  }
  console.log(label + ": " + count + " json files, " + bytes + " bytes, " + (Date.now() - start) + "ms");
}

(async () => {
  await timeDir("image-jobs     ", "/srv/prompt-gallery/data/image-jobs");
  await timeDir("visitor-states ", "/srv/prompt-gallery/data/visitor-states");
  await timeDir("visit-sessions ", "/srv/prompt-gallery/data/visit-sessions");
  await timeDir("styles(dir)    ", "/srv/prompt-gallery/data/styles");
})();
'
