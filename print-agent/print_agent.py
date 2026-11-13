"""相纸打印代理：校准页、多张排版、IPP 直发打印机。

用法：
    python print_agent.py calibrate            # 生成并打印校准页
    python print_agent.py calibrate --save a.jpg   # 只生成不打印
    python print_agent.py layout a.jpg b.jpg   # 一页最多排 4 张成品并打印
    python print_agent.py layout a.jpg --save out.jpg

纸张尺寸、成品尺寸、可打印区域都在同目录 config.json 的 profile 段配置，
首次运行会自动创建默认配置。
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

# ---------- 基础参数 ----------
DPI = 300
GUIDE_COLOR = (190, 190, 190)   # 裁切辅助线的浅灰色
GUIDE_WIDTH_PX = 2

# 默认版面参数（4x6 纸 + 50x74 成品），实际以 config.json 的 profile 段为准
DEFAULT_PROFILE = {
    "sheet_width_mm": 101.6,    # 纸张宽
    "sheet_height_mm": 152.4,   # 纸张高
    "piece_width_mm": 50.0,     # 成品短边上限
    "piece_height_mm": 74.0,    # 成品长边上限
    "gap_mm": 10.0,              # 成品之间的间距
    # 实测可打印区域（4x6 纸，HP Smart Tank 510 上报值）
    "print_x0_mm": 0.63,
    "print_x1_mm": 95.81,
    "print_y0_mm": 1.85,
    "print_y1_mm": 146.75,
}

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
DEFAULT_CONFIG = {
    "printer_ip": "192.168.31.100",
    "printer_uri_path": "/ipp/print",
    "media": "na_index-4x6_4x6in",
    "profile": dict(DEFAULT_PROFILE),
    # 打印机把整页缩到可打印区，实测：实际 = offset + scale × 设计
    "scale_x": 1.0,
    "scale_y": 1.0,
    "offset_x_mm": 0.0,
    "offset_y_mm": 0.0,
}
REASON_TEXT = {
    "media-empty-error": "缺纸（请放入相纸）",
    "media-empty-warning": "缺纸（请放入相纸）",
    "spool-area-full-report": "出纸托盘已满，请把打印好的纸拿走",
    "media-jam-error": "卡纸",
    "cover-open-error": "机盖未关好",
}


def mm2px(mm: float) -> int:
    return int(round(mm / 25.4 * DPI))


def load_config() -> dict:
    if CONFIG_PATH.exists():
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        merged = {**DEFAULT_CONFIG, **cfg}
        merged["profile"] = {**DEFAULT_PROFILE, **(cfg.get("profile") or {})}
        return merged
    CONFIG_PATH.write_text(
        json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return dict(DEFAULT_CONFIG)


def profile(cfg: dict) -> dict:
    return cfg.get("profile") or DEFAULT_PROFILE


def font(size: int) -> ImageFont.ImageFont:
    for name in ("msyh.ttc", "simhei.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def new_canvas(cfg: dict) -> Image.Image:
    p = profile(cfg)
    return Image.new("RGB", (mm2px(p["sheet_width_mm"]), mm2px(p["sheet_height_mm"])), "white")


# ---------- 校准验证页 ----------
def build_calibration(cfg: dict) -> Image.Image:
    p = profile(cfg)
    img = new_canvas(cfg)
    d = ImageDraw.Draw(img)
    W, H = p["sheet_width_mm"], p["sheet_height_mm"]
    piece_w, piece_h = p["piece_width_mm"], p["piece_height_mm"]
    x0, x1 = p["print_x0_mm"], p["print_x1_mm"]
    y0, y1 = p["print_y0_mm"], p["print_y1_mm"]
    hr_len = min(90.0, max(10.0, W - 10.0))   # 横向标尺长度
    vr_len = min(140.0, max(10.0, H - 8.0))   # 竖向标尺长度

    # 边框：用来目测四周白边是否等宽
    d.rectangle([mm2px(5), mm2px(5), mm2px(W - 5), mm2px(H - 5)], outline=(0, 110, 220), width=2)
    d.rectangle(
        [mm2px(10), mm2px(10), mm2px(W - 10), mm2px(H - 10)], outline=(0, 150, 80), width=1
    )

    d.text((mm2px(12), mm2px(8)), "校准验证页", fill=(40, 40, 40), font=font(30))
    for i, line in enumerate(
        [
            f"横标尺 0-{hr_len:g} 应正好 {hr_len:g}mm；竖标尺 0-{vr_len:g} 应正好 {vr_len:g}mm",
            f"成品框应正好 宽 {piece_w:g}mm × 高 {piece_h:g}mm",
            "任一数值不符，把实测值告诉我即可",
        ]
    ):
        d.text((mm2px(12), mm2px(16 + i * 7.5)), line, fill=(60, 60, 60), font=font(21))

    # 成品框（与正式排版同位置）
    cx = (x0 + x1) / 2
    cy = (y0 + y1) / 2
    d.rectangle(
        [
            mm2px(cx - piece_w / 2),
            mm2px(cy - piece_h / 2),
            mm2px(cx + piece_w / 2),
            mm2px(cy + piece_h / 2),
        ],
        outline=(200, 0, 150),
        width=3,
    )
    d.text(
        (mm2px(cx - piece_w / 2 + 1.5), mm2px(cy - piece_h / 2 + 1.5)),
        f"成品 {piece_w:g} x {piece_h:g}",
        fill=(200, 0, 150),
        font=font(24),
    )

    # 横向标尺
    ry = H - 22.0
    d.line([mm2px(4), mm2px(ry), mm2px(4 + hr_len), mm2px(ry)], fill=(0, 0, 0), width=2)
    for i in range(0, int(hr_len) + 1, 5):
        x = 4 + i
        length = 6.0 if i % 10 == 0 else 3.0
        d.line([mm2px(x), mm2px(ry), mm2px(x), mm2px(ry - length)], fill=(0, 0, 0), width=2)
        if i % 10 == 0:
            d.text((mm2px(x) - 6, mm2px(ry + 1.2)), str(i), fill=(0, 0, 0), font=font(18))

    # 竖向标尺
    rx = W - 6.0
    d.line([mm2px(rx), mm2px(4), mm2px(rx), mm2px(4 + vr_len)], fill=(0, 0, 0), width=2)
    for i in range(0, int(vr_len) + 1, 5):
        y = 4 + i
        length = 6.0 if i % 10 == 0 else 3.0
        d.line([mm2px(rx), mm2px(y), mm2px(rx - length), mm2px(y)], fill=(0, 0, 0), width=2)
        if i % 10 == 0:
            d.text((mm2px(rx - 13), mm2px(y) - 10), str(i), fill=(0, 0, 0), font=font(16))

    return img


# ---------- 正式排版 ----------
def fit_piece(src: Path, cell_w_mm: float, cell_h_mm: float, p: dict) -> Image.Image:
    """按原图比例缩放：长边不超过成品高、短边不超过成品宽，不裁剪不变形。
    横图先顺时针旋转 90° 变成竖图再排版。"""
    img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    if img.width > img.height:
        img = img.rotate(-90, expand=True)
    scale = min(
        p["piece_width_mm"] / img.width,
        p["piece_height_mm"] / img.height,
        cell_w_mm / img.width,
        cell_h_mm / img.height,
    )
    size = (
        max(1, round(img.width * scale * DPI / 25.4)),
        max(1, round(img.height * scale * DPI / 25.4)),
    )
    return img.resize(size, Image.LANCZOS)


def build_layout(images: list[Path], cfg: dict) -> Image.Image:
    """一页最多 4 张：1 张居中，2 张上下，3-4 张 2x2，每张按原比例缩放。"""
    p = profile(cfg)
    img = new_canvas(cfg)
    pages = images[:4]
    if not pages:
        return img

    cols = 1 if len(pages) <= 2 else 2
    rows = (len(pages) + cols - 1) // cols
    gap = p["gap_mm"]
    area_w = p["print_x1_mm"] - p["print_x0_mm"]
    area_h = p["print_y1_mm"] - p["print_y0_mm"]
    cell_w = (area_w - gap * (cols - 1)) / cols
    cell_h = (area_h - gap * (rows - 1)) / rows
    grid_w = cell_w * cols + gap * (cols - 1)
    grid_h = cell_h * rows + gap * (rows - 1)
    start_x = p["print_x0_mm"] + (area_w - grid_w) / 2
    start_y = p["print_y0_mm"] + (area_h - grid_h) / 2

    placed_rects = []
    guide_xs: set[int] = set()
    guide_ys: set[int] = set()

    for idx, path in enumerate(pages):
        col, row = idx % cols, idx // cols
        cell_x = start_x + col * (cell_w + gap)
        cell_y = start_y + row * (cell_h + gap)
        piece = fit_piece(path, cell_w, cell_h, p)
        piece_w_mm = piece.width * 25.4 / DPI
        piece_h_mm = piece.height * 25.4 / DPI
        px = mm2px(cell_x + (cell_w - piece_w_mm) / 2)
        py = mm2px(cell_y + (cell_h - piece_h_mm) / 2)
        img.paste(piece, (px, py))
        placed_rects.append((px, py, px + piece.width, py + piece.height))
        guide_xs.update((px, px + piece.width))
        guide_ys.update((py, py + piece.height))

    # 裁切辅助线：沿每张图片的四边画浅灰延长线，一直延伸到相纸边缘；
    # 线条落在照片上的部分会被遮掉，避免在成品画面上留下灰线。
    guide_mask = Image.new("L", img.size, 0)
    guide_draw = ImageDraw.Draw(guide_mask)
    for x in sorted(guide_xs):
        if 0 <= x < img.width:
            guide_draw.line([(x, 0), (x, img.height - 1)], fill=255, width=GUIDE_WIDTH_PX)
    for y in sorted(guide_ys):
        if 0 <= y < img.height:
            guide_draw.line([(0, y), (img.width - 1, y)], fill=255, width=GUIDE_WIDTH_PX)
    for left, top, right, bottom in placed_rects:
        guide_draw.rectangle([left, top, right + GUIDE_WIDTH_PX, bottom + GUIDE_WIDTH_PX], fill=0)
    img.paste(GUIDE_COLOR, (0, 0), guide_mask)

    # 图片自身边缘再压一圈浅灰细线：白底照片贴着纸边打印时，
    # 只有外侧延长线看不清边界，沿图片边缘画线才方便对位裁切。
    edge_draw = ImageDraw.Draw(img)
    for left, top, right, bottom in placed_rects:
        edge_draw.rectangle(
            [left, top, right - 1, bottom - 1],
            outline=GUIDE_COLOR,
            width=GUIDE_WIDTH_PX,
        )

    return img


def apply_compensation(img: Image.Image, cfg: dict) -> Image.Image:
    """抵消打印机的整体缩放与偏移：实际 = offset + scale × 设计。"""
    sx, sy = cfg["scale_x"], cfg["scale_y"]
    mx, my = cfg["offset_x_mm"], cfg["offset_y_mm"]
    if sx == 1.0 and sy == 1.0 and mx == 0.0 and my == 0.0:
        return img
    scaled = img.resize(
        (max(1, round(img.width / sx)), max(1, round(img.height / sy))), Image.LANCZOS
    )
    out = Image.new("RGB", img.size, "white")
    out.paste(scaled, (round(-mm2px(mx) / sx), round(-mm2px(my) / sy)))
    return out


# ---------- IPP ----------
def _attr(tag: int, name: str, value: bytes) -> bytes:
    nb = name.encode()
    return bytes([tag]) + struct.pack(">H", len(nb)) + nb + struct.pack(">H", len(value)) + value


def _ipp_post(cfg: dict, payload: bytes) -> bytes:
    url = f"http://{cfg['printer_ip']}:631{cfg['printer_uri_path']}"
    req = urllib.request.Request(
        url, data=payload, headers={"Content-Type": "application/ipp"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def _parse_attrs(data: bytes):
    i = 8  # 跳过 version(2) + status(2) + request-id(4)
    while i < len(data):
        tag = data[i]
        i += 1
        if tag == 0x03:
            break
        if tag < 0x10:
            continue
        nlen = int.from_bytes(data[i : i + 2], "big")
        i += 2
        name = data[i : i + nlen].decode("utf-8", "replace")
        i += nlen
        vlen = int.from_bytes(data[i : i + 2], "big")
        i += 2
        value = data[i : i + vlen]
        i += vlen
        yield tag, name, value


def submit_job(cfg: dict, jpeg: Path) -> int:
    printer_uri = f"ipp://{cfg['printer_ip']}:631{cfg['printer_uri_path']}"
    body = b"\x01\x01" + struct.pack(">H", 0x0002) + struct.pack(">I", 1) + b"\x01"
    # 操作属性组
    body += _attr(0x47, "attributes-charset", b"utf-8")
    body += _attr(0x48, "attributes-natural-language", b"zh-cn")
    body += _attr(0x45, "printer-uri", printer_uri.encode())
    body += _attr(0x42, "requesting-user-name", b"print-agent")
    body += _attr(0x42, "job-name", jpeg.stem.encode())
    body += _attr(0x49, "document-format", b"image/jpeg")
    # 作业模板属性组（必须是独立 0x02 组，否则打印机返回 bad-request）
    body += b"\x02"
    body += _attr(0x44, "media", cfg["media"].encode())
    body += _attr(0x44, "print-scaling", b"none")
    body += _attr(0x23, "print-quality", struct.pack(">i", 4))
    body += b"\x03"
    resp = _ipp_post(cfg, body + jpeg.read_bytes())
    status = int.from_bytes(resp[2:4], "big")
    if status != 0:
        msg = ""
        for tag, name, value in _parse_attrs(resp):
            if name == "status-message":
                msg = value.decode("utf-8", "replace")
        raise RuntimeError(f"IPP 提交失败，状态码 0x{status:04x} {msg}")
    for tag, name, value in _parse_attrs(resp):
        if name == "job-id" and tag == 0x21:
            return int.from_bytes(value, "big")
    raise RuntimeError("响应中没有 job-id")


def printer_reasons(cfg: dict) -> list[str]:
    """读取打印机当前状态原因，如 media-empty-error（缺纸）。"""
    printer_uri = f"ipp://{cfg['printer_ip']}:631{cfg['printer_uri_path']}"
    body = b"\x01\x01" + struct.pack(">H", 0x000B) + struct.pack(">I", 1) + b"\x01"
    body += _attr(0x47, "attributes-charset", b"utf-8")
    body += _attr(0x48, "attributes-natural-language", b"zh-cn")
    body += _attr(0x45, "printer-uri", printer_uri.encode())
    body += b"\x03"
    reasons = []
    try:
        for tag, name, value in _parse_attrs(_ipp_post(cfg, body)):
            if name == "printer-state-reasons" and tag < 0x30:
                reasons.append(value.decode("utf-8", "replace"))
    except OSError:
        return ["无法连接打印机"]
    return [REASON_TEXT.get(r, r) for r in reasons] or ["无异常上报"]


def wait_job(cfg: dict, job_id: int, timeout: float = 120.0) -> int:
    """轮询任务状态，返回最终 job-state（7=处理中, 8=已取消, 9=完成）。"""
    printer_uri = f"ipp://{cfg['printer_ip']}:631{cfg['printer_uri_path']}"
    deadline = time.time() + timeout
    state = 0
    while time.time() < deadline:
        body = b"\x01\x01" + struct.pack(">H", 0x0009) + struct.pack(">I", 1) + b"\x01"
        body += _attr(0x47, "attributes-charset", b"utf-8")
        body += _attr(0x48, "attributes-natural-language", b"zh-cn")
        body += _attr(0x45, "printer-uri", printer_uri.encode())
        body += _attr(0x21, "job-id", struct.pack(">I", job_id))
        body += b"\x03"
        resp = _ipp_post(cfg, body)
        for tag, name, value in _parse_attrs(resp):
            if name == "job-state" and tag in (0x21, 0x23):
                state = int.from_bytes(value, "big")
        if state in (8, 9):
            return state
        time.sleep(2)
    return state


# ---------- CLI ----------
def save_and_print(img: Image.Image, cfg: dict, save: str | None, name: str) -> None:
    out = Path(save) if save else BASE_DIR / f"{name}.jpg"
    img = apply_compensation(img, cfg)
    img.save(out, "JPEG", quality=96, dpi=(DPI, DPI))
    print(f"已生成: {out}  ({img.width}x{img.height}px)")
    if save:
        return
    job_id = submit_job(cfg, out)
    print(f"已提交打印任务 job-id={job_id}，等待完成...")
    state = wait_job(cfg, job_id)
    if state == 9:
        print("打印完成")
    else:
        print(f"任务状态={state}（9=完成，8=取消），打印机: {'、'.join(printer_reasons(cfg))}")


def main() -> None:
    parser = argparse.ArgumentParser(description="相纸打印代理（尺寸见 config.json）")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_cal = sub.add_parser("calibrate", help="打印校准页")
    p_cal.add_argument("--save", help="只保存不打印")

    p_layout = sub.add_parser("layout", help="排版成品并打印（一页最多 4 张）")
    p_layout.add_argument("images", nargs="+", help="原图路径（1~4 张）")
    p_layout.add_argument("--save", help="只保存不打印")

    args = parser.parse_args()
    cfg = load_config()

    if args.cmd == "calibrate":
        save_and_print(build_calibration(cfg), cfg, args.save, "calibration")
    elif args.cmd == "layout":
        paths = [Path(p) for p in args.images]
        for p in paths:
            if not p.exists():
                sys.exit(f"找不到图片: {p}")
        save_and_print(build_layout(paths, cfg), cfg, args.save, "layout")


if __name__ == "__main__":
    main()
