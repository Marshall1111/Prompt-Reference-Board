import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPrintStore } from "../server/print-store.js";
import { createAgentUpdateService } from "../server/agent-update.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "agent-update-test-"));
  const source = path.join(root, "print-agent");
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, "agent.py"), "print('ok')\n");
  await writeFile(path.join(source, "print_agent.py"), "VALUE = 1\n");
  await writeFile(path.join(source, "VERSION"), "1.0.1\n");
  const store = createPrintStore({ dbPath: path.join(root, "orders.sqlite") });
  t.after(() => store.close());
  // 先关数据库再删目录，Windows 上顺序反了会 EBUSY。
  t.after(() => rm(root, { recursive: true, force: true }));
  const service = createAgentUpdateService({
    rootDir: root,
    dataRoot: path.join(root, "data"),
    printStore: store
  });
  return { store, service };
}

test("createRelease packages print-agent files with checksum and version", async (t) => {
  const { service } = await fixture(t);
  const release = await service.createRelease({ note: "smoke" });
  assert.equal(release.version, "1.0.1");
  assert.match(release.releaseId, /^rel_\d{14}_[0-9a-f]{8}$/);
  assert.match(release.sha256, /^[0-9a-f]{64}$/);
  assert.ok(release.size > 0);
  assert.ok(service.readReleaseFile(release.releaseId));
});

test("queued release reaches device and is confirmed by heartbeat", async (t) => {
  const { store, service } = await fixture(t);
  const release = await service.createRelease({});
  const { device } = store.createPrintDevice({ label: "test" });

  const result = service.queueUpdate({ deviceIds: [device.deviceId] });
  assert.equal(result.queued, 1);

  const pending = store.takeAgentUpdate(device.deviceId);
  assert.equal(pending.kind, "release");
  assert.equal(pending.releaseId, release.releaseId);
  assert.equal(pending.sha256, release.sha256);

  store.recordAgentUpdateResult(device.deviceId, {
    state: "applied", kind: "release", releaseId: release.releaseId, version: release.version
  });
  const confirmed = store.confirmAgentUpdateFromHeartbeat(device.deviceId, {
    agentVersion: release.version,
    agentReleaseId: release.releaseId
  });
  assert.equal(confirmed.agentUpdateState, "succeeded");
  assert.equal(confirmed.agentVersion, release.version);
  assert.equal(store.takeAgentUpdate(device.deviceId), null);
});

test("failed result stops retrying until pushed again", async (t) => {
  const { store, service } = await fixture(t);
  const release = await service.createRelease({});
  const { device } = store.createPrintDevice({ label: "test" });
  service.queueUpdate({ deviceIds: [device.deviceId] });

  store.recordAgentUpdateResult(device.deviceId, {
    state: "failed", kind: "release", releaseId: release.releaseId, error: "下载失败"
  });
  const failed = store.readPrintDevice(device.deviceId);
  assert.equal(failed.agentUpdateState, "failed");
  assert.equal(failed.agentUpdateError, "下载失败");
  assert.equal(store.takeAgentUpdate(device.deviceId), null);

  assert.equal(service.queueUpdate({ deviceIds: [device.deviceId] }).queued, 1);
  assert.equal(store.takeAgentUpdate(device.deviceId).releaseId, release.releaseId);
});

test("rollback only queues for devices that reported a previous version", async (t) => {
  const { store, service } = await fixture(t);
  const { device } = store.createPrintDevice({ label: "test" });
  const withoutPrevious = service.queueRollback({ deviceIds: [device.deviceId] });
  assert.equal(withoutPrevious.queued, 0);
  assert.deepEqual(withoutPrevious.skipped, [device.deviceId]);

  store.touchPrintDevice(device.deviceId, {
    agentVersion: "1.0.1",
    agentPreviousVersion: "1.0.0",
    agentPreviousReleaseId: "rel_20260101000000_abcdef12"
  });
  const queued = service.queueRollback({ deviceIds: [device.deviceId] });
  assert.equal(queued.queued, 1);

  const pending = store.takeAgentUpdate(device.deviceId);
  assert.equal(pending.kind, "rollback");
  assert.equal(pending.version, "1.0.0");

  const confirmed = store.confirmAgentUpdateFromHeartbeat(device.deviceId, {
    agentVersion: "1.0.0",
    agentReleaseId: "rel_20260101000000_abcdef12"
  });
  assert.equal(confirmed.agentUpdateState, "succeeded");
});
