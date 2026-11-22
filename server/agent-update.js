import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
// 只发布用户态程序文件；服务单元与系统依赖不在此列，避免更新时需要 root。
const SOURCE_FILES = ["agent.py", "print_agent.py", "VERSION"];

export function createAgentUpdateService({ rootDir, dataRoot, printStore }) {
  const releaseRoot = path.join(dataRoot, "agent-releases");

  async function createRelease({ note = "" } = {}) {
    const sourceDir = path.join(rootDir, "print-agent");
    let version = "";
    try {
      version = (await readFile(path.join(sourceDir, "VERSION"), "utf8")).trim();
    } catch {
      version = "";
    }
    if (!version) throw new Error("print-agent/VERSION 缺失或为空，无法发布新版本。");

    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    const directory = path.join(releaseRoot, stamp);
    await mkdir(directory, { recursive: true });
    const archive = path.join(directory, "agent.tgz");
    try {
      await execFileAsync("tar", ["-czf", archive, "-C", sourceDir, ...SOURCE_FILES], { timeout: 120000 });
    } catch (error) {
      throw new Error(`打包 print-agent 失败：${error?.message || error}`);
    }

    const buffer = await readFile(archive);
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const fileStat = await stat(archive);
    const releaseId = `rel_${stamp}_${sha256.slice(0, 8)}`;
    return printStore.createAgentRelease({
      releaseId,
      version,
      filePath: archive,
      sha256,
      size: fileStat.size,
      note
    });
  }

  function getRelease(releaseId) {
    return printStore.readAgentRelease(releaseId);
  }

  function getLatestRelease() {
    return printStore.listAgentReleases(1)[0] || null;
  }

  function readReleaseFile(releaseId) {
    const release = getRelease(releaseId);
    if (!release || !existsSync(release.filePath)) return null;
    return release;
  }

  function queueUpdate({ deviceIds = [], all = false, releaseId = "" } = {}) {
    const release = releaseId ? getRelease(releaseId) : getLatestRelease();
    if (!release) throw new Error("还没有可用版本，请先发布新版本。");
    const devices = all
      ? printStore.listPrintDevices().map((device) => device.deviceId)
      : deviceIds.map((deviceId) => String(deviceId || "")).filter(Boolean);
    if (!devices.length) throw new Error("请选择要升级的设备。");
    return { ...printStore.queueAgentUpdate(devices, release), release };
  }

  function queueRollback({ deviceIds = [] } = {}) {
    const devices = deviceIds.map((deviceId) => String(deviceId || "")).filter(Boolean);
    if (!devices.length) throw new Error("请选择要回滚的设备。");
    return printStore.queueAgentRollback(devices);
  }

  return {
    createRelease,
    getRelease,
    getLatestRelease,
    readReleaseFile,
    queueUpdate,
    queueRollback
  };
}
