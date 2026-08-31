import path from "node:path";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const stylePublicationDataPath = path.join(rootDir, "data", "style-publications.json");
const stylePublicationRoot = path.join(rootDir, "public", "style-publications");
const STYLE_GRID_PREVIEW_MAX_EDGE = 640;

const sharp = await loadSharpModule();

if (!sharp) {
  console.error("sharp is not installed. Run `npm install` first, then rerun `npm run backfill:style-previews`.");
  process.exit(1);
}

let publications = [];
try {
  const raw = await readFile(stylePublicationDataPath, "utf-8");
  publications = JSON.parse(raw.replace(/\\n\s*$/, "\n"));
} catch (error) {
  if (error.code === "ENOENT") {
    console.error(`Missing ${stylePublicationDataPath}`);
    process.exit(1);
  }
  throw error;
}

if (!Array.isArray(publications)) {
  console.error("style-publications.json 不是数组，已中止。");
  process.exit(1);
}

let updated = 0;
let created = 0;
let skipped = 0;

for (const publication of publications) {
  if (!publication?.publicationId || !publication?.effectImageUrl) continue;
  const effectPath = toEffectFilePath(publication.effectImageUrl);
  if (!effectPath || !(await fileExists(effectPath))) {
    skipped += 1;
    continue;
  }

  const publicationDir = path.join(stylePublicationRoot, publication.publicationId);
  const outputPath = path.join(publicationDir, "effect-small.webp");
  const url = `/style-publications/${publication.publicationId}/effect-small.webp`;

  let info = null;
  if (await shouldRegenerate(effectPath, outputPath)) {
    const sourceBuffer = await readFile(effectPath);
    const transformed = await sharp(sourceBuffer, { animated: false })
      .rotate()
      .resize({
        width: STYLE_GRID_PREVIEW_MAX_EDGE,
        height: STYLE_GRID_PREVIEW_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transformed.data);
    info = transformed.info || null;
    created += 1;
  } else {
    info = await sharp(outputPath).metadata();
  }

  const width = Number(info?.width || 0) || null;
  const height = Number(info?.height || 0) || null;
  const nextGridUrl = String(publication.effectGridImageUrl || "");
  const nextWidth = Number(publication.effectGridWidth || 0) || null;
  const nextHeight = Number(publication.effectGridHeight || 0) || null;

  if (nextGridUrl === url && nextWidth === width && nextHeight === height) {
    skipped += 1;
    continue;
  }

  publication.effectGridImageUrl = url;
  publication.effectGridWidth = width;
  publication.effectGridHeight = height;
  updated += 1;
}

if (updated > 0) {
  await writeFile(stylePublicationDataPath, `${JSON.stringify(publications, null, 2)}\n`);
}

console.log(`Generated ${created} preview file(s), patched ${updated} publication(s), skipped ${skipped}.`);

function toEffectFilePath(url) {
  const text = String(url || "");
  if (!text.startsWith("/style-publications/")) return "";
  const parts = text.split("/").filter(Boolean);
  if (parts.length < 2) return "";
  return path.join(stylePublicationRoot, parts[1], path.basename(text));
}

async function shouldRegenerate(sourcePath, outputPath) {
  if (!(await fileExists(outputPath))) return true;
  const [sourceInfo, targetInfo] = await Promise.all([stat(sourcePath), stat(outputPath)]);
  return sourceInfo.mtimeMs > targetInfo.mtimeMs;
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadSharpModule() {
  try {
    const module = await import("sharp");
    return module.default || module;
  } catch {
    return null;
  }
}
