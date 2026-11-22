# -*- coding: utf-8 -*-
"""
一键生成：6 组（原图 + 转绘）+ 1 张结尾页  ->  24 帧/张、卡点、原图缓推、2:3 黑底视频

用法：
  1. 把 13 张图片放进同目录下的“素材”文件夹（按文件名排序）
  2. 把 bgm.mp3 / bgm.m4a / bgm.wav 放进同一文件夹
  3. 双击“一键生成.bat”，或把素材文件夹拖到 bat 上
"""
import os
import re
import sys
import subprocess
import datetime

import numpy as np
from PIL import Image
import imageio_ffmpeg

BASE = os.path.dirname(os.path.abspath(__file__))
CFG_PATH = os.path.join(BASE, "配置.txt")
FF = imageio_ffmpeg.get_ffmpeg_exe()

DEFAULTS = {
    "每张帧数": "24",
    "结尾页帧数": "32",
    "推近幅度": "0.04",
    "画面宽": "1080",
    "画面高": "1620",
    "帧率": "30",
    "音频起点": "自动",
    "背景色": "0,0,0",
}


def load_cfg():
    cfg = dict(DEFAULTS)
    if os.path.exists(CFG_PATH):
        for line in open(CFG_PATH, encoding="utf-8-sig"):
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            cfg[k.strip()] = v.strip()
    return cfg


def natural_key(name):
    return [int(s) if s.isdigit() else s.lower() for s in re.split(r"(\d+)", name)]


def find_images(folder):
    exts = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}
    files = [f for f in os.listdir(folder)
             if os.path.splitext(f)[1].lower() in exts and not f.startswith(".")]
    return [os.path.join(folder, f) for f in sorted(files, key=natural_key)]


def find_bgm(folder):
    for f in sorted(os.listdir(folder), key=natural_key):
        if f.lower().startswith("bgm") and os.path.splitext(f)[1].lower() in {".mp3", ".m4a", ".wav", ".aac", ".flac", ".ogg"}:
            return os.path.join(folder, f)
    return None


def detect_audio_start(bgm):
    """自动找第一个明显起音，返回秒；失败返回 0.04"""
    try:
        sr = 22050
        raw = subprocess.run([FF, "-v", "error", "-i", bgm, "-ac", "1", "-ar", str(sr),
                              "-t", "3", "-f", "f32le", "-"], capture_output=True).stdout
        a = np.frombuffer(raw, dtype=np.float32)
        if len(a) < sr // 4:
            return 0.04
        win, hop = 512, 128
        n = 1 + (len(a) - win) // hop
        rms = np.array([np.sqrt(np.mean(a[i*hop:i*hop+win]**2) + 1e-12) for i in range(n)])
        on = np.maximum(0, np.diff(np.log(rms + 1e-9)))
        t = np.arange(len(on)) * hop / sr
        if on.max() <= 0:
            return 0.04
        th = on.max() * 0.5
        for i in range(1, len(on) - 1):
            if on[i] > th and on[i] >= on[i-1] and on[i] >= on[i+1]:
                return round(max(0.0, t[i] - 0.03), 3)
        return 0.04
    except Exception:
        return 0.04


def estimate_bpm(bgm):
    try:
        sr = 22050
        raw = subprocess.run([FF, "-v", "error", "-i", bgm, "-ac", "1", "-ar", str(sr),
                              "-f", "f32le", "-"], capture_output=True).stdout
        a = np.frombuffer(raw, dtype=np.float32)
        win, hop = 1024, 256
        n = 1 + (len(a) - win) // hop
        rms = np.array([np.sqrt(np.mean(a[i*hop:i*hop+win]**2) + 1e-12) for i in range(n)])
        on = np.maximum(0, np.diff(np.log(rms + 1e-9)))
        on = np.concatenate([[0], on])
        on -= on.mean()
        efps = sr / hop
        lo, hi = int(0.5 * efps), int(1.3 * efps)
        ac = np.correlate(on, on, mode="full")[len(on)-1:]
        ac /= (ac[0] + 1e-9)
        lag = max(range(lo, hi), key=lambda l: ac[l])
        return 60.0 / (lag / efps)
    except Exception:
        return None


def fit_box(w, h, cw, ch):
    s = min(cw / w, ch / h)
    return round(w * s), round(h * s)


def render(img, cw, ch, bg, scale=1.0):
    """把图片等比放进画布居中；scale>1 时以中心放大并裁切"""
    bbox_w, bbox_h = fit_box(img.width, img.height, cw, ch)
    nw, nh = round(bbox_w * scale), round(bbox_h * scale)
    im = img.resize((nw, nh), Image.LANCZOS)
    x = (cw - nw) // 2
    y = (ch - nh) // 2
    canvas = Image.new("RGB", (cw, ch), bg)
    canvas.paste(im, (x, y))
    return canvas


