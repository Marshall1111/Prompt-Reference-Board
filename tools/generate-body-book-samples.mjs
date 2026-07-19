import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutputDir = path.join(rootDir, "public", "body-book-samples");
const defaultReferencePath = path.join(rootDir, "data", "body-book-sample-reference.png");
const outputArg = process.argv.find((argument) => argument.startsWith("--output="));
const referenceArg = process.argv.find((argument) => argument.startsWith("--reference="));
const limitArg = process.argv.find((argument) => argument.startsWith("--limit="));
const outputDir = outputArg ? path.resolve(rootDir, outputArg.slice("--output=".length)) : defaultOutputDir;
const referencePath = referenceArg ? path.resolve(referenceArg.slice("--reference=".length)) : defaultReferencePath;

const themes = [
  { id: "body", name: "身体认知书", englishName: "My First Body", title: "我的第一本身体认知书", part: { chinese: "头部", english: "Head", copy: "This is my head. 这是我的头部。" } },
  { id: "career", name: "职业认知书", englishName: "My First Jobs", title: "我的第一本职业认知书", part: { chinese: "医生", english: "Doctor", copy: "I can be a Doctor. 我可以成为医生。" } },
  { id: "color", name: "颜色认知书", englishName: "My First Colors", title: "我的第一本颜色认知书", part: { chinese: "红色", english: "Red", copy: "This is Red. 这是红色。" } },
  { id: "emotion", name: "情绪认知书", englishName: "My First Feelings", title: "我的第一本情绪认知书", part: { chinese: "开心", english: "Happy", copy: "I feel Happy. 我感到开心。" } },
  { id: "transport", name: "交通工具认知书", englishName: "My First Vehicles", title: "我的第一本交通工具认知书", part: { chinese: "汽车", english: "Car", copy: "This is a Car. 这是一辆汽车。" } },
  { id: "animal", name: "动物认知书", englishName: "My First Animals", title: "我的第一本动物认知书", part: { chinese: "小猫", english: "Cat", copy: "Hello, Cat! 你好，小猫！" } },
  { id: "daily", name: "日常行为认知书", englishName: "My First Daily Routines", title: "我的第一本日常行为认知书", part: { chinese: "起床", english: "Wake Up", copy: "I can wake up. 我会起床。" } }
];

const profiles = {
  body: { coverScene: "the baby naturally pointing to or touching several body-part cues, with a few restrained arrows and tiny learning markers", cardScene: "a close, natural baby pose in which the requested body part is unmistakably visible; use one restrained dotted arrow to that body part", accents: "warm cream, sage green, and soft apricot", icons: "simple body-part learning symbols" },
  career: { coverScene: "the baby in one charming, soft-fabric career outfit, with a small matching prop and a few floating career symbols", cardScene: "the baby in a child-safe, soft-fabric version of the requested profession's outfit, doing one natural action with one simple matching prop", accents: "soft sky blue, coral, sunny yellow, and warm cream", icons: "small career tools and symbols" },
  color: { coverScene: "the baby surrounded by six clearly separated, floating everyday objects in different natural rainbow colors, each with generous white space", cardScene: "the baby interacting with one clearly recognizable object in the requested color; the color must be dominant, natural, and easy to identify", accents: "the requested color with warm cream and a complementary pastel accent", icons: "simple color swatches and matching everyday objects" },
  emotion: { coverScene: "a warm, expressive baby portrait with a small, calm ring of simple emotion symbols around the baby", cardScene: "a close baby portrait showing the requested emotion clearly and gently through facial expression and natural pose; no exaggerated or distressing expression", accents: "soft peach, butter yellow, pale blue, and warm cream", icons: "small, friendly emotion symbols such as stars, clouds, hearts, or smile marks" },
  transport: { coverScene: "the baby with six clearly separated toy-like vehicles floating on a white page, with no road scene or cluttered environment", cardScene: "the baby naturally engaging with one clearly recognizable requested vehicle, presented as a simple toy-like cutout object on a white page", accents: "soft primary colors, pale blue, and warm cream", icons: "small transport symbols and movement marks" },
  animal: { coverScene: "the baby surrounded by six friendly, clearly separated animal illustrations or toy-like animal cutouts with generous white space", cardScene: "the baby gently engaging with one friendly, child-safe requested animal illustration or toy-like animal cutout; keep the animal easy to recognize", accents: "leaf green, sunshine yellow, pale blue, and warm cream", icons: "small animal footprints, leaves, and matching nature symbols" },
  daily: { coverScene: "the baby in a cheerful everyday moment, surrounded by six clearly separated daily-routine objects floating on a white page", cardScene: "the baby doing the requested daily routine in a simple, safe, natural action; show only a few clearly separated matching objects and no realistic room scene", accents: "soft pastel blue, peach, butter yellow, and warm cream", icons: "small daily-routine objects and gentle action marks" }
};

function coverPrompt(theme) {
  const profile = profiles[theme.id];
  return `Use the uploaded baby photo as the only identity reference. Preserve the baby's facial features, skin tone, age impression, and natural hair. Create one square 1:1 cover for a bilingual 0-3 year-old ${theme.name}. The main title should read exactly: "${theme.englishName}". The Chinese subtitle should read exactly: "${theme.title}". Beneath it, add the small English line: "A Bilingual Book for Babies" and the small Chinese line: "中英双语 · 0-3岁宝宝启蒙". Use rounded, highly legible sans-serif typography; make the English title playful with a refined natural rainbow palette, while keeping Chinese text dark and clear. Add a small pink circular badge in the upper-right that reads "0-3岁适用". Compose the baby as the clear central subject in a realistic, detailed professional baby portrait with soft warm daylight and natural skin texture. Theme scene: ${profile.coverScene}. Use a clean white or warm-cream studio page, ${profile.accents} accents, ample breathing room, subtle paper texture, and a few neat cutout-style elements with fine white outlines. DK children's encyclopedia style: premium early-learning editorial layout, white-background cutout-object collage composition, realistic baby photography blended with restrained children's illustration, bright but gentle, clean and modern. Do not create a busy room, scenic background, deep depth, extra people, watermark, border, illegible decorative text, collage panels, or 3D animation look.`;
}

