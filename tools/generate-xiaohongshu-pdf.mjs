import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(rootDir, "docs", "小红书推广文案合集.html");
const outputPath = path.join(rootDir, "docs", "小红书推广文案合集.pdf");
const html = fs.readFileSync(sourcePath, "utf8");

function plain(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/😂/g, "")
    .trim();
}

function matchOne(source, expression) {
  return expression.exec(source)?.[1] || "";
}

const cards = [...html.matchAll(/<article class="card">([\s\S]*?)<\/article>/g)].map((match) => {
  const card = match[1];
  const title = plain(matchOne(card, /<h3>([\s\S]*?)<\/h3>/));
  const copy = plain(matchOne(card, /<p class="copy">([\s\S]*?)<\/p>/));
  const image = plain(matchOne(card, /<div class="label">配图建议<\/div><p>([\s\S]*?)<\/p>/));
  const tags = plain(matchOne(card, /<p class="tags">([\s\S]*?)<\/p>/));
  return { title, copy, image, tags };
});

function splitLine(line, maxChars = 33) {
  const parts = [];
  let current = "";
  for (const char of line) {
    if (current.length >= maxChars && /[，。；：、,.!！?？]/.test(char)) {
      parts.push(current + char);
      current = "";
    } else if (current.length >= maxChars) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  if (current) parts.push(current);
  return parts.length ? parts : [""];
}

function wrap(text, maxChars) {
  return text.split("\n").flatMap((line) => splitLine(line, maxChars));
}

function utf16Hex(text) {
  const buffer = Buffer.from(String(text), "utf16le");
  for (let index = 0; index < buffer.length; index += 2) {
    const next = buffer[index];
    buffer[index] = buffer[index + 1];
    buffer[index + 1] = next;
  }
  return buffer.toString("hex").toUpperCase();
}

function textCommand(text, x, y, size, color = "0.16 0.14 0.12") {
  return `BT /F1 ${size} Tf ${color} rg 1 0 0 1 ${x} ${y} Tm <${utf16Hex(text)}> Tj ET\n`;
}

function pageCommands(entries, chapter) {
  let y = 790;
  let content = "q 0.99 0.975 0.95 rg 0 0 595 842 re f Q\n";
  content += textCommand(chapter, 48, y, 19, "0.52 0.29 0.19");
  y -= 25;
  content += "q 0.79 0.52 0.39 rg 48 " + y + " 499 1 re f Q\n";
  y -= 22;

  entries.forEach((entry, index) => {
    const copyLines = wrap(entry.copy, 39);
    const imageLines = wrap(entry.image, 43);
    const needed = 38 + copyLines.length * 15 + 20 + imageLines.length * 14 + 28;
    if (y - needed < 50 && index > 0) return;
    content += "q 1 1 1 rg 48 " + (y - needed + 8) + " 499 " + (needed - 3) + " re f Q\n";
    content += "q 0.91 0.85 0.79 RG 0.8 w 48 " + (y - needed + 8) + " 499 " + (needed - 3) + " re S Q\n";
    content += textCommand(entry.title, 61, y - 18, 13, "0.34 0.19 0.13");
    y -= 42;
    content += textCommand("发布文案", 61, y, 9, "0.60 0.38 0.27");
    y -= 16;
    copyLines.forEach((line) => { content += textCommand(line, 61, y, 10.5); y -= 15; });
    y -= 3;
    content += textCommand("配图建议", 61, y, 9, "0.60 0.38 0.27");
    y -= 15;
    imageLines.forEach((line) => { content += textCommand(line, 61, y, 9.8); y -= 14; });
    y -= 2;
    content += textCommand(entry.tags, 61, y, 8.7, "0.43 0.38 0.34");
    y -= 28;
  });
  return content;
}

const pages = [];
pages.push("q 1 0.96 0.91 rg 0 0 595 842 re f Q\n" +
  textCommand("XIAOHONGSHU CONTENT KIT", 62, 693, 10, "0.60 0.38 0.27") +
  textCommand("小红书推广文案合集", 62, 621, 29, "0.24 0.16 0.12") +
  textCommand("照片定制冰箱贴 × 宝宝专属认知书", 62, 578, 15, "0.36 0.29 0.24") +
  textCommand("24 条可直接发布的文案与配图建议", 62, 549, 12, "0.36 0.29 0.24") +
  textCommand("建议按每周 3 条的节奏分批发布，并替换为真实原图、", 62, 169, 10, "0.45 0.37 0.32") +
  textCommand("成品图和已获授权的用户反馈。", 62, 151, 10, "0.45 0.37 0.32"));

function appendChapter(title, entries) {
  for (let index = 0; index < entries.length; index += 2) {
    pages.push(pageCommands(entries.slice(index, index + 2), title));
  }
}

appendChapter("第一章｜照片定制冰箱贴", cards.slice(0, 12));
appendChapter("第二章｜宝宝专属认知书", cards.slice(12, 24));

const objects = [];
function addObject(value) {
  objects.push(Buffer.isBuffer(value) ? value : Buffer.from(value, "binary"));
  return objects.length;
}

const pagesObject = addObject("");
const descendantFont = addObject("<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> /DW 1000 >>");
const fontObject = addObject(`<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [${descendantFont} 0 R] >>`);
const catalogObject = addObject(`<< /Type /Catalog /Pages ${pagesObject} 0 R >>`);
const pageIds = [];

for (const commands of pages) {
  const commandBuffer = Buffer.from(commands, "binary");
  const contentObject = addObject(Buffer.concat([Buffer.from(`<< /Length ${commandBuffer.length} >>\nstream\n`, "binary"), commandBuffer, Buffer.from("endstream", "binary")]));
  const pageObject = addObject(`<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`);
  pageIds.push(pageObject);
}

objects[pagesObject - 1] = Buffer.from(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`, "binary");

const chunks = [Buffer.from("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n", "binary")];
const offsets = [0];
let length = chunks[0].length;
objects.forEach((object, index) => {
  offsets[index + 1] = length;
  const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`, "binary"), object, Buffer.from("\nendobj\n", "binary")]);
  chunks.push(part);
  length += part.length;
});
const xrefOffset = length;
let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (let index = 1; index <= objects.length; index += 1) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObject} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
chunks.push(Buffer.from(xref, "binary"));
fs.writeFileSync(outputPath, Buffer.concat(chunks));
console.log(`Generated ${outputPath} with ${pages.length} pages and ${cards.length} entries.`);
