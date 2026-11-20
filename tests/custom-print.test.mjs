import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import express from "express";
import multer from "multer";
import sharp from "sharp";
import { PAPER, mmToPixels, corners, overlaps, placementError, edgeGuides, validateLayout, clampCropTransform, cropFromTransform } from "../shared/custom-print-geometry.js";
import { createPrintStore } from "../server/print-store.js";
import { createCustomPrintService, renderCustomSheet } from "../server/custom-print.js";

const image = (id, x, y, width = 20, height = 20, rotation = 0) => ({ id, assetId: id, centerXmm: x, centerYmm: y, widthMm: width, heightMm: height, rotationDeg: rotation, crop: { x: 0, y: 0, width: 1, height: 1 } });
async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "custom-print-test-"));
  return root;
}

test("rotated geometry rejects overlap and overflow, permits touching edges", () => {
  const first = image("a", 25, 37, 50, 74), second = image("b", 75, 37, 50, 74);
  assert.equal(overlaps(first, second), false);
  assert.equal(placementError(second, [first]), "");
  assert.equal(overlaps(first, { ...second, centerXmm: 74.9 }), true);
  assert.match(placementError({ ...first, rotationDeg: 45 }, []), /超出/);
  assert.equal(overlaps(image("c", 50, 74, 40, 4, 45), image("d", 43, 81, 40, 4, 45)), false);
  for (const angle of [0, 90, 179.9, 271, 37]) {
    for (const line of edgeGuides(image("r", 50, 74, 20, 30, angle))) {
      for (const [x, y] of [[line.x1, line.y1], [line.x2, line.y2]]) {
        assert.ok(x >= -1e-6 && x <= 100 + 1e-6 && y >= -1e-6 && y <= 148 + 1e-6);
        assert.ok(Math.min(Math.abs(x), Math.abs(x - 100), Math.abs(y), Math.abs(y - 148)) < 1e-6);
      }
    }
  }
});

test("crop pan and zoom never expose empty pixels and preserve target aspect", () => {
  for (const source of [{ width: 4000, height: 3000 }, { width: 800, height: 2400 }]) {
    const frame = { width: 200, height: 296 };
    for (const value of [{ scale: 0.0001, x: 999, y: -999 }, { scale: 9, x: -99999, y: 99999 }]) {
      const crop = cropFromTransform(frame, source, clampCropTransform(frame, source, value));
      assert.ok(crop.x >= -1e-9 && crop.y >= -1e-9);
      assert.ok(crop.x + crop.width <= 1 + 1e-9 && crop.y + crop.height <= 1 + 1e-9);
      assert.ok(Math.abs(crop.width * source.width / (crop.height * source.height) - 50 / 74) < 1e-9);
    }
  }
});

test("layout validation rejects duplicate, missing, malformed and overlapping instances", () => {
  const assets = new Map([["a", { width: 100, height: 100 }], ["b", { width: 100, height: 100 }]]);
  assert.equal(validateLayout({ items: [image("a", 50, 74)] }, assets).items.length, 1);
  for (const items of [[image("a", 50, 74), image("a", 20, 20)], [image("missing", 20, 20)], [{ ...image("a", 50, 74), widthMm: NaN }], [{ ...image("a", 50, 74), crop: { x: -0.1, y: 0, width: 1, height: 1 } }], [image("a", 50, 74), image("b", 50, 74)]]) {
    assert.throws(() => validateLayout({ items }, assets));
  }
});

