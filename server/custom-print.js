import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { PAPER, CUSTOM_LAYOUT_MODE, GUIDE_COLOR, GUIDE_WIDTH_MM, corners, edgeGuides, mmToPixels, validateLayout } from "../shared/custom-print-geometry.js";

const fail = (status, message) => Object.assign(new Error(message), { status });
const resourceId = (id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id);

export async function renderCustomSheet(layout, assets) {
  const pictures = await Promise.all(layout.items.map(async (item) => {
    const asset = assets.get(item.assetId);
    const left = Math.max(0, Math.min(asset.width - 1, Math.round(item.crop.x * asset.width)));
    const top = Math.max(0, Math.min(asset.height - 1, Math.round(item.crop.y * asset.height)));
    const width = Math.max(1, Math.min(asset.width - left, Math.round(item.crop.width * asset.width)));
    const height = Math.max(1, Math.min(asset.height - top, Math.round(item.crop.height * asset.height)));
    const buffer = await sharp(asset.filePath).extract({ left, top, width, height })
      .resize(Math.max(1, mmToPixels(item.widthMm)), Math.max(1, mmToPixels(item.heightMm)), { fit: "fill" }).png().toBuffer();
    return `<image x="${item.centerXmm - item.widthMm / 2}" y="${item.centerYmm - item.heightMm / 2}" width="${item.widthMm}" height="${item.heightMm}" preserveAspectRatio="none" transform="rotate(${item.rotationDeg} ${item.centerXmm} ${item.centerYmm})" href="data:image/png;base64,${buffer.toString("base64")}"/>`;
  }));
  const holes = layout.items.map((item) => `<polygon points="${corners(item).map((p) => `${p.x},${p.y}`).join(" ")}" fill="black"/>`).join("");
  const lines = layout.items.flatMap(edgeGuides).map((line) => `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${mmToPixels(100)}" height="${mmToPixels(148)}" viewBox="0 0 100 148">
    <defs><mask id="guides" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="148"><rect width="100" height="148" fill="white"/>${holes}</mask></defs>
    <rect width="100" height="148" fill="white"/>
    <g stroke="${GUIDE_COLOR}" stroke-width="${GUIDE_WIDTH_MM}" mask="url(#guides)">${lines}</g>${pictures.join("")}</svg>`;
  return sharp(Buffer.from(svg)).png().withMetadata({ density: PAPER.dpi }).toBuffer();
}

export function createCustomPrintService({ root, printStore, resolveMerchantAccess, resolveDeviceHealth }) {
  const assetDir = (id) => path.join(root, "assets", id);
  const previewDir = (id) => path.join(root, "previews", id);
  async function readRecord(type, id, ownerId) {
    if (!resourceId(id)) throw fail(404, "打印资源不存在");
    let record;
    try { record = JSON.parse(await readFile(path.join(type === "asset" ? assetDir(id) : previewDir(id), "metadata.json"), "utf8")); }
    catch { throw fail(404, "打印资源不存在"); }
    if (record.ownerId !== ownerId) throw fail(404, "打印资源不存在");
    return record;
  }
  function requireDevice(ownerId) {
    const device = printStore.findPrintDeviceByStoreOwner(ownerId);
    if (!device) throw fail(409, "当前店铺还没有绑定打印设备");
    const health = resolveDeviceHealth(device);
    if (!health.healthy) throw fail(409, "打印设备离线或异常，请检查后再提交");
    if (!device.supportedLayoutModes.includes(CUSTOM_LAYOUT_MODE)) throw fail(409, "请先升级店内打印代理并配置100×148毫米相纸");
    return device;
  }
  function toTask(job) {
    const labels = { queued: ["排队中", "is-pending"], claimed: ["打印中", "is-processing"], printed: ["打印成功", "is-online"], failed: ["打印失败", "is-offline"] };
    const [statusLabel, statusTone] = labels[job.status] || labels.queued;
    const previewUrl = `/api/merchant/custom-print/previews/${job.metadata.previewId}/image`;
    return {
      taskNo: job.orderId, taskType: "custom", experienceType: "custom-print", buyerName: "商户自定义",
      imageCount: job.metadata.layout?.items.length || 0, incomeCents: 0, status: job.status, statusLabel, statusTone,
      printJobId: job.id, canRetry: job.status === "failed", printError: job.errorMessage, createdAt: job.createdAt,
      copies: job.copies, completedCopies: job.completedCopies, previewUrl, images: [{ thumbnailUrl: previewUrl, originalUrl: previewUrl, styleName: "自定义打印版面" }]
    };
  }
  function register(app, upload) {
    const route = (handler) => async (req, res, next) => { try { await handler(req, res); } catch (error) { next(error); } };
    // Authorize before multer buffers the upload.
    const authorize = async (req, res, next) => { try { req.customMerchantAccess = await resolveMerchantAccess(req); next(); } catch (error) { next(error); } };
    app.post("/api/merchant/custom-print/assets", authorize, upload.single("image"), route(async (req, res) => {
      if (!req.file || !["image/jpeg", "image/png", "image/webp"].includes(req.file.mimetype)) throw fail(400, "请上传JPG、PNG或WebP图片");
      const pipeline = sharp(req.file.buffer, { limitInputPixels: 40_000_000, animated: false });
      const source = await pipeline.metadata().catch(() => { throw fail(400, "无法读取图片"); });
      if (!["jpeg", "png", "webp"].includes(source.format)) throw fail(400, "图片格式不支持");
      const { data, info } = await pipeline.rotate().toColourspace("srgb").png().toBuffer({ resolveWithObject: true });
      const id = randomUUID(), directory = assetDir(id);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "source.png"), data);
      await sharp(data).resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toFile(path.join(directory, "preview.png"));
      const record = { id, ownerId: req.customMerchantAccess.merchantAccount.id, width: info.width, height: info.height, createdAt: new Date().toISOString() };
      await writeFile(path.join(directory, "metadata.json"), JSON.stringify(record));
      res.status(201).json({ assetId: id, width: info.width, height: info.height, previewUrl: `/api/merchant/custom-print/assets/${id}/image` });
    }));
    app.get("/api/merchant/custom-print/assets/:id/image", authorize, route(async (req, res) => {
      await readRecord("asset", req.params.id, req.customMerchantAccess.merchantAccount.id);
      res.setHeader("Cache-Control", "private, max-age=300"); res.sendFile(path.join(assetDir(req.params.id), "preview.png"));
    }));
    app.post("/api/merchant/custom-print/previews", authorize, route(async (req, res) => {
      const ownerId = req.customMerchantAccess.merchantAccount.id;
      if (!Array.isArray(req.body?.items) || !req.body.items.length || req.body.items.length > 24) throw fail(400, "每页需要1～24张图片");
      const ids = [...new Set(req.body.items.map((item) => item?.assetId))];
      if (ids.length > 10) throw fail(400, "每页最多10张源图");
      const assets = new Map(await Promise.all(ids.map(async (id) => [id, { ...await readRecord("asset", id, ownerId), filePath: path.join(assetDir(id), "source.png") }])));
      let layout; try { layout = validateLayout(req.body, assets); } catch (error) { throw fail(400, error.message); }
      const image = await renderCustomSheet(layout, assets);
      const id = randomUUID(), directory = previewDir(id);
      await mkdir(directory, { recursive: true });
      await writeFile(path.join(directory, "sheet.png"), image);
      await writeFile(path.join(directory, "metadata.json"), JSON.stringify({ id, ownerId, layout, createdAt: new Date().toISOString() }));
      res.status(201).json({ previewId: id, previewUrl: `/api/merchant/custom-print/previews/${id}/image` });
    }));
    app.get("/api/merchant/custom-print/previews/:id/image", authorize, route(async (req, res) => {
      await readRecord("preview", req.params.id, req.customMerchantAccess.merchantAccount.id);
      res.setHeader("Cache-Control", "private, max-age=300"); res.sendFile(path.join(previewDir(req.params.id), "sheet.png"));
    }));
    app.post("/api/merchant/custom-print/jobs", authorize, route(async (req, res) => {
      const ownerId = req.customMerchantAccess.merchantAccount.id;
      const { previewId, copies, idempotencyKey } = req.body || {};
      if (!Number.isInteger(copies) || copies < 1 || copies > 20 || typeof idempotencyKey !== "string" || !/^[a-zA-Z0-9_-]{16,80}$/.test(idempotencyKey)) throw fail(400, "份数或提交编号无效");
      const preview = await readRecord("preview", previewId, ownerId);
      const taskNo = `custom-${createHash("sha256").update(`${ownerId}:${idempotencyKey}`).digest("hex").slice(0, 24)}`;
      const existing = printStore.findPrintJobByOrder(taskNo);
      if (existing) {
        if (existing.copies !== copies || existing.metadata.previewId !== previewId) throw fail(409, "提交编号已经用于另一份版面");
        return res.json({ job: existing, task: toTask(existing) });
      }
      const device = requireDevice(ownerId);
      const job = printStore.createPrintJob({ orderId: taskNo, deviceId: device.deviceId, layoutMode: CUSTOM_LAYOUT_MODE,
        storeOwnerAccountId: ownerId, creatorAccountId: req.webAccount.id, copies,
        metadata: { previewId, layout: preview.layout }, imageUrls: [`custom-sheet:${previewId}`] });
      res.status(201).json({ job, task: toTask(job) });
    }));
    app.get("/api/merchant/custom-print/jobs/:jobId", authorize, route(async (req, res) => {
      const job = printStore.readPrintJob(req.params.jobId);
      if (!job || job.layoutMode !== CUSTOM_LAYOUT_MODE || job.storeOwnerAccountId !== req.customMerchantAccess.merchantAccount.id) throw fail(404, "任务不存在");
      res.json({ job, task: toTask(job) });
    }));
  }
  async function sheetPath(job) {
    await readRecord("preview", job.metadata.previewId, job.storeOwnerAccountId);
    return path.join(previewDir(job.metadata.previewId), "sheet.png");
  }
  return { register, toTask, requireDevice, sheetPath };
}
