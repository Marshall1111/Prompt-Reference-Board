// 打印参数只包含版面/校准字段；printer_ip、server_url、device_token 等设备本地配置不参与下发。
export const DEFAULT_PRINT_CONFIG = {
  profile: {
    sheet_width_mm: 105.67,
    sheet_height_mm: 158.5,
    piece_width_mm: 51.0,
    piece_height_mm: 75.0,
    gap_mm: 0.0,
    print_x0_mm: 1.835,
    print_x1_mm: 103.835,
    print_y0_mm: 4.25,
    print_y1_mm: 154.25
  },
  scale_x: 1,
  scale_y: 1,
  offset_x_mm: 0,
  offset_y_mm: 0,
  media: "na_index-4x6_4x6in",
  print_seconds_per_sheet: 50
};

const PROFILE_FIELDS = {
  sheet_width_mm: { label: "纸张宽度", min: 10, max: 1000 },
  sheet_height_mm: { label: "纸张高度", min: 10, max: 1000 },
  piece_width_mm: { label: "成品宽度", min: 5, max: 1000 },
  piece_height_mm: { label: "成品高度", min: 5, max: 1000 },
  gap_mm: { label: "成品间距", min: 0, max: 100 },
  print_x0_mm: { label: "可打印区左边界", min: 0, max: 1000 },
  print_x1_mm: { label: "可打印区右边界", min: 0, max: 1000 },
  print_y0_mm: { label: "可打印区上边界", min: 0, max: 1000 },
  print_y1_mm: { label: "可打印区下边界", min: 0, max: 1000 }
};

function toNumber(value, { label, min, max }) {
  const number = Number(value);
  if (value === "" || value == null || !Number.isFinite(number)) {
    throw new Error(`${label}需要填写数字。`);
  }
  if (number < min || number > max) {
    throw new Error(`${label}需要在 ${min} 到 ${max} 之间。`);
  }
  return number;
}

export function normalizePrintConfig(raw) {
  if (!raw || typeof raw !== "object") throw new Error("打印参数格式不正确。");
  const profileInput = raw.profile && typeof raw.profile === "object" ? raw.profile : {};
  const profile = {};
  for (const [key, rule] of Object.entries(PROFILE_FIELDS)) {
    profile[key] = toNumber(profileInput[key] ?? DEFAULT_PRINT_CONFIG.profile[key], rule);
  }
  if (profile.print_x0_mm >= profile.print_x1_mm) {
    throw new Error("可打印区左边界需小于右边界。");
  }
  if (profile.print_y0_mm >= profile.print_y1_mm) {
    throw new Error("可打印区上边界需小于下边界。");
  }
  if (profile.piece_width_mm > profile.sheet_width_mm || profile.piece_height_mm > profile.sheet_height_mm) {
    throw new Error("成品尺寸不能大于纸张尺寸。");
  }

  const media = String(raw.media ?? DEFAULT_PRINT_CONFIG.media).trim() || DEFAULT_PRINT_CONFIG.media;
  if (media.length > 64 || /[^A-Za-z0-9_.,\-/]/.test(media)) {
    throw new Error("介质名称只能包含字母、数字和 _ . , - /。");
  }

  return {
    profile,
    scale_x: toNumber(raw.scale_x ?? DEFAULT_PRINT_CONFIG.scale_x, { label: "横向缩放", min: 0.5, max: 2 }),
    scale_y: toNumber(raw.scale_y ?? DEFAULT_PRINT_CONFIG.scale_y, { label: "纵向缩放", min: 0.5, max: 2 }),
    offset_x_mm: toNumber(raw.offset_x_mm ?? DEFAULT_PRINT_CONFIG.offset_x_mm, { label: "横向偏移", min: -50, max: 50 }),
    offset_y_mm: toNumber(raw.offset_y_mm ?? DEFAULT_PRINT_CONFIG.offset_y_mm, { label: "纵向偏移", min: -50, max: 50 }),
    media,
    print_seconds_per_sheet: Math.round(toNumber(raw.print_seconds_per_sheet ?? DEFAULT_PRINT_CONFIG.print_seconds_per_sheet, {
      label: "每张打印耗时",
      min: 1,
      max: 300
    }))
  };
}
