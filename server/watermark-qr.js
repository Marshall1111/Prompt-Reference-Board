// 预览水印右下角二维码：把 qrcode 生成的模块矩阵转成矢量路径，
// 与中文文案一样不依赖字体，任意预览尺寸下都能保持清晰。
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const QRCode = require("qrcode");

export const PUBLIC_PREVIEW_QR_ORIGIN = "https://www.petpaint.top/";

// 同一张图里 url 是固定的，按 url 缓存模块路径，避免每次生成预览都重算。
const QR_PATH_CACHE_LIMIT = 240;
const qrPathCache = new Map();

function buildQrPath(url) {
  const cached = qrPathCache.get(url);
  if (cached) return cached;

  // 用 L 级纠错换取更少的模块数，保证二维码在底栏这么小的尺寸下仍然可扫。
  const qr = QRCode.create(url, { errorCorrectionLevel: "L" });
  const moduleCount = qr.modules.size;
  const modules = qr.modules.data;
  let path = "";
  for (let y = 0; y < moduleCount; y += 1) {
    for (let x = 0; x < moduleCount; x += 1) {
      if (modules[y * moduleCount + x]) {
        path += `M${x} ${y}h1v1h-1z`;
      }
    }
  }

  const entry = { moduleCount, path };
  if (qrPathCache.size >= QR_PATH_CACHE_LIMIT) qrPathCache.clear();
  qrPathCache.set(url, entry);
  return entry;
}

// 扫码后直达该风格的“做同款”，并带上分享者的邀请码。
export function buildPublicPreviewQrUrl({ styleId = "", referralCode = "" } = {}) {
  const params = new URLSearchParams();
  const safeStyleId = String(styleId || "").trim();
  const safeReferralCode = String(referralCode || "").trim();
  if (safeStyleId) params.set("sameStyleId", safeStyleId);
  if (safeReferralCode) params.set("invite", safeReferralCode);
  const query = params.toString();
  return query ? `${PUBLIC_PREVIEW_QR_ORIGIN}?${query}` : PUBLIC_PREVIEW_QR_ORIGIN;
}

// 绘制白底方块 + 深色模块，quiet 为四周留白宽度（像素）。
export function renderPublicPreviewQr({ url, x, y, size, quiet, fill = "#0b0b0d" }) {
  const { moduleCount, path } = buildQrPath(String(url || PUBLIC_PREVIEW_QR_ORIGIN));
  const scale = Math.max(0.1, (size - quiet * 2) / moduleCount);
  return `
    <rect x="${x}" y="${y}" width="${size}" height="${size}" fill="#ffffff" />
    <path
      d="${path}"
      transform="translate(${x + quiet} ${y + quiet}) scale(${scale})"
      fill="${fill}"
    />`;
}
