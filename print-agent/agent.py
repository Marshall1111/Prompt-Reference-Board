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
import hashlib
import json
import os
import shutil
import struct
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from print_agent import _attr, _parse_attrs, custom_paper_origin

BASE_DIR = Path(__file__).resolve().parent
CONFIG_PATH = BASE_DIR / "agent.json"
# 版面/校准参数由服务端下发，单独存于 config.json；agent.json 里的设备身份与连接信息不参与下发。
PRINT_CONFIG_PATH = BASE_DIR / "config.json"
PRINT_CONFIG_PROFILE_KEYS = (
    "sheet_width_mm", "sheet_height_mm", "piece_width_mm", "piece_height_mm",
    "gap_mm", "print_x0_mm", "print_x1_mm", "print_y0_mm", "print_y1_mm",
)
PRINT_CONFIG_NUMERIC_KEYS = ("scale_x", "scale_y", "offset_x_mm", "offset_y_mm")
VERSION_PATH = BASE_DIR / "VERSION"
STATE_PATH = BASE_DIR / "agent-state.json"
UPDATE_PENDING_PATH = BASE_DIR / "update-pending.json"
UPDATE_DIR = BASE_DIR / "updates"
BACKUP_DIR = BASE_DIR / "backup"
AGENT_FILES = ("agent.py", "print_agent.py", "VERSION")
CUSTOM_LAYOUT_MODE = "custom-sheet-v1"
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
    # CUPS 因缺纸等故障停止队列后不会自己恢复，代理检测到停止时按间隔尝试重新启用。
    "auto_recover_queue": True,
    "queue_recover_interval_sec": 180,
}

# 打印机状态关键字 → 服务端识别的 CUPS reason 标记（lpstat 回退路径使用）
REASON_RULES = [
    (("media-empty", "media empty", "out of paper", "缺纸"), "media-empty-error"),
    (("media-jam", "jam", "卡纸"), "media-jam-error"),
    (("cover-open", "cover open", "机盖"), "cover-open-error"),
    (("offline", "离线"), "offline-report"),
]

# CUPS 的 printer-state 枚举值与代理上报用的状态名。
CUPS_IPP_STATE = {3: "idle", 4: "processing", 5: "stopped"}

# CUPS 里个别原因名称与服务端标记不同，统一成服务端认识的写法。
REASON_ALIASES = {
    "media-needed-error": "media-empty-error",
    "media-needed-warning": "media-empty-warning",
}


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


# ---------- 版本与远程更新 ----------
def read_local_version() -> str:
    try:
        return VERSION_PATH.read_text(encoding="utf-8").strip() or "0.0.0"
    except OSError:
        return "0.0.0"


def read_state() -> dict:
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_state(state: dict) -> None:
    STATE_PATH.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def agent_identity() -> dict:
    state = read_state()
    return {
        "agentVersion": read_local_version(),
        "agentReleaseId": str(state.get("releaseId") or ""),
        "agentPreviousVersion": str(state.get("previousVersion") or ""),
        "agentPreviousReleaseId": str(state.get("previousReleaseId") or ""),
        "printConfigRev": int(state.get("printConfigRev") or 0),
    }


