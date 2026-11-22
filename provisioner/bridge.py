"""本地 HTTP 桥接服务：浏览器后台通过 127.0.0.1 调用，复用 core 的 SSH 能力。

只监听 loopback，密码只保存在内存里，不落盘、不回显到日志。
"""

from __future__ import annotations

import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from core import Box, BoxError, find_offline_package, local_ipv4, scan_ssh, subnet_prefix

VERSION = "1.0.0"
DEFAULT_PORT = 8791
MAX_BODY = 1024 * 1024
LOG_LIMIT = 200 * 1024
ALLOWED_ORIGINS = {
    "https://petpaint.top",
    "https://www.petpaint.top",
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://localhost:3000",
}


class BridgeState:
    def __init__(self):
        self.lock = threading.Lock()
        self.box: Box | None = None
        self.device: dict = {}
        self.status = "idle"
        self.progress = 0
        self.log = ""
        self.error = ""
        self.job_id = ""
        self.worker: threading.Thread | None = None
        self.stop_event = threading.Event()

    def close_box(self):
        if self.box is not None:
            self.box.close()
        self.box = None
        self.device = {}

    def append_log(self, chunk: str):
        with self.lock:
            self.log += chunk
            if len(self.log) > LOG_LIMIT:
                self.log = self.log[-LOG_LIMIT:]


STATE = BridgeState()


def _offline_package() -> str:
    return find_offline_package()


def _health() -> dict:
    offline = _offline_package()
    return {
        "ok": True,
        "app": "petpaint-provisioner-bridge",
        "version": VERSION,
        "localIp": local_ipv4(),
        "offlinePackage": {"name": offline.rsplit("\\", 1)[-1].rsplit("/", 1)[-1], "path": offline} if offline else None,
        "device": STATE.device or None,
    }


