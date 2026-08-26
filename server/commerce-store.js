import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomInt, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const ORIGINAL_IMAGE_DOWNLOAD_UNLOCK_CENTS = 20 * 100;

function nowIso() {
  return new Date().toISOString();
}

function generateReferralShortCode() {
  // 分享链接只暴露一个易输入的六码数字，完整 token 仍只保存在数据库中以兼容旧链接。
  return String(randomInt(1_000_000)).padStart(6, "0");
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
    coinBalance: Number(row.credit_balance || 0),
    beanBalance: Number(row.bean_balance || 0),
    referralBalanceCents: Number(row.referral_balance_cents || 0),
    referralPendingCents: Number(row.referral_pending_cents || 0),
    isReferralInfluencer: String(row.referral_role || "standard") === "influencer",
    originalDownloadsUnlockedAt: row.original_downloads_unlocked_at || null,
    email: String(row.email || ""),
    username: String(row.username || ""),
    passwordHash: String(row.password_hash || ""),
    wechatNickname: String(row.wechat_nickname || ""),
    wechatAvatarUrl: String(row.wechat_avatar_url || ""),
    accountStatus: String(row.account_status || "active"),
    registeredAt: row.registered_at || null,
    lastLoginAt: row.last_login_at || null,
    isRegistered: Boolean(row.registered_at && (String(row.channel || "") === "web_wechat" || (row.email && row.password_hash))),
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
    refundedAt: row.refunded_at || null,
    userDeletedAt: row.user_deleted_at || null,
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
  let referralRates = { standardRateBps: 2000, influencerRateBps: 2000 };

  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS commerce_accounts (
      id TEXT PRIMARY KEY,
      channel TEXT NOT NULL,
      open_id TEXT NOT NULL,
      credit_balance INTEGER NOT NULL DEFAULT 0,
      bean_balance INTEGER NOT NULL DEFAULT 0,
      referral_balance_cents INTEGER NOT NULL DEFAULT 0,
      referral_pending_cents INTEGER NOT NULL DEFAULT 0,
      referral_role TEXT NOT NULL DEFAULT 'standard',
      original_downloads_unlocked_at TEXT,
      wechat_nickname TEXT NOT NULL DEFAULT '',
      wechat_avatar_url TEXT NOT NULL DEFAULT '',
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
      status TEXT NOT NULL DEFAULT 'available',
      available_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(account_id, reference_type, reference_id),
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_bean_ledger (
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

    CREATE TABLE IF NOT EXISTS commerce_referral_ledger (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      delta_cents INTEGER NOT NULL,
      balance_after_cents INTEGER NOT NULL,
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

    -- Original-image rights are granted either per shared resource or by an
    -- account's current paid total. Paid access is deliberately calculated at
    -- read time so a refunded payment cannot leave a stale global unlock.
    CREATE TABLE IF NOT EXISTS commerce_original_download_grants (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      source_share_token TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(account_id, scope, resource_id),
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    -- Below ¥20, each full yuan of effective payment unlocks one distinct
    -- original resource without requiring a share visit. A redeemed resource
    -- remains readable; only new resources consume the remaining allowance.
    CREATE TABLE IF NOT EXISTS commerce_original_download_uses (
      account_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (account_id, resource_type, resource_id),
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    -- Administrators can add or remove the non-share download allowance
    -- without changing the user's payment records.  Each new visitor's first
    -- open of a draw (小画) share link also credits +1 allowance here.
    CREATE TABLE IF NOT EXISTS commerce_original_download_allowance_adjustments (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      note TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_content_share_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      share_type TEXT NOT NULL,
      share_token TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      owner_account_id TEXT NOT NULL,
      visited_at TEXT NOT NULL,
      UNIQUE(share_type, share_token, visitor_id),
      FOREIGN KEY (owner_account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    -- A recharge refund is recorded from the administrator's wallet-adjustment
    -- screen.  Purchase payments remain paid for accounting purposes; this
    -- table deducts the matching purchase-only benefits proportionally.
    CREATE TABLE IF NOT EXISTS commerce_manual_recharge_refunds (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      currency TEXT NOT NULL CHECK(currency IN ('coin', 'bean')),
      amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
      wallet_ledger_id TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
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
      user_deleted_at TEXT,
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

    -- A redemption code can grant physical-product rights in addition to coins
    -- and beans. Keep these rights in SQLite (rather than the code JSON file)
    -- so redemption and order fulfilment can be audited independently.
    CREATE TABLE IF NOT EXISTS commerce_redemption_entitlements (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      code_id TEXT NOT NULL,
      entitlement_type TEXT NOT NULL,
      quantity_total INTEGER NOT NULL,
      quantity_remaining INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(account_id, code_id, entitlement_type),
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_redemption_entitlement_consumptions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      entitlement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      reference_id TEXT NOT NULL,
      allocation_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      UNIQUE(account_id, entitlement_type, reference_id),
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_body_book_discount_reservations (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      order_id TEXT NOT NULL UNIQUE,
      discount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved',
      expires_at TEXT,
      consumed_at TEXT,
      released_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_body_book_coupon_adjustments (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      delta_cents INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_fridge_coin_discount_reservations (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      order_id TEXT NOT NULL UNIQUE,
      discount_cents INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'reserved',
      expires_at TEXT,
      consumed_at TEXT,
      released_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
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

    CREATE TABLE IF NOT EXISTS commerce_referral_links (
      token TEXT PRIMARY KEY,
      short_code TEXT UNIQUE,
      referrer_account_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (referrer_account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS commerce_referrals (
      invitee_account_id TEXT PRIMARY KEY,
      referrer_account_id TEXT NOT NULL,
      referral_token TEXT NOT NULL,
      captured_at TEXT NOT NULL,
      registered_at TEXT,
      registration_rewarded_at TEXT,
      rewarded_payment_intent_id TEXT UNIQUE,
      rewarded_at TEXT,
      FOREIGN KEY (invitee_account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (referrer_account_id) REFERENCES commerce_accounts(id) ON DELETE CASCADE,
      FOREIGN KEY (referral_token) REFERENCES commerce_referral_links(token) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS commerce_referral_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referral_token TEXT NOT NULL,
      visitor_id TEXT NOT NULL,
      visit_day TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(referral_token, visitor_id, visit_day),
      FOREIGN KEY (referral_token) REFERENCES commerce_referral_links(token) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_commerce_account_visitors_visitor ON commerce_account_visitors(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_commerce_payment_intents_account ON commerce_payment_intents(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_payment_intents_transaction ON commerce_payment_intents(transaction_id);
    CREATE INDEX IF NOT EXISTS idx_commerce_redemption_entitlements_account ON commerce_redemption_entitlements(account_id, entitlement_type, created_at);
    CREATE INDEX IF NOT EXISTS idx_commerce_redemption_consumptions_account ON commerce_redemption_entitlement_consumptions(account_id, entitlement_type, reference_id);
    CREATE INDEX IF NOT EXISTS idx_commerce_body_book_discount_reservations_account ON commerce_body_book_discount_reservations(account_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_commerce_body_book_coupon_adjustments_account ON commerce_body_book_coupon_adjustments(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_fridge_coin_discount_reservations_account ON commerce_fridge_coin_discount_reservations(account_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_commerce_credit_ledger_account ON commerce_credit_ledger(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_bean_ledger_account ON commerce_bean_ledger(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_referral_ledger_account ON commerce_referral_ledger(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_original_image_redemptions_order ON commerce_original_image_redemptions(source_order_id);
    CREATE INDEX IF NOT EXISTS idx_commerce_original_download_grants_account ON commerce_original_download_grants(account_id, scope, resource_id);
    CREATE INDEX IF NOT EXISTS idx_commerce_original_download_uses_account ON commerce_original_download_uses(account_id, resource_type);
    CREATE INDEX IF NOT EXISTS idx_commerce_original_download_allowance_adjustments_account ON commerce_original_download_allowance_adjustments(account_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_content_share_visits_token ON commerce_content_share_visits(share_type, share_token);
    CREATE INDEX IF NOT EXISTS idx_commerce_content_share_visits_owner_visitor ON commerce_content_share_visits(owner_account_id, visitor_id, share_type);
    CREATE INDEX IF NOT EXISTS idx_commerce_manual_recharge_refunds_account ON commerce_manual_recharge_refunds(account_id, currency, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_user_sessions_account ON commerce_user_sessions(account_id, expires_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_email_verifications_lookup ON commerce_email_verifications(email, purpose, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_referrals_referrer ON commerce_referrals(referrer_account_id, captured_at DESC);
    CREATE INDEX IF NOT EXISTS idx_commerce_referrals_reward ON commerce_referrals(rewarded_payment_intent_id);
    CREATE INDEX IF NOT EXISTS idx_commerce_referral_visits_token_day ON commerce_referral_visits(referral_token, visit_day DESC);
  `);

  const accountColumns = db.prepare("PRAGMA table_info(commerce_accounts)").all();
  const ensureAccountColumn = (name, definition) => {
    if (!accountColumns.some((column) => String(column.name || "") === name)) {
      db.exec(`ALTER TABLE commerce_accounts ADD COLUMN ${definition}`);
      return true;
    }
    return false;
  };
  ensureAccountColumn("email", "email TEXT NOT NULL DEFAULT ''");
  ensureAccountColumn("username", "username TEXT NOT NULL DEFAULT ''");
  ensureAccountColumn("password_hash", "password_hash TEXT NOT NULL DEFAULT ''");
  ensureAccountColumn("wechat_nickname", "wechat_nickname TEXT NOT NULL DEFAULT ''");
  ensureAccountColumn("wechat_avatar_url", "wechat_avatar_url TEXT NOT NULL DEFAULT ''");
  ensureAccountColumn("account_status", "account_status TEXT NOT NULL DEFAULT 'active'");
  ensureAccountColumn("registered_at", "registered_at TEXT");
  ensureAccountColumn("last_login_at", "last_login_at TEXT");
  const addedBeanBalance = ensureAccountColumn("bean_balance", "bean_balance INTEGER NOT NULL DEFAULT 0");
  ensureAccountColumn("referral_balance_cents", "referral_balance_cents INTEGER NOT NULL DEFAULT 0");
  const addedReferralPendingBalance = ensureAccountColumn("referral_pending_cents", "referral_pending_cents INTEGER NOT NULL DEFAULT 0");
  ensureAccountColumn("referral_role", "referral_role TEXT NOT NULL DEFAULT 'standard'");
  const paymentIntentColumns = db.prepare("PRAGMA table_info(commerce_payment_intents)").all();
  if (!paymentIntentColumns.some((column) => String(column.name || "") === "user_deleted_at")) {
    db.exec("ALTER TABLE commerce_payment_intents ADD COLUMN user_deleted_at TEXT");
  }
  if (!paymentIntentColumns.some((column) => String(column.name || "") === "refunded_at")) {
    db.exec("ALTER TABLE commerce_payment_intents ADD COLUMN refunded_at TEXT");
  }
  const ledgerColumns = db.prepare("PRAGMA table_info(commerce_credit_ledger)").all();
  if (!ledgerColumns.some((column) => String(column.name || "") === "note")) {
    db.exec("ALTER TABLE commerce_credit_ledger ADD COLUMN note TEXT NOT NULL DEFAULT ''");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_accounts_email_unique ON commerce_accounts(email) WHERE email != ''");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_accounts_username_unique ON commerce_accounts(username) WHERE username != ''");
  const referralLinkColumns = db.prepare("PRAGMA table_info(commerce_referral_links)").all();
  if (!referralLinkColumns.some((column) => String(column.name || "") === "short_code")) {
    db.exec("ALTER TABLE commerce_referral_links ADD COLUMN short_code TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_commerce_referral_links_short_code_unique ON commerce_referral_links(short_code) WHERE short_code IS NOT NULL");
  const referralColumns = db.prepare("PRAGMA table_info(commerce_referrals)").all();
  const addedRegistrationRewardedAt = !referralColumns.some((column) => String(column.name || "") === "registration_rewarded_at");
  if (addedRegistrationRewardedAt) {
    db.exec("ALTER TABLE commerce_referrals ADD COLUMN registration_rewarded_at TEXT");
    // Existing registrations predate the new programme and must not be rewarded retroactively.
    db.exec("UPDATE commerce_referrals SET registration_rewarded_at = registered_at WHERE registered_at IS NOT NULL");
  }
  const referralLedgerColumns = db.prepare("PRAGMA table_info(commerce_referral_ledger)").all();
  const addedReferralLedgerStatus = !referralLedgerColumns.some((column) => String(column.name || "") === "status");
  if (addedReferralLedgerStatus) {
    db.exec("ALTER TABLE commerce_referral_ledger ADD COLUMN status TEXT NOT NULL DEFAULT 'available'");
    db.exec("ALTER TABLE commerce_referral_ledger ADD COLUMN available_at TEXT");
    // Recommendation rewards created before the staged-release rule are moved
    // into their correct state based on the associated order type/status.
    db.exec(`
      UPDATE commerce_referral_ledger
      SET status = CASE
        WHEN reference_type = 'payment_intent' AND EXISTS (
          SELECT 1 FROM commerce_payment_intents p
          WHERE p.id = commerce_referral_ledger.reference_id
            AND p.kind IN ('physical_order', 'body_book_order')
        ) THEN 'pending'
        ELSE 'available'
      END
    `);
    db.exec("UPDATE commerce_referral_ledger SET available_at = CASE WHEN status = 'available' THEN COALESCE(available_at, created_at) ELSE NULL END");
  }
  if (addedReferralPendingBalance || addedReferralLedgerStatus) {
    db.exec(`
      UPDATE commerce_accounts
      SET referral_balance_cents = COALESCE((
            SELECT SUM(delta_cents) FROM commerce_referral_ledger l
            WHERE l.account_id = commerce_accounts.id AND l.status = 'available'
          ), 0),
          referral_pending_cents = COALESCE((
            SELECT SUM(delta_cents) FROM commerce_referral_ledger l
            WHERE l.account_id = commerce_accounts.id AND l.status = 'pending'
          ), 0)
    `);
  }

  if (addedBeanBalance) {
    withTransaction(db, () => {
      const now = nowIso();
      const accounts = db.prepare("SELECT id FROM commerce_accounts").all();
      const update = db.prepare("UPDATE commerce_accounts SET bean_balance = 10, updated_at = ? WHERE id = ?");
      const insert = db.prepare(`
        INSERT OR IGNORE INTO commerce_bean_ledger (
          id, account_id, delta, balance_after, reason, reference_type, reference_id, note, created_at
        ) VALUES (?, ?, 10, 10, 'legacy_bean_migration', 'account', ?, '历史账户豆豆补发', ?)
      `);
      accounts.forEach((account) => {
        update.run(now, account.id);
        insert.run(randomUUID(), account.id, account.id, now);
      });
    });
  }

  const readAccountByIdStatement = db.prepare("SELECT * FROM commerce_accounts WHERE id = ?");
  const readAccountByOpenIdStatement = db.prepare("SELECT * FROM commerce_accounts WHERE channel = ? AND open_id = ?");
  const readAccountByEmailStatement = db.prepare("SELECT * FROM commerce_accounts WHERE email = ?");
  const readAccountByUsernameStatement = db.prepare("SELECT * FROM commerce_accounts WHERE username = ?");
  const readIntentByIdStatement = db.prepare("SELECT * FROM commerce_payment_intents WHERE id = ?");
  const readIntentByTradeNoStatement = db.prepare("SELECT * FROM commerce_payment_intents WHERE out_trade_no = ?");
  const readBodyBookDiscountReservationStatement = db.prepare("SELECT * FROM commerce_body_book_discount_reservations WHERE order_id = ?");
  const readFridgeCoinDiscountReservationStatement = db.prepare("SELECT * FROM commerce_fridge_coin_discount_reservations WHERE order_id = ?");
  const readReferralLinkByAccountStatement = db.prepare("SELECT * FROM commerce_referral_links WHERE referrer_account_id = ?");
  const readReferralLinkByTokenStatement = db.prepare("SELECT * FROM commerce_referral_links WHERE token = ?");
  const readReferralLinkByShortCodeStatement = db.prepare("SELECT * FROM commerce_referral_links WHERE short_code = ?");
  const readReferralByInviteeStatement = db.prepare("SELECT * FROM commerce_referrals WHERE invitee_account_id = ?");
  const readOriginalImageRedemptionStatement = db.prepare(`
    SELECT * FROM commerce_original_image_redemptions
    WHERE account_id = ? AND job_id = ?
  `);
  const readPaidPhysicalOrderStatement = db.prepare(`
    SELECT id FROM commerce_payment_intents
    WHERE account_id = ? AND kind = 'physical_order' AND status = 'paid'
    LIMIT 1
  `);

  function createUniqueReferralShortCode() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const shortCode = generateReferralShortCode();
      if (!readReferralLinkByShortCodeStatement.get(shortCode)) return shortCode;
    }
    throw new Error("无法生成唯一的邀请链接身份码。");
  }

  const referralLinksMissingShortCode = db.prepare(`
    SELECT token FROM commerce_referral_links
    WHERE short_code IS NULL OR short_code = ''
  `).all();
  if (referralLinksMissingShortCode.length) {
    const assignShortCode = db.prepare("UPDATE commerce_referral_links SET short_code = ?, updated_at = ? WHERE token = ?");
    withTransaction(db, () => {
      referralLinksMissingShortCode.forEach((link) => {
        assignShortCode.run(createUniqueReferralShortCode(), nowIso(), String(link.token || ""));
      });
    });
  }

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

  function getPaidCoinPurchaseCents(accountId) {
    const paidCents = Number(db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM commerce_payment_intents
      WHERE account_id = ? AND kind = 'coin_purchase' AND status = 'paid'
    `).get(String(accountId || ""))?.total || 0);
    return Math.max(0, paidCents - getManualRechargeRefundCents(accountId, "coin"));
  }

  function getManualRechargeRefundCents(accountId, currency = "") {
    const safeCurrency = String(currency || "");
    const condition = safeCurrency ? " AND currency = ?" : "";
    const params = safeCurrency ? [String(accountId || ""), safeCurrency] : [String(accountId || "")];
    return Number(db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM commerce_manual_recharge_refunds
      WHERE account_id = ?${condition}
    `).get(...params)?.total || 0);
  }

  function getPaidOriginalDownloadCents(accountId) {
    const totals = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN kind IN ('physical_order', 'body_book_order') THEN amount_cents ELSE 0 END), 0) AS physical_total,
        COALESCE(SUM(CASE WHEN kind = 'coin_purchase' THEN amount_cents ELSE 0 END), 0) AS coin_total,
        COALESCE(SUM(CASE WHEN kind = 'bean_purchase' THEN amount_cents ELSE 0 END), 0) AS bean_total
      FROM commerce_payment_intents
      WHERE account_id = ?
        AND kind IN ('physical_order', 'body_book_order', 'coin_purchase', 'bean_purchase')
        AND status = 'paid'
    `).get(String(accountId || "")) || {};
    return Math.max(0, Number(totals.physical_total || 0))
      + Math.max(0, Number(totals.coin_total || 0) - getManualRechargeRefundCents(accountId, "coin"))
      + Math.max(0, Number(totals.bean_total || 0) - getManualRechargeRefundCents(accountId, "bean"));
  }

  function getPaidVirtualDownloadAllowanceCount(accountId, currency) {
    const kind = currency === "bean" ? "bean_purchase" : "coin_purchase";
    const purchasedUnits = Number(db.prepare(`
      SELECT COALESCE(SUM(credit_amount), 0) AS total
      FROM commerce_payment_intents
      WHERE account_id = ? AND kind = ? AND status = 'paid'
    `).get(String(accountId || ""), kind)?.total || 0);
    // Manual recharge refunds are stored as refunded wallet quantity × 100.
    const refundedUnits = Math.floor(getManualRechargeRefundCents(accountId, currency) / 100);
    return Math.max(0, purchasedUnits - refundedUnits);
  }

  function hasOriginalImageDownloadAccess(accountId) {
    return getPaidOriginalDownloadCents(accountId) >= ORIGINAL_IMAGE_DOWNLOAD_UNLOCK_CENTS;
  }

  function getOriginalDownloadAllowanceAdjustment(accountId) {
    return Number(db.prepare(`
      SELECT COALESCE(SUM(delta), 0) AS total
      FROM commerce_original_download_allowance_adjustments
      WHERE account_id = ?
    `).get(String(accountId || ""))?.total || 0);
  }

  function getOriginalDownloadAllowance(accountId) {
    const paidCents = getPaidOriginalDownloadCents(accountId);
    if (paidCents >= ORIGINAL_IMAGE_DOWNLOAD_UNLOCK_CENTS) {
      return { paidCents, unlimited: true, total: null, used: 0, remaining: null, adjustment: getOriginalDownloadAllowanceAdjustment(accountId) };
    }
    const adjustment = getOriginalDownloadAllowanceAdjustment(accountId);
    const physicalCents = Number(db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM commerce_payment_intents
      WHERE account_id = ?
        AND kind IN ('physical_order', 'body_book_order')
        AND status = 'paid'
    `).get(String(accountId || ""))?.total || 0);
    const total = Math.max(0,
      Math.floor(physicalCents / 100)
      + getPaidVirtualDownloadAllowanceCount(accountId, "coin")
      + getPaidVirtualDownloadAllowanceCount(accountId, "bean")
      + adjustment
    );
    const used = Number(db.prepare(`
      SELECT COUNT(*) AS total FROM commerce_original_download_uses WHERE account_id = ?
    `).get(String(accountId || ""))?.total || 0);
    return { paidCents, unlimited: false, total, used, remaining: Math.max(0, total - used), adjustment };
  }

  function hasOriginalDownloadGrant(accountId, scope, resourceId) {
    return Boolean(db.prepare(`
      SELECT 1 FROM commerce_original_download_grants
      WHERE account_id = ? AND scope = ? AND resource_id = ?
      LIMIT 1
    `).get(String(accountId || ""), String(scope || ""), String(resourceId || "")));
  }

  function buildOriginalDownloadResourceId(type, resourceId, pageKey = "") {
    return type === "book_page"
      ? `${String(resourceId || "")}:${String(pageKey || "")}`
      : String(resourceId || "");
  }

  function hasOriginalDownloadUse(accountId, resourceType, resourceId) {
    const allowance = getOriginalDownloadAllowance(accountId);
    const allowedUseCount = allowance.unlimited ? Number.MAX_SAFE_INTEGER : Math.max(0, Number(allowance.total || 0));
    if (allowedUseCount <= 0) return false;
    return Boolean(db.prepare(`
      SELECT 1
      FROM commerce_original_download_uses target
      WHERE target.account_id = ? AND target.resource_type = ? AND target.resource_id = ?
        AND (
          SELECT COUNT(*)
          FROM commerce_original_download_uses earlier
          WHERE earlier.account_id = target.account_id AND earlier.rowid <= target.rowid
        ) <= ?
      LIMIT 1
    `).get(String(accountId || ""), String(resourceType || ""), String(resourceId || ""), allowedUseCount));
  }

  function canDownloadBookOriginal(accountId, projectId, pageKey = "") {
    const resourceId = buildOriginalDownloadResourceId("book_page", projectId, pageKey);
    return hasOriginalImageDownloadAccess(accountId)
      || hasOriginalDownloadGrant(accountId, "book_project_share", projectId)
      || hasOriginalDownloadUse(accountId, "book_page", resourceId);
  }

  function canDownloadDrawOriginal(accountId, jobId) {
    return hasOriginalImageDownloadAccess(accountId)
      || hasOriginalDownloadGrant(accountId, "draw_image_share", jobId)
      || hasOriginalDownloadUse(accountId, "draw_image", jobId);
  }

  function authorizeOriginalDownload({ accountId, resourceType, resourceId, shareScope = "", shareResourceId = "" }) {
    const safeAccountId = String(accountId || "");
    const safeResourceType = String(resourceType || "");
    const safeResourceId = String(resourceId || "");
    if (!safeAccountId || !["book_page", "draw_image"].includes(safeResourceType) || !safeResourceId) {
      throw new Error("Invalid original download resource.");
    }
    return withTransaction(db, () => {
      if (hasOriginalImageDownloadAccess(safeAccountId)) return { allowed: true, source: "paid_unlimited", usedNow: false };
      if (shareScope && hasOriginalDownloadGrant(safeAccountId, shareScope, shareResourceId)) {
        return { allowed: true, source: "share", usedNow: false };
      }
      if (hasOriginalDownloadUse(safeAccountId, safeResourceType, safeResourceId)) {
        return { allowed: true, source: "paid_allowance", usedNow: false };
      }
      const allowance = getOriginalDownloadAllowance(safeAccountId);
      if (allowance.remaining <= 0) return { allowed: false, source: "none", usedNow: false, allowance };
      db.prepare(`
        INSERT INTO commerce_original_download_uses (account_id, resource_type, resource_id, created_at)
        VALUES (?, ?, ?, ?)
      `).run(safeAccountId, safeResourceType, safeResourceId, nowIso());
      return { allowed: true, source: "paid_allowance", usedNow: true, allowance: getOriginalDownloadAllowance(safeAccountId) };
    });
  }

  function authorizeBookOriginalDownload(accountId, projectId, pageKey) {
    return authorizeOriginalDownload({
      accountId,
      resourceType: "book_page",
      resourceId: buildOriginalDownloadResourceId("book_page", projectId, pageKey),
      shareScope: "book_project_share",
      shareResourceId: projectId
    });
  }

  function authorizeDrawOriginalDownload(accountId, jobId) {
    return authorizeOriginalDownload({
      accountId,
      resourceType: "draw_image",
      resourceId: String(jobId || ""),
      shareScope: "draw_image_share",
      shareResourceId: jobId
    });
  }

  function grantOriginalDownload({ accountId, scope, resourceId, sourceShareToken = "" }) {
    const safeAccountId = String(accountId || "");
    const safeScope = String(scope || "");
    const safeResourceId = String(resourceId || "");
    if (!safeAccountId || !["book_project_share", "draw_image_share"].includes(safeScope) || !safeResourceId) {
      throw new Error("Invalid original download grant.");
    }
    const result = db.prepare(`
      INSERT OR IGNORE INTO commerce_original_download_grants
        (id, account_id, scope, resource_id, source_share_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), safeAccountId, safeScope, safeResourceId, String(sourceShareToken || ""), nowIso());
    return Number(result.changes || 0) > 0;
  }

  function recordContentShareVisit({ shareType, shareToken, visitorId, ownerAccountId, resourceId, viewerAccountId = "" }) {
    const safeShareType = String(shareType || "");
    const safeToken = String(shareToken || "").trim();
    const safeVisitorId = String(visitorId || "").trim();
    const safeOwnerAccountId = String(ownerAccountId || "").trim();
    const safeResourceId = String(resourceId || "").trim();
    const scope = safeShareType === "book" ? "book_project_share" : safeShareType === "draw" ? "draw_image_share" : "";
    if (!scope || !safeToken || !safeVisitorId || !safeOwnerAccountId || !safeResourceId) {
      return { recorded: false, granted: false, reason: "invalid" };
    }
    if (safeOwnerAccountId === String(viewerAccountId || "")) {
      return { recorded: false, granted: false, reason: "owner" };
    }
    return withTransaction(db, () => {
      const ownerVisitor = db.prepare(`
        SELECT 1 FROM commerce_account_visitors WHERE account_id = ? AND visitor_id = ? LIMIT 1
      `).get(safeOwnerAccountId, safeVisitorId);
      if (ownerVisitor) return { recorded: false, granted: false, reason: "owner" };
      // 小画次数型权益按“人”去重：同一访客对同一分享者（跨其所有小画分享链接）
      // 只计 1 次额度。需在写入本次访问前判断，否则会匹配到刚插入的记录。
      const priorDrawVisitByVisitor = safeShareType === "draw"
        ? Boolean(db.prepare(`
            SELECT 1 FROM commerce_content_share_visits
            WHERE share_type = 'draw' AND owner_account_id = ? AND visitor_id = ?
            LIMIT 1
          `).get(safeOwnerAccountId, safeVisitorId))
        : false;
      const result = db.prepare(`
        INSERT OR IGNORE INTO commerce_content_share_visits
          (share_type, share_token, visitor_id, owner_account_id, visited_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(safeShareType, safeToken, safeVisitorId, safeOwnerAccountId, nowIso());
      if (Number(result.changes || 0) <= 0) return { recorded: false, granted: false, reason: "duplicate" };
      if (safeShareType === "draw") {
        if (priorDrawVisitByVisitor) {
          // 该访客已为分享者计过次数：仅记录本次访问，不再发放额度。
          return { recorded: true, granted: false, reason: "already_credited" };
        }
        // 小画分享是次数型权益：每位新访客首次打开分享者的任一小画分享链接，
        // 就给分享者账户加 1 次可下载任意原图的免分享额度。
        // 已在事务内，直接写额度调整表（adjustOriginalDownloadAllowance 自带事务，不可嵌套调用）。
        db.prepare(`
          INSERT INTO commerce_original_download_allowance_adjustments (id, account_id, delta, note, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          randomUUID(),
          safeOwnerAccountId,
          1,
          `小画分享被新访客打开 +1 次免分享下载（分享码 ${safeToken.slice(0, 8)}）`,
          nowIso()
        );
        return { recorded: true, granted: true, reason: "recorded" };
      }
      // 认知书分享保持原逻辑：首位新访客打开后解锁本工程全部原图。
      return {
        recorded: true,
        granted: grantOriginalDownload({
          accountId: safeOwnerAccountId,
          scope,
          resourceId: safeResourceId,
          sourceShareToken: safeToken
        }),
        reason: "recorded"
      };
    });
  }

  function releaseExpiredBodyBookDiscountReservations(referenceTime = nowIso()) {
    const now = String(referenceTime || nowIso());
    db.prepare(`
      UPDATE commerce_body_book_discount_reservations
      SET status = 'released', released_at = COALESCE(released_at, ?), updated_at = ?
      WHERE status = 'reserved' AND expires_at IS NOT NULL AND expires_at <= ?
    `).run(now, now, now);
  }

  function releaseExpiredFridgeCoinDiscountReservations(referenceTime = nowIso()) {
    const now = String(referenceTime || nowIso());
    db.prepare(`
      UPDATE commerce_fridge_coin_discount_reservations
      SET status = 'released', released_at = COALESCE(released_at, ?), updated_at = ?
      WHERE status = 'reserved' AND expires_at IS NOT NULL AND expires_at <= ?
    `).run(now, now, now);
  }

  function getBodyBookDiscountSummary(accountId) {
    const safeAccountId = String(accountId || "");
    if (!readAccount(safeAccountId)) {
      return { purchasedCents: 0, couponCents: 0, reservedCents: 0, usedCents: 0, availableCents: 0 };
    }
    releaseExpiredBodyBookDiscountReservations();
    const paidPurchaseCents = Number(db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM commerce_payment_intents
      WHERE account_id = ? AND kind = 'bean_purchase' AND status = 'paid'
    `).get(safeAccountId)?.total || 0);
    const refundedCents = getManualRechargeRefundCents(safeAccountId, "bean");
    const purchasedCents = Math.max(0, paidPurchaseCents - refundedCents);
    const couponCents = getBodyBookCouponBalance(safeAccountId);
    const reservation = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'reserved' THEN discount_cents ELSE 0 END), 0) AS reserved_cents,
        COALESCE(SUM(CASE WHEN status = 'consumed' THEN discount_cents ELSE 0 END), 0) AS used_cents
      FROM commerce_body_book_discount_reservations
      WHERE account_id = ?
    `).get(safeAccountId) || {};
    const reservedCents = Number(reservation.reserved_cents || 0);
    const usedCents = Number(reservation.used_cents || 0);
    return {
      purchasedCents,
      couponCents,
      refundedCents,
      reservedCents,
      usedCents,
      availableCents: Math.max(0, purchasedCents + couponCents - reservedCents - usedCents)
    };
  }

  function getBodyBookCouponBalance(accountId) {
    const safeAccountId = String(accountId || "");
    return Math.max(0, Number(db.prepare("SELECT COALESCE(SUM(delta_cents), 0) AS total FROM commerce_body_book_coupon_adjustments WHERE account_id = ?").get(safeAccountId)?.total || 0));
  }

  function adjustBodyBookCoupon({ accountId, deltaCents, note = "" }) {
    const safeAccountId = String(accountId || "");
    const safeDelta = Math.trunc(Number(deltaCents || 0));
    const safeNote = String(note || "").trim();
    if (!safeAccountId || !safeDelta || !safeNote) throw new Error("Invalid body book coupon adjustment.");
    return withTransaction(db, () => {
      const account = readAccount(safeAccountId);
      if (!account) throw new Error("Account not found.");
      if (safeDelta < 0 && getBodyBookCouponBalance(safeAccountId) < Math.abs(safeDelta)) {
        const error = new Error("实体优惠券余额不足。");
        error.code = "INSUFFICIENT_BODY_BOOK_COUPON";
        throw error;
      }
      db.prepare("INSERT INTO commerce_body_book_coupon_adjustments (id, account_id, delta_cents, note, created_at) VALUES (?, ?, ?, ?, ?)").run(randomUUID(), safeAccountId, safeDelta, safeNote.slice(0, 300), nowIso());
      return { account, balanceCents: getBodyBookCouponBalance(safeAccountId) };
    });
  }

  function reserveBodyBookDiscount({ accountId, orderId, orderTotalCents, maxDiscountCents = 4000, expiresAt }) {
    return withTransaction(db, () => {
      const safeAccountId = String(accountId || "");
      const safeOrderId = String(orderId || "");
      const existing = readBodyBookDiscountReservationStatement.get(safeOrderId);
      if (existing) {
        return {
          discountCents: Math.max(0, Number(existing.discount_cents || 0)),
          summary: getBodyBookDiscountSummary(safeAccountId)
        };
      }
      const summary = getBodyBookDiscountSummary(safeAccountId);
      const grossCents = Math.max(0, Math.trunc(Number(orderTotalCents || 0)));
      const discountCents = Math.min(Math.max(0, Math.trunc(Number(maxDiscountCents || 0))), grossCents, summary.availableCents);
      const now = nowIso();
      db.prepare(`
        INSERT INTO commerce_body_book_discount_reservations (
          id, account_id, order_id, discount_cents, status, expires_at, consumed_at, released_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'reserved', ?, NULL, NULL, ?, ?)
      `).run(randomUUID(), safeAccountId, safeOrderId, discountCents, expiresAt || null, now, now);
      return {
        discountCents,
        summary: {
          ...summary,
          reservedCents: summary.reservedCents + discountCents,
          availableCents: Math.max(0, summary.availableCents - discountCents)
        }
      };
    });
  }

  function releaseBodyBookDiscountReservation(orderId) {
    return withTransaction(db, () => {
      const reservation = readBodyBookDiscountReservationStatement.get(String(orderId || ""));
      if (!reservation || String(reservation.status || "") !== "reserved") return false;
      const now = nowIso();
      db.prepare(`
        UPDATE commerce_body_book_discount_reservations
        SET status = 'released', released_at = ?, updated_at = ?
        WHERE order_id = ? AND status = 'reserved'
      `).run(now, now, String(orderId || ""));
      return true;
    });
  }

  function consumeBodyBookDiscountReservation(orderId, consumedAt = nowIso()) {
    return withTransaction(db, () => {
      const reservation = readBodyBookDiscountReservationStatement.get(String(orderId || ""));
      if (!reservation || String(reservation.status || "") === "consumed") return Boolean(reservation);
      if (String(reservation.status || "") !== "reserved") return false;
      const now = String(consumedAt || nowIso());
      db.prepare(`
        UPDATE commerce_body_book_discount_reservations
        SET status = 'consumed', consumed_at = ?, updated_at = ?
        WHERE order_id = ? AND status = 'reserved'
      `).run(now, nowIso(), String(orderId || ""));
      return true;
    });
  }

  function getFridgeCoinDiscountSummary(accountId) {
    const safeAccountId = String(accountId || "");
    if (!readAccount(safeAccountId)) {
      return { purchasedCents: 0, reservedCents: 0, usedCents: 0, availableCents: 0 };
    }
    releaseExpiredFridgeCoinDiscountReservations();
    const paidPurchaseCents = Number(db.prepare(`
      SELECT COALESCE(SUM(amount_cents), 0) AS total
      FROM commerce_payment_intents
      WHERE account_id = ? AND kind = 'coin_purchase' AND status = 'paid'
    `).get(safeAccountId)?.total || 0);
    const refundedCents = getManualRechargeRefundCents(safeAccountId, "coin");
    const purchasedCents = Math.max(0, paidPurchaseCents - refundedCents);
    const reservation = db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN status = 'reserved' THEN discount_cents ELSE 0 END), 0) AS reserved_cents,
        COALESCE(SUM(CASE WHEN status = 'consumed' THEN discount_cents ELSE 0 END), 0) AS used_cents
      FROM commerce_fridge_coin_discount_reservations
      WHERE account_id = ?
    `).get(safeAccountId) || {};
    const reservedCents = Number(reservation.reserved_cents || 0);
    const usedCents = Number(reservation.used_cents || 0);
    return {
      purchasedCents,
      refundedCents,
      reservedCents,
      usedCents,
      availableCents: Math.max(0, purchasedCents - reservedCents - usedCents)
    };
  }

  function reserveFridgeCoinDiscount({ accountId, orderId, itemCount, subtotalCents, expiresAt }) {
    return withTransaction(db, () => {
      const safeAccountId = String(accountId || "");
      const safeOrderId = String(orderId || "");
      const existing = readFridgeCoinDiscountReservationStatement.get(safeOrderId);
      if (existing) {
        return {
          discountCents: Math.max(0, Number(existing.discount_cents || 0)),
          summary: getFridgeCoinDiscountSummary(safeAccountId)
        };
      }
      const summary = getFridgeCoinDiscountSummary(safeAccountId);
      const itemLimitCents = Math.max(0, Math.trunc(Number(itemCount || 0))) * 1500;
      const safeSubtotalCents = Math.max(0, Math.trunc(Number(subtotalCents || 0)));
      const discountCents = Math.min(itemLimitCents, safeSubtotalCents, summary.availableCents);
      const now = nowIso();
      db.prepare(`
        INSERT INTO commerce_fridge_coin_discount_reservations (
          id, account_id, order_id, discount_cents, status, expires_at, consumed_at, released_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 'reserved', ?, NULL, NULL, ?, ?)
      `).run(randomUUID(), safeAccountId, safeOrderId, discountCents, expiresAt || null, now, now);
      return {
        discountCents,
        summary: {
          ...summary,
          reservedCents: summary.reservedCents + discountCents,
          availableCents: Math.max(0, summary.availableCents - discountCents)
        }
      };
    });
  }

  function releaseFridgeCoinDiscountReservation(orderId) {
    return withTransaction(db, () => {
      const reservation = readFridgeCoinDiscountReservationStatement.get(String(orderId || ""));
      if (!reservation || String(reservation.status || "") !== "reserved") return false;
      const now = nowIso();
      db.prepare(`
        UPDATE commerce_fridge_coin_discount_reservations
        SET status = 'released', released_at = ?, updated_at = ?
        WHERE order_id = ? AND status = 'reserved'
      `).run(now, now, String(orderId || ""));
      return true;
    });
  }

  function consumeFridgeCoinDiscountReservation(orderId, consumedAt = nowIso()) {
    return withTransaction(db, () => {
      const reservation = readFridgeCoinDiscountReservationStatement.get(String(orderId || ""));
      if (!reservation || String(reservation.status || "") === "consumed") return Boolean(reservation);
      if (String(reservation.status || "") !== "reserved") return false;
      const now = String(consumedAt || nowIso());
      db.prepare(`
        UPDATE commerce_fridge_coin_discount_reservations
        SET status = 'consumed', consumed_at = ?, updated_at = ?
        WHERE order_id = ? AND status = 'reserved'
      `).run(now, nowIso(), String(orderId || ""));
      return true;
    });
  }

  function getOrCreateReferralLink(accountId) {
    return withTransaction(db, () => {
      const account = readAccount(accountId);
      if (!account?.isRegistered) {
        const error = new Error("请先完成登录注册后再邀请新用户。");
        error.code = "REFERRAL_REQUIRES_REGISTERED_ACCOUNT";
        throw error;
      }
      const existing = readReferralLinkByAccountStatement.get(account.id);
      if (existing) {
        const shortCode = String(existing.short_code || createUniqueReferralShortCode());
        if (!existing.short_code) {
          db.prepare("UPDATE commerce_referral_links SET short_code = ?, updated_at = ? WHERE token = ?")
            .run(shortCode, nowIso(), String(existing.token));
        }
        return { token: shortCode, referrerAccountId: account.id };
      }
      const token = randomUUID().replace(/-/g, "");
      const shortCode = createUniqueReferralShortCode();
      const now = nowIso();
      db.prepare(`
        INSERT INTO commerce_referral_links (token, short_code, referrer_account_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(token, shortCode, account.id, now, now);
      return { token: shortCode, referrerAccountId: account.id };
    });
  }

  function resolveReferralLink(token) {
    const safeToken = String(token || "").trim();
    if (!safeToken) return null;
    const link = readReferralLinkByShortCodeStatement.get(safeToken) || readReferralLinkByTokenStatement.get(safeToken);
    if (!link) return null;
    const referrer = readAccount(String(link.referrer_account_id || ""));
    if (!referrer?.isRegistered) return null;
    return { token: String(link.token || ""), referrerAccountId: referrer.id };
  }

  function captureReferral({ token, inviteeAccountId, allowRegistered = false }) {
    const safeToken = String(token || "").trim();
    return withTransaction(db, () => {
      const invitee = readAccount(inviteeAccountId);
      if (!safeToken || !invitee || (invitee.isRegistered && !allowRegistered)) return { captured: false, reason: "ineligible" };
      const existing = readReferralByInviteeStatement.get(invitee.id);
      if (existing) return { captured: false, reason: "already_bound" };
      const link = readReferralLinkByShortCodeStatement.get(safeToken) || readReferralLinkByTokenStatement.get(safeToken);
      if (!link || String(link.referrer_account_id || "") === invitee.id) return { captured: false, reason: "invalid" };
      const referrer = readAccount(String(link.referrer_account_id || ""));
      if (!referrer?.isRegistered) return { captured: false, reason: "invalid" };
      const now = nowIso();
      db.prepare(`
        INSERT INTO commerce_referrals (
          invitee_account_id, referrer_account_id, referral_token, captured_at, registered_at, rewarded_payment_intent_id, rewarded_at
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL)
      `).run(invitee.id, referrer.id, String(link.token), now, invitee.isRegistered ? now : null);
      return { captured: true, reason: "captured" };
    });
  }

  function getChinaVisitDay(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(date)
      .replace(/\//g, "-");
  }

  function recordReferralVisit({ token, visitorId, accountId = "" }) {
    const safeToken = String(token || "").trim();
    const safeVisitorId = String(visitorId || "").trim();
    if (!safeToken || !safeVisitorId) return { recorded: false, reason: "invalid" };
    return withTransaction(db, () => {
      const link = readReferralLinkByShortCodeStatement.get(safeToken) || readReferralLinkByTokenStatement.get(safeToken);
      if (!link || String(link.referrer_account_id || "") === String(accountId || "")) return { recorded: false, reason: "invalid" };
      const result = db.prepare(`
        INSERT OR IGNORE INTO commerce_referral_visits (referral_token, visitor_id, visit_day, created_at)
        VALUES (?, ?, ?, ?)
      `).run(String(link.token), safeVisitorId, getChinaVisitDay(), nowIso());
      return { recorded: Number(result.changes || 0) > 0, reason: Number(result.changes || 0) > 0 ? "recorded" : "duplicate" };
    });
  }

  function markReferralRegistered(accountId) {
    return withTransaction(db, () => {
      const account = readAccount(accountId);
      if (!account?.isRegistered) return null;
      const referral = readReferralByInviteeStatement.get(account.id);
      if (!referral) return null;
      const registeredAt = String(referral.registered_at || nowIso());
      db.prepare("UPDATE commerce_referrals SET registered_at = ? WHERE invitee_account_id = ?")
        .run(registeredAt, account.id);
      const rewarded = db.prepare(`
        UPDATE commerce_referrals
        SET registration_rewarded_at = ?
        WHERE invitee_account_id = ? AND registration_rewarded_at IS NULL
      `).run(nowIso(), account.id);
      const referrerAccountId = String(referral.referrer_account_id || "");
      if (Number(rewarded.changes || 0) > 0) {
        appendBeanLedger(referrerAccountId, 5, {
          reason: "referral_registration_bean_reward",
          referenceType: "referral_registration_bean",
          referenceId: account.id,
          note: "邀请新用户完成注册，奖励 5 个豆豆"
        });
        appendLedger(referrerAccountId, 5, {
          reason: "referral_registration_coin_reward",
          referenceType: "referral_registration_coin",
          referenceId: account.id,
          note: "邀请新用户完成注册，奖励 5 个普通币"
        });
      }
      return { referrerAccountId, registeredAt, rewarded: Number(rewarded.changes || 0) > 0 };
    });
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

  function permanentlyDeleteRegisteredAccount(accountId) {
    const account = readAccount(accountId);
    if (!account?.isRegistered) return null;
    const visitorIds = listVisitorIds(account.id);

    withTransaction(db, () => {
      // Referral rows can point at both the deleted user and other users. Remove
      // them first so a referrer's link is no longer retained by RESTRICT.
      db.prepare("DELETE FROM commerce_referrals WHERE invitee_account_id = ? OR referrer_account_id = ?")
        .run(account.id, account.id);
      if (account.email) {
        db.prepare("DELETE FROM commerce_email_verifications WHERE email = ?")
          .run(String(account.email).trim().toLowerCase());
      }
      db.prepare("DELETE FROM commerce_accounts WHERE id = ?").run(account.id);
    });

    return { account, visitorIds };
  }

  function appendLedger(accountId, delta, { reason, referenceType, referenceId, note = "", allowNegative = false } = {}) {
    const account = readAccount(accountId);
    if (!account) throw new Error("账户不存在。");
    const existing = db.prepare(`
      SELECT * FROM commerce_credit_ledger
      WHERE account_id = ? AND reference_type = ? AND reference_id = ?
    `).get(String(accountId), String(referenceType || ""), String(referenceId || ""));
    if (existing) return { ledger: mapLedgerRow(existing), account };

    const safeDelta = Math.trunc(Number(delta || 0));
    const nextBalance = account.creditBalance + safeDelta;
    if (nextBalance < 0 && !allowNegative) {
      const error = new Error("币余额不足。");
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

  function appendBeanLedger(accountId, delta, { reason, referenceType, referenceId, note = "", allowNegative = false } = {}) {
    const account = readAccount(accountId);
    if (!account) throw new Error("账户不存在。");
    const existing = db.prepare(`
      SELECT * FROM commerce_bean_ledger
      WHERE account_id = ? AND reference_type = ? AND reference_id = ?
    `).get(String(accountId), String(referenceType || ""), String(referenceId || ""));
    if (existing) return { ledger: mapLedgerRow(existing), account };

    const safeDelta = Math.trunc(Number(delta || 0));
    const nextBalance = account.beanBalance + safeDelta;
    if (nextBalance < 0 && !allowNegative) {
      const error = new Error("豆豆余额不足。");
      error.code = "INSUFFICIENT_BEANS";
      throw error;
    }

    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO commerce_bean_ledger (
        id, account_id, delta, balance_after, reason, reference_type, reference_id, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), account.id, safeDelta, nextBalance, String(reason || ""), String(referenceType || ""), String(referenceId || ""), String(note || ""), createdAt);
    db.prepare("UPDATE commerce_accounts SET bean_balance = ?, updated_at = ? WHERE id = ?")
      .run(nextBalance, createdAt, account.id);
    return {
      ledger: mapLedgerRow(db.prepare("SELECT * FROM commerce_bean_ledger WHERE account_id = ? AND reference_type = ? AND reference_id = ?")
        .get(account.id, String(referenceType || ""), String(referenceId || ""))),
      account: readAccount(account.id)
    };
  }

  function appendReferralLedger(accountId, deltaCents, { reason, referenceType, referenceId, note = "", status = "available" } = {}) {
    const account = readAccount(accountId);
    if (!account) throw new Error("账户不存在。");
    const existing = db.prepare(`
      SELECT * FROM commerce_referral_ledger
      WHERE account_id = ? AND reference_type = ? AND reference_id = ?
    `).get(String(accountId), String(referenceType || ""), String(referenceId || ""));
    if (existing) return { ledger: mapLedgerRow(existing), account };

    const safeDelta = Math.trunc(Number(deltaCents || 0));
    const safeStatus = status === "pending" ? "pending" : "available";
    const currentBalance = safeStatus === "pending" ? account.referralPendingCents : account.referralBalanceCents;
    const nextBalance = currentBalance + safeDelta;
    const createdAt = nowIso();
    db.prepare(`
      INSERT INTO commerce_referral_ledger (
        id, account_id, delta_cents, balance_after_cents, reason, reference_type, reference_id, note, status, available_at, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), account.id, safeDelta, nextBalance, String(reason || ""), String(referenceType || ""), String(referenceId || ""), String(note || ""), safeStatus, safeStatus === "available" ? createdAt : null, createdAt);
    db.prepare(safeStatus === "pending"
      ? "UPDATE commerce_accounts SET referral_pending_cents = ?, updated_at = ? WHERE id = ?"
      : "UPDATE commerce_accounts SET referral_balance_cents = ?, updated_at = ? WHERE id = ?")
      .run(nextBalance, createdAt, account.id);
    return { account: readAccount(account.id) };
  }

  function rewardReferralPayment(intent) {
    const supportedKinds = new Set(["physical_order", "body_book_order", "coin_purchase", "bean_purchase"]);
    if (!supportedKinds.has(String(intent?.kind || ""))) return null;
    const referral = readReferralByInviteeStatement.get(String(intent.accountId || ""));
    if (!referral?.registered_at) return null;
    const referrer = readAccount(String(referral.referrer_account_id || ""));
    if (!referrer) return null;
    const rateBps = referrer.isReferralInfluencer ? referralRates.influencerRateBps : referralRates.standardRateBps;
    const rewardCents = Math.floor(Math.max(0, Number(intent?.amountCents || 0)) * Math.max(0, Number(rateBps || 0)) / 10000);
    if (rewardCents <= 0) return null;
    return appendReferralLedger(String(referral.referrer_account_id || ""), rewardCents, {
      reason: "referral_payment_reward",
      referenceType: "payment_intent",
      referenceId: intent.id,
      note: `好友实付订单奖励 ${rewardCents} 分推荐金`,
      // 虚拟币/豆豆购买在支付到账时即完成；实体商品须等订单标记为已完成。
      status: ["physical_order", "body_book_order"].includes(String(intent.kind || "")) ? "pending" : "available"
    });
  }

  function releaseReferralPaymentForOrder(orderId) {
    const safeOrderId = String(orderId || "");
    if (!safeOrderId) return 0;
    return withTransaction(db, () => {
      const rows = db.prepare(`
        SELECT l.id, l.account_id, l.delta_cents
        FROM commerce_referral_ledger l
        INNER JOIN commerce_payment_intents p ON p.id = l.reference_id
        WHERE l.reference_type = 'payment_intent'
          AND l.status = 'pending'
          AND p.target_order_id = ?
      `).all(safeOrderId);
      const releasedAt = nowIso();
      rows.forEach((row) => {
        const amount = Math.max(0, Number(row.delta_cents || 0));
        db.prepare(`
          UPDATE commerce_referral_ledger
          SET status = 'available', available_at = ?
          WHERE id = ? AND status = 'pending'
        `).run(releasedAt, row.id);
        db.prepare(`
          UPDATE commerce_accounts
          SET referral_pending_cents = MAX(0, referral_pending_cents - ?),
              referral_balance_cents = referral_balance_cents + ?,
              updated_at = ?
          WHERE id = ?
        `).run(amount, amount, releasedAt, row.account_id);
      });
      return rows.length;
    });
  }

  function releaseCompletedReferralPayments() {
    const completedOrderIds = db.prepare("SELECT id FROM orders WHERE fulfillment_status = 'completed'").all()
      .map((row) => String(row.id || ""))
      .filter(Boolean);
    return completedOrderIds.reduce((total, orderId) => total + releaseReferralPaymentForOrder(orderId), 0);
  }

  function reverseReferralPaymentForRefund(intent) {
    if (!intent?.id) return null;
    const original = db.prepare(`
      SELECT * FROM commerce_referral_ledger
      WHERE reference_type = 'payment_intent' AND reference_id = ?
      LIMIT 1
    `).get(String(intent.id));
    if (!original) return null;
    return appendReferralLedger(String(original.account_id), -Math.abs(Number(original.delta_cents || 0)), {
      reason: "referral_payment_refund_reversal",
      referenceType: "payment_refund_reversal",
      referenceId: String(intent.id),
      note: `关联订单退款，扣回推荐金 ${Math.abs(Number(original.delta_cents || 0))} 分`,
      status: String(original.status || "available") === "pending" ? "pending" : "available"
    });
  }

  function refundPaymentIntent(intentId, { note = "" } = {}) {
    return withTransaction(db, () => {
      const intent = readPaymentIntent(intentId);
      if (!intent) return null;
      if (intent.status === "refunded") return { intent, refundedNow: false };
      if (intent.status !== "paid") {
        const error = new Error("仅已支付订单可以登记退款。");
        error.code = "PAYMENT_NOT_PAID";
        throw error;
      }
      const now = nowIso();
      db.prepare("UPDATE commerce_payment_intents SET status = 'refunded', refunded_at = ?, updated_at = ? WHERE id = ?")
        .run(now, now, intent.id);
      if (intent.kind === "coin_purchase") {
        const count = Math.max(0, Math.trunc(Number(intent.metadata?.coinCount || intent.amountCents / 100 || 0)));
        if (count) appendLedger(intent.accountId, -count, { reason: "coin_purchase_refund", referenceType: "coin_purchase_refund", referenceId: intent.id, note: note || "购买币退款回收", allowNegative: true });
      } else if (intent.kind === "bean_purchase") {
        const count = Math.max(0, Math.trunc(Number(intent.metadata?.beanCount || intent.amountCents / 100 || 0)));
        if (count) appendBeanLedger(intent.accountId, -count, { reason: "bean_purchase_refund", referenceType: "bean_purchase_refund", referenceId: intent.id, note: note || "购买豆豆退款回收", allowNegative: true });
      }
      reverseReferralPaymentForRefund(intent);
      recordPaymentEvent({ paymentIntentId: intent.id, eventType: "payment_refunded_by_admin", eventId: `${intent.id}:refund`, success: true, payload: { note: String(note || "") } });
      return { intent: readPaymentIntent(intent.id), refundedNow: true };
    });
  }

  function withdrawReferralBalance({ accountId, amountCents, note }) {
    const amount = Math.max(0, Math.trunc(Number(amountCents || 0)));
    const safeNote = String(note || "").trim().slice(0, 300);
    if (!amount || !safeNote) {
      const error = new Error("请填写提现金额和备注。");
      error.code = "INVALID_REFERRAL_WITHDRAWAL";
      throw error;
    }
    return withTransaction(db, () => {
      const account = readAccount(accountId);
      if (!account) throw new Error("账户不存在。");
      if (Number(account.referralBalanceCents || 0) < amount) {
        const error = new Error("可提现推荐金余额不足。");
        error.code = "INSUFFICIENT_REFERRAL_BALANCE";
        throw error;
      }
      return appendReferralLedger(accountId, -amount, {
        reason: "referral_withdrawal",
        referenceType: "referral_withdrawal",
        referenceId: randomUUID(),
        note: safeNote,
        status: "available"
      });
    });
  }

  function createOrGetWebAccount({ openId, visitorId, guestAccountId = "", nickname = "", avatarUrl = "", signupCredits = 5, signupBeans = 10 }) {
    const normalizedOpenId = String(openId || "").trim();
    if (!normalizedOpenId) throw new Error("缺少微信用户标识。");
    const normalizedNickname = String(nickname || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80);
    const normalizedAvatarUrl = String(avatarUrl || "").trim().slice(0, 500);
    return withTransaction(db, () => {
      let account = readAccountByOpenId(normalizedOpenId);
      const now = nowIso();
      if (account) {
        db.prepare(`
          UPDATE commerce_accounts
          SET wechat_nickname = CASE WHEN ? <> '' THEN ? ELSE wechat_nickname END,
              wechat_avatar_url = CASE WHEN ? <> '' THEN ? ELSE wechat_avatar_url END,
              registered_at = COALESCE(registered_at, ?), last_login_at = ?, updated_at = ?
          WHERE id = ?
        `).run(normalizedNickname, normalizedNickname, normalizedAvatarUrl, normalizedAvatarUrl, now, now, now, account.id);
        account = readAccount(account.id);
      } else {
        const guestAccount = readAccount(guestAccountId);
        if (guestAccount && guestAccount.channel === "browser_guest" && !guestAccount.isRegistered) {
          db.prepare(`
            UPDATE commerce_accounts
            SET channel = 'web_wechat', open_id = ?, wechat_nickname = ?, wechat_avatar_url = ?, account_status = 'active', registered_at = ?, last_login_at = ?, updated_at = ?
            WHERE id = ?
          `).run(normalizedOpenId, normalizedNickname, normalizedAvatarUrl, now, now, now, guestAccount.id);
          account = readAccount(guestAccount.id);
        } else {
          const createdAt = nowIso();
          const id = randomUUID();
          db.prepare(`
            INSERT INTO commerce_accounts (id, channel, open_id, credit_balance, bean_balance, original_downloads_unlocked_at, wechat_nickname, wechat_avatar_url, registered_at, last_login_at, created_at, updated_at)
            VALUES (?, 'web_wechat', ?, 0, 0, NULL, ?, ?, ?, ?, ?, ?)
          `).run(id, normalizedOpenId, normalizedNickname, normalizedAvatarUrl, createdAt, createdAt, createdAt, createdAt);
          account = readAccount(id);
          appendLedger(account.id, Math.max(0, Math.trunc(Number(signupCredits || 0))), {
            reason: "signup_bonus",
            referenceType: "account",
            referenceId: account.id
          });
          appendBeanLedger(account.id, Math.max(0, Math.trunc(Number(signupBeans || 0))), {
            reason: "signup_bonus",
            referenceType: "account",
            referenceId: account.id
          });
        }
      }
      linkVisitor(account.id, visitorId);
      return readAccount(account.id);
    });
  }

  function updateWechatProfile(accountId, { nickname = "", avatarUrl = "" } = {}) {
    const account = readAccount(accountId);
    if (!account) throw new Error("账户不存在。");
    const normalizedNickname = String(nickname || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 80);
    const normalizedAvatarUrl = String(avatarUrl || "").trim().slice(0, 500);
    if (!normalizedNickname) throw new Error("请填写昵称。");
    if (!normalizedAvatarUrl) throw new Error("请选择头像。");

    db.prepare(`
      UPDATE commerce_accounts
      SET wechat_nickname = ?, wechat_avatar_url = ?, updated_at = ?
      WHERE id = ?
    `).run(normalizedNickname, normalizedAvatarUrl, nowIso(), account.id);
    return readAccount(account.id);
  }

  function createOrGetBrowserAccount({ visitorId, signupCredits = 5, signupBeans = 10 }) {
    const normalizedVisitorId = String(visitorId || "").trim();
    if (!normalizedVisitorId) throw new Error("缺少访客标识。");
    return withTransaction(db, () => {
      let account = readAccountByOpenIdStatement.get("browser_guest", normalizedVisitorId);
      if (!account) {
        const hasClaimedVisitorBonus = Boolean(db.prepare(`
          SELECT 1 FROM commerce_account_visitors
          WHERE visitor_id = ?
          LIMIT 1
        `).get(normalizedVisitorId));
        const createdAt = nowIso();
        const id = randomUUID();
        db.prepare(`
          INSERT INTO commerce_accounts (id, channel, open_id, credit_balance, bean_balance, original_downloads_unlocked_at, created_at, updated_at)
          VALUES (?, 'browser_guest', ?, 0, 0, NULL, ?, ?)
        `).run(id, normalizedVisitorId, createdAt, createdAt);
        account = readAccount(id);
        appendLedger(account.id, hasClaimedVisitorBonus ? 0 : Math.max(0, Math.trunc(Number(signupCredits || 0))), {
          reason: "signup_bonus",
          referenceType: "account",
          referenceId: account.id
        });
        appendBeanLedger(account.id, hasClaimedVisitorBonus ? 0 : Math.max(0, Math.trunc(Number(signupBeans || 0))), {
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

  function replacePaymentIntentOutTradeNo(intentId, outTradeNo) {
    const intent = readPaymentIntent(intentId);
    if (!intent) return null;
    db.prepare("UPDATE commerce_payment_intents SET out_trade_no = ?, updated_at = ? WHERE id = ?")
      .run(String(outTradeNo || ""), nowIso(), intent.id);
    return readPaymentIntent(intent.id);
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

  function hidePaymentIntentForUser(intentId) {
    const intent = readPaymentIntent(intentId);
    if (!intent) return null;
    db.prepare("UPDATE commerce_payment_intents SET user_deleted_at = COALESCE(user_deleted_at, ?), updated_at = ? WHERE id = ?")
      .run(nowIso(), nowIso(), intent.id);
    return readPaymentIntent(intent.id);
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
      if (intent.kind === "physical_order") redeemPhysicalOrderOriginals(intent.accountId, intent.targetOrderId, now);
      if (intent.kind === "coin_purchase") {
        const coinCount = Math.max(0, Math.trunc(Number(intent.metadata?.coinCount || intent.amountCents / 100 || 0)));
        if (coinCount > 0) {
          appendLedger(intent.accountId, coinCount, {
            reason: "coin_purchase",
            referenceType: "coin_purchase",
            referenceId: intent.id,
            note: `购买 ${coinCount} 币`
          });
        }
      }
      if (intent.kind === "bean_purchase") {
        const beanCount = Math.max(0, Math.trunc(Number(intent.metadata?.beanCount || intent.amountCents / 100 || 0)));
        if (beanCount > 0) {
          appendBeanLedger(intent.accountId, beanCount, {
            reason: "bean_purchase",
            referenceType: "bean_purchase",
            referenceId: intent.id,
            note: `购买 ${beanCount} 豆`
          });
        }
      }
      rewardReferralPayment(intent);
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

  function debitBeans({ accountId, amount, referenceId, reason = "body_book_generation" }) {
    return withTransaction(db, () => appendBeanLedger(accountId, -Math.max(0, Math.trunc(Number(amount || 0))), {
      reason,
      referenceType: "generation_session",
      referenceId: String(referenceId || "")
    }));
  }

  function normalizeGenerationJobIds(jobIds) {
    return [...new Set((Array.isArray(jobIds) ? jobIds : [jobIds])
      .map((jobId) => String(jobId || "").trim())
      .filter(Boolean))];
  }

  function debitCreditsForGenerationJobs({ accountId, jobIds, reason = "image_generation" }) {
    const safeJobIds = normalizeGenerationJobIds(jobIds);
    return withTransaction(db, () => {
      for (const jobId of safeJobIds) {
        appendLedger(accountId, -1, { reason, referenceType: "generation_job", referenceId: jobId });
      }
      return { account: readAccount(accountId), chargedJobIds: safeJobIds };
    });
  }

  function refundCreditsForGenerationJobs({ accountId, jobIds, reason = "image_generation_refund" }) {
    const safeJobIds = normalizeGenerationJobIds(jobIds);
    return withTransaction(db, () => {
      for (const jobId of safeJobIds) {
        appendLedger(accountId, 1, { reason, referenceType: "generation_job_refund", referenceId: jobId });
      }
      return { account: readAccount(accountId), refundedJobIds: safeJobIds };
    });
  }

  function debitBeansForGenerationJobs({ accountId, jobIds, reason = "body_book_generation" }) {
    const safeJobIds = normalizeGenerationJobIds(jobIds);
    return withTransaction(db, () => {
      for (const jobId of safeJobIds) {
        appendBeanLedger(accountId, -1, { reason, referenceType: "generation_job", referenceId: jobId });
      }
      return { account: readAccount(accountId), chargedJobIds: safeJobIds };
    });
  }

  function refundBeansForGenerationJobs({ accountId, jobIds, reason = "body_book_generation_refund" }) {
    const safeJobIds = normalizeGenerationJobIds(jobIds);
    return withTransaction(db, () => {
      for (const jobId of safeJobIds) {
        appendBeanLedger(accountId, 1, { reason, referenceType: "generation_job_refund", referenceId: jobId });
      }
      return { account: readAccount(accountId), refundedJobIds: safeJobIds };
    });
  }

  function redeemOriginalImage({ accountId, jobId }) {
    const safeAccountId = String(accountId || "");
    const safeJobId = String(jobId || "");
    return withTransaction(db, () => {
      const existing = readOriginalImageRedemptionStatement.get(safeAccountId, safeJobId);
      if (existing) {
        return { account: readAccount(safeAccountId), redeemedNow: false, redemptionType: String(existing.redemption_type || "") };
      }
      // Permission is checked by the resource endpoint. Keep this legacy
      // redemption table as an audit trail without applying its old gate.
      if (false) {
        const error = new Error("购买币累计满 20 元或定制订单支付成功后，才可下载原图。");
        error.code = "ORIGINAL_REDEMPTION_REQUIRES_PAID_ORDER";
        error.publicMessage = "购买币累计满 20 元或定制订单支付成功后，才可下载原图。";
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
        debit = appendLedger(safeAccountId, 0, {
          reason: "original_image_download",
          referenceType: "original_image_redemption",
          referenceId: safeJobId
        });
      } catch (error) {
        if (error.code === "INSUFFICIENT_CREDITS") {
          error.publicMessage = "兑换原图需要 1 枚币，当前币不足。";
        }
        throw error;
      }
      db.prepare(`
        INSERT INTO commerce_original_image_redemptions (
          account_id, job_id, redemption_type, source_order_id, redeemed_at
        ) VALUES (?, ?, 'account_access', '', ?)
      `).run(safeAccountId, safeJobId, redeemedAt);
      return { account: debit.account, redeemedNow: true, redemptionType: "account_access" };
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

  function normalizeRedemptionEntitlementQuantity(value) {
    return Math.max(0, Math.trunc(Number(value || 0)));
  }

  function getRedemptionEntitlementSummary(accountId) {
    const safeAccountId = String(accountId || "");
    const rows = db.prepare(`
      SELECT entitlement_type, COALESCE(SUM(quantity_remaining), 0) AS quantity
      FROM commerce_redemption_entitlements
      WHERE account_id = ?
      GROUP BY entitlement_type
    `).all(safeAccountId);
    const byType = new Map(rows.map((row) => [String(row.entitlement_type || ""), Number(row.quantity || 0)]));
    return {
      fridgeMagnetItemCount: Math.max(0, byType.get("fridge_magnet_item") || 0),
      bodyBookPrintCount: Math.max(0, byType.get("body_book_print") || 0)
    };
  }

  function grantRedemptionEntitlements({ accountId, codeId, fridgeMagnetItemCount = 0, bodyBookPrintCount = 0 }) {
    return withTransaction(db, () => {
      const account = readAccount(accountId);
      if (!account) throw new Error("账户不存在。");
      const now = nowIso();
      const grants = [
        ["fridge_magnet_item", normalizeRedemptionEntitlementQuantity(fridgeMagnetItemCount)],
        ["body_book_print", normalizeRedemptionEntitlementQuantity(bodyBookPrintCount)]
      ];
      const insert = db.prepare(`
        INSERT OR IGNORE INTO commerce_redemption_entitlements (
          id, account_id, code_id, entitlement_type, quantity_total, quantity_remaining, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      grants.forEach(([entitlementType, quantity]) => {
        if (!quantity) return;
        insert.run(randomUUID(), account.id, String(codeId || ""), entitlementType, quantity, quantity, now, now);
      });
      return getRedemptionEntitlementSummary(account.id);
    });
  }

  function configureReferralRates({ standardRateBps, influencerRateBps } = {}) {
    referralRates = {
      standardRateBps: Math.min(10000, Math.max(0, Math.round(Number(standardRateBps ?? referralRates.standardRateBps) || 0))),
      influencerRateBps: Math.min(10000, Math.max(0, Math.round(Number(influencerRateBps ?? referralRates.influencerRateBps) || 0)))
    };
    return { ...referralRates };
  }

  function setReferralInfluencer(accountId, enabled) {
    const account = readAccount(accountId);
    if (!account?.isRegistered) return null;
    db.prepare("UPDATE commerce_accounts SET referral_role = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? "influencer" : "standard", nowIso(), account.id);
    return readAccount(account.id);
  }

  function listReferralInfluencers() {
    return db.prepare(`
      SELECT * FROM commerce_accounts
      WHERE referral_role = 'influencer'
        AND registered_at IS NOT NULL
      ORDER BY updated_at DESC, id ASC
    `).all().map(mapAccount);
  }

  function adjustRedemptionEntitlement({ accountId, entitlementType, delta, note = "", referenceId = "" }) {
    return withTransaction(db, () => {
      const safeAccountId = String(accountId || "");
      const safeType = String(entitlementType || "");
      const safeDelta = Math.trunc(Number(delta || 0));
      const safeNote = String(note || "").trim();
      if (!safeAccountId || !safeDelta || !safeNote || !["fridge_magnet_item", "body_book_print"].includes(safeType)) {
        throw new Error("Invalid redemption entitlement adjustment.");
      }
      const account = readAccount(safeAccountId);
      if (!account) throw new Error("Account not found.");
      const now = nowIso();
      if (safeDelta > 0) {
        db.prepare(`
          INSERT INTO commerce_redemption_entitlements (
            id, account_id, code_id, entitlement_type, quantity_total, quantity_remaining, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(randomUUID(), safeAccountId, `admin:${referenceId || randomUUID()}:${safeNote.slice(0, 80)}`, safeType, safeDelta, safeDelta, now, now);
      } else {
        let remainingToDeduct = Math.abs(safeDelta);
        const rows = db.prepare(`
          SELECT id, quantity_remaining FROM commerce_redemption_entitlements
          WHERE account_id = ? AND entitlement_type = ? AND quantity_remaining > 0
          ORDER BY created_at ASC, id ASC
        `).all(safeAccountId, safeType);
        const available = rows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity_remaining || 0)), 0);
        if (available < remainingToDeduct) {
          const error = new Error("实体优惠券余额不足。");
          error.code = "INSUFFICIENT_REDEMPTION_ENTITLEMENT";
          throw error;
        }
        const update = db.prepare("UPDATE commerce_redemption_entitlements SET quantity_remaining = quantity_remaining - ?, updated_at = ? WHERE id = ?");
        rows.forEach((row) => {
          if (!remainingToDeduct) return;
          const deduction = Math.min(remainingToDeduct, Math.max(0, Number(row.quantity_remaining || 0)));
          if (deduction) update.run(deduction, now, row.id);
          remainingToDeduct -= deduction;
        });
      }
      return { account, summary: getRedemptionEntitlementSummary(safeAccountId) };
    });
  }

  function consumeRedemptionEntitlement({ accountId, entitlementType, quantity = 1, referenceId }) {
    return withTransaction(db, () => {
      const safeAccountId = String(accountId || "");
      const safeType = String(entitlementType || "");
      const safeReferenceId = String(referenceId || "");
      const requestedQuantity = normalizeRedemptionEntitlementQuantity(quantity);
      if (!safeAccountId || !safeType || !safeReferenceId || !requestedQuantity) throw new Error("兑换权益参数无效。");
      const existing = db.prepare(`
        SELECT * FROM commerce_redemption_entitlement_consumptions
        WHERE account_id = ? AND entitlement_type = ? AND reference_id = ?
      `).get(safeAccountId, safeType, safeReferenceId);
      if (existing) return { consumedNow: false, summary: getRedemptionEntitlementSummary(safeAccountId) };
      const entitlements = db.prepare(`
        SELECT id, quantity_remaining FROM commerce_redemption_entitlements
        WHERE account_id = ? AND entitlement_type = ? AND quantity_remaining > 0
        ORDER BY created_at ASC, id ASC
      `).all(safeAccountId, safeType);
      const available = entitlements.reduce((sum, entitlement) => sum + Number(entitlement.quantity_remaining || 0), 0);
      if (available < requestedQuantity) throw new Error("可用兑换权益不足。");
      let remainingToConsume = requestedQuantity;
      const allocations = [];
      const decrement = db.prepare(`
        UPDATE commerce_redemption_entitlements
        SET quantity_remaining = quantity_remaining - ?, updated_at = ?
        WHERE id = ? AND quantity_remaining >= ?
      `);
      for (const entitlement of entitlements) {
        if (!remainingToConsume) break;
        const used = Math.min(remainingToConsume, Number(entitlement.quantity_remaining || 0));
        decrement.run(used, nowIso(), entitlement.id, used);
        allocations.push({ id: String(entitlement.id), quantity: used });
        remainingToConsume -= used;
      }
      db.prepare(`
        INSERT INTO commerce_redemption_entitlement_consumptions (
          id, account_id, entitlement_type, quantity, reference_id, allocation_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), safeAccountId, safeType, requestedQuantity, safeReferenceId, JSON.stringify(allocations), nowIso());
      return { consumedNow: true, summary: getRedemptionEntitlementSummary(safeAccountId) };
    });
  }

  function restoreRedemptionEntitlement({ accountId, entitlementType, referenceId }) {
    return withTransaction(db, () => {
      const safeAccountId = String(accountId || "");
      const safeType = String(entitlementType || "");
      const safeReferenceId = String(referenceId || "");
      const consumption = db.prepare(`
        SELECT * FROM commerce_redemption_entitlement_consumptions
        WHERE account_id = ? AND entitlement_type = ? AND reference_id = ?
      `).get(safeAccountId, safeType, safeReferenceId);
      if (!consumption) return false;
      const allocations = safeJsonParse(consumption.allocation_json, []);
      const restore = db.prepare(`
        UPDATE commerce_redemption_entitlements
        SET quantity_remaining = quantity_remaining + ?, updated_at = ?
        WHERE id = ? AND account_id = ?
      `);
      (Array.isArray(allocations) ? allocations : []).forEach((allocation) => {
        const quantity = normalizeRedemptionEntitlementQuantity(allocation?.quantity);
        if (quantity && allocation?.id) restore.run(quantity, nowIso(), String(allocation.id), safeAccountId);
      });
      db.prepare("DELETE FROM commerce_redemption_entitlement_consumptions WHERE id = ?").run(consumption.id);
      return true;
    });
  }

  function grantCredits({ accountId, amount, referenceType, referenceId, reason = "promotion" }) {
    return withTransaction(db, () => appendLedger(accountId, Math.max(0, Math.trunc(Number(amount || 0))), {
      reason,
      referenceType: String(referenceType || "promotion"),
      referenceId: String(referenceId || "")
    }));
  }

  function grantBeans({ accountId, amount, referenceType, referenceId, reason = "promotion" }) {
    return withTransaction(db, () => appendBeanLedger(accountId, Math.max(0, Math.trunc(Number(amount || 0))), {
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

  function adjustBeans({ accountId, delta, referenceId, reason, note = "" }) {
    return withTransaction(db, () => appendBeanLedger(accountId, Math.trunc(Number(delta || 0)), {
      reason: String(reason || "admin_adjustment"),
      note: String(note || ""),
      referenceType: "admin_adjustment",
      referenceId: String(referenceId || randomUUID())
    }));
  }

  function refundRechargeBalance({ accountId, currency, amount, referenceId, note = "" }) {
    const safeAccountId = String(accountId || "");
    const safeCurrency = String(currency || "");
    const safeAmount = Math.max(0, Math.trunc(Number(amount || 0)));
    const safeReferenceId = String(referenceId || randomUUID());
    if (!safeAccountId || !safeAmount || !["coin", "bean"].includes(safeCurrency)) {
      throw new Error("Invalid manual recharge refund.");
    }
    return withTransaction(db, () => {
      const adjust = safeCurrency === "bean" ? appendBeanLedger : appendLedger;
      const result = adjust(safeAccountId, -safeAmount, {
        reason: safeCurrency === "bean" ? "bean_purchase_manual_refund" : "coin_purchase_manual_refund",
        note: String(note || ""),
        referenceType: "manual_recharge_refund",
        referenceId: safeReferenceId
      });
      db.prepare(`
        INSERT INTO commerce_manual_recharge_refunds
          (id, account_id, currency, amount_cents, wallet_ledger_id, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(randomUUID(), safeAccountId, safeCurrency, safeAmount * 100, result.ledger.id, String(note || ""), nowIso());
      return result;
    });
  }

  function adjustOriginalDownloadAllowance({ accountId, delta, note = "" }) {
    const safeAccountId = String(accountId || "");
    const safeDelta = Math.trunc(Number(delta || 0));
    const safeNote = String(note || "").trim();
    if (!safeAccountId || !safeDelta || !safeNote) throw new Error("Invalid original download allowance adjustment.");
    return withTransaction(db, () => {
      const account = readAccount(safeAccountId);
      if (!account) throw new Error("Account not found.");
      db.prepare(`
        INSERT INTO commerce_original_download_allowance_adjustments (id, account_id, delta, note, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(randomUUID(), safeAccountId, safeDelta, safeNote.slice(0, 300), nowIso());
      return { account, allowance: getOriginalDownloadAllowance(safeAccountId) };
    });
  }

  function listOriginalDownloadAllowanceAdjustments(accountId, limit = 100) {
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 100)), 1), 500);
    return db.prepare(`
      SELECT id, account_id, delta, note, created_at
      FROM commerce_original_download_allowance_adjustments
      WHERE account_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(String(accountId || ""), safeLimit).map((row) => ({
      id: String(row.id || ""),
      accountId: String(row.account_id || ""),
      delta: Number(row.delta || 0),
      note: String(row.note || ""),
      createdAt: row.created_at || null
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

  function listBeanLedger(accountId, limit = 100) {
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 100)), 1), 500);
    return db.prepare(`
      SELECT * FROM commerce_bean_ledger
      WHERE account_id = ?
      ORDER BY created_at DESC, id DESC
      LIMIT ?
    `).all(String(accountId || ""), safeLimit).map(mapLedgerRow);
  }

  function getReferralSummary(accountId, limit = 100) {
    const account = readAccount(accountId);
    if (!account) throw new Error("账户不存在。");
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 100)), 1), 200);
    const registeredCount = Number(db.prepare(`
      SELECT COUNT(*) AS total FROM commerce_referrals
      WHERE referrer_account_id = ? AND registered_at IS NOT NULL
    `).get(account.id)?.total || 0);
    const beanTotal = Number(db.prepare(`
      SELECT COALESCE(SUM(delta), 0) AS total FROM commerce_bean_ledger
      WHERE account_id = ? AND reference_type = 'referral_registration_bean'
    `).get(account.id)?.total || 0);
    const coinTotal = Number(db.prepare(`
      SELECT COALESCE(SUM(delta), 0) AS total FROM commerce_credit_ledger
      WHERE account_id = ? AND reference_type = 'referral_registration_coin'
    `).get(account.id)?.total || 0);
    const referralTotalCents = Number(db.prepare(`
      SELECT COALESCE(SUM(CASE WHEN delta_cents > 0 THEN delta_cents ELSE 0 END), 0) AS total FROM commerce_referral_ledger
      WHERE account_id = ?
    `).get(account.id)?.total || 0);
    const details = db.prepare(`
      SELECT 'registration_bean' AS type, delta AS amount, 0 AS order_amount_cents, '' AS payment_kind, 'available' AS status, note, created_at
      FROM commerce_bean_ledger
      WHERE account_id = ? AND reference_type = 'referral_registration_bean'
      UNION ALL
      SELECT 'registration_coin' AS type, delta AS amount, 0 AS order_amount_cents, '' AS payment_kind, 'available' AS status, note, created_at
      FROM commerce_credit_ledger
      WHERE account_id = ? AND reference_type = 'referral_registration_coin'
      UNION ALL
      SELECT l.reason AS type, l.delta_cents AS amount, COALESCE(p.amount_cents, 0) AS order_amount_cents,
        COALESCE(p.kind, '') AS payment_kind, l.status, l.note, l.created_at
      FROM commerce_referral_ledger l
      LEFT JOIN commerce_payment_intents p ON p.id = l.reference_id
      WHERE l.account_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(account.id, account.id, account.id, safeLimit).map((row) => ({
      type: String(row.type || ""),
      amount: Number(row.amount || 0),
      orderAmountCents: Number(row.order_amount_cents || 0),
      paymentKind: String(row.payment_kind || ""),
      status: String(row.status || "available"),
      note: String(row.note || ""),
      createdAt: row.created_at || null
    }));
    return {
      registeredCount,
      registrationBeanTotal: beanTotal,
      registrationCoinTotal: coinTotal,
      referralBalanceCents: Math.max(0, Number(account.referralBalanceCents || 0)),
      referralPendingCents: Math.max(0, Number(account.referralPendingCents || 0)),
      referralTotalCents: Math.max(0, referralTotalCents),
      details
    };
  }

  function listPaymentIntents(accountId, limit = 100, { excludeUserDeleted = false } = {}) {
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 100)), 1), 500);
    const userDeletedCondition = excludeUserDeleted ? " AND (user_deleted_at IS NULL OR user_deleted_at = '')" : "";
    return db.prepare(`
      SELECT * FROM commerce_payment_intents
      WHERE account_id = ?${userDeletedCondition}
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

  function listAllBeanLedger(limit = 200) {
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit || 200)), 1), 500);
    return db.prepare("SELECT * FROM commerce_bean_ledger ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(safeLimit)
      .map(mapLedgerRow);
  }

  function listAdminReferralLedger({ page = 1, limit = 30, search = "", type = "", status = "", startDate = "", endDate = "", sortBy = "createdAt", sortDir = "desc" } = {}) {
    const conditions = [];
    const params = {};
    const keyword = String(search || "").trim();
    if (keyword) {
      conditions.push("(a.username LIKE @search OR a.wechat_nickname LIKE @search OR a.email LIKE @search OR a.id LIKE @search OR invitee.username LIKE @search OR invitee.wechat_nickname LIKE @search OR invitee.email LIKE @search OR invitee.id LIKE @search)");
      params.search = `%${keyword}%`;
    }
    if (type) { conditions.push("l.reason = @type"); params.type = String(type); }
    if (["available", "pending"].includes(String(status))) { conditions.push("l.status = @status"); params.status = String(status); }
    if (startDate) { conditions.push("l.created_at >= @startDate"); params.startDate = `${startDate}T00:00:00.000Z`; }
    if (endDate) { conditions.push("l.created_at <= @endDate"); params.endDate = `${endDate}T23:59:59.999Z`; }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const requestedPage = Math.max(1, Math.trunc(Number(page || 1)));
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit || 30))));
    const sortColumn = { createdAt: "l.created_at", amount: "l.delta_cents", balance: "l.balance_after_cents" }[String(sortBy)] || "l.created_at";
    const direction = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";
    const total = Number(db.prepare(`
      SELECT COUNT(*) AS total FROM commerce_referral_ledger l
      INNER JOIN commerce_accounts a ON a.id = l.account_id
      LEFT JOIN commerce_payment_intents p ON p.id = l.reference_id
      LEFT JOIN commerce_accounts invitee ON invitee.id = p.account_id
      ${where}
    `).get(params)?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const safePage = Math.min(requestedPage, totalPages);
    const rows = db.prepare(`
      SELECT l.*, a.username AS account_username, a.wechat_nickname AS account_wechat_nickname, a.email AS account_email,
        p.kind AS payment_kind, p.amount_cents AS order_amount_cents, p.target_order_id,
        invitee.id AS invitee_id, invitee.username AS invitee_username, invitee.wechat_nickname AS invitee_wechat_nickname, invitee.email AS invitee_email
      FROM commerce_referral_ledger l
      INNER JOIN commerce_accounts a ON a.id = l.account_id
      LEFT JOIN commerce_payment_intents p ON p.id = l.reference_id
      LEFT JOIN commerce_accounts invitee ON invitee.id = p.account_id
      ${where}
      ORDER BY ${sortColumn} ${direction}, l.id ${direction}
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit: safeLimit, offset: (safePage - 1) * safeLimit });
    return {
      total, page: safePage, limit: safeLimit,
      items: rows.map((row) => ({
        id: String(row.id), accountId: String(row.account_id), deltaCents: Number(row.delta_cents || 0), balanceAfterCents: Number(row.balance_after_cents || 0),
        reason: String(row.reason || ""), referenceType: String(row.reference_type || ""), referenceId: String(row.reference_id || ""), note: String(row.note || ""), status: String(row.status || "available"), createdAt: row.created_at || null,
        account: { id: String(row.account_id), username: String(row.account_username || ""), wechatNickname: String(row.account_wechat_nickname || ""), email: String(row.account_email || "") },
        invitee: row.invitee_id ? { id: String(row.invitee_id), username: String(row.invitee_username || ""), wechatNickname: String(row.invitee_wechat_nickname || ""), email: String(row.invitee_email || "") } : null,
        paymentKind: String(row.payment_kind || ""), orderAmountCents: Number(row.order_amount_cents || 0), targetOrderId: String(row.target_order_id || "")
      }))
    };
  }

  function listAdminReferralRankings({ page = 1, limit = 30, search = "", sortBy = "totalEarned", sortDir = "desc" } = {}) {
    const keyword = String(search || "").trim();
    const params = {};
    const where = keyword ? "WHERE (a.username LIKE @search OR a.wechat_nickname LIKE @search OR a.email LIKE @search OR a.id LIKE @search)" : "";
    if (keyword) params.search = `%${keyword}%`;
    const requestedPage = Math.max(1, Math.trunc(Number(page || 1)));
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number(limit || 30))));
    const rankSql = `
      SELECT a.id, a.username, a.wechat_nickname, a.email, a.referral_balance_cents, a.referral_pending_cents,
        COALESCE((SELECT SUM(CASE WHEN l.delta_cents > 0 THEN l.delta_cents ELSE 0 END) FROM commerce_referral_ledger l WHERE l.account_id = a.id), 0) AS total_earned_cents,
        COALESCE((SELECT COUNT(*) FROM commerce_referrals r WHERE r.referrer_account_id = a.id AND r.registered_at IS NOT NULL), 0) AS registered_count,
        COALESCE((SELECT COUNT(*) FROM commerce_referral_visits v INNER JOIN commerce_referral_links link ON link.token = v.referral_token WHERE link.referrer_account_id = a.id), 0) AS visit_count
      FROM commerce_accounts a
      ${where}`;
    const total = Number(db.prepare(`SELECT COUNT(*) AS total FROM (${rankSql}) ranked WHERE total_earned_cents > 0 OR registered_count > 0 OR visit_count > 0`).get(params)?.total || 0);
    const sortColumn = { totalEarned: "total_earned_cents", withdrawable: "referral_balance_cents", registrations: "registered_count", visits: "visit_count" }[String(sortBy)] || "total_earned_cents";
    const direction = String(sortDir).toLowerCase() === "asc" ? "ASC" : "DESC";
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const safePage = Math.min(requestedPage, totalPages);
    const rows = db.prepare(`SELECT * FROM (${rankSql}) ranked WHERE total_earned_cents > 0 OR registered_count > 0 OR visit_count > 0 ORDER BY ${sortColumn} ${direction}, id ASC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit: safeLimit, offset: (safePage - 1) * safeLimit });
    return {
      total, page: safePage, limit: safeLimit,
      items: rows.map((row) => ({
        account: { id: String(row.id), username: String(row.username || ""), wechatNickname: String(row.wechat_nickname || ""), email: String(row.email || "") },
        totalEarnedCents: Number(row.total_earned_cents || 0), withdrawableCents: Number(row.referral_balance_cents || 0), pendingCents: Math.max(0, Number(row.referral_pending_cents || 0)), registeredCount: Number(row.registered_count || 0), visitCount: Number(row.visit_count || 0)
      }))
    };
  }

  function listRegisteredUsers({ page = 1, limit = 20, search = "", status = "" } = {}) {
    const conditions = ["a.registered_at IS NOT NULL", "(a.channel = 'web_wechat' OR (a.email != '' AND a.password_hash != ''))"];
    const params = {};
    const keyword = String(search || "").trim();
    if (keyword) {
      conditions.push("(a.email LIKE @search OR a.username LIKE @search OR a.wechat_nickname LIKE @search)");
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
      SELECT a.*,
        (SELECT COUNT(DISTINCT av.visitor_id) FROM commerce_account_visitors av WHERE av.account_id = a.id) AS visitor_count,
        (SELECT COUNT(*) FROM orders o WHERE o.account_id = a.id OR ((o.account_id IS NULL OR o.account_id = '') AND EXISTS (
          SELECT 1 FROM commerce_account_visitors av WHERE av.account_id = a.id AND av.visitor_id = o.visitor_id
        ))) AS order_count,
        COALESCE((SELECT SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_cents ELSE 0 END) FROM orders o WHERE o.account_id = a.id OR ((o.account_id IS NULL OR o.account_id = '') AND EXISTS (
          SELECT 1 FROM commerce_account_visitors av WHERE av.account_id = a.id AND av.visitor_id = o.visitor_id
        ))), 0) AS paid_total_cents,
        r.referrer_account_id AS inviter_account_id,
        inviter.username AS inviter_username,
        inviter.email AS inviter_email,
        inviter.wechat_nickname AS inviter_wechat_nickname
      FROM commerce_accounts a
      LEFT JOIN commerce_referrals r ON r.invitee_account_id = a.id
      LEFT JOIN commerce_accounts inviter ON inviter.id = r.referrer_account_id
      ${where}
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
        paidTotalCents: Number(row.paid_total_cents || 0),
        inviterAccountId: String(row.inviter_account_id || ""),
        inviterUsername: String(row.inviter_username || ""),
        inviterEmail: String(row.inviter_email || ""),
        inviterWechatNickname: String(row.inviter_wechat_nickname || "")
      }))
    };
  }

  function listAdminAccounts() {
    const rows = db.prepare(`
      SELECT a.*,
        (SELECT COUNT(DISTINCT av.visitor_id) FROM commerce_account_visitors av WHERE av.account_id = a.id) AS visitor_count,
        (SELECT COUNT(*) FROM orders o WHERE o.account_id = a.id OR ((o.account_id IS NULL OR o.account_id = '') AND EXISTS (
          SELECT 1 FROM commerce_account_visitors av WHERE av.account_id = a.id AND av.visitor_id = o.visitor_id
        ))) AS order_count,
        COALESCE((SELECT SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_cents ELSE 0 END) FROM orders o WHERE o.account_id = a.id OR ((o.account_id IS NULL OR o.account_id = '') AND EXISTS (
          SELECT 1 FROM commerce_account_visitors av WHERE av.account_id = a.id AND av.visitor_id = o.visitor_id
        ))), 0) AS paid_total_cents,
        r.referrer_account_id AS inviter_account_id,
        inviter.username AS inviter_username,
        inviter.email AS inviter_email,
        inviter.wechat_nickname AS inviter_wechat_nickname
      FROM commerce_accounts a
      LEFT JOIN commerce_referrals r ON r.invitee_account_id = a.id
      LEFT JOIN commerce_accounts inviter ON inviter.id = r.referrer_account_id
      ORDER BY a.created_at DESC
    `).all();
    const visitorRows = db.prepare(`
      SELECT account_id, visitor_id
      FROM commerce_account_visitors
      ORDER BY created_at ASC
    `).all();
    const visitorIdsByAccountId = new Map();
    visitorRows.forEach((row) => {
      const accountId = String(row.account_id || "");
      const visitorId = String(row.visitor_id || "");
      if (!accountId || !visitorId) return;
      const current = visitorIdsByAccountId.get(accountId) || [];
      current.push(visitorId);
      visitorIdsByAccountId.set(accountId, current);
    });
    return rows.map((row) => ({
      ...mapAccount(row),
      visitorCount: Number(row.visitor_count || 0),
      orderCount: Number(row.order_count || 0),
      paidTotalCents: Number(row.paid_total_cents || 0),
      inviterAccountId: String(row.inviter_account_id || ""),
      inviterUsername: String(row.inviter_username || ""),
      inviterEmail: String(row.inviter_email || ""),
      inviterWechatNickname: String(row.inviter_wechat_nickname || ""),
      visitorIds: visitorIdsByAccountId.get(String(row.id || "")) || []
    }));
  }

  function readRegisteredUserDetail(accountId) {
    const accountRow = db.prepare(`
      SELECT a.*, r.referrer_account_id AS inviter_account_id,
        inviter.username AS inviter_username,
        inviter.email AS inviter_email,
        inviter.wechat_nickname AS inviter_wechat_nickname
      FROM commerce_accounts a
      LEFT JOIN commerce_referrals r ON r.invitee_account_id = a.id
      LEFT JOIN commerce_accounts inviter ON inviter.id = r.referrer_account_id
      WHERE a.id = ?
    `).get(String(accountId || ""));
    const account = accountRow
      ? {
          ...mapAccount(accountRow),
          inviterAccountId: String(accountRow.inviter_account_id || ""),
          inviterUsername: String(accountRow.inviter_username || ""),
          inviterEmail: String(accountRow.inviter_email || ""),
          inviterWechatNickname: String(accountRow.inviter_wechat_nickname || "")
        }
      : null;
    if (!account?.isRegistered) return null;
    const summary = db.prepare(`
      SELECT
        (SELECT COUNT(DISTINCT av.visitor_id) FROM commerce_account_visitors av WHERE av.account_id = a.id) AS visitor_count,
        (SELECT COUNT(*) FROM orders o WHERE o.account_id = a.id OR ((o.account_id IS NULL OR o.account_id = '') AND EXISTS (
          SELECT 1 FROM commerce_account_visitors av WHERE av.account_id = a.id AND av.visitor_id = o.visitor_id
        ))) AS order_count,
        COALESCE((SELECT SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_cents ELSE 0 END) FROM orders o WHERE o.account_id = a.id OR ((o.account_id IS NULL OR o.account_id = '') AND EXISTS (
          SELECT 1 FROM commerce_account_visitors av WHERE av.account_id = a.id AND av.visitor_id = o.visitor_id
        ))), 0) AS paid_total_cents
      FROM commerce_accounts a
      WHERE a.id = ?
    `).get(account.id) || {};
    const orders = db.prepare(`
      SELECT id, order_no, experience_type, payment_status, fulfillment_status, item_count, total_cents, paid_at, created_at
      FROM orders
      WHERE account_id = ? OR ((account_id IS NULL OR account_id = '') AND EXISTS (
        SELECT 1 FROM commerce_account_visitors av WHERE av.account_id = ? AND av.visitor_id = orders.visitor_id
      ))
      ORDER BY created_at DESC LIMIT 500
    `).all(account.id, account.id).map((row) => ({
      id: String(row.id || ""), orderNo: String(row.order_no || ""), experienceType: String(row.experience_type || ""), paymentStatus: String(row.payment_status || ""),
      fulfillmentStatus: String(row.fulfillment_status || ""), itemCount: Number(row.item_count || 0),
      totalCents: Number(row.total_cents || 0), paidAt: row.paid_at || null, createdAt: row.created_at || null
    }));
    return {
      account,
      visitorCount: Number(summary.visitor_count || 0),
      orderCount: Number(summary.order_count || 0),
      paidTotalCents: Number(summary.paid_total_cents || 0),
      ledger: listCreditLedger(account.id, 100),
      beanLedger: listBeanLedger(account.id, 100),
      orders
    };
  }

  return {
    createOrGetBrowserAccount,
    createOrGetWebAccount,
    captureReferral,
    createEmailVerification,
    createUserSession,
    createPaymentIntent,
    consumeRedemptionEntitlement,
    cancelPaymentIntentByOutTradeNo,
    hidePaymentIntentForUser,
    debitCredits,
    debitBeans,
    debitCreditsForGenerationJobs,
    refundCreditsForGenerationJobs,
    debitBeansForGenerationJobs,
    refundBeansForGenerationJobs,
    adjustCredits,
    adjustBeans,
    refundRechargeBalance,
    adjustOriginalDownloadAllowance,
    deleteUserSession,
    permanentlyDeleteRegisteredAccount,
    grantCredits,
    grantBeans,
    getBodyBookDiscountSummary,
    getBodyBookCouponBalance,
    adjustBodyBookCoupon,
    getFridgeCoinDiscountSummary,
    getRedemptionEntitlementSummary,
    grantRedemptionEntitlements,
    adjustRedemptionEntitlement,
    getOrCreateReferralLink,
    resolveReferralLink,
    getReferralSummary,
    configureReferralRates,
    setReferralInfluencer,
    listReferralInfluencers,
    listAdminReferralLedger,
    listAdminReferralRankings,
    recordReferralVisit,
    refundPaymentIntent,
    withdrawReferralBalance,
    releaseReferralPaymentForOrder,
    releaseCompletedReferralPayments,
    authorizeBookOriginalDownload,
    authorizeDrawOriginalDownload,
    canDownloadBookOriginal,
    canDownloadDrawOriginal,
    getPaidOriginalDownloadCents,
    getOriginalDownloadAllowance,
    listOriginalDownloadAllowanceAdjustments,
    grantOriginalDownload,
    hasOriginalDownloadGrant,
    hasOriginalImageDownloadAccess,
    hasPaidPhysicalOrder,
    isOriginalImageRedeemed,
    linkVisitor,
    listCreditLedger,
    listBeanLedger,
    listAllCreditLedger,
    listAllBeanLedger,
    listAllPaymentIntents,
    listAdminAccounts,
    listPaymentIntents,
    listRegisteredUsers,
    listVisitorIds,
    markPaymentPrepared,
    markReferralRegistered,
    readAccount,
    readAccountByEmail,
    readAccountByOpenId,
    readAccountByUsername,
    readRegisteredUserDetail,
    readUserSession,
    readPaymentIntent,
    readPaymentIntentByOutTradeNo,
    replacePaymentIntentOutTradeNo,
    recordPaymentEvent,
    recordContentShareVisit,
    redeemOriginalImage,
    restoreRedemptionEntitlement,
    releaseBodyBookDiscountReservation,
    releaseFridgeCoinDiscountReservation,
    reserveBodyBookDiscount,
    reserveFridgeCoinDiscount,
    settlePayment,
    consumeBodyBookDiscountReservation,
    consumeFridgeCoinDiscountReservation,
    consumeEmailVerification,
    recordAccountLogin,
    setAccountStatus,
    updateAccountPassword,
    updateWechatProfile,
    upgradeGuestAccount
  };
}