def apply_print_config(payload: dict) -> None:
    """把服务端下发的版面/校准参数合并进 config.json，保留 printer_ip 等本地配置。

    print_agent.py 每次执行都会重新读取 config.json，所以写完即时生效，无需重启。
    """
    incoming = payload.get("printConfig")
    if not isinstance(incoming, dict):
        return
    try:
        rev = int(incoming.get("rev") or 0)
    except (TypeError, ValueError):
        return
    state = read_state()
    if rev <= int(state.get("printConfigRev") or 0):
        return
    config = incoming.get("config")
    if not isinstance(config, dict):
        return

    current: dict = {}
    try:
        loaded = json.loads(PRINT_CONFIG_PATH.read_text(encoding="utf-8"))
        if isinstance(loaded, dict):
            current = loaded
    except (OSError, json.JSONDecodeError):
        current = {}
    profile = current.get("profile")
    if not isinstance(profile, dict):
        profile = {}
    incoming_profile = config.get("profile")
    if isinstance(incoming_profile, dict):
        for key in PRINT_CONFIG_PROFILE_KEYS:
            value = incoming_profile.get(key)
            if value is not None:
                try:
                    profile[key] = float(value)
                except (TypeError, ValueError):
                    pass
    current["profile"] = profile
    for key in PRINT_CONFIG_NUMERIC_KEYS:
        value = config.get(key)
        if value is not None:
            try:
                current[key] = float(value)
            except (TypeError, ValueError):
                pass
    media = config.get("media")
    if isinstance(media, str) and media.strip():
        current["media"] = media.strip()
    seconds = config.get("print_seconds_per_sheet")
    if seconds is not None:
        try:
            current["print_seconds_per_sheet"] = int(round(float(seconds)))
        except (TypeError, ValueError):
            pass

    temporary = PRINT_CONFIG_PATH.with_name("config.json.new")
    temporary.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, PRINT_CONFIG_PATH)
    state["printConfigRev"] = rev
    write_state(state)
    log(f"已应用服务端打印参数 rev={rev}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def replace_file(source: Path, target: Path) -> None:
    """先写临时文件再原子替换，避免重启时读到半个文件。"""
    temporary = target.with_name(target.name + ".new")
    shutil.copy2(source, temporary)
    os.replace(temporary, target)


def backup_current_files() -> Path | None:
    target = BACKUP_DIR / time.strftime("%Y%m%d%H%M%S")
    target.mkdir(parents=True, exist_ok=True)
    copied = False
    for name in AGENT_FILES:
        source = BASE_DIR / name
        if source.exists():
            shutil.copy2(source, target / name)
            copied = True
    return target if copied else None


def latest_backup() -> Path | None:
    if not BACKUP_DIR.is_dir():
        return None
    candidates = sorted((path for path in BACKUP_DIR.iterdir() if path.is_dir()), key=lambda path: path.name)
    return candidates[-1] if candidates else None


def report_update(cfg: dict, payload: dict) -> None:
    try:
        request(cfg, "POST", "/api/print-agent/updates/result", payload)
    except Exception as error:  # noqa: BLE001 - 回报失败不能影响更新流程
        log(f"更新结果回报失败：{error}")


def confirm_applied_update(cfg: dict) -> None:
    """重启后第一次心跳成功，才确认更新完成并清掉待确认标记。"""
    if not UPDATE_PENDING_PATH.exists():
        return
    try:
        pending = json.loads(UPDATE_PENDING_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        pending = {}
    report_update(cfg, {
        "kind": str(pending.get("kind") or "release"),
        "releaseId": str(pending.get("releaseId") or ""),
        "version": read_local_version(),
        "state": "succeeded",
    })
    try:
        UPDATE_PENDING_PATH.unlink()
    except OSError:
        pass


def apply_rollback(cfg: dict, update: dict) -> None:
    backup = latest_backup()
    if not backup or not (backup / "agent.py").exists():
        report_update(cfg, {"kind": "rollback", "state": "failed", "error": "设备上没有可回滚的上一版"})
        return
    state = read_state()
    for name in AGENT_FILES:
        source = backup / name
        if source.exists():
            replace_file(source, BASE_DIR / name)
    write_state({
        "releaseId": str(state.get("previousReleaseId") or ""),
        "version": read_local_version(),
        "previousReleaseId": str(state.get("releaseId") or ""),
        "previousVersion": str(state.get("version") or ""),
        "appliedAt": datetime.now(timezone.utc).isoformat(),
    })
    UPDATE_PENDING_PATH.write_text(
        json.dumps({"kind": "rollback", "releaseId": str(state.get("previousReleaseId") or "")}),
        encoding="utf-8",
    )
    report_update(cfg, {"kind": "rollback", "state": "applied", "version": read_local_version()})
    log(f"已回滚到 {read_local_version()}，准备重启")
    os._exit(0)


def apply_release(cfg: dict, update: dict) -> None:
    release_id = str(update.get("releaseId") or "")
    state = read_state()
    if release_id and release_id == str(state.get("releaseId") or ""):
        report_update(cfg, {
            "kind": "release", "releaseId": release_id,
            "state": "succeeded", "version": read_local_version(),
        })
        return

    work = UPDATE_DIR / release_id
    shutil.rmtree(work, ignore_errors=True)
    work.mkdir(parents=True, exist_ok=True)
    archive = work / "agent.tgz"
    staging = work / "staging"
    download(cfg, str(update.get("downloadUrl") or ""), archive)

    expected_size = int(update.get("size") or 0)
    if expected_size and archive.stat().st_size != expected_size:
        raise RuntimeError(f"更新包大小不一致：{archive.stat().st_size} != {expected_size}")
    expected_sha = str(update.get("sha256") or "").lower()
    if expected_sha and sha256_file(archive) != expected_sha:
        raise RuntimeError("更新包校验失败（sha256 不一致）")

    staging.mkdir()
    with tarfile.open(archive, "r:gz") as bundle:
        members = [
            member for member in bundle.getmembers()
            if member.isfile() and Path(member.name).name in AGENT_FILES
        ]
        bundle.extractall(staging, members=members)
    for name in AGENT_FILES:
        if not (staging / name).is_file():
            raise RuntimeError(f"更新包缺少 {name}")

    check = subprocess.run(
        [sys.executable, "-m", "py_compile", str(staging / "agent.py"), str(staging / "print_agent.py")],
        capture_output=True, text=True, timeout=60,
    )
    if check.returncode != 0:
        raise RuntimeError((check.stderr or check.stdout or "新版本编译校验失败").strip()[:300])

    backup_current_files()
    for name in AGENT_FILES:
        replace_file(staging / name, BASE_DIR / name)
    write_state({
        "releaseId": release_id,
        "version": read_local_version(),
        "previousReleaseId": str(state.get("releaseId") or ""),
        "previousVersion": str(state.get("version") or ""),
        "appliedAt": datetime.now(timezone.utc).isoformat(),
    })
    UPDATE_PENDING_PATH.write_text(
        json.dumps({"kind": "release", "releaseId": release_id}), encoding="utf-8"
    )
    report_update(cfg, {
        "kind": "release", "releaseId": release_id,
        "state": "applied", "version": read_local_version(),
    })
    shutil.rmtree(work, ignore_errors=True)
    log(f"已更新到 {read_local_version()}（{release_id}），准备重启")
    os._exit(0)


def apply_update(cfg: dict, update: dict) -> None:
    kind = str(update.get("kind") or "")
    try:
        if kind == "rollback":
            apply_rollback(cfg, update)
        elif kind == "release":
            apply_release(cfg, update)
    except Exception as error:  # noqa: BLE001 - 更新失败要回报并继续用旧版本运行
        message = str(error) or error.__class__.__name__
        shutil.rmtree(UPDATE_DIR / str(update.get("releaseId") or ""), ignore_errors=True)
        report_update(cfg, {
            "kind": kind or "release",
            "releaseId": str(update.get("releaseId") or ""),
            "state": "failed",
            "error": message[:300],
        })
        log(f"更新失败：{message}")



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


def lpstat_printer_status(cfg: dict) -> tuple[str, list[str]]:
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
    return state, reasons


def cups_printer_status(cfg: dict) -> tuple[str, list[str]] | None:
    """从本机 CUPS 的 IPP 接口读取真实状态与原因。

    lpstat 的文本输出不带 printer-state-reasons，缺纸时队列往往仍是 now printing，
    只有 IPP 的 printer-state-reasons 能稳定反映 media-empty / media-jam 等故障。
    """
    queue = cfg["printer_name"]
    printer_uri = f"ipp://localhost:631/printers/{queue}"
    body = b"\x01\x01" + struct.pack(">H", 0x000B) + struct.pack(">I", 1) + b"\x01"
    body += _attr(0x47, "attributes-charset", b"utf-8")
    body += _attr(0x48, "attributes-natural-language", b"zh-cn")
    body += _attr(0x45, "printer-uri", printer_uri.encode())
    body += _attr(0x44, "requested-attributes", b"printer-state")
    body += _attr(0x44, "requested-attributes", b"printer-state-reasons")
    body += _attr(0x44, "requested-attributes", b"printer-is-accepting-jobs")
    body += b"\x03"
    req = urllib.request.Request(
        f"http://localhost:631/printers/{queue}", data=body, headers={"Content-Type": "application/ipp"}
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
    except OSError:
        return None
    if len(data) < 8 or int.from_bytes(data[2:4], "big") >= 0x0400:
        return None

    state = ""
    reasons: list[str] = []
    for tag, name, value in _parse_attrs(data):
        if name == "printer-state" and tag in (0x21, 0x23):
            state = CUPS_IPP_STATE.get(int.from_bytes(value, "big"), "")
        elif name == "printer-state-reasons":
            reason = value.decode("utf-8", "replace").strip()
            if reason and reason != "none":
                reasons.append(REASON_ALIASES.get(reason, reason))
    if not state:
        return None
    return state, reasons


def query_printer(cfg: dict) -> tuple[str, list[str]]:
    result = cups_printer_status(cfg)
    state, reasons = result if result else lpstat_printer_status(cfg)
    if not printer_connected(cfg):
        reasons.append("printer-disconnected")
    return state, list(dict.fromkeys(reasons))


_queue_recovery_at = 0.0


def maybe_recover_queue(cfg: dict, state: str) -> bool:
    """CUPS 因报错停队列后不会自动恢复，故障排除后由代理重新启用。"""
    global _queue_recovery_at
    if not cfg.get("auto_recover_queue", True):
        return False
    if state != "stopped":
        _queue_recovery_at = 0.0
        return False
    if not printer_connected(cfg):
        return False
    interval = float(cfg.get("queue_recover_interval_sec") or 180)
    if time.time() - _queue_recovery_at < interval:
        return False
    _queue_recovery_at = time.time()
    queue = cfg["printer_name"]
    enable = run(["cupsenable", queue])
    run(["cupsaccept", queue])
    if enable.returncode == 0:
        log(f"打印机队列 {queue} 已重新启用")
        return True
    log(f"打印机队列 {queue} 自动恢复失败：{(enable.stderr or enable.stdout).strip()}")
    return False


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
        # 出纸等待期间不做队列恢复，避免把正在等待的任务重新拉起。
        heartbeat(cfg, allow_recovery=False)
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
        # 超时后取消队列里的残留任务，避免补纸后把已判定失败的任务又打出来。
        if job_id:
            run(["cancel", job_id])
        raise RuntimeError("打印任务超时未完成，请检查打印机。")

    tail_end = time.time() + min(tail, max(0.0, deadline - time.time()))
    while time.time() < tail_end:
        time.sleep(min(2.0, max(0.0, tail_end - time.time())))
        if time.time() - last_beat >= 10:
            send_heartbeat_quietly(cfg)
            last_beat = time.time()


# ---------- 任务处理 ----------
def compose_layout(cfg: dict, files: list[Path], out: Path, mode: str = "layout") -> None:
    script = str((BASE_DIR / cfg["print_script"]).resolve())
    cmd = [cfg["python_bin"], script, mode, *[str(p) for p in files], "--save", str(out)]
    result = run(cmd, timeout=180)
    if result.returncode != 0 or not out.exists():
        raise RuntimeError((result.stderr or result.stdout or "排版失败").strip())


def supported_layout_modes(cfg: dict) -> list[str]:
    modes = ["2up"]
    try:
        layout_cfg = json.loads((BASE_DIR / "config.json").read_text(encoding="utf-8"))
        custom_paper_origin(layout_cfg)
        options = " ".join(cfg.get("lp_options") or []).lower()
        if "postcard" in options and "print-scaling=none" in options:
            modes.append(CUSTOM_LAYOUT_MODE)
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return modes


def print_custom_job(cfg: dict, job: dict, files: list[Path], workdir: Path) -> int:
    if CUSTOM_LAYOUT_MODE not in supported_layout_modes(cfg):
        raise RuntimeError("当前设备不支持100×148毫米自定义版面")
    copies = job.get("copies", 1)
    completed = job.get("completedCopies", 0)
    if len(files) != 1 or not isinstance(copies, int) or not isinstance(completed, int) or not 0 <= completed <= copies <= 20:
        raise RuntimeError("自定义打印任务参数无效")
    composed = workdir / "custom-sheet.jpg"
    compose_layout(cfg, files, composed, "custom-sheet")
    for index in range(completed, copies):
        # Acknowledge the lease before putting another physical sheet through.
        request(cfg, "POST", f"/api/print-agent/jobs/{job['jobId']}/progress", {"completedCopies": index, "attempt": job["attempt"]})
        cups_job = submit_to_cups(cfg, composed)
        wait_cups_job(cfg, cups_job)
        request(cfg, "POST", f"/api/print-agent/jobs/{job['jobId']}/progress", {"completedCopies": index + 1, "attempt": job["attempt"]})
    return copies - completed


def handle_job(cfg: dict, job: dict) -> None:
    job_id = job.get("jobId")
    files = job.get("files") or []
    result_fields = {"attempt": job.get("attempt")} if job.get("layoutMode") == CUSTOM_LAYOUT_MODE else {}
    if not files:
        request(cfg, "POST", f"/api/print-agent/jobs/{job_id}/result", {"status": "failed", "error": "任务没有图片", **result_fields})
        return

    workdir = Path(tempfile.mkdtemp(prefix=f"print-job-{job_id}-"))
    try:
        local_files = []
        for index, item in enumerate(files):
            target = workdir / f"src-{index}.jpg"
            download(cfg, item["downloadUrl"], target)
            local_files.append(target)

        composed_count = 0
        if job.get("layoutMode") == CUSTOM_LAYOUT_MODE:
            composed_count = print_custom_job(cfg, job, local_files, workdir)
        elif job.get("layoutMode", "2up") == "2up":
            for page_start in range(0, len(local_files), 4):
                page_files = local_files[page_start:page_start + 4]
                composed = workdir / f"layout-{composed_count + 1}.jpg"
                compose_layout(cfg, page_files, composed)
                cups_job = submit_to_cups(cfg, composed)
                wait_cups_job(cfg, cups_job)
                composed_count += 1
        else:
            raise RuntimeError("不支持的打印版面模式")
        request(cfg, "POST", f"/api/print-agent/jobs/{job_id}/result", {"status": "printed", **result_fields})
        log(f"任务 {job_id} 打印完成（{composed_count} 页）")
    except urllib.error.HTTPError as error:
        message = f"HTTP {error.code}: {error.read()[:200].decode('utf-8', 'replace')}"
        request(cfg, "POST", f"/api/print-agent/jobs/{job_id}/result", {"status": "failed", "error": message, **result_fields})
        log(f"任务 {job_id} 处理失败：{message}")
    except Exception as error:  # noqa: BLE001 - 任何异常都要回报给服务端
        message = str(error) or error.__class__.__name__
        request(cfg, "POST", f"/api/print-agent/jobs/{job_id}/result", {"status": "failed", "error": message, **result_fields})
        log(f"任务 {job_id} 处理失败：{message}")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


def heartbeat(cfg: dict, allow_recovery: bool = True) -> dict:
    state, reasons = query_printer(cfg)
    if allow_recovery and maybe_recover_queue(cfg, state):
        state, reasons = query_printer(cfg)
    payload = request(cfg, "POST", "/api/print-agent/heartbeat", {
        "printerState": state,
        "reasons": reasons,
        "supportedLayoutModes": supported_layout_modes(cfg),
        "firmwareVersion": "custom-sheet-v1",
        **agent_identity(),
    })
    # 心跳成功说明新版本已能正常运行，此时才确认更新完成。
    confirm_applied_update(cfg)
    return payload


def run_once(cfg: dict) -> bool:
    payload = heartbeat(cfg) or {}
    update = payload.get("update")
    if isinstance(update, dict) and update:
        apply_update(cfg, update)
    apply_print_config(payload)
    modes = ",".join(supported_layout_modes(cfg))
    payload = request(cfg, "GET", f"/api/print-agent/jobs/next?layoutModes={modes}")
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
