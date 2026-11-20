import React, { useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, ImagePlus, LoaderCircle, Move, Printer, RotateCw, Scissors, Trash2, X } from "lucide-react";
import { PAPER, GUIDE_COLOR, GUIDE_WIDTH_MM, corners, edgeGuides, placementError, findPlacement, cropFromTransform, clampCropTransform, normalizeAngle } from "../shared/custom-print-geometry.js";
import "./custom-print.css";

const uid = () => crypto.randomUUID();
const midpoint = (points) => ({ x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 });
const distance = (points) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
const angle = (points) => Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
async function api(url, body) {
  const response = await fetch(url, { method: "POST", ...(body instanceof FormData ? { body } : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.message || "操作失败，请重试");
  return value;
}

function useElementWidth(ref) {
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

function CropEditor({ asset, item, onCancel, onConfirm }) {
  const stage = useRef(null), pointers = useRef(new Map()), gesture = useRef(null), current = useRef(null);
  const previousFrame = useRef(null);
  const stageWidth = useElementWidth(stage);
  const [width, setWidth] = useState(item?.widthMm || 50), [height, setHeight] = useState(item?.heightMm || 74);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [ready, setReady] = useState(false);
  const validSize = Number.isFinite(width) && Number.isFinite(height) && width >= 0.1 && height >= 0.1 && width <= 180 && height <= 180;
  const ratio = validSize ? width / height : 50 / 74;
  const box = Math.max(60, Math.min(stageWidth - 40, 300));
  const frame = { width: Math.min(box, box * ratio), height: Math.min(box, box / ratio) };
  const frameKey = `${frame.width}:${frame.height}`;
  useEffect(() => {
    const previous = previousFrame.current;
    const resizing = previous && previous.assetId === asset.assetId && previous.width === width && previous.height === height && current.current;
    const crop = resizing ? cropFromTransform(previous.frame, asset, current.current) : item?.crop;
    const sameSize = item && width === item.widthMm && height === item.heightMm;
    const preserve = resizing || sameSize;
    const scale = preserve ? frame.width / (crop.width * asset.width) : Math.max(frame.width / asset.width, frame.height / asset.height);
    const value = preserve ? {
      scale, x: asset.width * scale / 2 - frame.width / 2 - crop.x * asset.width * scale,
      y: asset.height * scale / 2 - frame.height / 2 - crop.y * asset.height * scale
    } : { scale, x: 0, y: 0 };
    const next = clampCropTransform(frame, asset, value);
    current.current = next; setTransform(next); pointers.current.clear(); gesture.current = null;
    previousFrame.current = { assetId: asset.assetId, width, height, frame };
  }, [asset.assetId, width, height, frameKey]);
  const update = (value) => { const next = clampCropTransform(frame, asset, value); current.current = next; setTransform(next); };
  const point = (event) => {
    const bounds = stage.current.getBoundingClientRect();
    return { x: event.clientX - bounds.left - bounds.width / 2, y: event.clientY - bounds.top - bounds.height / 2 };
  };
  const startGesture = () => { gesture.current = { points: [...pointers.current.values()], value: { ...current.current } }; };
  function down(event) {
    if (!ready || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, point(event)); startGesture();
  }
  function move(event) {
    if (!pointers.current.has(event.pointerId)) return;
    event.preventDefault(); pointers.current.set(event.pointerId, point(event));
    const base = gesture.current, now = [...pointers.current.values()];
    if (now.length >= 2 && base.points.length >= 2) {
      const oldMid = midpoint(base.points), newMid = midpoint(now);
      const wantedScale = base.value.scale * distance(now) / Math.max(1, distance(base.points));
      const scale = clampCropTransform(frame, asset, { ...base.value, scale: wantedScale }).scale;
      const factor = scale / base.value.scale;
      update({ scale, x: newMid.x + (base.value.x - oldMid.x) * factor, y: newMid.y + (base.value.y - oldMid.y) * factor });
    } else if (now.length === 1) update({ ...base.value, x: base.value.x + now[0].x - base.points[0].x, y: base.value.y + now[0].y - base.points[0].y });
  }
  function up(event) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size) startGesture(); else gesture.current = null;
  }
  const reset = () => update({ x: 0, y: 0, scale: Math.max(frame.width / asset.width, frame.height / asset.height) });
  const minimum = Math.max(frame.width / asset.width, frame.height / asset.height);
  return <div className="custom-crop-panel">
    <div className="custom-print-section-head"><h2>裁切图片</h2><button className="custom-button" onClick={onCancel}><X size={18} />取消</button></div>
    <div className="custom-size-fields">
      <label>宽度（毫米）<input aria-label="打印宽度" type="number" min="0.1" max="180" step="0.1" value={width} onChange={(e) => setWidth(e.target.value === "" ? "" : Number(e.target.value))} /></label>
      <span>×</span><label>高度（毫米）<input aria-label="打印高度" type="number" min="0.1" max="180" step="0.1" value={height} onChange={(e) => setHeight(e.target.value === "" ? "" : Number(e.target.value))} /></label>
    </div>
    <div className="custom-presets">{[[50, 74], [74, 50], [50, 50], [100, 148]].map(([w, h]) => <button key={`${w}-${h}`} className="custom-button" onClick={() => { setWidth(w); setHeight(h); }}>{w}×{h}</button>)}</div>
    <div ref={stage} className="custom-crop-stage" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={(e) => e.preventDefault()}>
      <img alt="待裁切照片" draggable="false" src={asset.previewUrl} onLoad={() => setReady(true)} onError={() => setReady(false)} style={{ width: asset.width * transform.scale, height: asset.height * transform.scale, transform: `translate(-50%, -50%) translate(${transform.x}px, ${transform.y}px)` }} />
      <div className="custom-crop-window" style={{ width: frame.width, height: frame.height }}><div className="custom-crop-grid" /></div>
    </div>
    <p className="custom-help">框内就是打印内容。单指移动，双指放大缩小。</p>
    <div className="custom-crop-zoom"><span>缩放</span><input aria-label="裁切缩放" type="range" min="1" max="12" step="0.01" value={Math.max(1, transform.scale / minimum)} onChange={(e) => update({ ...current.current, scale: minimum * Number(e.target.value) })} /><button className="custom-button" onClick={reset}>重置</button></div>
    {!validSize ? <p className="custom-error">请输入有效的打印宽高。</p> : null}
    <button className="custom-button is-primary" disabled={!validSize || !ready} onClick={() => onConfirm({ widthMm: width, heightMm: height, crop: cropFromTransform(frame, asset, current.current) })}><Check size={18} />确认裁切，加入相纸</button>
  </div>;
}

function Sheet({ items, assets, selectedId, onSelect, onChange }) {
  const stage = useRef(null), pointers = useRef(new Map()), base = useRef(null), lastValid = useRef(null), live = useRef(items);
  const maskId = `custom-guides-${useId().replace(/[^a-z0-9]/gi, "")}`;
  const [error, setError] = useState("");
  live.current = items;
  const point = (event) => { const r = stage.current.getBoundingClientRect(); return { x: (event.clientX - r.left) / r.width * 100, y: (event.clientY - r.top) / r.height * 148 }; };
  function begin(id) {
    const item = live.current.find((v) => v.id === id);
    if (item) base.current = { item: { ...item }, points: [...pointers.current.values()] };
  }
  function down(event) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const id = event.target.closest("[data-item-id]")?.getAttribute("data-item-id") || base.current?.item.id;
    if (!id) { onSelect(""); return; }
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, point(event)); onSelect(id);
    lastValid.current = live.current.find((v) => v.id === id); begin(id);
  }
  function move(event) {
    if (!pointers.current.has(event.pointerId) || !base.current) return;
    event.preventDefault(); pointers.current.set(event.pointerId, point(event));
    const now = [...pointers.current.values()], start = base.current;
    let next;
    if (now.length >= 2 && start.points.length >= 2) {
      const oldMid = midpoint(start.points), newMid = midpoint(now);
      next = { ...start.item, centerXmm: start.item.centerXmm + newMid.x - oldMid.x, centerYmm: start.item.centerYmm + newMid.y - oldMid.y,
        rotationDeg: normalizeAngle(start.item.rotationDeg + (angle(now) - angle(start.points)) * 180 / Math.PI) };
    } else next = { ...start.item, centerXmm: start.item.centerXmm + now[0].x - start.points[0].x, centerYmm: start.item.centerYmm + now[0].y - start.points[0].y };
    const message = placementError(next, live.current); setError(message);
    if (!message) lastValid.current = next;
    live.current = live.current.map((v) => v.id === next.id ? next : v); onChange(live.current);
  }
  function up(event) {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.delete(event.pointerId);
    if (lastValid.current && base.current) {
      live.current = live.current.map((v) => v.id === base.current.item.id ? lastValid.current : v); onChange(live.current);
    }
    setError("");
    if (pointers.current.size) begin(base.current.item.id); else base.current = null;
  }
  return <div className="custom-paper-wrap">
    <div className="custom-paper-label">100 × 148 毫米 · 300 DPI</div>
    <svg ref={stage} aria-label="相纸排版" className="custom-paper" viewBox="0 0 100 148" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onLostPointerCapture={up} onContextMenu={(e) => e.preventDefault()}>
      <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="148"><rect width="100" height="148" fill="white" />{items.map((item) => <polygon key={item.id} points={corners(item).map((p) => `${p.x},${p.y}`).join(" ")} fill="black" />)}</mask></defs>
      <rect width="100" height="148" fill="white" />
      <g stroke={GUIDE_COLOR} strokeWidth={GUIDE_WIDTH_MM} mask={`url(#${maskId})`} pointerEvents="none">{items.flatMap((item) => edgeGuides(item).map((line, i) => <line key={`${item.id}-${i}`} {...line} />))}</g>
      {items.map((item) => {
        const asset = assets.find((v) => v.assetId === item.assetId);
        if (!asset) return null;
        return <g key={item.id} data-item-id={item.id} transform={`rotate(${item.rotationDeg} ${item.centerXmm} ${item.centerYmm})`}>
          <svg x={item.centerXmm - item.widthMm / 2} y={item.centerYmm - item.heightMm / 2} width={item.widthMm} height={item.heightMm} viewBox={`${item.crop.x * asset.width} ${item.crop.y * asset.height} ${item.crop.width * asset.width} ${item.crop.height * asset.height}`} preserveAspectRatio="none" overflow="hidden">
            <rect width={asset.width} height={asset.height} fill="white" /><image href={asset.previewUrl} width={asset.width} height={asset.height} draggable="false" />
          </svg>
          {item.id === selectedId ? <rect x={item.centerXmm - item.widthMm / 2} y={item.centerYmm - item.heightMm / 2} width={item.widthMm} height={item.heightMm} fill="none" stroke={error ? "#d63939" : "#287be8"} strokeWidth="0.6" strokeDasharray="2 1" pointerEvents="none" /> : null}
        </g>;
      })}
    </svg>
    <p className={error ? "custom-error" : "custom-help"}>{error || "单指移动 · 双指旋转 · 打印尺寸固定"}</p>
  </div>;
}

