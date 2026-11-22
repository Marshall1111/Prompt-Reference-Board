import React, { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, RefreshCw, Wifi } from "lucide-react";

const BRIDGE_BASE = "http://127.0.0.1:8791";
const DEFAULT_WIFI_PRIORITY = 300;

const EMPTY_WIFI_FORM = { conn: "", ssid: "", password: "", priority: DEFAULT_WIFI_PRIORITY, hidden: false };

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `请求失败（${response.status}）`);
  return payload;
}

async function bridgeRequest(pathname, { method = "GET", body } = {}) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(`${BRIDGE_BASE}${pathname}`, options);
  return readJson(response);
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "—";
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

export default function PrintDeviceProvisionDialog({ device, onClose, onProvisioned }) {
  const [bridge, setBridge] = useState({ state: "checking", health: null, error: "" });
  const [offlineBundle, setOfflineBundle] = useState(null);
  const [bundleError, setBundleError] = useState("");

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState([]);
  const [scanPrefix, setScanPrefix] = useState("");

  const [connectForm, setConnectForm] = useState({ host: "", username: "root", password: "" });
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(null);
  const [wifiRows, setWifiRows] = useState([]);
  const [wifiForm, setWifiForm] = useState(EMPTY_WIFI_FORM);
  const [wifiBusy, setWifiBusy] = useState(false);

  const [token, setToken] = useState("");
  const [runForm, setRunForm] = useState({
    serverUrl: window.location.origin,
    queue: device?.printerName || "cp1500",
    skipPrinter: false
  });
  const [provision, setProvision] = useState({ status: "idle", progress: 0, error: "", done: false });
  const [log, setLog] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const logRef = useRef("");
  const offsetRef = useRef(0);
  const pollTimerRef = useRef(null);
  const recordedRef = useRef(false);
  const logBoxRef = useRef(null);

  const checkBridge = useCallback(async () => {
    setBridge({ state: "checking", health: null, error: "" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetch(`${BRIDGE_BASE}/api/health`, { signal: controller.signal, cache: "no-store" });
      const payload = await readJson(response);
      setBridge({ state: "online", health: payload, error: "" });
    } catch (nextError) {
      setBridge({
        state: "offline",
        health: null,
        error: nextError.name === "AbortError" ? "本地助手 1.5 秒内未响应。" : nextError.message || "无法连接本地助手。"
      });
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void checkBridge();
    (async () => {
      try {
        const payload = await readJson(await fetch("/api/admin/offline-bundle"));
        setOfflineBundle(payload);
      } catch (nextError) {
        setBundleError(nextError.message || "服务器没有可下载的离线包。");
      }
    })();
  }, [checkBridge]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const payload = await readJson(await fetch(`/api/admin/print-devices/${encodeURIComponent(device.deviceId)}/token`));
        if (!disposed) setToken(payload.token || "");
      } catch {
        // 令牌只用于展示摘要，读取失败不阻塞配置流程。
      }
    })();
    return () => {
      disposed = true;
    };
  }, [device.deviceId]);

  useEffect(() => () => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
  }, []);

  useEffect(() => {
    const box = logBoxRef.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [log]);

  async function scanNetwork() {
    setScanning(true); setError(""); setNotice("");
    try {
      const payload = await bridgeRequest("/api/scan", { method: "POST", body: {} });
      setScanResult(payload.devices || []);
      setScanPrefix(payload.prefix || "");
      setNotice(`扫描完成，发现 ${(payload.devices || []).length} 台开放 SSH 的主机。`);
    } catch (nextError) {
      setError(nextError.message || "扫描失败。");
    } finally {
      setScanning(false);
    }
  }

  async function connectBox() {
    setConnecting(true); setError(""); setNotice("");
    try {
      const payload = await bridgeRequest("/api/connect", { method: "POST", body: connectForm });
      setConnected(payload.device || null);
      setWifiRows(payload.wifi || []);
      setNotice(`已连接 ${payload.device?.hostname || connectForm.host}。`);
    } catch (nextError) {
      setError(nextError.message || "连接盒子失败。");
    } finally {
      setConnecting(false);
    }
  }

  async function saveWifi() {
    if (!wifiForm.ssid.trim()) {
      setError("请填写 SSID。");
      return;
    }
    setWifiBusy(true); setError(""); setNotice("");
    try {
      const payload = await bridgeRequest("/api/wifi", {
        method: "POST",
        body: {
          action: "save",
          conn: wifiForm.conn.trim(),
          ssid: wifiForm.ssid.trim(),
          password: wifiForm.password,
          priority: Number(wifiForm.priority) || 0,
          hidden: Boolean(wifiForm.hidden)
        }
      });
      setWifiRows(payload.wifi || []);
      setWifiForm(EMPTY_WIFI_FORM);
      setNotice(`WiFi ${wifiForm.ssid.trim()} 已保存。`);
    } catch (nextError) {
      setError(nextError.message || "保存 WiFi 失败。");
    } finally {
      setWifiBusy(false);
    }
  }

  async function deleteWifi(row) {
    if (!window.confirm(`确认删除 WiFi「${row.ssid}」？`)) return;
    setWifiBusy(true); setError(""); setNotice("");
    try {
      const payload = await bridgeRequest("/api/wifi", { method: "POST", body: { action: "delete", conn: row.conn } });
      setWifiRows(payload.wifi || []);
      setNotice(`WiFi ${row.ssid} 已删除。`);
    } catch (nextError) {
      setError(nextError.message || "删除 WiFi 失败。");
    } finally {
      setWifiBusy(false);
    }
  }

  const pollProvision = useCallback(async () => {
    try {
      const payload = await bridgeRequest(`/api/provision/status?offset=${offsetRef.current}`);
      if (payload.reset) {
        logRef.current = payload.chunk || "";
      } else if (payload.chunk) {
        logRef.current += payload.chunk;
      }
      offsetRef.current = Number(payload.offset || 0);
      setLog(logRef.current);
      setProvision({
        status: payload.status,
        progress: Number(payload.progress || 0),
        error: payload.error || "",
        done: Boolean(payload.done)
      });
      if (payload.done) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        if (payload.status === "succeeded" && !recordedRef.current) {
          recordedRef.current = true;
          fetch(`/api/admin/print-devices/${encodeURIComponent(device.deviceId)}/provision-record`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ok: true })
          }).then(() => onProvisioned?.()).catch(() => {});
        }
      }
    } catch (nextError) {
      setProvision((current) => ({ ...current, status: "failed", done: true, error: nextError.message || "读取进度失败。" }));
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }
  }, [device.deviceId, onProvisioned]);

  async function startProvision() {
    if (!connected) {
      setError("请先连接盒子。");
      return;
    }
    if (!wifiRows.some((row) => String(row.ssid || "").trim())) {
      setError("请至少配置一条 WiFi。");
      return;
    }
    if (!window.confirm("即将开始配置，过程中不要拔电源、不要拔打印机 USB。确定继续？")) return;
    setError(""); setNotice("");
    logRef.current = "";
    offsetRef.current = 0;
    recordedRef.current = false;
    setLog("");
    try {
      await bridgeRequest("/api/provision", {
        method: "POST",
        body: {
          serverUrl: runForm.serverUrl,
          deviceId: device.deviceId,
          token,
          queue: runForm.queue,
          skipPrinter: Boolean(runForm.skipPrinter),
          wifi: wifiRows.map((row) => ({
            conn: row.conn,
            ssid: row.ssid,
            password: row.password,
            priority: Number(row.priority) || 0,
            hidden: Boolean(row.hidden)
          }))
        }
      });
      setProvision({ status: "running", progress: 0, error: "", done: false });
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => { void pollProvision(); }, 1000);
      void pollProvision();
    } catch (nextError) {
      setError(nextError.message || "启动配置失败。");
    }
  }

  async function rebootBox() {
    if (!window.confirm("确定重启盒子？重启后需要等 1～2 分钟。")) return;
    setBusyAction("reboot"); setError(""); setNotice("");
    try {
      await bridgeRequest("/api/reboot", { method: "POST", body: {} });
      setNotice("已下发重启命令，等待盒子重新上线。");
    } catch (nextError) {
      setError(nextError.message || "重启失败。");
    } finally {
      setBusyAction("");
    }
  }

  async function testPrint() {
    if (!window.confirm(`将通过 ${runForm.queue} 打印一张测试页，会消耗 1 张相纸。继续吗？`)) return;
    setBusyAction("print"); setError(""); setNotice("");
    try {
      const payload = await bridgeRequest("/api/test-print", { method: "POST", body: { queue: runForm.queue } });
      setNotice(`测试打印已提交：${payload.output || "已发送到打印机"}`);
    } catch (nextError) {
      setError(nextError.message || "测试打印失败。");
    } finally {
      setBusyAction("");
    }
  }

  const running = provision.status === "running";
  const canProvision = bridge.state === "online" && connected && !running;

  return <div className="referral-withdrawal-backdrop" role="presentation" onClick={() => { if (!running) onClose(); }}>
    <div className="referral-withdrawal-modal store-profile-modal vw-provision-modal" onClick={(event) => event.stopPropagation()}>
      <div className="task-toolbar compact-toolbar">
        <div>
          <p className="eyebrow">Provision</p>
          <h3>配置设备 · {device.label || device.deviceId}</h3>
          <p className="storage-note">网页负责流程与记录，SSH 由操作员电脑上的本地桥接助手执行，盒子密码不会上传到服务器。</p>
        </div>
        <button className="secondary-button" disabled={running} onClick={onClose} type="button">关闭</button>
      </div>

      {error ? <p className="error-note">{error}</p> : null}
      {notice ? <p className="success-note">{notice}</p> : null}

      <div className="referral-admin-card">
        <div className="task-toolbar compact-toolbar">
          <div>
            <p className="eyebrow">Step 1</p>
            <h3>本地桥接助手</h3>
          </div>
          <button className="secondary-button" onClick={checkBridge} type="button"><RefreshCw size={16} /><span>重新检测</span></button>
        </div>
        {bridge.state === "checking" ? <p className="storage-note"><LoaderCircle size={16} /> 正在检测 127.0.0.1:8791…</p> : null}
        {bridge.state === "offline" ? <div>
          <p className="error-note">本地桥接助手未启动：{bridge.error}</p>
          <p className="storage-note">在操作员电脑上双击运行 <code>PetpaintProvisioner.exe --bridge</code>，保持窗口打开后点击「重新检测」。</p>
          {offlineBundle ? <p className="storage-note">离线包：{offlineBundle.fileName}（{formatBytes(offlineBundle.size)}）<a className="secondary-button" href={offlineBundle.downloadUrl} style={{ marginLeft: 8 }}>下载离线包</a></p> : <p className="storage-note">{bundleError}</p>}
        </div> : null}
        {bridge.state === "online" ? <div>
          <p className="success-note">助手已连接（v{bridge.health?.version || "?"}）。</p>
          <p className="storage-note">本机网段：{bridge.health?.localIp || "未识别"} · 离线包：{bridge.health?.offlinePackage?.name || "未找到"}</p>
          {!bridge.health?.offlinePackage ? <p className="storage-note">{offlineBundle ? <>请下载 {offlineBundle.fileName} 放到助手目录的 <code>offline</code> 文件夹。</> : bundleError}</p> : null}
        </div> : null}
      </div>

      <div className="referral-admin-card">
        <div className="task-toolbar compact-toolbar">
          <div><p className="eyebrow">Step 2</p><h3>连接盒子</h3><p className="storage-note">可扫描同网段，或直接填写 IP。</p></div>
          <button className="secondary-button" disabled={bridge.state !== "online" || scanning} onClick={scanNetwork} type="button"><Wifi size={16} /><span>{scanning ? "扫描中" : "扫描同网段"}</span></button>
        </div>
        {scanResult.length ? <div className="user-admin-table-wrap referral-table-wrap"><table className="user-admin-table"><thead><tr><th>IP</th><th>主机名</th><th>SSH</th><th /></tr></thead><tbody>
          {scanResult.map((item) => <tr key={item.host}><td>{item.host}</td><td>{item.hostname || "—"}</td><td className="storage-note">{item.banner || "—"}</td><td><button className="secondary-button" onClick={() => setConnectForm((current) => ({ ...current, host: item.host }))} type="button">选择</button></td></tr>)}
        </tbody></table></div> : null}
        <div className="store-profile-grid">
          <label className="field-label">IP 地址<input className="field-inline-input" onChange={(event) => setConnectForm((current) => ({ ...current, host: event.target.value.trim() }))} placeholder={scanPrefix ? `${scanPrefix}x` : "192.168.1.100"} value={connectForm.host} /></label>
          <label className="field-label">用户名<input className="field-inline-input" onChange={(event) => setConnectForm((current) => ({ ...current, username: event.target.value }))} value={connectForm.username} /></label>
          <label className="field-label">密码<input className="field-inline-input" onChange={(event) => setConnectForm((current) => ({ ...current, password: event.target.value }))} type="password" value={connectForm.password} /></label>
        </div>
        <div className="merchant-modal-actions">
          <button className="maintenance-button" disabled={bridge.state !== "online" || connecting} onClick={connectBox} type="button">{connecting ? "连接中…" : "连接盒子"}</button>
        </div>
        {connected ? <div className="store-profile-grid">
          <div className="field-label">主机名<span className="device-token-value">{connected.hostname || "—"}</span></div>
          <div className="field-label">架构<span className="device-token-value">{connected.arch || "—"}</span></div>
          <div className="field-label">系统<span className="device-token-value">{connected.os || "—"}</span></div>
          <div className="field-label">打印机<span className="device-token-value">{connected.printerPresent ? "已识别" : "未识别"}</span></div>
        </div> : null}
      </div>

      {connected ? <div className="referral-admin-card">
        <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Step 3</p><h3>WiFi 配置</h3><p className="storage-note">与桌面版一致：连接名留空时自动生成 petpaint-&lt;SSID&gt;，优先级默认 300。</p></div></div>
        <div className="user-admin-table-wrap referral-table-wrap"><table className="user-admin-table"><thead><tr><th>SSID</th><th>连接名</th><th>密码</th><th>优先级</th><th>状态</th><th /></tr></thead><tbody>
          {wifiRows.map((row) => <tr key={row.conn}><td>{row.ssid}</td><td>{row.conn}</td><td>{row.password ? "••••••" : "—"}</td><td>{row.priority}</td><td><span className={`merchant-badge ${row.active ? "is-online" : "is-offline"}`}>{row.active ? "已连接" : "未连接"}</span></td><td><div className="store-owner-wechat-value"><button className="secondary-button" disabled={wifiBusy} onClick={() => setWifiForm({ conn: row.conn, ssid: row.ssid, password: row.password || "", priority: row.priority || 0, hidden: Boolean(row.hidden) })} type="button">编辑</button><button className="danger-button" disabled={wifiBusy} onClick={() => deleteWifi(row)} type="button">删除</button></div></td></tr>)}
          {!wifiRows.length ? <tr><td className="order-table-empty" colSpan="6">盒子上还没有 WiFi 配置，请在下方新增。</td></tr> : null}
        </tbody></table></div>
        <div className="store-profile-grid">
          <label className="field-label">连接名（可留空）<input className="field-inline-input" onChange={(event) => setWifiForm((current) => ({ ...current, conn: event.target.value }))} value={wifiForm.conn} /></label>
          <label className="field-label">SSID<input className="field-inline-input" onChange={(event) => setWifiForm((current) => ({ ...current, ssid: event.target.value }))} value={wifiForm.ssid} /></label>
          <label className="field-label">密码<input className="field-inline-input" onChange={(event) => setWifiForm((current) => ({ ...current, password: event.target.value }))} type="password" value={wifiForm.password} /></label>
          <label className="field-label">优先级<input className="field-inline-input" onChange={(event) => setWifiForm((current) => ({ ...current, priority: Number(event.target.value) || 0 }))} type="number" value={wifiForm.priority} /></label>
          <label className="field-label vw-checkbox-label"><input checked={wifiForm.hidden} onChange={(event) => setWifiForm((current) => ({ ...current, hidden: event.target.checked }))} type="checkbox" /> 隐藏网络</label>
        </div>
        <div className="merchant-modal-actions">
          <button className="maintenance-button" disabled={wifiBusy} onClick={saveWifi} type="button">{wifiForm.conn ? "保存修改" : "新增 WiFi"}</button>
          {wifiForm.conn ? <button className="secondary-button" onClick={() => setWifiForm(EMPTY_WIFI_FORM)} type="button">取消编辑</button> : null}
        </div>
      </div> : null}

      <div className="referral-admin-card">
        <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Step 4</p><h3>执行配置</h3></div></div>
        <div className="store-profile-grid">
          <div className="field-label">设备 ID<span className="device-token-value">{device.deviceId}</span></div>
          <div className="field-label">令牌摘要<span className="device-token-value">{token ? `${token.slice(0, 8)}…${token.slice(-8)}` : "读取中…"}</span></div>
          <label className="field-label">服务器地址<input className="field-inline-input" onChange={(event) => setRunForm((current) => ({ ...current, serverUrl: event.target.value.trim() }))} value={runForm.serverUrl} /></label>
          <label className="field-label">CUPS 队列<input className="field-inline-input" onChange={(event) => setRunForm((current) => ({ ...current, queue: event.target.value.trim() }))} value={runForm.queue} /></label>
          <label className="field-label vw-checkbox-label"><input checked={runForm.skipPrinter} onChange={(event) => setRunForm((current) => ({ ...current, skipPrinter: event.target.checked }))} type="checkbox" /> 跳过打印机配置</label>
        </div>
        <div className="merchant-modal-actions">
          <button className="maintenance-button" disabled={!canProvision} onClick={startProvision} type="button">{running ? "配置中…" : "开始配置"}</button>
          <button className="secondary-button" disabled={running || busyAction === "reboot"} onClick={rebootBox} type="button">重启盒子</button>
          <button className="secondary-button" disabled={running || busyAction === "print"} onClick={testPrint} type="button">测试打印</button>
        </div>
        {provision.status !== "idle" ? <div className="vw-provision-status">
          <div className="vw-progress"><span style={{ width: `${Math.max(2, provision.progress)}%` }} /></div>
          <p className="storage-note">
            {provision.status === "running" ? `执行中 ${Math.round(provision.progress)}%` : provision.status === "succeeded" ? "配置成功，库存来源会更新为「网页配置」。" : `配置失败：${provision.error || "请查看日志"}`}
          </p>
        </div> : null}
        <textarea className="vw-log" placeholder="配置日志会显示在这里" readOnly ref={logBoxRef} rows={10} value={log} />
      </div>
    </div>
  </div>;
}
