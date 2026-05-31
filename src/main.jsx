import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Clipboard, Download, Eye, GripVertical, Home, ImageUp, Layers3, ListTodo, LoaderCircle, Plus, RefreshCw, Save, Search, Settings, Sparkles, Trash2, X } from "lucide-react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const GENERATION_DEFAULTS = {
  quality: "medium",
  output_format: "png",
  background: "auto",
  moderation: "auto"
};

const DEFAULT_GENERATION_SIZE = "1024x1536";
const GENERATION_SIZE_OPTIONS = [
  { value: "1024x1536", label: "2:3" },
  { value: "1536x1024", label: "3:2" },
  { value: "1024x1024", label: "1:1" },
  { value: "1024x1365", label: "3:4" },
  { value: "1365x1024", label: "4:3" }
];

const REFERENCE_UPLOAD_LIMITS = {
  maxBytes: 4 * 1024 * 1024,
  maxDimension: 2048,
  jpegQuality: 0.86
};

const GENERATION_STEPS = ["准备请求", "提交到中转站", "等待模型生成", "接收图片结果", "准备预览"];

function readRoute() {
  if (window.location.pathname === "/manage") return "manage";
  if (window.location.pathname === "/tasks") return "tasks";
  if (window.location.pathname === "/batch") return "batch";
  return "home";
}

