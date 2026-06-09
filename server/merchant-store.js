import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

function nowIso() {
  return new Date().toISOString();
}

function normalizeMerchantId(value, fallback = "") {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 24);
  return normalized || fallback;
}

function generateMerchantId() {
  return `m${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeMerchantStatus(value) {
  return String(value || "").trim().toLowerCase() === "inactive" ? "inactive" : "active";
}

function normalizeCommissionRateBps(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.min(Math.max(Math.round(next), 0), 10000);
}

function normalizeMerchantNote(value) {
  return String(value || "").trim().slice(0, 500);
}

function normalizeMerchantName(value) {
  return String(value || "").trim().slice(0, 80);
}

function normalizeMerchant(merchant = {}) {
  const createdAt = merchant.createdAt || nowIso();
  const updatedAt = merchant.updatedAt || createdAt;
  return {
    id: normalizeMerchantId(merchant.id, generateMerchantId()),
    name: normalizeMerchantName(merchant.name),
    status: normalizeMerchantStatus(merchant.status),
    commissionRateBps: normalizeCommissionRateBps(merchant.commissionRateBps),
    note: normalizeMerchantNote(merchant.note),
    createdAt,
    updatedAt
  };
}

export function createMerchantStore({ filePath }) {
  async function readMerchants() {
    try {
      const payload = JSON.parse(await readFile(filePath, "utf-8"));
      if (!Array.isArray(payload)) return [];
      return payload
        .map((merchant) => normalizeMerchant(merchant))
        .filter((merchant, index, list) => list.findIndex((item) => item.id === merchant.id) === index)
        .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
    } catch (error) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  }

  async function saveMerchants(merchants) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const safeMerchants = merchants.map((merchant) => normalizeMerchant(merchant));
    await writeFile(filePath, `${JSON.stringify(safeMerchants, null, 2)}\n`, "utf-8");
    return safeMerchants;
  }

  async function listMerchants() {
    return readMerchants();
  }

  async function readMerchantById(id) {
    const merchants = await readMerchants();
    const merchantId = normalizeMerchantId(id);
    return merchants.find((merchant) => merchant.id === merchantId) || null;
  }

  async function createMerchant(payload) {
    const merchants = await readMerchants();
    const now = nowIso();
    const merchant = normalizeMerchant({
      ...payload,
      id: normalizeMerchantId(payload?.id, generateMerchantId()),
      createdAt: now,
      updatedAt: now
    });

    if (!merchant.name) {
      const error = new Error("请填写商户名称。");
      error.status = 400;
      throw error;
    }
    if (merchants.some((item) => item.id === merchant.id)) {
      const error = new Error("商户 ID 已存在，请更换后重试。");
      error.status = 409;
      throw error;
    }

    await saveMerchants(merchants.concat(merchant));
    return merchant;
  }

  async function updateMerchant(id, patch = {}) {
    const merchants = await readMerchants();
    const merchantId = normalizeMerchantId(id);
    const index = merchants.findIndex((merchant) => merchant.id === merchantId);
    if (index < 0) return null;

    const next = normalizeMerchant({
      ...merchants[index],
      name: patch.name === undefined ? merchants[index].name : patch.name,
      status: patch.status === undefined ? merchants[index].status : patch.status,
      commissionRateBps: patch.commissionRateBps === undefined ? merchants[index].commissionRateBps : patch.commissionRateBps,
      note: patch.note === undefined ? merchants[index].note : patch.note,
      id: merchants[index].id,
      updatedAt: nowIso()
    });

    if (!next.name) {
      const error = new Error("请填写商户名称。");
      error.status = 400;
      throw error;
    }

    merchants[index] = next;
    await saveMerchants(merchants);
    return next;
  }

  async function deleteMerchant(id) {
    const merchants = await readMerchants();
    const merchantId = normalizeMerchantId(id);
    const index = merchants.findIndex((merchant) => merchant.id === merchantId);
    if (index < 0) return null;
    const [removed] = merchants.splice(index, 1);
    await saveMerchants(merchants);
    return removed;
  }

  return {
    createMerchant,
    deleteMerchant,
    listMerchants,
    readMerchantById,
    saveMerchants,
    updateMerchant
  };
}
