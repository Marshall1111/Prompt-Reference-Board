import { createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function mapDeviceRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    deviceId: String(row.device_id || ""),
    // 账户 ID 可能是 UUID，不能转 Number，否则会变成 NaN 并在 JSON 里丢失。
    storeOwnerAccountId: row.store_owner_account_id == null || row.store_owner_account_id === ""
      ? null
      : String(row.store_owner_account_id),
    label: String(row.label || ""),
    status: String(row.status || "offline"),
    printerName: String(row.printer_name || "hp518"),
    printerState: String(row.printer_state || "unknown"),
    reasons: safeJsonParse(row.printer_reasons, []),
    hardwareModel: String(row.hardware_model || ""),
    firmwareVersion: String(row.firmware_version || ""),
    provisionSource: String(row.provision_source || "legacy"),
    provisionedAt: row.provisioned_at || null,
    lastSeenAt: row.last_seen_at || null,
    createdAt: row.created_at || null
  };
}

function mapJobRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id || 0),
    orderId: String(row.order_id || ""),
    deviceId: String(row.device_id || ""),
    status: String(row.status || "queued"),
    attempt: Number(row.attempt || 0),
    imageUrls: safeJsonParse(row.image_urls, []),
    layoutMode: String(row.layout_mode || "2up"),
    errorMessage: String(row.error_message || ""),
    createdAt: row.created_at || null,
    claimedAt: row.claimed_at || null,
    finishedAt: row.finished_at || null
  };
}

