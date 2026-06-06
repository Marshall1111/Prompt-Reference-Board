import express from "express";
import multer from "multer";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createHash, createPrivateKey, createPublicKey, createSign, createVerify, randomUUID, timingSafeEqual } from "node:crypto";
import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createOrderStore } from "./order-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataPath = path.join(rootDir, "data", "styles.json");
const styleGroupsPath = path.join(rootDir, "data", "style-groups.json");
const imageJobRoot = path.join(rootDir, "data", "image-jobs");
const drawCardSessionRoot = path.join(rootDir, "data", "draw-card-sessions");
const tempReferenceRoot = path.join(rootDir, "data", "temp-image-references");
const visitorStateRoot = path.join(rootDir, "data", "visitor-states");
const inviteCodePath = path.join(rootDir, "data", "invite-codes.json");
const adminSessionRoot = path.join(rootDir, "data", "admin-sessions");
const appSettingsPath = path.join(rootDir, "data", "app-settings.json");
const orderDbPath = path.join(rootDir, "data", "orders.sqlite");
const storageBackupRoot = path.join(rootDir, "data", "storage-backups");
const storageExportTempRoot = path.join(rootDir, "data", "storage-export-temp");
const previewRoot = path.join(rootDir, "public", "style-previews");
const generatedImageRoot = path.join(rootDir, "data", "private-generated-images");
const generatedPreviewRoot = path.join(rootDir, "public", "generated-previews");
const generatedThumbnailRoot = path.join(rootDir, "public", "generated-thumbnails");
const legacyGeneratedImageRoot = path.join(rootDir, "public", "generated-images");
const jobReferenceRoot = path.join(rootDir, "data", "private-job-references");
const jobReferenceThumbnailRoot = path.join(rootDir, "public", "job-reference-thumbnails");
const miniDataPath = path.join(rootDir, "wechat-miniprogram", "miniprogram", "data", "styles.js");
const miniImageRoot = path.join(rootDir, "wechat-miniprogram", "miniprogram", "images-small");
const miniCompressScript = path.join(rootDir, "tools", "compress_for_miniprogram.ps1");
const execFileAsync = promisify(execFile);
const RESULT_THUMBNAIL_MAX_EDGE = 384;
const PUBLIC_PREVIEW_MAX_EDGE = 1536;
const REFERENCE_THUMBNAIL_MAX_EDGE = 240;
const DRAW_CARD_GROUP_NAME = "抽卡";
const FRIDGE_MAGNET_GROUP_NAME = "冰箱贴";
const DRAW_CARD_DEFAULT_SIZE = "1024x1536";
const STYLE_GROUP_SIZE_OPTIONS = new Set(["1024x1536", "1536x1024", "1024x1024", "1024x1365", "1365x1024"]);
const DRAW_CARD_WAITING_MESSAGE = "仪式正在进行，请稍候。";
const DRAW_CARD_SUCCESS_MESSAGE = "结果已准备好。";
const DRAW_CARD_FAILURE_MESSAGE = "这一轮未能顺利完成，请重新开始。";
const PUBLIC_PREVIEW_WATERMARK_TEXT = "Preview Only";
const VISITOR_COOKIE_NAME = "pg_visitor";
const ADMIN_COOKIE_NAME = "pg_admin";
const VISITOR_INVITE_BONUS = 5;
const VISITOR_RUNNING_JOB_LIMIT = 1;
const VISITOR_RATE_WINDOW_MS = 10 * 60 * 1000;
const VISITOR_RATE_LIMIT = 6;
const IP_RATE_WINDOW_MS = 10 * 60 * 1000;
const IP_RATE_LIMIT = 8;
const ADMIN_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const INVITE_DEFAULT_MAX_REDEMPTIONS = 1;
const DEFAULT_CONTACT_MESSAGE = "如需更多生图机会，请联系客服填写邀请码。";
const DEFAULT_VISITOR_ANONYMOUS_LIMIT = 5;
const DEFAULT_STORAGE_CLEANUP_DAYS = 30;
const MAX_STORAGE_CLEANUP_DAYS = 3650;
const DEFAULT_FRIDGE_ORDERING_ENABLED = false;
const DEFAULT_FRIDGE_MAGNET_UNIT_PRICE_CENTS = 1990;
const DEFAULT_SINGLE_ITEM_SHIPPING_FEE_CENTS = 800;
const DEFAULT_FREE_SHIPPING_ITEM_COUNT = 2;
const ORDER_PAYMENT_EXPIRE_MS = 30 * 60 * 1000;
const ORDER_SEARCH_LIMIT = 100;
const ORDER_PAYMENT_STATUS_VALUES = new Set(["unpaid", "paid", "failed", "expired"]);
const ORDER_FULFILLMENT_STATUS_VALUES = new Set(["new", "in_production", "shipped", "completed", "cancelled"]);
const BACKUP_KIND_CONFIG = "config-snapshot";
const BACKUP_KIND_IMAGE_RANGE = "image-range-zip";
const ADMIN_DRAW_CARD_SESSION_LIMIT = 3;
const DEFAULT_PUBLIC_EXPERIENCE_TYPE = "draw-card";
const PUBLIC_EXPERIENCE_CONFIGS = {
  "draw-card": {
    experienceType: "draw-card",
    label: "抽卡",
    styleGroupName: DRAW_CARD_GROUP_NAME,
    waitingMessage: DRAW_CARD_WAITING_MESSAGE,
    successMessage: DRAW_CARD_SUCCESS_MESSAGE,
    failureMessage: DRAW_CARD_FAILURE_MESSAGE,
    unavailableMessage: "抽卡暂时不可用，请稍后再试。",
    missingSessionMessage: "本次抽卡记录不存在或已失效。",
    latestMissingMessage: "当前没有可恢复的抽卡进度。",
    readFailureMessage: "读取抽卡状态失败，请稍后再试。",
    restoreFailureMessage: "恢复抽卡进度失败，请稍后再试。",
    runningLimitMessage: "当前已有进行中的抽卡，请等待这一轮完成。",
    promptSuffix: ""
  },
  "fridge-magnet": {
    experienceType: "fridge-magnet",
    label: "冰箱贴",
    styleGroupName: FRIDGE_MAGNET_GROUP_NAME,
    waitingMessage: "冰箱贴正在制作，请稍候。",
    successMessage: "冰箱贴结果已准备好。",
    failureMessage: "这一轮冰箱贴未能顺利完成，请重新开始。",
    unavailableMessage: "冰箱贴暂时不可用，请稍后再试。",
    missingSessionMessage: "本次冰箱贴记录不存在或已失效。",
    latestMissingMessage: "当前没有可恢复的冰箱贴进度。",
    readFailureMessage: "读取冰箱贴状态失败，请稍后再试。",
    restoreFailureMessage: "恢复冰箱贴进度失败，请稍后再试。",
    runningLimitMessage: "当前已有进行中的冰箱贴，请等待这一轮完成。",
    promptSuffix: ""
  }
};

let sharpModulePromise;
const visitorRequestLog = new Map();
const ipRequestLog = new Map();
const orderStore = createOrderStore({ dbPath: orderDbPath });

loadLocalEnv();

const app = express();
const port = Number(process.env.PORT || 3000);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(["image/jpeg", "image/png", "image/webp", "image/svg+xml"]);
    const ok = allowed.has(file.mimetype);
    cb(ok ? null : new Error("UNSUPPORTED_IMAGE_TYPE"), ok);
  }
});
const activeImageJobs = new Map();
const drawCardSessionSyncLocks = new Map();

function nowMs() {
  return Date.now();
}

function elapsedMs(startMs) {
  return Math.max(0, Math.round(nowMs() - Number(startMs || 0)));
}

function normalizeTelemetryNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function summarizeDrawCardJobStatuses(items) {
  const summary = {
    total: Array.isArray(items) ? items.length : 0,
    queued: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    cancelled: 0
  };
  (items || []).forEach((item) => {
    const status = String(item?.status || "queued");
    if (Object.prototype.hasOwnProperty.call(summary, status)) {
      summary[status] += 1;
    }
  });
  return summary;
}

function logDrawCardTelemetry(event, fields = {}) {
  const payload = {
    type: "draw_card_telemetry",
    event: String(event || ""),
    at: new Date().toISOString()
  };

  Object.entries(fields).forEach(([key, value]) => {
    if (value === undefined) return;
    payload[key] = value;
  });

  console.log(JSON.stringify(payload));
}

function beginDrawCardRequestTelemetry(req, _res, next) {
  req.drawCardRequestStartedAtMs = nowMs();
  req.drawCardTraceId = String(req.get("x-draw-trace-id") || "").trim() || randomUUID();
  logDrawCardTelemetry("request_arrived", {
    traceId: req.drawCardTraceId,
    method: req.method,
    path: req.originalUrl || req.url,
    ip: req.ip || ""
  });
  next();
}

function parseDrawCardClientMetrics(body) {
  const safeBody = body && typeof body === "object" ? body : {};
  const wasCompressedRaw = String(safeBody.clientWasCompressed || "").trim().toLowerCase();
  return {
    prepareReferenceMs: normalizeTelemetryNumber(safeBody.clientPrepareReferenceMs),
    originalBytes: normalizeTelemetryNumber(safeBody.clientOriginalFileBytes),
    uploadedBytes: normalizeTelemetryNumber(safeBody.clientUploadedFileBytes),
    originalWidth: normalizeTelemetryNumber(safeBody.clientOriginalWidth),
    originalHeight: normalizeTelemetryNumber(safeBody.clientOriginalHeight),
    uploadedWidth: normalizeTelemetryNumber(safeBody.clientUploadedWidth),
    uploadedHeight: normalizeTelemetryNumber(safeBody.clientUploadedHeight),
    wasCompressed: ["1", "true", "yes"].includes(wasCompressedRaw)
  };
}

function normalizePublicExperienceType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return PUBLIC_EXPERIENCE_CONFIGS[normalized] ? normalized : DEFAULT_PUBLIC_EXPERIENCE_TYPE;
}

function getPublicExperienceConfig(value) {
  return PUBLIC_EXPERIENCE_CONFIGS[normalizePublicExperienceType(value)];
}

function buildPublicExperiencePrompt(prompt, config) {
  const basePrompt = String(prompt || "").trim();
  const suffix = String(config?.promptSuffix || "").trim();
  if (!suffix) return basePrompt;
  if (!basePrompt) return suffix;
  return `${basePrompt}\n\n${suffix}`;
}

app.use(express.json({ limit: "1mb" }));
app.use(visitorSessionMiddleware);
app.use(adminSessionMiddleware);

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "prompt-gallery" });
});

app.get("/api/visitor-state", async (req, res) => {
  try {
    const visitor = await getVisitorState(req);
    res.json(toPublicVisitorState(visitor));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取访客状态失败，请稍后再试。" });
  }
});

app.get("/api/orders/config", async (_req, res) => {
  try {
    const settings = await readAppSettings();
    res.json(getOrderPricingSnapshot(settings));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取下单配置失败。" });
  }
});

app.post("/api/invite-codes/redeem", async (req, res) => {
  try {
    const code = String(req.body?.code || "").trim();
    if (!code) {
      return res.status(400).json({ message: "请输入邀请码。" });
    }

    const visitor = await redeemInviteCode(req, code);
    res.json(toPublicVisitorState(visitor));
  } catch (error) {
    console.error(error);
    res.status(error.status || 400).json({ message: error.publicMessage || "邀请码兑换失败，请稍后再试。" });
  }
});

app.post("/api/orders", async (req, res, next) => {
  try {
    enforcePublicRateLimits(req);
    orderStore.expireUnpaidOrders();

    const settings = await readAppSettings();
    const pricing = getOrderPricingSnapshot(settings);
    if (!pricing.enabled) throw createHttpError(403, "冰箱贴下单暂未开放。");

    const experienceType = normalizePublicExperienceType(req.body?.experienceType || "fridge-magnet");
    if (experienceType !== "fridge-magnet") throw createHttpError(400, "当前仅支持冰箱贴下单。");

    const rawJobIds = Array.isArray(req.body?.jobIds) ? req.body.jobIds : [];
    const jobIds = [...new Set(rawJobIds.map((item) => String(item || "").trim()).filter(Boolean))];
    if (!jobIds.length) throw createHttpError(400, "请先选择要下单的冰箱贴。");

    const address = normalizeOrderAddress(req.body || {});
    assertValidOrderAddress(address);

    const jobs = await Promise.all(jobIds.map((jobId) => readImageJob(jobId)));
    const likedJobs = jobs.filter(Boolean).filter((job) =>
      job.visibility === "public" &&
      job.ownerVisitorId === req.visitorId &&
      job.isLiked &&
      normalizePublicExperienceType(job.experienceType) === "fridge-magnet"
    );
    if (likedJobs.length !== jobIds.length) throw createHttpError(403, "只能下单当前口袋中的冰箱贴结果。");

    const amount = calculateOrderAmounts(likedJobs.length, pricing);
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ORDER_PAYMENT_EXPIRE_MS).toISOString();
    const orderId = randomUUID();
    const created = orderStore.createOrder({
      order: {
        id: orderId,
        orderNo: generateOrderNo(),
        visitorId: req.visitorId,
        publicToken: randomUUID(),
        experienceType: "fridge-magnet",
        paymentStatus: "unpaid",
        fulfillmentStatus: "new",
        itemCount: amount.itemCount,
        unitPriceCents: amount.unitPriceCents,
        shippingFeeCents: amount.shippingFeeCents,
        subtotalCents: amount.subtotalCents,
        totalCents: amount.totalCents,
        remark: address.remark,
        receiverName: address.receiverName,
        receiverPhone: address.receiverPhone,
        province: address.province,
        city: address.city,
        district: address.district,
        addressDetail: address.addressDetail,
        wechatOpenId: "",
        wechatTransactionId: "",
        outTradeNo: `FM${randomUUID().replace(/-/g, "")}`,
        lastPaymentChannel: "",
        lastPaymentError: "",
        expiresAt,
        createdAt,
        updatedAt: createdAt
      },
      items: likedJobs.map((job, index) => ({
        orderId,
        jobId: String(job.jobId || ""),
        styleId: String(job.styleId || ""),
        styleName: String(job.styleName || ""),
        imageUrl: String(job.result?.previewUrl || job.result?.thumbnailUrl || ""),
        thumbnailUrl: String(job.result?.thumbnailUrl || job.result?.previewUrl || ""),
        sortOrder: index
      })),
      initialPaymentEvent: {
        eventType: "order_created",
        eventId: `${orderId}:order_created`,
        success: true,
        payload: {
          itemCount: amount.itemCount,
          totalCents: amount.totalCents
        }
      }
    });

    res.status(201).json({
      order: toPublicOrder(created),
      payment: {
        availableChannels: ["wechat_jsapi", "wechat_h5"]
      }
    });
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders/:orderId/pay", async (req, res, next) => {
  try {
    enforcePublicRateLimits(req);
    orderStore.expireUnpaidOrders();

    const order = orderStore.readOrderWithRelations(req.params.orderId);
    assertOrderOwnership(req, order, String(req.body?.token || req.query?.token || ""));
    if (order.paymentStatus === "paid") {
      return res.json({
        order: toPublicOrder(order),
        payment: {
          status: "already_paid",
          returnUrl: buildOrderReturnUrl(req, order)
        }
      });
    }
    if (order.paymentStatus === "expired") throw createHttpError(409, "订单已过期，请重新下单。");
    if (order.paymentStatus !== "unpaid") throw createHttpError(409, "当前订单无法继续支付。");

    const requestedChannel = String(req.body?.channel || "").trim();
    const channel = requestedChannel || (isWechatBrowser(req) ? "wechat_jsapi" : "wechat_h5");
    const returnUrl = buildOrderReturnUrl(req, order);

    if (channel === "wechat_jsapi") {
      let openId = String(order.wechatOpenId || "").trim();
      const code = String(req.body?.wechatCode || req.query?.code || "").trim();
      if (!openId) {
        if (!code) {
          return res.status(202).json({
            order: toPublicOrder(order),
            payment: {
              status: "oauth_required",
              oauthUrl: createWechatAuthorizationUrl(req, order.id)
            }
          });
        }
        openId = await fetchWechatOpenId(code);
        orderStore.updateOrder(order.id, { wechatOpenId: openId });
      }

      const config = assertWechatPaymentConfigured({ requireOAuth: true });
      const payload = await callWechatPayApi("POST", "/v3/pay/transactions/jsapi", {
        appid: config.appId,
        mchid: config.mchId,
        description: `冰箱贴订单 ${order.orderNo}`,
        out_trade_no: order.outTradeNo,
        time_expire: order.expiresAt,
        notify_url: config.notifyUrl,
        amount: {
          total: order.totalCents,
          currency: "CNY"
        },
        payer: {
          openid: openId
        }
      });

      const nonceStr = randomUUID().replace(/-/g, "");
      const timeStamp = String(Math.floor(Date.now() / 1000));
      const paySign = signJsapiPayParams({
        appId: config.appId,
        timeStamp,
        nonceStr,
        prepayId: payload.prepay_id
      });

      const updated = orderStore.updateOrderAndAppendEvent(order.id, {
        lastPaymentChannel: "wechat_jsapi",
        lastPaymentError: ""
      }, {
        eventType: "payment_prepay",
        eventId: payload.prepay_id || `${order.id}:prepay:${Date.now()}`,
        success: true,
        payload
      });

      return res.json({
        order: toPublicOrder(updated),
        payment: {
          status: "ready",
          channel: "wechat_jsapi",
          returnUrl,
          jsapi: {
            appId: config.appId,
            timeStamp,
            nonceStr,
            package: `prepay_id=${payload.prepay_id}`,
            signType: "RSA",
            paySign
          }
        }
      });
    }

    if (channel !== "wechat_h5") throw createHttpError(400, "不支持的支付方式。");

    const config = assertWechatPaymentConfigured();
    const payload = await callWechatPayApi("POST", "/v3/pay/transactions/h5", {
      appid: config.appId,
      mchid: config.mchId,
      description: `冰箱贴订单 ${order.orderNo}`,
      out_trade_no: order.outTradeNo,
      time_expire: order.expiresAt,
      notify_url: config.notifyUrl,
      amount: {
        total: order.totalCents,
        currency: "CNY"
      },
      scene_info: {
        payer_client_ip: getClientIp(req),
        h5_info: {
          type: "Wap"
        }
      }
    });

    const updated = orderStore.updateOrderAndAppendEvent(order.id, {
      lastPaymentChannel: "wechat_h5",
      lastPaymentError: ""
    }, {
      eventType: "payment_prepay",
      eventId: payload.h5_url || `${order.id}:h5:${Date.now()}`,
      success: true,
      payload
    });

    res.json({
      order: toPublicOrder(updated),
      payment: {
        status: "ready",
        channel: "wechat_h5",
        returnUrl,
        h5Url: payload.h5_url
      }
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/orders/:orderId", async (req, res, next) => {
  try {
    orderStore.expireUnpaidOrders();
    const order = orderStore.readOrderWithRelations(req.params.orderId);
    assertOrderOwnership(req, order, String(req.query?.token || ""));
    res.json({ order: toPublicOrder(order) });
  } catch (error) {
    next(error);
  }
});

app.post("/api/payments/wechat/notify", express.text({ type: "*/*" }), async (req, res) => {
  try {
    const bodyText = String(req.body || "");
    verifyWechatNotifySignature(req, bodyText);
    const config = assertWechatPaymentConfigured();
    const payload = bodyText ? JSON.parse(bodyText) : {};
    const resource = payload.resource || {};
    const associatedData = String(resource.associated_data || "");
    const nonce = String(resource.nonce || "");
    const ciphertext = String(resource.ciphertext || "");
    if (!ciphertext || !nonce) throw createHttpError(400, "微信支付回调缺少加密数据。");

    const { createDecipheriv } = await import("node:crypto");
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(config.apiV3Key, "utf-8"), Buffer.from(nonce, "utf-8"));
    decipher.setAAD(Buffer.from(associatedData, "utf-8"));
    const encryptedBuffer = Buffer.from(ciphertext, "base64");
    const authTag = encryptedBuffer.subarray(encryptedBuffer.length - 16);
    const encrypted = encryptedBuffer.subarray(0, encryptedBuffer.length - 16);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf-8");
    const notifyData = JSON.parse(decrypted);

    const order = orderStore.readOrderByOutTradeNo(String(notifyData.out_trade_no || ""));
    if (!order) return res.status(404).json({ code: "ORDER_NOT_FOUND", message: "订单不存在" });

    const eventId = String(payload.id || notifyData.transaction_id || `${order.id}:notify:${Date.now()}`);
    if (order.paymentStatus !== "paid") {
      orderStore.updateOrderAndAppendEvent(order.id, {
        paymentStatus: "paid",
        lastPaymentError: "",
        wechatTransactionId: String(notifyData.transaction_id || ""),
        paidAt: String(notifyData.success_time || new Date().toISOString())
      }, {
        eventType: "payment_notify",
        eventId,
        success: true,
        payload: notifyData,
        headers: {
          serial: String(req.get("Wechatpay-Serial") || ""),
          nonce: String(req.get("Wechatpay-Nonce") || ""),
          signature: String(req.get("Wechatpay-Signature") || ""),
          timestamp: String(req.get("Wechatpay-Timestamp") || "")
        }
      });
    } else {
      orderStore.appendPaymentEvent({
        orderId: order.id,
        eventType: "payment_notify",
        eventId,
        success: true,
        payload: notifyData,
        headers: {
          serial: String(req.get("Wechatpay-Serial") || ""),
          nonce: String(req.get("Wechatpay-Nonce") || ""),
          signature: String(req.get("Wechatpay-Signature") || ""),
          timestamp: String(req.get("Wechatpay-Timestamp") || "")
        }
      });
    }

    res.json({ code: "SUCCESS", message: "成功" });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ code: "FAIL", message: error.publicMessage || "回调处理失败" });
  }
});

