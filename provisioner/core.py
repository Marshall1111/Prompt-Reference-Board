"""N1 / 树莓派现场配置工具的核心逻辑：扫描、SSH、上传、执行。"""

from __future__ import annotations

import json
import os
import shlex
import socket
import time
from concurrent.futures import ThreadPoolExecutor

import paramiko


def local_ipv4() -> str:
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.connect(("8.8.8.8", 80))
        ip = sock.getsockname()[0]
        sock.close()
        return ip
    except OSError:
        return ""


def subnet_prefix(ip: str) -> str:
    parts = ip.split(".")
    if len(parts) != 4:
        return ""
    return ".".join(parts[:3]) + "."


def scan_ssh(prefix: str, on_found=None, stop_event=None, timeout: float = 0.7, workers: int = 128):
    """扫描 /24 网段里开放 22 端口的主机。"""

    def probe(index: int):
        if stop_event is not None and stop_event.is_set():
            return None
        host = f"{prefix}{index}"
        try:
            with socket.create_connection((host, 22), timeout=timeout) as sock:
                sock.settimeout(timeout)
                try:
                    banner = sock.recv(128).decode("utf-8", "replace").strip()
                except OSError:
                    banner = ""
                return host, banner
        except OSError:
            return None

    found = []
    with ThreadPoolExecutor(max_workers=workers) as pool:
        for result in pool.map(probe, range(1, 255)):
            if result:
                found.append(result)
                if on_found:
                    on_found(*result)
    return found


class BoxError(RuntimeError):
    pass


