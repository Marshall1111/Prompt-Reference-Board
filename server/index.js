import express from "express";
import multer from "multer";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataPath = path.join(rootDir, "data", "styles.json");
const styleGroupsPath = path.join(rootDir, "data", "style-groups.json");
const imageJobRoot = path.join(rootDir, "data", "image-jobs");
const previewRoot = path.join(rootDir, "public", "style-previews");
const generatedImageRoot = path.join(rootDir, "public", "generated-images");
const miniDataPath = path.join(rootDir, "wechat-miniprogram", "miniprogram", "data", "styles.js");
const miniImageRoot = path.join(rootDir, "wechat-miniprogram", "miniprogram", "images-small");
const miniCompressScript = path.join(rootDir, "tools", "compress_for_miniprogram.ps1");
const execFileAsync = promisify(execFile);

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

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "prompt-gallery" });
});

app.get("/api/styles", async (_req, res) => {
  res.json(await readStyles());
});

app.get("/api/style-groups", async (_req, res) => {
  res.json(await readStyleGroups());
});

app.get("/api/image-providers", (_req, res) => {
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

app.post("/api/sync-miniprogram", async (_req, res) => {
  const styles = await readStyles();
  await syncMiniProgram(styles);
  res.json({ ok: true, count: styles.length });
});

app.post("/api/generate-image", upload.array("reference", 10), async (req, res) => {
  try {
    const body = req.body || {};
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ message: "请先填写提示词。" });

    const providers = getImageProviders();
    const provider = resolveImageProvider(body.provider, providers);
    if (!provider) {
      return res.status(400).json({ message: "请先在 .env 中配置至少一个可用的图片接口供应商。" });
    }

    const referenceFiles = req.files || [];
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

app.post("/api/image-jobs", upload.array("reference", 10), async (req, res) => {
  try {
    const body = req.body || {};
    const prompt = String(body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ message: "请先填写提示词。" });

    const providers = getImageProviders();
    const provider = resolveImageProvider(body.provider, providers);
    if (!provider) {
      return res.status(400).json({ message: "请先在 .env 中配置至少一个可用的图片接口供应商。" });
    }

    const referenceFiles = req.files || [];
    if (referenceFiles.some((file) => file.mimetype === "image/svg+xml")) {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }

    const now = new Date().toISOString();
    const job = {
      jobId: randomUUID(),
      status: "queued",
      message: "任务已提交，等待生成。",
      result: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      prompt,
      referenceCount: referenceFiles.length,
      styleId: String(body.styleId || ""),
      styleName: String(body.styleName || ""),
      styleGroupId: String(body.styleGroupId || ""),
      styleGroupName: String(body.styleGroupName || ""),
      provider: {
        id: provider.id,
        name: provider.name,
        model: provider.model
      },
      mode: referenceFiles.length ? "edit" : "generation"
    };

    await saveImageJob(job);
    res.status(202).json(toPublicImageJob(job));

    runImageJob({
      jobId: job.jobId,
      body: { ...body },
      files: referenceFiles.map((file) => ({ ...file, buffer: Buffer.from(file.buffer) })),
      outputFormat: normalizeOption(body.output_format, ["png", "jpeg", "webp"], "png"),
      prompt,
      provider
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

app.get("/api/image-jobs", async (req, res) => {
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

app.post("/api/image-jobs/:jobId/cancel", async (req, res) => {
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

app.get("/api/image-jobs/:jobId", async (req, res) => {
  try {
    const job = await readImageJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "生图任务不存在。" });
    res.json(toPublicImageJob(job));
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "读取生图任务失败。" });
  }
});

app.delete("/api/image-jobs/:jobId", async (req, res) => {
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

app.post("/api/style-groups", async (req, res) => {
  const styles = await readStyles();
  const styleIds = new Set(styles.map((style) => style.id));
  const groups = await readStyleGroups();
  const group = normalizeStyleGroup(
    {
      id: `group_${Date.now()}`,
      name: req.body.name,
      styleIds: req.body.styleIds
    },
    styleIds
  );

  groups.unshift(group);
  await saveStyleGroups(groups);
  res.status(201).json(group);
});

app.put("/api/style-groups/:id", async (req, res) => {
  const styles = await readStyles();
  const styleIds = new Set(styles.map((style) => style.id));
  const groups = await readStyleGroups();
  const index = groups.findIndex((group) => group.id === req.params.id);
  if (index < 0) return res.status(404).json({ message: "风格组不存在。" });

  groups[index] = normalizeStyleGroup(
    {
      ...groups[index],
      name: req.body.name,
      styleIds: req.body.styleIds
    },
    styleIds
  );
  await saveStyleGroups(groups);
  res.json(groups[index]);
});

app.delete("/api/style-groups/:id", async (req, res) => {
  const groups = await readStyleGroups();
  const nextGroups = groups.filter((group) => group.id !== req.params.id);
  if (nextGroups.length === groups.length) return res.status(404).json({ message: "风格组不存在。" });

  await saveStyleGroups(nextGroups);
  res.status(204).end();
});

app.post("/api/styles", async (req, res) => {
  const styles = await readStyles();
  const style = {
    id: `style_${Date.now()}`,
    tags: normalizeTags(req.body.tags).length ? normalizeTags(req.body.tags) : ["新风格"],
    image: "/style-previews/default/cover.svg",
    prompt: String(req.body.prompt || "在这里填写这个风格对应的提示词。").trim(),
    useStyleImageAsReference: Boolean(req.body.useStyleImageAsReference)
  };
  styles.unshift(style);
  await saveStyles(styles);
  res.status(201).json(style);
});

app.put("/api/styles/order", async (req, res) => {
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

app.put("/api/styles/:id", async (req, res) => {
  const styles = await readStyles();
  const style = styles.find((item) => item.id === req.params.id);
  if (!style) return res.status(404).json({ message: "风格不存在。" });

  style.tags = normalizeTags(req.body.tags);
  style.prompt = String(req.body.prompt || "").trim();
  style.useStyleImageAsReference = Boolean(req.body.useStyleImageAsReference);
  await saveStyles(styles);
  res.json(style);
});

app.delete("/api/styles/:id", async (req, res) => {
  const styles = await readStyles();
  const nextStyles = styles.filter((item) => item.id !== req.params.id);
  if (nextStyles.length === styles.length) return res.status(404).json({ message: "风格不存在。" });

  await saveStyles(nextStyles);
  await removeStyleFromGroups(req.params.id);
  await deleteMiniImage(req.params.id);
  res.status(204).end();
});

app.post("/api/styles/:id/image", upload.single("image"), async (req, res) => {
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
    await saveStyles(styles);
    res.json(style);
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "仅支持 JPG、PNG、WebP 或 SVG 图片。" });
    }
    console.error(error);
    res.status(500).json({ message: "图片保存失败。" });
  }
});

app.use(express.static(path.join(rootDir, "public")));
app.use(express.static(path.join(rootDir, "dist")));

app.use((_req, res) => {
  res.sendFile(path.join(rootDir, "dist", "index.html"));
});

app.listen(port, () => {
  console.log(`Prompt gallery listening on http://127.0.0.1:${port}`);
  prepareImageJobStorage()
    .then(readStyles)
    .then(syncMiniProgram)
    .then(() => console.log("Mini program files synced."))
    .catch((error) => console.error("Startup tasks failed.", error));
});

async function readStyles() {
  const styles = JSON.parse(await readFile(dataPath, "utf-8"));
  return styles.map((style) => ({
    id: style.id,
    tags: normalizeTags(style.tags?.length ? style.tags : [style.label, style.description]),
    image: style.image || "/style-previews/default/cover.svg",
    prompt: String(style.prompt || ""),
    useStyleImageAsReference: Boolean(style.useStyleImageAsReference)
  }));
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
    name: String(group?.name || "").trim() || "未命名风格组",
    styleIds: nextStyleIds
  };
}

async function removeStyleFromGroups(styleId) {
  const groups = await readStyleGroups();
  const nextGroups = groups.map((group) => ({
    ...group,
    styleIds: group.styleIds.filter((currentId) => currentId !== styleId)
  }));
  await saveStyleGroups(nextGroups);
}

async function prepareImageJobStorage() {
  await mkdir(imageJobRoot, { recursive: true });
  await mkdir(generatedImageRoot, { recursive: true });

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

async function runImageJob({ jobId, body, files, outputFormat, prompt, provider }) {
  let job = await readImageJob(jobId);
  if (!job) return;
  if (job.status === "cancelled") return;
  const abortController = new AbortController();
  activeImageJobs.set(jobId, { abortController });

  job = await saveImageJob({
    ...job,
    status: "running",
    message: "正在生成图片。",
    updatedAt: new Date().toISOString()
  });

  try {
    const result = files.length
      ? await createImageEdit(files, prompt, outputFormat, provider, body, abortController.signal)
      : await createImageGeneration(prompt, outputFormat, provider, body, abortController.signal);
    const latestJob = await readImageJob(jobId);
    if (!latestJob || latestJob.status === "cancelled") return;
    const publicResult = await persistImageJobResult(jobId, result, outputFormat);
    await saveImageJob({
      ...latestJob,
      status: "succeeded",
      message: "生成完成。",
      result: {
        ...publicResult,
        provider: latestJob.provider
      },
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
  } catch (error) {
    const latestJob = await readImageJob(jobId);
    if (!latestJob || latestJob.status === "cancelled") return;
    await saveImageJob({
      ...latestJob,
      status: "failed",
      message: error.name === "AbortError" ? "任务已停止。" : error.publicMessage || error.message || "生图失败，请稍后再试。",
      result: null,
      updatedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
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
  await mkdir(generatedImageRoot, { recursive: true });
  await writeFile(path.join(generatedImageRoot, filename), Buffer.from(match[2], "base64"));

  return {
    ...result,
    imageDataUrl: "",
    imageUrl: `/generated-images/${filename}`,
    mimeType: match[1]
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

  return {
    ...result,
    imageDataUrl: "",
    imageUrl: `/generated-images/${filename}`,
    mimeType: contentType,
    originalImageUrl: result.imageUrl
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
  await rm(getImageJobPath(job.jobId), { force: true });
}

async function deleteGeneratedImage(job) {
  const imageUrl = job.result?.imageUrl;
  if (!imageUrl || !imageUrl.startsWith("/generated-images/")) return;
  const filename = path.basename(imageUrl);
  await rm(path.join(generatedImageRoot, filename), { force: true });
}

async function saveImageJob(job) {
  await mkdir(imageJobRoot, { recursive: true });
  const safeJob = toPublicImageJob(job);
  await writeFile(getImageJobPath(safeJob.jobId), `${JSON.stringify(safeJob, null, 2)}\n`);
  return safeJob;
}

function toPublicImageJob(job) {
  return {
    jobId: String(job.jobId || ""),
    status: job.status,
    message: job.message || "",
    result: job.result || null,
    createdAt: job.createdAt || null,
    updatedAt: job.updatedAt || null,
    completedAt: job.completedAt || null,
    prompt: String(job.prompt || ""),
    referenceCount: Number(job.referenceCount || 0),
    styleId: String(job.styleId || ""),
    styleName: String(job.styleName || ""),
    styleGroupId: String(job.styleGroupId || ""),
    styleGroupName: String(job.styleGroupName || ""),
    durationSeconds: computeDurationSeconds(job),
    totalTokens: Number(job.result?.usage?.total_tokens || job.result?.usage?.totalTokens || 0),
    provider: job.provider || null,
    mode: job.mode || job.result?.mode || ""
  };
}

function computeDurationSeconds(job) {
  if (!job.createdAt || !job.completedAt) return null;
  const startedAt = new Date(job.createdAt).getTime();
  const completedAt = new Date(job.completedAt).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt)) return null;
  return Math.max(0, Math.round((completedAt - startedAt) / 1000));
}

function getImageJobPath(jobId) {
  return path.join(imageJobRoot, `${jobId}.json`);
}

function isSafeImageJobId(jobId) {
  return /^[a-f0-9-]{36}$/i.test(String(jobId || ""));
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
      const message = payload.error?.message || payload.message || `接口返回 ${response.status}`;
      const error = new Error(message);
      error.status = response.status;
      error.publicMessage = endpoint === "/images/edits"
        ? `${provider.name} 参考图编辑接口调用失败：${message}`
        : `${provider.name} 生图接口调用失败：${message}`;
      throw error;
    }

    return payload;
  } catch (error) {
    if (error.name === "AbortError") {
      error.publicMessage = `生图请求超过 ${Math.round(timeoutMs / 1000)} 秒仍未完成。可以降低尺寸/质量后重试，或在 .env 中调大 KUAIPAO_IMAGE_TIMEOUT_MS。`;
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
    name: "快跑",
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
  await writeFile(dataPath, `${JSON.stringify(styles, null, 2)}\n`, "utf-8");
  await syncMiniProgram(styles);
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
  if (!imagePath || !imagePath.startsWith("/style-previews/")) return "";
  const relative = imagePath.replace(/^\/+/, "");
  return path.join(rootDir, "public", relative);
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
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,，、\n]/);
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