app.post("/api/admin/login", async (req, res) => {
  try {
    const username = String(req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    await verifyAdminCredentials(username, password);
    const session = await createAdminSession();
    setAdminCookie(req, res, session.sessionId);
    res.json({ ok: true, session: toPublicAdminSession(session) });
  } catch (error) {
    res.status(error.status || 401).json({ message: error.publicMessage || "登录失败。" });
  }
});

app.post("/api/admin/logout", async (req, res) => {
  try {
    if (req.adminSession?.sessionId) {
      await deleteAdminSession(req.adminSession.sessionId);
    }
    clearAdminCookie(req, res);
    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "退出登录失败。" });
  }
});

app.get("/api/admin/session", requireAdmin, async (req, res) => {
  res.json({ ok: true, session: toPublicAdminSession(req.adminSession) });
});

app.get("/api/styles", requireAdmin, async (_req, res) => {
  res.json(await readStyles());
});

app.get("/api/style-groups", requireAdmin, async (_req, res) => {
  res.json(await readStyleGroups());
});

app.get("/api/image-providers", requireAdmin, (_req, res) => {
  const providers = getImageProviders();
  res.json({
    defaultProvider: getDefaultProviderId(providers),
    providers: providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      model: provider.model
    }))
  });
});

app.post("/api/draw-card/sessions", beginDrawCardRequestTelemetry, upload.single("image"), async (req, res) => {
  return handleCreatePublicExperienceSession(req, res, "draw-card");
});

app.get("/api/draw-card/sessions/:sessionId", async (req, res) => {
  return handleGetPublicExperienceSession(req, res, "draw-card");
});

app.get("/api/draw-card/sessions/latest", async (req, res) => {
  return handleGetLatestPublicExperienceSession(req, res, "draw-card");
});

app.post("/api/fridge-magnet/sessions", beginDrawCardRequestTelemetry, upload.single("image"), async (req, res) => {
  return handleCreatePublicExperienceSession(req, res, "fridge-magnet");
});

app.get("/api/fridge-magnet/sessions/:sessionId", async (req, res) => {
  return handleGetPublicExperienceSession(req, res, "fridge-magnet");
});

app.get("/api/fridge-magnet/sessions/latest", async (req, res) => {
  return handleGetLatestPublicExperienceSession(req, res, "fridge-magnet");
});

async function handleCreatePublicExperienceSession(req, res, experienceType) {
  const config = getPublicExperienceConfig(experienceType);
  try {
    const visitor = await getVisitorState(req);
    if (!req.file) {
      return res.status(400).json({ message: "请先上传一张图片。" });
    }
    if (req.file.mimetype === "image/svg+xml") {
      return res.status(400).json({ message: "请上传 JPG、PNG 或 WebP 图片。" });
    }

    const clientMetrics = parseDrawCardClientMetrics(req.body);
    logDrawCardTelemetry("request_parsed", {
      traceId: req.drawCardTraceId,
      visitorId: visitor.visitorId,
      uploadParseMs: elapsedMs(req.drawCardRequestStartedAtMs),
      uploadedMimeType: req.file.mimetype,
      uploadedBytes: Number(req.file.size || req.file.buffer?.length || 0),
      clientPrepareReferenceMs: clientMetrics.prepareReferenceMs,
      clientOriginalFileBytes: clientMetrics.originalBytes,
      clientUploadedFileBytes: clientMetrics.uploadedBytes,
      clientOriginalWidth: clientMetrics.originalWidth,
      clientOriginalHeight: clientMetrics.originalHeight,
      clientUploadedWidth: clientMetrics.uploadedWidth,
      clientUploadedHeight: clientMetrics.uploadedHeight,
      clientWasCompressed: clientMetrics.wasCompressed
    });

    const estimatedCost = await estimateDrawCardQuotaCost();
    enforcePublicRateLimits(req);
    enforceVisitorQuota(visitor, estimatedCost);
    await enforceVisitorRunningJobLimit(visitor.visitorId, config);

    const session = await createDrawCardSession(req.file, visitor, {
      experienceType: config.experienceType,
      traceId: req.drawCardTraceId,
      requestStartedAtMs: req.drawCardRequestStartedAtMs,
      clientMetrics
    });
    res.status(202).json(toPublicDrawCardSession(session));
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "请上传 JPG、PNG 或 WebP 图片。" });
    }
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || config.unavailableMessage });
  }
}

async function handleGetPublicExperienceSession(req, res, experienceType) {
  const config = getPublicExperienceConfig(experienceType);
  try {
    const session = await readDrawCardSession(req.params.sessionId);
    if (!session || normalizePublicExperienceType(session.experienceType) !== config.experienceType) {
      return res.status(404).json({ message: config.missingSessionMessage });
    }
    assertVisitorOwnsSession(req, session, config);

    const syncedSession = await synchronizeDrawCardSession(session);
    res.json(toPublicDrawCardSession(syncedSession));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || config.readFailureMessage });
  }
}

async function handleGetLatestPublicExperienceSession(req, res, experienceType) {
  const config = getPublicExperienceConfig(experienceType);
  try {
    const session = await readLatestVisitorDrawCardSession(req.visitorId, config.experienceType);
    if (!session) {
      return res.status(404).json({ message: config.latestMissingMessage });
    }

    const syncedSession = await synchronizeDrawCardSession(session);
    res.json(toPublicDrawCardSession(syncedSession));
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || config.restoreFailureMessage });
  }
}

app.post("/api/sync-miniprogram", requireAdmin, async (_req, res) => {
  const styles = await readStyles();
  await syncMiniProgram(styles);
  res.json({ ok: true, count: styles.length });
});

app.post("/api/generate-image", requireAdmin, upload.array("reference", 10), async (req, res) => {
  try {
    const body = req.body || {};
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ message: "请先填写提示词。" });

    const providers = getImageProviders();
    const provider = resolveImageProvider(body.provider, providers);
    const providerChain = getProviderFallbackChain(body.provider, providers);
    if (!provider) {
      return res.status(400).json({ message: "请先在 .env 中配置至少一个可用的图片接口供应商。" });
    }

    const referenceIds = parseReferenceIds(body.referenceIds);
    const referenceFiles = await collectReferenceFiles(req.files || [], referenceIds);
    if (referenceFiles.length > 10) {
      return res.status(400).json({ message: "At most 10 reference images are allowed." });
    }
    if (referenceFiles.some((file) => file.mimetype === "image/svg+xml")) {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }

    const outputFormat = normalizeOption(body.output_format, ["png", "jpeg", "webp"], "png");
    const result = referenceFiles.length
      ? await createImageEdit(referenceFiles, prompt, outputFormat, provider, body)
      : await createImageGeneration(prompt, outputFormat, provider, body);

    res.json({
      ...result,
      provider: {
        id: provider.id,
        name: provider.name,
        model: provider.model
      }
    });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "生图失败，请稍后再试。" });
  }
});

app.post("/api/image-references", requireAdmin, upload.single("reference"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "Please choose a reference image." });
    if (req.file.mimetype === "image/svg+xml") {
      return res.status(400).json({ message: "Reference images only support JPG, PNG, or WebP." });
    }

    const reference = await createTemporaryReference(req.file);
    res.status(201).json({ reference });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "Reference images only support JPG, PNG, or WebP." });
    }
    console.error(error);
    res.status(500).json({ message: "Failed to upload reference image." });
  }
});

app.post("/api/image-jobs", requireAdmin, upload.array("reference", 10), async (req, res) => {
  try {
    const body = req.body || {};
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ message: "请先填写提示词。" });

    const providers = getImageProviders();
    const provider = resolveImageProvider(body.provider, providers);
    const providerChain = getProviderFallbackChain(body.provider, providers);
    if (!provider) {
      return res.status(400).json({ message: "请先在 .env 中配置至少一个可用的图片接口供应商。" });
    }

    const referenceIds = parseReferenceIds(body.referenceIds);
    const referenceFiles = await collectReferenceFiles(req.files || [], referenceIds);
    if (referenceFiles.some((file) => file.mimetype === "image/svg+xml")) {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }

    if (referenceFiles.length > 10) {
      return res.status(400).json({ message: "At most 10 reference images are allowed." });
    }

    const jobId = randomUUID();
    const originalReferences = await persistImageJobReferences(jobId, referenceFiles);
    await deleteTemporaryReferences(referenceIds);
    const now = new Date().toISOString();
    const job = {
      jobId,
      status: "queued",
      message: "任务已提交，等待生成。",
      result: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      prompt,
      size: normalizeSize(body.size),
      referenceCount: referenceFiles.length,
      originalReferences,
      styleId: String(body.styleId || ""),
      styleName: String(body.styleName || ""),
      styleGroupId: String(body.styleGroupId || ""),
      styleGroupName: String(body.styleGroupName || ""),
      provider: {
        id: provider.id,
        name: provider.name,
        model: provider.model
      },
      mode: referenceFiles.length ? "edit" : "generation",
      ownerVisitorId: "",
      visibility: "admin"
    };

    await saveImageJob(job);
    res.status(202).json(toPublicImageJob(job));

    runImageJob({
      jobId: job.jobId,
      body: { ...body },
      files: referenceFiles.map((file) => ({ ...file, buffer: Buffer.from(file.buffer) })),
      outputFormat: normalizeOption(body.output_format, ["png", "jpeg", "webp"], "png"),
      prompt,
      provider,
      providers: providerChain
    }).catch((error) => {
      console.error("Image job failed.", error);
    });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "生图任务提交失败，请稍后再试。" });
  }
});

app.post("/api/image-jobs/batch", requireAdmin, async (req, res) => {
  const body = req.body || {};
  const referenceIds = parseReferenceIds(body.referenceIds);
  let preparedJobs = [];

  try {
    const styleGroupId = String(body.styleGroupId || "").trim();
    const promptOverride = String(body.promptOverride || "").trim();
    const providers = getImageProviders();
    const provider = resolveImageProvider(body.provider, providers);
    const providerChain = getProviderFallbackChain(body.provider, providers);
    let sharedReferenceFiles = [];
    let groups = [];
    let styles = [];
    let group = null;
    let styleMap = null;
    let groupStyles = [];

    if (!styleGroupId) {
      return res.status(400).json({ message: "Please choose a style group first." });
    }

    if (!provider) {
      return res.status(400).json({ message: "Please choose a valid provider first." });
    }

    [groups, styles] = await Promise.all([readStyleGroups(), readStyles()]);
    group = groups.find((item) => item.id === styleGroupId) || null;
    if (!group) {
      return res.status(404).json({ message: "Style group not found." });
    }

    styleMap = new Map(styles.map((style) => [style.id, style]));
    groupStyles = (group.styleIds || []).map((styleId) => styleMap.get(styleId)).filter(Boolean);
    if (!groupStyles.length) {
      return res.status(400).json({ message: "The selected style group has no valid styles." });
    }

    sharedReferenceFiles = await collectReferenceFiles([], referenceIds);
    if (sharedReferenceFiles.some((file) => file.mimetype === "image/svg+xml")) {
      return res.status(400).json({ message: "Reference images only support JPG, PNG, or WebP." });
    }

    for (const style of groupStyles) {
      const prompt = promptOverride || String(style.prompt || "").trim();
      const referenceFiles = await buildBatchReferenceFiles(style, sharedReferenceFiles);
      const now = new Date().toISOString();
      const jobId = randomUUID();
      const styleName = formatStyleName(style);
      const originalReferences = await persistImageJobReferences(jobId, referenceFiles);
      const job = {
        jobId,
        status: "queued",
        message: "Batch job submitted. Waiting to run.",
        result: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        prompt,
        size: normalizeSize(body.size),
        referenceCount: referenceFiles.length,
        originalReferences,
        styleId: String(style.id || ""),
        styleName,
        styleGroupId: group.id,
        styleGroupName: group.name,
        provider: {
          id: provider.id,
          name: provider.name,
          model: provider.model
        },
        mode: referenceFiles.length ? "edit" : "generation"
      };

      preparedJobs.push({
        job: job,
        runArgs: {
          jobId: jobId,
          body: { ...body, styleId: style.id, styleName: styleName, styleGroupId: group.id, styleGroupName: group.name },
          files: referenceFiles.map(cloneReferenceFile),
          outputFormat: normalizeOption(body.output_format, ["png", "jpeg", "webp"], "png"),
          prompt: prompt,
          provider: provider,
          providers: providerChain
        }
      });
    }

    await Promise.all(preparedJobs.map((item) => saveImageJob(item.job)));

    res.status(202).json({
      group: group,
      submittedCount: preparedJobs.length,
      jobs: preparedJobs.map((item) => toPublicImageJob(item.job))
    });

    preparedJobs.forEach((item) => {
      runImageJob(item.runArgs).catch((error) => {
        console.error("Batch image job failed.", error);
      });
    });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "Reference images only support JPG, PNG, or WebP." });
    }
    await Promise.all(preparedJobs.map(async (item) => {
      await deleteJobReferences(item.job);
      await rm(getImageJobPath(item.job.jobId), { force: true });
    }));
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "Failed to submit batch jobs." });
  } finally {
    if (referenceIds.length) {
      await deleteTemporaryReferences(referenceIds);
    }
  }
});

app.get("/api/public/clip-items", async (req, res) => {
  try {
    const experienceType = String(req.query.experience || "").trim();
    const jobs = await listImageJobs();
    const items = jobs
      .filter(
        (job) =>
          job.visibility === "public" &&
          job.ownerVisitorId === req.visitorId &&
          job.isLiked &&
          (!experienceType || normalizePublicExperienceType(job.experienceType) === normalizePublicExperienceType(experienceType))
      )
      .sort((a, b) => String(b.likedAt || b.updatedAt || b.createdAt || "").localeCompare(String(a.likedAt || a.updatedAt || a.createdAt || "")))
      .map((job) => toPublicClipItem(job));
    res.json({ items });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取卡夹失败，请稍后再试。" });
  }
});

app.get("/api/image-jobs", requireAdmin, async (req, res) => {
  try {
    const jobs = await listImageJobs();
    const limit = Math.min(Math.max(Number(req.query.limit || 80), 1), 200);
    res.json({
      jobs: jobs
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .slice(0, limit)
        .map(toPublicImageJob)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取生图任务列表失败。" });
  }
});

app.get("/api/admin/draw-card-sessions", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || ADMIN_DRAW_CARD_SESSION_LIMIT), 1), ADMIN_DRAW_CARD_SESSION_LIMIT);
    const sessions = await listDrawCardSessions();
    const selectedSessions = sessions
      .sort((a, b) =>
        String(b.updatedAt || b.completedAt || b.createdAt || "").localeCompare(
          String(a.updatedAt || a.completedAt || a.createdAt || "")
        )
      )
      .slice(0, limit);

    const synchronizedSessions = await Promise.all(
      selectedSessions.map(async (session) => {
        if (["queued", "running"].includes(String(session.status || ""))) {
          return synchronizeDrawCardSession(session);
        }
        return normalizeDrawCardSession(session);
      })
    );

    const payload = await Promise.all(
      synchronizedSessions.map(async (session) => {
        const jobs = await Promise.all(session.items.map((item) => readImageJob(item.jobId)));
        const publicJobs = jobs.filter(Boolean).map(toPublicImageJob);
        return toPublicAdminDrawCardSession(session, publicJobs);
      })
    );

    res.json({ sessions: payload });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取公开玩法观测失败。" });
  }
});

app.post("/api/image-jobs/:jobId/cancel", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    if (!["queued", "running"].includes(job.status)) {
      return res.status(409).json({ message: "只有排队中或生成中的任务可以停止。" });
    }

    activeImageJobs.get(job.jobId)?.abortController.abort();
    const now = new Date().toISOString();
    const nextJob = await saveImageJob({
      ...job,
      status: "cancelled",
      message: "任务已停止。",
      updatedAt: now,
      completedAt: now
    });
    res.json(toPublicImageJob(nextJob));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "停止生图任务失败。" });
  }
});

app.post("/api/image-jobs/:jobId/like", async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    assertCanToggleLike(req, job);

    const now = new Date().toISOString();
    const nextJob = await saveImageJob({
      ...job,
      isLiked: true,
      likedAt: job.likedAt || now,
      updatedAt: now
    });
    res.json(toPublicImageJob(nextJob));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "标记喜欢失败，请稍后再试。" });
  }
});

app.post("/api/image-jobs/:jobId/unlike", async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    assertCanToggleLike(req, job);

    const nextJob = await saveImageJob({
      ...job,
      isLiked: false,
      likedAt: null,
      updatedAt: new Date().toISOString()
    });
    res.json(toPublicImageJob(nextJob));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "移出卡夹失败，请稍后再试。" });
  }
});

app.get("/api/image-jobs/:jobId", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    res.json(toPublicImageJob(job));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取生图任务失败。" });
  }
});

app.delete("/api/image-jobs/:jobId", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });

    activeImageJobs.get(job.jobId)?.abortController.abort();
    await deleteImageJob(job);
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "删除生图任务失败。" });
  }
});

app.get("/api/admin/invite-codes", requireAdmin, async (_req, res) => {
  try {
    const inviteCodes = await readInviteCodes();
    res.json({
      inviteCodes: inviteCodes
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
        .map(toPublicInviteCode)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取邀请码失败。" });
  }
});

app.post("/api/admin/invite-codes", requireAdmin, async (req, res) => {
  try {
    const count = Math.min(Math.max(Number(req.body?.count || 1), 1), 20);
    const prefix = String(req.body?.prefix || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8);
    const created = await createInviteCodes(count, prefix);
    res.status(201).json({ inviteCodes: created.map(toPublicInviteCode) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "创建邀请码失败。" });
  }
});

app.patch("/api/admin/invite-codes/:id", requireAdmin, async (req, res) => {
  try {
    const updated = await updateInviteCode(req.params.id, {
      enabled: req.body?.enabled
    });
    if (!updated) return res.status(404).json({ message: "邀请码不存在。" });
    res.json({ inviteCode: toPublicInviteCode(updated) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "更新邀请码失败。" });
  }
});

app.get("/api/admin/visitors", requireAdmin, async (_req, res) => {
  try {
    const visitors = await listVisitorStates();
    res.json({
      visitors: visitors
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
        .map(toPublicAdminVisitor)
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取访客额度失败。" });
  }
});

app.get("/api/admin/orders", requireAdmin, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page || 1), 1);
    const limit = Math.min(Math.max(Number(req.query.limit || 20), 1), ORDER_SEARCH_LIMIT);
    const paymentStatus = normalizeOrderPaymentStatus(String(req.query.paymentStatus || ""), "");
    const fulfillmentStatus = normalizeOrderFulfillmentStatus(String(req.query.fulfillmentStatus || ""), "");
    const search = String(req.query.search || "").trim();
    const startDate = String(req.query.startDate || "").trim();
    const endDate = String(req.query.endDate || "").trim();

    const payload = orderStore.listOrders({
      page,
      limit,
      paymentStatus,
      fulfillmentStatus,
      search,
      startDate,
      endDate
    });

    res.json({
      total: payload.total,
      page: payload.page,
      limit: payload.limit,
      orders: payload.items.map((order) => toPublicOrder(order, { includePrivate: true }))
    });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取订单列表失败。" });
  }
});