export default function CustomPrintEditor({ printer, onClose, onSubmitted }) {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  const [assets, setAssets] = useState([]), [items, setItems] = useState([]), [pending, setPending] = useState([]);
  const [selectedId, setSelectedId] = useState(""), [cropping, setCropping] = useState(null);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [preview, setPreview] = useState(null), [copies, setCopies] = useState(1);
  const input = useRef(null), requestId = useRef(uid());
  const selected = [...items, ...pending].find((item) => item.id === selectedId);
  const available = printer?.online && printer?.customPrintSupported;
  function changeItems(next) { setItems(next); setPreview(null); requestId.current = uid(); }
  async function uploadFiles(event) {
    const files = [...event.target.files]; event.target.value = "";
    if (files.length + assets.length > 10) { setError("最多上传10张源图"); return; }
    setBusy("正在上传照片"); setError("");
    try {
      let first;
      for (const file of files) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("仅支持JPG、PNG、WebP");
        if (file.size > 40 * 1024 * 1024) throw new Error("每张图片不能超过40MB");
        const data = new FormData(); data.append("image", file);
        const asset = await api("/api/merchant/custom-print/assets", data);
        setAssets((current) => [...current, asset]); first ||= asset;
      }
      if (first) setCropping({ asset: first });
    } catch (nextError) { setError(nextError.message); } finally { setBusy(""); }
  }
  function cropped(value) {
    if (!cropping.item && items.length + pending.length >= 24) { setError("每页最多24个图片实例"); return; }
    const item = { id: cropping.item?.id || uid(), assetId: cropping.asset.assetId, centerXmm: 50, centerYmm: 74, rotationDeg: 0, ...cropping.item, ...value };
    const others = items.filter((v) => v.id !== item.id);
    const placed = !placementError(item, others) ? item : findPlacement(item, others);
    changeItems(placed ? [...others, placed] : others);
    setPending((current) => [...current.filter((v) => v.id !== item.id), ...(placed ? [] : [item])]);
    setSelectedId(item.id); setCropping(null); setError(placed ? "" : "相纸放不下这张图片，已保留在待排列表。可移动其他图片后再加入。");
  }
  function duplicate() {
    if (!selected || items.length + pending.length >= 24) { setError("每页最多24个图片实例"); return; }
    const item = { ...selected, id: uid() }, placed = findPlacement(item, items);
    if (placed) changeItems([...items, placed]); else setPending([...pending, item]);
    setSelectedId(item.id); setError(placed ? "" : "已复制到待排列表，请先腾出相纸空间。");
  }
  function remove() { changeItems(items.filter((v) => v.id !== selectedId)); setPending(pending.filter((v) => v.id !== selectedId)); setSelectedId(""); }
  function rotate(rotationDeg) {
    if (!selected || pending.some((v) => v.id === selected.id)) return;
    const next = { ...selected, rotationDeg: normalizeAngle(rotationDeg) }, message = placementError(next, items);
    if (message) { setError(message); return; }
    changeItems(items.map((v) => v.id === next.id ? next : v)); setError("");
  }
  async function renderPreview() {
    setBusy("正在准备打印预览"); setError("");
    try { setPreview(await api("/api/merchant/custom-print/previews", { items })); requestId.current = uid(); }
    catch (nextError) { setError(nextError.message); } finally { setBusy(""); }
  }
  async function submit() {
    setBusy("正在提交打印任务"); setError("");
    try {
      await api("/api/merchant/custom-print/jobs", { previewId: preview.previewId, copies, idempotencyKey: requestId.current });
      onSubmitted();
    } catch (nextError) { setError(nextError.message); } finally { setBusy(""); }
  }
  return <div className="custom-print-overlay" role="dialog" aria-modal="true" aria-label="自定义打印">
    <header className="custom-print-header"><button className="custom-button" disabled={!!busy} onClick={onClose}><ArrowLeft size={18} />工作台</button><h1>自定义打印</h1><span>店内工具</span></header>
    <main className="custom-print-main">
      {busy ? <div className="custom-print-busy" role="status"><LoaderCircle size={18} className="spin" />{busy}</div> : null}
      {error ? <p className="custom-error" role="alert">{error}</p> : null}
      {cropping ? <CropEditor {...cropping} onCancel={() => setCropping(null)} onConfirm={cropped} /> : preview ? <section className="custom-final-preview">
        <h2>确认打印版面</h2><p className="custom-help">下图包含实际打印的裁切辅助线。{pending.length ? `${pending.length}张待排图片不在此版面中。` : ""}</p>
        <img src={preview.previewUrl} alt="最终打印版面" />
        <label className="custom-copies">打印份数<input aria-label="打印份数" type="number" min="1" max="20" value={copies} disabled={!!busy} onChange={(e) => { setCopies(e.target.value === "" ? "" : Number(e.target.value)); requestId.current = uid(); }} /></label>
        {!available ? <p className="custom-error">{!printer?.customPrintSupported ? "请升级打印代理并配置100×148毫米相纸后再打印。" : "打印设备离线或异常，请检查设备。"}</p> : null}
        <div className="custom-action-row"><button className="custom-button" disabled={!!busy} onClick={() => setPreview(null)}>返回排版</button><button className="custom-button is-primary" disabled={!!busy || !available || !Number.isInteger(copies) || copies < 1 || copies > 20} onClick={submit}><Printer size={18} />提交打印{Number.isInteger(copies) ? ` · ${copies}份` : ""}</button></div>
      </section> : <div className="custom-print-layout">
        <section className="custom-print-paper-panel"><Sheet items={items} assets={assets} selectedId={selectedId} onSelect={setSelectedId} onChange={changeItems} /></section>
        <section className="custom-print-controls">
          <div className="custom-print-section-head"><h2>照片与尺寸</h2><button className="custom-button" disabled={!!busy || assets.length >= 10} onClick={() => input.current.click()}><ImagePlus size={18} />上传图片</button></div>
          <input ref={input} className="custom-hidden-input" type="file" aria-label="上传打印图片" accept="image/jpeg,image/png,image/webp" multiple onChange={uploadFiles} />
          {!assets.length ? <div className="custom-empty"><Scissors size={30} /><p>上传照片，设定尺寸并裁切</p><span>图片大小按毫米设置，排版时保持固定。</span></div> : <div className="custom-assets">{assets.map((asset, index) => <button key={asset.assetId} className="custom-asset" disabled={!!busy} onClick={() => { setError(""); setCropping({ asset }); }}><img alt={`源图${index + 1}`} src={asset.previewUrl} /><span>图{index + 1} · 裁切添加</span></button>)}</div>}
          {selected ? <div className="custom-selected-controls"><h3>选中图片 · {selected.widthMm} × {selected.heightMm}毫米</h3><div className="custom-action-row">
            <button className="custom-button" onClick={() => setCropping({ asset: assets.find((v) => v.assetId === selected.assetId), item: selected })}><Scissors size={16} />重新裁切</button><button className="custom-button" onClick={duplicate}><Copy size={16} />复制</button><button className="custom-button" onClick={remove}><Trash2 size={16} />删除</button>
          </div>{!pending.some((v) => v.id === selected.id) ? <div className="custom-angle"><button className="custom-button" onClick={() => rotate(selected.rotationDeg + 90)}><RotateCw size={16} />旋转90°</button><label>角度<input aria-label="排版旋转角度" type="number" step="1" value={Number(selected.rotationDeg.toFixed(1))} onChange={(e) => { if (e.target.value !== "") rotate(Number(e.target.value)); }} />°</label></div> : null}</div> : <p className="custom-help"><Move size={15} />点击相纸上的图片，可以移动、旋转或重新裁切。</p>}
          {items.length ? <div className="custom-item-list">{items.map((item, index) => <button key={item.id} className={`custom-button ${item.id === selectedId ? "is-selected" : ""}`} onClick={() => setSelectedId(item.id)}>图片{index + 1} · {item.widthMm}×{item.heightMm}</button>)}</div> : null}
          {pending.length ? <div className="custom-pending"><h3>待排图片（不会打印）</h3>{pending.map((item) => <div key={item.id}><button className="custom-button" onClick={() => setSelectedId(item.id)}>{item.widthMm}×{item.heightMm}毫米</button><button className="custom-button" onClick={() => { const placed = findPlacement(item, items); if (placed) { changeItems([...items, placed]); setPending(pending.filter((v) => v.id !== item.id)); setError(""); } else setError("当前版面空间不足，请移动或删除其他图片。"); }}>加入相纸</button></div>)}</div> : null}
          <p className="custom-help">裁切细线延伸到纸边，并隐藏在所有图片下方。</p>
          <button className="custom-button is-primary" disabled={!!busy || !items.length || items.some((item) => placementError(item, items))} onClick={renderPreview}>查看打印预览 · {items.length}张图</button>
        </section>
      </div>}
    </main>
  </div>;
}