def main():
    cfg = load_cfg()
    frames_per = max(1, int(cfg["每张帧数"]))
    end_frames = max(1, int(cfg["结尾页帧数"]))
    zoom = max(0.0, float(cfg["推近幅度"]))
    W, H = int(cfg["画面宽"]), int(cfg["画面高"])
    fps = int(cfg["帧率"])
    bg = tuple(int(v) for v in cfg["背景色"].split(","))

    folder = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "素材")
    if not os.path.isdir(folder):
        print("找不到素材文件夹：", folder)
        return 1

    images = find_images(folder)
    if len(images) < 3 or len(images) % 2 == 0:
        print(f"需要 6 组（2 张/组）+ 1 张结尾页，共 13 张图片；当前找到 {len(images)} 张。")
        print("图片会按文件名排序，最后一张作为结尾页。")
        return 1

    end_img_path = images[-1]
    pair_imgs = images[:-1]
    print(f"素材：{len(pair_imgs)} 张对比图 + 1 张结尾页（{os.path.basename(end_img_path)}）")

    bgm = find_bgm(folder)
    if not bgm:
        print("素材文件夹里没有找到 bgm.mp3 / bgm.m4a / bgm.wav")
        return 1

    # 音轨起点：配置优先，自动则找第一个起音
    if cfg["音频起点"].strip() == "自动":
        start = detect_audio_start(bgm)
    else:
        start = max(0.0, float(cfg["音频起点"]))
    bpm = estimate_bpm(bgm)
    print(f"BGM：{os.path.basename(bgm)}，起点 {start:.3f}s", end="")
    if bpm:
        print(f"，估算 BPM {bpm:.1f}（每张 {frames_per} 帧 = {frames_per/fps:.3f}s）")
        exp = 60.0 * fps / frames_per
        if abs(bpm - exp) > 3:
            print(f"  提示：BPM 与当前每张时长不匹配（理想约 {exp:.0f} BPM），可改 配置.txt 的 每张帧数")
    else:
        print()

    out_dir = os.path.join(BASE, "输出")
    os.makedirs(out_dir, exist_ok=True)
    out = os.path.join(out_dir, "成片_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S") + ".mp4")

    # 逐场景生成帧
    seqs = []
    for i, p in enumerate(pair_imgs):
        img = Image.open(p).convert("RGB")
        name = os.path.basename(p)
        lower = name.lower()
        if ("原图" in name) or ("before" in lower):
            is_before = True
        elif ("转绘" in name) or ("after" in lower):
            is_before = False
        else:
            is_before = (i % 2 == 0)   # 没写命名时按顺序：第 1 张为原图

        if is_before and zoom > 0:
            seq = []
            for k in range(frames_per):
                t = k / max(1, frames_per - 1)
                e = t * t * (3 - 2 * t)
                seq.append(render(img, W, H, bg, 1.0 + zoom * e).tobytes())
        else:
            seq = [render(img, W, H, bg, 1.0).tobytes()] * frames_per
        seqs.append(seq)
        print(f"  {i+1:02d} {'推近' if is_before and zoom > 0 else '静止'}  {name}")

    end_seq = [render(Image.open(end_img_path).convert("RGB"), W, H, bg, 1.0).tobytes()] * end_frames
    total = sum(len(s) for s in seqs) + len(end_seq)
    print(f"总帧数 {total}，时长 {total/fps:.2f}s，输出 {W}x{H}@{fps}fps")

    # 音轨裁剪
    wav = os.path.join(out_dir, "_audio_tmp.wav")
    subprocess.run([FF, "-y", "-i", bgm, "-vn",
                    "-af", f"atrim=start={start},asetpts=PTS-STARTPTS",
                    "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", wav],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    cmd = [FF, "-y",
           "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", f"{W}x{H}",
           "-framerate", str(fps), "-i", "-", "-i", wav,
           "-c:v", "libx264", "-preset", "medium", "-crf", "18",
           "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
           "-r", str(fps), "-g", "60",
           "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
           "-shortest", "-movflags", "+faststart", out]

    log_path = os.path.join(out_dir, "_ffmpeg_log.txt")
    log = open(log_path, "wb")
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log)
    count = 0
    for seq in seqs + [end_seq]:
        for f in seq:
            proc.stdin.write(f)
            count += 1
    proc.stdin.close()
    proc.wait()
    log.close()
    try:
        os.remove(wav)
    except OSError:
        pass

    if proc.returncode != 0 or not os.path.exists(out):
        print("生成失败：")
        try:
            print(open(log_path, encoding="utf-8", errors="ignore").read()[-2000:])
        except OSError:
            pass
        return 1
    try:
        os.remove(log_path)
    except OSError:
        pass

    size = os.path.getsize(out) / 1024 / 1024
    print(f"完成：{out}（{size:.2f} MB，{count} 帧）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
