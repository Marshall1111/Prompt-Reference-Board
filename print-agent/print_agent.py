"""4x6 相纸打印代理：校准页、2-up 排版、IPP 直发打印机。

用法：
    python print_agent.py calibrate            # 生成并打印校准页
    python print_agent.py calibrate --save a.jpg   # 只生成不打印
    python print_agent.py layout a.jpg b.jpg   # 排版 2 个 50x75 并打印
    python print_agent.py layout a.jpg --save out.jpg

配置保存在同目录 config.json，首次运行自动创建。
"""

from __future__ import annotations

import argparse
import json
import struct
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# ---------- 基础参数 ----------
DPI = 300
SHEET_W_MM = 101.6          # 4 英寸
SHEET_H_MM = 152.4          # 6 英寸
PIECE_W_MM = 50.0           # 成品尺寸
PIECE_H_MM = 75.0
BLEED_MM = 2.0              # 出血
GAP_MM = 10.0               # 两个成品之间的间距

# 实测可打印区域（4x6 纸，HP Smart Tank 510 上报值）
PRINT_X0_MM = 0.63
PRINT_X1_MM = 95.81
PRINT_Y0_MM = 1.85
PRINT_Y1_MM = 146.75

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "config.json"
DEFAULT_CONFIG = {
    "printer_ip": "192.168.31.100",
    "printer_uri_path": "/ipp/print",
    "media": "na_index-4x6_4x6in",
    # 打印机把 4x6 整页缩到可打印区，实测：实际 = offset + scale × 设计
    "scale_x": 1.0,
    "scale_y": 1.0,
    "offset_x_mm": 0.0,
    "offset_y_mm": 0.0,
}
REASON_TEXT = {
    "media-empty-error": "缺纸（放 4x6 相纸）",
    "media-empty-warning": "缺纸（放 4x6 相纸）",
    "spool-area-full-report": "出纸托盘已满，请把打印好的纸拿走",
    "media-jam-error": "卡纸",
    "cover-open-error": "机盖未关好",
}


def mm2px(mm: float) -> int:
    return int(round(mm / 25.4 * DPI))


