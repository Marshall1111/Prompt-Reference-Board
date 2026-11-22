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
    agentVersion: String(row.agent_version || ""),
    agentReleaseId: String(row.agent_release_id || ""),
    agentPreviousVersion: String(row.agent_previous_version || ""),
    agentPreviousReleaseId: String(row.agent_previous_release_id || ""),
    agentUpdateState: String(row.agent_update_state || ""),
    agentUpdateKind: String(row.agent_update_kind || ""),
    agentUpdateTargetReleaseId: String(row.agent_update_target_release_id || ""),
    agentUpdateTargetVersion: String(row.agent_update_target_version || ""),
    agentUpdateError: String(row.agent_update_error || ""),
    agentUpdateAt: row.agent_update_at || null,
    supportedLayoutModes: safeJsonParse(row.supported_layout_modes, []),
    printConfig: safeJsonParse(row.print_config, null),
    printConfigRev: Number(row.print_config_rev || 0),
    printConfigAppliedRev: Number(row.print_config_applied_rev || 0),
    printConfigUpdatedAt: row.print_config_updated_at || null,
    provisionSource: String(row.provision_source || "legacy"),
    provisionedAt: row.provisioned_at || null,
    lastSeenAt: row.last_seen_at || null,
    createdAt: row.created_at || null
  };
}

