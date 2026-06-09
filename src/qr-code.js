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
