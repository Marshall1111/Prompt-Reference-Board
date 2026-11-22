# -*- coding: utf-8 -*-
"""本地配置读写：只保存服务器地址、账号、文案等，不保存密码。"""
from __future__ import annotations

import json
import os

APP_DIR_NAME = "PetpaintVideoMaker"
CONFIG_PATH = os.path.join(
    os.environ.get("APPDATA") or os.path.expanduser("~"), APP_DIR_NAME, "config.json"
)

DEFAULTS = {
    "server": "https://www.petpaint.top",
    "username": "",
    "site_url": "https://www.petpaint.top",
    "top_text": "AI小画家，让照片更有趣",
    "bottom_text": "扫码做同款",
    "output_dir": "",
    "bgm_path": "",
    "page_size": 50,
}


def load_config() -> dict:
    cfg = dict(DEFAULTS)
    try:
        with open(CONFIG_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, dict):
            for key in DEFAULTS:
                if key in data and data[key] is not None:
                    cfg[key] = data[key]
    except (OSError, ValueError):
        pass
    return cfg


def save_config(patch: dict) -> None:
    if not isinstance(patch, dict):
        return
    cfg = load_config()
    for key, value in patch.items():
        if key in DEFAULTS and value is not None:
            cfg[key] = value
    try:
        os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
        with open(CONFIG_PATH, "w", encoding="utf-8") as fh:
            json.dump(cfg, fh, ensure_ascii=False, indent=2)
    except OSError:
        pass