function mapAgentReleaseRow(row) {
  if (!row) return null;
  return {
    releaseId: String(row.release_id || ""),
    version: String(row.version || ""),
    filePath: String(row.file_path || ""),
    sha256: String(row.sha256 || ""),
    size: Number(row.size || 0),
    note: String(row.note || ""),
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
    storeOwnerAccountId: String(row.store_owner_account_id || ""),
    creatorAccountId: String(row.creator_account_id || ""),
    metadata: safeJsonParse(row.metadata, {}),
    copies: Number(row.copies || 1),
    completedCopies: Number(row.completed_copies || 0),
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

    CREATE TABLE IF NOT EXISTS agent_releases (
      release_id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      file_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
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
  ensureDeviceColumn("supported_layout_modes", "TEXT NOT NULL DEFAULT '[]'");
  // 设备级打印参数：rev 每次保存加一，设备上报已应用版本，心跳据此判断是否需要下发。
  ensureDeviceColumn("print_config", "TEXT NOT NULL DEFAULT ''");
  ensureDeviceColumn("print_config_rev", "INTEGER NOT NULL DEFAULT 0");
  ensureDeviceColumn("print_config_applied_rev", "INTEGER NOT NULL DEFAULT 0");
  ensureDeviceColumn("print_config_updated_at", "TEXT");
  // 远程更新状态：'' 表示从未推送，pending 等待设备拉取，applied 已写入待重启确认，succeeded 已确认，failed 失败。
  for (const [name, definition] of Object.entries({
    agent_version: "TEXT NOT NULL DEFAULT ''",
    agent_release_id: "TEXT NOT NULL DEFAULT ''",
    agent_previous_version: "TEXT NOT NULL DEFAULT ''",
    agent_previous_release_id: "TEXT NOT NULL DEFAULT ''",
    agent_update_state: "TEXT NOT NULL DEFAULT ''",
    agent_update_kind: "TEXT NOT NULL DEFAULT ''",
    agent_update_target_release_id: "TEXT NOT NULL DEFAULT ''",
    agent_update_target_version: "TEXT NOT NULL DEFAULT ''",
    agent_update_error: "TEXT NOT NULL DEFAULT ''",
    agent_update_at: "TEXT"
  })) {
    ensureDeviceColumn(name, definition);
  }
  const jobColumns = db.prepare("PRAGMA table_info(print_jobs)").all().map((column) => column.name);
  for (const [name, definition] of Object.entries({
    store_owner_account_id: "TEXT NOT NULL DEFAULT ''", creator_account_id: "TEXT NOT NULL DEFAULT ''",
    metadata: "TEXT NOT NULL DEFAULT '{}'", copies: "INTEGER NOT NULL DEFAULT 1", completed_copies: "INTEGER NOT NULL DEFAULT 0"
  })) {
    if (!jobColumns.includes(name)) db.exec(`ALTER TABLE print_jobs ADD COLUMN ${name} ${definition}`);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_print_jobs_owner ON print_jobs(store_owner_account_id, created_at)");

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

  function updatePrintConfig(deviceId, config) {
    const device = readDeviceByDeviceIdStatement.get(String(deviceId || ""));
    if (!device) return null;
    db.prepare(`
      UPDATE print_devices
      SET print_config = ?, print_config_rev = print_config_rev + 1, print_config_updated_at = ?
      WHERE device_id = ?
    `).run(JSON.stringify(config || {}), nowIso(), String(deviceId || ""));
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
    firmwareVersion = "",
    agentVersion = "",
    agentReleaseId = "",
    agentPreviousVersion = "",
    agentPreviousReleaseId = "",
    supportedLayoutModes = [],
    printConfigAppliedRev = -1
  } = {}) {
    const safeReasons = Array.isArray(reasons) ? reasons.map((item) => String(item || "")).filter(Boolean) : [];
    const now = nowIso();
    const assignments = [
      "status = 'online'",
      "printer_state = ?",
      "printer_reasons = ?",
      "last_seen_at = ?",
      "provisioned_at = COALESCE(provisioned_at, ?)",
      "supported_layout_modes = ?"
    ];
    const modes = Array.isArray(supportedLayoutModes) ? supportedLayoutModes.filter((mode) => mode === "2up" || mode === "custom-sheet-v1") : [];
    const values = [String(printerState || "unknown"), JSON.stringify(safeReasons), now, now, JSON.stringify(modes)];
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
    const normalizedAgentVersion = String(agentVersion || "").trim().slice(0, 40);
    if (normalizedAgentVersion) {
      assignments.push("agent_version = ?");
      values.push(normalizedAgentVersion);
    }
    const normalizedReleaseId = String(agentReleaseId || "").trim().slice(0, 64);
    if (normalizedReleaseId) {
      assignments.push("agent_release_id = ?");
      values.push(normalizedReleaseId);
    }
    const normalizedPrevious = String(agentPreviousVersion || "").trim().slice(0, 40);
    if (normalizedPrevious) {
      assignments.push("agent_previous_version = ?");
      values.push(normalizedPrevious);
    }
    const normalizedPreviousReleaseId = String(agentPreviousReleaseId || "").trim().slice(0, 64);
    if (normalizedPreviousReleaseId) {
      assignments.push("agent_previous_release_id = ?");
      values.push(normalizedPreviousReleaseId);
    }
    const normalizedAppliedRev = Number(printConfigAppliedRev);
    if (Number.isInteger(normalizedAppliedRev) && normalizedAppliedRev >= 0) {
      assignments.push("print_config_applied_rev = ?");
      values.push(normalizedAppliedRev);
    }
    values.push(String(deviceId || ""));
    db.prepare(`
      UPDATE print_devices
      SET ${assignments.join(", ")}
      WHERE device_id = ?
    `).run(...values);
    return mapDeviceRow(readDeviceByDeviceIdStatement.get(String(deviceId || "")));
  }

  function createAgentRelease({ releaseId, version, filePath, sha256, size, note = "" } = {}) {
    db.prepare(`
      INSERT INTO agent_releases (release_id, version, file_path, sha256, size, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(releaseId || ""),
      String(version || ""),
      String(filePath || ""),
      String(sha256 || "").toLowerCase(),
      Number(size || 0),
      String(note || "").slice(0, 200),
      nowIso()
    );
    return readAgentRelease(releaseId);
  }

  function readAgentRelease(releaseId) {
    return mapAgentReleaseRow(
      db.prepare("SELECT * FROM agent_releases WHERE release_id = ?").get(String(releaseId || ""))
    );
  }

  function listAgentReleases(limit = 20) {
    return db.prepare("SELECT * FROM agent_releases ORDER BY created_at DESC, release_id DESC LIMIT ?")
      .all(Math.max(1, Math.min(100, Math.trunc(Number(limit) || 20))))
      .map(mapAgentReleaseRow);
  }

  function queueAgentUpdate(deviceIds, release) {
    const now = nowIso();
    const statement = db.prepare(`
      UPDATE print_devices
      SET agent_update_state = 'pending',
          agent_update_kind = 'release',
          agent_update_target_release_id = ?,
          agent_update_target_version = ?,
          agent_update_error = '',
          agent_update_at = ?
      WHERE device_id = ?
    `);
    let queued = 0;
    const skipped = [];
    for (const deviceId of deviceIds) {
      const info = statement.run(
        String(release.releaseId || ""),
        String(release.version || ""),
        now,
        String(deviceId || "")
      );
      if (Number(info.changes || 0) > 0) queued += 1;
      else skipped.push(String(deviceId || ""));
    }
    return { queued, skipped };
  }

  function queueAgentRollback(deviceIds) {
    const now = nowIso();
    const statement = db.prepare(`
      UPDATE print_devices
      SET agent_update_state = 'pending',
          agent_update_kind = 'rollback',
          agent_update_target_release_id = ?,
          agent_update_target_version = ?,
          agent_update_error = '',
          agent_update_at = ?
      WHERE device_id = ?
    `);
    let queued = 0;
    const skipped = [];
    for (const deviceId of deviceIds) {
      const row = readDeviceByDeviceIdStatement.get(String(deviceId || ""));
      const previousVersion = String(row?.agent_previous_version || "");
      const previousReleaseId = String(row?.agent_previous_release_id || "");
      if (!row || !previousVersion) {
        skipped.push(String(deviceId || ""));
        continue;
      }
      const info = statement.run(previousReleaseId, previousVersion, now, String(deviceId || ""));
      if (Number(info.changes || 0) > 0) queued += 1;
      else skipped.push(String(deviceId || ""));
    }
    return { queued, skipped };
  }

  // 心跳时把待执行的更新任务带给设备；只有 pending 才下发，避免重复安装。
  function takeAgentUpdate(deviceId) {
    const row = readDeviceByDeviceIdStatement.get(String(deviceId || ""));
    if (!row) return null;
    if (String(row.agent_update_state || "") !== "pending") return null;
    const kind = String(row.agent_update_kind || "");
    const targetVersion = String(row.agent_update_target_version || "");
    const targetReleaseId = String(row.agent_update_target_release_id || "");

    if (kind === "release") {
      if (!targetReleaseId) return null;
      // 设备已经装过这一版（上次回报丢失等），直接补记成功，避免反复下载。
      if (String(row.agent_version || "") === targetVersion && String(row.agent_release_id || "") === targetReleaseId) {
        db.prepare(`
          UPDATE print_devices SET agent_update_state = 'succeeded', agent_update_error = '', agent_update_at = ?
          WHERE device_id = ?
        `).run(nowIso(), String(deviceId || ""));
        return null;
      }
      const release = readAgentRelease(targetReleaseId);
      if (!release) return null;
      return {
        kind: "release",
        releaseId: release.releaseId,
        version: release.version,
        sha256: release.sha256,
        size: release.size,
        downloadUrl: `/api/print-agent/updates/${encodeURIComponent(release.releaseId)}/file`
      };
    }
    if (kind === "rollback" && targetVersion) {
      return { kind: "rollback", version: targetVersion };
    }
    return null;
  }

  function recordAgentUpdateResult(deviceId, {
    state = "",
    kind = "",
    releaseId = "",
    version = "",
    error = ""
  } = {}) {
    const row = readDeviceByDeviceIdStatement.get(String(deviceId || ""));
    if (!row || !["applied", "failed", "succeeded"].includes(state)) return null;
    const now = nowIso();
    const nextVersion = String(version || "").trim().slice(0, 40);
    const nextReleaseId = String(releaseId || "").trim().slice(0, 64);

    if (state === "failed") {
      db.prepare(`
        UPDATE print_devices
        SET agent_update_state = 'failed', agent_update_error = ?, agent_update_at = ?
        WHERE device_id = ?
      `).run(String(error || "更新失败").slice(0, 300), now, String(deviceId || ""));
    } else {
      const assignments = ["agent_update_state = ?", "agent_update_error = ''", "agent_update_at = ?"];
      const values = [state, now];
      if (nextVersion) {
        assignments.push("agent_version = ?");
        values.push(nextVersion);
      }
      if (kind === "release" && nextReleaseId) {
        assignments.push("agent_release_id = ?");
        values.push(nextReleaseId);
      }
      values.push(String(deviceId || ""));
      db.prepare(`
        UPDATE print_devices SET ${assignments.join(", ")} WHERE device_id = ?
      `).run(...values);
    }
    return mapDeviceRow(readDeviceByDeviceIdStatement.get(String(deviceId || "")));
  }

  // 设备重启后带着新版本心跳，才算真正更新成功。
  function confirmAgentUpdateFromHeartbeat(deviceId, { agentVersion = "", agentReleaseId = "" } = {}) {
    const row = readDeviceByDeviceIdStatement.get(String(deviceId || ""));
    if (!row) return null;
    const state = String(row.agent_update_state || "");
    if (state !== "pending" && state !== "applied") return mapDeviceRow(row);
    const kind = String(row.agent_update_kind || "");
    const targetVersion = String(row.agent_update_target_version || "");
    const targetReleaseId = String(row.agent_update_target_release_id || "");
    const version = String(agentVersion || "").trim();
    const releaseId = String(agentReleaseId || "").trim();
    // 有 releaseId 时必须匹配 releaseId，避免版本号忘了递增时被误判为已更新。
    const matched = targetReleaseId
      ? releaseId === targetReleaseId
      : Boolean(targetVersion && version === targetVersion);
    if (!matched) return mapDeviceRow(row);
    db.prepare(`
      UPDATE print_devices SET agent_update_state = 'succeeded', agent_update_error = '', agent_update_at = ?
      WHERE device_id = ?
    `).run(nowIso(), String(deviceId || ""));
    return mapDeviceRow(readDeviceByDeviceIdStatement.get(String(deviceId || "")));
  }

  function createPrintJob({
    orderId,
    deviceId = "",
    imageUrls = [],
    status = "queued",
    errorMessage = "",
    layoutMode = "2up",
    storeOwnerAccountId = "", creatorAccountId = "", metadata = {}, copies = 1
  }) {
    const existing = findPrintJobByOrder(orderId);
    if (existing) return existing;
    const info = db.prepare(`
      INSERT INTO print_jobs (order_id, device_id, status, image_urls, layout_mode, error_message, created_at, store_owner_account_id, creator_account_id, metadata, copies)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      String(orderId || ""),
      String(deviceId || ""),
      String(status || "queued"),
      JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []),
      String(layoutMode || "2up"),
      String(errorMessage || ""),
      nowIso(), String(storeOwnerAccountId), String(creatorAccountId), JSON.stringify(metadata), copies
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

  function claimNextJob(deviceId, supportedLayoutModes = ["2up"]) {
    const modes = supportedLayoutModes.filter((mode) => mode === "2up" || mode === "custom-sheet-v1");
    if (!modes.length) return null;
    const candidate = db.prepare(`
      SELECT id FROM print_jobs
      WHERE device_id = ? AND status = 'queued' AND layout_mode IN (${modes.map(() => "?").join(",")})
      ORDER BY id ASC LIMIT 1
    `).get(String(deviceId || ""), ...modes);
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

  function retryPrintJob(jobId, { deviceId = "", completedCopies } = {}) {
    const job = readPrintJob(jobId);
    if (!job || job.status !== "failed") return job;
    // 失败任务可能是创建时没有设备（device_id 为空），重试时补绑当前设备，否则代理永远领不到。
    const nextDeviceId = job.layoutMode === "custom-sheet-v1" ? String(deviceId || job.deviceId) : String(job.deviceId || "").trim() || String(deviceId || "").trim();
    if (job.layoutMode === "custom-sheet-v1" && (!Number.isInteger(completedCopies) || completedCopies < 0 || completedCopies > job.copies)) throw new Error("请核对已出纸份数");
    const confirmedComplete = job.layoutMode === "custom-sheet-v1" && completedCopies === job.copies;
    db.prepare(`
      UPDATE print_jobs SET status = ?, device_id = ?, completed_copies = ?, error_message = '', claimed_at = NULL, finished_at = ?
      WHERE id = ?
    `).run(confirmedComplete ? "printed" : "queued", nextDeviceId, completedCopies ?? job.completedCopies, confirmedComplete ? nowIso() : null, Number(jobId));
    return mapJobRow(readJobStatement.get(Number(jobId)));
  }

  function requeueStaleJobs(staleBeforeIso) {
    const cutoff = staleBeforeIso || new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const info = db.prepare(`
      UPDATE print_jobs SET status = 'queued', claimed_at = NULL
      WHERE status = 'claimed' AND layout_mode <> 'custom-sheet-v1' AND claimed_at IS NOT NULL AND claimed_at < ?
    `).run(cutoff);
    return Number(info.changes || 0);
  }

  function updateCustomProgress(jobId, completedCopies, attempt) {
    const job = readPrintJob(jobId);
    if (!job || job.layoutMode !== "custom-sheet-v1" || job.status !== "claimed" || job.attempt !== attempt || !Number.isInteger(completedCopies) || completedCopies < job.completedCopies || completedCopies > job.copies) return null;
    db.prepare("UPDATE print_jobs SET completed_copies = ?, claimed_at = ? WHERE id = ? AND status = 'claimed' AND attempt = ?")
      .run(completedCopies, nowIso(), job.id, attempt);
    return readPrintJob(job.id);
  }

  function expireStaleCustomJobs() {
    return db.prepare(`UPDATE print_jobs SET status = 'failed', error_message = '打印进度中断，请核对实际出纸份数后重试', finished_at = ?
      WHERE layout_mode = 'custom-sheet-v1' AND status = 'claimed' AND claimed_at < ?`)
      .run(nowIso(), new Date(Date.now() - 10 * 60 * 1000).toISOString()).changes;
  }

  function listMerchantTaskReferences({ ownerId, visitorIds = [], paidFrom = "", page = 1, limit = 20 }) {
    const ownership = visitorIds.length ? `(store_owner_account_id = ? OR visitor_id IN (${visitorIds.map(() => "?").join(",")}))` : "store_owner_account_id = ?";
    const query = `SELECT 'order' AS kind, id, COALESCE(paid_at, created_at) AS sort_at FROM orders
      WHERE ${ownership} AND payment_status = 'paid' AND experience_type <> 'body-book' ${paidFrom ? "AND paid_at >= ?" : ""}
      UNION ALL SELECT 'custom' AS kind, CAST(id AS TEXT) AS id, created_at AS sort_at FROM print_jobs
      WHERE store_owner_account_id = ? AND layout_mode = 'custom-sheet-v1' ${paidFrom ? "AND created_at >= ?" : ""}`;
    const params = [ownerId, ...visitorIds, ...(paidFrom ? [paidFrom] : []), ownerId, ...(paidFrom ? [paidFrom] : [])];
    const total = Number(db.prepare(`SELECT COUNT(*) AS total FROM (${query})`).get(...params).total);
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 20)));
    const safePage = Math.min(Math.max(1, Math.trunc(Number(page) || 1)), Math.max(1, Math.ceil(total / safeLimit)));
    const items = db.prepare(`SELECT * FROM (${query}) ORDER BY sort_at DESC, kind, id DESC LIMIT ? OFFSET ?`).all(...params, safeLimit, (safePage - 1) * safeLimit);
    return { total, page: safePage, limit: safeLimit, items };
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
    updatePrintConfig,
    deletePrintDevice,
    touchPrintDevice,
    createAgentRelease,
    readAgentRelease,
    listAgentReleases,
    queueAgentUpdate,
    queueAgentRollback,
    takeAgentUpdate,
    recordAgentUpdateResult,
    confirmAgentUpdateFromHeartbeat,
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
    requeueStaleJobs,
    updateCustomProgress, expireStaleCustomJobs, listMerchantTaskReferences,
    close: () => db.close()
  };
}