def load_config() -> dict:
    if CONFIG_PATH.exists():
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return {**DEFAULT_CONFIG, **cfg}
    CONFIG_PATH.write_text(
        json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return dict(DEFAULT_CONFIG)


def font(size: int) -> ImageFont.ImageFont:
    for name in ("msyh.ttc", "simhei.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def new_canvas() -> Image.Image:
    img = Image.new("RGB", (mm2px(SHEET_W_MM), mm2px(SHEET_H_MM)), "white")
    return img


# ---------- 校准验证页 ----------
def build_calibration(cfg: dict) -> Image.Image:
    img = new_canvas()
    d = ImageDraw.Draw(img)
    W, H = SHEET_W_MM, SHEET_H_MM

    # 边框：用来目测四周白边是否等宽
    d.rectangle([mm2px(5), mm2px(5), mm2px(W - 5), mm2px(H - 5)], outline=(0, 110, 220), width=2)
    d.rectangle(
        [mm2px(10), mm2px(10), mm2px(W - 10), mm2px(H - 10)], outline=(0, 150, 80), width=1
    )

    d.text((mm2px(12), mm2px(8)), "校准验证页", fill=(40, 40, 40), font=font(30))
    for i, line in enumerate(
        [
            "横标尺 0-90 应正好 90mm；竖标尺 0-140 应正好 140mm",
            "成品框应正好 宽 50mm × 高 75mm",
            "任一数值不符，把实测值告诉我即可",
        ]
    ):
        d.text((mm2px(12), mm2px(16 + i * 7.5)), line, fill=(60, 60, 60), font=font(21))

    # 成品框 50 x 75（与正式排版同位置）
    cx = (PRINT_X0_MM + PRINT_X1_MM) / 2
    cy = (PRINT_Y0_MM + PRINT_Y1_MM) / 2
    d.rectangle(
        [
            mm2px(cx - PIECE_W_MM / 2),
            mm2px(cy - PIECE_H_MM / 2),
            mm2px(cx + PIECE_W_MM / 2),
            mm2px(cy + PIECE_H_MM / 2),
        ],
        outline=(200, 0, 150),
        width=3,
    )
    d.text(
        (mm2px(cx - PIECE_W_MM / 2 + 1.5), mm2px(cy - PIECE_H_MM / 2 + 1.5)),
        "成品 50 x 75",
        fill=(200, 0, 150),
        font=font(24),
    )

    # 横向 90mm 标尺
    ry = 126.0
    d.line([mm2px(4), mm2px(ry), mm2px(94), mm2px(ry)], fill=(0, 0, 0), width=2)
    for i in range(0, 91, 5):
        x = 4 + i
        length = 6.0 if i % 10 == 0 else 3.0
        d.line([mm2px(x), mm2px(ry), mm2px(x), mm2px(ry - length)], fill=(0, 0, 0), width=2)
        if i % 10 == 0:
            d.text((mm2px(x) - 6, mm2px(ry + 1.2)), str(i), fill=(0, 0, 0), font=font(18))

    # 竖向 140mm 标尺
    rx = 94.0
    d.line([mm2px(rx), mm2px(4), mm2px(rx), mm2px(144)], fill=(0, 0, 0), width=2)
    for i in range(0, 141, 5):
        y = 4 + i
        length = 6.0 if i % 10 == 0 else 3.0
        d.line([mm2px(rx), mm2px(y), mm2px(rx - length), mm2px(y)], fill=(0, 0, 0), width=2)
        if i % 10 == 0:
            d.text((mm2px(rx - 13), mm2px(y) - 10), str(i), fill=(0, 0, 0), font=font(16))

    return img


# ---------- 正式排版 ----------
def cover_resize(src: Path, w_px: int, h_px: int) -> Image.Image:
    img = Image.open(src).convert("RGB")
    scale = max(w_px / img.width, h_px / img.height)
    new_size = (max(1, int(round(img.width * scale))), max(1, int(round(img.height * scale))))
    img = img.resize(new_size, Image.LANCZOS)
    left = (img.width - w_px) // 2
    top = (img.height - h_px) // 2
    return img.crop((left, top, left + w_px, top + h_px))


def build_layout(images: list[Path], cfg: dict) -> Image.Image:
    img = new_canvas()
    d = ImageDraw.Draw(img)

    # 成品旋转 90° 放置：纸面上占 75 宽 × 50 高
    pw_mm, ph_mm = PIECE_H_MM, PIECE_W_MM
    piece_w, piece_h = mm2px(pw_mm), mm2px(ph_mm)
    bleed = mm2px(BLEED_MM)
    total_h_mm = ph_mm * 2 + GAP_MM
    start_x_mm = PRINT_X0_MM + (PRINT_X1_MM - PRINT_X0_MM - pw_mm) / 2
    start_y_mm = PRINT_Y0_MM + (PRINT_Y1_MM - PRINT_Y0_MM - total_h_mm) / 2

    for idx, path in enumerate(images[:2]):
        top_mm = start_y_mm + idx * (ph_mm + GAP_MM)
        left_px = mm2px(start_x_mm) - bleed
        top_px = mm2px(top_mm) - bleed
        piece = cover_resize(path, piece_w + bleed * 2, piece_h + bleed * 2)
        img.paste(piece, (left_px, top_px))

    # 裁切辅助线：沿成品四边贯穿到相纸边缘，方便用裁刀对齐
    guide = (150, 150, 150)
    for x_mm in (start_x_mm, start_x_mm + pw_mm):
        d.line([mm2px(x_mm), 0, mm2px(x_mm), img.height - 1], fill=guide, width=2)
    for y_mm in (
        start_y_mm,
        start_y_mm + ph_mm,
        start_y_mm + ph_mm + GAP_MM,
        start_y_mm + ph_mm * 2 + GAP_MM,
    ):
        d.line([0, mm2px(y_mm), img.width - 1, mm2px(y_mm)], fill=guide, width=2)

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
    parser = argparse.ArgumentParser(description="4x6 相纸打印代理")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_cal = sub.add_parser("calibrate", help="打印校准页")
    p_cal.add_argument("--save", help="只保存不打印")

    p_layout = sub.add_parser("layout", help="排版 2 个 50x75 成品")
    p_layout.add_argument("images", nargs="+", help="原图路径（1~2 张）")
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