test("300DPI sheet prints edge extensions beneath opaque and transparent photos", async (t) => {
  const root = await fixture(t);
  t.after(() => rm(root, { recursive: true, force: true }));
  const red = path.join(root, "red.png"), transparent = path.join(root, "transparent.png");
  await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ff0000" } }).png().toFile(red);
  await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toFile(transparent);
  const layout = { items: [image("red", 30, 40, 40, 40), image("clear", 65, 20, 20, 20)] };
  const assets = new Map([["red", { width: 100, height: 100, filePath: red }], ["clear", { width: 100, height: 100, filePath: transparent }]]);
  const result = await renderCustomSheet(layout, assets);
  const meta = await sharp(result).metadata();
  assert.equal(meta.width, 1181); assert.equal(meta.height, 1748); assert.equal(meta.density, 300);
  const { data, info } = await sharp(result).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((mmToPixels(y) * info.width + mmToPixels(x)) * 3, (mmToPixels(y) * info.width + mmToPixels(x)) * 3 + 3)];
  assert.deepEqual(pixel(30, 40), [255, 0, 0]);
  assert.deepEqual(pixel(60, 20), [255, 255, 255], "transparent rectangle masks guides completely");
  assert.deepEqual(pixel(65, 22), [255, 255, 255]);
  const grey = pixel(80, 20); assert.ok(grey.every((v) => v >= 185 && v < 245), `extension must be grey: ${grey}`);
  assert.deepEqual(pixel(80, 40), [255, 255, 255]);
  // Inside photos (away from their 1px antialias boundary) no line pixels survive.
  for (let y = 22; y < 58; y += 3) assert.deepEqual(pixel(30, y), [255, 0, 0]);
  const rotated = await renderCustomSheet({ items: [image("red", 50, 74, 40, 40, 37)] }, assets);
  assert.equal((await sharp(rotated).metadata()).width, 1181);
});

test("old agents cannot claim custom sheets; progress and stale recovery avoid automatic repeats", async (t) => {
  const root = await fixture(t), dbPath = path.join(root, "jobs.sqlite");
  const store = createPrintStore({ dbPath }); t.after(() => store.close());
  t.after(() => rm(root, { recursive: true, force: true }));
  const { device } = store.createPrintDevice({ storeOwnerAccountId: "owner", printerName: "cp1500" });
  const custom = store.createPrintJob({ orderId: "custom-one", deviceId: device.deviceId, layoutMode: "custom-sheet-v1", storeOwnerAccountId: "owner", copies: 3 });
  const normal = store.createPrintJob({ orderId: "normal-one", deviceId: device.deviceId });
  assert.equal(store.claimNextJob(device.deviceId).id, normal.id);
  assert.equal(store.claimNextJob(device.deviceId), null);
  const claimed = store.claimNextJob(device.deviceId, ["2up", "custom-sheet-v1"]);
  assert.equal(claimed.id, custom.id);
  assert.equal(store.updateCustomProgress(custom.id, 1, claimed.attempt).completedCopies, 1);
  assert.equal(store.updateCustomProgress(custom.id, 0, claimed.attempt), null);
  assert.equal(store.updateCustomProgress(custom.id, 2, claimed.attempt + 1), null);
  const db = new DatabaseSync(dbPath);
  db.prepare("UPDATE print_jobs SET claimed_at = ? WHERE id = ?").run("2000-01-01T00:00:00.000Z", custom.id); db.close();
  store.requeueStaleJobs(); assert.equal(store.readPrintJob(custom.id).status, "claimed");
  store.expireStaleCustomJobs(); assert.equal(store.readPrintJob(custom.id).status, "failed");
  store.retryPrintJob(custom.id, { deviceId: device.deviceId, completedCopies: 2 });
  const retried = store.claimNextJob(device.deviceId, ["custom-sheet-v1"]);
  assert.equal(retried.completedCopies, 2); assert.equal(retried.attempt, 2);
  store.finishPrintJob(custom.id, "failed", "final acknowledgement interrupted");
  assert.equal(store.retryPrintJob(custom.id, { completedCopies: 3 }).status, "printed");
  assert.equal(store.claimNextJob(device.deviceId, ["custom-sheet-v1"]), null, "confirmed physical output must not be queued again");
  store.touchPrintDevice(device.deviceId, { supportedLayoutModes: ["custom-sheet-v1"] });
  assert.deepEqual(store.readPrintDevice(device.deviceId).supportedLayoutModes, ["custom-sheet-v1"]);
  store.touchPrintDevice(device.deviceId, {});
  assert.deepEqual(store.readPrintDevice(device.deviceId).supportedLayoutModes, [], "old heartbeat clears obsolete capabilities");
});

