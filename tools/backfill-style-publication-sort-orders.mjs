import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const stylePublicationDataPath = path.join(rootDir, "data", "style-publications.json");

const STYLE_PUBLICATION_TAGS = ["推荐", "儿童", "宠物", "旅行", "日常", "幽默"];

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

function getStylePublicationSort(publication, tag) {
  const value = Number(publication?.sortOrders?.[tag]);
  return Number.isFinite(value) && value > 0 ? value : null;
}

let changed = false;
let assigned = 0;

for (const tag of STYLE_PUBLICATION_TAGS) {
  const members = publications.filter((publication) => publication?.publicationId && Array.isArray(publication.tags) && publication.tags.includes(tag));
  if (!members.length) continue;
  const withRank = members.filter((publication) => getStylePublicationSort(publication, tag) !== null);
  const withoutRank = members.filter((publication) => getStylePublicationSort(publication, tag) === null);
  if (!withoutRank.length) continue;
  // 未设置排序的成员，按当前展示顺序（updatedAt 倒序，最新在前）依次排在已有排序之后。
  const order = withoutRank.sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
  let nextRank = withRank.reduce((max, publication) => Math.max(max, getStylePublicationSort(publication, tag)), 0);
  for (const publication of order) {
    publication.sortOrders = publication.sortOrders && typeof publication.sortOrders === "object" ? publication.sortOrders : {};
    publication.sortOrders[tag] = ++nextRank;
    changed = true;
    assigned += 1;
  }
}

if (changed) {
  await writeFile(stylePublicationDataPath, `${JSON.stringify(publications, null, 2)}\n`);
}

console.log(`Assigned ${assigned} sort position(s) across ${STYLE_PUBLICATION_TAGS.length} tags, wrote=${changed}.`);
