import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(value, fallback = null) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function withTransaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function mapAccount(row) {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    channel: String(row.channel || "web_wechat"),
    openId: String(row.open_id || ""),
    creditBalance: Number(row.credit_balance || 0),
    originalDownloadsUnlockedAt: row.original_downloads_unlocked_at || null,
    email: String(row.email || ""),
    username: String(row.username || ""),
    passwordHash: String(row.password_hash || ""),
    accountStatus: String(row.account_status || "active"),
    registeredAt: row.registered_at || null,
    lastLoginAt: row.last_login_at || null,
    isRegistered: Boolean(row.registered_at && row.email && row.password_hash),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapPaymentIntent(row) {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    outTradeNo: String(row.out_trade_no || ""),
    accountId: String(row.account_id || ""),
    kind: String(row.kind || ""),
    amountCents: Number(row.amount_cents || 0),
    creditAmount: Number(row.credit_amount || 0),
    targetOrderId: String(row.target_order_id || ""),
    status: String(row.status || "created"),
    channel: String(row.channel || ""),
    transactionId: String(row.transaction_id || ""),
    expiresAt: row.expires_at || null,
    paidAt: row.paid_at || null,
    metadata: safeJsonParse(row.metadata_json, {}),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapLedgerRow(row) {
  return {
    id: String(row.id || ""),
    accountId: String(row.account_id || ""),
    delta: Number(row.delta || 0),
    balanceAfter: Number(row.balance_after || 0),
    reason: String(row.reason || ""),
    referenceType: String(row.reference_type || ""),
    referenceId: String(row.reference_id || ""),
    note: String(row.note || ""),
    createdAt: row.created_at || null
  };
}

export function createCommerceStore({ dbPath }) {
  const directory = path.dirname(dbPath);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS commerce_accounts (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      open_id TEXT NOT NULL,
      credit_balance INTEGER NOT NULL DEFAULT 0,
      original_downloads_unlocked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(channel, open_id)
    );

    CREATE TABLE IF NOT EXISTS commerce_account_visitors (
      account_id TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (account_id, visitor_id),
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_credit_ledger (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      balance_after INTEGER NOT NULL,
      reason TEXT NOT NULL,
      reference_type TEXT NOT NULL,
      reference_id TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(account_id, reference_type, reference_id),
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_original_image_redemptions (
      account_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      redemption_type TEXT NOT NULL,
      source_order_id TEXT NOT NULL DEFAULT '',
      redeemed_at TEXT NOT NULL,
      PRIMARY KEY (account_id, job_id),
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_payment_intents (
      id TEXT PRIMARY KEY,
      out_trade_no TEXT NOT NULL UNIQUE,
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      credit_amount INTEGER NOT NULL DEFAULT 0,
      target_order_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT '',
      transaction_id TEXT NOT NULL DEFAULT '',
      expires_at TEXT,
      paid_at TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_intent_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_id TEXT NOT NULL,
      success INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      headers_json TEXT NOT NULL,
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(payment_intent_id, event_type, event_id),
      FOREIGN KEY (payment_intent_id) REFERENCES commerce_payment_intents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_user_sessions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_email_verifications (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      sent_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_commerce_account_visitors_visitor ON commerce_account_visitors(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_commerce_payment_intents_account ON commerce_payment_intents(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_payment_intents_transaction ON commerce_payment_intents(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_commerce_credit_ledger_account ON commerce_credit_ledger(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_original_image_redemptions_order ON commerce_original_image_redemptions(source_order_id);
    CREATE INDEX IF NOT EXISTS idx_commerce_user_sessions_account ON commerce_user_sessions(account_id, expires_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_email_verifications_lookup ON commerce_email_verifications(email, purpose, created_at DESC);
  `);

  const accountColumns = db.prepare("PRAGMA table_info(commerce_accounts)").all();
  const ensureAccountColumn = (name, definition) => {
    if (!accountColumns.some((column) => String(column.name || "") === name)) {
      db.exec(`ALTER TABLE commerce_accounts ADD COLUMN ${definition}`);
    }
  };
  ensureAccountColumn("email", "email TEXT NOT NULL DEFAULT ''");
  ensureAccountColumn("username", "username TEXT NOT NULL DEFAULT ''");
  ensureAccountColumn("password_hash", "password_hash TEXT NOT NULL DEFAULT ''");
  ensureAccountColumn("account_status", "account_status TEXT NOT NULL DEFAULT 'active'");
  ensureAccountColumn("registered_at", "registered_at TEXT");
  ensureAccountColumn("last_login_at", "last_login_at TEXT");
  const ledgerColumns = db.prepare("PRAGMA table_info(commerce_credit_ledger)").all();
  if (!ledgerColumns.some((column) => String(column.name || "") === "note")) {
    db.exec("ALTER TABLE commerce_credit_ledger ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_accounts_email_unique ON commerce_accounts(email) WHERE email != ''");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_accounts_username_unique ON commerce_accounts(username) WHERE username != ''");

  const readAccountByIdStatement = db.prepare("SELECT * FROM commerce_accounts WHERE id = ?");
  const readAccountByOpenIdStatement = db.prepare("SELECT * FROM commerce_accounts WHERE channel = ? AND open_id = ?");
  const readAccountByEmailStatement = db.prepare("SELECT * FROM commerce_accounts WHERE email = ?");
  const readAccountByUsernameStatement = db.prepare("SELECT * FROM commerce_accounts WHERE username = ?");
  const readIntentByIdStatement = db.prepare("SELECT * FROM commerce_payment_intents WHERE id = ?");
  const readIntentByTradeNoStatement = db.prepare("SELECT * FROM commerce_payment_intents WHERE out_trade_no = ?");
  const readOriginalImageRedemptionStatement = db.prepare(`
    SELECT * FROM commerce_original_image_redemptions
    WHERE account_id = ? AND job_id = ?
  `);
  const readPaidPhysicalOrderStatement = db.prepare(`
    SELECT id FROM commerce_payment_intents
    WHERE account_id = ? AND kind = 'physical_order' AND status = 'paid'
    LIMIT 1
  `);

  function readAccount(accountId) {
    return mapAccount(readAccountByIdStatement.get(String(accountId || "")));
  }

  function readAccountByOpenId(openId, channel = "web_wechat") {
    return mapAccount(readAccountByOpenIdStatement.get(channel, String(openId || "")));
  }

  function readAccountByEmail(email) {
    return mapAccount(readAccountByEmailStatement.get(String(email || "").trim().toLowerCase()));
  }

  function readAccountByUsername(username) {
    return mapAccount(readAccountByUsernameStatement.get(String(username || "").trim()));
  }

  function hasPaidPhysicalOrder(accountId) {
    return Boolean(readPaidPhysicalOrderStatement.get(String(accountId || "")));
  }

  function isOriginalImageRedeemed(accountId, jobId) {
    const safeAccountId = String(accountId || "");
    const safeJobId = String(jobId || "");
    if (readOriginalImageRedemptionStatement.get(safeAccountId, safeJobId)) return true;
    return Boolean(db.prepare(`
      SELECT 1
      FROM commerce_payment_intents p
      INNER JOIN orders o ON o.id = p.target_order_id
      INNER JOIN order_items i ON i.order_id = o.id
      WHERE p.account_id = ?
        AND p.kind = 'physical_order'
        AND p.status = 'paid'
        AND o.account_id = ?
        AND i.job_id = ?
      LIMIT 1
    `).get(safeAccountId, safeAccountId, safeJobId));
  }

  function createUserSession(accountId, { ttlMs = 30 * 24 * 60 * 60 * 1000 } = {}) {
    const account = readAccount(accountId);
    if (!account?.isRegistered) throw new Error("账户尚未注册。");
    const now = nowIso();
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + Math.max(60 * 1000, Number(ttlMs || 0))).toISOString();
    db.prepare(`
      INSERT INTO commerce_user_sessions (id, account_id, expires_at, created_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, account.id, expiresAt, now, now);
    return { id, accountId: account.id, expiresAt, createdAt: now, lastSeenAt: now };
  }

  function readUserSession(sessionId) {
    const row = db.prepare(`
      SELECT s.id AS session_id, s.expires_at AS session_expires_at, a.*
      FROM commerce_user_sessions s
      JOIN commerce_accounts a ON a.id = s.account_id
      WHERE s.id = ? AND s.expires_at > ?
    `).get(String(sessionId || ""), nowIso());
    if (!row) return null;
    db.prepare("UPDATE commerce_user_sessions SET last_seen_at = ? WHERE id = ?").run(nowIso(), String(sessionId));
    return { id: String(row.session_id || sessionId), account: mapAccount(row), expiresAt: row.session_expires_at || null };
  }

  function deleteUserSession(sessionId) {
    db.prepare("DELETE FROM commerce_user_sessions WHERE id = ?").run(String(sessionId || ""));
  }

  function upgradeGuestAccount({ accountId, email, username, passwordHash }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedUsername = String(username || "").trim();
    if (!normalizedEmail || !normalizedUsername || !passwordHash) throw new Error("注册信息不完整。");
    return withTransaction(db, () => {
      const account = readAccount(accountId);
      if (!account) throw new Error("账户不存在。");
      const byEmail = readAccountByEmail(normalizedEmail);
      if (byEmail && byEmail.id !== account.id) {
        const error = new Error("邮箱已被注册。");
        error.code = "EMAIL_EXISTS";
        throw error;
      }
      const byUsername = readAccountByUsername(normalizedUsername);
      if (byUsername && byUsername.id !== account.id) {
        const error = new Error("用户名已被使用。");
        error.code = "USERNAME_EXISTS";
        throw error;
      }
      if (account.isRegistered) {
        const error = new Error("当前账户已完成注册。");
        error.code = "ALREADY_REGISTERED";
        throw error;
      }
      const now = nowIso();
      const emailAccountOpenId = randomUUID();
      db.prepare(`
        UPDATE commerce_accounts
        SET channel = 'email_user', open_id = ?, email = ?, username = ?, password_hash = ?, account_status = 'active', registered_at = ?, last_login_at = ?, updated_at = ?
        WHERE id = ?
      `).run(emailAccountOpenId, normalizedEmail, normalizedUsername, String(passwordHash), now, now, now, account.id);
      return readAccount(account.id);
    });
  }

  function updateAccountPassword(accountId, passwordHash) {
    const account = readAccount(accountId);
    if (!account?.isRegistered) return null;
    db.prepare("UPDATE commerce_accounts SET password_hash = ?, updated_at = ? WHERE id = ?")
      .run(String(passwordHash || ""), nowIso(), account.id);
    return readAccount(account.id);
  }

  function recordAccountLogin(accountId) {
    db.prepare("UPDATE commerce_accounts SET last_login_at = ?, updated_at = ? WHERE id = ?")
      .run(nowIso(), nowIso(), String(accountId || ""));
    return readAccount(accountId);
  }

  function setAccountStatus(accountId, accountStatus) {
    const status = accountStatus === "disabled" ? "disabled" : "active";
    db.prepare("UPDATE commerce_accounts SET account_status = ?, updated_at = ? WHERE id = ?")
      .run(status, nowIso(), String(accountId || ""));
    return readAccount(accountId);
  }

  function createEmailVerification({ email, purpose, codeHash, expiresAt }) {
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedPurpose = String(purpose || "").trim();
    const latest = db.prepare(`
      SELECT * FROM commerce_email_verifications
      WHERE email = ? AND purpose = ?
      ORDER BY created_at DESC LIMIT 1
    `).get(normalizedEmail, normalizedPurpose);
    if (latest && Date.now() - Date.parse(latest.sent_at) < 60 * 1000) {
      const error = new Error("验证码发送过于频繁，请 60 秒后重试。");
      error.code = "CODE_RATE_LIMIT";
      throw error;
    }
    const now = nowIso();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO commerce_email_verifications (id, email, purpose, code_hash, expires_at, sent_at, attempts, consumed_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?)
    `).run(id, normalizedEmail, normalizedPurpose, String(codeHash || ""), String(expiresAt || ""), now, now);
    return { id, email: normalizedEmail, purpose: normalizedPurpose, expiresAt: String(expiresAt || ""), sentAt: now };
  }

  function consumeEmailVerification({ email, purpose, matchesCodeHash }) {
    const row = db.prepare(`
      SELECT * FROM commerce_email_verifications
      WHERE email = ? AND purpose = ? AND consumed_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(String(email || "").trim().toLowerCase(), String(purpose || "").trim());
    if (!row || Date.parse(row.expires_at) <= Date.now()) {
      const error = new Error("验证码已过期，请重新获取。");
      error.code = "CODE_EXPIRED";
      throw error;
    }
    if (Number(row.attempts || 0) >= 5) {
      const error = new Error("验证码错误次数过多，请重新获取。");
      error.code = "CODE_ATTEMPTS_EXCEEDED";
      throw error;
    }
    if (!matchesCodeHash(String(row.code_hash || ""))) {
      db.prepare("UPDATE commerce_email_verifications SET attempts = attempts + 1 WHERE id = ?").run(String(row.id));
      const error = new Error("验证码不正确。");
      error.code = "CODE_INVALID";
      throw error;
    }
    db.prepare("UPDATE commerce_email_verifications SET consumed_at = ? WHERE id = ?").run(nowIso(), String(row.id));
    return true;
  }

  function linkVisitor(accountId, visitorId) {
    if (!accountId || !visitorId) return;
    db.prepare(`
      INSERT OR IGNORE INTO commerce_account_visitors (account_id, visitor_id, created_at)
      VALUES (?, ?, ?)
    `).run(String(accountId), String(visitorId), nowIso());
  }

  function listVisitorIds(accountId) {
    return db.prepare("SELECT visitor_id FROM commerce_account_visitors WHERE account_id = ? ORDER BY created_at ASC")
      .all(String(accountId || ""))
      .map((row) => String(row.visitor_id || ""))
      .filter(Boolean);
  }

  function appendLedger(accountId, delta, { reason, referenceType, referenceId, note = "" } = {}) {
    const account = readAccount(accountId);
    if (!account) throw new Error("账户不存在。");
    const existing = db.prepare(`
      SELECT * FROM commerce_credit_ledger
      WHERE account_id = ? AND reference_type = ? AND reference_id = ?
    `).get(String(accountId), String(referenceType || ""), String(referenceId || ""));
    if (existing) return { ledger: mapLedgerRow(existing), account };

    const safeDelta = Math.trunc(Number(delta || 0));
    const nextBalance = account.creditBalance + safeDelta;
    if (nextBalance < 0) {
      const error = new Error("点数余额不足。");
      error.code = "INSUFFICIENT_CREDITS";
      throw error;
    }

    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO commerce_credit_ledger (
        id, account_id, delta, balance_after, reason, reference_type, reference_id, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), account.id, safeDelta, nextBalance, String(reason || ""), String(referenceType || ""), String(referenceId || ""), String(note || ""), createdAt);
    db.prepare("UPDATE commerce_accounts SET credit_balance = ?, updated_at = ? WHERE id = ?")
      .run(nextBalance, createdAt, account.id);
    return {
      ledger: mapLedgerRow(db.prepare("SELECT * FROM commerce_credit_ledger WHERE account_id = ? AND reference_type = ? AND reference_id = ?")
        .get(account.id, String(referenceType || ""), String(referenceId || ""))),
      account: readAccount(account.id)
    };
  }

  function createOrGetWebAccount({ openId, visitorId, signupCredits = 5 }) {
    const normalizedOpenId = String(openId || "").trim();
    if (!normalizedOpenId) throw new Error("缺少微信用户标识。");
    return withTransaction(db, () => {
      let account = readAccountByOpenId(normalizedOpenId);
      if (!account) {
        const createdAt = nowIso();
        const id = randomUUID();
        db.prepare(`
          INSERT INTO commerce_accounts (id, channel, open_id, credit_balance, original_downloads_unlocked_at, created_at, updated_at)
          VALUES (?, 'web_wechat', ?, 0, NULL, ?, ?)
        `).run(id, normalizedOpenId, createdAt, createdAt);
        account = readAccount(id);
        appendLedger(account.id, Math.max(0, Math.trunc(Number(signupCredits || 0))), {
          reason: "signup_bonus",
          referenceType: "account",
          referenceId: account.id
        });
      }
      linkVisitor(account.id, visitorId);
      return readAccount(account.id);
    });
  }

  function createOrGetBrowserAccount({ visitorId, signupCredits = 5 }) {
    const normalizedVisitorId = String(visitorId || "").trim();
    if (!normalizedVisitorId) throw new Error("缺少访客标识。");
    return withTransaction(db, () => {
      let account = readAccountByOpenIdStatement.get("browser_guest", normalizedVisitorId);
      if (!account) {
        const createdAt = nowIso();
        const id = randomUUID();
        db.prepare(`
          INSERT INTO commerce_accounts (id, channel, open_id, credit_balance, original_downloads_unlocked_at, created_at, updated_at)
          VALUES (?, 'browser_guest', ?, 0, NULL, ?, ?)
        `).run(id, normalizedVisitorId, createdAt, createdAt);
        account = readAccount(id);
        appendLedger(account.id, Math.max(0, Math.trunc(Number(signupCredits || 0))), {
          reason: "signup_bonus",
          referenceType: "account",
          referenceId: account.id
        });
      }
      linkVisitor(account.id, normalizedVisitorId);
      return readAccount(account.id);
    });
  }

  function createPaymentIntent({ accountId, outTradeNo, kind, amountCents, creditAmount = 0, targetOrderId = "", expiresAt = null, metadata = {} }) {
    const account = readAccount(accountId);
    if (!account) throw new Error("账户不存在。");
    const now = nowIso();
    const id = randomUUID();
    db.prepare(`
      INSERT INTO commerce_payment_intents (
        id, out_trade_no, account_id, kind, amount_cents, credit_amount, target_order_id,
        status, channel, transaction_id, expires_at, paid_at, metadata_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'created', '', '', ?, NULL, ?, ?, ?)
    `).run(
      id,
      String(outTradeNo || ""),
      account.id,
      String(kind || ""),
      Math.max(0, Math.trunc(Number(amountCents || 0))),
      Math.max(0, Math.trunc(Number(creditAmount || 0))),
      String(targetOrderId || ""),
      expiresAt || null,
      JSON.stringify(metadata || {}),
      now,
      now
    );
    return mapPaymentIntent(readIntentByIdStatement.get(id));
  }

  function readPaymentIntent(intentId) {
    return mapPaymentIntent(readIntentByIdStatement.get(String(intentId || "")));
  }

  function readPaymentIntentByOutTradeNo(outTradeNo) {
    return mapPaymentIntent(readIntentByTradeNoStatement.get(String(outTradeNo || "")));
  }

  function recordPaymentEvent({ paymentIntentId, eventType, eventId, success, payload = null, headers = null, errorMessage = "" }) {
    db.prepare(`
      INSERT OR IGNORE INTO commerce_payment_events (
        payment_intent_id, event_type, event_id, success, payload_json, headers_json, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(paymentIntentId || ""), String(eventType || ""), String(eventId || ""), success ? 1 : 0,
      JSON.stringify(payload || null), JSON.stringify(headers || null), String(errorMessage || ""), nowIso()
    );
  }

  function markPaymentPrepared(intentId, event) {
    return withTransaction(db, () => {
      const intent = readPaymentIntent(intentId);
      if (!intent) return null;
      db.prepare("UPDATE commerce_payment_intents SET status = CASE WHEN status = 'created' THEN 'pending' ELSE status END, channel = ?, updated_at = ? WHERE id = ?")
        .run(String(event?.channel || "wechat_jsapi"), nowIso(), intent.id);
      recordPaymentEvent({ paymentIntentId: intent.id, eventType: "payment_prepay", eventId: String(event?.eventId || `${intent.id}:prepay`), success: true, payload: event?.payload || null });
      return readPaymentIntent(intent.id);
    });
  }

  function cancelPaymentIntentByOutTradeNo(outTradeNo) {
    return withTransaction(db, () => {
      const intent = readPaymentIntentByOutTradeNo(outTradeNo);
      if (!intent || intent.status === "paid") return intent;
      db.prepare("UPDATE commerce_payment_intents SET status = 'cancelled', updated_at = ? WHERE id = ?")
        .run(nowIso(), intent.id);
      recordPaymentEvent({ paymentIntentId: intent.id, eventType: "payment_cancelled", eventId: `${intent.id}:cancelled`, success: true });
      return readPaymentIntent(intent.id);
    });
  }

  function settlePayment({ outTradeNo, transactionId, paidAt, payload, headers }) {
    return withTransaction(db, () => {
      const intent = readPaymentIntentByOutTradeNo(outTradeNo);
      if (!intent) return { intent: null, settledNow: false, account: null };
      const eventId = String(transactionId || `${intent.id}:notify`);
      if (intent.status === "paid") {
        recordPaymentEvent({ paymentIntentId: intent.id, eventType: "payment_notify", eventId, success: true, payload, headers });
        return { intent: readPaymentIntent(intent.id), settledNow: false, account: readAccount(intent.accountId) };
      }

      const now = String(paidAt || nowIso());
      db.prepare(`
        UPDATE commerce_payment_intents
        SET status = 'paid', transaction_id = ?, paid_at = ?, updated_at = ?
        WHERE id = ?
      `).run(String(transactionId || ""), now, nowIso(), intent.id);
      if (intent.kind === "physical_order") {
        const itemCount = Math.max(0, Math.trunc(Number(intent.metadata?.itemCount || 0)));
        if (itemCount > 0) {
          appendLedger(intent.accountId, itemCount * 10, {
            reason: "physical_order_reward",
            referenceType: "payment_intent_reward",
            referenceId: intent.id
          });
        }
        redeemPhysicalOrderOriginals(intent.accountId, intent.targetOrderId, now);
      }
      recordPaymentEvent({ paymentIntentId: intent.id, eventType: "payment_notify", eventId, success: true, payload, headers });
      return { intent: readPaymentIntent(intent.id), settledNow: true, account: readAccount(intent.accountId) };
    });
  }

  function debitCredits({ accountId, amount, referenceId, reason = "image_generation" }) {
    return withTransaction(db, () => appendLedger(accountId, -Math.max(0, Math.trunc(Number(amount || 0))), {
      reason,
      referenceType: "generation_session",
      referenceId: String(referenceId || "")
    }));
  }

  function redeemOriginalImage({ accountId, jobId }) {
    const safeAccountId = String(accountId || "");
    const safeJobId = String(jobId || "");
    return withTransaction(db, () => {
      const existing = readOriginalImageRedemptionStatement.get(safeAccountId, safeJobId);
      if (existing) {
        return { account: readAccount(safeAccountId), redeemedNow: false, redemptionType: String(existing.redemption_type || "") };
      }
      if (!hasPaidPhysicalOrder(safeAccountId)) {
        const error = new Error("定制订单支付成功后，才可兑换原图。");
        error.code = "ORIGINAL_REDEMPTION_REQUIRES_PAID_ORDER";
        error.publicMessage = error.message;
        throw error;
      }

      const includedOrder = db.prepare(`
        SELECT o.id
        FROM orders o
        INNER JOIN order_items i ON i.order_id = o.id
        WHERE o.account_id = ?
          AND o.payment_status = 'paid'
          AND i.job_id = ?
        LIMIT 1
      `).get(safeAccountId, safeJobId);
      const redeemedAt = nowIso();
      if (includedOrder) {
        db.prepare(`
          INSERT INTO commerce_original_image_redemptions (
            account_id, job_id, redemption_type, source_order_id, redeemed_at
          ) VALUES (?, ?, 'fridge_order', ?, ?)
        `).run(safeAccountId, safeJobId, String(includedOrder.id), redeemedAt);
        return { account: readAccount(safeAccountId), redeemedNow: true, redemptionType: "fridge_order" };
      }

      let debit;
      try {
        debit = appendLedger(safeAccountId, -1, {
          reason: "original_image_redemption",
          referenceType: "original_image_redemption",
          referenceId: safeJobId
        });
      } catch (error) {
        if (error.code === "INSUFFICIENT_CREDITS") {
          error.publicMessage = "兑换原图需要 1 点，当前点数不足。";
        }
        throw error;
      }
      db.prepare(`
        INSERT INTO commerce_original_image_redemptions (
          account_id, job_id, redemption_type, source_order_id, redeemed_at
        ) VALUES (?, ?, 'credit', '', ?)
      `).run(safeAccountId, safeJobId, redeemedAt);
      return { account: debit.account, redeemedNow: true, redemptionType: "credit" };
    });
  }

  function redeemPhysicalOrderOriginals(accountId, orderId, redeemedAt = nowIso()) {
    const order = db.prepare(`
      SELECT id FROM orders
      WHERE id = ? AND account_id = ?
      LIMIT 1
    `).get(String(orderId || ""), String(accountId || ""));
    if (!order) return 0;
    const items = db.prepare("SELECT job_id FROM order_items WHERE order_id = ?").all(String(order.id));
    const insert = db.prepare(`
      INSERT OR IGNORE INTO commerce_original_image_redemptions (
        account_id, job_id, redemption_type, source_order_id, redeemed_at
      ) VALUES (?, ?, 'fridge_order', ?, ?)
    `);
    items.forEach((item) => {
      insert.run(String(accountId || ""), String(item.job_id || ""), String(order.id), String(redeemedAt || nowIso()));
    });
    return items.length;
  }

  function grantCredits({ accountId, amount, referenceType, referenceId, reason = "promotion" }) {
    return withTransaction(db, () => appendLedger(accountId, Math.max(0, Math.trunc(Number(amount || 0))), {
      reason,
      referenceType: String(referenceType || "promotion"),
      referenceId: String(referenceId || "")
    }));
  }

  function adjustCredits({ accountId, delta, referenceId, reason, note = "" }) {
    return withTransaction(db, () => appendLedger(accountId, Math.trunc(Number(delta || 0)), {
      reason: String(reason || "admin_adjustment"),
      note: String(note || ""),
      referenceType: "admin_adjustment",
      referenceId: String(referenceId || randomUUID())
    }));
  }

  function listCreditLedger(accountId, limit = 100) {
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 100)), 1), 500);
    return db.prepare(`
      SELECT * FROM commerce_credit_ledger
      WHERE account_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(String(accountId || ""), safeLimit).map(mapLedgerRow);
  }

  function listPaymentIntents(accountId, limit = 100) {
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 100)), 1), 500);
    return db.prepare(`
      SELECT * FROM commerce_payment_intents
      WHERE account_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(String(accountId || ""), safeLimit).map(mapPaymentIntent);
  }

  function listAllPaymentIntents(limit = 200) {
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 200)), 1), 500);
    return db.prepare("SELECT * FROM commerce_payment_intents ORDER BY created_at DESC LIMIT ?")
      .all(safeLimit)
      .map(mapPaymentIntent);
  }

  function listAllCreditLedger(limit = 200) {
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 200)), 1), 500);
    return db.prepare("SELECT * FROM commerce_credit_ledger ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(safeLimit)
      .map(mapLedgerRow);
  }

  function listRegisteredUsers({ page = 1, limit = 20, search = "", status = "" } = {}) {
    const conditions = ["a.registered_at IS NOT NULL"];
    const params = {};
    const keyword = String(search || "").trim();
    if (keyword) {
      conditions.push("(a.email LIKE @search OR a.username LIKE @search)");
      params.search = `%${keyword}%`;
    }
    if (["active", "disabled"].includes(String(status || ""))) {
      conditions.push("a.account_status = @status");
      params.status = String(status);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 20)), 1), 100);
    const requestedPage = Math.max(Math.trunc(Number(page || 1)), 1);
    const total = Number(db.prepare(`SELECT COUNT(*) AS total FROM commerce_accounts a ${where}`).get(params)?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const safePage = Math.min(requestedPage, totalPages);
    const rows = db.prepare(`
      SELECT a.*, COUNT(DISTINCT v.visitor_id) AS visitor_count,
        COUNT(DISTINCT o.id) AS order_count,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_cents ELSE 0 END), 0) AS paid_total_cents
      FROM commerce_accounts a
      LEFT JOIN commerce_account_visitors v ON v.account_id = a.id
      LEFT JOIN orders o ON o.account_id = a.id
      ${where}
      GROUP BY a.id
      ORDER BY a.registered_at DESC
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit: safeLimit, offset: (safePage - 1) * safeLimit });
    return {
      total,
      page: safePage,
      limit: safeLimit,
      items: rows.map((row) => ({
        ...mapAccount(row),
        visitorCount: Number(row.visitor_count || 0),
        orderCount: Number(row.order_count || 0),
        paidTotalCents: Number(row.paid_total_cents || 0)
      }))
    };
  }

  function readRegisteredUserDetail(accountId) {
    const account = readAccount(accountId);
    if (!account?.isRegistered) return null;
    const summary = db.prepare(`
      SELECT COUNT(DISTINCT v.visitor_id) AS visitor_count,
        COUNT(DISTINCT o.id) AS order_count,
        COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_cents ELSE 0 END), 0) AS paid_total_cents
      FROM commerce_accounts a
      LEFT JOIN commerce_account_visitors v ON v.account_id = a.id
      LEFT JOIN orders o ON o.account_id = a.id
      WHERE a.id = ?
    `).get(account.id) || {};
    const orders = db.prepare(`
      SELECT id, order_no, payment_status, fulfillment_status, item_count, total_cents, paid_at, created_at
      FROM orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(account.id).map((row) => ({
      id: String(row.id || ""), orderNo: String(row.order_no || ""), paymentStatus: String(row.payment_status || ""),
      fulfillmentStatus: String(row.fulfillment_status || ""), itemCount: Number(row.item_count || 0),
      totalCents: Number(row.total_cents || 0), paidAt: row.paid_at || null, createdAt: row.created_at || null
    }));
    return {
      account,
      visitorCount: Number(summary.visitor_count || 0),
      orderCount: Number(summary.order_count || 0),
      paidTotalCents: Number(summary.paid_total_cents || 0),
      ledger: listCreditLedger(account.id, 100),
      orders
    };
  }

  return {
    createOrGetBrowserAccount,
    createOrGetWebAccount,
    createEmailVerification,
    createUserSession,
    createPaymentIntent,
    cancelPaymentIntentByOutTradeNo,
    debitCredits,
    adjustCredits,
    deleteUserSession,
    grantCredits,
    hasPaidPhysicalOrder,
    isOriginalImageRedeemed,
    linkVisitor,
    listCreditLedger,
    listAllCreditLedger,
    listAllPaymentIntents,
    listPaymentIntents,
    listRegisteredUsers,
    listVisitorIds,
    markPaymentPrepared,
    readAccount,
    readAccountByEmail,
    readAccountByOpenId,
    readAccountByUsername,
    readRegisteredUserDetail,
    readUserSession,
    readPaymentIntent,
    readPaymentIntentByOutTradeNo,
    recordPaymentEvent,
    redeemOriginalImage,
    settlePayment,
    consumeEmailVerification,
    recordAccountLogin,
    setAccountStatus,
    updateAccountPassword,
    upgradeGuestAccount
  };
}