test("merchant assets, previews and job creation are isolated, validated and idempotent", async (t) => {
  const root = await fixture(t), store = createPrintStore({ dbPath: path.join(root, "orders.sqlite") });
  t.after(() => store.close());
  const app = express(); app.use(express.json());
  const service = createCustomPrintService({ root: path.join(root, "files"), printStore: store,
    resolveMerchantAccess: async (req) => { const owner = req.get("x-test-owner"); if (!owner) throw Object.assign(new Error("unauthorized"), { status: 401 }); req.webAccount = { id: req.get("x-test-actor") || owner }; return { merchantAccount: { id: owner } }; },
    resolveDeviceHealth: (device) => ({ healthy: device?.printerState === "idle" }) });
  service.register(app, multer({ storage: multer.memoryStorage() }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, "127.0.0.1"); await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  t.after(() => rm(root, { recursive: true, force: true }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, data, owner = "owner") => fetch(base + url, { method: "POST", headers: { "Content-Type": "application/json", "x-test-owner": owner, "x-test-actor": "staff" }, body: JSON.stringify(data) });
  const png = await sharp({ create: { width: 100, height: 100, channels: 3, background: "red" } }).png().toBuffer();
  const form = new FormData(); form.append("image", new Blob([png], { type: "image/png" }), "photo.png");
  assert.equal((await fetch(base + "/api/merchant/custom-print/assets", { method: "POST", body: form })).status, 401);
  const uploaded = await fetch(base + "/api/merchant/custom-print/assets", { method: "POST", headers: { "x-test-owner": "owner" }, body: form });
  assert.equal(uploaded.status, 201); const asset = await uploaded.json();
  assert.equal((await fetch(base + asset.previewUrl, { headers: { "x-test-owner": "other" } })).status, 404);
  const item = { ...image("instance-one", 50, 74), assetId: asset.assetId };
  assert.equal((await post("/api/merchant/custom-print/previews", { items: [item] }, "other")).status, 404);
  assert.equal((await post("/api/merchant/custom-print/previews", { items: [{ ...item, centerXmm: -1 }] })).status, 400);
  const response = await post("/api/merchant/custom-print/previews", { items: [item] });
  assert.equal(response.status, 201); const preview = await response.json();
  const jobInput = { previewId: preview.previewId, copies: 2, idempotencyKey: "test-request-key-1234" };
  assert.equal((await post("/api/merchant/custom-print/jobs", jobInput)).status, 409);
  const { device } = store.createPrintDevice({ storeOwnerAccountId: "owner" });
  store.touchPrintDevice(device.deviceId, { printerState: "idle", supportedLayoutModes: ["custom-sheet-v1"] });
  const created = await post("/api/merchant/custom-print/jobs", jobInput); assert.equal(created.status, 201);
  const { job, task } = await created.json(); assert.equal(job.creatorAccountId, "staff"); assert.equal(task.incomeCents, 0);
  assert.equal((await (await post("/api/merchant/custom-print/jobs", jobInput)).json()).job.id, job.id);
  assert.equal((await post("/api/merchant/custom-print/jobs", { ...jobInput, copies: 3 })).status, 409);
  assert.equal((await post("/api/merchant/custom-print/jobs", { ...jobInput, copies: 2.5 })).status, 400);
  assert.equal((await fetch(`${base}/api/merchant/custom-print/jobs/${job.id}`, { headers: { "x-test-owner": "other" } })).status, 404);
  assert.match(await service.sheetPath(job), /sheet\.png$/);
});

test("mixed merchant pagination includes stores with no visitors and stable global ordering", async (t) => {
  const root = await fixture(t), dbPath = path.join(root, "orders.sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE orders (id TEXT, visitor_id TEXT, store_owner_account_id TEXT, payment_status TEXT, experience_type TEXT, paid_at TEXT, created_at TEXT)");
  db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?)").run("paid-order", "visitor", "owner", "paid", "draw-card", "2026-11-20T00:00:00.000Z", "2026-11-20T00:00:00.000Z");
  const store = createPrintStore({ dbPath }); t.after(() => store.close());
  t.after(() => rm(root, { recursive: true, force: true }));
  const job = store.createPrintJob({ orderId: "custom-task", storeOwnerAccountId: "owner", layoutMode: "custom-sheet-v1" });
  db.prepare("UPDATE print_jobs SET created_at = ? WHERE id = ?").run("2026-11-20T01:00:00.000Z", job.id); db.close();
  const first = store.listMerchantTaskReferences({ ownerId: "owner", visitorIds: [], limit: 1 });
  assert.equal(first.total, 2); assert.equal(first.items[0].kind, "custom");
  assert.equal(store.listMerchantTaskReferences({ ownerId: "owner", page: 2, limit: 1 }).items[0].id, "paid-order");
  assert.equal(store.listMerchantTaskReferences({ ownerId: "other" }).total, 0);
});
