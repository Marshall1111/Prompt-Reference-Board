# -*- coding: utf-8 -*-
"""视频渲染：移植自 一键生成视频/生成视频.py，参数化素材、BGM、结尾页与输出目录。"""
from __future__ import annotations

import datetime
import os
import subprocess

import numpy as np
from PIL import Image
import imageio_ffmpeg

FF = imageio_ffmpeg.get_ffmpeg_exe()


def _log(callback, message: str) -> None:
    if callback:
        callback(message)


def detect_audio_start(bgm: str) -> float:
    """自动找第一个明显起音，返回秒；失败返回 0.04。"""
    try:
        sr = 22050
        raw = subprocess.run(
            [FF, "-v", "error", "-i", bgm, "-ac", "1", "-ar", str(sr), "-t", "3", "-f", "f32le", "-"],
            capture_output=True,
        ).stdout
        audio = np.frombuffer(raw, dtype=np.float32)
        if len(audio) < sr // 4:
            return 0.04
        win, hop = 512, 128
        count = 1 + (len(audio) - win) // hop
        rms = np.array(
            [np.sqrt(np.mean(audio[i * hop:i * hop + win] ** 2) + 1e-12) for i in range(count)]
        )
        onset = np.maximum(0, np.diff(np.log(rms + 1e-9)))
        times = np.arange(len(onset)) * hop / sr
        if onset.max() <= 0:
            return 0.04
        threshold = onset.max() * 0.5
        for i in range(1, len(onset) - 1):
            if onset[i] > threshold and onset[i] >= onset[i - 1] and onset[i] >= onset[i + 1]:
                return round(max(0.0, times[i] - 0.03), 3)
        return 0.04
    except Exception:
        return 0.04


def estimate_bpm(bgm: str):
    try:
        sr = 22050
        raw = subprocess.run(
            [FF, "-v", "error", "-i", bgm, "-ac", "1", "-ar", str(sr), "-f", "f32le", "-"],
            capture_output=True,
        ).stdout
        audio = np.frombuffer(raw, dtype=np.float32)
        win, hop = 1024, 256
        count = 1 + (len(audio) - win) // hop
        rms = np.array(
            [np.sqrt(np.mean(audio[i * hop:i * hop + win] ** 2) + 1e-12) for i in range(count)]
        )
        onset = np.maximum(0, np.diff(np.log(rms + 1e-9)))
        onset = np.concatenate([[0], onset])
        onset -= onset.mean()
        eff_fps = sr / hop
        low, high = int(0.5 * eff_fps), int(1.3 * eff_fps)
        corr = np.correlate(onset, onset, mode="full")[len(onset) - 1:]
        corr /= corr[0] + 1e-9
        lag = max(range(low, high), key=lambda value: corr[value])
        return 60.0 / (lag / eff_fps)
    except Exception:
        return None


def fit_box(w: int, h: int, cw: int, ch: int):
    scale = min(cw / w, ch / h)
    return round(w * scale), round(h * scale)


def render(img: Image.Image, cw: int, ch: int, bg, scale: float = 1.0) -> Image.Image:
    """把图片等比放进画布居中；scale>1 时以中心放大并裁切。"""
    box_w, box_h = fit_box(img.width, img.height, cw, ch)
    new_w, new_h = round(box_w * scale), round(box_h * scale)
    resized = img.resize((new_w, new_h), Image.LANCZOS)
    x = (cw - new_w) // 2
    y = (ch - new_h) // 2
    canvas = Image.new("RGB", (cw, ch), bg)
    canvas.paste(resized, (x, y))
    return canvas


