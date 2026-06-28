import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Clipboard, Download, Eye, GripVertical, HardDrive, Home, ImageUp, Layers3, ListTodo, LoaderCircle, Pencil, Plus, QrCode, RefreshCw, Save, Search, Sparkles, Trash2, X } from "lucide-react";
import { createRoot } from "react-dom/client";
import { createQrSvgDataUrl, downloadQrPng, downloadQrSvg } from "./qr-code";
import "./styles.css";

const DEFAULT_CONTACT_WECHAT_ID = "PetPaint";
const DEFAULT_ORDER_ADDRESS = {
  receiverName: "",
  receiverPhone: "",
  address: "",
  remark: ""
};
const DEFAULT_MERCHANT_FORM = {
  id: "",
  name: "",
  status: "active",
  commissionRateBps: 1000,
  note: ""
};
const DEFAULT_API_PROVIDER_FORM = {
  id: "",
  name: "",
  baseUrl: "",
  apiKey: "",
  model: "gpt-image-2",
  visionModel: "gpt-5.4-mini",
  enabled: true
};
const MAX_ORDER_ITEM_QUANTITY = 99;
const ORDER_STATUS_LABELS = {
  pending_payment: "待付款",
  pending_shipment: "待发货",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消",
  expired: "已过期"
};
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
const DEFAULT_IMAGE_JOB_QUERY = {
  page: 1,
  limit: 20,
  status: "all",
  search: "",
  date: "",
  likedOnly: false
};
const DEFAULT_ADMIN_ORDER_QUERY = {
  page: 1,
  limit: 20,
  orderStatus: "",
  search: "",
  merchantId: "",
  startDate: "",
  endDate: ""
};

function getSizeLabel(size) {
  return GENERATION_SIZE_OPTIONS.find((option) => option.value === size)?.label || size || DEFAULT_GENERATION_SIZE;
}
const GALLERY_INITIAL_BATCH = 18;
const GALLERY_BATCH_STEP = 12;
const STYLE_SUBJECT_TYPE_OPTIONS = [
  { value: "both", label: "通用（人物/宠物都可）" },
  { value: "person", label: "仅人物" },
  { value: "pet", label: "仅宠物" }
];
const DEFAULT_DRAW_CARD_WEIGHT = 100;

const REFERENCE_UPLOAD_LIMITS = {
  maxBytes: 4 * 1024 * 1024,
  maxDimension: 2048,
  jpegQuality: 0.86
};

const GENERATION_STEPS = ["准备请求", "提交到中转站", "等待模型生成", "接收图片结果", "准备预览"];
const DRAW_CARD_SESSION_STORAGE_KEY = "pg.public-draw.session-id";
const FRIDGE_MAGNET_SESSION_STORAGE_KEY = "pg.public-fridge.session-id";
const LATEST_MANUAL_ORDER_STORAGE_KEY = "pg.fridge.latest-manual-order";
const DRAW_CARD_EXPERIENCE_CONFIG = {
  route: "public-draw",
  experienceType: "draw-card",
  apiBase: "/api/draw-card",
  sessionStorageKey: DRAW_CARD_SESSION_STORAGE_KEY,
  themeClass: "theme-draw-card",
  titleKicker: "Draw card ritual",
  title: "上传一张图片，静候整组结果揭晓。",
  subtitle: "无需任何额外设置，只保留一次上传与一次开始，其余流程都会自动完成。",
  waitingLines: ["静候片刻，结果正在成形。", "光影已经落座，仪式仍在继续。", "请稍候，整组结果即将揭晓。"],
  waitingFallback: "请保持当前页面开启，结果会在全部完成后一次性揭晓。",
  startButtonIdle: "开始抽卡",
  startButtonLoading: "仪式开启中",
  resultsKicker: "Collection",
  resultsTitle: "这一轮结果已经全部抵达。",
  resultsSubtitle: "右侧卡夹会收纳你选中的结果。点击结果可放大查看，加入时会直接飞入卡夹。",
  clipKicker: "Card clip",
  clipTitle: "卡夹",
  clipEmptyText: "挑中想保留的结果后，它会被收进这里，并在你下次回来时继续保留。",
  clipInvitePlaceholder: "输入邀请码",
  clipContactFallback: "如需更多生图机会，请联系客服填写邀请码。",
  errorTitle: "这一轮没有顺利完成。",
  restoreErrorMessage: "恢复上次抽卡进度失败，请稍后再试。",
  readErrorMessage: "读取抽卡状态失败，请稍后再试。",
  latestErrorMessage: "恢复抽卡进度失败，请稍后再试。",
  createErrorMessage: "抽卡暂时不可用，请稍后再试。",
  clipErrorMessage: "读取卡夹失败，请稍后再试。",
  addClipErrorMessage: "加入卡夹失败，请稍后再试。",
  removeClipErrorMessage: "移出卡夹失败，请稍后再试。",
  inviteErrorMessage: "邀请码兑换失败，请稍后再试。",
  originalAlt: "抽卡原图",
  resultAltPrefix: "抽卡结果",
  previewAlt: "待抽卡图片预览",
  waitingAlt: "正在抽卡的原图",
  lightboxResultAlt: "抽卡结果大图",
  lightboxOriginalAlt: "抽卡原图大图",
  resultNameFallback: "结果",
  clipItemFallback: "卡片",
  pendingRemovalBody: "这张图片不属于本次生成结果，移出卡夹后将无法在当前抽卡页再次加入。确认移出吗？"
};
const FRIDGE_MAGNET_EXPERIENCE_CONFIG = {
  route: "public-fridge",
  experienceType: "fridge-magnet",
  apiBase: "/api/fridge-magnet",
  sessionStorageKey: FRIDGE_MAGNET_SESSION_STORAGE_KEY,
  themeClass: "theme-fridge-magnet",
  titleKicker: "Fridge magnet studio",
  title: "上传一张照片，生成一组冰箱贴。",
  subtitle: "系统会基于同一张图批量产出多种冰箱贴效果，完成后统一查看、收藏和下单。",
  waitingLines: ["预计共需要2~3分钟", "美图值得等待", "不妨放下手机，抱抱身边的人"],
  waitingFallback: "请保持当前页面开启，整组冰箱贴完成后会一次性揭晓。",
  startButtonIdle: "开始制作",
  startButtonLoading: "制作开启中",
  resultsKicker: "Magnet board",
  resultsTitle: "这一轮冰箱贴已经全部做好了。",
  resultsSubtitle: "结果会直接贴在白色展示面上，配合轻阴影模拟透明感；右侧口袋只保留冰箱贴结果。",
  clipKicker: "Pocket",
  clipTitle: "口袋",
  clipEmptyText: "挑中想保留的冰箱贴后，它会被收进口袋，并在你下次回来时继续保留。",
  clipInvitePlaceholder: "输入邀请码",
  clipContactFallback: "如需更多制作次数，请联系客服填写邀请码。",
  pocketAddLabel: "加入口袋",
  pocketAddedLabel: "已入口袋",
  pocketRemoveLabel: "移出口袋",
  errorTitle: "这一轮冰箱贴没有顺利完成。",
  restoreErrorMessage: "恢复上次冰箱贴进度失败，请稍后再试。",
  readErrorMessage: "读取冰箱贴状态失败，请稍后再试。",
  latestErrorMessage: "恢复冰箱贴进度失败，请稍后再试。",
  createErrorMessage: "冰箱贴暂时不可用，请稍后再试。",
  clipErrorMessage: "读取冰箱贴收藏失败，请稍后再试。",
  addClipErrorMessage: "加入口袋失败，请稍后再试。",
  removeClipErrorMessage: "移出口袋失败，请稍后再试。",
  inviteErrorMessage: "邀请码兑换失败，请稍后再试。",
  originalAlt: "冰箱贴原图",
  resultAltPrefix: "冰箱贴结果",
  previewAlt: "待制作冰箱贴图片预览",
  waitingAlt: "正在制作冰箱贴的原图",
  lightboxResultAlt: "冰箱贴结果大图",
  lightboxOriginalAlt: "冰箱贴原图大图",
  resultNameFallback: "冰箱贴",
  clipItemFallback: "磁贴",
  pendingRemovalBody: "这张图片不属于本次制作结果，移出口袋后将无法在当前冰箱贴页再次加入。确认移出吗？"
};

