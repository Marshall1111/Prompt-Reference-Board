// Generate built-in preset pages (color object cards + transport vehicle pages)
// with the project's image API, then write webp thumbnails with sharp.
// Usage: node tools/generate-body-book-preset-pages.mjs [providerId] [--keys=a,b,c]
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keysArg = process.argv.find((argument) => argument.startsWith("--keys="));
const requestedKeys = new Set(String(keysArg?.slice("--keys=".length) || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));

const sharp = (await import("sharp")).default;

// Mirrors getColorBookVisualDetails / buildColorObjectPagePrompt in server/index.js.
const colorDetails = {
  brown: { colorName: "brown", objects: "a brown teddy bear, acorn, chocolate biscuit, brown puppy toy, wooden block, and brown leaf" },
  gray: { colorName: "gray", objects: "a gray elephant toy, gray cloud, pebble, gray mouse toy, gray building block, and gray rain boot" },
  white: { colorName: "white", objects: "a white rabbit toy, sheep, cloud, moon, daisy, and white building block, each edged so it remains visible on white" }
};

function buildColorObjectPagePrompt(part) {
  const details = colorDetails[part.key];
  // 白色字在奶油色卡片上不可见，加描边要求以保证可读性；其余颜色与 server 提示词完全一致。
  const lettering = part.key === "white"
    ? `${details.colorName} lettering with a thin warm-gray outline so it remains visible`
    : `${details.colorName} lettering`;
  return `Create one square 1:1 static bilingual object-recognition page for a 0-3-year-old color book. Theme: ${part.chinese} / ${part.english}. Use a ${details.colorName} paper-texture outer background and a warm-cream rounded rectangle card with a hand-stitched ${details.colorName} dashed border. At the top render exactly: "${part.chinese}！" and "${part.english}!" in large rounded, highly legible ${lettering}. Show six simple, separated, easy-to-recognize ${details.colorName} objects in a tidy 3 by 2 grid: ${details.objects}. Each object must have a white sticker outline and a Chinese-and-English name label beneath it. Bright, soft, handmade cut-paper learning-card style; low contrast shadows; no baby, no people, no page number, no watermark, no border outside the card, and no unrelated colors as focal points.`;
}

// Matches the existing transport preset pages (white background, real studio-photo
// vehicle, red Chinese heading + warm-brown English sentence).
function buildTransportVehiclePagePrompt(part) {
  return `Create one square 1:1 static bilingual vehicle-recognition page for a 0-3-year-old transportation book. Theme: ${part.chinese} / ${part.english}. On a pure white background, show one real full-size ${part.subject} photographed in clean, bright studio style, centered, complete and immediately recognizable, with natural materials and realistic details. At the top render exactly two text labels and no other text: the Chinese label "这是${part.chinese}！" in large rounded, highly legible red lettering, and the English label "${part.sentence}" beneath it in warm-brown rounded type. Keep generous white space around the vehicle; nothing important touches or approaches the canvas edges. No baby, no people, no driver, no page number, no watermark, no border, no extra text, and no unrelated vehicles.`;
}

const colorParts = [
  { key: "white", chinese: "白色", english: "White", thumbnailSize: 384, outputSize: 1254 },
  { key: "brown", chinese: "棕色", english: "Brown", thumbnailSize: 384, outputSize: 1254 },
  { key: "gray", chinese: "灰色", english: "Gray", thumbnailSize: 384, outputSize: 1254 }
].filter((part) => !requestedKeys.size || requestedKeys.has(part.key));

const transportParts = [
  { key: "excavator", chinese: "挖掘机", english: "excavator", subject: "yellow hydraulic excavator with caterpillar tracks, a long digging arm, and a front bucket, shown in side view", sentence: "This is an excavator.", thumbnailSize: 640 },
  { key: "police-car", chinese: "警车", english: "police car", subject: "black-and-white police sedan with a red-and-blue light bar on the roof, shown in three-quarter side view", sentence: "This is a police car.", thumbnailSize: 640 },
  { key: "fire-truck", chinese: "消防车", english: "fire truck", subject: "red fire truck with a roof-mounted ladder and fire-service equipment, shown in side view", sentence: "This is a fire truck.", thumbnailSize: 640 }
].filter((part) => !requestedKeys.size || requestedKeys.has(part.key));

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const [key, ...values] = line.split("=");
    return [key, values.join("=").replace(/^['"]|['"]$/g, "")];
  }));
}