function App() {
  const [styles, setStyles] = useState([]);
  const [styleGroups, setStyleGroups] = useState([]);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [activePrompt, setActivePrompt] = useState(null);
  const [activeGenerator, setActiveGenerator] = useState(null);
  const [route, setRoute] = useState(() => readRoute());

  useEffect(() => {
    refreshStyles().then(setStyles);
    refreshStyleGroups().then(setStyleGroups);
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const filteredStyles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return styles;
    return styles.filter((style) => `${style.tags.join(" ")} ${style.prompt}`.toLowerCase().includes(keyword));
  }, [query, styles]);

  function navigate(nextRoute) {
    const path = nextRoute === "manage" ? "/manage" : nextRoute === "tasks" ? "/tasks" : nextRoute === "batch" ? "/batch" : "/";
    window.history.pushState({}, "", path);
    setRoute(nextRoute);
    setActivePrompt(null);
    setActiveGenerator(null);
  }

  async function copyPrompt(style) {
    await copyText(style.prompt);
    setCopiedId(style.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  }

  async function createStyle() {
    const response = await fetch("/api/styles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: ["新风格"], prompt: "在这里填写这个风格对应的提示词。" })
    });
    const created = await response.json();
    setStyles((current) => [created, ...current]);
  }

  async function updateStyle(styleId, payload) {
    const response = await fetch(`/api/styles/${styleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const updated = await response.json();
    setStyles((current) => current.map((style) => (style.id === styleId ? updated : style)));
  }

  async function deleteStyle(styleId) {
    await fetch(`/api/styles/${styleId}`, { method: "DELETE" });
    setStyles((current) => current.filter((style) => style.id !== styleId));
  }

  async function uploadStyleImage(styleId, file) {
    const formData = new FormData();
    formData.append("image", file);
    const response = await fetch(`/api/styles/${styleId}/image`, {
      method: "POST",
      body: formData
    });
    const updated = await response.json();
    setStyles((current) => current.map((style) => (style.id === styleId ? updated : style)));
  }

  async function reorderVisibleStyles(orderedVisibleIds) {
    if (!orderedVisibleIds.length) return;
    const visibleIds = new Set(orderedVisibleIds);
    const styleById = new Map(styles.map((style) => [style.id, style]));
    let visibleIndex = 0;
    const nextStyles = styles.map((style) => {
      if (!visibleIds.has(style.id)) return style;
      const nextId = orderedVisibleIds[visibleIndex];
      visibleIndex += 1;
      return styleById.get(nextId) || style;
    });

    setStyles(nextStyles);
    try {
      const response = await fetch("/api/styles/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: nextStyles.map((style) => style.id) })
      });
      if (!response.ok) throw new Error("Failed to save order");
      const savedStyles = await response.json();
      setStyles(savedStyles);
    } catch {
      refreshStyles().then(setStyles);
    }
  }

  async function createStyleGroup(payload) {
    const response = await fetch("/api/style-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const created = await response.json();
    setStyleGroups((current) => [created, ...current]);
  }

  async function updateStyleGroup(groupId, payload) {
    const response = await fetch(`/api/style-groups/${groupId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const updated = await response.json();
    setStyleGroups((current) => current.map((group) => (group.id === groupId ? updated : group)));
  }

  async function deleteStyleGroup(groupId) {
    await fetch(`/api/style-groups/${groupId}`, { method: "DELETE" });
    setStyleGroups((current) => current.filter((group) => group.id !== groupId));
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Prompt reference board</p>
            <h1>风格提示词图库</h1>
          </div>
          <div className="top-actions">
            <label className="search-box">
              <Search size={18} />
              <input aria-label="搜索标签或提示词" onChange={(event) => setQuery(event.target.value)} placeholder="搜索标签" value={query} />
            </label>
            <button className="nav-button" onClick={() => navigate(route === "manage" ? "home" : "manage")} type="button">
              {route === "manage" ? <Home size={18} /> : <Settings size={18} />}
              <span>{route === "manage" ? "返回主页" : "维护内容"}</span>
            </button>
            <button className="nav-button" onClick={() => navigate(route === "tasks" ? "home" : "tasks")} type="button">
              {route === "tasks" ? <Home size={18} /> : <ListTodo size={18} />}
              <span>{route === "tasks" ? "返回主页" : "任务记录"}</span>
            </button>
            <button className="nav-button" onClick={() => navigate(route === "batch" ? "home" : "batch")} type="button">
              {route === "batch" ? <Home size={18} /> : <Layers3 size={18} />}
              <span>{route === "batch" ? "返回主页" : "批量生成"}</span>
            </button>
          </div>
        </header>

        {route === "tasks" ? (
          <ImageJobsPage />
        ) : route === "batch" ? (
          <BatchGeneratePage
            groups={styleGroups}
            onCreateGroup={createStyleGroup}
            onDeleteGroup={deleteStyleGroup}
            onUpdateGroup={updateStyleGroup}
            styles={styles}
          />
        ) : route === "manage" ? (
          <ManagePage
            onCreateStyle={createStyle}
            onDeleteStyle={deleteStyle}
            onReorderStyles={reorderVisibleStyles}
            onStyleChange={updateStyle}
            onUploadImage={uploadStyleImage}
            styles={filteredStyles}
          />
        ) : (
          <GalleryPage copiedId={copiedId} onCopy={copyPrompt} onGenerate={setActiveGenerator} onViewPrompt={setActivePrompt} styles={filteredStyles} />
        )}
      </section>

      {activePrompt && (
        <div className="modal-backdrop" onClick={() => setActivePrompt(null)} role="presentation">
          <section className="prompt-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <div className="tag-row">
                {activePrompt.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <button className="copy-button compact" onClick={() => copyPrompt(activePrompt)} type="button">
                <Clipboard size={18} />
                <span>复制</span>
              </button>
            </div>
            <p className="prompt-text">{activePrompt.prompt}</p>
            <button className="secondary-button" onClick={() => setActivePrompt(null)} type="button">
              关闭
            </button>
          </section>
        </div>
      )}

      {activeGenerator && <ImageGeneratorModal onClose={() => setActiveGenerator(null)} style={activeGenerator} />}
    </main>
  );
}

function GalleryPage({ copiedId, onCopy, onGenerate, onViewPrompt, styles }) {
  const columnCount = useResponsiveColumnCount();
  const columns = useMemo(() => splitStylesByColumns(styles, columnCount), [styles, columnCount]);

  return (
    <section className="masonry-gallery" aria-label="风格提示词列表">
      {columns.map((column, columnIndex) => (
        <div className="masonry-column" key={columnIndex}>
          {column.map((style) => (
        <article className="style-card" key={style.id}>
          <div className="image-frame">
            <img alt={`${style.tags.join("、")}示例图`} src={cacheBust(style.image)} />
          </div>
          <div className="tag-row">
            {style.tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <div className="card-actions gallery-actions">
            <button className="copy-button" onClick={() => onCopy(style)} type="button">
              {copiedId === style.id ? <Check size={18} /> : <Clipboard size={18} />}
              <span>{copiedId === style.id ? "已复制" : "复制提示词"}</span>
            </button>
            <button className="secondary-button" onClick={() => onViewPrompt(style)} type="button">
              <Eye size={18} />
              <span>查看提示词</span>
            </button>
            <button className="generate-button" onClick={() => onGenerate(style)} type="button">
              <Sparkles size={18} />
              <span>AI 生图</span>
            </button>
          </div>
        </article>
          ))}
        </div>
      ))}
    </section>
  );
}

function useResponsiveColumnCount() {
  const [columnCount, setColumnCount] = useState(() => getResponsiveColumnCount());

  useEffect(() => {
    const updateColumnCount = () => setColumnCount(getResponsiveColumnCount());
    window.addEventListener("resize", updateColumnCount);
    return () => window.removeEventListener("resize", updateColumnCount);
  }, []);

  return columnCount;
}

function getResponsiveColumnCount() {
  if (window.matchMedia("(max-width: 820px)").matches) return 1;
  if (window.matchMedia("(max-width: 1120px)").matches) return 2;
  return 3;
}

function splitStylesByColumns(styles, columnCount) {
  return styles.reduce(
    (columns, style, index) => {
      columns[index % columnCount].push(style);
      return columns;
    },
    Array.from({ length: columnCount }, () => [])
  );
}

function ImageGeneratorModal({ onClose, style }) {
  const previewRef = useRef(null);
  const [prompt, setPrompt] = useState(style.prompt);
  const [size, setSize] = useState(DEFAULT_GENERATION_SIZE);
  const [references, setReferences] = useState([]);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [referenceNotice, setReferenceNotice] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [jobId, setJobId] = useState("");
  const [jobStatus, setJobStatus] = useState("");
  const [jobMessage, setJobMessage] = useState("");
  const [progressStep, setProgressStep] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    refreshImageProviders()
      .then((payload) => {
        setProviders(payload.providers || []);
        setSelectedProvider(payload.defaultProvider || payload.providers?.[0]?.id || "");
      })
      .catch(() => {
        setProviders([]);
        setSelectedProvider("");
      });
  }, []);

  useEffect(() => {
    let isActive = true;

    async function preloadStyleReference() {
      if (!style.useStyleImageAsReference) return;
      if (!isUploadableReferenceImage(style.image)) {
        setReferenceNotice("当前示例图不是可直接作为参考图上传的位图格式，已跳过自动带入。");
        return;
      }

      try {
        const response = await fetch(cacheBust(style.image));
        if (!response.ok) throw new Error("Failed to fetch style preview");

        const blob = await response.blob();
        if (!isActive) return;

        const mimeType = normalizeReferenceMimeType(blob.type, style.image);
        if (!mimeType) {
          setReferenceNotice("当前示例图格式暂不支持作为参考图上传，已跳过自动带入。");
          return;
        }

        const file = new File([blob], `${style.id}-style-reference.${extensionFromMimeType(mimeType)}`, {
          type: mimeType,
          lastModified: Date.now()
        });

        setReferences([
          {
            id: `style-reference-${style.id}`,
            file,
            order: 0,
            previewUrl: URL.createObjectURL(file),
            locked: true
          }
        ]);
        setReferenceNotice("已自动将本风格示例图加入为图一。");
      } catch {
        if (!isActive) return;
        setReferenceNotice("示例图自动带入失败，请手动上传参考图。");
      }
    }

    preloadStyleReference();
    return () => {
      isActive = false;
    };
  }, [style.id, style.image, style.useStyleImageAsReference]);

  useEffect(() => {
    if (!isGenerating) return undefined;
    const startedAt = Date.now();
    setElapsedSeconds(0);
    const timer = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= 4) setProgressStep(2);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    if (!jobId || !isGenerating) return undefined;

    let isActive = true;
    async function pollJob() {
      try {
        const payload = await fetchImageJob(jobId);
        if (!isActive) return;

        setJobStatus(payload.status || "");
        setJobMessage(payload.message || "");

        if (payload.status === "queued") {
          setProgressStep(1);
          return;
        }

        if (payload.status === "running") {
          setProgressStep(2);
          return;
        }

        if (payload.status === "succeeded") {
          setProgressStep(4);
          setResult(payload.result);
          setIsGenerating(false);
          return;
        }

        if (payload.status === "failed") {
          setProgressStep(3);
          setError(payload.message || "生图失败，请稍后再试。");
          setIsGenerating(false);
        }
      } catch (nextError) {
        if (!isActive) return;
        setError(nextError.message);
        setIsGenerating(false);
      }
    }

    pollJob();
    const timer = window.setInterval(pollJob, 2000);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [jobId, isGenerating]);

  useEffect(() => {
    return () => {
      references.forEach((reference) => URL.revokeObjectURL(reference.previewUrl));
    };
  }, [references]);

  useEffect(() => {
    if (result?.imageDataUrl || result?.imageUrl) {
      previewRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [result]);

  async function generateImage() {
    setError("");
    setResult(null);
    setJobId("");
    setJobStatus("");
    setJobMessage("");
    setIsGenerating(true);
    setIsSubmitting(true);
    setProgressStep(0);

    try {
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("size", size);
      if (selectedProvider) formData.append("provider", selectedProvider);
      Object.entries(GENERATION_DEFAULTS).forEach(([key, value]) => formData.append(key, value));
      const preparedReferences = await Promise.all(getOrderedReferences(references).map(prepareReferenceForUpload));
      preparedReferences.forEach((reference) => formData.append("reference", reference.file));
      setProgressStep(1);

      const response = await fetch("/api/image-jobs", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "生图任务提交失败，请稍后再试。");
      if (!payload.jobId) throw new Error("生图任务提交成功，但没有返回任务编号。");
      setJobId(payload.jobId || "");
      setJobStatus(payload.status || "queued");
      setJobMessage(payload.message || "任务已提交，等待生成。");
    } catch (nextError) {
      setError(nextError.message);
      setIsGenerating(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  function downloadResult() {
    const source = result?.imageDataUrl || result?.imageUrl;
    if (!source) return;
    const link = document.createElement("a");
    link.href = source;
    link.download = `prompt-reference-${style.id}-${Date.now()}.png`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function addReferences(files) {
    setReferences((current) => {
      const availableSlots = Math.max(0, 10 - current.length);
      const nextFiles = files.slice(0, availableSlots);
      return [
        ...current,
        ...nextFiles.map((file, index) => ({
          id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}-${index}`,
          file,
          order: current.length + index,
          previewUrl: URL.createObjectURL(file)
        }))
      ];
    });
  }

  function changeReferenceOrder(referenceId, nextOrder) {
    setReferences((current) => {
      const moved = current.find((reference) => reference.id === referenceId);
      const swapped = current.find((reference) => reference.order === nextOrder);
      if (!moved || moved.order === nextOrder || moved.locked || swapped?.locked) return current;

      return current.map((reference) => {
        if (reference.id === moved.id) return { ...reference, order: nextOrder };
        if (swapped && reference.id === swapped.id) return { ...reference, order: moved.order };
        return reference;
      });
    });
  }

  function removeReference(referenceId) {
    setReferences((current) => {
      const removed = current.find((reference) => reference.id === referenceId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current
        .filter((reference) => reference.id !== referenceId)
        .sort((a, b) => a.order - b.order)
        .map((reference, index) => ({ ...reference, order: index }));
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="prompt-modal generator-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <p className="eyebrow">gpt-image-2</p>
            <h2>AI 生图</h2>
            <div className="tag-row">
              {style.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="关闭">
            <X size={20} />
          </button>
        </div>

        <label className="field-label">
          提示词
          <textarea onChange={(event) => setPrompt(event.target.value)} value={prompt} />
        </label>

        <label className="field-label">
          接口供应商
          <select onChange={(event) => setSelectedProvider(event.target.value)} value={selectedProvider}>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} · {provider.model}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          比例
          <select onChange={(event) => setSize(event.target.value)} value={size}>
            {GENERATION_SIZE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field-label">
          参考图
          <input
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={(event) => {
              addReferences(Array.from(event.target.files || []));
              event.target.value = "";
            }}
            type="file"
          />
        </label>

        {referenceNotice && <p className="storage-note">{referenceNotice}</p>}

        {references.length > 0 && (
          <div className="reference-list">
            <p className="storage-note">提示词里的“图一 / 图二”对应下面列表中的编号。</p>
            <p className="storage-note">生成前会自动压缩体积过大或边长过长的参考图，再按当前编号顺序上传。</p>
            {getOrderedReferences(references).map((reference) => (
              <article className="reference-item" key={reference.id}>
                <img alt={`${imageLabel(reference.order)}预览`} src={reference.previewUrl} />
                <div className="reference-meta">
                  <strong>{reference.file.name}</strong>
                  <span>{formatFileSize(reference.file.size)}</span>
                </div>
                <label className="reference-order">
                  <span>编号</span>
                  <select disabled={reference.locked} onChange={(event) => changeReferenceOrder(reference.id, Number(event.target.value))} value={reference.order}>
                    {references.map((_, index) => (
                      <option key={index} value={index}>
                        {imageLabel(index)}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="icon-button" disabled={reference.locked} onClick={() => removeReference(reference.id)} type="button" aria-label={`删除${reference.file.name}`}>
                  <Trash2 size={18} />
                </button>
              </article>
            ))}
          </div>
        )}
        {isGenerating && (
          <GenerationProgress
            currentStep={progressStep}
            elapsedSeconds={elapsedSeconds}
            hasReference={references.length > 0}
            jobMessage={jobMessage}
            jobStatus={jobStatus}
          />
        )}
        {error && <p className="error-note">{error}</p>}

        {(result?.imageDataUrl || result?.imageUrl) && (
          <div className="generated-preview" ref={previewRef}>
            <img alt="AI 生成结果" src={result.imageDataUrl || result.imageUrl} />
            <p className="storage-note">
              生成模式：{result.mode === "edit" ? "参考图编辑" : "文生图"}
              {result.provider?.name ? `，接口：${result.provider.name}` : ""}
              {result.usage?.total_tokens ? `，消耗 ${result.usage.total_tokens} tokens` : ""}
            </p>
          </div>
        )}

        <div className="card-actions generator-actions">
          <button className="copy-button" disabled={isSubmitting || !prompt.trim()} onClick={generateImage} type="button">
            {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            <span>{generationButtonLabel(isSubmitting, isGenerating, jobStatus, result)}</span>
          </button>
          <button className="secondary-button" disabled={!(result?.imageDataUrl || result?.imageUrl)} onClick={downloadResult} type="button">
            <Download size={18} />
            <span>下载</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function GenerationProgress({ currentStep, elapsedSeconds, hasReference, jobMessage, jobStatus }) {
  return (
    <div className="generation-progress" role="status" aria-live="polite">
      <div className="progress-head">
        <span>{jobMessage || GENERATION_STEPS[currentStep]}</span>
        <span>{elapsedSeconds}s</span>
      </div>
      <div className="progress-track">
        <span style={{ width: `${Math.max(12, ((currentStep + 1) / GENERATION_STEPS.length) * 100)}%` }} />
      </div>
      <ol className="progress-steps">
        {GENERATION_STEPS.map((step, index) => (
          <li className={index <= currentStep ? "active" : ""} key={step}>
            {step}
          </li>
        ))}
      </ol>
      <p className="storage-note">
        {generationProgressNote(currentStep, hasReference, jobStatus)}
      </p>
    </div>
  );
}

function generationProgressNote(currentStep, hasReference, jobStatus) {
  if (jobStatus === "queued") return "任务已提交，页面会每 2 秒自动检查一次结果。";
  if (jobStatus === "running") return "后台正在请求模型，关闭弹窗后将停止本次页面轮询。";
  if (currentStep < 2) {
    return hasReference ? "正在打包提示词、参数和参考图。" : "正在打包提示词和参数。";
  }
  return "图片生成通常需要几十秒，复杂提示词、参考图或高分辨率可能需要数分钟。";
}

function generationButtonLabel(isSubmitting, isGenerating, jobStatus, result) {
  if (isSubmitting) return "提交中";
  if (isGenerating) return jobStatus === "queued" || jobStatus === "running" ? "再提交一个任务" : "继续生成";
  if (!isGenerating && (result?.imageDataUrl || result?.imageUrl)) return "重新生成";
  return "开始生成";
}

function imageLabel(index) {
  const labels = ["图一", "图二", "图三", "图四", "图五", "图六", "图七", "图八", "图九", "图十"];
  return labels[index] || `图${index + 1}`;
}

function getOrderedReferences(references) {
  return [...references].sort((a, b) => a.order - b.order);
}

function formatFileSize(size) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function prepareReferenceForUpload(reference) {
  const file = reference.file;
  if (!file.type.startsWith("image/")) return reference;

  try {
    const bitmap = await createImageBitmap(file);
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, REFERENCE_UPLOAD_LIMITS.maxDimension / longestSide);
    const shouldCompress = file.size > REFERENCE_UPLOAD_LIMITS.maxBytes || scale < 1;

    if (!shouldCompress) {
      bitmap.close?.();
      return reference;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return reference;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", REFERENCE_UPLOAD_LIMITS.jpegQuality));
    if (!blob || blob.size >= file.size) return reference;

    const compressedName = `${file.name.replace(/\.[^.]+$/, "") || "reference"}-compressed.jpg`;
    return {
      ...reference,
      file: new File([blob], compressedName, {
        type: "image/jpeg",
        lastModified: file.lastModified
      })
    };
  } catch {
    return reference;
  }
}

function ImageJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadJobs() {
    setIsLoading(true);
    try {
      const payload = await refreshImageJobs();
      setJobs(payload.jobs || []);
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function cancelJob(jobId) {
    try {
      await updateImageJob(jobId, "cancel");
      await loadJobs();
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function deleteJob(jobId) {
    try {
      await deleteImageJob(jobId);
      setJobs((current) => current.filter((job) => job.jobId !== jobId));
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  useEffect(() => {
    let isActive = true;
    async function loadActiveJobs() {
      try {
        const payload = await refreshImageJobs();
        if (!isActive) return;
        setJobs(payload.jobs || []);
        setError("");
      } catch (nextError) {
        if (!isActive) return;
        setError(nextError.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    loadActiveJobs();
    const timer = window.setInterval(loadActiveJobs, 2000);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, []);

  const visibleJobs = jobs.filter((job) => statusFilter === "all" || job.status === statusFilter);
  const activeCount = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const completedCount = jobs.filter((job) => job.status === "succeeded").length;

  return (
    <section className="task-page" aria-label="AI 生图任务记录">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">Image jobs</p>
          <h2>任务记录</h2>
          <p className="storage-note">
            {activeCount} 个进行中，{completedCount} 个已完成
          </p>
        </div>
        <button className="secondary-button" onClick={loadJobs} type="button">
          <RefreshCw size={18} />
          <span>{isLoading ? "刷新中" : "刷新"}</span>
        </button>
      </div>

      <div className="task-filters" role="tablist" aria-label="任务状态筛选">
        {["all", "queued", "running", "succeeded", "failed", "cancelled"].map((status) => (
          <button className={statusFilter === status ? "active" : ""} key={status} onClick={() => setStatusFilter(status)} type="button">
            {statusLabel(status)}
          </button>
        ))}
      </div>

      {error && <p className="error-note">{error}</p>}
      {!isLoading && !visibleJobs.length && <p className="empty-note">还没有符合条件的生图任务。</p>}

      <div className="task-list">
        {visibleJobs.map((job) => {
          const imageSource = job.result?.imageDataUrl || job.result?.imageUrl;
          return (
            <article className="task-card" key={job.jobId}>
              <div className={`task-status ${job.status}`}>{statusLabel(job.status)}</div>
              <div className="task-preview">
                {imageSource ? <img alt="AI 生成结果" src={imageSource} /> : <Sparkles size={24} />}
              </div>
              <div className="task-detail">
                <div className="task-meta-row">
                  <strong>{shortJobId(job.jobId)}</strong>
                  {job.styleName ? <span>{job.styleName}</span> : null}
                  {job.styleGroupName ? <span>组：{job.styleGroupName}</span> : null}
                  <span>{modeLabel(job.mode)}</span>
                  <span>{job.provider?.name || "未记录接口"}</span>
                  <span>{formatDateTime(job.createdAt)}</span>
                  {job.durationSeconds !== null && job.durationSeconds !== undefined ? <span>耗时 {formatDuration(job.durationSeconds)}</span> : null}
                  {job.totalTokens ? <span>{job.totalTokens} tokens</span> : null}
                </div>
                <p className="task-prompt">{job.prompt || "未记录提示词"}</p>
                <p className="storage-note">
                  {job.message || statusLabel(job.status)}
                  {job.referenceCount ? `，参考图 ${job.referenceCount} 张` : ""}
                  {job.completedAt ? `，完成于 ${formatDateTime(job.completedAt)}` : ""}
                </p>
              </div>
              <div className="task-actions">
                <button className="secondary-button" disabled={!canCancelJob(job)} onClick={() => cancelJob(job.jobId)} type="button">
                  <X size={18} />
                  <span>停止</span>
                </button>
                <button className="secondary-button" disabled={!imageSource} onClick={() => openImageSource(imageSource)} type="button">
                  <Eye size={18} />
                  <span>查看</span>
                </button>
                <button className="copy-button" disabled={!imageSource} onClick={() => downloadImageSource(imageSource, job)} type="button">
                  <Download size={18} />
                  <span>下载</span>
                </button>
                <button className="danger-button" onClick={() => deleteJob(job.jobId)} type="button">
                  <Trash2 size={18} />
                  <span>删除</span>
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function BatchGeneratePage({ groups, onCreateGroup, onDeleteGroup, onUpdateGroup, styles }) {
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedStyleIds, setSelectedStyleIds] = useState([]);
  const [promptOverride, setPromptOverride] = useState("");
  const [size, setSize] = useState(DEFAULT_GENERATION_SIZE);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [references, setReferences] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const styleMap = useMemo(() => new Map(styles.map((style) => [style.id, style])), [styles]);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const selectedStyles = selectedStyleIds.map((styleId) => styleMap.get(styleId)).filter(Boolean);

  useEffect(() => {
    refreshImageProviders()
      .then((payload) => {
        setProviders(payload.providers || []);
        setSelectedProvider(payload.defaultProvider || payload.providers?.[0]?.id || "");
      })
      .catch(() => {
        setProviders([]);
        setSelectedProvider("");
      });
  }, []);

  useEffect(() => {
    return () => {
      references.forEach((reference) => URL.revokeObjectURL(reference.previewUrl));
    };
  }, [references]);

  function toggleStyle(styleId) {
    setSelectedStyleIds((current) => (current.includes(styleId) ? current.filter((id) => id !== styleId) : [...current, styleId]));
  }

  function loadGroup(group) {
    setSelectedGroupId(group?.id || "");
    setGroupName(group?.name || "");
    setSelectedStyleIds(group?.styleIds || []);
    setStatusMessage("");
    setError("");
  }

  function resetGroupEditor() {
    setSelectedGroupId("");
    setGroupName("");
    setSelectedStyleIds([]);
    setStatusMessage("");
    setError("");
  }

  async function saveGroup() {
    if (!groupName.trim()) {
      setError("请先填写风格组名称。");
      return;
    }
    if (!selectedStyleIds.length) {
      setError("请至少选择一个风格。");
      return;
    }

    setError("");
    const payload = { name: groupName.trim(), styleIds: selectedStyleIds };
    if (selectedGroupId) {
      await onUpdateGroup(selectedGroupId, payload);
      setStatusMessage("风格组已更新。");
      return;
    }

    await onCreateGroup(payload);
    setStatusMessage("风格组已创建。");
    resetGroupEditor();
  }

  function addReferences(files) {
    setReferences((current) => {
      const availableSlots = Math.max(0, 10 - current.length);
      const nextFiles = files.slice(0, availableSlots);
      return [
        ...current,
        ...nextFiles.map((file, index) => ({
          id: `${file.name}-${file.lastModified}-${file.size}-${Date.now()}-${index}`,
          file,
          order: current.length + index,
          previewUrl: URL.createObjectURL(file)
        }))
      ];
    });
  }

  function removeReference(referenceId) {
    setReferences((current) => {
      const removed = current.find((reference) => reference.id === referenceId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      return current
        .filter((reference) => reference.id !== referenceId)
        .sort((a, b) => a.order - b.order)
        .map((reference, index) => ({ ...reference, order: index }));
    });
  }

  async function submitBatchJobs() {
    if (!selectedGroup) {
      setError("请先选择一个风格组。");
      return;
    }
    if (!selectedStyles.length) {
      setError("当前风格组没有可用风格。");
      return;
    }
    if (!selectedProvider) {
      setError("请先选择接口供应商。");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setStatusMessage("正在提交批量任务…");

    try {
      const uploadedReferences = await Promise.all(getOrderedReferences(references).map(prepareReferenceForUpload));
      let submitted = 0;

      for (const style of selectedStyles) {
        const formData = new FormData();
        formData.append("prompt", promptOverride.trim() || style.prompt);
        formData.append("size", size);
        formData.append("provider", selectedProvider);
        formData.append("styleId", style.id);
        formData.append("styleName", style.tags.join(" / "));
        formData.append("styleGroupId", selectedGroup.id);
        formData.append("styleGroupName", selectedGroup.name);
        Object.entries(GENERATION_DEFAULTS).forEach(([key, value]) => formData.append(key, value));

        const mergedReferences = await buildBatchReferencesForStyle(style, uploadedReferences);
        mergedReferences.forEach((reference) => formData.append("reference", reference.file));

        const response = await fetch("/api/image-jobs", {
          method: "POST",
          body: formData
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || `提交 ${style.tags.join(" / ")} 失败。`);
        submitted += 1;
      }

      setStatusMessage(`批量任务已提交，共 ${submitted} 个风格。`);
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="batch-page" aria-label="批量生成">
      <div className="batch-layout">
        <section className="batch-panel">
          <div className="task-toolbar">
            <div>
              <p className="eyebrow">Group editor</p>
              <h2>编辑风格组</h2>
            </div>
          </div>
          <label className="field-label">
            风格组名称
            <input onChange={(event) => setGroupName(event.target.value)} placeholder="例如：宠物海报组" value={groupName} />
          </label>
          <div className="style-picker-section">
            <div className="task-toolbar compact-toolbar">
              <div>
                <p className="eyebrow">Style picker</p>
                <p className="storage-note">在这里勾选要加入风格组的风格，列表可单独滚动。</p>
              </div>
            </div>
            <div className="style-picker-scroll">
              <div className="style-picker-grid">
                {styles.map((style) => (
                  <label className={`style-picker-card ${selectedStyleIds.includes(style.id) ? "active" : ""}`} key={style.id}>
                    <input checked={selectedStyleIds.includes(style.id)} onChange={() => toggleStyle(style.id)} type="checkbox" />
                    <img alt={style.tags.join("、")} src={cacheBust(style.image)} />
                    <span>{style.tags.join("、") || style.id}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="card-actions">
            <button className="copy-button" onClick={saveGroup} type="button">
              <Save size={18} />
              <span>{selectedGroupId ? "更新风格组" : "保存风格组"}</span>
            </button>
            <button className="secondary-button" onClick={resetGroupEditor} type="button">
              <RefreshCw size={18} />
              <span>清空选择</span>
            </button>
          </div>
        </section>

        <div className="batch-right-column">
          <section className="batch-panel">
            <div className="task-toolbar">
              <div>
                <p className="eyebrow">Saved groups</p>
                <h2>已创建风格组</h2>
              </div>
            </div>
            <div className="group-list">
              {groups.map((group) => (
                <article className={`group-card ${selectedGroupId === group.id ? "active" : ""}`} key={group.id}>
                  <div className="group-card-body">
                    <strong>{group.name}</strong>
                    <p className="storage-note">{group.styleIds.map((styleId) => styleMap.get(styleId)?.tags.join("、") || styleId).join(" / ") || "暂无风格"}</p>
                  </div>
                  <div className="task-actions">
                    <button className="secondary-button" onClick={() => loadGroup(group)} type="button">
                      <Eye size={18} />
                      <span>载入</span>
                    </button>
                    <button className="danger-button" onClick={() => onDeleteGroup(group.id)} type="button">
                      <Trash2 size={18} />
                      <span>删除</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="batch-panel">
            <div className="task-toolbar">
              <div>
                <p className="eyebrow">Batch submit</p>
                <h2>批量提交</h2>
                <p className="storage-note">
                  已选风格组：{selectedGroup?.name || "未选择"}，共 {selectedStyles.length} 个风格
                </p>
              </div>
            </div>
            <label className="field-label">
              接口供应商
              <select onChange={(event) => setSelectedProvider(event.target.value)} value={selectedProvider}>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} · {provider.model}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              比例
              <select onChange={(event) => setSize(event.target.value)} value={size}>
                {GENERATION_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              覆盖提示词（可选）
              <textarea onChange={(event) => setPromptOverride(event.target.value)} placeholder="留空则每个风格使用自己的提示词。" value={promptOverride} />
            </label>
            <label className="field-label">
              上传参考图
              <input
                accept="image/png,image/jpeg,image/webp"
                multiple
                onChange={(event) => {
                  addReferences(Array.from(event.target.files || []));
                  event.target.value = "";
                }}
                type="file"
              />
            </label>
            <p className="storage-note">批量规则：风格有自带参考图时，示例图会作为图一，你上传的参考图会从图二开始；没有自带参考图时，你上传的参考图会从图一开始。</p>
            {references.length > 0 && (
              <div className="reference-list">
                {getOrderedReferences(references).map((reference) => (
                  <article className="reference-item" key={reference.id}>
                    <img alt={reference.file.name} src={reference.previewUrl} />
                    <div className="reference-meta">
                      <strong>{reference.file.name}</strong>
                      <span>{formatFileSize(reference.file.size)}</span>
                    </div>
                    <div className="reference-order">
                      <span>{imageLabel(reference.order)}</span>
                    </div>
                    <button className="icon-button" onClick={() => removeReference(reference.id)} type="button" aria-label={`删除${reference.file.name}`}>
                      <Trash2 size={18} />
                    </button>
                  </article>
                ))}
              </div>
            )}
            {statusMessage && <p className="storage-note">{statusMessage}</p>}
            {error && <p className="error-note">{error}</p>}
            <div className="card-actions generator-actions">
              <button className="copy-button" disabled={isSubmitting || !selectedGroupId} onClick={submitBatchJobs} type="button">
                {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                <span>{isSubmitting ? "提交中" : "提交整组任务"}</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}

function ManagePage({ onCreateStyle, onDeleteStyle, onReorderStyles, onStyleChange, onUploadImage, styles }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [draggingId, setDraggingId] = useState("");

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        styles.map((style) => [
          style.id,
          {
            tags: style.tags.join("，"),
            prompt: style.prompt,
            useStyleImageAsReference: Boolean(style.useStyleImageAsReference)
          }
        ])
      )
    );
  }, [styles]);

  async function saveStyle(style) {
    setSavingId(style.id);
    await onStyleChange(style.id, drafts[style.id] || { tags: "", prompt: "", useStyleImageAsReference: false });
    setSavingId("");
  }

  async function handleFile(style, file) {
    if (!file) return;
    setSavingId(style.id);
    await onUploadImage(style.id, file);
    setSavingId("");
  }

  function moveStyle(styleId, offset) {
    const index = styles.findIndex((style) => style.id === styleId);
    const nextIndex = index + offset;
    if (index < 0 || nextIndex < 0 || nextIndex >= styles.length) return;
    const nextIds = styles.map((style) => style.id);
    const [movedId] = nextIds.splice(index, 1);
    nextIds.splice(nextIndex, 0, movedId);
    onReorderStyles(nextIds);
  }

  function dropStyle(targetId) {
    if (!draggingId || draggingId === targetId) return;
    const nextIds = styles.map((style) => style.id);
    const fromIndex = nextIds.indexOf(draggingId);
    const targetIndex = nextIds.indexOf(targetId);
    if (fromIndex < 0 || targetIndex < 0) return;
    const [movedId] = nextIds.splice(fromIndex, 1);
    nextIds.splice(targetIndex, 0, movedId);
    onReorderStyles(nextIds);
  }

  return (
    <section className="manage-list" aria-label="维护风格内容">
      <button className="add-button" onClick={onCreateStyle} type="button">
        <Plus size={18} />
        <span>新增风格</span>
      </button>

      {styles.map((style, index) => {
        const draft = drafts[style.id] || { tags: "", prompt: "", useStyleImageAsReference: false };
        return (
          <article
            className={`manage-card ${draggingId === style.id ? "is-dragging" : ""}`}
            draggable
            key={style.id}
            onDragEnd={() => setDraggingId("")}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={() => setDraggingId(style.id)}
            onDrop={() => dropStyle(style.id)}
          >
            <div className="manage-order-tools" aria-label="排序">
              <GripVertical size={18} />
              <span>#{index + 1}</span>
              <button className="icon-button" disabled={index === 0} onClick={() => moveStyle(style.id, -1)} type="button" aria-label="上移">
                <ArrowUp size={18} />
              </button>
              <button className="icon-button" disabled={index === styles.length - 1} onClick={() => moveStyle(style.id, 1)} type="button" aria-label="下移">
                <ArrowDown size={18} />
              </button>
            </div>
            <img alt="当前示例图" src={cacheBust(style.image)} />
            <div className="manage-body">
              <label className="field-label">
                标签
                <input
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [style.id]: { ...draft, tags: event.target.value }
                    }))
                  }
                  placeholder="例如：人像，宠物，动漫"
                  value={draft.tags}
                />
              </label>
              <label className="field-label">
                提示词
                <textarea
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [style.id]: { ...draft, prompt: event.target.value }
                    }))
                  }
                  value={draft.prompt}
                />
              </label>
              <label className="field-label checkbox-field">
                <span>是否将示例图作为生图参考图</span>
                <div className="toggle-field">
                  <input
                    checked={Boolean(draft.useStyleImageAsReference)}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [style.id]: { ...draft, useStyleImageAsReference: event.target.checked }
                      }))
                    }
                    type="checkbox"
                  />
                  <span>{draft.useStyleImageAsReference ? "是" : "否"}</span>
                </div>
              </label>
              <div className="card-actions manage-actions">
                <label className="secondary-button file-button">
                  <ImageUp size={18} />
                  <span>替换图片</span>
                  <input accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => handleFile(style, event.target.files?.[0])} type="file" />
                </label>
                <button className="copy-button" disabled={savingId === style.id} onClick={() => saveStyle(style)} type="button">
                  <Save size={18} />
                  <span>{savingId === style.id ? "保存中" : "保存"}</span>
                </button>
                <button className="danger-button" onClick={() => onDeleteStyle(style.id)} type="button">
                  <Trash2 size={18} />
                  <span>删除</span>
                </button>
              </div>
              <p className="storage-note">图片保存在 public/style-previews/{style.id}/cover.*，标签和提示词保存在 data/styles.json。</p>
            </div>
          </article>
        );
      })}
    </section>
  );
}

async function refreshStyles() {
  const response = await fetch("/api/styles");
  return response.json();
}

async function refreshStyleGroups() {
  const response = await fetch("/api/style-groups");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取风格组失败。");
  return payload;
}

async function refreshImageProviders() {
  const response = await fetch("/api/image-providers");
  if (!response.ok) throw new Error("Failed to load image providers");
  return response.json();
}

async function fetchImageJob(jobId) {
  const response = await fetch(`/api/image-jobs/${jobId}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取生图任务失败。");
  return payload;
}

async function refreshImageJobs() {
  const response = await fetch("/api/image-jobs");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取生图任务列表失败。");
  return payload;
}

function statusLabel(status) {
  const labels = {
    all: "全部",
    queued: "排队中",
    running: "生成中",
    succeeded: "已完成",
    failed: "失败",
    cancelled: "已停止"
  };
  return labels[status] || status || "未知";
}

function modeLabel(mode) {
  return mode === "edit" ? "参考图编辑" : "文生图";
}

function shortJobId(jobId) {
  return String(jobId || "").slice(0, 8);
}

function formatDateTime(value) {
  if (!value) return "未记录时间";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  if (safeSeconds < 60) return `${safeSeconds}s`;
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  if (minutes < 60) return restSeconds ? `${minutes}m ${restSeconds}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

function canCancelJob(job) {
  return job.status === "queued" || job.status === "running";
}

async function updateImageJob(jobId, action) {
  const response = await fetch(`/api/image-jobs/${jobId}/${action}`, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "更新生图任务失败。");
  return payload;
}

async function deleteImageJob(jobId) {
  const response = await fetch(`/api/image-jobs/${jobId}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.message || "删除生图任务失败。");
  }
}

function openImageSource(source) {
  if (!source) return;
  window.open(source, "_blank", "noopener,noreferrer");
}

function downloadImageSource(source, job) {
  if (!source) return;
  const link = document.createElement("a");
  link.href = source;
  link.download = `prompt-reference-${job.jobId || Date.now()}.png`;
  link.target = "_blank";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function isUploadableReferenceImage(imagePath) {
  return /\.(png|jpe?g|webp)(\?|$)/i.test(String(imagePath || ""));
}

function normalizeReferenceMimeType(mimeType, imagePath) {
  if (["image/png", "image/jpeg", "image/webp"].includes(mimeType)) return mimeType;

  const path = String(imagePath || "").toLowerCase();
  if (path.endsWith(".png") || path.includes(".png?")) return "image/png";
  if (path.endsWith(".jpg") || path.includes(".jpg?") || path.endsWith(".jpeg") || path.includes(".jpeg?")) return "image/jpeg";
  if (path.endsWith(".webp") || path.includes(".webp?")) return "image/webp";
  return "";
}

function extensionFromMimeType(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

async function buildBatchReferencesForStyle(style, uploadedReferences) {
  const hasStyleReference = style.useStyleImageAsReference && isUploadableReferenceImage(style.image);
  const preparedUploaded = uploadedReferences.map((reference, index) => ({
    ...reference,
    order: hasStyleReference ? index + 1 : index
  }));

  if (!hasStyleReference) return preparedUploaded;

  const styleReference = await createStyleReference(style);
  if (!styleReference) return uploadedReferences.map((reference, index) => ({ ...reference, order: index }));
  return [styleReference, ...preparedUploaded];
}

async function createStyleReference(style) {
  try {
    const response = await fetch(cacheBust(style.image));
    if (!response.ok) return null;
    const blob = await response.blob();
    const mimeType = normalizeReferenceMimeType(blob.type, style.image);
    if (!mimeType) return null;

    return {
      id: `batch-style-reference-${style.id}`,
      order: 0,
      file: new File([blob], `${style.id}-style-reference.${extensionFromMimeType(mimeType)}`, {
        type: mimeType,
        lastModified: Date.now()
      }),
      previewUrl: ""
    };
  } catch {
    return null;
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function cacheBust(path) {
  return `${path}?v=${Date.now()}`;
}

createRoot(document.getElementById("root")).render(<App />);
