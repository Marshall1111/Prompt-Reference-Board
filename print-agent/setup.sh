#!/usr/bin/env bash
# CP1500 打印代理一键部署（Raspberry Pi OS / Armbian N1）
# 用法见文件末尾或 `./setup.sh --help`，重复执行是安全的。
set -euo pipefail

QUEUE_NAME="cp1500"
SERVER_URL=""
DEVICE_ID=""
DEVICE_TOKEN=""
GUTENPRINT_VERSION="5.3.5"

usage() {
  cat <<'EOF'
用法：
  sudo ./setup.sh [选项]

选项：
  --server-url <url>      网站地址，例如 https://www.petpaint.top
  --device-id <id>        后台创建的打印设备 ID（dev_ 开头）
  --device-token <token>  设备令牌
  --queue <name>          CUPS 队列名，默认 cp1500
  -h, --help              显示帮助

说明：
  不传 --device-id / --device-token 时只安装驱动、CUPS 队列和服务，
  不会启动 print-agent，避免拿不到任务空转。
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --server-url) SERVER_URL="${2:?--server-url 缺少参数}"; shift 2 ;;
    --device-id) DEVICE_ID="${2:?--device-id 缺少参数}"; shift 2 ;;
    --device-token) DEVICE_TOKEN="${2:?--device-token 缺少参数}"; shift 2 ;;
    --queue) QUEUE_NAME="${2:?--queue 缺少参数}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage; exit 1 ;;
  esac
done

if [ "$EUID" -ne 0 ]; then
  exec sudo bash "$0" "$@"
fi

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -n "${SUDO_USER:-}" ]; then
  RUN_USER="$SUDO_USER"
elif id pi >/dev/null 2>&1; then
  RUN_USER="pi"
else
  RUN_USER="$(id -un)"
fi

log() { echo -e "\n==> $*"; }

log "安装系统依赖"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  cups cups-client python3-pil \
  build-essential pkg-config gettext libtool wget xz-utils \
  libcups2-dev libcupsimage2-dev libusb-1.0-0-dev libglib2.0-dev

systemctl enable --now cups

log "屏蔽 usblp 与 ipp-usb（否则 CUPS 抢不到 CP1500 的 USB 接口）"
printf 'blacklist usblp\n' > /etc/modprobe.d/blacklist-usblp.conf
modprobe -r usblp 2>/dev/null || true
systemctl stop ipp-usb 2>/dev/null || true
systemctl mask ipp-usb 2>/dev/null || true
systemctl restart cups

# 系统仓库自带的 Gutenprint 通常没有 CP1500，需要 5.3.5 及以上版本。
if lpinfo -m 2>/dev/null | grep -qi 'cp1500'; then
  log "已存在 CP1500 驱动，跳过 Gutenprint 编译"
else
  log "编译安装 Gutenprint ${GUTENPRINT_VERSION}（耗时较长）"
  BUILD_DIR="$(mktemp -d)"
  trap 'rm -rf "$BUILD_DIR"' EXIT
  ARCHIVE="$BUILD_DIR/gutenprint.tar.xz"
  for url in \
    "https://downloads.sourceforge.net/project/gimp-print/gutenprint-5.3/${GUTENPRINT_VERSION}/gutenprint-${GUTENPRINT_VERSION}.tar.xz" \
    "https://sourceforge.net/projects/gimp-print/files/gutenprint-5.3/${GUTENPRINT_VERSION}/gutenprint-${GUTENPRINT_VERSION}.tar.xz/download"; do
    if wget -q --timeout=30 -O "$ARCHIVE" "$url"; then
      break
    fi
  done
  if [ ! -s "$ARCHIVE" ]; then
    echo "Gutenprint 下载失败，请手动下载 gutenprint-${GUTENPRINT_VERSION}.tar.xz 后重试。" >&2
    exit 1
  fi
  tar -xJf "$ARCHIVE" -C "$BUILD_DIR" --strip-components=1
  (
    cd "$BUILD_DIR"
    ./configure --without-doc
    make -j"$(nproc)"
    make install
  )
  ldconfig
  systemctl restart cups
