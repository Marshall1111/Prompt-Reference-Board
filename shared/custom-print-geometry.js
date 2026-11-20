export const PAPER = Object.freeze({ widthMm: 100, heightMm: 148, dpi: 300 });
export const CUSTOM_LAYOUT_MODE = "custom-sheet-v1";
export const GUIDE_COLOR = "#BEBEBE";
export const GUIDE_WIDTH_MM = 2 * 25.4 / PAPER.dpi;
export const mmToPixels = (mm) => Math.round(mm / 25.4 * PAPER.dpi);
export const normalizeAngle = (angle) => ((angle % 360) + 360) % 360;

export function corners(item) {
  const a = item.rotationDeg * Math.PI / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => ({
    x: item.centerXmm + x * item.widthMm / 2 * c - y * item.heightMm / 2 * s,
    y: item.centerYmm + x * item.widthMm / 2 * s + y * item.heightMm / 2 * c
  }));
}

export function overlaps(a, b) {
  const pa = corners(a), pb = corners(b);
  for (const p of [pa, pb]) {
    for (let i = 0; i < 2; i++) {
      const edge = { x: p[i + 1].x - p[i].x, y: p[i + 1].y - p[i].y };
      const length = Math.hypot(edge.x, edge.y);
      const axis = { x: -edge.y / length, y: edge.x / length };
      const project = (points) => points.map((v) => v.x * axis.x + v.y * axis.y);
      const ap = project(pa), bp = project(pb);
      if (Math.max(...ap) <= Math.min(...bp) + 1e-7 || Math.max(...bp) <= Math.min(...ap) + 1e-7) return false;
    }
  }
  return true;
}

export function placementError(item, items) {
  if (corners(item).some((p) => p.x < -1e-7 || p.y < -1e-7 || p.x > PAPER.widthMm + 1e-7 || p.y > PAPER.heightMm + 1e-7)) return "图片超出相纸边缘";
  if (items.some((other) => other.id !== item.id && overlaps(item, other))) return "图片不能重叠";
  return "";
}

// Intersect an infinite edge line with the physical paper rectangle.
export function edgeGuides(item) {
  const points = corners(item);
  return points.map((p, i) => {
    const q = points[(i + 1) % 4], dx = q.x - p.x, dy = q.y - p.y;
    let lo = -Infinity, hi = Infinity;
    for (const [origin, delta, max] of [[p.x, dx, PAPER.widthMm], [p.y, dy, PAPER.heightMm]]) {
      if (Math.abs(delta) < 1e-10) {
        if (origin < -1e-7 || origin > max + 1e-7) return null;
      } else {
        const t0 = -origin / delta, t1 = (max - origin) / delta;
        lo = Math.max(lo, Math.min(t0, t1)); hi = Math.min(hi, Math.max(t0, t1));
      }
    }
    return lo <= hi ? { x1: p.x + lo * dx, y1: p.y + lo * dy, x2: p.x + hi * dx, y2: p.y + hi * dy } : null;
  }).filter(Boolean);
}

export function validateLayout(input, assets) {
  if (!Array.isArray(input?.items) || !input.items.length || input.items.length > 24) throw new Error("每页需要1～24张图片");
  const ids = new Set(), sourceIds = new Set();
  const items = input.items.map((value) => {
    if (typeof value.id !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id) || ids.has(value.id)) throw new Error("图片实例编号无效或重复");
    ids.add(value.id); sourceIds.add(value.assetId);
    const asset = assets.get(value.assetId);
    if (!asset) throw new Error("图片不存在或不属于当前店铺");
    const item = { id: value.id, assetId: value.assetId };
    for (const key of ["widthMm", "heightMm", "centerXmm", "centerYmm", "rotationDeg"]) {
      if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error("尺寸、位置和角度必须是有效数字");
      item[key] = value[key];
    }
    if (item.widthMm < 0.1 || item.heightMm < 0.1 || item.widthMm > 180 || item.heightMm > 180) throw new Error("图片尺寸不适合当前相纸");
    item.rotationDeg = normalizeAngle(item.rotationDeg);
    const crop = value.crop;
    if (!crop || ["x", "y", "width", "height"].some((key) => typeof crop[key] !== "number" || !Number.isFinite(crop[key])) || crop.x < 0 || crop.y < 0 || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1 + 1e-7 || crop.y + crop.height > 1 + 1e-7) throw new Error("裁切区域无效");
    const ratio = crop.width * asset.width / (crop.height * asset.height);
    if (Math.abs(ratio / (item.widthMm / item.heightMm) - 1) > 0.005) throw new Error("裁切比例与打印尺寸不一致");
    item.crop = { x: crop.x, y: crop.y, width: crop.width, height: crop.height };
    return item;
  });
  if (sourceIds.size > 10) throw new Error("每页最多10张源图");
  for (const item of items) { const error = placementError(item, items); if (error) throw new Error(error); }
  return { paper: PAPER, items };
}

export function findPlacement(item, others) {
  for (const rotationDeg of [item.rotationDeg, normalizeAngle(item.rotationDeg + 90)]) {
    const candidate = { ...item, rotationDeg, centerXmm: 50, centerYmm: 74 };
    if (!placementError(candidate, others)) return candidate;
    const pts = corners({ ...candidate, centerXmm: 0, centerYmm: 0 });
    const halfW = Math.max(...pts.map((p) => Math.abs(p.x))), halfH = Math.max(...pts.map((p) => Math.abs(p.y)));
    for (let y = halfH; y <= 148 - halfH + 1e-7; y += 1) {
      for (let x = halfW; x <= 100 - halfW + 1e-7; x += 1) {
        const placed = { ...candidate, centerXmm: x, centerYmm: y };
        if (!placementError(placed, others)) return placed;
      }
    }
  }
  return null;
}

// Crop rectangle in normalized, EXIF-corrected source coordinates.
export function cropFromTransform(frame, image, transform) {
  return {
    x: (image.width * transform.scale / 2 - frame.width / 2 - transform.x) / (image.width * transform.scale),
    y: (image.height * transform.scale / 2 - frame.height / 2 - transform.y) / (image.height * transform.scale),
    width: frame.width / (image.width * transform.scale),
    height: frame.height / (image.height * transform.scale)
  };
}

export function clampCropTransform(frame, image, value) {
  const minimum = Math.max(frame.width / image.width, frame.height / image.height);
  const scale = Math.max(minimum, Math.min(minimum * 12, value.scale));
  const xLimit = Math.max(0, (image.width * scale - frame.width) / 2);
  const yLimit = Math.max(0, (image.height * scale - frame.height) / 2);
  return { scale, x: Math.max(-xLimit, Math.min(xLimit, value.x)), y: Math.max(-yLimit, Math.min(yLimit, value.y)) };
}
