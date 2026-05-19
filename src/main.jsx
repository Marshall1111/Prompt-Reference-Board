import React, { useEffect, useMemo, useState } from "react";
import { Check, Clipboard, Eye, Home, ImageUp, Plus, Save, Search, Settings, Trash2 } from "lucide-react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  const [styles, setStyles] = useState([]);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [activePrompt, setActivePrompt] = useState(null);
  const [route, setRoute] = useState(() => (window.location.pathname === "/manage" ? "manage" : "home"));

  useEffect(() => {
    refreshStyles().then(setStyles);
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(window.location.pathname === "/manage" ? "manage" : "home");
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const filteredStyles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return styles;
    return styles.filter((style) => `${style.tags.join(" ")} ${style.prompt}`.toLowerCase().includes(keyword));
  }, [query, styles]);

  function navigate(nextRoute) {
    const path = nextRoute === "manage" ? "/manage" : "/";
    window.history.pushState({}, "", path);
    setRoute(nextRoute);
    setActivePrompt(null);
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
          </div>
        </header>

        {route === "manage" ? (
          <ManagePage
            onCreateStyle={createStyle}
            onDeleteStyle={deleteStyle}
            onStyleChange={updateStyle}
            onUploadImage={uploadStyleImage}
            styles={filteredStyles}
          />
        ) : (
          <GalleryPage copiedId={copiedId} onCopy={copyPrompt} onViewPrompt={setActivePrompt} styles={filteredStyles} />
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
    </main>
  );
}

function GalleryPage({ copiedId, onCopy, onViewPrompt, styles }) {
  return (
    <section className="masonry-gallery" aria-label="风格提示词列表">
      {styles.map((style) => (
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
          <div className="card-actions">
            <button className="copy-button" onClick={() => onCopy(style)} type="button">
              {copiedId === style.id ? <Check size={18} /> : <Clipboard size={18} />}
              <span>{copiedId === style.id ? "已复制" : "复制提示词"}</span>
            </button>
            <button className="secondary-button" onClick={() => onViewPrompt(style)} type="button">
              <Eye size={18} />
              <span>查看提示词</span>
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

function ManagePage({ onCreateStyle, onDeleteStyle, onStyleChange, onUploadImage, styles }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    setDrafts(
      Object.fromEntries(
        styles.map((style) => [
          style.id,
          {
            tags: style.tags.join("，"),
            prompt: style.prompt
          }
        ])
      )
    );
  }, [styles]);

  async function saveStyle(style) {
    setSavingId(style.id);
    await onStyleChange(style.id, drafts[style.id] || { tags: "", prompt: "" });
    setSavingId("");
  }

  async function handleFile(style, file) {
    if (!file) return;
    setSavingId(style.id);
    await onUploadImage(style.id, file);
    setSavingId("");
  }

  return (
    <section className="manage-list" aria-label="维护风格内容">
      <button className="add-button" onClick={onCreateStyle} type="button">
        <Plus size={18} />
        <span>新增风格</span>
      </button>

      {styles.map((style) => {
        const draft = drafts[style.id] || { tags: "", prompt: "" };
        return (
          <article className="manage-card" key={style.id}>
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
