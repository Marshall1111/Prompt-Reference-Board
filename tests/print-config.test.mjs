import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createPrintStore } from "../server/print-store.js";
import { DEFAULT_PRINT_CONFIG, normalizePrintConfig } from "../server/print-config.js";

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "print-config-test-"));
  const store = createPrintStore({ dbPath: path.join(root, "orders.sqlite") });
  t.after(() => store.close());
  t.after(() => rm(root, { recursive: true, force: true }));
  return { store };
}

test("normalizePrintConfig fills defaults and keeps calibration values", () => {
  const config = normalizePrintConfig({
    profile: { piece_width_mm: 50.5, sheet_width_mm: 105.67 },
    scale_x: 1.02,
    print_seconds_per_sheet: 48.4
  });
  assert.equal(config.profile.piece_width_mm, 50.5);
  assert.equal(config.profile.sheet_height_mm, DEFAULT_PRINT_CONFIG.profile.sheet_height_mm);
  assert.equal(config.scale_x, 1.02);
  assert.equal(config.print_seconds_per_sheet, 48);
  assert.equal(config.media, DEFAULT_PRINT_CONFIG.media);
});

test("normalizePrintConfig rejects invalid geometry", () => {
  assert.throws(() => normalizePrintConfig({
    profile: { piece_width_mm: 200, sheet_width_mm: 105 }
  }), /成品尺寸不能大于纸张尺寸/);
  assert.throws(() => normalizePrintConfig({
    profile: { print_x0_mm: 50, print_x1_mm: 40 }
  }), /左边界需小于右边界/);
});

test("updatePrintConfig bumps revision and heartbeat can report applied revision", async (t) => {
  const { store } = await fixture(t);
  const { device } = store.createPrintDevice({ label: "cfg" });
  assert.equal(device.printConfigRev, 0);
  assert.equal(device.printConfig, null);

  const config = normalizePrintConfig({ profile: { gap_mm: 3 } });
  const first = store.updatePrintConfig(device.deviceId, config);
  assert.equal(first.printConfigRev, 1);
  assert.equal(first.printConfig.profile.gap_mm, 3);
  assert.equal(first.printConfigAppliedRev, 0);

  const second = store.updatePrintConfig(device.deviceId, { ...config, offset_y_mm: 0.8 });
  assert.equal(second.printConfigRev, 2);

  const touched = store.touchPrintDevice(device.deviceId, {
    printerState: "online",
    printConfigAppliedRev: 2
  });
  assert.equal(touched.printConfigAppliedRev, 2);
});
