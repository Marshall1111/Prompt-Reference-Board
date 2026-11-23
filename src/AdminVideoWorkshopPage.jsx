import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Download, RefreshCw, Trash2, Video } from "lucide-react";

const DEFAULT_END_PAGE = {
  siteUrl: "https://www.petpaint.top",
  inviteCode: "",
  sameStyleId: "",
  topText: "AI小画家，让照片更有趣",
  bottomText: "扫码做同款"
};

const DEFAULT_PARAMS = {
  framesPer: 24,
  endFrames: 92,
  coverSeconds: 2,
  zoom: 0.04,
  width: 1080,
  height: 1620
};

const TEXT_COLOR = "#f5efe0";
const QR_DARK = "#0b0b0d";
const MAX_SELECTION = 6;
const IS_WECHAT = typeof navigator !== "undefined" && /MicroMessenger/i.test(navigator.userAgent);
const IS_IOS = typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(navigator.userAgent);

function formatTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "0 B";
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "请求失败，请稍后再试。");
  return payload;
}

function styleLabel(style) {
  return String(style?.name || style?.title || style?.id || "").trim();
}

/** 与 qr_page.py 的 build_qr_url 保持一致：保留原 query，依次追加 sameStyleId、invite。 */
function buildQrUrl(siteUrl, styleId, inviteCode) {
  let base = String(siteUrl || "").trim() || "https://www.petpaint.top";
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  let parsed;
  try {
    parsed = new URL(base);
  } catch {
    return base;
  }
  if (styleId) parsed.searchParams.append("sameStyleId", styleId);
  if (inviteCode) parsed.searchParams.append("invite", inviteCode);
  return parsed.toString();
}

function wrapText(context, text, maxWidth, maxLines = 2) {
  const lines = [];
  const rawLines = String(text || "").split(/\r?\n/);
  for (const rawLine of rawLines.length ? rawLines : [""]) {
    let current = "";
    for (const character of Array.from(rawLine)) {
      const candidate = current + character;
      if (current && context.measureText(candidate).width > maxWidth) {
        lines.push(current);
        current = character;
        if (lines.length >= maxLines) break;
      } else {
        current = candidate;
      }
    }
    if (lines.length >= maxLines) break;
    lines.push(current);
  }
  return lines.slice(0, maxLines).filter((line) => line.trim());
}

function fillRoundedRect(context, left, top, size, radius) {
  if (typeof context.roundRect === "function") {
    context.beginPath();
    context.roundRect(left, top, size, size, radius);
    context.fill();
    return;
  }
  context.fillRect(left, top, size, size);
}