app.get("/api/admin/orders/:orderId", requireAdmin, async (req, res) => {
  try {
    const order = orderStore.readOrderWithRelations(req.params.orderId);
    if (!order) return res.status(404).json({ message: "订单不存在。" });
    res.json({ order: toPublicOrder(order, { includePrivate: true }) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "读取订单详情失败。" });
  }
});

app.patch("/api/admin/orders/:orderId", requireAdmin, async (req, res) => {
  try {
    const order = orderStore.readOrderWithRelations(req.params.orderId);
    if (!order) return res.status(404).json({ message: "订单不存在。" });

    const patch = {};
    if (req.body?.paymentStatus !== undefined) {
      const nextPaymentStatus = normalizeOrderPaymentStatus(req.body.paymentStatus, order.paymentStatus);
      if (nextPaymentStatus === "paid" && order.paymentStatus === "unpaid") {
        patch.paymentStatus = "paid";
        patch.paidAt = order.paidAt || new Date().toISOString();
      } else if (nextPaymentStatus !== order.paymentStatus) {
        patch.paymentStatus = nextPaymentStatus;
      }
    }

    if (req.body?.fulfillmentStatus !== undefined) {
      const nextFulfillmentStatus = normalizeOrderFulfillmentStatus(req.body.fulfillmentStatus, order.fulfillmentStatus);
      patch.fulfillmentStatus = nextFulfillmentStatus;
      if (nextFulfillmentStatus === "shipped" && !order.shippedAt) patch.shippedAt = new Date().toISOString();
      if (nextFulfillmentStatus === "completed" && !order.completedAt) patch.completedAt = new Date().toISOString();
      if (nextFulfillmentStatus === "cancelled" && !order.cancelledAt) patch.cancelledAt = new Date().toISOString();
    }

    if (req.body?.adminRemark !== undefined) {
      patch.adminRemark = String(req.body.adminRemark || "").trim();
    }

    const updated = orderStore.updateOrder(req.params.orderId, patch);
    res.json({ order: toPublicOrder(updated, { includePrivate: true }) });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "更新订单失败。" });
  }
});

app.get("/api/admin/settings", requireAdmin, async (_req, res) => {
  try {
    const settings = await readAppSettings();
    res.json({ settings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取系统设置失败。" });
  }
});

app.patch("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    const updated = await saveAppSettings({
      ...(await readAppSettings()),
      anonymousQuotaLimit: normalizeAnonymousQuotaLimit(req.body?.anonymousQuotaLimit),
      fridgeMagnetOrderingEnabled: req.body?.fridgeMagnetOrderingEnabled === true,
      fridgeMagnetUnitPriceCents: normalizeMoneyCents(req.body?.fridgeMagnetUnitPriceCents, DEFAULT_FRIDGE_MAGNET_UNIT_PRICE_CENTS),
      singleItemShippingFeeCents: normalizeMoneyCents(req.body?.singleItemShippingFeeCents, DEFAULT_SINGLE_ITEM_SHIPPING_FEE_CENTS)
    });
    res.json({ settings: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "更新系统设置失败。" });
  }
});

app.get("/api/admin/storage", requireAdmin, async (_req, res) => {
  try {
    const summary = await buildStorageSummary();
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取存储概览失败。" });
  }
});

app.post("/api/admin/storage/backups", requireAdmin, async (_req, res) => {
  try {
    const backup = await createStorageBackup();
    res.status(201).json({ backup });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "创建备份失败。" });
  }
});

app.post("/api/admin/storage/image-backups", requireAdmin, async (req, res) => {
  try {
    const backup = await createImageRangeBackup(req.body || {});
    res.status(201).json({ backup });
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "创建图片备份失败。" });
  }
});

app.get("/api/admin/storage/backups/:backupId/download", requireAdmin, async (req, res) => {
  try {
    const backup = await readStorageBackupMetadata(req.params.backupId);
    if (!backup) return res.status(404).json({ message: "备份不存在。" });
    const filePath = getStorageBackupFilePath(backup.filename);
    if (!(await fileExists(filePath))) {
      return res.status(404).json({ message: "备份文件不存在。" });
    }
    res.download(filePath, backup.filename);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "下载备份失败。" });
  }
});

app.delete("/api/admin/storage/backups/:backupId", requireAdmin, async (req, res) => {
  try {
    const deleted = await deleteStorageBackup(req.params.backupId);
    if (!deleted) return res.status(404).json({ message: "备份不存在。" });
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "删除备份失败。" });
  }
});

app.post("/api/admin/storage/cleanup", requireAdmin, async (req, res) => {
  try {
    const result = await cleanupStorageHistory(req.body || {});
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "清理历史数据失败。" });
  }
});

app.get("/api/admin/image-jobs/:jobId/result", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    await sendAdminJobImage(res, job);
  } catch (error) {
    console.error(error);
    res.status(error.status || 404).json({ message: error.publicMessage || "读取高清图失败。" });
  }
});

app.get("/api/admin/image-jobs/:jobId/download", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    await sendAdminJobImage(res, job, { asDownload: true });
  } catch (error) {
    console.error(error);
    res.status(error.status || 404).json({ message: error.publicMessage || "下载高清图失败。" });
  }
});

app.get("/api/admin/image-jobs/:jobId/references/:index", requireAdmin, async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    await sendAdminReferenceImage(res, job, Number(req.params.index));
  } catch (error) {
    console.error(error);
    res.status(error.status || 404).json({ message: error.publicMessage || "读取参考图失败。" });
  }
});

app.post("/api/style-groups", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const styleIds = new Set(styles.map((style) => style.id));
  const groups = await readStyleGroups();
  const group = normalizeStyleGroup(
    {
      id: `group_${Date.now()}`,
      name: req.body.name,
      styleIds: req.body.styleIds,
      size: req.body.size
    },
    styleIds
  );

  groups.unshift(group);
  await saveStyleGroups(groups);
  res.status(201).json(group);
});

app.put("/api/style-groups/:id", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const styleIds = new Set(styles.map((style) => style.id));
  const groups = await readStyleGroups();
  const index = groups.findIndex((group) => group.id === req.params.id);
  if (index < 0) return res.status(404).json({ message: "风格组不存在。" });

  groups[index] = normalizeStyleGroup(
    {
      ...groups[index],
      name: req.body.name,
      styleIds: req.body.styleIds,
      size: req.body.size
    },
    styleIds
  );
  await saveStyleGroups(groups);
  res.json(groups[index]);
});

app.delete("/api/style-groups/:id", requireAdmin, async (req, res) => {
  const groups = await readStyleGroups();
  const nextGroups = groups.filter((group) => group.id !== req.params.id);
  if (nextGroups.length === groups.length) return res.status(404).json({ message: "风格组不存在。" });

  await saveStyleGroups(nextGroups);
  res.status(204).end();
});

app.post("/api/styles", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const now = new Date().toISOString();
  const style = {
    id: `style_${Date.now()}`,
    tags: normalizeTags(req.body.tags).length ? normalizeTags(req.body.tags) : ["新风格"],
    image: "/style-previews/default/cover.svg",
    imageUpdatedAt: now,
    prompt: String(req.body.prompt || "在这里填写这个风格对应的提示词。").trim(),
    useStyleImageAsReference: Boolean(req.body.useStyleImageAsReference)
  };
  styles.unshift(style);
  await saveStyles(styles);
  res.status(201).json(style);
});

app.put("/api/styles/order", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const ids = Array.isArray(req.body.ids) ? req.body.ids.map(String) : [];
  const currentIds = new Set(styles.map((style) => style.id));
  const nextIds = new Set(ids);
  const hasSameItems = ids.length === styles.length && ids.every((id) => currentIds.has(id)) && nextIds.size === currentIds.size;
  if (!hasSameItems) return res.status(400).json({ message: "排序数据与当前风格列表不匹配。" });

  const styleById = new Map(styles.map((style) => [style.id, style]));
  const nextStyles = ids.map((id) => styleById.get(id));
  await saveStyles(nextStyles);
  res.json(nextStyles);
});

app.put("/api/styles/:id", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const style = styles.find((item) => item.id === req.params.id);
  if (!style) return res.status(404).json({ message: "风格不存在。" });

  style.tags = normalizeTags(req.body.tags);
  style.prompt = String(req.body.prompt || "").trim();
  style.useStyleImageAsReference = Boolean(req.body.useStyleImageAsReference);
  await saveStyles(styles);
  res.json(style);
});

app.delete("/api/styles/:id", requireAdmin, async (req, res) => {
  const styles = await readStyles();
  const nextStyles = styles.filter((item) => item.id !== req.params.id);
  if (nextStyles.length === styles.length) return res.status(404).json({ message: "风格不存在。" });

  await saveStyles(nextStyles);
  await removeStyleFromGroups(req.params.id);
  await deleteMiniImage(req.params.id);
  res.status(204).end();
});

app.post("/api/styles/:id/image", requireAdmin, upload.single("image"), async (req, res) => {
  try {
    const styles = await readStyles();
    const style = styles.find((item) => item.id === req.params.id);
    if (!style) return res.status(404).json({ message: "风格不存在。" });
    if (!req.file) return res.status(400).json({ message: "请选择一张图片。" });

    const ext = extensionForMime(req.file.mimetype);
    const dir = path.join(previewRoot, style.id);
    await mkdir(dir, { recursive: true });
    const filename = `cover.${ext}`;
    await writeFile(path.join(dir, filename), req.file.buffer);

    style.image = `/style-previews/${style.id}/${filename}`;
    style.imageUpdatedAt = new Date().toISOString();
    await saveStyles(styles);
    res.json({
      ...style,
      galleryImage: await getWebGalleryImage(style)
    });
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "仅支持 JPG、PNG、WebP 或 SVG 图片。" });
    }
    console.error(error);
    res.status(500).json({ message: "图片保存失败。" });
  }
});

app.use("/generated-images", express.static(generatedImageRoot));
app.use(express.static(path.join(rootDir, "public")));
app.use("/images-small", express.static(miniImageRoot));
app.use(express.static(path.join(rootDir, "dist")));

app.use((error, _req, res, next) => {
  if (!error) return next();
  if (error.status) {
    return res.status(error.status).json({ message: error.publicMessage || error.message });
  }
  console.error(error);
  return res.status(500).json({ message: "服务器暂时不可用，请稍后再试。" });
});

app.use((req, res) => {
  const pathname = req.path || "/";
  if (pathname === "/" || pathname === "/fridge" || pathname === "/fridge/" || pathname.startsWith("/fridge/orders/") || pathname === "/gallery" || pathname.startsWith("/admin/") || pathname === "/admin") {
    return res.sendFile(path.join(rootDir, "dist", "index.html"));
  }
  if (pathname === "/luck" || pathname === "/manage" || pathname === "/tasks" || pathname === "/batch") {
    return res.redirect(pathname === "/luck" ? "/" : "/admin/login");
  }
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Prompt gallery listening on http://127.0.0.1:${port}`);
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    console.warn("Admin credentials are missing. Please set ADMIN_USERNAME and ADMIN_PASSWORD in .env.");
  }
  prepareImageJobStorage()
    .then(migrateLegacyGeneratedImages)
    .then(readStyles)
    .then(syncMiniProgram)
    .then(() => console.log("Mini program files synced."))
    .catch((error) => console.error("Startup tasks failed.", error));
});

async function readStyles() {
  const styles = JSON.parse(await readFile(dataPath, "utf-8"));
  return Promise.all(
    styles.map(async (style) => ({
      id: style.id,
      tags: normalizeTags(style.tags?.length ? style.tags : [style.label, style.description]),
      image: style.image || "/style-previews/default/cover.svg",
      imageUpdatedAt: style.imageUpdatedAt || null,
      galleryImage: await getWebGalleryImage(style),
      prompt: String(style.prompt || ""),
      useStyleImageAsReference: Boolean(style.useStyleImageAsReference)
    }))
  );
}

async function migrateLegacyGeneratedImages() {
  if (!(await fileExists(legacyGeneratedImageRoot))) {
    return;
  }

  await mkdir(generatedImageRoot, { recursive: true });

  const legacyEntries = await readdir(legacyGeneratedImageRoot, { withFileTypes: true });
  const legacyFiles = legacyEntries.filter((entry) => entry.isFile());
  if (!legacyFiles.length) {
    return;
  }

  for (const entry of legacyFiles) {
    const sourcePath = path.join(legacyGeneratedImageRoot, entry.name);
    const targetPath = path.join(generatedImageRoot, entry.name);
    if (!(await fileExists(targetPath))) {
      await copyFile(sourcePath, targetPath);
    }
  }

  const jobs = await listImageJobs();
  let updatedCount = 0;
  for (const job of jobs) {
    const imageUrl = String(job?.result?.imageUrl || "");
    if (!imageUrl.startsWith("/generated-images/")) continue;
    const filename = path.basename(imageUrl);
    const migratedFilePath = path.join(generatedImageRoot, filename);
    if (!(await fileExists(migratedFilePath))) continue;
    const normalizedJob = toPublicImageJob(job);
    await saveImageJob(normalizedJob);
    updatedCount += 1;
  }

  await rm(legacyGeneratedImageRoot, { recursive: true, force: true });

  console.log(`Legacy generated images migrated: ${legacyFiles.length} files, ${updatedCount} jobs normalized.`);
}