function cardPrompt(theme) {
  const { part } = theme;
  const profile = profiles[theme.id];
  return `Use the uploaded baby photo as the only identity reference. Preserve the baby's facial features, skin tone, age impression, and natural hair. Create one square 1:1 bilingual ${theme.name} learning card for ages 0-3. This is page 1; the sole learning concept is "${part.english} / ${part.chinese}". The image must attempt to render this heading exactly: "${part.chinese} ${part.english}". Include this short bilingual sentence exactly: "${part.copy}". Add page number "1" in the lower-right. Make the requested concept immediate and unmistakable; do not introduce competing learning concepts. Theme scene: ${profile.cardScene}. Keep the same baby recognizable in a natural, age-appropriate pose. Use a white or warm-cream page, ${profile.accents} accents, soft warm natural light, natural skin texture, and generous white space. Add one clear dotted arrow or visual cue pointing to the requested concept, plus only one or two small matching ${profile.icons}. Use clean black or deep-charcoal rounded sans-serif type, with the learning word larger than the supporting sentence. DK children's encyclopedia style: white-background cutout-object collage composition, realistic baby photography blended with subtle cutout illustration, thin white outlines, a soft paper texture, gentle bright color, and no harsh shadows. No extra people, no busy room, no scenic environment, no deep background, no watermark, no border, no collage panels, no unrelated objects, no unreadable decorative text, and no 3D animation look.`;
}

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).map((line) => {
    const [key, ...values] = line.split("=");
    return [key, values.join("=").replace(/^['"]|['"]$/g, "")];
  }));
}

async function generateImage({ prompt, referenceBytes, apiKey, baseUrl, model }) {
  const form = new FormData();
  form.append("model", model);
  form.append("prompt", prompt);
  form.append("size", "1024x1024");
  form.append("quality", "medium");
  form.append("n", "1");
  form.append("output_format", "png");
  form.append("background", "opaque");
  form.append("moderation", "auto");
  form.append("image", new Blob([referenceBytes], { type: "image/png" }), "baby-reference.png");
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/images/edits`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `HTTP ${response.status}`);
  const image = payload?.data?.[0];
  if (image?.b64_json) return Buffer.from(image.b64_json, "base64");
  if (image?.url) {
    const imageResponse = await fetch(image.url);
    if (!imageResponse.ok) throw new Error(`无法下载图片结果：HTTP ${imageResponse.status}`);
    return Buffer.from(await imageResponse.arrayBuffer());
  }
  throw new Error("快跑 API 未返回图片数据。");
}

const env = parseEnv(await readFile(path.join(rootDir, ".env"), "utf-8"));
const providerId = String(process.argv[2] || env.IMAGE_API_PROVIDER || "kuaipao").trim().toLowerCase();
const providerKey = providerId.replace(/[^a-z0-9]/g, "_").toUpperCase();
const apiKey = env[`IMAGE_API_${providerKey}_KEY`];
const baseUrl = env[`IMAGE_API_${providerKey}_BASE_URL`];
const model = env[`IMAGE_API_${providerKey}_MODEL`] || "gpt-image-2";
if (!apiKey || !baseUrl) throw new Error(`未找到 ${providerId} 的图片 API 配置。`);

const referenceBytes = await readFile(referencePath);
await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
const manifest = { generatedAt: new Date().toISOString(), provider: providerId, model, reference: path.relative(rootDir, referencePath), samples: [] };
const requestedLimit = Number(limitArg?.slice("--limit=".length) || 0);
const tasks = themes.flatMap((theme) => [["cover", coverPrompt(theme)], ["page-01", cardPrompt(theme)]].map(([kind, prompt]) => ({ theme, kind, prompt }))).slice(0, Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : undefined);
const concurrency = 2;

async function runTask({ theme, kind, prompt }) {
  const filename = `${theme.id}-${kind}.png`;
  process.stdout.write(`Generating ${theme.id} ${kind}...\n`);
  try {
    const image = await generateImage({ prompt, referenceBytes, apiKey, baseUrl, model });
    await writeFile(path.join(outputDir, filename), image);
    manifest.samples.push({ themeId: theme.id, kind, title: kind === "cover" ? `${theme.englishName} cover` : `${theme.part.chinese} ${theme.part.english}`, file: `/body-book-samples/${filename}`, prompt, status: "succeeded" });
    process.stdout.write(`Succeeded ${theme.id} ${kind}\n`);
  } catch (error) {
    manifest.samples.push({ themeId: theme.id, kind, status: "failed", error: error.message, prompt });
    process.stdout.write(`Failed ${theme.id} ${kind}: ${error.message}\n`);
  }
}

async function worker() {
  while (tasks.length) {
    const task = tasks.shift();
    if (task) await runTask(task);
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));

await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Done. ${manifest.samples.filter((item) => item.status === "succeeded").length}/${manifest.samples.length} samples succeeded.\n`);