function createClientTraceId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `draw-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readRoute() {
  const pathname = window.location.pathname;
  if (pathname === "/fridge/orders") return "public-fridge-orders";
  if (pathname.startsWith("/fridge/orders/")) return "public-fridge-order";
  if (pathname === "/fridge") return "public-fridge";
  if (pathname === "/gallery") return "admin-gallery";
  if (pathname === "/admin" || pathname === "/admin/") return "admin-gallery";
  if (pathname === "/admin/login") return "admin-login";
  if (pathname === "/admin/orders") return "admin-orders";
  if (pathname === "/admin/merchants") return "admin-merchants";
  if (pathname === "/admin/styles") return "admin-gallery";
  if (pathname === "/admin/tasks") return "admin-tasks";
  if (pathname === "/admin/batch") return "admin-batch";
  if (pathname === "/admin/invites") return "admin-invites";
  if (pathname === "/admin/api-providers") return "admin-api-providers";
  if (pathname === "/admin/storage") return "admin-storage";
  return "public-draw";
}

function App() {
  const [route, setRoute] = useState(() => readRoute());

  useEffect(() => {
    const onPopState = () => setRoute(readRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const titleByRoute = {
      "public-fridge": "冰箱贴工作室",
      "public-fridge-order": "冰箱贴订单",
      "public-fridge-orders": "我的冰箱贴订单",
      "admin-api-providers": "API 配置"
    };
    document.title = titleByRoute[route] || "风格提示词图库";
  }, [route]);

  function navigate(nextRoute) {
    const pathByRoute = {
      "public-draw": "/",
      "public-fridge": "/fridge",
      "public-fridge-orders": "/fridge/orders",
      "public-fridge-order": window.location.pathname,
      "admin-gallery": "/gallery",
      "admin-login": "/admin/login",
      "admin-orders": "/admin/orders",
      "admin-merchants": "/admin/merchants",
      "admin-tasks": "/admin/tasks",
      "admin-batch": "/admin/batch",
      "admin-invites": "/admin/invites",
      "admin-api-providers": "/admin/api-providers",
      "admin-storage": "/admin/storage"
    };
    const path = pathByRoute[nextRoute] || "/";
    window.history.pushState({}, "", path);
    setRoute(nextRoute);
  }

  if (route === "public-draw") {
    return <LuckDrawCardPage />;
  }
  if (route === "public-fridge-order") {
    return <FridgeMagnetOrderPage />;
  }
  if (route === "public-fridge-orders") {
    return <FridgeMagnetOrdersPage />;
  }
  if (route === "public-fridge") {
    return <FridgeMagnetPage />;
  }

  return <AdminApp navigate={navigate} route={route} />;
}

function AdminApp({ navigate, route }) {
  const [styles, setStyles] = useState([]);
  const [styleGroups, setStyleGroups] = useState([]);
  const [inviteCodes, setInviteCodes] = useState([]);
  const [visitorRecords, setVisitorRecords] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [orders, setOrders] = useState([]);
  const [ordersMeta, setOrdersMeta] = useState({
    total: 0,
    page: DEFAULT_ADMIN_ORDER_QUERY.page,
    limit: DEFAULT_ADMIN_ORDER_QUERY.limit
  });
  const [settings, setSettings] = useState(null);
  const [storageSummary, setStorageSummary] = useState(null);
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState("");
  const [activePrompt, setActivePrompt] = useState(null);
  const [activeGenerator, setActiveGenerator] = useState(null);
  const [adminReady, setAdminReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadAdminSession() {
      try {
        const payload = await fetchAdminSession();
        if (!isActive) return;
        setIsAuthenticated(Boolean(payload?.ok));
      } catch {
        if (!isActive) return;
        setIsAuthenticated(false);
      } finally {
        if (isActive) setAdminReady(true);
      }
    }

    loadAdminSession();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!adminReady || !isAuthenticated) return;
    refreshStyles().then(setStyles).catch(() => setStyles([]));
    refreshStyleGroups().then(setStyleGroups).catch(() => setStyleGroups([]));
    refreshInviteCodes().then(setInviteCodes).catch(() => setInviteCodes([]));
    refreshVisitorRecords().then(setVisitorRecords).catch(() => setVisitorRecords([]));
    refreshAdminMerchants({ page: 1, limit: 500 }).then((payload) => setMerchants(payload.merchants || [])).catch(() => setMerchants([]));
    refreshAdminOrders()
      .then((payload) => {
        setOrders(payload.orders || []);
        setOrdersMeta({
          total: Number(payload.total || 0),
          page: Number(payload.page || DEFAULT_ADMIN_ORDER_QUERY.page),
          limit: Number(payload.limit || DEFAULT_ADMIN_ORDER_QUERY.limit)
        });
      })
      .catch(() => {
        setOrders([]);
        setOrdersMeta({
          total: 0,
          page: DEFAULT_ADMIN_ORDER_QUERY.page,
          limit: DEFAULT_ADMIN_ORDER_QUERY.limit
        });
      });
    refreshAdminSettings().then(setSettings).catch(() => setSettings(null));
    refreshStorageSummary().then(setStorageSummary).catch(() => setStorageSummary(null));
  }, [adminReady, isAuthenticated]);

  const filteredStyles = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return styles;
    return styles.filter((style) => `${style.tags.join(" ")} ${style.prompt}`.toLowerCase().includes(keyword));
  }, [query, styles]);

  async function copyPrompt(style) {
    await copyText(style.prompt);
    setCopiedId(style.id);
    window.setTimeout(() => setCopiedId(""), 1400);
  }

  async function createStyle() {
    const response = await fetch("/api/styles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tags: ["新风格"],
        subjectType: "both",
        drawCardEnabled: true,
        drawCardWeight: DEFAULT_DRAW_CARD_WEIGHT,
        prompt: "在这里填写这个风格对应的提示词。"
      })
    });
    const created = await response.json();
    setStyles((current) => [created, ...current]);
    return created;
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

  async function handleLogin(username, password) {
    const payload = await adminLogin(username, password);
    setIsAuthenticated(Boolean(payload?.ok));
      await Promise.all([
        refreshStyles().then(setStyles),
        refreshStyleGroups().then(setStyleGroups),
        refreshInviteCodes().then(setInviteCodes),
        refreshVisitorRecords().then(setVisitorRecords),
        refreshAdminMerchants({ page: 1, limit: 500 }).then((payload) => setMerchants(payload.merchants || [])),
        refreshAdminSettings().then(setSettings),
        refreshStorageSummary().then(setStorageSummary)
      ]);
    navigate("admin-gallery");
  }

  async function handleLogout() {
    await adminLogout();
    setIsAuthenticated(false);
    navigate("admin-login");
  }

  if (!adminReady) {
    return <main className="app-shell"><section className="workspace"><p className="storage-note">正在检查后台登录状态...</p></section></main>;
  }

  if (!isAuthenticated) {
    return <AdminLoginPage onLogin={handleLogin} />;
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Prompt reference board</p>
            <h1>后台管理</h1>
          </div>
          <div className="top-actions">
            <label className="search-box">
              <Search size={18} />
              <input aria-label="搜索标签或提示词" onChange={(event) => setQuery(event.target.value)} placeholder="搜索标签" value={query} />
            </label>
            <button className="nav-button" onClick={() => navigate("admin-gallery")} type="button">
              <Home size={18} />
              <span>图库</span>
            </button>
            <button className="nav-button" onClick={() => navigate("admin-tasks")} type="button">
              <ListTodo size={18} />
              <span>任务记录</span>
            </button>
            <button className="nav-button" onClick={() => navigate("admin-orders")} type="button">
              <Clipboard size={18} />
              <span>订单管理</span>
            </button>
            <button className="nav-button" onClick={() => navigate("admin-merchants")} type="button">
              <QrCode size={18} />
              <span>合作商户</span>
            </button>
            <button className="nav-button" onClick={() => navigate("admin-batch")} type="button">
              <Layers3 size={18} />
              <span>批量生成</span>
            </button>
            <button className="nav-button" onClick={() => navigate("admin-invites")} type="button">
              <Sparkles size={18} />
              <span>邀请码</span>
            </button>
            <button className="nav-button" onClick={() => navigate("admin-api-providers")} type="button">
              <ImageUp size={18} />
              <span>API配置</span>
            </button>
            <button className="nav-button" onClick={() => navigate("admin-storage")} type="button">
              <HardDrive size={18} />
              <span>存储管理</span>
            </button>
            <button className="nav-button" onClick={handleLogout} type="button">
              <Home size={18} />
              <span>退出登录</span>
            </button>
          </div>
        </header>

        {route === "admin-gallery" ? (
          <GalleryPage
            onCreateStyle={createStyle}
            onDeleteStyle={deleteStyle}
            onGenerate={setActiveGenerator}
            onReorderStyles={reorderVisibleStyles}
            onStyleChange={updateStyle}
            onUploadImage={uploadStyleImage}
            onViewPrompt={setActivePrompt}
            styles={filteredStyles}
          />
        ) : route === "admin-tasks" ? (
          <ImageJobsPage />
        ) : route === "admin-orders" ? (
          <OrderAdminPage
            initialOrders={orders}
            initialOrdersMeta={ordersMeta}
            onRefreshOrders={(params = {}) =>
              refreshAdminOrders(params).then((payload) => {
                setOrders(payload.orders || []);
                setOrdersMeta({
                  total: Number(payload.total || 0),
                  page: Number(payload.page || DEFAULT_ADMIN_ORDER_QUERY.page),
                  limit: Number(payload.limit || DEFAULT_ADMIN_ORDER_QUERY.limit)
                });
                return payload;
              })
            }
            merchants={merchants}
            onRefreshSettings={() => refreshAdminSettings().then(setSettings)}
            settings={settings}
          />
        ) : route === "admin-merchants" ? (
          <MerchantAdminPage
            allMerchants={merchants}
            onRefreshAllMerchants={() => refreshAdminMerchants({ page: 1, limit: 500 }).then((payload) => setMerchants(payload.merchants || []))}
          />
        ) : route === "admin-batch" ? (
          <BatchGeneratePage
            groups={styleGroups}
            onCreateGroup={createStyleGroup}
            onDeleteGroup={deleteStyleGroup}
            onUpdateGroup={updateStyleGroup}
            styles={styles}
          />
        ) : route === "admin-invites" ? (
          <InviteAdminPage
            inviteCodes={inviteCodes}
            onRefreshInviteCodes={() => refreshInviteCodes().then(setInviteCodes)}
            onRefreshVisitorRecords={() => refreshVisitorRecords().then(setVisitorRecords)}
            onRefreshSettings={() => refreshAdminSettings().then(setSettings)}
            settings={settings}
            visitorRecords={visitorRecords}
          />
        ) : route === "admin-api-providers" ? (
          <ApiProviderAdminPage />
        ) : route === "admin-storage" ? (
          <StorageAdminPage
            storageSummary={storageSummary}
            onRefreshStorage={() => refreshStorageSummary().then(setStorageSummary)}
          />
        ) : (
          <GalleryPage
            onCreateStyle={createStyle}
            onDeleteStyle={deleteStyle}
            onGenerate={setActiveGenerator}
            onReorderStyles={reorderVisibleStyles}
            onStyleChange={updateStyle}
            onUploadImage={uploadStyleImage}
            onViewPrompt={setActivePrompt}
            styles={filteredStyles}
          />
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

function LuckDrawCardPage() {
  return <PublicExperiencePage config={DRAW_CARD_EXPERIENCE_CONFIG} />;
}

function FridgeMagnetPage() {
  return <PublicExperiencePage config={FRIDGE_MAGNET_EXPERIENCE_CONFIG} />;
}

function FridgeMagnetOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [orderConfig, setOrderConfig] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deletingOrderId, setDeletingOrderId] = useState("");

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    fetchMyOrders()
      .then((payload) => {
        if (!isActive) return;
        setOrders(payload.orders || []);
        setOrderConfig(payload.config || null);
        setError("");
      })
      .catch((nextError) => {
        if (!isActive) return;
        setError(nextError.message || "读取订单列表失败。");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, []);

  async function handleDeleteOrder(order) {
    if (!order?.id) return;
    if (!window.confirm(`确定取消订单 ${order.orderNo} 吗？取消后订单状态会显示为“已取消”。`)) return;
    setDeletingOrderId(order.id);
    setError("");
    try {
      const deleted = await deleteMyOrder(order.id, order.publicToken);
      setOrders((current) => current.map((item) => (item.id === order.id ? deleted : item)));
      syncLatestManualOrder(deleted, orderConfig, deleted.publicToken || order.publicToken || "");
      if (readLatestManualOrder()?.orderId === order.id) {
        clearLatestManualOrder();
      }
    } catch (nextError) {
      setError(nextError.message || "取消订单失败。");
    } finally {
      setDeletingOrderId("");
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace order-page">
        <div className="task-toolbar">
          <div>
            <p className="eyebrow">My orders</p>
            <h2>我的订单</h2>
            <p className="storage-note">查看你提交过的冰箱贴订单与订单状态。</p>
          </div>
          <button className="secondary-button" onClick={() => window.location.assign("/fridge")} type="button">
            <Home size={18} />
            <span>返回冰箱贴页</span>
          </button>
        </div>
        {isLoading ? <p className="storage-note">正在读取订单列表…</p> : null}
        {error ? <p className="error-note">{error}</p> : null}
        {!isLoading && !error && !orders.length ? <p className="empty-note">你还没有提交过冰箱贴订单。</p> : null}
        <div className="task-list">
          {orders.map((order) => {
            const isManualUnpaid = order.orderStatus === "pending_payment" && isManualPaymentOrder(order, orderConfig);
            const canDelete = order.orderStatus === "pending_payment";
            return (
              <article className="task-card order-task-card" key={order.id}>
                <div className={`task-status ${orderStatusTone(order.orderStatus)}`}>
                  {orderStatusLabel(order.orderStatus)}
                </div>
                <div className="task-detail">
                  <div className="task-meta-row">
                    <strong>{order.orderNo}</strong>
                    <span>共 {order.itemCount} 只</span>
                    <span>{formatCurrencyCents(order.totalCents)}</span>
                  </div>
                  <p className="storage-note">下单时间 {formatDateTime(order.createdAt)}</p>
                  {isManualUnpaid ? <p className="storage-note">待付款：请联系客服并发送订单卡片。</p> : null}
                </div>
                <div className="task-actions">
                  <button className="secondary-button" onClick={() => window.location.assign(buildOrderDetailUrl(order.id, order.publicToken))} type="button">
                    <Eye size={18} />
                    <span>查看详情</span>
                  </button>
                  {canDelete ? (
                    <button className="danger-button" disabled={deletingOrderId === order.id} onClick={() => handleDeleteOrder(order)} type="button">
                      <Trash2 size={18} />
                      <span>{deletingOrderId === order.id ? "取消中" : "取消订单"}</span>
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function FridgeMagnetOrderPage() {
  const orderId = String(window.location.pathname.split("/").filter(Boolean).pop() || "");
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token") || "";
  const wechatCode = searchParams.get("code") || "";
  const [order, setOrder] = useState(null);
  const [orderConfig, setOrderConfig] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [contactCopied, setContactCopied] = useState(false);
  const [orderCopied, setOrderCopied] = useState(false);
  const [messageCopied, setMessageCopied] = useState(false);
  const [paymentCardUrl, setPaymentCardUrl] = useState("");
  const contactCopiedTimeoutRef = useRef(null);
  const orderCopiedTimeoutRef = useRef(null);
  const messageCopiedTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (contactCopiedTimeoutRef.current) window.clearTimeout(contactCopiedTimeoutRef.current);
      if (orderCopiedTimeoutRef.current) window.clearTimeout(orderCopiedTimeoutRef.current);
      if (messageCopiedTimeoutRef.current) window.clearTimeout(messageCopiedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    fetchOrderDetail(orderId, token)
      .then((payload) => {
        if (!isActive) return;
        setOrder(payload.order || null);
        setOrderConfig(payload.config || null);
        syncLatestManualOrder(payload.order || null, payload.config || null, token);
        setError("");
      })
      .catch((nextError) => {
        if (!isActive) return;
        setError(nextError.message || "读取订单失败。");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [orderId, token]);

  useEffect(() => {
    if (!wechatCode || !token || !isWechatBrowserClient() || !orderConfig || orderConfig.paymentMode !== "wechat") return undefined;
    let isActive = true;
    payOrderRequest(orderId, {
      channel: "wechat_jsapi",
      token,
      wechatCode
    })
      .then((payload) => {
        if (!isActive) return;
        if (payload.payment?.jsapi && window.WeixinJSBridge) {
          window.WeixinJSBridge.invoke("getBrandWCPayRequest", payload.payment.jsapi, () => {
            window.location.replace(payload.payment.returnUrl);
          });
        }
      })
      .catch((nextError) => {
        if (!isActive) return;
        setError(nextError.message || "继续支付失败，请稍后重试。");
      });

    return () => {
      isActive = false;
    };
  }, [orderConfig, orderId, token, wechatCode]);

  async function handleCopyContactWeChat() {
    await copyText(getContactWechatId(orderConfig));
    setContactCopied(true);
    if (contactCopiedTimeoutRef.current) window.clearTimeout(contactCopiedTimeoutRef.current);
    contactCopiedTimeoutRef.current = window.setTimeout(() => setContactCopied(false), 1600);
  }

  async function handleCopyOrderNo() {
    if (!order?.orderNo) return;
    await copyText(order.orderNo);
    setOrderCopied(true);
    if (orderCopiedTimeoutRef.current) window.clearTimeout(orderCopiedTimeoutRef.current);
    orderCopiedTimeoutRef.current = window.setTimeout(() => setOrderCopied(false), 1600);
  }

  async function handleCopyPaymentMessage() {
    if (!order) return;
    await copyText(buildManualPaymentMessage(order));
    setMessageCopied(true);
    if (messageCopiedTimeoutRef.current) window.clearTimeout(messageCopiedTimeoutRef.current);
    messageCopiedTimeoutRef.current = window.setTimeout(() => setMessageCopied(false), 1600);
  }

  async function handleOpenPaymentCard() {
    if (!order) return;
    setPaymentCardUrl(await buildManualPaymentCard(order, orderConfig));
  }

  return (
    <main className="app-shell">
      <section className="workspace order-page">
        <div className="task-toolbar">
          <div>
            <p className="eyebrow">Fridge order</p>
            <h2>订单详情</h2>
            <p className="storage-note">可在这里查看订单状态、收货信息和下单图片。</p>
          </div>
          <button className="secondary-button" onClick={() => window.location.assign("/fridge")} type="button">
            <Home size={18} />
            <span>返回冰箱贴页</span>
          </button>
        </div>
        {isLoading ? <p className="storage-note">正在读取订单…</p> : null}
        {error ? <p className="error-note">{error}</p> : null}
        {order ? (
          <section className="task-page">
            {order.orderStatus === "pending_payment" && isManualPaymentOrder(order, orderConfig) ? (
              <article className="draw-observability-card manual-payment-guide">
                <div className="draw-observability-head">
                  <div className="draw-observability-main">
                    <div className="task-meta-row">
                      <strong>请联系客服付款</strong>
                      <span className="task-status queued">待付款</span>
                    </div>
                    <p className="storage-note">建议先保存订单卡片，再去添加客服。联系客服时请发送订单卡片，客服确认收款后会手动更新订单状态。</p>
                  </div>
                </div>
                <div className="draw-observability-grid">
                  <div className="draw-observability-metric">
                    <strong>应付金额</strong>
                    <span>{formatCurrencyCents(order.totalCents)}</span>
                  </div>
                  <div className="draw-observability-metric">
                    <strong>订单号</strong>
                    <span>{order.orderNo}</span>
                  </div>
                  <div className="draw-observability-metric">
                    <strong>客服微信</strong>
                    <span>{getContactWechatId(orderConfig)}</span>
                  </div>
                </div>
                <p className="storage-note">请在 {formatDateTime(order.expiresAt)} 前完成付款，并将订单卡片发送给客服。</p>
                <div className="manual-payment-actions">
                  <button className="secondary-button" onClick={handleOpenPaymentCard} type="button">
                    <Download size={18} />
                    <span>保存订单卡片</span>
                  </button>
                  <button className="secondary-button" onClick={handleCopyPaymentMessage} type="button">
                    <Clipboard size={18} />
                    <span>{messageCopied ? "付款信息已复制" : "复制付款信息"}</span>
                  </button>
                  <button className="secondary-button" onClick={handleCopyContactWeChat} type="button">
                    <Clipboard size={18} />
                    <span>{contactCopied ? "微信号已复制" : "复制客服微信"}</span>
                  </button>
                  <button className="secondary-button" onClick={handleCopyOrderNo} type="button">
                    <Clipboard size={18} />
                    <span>{orderCopied ? "订单号已复制" : "复制订单号"}</span>
                  </button>
                </div>
              </article>
            ) : null}
            <article className="draw-observability-card">
              <div className="draw-observability-head">
                <div className="draw-observability-main">
                  <div className="task-meta-row">
                    <strong>{order.orderNo}</strong>
                    <span className={`task-status ${orderStatusTone(order.orderStatus)}`}>{orderStatusLabel(order.orderStatus)}</span>
                  </div>
                  <p className="storage-note">下单时间 {formatDateTime(order.createdAt)}，合计 {formatCurrencyCents(order.totalCents)}</p>
                </div>
              </div>
              <div className="draw-observability-grid">
                <div className="draw-observability-metric">
                  <strong>商品小计</strong>
                  <span>{formatCurrencyCents(order.subtotalCents)}</span>
                </div>
                <div className="draw-observability-metric">
                  <strong>邮费</strong>
                  <span>{order.shippingFeeCents > 0 ? formatCurrencyCents(order.shippingFeeCents) : "包邮"}</span>
                </div>
                <div className="draw-observability-metric">
                  <strong>订单总价</strong>
                  <span>{formatCurrencyCents(order.totalCents)}</span>
                </div>
              </div>
            </article>

            <article className="draw-observability-card">
              <h3>收货信息</h3>
              <p className="storage-note">{order.receiverName} · {order.receiverPhone}</p>
              <p className="storage-note">{order.addressDetail}</p>
              {order.remark ? <p className="storage-note">备注：{order.remark}</p> : null}
            </article>

            <article className="draw-observability-card">
              <h3>下单图片</h3>
              <div className="draw-card-order-items">
                {order.items.map((item, index) => (
                  <article className="draw-card-order-item" key={`${item.jobId}-${index}`}>
                    <OrderItemPreview alt={item.styleName || `冰箱贴 ${index + 1}`} src={item.thumbnailUrl || item.imageUrl} />
                    <strong>{item.styleName || `冰箱贴 ${index + 1}`}</strong>
                    <span className="draw-card-order-item-note">数量 x{Math.max(1, Number(item.quantity || 1))}</span>
                  </article>
                ))}
              </div>
            </article>
          </section>
        ) : null}
      </section>
      {paymentCardUrl ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => setPaymentCardUrl("")} role="presentation">
          <section className="draw-card-confirm-panel draw-card-payment-card-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="订单卡片">
            <button className="icon-button" onClick={() => setPaymentCardUrl("")} type="button" aria-label="关闭订单卡片">
              <X size={18} />
            </button>
            <div className="draw-card-payment-card-copy">
              <h3>长按保存订单卡片</h3>
              <p className="draw-card-contact-note">建议先保存到相册，再去添加客服，避免返回后找不到订单。</p>
            </div>
            <img alt="人工订单卡片" className="draw-card-payment-card-image" src={paymentCardUrl} />
          </section>
        </div>
      ) : null}
    </main>
  );
}

function PublicExperiencePage({ config }) {
  const {
    addClipErrorMessage,
    apiBase,
    clipContactFallback,
    clipEmptyText,
    clipErrorMessage,
    clipInvitePlaceholder,
    clipItemFallback,
    clipKicker,
    clipTitle,
    createErrorMessage,
    errorTitle,
    experienceType,
    inviteErrorMessage,
    latestErrorMessage,
    lightboxResultAlt,
    pocketAddLabel = "加入卡夹",
    pocketAddedLabel = "已加入卡夹",
    pocketRemoveLabel = "移出卡夹",
    pendingRemovalBody,
    previewAlt,
    readErrorMessage,
    removeClipErrorMessage,
    restoreErrorMessage,
    resultAltPrefix,
    resultNameFallback,
    resultsKicker,
    resultsSubtitle,
    resultsTitle,
    route,
    sessionStorageKey,
    startButtonIdle,
    startButtonLoading,
    subtitle,
    themeClass,
    title,
    titleKicker,
    waitingAlt,
    waitingFallback,
    waitingLines
  } = config;
  const [phase, setPhase] = useState("idle");
  const [referenceFile, setReferenceFile] = useState(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState(null);
  const [results, setResults] = useState([]);
  const [clipItems, setClipItems] = useState([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waitingLineIndex, setWaitingLineIndex] = useState(0);
  const [waitingStage, setWaitingStage] = useState("offering");
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [activeClipPreview, setActiveClipPreview] = useState(null);
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [flyingCard, setFlyingCard] = useState(null);
  const [clipReceiving, setClipReceiving] = useState(false);
  const [visitorState, setVisitorState] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [latestManualOrder, setLatestManualOrder] = useState(() => readLatestManualOrder());
  const [inviteCode, setInviteCode] = useState("");
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactCopied, setContactCopied] = useState(false);
  const [orderConfig, setOrderConfig] = useState(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [manualPaymentOrder, setManualPaymentOrder] = useState(null);
  const [orderForm, setOrderForm] = useState(DEFAULT_ORDER_ADDRESS);
  const [orderQuantities, setOrderQuantities] = useState({});
  const [orderError, setOrderError] = useState("");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [manualContactCopied, setManualContactCopied] = useState(false);
  const [manualOrderCopied, setManualOrderCopied] = useState(false);
  const [manualMessageCopied, setManualMessageCopied] = useState(false);
  const [manualPaymentCardUrl, setManualPaymentCardUrl] = useState("");
  const [visitTrackingReady, setVisitTrackingReady] = useState(false);
  const resultMediaRefs = useRef(new Map());
  const cardClipPanelRef = useRef(null);
  const flightTimeoutRef = useRef(null);
  const clipPulseTimeoutRef = useRef(null);
  const contactCopiedTimeoutRef = useRef(null);
  const manualContactCopiedTimeoutRef = useRef(null);
  const manualOrderCopiedTimeoutRef = useRef(null);
  const manualMessageCopiedTimeoutRef = useRef(null);
  const merchantClaimKeyRef = useRef("");
  const visitSessionIdRef = useRef("");
  const visitLifecycleTokenRef = useRef(0);

  useEffect(() => {
    return () => {
      if (contactCopiedTimeoutRef.current) window.clearTimeout(contactCopiedTimeoutRef.current);
      if (manualContactCopiedTimeoutRef.current) window.clearTimeout(manualContactCopiedTimeoutRef.current);
      if (manualOrderCopiedTimeoutRef.current) window.clearTimeout(manualOrderCopiedTimeoutRef.current);
      if (manualMessageCopiedTimeoutRef.current) window.clearTimeout(manualMessageCopiedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    setVisitTrackingReady(false);
    if (experienceType !== "fridge-magnet") {
      setVisitTrackingReady(true);
      return undefined;
    }
    const searchParams = new URLSearchParams(window.location.search);
    const mid = searchParams.get("mid") || searchParams.get("m") || "";
    const sig = searchParams.get("sig") || searchParams.get("s") || "";
    if (!mid || !sig) {
      setVisitTrackingReady(true);
      return undefined;
    }

    const claimKey = `${mid}:${sig}`;
    if (merchantClaimKeyRef.current === claimKey) {
      setVisitTrackingReady(true);
      return undefined;
    }
    merchantClaimKeyRef.current = claimKey;

    let isActive = true;
    claimMerchantSource({ mid, sig })
      .then(() => fetchVisitorState())
      .then((payload) => {
        if (!isActive || !payload) return;
        setVisitorState(payload);
      })
      .catch((nextError) => {
        if (!isActive) return;
        setError((current) => current || nextError.message || "锁定商户来源失败。");
      })
      .finally(() => {
        if (isActive) setVisitTrackingReady(true);
      });

    return () => {
      isActive = false;
    };
  }, [experienceType]);

  useEffect(() => {
    if (!visitTrackingReady) return undefined;

    let isActive = true;

    async function beginVisit() {
      if (!isActive || document.visibilityState === "hidden") return;
      const lifecycleToken = ++visitLifecycleTokenRef.current;
      try {
        const payload = await reportVisitSessionEvent({
          eventType: "enter",
          experienceType,
          route: window.location.pathname || "/"
        });
        const nextSessionId = String(payload?.session?.sessionId || "");
        if (!nextSessionId) return;
        if (!isActive || lifecycleToken !== visitLifecycleTokenRef.current || document.visibilityState === "hidden") {
          sendVisitSessionLeaveEvent({
            eventType: "leave",
            experienceType,
            route: window.location.pathname || "/",
            currentSessionId: nextSessionId
          });
          return;
        }
        visitSessionIdRef.current = nextSessionId;
      } catch {}
    }

    function endVisit() {
      visitLifecycleTokenRef.current += 1;
      const currentSessionId = visitSessionIdRef.current;
      visitSessionIdRef.current = "";
      if (!currentSessionId) return;
      sendVisitSessionLeaveEvent({
        eventType: "leave",
        experienceType,
        route: window.location.pathname || "/",
        currentSessionId
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        endVisit();
        return;
      }
      if (!visitSessionIdRef.current) {
        void beginVisit();
      }
    }

    function heartbeatVisit() {
      const currentSessionId = visitSessionIdRef.current;
      if (!currentSessionId || document.visibilityState === "hidden") return;
      reportVisitSessionEvent({
        eventType: "heartbeat",
        experienceType,
        route: window.location.pathname || "/",
        currentSessionId
      })
        .then((payload) => {
          const nextSession = payload?.session;
          if (!nextSession) {
            visitSessionIdRef.current = "";
            return;
          }
          if (nextSession.status !== "active") {
            visitSessionIdRef.current = "";
            return;
          }
          visitSessionIdRef.current = String(nextSession.sessionId || currentSessionId);
        })
        .catch(() => {});
    }

    void beginVisit();
    const timer = window.setInterval(heartbeatVisit, 30000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", endVisit);

    return () => {
      isActive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", endVisit);
      endVisit();
    };
  }, [experienceType, visitTrackingReady]);

  function refreshVisitorStateSilently() {
    fetchVisitorState().then(setVisitorState).catch(() => {});
  }

  function clearPersistedSession() {
    try {
      window.localStorage.removeItem(sessionStorageKey);
    } catch {}
  }

  function persistSession(nextSessionId) {
    if (!nextSessionId) {
      clearPersistedSession();
      return;
    }
    try {
      window.localStorage.setItem(sessionStorageKey, nextSessionId);
    } catch {}
  }

  function applySession(payload) {
    const nextSessionId = String(payload?.sessionId || "");
    setSession(payload);
    setSessionId(nextSessionId);
    persistSession(nextSessionId);
    setResults(Array.isArray(payload?.results) ? payload.results : []);
    setError("");
    if (["succeeded", "partial", "failed"].includes(String(payload?.status || ""))) {
      refreshVisitorStateSilently();
    }
    setPhase("results");
  }

  const sessionItems = useMemo(() => {
    if (Array.isArray(session?.items) && session.items.length) return session.items;
    return Array.isArray(session?.results)
      ? session.results.map((result, index) => ({
          order: Number(result?.order ?? index),
          jobId: String(result?.jobId || ""),
          styleId: String(result?.styleId || ""),
          styleName: String(result?.styleName || ""),
          status: "succeeded",
          result: {
            imageUrl: String(result?.imageUrl || result?.previewUrl || ""),
            thumbnailUrl: String(result?.thumbnailUrl || result?.imageUrl || ""),
            originalImageUrl: String(result?.originalImageUrl || ""),
            previewUrl: String(result?.previewUrl || result?.thumbnailUrl || result?.imageUrl || ""),
            isLiked: Boolean(result?.isLiked),
            likedAt: result?.likedAt || null
          },
          errorMessage: ""
        }))
      : [];
  }, [session]);

  const displayItems = useMemo(() => {
    const resultByJobId = new Map(
      results.map((result) => [
        String(result?.jobId || ""),
        {
          imageUrl: String(result?.imageUrl || result?.previewUrl || ""),
          thumbnailUrl: String(result?.thumbnailUrl || result?.imageUrl || ""),
          originalImageUrl: String(result?.originalImageUrl || ""),
          previewUrl: String(result?.previewUrl || result?.thumbnailUrl || result?.imageUrl || ""),
          isLiked: Boolean(result?.isLiked),
          likedAt: result?.likedAt || null
        }
      ])
    );

    return sessionItems.map((item, index) => {
      const fallbackResult = resultByJobId.get(String(item?.jobId || "")) || null;
      const mergedResult = item?.result && typeof item.result === "object" ? item.result : fallbackResult;
      return {
        order: Number(item?.order ?? index),
        jobId: String(item?.jobId || ""),
        styleId: String(item?.styleId || ""),
        styleName: String(item?.styleName || ""),
        status: String(item?.status || (mergedResult ? "succeeded" : "queued")),
        result: mergedResult,
        errorMessage: String(item?.errorMessage || "")
      };
    });
  }, [results, sessionItems]);

  function toDisplayResult(item) {
    if (!item?.result) return null;
    return {
      order: item.order,
      jobId: item.jobId,
      styleId: item.styleId,
      styleName: item.styleName,
      imageUrl: item.result.imageUrl,
      thumbnailUrl: item.result.thumbnailUrl,
      originalImageUrl: item.result.originalImageUrl,
      previewUrl: item.result.previewUrl,
      isLiked: Boolean(item.result.isLiked),
      likedAt: item.result.likedAt || null
    };
  }

  useEffect(() => {
    if (!referenceFile) {
      if (referencePreviewUrl) URL.revokeObjectURL(referencePreviewUrl);
      setReferencePreviewUrl("");
      return undefined;
    }

    const nextPreviewUrl = URL.createObjectURL(referenceFile);
    setReferencePreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [referenceFile, referencePreviewUrl]);

  useEffect(() => {
    let isActive = true;

    fetchVisitorState()
      .then((payload) => {
        if (isActive) setVisitorState(payload);
      })
      .catch(() => {
        if (isActive) setVisitorState(null);
      });

    fetchOrderConfig()
      .then((payload) => {
        if (isActive) setOrderConfig(payload);
      })
      .catch(() => {
        if (isActive) setOrderConfig(null);
      });

    fetchMyOrders()
      .then((payload) => {
        if (!isActive) return;
        const nextOrders = payload.orders || [];
        setMyOrders(nextOrders);
        const cachedOrder = readLatestManualOrder();
        const matchedOrder = cachedOrder ? nextOrders.find((item) => item.id === cachedOrder.orderId) : null;
        if (matchedOrder) {
          syncLatestManualOrder(matchedOrder, payload.config || orderConfig, matchedOrder.publicToken || cachedOrder?.publicToken || "");
          setLatestManualOrder(readLatestManualOrder());
        } else {
          setLatestManualOrder(cachedOrder);
        }
      })
      .catch(() => {
        if (!isActive) return;
        setMyOrders([]);
        setLatestManualOrder(readLatestManualOrder());
      });

    async function loadClipItems() {
      try {
        const payload = await fetchPublicClipItems(experienceType);
        if (!isActive) return;
        setClipItems(payload.items || []);
      } catch (nextError) {
        if (!isActive) return;
        setError((current) => current || nextError.message || clipErrorMessage);
      }
    }

    loadClipItems();

    async function restoreSessionProgress() {
      const restoredSessionId = readPersistedSessionId(sessionStorageKey);
      if (restoredSessionId) {
        try {
          const payload = await fetchPublicExperienceSession(apiBase, restoredSessionId, readErrorMessage);
          if (!isActive) return;
          applySession(payload);
          return;
        } catch (nextError) {
          if (!isActive) return;
          if (![403, 404].includes(nextError?.status)) {
            setError((current) => current || nextError.message || restoreErrorMessage);
            return;
          }
          clearPersistedSession();
        }
      }

      try {
        const payload = await fetchLatestPublicExperienceSession(apiBase, latestErrorMessage);
        if (!isActive) return;
        applySession(payload);
      } catch (nextError) {
        if (!isActive) return;
        if (nextError?.status === 404) return;
        setError((current) => current || nextError.message || restoreErrorMessage);
      }
    }

    restoreSessionProgress();

    return () => {
      isActive = false;
    };
  }, [apiBase, clipErrorMessage, experienceType, latestErrorMessage, readErrorMessage, restoreErrorMessage, sessionStorageKey]);

  useEffect(() => {
    if (experienceType !== "fridge-magnet") return;
    setOrderQuantities((current) => syncOrderQuantitiesWithClipItems(current, clipItems));
  }, [clipItems, experienceType]);

  useEffect(() => {
    if (!waitingLines.length) return undefined;
    setWaitingLineIndex(0);
    const timer = window.setInterval(() => {
      setWaitingLineIndex((current) => (current + 1) % waitingLines.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [waitingLines]);

  useEffect(() => {
    const sessionStatus = String(session?.status || "");
    if (!sessionId || !["queued", "running"].includes(sessionStatus)) return undefined;

    let isActive = true;
    async function pollSession() {
      try {
        const payload = await fetchPublicExperienceSession(apiBase, sessionId, readErrorMessage);
        if (!isActive) return;
        applySession(payload);
      } catch (nextError) {
        if (!isActive) return;
        if ([403, 404].includes(nextError?.status)) {
          clearPersistedSession();
          setSessionId("");
          setSession(null);
          setResults([]);
          setError("");
          setPhase("idle");
          return;
        }
        setError(nextError.message || readErrorMessage);
        setPhase("error");
      }
    }

    pollSession();
    const timer = window.setInterval(pollSession, 2200);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, [apiBase, readErrorMessage, session?.status, sessionId]);

  useEffect(() => {
    return () => {
      if (flightTimeoutRef.current) window.clearTimeout(flightTimeoutRef.current);
      if (clipPulseTimeoutRef.current) window.clearTimeout(clipPulseTimeoutRef.current);
    };
  }, []);

  const canStart = Boolean(referenceFile) && !isSubmitting;
  const activeResult = activeResultIndex >= 0 ? toDisplayResult(displayItems[activeResultIndex]) : activeResultIndex === -3 ? activeClipPreview : null;
  const succeededCount = Number(session?.summary?.succeeded ?? displayItems.filter((item) => item.status === "succeeded").length);
  const totalCount = Number(session?.summary?.total ?? displayItems.length);
  const currentSessionStatus = String(session?.status || "");

  const resultsHeading = currentSessionStatus === "running" || currentSessionStatus === "queued"
    ? `已生成 ${succeededCount} / ${totalCount || "--"} 张结果`
    : currentSessionStatus === "partial"
      ? "部分结果已抵达，本轮未扣次数。"
      : currentSessionStatus === "failed"
        ? "这一轮没有成功结果，本轮未扣次数。"
        : resultsTitle;

  const resultsBodyCopy = currentSessionStatus === "running" || currentSessionStatus === "queued"
    ? (session?.message || waitingFallback)
    : currentSessionStatus === "partial"
      ? (session?.message || "成功结果可以正常保留，本轮未扣次数。")
      : currentSessionStatus === "failed"
        ? (session?.message || "所有卡位都已结束，本轮没有可保留的成功结果。")
        : resultsSubtitle;

  function resetExperience() {
    clearPersistedSession();
    setPhase("idle");
    setReferenceFile(null);
    setSessionId("");
    setSession(null);
    setResults([]);
    setError("");
    setIsSubmitting(false);
    setActiveResultIndex(-1);
    setActiveClipPreview(null);
    setFlyingCard(null);
    setClipReceiving(false);
    resultMediaRefs.current.clear();
  }

  function confirmResetExperience() {
    const confirmed = window.confirm("换张图片重做后，本轮未被放入口袋的结果会被删除。请先确认你喜欢的图片已经放入口袋。");
    if (!confirmed) return;
    resetExperience();
  }

  function handleFileChange(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("请上传 JPG、PNG 或 WebP 图片。");
      setPhase("error");
      return;
    }

    clearPersistedSession();
    setReferenceFile(file);
    setSessionId("");
    setSession(null);
    setResults([]);
    setError("");
    setPhase("ready");
  }

  function updateResultCardState(jobId, patch) {
    setResults((current) => current.map((item) => (item.jobId === jobId ? { ...item, ...patch } : item)));
    setSession((current) =>
      current
        ? {
            ...current,
            results: Array.isArray(current.results) ? current.results.map((item) => (item.jobId === jobId ? { ...item, ...patch } : item)) : current.results,
            items: Array.isArray(current.items)
              ? current.items.map((item) =>
                  item.jobId === jobId
                    ? {
                        ...item,
                        result: item.result
                          ? {
                              ...item.result,
                              isLiked: Object.prototype.hasOwnProperty.call(patch, "isLiked") ? patch.isLiked : item.result.isLiked,
                              likedAt: Object.prototype.hasOwnProperty.call(patch, "likedAt") ? patch.likedAt : item.result.likedAt
                            }
                          : item.result
                      }
                    : item
                )
              : current.items
          }
        : current
    );
  }

  function upsertClipItem(item) {
    setClipItems((current) => {
      const next = [item, ...current.filter((entry) => entry.jobId !== item.jobId)];
      return next.sort((left, right) => new Date(right.likedAt || 0).getTime() - new Date(left.likedAt || 0).getTime());
    });
  }

  function triggerClipPulse() {
    setClipReceiving(true);
    if (clipPulseTimeoutRef.current) window.clearTimeout(clipPulseTimeoutRef.current);
    clipPulseTimeoutRef.current = window.setTimeout(() => setClipReceiving(false), 900);
  }

  function animateIntoClip(result) {
    const sourceNode = resultMediaRefs.current.get(result.jobId);
    const clipNode = cardClipPanelRef.current;
    if (!sourceNode || !clipNode || !(result.imageUrl || result.thumbnailUrl)) {
      triggerClipPulse();
      return;
    }

    const startRect = sourceNode.getBoundingClientRect();
    const clipRect = clipNode.getBoundingClientRect();
    const endWidth = Math.min(112, Math.max(84, clipRect.width - 48));
    const endHeight = Math.round(endWidth * 1.5);
    const nextKey = `${result.jobId}-${Date.now()}`;

    if (flightTimeoutRef.current) window.clearTimeout(flightTimeoutRef.current);
    setFlyingCard({
      key: nextKey,
      src: result.thumbnailUrl || result.imageUrl,
      active: false,
      start: { top: startRect.top, left: startRect.left, width: startRect.width, height: startRect.height },
      end: {
        top: clipRect.top + 96,
        left: clipRect.left + clipRect.width / 2 - endWidth / 2,
        width: endWidth,
        height: endHeight
      }
    });

    window.requestAnimationFrame(() => {
      setFlyingCard((current) => (current?.key === nextKey ? { ...current, active: true } : current));
      triggerClipPulse();
    });

    flightTimeoutRef.current = window.setTimeout(() => {
      setFlyingCard((current) => (current?.key === nextKey ? null : current));
    }, 820);
  }

  function setResultMediaRef(jobId, node) {
    if (!jobId) return;
    if (node) resultMediaRefs.current.set(jobId, node);
    else resultMediaRefs.current.delete(jobId);
  }

  async function startDrawCard() {
    if (!referenceFile) return;

    setIsSubmitting(true);
    setError("");
    try {
      const latestVisitorState = await fetchVisitorState();
      setVisitorState(latestVisitorState);
      if (!latestVisitorState?.canGenerate) {
        setError(latestVisitorState?.contactMessage || clipContactFallback);
        return;
      }

      const traceId = createClientTraceId();
      const preparedReference = await prepareReferenceForUpload({ id: "draw-card-reference", file: referenceFile });
      const formData = new FormData();
      formData.append("image", preparedReference.file);
      formData.append("clientPrepareReferenceMs", String(preparedReference.telemetry?.prepareReferenceMs ?? ""));
      formData.append("clientOriginalFileBytes", String(preparedReference.telemetry?.originalBytes ?? ""));
      formData.append("clientUploadedFileBytes", String(preparedReference.telemetry?.uploadedBytes ?? ""));
      formData.append("clientOriginalWidth", String(preparedReference.telemetry?.originalWidth ?? ""));
      formData.append("clientOriginalHeight", String(preparedReference.telemetry?.originalHeight ?? ""));
      formData.append("clientUploadedWidth", String(preparedReference.telemetry?.uploadedWidth ?? ""));
      formData.append("clientUploadedHeight", String(preparedReference.telemetry?.uploadedHeight ?? ""));
      formData.append("clientWasCompressed", preparedReference.telemetry?.wasCompressed ? "1" : "0");

      const response = await fetch(`${apiBase}/sessions`, {
        method: "POST",
        headers: { "x-draw-trace-id": traceId },
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || createErrorMessage);

      applySession(payload);
      refreshVisitorStateSilently();
    } catch (nextError) {
      setError(nextError.message || createErrorMessage);
      setPhase("ready");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function addToClip(result) {
    if (!result?.jobId || result.isLiked) return;

    try {
      const payload = await likeImageJob(result.jobId);
      const likedAt = payload.likedAt || new Date().toISOString();

      updateResultCardState(result.jobId, { isLiked: true, likedAt });
      upsertClipItem({
        jobId: payload.jobId,
        styleId: payload.styleId || result.styleId || "",
        styleName: payload.styleName || result.styleName || "",
        imageUrl: payload.result?.previewUrl || payload.result?.thumbnailUrl || result.imageUrl || "",
        thumbnailUrl: payload.result?.thumbnailUrl || payload.result?.previewUrl || result.thumbnailUrl || result.imageUrl || "",
        experienceType,
        isLiked: true,
        likedAt
      });
      animateIntoClip(result);
      setError("");
    } catch (nextError) {
      setError(nextError.message || addClipErrorMessage);
    }
  }

  async function removeFromClip(result) {
    if (!result?.jobId || !result.isLiked) return;

    try {
      const payload = await unlikeImageJob(result.jobId);
      updateResultCardState(result.jobId, { isLiked: Boolean(payload.isLiked), likedAt: payload.likedAt || null });
      setClipItems((current) => current.filter((item) => item.jobId !== result.jobId));
      setActiveClipPreview((current) => (current?.jobId === result.jobId ? null : current));
      if (activeResultIndex === -3 && activeClipPreview?.jobId === result.jobId) {
        setActiveResultIndex(-1);
      }
      setError("");
    } catch (nextError) {
      setError(nextError.message || removeClipErrorMessage);
    }
  }

  function openClipPreview(jobId) {
    const targetIndex = displayItems.findIndex((item) => item.jobId === jobId && item.status === "succeeded" && item.result);
    if (targetIndex >= 0) {
      setActiveClipPreview(null);
      setActiveResultIndex(targetIndex);
      return;
    }

    const clipItem = clipItems.find((item) => item.jobId === jobId);
    if (clipItem) {
      setActiveClipPreview(clipItem);
      setActiveResultIndex(-3);
    }
  }

  function closeActivePreview() {
    setActiveResultIndex(-1);
    setActiveClipPreview(null);
  }

  async function handleCopyContactWeChat() {
    await copyText(getContactWechatId(orderConfig));
    setContactCopied(true);
    if (contactCopiedTimeoutRef.current) window.clearTimeout(contactCopiedTimeoutRef.current);
    contactCopiedTimeoutRef.current = window.setTimeout(() => setContactCopied(false), 1600);
  }

  async function handleCopyManualPaymentContact() {
    await copyText(getContactWechatId(orderConfig));
    setManualContactCopied(true);
    if (manualContactCopiedTimeoutRef.current) window.clearTimeout(manualContactCopiedTimeoutRef.current);
    manualContactCopiedTimeoutRef.current = window.setTimeout(() => setManualContactCopied(false), 1600);
  }

  async function handleCopyManualPaymentOrderNo() {
    if (!manualPaymentOrder?.order?.orderNo) return;
    await copyText(manualPaymentOrder.order.orderNo);
    setManualOrderCopied(true);
    if (manualOrderCopiedTimeoutRef.current) window.clearTimeout(manualOrderCopiedTimeoutRef.current);
    manualOrderCopiedTimeoutRef.current = window.setTimeout(() => setManualOrderCopied(false), 1600);
  }

  async function handleCopyManualPaymentMessage() {
    if (!manualPaymentOrder?.order) return;
    await copyText(buildManualPaymentMessage(manualPaymentOrder.order));
    setManualMessageCopied(true);
    if (manualMessageCopiedTimeoutRef.current) window.clearTimeout(manualMessageCopiedTimeoutRef.current);
    manualMessageCopiedTimeoutRef.current = window.setTimeout(() => setManualMessageCopied(false), 1600);
  }

  async function handleOpenManualPaymentCard(order = manualPaymentOrder?.order) {
    if (!order) return;
    setManualPaymentCardUrl(await buildManualPaymentCard(order, orderConfig));
  }

  function goToOrderDetail(orderId, token) {
    window.location.href = buildOrderDetailUrl(orderId, token);
  }

  function updateOrderFormField(key, value) {
    setOrderForm((current) => ({ ...current, [key]: value }));
  }

  function setOrderItemQuantity(jobId, quantity) {
    if (!jobId) return;
    setOrderQuantities((current) => {
      const safeQuantity = clampOrderItemQuantity(quantity);
      if (current[jobId] === safeQuantity) return current;
      return {
        ...current,
        [jobId]: safeQuantity
      };
    });
  }

  function increaseOrderItemQuantity(jobId) {
    if (!jobId) return;
    setOrderQuantities((current) => ({
      ...current,
      [jobId]: clampOrderItemQuantity(getOrderItemQuantity(current, jobId) + 1)
    }));
  }

  function decreaseOrderItemQuantity(jobId) {
    if (!jobId) return;
    setOrderQuantities((current) => ({
      ...current,
      [jobId]: clampOrderItemQuantity(getOrderItemQuantity(current, jobId) - 1)
    }));
  }

  async function handleCreateOrderAndPay() {
    if (experienceType !== "fridge-magnet") return;
    setIsCreatingOrder(true);
    setOrderError("");
    try {
      const created = await createOrderRequest({
        experienceType,
        items: clipItems.map((item) => ({
          jobId: item.jobId,
          quantity: getOrderItemQuantity(orderQuantities, item.jobId)
        })),
        ...orderForm
      });
      if (created.payment?.mode === "manual" || orderConfig?.paymentMode === "manual") {
        setShowOrderModal(false);
        setManualPaymentOrder(created);
        persistLatestManualOrder(created.order, created.order.publicToken);
        setLatestManualOrder(readLatestManualOrder());
        setOrderForm(DEFAULT_ORDER_ADDRESS);
        return;
      }
      const payResult = await payOrderRequest(created.order.id, {
        channel: isWechatBrowserClient() ? "wechat_jsapi" : "wechat_h5",
        token: created.order.publicToken
      });

      if (payResult.payment?.status === "oauth_required" && payResult.payment?.oauthUrl) {
        window.location.href = payResult.payment.oauthUrl;
        return;
      }
      if (payResult.payment?.channel === "wechat_h5" && payResult.payment?.h5Url) {
        const redirectUrl = `${payResult.payment.h5Url}${payResult.payment.h5Url.includes("?") ? "&" : "?"}redirect_url=${encodeURIComponent(payResult.payment.returnUrl)}`;
        window.location.href = redirectUrl;
        return;
      }
      if (payResult.payment?.channel === "wechat_jsapi" && window.WeixinJSBridge && payResult.payment?.jsapi) {
        const jsapi = payResult.payment.jsapi;
        window.WeixinJSBridge.invoke("getBrandWCPayRequest", jsapi, (response) => {
          const errMsg = String(response?.err_msg || "");
          if (errMsg.includes("ok")) {
            window.location.href = payResult.payment.returnUrl;
            return;
          }
          setOrderError("支付未完成，请稍后到订单页继续查看。");
          window.location.href = payResult.payment.returnUrl;
        });
        return;
      }

      goToOrderDetail(created.order.id, created.order.publicToken);
    } catch (nextError) {
      setOrderError(nextError.message || "下单失败，请稍后再试。");
    } finally {
      setIsCreatingOrder(false);
    }
  }

  const orderStyleCount = clipItems.length;
  const totalOrderItemCount = getTotalOrderItemCount(clipItems, orderQuantities);
  const orderAmountPreview = calculateClientOrderAmount(totalOrderItemCount, orderConfig);
  const recentManualOrderLink = isActiveLatestManualOrder(latestManualOrder)
    ? buildOrderDetailUrl(latestManualOrder.orderId, latestManualOrder.publicToken)
    : "";

  function isCurrentSessionResult(jobId) {
    return displayItems.some((item) => item.jobId === jobId && item.status === "succeeded");
  }

  function requestRemoveFromClip(result) {
    if (!result?.jobId || !result.isLiked) return;

    if (isCurrentSessionResult(result.jobId)) {
      removeFromClip(result);
      return;
    }

    setPendingRemoval(result);
  }

  function renderClipPanel() {
    return (
      <aside className={`draw-card-clip-panel ${clipReceiving ? "is-receiving" : ""}`} ref={cardClipPanelRef}>
        <div className="draw-card-clip-head">
          <div>
            <p className="draw-card-kicker">{clipKicker}</p>
            <h3>{clipTitle}</h3>
          </div>
          <span className="draw-card-clip-count">{clipItems.length}</span>
        </div>

        {clipItems.length ? (
          <div className="draw-card-clip-list">
            {clipItems.map((item, index) => (
              <article className="draw-card-clip-item" key={`clip-${item.jobId}-${index}`}>
                <button className="draw-card-clip-preview" onClick={() => openClipPreview(item.jobId)} type="button">
                  <img alt={item.styleName || `${clipItemFallback} ${index + 1}`} src={item.thumbnailUrl || item.imageUrl} />
                </button>
                <div className="draw-card-clip-meta">
                  <strong>{item.styleName || `${clipItemFallback} ${index + 1}`}</strong>
                  <button className="draw-card-clip-remove" onClick={() => requestRemoveFromClip(item)} type="button">
                    {pocketRemoveLabel}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="draw-card-clip-empty">
            <Sparkles size={18} />
            <p>{clipEmptyText}</p>
          </div>
        )}

        <div className="draw-card-clip-empty">
          <p>剩余次数：{visitorState ? `${visitorState.quotaRemaining}` : "--"}</p>
          {visitorState?.sourceMerchantName ? <p>来源商户：{visitorState.sourceMerchantName}</p> : null}
          <input className="field-inline-input" onChange={(event) => setInviteCode(event.target.value)} placeholder={clipInvitePlaceholder} value={inviteCode} />
          <div className="draw-card-clip-actions">
            <button
              className="draw-card-secondary"
              onClick={async () => {
                try {
                  const payload = await redeemInviteCode(inviteCode);
                  setVisitorState(payload);
                  setInviteCode("");
                  setError("");
                } catch (nextError) {
                  setError(nextError.message || inviteErrorMessage);
                }
              }}
              type="button"
            >
              <span>兑换邀请码</span>
            </button>
            <button className="draw-card-secondary" onClick={() => setShowContactModal(true)} type="button">
              <span>联系客服</span>
            </button>
            {experienceType === "fridge-magnet" && (myOrders.length || recentManualOrderLink) ? (
              <button
                className="draw-card-secondary"
                onClick={() => window.location.assign(myOrders.length ? "/fridge/orders" : recentManualOrderLink)}
                type="button"
              >
                <span>{myOrders.length ? "我的订单 / 继续付款" : "继续查看最近订单"}</span>
              </button>
            ) : null}
          </div>
          {experienceType === "fridge-magnet" ? (
            <button className="draw-card-primary draw-card-order-button" disabled={!clipItems.length || !orderConfig?.enabled} onClick={() => setShowOrderModal(true)} type="button">
              <span>{orderConfig?.enabled ? "提交订单" : "下单未开放"}</span>
            </button>
          ) : null}
          <p>{visitorState?.contactMessage || clipContactFallback}</p>
        </div>
      </aside>
    );
  }

  return (
    <main className={`draw-card-shell ${themeClass} ${route} phase-${phase}`}>
      <div className="draw-card-ambient draw-card-ambient-a" />
      <div className="draw-card-ambient draw-card-ambient-b" />

      {(phase === "idle" || phase === "ready") && (
        <section className="draw-card-stage">
          <div className="draw-card-stage-layout">
            <div className="draw-card-stage-main">
              <div className="draw-card-hero">
                <p className="draw-card-kicker">{titleKicker}</p>
                <h1 className="draw-card-title">{title}</h1>
                <p className="draw-card-subtitle">{subtitle}</p>
              </div>

              <section className={`draw-card-upload-panel ${referenceFile ? "has-image" : ""}`}>
                <label className="draw-card-upload" htmlFor={`${experienceType}-input`}>
                  {referencePreviewUrl ? (
                    <img alt={previewAlt} className="draw-card-upload-preview" src={referencePreviewUrl} />
                  ) : (
                    <div className="draw-card-upload-empty">
                      <ImageUp size={22} />
                      <strong>上传 1 张图片</strong>
                      <span>支持 JPG、PNG、WebP</span>
                    </div>
                  )}
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    id={`${experienceType}-input`}
                    onChange={(event) => {
                      handleFileChange(event.target.files?.[0] || null);
                      event.target.value = "";
                    }}
                    type="file"
                  />
                </label>

                <div className="draw-card-actions">
                  <button className="draw-card-primary" disabled={!canStart} onClick={startDrawCard} type="button">
                    {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                    <span>{isSubmitting ? startButtonLoading : startButtonIdle}</span>
                  </button>
                  {referenceFile ? (
                    <button className="draw-card-secondary" onClick={resetExperience} type="button">
                      <RefreshCw size={18} />
                      <span>重新选择</span>
                    </button>
                  ) : null}
                </div>

                {error ? <p className="error-note draw-card-inline-error">{error}</p> : null}
              </section>
            </div>

            {renderClipPanel()}
          </div>
        </section>
      )}

      {phase === "results" && (
        <section className="draw-card-stage draw-card-stage-results">
          <div className="draw-card-results-head">
            <div>
              <p className="draw-card-kicker">{resultsKicker}</p>
              <h2>{resultsHeading}</h2>
              <p className="draw-card-subtitle">{resultsBodyCopy}</p>
            </div>
            <button className="draw-card-secondary draw-card-results-restart draw-card-results-restart-desktop" onClick={confirmResetExperience} type="button">
              <RefreshCw size={18} />
              <span>换张图片重做</span>
            </button>
          </div>

          {error ? <p className="error-note draw-card-inline-error">{error}</p> : null}

          <div className="draw-card-results-layout">
            <div className="draw-card-results-main">
              <div className="draw-card-results-grid">
                {displayItems.map((item, index) => {
                  const result = toDisplayResult(item);
                  const isSucceeded = item.status === "succeeded" && result;
                  const isRunning = item.status === "running" || item.status === "queued";
                  const isFailed = item.status === "failed" || item.status === "cancelled";
                  return (
                    <article
                      className={`draw-card-result-card ${result?.isLiked ? "is-in-clip" : ""} ${isRunning ? "is-pending" : ""} ${isFailed ? "is-failed" : ""}`}
                      key={`${item.styleId}-${item.jobId || index}`}
                    >
                      {isSucceeded ? (
                        <button className="draw-card-result-media" onClick={() => setActiveResultIndex(index)} ref={(node) => setResultMediaRef(item.jobId, node)} type="button">
                          <img alt={`${resultAltPrefix} ${index + 1}`} src={result.imageUrl || result.thumbnailUrl} />
                        </button>
                      ) : (
                        <div className={`draw-card-result-placeholder ${isFailed ? "is-failed" : "is-pending"}`}>
                          {isFailed ? <AlertTriangle size={22} /> : <LoaderCircle className="spin" size={22} />}
                          <strong>{isFailed ? "生成失败" : "正在生成"}</strong>
                          <span>{isFailed ? item.errorMessage || "该风格本轮未能成功生成。" : waitingLines[waitingLineIndex] || "结果会在完成后自动出现。"}</span>
                        </div>
                      )}
                      <div className="draw-card-result-meta">
                        <span>{item.styleName || `${resultNameFallback} ${index + 1}`}</span>
                        {isSucceeded ? (
                          <button className={`draw-card-save-button ${result.isLiked ? "is-liked" : ""}`} disabled={Boolean(result.isLiked)} onClick={() => addToClip(result)} type="button">
                            {result.isLiked ? <Check size={16} /> : <Sparkles size={16} />}
                            <span>{result.isLiked ? pocketAddedLabel : pocketAddLabel}</span>
                          </button>
                        ) : (
                          <span className={`task-status ${item.status}`}>{statusLabel(item.status)}</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              <button className="draw-card-secondary draw-card-results-restart draw-card-results-restart-mobile" onClick={confirmResetExperience} type="button">
                <RefreshCw size={18} />
                <span>换张图片重做</span>
              </button>
            </div>

            {renderClipPanel()}
          </div>
        </section>
      )}

      {phase === "error" && (
        <section className="draw-card-stage draw-card-stage-error">
          <div className="draw-card-error-panel">
            <p className="draw-card-kicker">Unavailable</p>
            <h2>{errorTitle}</h2>
            <p>{error || "请稍后重新开始。"}</p>
            <button className="draw-card-primary" onClick={resetExperience} type="button">
              <RefreshCw size={18} />
              <span>重新开始</span>
            </button>
          </div>
        </section>
      )}

      {activeResult && (
        <div className="modal-backdrop draw-card-lightbox" onClick={closeActivePreview} role="presentation">
          <section className="draw-card-lightbox-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <button className="icon-button" onClick={closeActivePreview} type="button" aria-label="关闭预览">
              <X size={18} />
            </button>
            <img alt={activeResult.styleName || lightboxResultAlt} src={activeResult.imageUrl || activeResult.thumbnailUrl} />
            <div className="draw-card-lightbox-meta">
              <span>{activeResult.styleName || resultNameFallback}</span>
              {activeResult.isLiked ? (
                <button className="draw-card-clip-remove" onClick={() => requestRemoveFromClip(activeResult)} type="button">
                  {pocketRemoveLabel}
                </button>
              ) : (
                <button className="draw-card-save-button" onClick={() => addToClip(activeResult)} type="button">
                  <Sparkles size={16} />
                  <span>{pocketAddLabel}</span>
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {flyingCard ? (
        <div
          className={`draw-card-fly-card ${flyingCard.active ? "is-active" : ""}`}
          style={{
            top: `${flyingCard.active ? flyingCard.end.top : flyingCard.start.top}px`,
            left: `${flyingCard.active ? flyingCard.end.left : flyingCard.start.left}px`,
            width: `${flyingCard.active ? flyingCard.end.width : flyingCard.start.width}px`,
            height: `${flyingCard.active ? flyingCard.end.height : flyingCard.start.height}px`
          }}
        >
          <img alt="" src={flyingCard.src} />
        </div>
      ) : null}

      {pendingRemoval ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => setPendingRemoval(null)} role="presentation">
          <section className="draw-card-confirm-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <p className="draw-card-kicker">{clipKicker}</p>
            <h2>移出后不可恢复。</h2>
            <p className="storage-note">{pendingRemovalBody}</p>
            <div className="draw-card-confirm-actions">
              <button className="draw-card-secondary" onClick={() => setPendingRemoval(null)} type="button">
                取消
              </button>
              <button
                className="draw-card-clip-remove"
                onClick={() => {
                  removeFromClip(pendingRemoval);
                  setPendingRemoval(null);
                }}
                type="button"
              >
                {pocketRemoveLabel}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showContactModal ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => setShowContactModal(false)} role="presentation">
          <section className="draw-card-confirm-panel draw-card-contact-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="联系客服">
            <button className="icon-button" onClick={() => setShowContactModal(false)} type="button" aria-label="关闭弹窗">
              <X size={18} />
            </button>
            <div className="draw-card-contact-copy">
              <h3>联系客服</h3>
              <p>请加微信</p>
              <button className="draw-card-contact-id" onClick={handleCopyContactWeChat} type="button">
                <span>{getContactWechatId(orderConfig)}</span>
                <Clipboard size={16} />
              </button>
              <p className="draw-card-contact-note">{contactCopied ? "微信号已复制" : "点击微信号即可一键复制"}</p>
            </div>
            <div className="draw-card-confirm-actions">
              <button className="draw-card-secondary" onClick={handleCopyContactWeChat} type="button">
                <Clipboard size={16} />
                <span>{contactCopied ? "已复制" : "复制微信号"}</span>
              </button>
              <button className="draw-card-primary" onClick={() => setShowContactModal(false)} type="button">
                <span>我知道了</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showOrderModal ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => setShowOrderModal(false)} role="presentation">
          <section className="draw-card-confirm-panel draw-card-order-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="立即下单">
            <div className="draw-card-order-head">
              <div>
                <p className="draw-card-kicker">Order</p>
                <h2>填写收货信息</h2>
              </div>
              <button className="icon-button" onClick={() => setShowOrderModal(false)} type="button" aria-label="关闭下单弹窗">
                <X size={18} />
              </button>
            </div>
            <div className="draw-card-order-summary">
              <p>已选 {orderStyleCount} 款，共 {totalOrderItemCount} 只</p>
              <p>单价 {formatCurrencyCents(orderAmountPreview.unitPriceCents)} / 只</p>
              <p>邮费 {orderAmountPreview.shippingFeeCents > 0 ? formatCurrencyCents(orderAmountPreview.shippingFeeCents) : "包邮"}</p>
              <strong>合计 {formatCurrencyCents(orderAmountPreview.totalCents)}</strong>
              <span className="storage-note">1 只收邮费，2 只及以上包邮</span>
            </div>
            <div className="draw-card-order-items">
              {clipItems.map((item, index) => {
                const quantity = getOrderItemQuantity(orderQuantities, item.jobId);
                return (
                <article className="draw-card-order-item" key={`${item.jobId}-${index}`}>
                  <OrderItemPreview alt={item.styleName || `冰箱贴 ${index + 1}`} note="图片准备中" src={item.thumbnailUrl || item.imageUrl} title={item.styleName || `冰箱贴 ${index + 1}`} />
                  <div className="draw-card-order-item-copy">
                    <div className="draw-card-order-item-head">
                      <strong>{item.styleName || `冰箱贴 ${index + 1}`}</strong>
                      <span className="draw-card-order-item-note">小计 {formatCurrencyCents(orderAmountPreview.unitPriceCents * quantity)}</span>
                    </div>
                    <div className="draw-card-order-item-stepper">
                      <button disabled={quantity <= 1} onClick={() => decreaseOrderItemQuantity(item.jobId)} type="button">-</button>
                      <span>{quantity}</span>
                      <button disabled={quantity >= MAX_ORDER_ITEM_QUANTITY} onClick={() => increaseOrderItemQuantity(item.jobId)} type="button">+</button>
                    </div>
                  </div>
                </article>
              );
              })}
            </div>
            <div className="draw-card-order-form">
              <label className="field-label">
                收件人
                <input onChange={(event) => updateOrderFormField("receiverName", event.target.value)} type="text" value={orderForm.receiverName} />
              </label>
              <label className="field-label">
                手机号
                <input onChange={(event) => updateOrderFormField("receiverPhone", event.target.value)} type="tel" value={orderForm.receiverPhone} />
              </label>
              <label className="field-label">
                收货地址
                <input onChange={(event) => updateOrderFormField("address", event.target.value)} type="text" value={orderForm.address} />
              </label>
              <label className="field-label">
                备注
                <textarea onChange={(event) => updateOrderFormField("remark", event.target.value)} rows="3" value={orderForm.remark} />
              </label>
            </div>
            {orderError ? <p className="error-note">{orderError}</p> : null}
            <div className="draw-card-confirm-actions">
              <button className="draw-card-secondary" onClick={() => setShowOrderModal(false)} type="button">
                取消
              </button>
              <button className="draw-card-primary" disabled={!clipItems.length || !totalOrderItemCount || isCreatingOrder} onClick={handleCreateOrderAndPay} type="button">
                {isCreatingOrder ? <LoaderCircle className="spin" size={18} /> : null}
                <span>{isCreatingOrder ? "提交中" : "提交订单"}</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {manualPaymentOrder ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => goToOrderDetail(manualPaymentOrder.order.id, manualPaymentOrder.order.publicToken)} role="presentation">
          <section className="draw-card-confirm-panel draw-card-order-panel draw-card-manual-payment-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="联系客服付款">
            <div className="draw-card-order-head">
              <div>
                <p className="draw-card-kicker">Order created</p>
                <h2>订单已创建，请联系客服付款</h2>
              </div>
              <button className="icon-button" onClick={() => goToOrderDetail(manualPaymentOrder.order.id, manualPaymentOrder.order.publicToken)} type="button" aria-label="查看订单详情">
                <X size={18} />
              </button>
            </div>
            <div className="draw-card-order-summary">
              <p>应付金额 {formatCurrencyCents(manualPaymentOrder.order.totalCents)}</p>
              <p>订单号 {manualPaymentOrder.order.orderNo}</p>
              <p>客服微信 {getContactWechatId(orderConfig)}</p>
              <strong>请在 {formatDateTime(manualPaymentOrder.payment?.expiresAt || manualPaymentOrder.order.expiresAt)} 前完成付款</strong>
              <span className="storage-note">请按下面两步操作。订单卡片里已经包含订单号、金额和客服微信，先保存，再去微信添加好友。</span>
            </div>
            <div className="manual-payment-step-list">
              <article className="manual-payment-step-card">
                <div className="manual-payment-step-head">
                  <span className="manual-payment-step-index">第一步</span>
                  <strong>保存订单卡片</strong>
                </div>
                <p className="storage-note">一键打开订单卡片。卡片里已经包含订单号、金额和客服微信，保存后就不用再回页面找订单号。</p>
                <button className="draw-card-primary manual-payment-step-button" onClick={() => handleOpenManualPaymentCard(manualPaymentOrder.order)} type="button">
                  <Download size={16} />
                  <span>保存订单卡片</span>
                </button>
              </article>
              <article className="manual-payment-step-card">
                <div className="manual-payment-step-head">
                  <span className="manual-payment-step-index">第二步</span>
                  <strong>复制客服微信，去微信添加好友</strong>
                </div>
                <p className="storage-note">复制后直接切换到微信搜索并添加客服，付款时把刚保存的订单卡片发给客服即可。</p>
                <button className="draw-card-primary manual-payment-step-button" onClick={handleCopyManualPaymentContact} type="button">
                  <Clipboard size={16} />
                  <span>{manualContactCopied ? "客服微信已复制" : "复制客服微信"}</span>
                </button>
              </article>
            </div>
            <div className="draw-card-confirm-actions">
              <button className="draw-card-secondary" onClick={() => goToOrderDetail(manualPaymentOrder.order.id, manualPaymentOrder.order.publicToken)} type="button">
                <Eye size={16} />
                <span>稍后查看订单详情</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
      {manualPaymentCardUrl ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => setManualPaymentCardUrl("")} role="presentation">
          <section className="draw-card-confirm-panel draw-card-payment-card-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="订单卡片">
            <button className="icon-button" onClick={() => setManualPaymentCardUrl("")} type="button" aria-label="关闭订单卡片">
              <X size={18} />
            </button>
            <div className="draw-card-payment-card-copy">
              <h3>第一步：保存订单卡片</h3>
              <p className="draw-card-contact-note">请长按下面这张图保存到相册。保存后回到上一步，再点“复制客服微信”。</p>
            </div>
            <img alt="人工订单卡片" className="draw-card-payment-card-image" src={manualPaymentCardUrl} />
          </section>
        </div>
      ) : null}
    </main>
  );
}

function createStyleDraft(style) {
  return {
    tags: style?.tags?.join("，") || "",
    subjectType: style?.subjectType || "both",
    drawCardEnabled: style?.drawCardEnabled !== false,
    drawCardWeight: Number(style?.drawCardWeight ?? DEFAULT_DRAW_CARD_WEIGHT),
    prompt: style?.prompt || "",
    useStyleImageAsReference: Boolean(style?.useStyleImageAsReference)
  };
}

function GalleryPage({ onCreateStyle, onDeleteStyle, onGenerate, onReorderStyles, onStyleChange, onUploadImage, onViewPrompt, styles }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const { visibleItems, canLoadMore, sentinelRef, loadMore } = useProgressiveItems(styles, {
    initialCount: GALLERY_INITIAL_BATCH,
    step: GALLERY_BATCH_STEP
  });
  const orderById = useMemo(
    () => Object.fromEntries(styles.map((style, index) => [style.id, index + 1])),
    [styles]
  );
  const activeEditingStyle = useMemo(
    () => styles.find((style) => style.id === editingId) || null,
    [editingId, styles]
  );
  const activeDraft = activeEditingStyle ? drafts[activeEditingStyle.id] || createStyleDraft(activeEditingStyle) : null;

  useEffect(() => {
    setDrafts(Object.fromEntries(styles.map((style) => [style.id, createStyleDraft(style)])));
    if (editingId && !styles.some((style) => style.id === editingId)) {
      setEditingId("");
    }
    if (confirmDeleteId && !styles.some((style) => style.id === confirmDeleteId)) {
      setConfirmDeleteId("");
    }
  }, [confirmDeleteId, editingId, styles]);

  async function handleCreateStyle() {
    const created = await onCreateStyle();
    if (!created?.id) return;
    setEditingId(created.id);
    setDrafts((current) => ({
      ...current,
      [created.id]: createStyleDraft(created)
    }));
  }

  function updateDraft(style, patch) {
    setDrafts((current) => ({
      ...current,
      [style.id]: { ...(current[style.id] || createStyleDraft(style)), ...patch }
    }));
  }

  async function saveStyle(style) {
    setSavingId(style.id);
    try {
      await onStyleChange(style.id, drafts[style.id] || createStyleDraft(style));
    } finally {
      setSavingId("");
    }
  }

  async function handleFile(style, file) {
    if (!file) return;
    setSavingId(style.id);
    try {
      await onUploadImage(style.id, file);
    } finally {
      setSavingId("");
    }
  }

  async function handleDelete(style) {
    if (confirmDeleteId !== style.id) {
      setConfirmDeleteId(style.id);
      return;
    }
    setConfirmDeleteId("");
    if (editingId === style.id) setEditingId("");
    await onDeleteStyle(style.id);
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
    <>
      <section className="gallery-page" aria-label="风格提示词图库">
        <div className="gallery-toolbar">
          <button className="add-button" onClick={handleCreateStyle} type="button">
            <Plus size={18} />
            <span>新增风格</span>
          </button>
          <p className="storage-note">直接拖拽卡片左上角手柄可以排序，点击“编辑”会弹出窗口修改风格内容。</p>
        </div>
        <div className="gallery-grid" aria-label="风格提示词列表">
          {visibleItems.map((style) => {
            const isEditing = editingId === style.id;
            return (
              <article
                className={`style-card gallery-style-card ${draggingId === style.id ? "is-dragging" : ""}`}
                key={style.id}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropStyle(style.id)}
              >
                <div className="gallery-card-head">
                  <div
                    aria-label="拖拽排序"
                    className="gallery-drag-handle"
                    draggable
                    onDragEnd={() => setDraggingId("")}
                    onDragStart={() => setDraggingId(style.id)}
                  >
                    <GripVertical size={16} />
                    <span>#{orderById[style.id] || 0}</span>
                  </div>
                </div>
                <div className="image-frame">
                  <StylePreviewImage alt={`${style.tags.join("、")}示例图`} style={style} />
                </div>
                <div className="tag-row">
                  {style.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="card-actions gallery-actions">
                  <button
                    aria-expanded={isEditing}
                    className="copy-button"
                    onClick={() => setEditingId(style.id)}
                    type="button"
                  >
                    <Pencil size={18} />
                    <span>编辑</span>
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
            );
          })}
          {canLoadMore ? <button className="progressive-loader" onClick={loadMore} ref={sentinelRef} type="button">Load more styles</button> : null}
        </div>
      </section>

      {activeEditingStyle && activeDraft ? (
        <div className="modal-backdrop" onClick={() => setEditingId("")} role="presentation">
          <section
            aria-modal="true"
            className="prompt-modal style-editor-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="modal-head">
              <div className="tag-row">
                {activeEditingStyle.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="style-editor-preview">
              <div className="image-frame">
                <StylePreviewImage alt={`${activeEditingStyle.tags.join("、")}示例图`} style={activeEditingStyle} />
              </div>
              <p className="storage-note">图片保存在 public/style-previews/{activeEditingStyle.id}/cover.*，标签、适用主体、抽卡开关、抽卡权重和提示词保存在 data/styles.json。</p>
            </div>
            <div className="manage-body style-editor-fields">
              <label className="field-label">
                标签
                <input
                  onChange={(event) => updateDraft(activeEditingStyle, { tags: event.target.value })}
                  placeholder="例如：人像，宠物，动漫"
                  value={activeDraft.tags}
                />
              </label>
              <label className="field-label">
                适用主体
                <select onChange={(event) => updateDraft(activeEditingStyle, { subjectType: event.target.value })} value={activeDraft.subjectType || "both"}>
                  {STYLE_SUBJECT_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field-label checkbox-field">
                <span>参与抽卡</span>
                <div className="toggle-field">
                  <input
                    checked={Boolean(activeDraft.drawCardEnabled)}
                    onChange={(event) => updateDraft(activeEditingStyle, { drawCardEnabled: event.target.checked })}
                    type="checkbox"
                  />
                  <span>{activeDraft.drawCardEnabled ? "参与" : "不参与"}</span>
                </div>
              </label>
              <label className="field-label">
                抽卡权重
                <input
                  min="0"
                  onChange={(event) => updateDraft(activeEditingStyle, { drawCardWeight: event.target.value })}
                  placeholder="100"
                  type="number"
                  value={activeDraft.drawCardWeight}
                />
              </label>
              <label className="field-label style-editor-prompt">
                提示词
                <textarea onChange={(event) => updateDraft(activeEditingStyle, { prompt: event.target.value })} value={activeDraft.prompt} />
              </label>
              <label className="field-label checkbox-field style-editor-reference">
                <span>是否将示例图作为生图参考图</span>
                <div className="toggle-field">
                  <input
                    checked={Boolean(activeDraft.useStyleImageAsReference)}
                    onChange={(event) => updateDraft(activeEditingStyle, { useStyleImageAsReference: event.target.checked })}
                    type="checkbox"
                  />
                  <span>{activeDraft.useStyleImageAsReference ? "是" : "否"}</span>
                </div>
              </label>
            </div>
            <div className="card-actions manage-actions style-editor-actions">
              <button className="secondary-button" onClick={() => setEditingId("")} type="button">
                关闭
              </button>
              <label className="secondary-button file-button">
                <ImageUp size={18} />
                <span>替换图片</span>
                <input accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => handleFile(activeEditingStyle, event.target.files?.[0])} type="file" />
              </label>
              <button className="copy-button" disabled={savingId === activeEditingStyle.id} onClick={() => saveStyle(activeEditingStyle)} type="button">
                <Save size={18} />
                <span>{savingId === activeEditingStyle.id ? "保存中" : "保存"}</span>
              </button>
              <button className="danger-button" onClick={() => handleDelete(activeEditingStyle)} type="button">
                <Trash2 size={18} />
                <span>{confirmDeleteId === activeEditingStyle.id ? "确认删除" : "删除"}</span>
              </button>
            </div>
            {confirmDeleteId === activeEditingStyle.id ? <p className="storage-note danger-note">再次点击“确认删除”才会真正删除这个风格。</p> : null}
          </section>
        </div>
      ) : null}
    </>
  );
}

function useProgressiveItems(items, { initialCount, step }) {
  const [visibleCount, setVisibleCount] = useState(() => Math.min(initialCount, items.length));
  const sentinelRef = useRef(null);
  const canLoadMore = visibleCount < items.length;
  const loadMore = () => setVisibleCount((current) => Math.min(current + step, items.length));

  useEffect(() => {
    setVisibleCount(Math.min(initialCount, items.length));
  }, [items, initialCount]);

  useEffect(() => {
    if (!canLoadMore || !sentinelRef.current || typeof window === "undefined" || !("IntersectionObserver" in window)) {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        loadMore();
      },
      { rootMargin: "320px 0px" }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [canLoadMore, items.length, step]);

  return {
    visibleItems: items.slice(0, visibleCount),
    canLoadMore,
    sentinelRef,
    loadMore
  };
}

function StylePreviewImage({ alt, className = "", preferOriginal = false, style }) {
  const candidates = (preferOriginal
    ? [style?.image, style?.galleryImage]
    : [style?.galleryImage, style?.image]
  )
    .map((item) => cacheBust(item, style?.imageUpdatedAt))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [preferOriginal, style?.galleryImage, style?.id, style?.image, style?.imageUpdatedAt]);

  const src = candidates[candidateIndex] || "";

  return (
    <img
      alt={alt}
      className={className}
      decoding="async"
      loading="lazy"
      onError={() => setCandidateIndex((current) => (current + 1 < candidates.length ? current + 1 : current))}
      src={src}
    />
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
        const response = await fetch(cacheBust(style.image, style.imageUpdatedAt));
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
  const prepareStartedAt = performance.now();

  try {
    const bitmap = await createImageBitmap(file);
    const originalWidth = Number(bitmap.width || 0) || null;
    const originalHeight = Number(bitmap.height || 0) || null;
    const longestSide = Math.max(bitmap.width, bitmap.height);
    const scale = Math.min(1, REFERENCE_UPLOAD_LIMITS.maxDimension / longestSide);
    const shouldCompress = file.size > REFERENCE_UPLOAD_LIMITS.maxBytes || scale < 1;

    if (!shouldCompress) {
      bitmap.close?.();
      return {
        ...reference,
        telemetry: {
          prepareReferenceMs: Math.max(0, Math.round(performance.now() - prepareStartedAt)),
          originalBytes: Number(file.size || 0),
          uploadedBytes: Number(file.size || 0),
          originalWidth,
          originalHeight,
          uploadedWidth: originalWidth,
          uploadedHeight: originalHeight,
          wasCompressed: false
        }
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) {
      bitmap.close?.();
      return reference;
    }
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", REFERENCE_UPLOAD_LIMITS.jpegQuality));
    if (!blob || blob.size >= file.size) {
      return {
        ...reference,
        telemetry: {
          prepareReferenceMs: Math.max(0, Math.round(performance.now() - prepareStartedAt)),
          originalBytes: Number(file.size || 0),
          uploadedBytes: Number(file.size || 0),
          originalWidth,
          originalHeight,
          uploadedWidth: originalWidth,
          uploadedHeight: originalHeight,
          wasCompressed: false
        }
      };
    }

    const compressedName = `${file.name.replace(/\.[^.]+$/, "") || "reference"}-compressed.jpg`;
    return {
      ...reference,
      file: new File([blob], compressedName, {
        type: "image/jpeg",
        lastModified: file.lastModified
      }),
      telemetry: {
        prepareReferenceMs: Math.max(0, Math.round(performance.now() - prepareStartedAt)),
        originalBytes: Number(file.size || 0),
        uploadedBytes: Number(blob.size || 0),
        originalWidth,
        originalHeight,
        uploadedWidth: canvas.width,
        uploadedHeight: canvas.height,
        wasCompressed: true
      }
    };
  } catch {
    return reference;
  }
}

function ImageJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [jobTotal, setJobTotal] = useState(0);
  const [jobQuery, setJobQuery] = useState(DEFAULT_IMAGE_JOB_QUERY);
  const [searchInput, setSearchInput] = useState(DEFAULT_IMAGE_JOB_QUERY.search);
  const [dateInput, setDateInput] = useState(DEFAULT_IMAGE_JOB_QUERY.date);
  const [likedOnlyInput, setLikedOnlyInput] = useState(DEFAULT_IMAGE_JOB_QUERY.likedOnly);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingJob, setEditingJob] = useState(null);
  const [updatingClipJobId, setUpdatingClipJobId] = useState("");
  const queryRef = useRef(DEFAULT_IMAGE_JOB_QUERY);

  function syncQueryState(requestQuery, payload) {
    const nextQuery = {
      ...requestQuery,
      page: Number(payload?.page || requestQuery.page || DEFAULT_IMAGE_JOB_QUERY.page),
      limit: Number(payload?.limit || requestQuery.limit || DEFAULT_IMAGE_JOB_QUERY.limit)
    };
    queryRef.current = nextQuery;
    setJobQuery((current) => (areImageJobQueriesEqual(current, nextQuery) ? current : nextQuery));
  }

  async function loadDashboard(nextQuery = queryRef.current, options = {}) {
    const showLoading = options.showLoading !== false;
    if (showLoading) {
      setIsLoading(true);
    }
    try {
      const jobPayload = await refreshImageJobs(nextQuery);
      syncQueryState(nextQuery, jobPayload);
      setJobs(jobPayload.jobs || []);
      setJobTotal(Number(jobPayload.total || 0));
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsLoading(false);
    }
  }

  async function applyJobQuery(patch, options = {}) {
    const nextQuery = { ...queryRef.current, ...patch };
    queryRef.current = nextQuery;
    setJobQuery(nextQuery);
    await loadDashboard(nextQuery, options);
  }

  async function cancelJob(jobId) {
    try {
      await updateImageJob(jobId, "cancel");
      await loadDashboard(queryRef.current, { showLoading: false });
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function deleteJob(jobId) {
    try {
      await deleteImageJob(jobId);
      await loadDashboard(queryRef.current, { showLoading: false });
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function toggleClip(job) {
    if (!job?.jobId) return;

    setUpdatingClipJobId(job.jobId);
    try {
      const nextJob = job.isLiked ? await unlikeImageJob(job.jobId) : await likeImageJob(job.jobId);
      if (queryRef.current.likedOnly && job.isLiked) {
        await loadDashboard(queryRef.current, { showLoading: false });
      } else {
        setJobs((current) => current.map((item) => (item.jobId === job.jobId ? nextJob : item)));
      }
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setUpdatingClipJobId("");
    }
  }

  useEffect(() => {
    let isActive = true;
    async function loadActiveJobs(showLoading = false) {
      if (showLoading) {
        setIsLoading(true);
      }
      try {
        const currentQuery = queryRef.current;
        const jobPayload = await refreshImageJobs(currentQuery);
        if (!isActive) return;
        syncQueryState(currentQuery, jobPayload);
        setJobs(jobPayload.jobs || []);
        setJobTotal(Number(jobPayload.total || 0));
        setError("");
      } catch (nextError) {
        if (!isActive) return;
        setError(nextError.message);
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    loadActiveJobs(true);
    const timer = window.setInterval(() => loadActiveJobs(false), 2000);
    return () => {
      isActive = false;
      window.clearInterval(timer);
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(jobTotal / Math.max(jobQuery.limit, 1)));
  const activeCount = jobs.filter((job) => job.status === "queued" || job.status === "running").length;
  const completedCount = jobs.filter((job) => job.status === "succeeded").length;

  function handleSearchSubmit(event) {
    event.preventDefault();
    applyJobQuery({
      page: 1,
      search: searchInput.trim(),
      date: dateInput,
      likedOnly: likedOnlyInput
    });
  }

  function handleResetFilters() {
    setSearchInput(DEFAULT_IMAGE_JOB_QUERY.search);
    setDateInput(DEFAULT_IMAGE_JOB_QUERY.date);
    setLikedOnlyInput(DEFAULT_IMAGE_JOB_QUERY.likedOnly);
    applyJobQuery(DEFAULT_IMAGE_JOB_QUERY);
  }

  function handleStatusFilter(status) {
    applyJobQuery({ status, page: 1 });
  }

  function changePage(nextPage) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === jobQuery.page) return;
    applyJobQuery({ page: nextPage });
  }

  return (
    <section className="task-page" aria-label="AI 生图任务记录">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">Image jobs</p>
          <h2>任务记录</h2>
          <p className="storage-note">
            共 {jobTotal} 条符合条件，当前第 {jobQuery.page} / {totalPages} 页，当前页 {jobs.length} 条，其中 {activeCount} 个进行中，{completedCount} 个已完成
          </p>
        </div>
        <button className="secondary-button" onClick={() => loadDashboard(queryRef.current)} type="button">
          <RefreshCw size={18} />
          <span>{isLoading ? "刷新中" : "刷新"}</span>
        </button>
      </div>

      <form className="task-query-form" onSubmit={handleSearchSubmit}>
        <div className="task-query-fields">
          <label className="field-label task-query-field">
            关键词
            <input
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="搜索任务 ID、提示词、风格名、风格组名"
              value={searchInput}
            />
          </label>
          <label className="field-label task-query-field">
            日期
            <input onChange={(event) => setDateInput(event.target.value)} type="date" value={dateInput} />
          </label>
          <label className="toggle-field task-query-toggle">
            <input checked={likedOnlyInput} onChange={(event) => setLikedOnlyInput(event.target.checked)} type="checkbox" />
            <span>仅看卡夹</span>
          </label>
        </div>
        <div className="task-query-actions">
          <button className="copy-button" type="submit">
            <Search size={18} />
            <span>查询</span>
          </button>
          <button className="secondary-button" onClick={handleResetFilters} type="button">
            <RefreshCw size={18} />
            <span>重置</span>
          </button>
        </div>
      </form>

      <div className="task-filters" role="tablist" aria-label="任务状态筛选">
        {["all", "queued", "running", "partial", "succeeded", "failed", "cancelled"].map((status) => (
          <button className={jobQuery.status === status ? "active" : ""} key={status} onClick={() => handleStatusFilter(status)} type="button">
            {statusLabel(status)}
          </button>
        ))}
      </div>

      {error && <p className="error-note">{error}</p>}
      {!isLoading && !jobs.length && <p className="empty-note">还没有符合条件的生图任务。</p>}

      <div className="task-list">
        {jobs.map((job) => {
          const imageSource = job.result?.previewUrl || job.result?.thumbnailUrl || job.result?.imageDataUrl || job.result?.imageUrl;
          return (
            <article className={`task-card ${job.isLiked ? "is-liked" : ""}`} key={job.jobId}>
              <div className={`task-status ${job.status}`}>{statusLabel(job.status)}</div>
              <div className="task-preview">
                {imageSource ? <img alt="AI 生成结果" src={imageSource} /> : <Sparkles size={24} />}
              </div>
              <div className="task-detail">
                <div className="task-meta-row">
                  <strong>{shortJobId(job.jobId)}</strong>
                  {job.isLiked ? <span className="task-like-badge">已加入卡夹</span> : null}
                  <span className="experience-badge">{publicExperienceLabel(job.experienceType)}</span>
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
                <button className="secondary-button" disabled={!job.result?.imageUrl} onClick={() => openAdminJobResult(job.jobId)} type="button">
                  <Eye size={18} />
                  <span>查看</span>
                </button>
                <button className="secondary-button" disabled={!job.result?.imageUrl} onClick={() => downloadAdminJobResult(job.jobId)} type="button">
                  <Download size={18} />
                  <span>下载</span>
                </button>
                <button className={job.isLiked ? "secondary-button" : "copy-button"} disabled={updatingClipJobId === job.jobId} onClick={() => toggleClip(job)} type="button">
                  {updatingClipJobId === job.jobId ? <LoaderCircle className="spin" size={18} /> : job.isLiked ? <X size={18} /> : <Sparkles size={18} />}
                  <span>{updatingClipJobId === job.jobId ? "处理中" : job.isLiked ? "移出卡夹" : "加入卡夹"}</span>
                </button>
                <button className="copy-button" onClick={() => setEditingJob(job)} type="button">
                  <Pencil size={18} />
                  <span>修改</span>
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
      <div className="task-pagination">
        <p className="storage-note">
          共 {jobTotal} 条，当前第 {jobQuery.page} / {totalPages} 页
        </p>
        <div className="task-pagination-actions">
          <button className="secondary-button" disabled={jobQuery.page <= 1} onClick={() => changePage(jobQuery.page - 1)} type="button">
            <ArrowUp size={18} />
            <span>上一页</span>
          </button>
          <button className="secondary-button" disabled={jobQuery.page >= totalPages || !jobTotal} onClick={() => changePage(jobQuery.page + 1)} type="button">
            <ArrowDown size={18} />
            <span>下一页</span>
          </button>
        </div>
      </div>
      {editingJob && <JobEditModal job={editingJob} onClose={() => setEditingJob(null)} />}
    </section>
  );
}

function BatchGeneratePage({ groups, onCreateGroup, onDeleteGroup, onUpdateGroup, styles }) {
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [selectedStyleIds, setSelectedStyleIds] = useState([]);
  const [promptOverride, setPromptOverride] = useState("");
  const [groupSize, setGroupSize] = useState(DEFAULT_GENERATION_SIZE);
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
    setGroupSize(group?.size || DEFAULT_GENERATION_SIZE);
    setSize(group?.size || DEFAULT_GENERATION_SIZE);
    setStatusMessage("");
    setError("");
  }

  function resetGroupEditor() {
    setSelectedGroupId("");
    setGroupName("");
    setSelectedStyleIds([]);
    setGroupSize(DEFAULT_GENERATION_SIZE);
    setSize(DEFAULT_GENERATION_SIZE);
    setStatusMessage("");
    setError("");
  }

  useEffect(() => {
    if (!selectedGroup) return;
    setSize(selectedGroup.size || DEFAULT_GENERATION_SIZE);
  }, [selectedGroup]);

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
    const payload = { name: groupName.trim(), styleIds: selectedStyleIds, size: groupSize };
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
          <label className="field-label">
            默认比例
            <select onChange={(event) => setGroupSize(event.target.value)} value={groupSize}>
              {GENERATION_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
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
                    <img alt={style.tags.join("、")} decoding="async" loading="lazy" src={cacheBust(style.galleryImage || style.image, style.imageUpdatedAt)} />
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
                    <p className="storage-note">比例：{getSizeLabel(group.size)}</p>
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
                  已选风格组：{selectedGroup?.name || "未选择"}，共 {selectedStyles.length} 个风格，比例 {getSizeLabel(size)}
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
              <select disabled value={size}>
                {GENERATION_SIZE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="storage-note">批量提交会自动使用当前风格组设置的比例。</span>
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

function JobEditModal({ job, onClose }) {
  const [prompt, setPrompt] = useState(job.prompt || "");
  const [size, setSize] = useState(job.size || DEFAULT_GENERATION_SIZE);
  const [providers, setProviders] = useState([]);
  const [selectedProvider, setSelectedProvider] = useState(job.provider?.id || "");
  const [references, setReferences] = useState([]);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    refreshImageProviders()
      .then((payload) => {
        setProviders(payload.providers || []);
        setSelectedProvider(job.provider?.id || payload.defaultProvider || payload.providers?.[0]?.id || "");
      })
      .catch(() => {
        setProviders([]);
      });
  }, [job.provider?.id]);

  useEffect(() => {
    let isActive = true;

    async function preloadJobReferences() {
      const originals = Array.isArray(job.originalReferences) ? [...job.originalReferences].sort((a, b) => Number(a.order || 0) - Number(b.order || 0)) : [];
      if (!originals.length) return;

      try {
        const loaded = await Promise.all(
          originals.map(async (reference, index) => {
            const response = await fetch(`/api/admin/image-jobs/${job.jobId}/references/${index}`);
            if (!response.ok) throw new Error("Failed to fetch original reference");
            const blob = await response.blob();
            const mimeType = normalizeReferenceMimeType(blob.type || reference.mimeType, reference.url || "");
            return {
              id: `original-reference-${job.jobId}-${index}`,
              file: new File([blob], reference.name || `reference-${index + 1}.${extensionFromMimeType(mimeType)}`, {
                type: mimeType || reference.mimeType || "image/jpeg",
                lastModified: Date.now()
              }),
              order: index,
              previewUrl: URL.createObjectURL(blob),
              source: "original"
            };
          })
        );

        if (!isActive) return;
        setReferences(loaded);
      } catch {
        if (!isActive) return;
        setError("原始参考图加载失败，请手动重新上传。");
      }
    }

    preloadJobReferences();
    return () => {
      isActive = false;
    };
  }, [job.jobId, job.originalReferences]);

  useEffect(() => {
    return () => {
      references.forEach((reference) => {
        if (reference.previewUrl) URL.revokeObjectURL(reference.previewUrl);
      });
    };
  }, [references]);

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
          previewUrl: URL.createObjectURL(file),
          source: "new"
        }))
      ];
    });
  }

  function changeReferenceOrder(referenceId, nextOrder) {
    setReferences((current) => {
      const moved = current.find((reference) => reference.id === referenceId);
      const swapped = current.find((reference) => reference.order === nextOrder);
      if (!moved || moved.order === nextOrder) return current;

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
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current
        .filter((reference) => reference.id !== referenceId)
        .sort((a, b) => a.order - b.order)
        .map((reference, index) => ({ ...reference, order: index }));
    });
  }

  async function resubmitJob() {
    if (!prompt.trim()) {
      setError("请先填写提示词。");
      return;
    }
    if (!selectedProvider) {
      setError("请先选择接口供应商。");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setStatusMessage("");

    try {
      const preparedReferences = await Promise.all(getOrderedReferences(references).map(prepareReferenceForUpload));
      const formData = new FormData();
      formData.append("prompt", prompt);
      formData.append("size", size);
      formData.append("provider", selectedProvider);
      if (job.styleId) formData.append("styleId", job.styleId);
      if (job.styleName) formData.append("styleName", job.styleName);
      if (job.styleGroupId) formData.append("styleGroupId", job.styleGroupId);
      if (job.styleGroupName) formData.append("styleGroupName", job.styleGroupName);
      Object.entries(GENERATION_DEFAULTS).forEach(([key, value]) => formData.append(key, value));
      preparedReferences.forEach((reference) => formData.append("reference", reference.file));

      const response = await fetch("/api/image-jobs", {
        method: "POST",
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || "重新提交任务失败。");
      setStatusMessage("修改后的任务已重新提交。");
    } catch (nextError) {
      setError(nextError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <section className="prompt-modal generator-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Edit job</p>
            <h2>修改任务</h2>
            <p className="storage-note">基于原任务的提示词、比例和参考图修改后重新提交。</p>
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

        {references.length > 0 && (
          <div className="reference-list">
            <p className="storage-note">可直接删除、补充或调整原始参考图顺序。</p>
            {getOrderedReferences(references).map((reference) => (
              <article className="reference-item" key={reference.id}>
                <img alt={`${imageLabel(reference.order)}预览`} src={reference.previewUrl} />
                <div className="reference-meta">
                  <strong>{reference.file.name}</strong>
                  <span>{reference.source === "original" ? "原任务参考图" : formatFileSize(reference.file.size)}</span>
                </div>
                <label className="reference-order">
                  <span>编号</span>
                  <select onChange={(event) => changeReferenceOrder(reference.id, Number(event.target.value))} value={reference.order}>
                    {references.map((_, index) => (
                      <option key={index} value={index}>
                        {imageLabel(index)}
                      </option>
                    ))}
                  </select>
                </label>
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
          <button className="copy-button" disabled={isSubmitting || !prompt.trim()} onClick={resubmitJob} type="button">
            {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            <span>{isSubmitting ? "提交中" : "重新提交"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

async function refreshStyles() {
  const response = await fetch("/api/styles");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取风格失败。");
  return Array.isArray(payload) ? payload : [];
}

async function refreshStyleGroups() {
  const response = await fetch("/api/style-groups");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取风格组失败。");
  return Array.isArray(payload) ? payload : [];
}

async function refreshImageProviders() {
  const response = await fetch("/api/image-providers");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取图片供应商失败。");
  return payload;
}

async function refreshAdminApiProviders() {
  const response = await fetch("/api/admin/api-providers");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取 API 供应商配置失败。");
  return payload;
}

async function createAdminApiProviderRequest(payload) {
  const response = await fetch("/api/admin/api-providers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "保存 API 供应商失败。");
  return data;
}

async function updateAdminApiProviderRequest(providerId, payload) {
  const response = await fetch(`/api/admin/api-providers/${encodeURIComponent(providerId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "更新 API 供应商失败。");
  return data;
}

