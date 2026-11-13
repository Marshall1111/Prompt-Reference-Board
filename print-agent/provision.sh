#!/usr/bin/env bash
# Petpaint N1 现场配置脚本（离线优先，可重复执行）
#
# 由 Windows EXE 通过 SSH 调用，也可手动执行：
#   sudo bash provision.sh \
#     --server-url https://www.petpaint.top \
#     --device-id dev_xxxxxxxx \
#     --device-token xxxxxxxxxxxx \
#     --wifi-json /tmp/petpaint-wifi.json
#
# 不传 --device-id/--device-token 时只安装环境和 WiFi，不启动 print-agent。
# 不传 --wifi-json 时跳过 WiFi 配置。
# 没有接打印机时加 --skip-printer，只跳过打印队列创建。
set -euo pipefail

QUEUE_NAME="cp1500"
SERVER_URL=""
DEVICE_ID=""
DEVICE_TOKEN=""
WIFI_JSON=""
SKIP_PRINTER=0
SKIP_WIFI=0
OFFLINE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
用法：
  sudo bash provision.sh [选项]

选项：
  --server-url <url>       网站地址，例如 https://www.petpaint.top
  --device-id <id>         后台设备库存创建的设备 ID（dev_ 开头）
  --device-token <token>   设备令牌
  --queue <name>           CUPS 队列名，默认 cp1500
  --wifi-json <path>       WiFi 配置 JSON 文件
  --offline-dir <path>     离线包目录，默认脚本所在目录
  --skip-printer           没有接打印机时跳过队列创建
  --skip-wifi              跳过 WiFi 配置
  -h, --help               显示帮助
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --server-url) SERVER_URL="${2:?--server-url 缺少参数}"; shift 2 ;;
    --device-id) DEVICE_ID="${2:?--device-id 缺少参数}"; shift 2 ;;
    --device-token) DEVICE_TOKEN="${2:?--device-token 缺少参数}"; shift 2 ;;
    --queue) QUEUE_NAME="${2:?--queue 缺少参数}"; shift 2 ;;
    --wifi-json) WIFI_JSON="${2:?--wifi-json 缺少参数}"; shift 2 ;;
    --offline-dir) OFFLINE_DIR="${2:?--offline-dir 缺少参数}"; shift 2 ;;
    --skip-printer) SKIP_PRINTER=1; shift ;;
    --skip-wifi) SKIP_WIFI=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "未知参数：$1" >&2; usage; exit 1 ;;
  esac
done

if [ "$EUID" -ne 0 ]; then
  exec sudo bash "$0" "$@"
fi

if [ -n "${SUDO_USER:-}" ]; then
  RUN_USER="$SUDO_USER"
elif id pi >/dev/null 2>&1; then
  RUN_USER="pi"
else
  RUN_USER="root"
fi

log() { echo -e "\n==> $*"; }
warn() { echo "警告：$*" >&2; }
die() { echo "错误：$*" >&2; exit 1; }

[ -d "$OFFLINE_DIR" ] || die "离线包目录不存在：$OFFLINE_DIR"

# ---------------------------------------------------------------- 1. 预检
log "预检系统"
ARCH="$(dpkg --print-architecture)"
[ "$ARCH" = "arm64" ] || die "当前架构是 $ARCH，离线包只支持 arm64"
command -v nmcli >/dev/null || die "没有 NetworkManager（nmcli），请确认系统是 Armbian/Debian 12"
echo "架构 $ARCH，系统 $(. /etc/os-release; echo "$PRETTY_NAME")"

# ---------------------------------------------------------------- 2. 修复 WiFi 插件
# Armbian 社区镜像里 NetworkManager 的 WiFi 插件属主经常不是 root，
# 会被 NM 判定为非法文件并跳过，导致 wlan0 一直是 unmanaged。
log "修复 NetworkManager WiFi 插件"
NM_PLUGIN_DIR="$(dirname "$(find /usr/lib -name 'libnm-device-plugin-wifi.so' 2>/dev/null | head -n1)")"
if [ -n "$NM_PLUGIN_DIR" ] && [ "$NM_PLUGIN_DIR" != "." ]; then
  OWNER="$(stat -c '%U:%G' "$NM_PLUGIN_DIR")"
  if [ "$OWNER" != "root:root" ]; then
    chown -R root:root "$NM_PLUGIN_DIR"
    systemctl restart NetworkManager
    sleep 3
    echo "已修正 $NM_PLUGIN_DIR 属主（原为 $OWNER）并重启 NetworkManager"
  else
    echo "WiFi 插件属主正常，跳过"
  fi
fi
rfkill unblock wifi 2>/dev/null || true

