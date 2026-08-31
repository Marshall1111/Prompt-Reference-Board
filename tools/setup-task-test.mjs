// 临时脚本：基于真实成功任务克隆一条 24h 内的测试任务（验证后删除）。
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const accountId = "7076b5d2-3e17-4939-808f-1acfe7e0e252";
const sourceSessionId = "b9ec0f45-a535-4cea-b6da-f5b7b5f6028d";
const sessionId = randomUUID();
const now = new Date().toISOString();

const session = JSON.parse(readFileSync(`data/draw-card-sessions/${sourceSessionId}.json`, "utf8"));
session.sessionId = sessionId;
session.traceId = randomUUID();
session.ownerVisitorId = "";
session.ownerAccountId = accountId;
session.createdAt = now;
session.updatedAt = now;
session.completedAt = now;
session.isLiked = true;
for (const result of session.results || []) {
  result.isLiked = true;
  result.likedAt = now;
}
for (const item of session.items || []) {
  if (item.result) {
    item.result.isLiked = true;
    item.result.likedAt = now;
  }
}
writeFileSync(`data/draw-card-sessions/${sessionId}.json`, JSON.stringify(session, null, 2));
console.log("session file:", sessionId);

const db = new DatabaseSync("data/orders.sqlite");
const row = db.prepare("SELECT id FROM commerce_user_sessions WHERE account_id = ? ORDER BY created_at DESC LIMIT 1").get(accountId);
console.log("user session id:", row.id);
db.close();