async function deleteAdminApiProviderRequest(providerId) {
  const response = await fetch(`/api/admin/api-providers/${encodeURIComponent(providerId)}`, {
    method: "DELETE"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "删除 API 供应商失败。");
  return data;
}

async function fetchVisitorState() {
  const response = await fetch("/api/visitor-state");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取访客状态失败。");
  return payload;
}

async function claimMerchantSource(payload) {
  const response = await fetch("/api/public/merchant-source/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "锁定商户来源失败。");
  return data;
}

async function fetchOrderConfig() {
  const response = await fetch("/api/orders/config");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取下单配置失败。");
  return payload;
}

async function createOrderRequest(payload) {
  const response = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "创建订单失败。");
  return data;
}

async function payOrderRequest(orderId, payload) {
  const response = await fetch(`/api/orders/${orderId}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "发起支付失败。");
  return data;
}

async function fetchOrderDetail(orderId, token = "") {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const response = await fetch(`/api/orders/${orderId}${query}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "读取订单失败。");
  return data;
}

async function fetchMyOrders() {
  const response = await fetch("/api/my/orders");
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "读取订单列表失败。");
  return data;
}

async function deleteMyOrder(orderId, token = "") {
  const query = token ? `?token=${encodeURIComponent(token)}` : "";
  const response = await fetch(`/api/orders/${orderId}${query}`, {
    method: "DELETE"
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "取消订单失败。");
  return data.order;
}

async function redeemInviteCode(code) {
  const response = await fetch("/api/invite-codes/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "邀请码兑换失败。");
  return payload;
}

async function fetchPublicClipItems(experienceType = "") {
  const query = experienceType ? `?experience=${encodeURIComponent(experienceType)}` : "";
  const response = await fetch(`/api/public/clip-items${query}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取卡夹失败。");
  return payload;
}

async function fetchAdminSession() {
  const response = await fetch("/api/admin/session");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取后台登录状态失败。");
  return payload;
}

async function adminLogin(username, password) {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "登录失败。");
  return payload;
}

async function adminLogout() {
  const response = await fetch("/api/admin/logout", { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "退出登录失败。");
  return payload;
}

async function refreshInviteCodes() {
  const response = await fetch("/api/admin/invite-codes");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取邀请码失败。");
  return payload.inviteCodes || [];
}

async function createInviteCodesRequest(payload) {
  const response = await fetch("/api/admin/invite-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "创建邀请码失败。");
  return data;
}

async function updateInviteCodeRequest(id, payload) {
  const response = await fetch(`/api/admin/invite-codes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "更新邀请码失败。");
  return data;
}

async function refreshVisitors() {
  const response = await fetch("/api/admin/visitors");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取访客额度失败。");
  return payload.visitors || [];
}

async function refreshVisitorRecords() {
  const response = await fetch("/api/admin/visitor-records");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取访问记录失败。");
  return payload.records || [];
}

async function reportVisitSessionEvent(payload) {
  const response = await fetch("/api/visit-sessions/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "记录访问状态失败。");
  return data;
}

function sendVisitSessionLeaveEvent(payload) {
  const body = JSON.stringify(payload);
  if (navigator.sendBeacon) {
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/visit-sessions/report", blob)) return;
    } catch {}
  }
  fetch("/api/visit-sessions/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true
  }).catch(() => {});
}

async function refreshAdminMerchants(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/admin/merchants${suffix}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取商户列表失败。");
  return payload;
}

async function createAdminMerchant(payload) {
  const response = await fetch("/api/admin/merchants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "创建商户失败。");
  return data.merchant;
}

async function updateAdminMerchant(merchantId, payload) {
  const response = await fetch(`/api/admin/merchants/${merchantId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "更新商户失败。");
  return data.merchant;
}

async function deleteAdminMerchant(merchantId) {
  const response = await fetch(`/api/admin/merchants/${merchantId}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(data?.message || "删除商户失败。");
  }
}

async function refreshAdminOrders(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/admin/orders${suffix}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取订单列表失败。");
  return payload;
}

async function fetchAdminOrder(orderId) {
  const response = await fetch(`/api/admin/orders/${orderId}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取订单详情失败。");
  return payload.order;
}

async function updateAdminOrder(orderId, payload) {
  const response = await fetch(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "更新订单失败。");
  return data.order;
}

function parseDownloadFilename(contentDisposition, fallback = "order-originals.zip") {
  const value = String(contentDisposition || "");
  const encodedMatch = value.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {}
  }
  const quotedMatch = value.match(/filename=\"([^\"]+)\"/i);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const plainMatch = value.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) return plainMatch[1].trim();
  return fallback;
}

async function downloadAdminOrderOriginals(orderId) {
  const response = await fetch(`/api/admin/orders/${orderId}/download-originals`, {
    method: "POST"
  });
  const contentType = String(response.headers.get("content-type") || "");
  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.message || "下载原图失败。");
    }
    const text = await response.text().catch(() => "");
    throw new Error(text || "下载原图失败。");
  }

  const filename = parseDownloadFilename(response.headers.get("content-disposition"), `order-${orderId}.zip`);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

  return {
    filename,
    sizeBytes: blob.size
  };
}

async function downloadAdminOrdersExport(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/admin/orders/export${suffix}`);
  const contentType = String(response.headers.get("content-type") || "");
  if (!response.ok) {
    if (contentType.includes("application/json")) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.message || "导出订单明细失败。");
    }
    const text = await response.text().catch(() => "");
    throw new Error(text || "导出订单明细失败。");
  }

  const filename = parseDownloadFilename(response.headers.get("content-disposition"), "orders.csv");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);

  return {
    filename,
    sizeBytes: blob.size
  };
}

