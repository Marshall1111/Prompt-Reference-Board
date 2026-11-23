import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const WORKER_PATH = path.join(moduleDir, "video-render-worker.mjs");
const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);
const JOB_ID_PATTERN = /^vw_\d{8}_[a-f0-9]{6}$/;
const BGM_ID_PATTERN = /^bgm_\d{8}_[a-f0-9]{6}$/;
const MAX_FINISHED_JOBS = 30;
const MAX_JOB_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_BGM_FILES = 20;
const JOB_TIMEOUT_MS = 15 * 60 * 1000;
const PROGRESS_WRITE_INTERVAL_MS = 500;
const TEMPLATE_META_FILENAME = "template.json";
const DEFAULT_TEMPLATE_FILENAME = "cover-template-default.png";
const TEMPLATE_EXT_BY_MIME = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp"
};

function todayStamp() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}${month}${day}`;
}

function createId(prefix) {
  return `${prefix}_${todayStamp()}_${randomBytes(3).toString("hex")}`;
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: Number(job.progress || 0),
    message: String(job.message || ""),
    error: String(job.error || ""),
    createdAt: job.createdAt || null,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    durationMs: Number(job.durationMs || 0),
    params: job.params || null,
    jobIds: Array.isArray(job.jobIds) ? job.jobIds : [],
    coverJobId: String(job.coverJobId || ""),
    bgmName: String(job.bgmName || ""),
    siteUrl: String(job.siteUrl || ""),
    topText: String(job.topText || ""),
    bottomText: String(job.bottomText || ""),
    outputName: String(job.outputName || ""),
    outputBytes: Number(job.outputBytes || 0),
    logTail: String(job.logTail || "")
  };
}

export function createVideoWorkshop({
  rootDir,
  dataRoot,
  ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg",
  logger = console,
  createCoverJob = null,
  waitForCover = null
}) {
  const jobsRoot = path.join(dataRoot, "jobs");
  const bgmRoot = path.join(dataRoot, "bgm");
  const templateRoot = path.join(dataRoot, "template");
  const defaultTemplatePath = path.join(rootDir, "server", "assets", DEFAULT_TEMPLATE_FILENAME);
  const builtinBgmPath = path.join(rootDir, "server", "assets", "bgm.m4a");
  const queue = [];
  let runningJobId = "";
  let lastProgressWriteAt = 0;

  // 同一个任务的 meta 读写必须串行，否则迟到的进度更新会把 finalize 写入的终态覆盖回 running。
  const metaQueues = new Map();
  function withMetaLock(jobId, task) {
    const previous = metaQueues.get(jobId) || Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.then(() => {}, () => {});
    metaQueues.set(jobId, settled);
    settled.then(() => {
      if (metaQueues.get(jobId) === settled) metaQueues.delete(jobId);
    });
    return run;
  }

  const jobDir = (jobId) => path.join(jobsRoot, jobId);
  const metaPath = (jobId) => path.join(jobDir(jobId), "meta.json");

  async function readMeta(jobId) {
    try {
      return JSON.parse(await readFile(metaPath(jobId), "utf-8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function writeMeta(job) {
    await mkdir(jobDir(job.id), { recursive: true });
    await writeFile(metaPath(job.id), JSON.stringify(job, null, 2), "utf-8");
  }

  async function updateJob(jobId, patch, { force = false } = {}) {
    return withMetaLock(jobId, async () => {
      const job = await readMeta(jobId);
      if (!job) return null;
      const next = { ...job, ...patch };
      if (force || !TERMINAL_STATUSES.has(next.status)) {
        lastProgressWriteAt = Date.now();
      }
      await writeMeta(next);
      return next;
    });
  }

  async function listJobs() {
    await mkdir(jobsRoot, { recursive: true });
    const entries = await readdir(jobsRoot, { withFileTypes: true });
    const jobs = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !JOB_ID_PATTERN.test(entry.name)) continue;
      const job = await readMeta(entry.name);
      if (job) jobs.push(publicJob(job));
    }
    return jobs.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  }

  async function getJob(jobId) {
    if (!JOB_ID_PATTERN.test(String(jobId || ""))) return null;
    const job = await readMeta(jobId);
    return job ? publicJob(job) : null;
  }

  async function getJobRaw(jobId) {
    if (!JOB_ID_PATTERN.test(String(jobId || ""))) return null;
    return readMeta(jobId);
  }

  async function prune() {
    try {
      const entries = await readdir(jobsRoot, { withFileTypes: true });
      const jobs = [];
      for (const entry of entries) {
        if (!entry.isDirectory() || !JOB_ID_PATTERN.test(entry.name)) continue;
        const job = await readMeta(entry.name);
        if (job) jobs.push(job);
      }
      const now = Date.now();
      const finished = jobs
        .filter((job) => TERMINAL_STATUSES.has(job.status) && job.id !== runningJobId)
        .sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
      const removals = new Set();
      finished.forEach((job, index) => {
        const createdAt = Date.parse(job.createdAt || "");
        const expired = Number.isFinite(createdAt) && now - createdAt > MAX_JOB_AGE_MS;
        if (index >= MAX_FINISHED_JOBS || expired) removals.add(job.id);
      });
      for (const jobId of removals) {
        await rm(jobDir(jobId), { recursive: true, force: true });
      }

      const bgmFiles = await listBgmFiles();
      for (const file of bgmFiles.slice(MAX_BGM_FILES)) {
        await rm(file.path, { force: true });
      }
    } catch (error) {
      logger.warn?.("[video] 清理历史任务失败", error);
    }
  }

  async function init() {
    await mkdir(jobsRoot, { recursive: true });
    await mkdir(bgmRoot, { recursive: true });
    await mkdir(templateRoot, { recursive: true });
    const entries = await readdir(jobsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !JOB_ID_PATTERN.test(entry.name)) continue;
      const job = await readMeta(entry.name);
      if (!job) continue;
      if (!TERMINAL_STATUSES.has(job.status)) {
        await writeMeta({
          ...job,
          status: "failed",
          error: "服务重启，任务中断",
          message: "服务重启，任务中断",
          finishedAt: new Date().toISOString()
        });
      }
    }
    await prune();
  }

  async function listBgmFiles() {
    await mkdir(bgmRoot, { recursive: true });
    const entries = await readdir(bgmRoot, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !BGM_ID_PATTERN.test(entry.name.replace(/\.[^.]+$/, ""))) continue;
      const filePath = path.join(bgmRoot, entry.name);
      const info = await stat(filePath);
      files.push({
        id: entry.name.replace(/\.[^.]+$/, ""),
        name: entry.name,
        size: info.size,
        updatedAt: info.mtime.toISOString(),
        path: filePath
      });
    }
    return files.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  }

  async function listBgm() {
    const builtin = existsSync(builtinBgmPath)
      ? { name: "内置 BGM", size: (await stat(builtinBgmPath)).size }
      : null;
    const uploads = (await listBgmFiles()).map((file) => ({
      id: file.id,
      name: file.name,
      size: file.size,
      updatedAt: file.updatedAt
    }));
    return { builtin, uploads };
  }

  async function saveBgm(buffer, originalName) {
    const extension = (path.extname(String(originalName || "")).toLowerCase() || ".m4a");
    const id = createId("bgm");
    const filename = `${id}${extension}`;
    await mkdir(bgmRoot, { recursive: true });
    await writeFile(path.join(bgmRoot, filename), buffer);
    await prune();
    return { id, name: filename, size: buffer.length };
  }

  async function deleteBgm(bgmId) {
    if (!BGM_ID_PATTERN.test(String(bgmId || ""))) {
      const error = new Error("音频文件不存在。");
      error.status = 404;
      throw error;
    }
    const files = await listBgmFiles();
    const target = files.find((file) => file.id === bgmId);
    if (!target) {
      const error = new Error("音频文件不存在。");
      error.status = 404;
      throw error;
    }
    await rm(target.path, { force: true });
  }

  async function resolveBgmFile(bgm) {
    if (bgm?.type === "upload" && BGM_ID_PATTERN.test(String(bgm.id || ""))) {
      const files = await listBgmFiles();
      const target = files.find((file) => file.id === bgm.id);
      if (target) return { path: target.path, name: target.name };
    }
    if (!existsSync(builtinBgmPath)) {
      const error = new Error("服务器缺少内置 BGM 文件。");
      error.status = 500;
      throw error;
    }
    return { path: builtinBgmPath, name: "内置 BGM" };
  }

  function templateMetaPath() {
    return path.join(templateRoot, TEMPLATE_META_FILENAME);
  }

  async function readTemplateMeta() {
    try {
      return JSON.parse(await readFile(templateMetaPath(), "utf-8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async function getTemplateFile() {
    const meta = await readTemplateMeta();
    if (meta?.filename) {
      const customPath = path.join(templateRoot, String(meta.filename));
      if (existsSync(customPath)) {
        return {
          path: customPath,
          name: String(meta.name || meta.filename),
          mimeType: String(meta.mimeType || ""),
          updatedAt: String(meta.updatedAt || ""),
          isDefault: false
        };
      }
    }
    if (!existsSync(defaultTemplatePath)) return null;
    const info = await stat(defaultTemplatePath);
    return {
      path: defaultTemplatePath,
      name: DEFAULT_TEMPLATE_FILENAME,
      mimeType: "image/png",
      updatedAt: info.mtime.toISOString(),
      isDefault: true
    };
  }

  async function getTemplateInfo() {
    const file = await getTemplateFile();
    if (!file) return null;
    const info = await stat(file.path);
    const updatedAt = file.updatedAt || info.mtime.toISOString();
    return {
      name: file.isDefault ? "默认模板" : file.name,
      mimeType: file.mimeType,
      size: info.size,
      updatedAt,
      isDefault: Boolean(file.isDefault),
      url: `/api/admin/video-workshop/template/file?v=${encodeURIComponent(updatedAt)}`
    };
  }

  async function clearTemplateFiles() {
    await mkdir(templateRoot, { recursive: true });
    const entries = await readdir(templateRoot, { withFileTypes: true });
    await Promise.all(entries
      .filter((entry) => entry.isFile())
      .map((entry) => rm(path.join(templateRoot, entry.name), { force: true })));
  }

  async function saveTemplate(buffer, { originalName = "", mimeType = "" } = {}) {
    const extension = TEMPLATE_EXT_BY_MIME[String(mimeType || "")];
    if (!extension) {
      const error = new Error("仅支持 PNG / JPEG / WebP 图片。");
      error.status = 400;
      throw error;
    }
    await clearTemplateFiles();
    const filename = `template${extension}`;
    const updatedAt = new Date().toISOString();
    await writeFile(path.join(templateRoot, filename), buffer);
    const meta = {
      filename,
      name: String(originalName || filename),
      mimeType: String(mimeType),
      size: buffer.length,
      updatedAt
    };
    await writeFile(templateMetaPath(), JSON.stringify(meta, null, 2), "utf-8");
    return {
      name: meta.name,
      mimeType: meta.mimeType,
      size: meta.size,
      updatedAt,
      isDefault: false,
      url: `/api/admin/video-workshop/template/file?v=${encodeURIComponent(updatedAt)}`
    };
  }

  async function deleteTemplate() {
    await clearTemplateFiles();
  }

  async function createJob({
    pairs,
    params,
    endPageBuffer,
    bgm,
    jobIds,
    siteUrl,
    topText,
    bottomText
  }) {
    const template = await getTemplateFile();
    if (!template) {
      const error = new Error("服务器缺少结尾页封面模板图。");
      error.status = 500;
      throw error;
    }
    if (typeof createCoverJob !== "function" || typeof waitForCover !== "function") {
      const error = new Error("结尾页封面生成服务不可用。");
      error.status = 500;
      throw error;
    }
    const sixth = Array.isArray(pairs) ? pairs[5] : null;
    if (!sixth?.after) {
      const error = new Error("缺少第 6 个任务的转绘结果图。");
      error.status = 400;
      throw error;
    }
    const coverJobId = await createCoverJob({
      templatePath: template.path,
      templateName: template.name,
      templateMime: template.mimeType,
      resultPath: sixth.after
    });

    const id = createId("vw");
    const directory = jobDir(id);
    await mkdir(directory, { recursive: true });

    const endPagePath = path.join(directory, "end.png");
    await writeFile(endPagePath, endPageBuffer);

    const bgmFile = await resolveBgmFile(bgm);
    const bgmExt = path.extname(bgmFile.path) || ".m4a";
    const bgmPath = path.join(directory, `bgm${bgmExt}`);
    await copyFile(bgmFile.path, bgmPath);

    const job = {
      id,
      status: "queued",
      progress: 0,
      message: "排队中",
      error: "",
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
      durationMs: 0,
      params,
      pairs,
      jobIds,
      coverJobId,
      bgmName: bgmFile.name,
      bgmExt,
      siteUrl: String(siteUrl || ""),
      topText: String(topText || ""),
      bottomText: String(bottomText || ""),
      outputName: "",
      outputBytes: 0,
      logTail: ""
    };
    await writeMeta(job);
    queue.push(id);
    setImmediate(() => {
      runNext().catch((error) => logger.error?.("[video] 启动渲染任务失败", error));
    });
    return publicJob(job);
  }

  async function deleteJob(jobId) {
    const job = await readMeta(jobId);
    if (!job) {
      const error = new Error("任务不存在。");
      error.status = 404;
      throw error;
    }
    if (!TERMINAL_STATUSES.has(job.status)) {
      const error = new Error("任务正在生成中，无法删除。");
      error.status = 409;
      throw error;
    }
    await rm(jobDir(jobId), { recursive: true, force: true });
  }

  function appendLog(job, chunk) {
    const nextTail = `${job.logTail || ""}${chunk}`;
    job.logTail = nextTail.length > 4000 ? nextTail.slice(-4000) : nextTail;
  }

  async function runNext() {
    if (runningJobId) return;
    const jobId = queue.shift();
    if (!jobId) return;
    const job = await readMeta(jobId);
    if (!job || job.status !== "queued") {
      setImmediate(() => {
        runNext().catch((error) => logger.error?.("[video] 队列推进失败", error));
      });
      return;
    }

    runningJobId = jobId;
    const startedAt = Date.now();
    await updateJob(jobId, {
      status: "running",
      progress: 1,
      message: job.coverJobId ? "生成结尾页封面 0%" : "准备素材",
      startedAt: new Date(startedAt).toISOString()
    }, { force: true });

    let coverPath = "";
    if (job.coverJobId) {
      try {
        const coverFile = await waitForCover(job.coverJobId, {
          onProgress: async (progress) => {
            const rounded = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
            await updateJob(jobId, {
              progress: 1 + Math.min(3, (rounded / 100) * 3),
              message: `生成结尾页封面 ${rounded}%`
            });
          }
        });
        if (!coverFile) throw new Error("结尾页封面结果图缺失。");
        const coverExtension = path.extname(coverFile) || ".png";
        coverPath = path.join(jobDir(jobId), `cover${coverExtension}`);
        await copyFile(coverFile, coverPath);
      } catch (error) {
        runningJobId = "";
        await withMetaLock(jobId, async () => {
          const current = await readMeta(jobId);
          if (!current) return;
          await writeMeta({
            ...current,
            status: "failed",
            message: "结尾页封面生成失败",
            error: String(error?.message || error || "结尾页封面生成失败"),
            durationMs: Date.now() - startedAt,
            finishedAt: new Date().toISOString(),
            pairs: undefined
          });
        });
        await prune();
        setImmediate(() => {
          runNext().catch((nextError) => logger.error?.("[video] 队列推进失败", nextError));
        });
        return;
      }
    }

    const inputPath = path.join(jobDir(jobId), "render-input.json");
    const outputPath = path.join(jobDir(jobId), "output.mp4");
    const input = {
      jobId,
      outputPath,
      endPagePath: path.join(jobDir(jobId), "end.png"),
      coverPath,
      bgmPath: path.join(jobDir(jobId), `bgm${job.bgmExt || ".m4a"}`),
      pairs: Array.isArray(job.pairs) ? job.pairs : [],
      params: job.params
    };
    await writeFile(inputPath, JSON.stringify(input, null, 2), "utf-8");

    let stdoutBuffer = "";
    let stderrTail = "";
    let finished = false;
    let timer = null;

    const child = spawn(process.execPath, [WORKER_PATH, inputPath], {
      cwd: rootDir,
      env: { ...process.env, FFMPEG_PATH: ffmpegPath },
      stdio: ["ignore", "pipe", "pipe"]
    });

    const finalize = async (patch, { keepLog = false } = {}) => {
      if (finished) return;
      finished = true;
      if (timer) clearTimeout(timer);
      runningJobId = "";
      await withMetaLock(jobId, async () => {
        const current = await readMeta(jobId);
        if (!current) return;
        await writeMeta({
          ...current,
          ...patch,
          durationMs: Date.now() - startedAt,
          finishedAt: new Date().toISOString(),
          pairs: undefined
        });
      });
      if (!keepLog) await rm(inputPath, { force: true });
      await prune();
      setImmediate(() => {
        runNext().catch((error) => logger.error?.("[video] 队列推进失败", error));
      });
    };

    const handleLine = async (line) => {
      const text = line.trim();
      if (!text) return;
      if (text.startsWith("PROGRESS ")) {
        const progress = Math.max(0, Math.min(99, Number(text.slice(9)) || 0));
        const now = Date.now();
        if (now - lastProgressWriteAt >= PROGRESS_WRITE_INTERVAL_MS) {
          await updateJob(jobId, { progress, message: `渲染中 ${progress}%` });
        }
        return;
      }
      if (text.startsWith("MESSAGE ")) {
        await updateJob(jobId, { message: text.slice(8) });
        return;
      }
      if (text.startsWith("DONE ")) {
        const bytes = Number(text.slice(5)) || 0;
        await finalize({
          status: "succeeded",
          progress: 100,
          message: "生成完成",
          error: "",
          outputName: `小画视频_${jobId}.mp4`,
          outputBytes: bytes
        });
        return;
      }
      if (text.startsWith("ERROR ")) {
        await finalize({ status: "failed", message: "生成失败", error: text.slice(6) }, { keepLog: true });
        return;
      }
      await withMetaLock(jobId, async () => {
        const current = await readMeta(jobId);
        if (!current) return;
        appendLog(current, `${text}\n`);
        await writeMeta(current);
      });
    };

    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk;
      let index = stdoutBuffer.indexOf("\n");
      while (index >= 0) {
        const line = stdoutBuffer.slice(0, index);
        stdoutBuffer = stdoutBuffer.slice(index + 1);
        handleLine(line).catch((error) => logger.error?.("[video] 处理渲染输出失败", error));
        index = stdoutBuffer.indexOf("\n");
      }
    });

    child.stderr.setEncoding("utf-8");
    child.stderr.on("data", (chunk) => {
      if (finished) return;
      stderrTail = (stderrTail + chunk).slice(-4000);
      withMetaLock(jobId, async () => {
        if (finished) return null;
        const latest = await readMeta(jobId);
        if (!latest) return null;
        appendLog(latest, chunk);
        return writeMeta(latest);
      }).catch(() => {});
    });

    child.on("error", async (error) => {
      await finalize({
        status: "failed",
        message: "生成失败",
        error: error.code === "ENOENT"
          ? "服务器未安装 ffmpeg（apt install -y ffmpeg）"
          : `无法启动渲染进程：${error.message}`
      }, { keepLog: true });
    });

    child.on("close", async (code) => {
      if (stdoutBuffer.trim()) {
        await handleLine(stdoutBuffer).catch(() => {});
        stdoutBuffer = "";
      }
      if (finished) return;
      if (code === 0) {
        try {
          const info = await stat(outputPath);
          await finalize({
            status: "succeeded",
            progress: 100,
            message: "生成完成",
            error: "",
            outputName: `小画视频_${jobId}.mp4`,
            outputBytes: info.size
          });
          return;
        } catch (error) {
          await finalize({ status: "failed", message: "生成失败", error: `成片文件缺失：${error.message}` }, { keepLog: true });
          return;
        }
      }
      await finalize({
        status: "failed",
        message: "生成失败",
        error: stderrTail.trim().slice(-1500) || `渲染进程退出码 ${code}`
      }, { keepLog: true });
    });

    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finalize({ status: "failed", message: "生成超时", error: "渲染超过 15 分钟，已终止。" }, { keepLog: true })
        .catch((error) => logger.error?.("[video] 标记超时任务失败", error));
    }, JOB_TIMEOUT_MS);
    timer.unref?.();
  }

  return {
    init,
    listJobs,
    getJob,
    getJobRaw,
    createJob,
    deleteJob,
    listBgm,
    saveBgm,
    deleteBgm,
    resolveBgmFile,
    getTemplateInfo,
    getTemplateFile,
    saveTemplate,
    deleteTemplate,
    builtinBgmPath,
    jobDir
  };
}
