// 临时脚本：查看本地注册账户与最近任务（验证后删除）。
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("data/orders.sqlite", { readOnly: true });
const cols = db.prepare("PRAGMA table_info(commerce_accounts)").all().map((c) => c.name);
console.log("columns:", cols.join(","));
const accounts = db
  .prepare("SELECT * FROM commerce_accounts LIMIT 5")
  .all();
console.log("accounts:", JSON.stringify(accounts, null, 1).slice(0, 2000));
db.close();
