// Exercise the real server, real session middleware and device endpoints in a
// disposable project copy. No .env, production database or printer is used.
import assert from "node:assert/strict";
import { mkdtemp, mkdir, cp, symlink, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import net from "node:net";
import sharp from "sharp";

const project = fileURLToPath(new URL("../", import.meta.url));
const root = await mkdtemp(path.join(tmpdir(), "custom-print-server-"));
const run = promisify(execFile);
let child;
try {
  await mkdir(path.join(root, "data"));
  await cp(path.join(project, "server"), path.join(root, "server"), { recursive: true });
  await cp(path.join(project, "shared"), path.join(root, "shared"), { recursive: true });
  await symlink(path.join(project, "node_modules"), path.join(root, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  await writeFile(path.join(root, "package.json"), '{"type":"module"}');
  await writeFile(path.join(root, "seed.mjs"), `
    import { randomUUID } from 'node:crypto';
    import { fileURLToPath } from 'node:url';
    import { createCommerceStore } from './server/commerce-store.js';
    import { createOrderStore } from './server/order-store.js';
    import { createPrintStore } from './server/print-store.js';
    const dbPath = fileURLToPath(new URL('./data/orders.sqlite', import.meta.url));
    createOrderStore({ dbPath }); const commerce = createCommerceStore({ dbPath }); const print = createPrintStore({ dbPath });
    const make = (name) => commerce.createOrGetWebAccount({ openId: 'isolated-' + name, visitorId: randomUUID(), nickname: name });
    const owner = make('owner'), staff = make('staff'), other = make('other');
    commerce.setStoreOwner(owner.id, true); commerce.setStoreOwner(other.id, true); commerce.setStoreStaff(staff.id, owner.id);
    const session = (account) => commerce.createUserSession(account.id).id;
    const first = print.createPrintDevice({ storeOwnerAccountId: owner.id }), second = print.createPrintDevice({ storeOwnerAccountId: other.id });
    console.log(JSON.stringify({ owner, staff, cookies: { owner: session(owner), staff: session(staff), other: session(other) }, first, second }));
  `);
  const { stdout } = await run(process.execPath, [path.join(root, "seed.mjs")], { windowsHide: true });
  const fixture = JSON.parse(stdout.trim());
  const socket = net.createServer(); await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port; await new Promise((resolve) => socket.close(resolve));
  let logs = "";
  child = spawn(process.execPath, [path.join(root, "server", "index.js")], { cwd: root, windowsHide: true, env: { ...process.env, PORT: String(port), WECHAT_ALERT_LOG_ONLY: "true", BODY_BOOK_GENERATION_MODE: "mock" } });
  child.stdout.on("data", (chunk) => { logs += chunk; }); child.stderr.on("data", (chunk) => { logs += chunk; });
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => reject(new Error(`Server startup timed out: ${logs}`)), 15000);
    const interval = setInterval(() => {
      if (logs.includes("Prompt gallery listening")) { clearInterval(interval); clearTimeout(deadline); resolve(); }
      else if (child.exitCode !== null) { clearInterval(interval); clearTimeout(deadline); reject(new Error(logs)); }
    }, 50);
  });
  const base = `http://127.0.0.1:${port}`;
  const merchant = (name) => ({ Cookie: `pg_user_session=${fixture.cookies[name]}` });
  const device = (name = "first") => ({ Authorization: `Bearer ${fixture[name].token}` });
  const post = (url, body, headers) => fetch(base + url, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  assert.equal((await fetch(base + "/api/merchant/tasks")).status, 401);
  const role = await (await fetch(base + "/api/merchant/me", { headers: merchant("staff") })).json();
  assert.equal(role.role, "staff"); assert.equal(role.merchant.accountId, fixture.owner.id);
  const form = new FormData();
  form.append("image", new Blob([await sharp({ create: { width: 100, height: 100, channels: 3, background: "red" } }).png().toBuffer()], { type: "image/png" }), "image.png");
  const uploaded = await fetch(base + "/api/merchant/custom-print/assets", { method: "POST", headers: merchant("staff"), body: form });
  assert.equal(uploaded.status, 201); const asset = await uploaded.json();
  assert.equal((await fetch(base + asset.previewUrl, { headers: merchant("other") })).status, 404);
  const item = { id: "one", assetId: asset.assetId, widthMm: 30, heightMm: 30, centerXmm: 50, centerYmm: 74, rotationDeg: 30, crop: { x: 0, y: 0, width: 1, height: 1 } };
  const previewResponse = await post("/api/merchant/custom-print/previews", { items: [item] }, merchant("staff"));
  assert.equal(previewResponse.status, 201); const preview = await previewResponse.json();
  const input = { previewId: preview.previewId, copies: 2, idempotencyKey: "server-test-request-key" };
  assert.equal((await post("/api/merchant/custom-print/jobs", input, merchant("owner"))).status, 409);
  const heartbeat = await post("/api/print-agent/heartbeat", { printerState: "idle", supportedLayoutModes: ["2up", "custom-sheet-v1"] }, device());
  assert.equal(heartbeat.status, 200);
  assert.equal((await (await fetch(base + "/api/merchant/overview", { headers: merchant("owner") })).json()).printer.customPrintSupported, true);
  const response = await post("/api/merchant/custom-print/jobs", input, merchant("staff"));
  assert.equal(response.status, 201); const { job } = await response.json();
  assert.equal(job.creatorAccountId, fixture.staff.id); assert.equal(job.storeOwnerAccountId, fixture.owner.id);
  assert.equal((await (await fetch(base + "/api/merchant/tasks", { headers: merchant("owner") })).json()).items[0].incomeCents, 0);
  assert.equal((await (await fetch(base + "/api/print-agent/jobs/next", { headers: device() })).json()).job, null);
  const claim = await (await fetch(base + "/api/print-agent/jobs/next?layoutModes=2up,custom-sheet-v1", { headers: device() })).json();
  assert.equal(claim.job.jobId, job.id);
  assert.equal((await fetch(base + claim.job.files[0].downloadUrl, { headers: device("second") })).status, 404);
  const rendered = await fetch(base + claim.job.files[0].downloadUrl, { headers: device() });
  assert.equal(rendered.status, 200); assert.equal((await sharp(Buffer.from(await rendered.arrayBuffer())).metadata()).width, 1181);
  const result = (status) => post(`/api/print-agent/jobs/${job.id}/result`, { status, attempt: claim.job.attempt }, device());
  assert.equal((await result("printed")).status, 409, "cannot finish before completed progress");
  assert.equal((await post(`/api/print-agent/jobs/${job.id}/progress`, { completedCopies: 1, attempt: claim.job.attempt }, device())).status, 200);
  assert.equal((await result("failed")).status, 200);
  assert.equal((await post(`/api/merchant/print-jobs/${job.id}/retry`, { completedCopies: 1 }, merchant("other"))).status, 403);
  const retried = await post(`/api/merchant/print-jobs/${job.id}/retry`, { completedCopies: 1 }, merchant("owner"));
  assert.equal(retried.status, 200);
  const secondClaim = await (await fetch(base + "/api/print-agent/jobs/next?layoutModes=custom-sheet-v1", { headers: device() })).json();
  assert.equal(secondClaim.job.completedCopies, 1); assert.equal(secondClaim.job.attempt, 2);
  assert.equal((await post(`/api/print-agent/jobs/${job.id}/progress`, { completedCopies: 2, attempt: 1 }, device())).status, 409);
  assert.equal((await post(`/api/print-agent/jobs/${job.id}/progress`, { completedCopies: 2, attempt: 2 }, device())).status, 200);
  assert.equal((await post(`/api/print-agent/jobs/${job.id}/result`, { status: "printed", attempt: 2 }, device())).status, 200);
  const final = await (await fetch(base + "/api/merchant/tasks", { headers: merchant("owner") })).json();
  assert.equal(final.items[0].status, "printed"); assert.equal(final.items[0].completedCopies, 2);
  console.log("PASS: real server sessions, staff ownership, capability handshake, protected downloads, progress, retries and completion.");
} finally {
  if (child && child.exitCode === null) { child.kill(); await new Promise((resolve) => child.once("exit", resolve)); }
  await rm(root, { recursive: true, force: true });
}