class Box:
    """一台盒子上的 SSH 会话。"""

    OFFLINE_TGZ = "/tmp/petpaint-offline.tgz"
    OFFLINE_DIR = "/tmp/petpaint-offline"
    WIFI_JSON = "/tmp/petpaint-wifi.json"
    LOG_PATH = "/tmp/petpaint-provision.log"

    def __init__(self, host: str, username: str, password: str):
        self.host = host
        self.username = username
        self.password = password
        self.client: paramiko.SSHClient | None = None

    # ---------------------------------------------------------------- 连接
    def connect(self) -> None:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            self.host,
            port=22,
            username=self.username,
            password=self.password,
            timeout=10,
            auth_timeout=10,
            banner_timeout=10,
            look_for_keys=False,
            allow_agent=False,
        )
        self.client = client

    def ensure(self) -> None:
        if self.client is None:
            self.connect()
        transport = self.client.get_transport()
        if transport is None or not transport.is_active():
            self.close()
            self.connect()

    def close(self) -> None:
        if self.client is not None:
            try:
                self.client.close()
            except Exception:
                pass
            self.client = None

    # ---------------------------------------------------------------- 命令
    def _wrap_sudo(self, command: str) -> str:
        if self.username == "root":
            return command
        return "sudo -n bash -c " + shlex.quote(command)

    def exec(self, command: str, timeout: int = 120):
        self.ensure()
        wrapped = self._wrap_sudo(command)
        stdin, stdout, stderr = self.client.exec_command(wrapped, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        code = stdout.channel.recv_exit_status()
        return code, out, err

    def check(self, command: str, timeout: int = 120) -> str:
        code, out, err = self.exec(command, timeout=timeout)
        if code != 0:
            raise BoxError((err or out).strip() or f"命令失败（{code}）：{command}")
        return out.strip()

    # ---------------------------------------------------------------- 文件
    def _sftp(self):
        self.ensure()
        return self.client.open_sftp()

    def upload(self, local_path: str, remote_path: str, progress=None, chunk: int = 262144) -> None:
        total = os.path.getsize(local_path)
        done = 0
        sftp = self._sftp()
        try:
            with open(local_path, "rb") as src, sftp.open(remote_path, "wb") as dst:
                dst.set_pipelined(True)
                while True:
                    data = src.read(chunk)
                    if not data:
                        break
                    dst.write(data)
                    done += len(data)
                    if progress:
                        progress(done, total)
        finally:
            sftp.close()

    def write_text(self, remote_path: str, text: str) -> None:
        sftp = self._sftp()
        try:
            with sftp.open(remote_path, "w") as fh:
                fh.write(text)
        finally:
            sftp.close()

    def read_text(self, remote_path: str) -> str:
        sftp = self._sftp()
        try:
            with sftp.open(remote_path, "r") as fh:
                return fh.read().decode("utf-8", "replace")
        finally:
            sftp.close()

    # ---------------------------------------------------------------- 环境
    def system_info(self) -> dict:
        code, out, _ = self.exec(
            "printf '%s\\n' \"$(hostname)\" \"$(dpkg --print-architecture 2>/dev/null)\" "
            "\"$(. /etc/os-release 2>/dev/null; echo $PRETTY_NAME)\" "
            "\"$(findmnt -n -o SOURCE / 2>/dev/null)\"",
            timeout=30,
        )
        lines = out.splitlines() if code == 0 else []
        return {
            "hostname": lines[0] if len(lines) > 0 else "",
            "arch": lines[1] if len(lines) > 1 else "",
            "os": lines[2] if len(lines) > 2 else "",
            "rootfs": lines[3] if len(lines) > 3 else "",
        }

    def printer_present(self) -> bool:
        code, out, _ = self.exec("lpinfo -v 2>/dev/null | grep -ciE 'selphy|cp1500|canon'", timeout=30)
        try:
            return code == 0 and int(out.strip() or 0) > 0
        except ValueError:
            return False

    # ---------------------------------------------------------------- 执行
    def start_provision(
        self,
        tgz_path: str,
        wifi_rows: list[dict],
        server_url: str,
        device_id: str,
        device_token: str,
        queue: str = "cp1500",
        skip_printer: bool = False,
        progress=None,
    ) -> None:
        """上传离线包并以脱离 SSH 的方式启动 provision.sh。"""
        self.upload(tgz_path, self.OFFLINE_TGZ, progress=progress)
        self.write_text(self.WIFI_JSON, json.dumps(wifi_rows, ensure_ascii=False, indent=2))

        args = [
            "--server-url", server_url,
            "--queue", queue,
            "--wifi-json", self.WIFI_JSON,
        ]
        if device_id:
            args += ["--device-id", device_id]
        if device_token:
            args += ["--device-token", device_token]
        if skip_printer:
            args.append("--skip-printer")
        arg_line = " ".join(shlex.quote(item) for item in args)

        inner = (
            f"rm -rf {self.OFFLINE_DIR} && "
            f"tar xzf {self.OFFLINE_TGZ} -C /tmp && "
            f"bash {self.OFFLINE_DIR}/provision.sh {arg_line}; "
            f"echo __EXIT__$?"
        )
        # setsid + nohup：即使 WiFi 切换导致 SSH 断开，脚本也会继续跑完。
        command = (
            f"rm -f {self.LOG_PATH}; "
            f"setsid nohup bash -c {shlex.quote('{ ' + inner + '; } > ' + self.LOG_PATH + ' 2>&1')} "
            f">/dev/null 2>&1 & echo started"
        )
        code, out, err = self.exec(command, timeout=30)
        if code != 0 or "started" not in out:
            raise BoxError((err or out).strip() or "启动 provision.sh 失败")

    def read_log(self) -> str:
        try:
            return self.read_text(self.LOG_PATH)
        except OSError:
            return ""

    def wait_log(self, timeout: int = 1800, interval: float = 1.5, on_chunk=None, stop_event=None):
        """轮询日志直到出现 __EXIT__，返回退出码。"""
        offset = 0
        deadline = time.time() + timeout
        while time.time() < deadline:
            if stop_event is not None and stop_event.is_set():
                raise BoxError("已取消")
            try:
                text = self.read_log()
            except Exception:
                time.sleep(interval)
                continue
            if len(text) > offset:
                chunk = text[offset:]
                offset = len(text)
                if on_chunk:
                    on_chunk(chunk)
            if "__EXIT__" in text:
                marker = text.rsplit("__EXIT__", 1)[-1].strip().splitlines()
                try:
                    return int(marker[0]) if marker else 0
                except ValueError:
                    return 0
            time.sleep(interval)
        raise BoxError("等待 provision.sh 超时")

    def reboot(self) -> None:
        try:
            self.exec("sync; systemctl reboot", timeout=15)
        except Exception:
            pass

    def test_print(self, queue: str = "cp1500") -> str:
        script = (
            "python3 - <<'PY'\n"
            "from PIL import Image, ImageDraw\n"
            "img = Image.new('RGB', (1200, 1800), 'white')\n"
            "d = ImageDraw.Draw(img)\n"
            "for i in range(0, 1800, 100):\n"
            "    d.rectangle([0, i, 1200, i + 99], fill=(30 + i % 200, 120, 200 - i % 150))\n"
            "d.rectangle([0, 0, 1199, 1799], outline='black', width=12)\n"
            "img.save('/tmp/petpaint-test.jpg', quality=95)\n"
            "PY\n"
            f"lp -d {shlex.quote(queue)} /tmp/petpaint-test.jpg"
        )
        return self.check(script, timeout=60)