async function readStyleGroups() {
  try {
    const groups = JSON.parse(await readFile(styleGroupsPath, "utf-8"));
    return groups.map((group) => normalizeStyleGroup(group));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveStyleGroups(groups) {
  await writeFile(styleGroupsPath, `${JSON.stringify(groups, null, 2)}\n`, "utf-8");
}

function normalizeStyleGroup(group, validStyleIds = null) {
  const normalizedIds = Array.isArray(group?.styleIds)
    ? group.styleIds
        .map((styleId) => String(styleId || "").trim())
        .filter(Boolean)
        .filter((styleId, index, list) => list.indexOf(styleId) === index)
    : [];
  const nextStyleIds = validStyleIds ? normalizedIds.filter((styleId) => validStyleIds.has(styleId)) : normalizedIds;

  return {
    id: String(group?.id || `group_${Date.now()}`),
    name: String(group?.name || "").trim() || "鏈懡鍚嶉鏍肩粍",
    styleIds: nextStyleIds,
    size: normalizeStyleGroupSize(group?.size)
  };
}

function normalizeStyleGroupSize(value) {
  const size = String(value || "").trim();
  return STYLE_GROUP_SIZE_OPTIONS.has(size) ? size : DRAW_CARD_DEFAULT_SIZE;
}

function parseCookies(req) {
  const header = String(req.headers?.cookie || "");
  return header.split(/;\s*/).reduce((accumulator, item) => {
    const separator = item.indexOf("=");
    if (separator <= 0) return accumulator;
    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();
    if (key) accumulator[key] = decodeURIComponent(value);
    return accumulator;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

function appendSetCookie(res, cookie) {
  const current = res.getHeader("Set-Cookie");
  if (!current) {
    res.setHeader("Set-Cookie", cookie);
    return;
  }

  res.setHeader("Set-Cookie", Array.isArray(current) ? current.concat(cookie) : [current, cookie]);
}

function setVisitorCookie(req, res, visitorId) {
  appendSetCookie(res, serializeCookie(VISITOR_COOKIE_NAME, visitorId, {
    maxAge: 60 * 60 * 24 * 365,
    secure: shouldUseSecureCookies(req)
  }));
}

function setAdminCookie(req, res, sessionId) {
  appendSetCookie(res, serializeCookie(ADMIN_COOKIE_NAME, sessionId, {
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
    secure: shouldUseSecureCookies(req)
  }));
}

function clearAdminCookie(req, res) {
  appendSetCookie(res, serializeCookie(ADMIN_COOKIE_NAME, "", {
    maxAge: 0,
    secure: shouldUseSecureCookies(req)
  }));
}

async function visitorSessionMiddleware(req, res, next) {
  try {
    const cookies = parseCookies(req);
    const current = cookies[VISITOR_COOKIE_NAME];
    const visitorId = isSafeVisitorId(current) ? current : randomUUID();
    req.visitorId = visitorId;
    if (visitorId !== current) setVisitorCookie(req, res, visitorId);
    next();
  } catch (error) {
    next(error);
  }
}

function shouldUseSecureCookies(req) {
  const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
  if (forwardedProto === "https") return true;
  if (req?.secure) return true;
  if (req?.socket?.encrypted) return true;
  return false;
}

async function adminSessionMiddleware(req, _res, next) {
  try {
    const cookies = parseCookies(req);
    const sessionId = cookies[ADMIN_COOKIE_NAME];
    req.adminSession = sessionId && isSafeAdminSessionId(sessionId) ? await readAdminSession(sessionId) : null;
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, _res, next) {
  if (!req.adminSession) {
    return next(createHttpError(401, "请先登录后台。"));
  }
  return next();
}

function createHttpError(status, publicMessage) {
  const error = new Error(publicMessage);
  error.status = status;
  error.publicMessage = publicMessage;
  return error;
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const remoteAddress = String(req.socket?.remoteAddress || "");
  return forwarded || remoteAddress || "unknown";
}

function pruneTimestamps(store, key, windowMs, now) {
  const existing = store.get(key) || [];
  const next = existing.filter((timestamp) => now - timestamp < windowMs);
  store.set(key, next);
  return next;
}

function enforcePublicRateLimits(req) {
  const now = Date.now();
  const visitorEntries = pruneTimestamps(visitorRequestLog, req.visitorId, VISITOR_RATE_WINDOW_MS, now);
  if (visitorEntries.length >= VISITOR_RATE_LIMIT) {
    throw createHttpError(429, "当前操作过于频繁，请稍后再试。");
  }
  visitorEntries.push(now);

  const ip = getClientIp(req);
  const ipEntries = pruneTimestamps(ipRequestLog, ip, IP_RATE_WINDOW_MS, now);
  if (ipEntries.length >= IP_RATE_LIMIT) {
    throw createHttpError(429, "当前网络请求过于频繁，请稍后再试。");
  }
  ipEntries.push(now);
}

async function readVisitorState(visitorId) {
  if (!isSafeVisitorId(visitorId)) return null;
  try {
    return normalizeVisitorState(JSON.parse(await readFile(getVisitorStatePath(visitorId), "utf-8")));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function saveVisitorState(visitor) {
  await mkdir(visitorStateRoot, { recursive: true });
  const safeVisitor = normalizeVisitorState(visitor);
  await writeFile(getVisitorStatePath(safeVisitor.visitorId), `${JSON.stringify(safeVisitor, null, 2)}\n`, "utf-8");
  return safeVisitor;
}

function normalizeVisitorState(visitor) {
  const tier = String(visitor?.tier || "anonymous");
  const quotaLimit = Number(visitor?.quotaLimit || (tier === "invited" ? DEFAULT_VISITOR_ANONYMOUS_LIMIT + VISITOR_INVITE_BONUS : DEFAULT_VISITOR_ANONYMOUS_LIMIT));
  const quotaUsed = Math.max(0, Number(visitor?.quotaUsed || 0));
  const chargedDrawCardSessionIds = Array.isArray(visitor?.chargedDrawCardSessionIds)
    ? visitor.chargedDrawCardSessionIds.map((sessionId) => String(sessionId || "")).filter(Boolean)
    : [];
  return {
    visitorId: String(visitor?.visitorId || randomUUID()),
    tier,
    quotaLimit,
    quotaUsed,
    chargedDrawCardSessionIds,
    invitedAt: visitor?.invitedAt || null,
    contactMessage: String(visitor?.contactMessage || DEFAULT_CONTACT_MESSAGE),
    createdAt: visitor?.createdAt || new Date().toISOString(),
    updatedAt: visitor?.updatedAt || new Date().toISOString()
  };
}

async function getVisitorState(req) {
  const existing = await readVisitorState(req.visitorId);
  if (existing) return existing;
  const now = new Date().toISOString();
  const settings = await readAppSettings();
  return saveVisitorState({
    visitorId: req.visitorId,
    tier: "anonymous",
    quotaLimit: normalizeAnonymousQuotaLimit(settings.anonymousQuotaLimit),
    quotaUsed: 0,
    invitedAt: null,
    contactMessage: DEFAULT_CONTACT_MESSAGE,
    createdAt: now,
    updatedAt: now
  });
}

async function readAppSettings() {
  try {
    const parsed = JSON.parse(await readFile(appSettingsPath, "utf-8"));
    return normalizeAppSettings(parsed);
  } catch (error) {
    if (error.code === "ENOENT") return normalizeAppSettings({});
    throw error;
  }
}

async function saveAppSettings(settings) {
  const safeSettings = normalizeAppSettings(settings);
  await writeFile(appSettingsPath, `${JSON.stringify(safeSettings, null, 2)}\n`, "utf-8");
  return safeSettings;
}

function normalizeAppSettings(settings) {
  return {
    anonymousQuotaLimit: normalizeAnonymousQuotaLimit(settings?.anonymousQuotaLimit),
    fridgeMagnetOrderingEnabled: settings?.fridgeMagnetOrderingEnabled === true,
    fridgeMagnetUnitPriceCents: normalizeMoneyCents(settings?.fridgeMagnetUnitPriceCents, DEFAULT_FRIDGE_MAGNET_UNIT_PRICE_CENTS),
    singleItemShippingFeeCents: normalizeMoneyCents(settings?.singleItemShippingFeeCents, DEFAULT_SINGLE_ITEM_SHIPPING_FEE_CENTS)
  };
}

function normalizeAnonymousQuotaLimit(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return DEFAULT_VISITOR_ANONYMOUS_LIMIT;
  return Math.min(Math.max(Math.round(next), 1), 50);
}

function normalizeMoneyCents(value, fallback) {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(Math.max(Math.round(next), 0), 99999999);
}

async function buildStorageSummary() {
  const [directoryStats, backupFiles, appSettings] = await Promise.all([
    Promise.all([
      summarizeStorageDirectory("任务记录", imageJobRoot, "jobRecords"),
      summarizeStorageDirectory("抽卡会话", drawCardSessionRoot, "drawCardSessions"),
      summarizeStorageDirectory("访客额度", visitorStateRoot, "visitorStates"),
      summarizeStorageDirectory("后台会话", adminSessionRoot, "adminSessions"),
      summarizeStorageDirectory("临时参考图", tempReferenceRoot, "tempReferences"),
      summarizeStorageDirectory("高清原图", generatedImageRoot, "generatedImages"),
      summarizeStorageDirectory("公开预览图", generatedPreviewRoot, "generatedPreviews"),
      summarizeStorageDirectory("任务缩略图", generatedThumbnailRoot, "generatedThumbnails"),
      summarizeStorageDirectory("任务参考图", jobReferenceRoot, "jobReferences"),
      summarizeStorageDirectory("参考图缩略图", jobReferenceThumbnailRoot, "jobReferenceThumbnails")
    ]),
    listStorageBackups(),
    readAppSettings()
  ]);

  return {
    directories: directoryStats,
    backups: backupFiles,
    totals: {
      bytes: directoryStats.reduce((sum, item) => sum + item.bytes, 0),
      files: directoryStats.reduce((sum, item) => sum + item.files, 0)
    },
    cleanupDefaults: {
      retentionDays: normalizeCleanupRetentionDays(appSettings?.storageHistoryRetentionDays)
    }
  };
}

async function summarizeStorageDirectory(label, dirPath, key) {
  const stats = await getDirectoryTreeStats(dirPath);
  return {
    key,
    label,
    path: path.relative(rootDir, dirPath).replace(/\\/g, "/"),
    bytes: stats.bytes,
    files: stats.files,
    directories: stats.directories
  };
}

async function getDirectoryTreeStats(targetPath) {
  if (!(await fileExists(targetPath))) {
    return { bytes: 0, files: 0, directories: 0 };
  }

  const rootStat = await stat(targetPath);
  if (!rootStat.isDirectory()) {
    return {
      bytes: Number(rootStat.size || 0),
      files: 1,
      directories: 0
    };
  }

  let bytes = 0;
  let files = 0;
  let directories = 0;
  const queue = [targetPath];

  while (queue.length) {
    const current = queue.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        directories += 1;
        queue.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const entryStat = await stat(fullPath);
      files += 1;
      bytes += Number(entryStat.size || 0);
    }
  }

  return { bytes, files, directories };
}

async function listStorageBackups() {
  await mkdir(storageBackupRoot, { recursive: true });
  const entries = await readdir(storageBackupRoot, { withFileTypes: true });
  const backups = await Promise.all(
    entries
      .filter((entry) => {
        if (!entry.isFile()) return false;
        const ext = path.extname(entry.name).toLowerCase();
        if (ext === ".zip") return true;
        if (ext !== ".json") return false;
        return !entry.name.endsWith(".backup.json");
      })
      .map((entry) => readStorageBackupMetadata(entry.name))
  );
  return backups
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

async function createStorageBackup() {
  await mkdir(storageBackupRoot, { recursive: true });
  const now = new Date();
  const backupId = randomUUID();
  const timestamp = formatBackupTimestamp(now);
  const filename = `storage-backup-${timestamp}-${backupId.slice(0, 8)}.json`;
  const payload = {
    meta: {
      backupId,
      kind: BACKUP_KIND_CONFIG,
      filename,
      createdAt: now.toISOString(),
      version: 1
    },
    data: {
      styles: await readStyles(),
      styleGroups: await readStyleGroups(),
      inviteCodes: await readInviteCodes(),
      appSettings: await readAppSettings()
    }
  };
  const filePath = getStorageBackupFilePath(filename);
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf-8");
  return {
    backupId,
    kind: BACKUP_KIND_CONFIG,
    filename,
    createdAt: payload.meta.createdAt,
    sizeBytes: Buffer.byteLength(`${JSON.stringify(payload, null, 2)}\n`, "utf-8"),
    version: payload.meta.version
  };
}

async function readStorageBackupMetadata(backupId) {
  const filePath = await resolveStorageBackupPathById(backupId);
  if (!filePath) return null;
  const fileStat = await stat(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const raw = ext === ".json"
    ? JSON.parse(await readFile(filePath, "utf-8"))
    : await readZipBackupSidecar(filePath);
  const meta = raw?.meta || {};
  const kind = String(meta.kind || (ext === ".zip" ? BACKUP_KIND_IMAGE_RANGE : BACKUP_KIND_CONFIG));
  return {
    backupId: String(meta.backupId || backupId),
    kind,
    filename: path.basename(filePath),
    createdAt: meta.createdAt || fileStat.mtime.toISOString(),
    sizeBytes: Number(fileStat.size || 0),
    version: Number(meta.version || 1),
    dateRange: meta.dateRange || null
  };
}

async function resolveStorageBackupPathById(backupId) {
  const normalizedId = String(backupId || "").trim();
  if (!normalizedId) return null;

  const directFilename = normalizedId.endsWith(".json") ? normalizedId : `${normalizedId}.json`;
  const directPath = path.join(storageBackupRoot, directFilename);
  if (await fileExists(directPath)) {
    return directPath;
  }

  const directZipPath = normalizedId.endsWith(".zip") ? path.join(storageBackupRoot, normalizedId) : path.join(storageBackupRoot, `${normalizedId}.zip`);
  if (await fileExists(directZipPath)) {
    return directZipPath;
  }

  const entries = await readdir(storageBackupRoot, { withFileTypes: true });
  const matched = entries.find((entry) => entry.isFile() && [".json", ".zip"].includes(path.extname(entry.name).toLowerCase()) && entry.name.includes(normalizedId));
  if (matched) {
    return path.join(storageBackupRoot, matched.name);
  }

  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") continue;
    const fullPath = path.join(storageBackupRoot, entry.name);
    try {
      const raw = JSON.parse(await readFile(fullPath, "utf-8"));
      if (String(raw?.meta?.backupId || "").trim() === normalizedId) {
        if (String(raw?.meta?.kind || "") === BACKUP_KIND_IMAGE_RANGE) {
          const zipPath = getZipPathFromSidecar(fullPath, raw?.meta?.filename);
          if (zipPath && await fileExists(zipPath)) {
            return zipPath;
          }
        }
        return fullPath;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function getStorageBackupFilePath(filename) {
  return path.join(storageBackupRoot, path.basename(String(filename || "")));
}

async function deleteStorageBackup(backupId) {
  const filePath = await resolveStorageBackupPathById(backupId);
  if (!filePath) return false;
  await rm(filePath, { force: true });
  if (path.extname(filePath).toLowerCase() === ".zip") {
    await rm(getZipBackupSidecarPath(filePath), { force: true });
  }
  return true;
}

async function createImageRangeBackup(options) {
  const startDate = normalizeDateInput(options.startDate);
  const endDate = normalizeDateInput(options.endDate);
  if (!startDate) {
    throw createHttpError(400, "请选择开始日期。");
  }
  if (!endDate) {
    throw createHttpError(400, "请选择结束日期。");
  }
  if (startDate > endDate) {
    throw createHttpError(400, "开始日期不能晚于结束日期。");
  }

  const startTime = new Date(`${startDate}T00:00:00`).getTime();
  const endTime = new Date(`${endDate}T23:59:59.999`).getTime();
  const jobItems = await collectImageBackupOriginals(startTime, endTime);
  const tempReferenceItems = await collectImageBackupTempReferences(startTime, endTime);
  const allItems = jobItems.concat(tempReferenceItems).sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")));

  if (!allItems.length) {
    throw createHttpError(400, "所选日期范围内没有可备份图片。");
  }

  await mkdir(storageBackupRoot, { recursive: true });
  await mkdir(storageExportTempRoot, { recursive: true });

  const backupId = randomUUID();
  const zipFilename = `${startDate.replace(/-/g, "")}-${endDate.replace(/-/g, "")}.zip`;
  const tempDir = path.join(storageExportTempRoot, backupId);
  const createdAt = new Date().toISOString();

  try {
    await mkdir(tempDir, { recursive: true });
    const manifest = {
      version: 1,
      kind: BACKUP_KIND_IMAGE_RANGE,
      backupId,
      dateRange: { startDate, endDate },
      generatedAt: createdAt,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "local",
      items: []
    };

    for (const item of allItems) {
      const relativeArchivePath = item.archivePath.replace(/\//g, path.sep);
      const targetPath = path.join(tempDir, relativeArchivePath);
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(item.sourceFilePath, targetPath);
      manifest.items.push({
        type: item.type,
        date: item.date,
        jobId: item.jobId || null,
        referenceId: item.referenceId || null,
        sourcePath: item.sourcePath,
        archivePath: item.archivePath,
        createdAt: item.createdAt
      });
    }

    await writeFile(path.join(tempDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

    const outputPath = path.join(storageBackupRoot, zipFilename);
    const sidecarPath = getZipBackupSidecarPath(outputPath);
    if (await fileExists(outputPath)) {
      await rm(outputPath, { force: true });
    }
    if (await fileExists(sidecarPath)) {
      await rm(sidecarPath, { force: true });
    }
    await createZipFromDirectory(tempDir, outputPath);
    await writeFile(sidecarPath, `${JSON.stringify({
      meta: {
        backupId,
        kind: BACKUP_KIND_IMAGE_RANGE,
        filename: zipFilename,
        createdAt,
        version: 1,
        dateRange: { startDate, endDate }
      }
    }, null, 2)}\n`, "utf-8");

    return {
      backupId,
      kind: BACKUP_KIND_IMAGE_RANGE,
      filename: zipFilename,
      createdAt,
      sizeBytes: Number((await stat(outputPath)).size || 0),
      version: 1,
      dateRange: { startDate, endDate }
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function collectImageBackupOriginals(startTime, endTime) {
  const jobs = await listImageJobs();
  const items = [];

  for (const job of jobs) {
    const imageFilePath = await resolveJobImageFile(job);
    if (!imageFilePath) continue;
    const createdAt = String(job?.createdAt || "");
    const time = new Date(createdAt).getTime();
    if (!Number.isFinite(time) || time < startTime || time > endTime) continue;
    const date = formatArchiveDate(createdAt);
    const filename = path.basename(imageFilePath);
    items.push({
      type: "original",
      date,
      jobId: String(job.jobId || ""),
      referenceId: "",
      sourcePath: toRelativeStoragePath(imageFilePath),
      sourceFilePath: imageFilePath,
      archivePath: `${date}/originals/${filename}`,
      createdAt
    });
  }

  return items;
}

async function collectImageBackupTempReferences(startTime, endTime) {
  if (!(await fileExists(tempReferenceRoot))) return [];
  const entries = await readdir(tempReferenceRoot, { withFileTypes: true });
  const items = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const referenceId = entry.name;
    const dir = path.join(tempReferenceRoot, referenceId);
    const metadataPath = path.join(dir, "metadata.json");
    let metadata = null;

    try {
      metadata = JSON.parse(await readFile(metadataPath, "utf-8"));
    } catch {
      metadata = null;
    }

    const fallbackStat = await stat(dir);
    const createdAt = String(metadata?.createdAt || fallbackStat.mtime.toISOString());
    const time = new Date(createdAt).getTime();
    if (!Number.isFinite(time) || time < startTime || time > endTime) continue;
    const date = formatArchiveDate(createdAt);
    const fileEntries = await readdir(dir, { withFileTypes: true });

    for (const fileEntry of fileEntries) {
      if (!fileEntry.isFile() || fileEntry.name === "metadata.json") continue;
      const filePath = path.join(dir, fileEntry.name);
      items.push({
        type: "temp-reference",
        date,
        jobId: "",
        referenceId,
        sourcePath: toRelativeStoragePath(filePath),
        sourceFilePath: filePath,
        archivePath: `${date}/temp-references/${referenceId}/${fileEntry.name}`,
        createdAt
      });
    }
  }

  return items;
}

function normalizeDateInput(value) {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return "";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return text;
}

function formatArchiveDate(value) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toRelativeStoragePath(filePath) {
  return path.relative(rootDir, filePath).replace(/\\/g, "/");
}

async function createZipFromDirectory(sourceDir, outputPath) {
  await execFileAsync("tar", ["-a", "-c", "-f", outputPath, "-C", sourceDir, "."]);
}

function getZipBackupSidecarPath(zipFilePath) {
  const parsed = path.parse(zipFilePath);
  return path.join(parsed.dir, `${parsed.name}.backup.json`);
}

function getZipPathFromSidecar(sidecarPath, filename) {
  if (filename) {
    return path.join(path.dirname(sidecarPath), path.basename(String(filename)));
  }
  const parsed = path.parse(sidecarPath);
  const baseName = parsed.name.replace(/\.backup$/, "");
  return path.join(parsed.dir, `${baseName}.zip`);
}

async function readZipBackupSidecar(zipFilePath) {
  const sidecarPath = getZipBackupSidecarPath(zipFilePath);
  if (!(await fileExists(sidecarPath))) return null;
  try {
    return JSON.parse(await readFile(sidecarPath, "utf-8"));
  } catch {
    return null;
  }
}

async function cleanupStorageHistory(options) {
  const retentionDays = normalizeCleanupRetentionDays(options.retentionDays);
  const beforeTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const cleanVisitors = options.cleanVisitors === true;
  const cleanAdminSessions = options.cleanAdminSessions === true;
  const cleanTempReferences = options.cleanTempReferences !== false;
  const clearAllHistory = options.clearAllHistory !== false;

  const result = {
    retentionDays,
    clearAllHistory,
    deleted: {
      imageJobs: 0,
      drawCardSessions: 0,
      visitorStates: 0,
      adminSessions: 0,
      tempReferences: 0
    }
  };

  result.deleted.imageJobs = clearAllHistory ? await cleanupAllImageJobs() : await cleanupImageJobsBefore(beforeTime);
  result.deleted.drawCardSessions = clearAllHistory ? await cleanupAllJsonFiles(drawCardSessionRoot) : await cleanupJsonFilesBefore(drawCardSessionRoot, beforeTime);
  if (cleanVisitors) {
    result.deleted.visitorStates = clearAllHistory ? await cleanupAllJsonFiles(visitorStateRoot) : await cleanupJsonFilesBefore(visitorStateRoot, beforeTime);
  }
  if (cleanAdminSessions) {
    result.deleted.adminSessions = clearAllHistory ? await cleanupAllJsonFiles(adminSessionRoot) : await cleanupJsonFilesBefore(adminSessionRoot, beforeTime);
  }
  if (cleanTempReferences) {
    result.deleted.tempReferences = clearAllHistory ? await cleanupAllDirectories(tempReferenceRoot) : await cleanupDirectoriesBefore(tempReferenceRoot, beforeTime);
  }

  return result;
}

function normalizeCleanupRetentionDays(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return DEFAULT_STORAGE_CLEANUP_DAYS;
  return Math.min(Math.max(Math.round(next), 0), MAX_STORAGE_CLEANUP_DAYS);
}

async function cleanupImageJobsBefore(beforeTime) {
  const jobs = await listImageJobs();
  const targets = jobs.filter((job) => {
    const updatedAt = new Date(job?.updatedAt || job?.completedAt || job?.createdAt || 0).getTime();
    return Number.isFinite(updatedAt) && updatedAt <= beforeTime;
  });
  for (const job of targets) {
    activeImageJobs.get(job.jobId)?.abortController?.abort?.();
    await deleteImageJob(job);
  }
  return targets.length;
}

async function cleanupAllImageJobs() {
  const jobs = await listImageJobs();
  for (const job of jobs) {
    activeImageJobs.get(job.jobId)?.abortController?.abort?.();
    await deleteImageJob(job);
  }
  return jobs.length;
}

async function cleanupAllJsonFiles(dirPath) {
  if (!(await fileExists(dirPath))) return 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    await rm(path.join(dirPath, entry.name), { force: true });
    deleted += 1;
  }
  return deleted;
}

async function cleanupJsonFilesBefore(dirPath, beforeTime) {
  if (!(await fileExists(dirPath))) return 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const fullPath = path.join(dirPath, entry.name);
    const entryStat = await stat(fullPath);
    if (Number(entryStat.mtimeMs || 0) > beforeTime) continue;
    await rm(fullPath, { force: true });
    deleted += 1;
  }
  return deleted;
}

async function cleanupDirectoriesBefore(dirPath, beforeTime) {
  if (!(await fileExists(dirPath))) return 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const entryStat = await stat(fullPath);
    if (Number(entryStat.mtimeMs || 0) > beforeTime) continue;
    await rm(fullPath, { recursive: true, force: true });
    deleted += 1;
  }
  return deleted;
}

async function cleanupAllDirectories(dirPath) {
  if (!(await fileExists(dirPath))) return 0;
  const entries = await readdir(dirPath, { withFileTypes: true });
  let deleted = 0;
  for (const entry of entries) {
    await rm(path.join(dirPath, entry.name), { recursive: true, force: true });
    deleted += 1;
  }
  return deleted;
}

function formatBackupTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  const second = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function toPublicVisitorState(visitor) {
  const safeVisitor = normalizeVisitorState(visitor);
  return {
    visitorId: safeVisitor.visitorId,
    tier: safeVisitor.tier,
    quotaLimit: safeVisitor.quotaLimit,
    quotaUsed: safeVisitor.quotaUsed,
    quotaRemaining: Math.max(0, safeVisitor.quotaLimit - safeVisitor.quotaUsed),
    canGenerate: safeVisitor.quotaUsed < safeVisitor.quotaLimit,
    contactMessage: safeVisitor.contactMessage
  };
}

async function listVisitorStates() {
  await mkdir(visitorStateRoot, { recursive: true });
  const entries = await readdir(visitorStateRoot, { withFileTypes: true });
  const visitors = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readVisitorState(entry.name.replace(/\.json$/, "")))
  );
  return visitors.filter(Boolean);
}

function toPublicAdminVisitor(visitor) {
  const safeVisitor = normalizeVisitorState(visitor);
  return {
    visitorId: safeVisitor.visitorId,
    tier: safeVisitor.tier,
    quotaLimit: safeVisitor.quotaLimit,
    quotaUsed: safeVisitor.quotaUsed,
    quotaRemaining: Math.max(0, safeVisitor.quotaLimit - safeVisitor.quotaUsed),
    invitedAt: safeVisitor.invitedAt,
    createdAt: safeVisitor.createdAt,
    updatedAt: safeVisitor.updatedAt
  };
}

function getOrderPricingSnapshot(settings) {
  const safeSettings = normalizeAppSettings(settings);
  return {
    enabled: safeSettings.fridgeMagnetOrderingEnabled === true,
    unitPriceCents: safeSettings.fridgeMagnetUnitPriceCents,
    singleItemShippingFeeCents: safeSettings.singleItemShippingFeeCents,
    freeShippingItemCount: DEFAULT_FREE_SHIPPING_ITEM_COUNT
  };
}

function calculateOrderAmounts(itemCount, pricing) {
  const safeItemCount = Math.max(0, Number(itemCount || 0));
  const safeUnitPrice = normalizeMoneyCents(pricing?.unitPriceCents, DEFAULT_FRIDGE_MAGNET_UNIT_PRICE_CENTS);
  const safeShipping = normalizeMoneyCents(pricing?.singleItemShippingFeeCents, DEFAULT_SINGLE_ITEM_SHIPPING_FEE_CENTS);
  const subtotalCents = safeItemCount * safeUnitPrice;
  const shippingFeeCents = safeItemCount === 1 ? safeShipping : 0;
  return {
    itemCount: safeItemCount,
    unitPriceCents: safeUnitPrice,
    shippingFeeCents,
    subtotalCents,
    totalCents: subtotalCents + shippingFeeCents
  };
}

function normalizeOrderPaymentStatus(value, fallback = "unpaid") {
  const current = String(value || fallback).trim();
  return ORDER_PAYMENT_STATUS_VALUES.has(current) ? current : fallback;
}

function normalizeOrderFulfillmentStatus(value, fallback = "new") {
  const current = String(value || fallback).trim();
  return ORDER_FULFILLMENT_STATUS_VALUES.has(current) ? current : fallback;
}

function maskPhone(phone) {
  const normalized = String(phone || "").replace(/\s+/g, "");
  if (normalized.length < 7) return normalized;
  return `${normalized.slice(0, 3)}****${normalized.slice(-4)}`;
}

function generateOrderNo() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");
  const random = Math.random().toString().slice(2, 8);
  return `FM${year}${month}${day}${hour}${minute}${second}${random}`;
}

function buildOrderReturnUrl(req, order) {
  const origin = getRequestOrigin(req);
  return `${origin}/fridge/orders/${encodeURIComponent(order.id)}?token=${encodeURIComponent(order.publicToken)}`;
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  const protocol = forwardedProto || (req.secure ? "https" : "http");
  return `${protocol}://${host}`;
}

function getWechatConfig() {
  return {
    appId: String(process.env.WECHAT_PAY_APP_ID || "").trim(),
    mchId: String(process.env.WECHAT_PAY_MCH_ID || "").trim(),
    apiV3Key: String(process.env.WECHAT_PAY_API_V3_KEY || "").trim(),
    serialNo: String(process.env.WECHAT_PAY_SERIAL_NO || "").trim(),
    privateKey: String(process.env.WECHAT_PAY_PRIVATE_KEY || "").trim(),
    notifyUrl: String(process.env.WECHAT_PAY_NOTIFY_URL || "").trim(),
    oauthRedirectUrl: String(process.env.WECHAT_OAUTH_REDIRECT_URL || "").trim()
  };
}

function assertWechatPaymentConfigured({ requireOAuth = false } = {}) {
  const config = getWechatConfig();
  const missing = [];
  if (!config.appId) missing.push("WECHAT_PAY_APP_ID");
  if (!config.mchId) missing.push("WECHAT_PAY_MCH_ID");
  if (!config.apiV3Key) missing.push("WECHAT_PAY_API_V3_KEY");
  if (!config.serialNo) missing.push("WECHAT_PAY_SERIAL_NO");
  if (!config.privateKey) missing.push("WECHAT_PAY_PRIVATE_KEY");
  if (!config.notifyUrl) missing.push("WECHAT_PAY_NOTIFY_URL");
  if (requireOAuth && !config.oauthRedirectUrl) missing.push("WECHAT_OAUTH_REDIRECT_URL");
  if (missing.length) {
    throw createHttpError(503, `微信支付配置缺失：${missing.join("、")}`);
  }
  return config;
}

function isWechatBrowser(req) {
  const userAgent = String(req.headers["user-agent"] || "");
  return /MicroMessenger/i.test(userAgent);
}

function createWechatAuthorizationUrl(req, orderId) {
  const config = assertWechatPaymentConfigured({ requireOAuth: true });
  const state = Buffer.from(JSON.stringify({
    orderId,
    token: String(req.body?.token || req.query?.token || ""),
    paymentStatus: String(req.query?.paymentStatus || "")
  }), "utf-8").toString("base64url");
  const redirectUri = encodeURIComponent(config.oauthRedirectUrl);
  return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(config.appId)}&redirect_uri=${redirectUri}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(state)}#wechat_redirect`;
}

async function fetchWechatOpenId(code) {
  const config = assertWechatPaymentConfigured({ requireOAuth: true });
  const oauthAppSecret = String(process.env.WECHAT_OAUTH_APP_SECRET || "").trim();
  if (!oauthAppSecret) {
    throw createHttpError(503, "微信网页授权未完成配置：缺少 WECHAT_OAUTH_APP_SECRET。");
  }
  const url = new URL("https://api.weixin.qq.com/sns/oauth2/access_token");
  url.searchParams.set("appid", config.appId);
  url.searchParams.set("secret", oauthAppSecret);
  url.searchParams.set("code", String(code || ""));
  url.searchParams.set("grant_type", "authorization_code");

  const response = await fetch(url, { method: "GET" });
  const payload = await response.json();
  if (!response.ok || payload.errcode) {
    throw createHttpError(502, payload.errmsg || "获取微信用户标识失败。");
  }
  const openId = String(payload.openid || "").trim();
  if (!openId) throw createHttpError(502, "微信未返回 openid。");
  return openId;
}

function verifyWechatNotifySignature(req, bodyText) {
  const signature = String(req.get("Wechatpay-Signature") || "");
  const nonce = String(req.get("Wechatpay-Nonce") || "");
  const timestamp = String(req.get("Wechatpay-Timestamp") || "");
  const publicKeyPem = String(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY || "").trim();
  if (!publicKeyPem) {
    throw createHttpError(503, "微信支付平台证书公钥未配置：WECHAT_PAY_PLATFORM_PUBLIC_KEY。");
  }
  if (!signature || !nonce || !timestamp) {
    throw createHttpError(400, "微信支付回调签名头缺失。");
  }

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${timestamp}\n${nonce}\n${bodyText}\n`);
  verifier.end();
  const ok = verifier.verify(createPublicKey(publicKeyPem), signature, "base64");
  if (!ok) throw createHttpError(401, "微信支付回调验签失败。");
}

function buildWechatAuthorizationHeader(method, urlPath, body = "") {
  const config = assertWechatPaymentConfigured();
  const nonceStr = randomUUID().replace(/-/g, "");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = `${method}\n${urlPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  const signature = signer.sign(createPrivateKey(config.privateKey), "base64");
  const value = [
    `mchid="${config.mchId}"`,
    `nonce_str="${nonceStr}"`,
    `signature="${signature}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${config.serialNo}"`
  ].join(",");
  return `WECHATPAY2-SHA256-RSA2048 ${value}`;
}

async function callWechatPayApi(method, pathname, bodyObject = null) {
  const config = assertWechatPaymentConfigured();
  const bodyText = bodyObject ? JSON.stringify(bodyObject) : "";
  const response = await fetch(`https://api.mch.weixin.qq.com${pathname}`, {
    method,
    headers: {
      Accept: "application/json",
      Authorization: buildWechatAuthorizationHeader(method, pathname, bodyText),
      "Content-Type": "application/json",
      "User-Agent": "PromptReferenceBoard/1.0",
      ...(config.serialNo ? { "Wechatpay-Serial": config.serialNo } : {})
    },
    body: bodyText || undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw createHttpError(502, payload.message || payload.detail || `微信支付请求失败（${response.status}）`);
  }
  return payload;
}

function signJsapiPayParams({ appId, timeStamp, nonceStr, prepayId }) {
  const config = assertWechatPaymentConfigured();
  const packageValue = `prepay_id=${prepayId}`;
  const message = `${appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;
  const signer = createSign("RSA-SHA256");
  signer.update(message);
  signer.end();
  return signer.sign(createPrivateKey(config.privateKey), "base64");
}

function normalizePhoneNumber(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

function validateMainlandPhone(value) {
  return /^1\d{10}$/.test(normalizePhoneNumber(value));
}

function normalizeOrderAddress(payload) {
  const mergedAddress = String(payload?.address || payload?.addressDetail || "").trim();
  return {
    receiverName: String(payload?.receiverName || "").trim(),
    receiverPhone: normalizePhoneNumber(payload?.receiverPhone || ""),
    province: String(payload?.province || "").trim(),
    city: String(payload?.city || "").trim(),
    district: String(payload?.district || "").trim(),
    addressDetail: mergedAddress,
    remark: String(payload?.remark || "").trim()
  };
}

function assertValidOrderAddress(address) {
  if (!address.receiverName) throw createHttpError(400, "请填写收件人姓名。");
  if (!validateMainlandPhone(address.receiverPhone)) throw createHttpError(400, "请填写正确的手机号。");
  if (!address.addressDetail) throw createHttpError(400, "请填写收货地址。");
}

function assertOrderOwnership(req, order, token = "") {
  if (!order) throw createHttpError(404, "订单不存在。");
  if (order.visitorId === req.visitorId) return;
  if (token && safeCompareString(token, order.publicToken)) return;
  throw createHttpError(403, "无权访问该订单。");
}

function safeCompareString(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function toPublicOrder(order, options = {}) {
  if (!order) return null;
  const includePrivate = Boolean(options.includePrivate);
  const includeToken = Boolean(options.includeToken);
  const safeOrder = {
    ...order,
    paymentStatus: normalizeOrderPaymentStatus(order.paymentStatus),
    fulfillmentStatus: normalizeOrderFulfillmentStatus(order.fulfillmentStatus),
    items: Array.isArray(order.items) ? order.items : [],
    paymentEvents: Array.isArray(order.paymentEvents) ? order.paymentEvents : []
  };
  return {
    id: safeOrder.id,
    orderNo: safeOrder.orderNo,
    experienceType: safeOrder.experienceType,
    paymentStatus: safeOrder.paymentStatus,
    fulfillmentStatus: safeOrder.fulfillmentStatus,
    itemCount: safeOrder.itemCount,
    unitPriceCents: safeOrder.unitPriceCents,
    shippingFeeCents: safeOrder.shippingFeeCents,
    subtotalCents: safeOrder.subtotalCents,
    totalCents: safeOrder.totalCents,
    remark: safeOrder.remark,
    receiverName: safeOrder.receiverName,
    publicToken: includeToken ? safeOrder.publicToken : "",
    receiverPhone: includePrivate ? safeOrder.receiverPhone : maskPhone(safeOrder.receiverPhone),
    province: safeOrder.province,
    city: safeOrder.city,
    district: safeOrder.district,
    addressDetail: safeOrder.addressDetail,
    adminRemark: includePrivate ? safeOrder.adminRemark : "",
    lastPaymentChannel: safeOrder.lastPaymentChannel,
    lastPaymentError: safeOrder.lastPaymentError,
    expiresAt: safeOrder.expiresAt,
    paidAt: safeOrder.paidAt,
    shippedAt: safeOrder.shippedAt,
    completedAt: safeOrder.completedAt,
    cancelledAt: safeOrder.cancelledAt,
    createdAt: safeOrder.createdAt,
    updatedAt: safeOrder.updatedAt,
    wechatTransactionId: includePrivate ? safeOrder.wechatTransactionId : "",
    outTradeNo: includePrivate ? safeOrder.outTradeNo : "",
    items: safeOrder.items.map((item) => ({
      orderId: item.orderId,
      jobId: item.jobId,
      styleId: item.styleId,
      styleName: item.styleName,
      imageUrl: item.imageUrl,
      thumbnailUrl: item.thumbnailUrl,
      sortOrder: item.sortOrder
    })),
    paymentEvents: includePrivate ? safeOrder.paymentEvents : []
  };
}

async function readInviteCodes() {
  try {
    const codes = JSON.parse(await readFile(inviteCodePath, "utf-8"));
    return Array.isArray(codes) ? codes.map(normalizeInviteCode) : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function saveInviteCodes(inviteCodes) {
  await writeFile(inviteCodePath, `${JSON.stringify(inviteCodes.map(normalizeInviteCode), null, 2)}\n`, "utf-8");
}

function normalizeInviteCode(inviteCode) {
  return {
    id: String(inviteCode?.id || randomUUID()),
    code: String(inviteCode?.code || "").trim().toUpperCase(),
    enabled: inviteCode?.enabled !== false,
    maxRedemptions: 1,
    redeemedCount: Math.max(0, Number(inviteCode?.redeemedCount || 0)),
    redeemedByVisitorIds: Array.isArray(inviteCode?.redeemedByVisitorIds) ? inviteCode.redeemedByVisitorIds.map(String) : [],
    createdAt: inviteCode?.createdAt || new Date().toISOString(),
    updatedAt: inviteCode?.updatedAt || new Date().toISOString()
  };
}

function toPublicInviteCode(inviteCode) {
  const safeInvite = normalizeInviteCode(inviteCode);
  return {
    id: safeInvite.id,
    code: safeInvite.code,
    enabled: safeInvite.enabled,
    maxRedemptions: safeInvite.maxRedemptions,
    redeemedCount: safeInvite.redeemedCount,
    remainingRedemptions: Math.max(0, safeInvite.maxRedemptions - safeInvite.redeemedCount),
    createdAt: safeInvite.createdAt,
    updatedAt: safeInvite.updatedAt
  };
}

async function createInviteCodes(count, prefix = "") {
  const inviteCodes = await readInviteCodes();
  const now = new Date().toISOString();
  const created = Array.from({ length: count }, () => normalizeInviteCode({
    id: randomUUID(),
    code: generateInviteCode(prefix),
    enabled: true,
    maxRedemptions: INVITE_DEFAULT_MAX_REDEMPTIONS,
    redeemedCount: 0,
    redeemedByVisitorIds: [],
    createdAt: now,
    updatedAt: now
  }));
  await saveInviteCodes(inviteCodes.concat(created));
  return created;
}

function generateInviteCode(prefix = "") {
  const base = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return prefix ? `${prefix}-${base}` : base;
}

async function updateInviteCode(id, patch) {
  const inviteCodes = await readInviteCodes();
  const index = inviteCodes.findIndex((item) => item.id === id);
  if (index < 0) return null;
  inviteCodes[index] = normalizeInviteCode({
    ...inviteCodes[index],
    enabled: patch.enabled === undefined ? inviteCodes[index].enabled : Boolean(patch.enabled),
    updatedAt: new Date().toISOString()
  });
  await saveInviteCodes(inviteCodes);
  return inviteCodes[index];
}

async function redeemInviteCode(req, code) {
  const inviteCodes = await readInviteCodes();
  const normalizedCode = String(code || "").trim().toUpperCase();
  const invite = inviteCodes.find((item) => item.code === normalizedCode);
  if (!invite || !invite.enabled) {
    throw createHttpError(400, "邀请码无效或已停用。");
  }
  if (invite.redeemedCount >= invite.maxRedemptions) {
    throw createHttpError(400, "邀请码已被使用。");
  }

  invite.redeemedCount += 1;
  invite.redeemedByVisitorIds = invite.redeemedByVisitorIds.concat(req.visitorId);
  invite.updatedAt = new Date().toISOString();
  await saveInviteCodes(inviteCodes);
  return upgradeVisitorByInvite(req);
}

async function upgradeVisitorByInvite(req) {
  const visitor = await getVisitorState(req);
  return saveVisitorState({
    ...visitor,
    tier: "invited",
    quotaLimit: Math.max(0, Number(visitor.quotaLimit || 0)) + VISITOR_INVITE_BONUS,
    invitedAt: visitor.invitedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function enforceVisitorQuota(visitor, cost) {
  const remaining = Math.max(0, Number(visitor.quotaLimit || 0) - Number(visitor.quotaUsed || 0));
  if (remaining < cost) {
    throw createHttpError(403, visitor.contactMessage || DEFAULT_CONTACT_MESSAGE);
  }
}

async function consumeVisitorQuota(visitorId, cost) {
  const current = await readVisitorState(visitorId);
  if (!current) return;
  await saveVisitorState({
    ...current,
    quotaUsed: Math.max(0, Number(current.quotaUsed || 0)) + Math.max(0, Number(cost || 0)),
    updatedAt: new Date().toISOString()
  });
}

async function consumeVisitorQuotaForDrawCardSession(visitorId, sessionId, cost) {
  const current = await readVisitorState(visitorId);
  if (!current) return "missing_visitor";

  const chargedSessionIds = Array.isArray(current.chargedDrawCardSessionIds)
    ? current.chargedDrawCardSessionIds.map((value) => String(value || "")).filter(Boolean)
    : [];

  if (chargedSessionIds.includes(sessionId)) {
    return "already_charged";
  }

  await saveVisitorState({
    ...current,
    quotaUsed: Math.max(0, Number(current.quotaUsed || 0)) + Math.max(0, Number(cost || 0)),
    chargedDrawCardSessionIds: chargedSessionIds.concat(sessionId),
    updatedAt: new Date().toISOString()
  });
  return "charged";
}

async function estimateDrawCardQuotaCost() {
  return 1;
}

async function enforceVisitorRunningJobLimit(visitorId, config = getPublicExperienceConfig(DEFAULT_PUBLIC_EXPERIENCE_TYPE)) {
  const jobs = await listImageJobs();
  const running = jobs.filter((job) => job.visibility === "public" && job.ownerVisitorId === visitorId && ["queued", "running"].includes(job.status));
  if (running.length >= VISITOR_RUNNING_JOB_LIMIT) {
    throw createHttpError(409, config?.runningLimitMessage || "当前已有进行中的公开生成，请等待这一轮完成。");
  }
}

async function verifyAdminCredentials(username, password) {
  const expectedUsername = String(process.env.ADMIN_USERNAME || "").trim();
  const expectedPassword = String(process.env.ADMIN_PASSWORD || "");
  if (!expectedUsername || !expectedPassword) {
    throw createHttpError(503, "后台账号尚未配置。");
  }
  if (!safeCompare(username, expectedUsername) || !safeCompare(password, expectedPassword)) {
    throw createHttpError(401, "账号或密码错误。");
  }
}

function safeCompare(left, right) {
  const leftHash = createHash("sha256").update(String(left || "")).digest();
  const rightHash = createHash("sha256").update(String(right || "")).digest();
  return timingSafeEqual(leftHash, rightHash);
}

async function createAdminSession() {
  const now = Date.now();
  const session = {
    sessionId: randomUUID(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ADMIN_SESSION_TTL_MS).toISOString()
  };
  await mkdir(adminSessionRoot, { recursive: true });
  await writeFile(getAdminSessionPath(session.sessionId), `${JSON.stringify(session, null, 2)}\n`, "utf-8");
  return session;
}

async function readAdminSession(sessionId) {
  if (!isSafeAdminSessionId(sessionId)) return null;
  try {
    const session = JSON.parse(await readFile(getAdminSessionPath(sessionId), "utf-8"));
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      await deleteAdminSession(sessionId);
      return null;
    }
    return session;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function deleteAdminSession(sessionId) {
  if (!isSafeAdminSessionId(sessionId)) return;
  await rm(getAdminSessionPath(sessionId), { force: true });
}

function toPublicAdminSession(session) {
  return {
    sessionId: String(session?.sessionId || ""),
    expiresAt: session?.expiresAt || null
  };
}

function assertVisitorOwnsSession(req, session, config = getPublicExperienceConfig(session?.experienceType)) {
  if (session.ownerVisitorId !== req.visitorId) {
    throw createHttpError(403, `无权访问该${config?.label || "公开"}记录。`);
  }
}

function assertCanToggleLike(req, job) {
  if (job.visibility !== "public" || job.ownerVisitorId !== req.visitorId) {
    throw createHttpError(403, "无权操作该结果。");
  }
}

function toPublicClipItem(job) {
  const result = normalizeJobResult(job.result);
  return {
    jobId: String(job.jobId || ""),
    experienceType: normalizePublicExperienceType(job.experienceType),
    styleId: String(job.styleId || ""),
    styleName: String(job.styleName || ""),
    imageUrl: String(result?.previewUrl || result?.thumbnailUrl || ""),
    thumbnailUrl: String(result?.thumbnailUrl || result?.previewUrl || ""),
    isLiked: Boolean(job.isLiked),
    likedAt: job.likedAt || null
  };
}

function summarizeTelemetryPhases(telemetry) {
  const safeTelemetry = telemetry && typeof telemetry === "object" ? telemetry : {};
  const client = safeTelemetry.client && typeof safeTelemetry.client === "object" ? safeTelemetry.client : {};
  const server = safeTelemetry.server && typeof safeTelemetry.server === "object" ? safeTelemetry.server : {};
  return [
    { key: "client_prepare", label: "本地压图", valueMs: normalizeTelemetryNumber(client.prepareReferenceMs) },
    { key: "upload_parse", label: "上传解析", valueMs: normalizeTelemetryNumber(server.uploadParseMs) },
    { key: "session_create", label: "建会话", valueMs: normalizeTelemetryNumber(server.sessionCreateMs) },
    { key: "reference_persist", label: "参考图落盘", valueMs: normalizeTelemetryNumber(server.totalReferencePersistMs) },
    { key: "reference_thumbnail", label: "参考图缩略图", valueMs: normalizeTelemetryNumber(server.totalReferenceThumbnailMs) },
    { key: "final_total", label: "整轮总耗时", valueMs: normalizeTelemetryNumber(server.finalElapsedMs) }
  ].filter((item) => item.valueMs !== null);
}

function toPublicAdminDrawCardSession(session, publicJobs = []) {
  const current = normalizeDrawCardSession(session);
  const phases = summarizeTelemetryPhases(current.telemetry);
  const config = getPublicExperienceConfig(current.experienceType);
  return {
    sessionId: current.sessionId,
    traceId: current.traceId,
    experienceType: current.experienceType,
    experienceLabel: config.label,
    ownerVisitorId: current.ownerVisitorId,
    status: current.status,
    message: current.message,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    completedAt: current.completedAt,
    failedReason: current.failedReason,
    styleCount: current.items.length,
    jobSummary: current.telemetry.jobs,
    telemetry: current.telemetry,
    phases,
    charged: Boolean(current.quotaChargedAt),
    quotaChargedAt: current.quotaChargedAt,
    items: current.items,
    jobs: publicJobs
  };
}

async function sendAdminJobImage(res, job, options = {}) {
  const file = await resolveJobImageFile(job);
  if (!file) throw createHttpError(404, "高清图不存在。");
  const mimeType = mimeForExtension(path.extname(file).toLowerCase()) || "application/octet-stream";
  if (options.asDownload) {
    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(file)}"`);
  }
  res.type(mimeType);
  res.sendFile(file);
}

async function sendAdminReferenceImage(res, job, index) {
  const references = Array.isArray(job.originalReferences) ? [...job.originalReferences].sort((left, right) => Number(left.order || 0) - Number(right.order || 0)) : [];
  const reference = references[index];
  if (!reference) throw createHttpError(404, "参考图不存在。");
  const file = getJobReferenceFilePath(job.jobId, reference.url);
  if (!(await fileExists(file))) throw createHttpError(404, "参考图不存在。");
  res.type(reference.mimeType || mimeForExtension(path.extname(file).toLowerCase()) || "application/octet-stream");
  res.sendFile(file);
}

async function resolveJobImageFile(job) {
  const imageUrl = String(job?.result?.imageUrl || "");
  if (!imageUrl) return "";
  if (imageUrl.startsWith("/generated-images/")) {
    const filename = path.basename(imageUrl);
    const fullPath = path.join(generatedImageRoot, filename);
    return (await fileExists(fullPath)) ? fullPath : "";
  }
  return "";
}

function getJobReferenceFilePath(jobId, url) {
  return path.join(jobReferenceRoot, String(jobId), path.basename(String(url || "")));
}

async function removeStyleFromGroups(styleId) {
  const groups = await readStyleGroups();
  const nextGroups = groups.map((group) => ({
    ...group,
    styleIds: group.styleIds.filter((currentId) => currentId !== styleId)
  }));
  await saveStyleGroups(nextGroups);
}

async function createDrawCardSession(file, visitor, options = {}) {
  const config = getPublicExperienceConfig(options?.experienceType);
  const traceId = String(options?.traceId || "").trim() || randomUUID();
  const requestStartedAtMs = normalizeTelemetryNumber(options?.requestStartedAtMs) || nowMs();
  const clientMetrics = options?.clientMetrics && typeof options.clientMetrics === "object" ? options.clientMetrics : {};
  const sessionCreateStartedAtMs = nowMs();
  const [groups, styles] = await Promise.all([readStyleGroups(), readStyles()]);
  const group = groups.find((item) => String(item.name || "").trim() === config.styleGroupName);
  if (!group) {
    const error = new Error(`${config.label} group not found`);
    error.status = 503;
    error.publicMessage = config.unavailableMessage;
    throw error;
  }

  const styleMap = new Map(styles.map((style) => [style.id, style]));
  const groupStyles = (group.styleIds || []).map((styleId) => styleMap.get(styleId)).filter(Boolean);
  if (!groupStyles.length) {
    const error = new Error(`${config.label} group is empty`);
    error.status = 503;
    error.publicMessage = config.unavailableMessage;
    throw error;
  }

  const providers = getImageProviders();
  const provider = resolveImageProvider("", providers);
  if (!provider) {
    const error = new Error("No image providers configured");
    error.status = 503;
    error.publicMessage = config.unavailableMessage;
    throw error;
  }

  const sessionId = randomUUID();
  const now = new Date().toISOString();
  const ownerVisitorId = String(visitor?.visitorId || "");
  const uploadedBytes = Number(file.size || file.buffer?.length || 0);
  const sharedReferenceFiles = [
    {
      originalname: file.originalname || "draw-card-reference",
      mimetype: file.mimetype,
      size: Number(file.size || file.buffer?.length || 0),
      buffer: Buffer.from(file.buffer)
    }
  ];
  const providerChain = getProviderFallbackChain(provider.id, providers);
  const preparedJobs = [];
  const sessionItems = [];
  let totalReferencePersistMs = 0;
  let totalReferenceThumbnailMs = 0;
  let totalReferenceBytes = 0;

  logDrawCardTelemetry("session_create_started", {
    traceId,
    sessionId,
    visitorId: ownerVisitorId,
    styleCount: groupStyles.length,
    uploadedBytes,
    uploadParseMs: elapsedMs(requestStartedAtMs)
  });

  try {
    for (const [order, style] of groupStyles.entries()) {
      const prompt = String(style.prompt || "").trim();
      const styleStartedAtMs = nowMs();
      const referenceFiles = await buildBatchReferenceFiles(style, sharedReferenceFiles);
      const jobId = randomUUID();
      const styleName = formatStyleName(style);
      const persistedReferenceResult = await persistImageJobReferences(jobId, referenceFiles, {
        includeMetrics: true,
        telemetry: {
          traceId,
          sessionId,
          jobId,
          styleId: String(style.id || ""),
          styleName,
          order
        }
      });
      const originalReferences = persistedReferenceResult.references;
      totalReferencePersistMs += Number(persistedReferenceResult.metrics?.persistMs || 0);
      totalReferenceThumbnailMs += Number(persistedReferenceResult.metrics?.thumbnailMs || 0);
      totalReferenceBytes += Number(persistedReferenceResult.metrics?.totalBytes || 0);
      const job = {
        jobId,
        experienceType: config.experienceType,
        status: "queued",
        message: "任务已提交，等待生成。",
        result: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        prompt: buildPublicExperiencePrompt(prompt, config),
        size: group.size,
        referenceCount: referenceFiles.length,
        originalReferences,
        styleId: String(style.id || ""),
        styleName,
        styleGroupId: group.id,
        styleGroupName: group.name,
        provider: {
          id: provider.id,
          name: provider.name,
          model: provider.model
        },
        mode: referenceFiles.length ? "edit" : "generation",
        ownerVisitorId,
        visibility: "public",
        telemetry: {
          traceId,
          sessionId,
          styleId: String(style.id || ""),
          styleName,
          order,
          providerCallMs: null,
          persistResultMs: null,
          totalJobMs: null
        }
      };

      preparedJobs.push({
        job,
        runArgs: {
          jobId,
          body: {
            size: group.size,
            quality: "medium",
            output_format: "png",
            background: config.experienceType === "fridge-magnet" ? "opaque" : "auto",
            moderation: "auto",
            styleId: style.id,
            styleName,
            styleGroupId: group.id,
            styleGroupName: group.name
          },
          files: referenceFiles.map(cloneReferenceFile),
          outputFormat: "png",
          prompt: buildPublicExperiencePrompt(prompt, config),
          provider,
          providers: providerChain,
          telemetry: {
            traceId,
            sessionId,
            visitorId: ownerVisitorId,
            styleId: String(style.id || ""),
            styleName,
            order
          }
        }
      });
      sessionItems.push({
        order,
        jobId,
        styleId: String(style.id || ""),
        styleName
      });

      logDrawCardTelemetry("style_job_prepared", {
        traceId,
        sessionId,
        jobId,
        styleId: String(style.id || ""),
        styleName,
        order,
        referenceCount: referenceFiles.length,
        stylePrepareMs: elapsedMs(styleStartedAtMs),
        referencePersistMs: Number(persistedReferenceResult.metrics?.persistMs || 0),
        referenceThumbnailMs: Number(persistedReferenceResult.metrics?.thumbnailMs || 0)
      });
    }

    await Promise.all(preparedJobs.map((item) => saveImageJob(item.job)));

    const session = await saveDrawCardSession({
      sessionId,
      traceId,
      experienceType: config.experienceType,
      ownerVisitorId,
      status: "queued",
      message: config.waitingMessage,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      failedReason: "",
      quotaChargedAt: null,
      telemetry: {
        client: {
          prepareReferenceMs: clientMetrics.prepareReferenceMs,
          originalBytes: clientMetrics.originalBytes,
          uploadedBytes: clientMetrics.uploadedBytes || uploadedBytes,
          originalWidth: clientMetrics.originalWidth,
          originalHeight: clientMetrics.originalHeight,
          uploadedWidth: clientMetrics.uploadedWidth,
          uploadedHeight: clientMetrics.uploadedHeight,
          wasCompressed: Boolean(clientMetrics.wasCompressed)
        },
        server: {
          uploadParseMs: elapsedMs(requestStartedAtMs),
          sessionCreateMs: elapsedMs(sessionCreateStartedAtMs),
          requestAcceptedMs: elapsedMs(requestStartedAtMs),
          totalReferencePersistMs,
          totalReferenceThumbnailMs,
          totalReferenceBytes,
          finalStatus: "queued",
          finalElapsedMs: null,
          quotaChargeStatus: "",
          charged: false
        },
        jobs: summarizeDrawCardJobStatuses(sessionItems.map((item) => ({ status: item.status || "queued" })))
      },
      results: [],
      items: sessionItems
    });

    logDrawCardTelemetry("session_created", {
      traceId,
      sessionId,
      visitorId: ownerVisitorId,
      styleCount: groupStyles.length,
      sessionCreateMs: elapsedMs(sessionCreateStartedAtMs),
      requestAcceptedMs: elapsedMs(requestStartedAtMs),
      totalReferencePersistMs,
      totalReferenceThumbnailMs,
      totalReferenceBytes
    });

    preparedJobs.forEach((item) => {
      runImageJob(item.runArgs).catch((error) => {
        console.error("Draw card image job failed.", error);
      });
    });

    return session;
  } catch (error) {
    await Promise.all(
      preparedJobs.map(async (item) => {
        await deleteJobReferences(item.job);
        await rm(getImageJobPath(item.job.jobId), { force: true });
      })
    );
    await rm(getDrawCardSessionPath(sessionId), { force: true });
    logDrawCardTelemetry("session_create_failed", {
      traceId,
      sessionId,
      visitorId: ownerVisitorId,
      elapsedMs: elapsedMs(sessionCreateStartedAtMs),
      message: error.publicMessage || error.message || "unknown error"
    });
    throw error;
  }
}

async function readDrawCardSession(sessionId) {
  if (!isSafeDrawCardSessionId(sessionId)) return null;
  try {
    return normalizeDrawCardSession(JSON.parse(await readFile(getDrawCardSessionPath(sessionId), "utf-8")));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function listDrawCardSessions() {
  await mkdir(drawCardSessionRoot, { recursive: true });
  const entries = await readdir(drawCardSessionRoot, { withFileTypes: true });
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readDrawCardSession(entry.name.replace(/\.json$/, "")))
  );
  return sessions.filter(Boolean);
}

async function readLatestVisitorDrawCardSession(visitorId, experienceType = "") {
  if (!isSafeVisitorId(visitorId)) return null;
  const sessions = await listDrawCardSessions();
  const latest = sessions
    .filter(
      (session) =>
        session.ownerVisitorId === visitorId &&
        (!experienceType || normalizePublicExperienceType(session.experienceType) === normalizePublicExperienceType(experienceType))
    )
    .sort((left, right) =>
      String(right.updatedAt || right.completedAt || right.createdAt || "").localeCompare(
        String(left.updatedAt || left.completedAt || left.createdAt || "")
      )
    )[0];

  if (!latest) return null;
  if (!["queued", "running", "succeeded"].includes(String(latest.status || ""))) return null;
  return latest;
}

async function saveDrawCardSession(session) {
  await mkdir(drawCardSessionRoot, { recursive: true });
  const safeSession = normalizeDrawCardSession(session);
  await writeFile(getDrawCardSessionPath(safeSession.sessionId), `${JSON.stringify(safeSession, null, 2)}\n`, "utf-8");
  return safeSession;
}

async function withDrawCardSessionSyncLock(sessionId, task) {
  const key = String(sessionId || "");
  const previous = drawCardSessionSyncLocks.get(key) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  drawCardSessionSyncLocks.set(key, current);
  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    release();
    if (drawCardSessionSyncLocks.get(key) === current) {
      drawCardSessionSyncLocks.delete(key);
    }
  }
}

async function synchronizeDrawCardSession(session) {
  const normalizedSession = normalizeDrawCardSession(session);
  const config = getPublicExperienceConfig(normalizedSession.experienceType);
  return withDrawCardSessionSyncLock(normalizedSession.sessionId, async () => {
    const current = (await readDrawCardSession(normalizedSession.sessionId)) || normalizedSession;
    const jobs = await Promise.all(current.items.map((item) => readImageJob(item.jobId)));
    const normalizedItems = current.items.map((item, index) => {
      const job = jobs[index];
      return {
        ...item,
        status: job?.status || "failed"
      };
    });

    const failedJob = jobs.find((job) => !job || job.status === "failed");
    let nextStatus = "queued";
    let nextMessage = config.waitingMessage;
    let completedAt = current.completedAt || null;
    let failedReason = "";
    let results = [];
    let quotaChargedAt = current.quotaChargedAt || null;
    let quotaChargeStatus = "";

    if (failedJob) {
      nextStatus = "failed";
      nextMessage = config.failureMessage;
      completedAt = completedAt || new Date().toISOString();
      failedReason = config.failureMessage;
      await cancelDrawCardSiblingJobs(jobs);
    } else if (jobs.length && jobs.every((job) => job?.status === "succeeded")) {
      nextStatus = "succeeded";
      nextMessage = config.successMessage;
      completedAt = completedAt || new Date().toISOString();
      if (!quotaChargedAt) {
        const chargeStatus = await consumeVisitorQuotaForDrawCardSession(current.ownerVisitorId, current.sessionId, 1);
        quotaChargeStatus = chargeStatus;
        if (chargeStatus === "charged" || chargeStatus === "already_charged") {
          quotaChargedAt = new Date().toISOString();
        }
      } else {
        quotaChargeStatus = "already_charged";
      }
      results = normalizedItems
        .map((item) => {
          const job = jobs.find((currentJob) => currentJob?.jobId === item.jobId);
          return {
            order: item.order,
            jobId: item.jobId,
            styleId: item.styleId,
            styleName: item.styleName,
            imageUrl: String(job?.result?.previewUrl || job?.result?.thumbnailUrl || job?.result?.imageUrl || ""),
            thumbnailUrl: String(job?.result?.thumbnailUrl || job?.result?.previewUrl || job?.result?.imageUrl || ""),
            originalImageUrl: String(job?.result?.originalImageUrl || ""),
            previewUrl: String(job?.result?.previewUrl || job?.result?.thumbnailUrl || job?.result?.imageUrl || ""),
            isLiked: Boolean(job?.isLiked),
            likedAt: job?.likedAt || null
          };
        })
        .sort((a, b) => a.order - b.order);
    } else if (jobs.some((job) => job?.status === "running")) {
      nextStatus = "running";
      nextMessage = config.waitingMessage;
    } else {
      nextStatus = "queued";
      nextMessage = config.waitingMessage;
    }

    const nextTelemetry = {
      client: {
        ...(current.telemetry?.client || {})
      },
      server: {
        ...(current.telemetry?.server || {}),
        finalStatus: nextStatus,
        finalElapsedMs: completedAt && current.createdAt
          ? Math.max(0, Math.round(new Date(completedAt).getTime() - new Date(current.createdAt).getTime()))
          : current.telemetry?.server?.finalElapsedMs || null,
        quotaChargeStatus: quotaChargeStatus || current.telemetry?.server?.quotaChargeStatus || "",
        charged: Boolean(quotaChargedAt)
      },
      jobs: summarizeDrawCardJobStatuses(normalizedItems)
    };

    logDrawCardTelemetry("session_status_updated", {
      traceId: current.traceId,
      sessionId: current.sessionId,
      visitorId: current.ownerVisitorId,
      status: nextStatus,
      failedReason,
      quotaChargeStatus: nextTelemetry.server.quotaChargeStatus,
      charged: nextTelemetry.server.charged,
      jobSummary: nextTelemetry.jobs
    });

    return saveDrawCardSession({
      ...current,
      experienceType: config.experienceType,
      status: nextStatus,
      message: nextMessage,
      updatedAt: new Date().toISOString(),
      completedAt,
      failedReason,
      quotaChargedAt,
      telemetry: nextTelemetry,
      results,
      items: normalizedItems
    });
  });
}

async function synchronizeDrawCardSessionByJobId(jobId) {
  if (!isSafeImageJobId(jobId)) return null;
  const sessions = await listDrawCardSessions();
  const session = sessions.find((current) => current.items.some((item) => item.jobId === jobId));
  if (!session) return null;
  return synchronizeDrawCardSession(session);
}

async function cancelDrawCardSiblingJobs(jobs) {
  const cancellableJobs = jobs.filter((job) => job && ["queued", "running"].includes(job.status));
  await Promise.all(
    cancellableJobs.map(async (job) => {
      activeImageJobs.get(job.jobId)?.abortController.abort();
      await saveImageJob({
        ...job,
        status: "cancelled",
        message: "任务已停止。",
        updatedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      });
    })
  );
}

function normalizeDrawCardSession(session) {
  const telemetry = session?.telemetry && typeof session.telemetry === "object" ? session.telemetry : {};
  const telemetryClient = telemetry.client && typeof telemetry.client === "object" ? telemetry.client : {};
  const telemetryServer = telemetry.server && typeof telemetry.server === "object" ? telemetry.server : {};
  const config = getPublicExperienceConfig(session?.experienceType);
  return {
    sessionId: String(session?.sessionId || ""),
    traceId: String(session?.traceId || ""),
    experienceType: config.experienceType,
    ownerVisitorId: String(session?.ownerVisitorId || ""),
    status: String(session?.status || "queued"),
    message: String(session?.message || config.waitingMessage),
    createdAt: session?.createdAt || null,
    updatedAt: session?.updatedAt || null,
    completedAt: session?.completedAt || null,
    failedReason: String(session?.failedReason || ""),
    quotaChargedAt: session?.quotaChargedAt || null,
    telemetry: {
      client: {
        prepareReferenceMs: normalizeTelemetryNumber(telemetryClient.prepareReferenceMs),
        originalBytes: normalizeTelemetryNumber(telemetryClient.originalBytes),
        uploadedBytes: normalizeTelemetryNumber(telemetryClient.uploadedBytes),
        originalWidth: normalizeTelemetryNumber(telemetryClient.originalWidth),
        originalHeight: normalizeTelemetryNumber(telemetryClient.originalHeight),
        uploadedWidth: normalizeTelemetryNumber(telemetryClient.uploadedWidth),
        uploadedHeight: normalizeTelemetryNumber(telemetryClient.uploadedHeight),
        wasCompressed: Boolean(telemetryClient.wasCompressed)
      },
      server: {
        uploadParseMs: normalizeTelemetryNumber(telemetryServer.uploadParseMs),
        sessionCreateMs: normalizeTelemetryNumber(telemetryServer.sessionCreateMs),
        requestAcceptedMs: normalizeTelemetryNumber(telemetryServer.requestAcceptedMs),
        totalReferencePersistMs: normalizeTelemetryNumber(telemetryServer.totalReferencePersistMs),
        totalReferenceThumbnailMs: normalizeTelemetryNumber(telemetryServer.totalReferenceThumbnailMs),
        totalReferenceBytes: normalizeTelemetryNumber(telemetryServer.totalReferenceBytes),
        finalStatus: String(telemetryServer.finalStatus || ""),
        finalElapsedMs: normalizeTelemetryNumber(telemetryServer.finalElapsedMs),
        quotaChargeStatus: String(telemetryServer.quotaChargeStatus || ""),
        charged: Boolean(telemetryServer.charged)
      },
      jobs: summarizeDrawCardJobStatuses(Array.isArray(session?.items) ? session.items : [])
    },
    results: Array.isArray(session?.results)
      ? session.results
          .map((result, index) => ({
            order: Number(result?.order ?? index),
            jobId: String(result?.jobId || ""),
            styleId: String(result?.styleId || ""),
            styleName: String(result?.styleName || ""),
            imageUrl: String(result?.imageUrl || result?.previewUrl || ""),
            thumbnailUrl: String(result?.thumbnailUrl || ""),
            originalImageUrl: String(result?.originalImageUrl || ""),
            previewUrl: String(result?.previewUrl || result?.thumbnailUrl || result?.imageUrl || ""),
            isLiked: Boolean(result?.isLiked),
            likedAt: result?.likedAt || null
          }))
          .sort((a, b) => a.order - b.order)
      : [],
    items: Array.isArray(session?.items)
      ? session.items
          .map((item, index) => ({
            order: Number(item?.order ?? index),
            jobId: String(item?.jobId || ""),
            styleId: String(item?.styleId || ""),
            styleName: String(item?.styleName || ""),
            status: String(item?.status || "queued")
          }))
          .sort((a, b) => a.order - b.order)
      : []
  };
}

function toPublicDrawCardSession(session) {
  const current = normalizeDrawCardSession(session);
  return {
    sessionId: current.sessionId,
    traceId: current.traceId,
    experienceType: current.experienceType,
    status: current.status,
    message: current.message,
    createdAt: current.createdAt,
    updatedAt: current.updatedAt,
    completedAt: current.completedAt,
    failedReason: current.failedReason,
    telemetry: current.telemetry,
    results: current.results
  };
}

async function prepareImageJobStorage() {
  await mkdir(imageJobRoot, { recursive: true });
  await mkdir(drawCardSessionRoot, { recursive: true });
  await mkdir(tempReferenceRoot, { recursive: true });
  await mkdir(visitorStateRoot, { recursive: true });
  await mkdir(adminSessionRoot, { recursive: true });
  await mkdir(generatedImageRoot, { recursive: true });
  await mkdir(generatedPreviewRoot, { recursive: true });
  await mkdir(generatedThumbnailRoot, { recursive: true });
  await mkdir(jobReferenceRoot, { recursive: true });
  await mkdir(jobReferenceThumbnailRoot, { recursive: true });

  const entries = await readdir(imageJobRoot, { withFileTypes: true });
  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const job = await readImageJob(entry.name.replace(/\.json$/, ""));
        if (!job || !["queued", "running"].includes(job.status)) return;
        await saveImageJob({
          ...job,
          status: "failed",
          message: "服务重启，任务已中断，请重新生成。",
          updatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString()
        });
      })
  );
}

async function createTemporaryReference(file, ownerVisitorId = "") {
  const referenceId = randomUUID();
  const dir = path.join(tempReferenceRoot, referenceId);
  const extension = extensionForMime(file.mimetype);
  const filename = `reference.${extension}`;
  const metadata = {
    referenceId,
    name: file.originalname || `reference.${extension}`,
    mimeType: file.mimetype,
    size: Number(file.size || file.buffer?.length || 0),
    filename,
    ownerVisitorId: String(ownerVisitorId || ""),
    createdAt: new Date().toISOString()
  };

  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), file.buffer);
  await writeFile(path.join(dir, "metadata.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf-8");

  return metadata;
}

async function collectReferenceFiles(uploadedFiles, referenceIds) {
  if (!referenceIds.length) return uploadedFiles;
  const temporaryFiles = await Promise.all(referenceIds.map(readTemporaryReference));
  return [...temporaryFiles, ...uploadedFiles];
}

function parseReferenceIds(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  const text = String(value).trim();
  if (!text) return [];

  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.map(String).map((item) => item.trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readTemporaryReference(referenceId) {
  if (!isSafeReferenceId(referenceId)) {
    const error = new Error("Reference not found");
    error.status = 400;
    error.publicMessage = "Reference image is missing or expired.";
    throw error;
  }

  const dir = path.join(tempReferenceRoot, String(referenceId));
  const metadataPath = path.join(dir, "metadata.json");
  let metadata;

  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf-8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      const nextError = new Error("Reference not found");
      nextError.status = 400;
      nextError.publicMessage = "Reference image is missing or expired.";
      throw nextError;
    }
    throw error;
  }

  const buffer = await readFile(path.join(dir, metadata.filename));
  return {
    originalname: metadata.name,
    mimetype: metadata.mimeType,
    size: metadata.size,
    buffer
  };
}

async function deleteTemporaryReferences(referenceIds) {
  if (!referenceIds?.length) return;
  await Promise.all(referenceIds.map((referenceId) => deleteTemporaryReference(referenceId)));
}

async function deleteTemporaryReference(referenceId) {
  if (!isSafeReferenceId(referenceId)) return;
  await rm(path.join(tempReferenceRoot, String(referenceId)), { recursive: true, force: true });
}

async function runImageJob({ jobId, body, files, outputFormat, prompt, provider, providers, telemetry = null }) {
  let job = await readImageJob(jobId);
  if (!job) return;
  if (job.status === "cancelled") return;
  const abortController = new AbortController();
  activeImageJobs.set(jobId, { abortController });
  const jobRunStartedAtMs = nowMs();

  logDrawCardTelemetry("job_started", {
    traceId: telemetry?.traceId || "",
    sessionId: telemetry?.sessionId || "",
    visitorId: telemetry?.visitorId || "",
    jobId,
    styleId: telemetry?.styleId || "",
    styleName: telemetry?.styleName || "",
    order: normalizeTelemetryNumber(telemetry?.order),
    referenceCount: Array.isArray(files) ? files.length : 0,
    mode: Array.isArray(files) && files.length ? "edit" : "generation",
    providerId: provider?.id || "",
    providerModel: provider?.model || ""
  });

  job = await saveImageJob({
    ...job,
    status: "running",
    message: "正在生成图片。",
    telemetry: {
      ...(job.telemetry || {}),
      traceId: telemetry?.traceId || job.telemetry?.traceId || "",
      sessionId: telemetry?.sessionId || job.telemetry?.sessionId || "",
      styleId: telemetry?.styleId || job.telemetry?.styleId || "",
      styleName: telemetry?.styleName || job.telemetry?.styleName || "",
      order: normalizeTelemetryNumber(telemetry?.order ?? job.telemetry?.order),
      providerCallMs: null,
      persistResultMs: null,
      totalJobMs: null
    },
    updatedAt: new Date().toISOString()
  });

  try {
    const providerCallStartedAtMs = nowMs();
    const execution = await executeImageJobWithFailover({
      body,
      files,
      outputFormat,
      prompt,
      provider,
      providers,
      signal: abortController.signal,
      telemetry
    });
    const providerCallMs = elapsedMs(providerCallStartedAtMs);
    const result = execution.result;
    const latestJob = await readImageJob(jobId);
    if (!latestJob || latestJob.status === "cancelled") return;
    const persistResultStartedAtMs = nowMs();
    const publicResult = await persistImageJobResult(jobId, result, outputFormat);
    const persistResultMs = elapsedMs(persistResultStartedAtMs);
    await saveImageJob({
      ...latestJob,
      status: "succeeded",
      message: "生成完成。",
      result: {
        ...publicResult,
        provider: execution.provider
      },
      provider: execution.provider,
      telemetry: {
        ...(latestJob.telemetry || {}),
        traceId: telemetry?.traceId || latestJob.telemetry?.traceId || "",
        sessionId: telemetry?.sessionId || latestJob.telemetry?.sessionId || "",
        styleId: telemetry?.styleId || latestJob.telemetry?.styleId || "",
        styleName: telemetry?.styleName || latestJob.telemetry?.styleName || "",
        order: normalizeTelemetryNumber(telemetry?.order ?? latestJob.telemetry?.order),
        providerCallMs,
        persistResultMs,
        totalJobMs: elapsedMs(jobRunStartedAtMs)
      },
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
    logDrawCardTelemetry("job_succeeded", {
      traceId: telemetry?.traceId || "",
      sessionId: telemetry?.sessionId || "",
      visitorId: telemetry?.visitorId || "",
      jobId,
      styleId: telemetry?.styleId || "",
      styleName: telemetry?.styleName || "",
      order: normalizeTelemetryNumber(telemetry?.order),
      providerId: execution.provider?.id || provider?.id || "",
      providerModel: execution.provider?.model || provider?.model || "",
      providerCallMs,
      persistResultMs,
      totalJobMs: elapsedMs(jobRunStartedAtMs)
    });
    await synchronizeDrawCardSessionByJobId(jobId);
  } catch (error) {
    const latestJob = await readImageJob(jobId);
    if (!latestJob || latestJob.status === "cancelled") return;
    await saveImageJob({
      ...latestJob,
      status: "failed",
      message: error.name === "AbortError" ? "任务已停止。" : error.publicMessage || error.message || "生图失败，请稍后再试。",
      result: null,
      telemetry: {
        ...(latestJob.telemetry || {}),
        traceId: telemetry?.traceId || latestJob.telemetry?.traceId || "",
        sessionId: telemetry?.sessionId || latestJob.telemetry?.sessionId || "",
        styleId: telemetry?.styleId || latestJob.telemetry?.styleId || "",
        styleName: telemetry?.styleName || latestJob.telemetry?.styleName || "",
        order: normalizeTelemetryNumber(telemetry?.order ?? latestJob.telemetry?.order),
        providerCallMs: latestJob.telemetry?.providerCallMs ?? null,
        persistResultMs: latestJob.telemetry?.persistResultMs ?? null,
        totalJobMs: elapsedMs(jobRunStartedAtMs)
      },
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
    logDrawCardTelemetry("job_failed", {
      traceId: telemetry?.traceId || "",
      sessionId: telemetry?.sessionId || "",
      visitorId: telemetry?.visitorId || "",
      jobId,
      styleId: telemetry?.styleId || "",
      styleName: telemetry?.styleName || "",
      order: normalizeTelemetryNumber(telemetry?.order),
      providerId: provider?.id || "",
      providerModel: provider?.model || "",
      totalJobMs: elapsedMs(jobRunStartedAtMs),
      message: error.publicMessage || error.message || "unknown error"
    });
    await synchronizeDrawCardSessionByJobId(jobId);
  } finally {
    activeImageJobs.delete(jobId);
  }
}

async function persistImageJobResult(jobId, result, outputFormat) {
  if (!result.imageDataUrl) return persistRemoteImageJobResult(jobId, result, outputFormat);

  const match = result.imageDataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/);
  if (!match) return persistRemoteImageJobResult(jobId, result, outputFormat);

  const extension = extensionForMime(match[1] || `image/${outputFormat}`);
  const filename = `${jobId}.${extension}`;
  const bytes = Buffer.from(match[2], "base64");
  await mkdir(generatedImageRoot, { recursive: true });
  await writeFile(path.join(generatedImageRoot, filename), bytes);
  const preview = await createPublicPreview(jobId, bytes);
  const thumbnail = await createGeneratedImageThumbnail(jobId, bytes);

  return {
    ...result,
    imageDataUrl: "",
    imageUrl: `/generated-images/${filename}`,
    mimeType: match[1],
    previewUrl: preview?.url || thumbnail?.url || "",
    previewWidth: preview?.width || null,
    previewHeight: preview?.height || null,
    thumbnailUrl: thumbnail?.url || "",
    thumbnailWidth: thumbnail?.width || null,
    thumbnailHeight: thumbnail?.height || null
  };
}

async function persistRemoteImageJobResult(jobId, result, outputFormat) {
  if (!result.imageUrl || !/^https?:\/\//i.test(result.imageUrl)) return result;

  const response = await fetch(result.imageUrl);
  if (!response.ok) return result;

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() || result.mimeType || `image/${outputFormat}`;
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return result;

  const extension = extensionForMime(contentType);
  const filename = `${jobId}.${extension}`;
  const bytes = Buffer.from(await response.arrayBuffer());
  await mkdir(generatedImageRoot, { recursive: true });
  await writeFile(path.join(generatedImageRoot, filename), bytes);
  const preview = await createPublicPreview(jobId, bytes);
  const thumbnail = await createGeneratedImageThumbnail(jobId, bytes);

  return {
    ...result,
    imageDataUrl: "",
    imageUrl: `/generated-images/${filename}`,
    mimeType: contentType,
    originalImageUrl: result.imageUrl,
    previewUrl: preview?.url || thumbnail?.url || "",
    previewWidth: preview?.width || null,
    previewHeight: preview?.height || null,
    thumbnailUrl: thumbnail?.url || "",
    thumbnailWidth: thumbnail?.width || null,
    thumbnailHeight: thumbnail?.height || null
  };
}

async function readImageJob(jobId) {
  if (!isSafeImageJobId(jobId)) return null;
  try {
    return JSON.parse(await readFile(getImageJobPath(jobId), "utf-8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function listImageJobs() {
  await mkdir(imageJobRoot, { recursive: true });
  const entries = await readdir(imageJobRoot, { withFileTypes: true });
  const jobs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => readImageJob(entry.name.replace(/\.json$/, "")))
  );
  return jobs.filter(Boolean);
}

async function deleteImageJob(job) {
  activeImageJobs.delete(job.jobId);
  await deleteGeneratedImage(job);
  await deleteJobReferences(job);
  await rm(getImageJobPath(job.jobId), { force: true });
}

async function deleteGeneratedImage(job) {
  if (job?.jobId) {
    await rm(path.join(generatedPreviewRoot, `${job.jobId}.webp`), { force: true });
    await rm(path.join(generatedThumbnailRoot, `${job.jobId}.webp`), { force: true });
  }

  const imageUrl = job.result?.imageUrl;
  if (!imageUrl || !imageUrl.startsWith("/generated-images/")) return;
  const filename = path.basename(imageUrl);
  await rm(path.join(generatedImageRoot, filename), { force: true });
}

async function deleteJobReferences(job) {
  if (!job?.jobId) return;
  await rm(path.join(jobReferenceRoot, String(job.jobId)), { recursive: true, force: true });
  await rm(path.join(jobReferenceThumbnailRoot, String(job.jobId)), { recursive: true, force: true });
}

async function saveImageJob(job) {
  await mkdir(imageJobRoot, { recursive: true });
  const safeJob = toPublicImageJob(job);
  await writeFile(getImageJobPath(safeJob.jobId), `${JSON.stringify(safeJob, null, 2)}\n`);
  return safeJob;
}

async function persistImageJobReferences(jobId, referenceFiles, options = {}) {
  const includeMetrics = Boolean(options?.includeMetrics);
  const telemetry = options?.telemetry && typeof options.telemetry === "object" ? options.telemetry : null;
  if (!referenceFiles.length) {
    return includeMetrics
      ? {
          references: [],
          metrics: {
            persistMs: 0,
            thumbnailMs: 0,
            totalBytes: 0
          }
        }
      : [];
  }

  const jobDir = path.join(jobReferenceRoot, String(jobId));
  await mkdir(jobDir, { recursive: true });
  const persistStartedAtMs = nowMs();
  let totalThumbnailMs = 0;
  let totalBytes = 0;

  const references = await Promise.all(
    referenceFiles.map(async (file, index) => {
      const fileStartedAtMs = nowMs();
      const extension = extensionForMime(file.mimetype);
      const filename = `${index + 1}-${Date.now()}.${extension}`;
      await writeFile(path.join(jobDir, filename), file.buffer);
      const thumbnailStartedAtMs = nowMs();
      const thumbnail = await createReferenceThumbnail(jobId, filename, file.buffer, file.mimetype);
      const thumbnailMs = elapsedMs(thumbnailStartedAtMs);
      totalThumbnailMs += thumbnailMs;
      totalBytes += Number(file.size || file.buffer?.length || 0);
      logDrawCardTelemetry("reference_file_persisted", {
        traceId: telemetry?.traceId || "",
        sessionId: telemetry?.sessionId || "",
        jobId,
        styleId: telemetry?.styleId || "",
        styleName: telemetry?.styleName || "",
        order: normalizeTelemetryNumber(telemetry?.order),
        referenceIndex: index,
        bytes: Number(file.size || file.buffer?.length || 0),
        mimeType: file.mimetype,
        filePersistMs: elapsedMs(fileStartedAtMs),
        thumbnailMs
      });
      return {
        name: file.originalname || `reference-${index + 1}.${extension}`,
        mimeType: file.mimetype,
        order: index,
        url: `/job-references/${jobId}/${filename}`,
        thumbnailUrl: thumbnail?.url || "",
        thumbnailWidth: thumbnail?.width || null,
        thumbnailHeight: thumbnail?.height || null
      };
    })
  );

  if (!includeMetrics) {
    return references;
  }

  return {
    references,
    metrics: {
      persistMs: elapsedMs(persistStartedAtMs),
      thumbnailMs: totalThumbnailMs,
      totalBytes
    }
  };
}

async function buildBatchReferenceFiles(style, sharedReferenceFiles) {
  const styleReference = await createStyleReferenceFile(style);
  const files = styleReference
    ? [styleReference].concat(sharedReferenceFiles.map(cloneReferenceFile))
    : sharedReferenceFiles.map(cloneReferenceFile);

  if (files.length > 10) {
    const error = new Error(styleReference ? "Styles with an auto reference can use at most 9 shared reference images." : "At most 10 reference images are allowed.");
    error.status = 400;
    error.publicMessage = error.message;
    throw error;
  }

  return files;
}

async function createStyleReferenceFile(style) {
  const previewPath = getPreviewFilePath(style?.image);
  const ext = path.extname(String(previewPath || "")).toLowerCase();
  const mimeType = mimeForExtension(ext);
  let buffer = null;

  if (!style || !style.useStyleImageAsReference || !previewPath || !mimeType || mimeType === "image/svg+xml") {
    return null;
  }

  if (!(await fileExists(previewPath))) {
    return null;
  }

  buffer = await readFile(previewPath);
  return {
    originalname: `${String(style.id || "style")}-style-reference.${extensionForMime(mimeType)}`,
    mimetype: mimeType,
    size: buffer.length,
    buffer: buffer
  };
}

function cloneReferenceFile(file) {
  return {
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    buffer: Buffer.from(file.buffer)
  };
}

function formatStyleName(style) {
  const tags = Array.isArray(style?.tags) ? style.tags.filter(Boolean) : [];
  return tags.length ? tags.join(" / ") : String(style?.id || "");
}

function toPublicImageJob(job) {
  const result = normalizeJobResult(job.result);
  return {
    jobId: String(job.jobId || ""),
    experienceType: normalizePublicExperienceType(job.experienceType),
    status: job.status,
    message: job.message || "",
    result,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
    completedAt: job.completedAt || null,
    prompt: String(job.prompt || ""),
    size: String(job.size || ""),
    referenceCount: Number(job.referenceCount || 0),
    originalReferences: normalizeJobReferences(job.originalReferences),
    styleId: String(job.styleId || ""),
    styleName: String(job.styleName || ""),
    styleGroupId: String(job.styleGroupId || ""),
    styleGroupName: String(job.styleGroupName || ""),
    durationSeconds: computeDurationSeconds(job),
    totalTokens: Number(result?.usage?.total_tokens || result?.usage?.totalTokens || 0),
    provider: job.provider || null,
    mode: job.mode || result?.mode || "",
    isLiked: Boolean(job.isLiked),
    likedAt: job.likedAt || null,
    ownerVisitorId: String(job.ownerVisitorId || ""),
    visibility: String(job.visibility || "admin"),
    telemetry: normalizeJobTelemetry(job.telemetry)
  };
}

function normalizeJobTelemetry(telemetry) {
  const current = telemetry && typeof telemetry === "object" ? telemetry : {};
  return {
    traceId: String(current.traceId || ""),
    sessionId: String(current.sessionId || ""),
    styleId: String(current.styleId || ""),
    styleName: String(current.styleName || ""),
    order: normalizeTelemetryNumber(current.order),
    providerCallMs: normalizeTelemetryNumber(current.providerCallMs),
    persistResultMs: normalizeTelemetryNumber(current.persistResultMs),
    totalJobMs: normalizeTelemetryNumber(current.totalJobMs)
  };
}

function normalizeJobResult(result) {
  if (!result || typeof result !== "object") return null;
  return {
    ...result,
    imageDataUrl: String(result.imageDataUrl || ""),
    imageUrl: String(result.imageUrl || ""),
    originalImageUrl: String(result.originalImageUrl || ""),
    previewUrl: String(result.previewUrl || result.thumbnailUrl || ""),
    previewWidth: Number(result.previewWidth || 0) || null,
    previewHeight: Number(result.previewHeight || 0) || null,
    thumbnailUrl: String(result.thumbnailUrl || ""),
    thumbnailWidth: Number(result.thumbnailWidth || 0) || null,
    thumbnailHeight: Number(result.thumbnailHeight || 0) || null
  };
}

function normalizeJobReferences(references) {
  return Array.isArray(references)
    ? references.map((reference) => ({
        ...reference,
        name: String(reference?.name || ""),
        mimeType: String(reference?.mimeType || ""),
        order: Number(reference?.order || 0),
        url: String(reference?.url || ""),
        thumbnailUrl: String(reference?.thumbnailUrl || ""),
        thumbnailWidth: Number(reference?.thumbnailWidth || 0) || null,
        thumbnailHeight: Number(reference?.thumbnailHeight || 0) || null
      }))
    : [];
}

async function createGeneratedImageThumbnail(jobId, bytes) {
  return createImageThumbnail({
    buffer: bytes,
    outputRoot: generatedThumbnailRoot,
    outputName: String(jobId || ""),
    urlPrefix: "/generated-thumbnails",
    maxEdge: RESULT_THUMBNAIL_MAX_EDGE
  });
}

async function createPublicPreview(jobId, bytes) {
  const sharp = await loadSharpModule();
  if (!sharp || !bytes?.length) return null;

  try {
    const resized = await sharp(bytes, { animated: false })
      .rotate()
      .resize({
        width: PUBLIC_PREVIEW_MAX_EDGE,
        height: PUBLIC_PREVIEW_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true
      })
      .toBuffer({ resolveWithObject: true });
    const width = Number(resized.info?.width || 0) || PUBLIC_PREVIEW_MAX_EDGE;
    const height = Number(resized.info?.height || 0) || PUBLIC_PREVIEW_MAX_EDGE;
    const transformed = await sharp(resized.data, { animated: false })
      .composite([{ input: createPublicPreviewWatermark(width, height) }])
      .webp({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    await mkdir(generatedPreviewRoot, { recursive: true });
    await writeFile(path.join(generatedPreviewRoot, `${jobId}.webp`), transformed.data);
    return {
      url: `/generated-previews/${jobId}.webp`,
      width: Number(transformed.info?.width || 0) || null,
      height: Number(transformed.info?.height || 0) || null,
      mimeType: "image/webp"
    };
  } catch (error) {
    console.warn("Preview generation skipped.", error?.message || error);
    return null;
  }
}

function createPublicPreviewWatermark(width, height) {
  const safeWidth = Math.max(1, Math.round(width || PUBLIC_PREVIEW_MAX_EDGE));
  const safeHeight = Math.max(1, Math.round(height || PUBLIC_PREVIEW_MAX_EDGE));
  const barHeight = Math.max(64, Math.floor(safeHeight * 0.09));
  const labelFontSize = Math.max(22, Math.floor(safeWidth * 0.028));
  const labelX = Math.max(24, Math.floor(safeWidth * 0.035));
  const labelY = safeHeight - Math.max(22, Math.floor(barHeight * 0.36));
  const patternFontSize = Math.max(22, Math.floor(safeWidth * 0.036));
  const patternWidth = Math.max(240, Math.floor(safeWidth * 0.26));
  const patternHeight = Math.max(160, Math.floor(safeHeight * 0.2));

  return Buffer.from(`
    <svg width="${safeWidth}" height="${safeHeight}" viewBox="0 0 ${safeWidth} ${safeHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="preview-diagonal-pattern" patternUnits="userSpaceOnUse" width="${patternWidth}" height="${patternHeight}" patternTransform="rotate(-28)">
          <text
            x="0"
            y="${Math.floor(patternHeight * 0.6)}"
            fill="#ffffff"
            fill-opacity="0.12"
            font-size="${patternFontSize}"
            font-family="Arial, sans-serif"
            letter-spacing="2"
          >${PUBLIC_PREVIEW_WATERMARK_TEXT}</text>
        </pattern>
      </defs>
      <rect x="0" y="0" width="${safeWidth}" height="${safeHeight}" fill="url(#preview-diagonal-pattern)" />
      <rect x="0" y="${Math.max(0, safeHeight - barHeight)}" width="${safeWidth}" height="${barHeight}" fill="#08080a" fill-opacity="0.62" />
      <text
        x="${labelX}"
        y="${labelY}"
        fill="#ffffff"
        fill-opacity="0.92"
        font-size="${labelFontSize}"
        font-family="Arial, sans-serif"
        letter-spacing="1.5"
      >${PUBLIC_PREVIEW_WATERMARK_TEXT}</text>
    </svg>
  `);
}

function getVisitorStatePath(visitorId) {
  return path.join(visitorStateRoot, `${visitorId}.json`);
}

function getAdminSessionPath(sessionId) {
  return path.join(adminSessionRoot, `${sessionId}.json`);
}

function isSafeVisitorId(visitorId) {
  return /^[a-f0-9-]{36}$/i.test(String(visitorId || ""));
}

function isSafeAdminSessionId(sessionId) {
  return /^[a-f0-9-]{36}$/i.test(String(sessionId || ""));
}

async function createReferenceThumbnail(jobId, filename, bytes, mimeType) {
  if (mimeType === "image/svg+xml") return null;
  const baseName = path.basename(filename, path.extname(filename));
  return createImageThumbnail({
    buffer: bytes,
    outputRoot: path.join(jobReferenceThumbnailRoot, String(jobId)),
    outputName: baseName,
    urlPrefix: `/job-reference-thumbnails/${jobId}`,
    maxEdge: REFERENCE_THUMBNAIL_MAX_EDGE
  });
}

async function createImageThumbnail({ buffer, outputRoot, outputName, urlPrefix, maxEdge }) {
  const sharp = await loadSharpModule();
  let transformed = null;
  let outputPath = "";

  if (!sharp || !buffer?.length || !outputName || !urlPrefix) {
    return null;
  }

  try {
    transformed = await sharp(buffer, { animated: false })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });

    outputPath = path.join(outputRoot, `${outputName}.webp`);
    await mkdir(outputRoot, { recursive: true });
    await writeFile(outputPath, transformed.data);

    return {
      url: `${urlPrefix}/${outputName}.webp`,
      width: Number(transformed.info?.width || 0) || null,
      height: Number(transformed.info?.height || 0) || null,
      mimeType: "image/webp"
    };
  } catch (error) {
    console.warn("Thumbnail generation skipped.", error?.message || error);
    return null;
  }
}

async function loadSharpModule() {
  if (sharpModulePromise !== undefined) {
    return sharpModulePromise;
  }

  sharpModulePromise = import("sharp")
    .then((module) => module.default || module)
    .catch((error) => {
      console.warn("sharp is not installed. Thumbnail generation is disabled until dependencies are updated.", error?.message || error);
      return null;
    });

  return sharpModulePromise;
}

function computeDurationSeconds(job) {
  if (!job.createdAt || !job.completedAt) return null;
  const startedAt = new Date(job.createdAt).getTime();
  const completedAt = new Date(job.completedAt).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return null;
  return Math.max(0, Math.round((completedAt - startedAt) / 1000));
}

function getDrawCardSessionPath(sessionId) {
  return path.join(drawCardSessionRoot, `${sessionId}.json`);
}

function getImageJobPath(jobId) {
  return path.join(imageJobRoot, `${jobId}.json`);
}

function isSafeDrawCardSessionId(sessionId) {
  return /^[a-f0-9-]{36}$/i.test(String(sessionId || ""));
}

function isSafeImageJobId(jobId) {
  return /^[a-f0-9-]{36}$/i.test(String(jobId || ""));
}

function isSafeReferenceId(referenceId) {
  return /^[a-f0-9-]{36}$/i.test(String(referenceId || ""));
}

async function createImageGeneration(prompt, outputFormat, provider, body, signal) {
  const payload = {
    model: provider.model,
    prompt,
    size: normalizeSize(body.size),
    quality: normalizeOption(body.quality, ["low", "medium", "high", "auto"], "medium"),
    n: 1,
    output_format: outputFormat,
    background: normalizeOption(body.background, ["auto", "opaque", "transparent"], "auto"),
    moderation: normalizeOption(body.moderation, ["auto", "low"], "auto")
  };

  const response = await callImageProviderApi(provider, "/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  }, signal);
  return formatImageResponse(response, outputFormat, "generation");
}

async function createImageEdit(files, prompt, outputFormat, provider, body, signal) {
  const formData = new FormData();
  formData.append("model", provider.model);
  formData.append("prompt", prompt);
  formData.append("size", normalizeSize(body.size));
  formData.append("quality", normalizeOption(body.quality, ["low", "medium", "high", "auto"], "medium"));
  formData.append("n", "1");
  formData.append("output_format", outputFormat);
  formData.append("background", normalizeOption(body.background, ["auto", "opaque", "transparent"], "auto"));
  formData.append("moderation", normalizeOption(body.moderation, ["auto", "low"], "auto"));
  files.forEach((file, index) => {
    formData.append("image", new Blob([file.buffer], { type: file.mimetype }), file.originalname || `reference-${index + 1}.${extensionForMime(file.mimetype)}`);
  });

  const response = await callImageProviderApi(provider, "/images/edits", {
    method: "POST",
    body: formData
  }, signal);
  return formatImageResponse(response, outputFormat, "edit");
}

async function executeImageJobWithFailover({ body, files, outputFormat, prompt, provider, providers, signal }) {
  const providerChain = Array.isArray(providers) && providers.length ? providers : provider ? [provider] : [];
  if (!providerChain.length) {
    const error = new Error("No image providers configured");
    error.publicMessage = "暂无可用的生图服务，请稍后再试。";
    error.status = 503;
    throw error;
  }

  let lastError = null;
  for (const currentProvider of providerChain) {
    try {
      const result = files.length
        ? await createImageEdit(files, prompt, outputFormat, currentProvider, body, signal)
        : await createImageGeneration(prompt, outputFormat, currentProvider, body, signal);
      return {
        result,
        provider: {
          id: currentProvider.id,
          name: currentProvider.name,
          model: currentProvider.model
        }
      };
    } catch (error) {
      if (error.name === "AbortError") throw error;
      lastError = error;
    }
  }

  throw lastError || new Error("Image generation failed");
}

async function callImageProviderApi(provider, endpoint, options, externalSignal) {
  const baseUrl = provider.baseUrl.replace(/\/+$/, "");
  const controller = new AbortController();
  const abortFromExternalSignal = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", abortFromExternalSignal, { once: true });
  }
  const timeoutMs = normalizeTimeout(process.env.KUAIPAO_IMAGE_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : {};

    if (!response.ok) {
      const message = payload.error?.message || payload.message || `鎺ュ彛杩斿洖 ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.publicMessage = endpoint === "/images/edits"
        ? `${provider.name} 鍙傝€冨浘缂栬緫鎺ュ彛璋冪敤澶辫触锛?{message}`
        : `${provider.name} 鐢熷浘鎺ュ彛璋冪敤澶辫触锛?{message}`;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      error.publicMessage = `生图请求超过 ${Math.round(timeoutMs / 1000)} 秒仍未完成。可以降低尺寸或质量后重试，或在 .env 中调大 KUAIPAO_IMAGE_TIMEOUT_MS。`;
      error.status = 504;
    } else if (error instanceof SyntaxError) {
      error.publicMessage = "中转接口返回了无法解析的结果。";
      error.status = 502;
    }
    throw error;
  } finally {
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    clearTimeout(timeout);
  }
}

function formatImageResponse(payload, outputFormat, mode) {
  const firstImage = payload.data?.[0];
  const b64 = firstImage?.b64_json;
  const url = firstImage?.url;
  if (!b64 && !url) {
    const error = new Error("Missing image data");
    error.status = 502;
    error.publicMessage = "中转接口没有返回图片数据。";
    throw error;
  }

  const mimeType = outputFormat === "jpeg" ? "image/jpeg" : `image/${outputFormat}`;
  return {
    imageDataUrl: b64 ? `data:${mimeType};base64,${b64}` : "",
    imageUrl: url || "",
    mimeType,
    usage: payload.usage || null,
    mode
  };
}

function normalizeSize(value) {
  const size = String(value || "auto").trim();
  if (size === "auto") return "auto";
  return /^\d{2,5}x\d{2,5}$/.test(size) ? size : "auto";
}

function normalizeOption(value, allowed, fallback) {
  const item = String(value || fallback).trim();
  return allowed.includes(item) ? item : fallback;
}

function normalizeTimeout(value) {
  const timeout = Number(value || 1800000);
  if (!Number.isFinite(timeout)) return 1800000;
  return Math.min(Math.max(timeout, 60000), 3600000);
}

function getImageProviders() {
  const ids = String(process.env.IMAGE_API_PROVIDERS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const providers = ids.map(readConfiguredProvider).filter(Boolean);
  const legacy = readLegacyKuaipaoProvider();
  if (legacy && !providers.some((provider) => provider.id === legacy.id)) providers.unshift(legacy);
  return providers;
}

function readConfiguredProvider(id) {
  const key = providerEnvKey(id);
  const apiKey = process.env[`IMAGE_API_${key}_KEY`];
  const baseUrl = process.env[`IMAGE_API_${key}_BASE_URL`];
  if (!isUsableApiKey(apiKey) || !baseUrl) return null;
  return {
    id,
    name: process.env[`IMAGE_API_${key}_NAME`] || id,
    baseUrl,
    apiKey,
    model: process.env[`IMAGE_API_${key}_MODEL`] || process.env.OPENAI_IMAGE_MODEL || "gpt-image-2"
  };
}

function readLegacyKuaipaoProvider() {
  const apiKey = process.env.KUAIPAO_API_KEY || process.env.OPENAI_API_KEY;
  if (!isUsableApiKey(apiKey)) return null;
  return {
    id: "kuaipao",
    name: "蹇窇",
    baseUrl: process.env.KUAIPAO_BASE_URL || "https://kuaipao.pro/v1",
    apiKey,
    model: process.env.OPENAI_IMAGE_MODEL || "gpt-image-2"
  };
}

function resolveImageProvider(requestedId, providers) {
  if (!providers.length) return null;
  const id = String(requestedId || getDefaultProviderId(providers)).trim();
  return providers.find((provider) => provider.id === id) || providers[0];
}

function getProviderFallbackChain(requestedId, providers) {
  const selected = resolveImageProvider(requestedId, providers);
  if (!selected) return [];

  return [selected]
    .concat(providers.filter((provider) => provider.id !== selected.id))
    .filter((provider, index, list) => list.findIndex((item) => item.id === provider.id) === index);
}

function getDefaultProviderId(providers) {
  const configured = String(process.env.IMAGE_API_PROVIDER || "").trim();
  if (configured && providers.some((provider) => provider.id === configured)) return configured;
  return providers[0]?.id || "";
}

function providerEnvKey(id) {
  return String(id || "").trim().replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

function isUsableApiKey(apiKey) {
  return Boolean(
    apiKey &&
      apiKey !== "your_openai_api_key_here" &&
      apiKey !== "your_kuaipao_api_key_here" &&
      apiKey !== "your_duckcoding_api_key_here"
  );
}

async function saveStyles(styles) {
  const storedStyles = styles.map((style) => ({
    id: String(style?.id || "").trim(),
    tags: normalizeTags(style?.tags),
    image: String(style?.image || "/style-previews/default/cover.svg").trim() || "/style-previews/default/cover.svg",
    imageUpdatedAt: style?.imageUpdatedAt || null,
    prompt: String(style?.prompt || ""),
    useStyleImageAsReference: Boolean(style?.useStyleImageAsReference)
  }));
  await writeFile(dataPath, `${JSON.stringify(storedStyles, null, 2)}\n`, "utf-8");
  await syncMiniProgram(storedStyles);
}

async function syncMiniProgram(styles) {
  await mkdir(path.dirname(miniDataPath), { recursive: true });
  await mkdir(miniImageRoot, { recursive: true });
  const miniStyles = await Promise.all(
    styles.map(async (style, index) => {
      const miniImage = await ensureMiniImage(style);
      return {
        id: style.id,
        sort: index,
        tags: normalizeTags(style.tags),
        image: miniImage,
        prompt: String(style.prompt || ""),
        useStyleImageAsReference: Boolean(style.useStyleImageAsReference)
      };
    })
  );
  const js = `const styles = ${JSON.stringify(miniStyles, null, 2)};\n\nmodule.exports = {\n  styles\n};\n`;
  await writeFile(miniDataPath, js, "utf-8");
}

async function ensureMiniImage(style) {
  const previewPath = getPreviewFilePath(style.image);
  if (!previewPath) {
    await deleteMiniImage(style.id);
    return "";
  }

  const ext = path.extname(previewPath).toLowerCase();
  const mimeType = mimeForExtension(ext);
  if (!mimeType || !(await fileExists(previewPath))) {
    await deleteMiniImage(style.id);
    return "";
  }

  if (mimeType === "image/svg+xml") {
    const targetPath = path.join(miniImageRoot, `${style.id}.svg`);
    await rm(path.join(miniImageRoot, `${style.id}.jpg`), { force: true });
    if (await shouldUpdateMiniImage(previewPath, targetPath)) {
      await mkdir(miniImageRoot, { recursive: true });
      await copyFile(previewPath, targetPath);
    }
    return `/images-small/${style.id}.svg`;
  }

  const targetPath = path.join(miniImageRoot, `${style.id}.jpg`);
  await rm(path.join(miniImageRoot, `${style.id}.svg`), { force: true });
  if (!(await shouldCompressMiniImage(previewPath, targetPath))) return `/images-small/${style.id}.jpg`;

  await compressMiniImage(style.id, previewPath, mimeType);
  return `/images-small/${style.id}.jpg`;
}

async function getWebGalleryImage(style) {
  const safeId = String(style?.id || "").trim();
  const originalImage = String(style?.image || "").trim() || "/style-previews/default/cover.svg";

  if (!safeId) {
    return originalImage;
  }

  if (await fileExists(path.join(miniImageRoot, `${safeId}.jpg`))) {
    return `/images-small/${safeId}.jpg`;
  }

  if (await fileExists(path.join(miniImageRoot, `${safeId}.svg`))) {
    return `/images-small/${safeId}.svg`;
  }

  return originalImage;
}

async function shouldCompressMiniImage(sourcePath, targetPath) {
  return shouldUpdateMiniImage(sourcePath, targetPath);
}

async function shouldUpdateMiniImage(sourcePath, targetPath) {
  if (!(await fileExists(targetPath))) return true;
  const [sourceInfo, targetInfo] = await Promise.all([stat(sourcePath), stat(targetPath)]);
  return sourceInfo.mtimeMs > targetInfo.mtimeMs;
}

async function compressMiniImage(styleId, sourcePath, mimeType) {
  if (mimeType === "image/svg+xml") return;
  const targetPath = path.join(miniImageRoot, `${styleId}.jpg`);
  await mkdir(miniImageRoot, { recursive: true });
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    miniCompressScript,
    "-Source",
    sourcePath,
    "-Target",
    targetPath
  ]);
}

function getPreviewFilePath(imagePath) {
  const normalized = String(imagePath || "");
  const relative = normalized.replace(/^\/+/, "");

  if (!normalized) return "";
  if (normalized.startsWith("/style-previews/")) return path.join(rootDir, "public", relative);
  if (normalized.startsWith("/images-small/")) return path.join(rootDir, "wechat-miniprogram", "miniprogram", relative);
  return "";
}

async function deleteMiniImage(styleId) {
  await rm(path.join(miniImageRoot, `${styleId}.jpg`), { force: true });
  await rm(path.join(miniImageRoot, `${styleId}.svg`), { force: true });
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizeTags(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,锛屻€乗n]/);
  return [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];
}

function extensionForMime(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/svg+xml") return "svg";
  return "png";
}

function mimeForExtension(ext) {
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".svg") return "image/svg+xml";
  return "";
}

function loadLocalEnv() {
  const envPath = path.join(rootDir, ".env");
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
