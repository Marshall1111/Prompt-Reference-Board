import React, { useEffect, useState } from "react";

const PROFILE_FIELDS = [
  { key: "sheet_width_mm", label: "纸张宽度 (mm)", step: "0.01" },
  { key: "sheet_height_mm", label: "纸张高度 (mm)", step: "0.01" },
  { key: "piece_width_mm", label: "成品宽度 (mm)", step: "0.01" },
  { key: "piece_height_mm", label: "成品高度 (mm)", step: "0.01" },
  { key: "gap_mm", label: "成品间距 (mm)", step: "0.01" },
  { key: "print_x0_mm", label: "可打印区左边界 (mm)", step: "0.001" },
  { key: "print_x1_mm", label: "可打印区右边界 (mm)", step: "0.001" },
  { key: "print_y0_mm", label: "可打印区上边界 (mm)", step: "0.001" },
  { key: "print_y1_mm", label: "可打印区下边界 (mm)", step: "0.001" }
];

const CALIBRATION_FIELDS = [
  { key: "scale_x", label: "横向缩放", step: "0.001" },
  { key: "scale_y", label: "纵向缩放", step: "0.001" },
  { key: "offset_x_mm", label: "横向偏移 (mm)", step: "0.01" },
  { key: "offset_y_mm", label: "纵向偏移 (mm)", step: "0.01" },
  { key: "print_seconds_per_sheet", label: "每张出纸耗时 (秒)", step: "1" }
];

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `请求失败（${response.status}）`);
  return payload;
}

function toForm(config) {
  const profile = config?.profile || {};
  const form = {};
  for (const field of [...PROFILE_FIELDS, ...CALIBRATION_FIELDS]) {
    const source = PROFILE_FIELDS.some((item) => item.key === field.key) ? profile : config;
    form[field.key] = source?.[field.key] ?? "";
  }
  form.media = config?.media || "";
  return form;
}

export default function PrintConfigDialog({ device, onClose, onSaved }) {
  const [form, setForm] = useState(null);
  const [meta, setMeta] = useState({ rev: 0, appliedRev: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const payload = await readJson(await fetch(`/api/admin/print-devices/${encodeURIComponent(device.deviceId)}/print-config`));
        if (disposed) return;
        setForm(toForm(payload.config));
        setMeta({ rev: Number(payload.rev || 0), appliedRev: Number(payload.appliedRev || 0) });
      } catch (nextError) {
        if (!disposed) setError(nextError.message || "读取打印参数失败。");
      } finally {
        if (!disposed) setLoading(false);
      }
    })();
    return () => {
      disposed = true;
    };
  }, [device.deviceId]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (!form) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const profile = {};
      for (const field of PROFILE_FIELDS) profile[field.key] = form[field.key];
      const config = { profile, media: form.media };
      for (const field of CALIBRATION_FIELDS) config[field.key] = form[field.key];
      const payload = await readJson(await fetch(`/api/admin/print-devices/${encodeURIComponent(device.deviceId)}/print-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config })
      }));
      setMeta({ rev: Number(payload.rev || 0), appliedRev: Number(payload.appliedRev || 0) });
      setNotice("已保存，设备将在下一次心跳（约 8 秒）内应用，无需重启。");
      onSaved?.();
    } catch (nextError) {
      setError(nextError.message || "保存打印参数失败。");
    } finally {
      setSaving(false);
    }
  }

  const applied = meta.rev > 0 && meta.appliedRev >= meta.rev;

  return <div className="referral-withdrawal-backdrop" role="presentation" onClick={onClose}>
    <div className="referral-withdrawal-modal store-profile-modal print-config-modal" onClick={(event) => event.stopPropagation()}>
      <div className="task-toolbar compact-toolbar">
        <div>
          <p className="eyebrow">Print config</p>
          <h3>打印参数 · {device.label || device.deviceId}</h3>
          <p className="storage-note">只下发版面与校准字段，不会修改打印机的 IP 和地址。保存后设备在下一次心跳应用，下一次打印即生效。</p>
        </div>
        <button className="secondary-button" onClick={onClose} type="button">关闭</button>
      </div>

      {error ? <p className="error-note">{error}</p> : null}
      {notice ? <p className="success-note">{notice}</p> : null}
      {loading ? <p className="storage-note">正在读取打印参数…</p> : null}

      {form ? <>
        <p className="storage-note">当前版本 rev {meta.rev} · {applied ? "设备已生效" : "等待设备应用"}{meta.appliedRev ? `（设备已应用 rev ${meta.appliedRev}）` : ""}</p>
        <div className="print-config-grid">
          {PROFILE_FIELDS.map((field) => <label className="field-label" key={field.key}>{field.label}
            <input className="field-inline-input" onChange={(event) => updateField(field.key, event.target.value)} step={field.step} type="number" value={form[field.key]} />
          </label>)}
        </div>
        <div className="print-config-grid">
          {CALIBRATION_FIELDS.map((field) => <label className="field-label" key={field.key}>{field.label}
            <input className="field-inline-input" onChange={(event) => updateField(field.key, event.target.value)} step={field.step} type="number" value={form[field.key]} />
          </label>)}
          <label className="field-label">介质名称
            <input className="field-inline-input" onChange={(event) => updateField("media", event.target.value)} value={form.media} />
          </label>
        </div>
        <div className="merchant-modal-actions">
          <button className="maintenance-button" disabled={saving} onClick={submit} type="button">{saving ? "保存中" : "保存并下发"}</button>
        </div>
      </> : null}
    </div>
  </div>;
}
