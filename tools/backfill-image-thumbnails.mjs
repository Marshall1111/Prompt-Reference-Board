import path from "node:path";
import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const jobsRoot = path.join(rootDir, "data", "image-jobs");
const publicRoot = path.join(rootDir, "public");
const generatedThumbnailRoot = path.join(publicRoot, "generated-thumbnails");
const jobReferenceThumbnailRoot = path.join(publicRoot, "job-reference-thumbnails");
const RESULT_THUMBNAIL_MAX_EDGE = 384;
const REFERENCE_THUMBNAIL_MAX_EDGE = 240;

const sharp = await loadSharpModule();

if (!sharp) {
  console.error("sharp is not installed. Run `npm install` first, then rerun `npm run backfill:thumbnails`.");
  process.exit(1);
}

await mkdir(generatedThumbnailRoot, { recursive: true });
await mkdir(jobReferenceThumbnailRoot, { recursive: true });

const entries = await readdir(jobsRoot, { withFileTypes: true });
let updatedJobs = 0;
let resultThumbs = 0;
let referenceThumbs = 0;

for (const entry of entries) {
  if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

  const jobPath = path.join(jobsRoot, entry.name);
  const job = JSON.parse(await readFile(jobPath, "utf-8"));
  let changed = false;

  if (job?.jobId && job?.result?.imageUrl) {
    const resultThumb = await ensureGeneratedThumbnail(job.jobId, job.result.imageUrl);
    if (resultThumb && syncResultThumbnail(job.result, resultThumb)) {
      changed = true;
      resultThumbs += 1;
    }
  }

  if (Array.isArray(job?.originalReferences) && job?.jobId) {
    for (const reference of job.originalReferences) {
      const referenceThumb = await ensureReferenceThumbnail(job.jobId, reference?.url);
      if (referenceThumb && syncReferenceThumbnail(reference, referenceThumb)) {
        changed = true;
        referenceThumbs += 1;
      }
    }
  }

  if (changed) {
    await writeFile(jobPath, `${JSON.stringify(job, null, 2)}\n`);
    updatedJobs += 1;
  }
}

console.log(`Updated ${updatedJobs} job file(s), ${resultThumbs} result thumbnail(s), ${referenceThumbs} reference thumbnail(s).`);

async function ensureGeneratedThumbnail(jobId, imageUrl) {
  const sourcePath = toPublicFilePath(imageUrl);
  if (!sourcePath) return null;

  return ensureThumbnail({
    sourcePath,
    outputPath: path.join(generatedThumbnailRoot, `${jobId}.webp`),
    url: `/generated-thumbnails/${jobId}.webp`,
    maxEdge: RESULT_THUMBNAIL_MAX_EDGE
  });
}

async function ensureReferenceThumbnail(jobId, referenceUrl) {
  const sourcePath = toPublicFilePath(referenceUrl);
  const fileName = path.basename(String(referenceUrl || ""));
  const baseName = path.basename(fileName, path.extname(fileName));
  if (!sourcePath || !baseName) return null;

  return ensureThumbnail({
    sourcePath,
    outputPath: path.join(jobReferenceThumbnailRoot, String(jobId), `${baseName}.webp`),
    url: `/job-reference-thumbnails/${jobId}/${baseName}.webp`,
    maxEdge: REFERENCE_THUMBNAIL_MAX_EDGE
  });
}

async function ensureThumbnail({ sourcePath, outputPath, url, maxEdge }) {
  let outputInfo = null;

  if (!(await fileExists(sourcePath))) return null;
  if (path.extname(sourcePath).toLowerCase() === ".svg") return null;

  await mkdir(path.dirname(outputPath), { recursive: true });

  if (await shouldRegenerate(sourcePath, outputPath)) {
    const sourceBuffer = await readFile(sourcePath);
    const transformed = await sharp(sourceBuffer, { animated: false })
      .rotate()
      .resize({
        width: maxEdge,
        height: maxEdge,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true });

    await writeFile(outputPath, transformed.data);
    outputInfo = transformed.info || null;
  } else {
    outputInfo = await sharp(outputPath).metadata();
  }

  return {
    url,
    width: Number(outputInfo?.width || 0) || null,
    height: Number(outputInfo?.height || 0) || null
  };
}

function syncResultThumbnail(result, thumbnail) {
  const nextUrl = String(thumbnail.url || "");
  const nextWidth = Number(thumbnail.width || 0) || null;
  const nextHeight = Number(thumbnail.height || 0) || null;

  if (
    String(result.thumbnailUrl || "") === nextUrl &&
    (Number(result.thumbnailWidth || 0) || null) === nextWidth &&
    (Number(result.thumbnailHeight || 0) || null) === nextHeight
  ) {
    return false;
  }

  result.thumbnailUrl = nextUrl;
  result.thumbnailWidth = nextWidth;
  result.thumbnailHeight = nextHeight;
  return true;
}

function syncReferenceThumbnail(reference, thumbnail) {
  const nextUrl = String(thumbnail.url || "");
  const nextWidth = Number(thumbnail.width || 0) || null;
  const nextHeight = Number(thumbnail.height || 0) || null;

  if (
    String(reference.thumbnailUrl || "") === nextUrl &&
    (Number(reference.thumbnailWidth || 0) || null) === nextWidth &&
    (Number(reference.thumbnailHeight || 0) || null) === nextHeight
  ) {
    return false;
  }

  reference.thumbnailUrl = nextUrl;
  reference.thumbnailWidth = nextWidth;
  reference.thumbnailHeight = nextHeight;
  return true;
}

function toPublicFilePath(url) {
  const text = String(url || "");
  const relative = text.replace(/^\/+/, "");

  if (!text.startsWith("/")) return "";
  if (!text.startsWith("/generated-images/") && !text.startsWith("/job-references/")) return "";

  return path.join(publicRoot, relative);
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