fi

log "查找 CP1500 的 USB 设备地址"
USB_URI="$(lpinfo -v 2>/dev/null | awk '/^direct usb:\/\//{print $2}' | grep -iE 'selphy|cp1500' | head -n1 || true)"
if [ -z "$USB_URI" ]; then
  USB_URI="$(lpinfo -v 2>/dev/null | awk '/^direct usb:\/\//{print $2}' | head -n1 || true)"
fi
if [ -z "$USB_URI" ]; then
  echo "没有发现 USB 打印机。请确认 CP1500 已开机并用 USB 线直连，然后重新执行本脚本。" >&2
  exit 1
fi
case "$USB_URI" in
  *serial=*) ;;
  *) echo "警告：$USB_URI 不含序列号，换机后队列可能错位，建议使用带 serial= 的地址。" >&2 ;;
esac

log "创建 CUPS 队列 ${QUEUE_NAME}"
PPD="$(lpinfo -m 2>/dev/null | grep -i 'cp1500' | head -n1 | awk '{print $1}' || true)"
if [ -z "$PPD" ]; then
  echo "没有找到 CP1500 的 PPD，请确认 Gutenprint 版本不低于 ${GUTENPRINT_VERSION}。" >&2
  exit 1
fi
lpadmin -p "$QUEUE_NAME" -E -v "$USB_URI" -m "$PPD"
lpadmin -p "$QUEUE_NAME" -o PageSize=Postcard -o StpBorderless=True
cupsenable "$QUEUE_NAME"
cupsaccept "$QUEUE_NAME"

log "安装 print-agent"
chmod +x "$AGENT_DIR/agent.py" "$AGENT_DIR/print_agent.py"
sed -e "s#^User=.*#User=${RUN_USER}#" \
    -e "s#/home/pi/print-agent#${AGENT_DIR}#g" \
    "$AGENT_DIR/print-agent.service" > /etc/systemd/system/print-agent.service
systemctl daemon-reload
systemctl enable print-agent

if [ -n "$SERVER_URL" ] && [ -n "$DEVICE_ID" ] && [ -n "$DEVICE_TOKEN" ]; then
  log "写入 agent.json"
  python3 - "$AGENT_DIR/agent.json" "$SERVER_URL" "$DEVICE_ID" "$DEVICE_TOKEN" "$QUEUE_NAME" <<'PY'
import json
import os
import sys

path, server_url, device_id, token, queue = sys.argv[1:6]
data = {}
if os.path.exists(path):
    try:
        with open(path, encoding="utf-8") as fh:
            data = json.load(fh)
    except (OSError, json.JSONDecodeError):
        data = {}
data.update({
    "server_url": server_url.rstrip("/"),
    "device_id": device_id,
    "device_token": token,
    "printer_name": queue,
})
with open(path, "w", encoding="utf-8") as fh:
    json.dump(data, fh, ensure_ascii=False, indent=2)
    fh.write("\n")
PY
  chown "$RUN_USER": "$AGENT_DIR/agent.json"
  chmod 600 "$AGENT_DIR/agent.json"

  log "启动 print-agent"
  systemctl restart print-agent
  sleep 3
  systemctl is-active print-agent || true
else
  log "未提供设备凭据，print-agent 暂不启动"
  echo "请到后台「信息维护 - 打印设备」复制配置命令写入 agent.json，然后执行："
  echo "  sudo systemctl restart print-agent"
fi

log "完成"
echo "队列状态："
lpstat -p "$QUEUE_NAME" || true
echo
echo "后续操作："
echo "  校准出纸：cd $AGENT_DIR && sudo -u $RUN_USER python3 print_agent.py calibrate"
echo "  查看日志：journalctl -u print-agent -f"
