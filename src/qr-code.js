import QRCode from "qrcode";
import SvgRenderer from "qrcode/lib/renderer/svg-tag.js";

function normalizeOptions(options = {}) {
  return {
    errorCorrectionLevel: options.errorCorrectionLevel || "M",
    margin: Math.max(0, Number(options.margin ?? 4)),
    color: {
      dark: options.dark || "#000000",
      light: options.light || "#ffffff"
    }
  };
}

function downloadBlob(blob, filename) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export function createQrSvgMarkup(text, options = {}) {
  return SvgRenderer.render(QRCode.create(String(text || ""), normalizeOptions(options)), normalizeOptions(options));
}

export function createQrSvgDataUrl(text, options = {}) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createQrSvgMarkup(text, options))}`;
}

export async function downloadQrSvg(text, filename, options = {}) {
  const svgMarkup = createQrSvgMarkup(text, options);
  const blob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

export async function downloadQrPng(text, filename, options = {}) {
  const dataUrl = await QRCode.toDataURL(String(text || ""), {
    ...normalizeOptions(options),
    type: "png",
    width: Math.max(512, Number(options.pixelSize || 1024))
  });
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  downloadBlob(blob, filename);
}

function loadDataUrlImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("生成二维码图片失败。"));
    image.src = dataUrl;
  });
}

function splitCaptionLines(context, text, maxWidth) {
  const characters = Array.from(String(text || "").trim());
  if (!characters.length) return [];
  const lines = [];
  let current = "";
  characters.forEach((character) => {
    const next = `${current}${character}`;
    if (current && context.measureText(next).width > maxWidth) {
      lines.push(current);
      current = character;
    } else {
      current = next;
    }
  });
  if (current) lines.push(current);
  return lines;
}

export async function downloadLabeledQrPng(text, label, filename, options = {}) {
  const pixelSize = Math.max(512, Number(options.pixelSize || 1024));
  const outerPadding = Math.round(pixelSize * 0.055);
  const qrSize = pixelSize - outerPadding * 2;
  const fontSize = Math.max(22, Math.round(pixelSize * 0.043));
  const lineHeight = Math.round(fontSize * 1.45);
  const captionTop = Math.round(pixelSize * 0.025);
  const captionBottom = Math.round(pixelSize * 0.055);
  const qrDataUrl = await QRCode.toDataURL(String(text || ""), {
    ...normalizeOptions(options),
    type: "png",
    width: qrSize
  });
  const qrImage = await loadDataUrlImage(qrDataUrl);
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("浏览器不支持生成风格码。");
  measureContext.font = `600 ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  const lines = splitCaptionLines(measureContext, label, pixelSize - outerPadding * 2);
  const captionHeight = lines.length ? captionTop + lineHeight * lines.length + captionBottom : 0;
  const canvas = document.createElement("canvas");
  canvas.width = pixelSize;
  canvas.height = pixelSize + captionHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器不支持生成风格码。");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(qrImage, outerPadding, outerPadding, qrSize, qrSize);
  if (lines.length) {
    context.fillStyle = "#202020";
    context.font = `600 ${fontSize}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "top";
    lines.forEach((line, index) => context.fillText(line, pixelSize / 2, pixelSize + captionTop + lineHeight * index));
  }
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("生成风格码失败。"))), "image/png");
  });
  downloadBlob(blob, filename);
}
