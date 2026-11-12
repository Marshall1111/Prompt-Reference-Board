"""现场制作打印代理：心跳上报、领取任务、排版、提交 CUPS、回报结果。

用法：
    python3 agent.py            # 常驻运行（systemd 也用它）
    python3 agent.py --once     # 只跑一轮，便于排查

配置在脚本同目录的 agent.json，首次运行会自动生成模板。
排版复用 print_agent.py 的 layout 能力（--save 只生成不打印），
真正出纸交给 CUPS 队列，这样换硬件时只改 queue 名即可。
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "agent.json"
DEFAULT_CONFIG = {
    "server_url": "http://192.168.31.148:3000",
    "device_id": "dev_replace_me",
    "device_token": "replace_me",
    "printer_name": "hp518",
    # USB 设备的 vendor:product，用于判断打印机是否还插着（CP1500 为 04a9:3302）。
    "usb_id": "04a9:3302",
    "python_bin": "python3",
    "print_script": "print_agent.py",
    "lp_command": "lp",
    "lp_options": ["-o", "media=A4", "-o", "MediaType=Plain", "-o", "OutputMode=Normal"],
    "heartbeat_interval_sec": 30,
    "poll_interval_sec": 8,
    # CUPS 队列清空后，热升华打印机还要继续出纸的时长（秒/张），用于避免提前报“已打印”。
    "print_seconds_per_sheet": 50,
}

# 打印机状态关键字 → 服务端识别的 CUPS reason 标记
REASON_RULES = [
    (("media-empty", "media empty", "out of paper", "缺纸"), "media-empty-error"),
    (("media-jam", "jam", "卡纸"), "media-jam-error"),
    (("cover-open", "cover open", "机盖"), "cover-open-error"),
    (("offline", "离线"), "offline-report"),
]


def log(message: str) -> None:
    print(time.strftime("[%Y-%m-%d %H:%M:%S]"), message, flush=True)


def load_config() -> dict:
    if CONFIG_PATH.exists():
        cfg = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        return {**DEFAULT_CONFIG, **cfg}
    CONFIG_PATH.write_text(
        json.dumps(DEFAULT_CONFIG, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    log(f"已生成配置模板: {CONFIG_PATH}，请填入 device_id / device_token 后重启。")
    return dict(DEFAULT_CONFIG)


# ---------- HTTP ----------
def request(cfg: dict, method: str, path: str, body: dict | None = None) -> dict:
    url = cfg["server_url"].rstrip("/") + path
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {cfg['device_token']}")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8") or "{}")


def download(cfg: dict, path: str, target: Path) -> None:
    url = cfg["server_url"].rstrip("/") + path
    req = urllib.request.Request(url)
    req.add_header("Authorization", f"Bearer {cfg['device_token']}")
    with urllib.request.urlopen(req, timeout=60) as resp, target.open("wb") as fh:
        shutil.copyfileobj(resp, fh)


# ---------- CUPS ----------
def run(cmd: list[str], timeout: float = 30) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def printer_connected(cfg: dict) -> bool:
    """拔线后 CUPS 队列仍显示 idle，且普通用户执行 lpinfo 会 Forbidden，改为直接查 sysfs。"""
    expected = str(cfg.get("usb_id") or "").strip().lower()
    devices_dir = Path("/sys/bus/usb/devices")
    if not expected or not devices_dir.is_dir():
        return True
    try:
        for entry in devices_dir.iterdir():
            vendor_file = entry / "idVendor"
            product_file = entry / "idProduct"
            if not vendor_file.exists() or not product_file.exists():
                continue
            vendor = vendor_file.read_text(encoding="utf-8").strip().lower()
            product = product_file.read_text(encoding="utf-8").strip().lower()
            if f"{vendor}:{product}" == expected:
                return True
    except OSError:
        return True
    return False


def query_printer(cfg: dict) -> tuple[str, list[str]]:
    queue = cfg["printer_name"]
    try:
        brief = run(["lpstat", "-p", queue]).stdout.lower()
        detailed = run(["lpstat", "-l", "-p", queue]).stdout.lower()
    except (OSError, subprocess.SubprocessError):
        return "stopped", ["offline-report"]

    haystack = f"{brief}\n{detailed}"
    if "disabled" in brief or "stopped" in haystack:
        state = "stopped"
    elif "now printing" in brief:
        state = "processing"
    elif "idle" in brief:
        state = "idle"
    else:
        state = "stopped"

    reasons: list[str] = []
    for keywords, reason in REASON_RULES:
        if any(keyword in haystack for keyword in keywords) and reason not in reasons:
            reasons.append(reason)
    if not printer_connected(cfg):
        reasons.append("printer-disconnected")
    return state, reasons


def submit_to_cups(cfg: dict, jpeg: Path) -> str:
    cmd = [cfg["lp_command"], "-d", cfg["printer_name"], *cfg["lp_options"], str(jpeg)]
    result = run(cmd)
    if result.returncode != 0:
        raise RuntimeError((result.stderr or result.stdout or "lp 提交失败").strip())
    # 输出形如：request id is hp518-42 (1 file(s))
    text = result.stdout.strip()
    job_id = text.split("id is", 1)[-1].split()[0] if "id is" in text else ""
    return job_id


def send_heartbeat_quietly(cfg: dict) -> None:
    try:
        heartbeat(cfg)
    except Exception:  # noqa: BLE001 - 心跳失败不能影响出纸
        pass


def wait_cups_job(cfg: dict, job_id: str, timeout: float | None = None) -> None:
    # CUPS 把数据交给热升华打印机后会立刻清空队列，但机器还要几十秒才出完纸，
    # 所以队列清空后再按配置补一段等待，期间持续心跳，避免页面提前显示“已打印”。
    tail = float(cfg.get("print_seconds_per_sheet") or 0)
    if timeout is None:
        timeout = 180.0 + tail
    deadline = time.time() + timeout
    last_beat = 0.0
    while time.time() < deadline:
        if time.time() - last_beat >= 10:
            send_heartbeat_quietly(cfg)
            last_beat = time.time()
        pending = run(["lpstat", "-o", cfg["printer_name"]]).stdout
        if not job_id or job_id not in pending:
            break
        time.sleep(2)
    else:
        raise RuntimeError("打印任务超时未完成，请检查打印机。")

    tail_end = time.time() + min(tail, max(0.0, deadline - time.time()))
    while time.time() < tail_end:
        time.sleep(min(2.0, max(0.0, tail_end - time.time())))
        if time.time() - last_beat >= 10:
            send_heartbeat_quietly(cfg)
            last_beat = time.time()


# ---------- 任务处理 ----------
def compose_layout(cfg: dict, files: list[Path], out: Path) -> None:
    script = str((BASE_DIR / cfg["print_script"]).resolve())
    cmd = [cfg["python_bin"], script, "layout", *[str(p) for p in files], "--save", str(out)]
    result = run(cmd, timeout=180)
    if result.returncode != 0 or not out.exists():
        raise RuntimeError((result.stderr or result.stdout or "排版失败").strip())


def handle_job(cfg: dict, job: dict) -> None:
    job_id = job.get("jobId")
    files = job.get("files") or []
    if not files:
        request(cfg, "POST", f"/api/print-agent/jobs/{job_id}/result", {"status": "failed", "error": "任务没有图片"})
        return

    workdir = Path(tempfile.mkdtemp(prefix=f"print-job-{job_id}-"))
    try:
        local_files = []
        for index, item in enumerate(files):
            target = workdir / f"src-{index}.jpg"
            download(cfg, item["downloadUrl"], target)
            local_files.append(target)

        composed_count = 0
        for page_start in range(0, len(local_files), 4):
            page_files = local_files[page_start:page_start + 4]
            composed = workdir / f"layout-{composed_count + 1}.jpg"
            compose_layout(cfg, page_files, composed)
            cups_job = submit_to_cups(cfg, composed)
            wait_cups_job(cfg, cups_job)
            composed_count += 1
        request(cfg, "POST", f"/api/print-agent/jobs/{job_id}/result", {"status": "printed"})
        log(f"任务 {job_id} 打印完成（{composed_count} 页）")
    except urllib.error.HTTPError as error:
        message = f"HTTP {error.code}: {error.read()[:200].decode('utf-8', 'replace')}"
        request(cfg, "POST", f"/api/print-agent/jobs/{job_id}/result", {"status": "failed", "error": message})
        log(f"任务 {job_id} 处理失败：{message}")
    except Exception as error:  # noqa: BLE001 - 任何异常都要回报给服务端
        message = str(error) or error.__class__.__name__
        request(cfg, "POST", f"/api/print-agent/jobs/{job_id}/result", {"status": "failed", "error": message})
        log(f"任务 {job_id} 处理失败：{message}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def heartbeat(cfg: dict) -> None:
    state, reasons = query_printer(cfg)
    request(cfg, "POST", "/api/print-agent/heartbeat", {"printerState": state, "reasons": reasons})


def run_once(cfg: dict) -> bool:
    heartbeat(cfg)
    payload = request(cfg, "GET", "/api/print-agent/jobs/next")
    job = payload.get("job")
    if not job:
        return False
    handle_job(cfg, job)
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="现场制作打印代理")
    parser.add_argument("--once", action="store_true", help="只执行一轮（心跳 + 尝试领取一个任务）")
    args = parser.parse_args()

    cfg = load_config()
    if cfg["device_token"] in ("", "replace_me"):
        sys.exit("请先在 agent.json 里填入后台创建的 device_id 和 device_token。")

    if args.once:
        run_once(cfg)
        return

    backoff = 0
    while True:
        try:
            did_work = run_once(cfg)
            backoff = 0
            time.sleep(cfg["poll_interval_sec"] if not did_work else 1)
        except KeyboardInterrupt:
            log("收到退出信号，代理已停止。")
            return
        except Exception as error:  # noqa: BLE001 - 常驻进程不能因单次异常退出
            backoff = min(backoff + 1, 6)
            wait = min(60, 5 * (2 ** backoff))
            log(f"轮询异常：{error}，{wait} 秒后重试")
            time.sleep(wait)


if __name__ == "__main__":
    main()