# ---------------------------------------------------------------- 3. 本地 apt 源
log "安装 CUPS 与基础依赖（本地离线源）"
DEB_DIR="$OFFLINE_DIR/debs"
if ! ls "$DEB_DIR"/*.deb >/dev/null 2>&1; then
  die "离线包不完整：$DEB_DIR 下没有 .deb 文件"
fi
LIST_FILE="/etc/apt/sources.list.d/petpaint-offline.list"
printf 'deb [trusted=yes] file:%s ./\n' "$DEB_DIR" > "$LIST_FILE"
APT_LOCAL=(-o Dir::Etc::sourcelist="$LIST_FILE" -o Dir::Etc::sourceparts="-" -o APT::Get::List-Cleanup=0 -o Acquire::Retries=0)
apt-get "${APT_LOCAL[@]}" update -qq
export DEBIAN_FRONTEND=noninteractive
apt-get "${APT_LOCAL[@]}" install -y --no-install-recommends cups cups-client cups-filters python3-pil
systemctl enable --now cups

# ---------------------------------------------------------------- 4. Gutenprint
log "检查 CP1500 驱动"
if lpinfo -m 2>/dev/null | grep -qi 'cp1500'; then
  echo "已存在 CP1500 驱动，跳过"
else
  if dpkg -s printer-driver-gutenprint >/dev/null 2>&1; then
    echo "移除 Debian 自带的旧版 Gutenprint（不支持 CP1500）"
    apt-get purge -y printer-driver-gutenprint libgutenprint9 >/dev/null 2>&1 || true
  fi
  GP_DEB="$(ls "$OFFLINE_DIR"/gutenprint/gutenprint-cp1500_*.deb 2>/dev/null | head -n1 || true)"
  [ -n "$GP_DEB" ] || die "离线包缺少 Gutenprint：$OFFLINE_DIR/gutenprint/"
  dpkg -i "$GP_DEB"
  ldconfig
  systemctl restart cups
  sleep 2
  lpinfo -m 2>/dev/null | grep -qi 'cp1500' || die "Gutenprint 安装后仍找不到 CP1500 的 PPD"
fi

# ---------------------------------------------------------------- 5. USB 抢占
log "屏蔽 usblp 与 ipp-usb"
printf 'blacklist usblp\n' > /etc/modprobe.d/blacklist-usblp.conf
modprobe -r usblp 2>/dev/null || true
systemctl stop ipp-usb 2>/dev/null || true
systemctl mask ipp-usb 2>/dev/null || true
systemctl restart cups

# ---------------------------------------------------------------- 6. CUPS 队列
log "配置 CUPS 队列 $QUEUE_NAME"
# CUPS 可能暴露两种 URI：direct usb://（usb 后端）或
# direct gutenprint53+usb://canon-cp1500/<序列号>（Gutenprint 自带后端，带序列号更稳）。
USB_URI="$(lpinfo -v 2>/dev/null | awk '/^direct (usb|gutenprint53\+usb):\/\//{print $2}' | grep -iE 'selphy|cp1500|canon' | head -n1 || true)"
if [ -z "$USB_URI" ]; then
  USB_URI="$(lpinfo -v 2>/dev/null | awk '/^direct usb:\/\//{print $2}' | head -n1 || true)"
fi
if [ -z "$USB_URI" ]; then
  USB_URI="$(lpinfo -v 2>/dev/null | awk '/^direct (gutenprint53\+usb|usb):\/\//{print $2}' | head -n1 || true)"
fi
if [ -z "$USB_URI" ]; then
  if [ "$SKIP_PRINTER" = "1" ]; then
    warn "没有发现 USB 打印机，按 --skip-printer 跳过队列创建"
  else
    die "没有发现 USB 打印机。请确认 CP1500 已开机并用 USB 线直连后重试（或加 --skip-printer）"
  fi
else
  PPD="$(lpinfo -m 2>/dev/null | grep -i 'cp1500' | head -n1 | awk '{print $1}')"
  lpadmin -p "$QUEUE_NAME" -E -v "$USB_URI" -m "$PPD"
  lpadmin -p "$QUEUE_NAME" -o PageSize=Postcard -o StpBorderless=True
  cupsenable "$QUEUE_NAME"
  cupsaccept "$QUEUE_NAME"
  echo "队列已创建：$QUEUE_NAME -> $USB_URI"
fi

# ---------------------------------------------------------------- 7. WiFi
if [ "$SKIP_WIFI" = "1" ]; then
  log "跳过 WiFi 配置"
elif [ -z "$WIFI_JSON" ]; then
  warn "没有提供 --wifi-json，跳过 WiFi 配置"
else
  [ -f "$WIFI_JSON" ] || die "WiFi 配置文件不存在：$WIFI_JSON"
  log "写入 WiFi 配置"
  # 格式：[{"ssid":"店铺WiFi","password":"xxx","priority":300,"hidden":false}, ...]
  WIFI_LINES="$(python3 - "$WIFI_JSON" <<'PY'
import json, sys
items = json.load(open(sys.argv[1], encoding="utf-8"))
for i, item in enumerate(items):
    print("\t".join([
        str(i),
        item["ssid"],
        item.get("password", ""),
        str(int(item.get("priority", 100))),
        "1" if item.get("hidden") else "0",
    ]))
PY
)"
  FIRST_CONN=""
  while IFS=$'\t' read -r idx ssid psk prio hidden; do
    [ -n "$ssid" ] || continue
    conn="petpaint-wifi-$prio-$idx"
    nmcli connection delete "$conn" >/dev/null 2>&1 || true
    nmcli connection add type wifi con-name "$conn" ifname wlan0 ssid "$ssid" >/dev/null
    nmcli connection modify "$conn" \
      connection.autoconnect yes \
      connection.autoconnect-priority "$prio" \
      ipv4.method auto \
      ipv6.method auto
    if [ -n "$psk" ]; then
      nmcli connection modify "$conn" wifi-sec.key-mgmt wpa-psk wifi-sec.psk "$psk"
    fi
    if [ "$hidden" = "1" ]; then
      nmcli connection modify "$conn" wifi.hidden yes
    fi
    echo "已写入 WiFi：$ssid（优先级 $prio，隐藏 $hidden）"
    if [ -z "$FIRST_CONN" ]; then FIRST_CONN="$conn"; fi
  done <<< "$WIFI_LINES"

  echo "尝试连接优先级最高的 WiFi：$FIRST_CONN"
  nmcli connection up "$FIRST_CONN" 2>&1 | tail -2
  for _ in $(seq 1 15); do
    if ip -4 addr show wlan0 | grep -q 'inet '; then break; fi
    sleep 2
  done
  ip -brief addr show wlan0
  log "验证 WiFi 连通性"
  if ! curl --interface wlan0 -sS -m 20 -o /dev/null -w 'wlan0 -> petpaint %{http_code}\n' https://www.petpaint.top; then
    die "WiFi 已连接但无法通过 wlan0 访问服务器，请检查 WiFi 是否能上网"
  fi
fi

# ---------------------------------------------------------------- 8. print-agent
log "安装 print-agent"
AGENT_SRC="$OFFLINE_DIR/print-agent"
[ -d "$AGENT_SRC" ] || die "离线包缺少 print-agent 目录"
AGENT_DIR="/opt/petpaint/print-agent"
mkdir -p "$AGENT_DIR"
cp -f "$AGENT_SRC/agent.py" "$AGENT_SRC/print_agent.py" "$AGENT_SRC/config.json" "$AGENT_DIR/"
chmod +x "$AGENT_DIR/agent.py" "$AGENT_DIR/print_agent.py"
sed -e "s#^User=.*#User=${RUN_USER}#" \
    -e "s#/home/pi/print-agent#${AGENT_DIR}#g" \
    "$AGENT_SRC/print-agent.service" > /etc/systemd/system/print-agent.service
systemctl daemon-reload

if [ -n "$SERVER_URL" ] && [ -n "$DEVICE_ID" ] && [ -n "$DEVICE_TOKEN" ]; then
  python3 - "$AGENT_DIR/agent.json" "$SERVER_URL" "$DEVICE_ID" "$DEVICE_TOKEN" "$QUEUE_NAME" <<'PY'
import json, sys
path, server_url, device_id, token, queue = sys.argv[1:6]
data = {}
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
  systemctl enable print-agent >/dev/null
  systemctl restart print-agent
  sleep 3
  if systemctl is-active --quiet print-agent; then
    echo "print-agent 已启动"
  else
    warn "print-agent 没有正常运行，请查看：journalctl -u print-agent -n 50"
  fi
else
  warn "未提供设备凭据，print-agent 已安装但未启动"
fi

# ---------------------------------------------------------------- 9. 汇总
log "配置结果"
echo "print-agent：$(systemctl is-active print-agent 2>/dev/null || true)"
echo "cups：$(systemctl is-active cups 2>/dev/null || true)"
lpstat -r || true
lpstat -p "$QUEUE_NAME" 2>/dev/null || echo "队列 $QUEUE_NAME：未创建"
ip -brief addr show wlan0 2>/dev/null || true
echo
echo "完成。日志：journalctl -u print-agent -n 50 --no-pager"