async function generateImage({ prompt, apiKey, baseUrl, model }) {
  const requestUrl = `${baseUrl.replace(/\/+$/, "")}/images/generations`;
  const buildBody = (size) => JSON.stringify({ model, prompt, size, quality: "high", n: 1, output_format: "png", background: "opaque", moderation: "auto" });
  // 优先请求 1536×1536 以获得更细腻的细节；提供商不支持时回退 1024×1024。
  let response = await fetch(requestUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: buildBody("1536x1536")
  });
  if (!response.ok) {
    response = await fetch(requestUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: buildBody("1024x1024")
    });
  }
  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new Error(`Image API returned HTTP ${response.status} with a non-JSON response: ${text.replace(/\s+/g, " ").slice(0, 300)}`);
    }
  }
  if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
  const image = payload?.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image?.url) {
    const imageResponse = await fetch(image.url);
    if (!imageResponse.ok) throw new Error(`无法下载图片结果：HTTP ${imageResponse.status}`);
    return Buffer.from(await imageResponse.arrayBuffer());
  }
  throw new Error("图片 API 未返回图片数据。");
}

const env = parseEnv(await readFile(path.join(rootDir, ".env"), "utf-8"));
const providerId = String(process.argv[2] || env.IMAGE_API_PROVIDER || "kuaipao").trim().toLowerCase();
const providerKey = providerId.replace(/[^a-z0-9]/g, "_").toUpperCase();
const apiKey = env[`IMAGE_API_${providerKey}_KEY`];
const baseUrl = env[`IMAGE_API_${providerKey}_BASE_URL`];
const model = env[`IMAGE_API_${providerKey}_MODEL`] || "gpt-image-2";
if (!apiKey || !baseUrl) throw new Error(`未找到 ${providerId} 的图片 API 配置。`);

const tasks = [
  ...colorParts.map((part) => ({
    name: `color ${part.key}`,
    prompt: buildColorObjectPagePrompt(part),
    output: path.join(rootDir, "public", "body-book-color-pages", `${part.key}-objects.png`),
    thumbnail: path.join(rootDir, "public", "body-book-color-pages", "thumbnails", `${part.key}-objects.webp`),
    thumbnailSize: part.thumbnailSize,
    outputSize: part.outputSize
  })),
  ...transportParts.map((part) => ({
    name: `transport ${part.key}`,
    prompt: buildTransportVehiclePagePrompt(part),
    output: path.join(rootDir, "public", "body-book-preset-pages", `transport-${part.key}.png`),
    thumbnail: path.join(rootDir, "public", "body-book-preset-pages", "thumbnails", `transport-${part.key}.webp`),
    thumbnailSize: part.thumbnailSize
  }))
];

await mkdir(path.join(rootDir, "public", "body-book-color-pages", "thumbnails"), { recursive: true });
await mkdir(path.join(rootDir, "public", "body-book-preset-pages", "thumbnails"), { recursive: true });

let succeeded = 0;
const concurrency = 2;
const queue = [...tasks];

async function runTask(task) {
  process.stdout.write(`Generating ${task.name}...\n`);
  try {
    let image = await generateImage({ prompt: task.prompt, apiKey, baseUrl, model });
    if (task.outputSize) {
      // 缩放到与现有内置页一致的尺寸（lanczos 平滑，避免锯齿感）。
      image = await sharp(image).resize(task.outputSize, task.outputSize, { kernel: "lanczos3" }).png().toBuffer();
    }
    await writeFile(task.output, image);
    await sharp(image).resize(task.thumbnailSize, task.thumbnailSize, { kernel: "lanczos3" }).webp({ quality: 82 }).toFile(task.thumbnail);
    succeeded += 1;
    process.stdout.write(`Succeeded ${task.name}\n`);
  } catch (error) {
    process.stdout.write(`Failed ${task.name}: ${error.message}\n`);
  }
}

async function worker() {
  while (queue.length) {
    const task = queue.shift();
    if (task) await runTask(task);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
process.stdout.write(`Done. ${succeeded}/${tasks.length} pages succeeded.\n`);