/** 浏览器 Canvas 生成结尾页，避免服务器依赖中文字体。 */
function drawEndPage(canvas, { width, height, url, topText, bottomText }) {
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  const scale = width / 1080;
  context.fillStyle = "#000000";
  context.fillRect(0, 0, width, height);

  const centerX = width / 2;
  const centerY = height / 2;
  const plateSize = 700 * scale;
  const plateTop = centerY - plateSize / 2;
  context.fillStyle = "#ffffff";
  fillRoundedRect(context, centerX - plateSize / 2, plateTop, plateSize, 28 * scale);

  let qr = null;
  try {
    qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  } catch {
    qr = null;
  }
  if (qr) {
    const count = qr.modules.size;
    const box = Math.max(1, Math.floor((600 * scale) / count));
    const qrSize = box * count;
    const left = Math.round(centerX - qrSize / 2);
    const top = Math.round(centerY - qrSize / 2);
    context.fillStyle = QR_DARK;
    for (let row = 0; row < count; row += 1) {
      for (let column = 0; column < count; column += 1) {
        if (qr.modules.get(row, column)) {
          context.fillRect(left + column * box, top + row * box, box, box);
        }
      }
    }
  }

  context.fillStyle = TEXT_COLOR;
  context.textAlign = "center";
  context.textBaseline = "top";

  const topFont = Math.max(12, Math.round(64 * scale));
  context.font = `700 ${topFont}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  const topLines = wrapText(context, topText, 900 * scale, 2);
  const topLineHeight = Math.round(topFont * 1.3);
  let startY = plateTop - 80 * scale - topLineHeight * topLines.length;
  topLines.forEach((line, index) => {
    context.fillText(line, centerX, startY + index * topLineHeight);
  });

  const bottomFont = Math.max(12, Math.round(72 * scale));
  context.font = `700 ${bottomFont}px "Microsoft YaHei", "PingFang SC", sans-serif`;
  const bottomLines = wrapText(context, bottomText, 900 * scale, 2);
  const bottomLineHeight = Math.round(bottomFont * 1.3);
  startY = plateTop + plateSize + 80 * scale;
  bottomLines.forEach((line, index) => {
    context.fillText(line, centerX, startY + index * bottomLineHeight);
  });
}

function referenceIndexFor(job) {
  const references = Array.isArray(job?.originalReferences)
    ? [...job.originalReferences].sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0))
    : [];
  if (!references.length) return 0;
  return references.length > 1 ? 1 : 0;
}

function jobThumbnail(job) {
  return job?.result?.thumbnailUrl || job?.result?.imageUrl || "";
}

function jobOriginalThumb(job) {
  const references = Array.isArray(job?.originalReferences)
    ? [...job.originalReferences].sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0))
    : [];
  const first = references[0];
  return first?.thumbnailUrl || first?.url || "";
}

export default function AdminVideoWorkshopPage() {
  const [styles, setStyles] = useState([]);
  const [storeOwners, setStoreOwners] = useState([]);
  const [bgmOptions, setBgmOptions] = useState({ builtin: null, uploads: [] });
  const [bgmSelection, setBgmSelection] = useState("builtin");
  const [bgmUploading, setBgmUploading] = useState(false);
  const [templateInfo, setTemplateInfo] = useState(null);
  const [templateUploading, setTemplateUploading] = useState(false);

  const [query, setQuery] = useState({ styleId: "", search: "", page: 1 });
  const [searchDraft, setSearchDraft] = useState("");
  const [jobs, setJobs] = useState([]);
  const [jobsMeta, setJobsMeta] = useState({ total: 0, page: 1, limit: 20 });
  const [jobsLoading, setJobsLoading] = useState(false);
  const [selected, setSelected] = useState([]);

  const [endPage, setEndPage] = useState(DEFAULT_END_PAGE);
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [previewUrl, setPreviewUrl] = useState("");

  const [history, setHistory] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const endPageCanvasRef = useRef(null);

  const qrUrl = useMemo(
    () => buildQrUrl(endPage.siteUrl, endPage.sameStyleId, endPage.inviteCode),
    [endPage.siteUrl, endPage.sameStyleId, endPage.inviteCode]
  );

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const [stylesPayload, ownersPayload, bgmPayload, templatePayload] = await Promise.all([
          fetchJson("/api/styles"),
          fetchJson("/api/admin/store-owner-invites"),
          fetchJson("/api/admin/video-workshop/bgm"),
          fetchJson("/api/admin/video-workshop/template")
        ]);
        if (disposed) return;
        setStyles(Array.isArray(stylesPayload) ? stylesPayload : stylesPayload.styles || []);
        setStoreOwners(ownersPayload.storeOwners || []);
        setBgmOptions({ builtin: bgmPayload.builtin || null, uploads: bgmPayload.uploads || [] });
        setTemplateInfo(templatePayload.template || null);
      } catch (nextError) {
        if (!disposed) setError(nextError.message || "读取基础数据失败。");
      }
    })();
    return () => {
      disposed = true;
    };
  }, []);

  const loadJobs = useCallback(async () => {
    setJobsLoading(true);
    setError("");
    try {
      const searchParams = new URLSearchParams({
        status: "succeeded",
        page: String(query.page),
        limit: "20"
      });
      if (query.styleId) searchParams.set("styleId", query.styleId);
      if (query.search) searchParams.set("search", query.search);
      const payload = await fetchJson(`/api/image-jobs?${searchParams.toString()}`);
      setJobs(payload.jobs || []);
      setJobsMeta({
        total: Number(payload.total || 0),
        page: Number(payload.page || 1),
        limit: Number(payload.limit || 20)
      });
    } catch (nextError) {
      setError(nextError.message || "读取任务列表失败。");
    } finally {
      setJobsLoading(false);
    }
  }, [query.page, query.search, query.styleId]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  const loadHistory = useCallback(async () => {
    try {
      const payload = await fetchJson("/api/admin/video-workshop/jobs?limit=20");
      setHistory(payload.jobs || []);
    } catch {
      // 历史列表失败不打断主流程，用户仍可刷新。
    }
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const hasActiveJob = history.some((job) => job.status === "queued" || job.status === "running");
  useEffect(() => {
    if (!hasActiveJob) return undefined;
    const timer = setInterval(() => {
      void loadHistory();
    }, 2000);
    return () => clearInterval(timer);
  }, [hasActiveJob, loadHistory]);

  // 结尾页预览：正式画布保留原始尺寸用于提交，小画布只负责显示。
  useEffect(() => {
    const canvas = endPageCanvasRef.current;
    if (!canvas) return;
    drawEndPage(canvas, {
      width: params.width,
      height: params.height,
      url: qrUrl,
      topText: endPage.topText,
      bottomText: endPage.bottomText
    });
    setPreviewUrl(canvas.toDataURL("image/png"));
  }, [params.width, params.height, qrUrl, endPage.topText, endPage.bottomText]);

  function toggleJob(job) {
    setError("");
    setSelected((current) => {
      const exists = current.find((item) => item.jobId === job.jobId);
      if (exists) return current.filter((item) => item.jobId !== job.jobId);
      if (current.length >= MAX_SELECTION) {
        setError(`最多选择 ${MAX_SELECTION} 个任务。`);
        return current;
      }
      return [...current, {
        jobId: job.jobId,
        referenceIndex: referenceIndexFor(job),
        styleName: job.styleName || "",
        thumbnailUrl: jobThumbnail(job),
        completedAt: job.completedAt || job.updatedAt || ""
      }];
    });
  }

  function moveSelected(jobId, offset) {
    setSelected((current) => {
      const index = current.findIndex((item) => item.jobId === jobId);
      const nextIndex = index + offset;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }

  async function uploadBgm(file) {
    if (!file) return;
    setBgmUploading(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const payload = await fetchJson("/api/admin/video-workshop/bgm", { method: "POST", body: form });
      setBgmOptions((current) => ({ ...current, uploads: [payload.bgm, ...current.uploads] }));
      setBgmSelection(payload.bgm.id);
      setNotice(`已上传音频 ${payload.bgm.name}。`);
    } catch (nextError) {
      setError(nextError.message || "上传音频失败。");
    } finally {
      setBgmUploading(false);
    }
  }

  async function deleteBgm(bgmId) {
    if (!window.confirm("确认删除该音频？已生成的任务不受影响。")) return;
    setError(""); setNotice("");
    try {
      await fetchJson(`/api/admin/video-workshop/bgm/${encodeURIComponent(bgmId)}`, { method: "DELETE" });
      setBgmOptions((current) => ({ ...current, uploads: current.uploads.filter((item) => item.id !== bgmId) }));
      if (bgmSelection === bgmId) setBgmSelection("builtin");
    } catch (nextError) {
      setError(nextError.message || "删除音频失败。");
    }
  }

  async function uploadTemplate(file) {
    if (!file) return;
    setTemplateUploading(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.append("file", file);
      const payload = await fetchJson("/api/admin/video-workshop/template", { method: "POST", body: form });
      setTemplateInfo(payload.template || null);
      setNotice(`已上传结尾页封面模板 ${payload.template?.name || ""}。`);
    } catch (nextError) {
      setError(nextError.message || "上传模板失败。");
    } finally {
      setTemplateUploading(false);
    }
  }

  async function deleteTemplate() {
    if (!window.confirm("确认删除自定义模板并恢复默认模板？已提交的任务不受影响。")) return;
    setError(""); setNotice("");
    try {
      const payload = await fetchJson("/api/admin/video-workshop/template", { method: "DELETE" });
      setTemplateInfo(payload.template || null);
      setNotice("已恢复默认模板。");
    } catch (nextError) {
      setError(nextError.message || "删除模板失败。");
    }
  }

  async function submitJob() {
    if (selected.length !== MAX_SELECTION) {
      setError(`请先选择 ${MAX_SELECTION} 个任务，当前 ${selected.length} 个。`);
      return;
    }
    setSubmitting(true); setError(""); setNotice("");
    try {
      const endPagePng = previewUrl || endPageCanvasRef.current?.toDataURL("image/png") || "";
      if (!endPagePng) throw new Error("结尾页尚未生成，请稍后再试。");
      const payload = await fetchJson("/api/admin/video-workshop/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobs: selected.map((item) => ({ jobId: item.jobId, referenceIndex: item.referenceIndex })),
          endPagePng,
          params,
          bgm: bgmSelection === "builtin" ? { type: "builtin" } : { type: "upload", id: bgmSelection },
          siteUrl: qrUrl,
          topText: endPage.topText,
          bottomText: endPage.bottomText
        })
      });
      setNotice(`任务 ${payload.job.id} 已提交，生成期间可继续操作其它页面。`);
      await loadHistory();
    } catch (nextError) {
      setError(nextError.message || "提交生成任务失败。");
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteHistoryJob(jobId) {
    if (!window.confirm("确认删除该成片？删除后无法恢复。")) return;
    setError(""); setNotice("");
    try {
      await fetchJson(`/api/admin/video-workshop/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
      await loadHistory();
    } catch (nextError) {
      setError(nextError.message || "删除成片失败。");
    }
  }

  async function copyDownloadLink(job) {
    if (!job.downloadUrl) return;
    const link = new URL(job.downloadUrl, window.location.origin).toString();
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        window.prompt("复制下载链接", link);
      }
      setNotice("下载链接已复制，可在手机浏览器中打开。");
    } catch {
      window.prompt("复制下载链接", link);
    }
  }

  const totalPages = Math.max(1, Math.ceil(Number(jobsMeta.total || 0) / Math.max(1, jobsMeta.limit)));
  const styleNames = useMemo(() => new Map(styles.map((style) => [String(style.id), styleLabel(style)])), [styles]);

  return <section className="task-page referral-admin-page" aria-label="视频工坊">
    <div className="task-toolbar">
      <div>
        <p className="eyebrow">Video workshop</p>
        <h2>视频工坊</h2>
        <p className="storage-note">选择 6 个已完成任务，浏览器生成结尾页，服务器异步渲染成片。参数与桌面版保持一致（380 帧 / 30fps ≈ 12.67 秒）。</p>
      </div>
      <div className="task-toolbar-actions">
        <button className="secondary-button" disabled={jobsLoading} onClick={loadJobs} type="button"><RefreshCw size={18} /><span>{jobsLoading ? "读取中" : "刷新任务"}</span></button>
      </div>
    </div>
    {error ? <p className="error-note">{error}</p> : null}
    {notice ? <p className="success-note">{notice}</p> : null}

    <div className="referral-admin-card">
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Step 1</p><h3>选择任务（{selected.length}/{MAX_SELECTION}）</h3><p className="storage-note">参考图规则与桌面版一致：按排序后多于 1 张取第 2 张，否则取第 1 张。</p></div></div>
      <div className="vw-task-filters">
        <label className="field-label vw-nowrap">风格
          <select className="field-inline-input" onChange={(event) => { setQuery((current) => ({ ...current, styleId: event.target.value, page: 1 })); }} value={query.styleId}>
            <option value="">全部风格</option>
            {styles.map((style) => <option key={style.id} value={style.id}>{styleLabel(style)}</option>)}
          </select>
        </label>
        <label className="vw-keyword-box"><span>关键词</span><input onChange={(event) => setSearchDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") setQuery((current) => ({ ...current, search: searchDraft.trim(), page: 1 })); }} placeholder="任务号 / 风格 / 用户" value={searchDraft} /></label>
        <button className="secondary-button" onClick={() => setQuery((current) => ({ ...current, search: searchDraft.trim(), page: 1 }))} type="button">查询</button>
      </div>

      <div className="vw-task-grid">
        {jobs.map((job) => {
          const order = selected.findIndex((item) => item.jobId === job.jobId);
          const originalThumb = jobOriginalThumb(job);
          const resultThumb = jobThumbnail(job);
          const styleName = styleNames.get(String(job.styleId)) || job.styleName || "";
          return <button className={`vw-task-card ${order >= 0 ? "is-selected" : ""}`} key={job.jobId} onClick={() => toggleJob(job)} type="button">
            <div className="vw-task-images">
              <figure>
                {originalThumb ? <img alt="原始图片" loading="lazy" src={originalThumb} /> : <span className="vw-thumb-empty">无原图</span>}
                <figcaption>原图</figcaption>
              </figure>
              <figure>
                {resultThumb ? <img alt="转绘结果" loading="lazy" src={resultThumb} /> : <span className="vw-thumb-empty">无结果</span>}
                <figcaption>转绘</figcaption>
              </figure>
            </div>
            <div className="vw-task-meta">
              <strong>{styleName || "未命名风格"}</strong>
              {order >= 0 ? <span className="merchant-badge is-online">第 {order + 1} 个</span> : <span className="storage-note">点击选择</span>}
            </div>
          </button>;
        })}
      </div>
      {!jobs.length ? <p className="order-table-empty">{jobsLoading ? "正在读取任务…" : "没有符合条件的已完成任务。"}</p> : null}
      <div className="merchant-modal-actions">
        <button className="secondary-button" disabled={query.page <= 1 || jobsLoading} onClick={() => setQuery((current) => ({ ...current, page: current.page - 1 }))} type="button">上一页</button>
        <span className="storage-note">第 {jobsMeta.page} / {totalPages} 页 · 共 {jobsMeta.total} 个</span>
        <button className="secondary-button" disabled={query.page >= totalPages || jobsLoading} onClick={() => setQuery((current) => ({ ...current, page: current.page + 1 }))} type="button">下一页</button>
      </div>

      {selected.length ? <div className="vw-selected-list">
        {selected.map((item, index) => <div className="vw-selected-item" key={item.jobId}>
          <span className="merchant-badge is-online">{index + 1}</span>
          {item.thumbnailUrl ? <img alt="已选任务" className="vw-selected-thumb" src={item.thumbnailUrl} /> : null}
          <div className="user-admin-identity"><strong>{item.styleName || item.jobId}</strong><span>{item.jobId}</span></div>
          <div className="store-owner-wechat-value">
            <button className="secondary-button" disabled={index === 0} onClick={() => moveSelected(item.jobId, -1)} type="button">上移</button>
            <button className="secondary-button" disabled={index === selected.length - 1} onClick={() => moveSelected(item.jobId, 1)} type="button">下移</button>
            <button className="danger-button" onClick={() => toggleJob(item)} type="button">移除</button>
          </div>
        </div>)}
        <button className="secondary-button" onClick={() => setSelected([])} type="button">清空选择</button>
      </div> : null}
    </div>

    <div className="referral-admin-card">
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Step 2</p><h3>结尾页</h3><p className="storage-note">结尾页在本机浏览器生成并提交 PNG，所见即所得。</p></div></div>
      <div className="vw-cover-template-row">
        <div className="vw-cover-template-preview">
          {templateInfo ? <img alt="结尾页封面模板" src={templateInfo.url} /> : <span>加载中…</span>}
        </div>
        <div className="vw-cover-template-info">
          <strong>结尾页封面模板（亚克力冰箱贴）</strong>
          <p className="storage-note">生成时用第 6 个任务的转绘结果替换模板中冰箱贴内的图片，并把成品图放在结尾页前（默认 2 秒，可在 Step 3 调整）。{templateInfo?.isDefault ? "当前使用默认模板，不上传则一直沿用。" : "当前使用自定义模板。"}</p>
          <div className="store-owner-wechat-value">
            <label className="secondary-button vw-upload-button">
              {templateUploading ? "上传中…" : templateInfo?.isDefault ? "上传自定义模板" : "更换图片"}
              <input accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => { void uploadTemplate(event.target.files?.[0]); event.target.value = ""; }} type="file" />
            </label>
            {templateInfo && !templateInfo.isDefault ? <button className="danger-button" onClick={() => { void deleteTemplate(); }} type="button">恢复默认</button> : null}
          </div>
        </div>
      </div>
      <div className="vw-end-page-layout">
        <div className="store-profile-grid vw-end-page-fields">
          <label className="field-label">落地网址<input className="field-inline-input" onChange={(event) => setEndPage((current) => ({ ...current, siteUrl: event.target.value }))} value={endPage.siteUrl} /></label>
          <label className="field-label">小画店家
            <select className="field-inline-input" onChange={(event) => {
              const owner = storeOwners.find((item) => String(item.accountId) === event.target.value);
              setEndPage((current) => ({ ...current, inviteCode: owner?.inviteCode || "" }));
            }} value={storeOwners.find((item) => item.inviteCode && item.inviteCode === endPage.inviteCode)?.accountId || ""}>
              <option value="">不指定</option>
              {storeOwners.map((owner) => <option key={owner.accountId} value={owner.accountId}>{owner.storeName || owner.wechatId || owner.accountId}</option>)}
            </select>
          </label>
          <label className="field-label">邀请码<input className="field-inline-input" onChange={(event) => setEndPage((current) => ({ ...current, inviteCode: event.target.value.trim() }))} placeholder="可留空" value={endPage.inviteCode} /></label>
          <label className="field-label">指定风格
            <select className="field-inline-input" onChange={(event) => setEndPage((current) => ({ ...current, sameStyleId: event.target.value }))} value={endPage.sameStyleId}>
              <option value="">不指定</option>
              {styles.map((style) => <option key={style.id} value={style.id}>{styleLabel(style)}</option>)}
            </select>
          </label>
          <label className="field-label">上方文案<input className="field-inline-input" maxLength={40} onChange={(event) => setEndPage((current) => ({ ...current, topText: event.target.value }))} value={endPage.topText} /></label>
          <label className="field-label">下方文案<input className="field-inline-input" maxLength={40} onChange={(event) => setEndPage((current) => ({ ...current, bottomText: event.target.value }))} value={endPage.bottomText} /></label>
          <div className="field-label">二维码链接<span className="device-token-value">{qrUrl}</span></div>
        </div>
        <div className="vw-end-preview">
          <img alt="结尾页预览" src={previewUrl} />
          <p className="storage-note">{params.width} × {params.height} PNG</p>
        </div>
      </div>
      <canvas ref={endPageCanvasRef} style={{ display: "none" }} />
    </div>

    <div className="referral-admin-card">
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Step 3</p><h3>生成</h3><p className="storage-note">服务器单并发渲染，提交后可离开当前页面，稍后回来查看结果。</p></div></div>
      <div className="store-profile-grid">
        <label className="field-label">每张帧数<input className="field-inline-input" max={240} min={2} onChange={(event) => setParams((current) => ({ ...current, framesPer: Number(event.target.value) || 24 }))} step={2} type="number" value={params.framesPer} /></label>
        <label className="field-label">结尾帧数<input className="field-inline-input" max={600} min={2} onChange={(event) => setParams((current) => ({ ...current, endFrames: Number(event.target.value) || 92 }))} step={2} type="number" value={params.endFrames} /></label>
        <label className="field-label">成品图秒数<input className="field-inline-input" max={10} min={0} onChange={(event) => setParams((current) => ({ ...current, coverSeconds: Math.max(0, Math.min(10, Number(event.target.value) || 0)) }))} step={0.5} type="number" value={params.coverSeconds} /></label>
        <label className="field-label">推近幅度<input className="field-inline-input" max={0.3} min={0} onChange={(event) => setParams((current) => ({ ...current, zoom: Number(event.target.value) || 0 }))} step={0.01} type="number" value={params.zoom} /></label>
        <label className="field-label">宽<input className="field-inline-input" max={2160} min={360} onChange={(event) => setParams((current) => ({ ...current, width: Math.max(360, Math.min(2160, Number(event.target.value) || 1080)) }))} step={2} type="number" value={params.width} /></label>
        <label className="field-label">高<input className="field-inline-input" max={2160} min={360} onChange={(event) => setParams((current) => ({ ...current, height: Math.max(360, Math.min(2160, Number(event.target.value) || 1620)) }))} step={2} type="number" value={params.height} /></label>
        <label className="field-label">背景音乐
          <select className="field-inline-input" onChange={(event) => setBgmSelection(event.target.value)} value={bgmSelection}>
            <option value="builtin">{bgmOptions.builtin ? `内置 BGM（${formatBytes(bgmOptions.builtin.size)}）` : "内置 BGM（缺失）"}</option>
            {bgmOptions.uploads.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>
      <div className="merchant-modal-actions">
        <label className="secondary-button vw-upload-button">
          {bgmUploading ? "上传中…" : "上传音频"}
          <input accept=".mp3,.m4a,.wav,.aac,audio/*" hidden onChange={(event) => { void uploadBgm(event.target.files?.[0]); event.target.value = ""; }} type="file" />
        </label>
        {bgmOptions.uploads.map((item) => <button className="danger-button" key={item.id} onClick={() => deleteBgm(item.id)} type="button">删除 {item.name}</button>)}
      </div>
      <p className="storage-note">预计 {selected.length * params.framesPer * 2 + params.endFrames} 帧 · {((selected.length * params.framesPer * 2 + params.endFrames) / 30).toFixed(2)} 秒</p>
      <div className="merchant-modal-actions">
        <button className="maintenance-button" disabled={submitting || selected.length !== MAX_SELECTION} onClick={submitJob} type="button"><Video size={18} /><span>{submitting ? "提交中" : "开始生成"}</span></button>
      </div>
    </div>

    <div className="referral-admin-card">
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">History</p><h3>生成记录</h3><p className="storage-note">仅保留最近 30 个已结束任务（14 天内）。</p></div><button className="secondary-button" onClick={loadHistory} type="button"><RefreshCw size={18} /><span>刷新</span></button></div>
      <div className="vw-job-grid">
        {history.map((job) => <div className="vw-job-card" key={job.id}>
          <div className="vw-job-head">
            <strong>{job.id}</strong>
            <span className={`merchant-badge ${job.status === "succeeded" ? "is-online" : job.status === "failed" ? "is-offline" : "is-idle"}`}>
              {job.status === "succeeded" ? "已完成" : job.status === "failed" ? "失败" : job.status === "running" ? "生成中" : "排队中"}
            </span>
          </div>
          <p className="storage-note">{formatTime(job.createdAt)} · {job.bgmName || "内置 BGM"} · {formatBytes(job.outputBytes)}{job.coverJobId ? ` · 封面任务 ${job.coverJobId}` : ""}</p>
          {job.status === "running" || job.status === "queued" ? <div className="vw-progress"><span style={{ width: `${Math.max(2, job.progress || 0)}%` }} /></div> : null}
          <p className="storage-note">{job.message || ""}{job.error ? `：${job.error}` : ""}</p>
          {job.status === "succeeded" ? <video className="vw-video" controls playsInline preload="metadata" src={job.downloadUrl || `/api/admin/video-workshop/jobs/${encodeURIComponent(job.id)}/file`} /> : null}
          <div className="store-owner-wechat-value">
            {job.status === "succeeded" && job.downloadUrl ? <a className="secondary-button" download href={`${job.downloadUrl}&download=1`}><Download size={16} /><span>下载</span></a> : null}
            {job.status === "succeeded" && job.downloadUrl ? <button className="secondary-button" onClick={() => copyDownloadLink(job)} type="button">复制链接</button> : null}
            {job.status === "succeeded" || job.status === "failed" ? <button className="danger-button" onClick={() => deleteHistoryJob(job.id)} type="button"><Trash2 size={16} /><span>删除</span></button> : null}
          </div>
          {job.status === "succeeded" ? <p className="storage-note vw-download-tip">
            {IS_WECHAT
              ? "微信内不能直接保存视频：点右上角「…」→「在浏览器打开」后再下载；或长按上方视频选择「保存视频」。"
              : IS_IOS
                ? "iPhone 下载后会存到「文件」App；需要进相册的话，播放视频后点分享 →「存储视频」。"
                : "若没有自动保存，长按上方视频选择「保存视频」，或在浏览器下载记录里查看。"}
          </p> : null}
        </div>)}
        {!history.length ? <p className="storage-note">暂无生成记录。</p> : null}
      </div>
    </div>
  </section>;
}