def render_video(
    pairs,
    end_page_path: str,
    bgm_path: str,
    out_dir: str,
    frames_per: int = 24,
    end_frames: int = 62,
    zoom: float = 0.04,
    width: int = 1080,
    height: int = 1620,
    fps: int = 30,
    bg=(0, 0, 0),
    audio_start=None,
    log=None,
) -> str:
    """pairs 为 [(原图路径, 转绘路径), ...]；返回成片路径。"""
    pairs = list(pairs or [])
    if len(pairs) != 6:
        raise ValueError("需要 6 组原图/转绘图，当前 %s 组。" % len(pairs))
    for before, after in pairs:
        for path in (before, after):
            if not os.path.isfile(path):
                raise ValueError("素材文件不存在：%s" % path)
    if not os.path.isfile(end_page_path):
        raise ValueError("结尾页不存在：%s" % end_page_path)
    if not os.path.isfile(bgm_path):
        raise ValueError("BGM 不存在：%s" % bgm_path)

    frames_per = max(1, int(frames_per))
    end_frames = max(1, int(end_frames))
    zoom = max(0.0, float(zoom))
    fps = max(1, int(fps))
    width = max(2, int(width))
    height = max(2, int(height))

    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "成片_" + datetime.datetime.now().strftime("%Y%m%d_%H%M%S") + ".mp4")

    start = detect_audio_start(bgm_path) if audio_start in (None, "", "自动") else max(0.0, float(audio_start))
    bpm = estimate_bpm(bgm_path)
    _log(log, "BGM：%s，起点 %.3fs" % (os.path.basename(bgm_path), start))
    if bpm:
        expected = 60.0 * fps / frames_per
        _log(log, "估算 BPM %.1f（每张 %s 帧 = %.3fs，理想约 %.0f BPM）" % (bpm, frames_per, frames_per / fps, expected))
        if abs(bpm - expected) > 3:
            _log(log, "提示：BPM 与当前每张时长不匹配，可调整「每张帧数」。")
    else:
        _log(log, "BPM 估算失败，按当前帧数继续。")

    sequences = []
    for index, (before, after) in enumerate(pairs):
        before_img = Image.open(before).convert("RGB")
        after_img = Image.open(after).convert("RGB")
        if zoom > 0:
            sequence = []
            for k in range(frames_per):
                t = k / max(1, frames_per - 1)
                eased = t * t * (3 - 2 * t)
                sequence.append(render(before_img, width, height, bg, 1.0 + zoom * eased).tobytes())
        else:
            sequence = [render(before_img, width, height, bg, 1.0).tobytes()] * frames_per
        sequences.append(sequence)
        sequences.append([render(after_img, width, height, bg, 1.0).tobytes()] * frames_per)
        _log(log, "  %02d %s / %s" % (index + 1, os.path.basename(before), os.path.basename(after)))

    end_seq = [render(Image.open(end_page_path).convert("RGB"), width, height, bg, 1.0).tobytes()] * end_frames
    total_frames = sum(len(seq) for seq in sequences) + len(end_seq)
    _log(log, "总帧数 %s，时长 %.2fs，输出 %sx%s@%sfps" % (total_frames, total_frames / fps, width, height, fps))

    wav_path = os.path.join(out_dir, "_audio_tmp.wav")
    audio = subprocess.run(
        [
            FF, "-y", "-i", bgm_path, "-vn",
            "-af", "atrim=start=%s,asetpts=PTS-STARTPTS,apad=whole_dur=%.3f" % (start, total_frames / fps),
            "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", wav_path,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if audio.returncode != 0 or not os.path.isfile(wav_path):
        raise RuntimeError("音轨处理失败，请检查 BGM 文件。")

    command = [
        FF, "-y",
        "-f", "rawvideo", "-pixel_format", "rgb24", "-video_size", "%sx%s" % (width, height),
        "-framerate", str(fps), "-i", "-", "-i", wav_path,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-pix_fmt", "yuv420p", "-profile:v", "high", "-level", "4.1",
        "-r", str(fps), "-g", "60",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
        "-shortest", "-movflags", "+faststart", out_path,
    ]

    log_path = os.path.join(out_dir, "_ffmpeg_log.txt")
    log_file = open(log_path, "wb")
    proc = subprocess.Popen(
        command, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=log_file
    )
    written = 0
    try:
        for sequence in sequences + [end_seq]:
            for frame in sequence:
                proc.stdin.write(frame)
                written += 1
        proc.stdin.close()
        proc.wait()
    except Exception:
        try:
            proc.kill()
        except OSError:
            pass
        raise
    finally:
        try:
            log_file.close()
        except OSError:
            pass
        try:
            os.remove(wav_path)
        except OSError:
            pass

    if proc.returncode != 0 or not os.path.isfile(out_path):
        detail = ""
        try:
            with open(log_path, encoding="utf-8", errors="ignore") as fh:
                detail = fh.read()[-2000:]
        except OSError:
            pass
        raise RuntimeError("视频编码失败。\n%s" % detail)

    try:
        os.remove(log_path)
    except OSError:
        pass

    size_mb = os.path.getsize(out_path) / 1024 / 1024
    _log(log, "完成：%s（%.2f MB，%s 帧）" % (out_path, size_mb, written))
    return out_path