export function createPrintStore({ dbPath }) {
  const db = new DatabaseSync(path.resolve(dbPath));
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS print_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL UNIQUE,
      store_owner_account_id INTEGER,
      label TEXT NOT NULL DEFAULT '',
      token_hash TEXT NOT NULL,
      token_plain TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'offline',
      printer_name TEXT NOT NULL DEFAULT 'hp518',
      printer_state TEXT NOT NULL DEFAULT 'unknown',
      printer_reasons TEXT NOT NULL DEFAULT '[]',
      hardware_model TEXT NOT NULL DEFAULT '',
      firmware_version TEXT NOT NULL DEFAULT '',
      provision_source TEXT NOT NULL DEFAULT 'legacy',
      provisioned_at TEXT,
      last_seen_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS print_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      device_id TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'queued',
      attempt INTEGER NOT NULL DEFAULT 0,
      image_urls TEXT NOT NULL DEFAULT '[]',
      layout_mode TEXT NOT NULL DEFAULT '2up',
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      claimed_at TEXT,
      finished_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_print_jobs_order ON print_jobs(order_id);
    CREATE INDEX IF NOT EXISTS idx_print_jobs_device_status ON print_jobs(device_id, status);
  `);

  // 兼容旧库：后台需要随时查看明文令牌，缺列时补上（老设备该列为空）。
  const deviceColumns = db.prepare("PRAGMA table_info(print_devices)").all().map((column) => String(column.name || ""));
  const ensureDeviceColumn = (name, definition) => {
    if (!deviceColumns.includes(name)) {
      db.exec(`ALTER TABLE print_devices ADD COLUMN ${name} ${definition}`);
    }
  };
  ensureDeviceColumn("token_plain", "TEXT NOT NULL DEFAULT ''");
  ensureDeviceColumn("hardware_model", "TEXT NOT NULL DEFAULT ''");
  ensureDeviceColumn("firmware_version", "TEXT NOT NULL DEFAULT ''");
  // 老设备没有制盘记录，统一标记为 legacy；新设备在创建时写入 manual / usb。
  ensureDeviceColumn("provision_source", "TEXT NOT NULL DEFAULT 'legacy'");
  ensureDeviceColumn("provisioned_at", "TEXT");

  const readDeviceByDeviceIdStatement = db.prepare("SELECT * FROM print_devices WHERE device_id = ?");
  const readDeviceByTokenStatement = db.prepare("SELECT * FROM print_devices WHERE token_hash = ?");
  const readJobStatement = db.prepare("SELECT * FROM print_jobs WHERE id = ?");

  function hashToken(token) {
    return createHash("sha256").update(String(token || "")).digest("hex");
  }

  function createPrintDevice({
    storeOwnerAccountId = null,
    label = "",
    printerName = "hp518",
    hardwareModel = "",
    provisionSource = "manual"
  } = {}) {
    const token = randomBytes(32).toString("hex");
    const deviceId = `dev_${randomBytes(6).toString("hex")}`;
    db.prepare(`
      INSERT INTO print_devices (
        device_id, store_owner_account_id, label, token_hash, token_plain,
        status, printer_name, hardware_model, provision_source, created_at
      )
      VALUES (?, ?, ?, ?, ?, 'offline', ?, ?, ?, ?)
    `).run(
      deviceId,
      storeOwnerAccountId == null || storeOwnerAccountId === "" ? null : String(storeOwnerAccountId).trim(),
      String(label || "").trim().slice(0, 40),
      hashToken(token),
      token,
      String(printerName || "hp518").trim() || "hp518",
      String(hardwareModel || "").trim().slice(0, 40),
      String(provisionSource || "manual").trim().slice(0, 20) || "manual",
      nowIso()
    );
    return { device: mapDeviceRow(readDeviceByDeviceIdStatement.get(deviceId)), token };
  }

  function readPrintDevice(deviceId) {
    return mapDeviceRow(readDeviceByDeviceIdStatement.get(String(deviceId || "")));
  }

  function findPrintDeviceByTokenHash(token) {
    return mapDeviceRow(readDeviceByTokenStatement.get(hashToken(token)));
  }

  // 后台「信息维护」回显用；本次改动前创建的设备没有明文，返回空串。
  function readPrintDeviceToken(deviceId) {
    const row = db.prepare("SELECT token_plain FROM print_devices WHERE device_id = ?").get(String(deviceId || ""));
    return row ? String(row.token_plain || "") : "";
  }

  function findPrintDeviceByStoreOwner(storeOwnerAccountId) {
    if (storeOwnerAccountId == null || storeOwnerAccountId === "") return null;
    return mapDeviceRow(db.prepare(`
      SELECT * FROM print_devices
      WHERE store_owner_account_id = ?
      ORDER BY id DESC LIMIT 1
    `).get(String(storeOwnerAccountId)));
  }

  function listPrintDevices() {
    return db.prepare("SELECT * FROM print_devices ORDER BY id DESC").all().map(mapDeviceRow);
  }

  function listAvailablePrintDevices() {
    return db.prepare(`
      SELECT * FROM print_devices
      WHERE store_owner_account_id IS NULL
      ORDER BY id DESC
    `).all().map(mapDeviceRow);
  }

  // 绑定/解绑：同一商户只保留一台设备，绑定新设备时自动解绑该商户的旧设备。
  function bindPrintDevice(deviceId, storeOwnerAccountId) {
    const normalizedDeviceId = String(deviceId || "").trim();
    if (!readDeviceByDeviceIdStatement.get(normalizedDeviceId)) return null;
    const nextOwner = storeOwnerAccountId == null || storeOwnerAccountId === ""
      ? null
      : String(storeOwnerAccountId).trim();
    db.exec("BEGIN IMMEDIATE");
    try {
      if (nextOwner) {
        db.prepare(`
          UPDATE print_devices SET store_owner_account_id = NULL
          WHERE store_owner_account_id = ? AND device_id <> ?
        `).run(nextOwner, normalizedDeviceId);
      }
      db.prepare("UPDATE print_devices SET store_owner_account_id = ? WHERE device_id = ?")
        .run(nextOwner, normalizedDeviceId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return mapDeviceRow(readDeviceByDeviceIdStatement.get(normalizedDeviceId));
  }

  function updatePrintDevice(deviceId, { label = "", printerName = "hp518" } = {}) {
    const device = readDeviceByDeviceIdStatement.get(String(deviceId || ""));
    if (!device) return null;
    db.prepare("UPDATE print_devices SET label = ?, printer_name = ? WHERE device_id = ?").run(
      String(label || "").trim().slice(0, 40),
      String(printerName || "hp518").trim() || "hp518",
      String(deviceId || "")
    );
    return mapDeviceRow(readDeviceByDeviceIdStatement.get(String(deviceId || "")));
  }

  function deletePrintDevice(deviceId) {
    const result = db.prepare("DELETE FROM print_devices WHERE device_id = ?").run(String(deviceId || ""));
    return Number(result.changes || 0) > 0;
  }

  function touchPrintDevice(deviceId, {
    printerState = "unknown",
    reasons = [],
    hardwareModel = "",
    firmwareVersion = ""
  } = {}) {
    const safeReasons = Array.isArray(reasons) ? reasons.map((item) => String(item || "")).filter(Boolean) : [];
    const now = nowIso();
    const assignments = [
      "status = 'online'",
      "printer_state = ?",
      "printer_reasons = ?",
      "last_seen_at = ?",
      "provisioned_at = COALESCE(provisioned_at, ?)"
    ];
    const values = [String(printerState || "unknown"), JSON.stringify(safeReasons), now, now];
    const normalizedModel = String(hardwareModel || "").trim().slice(0, 40);
    const normalizedFirmware = String(firmwareVersion || "").trim().slice(0, 40);
    if (normalizedModel) {
      assignments.push("hardware_model = ?");
      values.push(normalizedModel);
    }
    if (normalizedFirmware) {
      assignments.push("firmware_version = ?");
      values.push(normalizedFirmware);
    }
    values.push(String(deviceId || ""));
    db.prepare(`
      UPDATE print_devices
      SET ${assignments.join(", ")}
      WHERE device_id = ?
    `).run(...values);
    return mapDeviceRow(readDeviceByDeviceIdStatement.get(String(deviceId || "")));
  }

  function createPrintJob({
    orderId,
    deviceId = "",
    imageUrls = [],
    status = "queued",
    errorMessage = "",
    layoutMode = "2up"
  }) {
    const existing = findPrintJobByOrder(orderId);
    if (existing) return existing;
    const info = db.prepare(`
      INSERT INTO print_jobs (order_id, device_id, status, image_urls, layout_mode, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(orderId || ""),
      String(deviceId || ""),
      String(status || "queued"),
      JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []),
      String(layoutMode || "2up"),
      String(errorMessage || ""),
      nowIso()
    );
    return mapJobRow(readJobStatement.get(Number(info.lastInsertRowid)));
  }

  function readPrintJob(jobId) {
    return mapJobRow(readJobStatement.get(Number(jobId)));
  }

  function findPrintJobByOrder(orderId) {
    return mapJobRow(db.prepare("SELECT * FROM print_jobs WHERE order_id = ?").get(String(orderId || "")));
  }

  function listJobsByOrder(orderId) {
    return db.prepare("SELECT * FROM print_jobs WHERE order_id = ? ORDER BY id ASC")
      .all(String(orderId || ""))
      .map(mapJobRow);
  }

  function listFailedJobs(limit = 20) {
    return db.prepare("SELECT * FROM print_jobs WHERE status = 'failed' ORDER BY id DESC LIMIT ?")
      .all(Math.max(1, Math.trunc(Number(limit) || 20)))
      .map(mapJobRow);
  }

  function countPendingJobs(deviceId) {
    const row = db.prepare("SELECT COUNT(*) AS total FROM print_jobs WHERE device_id = ? AND status = 'queued'")
      .get(String(deviceId || ""));
    return Number(row?.total || 0);
  }

  // 打印代理在出纸期间不再心跳，页面状态改为以任务状态为准。
  function countActiveJobs(deviceId) {
    const row = db.prepare(`
      SELECT
        SUM(CASE WHEN status = 'claimed' THEN 1 ELSE 0 END) AS printing,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued
      FROM print_jobs WHERE device_id = ?
    `).get(String(deviceId || ""));
    return { printing: Number(row?.printing || 0), queued: Number(row?.queued || 0) };
  }

  function claimNextJob(deviceId) {
    const candidate = db.prepare(`
      SELECT id FROM print_jobs
      WHERE device_id = ? AND status = 'queued'
      ORDER BY id ASC LIMIT 1
    `).get(String(deviceId || ""));
    if (!candidate) return null;
    const info = db.prepare(`
      UPDATE print_jobs SET status = 'claimed', claimed_at = ?, attempt = attempt + 1
      WHERE id = ? AND status = 'queued'
    `).run(nowIso(), Number(candidate.id));
    if (Number(info.changes || 0) !== 1) return null;
    return mapJobRow(readJobStatement.get(Number(candidate.id)));
  }

  function finishPrintJob(jobId, status, errorMessage = "") {
    const nextStatus = status === "printed" ? "printed" : "failed";
    db.prepare(`
      UPDATE print_jobs SET status = ?, error_message = ?, finished_at = ?
      WHERE id = ?
    `).run(nextStatus, String(errorMessage || "").slice(0, 500), nowIso(), Number(jobId));
    return mapJobRow(readJobStatement.get(Number(jobId)));
  }

  function retryPrintJob(jobId, { deviceId = "" } = {}) {
    const job = readPrintJob(jobId);
    if (!job || job.status !== "failed") return job;
    // 失败任务可能是创建时没有设备（device_id 为空），重试时补绑当前设备，否则代理永远领不到。
    const nextDeviceId = String(job.deviceId || "").trim() || String(deviceId || "").trim();
    db.prepare(`
      UPDATE print_jobs SET status = 'queued', device_id = ?, error_message = '', claimed_at = NULL, finished_at = NULL
      WHERE id = ?
    `).run(nextDeviceId, Number(jobId));
    return mapJobRow(readJobStatement.get(Number(jobId)));
  }

  function requeueStaleJobs(staleBeforeIso) {
    const cutoff = staleBeforeIso || new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const info = db.prepare(`
      UPDATE print_jobs SET status = 'queued', claimed_at = NULL
      WHERE status = 'claimed' AND claimed_at IS NOT NULL AND claimed_at < ?
    `).run(cutoff);
    return Number(info.changes || 0);
  }

  return {
    createPrintDevice,
    readPrintDevice,
    findPrintDeviceByTokenHash,
    readPrintDeviceToken,
    findPrintDeviceByStoreOwner,
    listPrintDevices,
    listAvailablePrintDevices,
    bindPrintDevice,
    updatePrintDevice,
    deletePrintDevice,
    touchPrintDevice,
    createPrintJob,
    readPrintJob,
    findPrintJobByOrder,
    listJobsByOrder,
    listFailedJobs,
    countPendingJobs,
    countActiveJobs,
    claimNextJob,
    finishPrintJob,
    retryPrintJob,
    requeueStaleJobs
  };
}
