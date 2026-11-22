# -*- coding: utf-8 -*-
"""结尾页：黑底 1080x1620，二维码居中，上下各一行可编辑文案。"""
from __future__ import annotations

import os
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import qrcode
from PIL import Image, ImageDraw, ImageFont

PAGE_W = 1080
PAGE_H = 1620
BG_COLOR = (0, 0, 0)
TEXT_COLOR = (245, 239, 224)
QR_DARK = (11, 11, 13)
QR_TARGET = 600
PLATE_SIZE = 700
PLATE_RADIUS = 28
TOP_FONT_SIZE = 64
BOTTOM_FONT_SIZE = 72
TEXT_GAP = 80

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\msyhbd.ttc",
    r"C:\Windows\Fonts\msyh.ttc",
    r"C:\Windows\Fonts\simhei.ttf",
    r"C:\Windows\Fonts\simsun.ttc",
]


def build_qr_url(site_url: str, style_id: str = "", invite_code: str = "") -> str:
    """按线上规则拼装：sameStyleId 在前、invite 在后。"""
    base = str(site_url or "").strip()
    if not base:
        base = "https://www.petpaint.top"
    if not base.lower().startswith(("http://", "https://")):
        base = "https://" + base
    parsed = urlsplit(base)
    params = list(parse_qsl(parsed.query, keep_blank_values=True))
    style_id = str(style_id or "").strip()
    invite_code = str(invite_code or "").strip()
    if style_id:
        params.append(("sameStyleId", style_id))
    if invite_code:
        params.append(("invite", invite_code))
    path = parsed.path or "/"
    return urlunsplit((parsed.scheme, parsed.netloc, path, urlencode(params), parsed.fragment))


def _load_font(size: int):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def _text_width(font, text: str) -> int:
    if hasattr(font, "getlength"):
        return int(font.getlength(text))
    return font.getsize(text)[0]


def _wrap_text(text: str, font, max_width: int, max_lines: int = 2) -> list:
    lines = []
    for raw_line in str(text or "").splitlines() or [""]:
        current = ""
        for char in raw_line:
            candidate = current + char
            if current and _text_width(font, candidate) > max_width:
                lines.append(current)
                current = char
                if len(lines) >= max_lines:
                    break
            else:
                current = candidate
        if len(lines) >= max_lines:
            break
        lines.append(current)
    return [line for line in lines[:max_lines] if line.strip()]


def _qr_image(url: str) -> Image.Image:
    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=1,
        border=0,
    )
    qr.add_data(url)
    qr.make(fit=True)
    matrix = qr.get_matrix()
    modules = len(matrix)
    box = max(1, QR_TARGET // modules)
    size = box * modules
    image = Image.new("L", (size, size), 255)
    pixels = image.load()
    for y, row in enumerate(matrix):
        for x, value in enumerate(row):
            if not value:
                continue
            for dy in range(box):
                for dx in range(box):
                    pixels[x * box + dx, y * box + dy] = 0
    image = image.convert("RGB")
    colored = Image.new("RGB", image.size, (255, 255, 255))
    mask = image.convert("L").point(lambda value: 255 if value < 128 else 0)
    colored.paste(QR_DARK, (0, 0), mask)
    return colored


def render_end_page_image(url: str, top_text: str, bottom_text: str) -> Image.Image:
    canvas = Image.new("RGB", (PAGE_W, PAGE_H), BG_COLOR)
    draw = ImageDraw.Draw(canvas)

    center_x = PAGE_W // 2
    center_y = PAGE_H // 2
    plate_left = center_x - PLATE_SIZE // 2
    plate_top = center_y - PLATE_SIZE // 2
    draw.rounded_rectangle(
        [plate_left, plate_top, plate_left + PLATE_SIZE, plate_top + PLATE_SIZE],
        radius=PLATE_RADIUS,
        fill=(255, 255, 255),
    )

    qr = _qr_image(url)
    canvas.paste(qr, (center_x - qr.width // 2, center_y - qr.height // 2))

    top_font = _load_font(TOP_FONT_SIZE)
    top_lines = _wrap_text(top_text, top_font, 900, 2)
    if top_lines:
        line_height = int(TOP_FONT_SIZE * 1.3)
        start_y = plate_top - TEXT_GAP - line_height * len(top_lines)
        for index, line in enumerate(top_lines):
            width = _text_width(top_font, line)
            draw.text(((PAGE_W - width) // 2, start_y + index * line_height), line, font=top_font, fill=TEXT_COLOR)

    bottom_font = _load_font(BOTTOM_FONT_SIZE)
    bottom_lines = _wrap_text(bottom_text, bottom_font, 900, 2)
    if bottom_lines:
        line_height = int(BOTTOM_FONT_SIZE * 1.3)
        start_y = plate_top + PLATE_SIZE + TEXT_GAP
        for index, line in enumerate(bottom_lines):
            width = _text_width(bottom_font, line)
            draw.text(((PAGE_W - width) // 2, start_y + index * line_height), line, font=bottom_font, fill=TEXT_COLOR)

    return canvas


def save_end_page(path: str, url: str, top_text: str, bottom_text: str) -> str:
    image = render_end_page_image(url, top_text, bottom_text)
    os.makedirs(os.path.dirname(os.path.abspath(path)) or ".", exist_ok=True)
    image.save(path, "PNG")
    return path