class BridgeHandler(BaseHTTPRequestHandler):
    server_version = f"PetpaintProvisionerBridge/{VERSION}"

    def log_message(self, fmt, *args):  # 静默访问日志，避免把 URL 参数写进文件
        return

    # ------------------------------------------------------------ 基础响应
    def _origin(self) -> str:
        return str(self.headers.get("Origin") or "").strip()

    def _origin_allowed(self) -> bool:
        origin = self._origin()
        return not origin or origin in ALLOWED_ORIGINS

    def _set_cors(self):
        origin = self._origin()
        if origin and origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
            if self.headers.get("Access-Control-Request-Private-Network"):
                self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self._set_cors()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        content_type = str(self.headers.get("Content-Type") or "").split(";")[0].strip().lower()
        if content_type != "application/json":
            raise ValueError("请求必须使用 application/json。")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            raise ValueError("无效的 Content-Length。")
        if length <= 0 or length > MAX_BODY:
            raise ValueError("请求体为空或过大。")
        raw = self.rfile.read(length)
        try:
            payload = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ValueError("请求体不是合法 JSON。")
        return payload if isinstance(payload, dict) else {}

    # ------------------------------------------------------------ 路由
    def do_OPTIONS(self):
        if not self._origin_allowed():
            self._json(403, {"ok": False, "message": "origin 不被允许。"})
            return
        self.send_response(204)
        self._set_cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        if not self._origin_allowed():
            self._json(403, {"ok": False, "message": "origin 不被允许。"})
            return
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/health":
                self._json(200, _health())
                return
            if parsed.path == "/api/provision/status":
                query = parse_qs(parsed.query)
                try:
                    offset = int((query.get("offset") or ["0"])[0])
                except ValueError:
                    offset = 0
                with STATE.lock:
                    reset = offset < 0 or offset > len(STATE.log)
                    if reset:
                        offset = 0
                    chunk = STATE.log[offset:]
                    payload = {
                        "status": STATE.status,
                        "progress": STATE.progress,
                        "chunk": chunk,
                        "offset": len(STATE.log),
                        "reset": reset,
                        "done": STATE.status in ("succeeded", "failed"),
                        "error": STATE.error,
                        "jobId": STATE.job_id,
                    }
                self._json(200, payload)
                return
            self._json(404, {"ok": False, "message": "接口不存在。"})
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"ok": False, "message": str(exc)})

    def do_POST(self):
        if not self._origin_allowed():
            self._json(403, {"ok": False, "message": "origin 不被允许。"})
            return
        parsed = urlparse(self.path)
        routes = {
            "/api/scan": self._scan,
            "/api/connect": self._connect,
            "/api/disconnect": self._disconnect,
            "/api/wifi": self._wifi,
            "/api/provision": self._provision,
            "/api/reboot": self._reboot,
            "/api/test-print": self._test_print,
        }
        handler = routes.get(parsed.path)
        if handler is None:
            self._json(404, {"ok": False, "message": "接口不存在。"})
            return
        try:
            payload = self._read_json()
            handler(payload)
        except ValueError as exc:
            self._json(400, {"ok": False, "message": str(exc)})
        except BoxError as exc:
            self._json(400, {"ok": False, "message": str(exc)})
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"ok": False, "message": str(exc)})

    # ------------------------------------------------------------ 具体实现
    def _scan(self, payload: dict):
        prefix = str(payload.get("prefix") or "").strip()
        if not prefix:
            prefix = subnet_prefix(local_ipv4())
        if not prefix:
            raise ValueError("无法识别本机网段，请手动填写 IP。")
        devices = [
            {"host": host, "hostname": hostname, "banner": banner}
            for host, banner, hostname in scan_ssh(prefix)
        ]
        self._json(200, {"ok": True, "prefix": prefix, "devices": devices})

    def _connect(self, payload: dict):
        host = str(payload.get("host") or "").strip()
        username = str(payload.get("username") or "root").strip() or "root"
        password = str(payload.get("password") or "")
        if not host:
            raise ValueError("缺少 IP 地址。")
        if not password:
            raise ValueError("缺少登录密码。")
        with STATE.lock:
            STATE.close_box()
            box = Box(host, username, password)
            box.connect()
            info = box.system_info()
            device = {
                "host": host,
                "hostname": info.get("hostname", ""),
                "arch": info.get("arch", ""),
                "os": info.get("os", ""),
                "rootfs": info.get("rootfs", ""),
                "printerPresent": box.printer_present(),
            }
            wifi = box.list_wifi()
            STATE.box = box
            STATE.device = device
        self._json(200, {"ok": True, "device": device, "wifi": wifi})

    def _disconnect(self, _payload: dict):
        with STATE.lock:
            if STATE.status == "running":
                raise BoxError("正在执行配置，无法断开连接。")
            STATE.close_box()
        self._json(200, {"ok": True})

    def _wifi(self, payload: dict):
        box = STATE.box
        if box is None:
            raise BoxError("尚未连接盒子。")
        action = str(payload.get("action") or "save").strip()
        if action == "delete":
            conn = str(payload.get("conn") or "").strip()
            if not conn:
                raise ValueError("缺少连接名。")
            box.delete_wifi(conn)
        else:
            ssid = str(payload.get("ssid") or "").strip()
            if not ssid:
                raise ValueError("SSID 不能为空。")
            priority = int(payload.get("priority") or 0)
            hidden = bool(payload.get("hidden"))
            box.save_wifi(
                str(payload.get("conn") or "").strip(),
                ssid,
                str(payload.get("password") or ""),
                priority,
                hidden,
            )
        self._json(200, {"ok": True, "wifi": box.list_wifi()})

    def _provision(self, payload: dict):
        box = STATE.box
        if box is None:
            raise BoxError("尚未连接盒子。")
        if STATE.status == "running":
            raise BoxError("已有配置任务正在执行。")
        offline = _offline_package()
        if not offline:
            raise ValueError("未找到离线包，请把 petpaint-offline-*.tgz 放到助手目录的 offline 文件夹。")
        device_id = str(payload.get("deviceId") or "").strip()
        if not device_id:
            raise ValueError("缺少设备 ID。")
        wifi_rows = [row for row in (payload.get("wifi") or []) if str(row.get("ssid") or "").strip()]
        if not wifi_rows:
            raise ValueError("请至少配置一条 WiFi。")
        server_url = str(payload.get("serverUrl") or "https://www.petpaint.top").strip()
        queue = str(payload.get("queue") or "cp1500").strip() or "cp1500"
        skip_printer = bool(payload.get("skipPrinter"))
        token = str(payload.get("token") or "")

        with STATE.lock:
            STATE.stop_event = threading.Event()
            STATE.status = "running"
            STATE.progress = 0
            STATE.log = ""
            STATE.error = ""
            STATE.job_id = f"bridge-{int(time.time() * 1000)}"

        def upload_progress(done: int, total: int):
            percent = int(done * 40 / total) if total else 0
            with STATE.lock:
                STATE.progress = max(STATE.progress, percent)

        def on_chunk(chunk: str):
            STATE.append_log(chunk)
            with STATE.lock:
                STATE.progress = max(STATE.progress, 90)

        def worker():
            try:
                STATE.append_log("上传离线包…\n")
                box.start_provision(
                    offline,
                    wifi_rows,
                    server_url,
                    device_id,
                    token,
                    queue=queue,
                    skip_printer=skip_printer,
                    progress=upload_progress,
                )
                with STATE.lock:
                    STATE.progress = max(STATE.progress, 45)
                STATE.append_log("离线包已上传，开始执行 provision.sh…\n")
                code = box.wait_log(on_chunk=on_chunk, stop_event=STATE.stop_event)
                with STATE.lock:
                    STATE.progress = 100
                    if code == 0:
                        STATE.status = "succeeded"
                        STATE.error = ""
                    else:
                        STATE.status = "failed"
                        STATE.error = f"provision.sh 退出码 {code}"
            except Exception as exc:  # noqa: BLE001
                with STATE.lock:
                    STATE.status = "failed"
                    STATE.progress = 100
                    STATE.error = str(exc)
                STATE.append_log(f"\n连接/执行异常：{exc}\n")
                STATE.append_log("如果 WiFi 切换后 SSH 断开，请重新扫描并连接盒子，日志仍在 /tmp/petpaint-provision.log\n")
            finally:
                with STATE.lock:
                    STATE.worker = None

        thread = threading.Thread(target=worker, daemon=True)
        with STATE.lock:
            STATE.worker = thread
        thread.start()
        self._json(200, {"ok": True, "jobId": STATE.job_id})

    def _reboot(self, _payload: dict):
        box = STATE.box
        if box is None:
            raise BoxError("尚未连接盒子。")
        box.reboot()
        self._json(200, {"ok": True})

    def _test_print(self, payload: dict):
        box = STATE.box
        if box is None:
            raise BoxError("尚未连接盒子。")
        queue = str(payload.get("queue") or "cp1500").strip() or "cp1500"
        output = box.test_print(queue)
        self._json(200, {"ok": True, "output": output})


def serve(port: int = DEFAULT_PORT):
    port = int(port or DEFAULT_PORT)
    server = ThreadingHTTPServer(("127.0.0.1", port), BridgeHandler)
    server.daemon_threads = True
    print(f"Petpaint 本地桥接助手已启动：http://127.0.0.1:{port}")
    print(f"离线包：{_offline_package() or '未找到'}")
    print("保持本窗口打开；在后台「设备库存 → 配置」中继续操作。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        STATE.close_box()
        server.server_close()


if __name__ == "__main__":
    serve()
