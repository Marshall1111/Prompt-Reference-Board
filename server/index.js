import express from "express";
import multer from "multer";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { access, copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const dataPath = path.join(rootDir, "data", "styles.json");
const previewRoot = path.join(rootDir, "public", "style-previews");
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

app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "prompt-gallery" });
});

app.get("/api/styles", async (_req, res) => {
  res.json(await readStyles());
});

app.post("/api/sync-miniprogram", async (_req, res) => {
  const styles = await readStyles();
  await syncMiniProgram(styles);
  res.json({ ok: true, count: styles.length });
});

app.post("/api/generate-image", upload.array("reference", 10), async (req, res) => {
  try {
    const prompt = String(req.body.prompt || "").trim();
    if (!prompt) return res.status(400).json({ message: "请先填写提示词。" });

    const apiKey = process.env.KUAIPAO_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey || apiKey === "your_openai_api_key_here" || apiKey === "your_kuaipao_api_key_here") {
      return res.status(400).json({ message: "请先在 .env 中配置 KUAIPAO_API_KEY 或 OPENAI_API_KEY。" });
    }
    const referenceFiles = req.files || [];
    if (referenceFiles.some((file) => file.mimetype === "image/svg+xml")) {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }

    const outputFormat = normalizeOption(req.body.output_format, ["png", "jpeg", "webp"], "png");
    const result = referenceFiles.length
      ? await createImageEdit(referenceFiles, prompt, outputFormat, apiKey, req.body)
      : await createImageGeneration(prompt, outputFormat, apiKey, req.body);

    res.json(result);
  } catch (error) {
    if (error.message === "UNSUPPORTED_IMAGE_TYPE") {
      return res.status(400).json({ message: "参考图仅支持 JPG、PNG 或 WebP 图片。" });
    }
    console.error(error);
    res.status(error.status || 500).json({ message: error.publicMessage || "生图失败，请稍后再试。" });
  }
});

app.post("/api/styles", async (req, res) => {
  const styles = await readStyles();
  const style = {
    id: `style_${Date.now()}`,
    tags: normalizeTags(req.body.tags).length ? normalizeTags(req.body.tags) : ["新风格"],
    image: "/style-previews/default/cover.svg",
    prompt: String(req.body.prompt || "在这里填写这个风格对应的提示词。").trim()
  };
  styles.unshift(style);
  await saveStyles(styles);
  res.status(201).json(style);
});

app.put("/api/styles/:id", async (req, res) => {
  const styles = await readStyles();
  const style = styles.find((item) => item.id === req.params.id);
  if (!style) return res.status(404).json({ message: "风格不存在。" });

  style.tags = normalizeTags(req.body.tags);
  style.prompt = String(req.body.prompt || "").trim();
  await saveStyles(styles);
  res.json(style);
});

app.delete("/api/styles/:id", async (req, res) => {
  const styles = await readStyles();
  const nextStyles = styles.filter((item) => item.id !== req.params.id);
  if (nextStyles.length === styles.length) return res.status(404).json({ message: "风格不存在。" });

  await saveStyles(nextStyles);
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
  readStyles()
    .then(syncMiniProgram)
    .then(() => console.log("Mini program files synced."))
    .catch((error) => console.error("Mini program sync failed.", error));
});

async function readStyles() {
  const styles = JSON.parse(await readFile(dataPath, "utf-8"));
  return styles.map((style) => ({
    id: style.id,
    tags: normalizeTags(style.tags?.length ? style.tags : [style.label, style.description]),
    image: style.image || "/style-previews/default/cover.svg",
    prompt: String(style.prompt || "")
  }));
}

async function createImageGeneration(prompt, outputFormat, apiKey, body) {
  const payload = {
    model: getImageModel(),
    prompt,
    size: normalizeSize(body.size),
    quality: normalizeOption(body.quality, ["low", "medium", "high", "auto"], "medium"),
    n: 1,
    output_format: outputFormat,
    background: normalizeOption(body.background, ["auto", "opaque", "transparent"], "auto"),
    moderation: normalizeOption(body.moderation, ["auto", "low"], "auto")
  };

  const response = await callKuaipaoImageApi("/images/generations", apiKey, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return formatImageResponse(response, outputFormat, "generation");
}

async function createImageEdit(files, prompt, outputFormat, apiKey, body) {
  const formData = new FormData();
  formData.append("model", getImageModel());
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

  const response = await callKuaipaoImageApi("/images/edits", apiKey, {
    method: "POST",
    body: formData
  });
  return formatImageResponse(response, outputFormat, "edit");
}

async function callKuaipaoImageApi(endpoint, apiKey, options) {
  const baseUrl = String(process.env.KUAIPAO_BASE_URL || "https://kuaipao.pro/v1").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeoutMs = normalizeTimeout(process.env.KUAIPAO_IMAGE_TIMEOUT_MS);
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
        ? `参考图编辑接口调用失败：${message}`
        : `生图接口调用失败：${message}`;
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

function getImageModel() {
  return String(process.env.OPENAI_IMAGE_MODEL || "gpt-image-2").trim() || "gpt-image-2";
}

function normalizeSize(value) {
  const size = String(value || "1024x1024").trim();
  if (size === "auto") return "auto";
  return /^\d{2,5}x\d{2,5}$/.test(size) ? size : "1024x1024";
}

function normalizeOption(value, allowed, fallback) {
  const item = String(value || fallback).trim();
  return allowed.includes(item) ? item : fallback;
}

function normalizeTimeout(value) {
  const timeout = Number(value || 300000);
  if (!Number.isFinite(timeout)) return 300000;
  return Math.min(Math.max(timeout, 60000), 900000);
}

async function saveStyles(styles) {
  await writeFile(dataPath, `${JSON.stringify(styles, null, 2)}\n`, "utf-8");
  await syncMiniProgram(styles);
}

async function syncMiniProgram(styles) {
  await mkdir(path.dirname(miniDataPath), { recursive: true });
  await mkdir(miniImageRoot, { recursive: true });
  const miniStyles = await Promise.all(
    styles.map(async (style) => {
      const miniImage = await ensureMiniImage(style);
      return {
        id: style.id,
        tags: normalizeTags(style.tags),
        image: miniImage,
        prompt: String(style.prompt || "")
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