async function refreshAdminSettings() {
  const response = await fetch("/api/admin/settings");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取系统设置失败。");
  return payload.settings;
}

async function updateAdminSettings(payload) {
  const response = await fetch("/api/admin/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "更新系统设置失败。");
  return data.settings;
}

async function refreshStorageSummary() {
  const response = await fetch("/api/admin/storage");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取存储概览失败。");
  return payload;
}

async function createStorageBackupRequest() {
  const response = await fetch("/api/admin/storage/backups", {
    method: "POST"
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "创建备份失败。");
  return payload.backup;
}

async function createImageRangeBackupRequest(payload) {
  const response = await fetch("/api/admin/storage/image-backups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "创建图片备份失败。");
  return data.backup;
}

async function deleteStorageBackupRequest(backupId) {
  const response = await fetch(`/api/admin/storage/backups/${backupId}`, {
    method: "DELETE"
  });
  if (!response.ok) {
    const payload = await response.json();
    throw new Error(payload.message || "删除备份失败。");
  }
}

function downloadStorageBackup(backupId) {
  window.open(`/api/admin/storage/backups/${backupId}/download`, "_blank", "noopener,noreferrer");
}

async function cleanupStorageHistoryRequest(payload) {
  const response = await fetch("/api/admin/storage/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "清理历史数据失败。");
  return data;
}

async function fetchImageJob(jobId) {
  const response = await fetch(`/api/image-jobs/${jobId}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取生图任务失败。");
  return payload;
}

async function refreshImageJobs(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;
    if (typeof value === "boolean") {
      query.set(key, value ? "true" : "false");
      return;
    }
    query.set(key, String(value));
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await fetch(`/api/image-jobs${suffix}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取生图任务列表失败。");
  return payload;
}

function AdminLoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");
    try {
      await onLogin(username, password);
    } catch (nextError) {
      setError(nextError.message || "登录失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <form className="prompt-modal generator-modal" onSubmit={handleSubmit}>
          <div className="modal-head">
            <div>
              <p className="eyebrow">Admin</p>
              <h2>后台登录</h2>
            </div>
          </div>
          <label className="field-label">
            用户名
            <input onChange={(event) => setUsername(event.target.value)} type="text" value={username} />
          </label>
          <label className="field-label">
            密码
            <input onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
          </label>
          {error ? <p className="error-note">{error}</p> : null}
          <div className="card-actions generator-actions">
            <button className="copy-button" disabled={isSubmitting || !username.trim() || !password} type="submit">
              {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Settings size={18} />}
              <span>{isSubmitting ? "登录中" : "登录"}</span>
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}

function InviteAdminPage({ inviteCodes, visitorRecords, settings, onRefreshInviteCodes, onRefreshVisitorRecords, onRefreshSettings }) {
  const [count, setCount] = useState(5);
  const [prefix, setPrefix] = useState("");
  const [anonymousQuotaLimit, setAnonymousQuotaLimit] = useState(settings?.anonymousQuotaLimit || 5);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showUsedInviteCodes, setShowUsedInviteCodes] = useState(false);
  const availableInviteCodes = useMemo(
    () => inviteCodes.filter((inviteCode) => Number(inviteCode.remainingRedemptions || 0) > 0),
    [inviteCodes]
  );
  const usedInviteCodes = useMemo(
    () => inviteCodes.filter((inviteCode) => Number(inviteCode.remainingRedemptions || 0) <= 0),
    [inviteCodes]
  );

  useEffect(() => {
    setAnonymousQuotaLimit(settings?.anonymousQuotaLimit || 5);
  }, [settings]);

  async function createCodes() {
    setIsSubmitting(true);
    setError("");
    try {
      await createInviteCodesRequest({ count, prefix });
      await onRefreshInviteCodes();
      setPrefix("");
    } catch (nextError) {
      setError(nextError.message || "创建邀请码失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function saveSettings() {
    setIsSubmitting(true);
    setError("");
    try {
      await updateAdminSettings({ anonymousQuotaLimit });
      await onRefreshSettings();
    } catch (nextError) {
      setError(nextError.message || "更新系统设置失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleInvite(inviteCode) {
    setError("");
    try {
      await updateInviteCodeRequest(inviteCode.id, { enabled: !inviteCode.enabled });
      await onRefreshInviteCodes();
    } catch (nextError) {
      setError(nextError.message || "更新邀请码失败。");
    }
  }

  return (
    <section className="task-page" aria-label="邀请码与访问记录">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">Invites</p>
          <h2>邀请码与访问记录</h2>
          <p className="storage-note">创建邀请码、设置匿名免费次数，并查看最近访客的来源、停留、生成与下单情况。</p>
        </div>
        <button className="secondary-button" onClick={() => Promise.all([onRefreshInviteCodes(), onRefreshVisitorRecords(), onRefreshSettings()])} type="button">
          <RefreshCw size={18} />
          <span>刷新</span>
        </button>
      </div>

      <div className="draw-card-upload-panel">
        <label className="field-label">
          匿名访客默认免费次数
          <input max="50" min="1" onChange={(event) => setAnonymousQuotaLimit(Number(event.target.value) || 1)} type="number" value={anonymousQuotaLimit} />
        </label>
        <div className="card-actions generator-actions">
          <button className="secondary-button" disabled={isSubmitting} onClick={saveSettings} type="button">
            <Save size={18} />
            <span>保存免费次数设置</span>
          </button>
        </div>
        <label className="field-label">
          一次创建数量
          <input max="20" min="1" onChange={(event) => setCount(Number(event.target.value) || 1)} type="number" value={count} />
        </label>
        <label className="field-label">
          前缀
          <input onChange={(event) => setPrefix(event.target.value.toUpperCase())} placeholder="例如 VIP" type="text" value={prefix} />
        </label>
        <div className="card-actions generator-actions">
          <button className="copy-button" disabled={isSubmitting} onClick={createCodes} type="button">
            {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}
            <span>{isSubmitting ? "创建中" : "创建邀请码"}</span>
          </button>
        </div>
        {error ? <p className="error-note">{error}</p> : null}
      </div>

      <div className="task-list">
        {availableInviteCodes.map((inviteCode) => (
          <article className="task-card" key={inviteCode.id}>
            <div className={`task-status ${inviteCode.enabled ? "succeeded" : "cancelled"}`}>{inviteCode.enabled ? "启用中" : "已停用"}</div>
            <div className="task-detail">
              <div className="task-meta-row">
                <strong>{inviteCode.code}</strong>
                <span>已兑换 {inviteCode.redeemedCount}</span>
                <span>剩余 {inviteCode.remainingRedemptions}</span>
              </div>
              <p className="storage-note">创建于 {formatDateTime(inviteCode.createdAt)}</p>
            </div>
            <div className="task-actions">
              <button className="secondary-button" onClick={() => toggleInvite(inviteCode)} type="button">
                <span>{inviteCode.enabled ? "停用" : "启用"}</span>
              </button>
            </div>
          </article>
        ))}
        {!availableInviteCodes.length ? <p className="empty-note">当前没有可继续兑换的邀请码。</p> : null}
      </div>

      <div className="card-actions generator-actions">
        <button className="secondary-button" onClick={() => setShowUsedInviteCodes((current) => !current)} type="button">
          <Eye size={18} />
          <span>{showUsedInviteCodes ? "隐藏历史已用邀请码" : `查看历史已用邀请码 (${usedInviteCodes.length})`}</span>
        </button>
      </div>

      {showUsedInviteCodes ? (
        <div className="task-list">
          {usedInviteCodes.map((inviteCode) => (
            <article className="task-card" key={`used-${inviteCode.id}`}>
              <div className="task-status failed">已用完</div>
              <div className="task-detail">
                <div className="task-meta-row">
                  <strong>{inviteCode.code}</strong>
                  <span>已兑换 {inviteCode.redeemedCount}</span>
                  <span>剩余 {inviteCode.remainingRedemptions}</span>
                </div>
                <p className="storage-note">更新于 {formatDateTime(inviteCode.updatedAt)}</p>
              </div>
            </article>
          ))}
          {!usedInviteCodes.length ? <p className="empty-note">还没有历史已用邀请码。</p> : null}
        </div>
      ) : null}

      <section className="task-page" aria-label="访问记录列表">
        <div className="task-toolbar">
          <div>
            <p className="eyebrow">Visitor records</p>
            <h2>访问记录</h2>
            <p className="storage-note">按访客聚合展示最近活跃、最近停留、生成次数与累计订单金额。</p>
          </div>
        </div>
        {visitorRecords.length ? (
          <div className="visitor-record-table">
            <div className="visitor-record-head" role="presentation">
              <span>访客</span>
              <span>来源商户</span>
              <span>最近活跃</span>
              <span>最近停留</span>
              <span>生成次数</span>
              <span>订单金额</span>
            </div>
            {visitorRecords.map((record) => (
              <article className="visitor-record-row" key={record.visitorId}>
                <strong className="visitor-record-cell" data-label="访客" title={record.visitorId}>
                  {shortJobId(record.visitorId)}
                </strong>
                <span className="visitor-record-cell" data-label="来源商户" title={record.sourceMerchantName || "无"}>
                  {record.sourceMerchantName || "无"}
                </span>
                <span className="visitor-record-cell" data-label="最近活跃">
                  {formatDateTime(record.lastActiveAt)}
                </span>
                <span className="visitor-record-cell" data-label="最近停留">
                  {formatStayDuration(record.lastVisitDurationSeconds)}
                </span>
                <span className="visitor-record-cell" data-label="生成次数">
                  {Math.max(0, Number(record.generationCount || 0))}
                </span>
                <span className="visitor-record-cell" data-label="订单金额">
                  {formatCurrencyCents(record.orderTotalCents)}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-note">还没有访问记录。</p>
        )}
      </section>
    </section>
  );
}

function ApiProviderAdminPage() {
  const [providers, setProviders] = useState([]);
  const [defaultProviderId, setDefaultProviderId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(() => createEmptyApiProviderFormState());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    refreshAdminApiProviders()
      .then((payload) => {
        if (!isActive) return;
        setProviders(Array.isArray(payload.providers) ? payload.providers : []);
        setDefaultProviderId(String(payload.defaultProviderId || ""));
      })
      .catch((nextError) => {
        if (!isActive) return;
        setError(nextError.message || "读取 API 供应商配置失败。");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!editingId) return;
    const current = providers.find((provider) => provider.id === editingId);
    if (current) {
      setForm(toApiProviderFormState(current));
      return;
    }
    setEditingId("");
    setForm(createEmptyApiProviderFormState());
  }, [editingId, providers]);

  function applyPayload(payload) {
    setProviders(Array.isArray(payload?.providers) ? payload.providers : []);
    setDefaultProviderId(String(payload?.defaultProviderId || ""));
  }

  function startCreate() {
    setEditingId("");
    setForm(createEmptyApiProviderFormState());
    setError("");
    setStatusMessage("");
  }

  function startEdit(provider) {
    setEditingId(provider.id);
    setForm(toApiProviderFormState(provider));
    setError("");
    setStatusMessage("");
  }

  async function saveProvider() {
    setIsSubmitting(true);
    setError("");
    setStatusMessage("");
    try {
      const payload = editingId
        ? await updateAdminApiProviderRequest(editingId, form)
        : await createAdminApiProviderRequest(form);
      applyPayload(payload);
      setEditingId(normalizeApiProviderIdInput(form.id));
      setStatusMessage(editingId ? "API 供应商已更新。" : "API 供应商已创建。");
    } catch (nextError) {
      setError(nextError.message || "保存 API 供应商失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteProvider(provider) {
    const message = provider.hasEnvFallback
      ? `确认禁用供应商“${provider.name || provider.id}”吗？这不会改写 .env，只会在页面配置里覆盖并停用它。`
      : `确认删除供应商“${provider.name || provider.id}”吗？`;
    if (!window.confirm(message)) return;

    setIsSubmitting(true);
    setError("");
    setStatusMessage("");
    try {
      const payload = await deleteAdminApiProviderRequest(provider.id);
      applyPayload(payload);
      if (editingId === provider.id) {
        setEditingId("");
        setForm(createEmptyApiProviderFormState());
      }
      setStatusMessage(provider.hasEnvFallback ? "供应商已禁用。" : "供应商已删除。");
    } catch (nextError) {
      setError(nextError.message || "删除 API 供应商失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isEditing = Boolean(editingId);

  return (
    <section className="task-page" aria-label="API 配置">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">API providers</p>
          <h2>API 配置</h2>
          <p className="storage-note">在后台维护生图供应商。页面配置会立即生效；如果供应商原本来自 `.env`，这里会以覆盖或禁用的方式管理它。</p>
        </div>
        <div className="task-actions">
          <button className="add-button" disabled={isSubmitting} onClick={startCreate} type="button">
            <Plus size={18} />
            <span>新增供应商</span>
          </button>
        </div>
      </div>

      {statusMessage ? <p className="success-note">{statusMessage}</p> : null}
      {error ? <p className="error-note">{error}</p> : null}

      <div className="api-provider-layout">
        <div className="task-list">
          {isLoading ? <p className="empty-note">正在读取 API 供应商配置…</p> : null}
          {!isLoading && !providers.length ? <p className="empty-note">当前还没有可管理的供应商。你可以先新建一个页面配置供应商。</p> : null}
          {!isLoading
            ? providers.map((provider) => {
                const isDefault = provider.id === defaultProviderId;
                const providerStatusClass = provider.enabled ? "succeeded" : "cancelled";
                return (
                  <article className={`api-provider-card ${provider.enabled ? "" : "is-disabled"}`} key={provider.id}>
                    <div className="api-provider-card-head">
                      <div>
                        <h3>{provider.name || provider.id}</h3>
                        <p className="storage-note">ID：{provider.id}</p>
                      </div>
                      <div className="api-provider-badges">
                        <span className={`task-status ${providerStatusClass}`}>{provider.enabled ? "启用中" : "已禁用"}</span>
                        <span className="api-provider-chip">{provider.sourceLabel}</span>
                        {isDefault ? <span className="api-provider-chip is-primary">默认</span> : null}
                      </div>
                    </div>
                    <div className="api-provider-meta">
                      <p className="storage-note">Base URL：{provider.baseUrl || "未配置"}</p>
                      <p className="storage-note">生图模型：{provider.model || "未配置"}</p>
                      <p className="storage-note">识图模型：{provider.visionModel || "未配置"}</p>
                      {provider.hasEnvFallback ? <p className="storage-note">该供应商来自 `.env`。在这里保存会覆盖它，删除会仅在页面配置里禁用它。</p> : null}
                    </div>
                    <div className="task-actions">
                      <button className="secondary-button" disabled={isSubmitting} onClick={() => startEdit(provider)} type="button">
                        <Pencil size={18} />
                        <span>编辑</span>
                      </button>
                      <button className="danger-button" disabled={isSubmitting} onClick={() => deleteProvider(provider)} type="button">
                        <Trash2 size={18} />
                        <span>{provider.hasEnvFallback ? "禁用" : "删除"}</span>
                      </button>
                    </div>
                  </article>
                );
              })
            : null}
        </div>

        <div className="draw-card-upload-panel api-provider-form-panel">
          <div className="task-toolbar compact-toolbar">
            <div>
              <h3>{isEditing ? "编辑供应商" : "新增供应商"}</h3>
              <p className="storage-note">
                {isEditing
                  ? "编辑现有供应商。已存在的供应商 ID 不再修改，避免影响默认供应商和历史配置。"
                  : "新增一个可立即参与轮询与故障切换的供应商。"}
              </p>
            </div>
          </div>

          <div className="api-provider-form-grid">
            <label className="field-label">
              供应商 ID
              <input
                onChange={(event) => setForm((current) => ({ ...current, id: normalizeApiProviderIdInput(event.target.value) }))}
                placeholder="例如 llmtoken"
                readOnly={isEditing}
                type="text"
                value={form.id}
              />
            </label>
            <label className="field-label">
              显示名称
              <input onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="例如 LLM Token" type="text" value={form.name} />
            </label>
            <label className="field-label api-provider-form-span">
              Base URL
              <input onChange={(event) => setForm((current) => ({ ...current, baseUrl: event.target.value }))} placeholder="https://example.com/v1" type="text" value={form.baseUrl} />
            </label>
            <label className="field-label api-provider-form-span">
              API Key
              <input onChange={(event) => setForm((current) => ({ ...current, apiKey: event.target.value }))} placeholder="sk-..." type="password" value={form.apiKey} />
            </label>
            <label className="field-label">
              生图模型
              <input onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))} placeholder="gpt-image-2" type="text" value={form.model} />
            </label>
            <label className="field-label">
              识图模型
              <input onChange={(event) => setForm((current) => ({ ...current, visionModel: event.target.value }))} placeholder="gpt-5.4-mini" type="text" value={form.visionModel} />
            </label>
            <label className="toggle-field api-provider-form-span">
              <input checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} type="checkbox" />
              <span>启用这个供应商</span>
            </label>
          </div>

          <p className="storage-note">当前默认供应商：{defaultProviderId || "自动选择第一可用供应商"}。默认供应商切换仍可在“订单管理 &gt; 下单配置”里设置。</p>
          <p className="storage-note">如果你保存一个和 `.env` 同 ID 的供应商，这里的配置会优先于 `.env` 生效；删除 `.env` 供应商时不会改写文件，只会在页面配置里将它禁用。</p>

          <div className="card-actions generator-actions">
            <button className="secondary-button" disabled={isSubmitting} onClick={startCreate} type="button">
              <RefreshCw size={18} />
              <span>{isEditing ? "新建空白配置" : "重置表单"}</span>
            </button>
            <button
              className="copy-button"
              disabled={isSubmitting || !form.id.trim() || (form.enabled && (!form.baseUrl.trim() || !form.apiKey.trim()))}
              onClick={saveProvider}
              type="button"
            >
              {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}
              <span>{isSubmitting ? "保存中" : "保存供应商"}</span>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function OrderAdminPage({ initialOrders, initialOrdersMeta, onRefreshOrders, onRefreshSettings, settings, merchants }) {
  const [orders, setOrders] = useState(initialOrders || []);
  const [orderQuery, setOrderQuery] = useState(DEFAULT_ADMIN_ORDER_QUERY);
  const [orderStatus, setOrderStatus] = useState(DEFAULT_ADMIN_ORDER_QUERY.orderStatus);
  const [search, setSearch] = useState(DEFAULT_ADMIN_ORDER_QUERY.search);
  const [merchantId, setMerchantId] = useState(DEFAULT_ADMIN_ORDER_QUERY.merchantId);
  const [startDate, setStartDate] = useState(DEFAULT_ADMIN_ORDER_QUERY.startDate);
  const [endDate, setEndDate] = useState(DEFAULT_ADMIN_ORDER_QUERY.endDate);
  const [orderTotal, setOrderTotal] = useState(Number(initialOrdersMeta?.total || 0));
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [adminRemark, setAdminRemark] = useState("");
  const [fridgeMagnetOrderingEnabled, setFridgeMagnetOrderingEnabled] = useState(settings?.fridgeMagnetOrderingEnabled === true);
  const [fridgeMagnetUnitPriceCents, setFridgeMagnetUnitPriceCents] = useState(settings?.fridgeMagnetUnitPriceCents || 1990);
  const [singleItemShippingFeeCents, setSingleItemShippingFeeCents] = useState(settings?.singleItemShippingFeeCents || 800);
  const [paymentMode, setPaymentMode] = useState(settings?.paymentMode || "manual");
  const [manualPaymentExpireDays, setManualPaymentExpireDays] = useState(settings?.manualPaymentExpireDays || 7);
  const [contactWechatId, setContactWechatId] = useState(settings?.contactWechatId || DEFAULT_CONTACT_WECHAT_ID);
  const [imageProviders, setImageProviders] = useState([]);
  const [effectiveDefaultProviderId, setEffectiveDefaultProviderId] = useState("");
  const [defaultImageProviderId, setDefaultImageProviderId] = useState(settings?.defaultImageProviderId || "");
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isOrderSettingsExpanded, setIsOrderSettingsExpanded] = useState(false);

  useEffect(() => {
    setOrders(initialOrders || []);
  }, [initialOrders]);

  useEffect(() => {
    setOrderTotal(Number(initialOrdersMeta?.total || 0));
    setOrderQuery((current) => {
      const nextQuery = {
        ...current,
        page: Number(initialOrdersMeta?.page || current.page || DEFAULT_ADMIN_ORDER_QUERY.page),
        limit: Number(initialOrdersMeta?.limit || current.limit || DEFAULT_ADMIN_ORDER_QUERY.limit)
      };
      return areAdminOrderQueriesEqual(current, nextQuery) ? current : nextQuery;
    });
  }, [initialOrdersMeta]);

  useEffect(() => {
    setFridgeMagnetOrderingEnabled(settings?.fridgeMagnetOrderingEnabled === true);
    setFridgeMagnetUnitPriceCents(settings?.fridgeMagnetUnitPriceCents || 1990);
    setSingleItemShippingFeeCents(settings?.singleItemShippingFeeCents || 800);
    setPaymentMode(settings?.paymentMode || "manual");
    setManualPaymentExpireDays(settings?.manualPaymentExpireDays || 7);
    setContactWechatId(settings?.contactWechatId || DEFAULT_CONTACT_WECHAT_ID);
    setDefaultImageProviderId(settings?.defaultImageProviderId || "");
  }, [settings]);

  async function loadImageProviders() {
    const payload = await refreshImageProviders();
    setImageProviders(Array.isArray(payload.providers) ? payload.providers : []);
    setEffectiveDefaultProviderId(payload.defaultProvider || payload.providers?.[0]?.id || "");
  }

  useEffect(() => {
    let isActive = true;
    refreshImageProviders()
      .then((payload) => {
        if (!isActive) return;
        setImageProviders(Array.isArray(payload.providers) ? payload.providers : []);
        setEffectiveDefaultProviderId(payload.defaultProvider || payload.providers?.[0]?.id || "");
      })
      .catch(() => {
        if (!isActive) return;
        setImageProviders([]);
        setEffectiveDefaultProviderId("");
      });
    return () => {
      isActive = false;
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(orderTotal / Math.max(orderQuery.limit, 1)));
  const currentDefaultProviderId = settings?.defaultImageProviderId || effectiveDefaultProviderId || "";
  const currentDefaultProvider = useMemo(
    () => imageProviders.find((provider) => provider.id === currentDefaultProviderId) || null,
    [currentDefaultProviderId, imageProviders]
  );
  const pendingDefaultProvider = useMemo(
    () => imageProviders.find((provider) => provider.id === defaultImageProviderId) || null,
    [defaultImageProviderId, imageProviders]
  );
  const hasPendingDefaultProviderChange = defaultImageProviderId !== (settings?.defaultImageProviderId || "");

  async function refreshList(nextPartialQuery = {}, options = {}) {
    const nextQuery = {
      ...orderQuery,
      ...nextPartialQuery
    };
    const shouldShowLoading = options.showLoading !== false;
    if (shouldShowLoading) setIsLoadingOrders(true);
    try {
      const payload = await onRefreshOrders(nextQuery);
      setOrders(payload.orders || []);
      setOrderTotal(Number(payload.total || 0));
      setOrderQuery({
        page: Number(payload.page || nextQuery.page || DEFAULT_ADMIN_ORDER_QUERY.page),
        limit: Number(payload.limit || nextQuery.limit || DEFAULT_ADMIN_ORDER_QUERY.limit),
        orderStatus: nextQuery.orderStatus,
        search: nextQuery.search,
        merchantId: nextQuery.merchantId || "",
        startDate: nextQuery.startDate || "",
        endDate: nextQuery.endDate || ""
      });
      setError("");
      return payload;
    } finally {
      if (shouldShowLoading) setIsLoadingOrders(false);
    }
  }

  function changePage(nextPage) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === orderQuery.page) return;
    refreshList({ page: nextPage }).catch((nextError) => {
      setError(nextError.message || "读取订单列表失败。");
    });
  }

  function applyFilters() {
    refreshList({
      page: 1,
      orderStatus,
      search: search.trim(),
      merchantId,
      startDate,
      endDate
    }).catch((nextError) => {
      setError(nextError.message || "读取订单列表失败。");
    });
  }

  async function loadOrderDetail(orderId) {
    setError("");
    setDownloadStatus("");
    try {
      const order = await fetchAdminOrder(orderId);
      setSelectedOrder(order);
      setAdminRemark(order.adminRemark || "");
    } catch (nextError) {
      setError(nextError.message || "读取订单详情失败。");
    }
  }

  async function saveOrderSettings() {
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      await updateAdminSettings({
        anonymousQuotaLimit: settings?.anonymousQuotaLimit,
        defaultImageProviderId,
        fridgeMagnetOrderingEnabled,
        fridgeMagnetUnitPriceCents,
        singleItemShippingFeeCents,
        paymentMode,
        manualPaymentExpireDays,
        contactWechatId
      });
      await Promise.all([onRefreshSettings(), loadImageProviders()]);
      setStatusMessage("下单配置已更新。");
    } catch (nextError) {
      setError(nextError.message || "更新系统设置失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function updateOrderStatus(payload) {
    if (!selectedOrder?.id) return;
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const updated = await updateAdminOrder(selectedOrder.id, payload);
      setSelectedOrder(updated);
      setAdminRemark(updated.adminRemark || "");
      await refreshList({}, { showLoading: false });
      setStatusMessage("订单已更新。");
    } catch (nextError) {
      setError(nextError.message || "更新订单失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function downloadOrderOriginals() {
    if (!selectedOrder?.id) return;
    setIsBusy(true);
    setError("");
    setDownloadStatus("");
    try {
      const payload = await downloadAdminOrderOriginals(selectedOrder.id);
      setDownloadStatus(`原图压缩包已开始下载：${payload.filename}`);
    } catch (nextError) {
      setError(nextError.message || "下载原图失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function exportOrderList() {
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const payload = await downloadAdminOrdersExport({
        orderStatus: orderQuery.orderStatus,
        search: orderQuery.search,
        merchantId: orderQuery.merchantId,
        startDate: orderQuery.startDate,
        endDate: orderQuery.endDate
      });
      setStatusMessage(`订单明细已开始下载：${payload.filename}`);
    } catch (nextError) {
      setError(nextError.message || "导出订单明细失败。");
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="task-page" aria-label="订单管理">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">Orders</p>
          <h2>订单管理</h2>
          <p className="storage-note">查看冰箱贴订单、来源商户与订单状态。共 {orderTotal} 条，当前第 {orderQuery.page} / {totalPages} 页。</p>
        </div>
        <div className="task-actions">
          <button className="secondary-button" disabled={isBusy} onClick={exportOrderList} type="button">
            <Download size={18} />
            <span>导出明细</span>
          </button>
          <button className="secondary-button" onClick={() => applyFilters()} type="button">
            <RefreshCw size={18} />
            <span>{isLoadingOrders ? "刷新中" : "刷新订单"}</span>
          </button>
        </div>
      </div>

      <div className="draw-card-upload-panel">
        <div className="task-toolbar compact-toolbar">
          <div>
            <h3>下单配置</h3>
            <p className="storage-note">默认折叠，展开后可修改价格、支付方式和客服信息。</p>
          </div>
          <button
            aria-expanded={isOrderSettingsExpanded}
            className="secondary-button settings-collapse-toggle"
            onClick={() => setIsOrderSettingsExpanded((current) => !current)}
            type="button"
          >
            {isOrderSettingsExpanded ? <ArrowUp size={18} /> : <ArrowDown size={18} />}
            <span>{isOrderSettingsExpanded ? "收起配置" : "展开配置"}</span>
          </button>
        </div>
        {isOrderSettingsExpanded ? (
          <>
            <label className="toggle-field">
              <input checked={fridgeMagnetOrderingEnabled} onChange={(event) => setFridgeMagnetOrderingEnabled(event.target.checked)} type="checkbox" />
              <span>开启冰箱贴下单</span>
            </label>
            <label className="field-label">
              单张价格（分）
              <input min="0" onChange={(event) => setFridgeMagnetUnitPriceCents(Number(event.target.value) || 0)} type="number" value={fridgeMagnetUnitPriceCents} />
            </label>
            <label className="field-label">
              单张邮费（分）
              <input min="0" onChange={(event) => setSingleItemShippingFeeCents(Number(event.target.value) || 0)} type="number" value={singleItemShippingFeeCents} />
            </label>
            <label className="field-label">
              支付模式
              <select onChange={(event) => setPaymentMode(event.target.value)} value={paymentMode}>
                <option value="manual">人工支付</option>
                <option value="wechat">微信支付</option>
              </select>
            </label>
            <label className="field-label">
              人工支付有效期（天）
              <input min="1" onChange={(event) => setManualPaymentExpireDays(Number(event.target.value) || 1)} type="number" value={manualPaymentExpireDays} />
            </label>
            <label className="field-label">
              默认图片供应商
              <select onChange={(event) => setDefaultImageProviderId(event.target.value)} value={defaultImageProviderId}>
                <option value="">自动（跟随当前可用列表 / 第一可用供应商）</option>
                {imageProviders.map((provider) => (
                  <option key={`image-provider-${provider.id}`} value={provider.id}>{provider.name} · {provider.model}</option>
                ))}
              </select>
            </label>
            {!imageProviders.length ? (
              <p className="storage-note">当前未检测到可用图片供应商，请先在“API配置”页面或 `.env` 中完成配置。</p>
            ) : hasPendingDefaultProviderChange ? (
              <p className="storage-note">
                保存后会优先使用 {pendingDefaultProvider?.name || "自动选择的默认供应商"}，若请求失败仍会自动切换到备用供应商。
              </p>
            ) : (
              <p className="storage-note">
                当前默认供应商为 {currentDefaultProvider?.name || "第一可用供应商"}，未手动指定时会优先使用它，失败后仍会自动切换到备用供应商。
              </p>
            )}
            <label className="field-label">
              客服微信号
              <input onChange={(event) => setContactWechatId(event.target.value)} type="text" value={contactWechatId} />
            </label>
            <p className="storage-note">金额规则固定为：1 张收邮费，2 张及以上包邮。</p>
            <p className="storage-note">人工支付模式下，用户提交订单后会看到客服微信与订单号复制入口，并在 {manualPaymentExpireDays} 天内完成付款。</p>
            <div className="card-actions generator-actions">
              <button className="secondary-button" disabled={isBusy} onClick={saveOrderSettings} type="button">
                <Save size={18} />
                <span>保存下单配置</span>
              </button>
            </div>
          </>
        ) : null}
      </div>

      <div className="task-filters">
        <select onChange={(event) => setOrderStatus(event.target.value)} value={orderStatus}>
          <option value="">全部订单状态</option>
          <option value="pending_payment">待付款</option>
          <option value="pending_shipment">待发货</option>
          <option value="shipped">已发货</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
          <option value="expired">已过期</option>
        </select>
        <select onChange={(event) => setMerchantId(event.target.value)} value={merchantId}>
          <option value="">全部来源商户</option>
          {merchants.map((merchant) => (
            <option key={`order-merchant-${merchant.id}`} value={merchant.id}>{merchant.name}</option>
          ))}
        </select>
        <label className="field-label task-query-field">
          开始日期
          <input onChange={(event) => setStartDate(event.target.value)} type="date" value={startDate} />
        </label>
        <label className="field-label task-query-field">
          结束日期
          <input onChange={(event) => setEndDate(event.target.value)} type="date" value={endDate} />
        </label>
        <label className="search-box">
          <Search size={18} />
          <input onChange={(event) => setSearch(event.target.value)} placeholder="订单号 / 姓名 / 手机号 / 商户名" value={search} />
        </label>
        <button className="secondary-button" onClick={applyFilters} type="button">
          <span>筛选</span>
        </button>
      </div>

      {error ? <p className="error-note">{error}</p> : null}
      {statusMessage ? <p className="success-note">{statusMessage}</p> : null}

      <div className="task-list">
        {orders.map((order) => (
          <article className="task-card order-task-card" key={order.id}>
            <div className={`task-status ${getAdminOrderPrimaryStatusTone(order)}`}>
              {getAdminOrderPrimaryStatusLabel(order)}
            </div>
            <div className="task-detail">
              <div className="task-meta-row">
                <strong>{order.orderNo}</strong>
                <span>共 {order.itemCount} 只</span>
                <span>{formatCurrencyCents(order.totalCents)}</span>
              </div>
              <p className="storage-note">{order.receiverName} · {order.receiverPhone}</p>
              <p className="storage-note">来源商户：{order.sourceMerchantName || "无"}</p>
              <p className="storage-note">创建于 {formatDateTime(order.createdAt)}</p>
            </div>
            <div className="task-actions">
              <button className="secondary-button" onClick={() => loadOrderDetail(order.id)} type="button">
                <Eye size={18} />
                <span>查看详情</span>
              </button>
            </div>
          </article>
        ))}
        {!orders.length ? <p className="empty-note">当前没有符合条件的订单。</p> : null}
      </div>
      <div className="task-pagination">
        <p className="storage-note">
          共 {orderTotal} 条，当前第 {orderQuery.page} / {totalPages} 页，当前页 {orders.length} 条
        </p>
        <div className="task-pagination-actions">
          <button className="secondary-button" disabled={orderQuery.page <= 1 || isLoadingOrders} onClick={() => changePage(orderQuery.page - 1)} type="button">
            <ArrowUp size={18} />
            <span>上一页</span>
          </button>
          <button className="secondary-button" disabled={orderQuery.page >= totalPages || !orderTotal || isLoadingOrders} onClick={() => changePage(orderQuery.page + 1)} type="button">
            <ArrowDown size={18} />
            <span>下一页</span>
          </button>
        </div>
      </div>

      {selectedOrder ? (
        <div className="modal-backdrop" onClick={() => setSelectedOrder(null)} role="presentation">
          <section className="prompt-modal order-admin-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Order detail</p>
                <h2>{selectedOrder.orderNo}</h2>
              </div>
              <button className="icon-button" onClick={() => setSelectedOrder(null)} type="button" aria-label="关闭订单详情">
                <X size={18} />
              </button>
            </div>
            <div className="task-meta-row">
              <span className={`task-status ${getAdminOrderPrimaryStatusTone(selectedOrder)}`}>{getAdminOrderPrimaryStatusLabel(selectedOrder)}</span>
              <span>总价 {formatCurrencyCents(selectedOrder.totalCents)}</span>
            </div>
            <p className="storage-note">{selectedOrder.receiverName} · {selectedOrder.receiverPhone}</p>
            <p className="storage-note">{selectedOrder.addressDetail}</p>
            <p className="storage-note">来源商户：{selectedOrder.sourceMerchantName || "无"}</p>
            {selectedOrder.sourceMerchantId ? (
              <p className="storage-note">
                商户 ID {selectedOrder.sourceMerchantId}，佣金比例 {formatCommissionRateBps(selectedOrder.commissionRateBps)}，当前订单佣金 {formatCurrencyCents(calculateOrderCommissionCents(selectedOrder))}
              </p>
            ) : null}
            {selectedOrder.remark ? <p className="storage-note">备注：{selectedOrder.remark}</p> : null}
            <div className="draw-card-order-items">
              {selectedOrder.items.map((item, index) => (
                <article className="draw-card-order-item" key={`${item.jobId}-${index}`}>
                  <OrderItemPreview alt={item.styleName || `订单图片 ${index + 1}`} src={item.thumbnailUrl || item.imageUrl} title={item.styleName || `订单图片 ${index + 1}`} />
                  <strong>{item.styleName || `订单图片 ${index + 1}`}</strong>
                  <span className="draw-card-order-item-note">数量 x{Math.max(1, Number(item.quantity || 1))}</span>
                </article>
              ))}
            </div>
            <label className="field-label">
              管理员备注
              <textarea onChange={(event) => setAdminRemark(event.target.value)} rows="3" value={adminRemark} />
            </label>
            {downloadStatus ? <p className="success-note">{downloadStatus}</p> : null}
            <div className="task-filters">
              <button className="secondary-button" disabled={isBusy} onClick={downloadOrderOriginals} type="button">
                <Download size={18} />
                <span>下载原图</span>
              </button>
              <button className="secondary-button" onClick={() => updateOrderStatus({ adminRemark, orderStatus: "pending_shipment" })} type="button">
                <span>标记待发货</span>
              </button>
              <button className="secondary-button" onClick={() => updateOrderStatus({ adminRemark, orderStatus: "shipped" })} type="button">
                <span>标记已发货</span>
              </button>
              <button className="secondary-button" onClick={() => updateOrderStatus({ adminRemark, orderStatus: "completed" })} type="button">
                <span>标记已完成</span>
              </button>
              <button className="danger-button" onClick={() => updateOrderStatus({ adminRemark, orderStatus: "cancelled" })} type="button">
                <span>取消订单</span>
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function MerchantAdminPage({ allMerchants, onRefreshAllMerchants }) {
  const [merchantForm, setMerchantForm] = useState(DEFAULT_MERCHANT_FORM);
  const [editingMerchantId, setEditingMerchantId] = useState("");
  const [merchantList, setMerchantList] = useState([]);
  const [merchantListPage, setMerchantListPage] = useState(1);
  const [merchantListLimit] = useState(8);
  const [merchantListTotal, setMerchantListTotal] = useState(0);
  const [merchantSearch, setMerchantSearch] = useState("");
  const [isLoadingMerchants, setIsLoadingMerchants] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const merchantTotalPages = Math.max(1, Math.ceil(merchantListTotal / Math.max(merchantListLimit, 1)));

  useEffect(() => {
    refreshMerchantList({ page: 1 }, { showLoading: false }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editingMerchantId) return;
    const activeMerchant = allMerchants.find((merchant) => merchant.id === editingMerchantId);
    if (activeMerchant) {
      setMerchantForm(toMerchantFormState(activeMerchant));
      return;
    }
    setEditingMerchantId("");
    setMerchantForm(DEFAULT_MERCHANT_FORM);
  }, [editingMerchantId, allMerchants]);

  async function refreshMerchantList(nextPatch = {}, options = {}) {
    const nextQuery = {
      page: merchantListPage,
      limit: merchantListLimit,
      search: merchantSearch.trim(),
      ...nextPatch
    };
    const shouldShowLoading = options.showLoading !== false;
    if (shouldShowLoading) setIsLoadingMerchants(true);
    try {
      const payload = await refreshAdminMerchants(nextQuery);
      setMerchantList(payload.merchants || []);
      setMerchantListTotal(Number(payload.total || 0));
      setMerchantListPage(Number(payload.page || nextQuery.page || 1));
      if (nextPatch.search !== undefined) setMerchantSearch(nextQuery.search || "");
      return payload;
    } finally {
      if (shouldShowLoading) setIsLoadingMerchants(false);
    }
  }

  function resetMerchantForm() {
    setEditingMerchantId("");
    setMerchantForm(DEFAULT_MERCHANT_FORM);
  }

  async function saveMerchant() {
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      if (editingMerchantId) {
        await updateAdminMerchant(editingMerchantId, {
          name: merchantForm.name,
          status: merchantForm.status,
          commissionRateBps: merchantForm.commissionRateBps,
          note: merchantForm.note
        });
        setStatusMessage("商户已更新。");
      } else {
        await createAdminMerchant(merchantForm);
        setStatusMessage("商户已创建。");
      }
      await Promise.all([
        onRefreshAllMerchants(),
        refreshMerchantList({}, { showLoading: false })
      ]);
      resetMerchantForm();
    } catch (nextError) {
      setError(nextError.message || "保存商户失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function removeMerchant(merchant) {
    if (!merchant?.id) return;
    if (!window.confirm(`确定删除商户 ${merchant.name} 吗？历史订单中的商户快照会保留。`)) return;
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      await deleteAdminMerchant(merchant.id);
      if (editingMerchantId === merchant.id) resetMerchantForm();
      await Promise.all([
        onRefreshAllMerchants(),
        refreshMerchantList({
          page: merchantList.length === 1 && merchantListPage > 1 ? merchantListPage - 1 : merchantListPage
        }, { showLoading: false })
      ]);
      setStatusMessage("商户已删除。");
    } catch (nextError) {
      setError(nextError.message || "删除商户失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function copyMerchantLandingUrl(merchant) {
    try {
      await copyText(merchant.landingUrl || "");
      setStatusMessage(`商户 ${merchant.name} 的落地链接已复制。`);
      setError("");
    } catch (nextError) {
      setError(nextError.message || "复制商户链接失败。");
    }
  }

  async function handleDownloadMerchantQr(merchant, format) {
    try {
      if (format === "png") {
        await downloadQrPng(merchant.landingUrl || "", `${merchant.id}-qr.png`);
      } else {
        downloadQrSvg(merchant.landingUrl || "", `${merchant.id}-qr.svg`);
      }
      setStatusMessage(`商户 ${merchant.name} 的二维码已开始下载。`);
      setError("");
    } catch (nextError) {
      setError(nextError.message || "下载二维码失败。");
    }
  }

  function changeMerchantPage(nextPage) {
    if (nextPage < 1 || nextPage > merchantTotalPages || nextPage === merchantListPage) return;
    refreshMerchantList({ page: nextPage }).catch((nextError) => {
      setError(nextError.message || "读取商户列表失败。");
    });
  }

  return (
    <section className="task-page" aria-label="合作商户">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">Partners</p>
          <h2>合作商户</h2>
          <p className="storage-note">管理合作商户、二维码链接和落地链接。</p>
        </div>
      </div>

      <div className="draw-card-upload-panel">
        <div className="task-toolbar">
          <div>
            <p className="eyebrow">Merchants</p>
            <h3>商户管理</h3>
            <p className="storage-note">为每个线下商户生成带签名的专属落地链接和二维码，供台卡扫码使用。</p>
          </div>
          <button className="secondary-button" onClick={() => refreshMerchantList()} type="button">
            <RefreshCw size={18} />
            <span>{isLoadingMerchants ? "刷新中" : "刷新商户"}</span>
          </button>
        </div>

        <div className="task-query-fields">
          {!editingMerchantId ? (
            <label className="field-label task-query-field">
              商户 ID（可选）
              <input
                onChange={(event) => setMerchantForm((current) => ({ ...current, id: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) }))}
                placeholder="留空自动生成"
                type="text"
                value={merchantForm.id}
              />
            </label>
          ) : (
            <label className="field-label task-query-field">
              商户 ID
              <input disabled type="text" value={merchantForm.id} />
            </label>
          )}
          <label className="field-label task-query-field">
            商户名称
            <input onChange={(event) => setMerchantForm((current) => ({ ...current, name: event.target.value }))} type="text" value={merchantForm.name} />
          </label>
          <label className="field-label task-query-field">
            状态
            <select onChange={(event) => setMerchantForm((current) => ({ ...current, status: event.target.value }))} value={merchantForm.status}>
              <option value="active">启用</option>
              <option value="inactive">停用</option>
            </select>
          </label>
          <label className="field-label task-query-field">
            佣金比例（BP）
            <input
              max="10000"
              min="0"
              onChange={(event) => setMerchantForm((current) => ({ ...current, commissionRateBps: Number(event.target.value) || 0 }))}
              type="number"
              value={merchantForm.commissionRateBps}
            />
          </label>
        </div>
        <label className="field-label">
          备注
          <textarea onChange={(event) => setMerchantForm((current) => ({ ...current, note: event.target.value }))} rows="3" value={merchantForm.note} />
        </label>
        <div className="card-actions generator-actions">
          <button className="secondary-button" disabled={isBusy} onClick={saveMerchant} type="button">
            <Save size={18} />
            <span>{editingMerchantId ? "保存商户" : "创建商户"}</span>
          </button>
          <button className="secondary-button" onClick={resetMerchantForm} type="button">
            <Pencil size={18} />
            <span>{editingMerchantId ? "取消编辑" : "重置表单"}</span>
          </button>
        </div>

        <div className="task-filters">
          <label className="search-box">
            <Search size={18} />
            <input onChange={(event) => setMerchantSearch(event.target.value)} placeholder="搜索商户名 / ID / 备注" value={merchantSearch} />
          </label>
          <button className="secondary-button" onClick={() => refreshMerchantList({ page: 1, search: merchantSearch.trim() })} type="button">
            <span>筛选商户</span>
          </button>
        </div>

        <div className="merchant-grid">
          {merchantList.map((merchant) => {
            const previewUrl = getMerchantQrPreviewUrl(merchant.landingUrl);
            return (
              <article className="task-card merchant-card" key={merchant.id}>
                <div className={`task-status ${merchant.status === "active" ? "succeeded" : "cancelled"}`}>
                  {merchant.status === "active" ? "启用中" : "已停用"}
                </div>
                <div className="task-detail">
                  <div className="task-meta-row">
                    <strong>{merchant.name}</strong>
                    <span>{merchant.id}</span>
                    <span>{formatCommissionRateBps(merchant.commissionRateBps)}</span>
                  </div>
                  {merchant.note ? <p className="storage-note">{merchant.note}</p> : <p className="storage-note">无备注</p>}
                  <p className="storage-note merchant-link-text">{merchant.landingUrl}</p>
                </div>
                <div className="merchant-qr-preview">
                  {previewUrl ? <img alt={`${merchant.name} 二维码`} src={previewUrl} /> : <div className="empty-note">二维码暂不可预览</div>}
                </div>
                <div className="task-actions merchant-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setMerchantForm(toMerchantFormState(merchant));
                      setEditingMerchantId(merchant.id);
                    }}
                    type="button"
                  >
                    <Pencil size={18} />
                    <span>编辑</span>
                  </button>
                  <button className="secondary-button" onClick={() => copyMerchantLandingUrl(merchant)} type="button">
                    <Clipboard size={18} />
                    <span>复制链接</span>
                  </button>
                  <button className="secondary-button" onClick={() => handleDownloadMerchantQr(merchant, "png")} type="button">
                    <Download size={18} />
                    <span>下载 PNG</span>
                  </button>
                  <button className="secondary-button" onClick={() => handleDownloadMerchantQr(merchant, "svg")} type="button">
                    <QrCode size={18} />
                    <span>下载 SVG</span>
                  </button>
                  <button className="danger-button" disabled={isBusy} onClick={() => removeMerchant(merchant)} type="button">
                    <Trash2 size={18} />
                    <span>删除</span>
                  </button>
                </div>
              </article>
            );
          })}
          {!merchantList.length ? <p className="empty-note">当前没有符合条件的商户。</p> : null}
        </div>

        <div className="task-pagination">
          <p className="storage-note">
            共 {merchantListTotal} 条，当前第 {merchantListPage} / {merchantTotalPages} 页，当前页 {merchantList.length} 条
          </p>
          <div className="task-pagination-actions">
            <button className="secondary-button" disabled={merchantListPage <= 1 || isLoadingMerchants} onClick={() => changeMerchantPage(merchantListPage - 1)} type="button">
              <ArrowUp size={18} />
              <span>上一页</span>
            </button>
            <button className="secondary-button" disabled={merchantListPage >= merchantTotalPages || !merchantListTotal || isLoadingMerchants} onClick={() => changeMerchantPage(merchantListPage + 1)} type="button">
              <ArrowDown size={18} />
              <span>下一页</span>
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="error-note">{error}</p> : null}
      {statusMessage ? <p className="success-note">{statusMessage}</p> : null}
    </section>
  );
}

function StorageAdminPage({ storageSummary, onRefreshStorage }) {
  const [retentionDays, setRetentionDays] = useState(storageSummary?.cleanupDefaults?.retentionDays || 30);
  const [cleanVisitors, setCleanVisitors] = useState(false);
  const [imageBackupStartDate, setImageBackupStartDate] = useState("");
  const [imageBackupEndDate, setImageBackupEndDate] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setRetentionDays(storageSummary?.cleanupDefaults?.retentionDays || 30);
  }, [storageSummary]);

  async function handleCreateBackup() {
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const backup = await createStorageBackupRequest();
      await onRefreshStorage();
      setStatusMessage(`已创建备份 ${backup.filename}`);
    } catch (nextError) {
      setError(nextError.message || "创建备份失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateImageBackup() {
    if (!imageBackupStartDate || !imageBackupEndDate) {
      setError("请选择开始日期和结束日期。");
      setStatusMessage("");
      return;
    }
    if (imageBackupStartDate > imageBackupEndDate) {
      setError("开始日期不能晚于结束日期。");
      setStatusMessage("");
      return;
    }
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const backup = await createImageRangeBackupRequest({
        startDate: imageBackupStartDate,
        endDate: imageBackupEndDate
      });
      await onRefreshStorage();
      setStatusMessage(`已创建图片备份 ${backup.filename}`);
    } catch (nextError) {
      setError(nextError.message || "创建图片备份失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDeleteBackup(backup) {
    if (!window.confirm(`确认删除备份 ${backup.filename} 吗？删除后将无法下载。`)) return;
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      await deleteStorageBackupRequest(backup.backupId);
      await onRefreshStorage();
      setStatusMessage(`已删除备份 ${backup.filename}`);
    } catch (nextError) {
      setError(nextError.message || "删除备份失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCleanup() {
    if (!window.confirm(`确认清理 ${retentionDays} 天前的历史数据吗？这会删除旧任务记录以及对应图片文件。`)) return;
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const result = await cleanupStorageHistoryRequest({
        retentionDays,
        cleanVisitors,
        clearAllHistory: true
      });
      await onRefreshStorage();
      setStatusMessage(
        `已清理：任务 ${result.deleted.imageJobs} 条，抽卡会话 ${result.deleted.drawCardSessions} 条，访客 ${result.deleted.visitorStates} 条，后台会话 ${result.deleted.adminSessions} 条，临时参考 ${result.deleted.tempReferences} 条。`
      );
    } catch (nextError) {
      setError(nextError.message || "清理历史数据失败。");
    } finally {
      setIsBusy(false);
    }
  }

  const directories = storageSummary?.directories || [];
  const backups = storageSummary?.backups || [];
  const totals = storageSummary?.totals || { bytes: 0, files: 0 };

  return (
    <section className="task-page" aria-label="存储管理">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">Storage</p>
          <h2>存储管理</h2>
          <p className="storage-note">查看目录占用，创建可下载备份，并清理过期历史数据。</p>
        </div>
        <button className="secondary-button" onClick={onRefreshStorage} type="button">
          <RefreshCw size={18} />
          <span>刷新</span>
        </button>
      </div>

      <div className="storage-summary-grid">
        <article className="task-card storage-summary-card">
          <div className="task-detail">
            <div className="task-meta-row">
              <strong>总文件数</strong>
              <span>{totals.files}</span>
            </div>
            <p className="storage-note">当前统计的是任务相关目录与后台运行数据目录。</p>
          </div>
        </article>
        <article className="task-card storage-summary-card">
          <div className="task-detail">
            <div className="task-meta-row">
              <strong>总占用</strong>
              <span>{formatBytes(totals.bytes)}</span>
            </div>
            <p className="storage-note">高清原图、参考图、预览图通常是空间占用大头。</p>
          </div>
        </article>
        <article className="task-card storage-summary-card">
          <div className="task-detail">
            <div className="task-meta-row">
              <strong>可下载备份</strong>
              <span>{backups.length}</span>
            </div>
            <p className="storage-note">备份文件保存在服务器上，可随时下载或删除。</p>
          </div>
        </article>
      </div>

      <div className="task-list">
        {directories.map((item) => (
          <article className="task-card" key={item.key}>
            <div className="task-status queued">{item.files} 个文件</div>
            <div className="task-detail">
              <div className="task-meta-row">
                <strong>{item.label}</strong>
                <span>{formatBytes(item.bytes)}</span>
                <span>{item.path}</span>
              </div>
              <p className="storage-note">目录数 {item.directories}</p>
            </div>
          </article>
        ))}
      </div>

      <section className="task-page" aria-label="备份管理">
        <div className="task-toolbar">
          <div>
            <p className="eyebrow">Backups</p>
            <h2>备份文件</h2>
            <p className="storage-note">支持轻量配置备份，也支持按日期范围导出高清原图和临时参考图 zip。</p>
          </div>
          <button className="copy-button" disabled={isBusy} onClick={handleCreateBackup} type="button">
            {isBusy ? <LoaderCircle className="spin" size={18} /> : <Save size={18} />}
            <span>{isBusy ? "处理中" : "创建配置备份"}</span>
          </button>
        </div>
        <div className="draw-card-upload-panel">
          <p className="storage-note">图片范围备份会将所选日期内的高清原图和临时参考图打包成 zip，并附带 `manifest.json`。</p>
          <label className="field-label">
            开始日期
            <input onChange={(event) => setImageBackupStartDate(event.target.value)} type="date" value={imageBackupStartDate} />
          </label>
          <label className="field-label">
            结束日期
            <input onChange={(event) => setImageBackupEndDate(event.target.value)} type="date" value={imageBackupEndDate} />
          </label>
          <div className="card-actions generator-actions">
            <button className="secondary-button" disabled={isBusy} onClick={handleCreateImageBackup} type="button">
              {isBusy ? <LoaderCircle className="spin" size={18} /> : <Download size={18} />}
              <span>{isBusy ? "处理中" : "生成图片备份 zip"}</span>
            </button>
          </div>
        </div>
        <div className="task-list">
          {backups.map((backup) => (
            <article className="task-card" key={backup.backupId}>
              <div className="task-status succeeded">{backup.kind === "image-range-zip" ? "图片备份" : "配置备份"}</div>
              <div className="task-detail">
                <div className="task-meta-row">
                  <strong>{backup.filename}</strong>
                  <span>{formatBytes(backup.sizeBytes)}</span>
                  <span>v{backup.version}</span>
                </div>
                <p className="storage-note">
                  创建于 {formatDateTime(backup.createdAt)}
                  {backup.dateRange ? ` · 范围 ${backup.dateRange.startDate} 到 ${backup.dateRange.endDate}` : ""}
                </p>
              </div>
              <div className="task-actions">
                <button className="secondary-button" onClick={() => downloadStorageBackup(backup.backupId)} type="button">
                  <Download size={18} />
                  <span>下载</span>
                </button>
                <button className="danger-button" disabled={isBusy} onClick={() => handleDeleteBackup(backup)} type="button">
                  <Trash2 size={18} />
                  <span>删除</span>
                </button>
              </div>
            </article>
          ))}
          {!backups.length ? <p className="empty-note">还没有创建过备份文件。</p> : null}
        </div>
      </section>

      <section className="task-page" aria-label="历史清理">
        <div className="task-toolbar">
          <div>
            <p className="eyebrow">Cleanup</p>
            <h2>历史数据清理</h2>
            <p className="storage-note">会清空历史任务，以及关联的高清原图、缩略图、参考图缩略图、抽卡会话和临时参考图。</p>
          </div>
        </div>
        <div className="draw-card-upload-panel">
          <label className="field-label">
            历史阈值天数
            <input max="3650" min="0" onChange={(event) => setRetentionDays(Number(event.target.value) || 0)} type="number" value={retentionDays} />
          </label>
          <label className="storage-checkbox">
            <input checked={cleanVisitors} onChange={(event) => setCleanVisitors(event.target.checked)} type="checkbox" />
            <span>同时清理旧访客额度记录</span>
          </label>
          <div className="storage-warning">
            <AlertTriangle size={18} />
            <span>默认不会动风格库、分组、邀请码和系统设置。点击后会清空历史任务及其关联图片文件；访客记录默认也不删，除非你手动勾选。</span>
          </div>
          <div className="card-actions generator-actions">
            <button className="danger-button" disabled={isBusy} onClick={handleCleanup} type="button">
              {isBusy ? <LoaderCircle className="spin" size={18} /> : <Trash2 size={18} />}
              <span>{isBusy ? "清理中" : "一键清理历史数据"}</span>
            </button>
          </div>
          {statusMessage ? <p className="success-note">{statusMessage}</p> : null}
          {error ? <p className="error-note">{error}</p> : null}
        </div>
      </section>
    </section>
  );
}

async function fetchPublicExperienceSession(apiBase, sessionId, fallbackMessage) {
  const response = await fetch(`${apiBase}/sessions/${sessionId}`);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message || fallbackMessage || "读取公开玩法状态失败，请稍后再试。");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function fetchLatestPublicExperienceSession(apiBase, fallbackMessage) {
  const response = await fetch(`${apiBase}/sessions/latest`);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message || fallbackMessage || "恢复公开玩法进度失败，请稍后再试。");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function readPersistedSessionId(storageKey) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored ? String(stored) : "";
  } catch {
    return "";
  }
}

async function likeImageJob(jobId) {
  const response = await fetch(`/api/image-jobs/${jobId}/like`, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "加入卡夹失败，请稍后再试。");
  return payload;
}

async function unlikeImageJob(jobId) {
  const response = await fetch(`/api/image-jobs/${jobId}/unlike`, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "移出卡夹失败，请稍后再试。");
  return payload;
}

function statusLabel(status) {
  const labels = {
    all: "全部",
    queued: "排队中",
    running: "生成中",
    succeeded: "已完成",
    partial: "部分完成",
    failed: "失败",
    cancelled: "已停止"
  };
  return labels[status] || status || "未知";
}

function orderStatusLabel(status) {
  return ORDER_STATUS_LABELS[status] || status || "未知";
}

function orderStatusTone(status) {
  if (status === "completed" || status === "pending_shipment" || status === "shipped") return "succeeded";
  if (status === "cancelled" || status === "expired") return "cancelled";
  return "queued";
}

function getAdminOrderPrimaryStatusLabel(order) {
  return orderStatusLabel(String(order?.orderStatus || ""));
}

function getAdminOrderPrimaryStatusTone(order) {
  return orderStatusTone(String(order?.orderStatus || ""));
}

function OrderItemPreview({ src, alt, title = "订单图片", note = "历史图片资源已缺失" }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <div className="draw-card-order-item-placeholder" aria-label={`${title}不可用`}>
        <AlertTriangle size={18} />
        <strong>{title}</strong>
        <span>{note}</span>
      </div>
    );
  }

  return <img alt={alt} onError={() => setFailed(true)} src={src} />;
}

function modeLabel(mode) {
  return mode === "edit" ? "参考图编辑" : "文生图";
}

function publicExperienceLabel(experienceType) {
  if (experienceType === "fridge-magnet") return "冰箱贴";
  if (experienceType === "draw-card") return "抽卡";
  return "公开玩法";
}

function areAdminOrderQueriesEqual(left, right) {
  return (
    Number(left?.page || 0) === Number(right?.page || 0) &&
    Number(left?.limit || 0) === Number(right?.limit || 0) &&
    String(left?.orderStatus || "") === String(right?.orderStatus || "") &&
    String(left?.search || "") === String(right?.search || "") &&
    String(left?.merchantId || "") === String(right?.merchantId || "") &&
    String(left?.startDate || "") === String(right?.startDate || "") &&
    String(left?.endDate || "") === String(right?.endDate || "")
  );
}

function toMerchantFormState(merchant) {
  return {
    id: String(merchant?.id || ""),
    name: String(merchant?.name || ""),
    status: String(merchant?.status || "active"),
    commissionRateBps: Number(merchant?.commissionRateBps || 0),
    note: String(merchant?.note || "")
  };
}

function createEmptyApiProviderFormState() {
  return { ...DEFAULT_API_PROVIDER_FORM };
}

function normalizeApiProviderIdInput(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 48);
}

function toApiProviderFormState(provider) {
  return {
    id: String(provider?.id || ""),
    name: String(provider?.name || ""),
    baseUrl: String(provider?.baseUrl || ""),
    apiKey: String(provider?.apiKey || ""),
    model: String(provider?.model || DEFAULT_API_PROVIDER_FORM.model),
    visionModel: String(provider?.visionModel || DEFAULT_API_PROVIDER_FORM.visionModel),
    enabled: provider?.enabled !== false
  };
}

function getMerchantQrPreviewUrl(landingUrl) {
  try {
    return createQrSvgDataUrl(landingUrl, {
      margin: 4,
      dark: "#000000",
      light: "#ffffff"
    });
  } catch {
    return "";
  }
}

function formatCommissionRateBps(value) {
  return `${(Number(value || 0) / 100).toFixed(2)}%`;
}

function calculateOrderCommissionCents(order) {
  return Math.round(Number(order?.totalCents || 0) * Number(order?.commissionRateBps || 0) / 10000);
}

function areImageJobQueriesEqual(left, right) {
  return (
    Number(left?.page || 0) === Number(right?.page || 0) &&
    Number(left?.limit || 0) === Number(right?.limit || 0) &&
    String(left?.status || "") === String(right?.status || "") &&
    String(left?.search || "") === String(right?.search || "") &&
    String(left?.date || "") === String(right?.date || "") &&
    Boolean(left?.likedOnly) === Boolean(right?.likedOnly)
  );
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

function formatCurrencyCents(value) {
  const cents = Number(value || 0);
  return `¥${(cents / 100).toFixed(2)}`;
}

function getContactWechatId(config) {
  return String(config?.contactWechatId || DEFAULT_CONTACT_WECHAT_ID).trim() || DEFAULT_CONTACT_WECHAT_ID;
}

function readLatestManualOrder() {
  try {
    const payload = JSON.parse(window.localStorage.getItem(LATEST_MANUAL_ORDER_STORAGE_KEY) || "null");
    if (!payload || typeof payload !== "object") return null;
    if (!payload.orderId || !payload.publicToken || !payload.orderNo) return null;
    return payload;
  } catch {
    return null;
  }
}

function clearLatestManualOrder() {
  try {
    window.localStorage.removeItem(LATEST_MANUAL_ORDER_STORAGE_KEY);
  } catch {}
}

function persistLatestManualOrder(order, publicToken = "") {
  if (!order?.id || !order?.orderNo) return;
  const orderStatus = normalizeOrderStatusForCache(order.orderStatus);
  if (["pending_shipment", "shipped", "completed", "cancelled", "expired"].includes(orderStatus)) {
    clearLatestManualOrder();
    return;
  }
  try {
    window.localStorage.setItem(LATEST_MANUAL_ORDER_STORAGE_KEY, JSON.stringify({
      orderId: String(order.id || ""),
      publicToken: String(publicToken || order.publicToken || ""),
      orderNo: String(order.orderNo || ""),
      expiresAt: order.expiresAt || "",
      createdAt: order.createdAt || "",
      orderStatus
    }));
  } catch {}
}

function normalizeOrderStatusForCache(status) {
  const value = String(status || "").trim();
  return value || "pending_payment";
}

function syncLatestManualOrder(order, config, token = "") {
  if (!order || !isManualPaymentOrder(order, config)) return;
  const orderStatus = normalizeOrderStatusForCache(order.orderStatus);
  if (["pending_shipment", "shipped", "completed", "cancelled", "expired"].includes(orderStatus)) {
    clearLatestManualOrder();
    return;
  }
  persistLatestManualOrder(order, token);
}

function isActiveLatestManualOrder(order) {
  if (!order?.orderId || !order?.publicToken) return false;
  if (["pending_shipment", "shipped", "completed", "cancelled", "expired"].includes(String(order.orderStatus || ""))) return false;
  const expiresAtMs = new Date(String(order.expiresAt || "")).getTime();
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) return false;
  return true;
}

function buildOrderDetailUrl(orderId, token = "") {
  const base = `/fridge/orders/${orderId}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

function isManualPaymentOrder(order, config) {
  return String(order?.lastPaymentChannel || "") === "manual" || String(config?.paymentMode || "") === "manual";
}

function maskPhone(phone) {
  const normalized = String(phone || "").trim();
  if (!normalized) return "未填写";
  return normalized.length <= 4 ? normalized : `尾号 ${normalized.slice(-4)}`;
}

function buildManualPaymentMessage(order) {
  return [
    "冰箱贴订单待付款",
    `订单号：${String(order?.orderNo || "")}`,
    `应付金额：${formatCurrencyCents(order?.totalCents)}`,
    `收货人：${String(order?.receiverName || "未填写")}`,
    `手机号：${String(order?.receiverPhone || "未填写")}`,
    "请确认收款，我会发送订单卡片"
  ].join("\n");
}

async function buildManualPaymentCard(order, config) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1620;
  const context = canvas.getContext("2d");
  if (!context) return "";

  context.fillStyle = "#f5efe5";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#1f2b2b";
  context.fillRect(72, 72, canvas.width - 144, canvas.height - 144);

  context.fillStyle = "#f7f1e7";
  roundRect(context, 132, 132, canvas.width - 264, canvas.height - 264, 36);
  context.fill();

  context.fillStyle = "#24504a";
  context.font = "700 42px sans-serif";
  context.fillText("冰箱贴订单卡片", 192, 246);

  context.fillStyle = "#5d726c";
  context.font = "500 26px sans-serif";
  context.fillText("建议先保存卡片，再去添加客服", 192, 296);

  context.fillStyle = "#b45309";
  roundRect(context, 192, 336, canvas.width - 384, 80, 24);
  context.fill();
  context.fillStyle = "#fffaf0";
  context.font = "800 38px sans-serif";
  context.fillText("长按保存，发给客服", 250, 388);

  drawPaymentCardRow(context, "订单号", String(order?.orderNo || ""), 192, 464);
  drawPaymentCardRow(context, "应付金额", formatCurrencyCents(order?.totalCents), 192, 584);
  drawPaymentCardRow(context, "客服微信", getContactWechatId(config), 192, 704);
  drawPaymentCardRow(context, "付款截止", formatDateTime(order?.expiresAt), 192, 824);
  drawPaymentCardRow(context, "收货人", String(order?.receiverName || "未填写"), 192, 944);
  drawPaymentCardRow(context, "手机号", maskPhone(order?.receiverPhone), 192, 1064);

  context.fillStyle = "#edf5f2";
  roundRect(context, 192, 1170, canvas.width - 384, 186, 28);
  context.fill();

  context.fillStyle = "#24504a";
  context.font = "700 30px sans-serif";
  context.fillText("付款说明", 232, 1234);
  context.fillStyle = "#465a56";
  context.font = "500 26px sans-serif";
  wrapCanvasText(context, "联系客服并发送订单卡片，管理员确认收款后会手动更新订单状态。", 232, 1288, canvas.width - 464, 40);

  context.fillStyle = "#7a8b86";
  context.font = "500 22px sans-serif";
  context.fillText("长按图片保存到相册", 192, 1458);

  return canvas.toDataURL("image/png");
}

function drawPaymentCardRow(context, label, value, x, y) {
  context.fillStyle = "#6b7e79";
  context.font = "600 24px sans-serif";
  context.fillText(label, x, y);
  context.fillStyle = "#182726";
  context.font = "700 34px sans-serif";
  wrapCanvasText(context, value, x, y + 52, 696, 44);
}

function wrapCanvasText(context, text, x, y, maxWidth, lineHeight) {
  const characters = Array.from(String(text || ""));
  let current = "";
  let currentY = y;
  characters.forEach((character) => {
    const next = `${current}${character}`;
    if (current && context.measureText(next).width > maxWidth) {
      context.fillText(current, x, currentY);
      current = character;
      currentY += lineHeight;
      return;
    }
    current = next;
  });
  if (current) context.fillText(current, x, currentY);
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

function calculateClientOrderAmount(itemCount, config) {
  const unitPriceCents = Number(config?.unitPriceCents || 0);
  const shippingFeeCents = itemCount === 1 ? Number(config?.singleItemShippingFeeCents || 0) : 0;
  const subtotalCents = unitPriceCents * Math.max(0, Number(itemCount || 0));
  return {
    unitPriceCents,
    shippingFeeCents,
    subtotalCents,
    totalCents: subtotalCents + shippingFeeCents
  };
}

function clampOrderItemQuantity(value) {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return 1;
  return Math.min(MAX_ORDER_ITEM_QUANTITY, Math.max(1, Math.round(quantity)));
}

function getOrderItemQuantity(quantities, jobId) {
  if (!jobId) return 1;
  return clampOrderItemQuantity(quantities?.[jobId] ?? 1);
}

function getTotalOrderItemCount(items, quantities) {
  return (items || []).reduce((sum, item) => sum + getOrderItemQuantity(quantities, item?.jobId), 0);
}

function syncOrderQuantitiesWithClipItems(currentQuantities, items) {
  const nextQuantities = {};
  (items || []).forEach((item) => {
    const jobId = String(item?.jobId || "");
    if (!jobId) return;
    nextQuantities[jobId] = getOrderItemQuantity(currentQuantities, jobId);
  });
  return nextQuantities;
}

function isWechatBrowserClient() {
  return /MicroMessenger/i.test(window.navigator?.userAgent || "");
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let index = 0;
  let current = size;
  while (current >= 1024 && index < units.length - 1) {
    current /= 1024;
    index += 1;
  }
  return `${current.toFixed(current >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
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

function formatStayDuration(seconds) {
  if (seconds === null || seconds === undefined || Number.isNaN(Number(seconds))) return "--";
  const safeSeconds = Math.max(0, Math.round(Number(seconds)));
  if (safeSeconds < 60) return `${safeSeconds}秒`;
  const minutes = Math.floor(safeSeconds / 60);
  const restSeconds = safeSeconds % 60;
  if (minutes < 60) return restSeconds ? `${minutes}分${restSeconds}秒` : `${minutes}分`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours}小时${restMinutes}分` : `${hours}小时`;
}

function formatDurationMs(value) {
  const safeMs = Math.max(0, Number(value || 0));
  if (!Number.isFinite(safeMs) || safeMs <= 0) return "0 ms";
  if (safeMs < 1000) return `${safeMs} ms`;
  const seconds = safeMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
  return formatDuration(Math.round(seconds));
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

function openAdminJobResult(jobId) {
  if (!jobId) return;
  openImageSource(`/api/admin/image-jobs/${jobId}/result`);
}

function downloadAdminJobResult(jobId) {
  if (!jobId) return;
  openImageSource(`/api/admin/image-jobs/${jobId}/download`);
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
    const response = await fetch(cacheBust(style.image, style.imageUpdatedAt));
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

function cacheBust(path, version = "") {
  const normalizedPath = String(path || "");
  if (!normalizedPath) return "";
  const separator = normalizedPath.includes("?") ? "&" : "?";
  const safeVersion = String(version || "").trim();
  return safeVersion ? `${normalizedPath}${separator}v=${encodeURIComponent(safeVersion)}` : normalizedPath;
}

createRoot(document.getElementById("root")).render(<App />);
