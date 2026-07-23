import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, Clipboard, Download, Eye, GripVertical, HardDrive, Home, ImageUp, Layers3, ListTodo, LoaderCircle, Pencil, Plus, QrCode, RefreshCw, Save, Search, Settings, Sparkles, Trash2, X } from "lucide-react";
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
const ORDER_ADDRESS_STORAGE_PREFIX = "petpaint-order-address:";
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
  route: "images",
  visionModel: "gpt-5.4-mini",
  enabled: true
};
const API_PROVIDER_ROUTE_OPTIONS = [
  { value: "images", label: "Images API (/images/*)" },
  { value: "responses", label: "Responses API (/responses)" },
  { value: "chat_completions", label: "Chat Completions (/chat/completions)" }
];
const API_FAILOVER_MODE_OPTIONS = [
  { value: "auto", label: "高优先级失败后，自动切换到更低优先级供应商" },
  { value: "stop", label: "高优先级失败后，直接报错退出" }
];
const MAX_ORDER_ITEM_QUANTITY = 99;
const MAX_BEAN_PURCHASE_COUNT = 1000;
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
const MIN_PUBLIC_DRAW_COUNT = 1;
const MAX_PUBLIC_STYLE_SELECTION = 6;
const DEFAULT_PUBLIC_DRAW_COUNT = 2;
const SUBJECT_TYPE_LABELS = {
  both: "通用",
  person: "人物",
  pet: "宠物",
  mixed: "人+宠",
  other: "其他"
};
const DRAW_CARD_SUBJECT_OPTIONS = [
  { value: "person", label: "仅人物" },
  { value: "pet", label: "仅宠物" },
  { value: "mixed", label: "人+宠" },
  { value: "other", label: "其他" }
];
const DRAW_CARD_COUNT_OPTIONS = [1, 2, 4];

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
const BODY_BOOK_SESSION_STORAGE_KEY = "pg.body-book.session-id";
const BODY_BOOK_THEME_FALLBACKS = [
  { id: "body", name: "身体认知书", englishName: "My First Body", title: "我的第一本身体认知书" },
  { id: "career", name: "职业认知书", englishName: "My First Jobs", title: "我的第一本职业认知书" },
  { id: "color", name: "颜色认知书", englishName: "My First Colors", title: "我的第一本颜色认知书" },
  { id: "emotion", name: "情绪认知书", englishName: "My First Feelings", title: "我的第一本情绪认知书" },
  { id: "transport", name: "交通工具认知书", englishName: "My First Vehicles", title: "我的第一本交通工具认知书" },
  { id: "animal", name: "动物认知书", englishName: "My First Animals", title: "我的第一本动物认知书" },
  { id: "daily", name: "日常行为认知书", englishName: "My First Daily Routines", title: "我的第一本日常行为认知书" }
];
const LATEST_MANUAL_ORDER_STORAGE_KEY = "pg.fridge.latest-manual-order";
const DRAW_CARD_EXPERIENCE_CONFIG = {
  route: "public-draw",
  experienceType: "draw-card",
  apiBase: "/api/draw-card",
  sessionStorageKey: DRAW_CARD_SESSION_STORAGE_KEY,
  themeClass: "theme-draw-card",
  titleKicker: "",
  title: "AI小画家",
  subtitle: "上传照片，一键制作AI小画冰箱贴",
  waitingLines: ["总计需要约 5 分钟，请耐心等待。", "请保持当前页面开启，结果会在完成后自动出现。", "正在制作 AI 小画，请耐心等待。"],
  waitingFallback: "总计需要约 5 分钟，请耐心等待。",
  startButtonIdle: "我要抽卡",
  startButtonLoading: "任务启动中",
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
  if (pathname === "/draw/order") return "public-draw-checkout";
  if (pathname === "/fridge/orders") return "public-fridge-orders";
  if (pathname.startsWith("/fridge/orders/")) return "public-fridge-order";
  if (pathname === "/book/orders") return "public-body-book-orders";
  if (pathname.startsWith("/book/orders/")) return "public-body-book-order";
  if (pathname === "/fridge") return "public-fridge";
  if (pathname === "/book") return "public-body-book";
  if (pathname === "/gallery") return "admin-gallery";
  if (pathname === "/admin" || pathname === "/admin/") return "admin-gallery";
  if (pathname === "/admin/login") return "admin-login";
  if (pathname === "/admin/orders") return "admin-orders";
  if (/^\/admin\/users\/[^/]+\/clip\/?$/.test(pathname)) return "admin-user-clip";
  if (pathname === "/admin/users") return "admin-users";
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
      "public-body-book": "宝宝的认知书",
      "public-draw-checkout": "选图定制",
      "public-fridge-order": "冰箱贴订单",
      "public-body-book-order": "宝宝的认知书",
      "public-body-book-orders": "宝宝的认知书",
      "public-fridge-orders": "我的冰箱贴订单",
      "admin-api-providers": "API 配置",
      "admin-user-clip": "用户卡夹"
    };
    document.title = titleByRoute[route] || "AI小画家";
  }, [route]);

  function navigate(nextRoute) {
    const pathByRoute = {
      "public-draw": "/",
      "public-fridge": "/fridge",
      "public-body-book": "/book",
      "public-draw-checkout": "/draw/order",
      "public-fridge-orders": "/fridge/orders",
      "public-body-book-orders": "/book/orders",
      "public-fridge-order": window.location.pathname,
      "public-body-book-order": window.location.pathname,
      "admin-gallery": "/gallery",
      "admin-login": "/admin/login",
      "admin-orders": "/admin/orders",
      "admin-users": "/admin/users",
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
  if (route === "public-fridge-order" || route === "public-body-book-order") {
    return <FridgeMagnetOrderPage />;
  }
  if (route === "public-draw-checkout") {
    return <DrawCardCheckoutPage />;
  }
  if (route === "public-fridge-orders") {
    return <FridgeMagnetOrdersPage />;
  }
  if (route === "public-body-book-orders") {
    return <BodyBookOrdersPage />;
  }
  if (route === "public-fridge") {
    return <FridgeMagnetPage />;
  }
  if (route === "public-body-book") {
    return <BodyBookPage />;
  }

  return <AdminApp navigate={navigate} route={route} />;
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="app-shell">
        <section className="workspace order-page">
          <article className="draw-observability-card">
            <p className="eyebrow">Page error</p>
            <h2>页面加载失败</h2>
            <p className="error-note">{this.state.error?.message || "发生了未知错误。"}</p>
            <button className="draw-card-primary" onClick={() => window.location.assign("/fridge")} type="button">返回冰箱贴页</button>
          </article>
        </section>
      </main>
    );
  }
}

function AuthModal({ onAuthenticated, onClose, reloadOnLogin = true }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [mergeableAssets, setMergeableAssets] = useState(null);
  const [pendingAccount, setPendingAccount] = useState(null);
  const [mergeClip, setMergeClip] = useState(true);
  const [mergeBodyBooks, setMergeBodyBooks] = useState(true);

  useEffect(() => {
    if (!resendSeconds) return undefined;
    const timer = window.setInterval(() => setResendSeconds((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  const needsCode = mode === "register" || mode === "reset";
  const purpose = mode === "reset" ? "reset_password" : "register";

  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const payload = await requestEmailCode(email, purpose);
      setResendSeconds(Number(payload.resendAfterSeconds || 60));
      setMessage("验证码已发送，请查收邮箱。");
      if (payload.developmentCode) {
        setCode(String(payload.developmentCode));
        setMessage(`本地验证码：${payload.developmentCode}`);
      }
    } catch (nextError) {
      setError(nextError.message || "验证码发送失败。");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "login") {
        const payload = await loginWithEmail(email, password);
        if (payload.mergeableAssets?.hasAssets) {
          setPendingAccount(payload.account);
          setMergeableAssets(payload.mergeableAssets);
          setMergeClip(Number(payload.mergeableAssets.clipCount || 0) > 0);
          setMergeBodyBooks(Number(payload.mergeableAssets.projectCount ?? payload.mergeableAssets.savedBookCount ?? 0) > 0);
          setMode("merge");
          return;
        }
        onAuthenticated(payload.account);
        if (reloadOnLogin) window.location.reload();
        return;
      }
      if (mode === "register") {
        const payload = await registerWithEmail({ email, username, password, code });
        onAuthenticated(payload.account);
        return;
      }
      await resetPasswordWithEmail({ email, password, code });
      setMode("login");
      setMessage("密码已更新，请使用新密码登录。");
    } catch (nextError) {
      setError(nextError.message || "操作失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  async function finishAssetMerge() {
    if (!pendingAccount) return;
    setBusy(true);
    setError("");
    try {
      if (mergeClip || mergeBodyBooks) await mergeGuestAssets({ mergeClip, mergeBodyBooks });
      onAuthenticated(pendingAccount);
      if (reloadOnLogin) window.location.reload();
    } catch (nextError) {
      setError(nextError.message || "访客资产合并失败，请稍后重试。");
    } finally {
      setBusy(false);
    }
  }

  function closeModal() {
    if (mode === "merge" && pendingAccount) {
      onAuthenticated(pendingAccount);
      if (reloadOnLogin) window.location.reload();
      return;
    }
    onClose();
  }

  return (
    <div className="modal-backdrop draw-card-confirm" onClick={closeModal} role="presentation">
      <section className="draw-card-confirm-panel auth-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="账户登录与注册">
        <button className="icon-button" onClick={closeModal} type="button" aria-label="关闭账户弹窗"><X size={18} /></button>
        <p className="draw-card-kicker">Account</p>
        <h2>{mode === "merge" ? "继承访客内容" : mode === "login" ? "登录" : mode === "register" ? "注册账户" : "找回密码"}</h2>
        <p className="storage-note">{mode === "merge" ? "请选择要转入当前账户的访客内容。币和豆豆不会合并或重置。" : "访客可继续生图和加入卡夹；提交定制订单前需要完成邮箱注册。"}</p>
        {mode === "merge" ? <div className="draw-card-order-form auth-asset-merge">
          {Number(mergeableAssets?.clipCount || 0) > 0 ? <label className="toggle-field"><input checked={mergeClip} onChange={(event) => setMergeClip(event.target.checked)} type="checkbox" /><span>继承卡夹内的 {mergeableAssets.clipCount} 张图片</span></label> : null}
          {Number(mergeableAssets?.projectCount ?? mergeableAssets?.savedBookCount ?? 0) > 0 ? <label className="toggle-field"><input checked={mergeBodyBooks} onChange={(event) => setMergeBodyBooks(event.target.checked)} type="checkbox" /><span>继承“我的认知书”中的 {mergeableAssets.projectCount ?? mergeableAssets.savedBookCount} 个工程</span></label> : null}
          {error ? <p className="error-note">{error}</p> : null}
          <div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={busy} onClick={closeModal} type="button">暂不继承</button><button className="draw-card-primary" disabled={busy} onClick={finishAssetMerge} type="button">{busy ? "转移中" : "确认继承"}</button></div>
        </div> : <form className="draw-card-order-form" onSubmit={submit}>
          <label className="field-label">邮箱<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} type="email" value={email} /></label>
          {mode === "register" ? <label className="field-label">用户名<input autoComplete="username" maxLength="32" onChange={(event) => setUsername(event.target.value)} type="text" value={username} /></label> : null}
          <label className="field-label">{mode === "reset" ? "新密码" : "密码"}<input autoComplete={mode === "login" ? "current-password" : "new-password"} minLength="8" onChange={(event) => setPassword(event.target.value)} type="password" value={password} /></label>
          {needsCode ? (
            <label className="field-label">邮箱验证码
              <span className="auth-code-row"><input inputMode="numeric" maxLength="6" onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} value={code} /><button className="secondary-button" disabled={busy || resendSeconds > 0} onClick={sendCode} type="button">{resendSeconds ? `${resendSeconds}s 后重发` : "获取验证码"}</button></span>
            </label>
          ) : null}
          {error ? <p className="error-note">{error}</p> : null}
          {message ? <p className="success-note">{message}</p> : null}
          <div className="draw-card-confirm-actions">
            {mode === "login" ? (
              <>
                <button className="draw-card-secondary" onClick={() => { setMode("reset"); setError(""); }} type="button">忘记密码</button>
                <button className="draw-card-secondary" onClick={() => { setMode("register"); setError(""); }} type="button">注册</button>
              </>
            ) : <button className="draw-card-secondary" onClick={() => { setMode("login"); setError(""); }} type="button">返回登录</button>}
            <button className="draw-card-primary" disabled={busy} type="submit">{busy ? "处理中" : mode === "login" ? "登录" : mode === "register" ? "注册并继续" : "重设密码"}</button>
          </div>
        </form>}
      </section>
    </div>
  );
}

function isInsufficientBalanceMessage(message) {
  return /(?:币|豆豆).{0,8}不足|不足.{0,8}(?:币|豆豆)/.test(String(message || ""));
}

function BalanceInsufficientModal({ message, onClose, useBodyBookTheme = false }) {
  const isBeanBalance = String(message || "").includes("豆豆");
  return (
    <div className="modal-backdrop draw-card-confirm" onClick={onClose} role="presentation">
      <section className={`draw-card-confirm-panel balance-insufficient-panel${useBodyBookTheme ? " body-book-balance-insufficient-panel" : ""}`} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={isBeanBalance ? "豆豆不足" : "币不足"}>
        <button className="icon-button" onClick={onClose} type="button" aria-label="关闭提示"><X size={18} /></button>
        <p className="draw-card-kicker">Balance</p>
        <h2>{isBeanBalance ? "豆豆不足" : "币不足"}</h2>
        <p className="storage-note">{message}</p>
        <div className="draw-card-confirm-actions"><button className="draw-card-primary" onClick={onClose} type="button">我知道了</button></div>
      </section>
    </div>
  );
}

function BeanPurchaseModal({ beanCount, busy, error, payment, purchase, onClose, onCountChange, onRestart, onRetry, onSubmit }) {
  const safeCount = Math.min(Math.max(Math.trunc(Number(beanCount || 0)), 0), MAX_BEAN_PURCHASE_COUNT);
  const isPaid = purchase?.status === "paid";
  const isExpired = purchase?.status === "cancelled" || (purchase?.expiresAt && Date.parse(purchase.expiresAt) <= Date.now());
  const isManual = payment?.channel === "manual_collection";
  const isNative = payment?.channel === "wechat_native" && payment?.codeUrl;
  return (
    <div className="modal-backdrop draw-card-confirm" onClick={() => !busy && onClose()} role="presentation">
      <section className="draw-card-confirm-panel body-book-bean-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="购买豆豆">
        <button className="icon-button" disabled={busy} onClick={onClose} type="button" aria-label="关闭购买豆豆"><X size={18} /></button>
        <p className="draw-card-kicker">Buy beans</p>
        <h2>购买豆豆</h2>
        <p className="storage-note">1 元 = 1 个豆豆。成功购买的金额可抵扣认知书订单，每单最多抵扣 40 元。</p>
        {isPaid ? <><p className="success-note">购买成功，{purchase.beanCount} 个豆豆已到账。</p><div className="draw-card-confirm-actions"><button className="draw-card-primary" onClick={onClose} type="button">完成</button></div></> : isExpired ? <><p className="error-note">该购买单已过期，未产生扣款。请重新创建购买单后再支付。</p><div className="draw-card-confirm-actions"><button className="draw-card-secondary" onClick={onClose} type="button">关闭</button><button className="draw-card-primary" disabled={busy} onClick={onRestart} type="button">重新购买</button></div></> : isManual ? <><article className="manual-payment-guide"><strong>请扫描商户收款码付款</strong><img alt="微信商户收款码" className="manual-payment-qr" src="/payment/wechat-merchant-collection.png" /><p>应付金额 {formatCurrencyCents(purchase?.amountCents || safeCount * 100)}</p><p className="body-book-bean-purchase-discount-note">下单实体认知书自动获得 {formatCurrencyCents(purchase?.amountCents || safeCount * 100)} 优惠，每笔订单优惠上限40元</p><p>购买单号：{purchase?.purchaseNo || "--"}</p><small>付款后管理员确认到账，豆豆将自动发放。</small></article></> : isNative ? <><article className="native-payment-panel"><h3>请使用微信扫码付款</h3><p className="storage-note">应付金额 {formatCurrencyCents(purchase?.amountCents || safeCount * 100)}，扫码后无需手动输入金额。</p><p className="body-book-bean-purchase-discount-note">下单实体认知书自动获得 {formatCurrencyCents(purchase?.amountCents || safeCount * 100)} 优惠，每笔订单优惠上限40元</p><img alt="购买豆豆微信支付二维码" className="native-payment-qr" src={createQrSvgDataUrl(payment.codeUrl, { margin: 1 })} /><p className="storage-note">支付成功后豆豆会自动到账。</p></article></> : <><div className="body-book-wallet-actions"><button className="draw-card-secondary" disabled={busy || Boolean(purchase)} onClick={() => onCountChange(10)} type="button">10 豆</button><button className="draw-card-secondary" disabled={busy || Boolean(purchase)} onClick={() => onCountChange(20)} type="button">20 豆</button><button className="draw-card-secondary" disabled={busy || Boolean(purchase)} onClick={() => onCountChange(40)} type="button">40 豆</button><button className="draw-card-secondary" disabled={busy || Boolean(purchase)} onClick={() => onCountChange(100)} type="button">100 豆</button></div><label className="body-book-wallet-field"><span>购买数量（1–1000 个）</span><input disabled={busy || Boolean(purchase)} min="1" max={MAX_BEAN_PURCHASE_COUNT} onChange={(event) => onCountChange(event.target.value)} type="number" value={beanCount} /></label><p className="body-book-bean-balance">应付 <strong>{formatCurrencyCents(safeCount * 100)}</strong></p><p className="body-book-bean-purchase-discount-note">下单实体认知书自动获得 {formatCurrencyCents(safeCount * 100)} 优惠，每笔订单优惠上限40元</p><p className="storage-note">赠送豆豆、邀请豆豆及下单赠豆不参与认知书优惠抵扣。</p><div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={busy} onClick={onClose} type="button">取消</button><button className="draw-card-primary" disabled={busy || safeCount < 1} onClick={purchase ? onRetry : onSubmit} type="button">{busy ? "处理中" : purchase ? "重新发起支付" : `支付 ${formatCurrencyCents(safeCount * 100)}`}</button></div></>}
        {error ? <p className="error-note">{error}</p> : null}
      </section>
    </div>
  );
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

  function openUserClip(userId) {
    const path = `/admin/users/${encodeURIComponent(userId)}/clip`;
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }

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
    return styles.filter((style) => `${style.title || ""} ${style.tags.join(" ")} ${style.prompt}`.toLowerCase().includes(keyword));
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
        title: "新风格",
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
          <div className="topbar-main">
            <p className="eyebrow">Prompt reference board</p>
            <h1>后台管理</h1>
            <div className="subtle-entry-row" aria-label="公开页面入口">
              <span>公开页</span>
              <a className="subtle-entry-link" href="/">
                抽卡页
              </a>
              <a className="subtle-entry-link" href="/fridge">
                冰箱贴页
              </a>
              <a className="subtle-entry-link" href="/book">
                认知书页
              </a>
            </div>
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
            <button className="nav-button" onClick={() => navigate("admin-users")} type="button">
              <Eye size={18} />
              <span>用户管理</span>
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
        ) : route === "admin-users" ? (
          <UserAdminPage onOpenClip={openUserClip} />
        ) : route === "admin-user-clip" ? (
          <UserClipAdminPage onBack={() => navigate("admin-users")} userId={getAdminUserClipId()} />
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
              <div>
                <h2>{getStyleDisplayName(activePrompt)}</h2>
                <div className="tag-row">
                  {activePrompt.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
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

function LegacyBodyBookPage() {
  const [themes, setThemes] = useState(BODY_BOOK_THEME_FALLBACKS);
  const [bodyBookBillingEnabled, setBodyBookBillingEnabled] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [referenceFile, setReferenceFile] = useState(null);
  const [referencePreviewUrl, setReferencePreviewUrl] = useState("");
  const [visitorState, setVisitorState] = useState(null);
  const [inviteCode, setInviteCode] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [orderConfig, setOrderConfig] = useState(null);
  const [session, setSession] = useState(null);
  const [sessionId, setSessionId] = useState(() => {
    try { return window.localStorage.getItem(BODY_BOOK_SESSION_STORAGE_KEY) || ""; } catch { return ""; }
  });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState("");
  const [activeItem, setActiveItem] = useState(null);
  const [regenerationDraft, setRegenerationDraft] = useState(null);
  const [regenerationPrompt, setRegenerationPrompt] = useState("");
  const [regenerationReference, setRegenerationReference] = useState(null);
  const [regenerationReferencePreviewUrl, setRegenerationReferencePreviewUrl] = useState("");
  const [savedBooks, setSavedBooks] = useState([]);
  const [libraryBook, setLibraryBook] = useState(null);
  const [isSavingBook, setIsSavingBook] = useState(false);
  const [deletingBookId, setDeletingBookId] = useState("");

  function applySession(nextSession) {
    if (!nextSession?.sessionId) return;
    setSession(nextSession);
    setSessionId(nextSession.sessionId);
    try { window.localStorage.setItem(BODY_BOOK_SESSION_STORAGE_KEY, nextSession.sessionId); } catch {}
  }

  function clearSession() {
    setSession(null);
    setSessionId("");
    setActiveItem(null);
    try { window.localStorage.removeItem(BODY_BOOK_SESSION_STORAGE_KEY); } catch {}
  }

  async function loadSavedBooks() {
    try {
      const payload = await fetchSavedBodyBooks();
      setSavedBooks(payload.books || []);
    } catch {
      setSavedBooks([]);
    }
  }

  useEffect(() => {
    if (!referenceFile) {
      setReferencePreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(referenceFile);
    setReferencePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [referenceFile]);

  useEffect(() => {
    if (!regenerationReference) {
      setRegenerationReferencePreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(regenerationReference);
    setRegenerationReferencePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [regenerationReference]);

  useEffect(() => {
    let isActive = true;
    fetchVisitorState().then((payload) => {
      if (isActive) setVisitorState(payload);
    }).catch(() => {
      if (isActive) setVisitorState(null);
    });
    fetchOrderConfig().then((payload) => { if (isActive) setOrderConfig(payload); }).catch(() => {});
    loadSavedBooks();
    fetchBodyBookThemes().then((payload) => {
      if (!isActive) return;
      if (payload?.themes?.length) setThemes(payload.themes);
      setBodyBookBillingEnabled(Boolean(payload?.billingEnabled));
    }).catch(() => {});
    const storedId = (() => {
      try { return window.localStorage.getItem(BODY_BOOK_SESSION_STORAGE_KEY) || ""; } catch { return ""; }
    })();
    const load = storedId ? fetchBodyBookSession(storedId) : null;
    load?.then((payload) => {
      if (isActive && payload?.sessionId && ["cover_generating", "cover_review", "cards_generating"].includes(payload.stage)) applySession(payload);
    }).catch(() => {});
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    if (!sessionId || !["cover_generating", "cards_generating"].includes(session?.stage)) return undefined;
    let isActive = true;
    const refresh = () => fetchBodyBookSession(sessionId)
      .then((payload) => { if (isActive) applySession(payload); })
      .catch((nextError) => { if (isActive) setError(nextError.message || "读取认知书状态失败，请稍后再试。"); });
    refresh();
    const timer = window.setInterval(refresh, 2200);
    return () => { isActive = false; window.clearInterval(timer); };
  }, [session?.stage, sessionId]);

  useEffect(() => {
    if (!session?.sessionId) return undefined;
    let isActive = true;
    fetchVisitorState()
      .then((payload) => {
        if (isActive) setVisitorState(payload);
      })
      .catch(() => {});
    return () => { isActive = false; };
  }, [session?.chargedCount, session?.cover?.status, session?.sessionId, session?.summary?.cards?.succeeded]);

  async function startCover() {
    if (!referenceFile || !selectedTheme) return;
    setIsSubmitting(true);
    setError("");
    try {
      const account = await fetchVisitorState();
      setVisitorState(account);
      if (!account?.authenticated) {
        if (account?.authorizationUrl) window.location.assign(account.authorizationUrl);
        else throw new Error("请先完成账户授权后再开始制作。");
        return;
      }
      const prepared = await prepareReferenceForUpload({ id: "body-book-reference", file: referenceFile });
      const formData = new FormData();
      formData.append("image", prepared.file);
      formData.append("themeId", selectedTheme.id);
      const payload = await createBodyBookSession(formData);
      applySession(payload);
    } catch (nextError) {
      setError(nextError.message || "创建认知书失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function redeemBookInvite() {
    const code = inviteCode.trim();
    if (!code) return;
    setIsSubmitting(true);
    setError("");
    try {
      const payload = await redeemInviteCode(code);
      setVisitorState(payload);
      setInviteCode("");
    } catch (nextError) {
      setError(nextError.message || "邀请码兑换失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmCover() {
    if (!sessionId) return;
    setIsSubmitting(true);
    setError("");
    try {
      const payload = await confirmBodyBookCover(sessionId);
      applySession(payload);
      fetchVisitorState().then(setVisitorState).catch(() => {});
    } catch (nextError) {
      setError(nextError.message || "启动认知卡生成失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openRegenerationDialog(card) {
    if (!card?.key) return;
    setRegenerationDraft(card);
    setRegenerationPrompt(card.prompt || "");
    setRegenerationReference(null);
    setError("");
    fetchBodyBookSession(sessionId)
      .then((payload) => {
        applySession(payload);
        const latestCard = payload.cards?.find((item) => item.key === card.key);
        if (!latestCard) return;
        setRegenerationDraft(latestCard);
        setRegenerationPrompt(latestCard.prompt || "");
      })
      .catch(() => {});
  }

  function closeRegenerationDialog() {
    if (regeneratingKey) return;
    setRegenerationDraft(null);
    setRegenerationPrompt("");
    setRegenerationReference(null);
  }

  async function regenerateCard() {
    if (!sessionId || !regenerationDraft?.key) return;
    setRegeneratingKey(regenerationDraft.key);
    setError("");
    try {
      const formData = new FormData();
      formData.append("prompt", regenerationPrompt);
      if (regenerationReference) formData.append("image", regenerationReference);
      const payload = await regenerateBodyBookCard(sessionId, regenerationDraft.key, formData);
      applySession(payload);
      fetchVisitorState().then(setVisitorState).catch(() => {});
      setRegenerationDraft(null);
      setRegenerationPrompt("");
      setRegenerationReference(null);
    } catch (nextError) {
      setError(nextError.message || "重新生成认知卡失败，请稍后再试。");
    } finally {
      setRegeneratingKey("");
    }
  }

  function selectReference(file) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("请上传 JPG、PNG 或 WebP 图片。");
      return;
    }
    clearSession();
    setReferenceFile(file);
    setError("");
  }

  function restart() {
    clearSession();
    setReferenceFile(null);
    setSelectedTheme(null);
    setError("");
  }

  async function saveBook() {
    if (!sessionId) return;
    setIsSavingBook(true);
    setError("");
    try {
      const payload = await saveBodyBook(sessionId);
      await loadSavedBooks();
      setLibraryBook(payload.book || null);
      clearSession();
    } catch (nextError) {
      setError(nextError.message || "保存认知书失败，请稍后再试。");
    } finally {
      setIsSavingBook(false);
    }
  }

  async function deleteSavedBook(book) {
    if (!book?.sessionId || deletingBookId) return;
    if (!window.confirm(`确定删除《${book.title}》吗？删除后无法恢复。`)) return;
    setDeletingBookId(book.sessionId);
    setError("");
    try {
      await deleteBodyBook(book.sessionId);
      setSavedBooks((current) => current.filter((item) => item.sessionId !== book.sessionId));
      if (libraryBook?.sessionId === book.sessionId) setLibraryBook(null);
    } catch (nextError) {
      setError(nextError.message || "删除认知书失败，请稍后再试。");
    } finally {
      setDeletingBookId("");
    }
  }

  const allItems = session ? [session.cover, ...(session.cards || [])] : [];
  const cardSummary = session?.summary?.cards;
  const cardCount = Number(session?.theme?.pageCount || session?.cards?.length || selectedTheme?.pageCount || 0);
  const isCoverReview = session?.stage === "cover_review";
  const isGenerating = ["cover_generating", "cards_generating"].includes(session?.stage);
  const canDownloadAll = allItems.length === cardCount + 1 && allItems.every((item) => item?.status === "succeeded" && item?.result?.imageUrl);
  const billingEnabled = session?.billingEnabled ?? bodyBookBillingEnabled;
  const regenerationReferenceUrl = regenerationDraft
    ? regenerationDraft.referenceUrl || session?.referenceUrl || `/api/body-book/sessions/${encodeURIComponent(sessionId)}/cards/${encodeURIComponent(regenerationDraft.key)}/reference`
    : "";

  return (
    <main className="body-book-page">
      <header className="body-book-header">
        <div>
          <p className="body-book-kicker">Baby body book</p>
          <h1>{session?.theme?.englishName || selectedTheme?.englishName || "My First Book"}</h1>
          <p>{session?.theme ? `正在制作：${session.theme.name}` : selectedTheme ? `正在制作：${selectedTheme.name}` : "选择一个主题，制作一套中英双语宝宝认知书。"}</p>
        </div>
        <div className="body-book-header-actions">
          {!session && selectedTheme ? <button className="draw-card-secondary body-book-back-to-themes" disabled={isSubmitting} onClick={() => { setSelectedTheme(null); setReferenceFile(null); setError(""); }} type="button">返回主题选择</button> : null}
          <div className="body-book-user-area">
            <button className="draw-card-secondary body-book-account-button" onClick={() => visitorState?.account?.isRegistered ? setShowUserMenu((current) => !current) : setShowAuthModal(true)} type="button">{visitorState?.account?.isRegistered ? (visitorState.account.username || "我的账户") : "登录 / 注册"}</button>
            {showUserMenu ? <div className="body-book-user-menu"><button onClick={async () => { await logoutCurrentAccount(); setShowUserMenu(false); setVisitorState(await fetchVisitorState()); }} type="button">退出登录</button></div> : null}
          </div>
        </div>
      </header>

      {!session && !selectedTheme ? (
        <section className="body-book-theme-home body-book-theme-layout">
          <div className="body-book-theme-content">
            <div className="body-book-theme-head"><span className="body-book-step">01</span><h2>选择认知主题</h2><p>每本认知书包含一张封面和按主题扩展的认知卡。</p></div>
            <div className="body-book-theme-grid">{themes.map((theme, index) => <button className="body-book-theme-card" key={theme.id} onClick={() => { setSelectedTheme(theme); setError(""); }} type="button"><img alt={`${theme.name} 例图`} className="body-book-theme-preview" decoding="async" loading={index > 3 ? "lazy" : "eager"} src={`/body-book-samples/${encodeURIComponent(theme.id)}-cover-thumbnail.webp`} /><span className="body-book-theme-index">{String(index + 1).padStart(2, "0")}</span><strong>{theme.name}</strong><small>{theme.englishName}</small></button>)}</div>
          </div>
          <aside className="body-book-wallet-panel">
            <span className="body-book-wallet-label">我的豆豆</span>
            <strong>{visitorState ? `${visitorState.account?.beanBalance || 0} 个豆豆` : "--"}</strong>
            <p>{billingEnabled ? "认知书封面、内页和重新生成均消耗豆豆。" : "内测阶段，认知书暂不消耗豆豆。"}</p>
            <label className="body-book-wallet-field"><span>邀请码</span><input disabled={isSubmitting} onChange={(event) => setInviteCode(event.target.value)} placeholder="输入邀请码" value={inviteCode} /></label>
            <div className="body-book-wallet-actions">
              <button className="draw-card-primary" disabled={isSubmitting || !inviteCode.trim()} onClick={redeemBookInvite} type="button">兑换邀请码</button>
              <button className="draw-card-secondary" onClick={() => setShowContactModal(true)} type="button">联系客服</button>
            </div>
          </aside>
        </section>
      ) : null}

      {!session && selectedTheme ? (
        <section className="body-book-upload-layout">
          <label className={`body-book-upload ${referencePreviewUrl ? "has-image" : ""}`} htmlFor="body-book-input">
            {referencePreviewUrl ? <img alt="待制作的宝宝照片" src={referencePreviewUrl} /> : <><ImageUp size={30} /><strong>上传宝宝照片</strong><span>支持 JPG、PNG、WebP</span></>}
            <input accept="image/png,image/jpeg,image/webp" id="body-book-input" onChange={(event) => { selectReference(event.target.files?.[0] || null); event.target.value = ""; }} type="file" />
          </label>
          <div className="body-book-upload-copy">
            <span className="body-book-step">02</span>
            <h2>上传宝宝照片</h2>
            <p>将以这张照片制作《{selectedTheme.name}》封面，确认后再生成该主题的全部认知卡。</p>
            <button className="draw-card-primary" disabled={!referenceFile || isSubmitting} onClick={startCover} type="button">
              {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
              <span>{isSubmitting ? "正在提交" : billingEnabled ? "生成封面（1 豆豆）" : "生成封面（内测免费）"}</span>
            </button>
          </div>
        </section>
      ) : null}

      {session ? (
        <section className="body-book-workspace">
          <div className="body-book-status-row">
            <div><span className="body-book-step">{isCoverReview ? "02" : "03"}</span><h2>{isCoverReview ? "确认封面效果" : isGenerating ? session.message : "认知书成品"}</h2></div>
            <div className="body-book-page-actions">
              <button className="draw-card-secondary" onClick={restart} type="button"><Home size={17} /><span>主页</span></button>
              <button className="draw-card-secondary" disabled={!canDownloadAll || isSavingBook} onClick={saveBook} type="button"><Save size={17} /><span>{isSavingBook ? "保存中" : session?.savedAt ? "已保存全书" : "保存全书"}</span></button>
            </div>
          </div>
          {error ? <p className="error-note">{error}</p> : null}
          {session?.billingError ? <p className="error-note">{session.billingError}</p> : null}

          {isCoverReview ? (
            <div className="body-book-cover-review">
              <BodyBookItem item={session.cover} onOpen={setActiveItem} />
              <div className="body-book-confirm-copy"><p>封面满意后，将继续生成 {cardCount} 张认知卡。</p><button className="draw-card-primary" disabled={isSubmitting} onClick={confirmCover} type="button">{isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Check size={18} />}<span>{billingEnabled ? `确认并生成 ${cardCount} 页（${cardCount} 豆豆）` : `确认并生成 ${cardCount} 页（内测免费）`}</span></button></div>
            </div>
          ) : (
            <>
              <p className="body-book-progress">已完成 {Number(cardSummary?.succeeded || 0)} / {cardCount} 张认知卡。{session?.mockMode ? (billingEnabled ? "当前为开发模拟，仍按规则扣除豆豆。" : "当前为开发模拟，不调用图片 API，也不会扣豆豆。") : billingEnabled ? "封面和每张卡片均可单独下载。" : "内测阶段，图片生成不扣豆豆。"}</p>
              <div className="body-book-grid">
                {allItems.map((item) => <BodyBookItem item={item} key={`${item.key}-${item.jobId || "pending"}`} onOpen={setActiveItem} onRegenerate={item.key === "cover" ? null : openRegenerationDialog} regenerating={regeneratingKey === item.key} />)}
              </div>
            </>
          )}
        </section>
      ) : null}

      {!session && !selectedTheme ? (
        <section className="body-book-library">
          <div className="body-book-library-head"><span className="body-book-step">MY BOOKS</span><h2>我的认知书</h2></div>
          {error ? <p className="error-note">{error}</p> : null}
          {savedBooks.length ? <div className="body-book-library-grid">{savedBooks.map((book) => {
            return <article className="body-book-library-item" key={book.sessionId}>
              <button className="body-book-library-cover" onClick={() => setLibraryBook(book)} type="button">
                <img alt={`${book.title} 封面`} src={book.cover?.result?.previewUrl || book.cover?.result?.imageUrl} />
                <span>{book.title}</span><small>查看全书</small>
              </button>
              <button aria-label={`删除《${book.title}》`} className="body-book-library-delete icon-button" disabled={deletingBookId === book.sessionId} onClick={() => deleteSavedBook(book)} title="删除" type="button">{deletingBookId === book.sessionId ? <LoaderCircle className="spin" size={16} /> : <X size={17} />}</button>
            </article>;
          })}</div> : <p className="body-book-library-empty">保存完成的认知书后，会在这里展示封面和内页。</p>}
        </section>
      ) : null}

      {libraryBook ? (
        <div className="modal-backdrop body-book-library-modal" onClick={() => setLibraryBook(null)} role="presentation">
          <section className="body-book-library-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${libraryBook.title} 全书`}>
            <button className="icon-button" onClick={() => setLibraryBook(null)} type="button" aria-label="关闭全书预览"><X size={18} /></button>
            <div className="body-book-library-panel-head"><div><p className="body-book-kicker">My body book</p><h2>{libraryBook.title}</h2></div><button className="draw-card-primary" onClick={() => downloadBodyBook(libraryBook)} type="button"><Download size={17} /><span>下载全书</span></button></div>
            <div className="body-book-library-panel-grid">{[libraryBook.cover, ...(libraryBook.cards || [])].map((item) => <BodyBookItem item={item} key={`${libraryBook.sessionId}-${item.key}`} onOpen={setActiveItem} />)}</div>
          </section>
        </div>
      ) : null}

      {activeItem?.result?.imageUrl ? (
        <div className="modal-backdrop body-book-lightbox" onClick={() => setActiveItem(null)} role="presentation">
          <section className="body-book-lightbox-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
            <button className="icon-button" onClick={() => setActiveItem(null)} type="button" aria-label="关闭预览"><X size={18} /></button>
            <img alt={activeItem.title} src={activeItem.result.imageUrl} />
            <div><strong>{activeItem.title}</strong><a className="draw-card-primary" download={getBodyBookDownloadName(activeItem)} href={activeItem.result.imageUrl}><Download size={17} /><span>下载图片</span></a></div>
          </section>
        </div>
      ) : null}

      {regenerationDraft ? (
        <div className="modal-backdrop body-book-regenerate-modal" onClick={closeRegenerationDialog} role="presentation">
          <section className="body-book-regenerate-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`重新生成${regenerationDraft.title}`}>
            <button className="icon-button" disabled={Boolean(regeneratingKey)} onClick={closeRegenerationDialog} type="button" aria-label="关闭重新生成编辑"><X size={18} /></button>
            <div><p className="body-book-kicker">Regenerate page</p><h2>重新生成 {regenerationDraft.title}</h2></div>
            <div className="body-book-regenerate-editor">
              <label className="body-book-reference-picker" htmlFor="body-book-regenerate-reference">
                <span>参考图</span>
                {regenerationReferencePreviewUrl || regenerationReferenceUrl ? <img alt="当前参考图" src={regenerationReferencePreviewUrl || regenerationReferenceUrl} /> : <div className="body-book-reference-empty"><ImageUp size={22} /><span>选择参考图</span></div>}
                <input accept="image/png,image/jpeg,image/webp" id="body-book-regenerate-reference" onChange={(event) => { const file = event.target.files?.[0] || null; if (file && !["image/jpeg", "image/png", "image/webp"].includes(file.type)) { setError("请上传 JPG、PNG 或 WebP 图片。"); return; } setRegenerationReference(file); event.target.value = ""; }} type="file" />
                <small>点击替换本页参考图</small>
              </label>
              <label className="body-book-prompt-editor">提示词<textarea maxLength={6000} onChange={(event) => setRegenerationPrompt(event.target.value)} value={regenerationPrompt} /></label>
            </div>
            <div className="body-book-regenerate-actions"><button className="draw-card-secondary" disabled={Boolean(regeneratingKey)} onClick={closeRegenerationDialog} type="button">取消</button><button className="draw-card-primary" disabled={Boolean(regeneratingKey)} onClick={regenerateCard} type="button">{regeneratingKey ? <LoaderCircle className="spin" size={18} /> : <RefreshCw size={18} />}<span>{billingEnabled ? "继续生成（1 豆豆）" : session?.mockMode ? "继续生成（模拟）" : "继续生成（内测免费）"}</span></button></div>
          </section>
        </div>
      ) : null}

      <footer className="body-book-page-footer">
        <a className="body-book-admin-entry" href="/admin" aria-label="进入后台管理">
          后台入口
        </a>
      </footer>

      {showAuthModal ? <AuthModal onAuthenticated={async () => { setShowAuthModal(false); setVisitorState(await fetchVisitorState()); await loadSavedBooks(); }} onClose={() => setShowAuthModal(false)} /> : null}
      {showContactModal ? <div className="modal-backdrop draw-card-confirm" onClick={() => setShowContactModal(false)} role="presentation"><section className="draw-card-confirm-panel draw-card-contact-panel body-book-contact-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><button className="icon-button" onClick={() => setShowContactModal(false)} type="button" aria-label="关闭弹窗"><X size={18} /></button><div className="draw-card-contact-copy"><h3>联系客服</h3><p>请加微信</p><button className="draw-card-contact-id" onClick={() => copyText(getContactWechatId(orderConfig))} type="button"><span>{getContactWechatId(orderConfig)}</span><Clipboard size={16} /></button></div></section></div> : null}
    </main>
  );
}

function BodyBookItem({ item, onOpen, onRegenerate, regenerating = false }) {
  const succeeded = item?.status === "succeeded" && item?.result?.imageUrl;
  const pending = ["queued", "running"].includes(item?.status);
  return (
    <article className={`body-book-item ${pending ? "is-pending" : ""} ${item?.status === "failed" ? "is-failed" : ""}`}>
      {succeeded ? <button className="body-book-item-media" onClick={() => onOpen(item)} type="button"><img alt={item.title} src={item.result.previewUrl || item.result.imageUrl} /></button> : <div className="body-book-placeholder">{pending ? <LoaderCircle className="spin" size={24} /> : <AlertTriangle size={24} />}<strong>{pending ? "正在生成" : item?.status === "not_started" ? "等待封面确认" : "生成失败"}</strong><span>{item?.errorMessage || (pending ? "图片完成后会自动出现。" : "")}</span></div>}
      <div className="body-book-item-meta"><div><strong>{item.title}</strong></div>{succeeded ? <div className="body-book-item-actions"><button className="icon-button" onClick={() => onOpen(item)} title="查看大图" type="button"><Eye size={17} /></button><a className="icon-button" download={getBodyBookDownloadName(item)} href={item.result.imageUrl} title="下载图片"><Download size={17} /></a>{onRegenerate ? <button className="icon-button" disabled={regenerating} onClick={() => onRegenerate(item)} title="重新生成" type="button">{regenerating ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}</button> : null}</div> : onRegenerate && !pending && item?.status !== "not_started" ? <button className="body-book-regenerate" disabled={regenerating} onClick={() => onRegenerate(item)} type="button">{regenerating ? "生成中" : "重新生成"}</button> : null}</div>
    </article>
  );
}

function getBodyBookDownloadName(item) {
  const extension = item?.result?.mimeType === "image/svg+xml" ? "svg" : "png";
  return `my-first-body-${item?.key || "page"}.${extension}`;
}

function downloadBodyBook(book) {
  const pages = [book?.cover, ...(book?.cards || [])].filter((item) => item?.result?.imageUrl);
  pages.forEach((item, index) => {
    window.setTimeout(() => {
      const link = document.createElement("a");
      link.href = item.result.imageUrl;
      link.download = getBodyBookDownloadName(item);
      document.body.appendChild(link);
      link.click();
      link.remove();
    }, index * 180);
  });
}

function BodyBookPage() {
  const [themes, setThemes] = useState(BODY_BOOK_THEME_FALLBACKS);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [visitorState, setVisitorState] = useState(null);
  const [orderConfig, setOrderConfig] = useState(null);
  const [bodyBookOrders, setBodyBookOrders] = useState([]);
  const [savedBooks, setSavedBooks] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [project, setProject] = useState(null);
  const [draftKeys, setDraftKeys] = useState([]);
  const [draftReference, setDraftReference] = useState(null);
  const [draftReferencePreview, setDraftReferencePreview] = useState("");
  const [draftPageReferences, setDraftPageReferences] = useState({});
  const [draftPageReferencePreviews, setDraftPageReferencePreviews] = useState({});
  const [pagePrompts, setPagePrompts] = useState({});
  const [dirtyPromptKeys, setDirtyPromptKeys] = useState([]);
  const [error, setError] = useState("");
  const [activeItem, setActiveItem] = useState(null);
  const [showActivePromptEditor, setShowActivePromptEditor] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showBeanInfo, setShowBeanInfo] = useState(false);
  const [showBeanPurchase, setShowBeanPurchase] = useState(false);
  const [beanPurchaseCount, setBeanPurchaseCount] = useState(40);
  const [beanPurchase, setBeanPurchase] = useState(null);
  const [beanPurchasePayment, setBeanPurchasePayment] = useState(null);
  const [beanPurchaseBusy, setBeanPurchaseBusy] = useState(false);
  const [beanPurchaseError, setBeanPurchaseError] = useState("");
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralUrl, setReferralUrl] = useState("");
  const [referralNotice, setReferralNotice] = useState("");
  const [referralError, setReferralError] = useState("");
  const [showBookCheckout, setShowBookCheckout] = useState(false);
  const [bookOrderForm, setBookOrderForm] = useState(DEFAULT_ORDER_ADDRESS);
  const [bookOrderBusy, setBookOrderBusy] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyPageKey, setBusyPageKey] = useState("");
  const [deletingProjectId, setDeletingProjectId] = useState("");
  const [showContentPicker, setShowContentPicker] = useState(false);
  const [pickerKeys, setPickerKeys] = useState([]);
  const [showBatchDialog, setShowBatchDialog] = useState(false);
  const [historyTheme, setHistoryTheme] = useState(null);
  const [historyProjects, setHistoryProjects] = useState([]);
  const [balanceAlert, setBalanceAlert] = useState("");
  const lastBillingAlertRef = useRef("");
  const pendingReferralRef = useRef(false);
  const pendingBookCheckoutRef = useRef(false);
  const pendingBeanPurchaseRef = useRef(false);

  const activeTheme = project?.theme || selectedTheme;
  const contents = getBodyBookThemeContents(activeTheme);
  const selectableContents = useMemo(() => contents.filter((content) => !content.isBuiltIn && content.pageType !== "back-cover"), [contents]);
  const selectedKeys = (project?.pages?.map((page) => page.key) || draftKeys).filter((key) => selectableContents.some((content) => content.key === key));
  const draftPages = useMemo(() => selectableContents
    .filter((content) => draftKeys.includes(content.key))
    .map((content) => ({ ...content, status: "not_started", result: null, errorMessage: "", referenceUrl: draftPageReferencePreviews[content.key] || draftReferencePreview })), [selectableContents, draftKeys, draftReferencePreview, draftPageReferencePreviews]);
  const pages = (project?.pages || draftPages).filter((page) => !page.isBuiltIn && page.pageType !== "back-cover");
  const topReferenceUrl = project?.referenceUrl ? bodyBookCacheUrl(project.referenceUrl, project.updatedAt) : draftReferencePreview;
  const pendingCount = pages.filter((page) => ["queued", "running"].includes(page.status)).length;
  const incompleteKeys = pages.filter((page) => !["succeeded", "queued", "running"].includes(page.status)).map((page) => page.key);
  const allAvailableKeys = pages.filter((page) => !page.isBuiltIn && !["queued", "running"].includes(page.status)).map((page) => page.key);
  const bodyBookPricing = orderConfig?.bodyBook || {};
  const beanPurchaseDiscount = visitorState?.beanPurchaseDiscount || { availableCents: 0 };
  const bookOrderGrossCents = Number(bodyBookPricing.priceCents || 0) + Number(bodyBookPricing.shippingFeeCents || 0);
  const bookOrderDiscountPreviewCents = Math.min(4000, bookOrderGrossCents, Math.max(0, Number(beanPurchaseDiscount.availableCents || 0)));
  const bookOrderPayablePreviewCents = Math.max(0, bookOrderGrossCents - bookOrderDiscountPreviewCents);
  const selectionTargetCount = activeTheme?.id === "color" ? 9 : 17;
  const selectionRemaining = selectionTargetCount - selectedKeys.length;
  const selectionActionText = selectionRemaining >= 0 ? `还需要选择 ${selectionRemaining} 张` : `需要去除 ${Math.abs(selectionRemaining)} 张`;
  const printedInnerPageCount = 16;
  const selectionProgressText = activeTheme?.id === "color"
    ? `当前认知书需要 1 张封面页 + ${printedInnerPageCount} 张内页（其中颜色物品页为 8 张），${selectionActionText}宝宝页。`
    : `当前认知书需要 1 张封面页 + ${printedInnerPageCount} 张内页，${selectionActionText}。`;
  const pickerSelectionRemaining = selectionTargetCount - pickerKeys.filter((key) => selectableContents.some((content) => content.key === key)).length;
  const pickerSelectionActionText = pickerSelectionRemaining >= 0 ? `还需要选择 ${pickerSelectionRemaining} 张` : `需要去除 ${Math.abs(pickerSelectionRemaining)} 张`;
  const pickerSelectionProgressText = activeTheme?.id === "color"
    ? `当前认知书需要 1 张封面页 + ${printedInnerPageCount} 张内页（其中颜色物品页为 8 张），${pickerSelectionActionText}宝宝页。`
    : `当前认知书需要 1 张封面页 + ${printedInnerPageCount} 张内页，${pickerSelectionActionText}。`;
  const bookPreviewPages = project?.printPreviewPages || [];
  const unfinishedPages = pages.filter((page) => page.status !== "succeeded" || !page.result?.imageUrl);
  const bookOrderBlockReason = !bodyBookPricing.enabled
    ? "认知书实体书下单暂未开放。"
    : selectionRemaining > 0
      ? `当前还差 ${selectionRemaining} 张页面，请补齐后再下单。`
      : selectionRemaining < 0
        ? `当前多选了 ${Math.abs(selectionRemaining)} 张页面，请移除多余页面后再下单。`
        : !project?.sessionId
          ? "请先上传参考图并生成认知书页面。"
          : !pages.some((page) => page.key === "cover")
            ? "请先保留认知书封面。"
            : unfinishedPages.length
              ? `还有 ${unfinishedPages.length} 张页面尚未完成生成，请完成后再下单。`
              : "";
  const canOrderBodyBook = !bookOrderBlockReason;

  function applyProject(nextProject) {
    if (!nextProject?.sessionId) return;
    setProject(nextProject);
    setSelectedTheme(nextProject.theme || selectedTheme);
    setDraftKeys(nextProject.pages?.map((page) => page.key) || []);
    setDraftPageReferences({});
    setPagePrompts(Object.fromEntries((nextProject.pages || []).map((page) => [page.key, page.prompt || ""])));
    setDirtyPromptKeys([]);
    setError("");
  }

  async function loadSavedBooks(themeId = "") {
    const payload = await fetchBodyBookProjects(themeId);
    if (!themeId) setSavedBooks(payload.projects || []);
    return payload.projects || [];
  }

  useEffect(() => {
    let active = true;
    Promise.allSettled([fetchVisitorState(), fetchOrderConfig(), fetchBodyBookThemes(), loadSavedBooks(), fetchMyOrders()]).then((results) => {
      if (!active) return;
      const [visitor, config, themePayload, , ordersPayload] = results;
      if (visitor.status === "fulfilled") {
        setVisitorState(visitor.value);
        setBookOrderForm((current) => fillOrderAddressFromSaved(current, visitor.value?.account));
      }
      if (config.status === "fulfilled") setOrderConfig(config.value);
      if (ordersPayload.status === "fulfilled") {
        setBodyBookOrders((ordersPayload.value?.orders || []).filter((order) => order.experienceType === "body-book"));
      }
      if (themePayload.status === "fulfilled") {
        if (themePayload.value?.themes?.length) setThemes(themePayload.value.themes);
        setBillingEnabled(Boolean(themePayload.value?.billingEnabled));
      }
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    captureReferral(token)
      .catch(() => {})
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      });
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const purchaseId = String(url.searchParams.get("beanPurchaseId") || "");
    const payCode = String(url.searchParams.get("beanPayCode") || "");
    if (!purchaseId || !payCode) return;
    setShowBeanPurchase(true);
    setBeanPurchaseError("");
    url.searchParams.delete("beanPurchaseId");
    url.searchParams.delete("beanPayCode");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    void prepareBeanPurchase(purchaseId, payCode);
  }, []);

  useEffect(() => {
    if (!showBeanPurchase || !beanPurchase?.id || beanPurchase.status === "paid") return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const payload = await fetchBeanPurchase(beanPurchase.id);
        if (!active) return;
        setBeanPurchase(payload.purchase);
        if (payload.purchase?.status === "paid") setVisitorState(await fetchVisitorState());
      } catch {}
    };
    const timer = window.setInterval(refresh, 2200);
    void refresh();
    return () => { active = false; window.clearInterval(timer); };
  }, [beanPurchase?.id, beanPurchase?.status, showBeanPurchase]);

  useEffect(() => {
    if (!showUserMenu) return undefined;
    const closeMenuOnOutsidePointer = (event) => {
      if (!userMenuRef.current?.contains(event.target)) setShowUserMenu(false);
    };
    document.addEventListener("pointerdown", closeMenuOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeMenuOnOutsidePointer);
  }, [showUserMenu]);

  useEffect(() => {
    if (!draftReference) {
      setDraftReferencePreview("");
      return undefined;
    }
    const url = URL.createObjectURL(draftReference);
    setDraftReferencePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draftReference]);

  useEffect(() => {
    const entries = Object.entries(draftPageReferences).filter(([, file]) => Boolean(file));
    const previews = Object.fromEntries(entries.map(([key, file]) => [key, URL.createObjectURL(file)]));
    setDraftPageReferencePreviews(previews);
    return () => Object.values(previews).forEach((url) => URL.revokeObjectURL(url));
  }, [draftPageReferences]);

  useEffect(() => {
    if (!project?.sessionId || project.stage !== "generating") return undefined;
    let active = true;
    const refresh = () => fetchBodyBookProject(project.sessionId)
      .then((payload) => { if (active) applyProject(payload); })
      .catch((nextError) => { if (active) setError(nextError.message || "读取认知书工程失败，请稍后再试。"); });
    refresh();
    const timer = window.setInterval(refresh, 2200);
    return () => { active = false; window.clearInterval(timer); };
  }, [project?.sessionId, project?.stage]);

  useEffect(() => {
    if (!project?.savedAt) return;
    loadSavedBooks().catch(() => {});
  }, [project?.savedAt, project?.updatedAt]);

  useEffect(() => {
    const message = String(project?.billingError || "").trim();
    if (!isInsufficientBalanceMessage(message)) return;
    const alertKey = `${project?.sessionId || ""}:${project?.updatedAt || ""}:${message}`;
    if (lastBillingAlertRef.current === alertKey) return;
    lastBillingAlertRef.current = alertKey;
    setBalanceAlert(message);
  }, [project?.billingError, project?.sessionId, project?.updatedAt]);

  function startNewDraft(theme) {
    const themeContents = getBodyBookThemeContents(theme).filter((item) => !item.isBuiltIn && item.pageType !== "back-cover");
    setProject(null);
    setSelectedTheme(theme);
    setDraftKeys(themeContents.slice(0, 2).map((item) => item.key));
    setDraftReference(null);
    setDraftPageReferences({});
    setPagePrompts({});
    setDirtyPromptKeys([]);
    setHistoryTheme(null);
    setHistoryProjects([]);
    setError("");
  }

  async function selectTheme(theme) {
    setBusy(true);
    setError("");
    try {
      const projects = await loadSavedBooks(theme.id);
      if (projects.length) {
        setHistoryTheme(theme);
        setHistoryProjects(projects);
      } else {
        startNewDraft(theme);
      }
    } catch (nextError) {
      setError(nextError.message || "读取历史工程失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  async function openProject(projectId) {
    setBusy(true);
    setError("");
    try {
      applyProject(await fetchBodyBookProject(projectId));
      setHistoryTheme(null);
      setHistoryProjects([]);
    } catch (nextError) {
      setError(nextError.message || "打开认知书工程失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  function backToHome() {
    setProject(null);
    setSelectedTheme(null);
    setDraftReference(null);
    setDraftPageReferences({});
    setDraftKeys([]);
    setPagePrompts({});
    setDirtyPromptKeys([]);
    setError("");
    loadSavedBooks().catch(() => {});
  }

  async function ensureBookAccount() {
    const account = await fetchVisitorState();
    setVisitorState(account);
    if (account?.authenticated) return true;
    if (account?.authorizationUrl) window.location.assign(account.authorizationUrl);
    else setShowAuthModal(true);
    return false;
  }

  async function showReferralDialog() {
    setReferralError("");
    setReferralNotice("");
    try {
      const payload = await createReferralLink();
      const nextUrl = String(payload?.inviteUrl || "");
      setReferralUrl(nextUrl);
      setShowReferralModal(true);
      try {
        await copyText(nextUrl);
        setReferralNotice("邀请链接已复制，快去分享给新朋友吧。");
      } catch {
        setReferralNotice("链接已生成，请点击下方按钮复制。");
      }
    } catch (nextError) {
      setReferralError(nextError.message || "创建邀请链接失败，请稍后重试。");
      setShowReferralModal(true);
    }
  }

  function openReferral() {
    if (!visitorState?.account?.isRegistered) {
      pendingReferralRef.current = true;
      setShowAuthModal(true);
      return;
    }
    void showReferralDialog();
  }

  function openBeanPurchase() {
    if (!visitorState?.account?.isRegistered) {
      pendingBeanPurchaseRef.current = true;
      setShowAuthModal(true);
      return;
    }
    setBeanPurchase(null);
    setBeanPurchasePayment(null);
    setBeanPurchaseError("");
    setShowBeanInfo(false);
    setShowBeanPurchase(true);
  }

  function restartBeanPurchase() {
    setBeanPurchase(null);
    setBeanPurchasePayment(null);
    setBeanPurchaseError("");
  }

  async function applyBeanPurchasePayment(payload) {
    const nextPurchase = payload?.purchase || null;
    const nextPayment = payload?.payment || null;
    if (nextPurchase) setBeanPurchase(nextPurchase);
    setBeanPurchasePayment(nextPayment);
    if (nextPayment?.status === "requires_authorization" && nextPayment.authorizationUrl) {
      window.location.assign(nextPayment.authorizationUrl);
      return;
    }
    if (nextPayment?.channel === "wechat_jsapi" && nextPayment.jsapi) {
      await invokeWechatJsapiPayment(nextPayment.jsapi);
      const refreshed = await fetchBeanPurchase(nextPurchase?.id || beanPurchase?.id);
      setBeanPurchase(refreshed.purchase);
      setVisitorState(await fetchVisitorState());
    }
  }

  async function prepareBeanPurchase(purchaseId, code = "") {
    if (!purchaseId) return;
    setBeanPurchaseBusy(true);
    setBeanPurchaseError("");
    try {
      await applyBeanPurchasePayment(await payBeanPurchase(purchaseId, code ? { code } : {}));
    } catch (nextError) {
      setBeanPurchaseError(nextError.message || "发起豆豆购买支付失败，请稍后重试。");
    } finally {
      setBeanPurchaseBusy(false);
    }
  }

  async function submitBeanPurchase() {
    const count = Math.trunc(Number(beanPurchaseCount || 0));
    if (beanPurchaseBusy) return;
    if (!Number.isFinite(count) || count < 1 || count > MAX_BEAN_PURCHASE_COUNT) {
      setBeanPurchaseError(`请输入 1 到 ${MAX_BEAN_PURCHASE_COUNT} 之间的整数。`);
      return;
    }
    setBeanPurchaseBusy(true);
    setBeanPurchaseError("");
    try {
      const created = await createBeanPurchase({ beanCount: count });
      setBeanPurchase(created.purchase);
      setBeanPurchasePayment(created.payment || null);
      if (created.payment?.channel !== "manual_collection") {
        await applyBeanPurchasePayment(await payBeanPurchase(created.purchase.id, {}));
      }
    } catch (nextError) {
      setBeanPurchaseError(nextError.message || "创建豆豆购买单失败，请稍后重试。");
    } finally {
      setBeanPurchaseBusy(false);
    }
  }

  function openBookCheckout() {
    if (!canOrderBodyBook) {
      setShowBookCheckout(true);
      return;
    }
    if (!visitorState?.account?.isRegistered) {
      pendingBookCheckoutRef.current = true;
      setShowAuthModal(true);
      return;
    }
    setShowBookCheckout(true);
  }

  async function submitBookOrder() {
    if (!project?.sessionId || bookOrderBusy) return;
    setBookOrderBusy(true);
    setError("");
    try {
      const created = await createOrderRequest({
        experienceType: "body-book",
        bodyBookProjectId: project.sessionId,
        ...bookOrderForm
      });
      saveOrderAddress(visitorState?.account, bookOrderForm);
      window.location.assign(buildOrderDetailUrl(created.order.id, created.order.publicToken, "body-book"));
    } catch (nextError) {
      setError(nextError.message || "创建实体书订单失败，请稍后重试。");
    } finally {
      setBookOrderBusy(false);
    }
  }

  async function updateTopReference(file) {
    if (!file) return;
    if (!isValidBodyBookReference(file)) {
      setError("请上传 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (!project) {
      setDraftReference(file);
      setDraftPageReferences({});
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const prepared = await prepareReferenceForUpload({ id: "body-book-project-reference", file });
      const data = new FormData();
      data.append("image", prepared.file);
      applyProject(await replaceBodyBookProjectReference(project.sessionId, data));
    } catch (nextError) {
      setError(nextError.message || "替换参考图失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  async function updatePageReference(page, file) {
    if (!file) return;
    if (!isValidBodyBookReference(file)) {
      setError("请上传 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (!project) {
      setDraftPageReferences((current) => ({ ...current, [page.key]: file }));
      setError("");
      return;
    }
    setBusyPageKey(page.key);
    setError("");
    try {
      const prepared = await prepareReferenceForUpload({ id: `body-book-page-${page.key}`, file });
      const data = new FormData();
      data.append("image", prepared.file);
      applyProject(await replaceBodyBookProjectPageReference(project.sessionId, page.key, data));
    } catch (nextError) {
      setError(nextError.message || "替换页面参考图失败，请稍后再试。");
    } finally {
      setBusyPageKey("");
    }
  }

  async function savePageSelection(nextKeys) {
    const themeContents = getBodyBookThemeContents(activeTheme).filter((item) => !item.isBuiltIn && item.pageType !== "back-cover");
    const requested = new Set(nextKeys);
    requested.add("cover");
    const normalized = themeContents.map((item) => item.key).filter((key) => requested.has(key));
    if (!project) {
      setDraftKeys(normalized);
      setDraftPageReferences((current) => Object.fromEntries(Object.entries(current).filter(([key]) => normalized.includes(key))));
      setPagePrompts((current) => Object.fromEntries(Object.entries(current).filter(([key]) => normalized.includes(key))));
      setDirtyPromptKeys((current) => current.filter((key) => normalized.includes(key)));
      return;
    }
    setBusy(true);
    setError("");
    try {
      applyProject(await updateBodyBookProjectPages(project.sessionId, normalized));
    } catch (nextError) {
      setError(nextError.message || "更新认知书内容失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  function openContentPicker() {
    setPickerKeys(selectedKeys.filter((key) => selectableContents.some((content) => content.key === key)));
    setShowContentPicker(true);
  }

  async function submitGeneration(keys, busyKey = "") {
    if (!keys.length) {
      setError("没有可提交的页面。");
      return;
    }
    if (!(await ensureBookAccount())) return;
    if (!project && !draftReference) {
      setError("请先上传参考图。");
      return;
    }
    setBusy(true);
    setBusyPageKey(busyKey);
    setError("");
    try {
      let next;
      if (project) {
        next = await generateBodyBookProjectPages(project.sessionId, keys, selectBodyBookPagePrompts(pagePrompts, keys, dirtyPromptKeys));
      } else {
        const prepared = await prepareReferenceForUpload({ id: "body-book-project-reference", file: draftReference });
        const data = new FormData();
        data.append("image", prepared.file);
        data.append("themeId", activeTheme.id);
        data.append("contentKeys", JSON.stringify(draftKeys));
        data.append("generationKeys", JSON.stringify(keys));
        data.append("pagePrompts", JSON.stringify(selectBodyBookPagePrompts(pagePrompts, draftKeys, dirtyPromptKeys)));
        Object.entries(draftPageReferences).forEach(([key, file]) => {
          if (draftKeys.includes(key) && file) data.append(`pageReference-${key}`, file);
        });
        next = await createBodyBookProject(data);
      }
      applyProject(next);
      setShowBatchDialog(false);
      fetchVisitorState().then(setVisitorState).catch(() => {});
    } catch (nextError) {
      const message = nextError.message || "提交图片生成失败，请稍后再试。";
      if (isInsufficientBalanceMessage(message)) setBalanceAlert(message);
      else setError(message);
    } finally {
      setBusy(false);
      setBusyPageKey("");
    }
  }

  async function deleteProject(book) {
    if (!book?.sessionId || deletingProjectId) return;
    if (!window.confirm(`确定删除《${book.title}》吗？删除后无法恢复。`)) return;
    setDeletingProjectId(book.sessionId);
    setError("");
    try {
      await deleteBodyBookProject(book.sessionId);
      setSavedBooks((current) => current.filter((item) => item.sessionId !== book.sessionId));
      if (project?.sessionId === book.sessionId) backToHome();
    } catch (nextError) {
      setError(nextError.message || "删除认知书工程失败，请稍后再试。");
    } finally {
      setDeletingProjectId("");
    }
  }

  async function redeemBookInvite() {
    if (!inviteCode.trim()) return;
    setBusy(true);
    setError("");
    try {
      setVisitorState(await redeemInviteCode(inviteCode.trim()));
      setInviteCode("");
    } catch (nextError) {
      setError(nextError.message || "邀请码兑换失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  function openActiveItem(item) {
    setActiveItem(item);
    setShowActivePromptEditor(false);
  }

  function closeActiveItem() {
    setActiveItem(null);
    setShowActivePromptEditor(false);
  }

  function updateActiveItemPrompt(prompt) {
    if (!activeItem?.key) return;
    setPagePrompts((current) => ({ ...current, [activeItem.key]: prompt }));
    setDirtyPromptKeys((keys) => keys.includes(activeItem.key) ? keys : [...keys, activeItem.key]);
    setActiveItem((current) => current ? { ...current, prompt } : current);
  }

  const home = !activeTheme;
  return (
    <main className="body-book-page">
      <header className="body-book-header">
        <div><p className="body-book-kicker">Baby learning book</p><h1>{activeTheme?.englishName || "My First Book"}</h1><p>{activeTheme ? `正在制作：${activeTheme.name}` : "选择主题后，自由组合页面并持续编辑。"}</p></div>
        <div className="body-book-header-actions">
          {!home ? <button className="draw-card-secondary body-book-back-to-themes" disabled={busy} onClick={backToHome} type="button"><Home size={17} /><span>主页</span></button> : null}
          <button className="draw-card-secondary body-book-header-balance" onClick={() => setShowBeanInfo(true)} type="button"><span>余额</span><strong>{visitorState ? visitorState.account?.beanBalance || 0 : "--"}</strong><span>豆</span></button>
          {home && bodyBookOrders.length ? <button className="draw-card-secondary" onClick={() => window.location.assign("/book/orders")} type="button">我的订单</button> : null}
          <div className="body-book-user-area" ref={userMenuRef}><button className="draw-card-secondary body-book-account-button" onClick={() => visitorState?.account?.isRegistered ? setShowUserMenu((value) => !value) : setShowAuthModal(true)} type="button">{visitorState?.account?.isRegistered ? (visitorState.account.username || "我的账户") : "登录 / 注册"}</button>{showUserMenu ? <div className="body-book-user-menu">{bodyBookOrders.length ? <button onClick={() => window.location.assign("/book/orders")} type="button">我的订单</button> : null}<button onClick={async () => { await logoutCurrentAccount(); setShowUserMenu(false); setVisitorState(await fetchVisitorState()); }} type="button">退出登录</button></div> : null}</div>
        </div>
      </header>

      {home ? <>
        <section className="body-book-theme-home body-book-theme-layout">
          <div className="body-book-theme-content"><div className="body-book-theme-head"><span className="body-book-step">01</span><h2>选择认知主题</h2><p>先组合想制作的页面，再按需批量或单张生成。</p></div><div className="body-book-theme-grid">{themes.slice().sort((left, right) => (left.id === "color" ? -1 : right.id === "color" ? 1 : 0)).map((theme, index) => <button className="body-book-theme-card" disabled={busy} key={theme.id} onClick={() => selectTheme(theme)} type="button"><img alt={`${theme.name} 例图`} className="body-book-theme-preview" decoding="async" loading={index > 3 ? "lazy" : "eager"} src={`/body-book-samples/${encodeURIComponent(theme.id)}-cover-thumbnail.webp`} /><span className="body-book-theme-index">{String(index + 1).padStart(2, "0")}</span><strong>{theme.name}</strong><small>{theme.englishName}</small><em>预计消耗 {theme.id === "color" ? 9 : 17} 豆</em></button>)}</div></div>
        </section>
        <section className="body-book-library"><div className="body-book-library-head"><span className="body-book-step">MY BOOKS</span><h2>我的认知书</h2></div>{error ? <p className="error-note">{error}</p> : null}{savedBooks.length ? <div className="body-book-library-grid">{savedBooks.map((book) => <article className="body-book-library-item" key={book.sessionId}><button className="body-book-library-cover" onClick={() => openProject(book.sessionId)} type="button">{book.thumbnail ? <img alt={`${book.title} 缩略图`} src={book.thumbnail} /> : <div className="body-book-library-placeholder">{book.theme?.name || "认知书"}</div>}<span>{book.title}</span><small>继续制作 · {formatBodyBookUpdatedAt(book.updatedAt || book.savedAt)}</small></button><button aria-label={`删除《${book.title}》`} className="body-book-library-delete icon-button" disabled={deletingProjectId === book.sessionId} onClick={() => deleteProject(book)} title="删除" type="button">{deletingProjectId === book.sessionId ? <LoaderCircle className="spin" size={16} /> : <X size={17} />}</button></article>)}</div> : <p className="body-book-library-empty">成功生成第一张图片后，工程会自动保存在这里。</p>}</section>
      </> : <section className="body-book-workspace body-book-project-workspace">
        <div className="body-book-status-row"><div><span className="body-book-step">02</span><h2>{project?.message || "配置你的认知书页面"}</h2></div></div>
        {error ? <p className="error-note">{error}</p> : null}
        <section className="body-book-project-reference"><div><span className="body-book-step">REFERENCE</span><h3>全局参考图</h3><p>{activeTheme?.id === "color" ? "替换后会同步更新封面与所有宝宝页；颜色物品页会在成书预览中自动加入。" : "替换后会同步更新封面与所有需要生成的页面。"}</p></div><label className={`body-book-upload body-book-project-upload ${topReferenceUrl ? "has-image" : ""}`}>{topReferenceUrl ? <img alt="认知书全局参考图" src={topReferenceUrl} /> : <><ImageUp size={28} /><strong>上传参考图</strong><span>JPG、PNG、WebP</span></>}<input accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { updateTopReference(event.target.files?.[0] || null); event.target.value = ""; }} type="file" /></label></section>
        <section className="body-book-content-panel">
          <div className="body-book-project-pages-head"><div><span className="body-book-step">03</span><h3>内容选择</h3><p>{activeTheme?.id === "color" ? "制作时仅选择封面和各颜色宝宝页；颜色物品页会在下单预览中自动加入。" : "每张卡片可单独替换参考图、修改提示词并生成。"}</p><p className="body-book-selection-progress">{selectionProgressText}</p></div></div>
          <div className="body-book-grid body-book-project-grid">{pages.map((page) => <BodyBookProjectItem busy={busy} busyPageKey={busyPageKey} key={`${page.key}-${page.jobId || "new"}`} onDelete={() => savePageSelection(selectedKeys.filter((key) => key !== page.key))} onGenerate={() => submitGeneration([page.key], page.key)} onOpen={openActiveItem} onReplaceReference={(file) => updatePageReference(page, file)} page={page} referenceUrl={page.usesProjectReference ? topReferenceUrl : bodyBookCacheUrl(page.referenceUrl || topReferenceUrl, project?.updatedAt)} />)}<button className="body-book-add-page-card" disabled={busy} onClick={openContentPicker} type="button" aria-label="添加或编辑内容"><Plus size={36} /><span>添加内容</span></button>{!pages.length ? <p className="body-book-library-empty">点击“添加内容”选择要制作的页面。</p> : null}</div>
          <div className="body-book-content-panel-actions"><div className="body-book-content-panel-order-actions"><button className="draw-card-secondary" onClick={() => setShowBatchDialog(true)} type="button">{busy && !busyPageKey ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}<span>批量生成</span></button><button className="draw-card-primary" onClick={openBookCheckout} type="button">下单实体书 · {formatCurrencyCents(bookOrderPayablePreviewCents)}</button></div></div>
        </section>
      </section>}

      {activeItem?.result?.imageUrl ? <div className="modal-backdrop body-book-lightbox" onClick={closeActiveItem} role="presentation"><section className="body-book-lightbox-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><button className="icon-button" onClick={closeActiveItem} type="button" aria-label="关闭预览"><X size={18} /></button><img alt={activeItem.title} src={activeItem.result.imageUrl} /><div className="body-book-lightbox-meta"><strong>{activeItem.title}</strong><a className="draw-card-primary" download={getBodyBookDownloadName(activeItem)} href={activeItem.result.imageUrl}><Download size={17} /><span>下载图片</span></a></div>{!activeItem.isBuiltIn ? <div className="body-book-lightbox-prompt"><button className="body-book-edit-prompt" disabled={busy} onClick={() => setShowActivePromptEditor((current) => !current)} type="button"><Pencil size={15} /><span>修改提示词</span></button>{showActivePromptEditor ? <label className="body-book-page-prompt"><span>本页提示词</span><textarea disabled={busy} maxLength={6000} onChange={(event) => updateActiveItemPrompt(event.target.value)} placeholder="输入本页生成提示词；留空将使用默认提示词。" value={pagePrompts[activeItem.key] ?? activeItem.prompt ?? ""} /><small>{(pagePrompts[activeItem.key] ?? activeItem.prompt ?? "").length}/6000 · 下次单张或批量生成时生效</small></label> : null}</div> : null}</section></div> : null}

      {showContentPicker ? <div className="modal-backdrop" onClick={() => !busy && setShowContentPicker(false)} role="presentation"><section className="body-book-project-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="选择认知书内容"><button className="icon-button" disabled={busy} onClick={() => setShowContentPicker(false)} type="button"><X size={18} /></button><p className="body-book-kicker">Contents</p><h2>选择认知书内容</h2><p>封面为固定页，已添加的内容保持选中状态。</p><p className="body-book-selection-progress">{pickerSelectionProgressText}</p><div className="body-book-content-options">{selectableContents.map((content) => <label key={content.key}><input checked={pickerKeys.includes(content.key)} disabled={content.isRequired} onChange={(event) => setPickerKeys((keys) => event.target.checked ? [...keys, content.key] : keys.filter((key) => key !== content.key))} type="checkbox" /><span>{content.chinese} <small>{content.english}</small></span></label>)}</div><div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={busy} onClick={() => setShowContentPicker(false)} type="button">取消</button><button className="draw-card-primary" disabled={busy} onClick={async () => { await savePageSelection(pickerKeys); setShowContentPicker(false); }} type="button">确认内容</button></div></section></div> : null}

      {showBatchDialog ? <div className="modal-backdrop" onClick={() => !busy && setShowBatchDialog(false)} role="presentation"><section className="body-book-project-modal body-book-batch-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="选择批量生成方式"><button className="icon-button" disabled={busy} onClick={() => setShowBatchDialog(false)} type="button"><X size={18} /></button><p className="body-book-kicker">Batch generate</p><h2>选择生成方式</h2><p>{pendingCount ? `${pendingCount} 张正在生成，将自动跳过。` : "选择本次要提交的页面。"}</p><button className="body-book-batch-choice" disabled={busy || !incompleteKeys.length} onClick={() => submitGeneration(incompleteKeys)} type="button"><strong>仅生成未完成页</strong><span>提交 {incompleteKeys.length} 张未生成或失败页面，成功图片不变。</span></button><button className="body-book-batch-choice" disabled={busy || !allAvailableKeys.length} onClick={() => submitGeneration(allAvailableKeys)} type="button"><strong>全部重新生成</strong><span>提交 {allAvailableKeys.length} 张非生成中页面，成功图片会被覆盖。</span></button></section></div> : null}

      {balanceAlert ? <BalanceInsufficientModal message={balanceAlert} onClose={() => setBalanceAlert("")} useBodyBookTheme /> : null}

      {historyTheme ? <div className="modal-backdrop" onClick={() => !busy && setHistoryTheme(null)} role="presentation"><section className="body-book-project-modal body-book-history-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="选择历史认知书工程"><button className="icon-button" disabled={busy} onClick={() => setHistoryTheme(null)} type="button"><X size={18} /></button><p className="body-book-kicker">Existing projects</p><h2>{historyTheme.name}已有历史工程</h2><p>请选择继续历史任务，或新建一本独立工程。</p><div className="body-book-history-list">{historyProjects.map((book) => <button key={book.sessionId} onClick={() => openProject(book.sessionId)} type="button">{book.thumbnail ? <img alt="工程缩略图" src={book.thumbnail} /> : <span className="body-book-history-placeholder">{book.theme?.name}</span>}<span><strong>{book.title}</strong><small>{formatBodyBookUpdatedAt(book.updatedAt || book.savedAt)}</small></span></button>)}</div><div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={busy} onClick={() => startNewDraft(historyTheme)} type="button">创建新的工程</button></div></section></div> : null}

      {showReferralModal ? <div className="modal-backdrop draw-card-confirm" onClick={() => setShowReferralModal(false)} role="presentation"><section className="draw-card-confirm-panel body-book-referral-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="邀新获豆"><button className="icon-button" onClick={() => setShowReferralModal(false)} type="button"><X size={18} /></button><p className="draw-card-kicker">Invite friends</p><h2>邀新获豆</h2><p>邀请新用户注册，并完成首笔认知书实体书支付，即可获得 <strong>10 颗豆豆</strong>。</p>{referralUrl ? <><label className="body-book-wallet-field"><span>专属邀请链接</span><input readOnly value={referralUrl} /></label><button className="draw-card-primary" onClick={async () => { try { await copyText(referralUrl); setReferralNotice("邀请链接已复制，快去分享给新朋友吧。"); setReferralError(""); } catch (nextError) { setReferralError(nextError.message || "复制失败，请手动复制链接。"); } }} type="button"><Clipboard size={17} /><span>复制邀请链接</span></button></> : null}{referralNotice ? <p className="success-note">{referralNotice}</p> : null}{referralError ? <p className="error-note">{referralError}</p> : null}</section></div> : null}
      {showBeanInfo ? <div className="modal-backdrop draw-card-confirm" onClick={() => setShowBeanInfo(false)} role="presentation"><section className="draw-card-confirm-panel body-book-bean-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="我的豆豆"><button className="icon-button" onClick={() => setShowBeanInfo(false)} type="button"><X size={18} /></button><p className="draw-card-kicker">My beans</p><h2>我的豆豆</h2><p className="body-book-bean-balance">当前剩余 <strong>{visitorState ? visitorState.account?.beanBalance || 0 : "--"}</strong> 豆</p><p className="body-book-bean-cost-note">已购豆豆剩余可抵扣额度：<strong>{formatCurrencyCents(Math.max(0, Number(beanPurchaseDiscount.availableCents || 0)))}</strong></p><p className="body-book-bean-cost-note">{billingEnabled ? "每张成功生成的图片消耗 1 个豆豆。" : "内测阶段，认知书暂不消耗豆豆。"}</p><ul className="body-book-bean-benefits"><li>成功购买 1 元豆豆，可获得 1 元认知书优惠额度。</li><li>认知书每单最多抵扣 40 元；赠送豆豆不参与抵扣。</li><li>认知书按实付金额赠豆，每实付满 1 元赠 1 豆。</li><li>邀请新用户完成首笔认知书订单，可获得 10 豆。</li></ul><div className="body-book-wallet-actions"><button className="draw-card-primary" onClick={openBeanPurchase} type="button">购买豆豆</button><button className="draw-card-secondary" onClick={() => { setShowBeanInfo(false); openReferral(); }} type="button">邀新获豆</button><button className="draw-card-secondary" onClick={() => { setShowBeanInfo(false); setShowContactModal(true); }} type="button">联系客服</button></div><label className="body-book-wallet-field"><span>邀请码</span><input disabled={busy} onChange={(event) => setInviteCode(event.target.value)} placeholder="输入邀请码" value={inviteCode} /></label><div className="body-book-wallet-actions"><button className="draw-card-primary" disabled={busy || !inviteCode.trim()} onClick={redeemBookInvite} type="button">兑换邀请码</button></div></section></div> : null}
      {showBeanPurchase ? <BeanPurchaseModal beanCount={beanPurchaseCount} busy={beanPurchaseBusy} error={beanPurchaseError} onClose={() => !beanPurchaseBusy && setShowBeanPurchase(false)} onCountChange={setBeanPurchaseCount} onRestart={restartBeanPurchase} onRetry={() => prepareBeanPurchase(beanPurchase?.id)} onSubmit={submitBeanPurchase} payment={beanPurchasePayment} purchase={beanPurchase} /> : null}
      {showBookCheckout ? <div className="modal-backdrop" onClick={() => !bookOrderBusy && setShowBookCheckout(false)} role="presentation"><section className="body-book-project-modal body-book-checkout-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="下单认知书实体书"><button className="icon-button" disabled={bookOrderBusy} onClick={() => setShowBookCheckout(false)} type="button"><X size={18} /></button><p className="body-book-kicker">Print your book</p><h2>{bookOrderBlockReason ? "暂时无法下单" : "下单认知书实体书"}</h2>{bookOrderBlockReason ? <><div className="body-book-checkout-blocked"><AlertTriangle size={24} /><p>{bookOrderBlockReason}</p></div><div className="draw-card-confirm-actions"><button className="draw-card-primary" onClick={() => setShowBookCheckout(false)} type="button">知道了</button></div></> : <><p>以下为将要印刷的全部页面，共 {bookPreviewPages.length} 页；颜色书会在这里自动包含颜色物品页，不含封底。</p><div className="body-book-checkout-preview" aria-label="成书预览">{bookPreviewPages.map((page, index) => <figure className="body-book-checkout-preview-item" key={`${page.key}-${index}`}><img alt={`${page.title} 成书预览`} src={page.isBuiltIn ? (page.result?.thumbnailUrl || page.result?.previewUrl || page.result?.imageUrl) : (page.result?.previewUrl || page.result?.imageUrl)} /><figcaption><span>第 {index + 1} 页</span><strong>{page.title}</strong></figcaption></figure>)}</div><div className="draw-card-order-summary"><p>实体书 {formatCurrencyCents(bodyBookPricing.priceCents)}</p><p>邮费 {Number(bodyBookPricing.shippingFeeCents || 0) > 0 ? formatCurrencyCents(bodyBookPricing.shippingFeeCents) : "包邮"}</p>{bookOrderDiscountPreviewCents > 0 ? <p>豆豆优惠 -{formatCurrencyCents(bookOrderDiscountPreviewCents)}（每单最多抵扣 40 元）</p> : null}<strong>实付 {formatCurrencyCents(bookOrderPayablePreviewCents)}</strong></div><div className="draw-card-order-form"><label className="field-label">收件人<input onChange={(event) => setBookOrderForm((current) => ({ ...current, receiverName: event.target.value }))} type="text" value={bookOrderForm.receiverName} /></label><label className="field-label">手机号<input onChange={(event) => setBookOrderForm((current) => ({ ...current, receiverPhone: event.target.value }))} type="tel" value={bookOrderForm.receiverPhone} /></label><label className="field-label">收货地址<input onChange={(event) => setBookOrderForm((current) => ({ ...current, address: event.target.value, addressDetail: event.target.value }))} type="text" value={bookOrderForm.address || bookOrderForm.addressDetail || ""} /></label><label className="field-label">备注<textarea onChange={(event) => setBookOrderForm((current) => ({ ...current, remark: event.target.value }))} rows="2" value={bookOrderForm.remark} /></label></div><div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={bookOrderBusy} onClick={() => setShowBookCheckout(false)} type="button">取消</button><button className="draw-card-primary" disabled={bookOrderBusy} onClick={submitBookOrder} type="button">{bookOrderBusy ? "创建订单中" : "确定"}</button></div></>}</section></div> : null}
      {showAuthModal ? <AuthModal onAuthenticated={async () => { setShowAuthModal(false); const nextVisitorState = await fetchVisitorState(); setVisitorState(nextVisitorState); setBookOrderForm((current) => fillOrderAddressFromSaved(current, nextVisitorState?.account)); await loadSavedBooks(); if (pendingReferralRef.current) { pendingReferralRef.current = false; await showReferralDialog(); } if (pendingBookCheckoutRef.current) { pendingBookCheckoutRef.current = false; setShowBookCheckout(true); } if (pendingBeanPurchaseRef.current) { pendingBeanPurchaseRef.current = false; openBeanPurchase(); } }} onClose={() => { pendingReferralRef.current = false; pendingBookCheckoutRef.current = false; pendingBeanPurchaseRef.current = false; setShowAuthModal(false); }} reloadOnLogin={false} /> : null}
      {showContactModal ? <div className="modal-backdrop draw-card-confirm" onClick={() => setShowContactModal(false)} role="presentation"><section className="draw-card-confirm-panel draw-card-contact-panel body-book-contact-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><button className="icon-button" onClick={() => setShowContactModal(false)} type="button"><X size={18} /></button><div className="draw-card-contact-copy"><h3>联系客服</h3><p>请加微信</p><button className="draw-card-contact-id" onClick={() => copyText(getContactWechatId(orderConfig))} type="button"><span>{getContactWechatId(orderConfig)}</span><Clipboard size={16} /></button></div></section></div> : null}
      <footer className="body-book-page-footer"><a className="body-book-admin-entry" href="/admin" aria-label="进入后台管理">后台入口</a></footer>
    </main>
  );
}

function BodyBookProjectItem({ page, referenceUrl, onOpen, onReplaceReference, onGenerate, onDelete, busy, busyPageKey }) {
  const pending = ["queued", "running"].includes(page.status);
  const succeeded = page.status === "succeeded" && page.result?.imageUrl;
  const working = busyPageKey === page.key;
  const handleGenerate = () => {
    if (succeeded && !window.confirm("重新生成将消耗 1 豆豆，是否继续？")) return;
    onGenerate();
  };
  return <article className={`body-book-item body-book-project-item ${pending ? "is-pending" : ""} ${page.status === "failed" ? "is-failed" : ""}`}>
    {!page.isBuiltIn && !page.isRequired ? <button className="body-book-project-delete icon-button" disabled={busy || pending} onClick={onDelete} title="删除页面" type="button"><X size={17} /></button> : null}
    {succeeded ? <button className="body-book-item-media" onClick={() => onOpen(page)} type="button"><img alt={page.title} src={page.result.previewUrl || page.result.imageUrl} /></button> : <div className="body-book-placeholder">{pending ? <LoaderCircle className="spin" size={24} /> : <AlertTriangle size={24} />}<strong>{pending ? "正在生成" : page.status === "failed" ? "生成失败" : "尚未生成"}</strong><span>{page.errorMessage || (pending ? "图片完成后会自动出现。" : "可单张生成或加入批量生成。")}</span></div>}
    <div className="body-book-item-meta"><div><strong>{page.title}</strong></div></div>
    {page.isBuiltIn ? <div className="body-book-project-card-controls"><span className="body-book-built-in-note">项目内置物品页 · 无需生成</span></div> : <div className="body-book-project-card-controls"><label className="body-book-page-reference">{referenceUrl ? <img alt={`${page.title} 参考图`} onError={(event) => { event.currentTarget.style.display = "none"; }} src={referenceUrl} /> : <ImageUp size={16} />}<span>替换参考图</span><input accept="image/png,image/jpeg,image/webp" disabled={busy || pending} onChange={(event) => { onReplaceReference(event.target.files?.[0] || null); event.target.value = ""; }} type="file" /></label><button className="draw-card-secondary" disabled={busy || pending} onClick={handleGenerate} type="button">{working ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}<span>{succeeded ? "单张重新生成" : "单张生成"}</span></button></div>}
  </article>;
}

function getBodyBookThemeContents(theme) {
  if (Array.isArray(theme?.contents) && theme.contents.length) return theme.contents;
  return [{ key: "cover", chinese: "封面", english: "Cover", title: "封面 Cover", order: 0 }];
}

function isValidBodyBookReference(file) {
  return ["image/jpeg", "image/png", "image/webp"].includes(String(file?.type || ""));
}

function bodyBookCacheUrl(url, marker) {
  if (!url) return "";
  if (url.startsWith("blob:") || url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(marker || "current")}`;
}

function formatBodyBookUpdatedAt(value) {
  if (!value) return "刚刚保存";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "已保存" : `更新于 ${date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

function selectBodyBookPagePrompts(prompts, keys, dirtyKeys = []) {
  const dirty = new Set(dirtyKeys || []);
  return Object.fromEntries((keys || []).filter((key) => dirty.has(key)).map((key) => [key, String(prompts?.[key] || "")]).filter(([, prompt]) => prompt.trim()));
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
          <button className="secondary-button" onClick={() => window.location.assign("/")} type="button">
            <Home size={18} />
            <span>返回抽卡页</span>
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
                  {getOrderPrimaryStatusLabel(order)}
                </div>
                <div className="task-detail">
                  <div className="task-meta-row">
                    <strong>{order.orderNo}</strong>
                    <span>{order.experienceType === "body-book" ? "认知书实体书" : `共 ${order.itemCount} 只`}</span>
                    <span>{formatCurrencyCents(order.totalCents)}</span>
                  </div>
                  <p className="storage-note">下单时间 {formatDateTime(order.createdAt)}</p>
                  {isManualUnpaid ? <p className="storage-note">待付款：请联系客服并发送订单卡片。</p> : null}
                </div>
                <div className="task-actions">
                  <button className="secondary-button" onClick={() => window.location.assign(buildOrderDetailUrl(order.id, order.publicToken, order.experienceType))} type="button">
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

function BodyBookOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [beanPurchases, setBeanPurchases] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deleteConfirmOrder, setDeleteConfirmOrder] = useState(null);
  const [deletingOrderId, setDeletingOrderId] = useState("");

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    Promise.all([fetchMyOrders(), fetchMyBeanPurchases()])
      .then(([ordersPayload, purchasesPayload]) => {
        if (!isActive) return;
        setOrders((ordersPayload.orders || []).filter((order) => order.experienceType === "body-book"));
        setBeanPurchases(purchasesPayload.purchases || []);
        setError("");
      })
      .catch((nextError) => {
        if (isActive) setError(nextError.message || "读取订单列表失败。");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => { isActive = false; };
  }, []);

  const listItems = [
    ...orders.map((order) => ({ type: "body_book_order", record: order, createdAt: order.createdAt })),
    ...beanPurchases.map((purchase) => ({ type: "bean_purchase", record: purchase, createdAt: purchase.createdAt }))
  ].sort((left, right) => Date.parse(String(right.createdAt || "")) - Date.parse(String(left.createdAt || "")));

  async function confirmDeleteOrder() {
    const order = deleteConfirmOrder;
    if (!order?.id || deletingOrderId) return;
    setDeletingOrderId(order.id);
    setError("");
    try {
      await deleteMyOrder(order.id, order.publicToken);
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setDeleteConfirmOrder(null);
    } catch (nextError) {
      setError(nextError.message || "删除订单失败，请稍后重试。");
    } finally {
      setDeletingOrderId("");
    }
  }

  return (
    <main className="body-book-page">
      <section className="body-book-order-list-page">
        <div className="body-book-order-list-head">
          <div>
            <p className="body-book-kicker">My orders</p>
            <h1>我的订单</h1>
          </div>
          <button className="draw-card-secondary" onClick={() => window.location.assign("/book")} type="button">
            <Home size={17} />
            <span>主页</span>
          </button>
        </div>
        {isLoading ? <p className="body-book-library-empty">正在读取订单列表…</p> : null}
        {error ? <p className="error-note">{error}</p> : null}
        {!isLoading && !error && !listItems.length ? <p className="body-book-library-empty">你还没有认知书订单或豆豆购买单。</p> : null}
        <div className="body-book-order-list" aria-label="认知书订单列表">
          {listItems.map((item) => {
            if (item.type === "bean_purchase") {
              const purchase = item.record;
              const status = getBeanPurchaseListStatus(purchase);
              return (
                <article className="body-book-order-list-item" key={`bean-purchase:${purchase.id}`}>
                  <div className="body-book-order-list-content">
                    <span className="body-book-order-cover body-book-bean-purchase-cover">豆</span>
                    <span className="body-book-order-summary">
                      <strong>购买 {purchase.beanCount} 豆</strong>
                      <span>{formatCurrencyCents(purchase.amountCents)}</span>
                      <small className={`task-status ${getBeanPurchaseListTone(status)}`}>{getBeanPurchaseListStatusLabel(purchase, status)}</small>
                    </span>
                  </div>
                </article>
              );
            }
            const order = item.record;
            const cover = order.items?.find((item) => Number(item.sortOrder) === 0) || order.items?.[0];
            const themeName = order.bodyBookThemeName || cover?.styleName || "认知书";
            const canDelete = ["expired", "cancelled"].includes(order.orderStatus);
            return (
              <article className="body-book-order-list-item" key={order.id}>
                <button className="body-book-order-list-open" onClick={() => window.location.assign(buildOrderDetailUrl(order.id, order.publicToken, "body-book"))} type="button">
                  <span className="body-book-order-cover">
                    {cover?.thumbnailUrl || cover?.imageUrl ? <img alt={`${themeName}封面`} src={cover.thumbnailUrl || cover.imageUrl} /> : <span>{themeName}</span>}
                  </span>
                  <span className="body-book-order-summary">
                    <strong>{themeName}</strong>
                    <span>{formatCurrencyCents(Number(order.payableCents ?? order.totalCents ?? 0))}</span>
                    <small className={`task-status ${orderStatusTone(order.orderStatus)}`}>{getOrderPrimaryStatusLabel(order)}</small>
                  </span>
                </button>
                {canDelete ? <button className="body-book-order-delete" disabled={deletingOrderId === order.id} onClick={() => setDeleteConfirmOrder(order)} type="button">删除</button> : null}
              </article>
            );
          })}
        </div>
        {deleteConfirmOrder ? <div className="modal-backdrop draw-card-confirm" onClick={() => !deletingOrderId && setDeleteConfirmOrder(null)} role="presentation"><section className="draw-card-confirm-panel body-book-delete-confirm" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="确认删除订单"><h2>删除订单</h2><p className="storage-note">确定删除订单 {deleteConfirmOrder.orderNo} 吗？删除后该订单将不再显示在你的订单列表中，后台会保留记录并标记为“已取消”。</p><div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={Boolean(deletingOrderId)} onClick={() => setDeleteConfirmOrder(null)} type="button">暂不删除</button><button className="danger-button" disabled={Boolean(deletingOrderId)} onClick={confirmDeleteOrder} type="button">{deletingOrderId ? "删除中" : "确认删除"}</button></div></section></div> : null}
      </section>
    </main>
  );
}

function DrawCardCheckoutPage() {
  const [clipItems, setClipItems] = useState([]);
  const [orderConfig, setOrderConfig] = useState(null);
  const [selectedJobIds, setSelectedJobIds] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [orderForm, setOrderForm] = useState(DEFAULT_ORDER_ADDRESS);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [account, setAccount] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const pendingCheckoutRef = useRef(false);

  useEffect(() => {
    let isActive = true;
    Promise.all([fetchPublicClipItems("draw-card"), fetchOrderConfig(), fetchCurrentAccount()])
      .then(([clipPayload, config, accountPayload]) => {
        if (!isActive) return;
        const items = Array.isArray(clipPayload?.items) ? clipPayload.items : [];
        setClipItems(items);
        setOrderConfig(config || null);
        setAccount(accountPayload?.account || null);
        setOrderForm((current) => fillOrderAddressFromSaved(current, accountPayload?.account));
        setQuantities((current) => syncOrderQuantitiesWithClipItems(current, items));
        setError("");
      })
      .catch((nextError) => {
        if (isActive) setError(nextError.message || "读取卡夹失败，请稍后再试。");
      })
      .finally(() => {
        if (isActive) setIsLoading(false);
      });
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    if (!account?.isRegistered || !pendingCheckoutRef.current) return;
    pendingCheckoutRef.current = false;
    void handleSubmit();
  }, [account?.isRegistered]);

  const selectedItems = useMemo(
    () => clipItems.filter((item) => selectedJobIds.includes(item.jobId)),
    [clipItems, selectedJobIds]
  );
  const totalItemCount = getTotalOrderItemCount(selectedItems, quantities);
  const amountPreview = calculateClientOrderAmount(totalItemCount, orderConfig);

  function toggleSelectedItem(jobId) {
    setSelectedJobIds((current) => current.includes(jobId)
      ? current.filter((item) => item !== jobId)
      : current.concat(jobId));
  }

  function updateQuantity(jobId, nextQuantity) {
    setQuantities((current) => ({ ...current, [jobId]: clampOrderItemQuantity(nextQuantity) }));
  }

  async function handleSubmit() {
    if (!selectedItems.length || !totalItemCount || isSubmitting) return;
    if (!account?.isRegistered) {
      pendingCheckoutRef.current = true;
      setShowAuthModal(true);
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const created = await createOrderRequest({
        experienceType: "draw-card",
        items: selectedItems.map((item) => ({
          jobId: item.jobId,
          quantity: getOrderItemQuantity(quantities, item.jobId)
        })),
        ...orderForm
      });
      saveOrderAddress(account, orderForm);
      window.location.assign(buildOrderDetailUrl(created.order.id, created.order.publicToken));
    } catch (nextError) {
      setError(nextError.message || "创建订单失败，请稍后再试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace order-page">
        <div className="task-toolbar">
          <div>
            <p className="eyebrow">Custom magnets</p>
            <h2>选图定制</h2>
            <p className="storage-note">勾选卡夹中要制作的图片，并分别设置每张的制作数量。</p>
          </div>
          <button className="secondary-button" onClick={() => window.location.assign("/")} type="button">
            <ArrowLeft size={18} />
            <span>返回卡夹</span>
          </button>
        </div>
        {isLoading ? <p className="storage-note">正在读取卡夹…</p> : null}
        {error ? <p className="error-note">{error}</p> : null}
        {!isLoading && !clipItems.length ? (
          <article className="draw-observability-card">
            <p>卡夹里还没有可定制的抽卡图片。</p>
            <button className="draw-card-primary" onClick={() => window.location.assign("/")} type="button">去抽卡</button>
          </article>
        ) : null}
        {clipItems.length ? (
          <>
            <section className="draw-observability-card">
              <h3>选择图片</h3>
              <div className="draw-card-order-items checkout-order-items">
                {clipItems.map((item, index) => {
                  const selected = selectedJobIds.includes(item.jobId);
                  const quantity = getOrderItemQuantity(quantities, item.jobId);
                  return (
                    <article className={`draw-card-order-item ${selected ? "is-selected" : ""}`} key={`${item.jobId}-${index}`}>
                      <label className="checkout-item-select">
                        <input checked={selected} onChange={() => toggleSelectedItem(item.jobId)} type="checkbox" />
                        <span>选择此图</span>
                      </label>
                      <OrderItemPreview alt={item.styleName || `冰箱贴 ${index + 1}`} note="图片准备中" src={item.thumbnailUrl || item.imageUrl} title={item.styleName || `冰箱贴 ${index + 1}`} />
                      <div className="draw-card-order-item-copy">
                        <div className="draw-card-order-item-head">
                          <strong>{item.styleName || `冰箱贴 ${index + 1}`}</strong>
                          {selected ? <span className="draw-card-order-item-note">小计 {formatCurrencyCents(amountPreview.unitPriceCents * quantity)}</span> : null}
                        </div>
                        {selected ? (
                          <div className="draw-card-order-item-stepper">
                            <button disabled={quantity <= 1} onClick={() => updateQuantity(item.jobId, quantity - 1)} type="button">-</button>
                            <span>{quantity}</span>
                            <button disabled={quantity >= MAX_ORDER_ITEM_QUANTITY} onClick={() => updateQuantity(item.jobId, quantity + 1)} type="button">+</button>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
            <section className="draw-observability-card">
              <h3>订单信息</h3>
              <div className="draw-card-order-summary">
                <p>已选 {selectedItems.length} 款，共 {totalItemCount} 枚</p>
                <p>单价 {formatCurrencyCents(amountPreview.unitPriceCents)} / 枚</p>
                <p>邮费 {amountPreview.shippingFeeCents > 0 ? formatCurrencyCents(amountPreview.shippingFeeCents) : "包邮"}</p>
                <strong>合计 {formatCurrencyCents(amountPreview.totalCents)}</strong>
                <span className="storage-note">购买 {totalItemCount} 枚冰箱贴，可赠送 {totalItemCount * 10} 币。</span>
              </div>
              <div className="draw-card-order-form">
                <label className="field-label">收件人<input onChange={(event) => setOrderForm((current) => ({ ...current, receiverName: event.target.value }))} type="text" value={orderForm.receiverName} /></label>
                <label className="field-label">手机号<input onChange={(event) => setOrderForm((current) => ({ ...current, receiverPhone: event.target.value }))} type="tel" value={orderForm.receiverPhone} /></label>
                <label className="field-label">收货地址<input onChange={(event) => setOrderForm((current) => ({ ...current, address: event.target.value }))} type="text" value={orderForm.address} /></label>
                <label className="field-label">备注<textarea onChange={(event) => setOrderForm((current) => ({ ...current, remark: event.target.value }))} rows="3" value={orderForm.remark} /></label>
              </div>
              <div className="card-actions">
                <button className="draw-card-primary" disabled={!orderConfig?.enabled || !selectedItems.length || !totalItemCount || isSubmitting} onClick={handleSubmit} type="button">
                  {isSubmitting ? <LoaderCircle className="spin" size={18} /> : null}
                  <span>{isSubmitting ? "创建订单中" : "提交订单并查看收款码"}</span>
                </button>
              </div>
            </section>
          </>
        ) : null}
      </section>
      {showAuthModal ? (
        <AuthModal
          onAuthenticated={(nextAccount) => {
            setAccount(nextAccount);
            setOrderForm((current) => fillOrderAddressFromSaved(current, nextAccount));
            setShowAuthModal(false);
          }}
          onClose={() => { pendingCheckoutRef.current = false; setShowAuthModal(false); }}
        />
      ) : null}
    </main>
  );
}

function FridgeMagnetOrderPage() {
  const orderId = String(window.location.pathname.split("/").filter(Boolean).pop() || "");
  const isBodyBookOrder = window.location.pathname.startsWith("/book/orders/");
  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token") || "";
  const payCode = searchParams.get("payCode") || "";
  const [order, setOrder] = useState(null);
  const [orderConfig, setOrderConfig] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [payment, setPayment] = useState(null);
  const [paymentError, setPaymentError] = useState("");
  const [isPreparingPayment, setIsPreparingPayment] = useState(false);
  const [orderCopied, setOrderCopied] = useState(false);
  const [contactCopied, setContactCopied] = useState(false);
  const orderCopiedTimeoutRef = useRef(null);
  const contactCopiedTimeoutRef = useRef(null);
  const paymentRequestRef = useRef("");
  const paymentRefreshTimeoutRef = useRef(null);
  const payableCents = Number(order?.payableCents ?? order?.totalCents ?? 0);

  useEffect(() => {
    return () => {
      if (orderCopiedTimeoutRef.current) window.clearTimeout(orderCopiedTimeoutRef.current);
      if (contactCopiedTimeoutRef.current) window.clearTimeout(contactCopiedTimeoutRef.current);
      if (paymentRefreshTimeoutRef.current) window.clearTimeout(paymentRefreshTimeoutRef.current);
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
    if (!order?.id || order.orderStatus !== "pending_payment" || orderConfig?.paymentMode !== "wechat") return undefined;
    const requestKey = `${order.id}:${payCode || "native"}`;
    if (paymentRequestRef.current === requestKey) return undefined;
    paymentRequestRef.current = requestKey;
    let isActive = true;

    const refreshPaidOrder = async (attempt = 0) => {
      if (!isActive) return;
      try {
        const payload = await fetchOrderDetail(order.id, token);
        if (!isActive) return;
        setOrder(payload.order || null);
        setOrderConfig(payload.config || null);
        if (payload.order?.paymentStatus === "paid" || attempt >= 11) {
          if (payload.order?.paymentStatus === "paid") setPayment(null);
          return;
        }
      } catch {
        if (!isActive) return;
      }
      paymentRefreshTimeoutRef.current = window.setTimeout(() => refreshPaidOrder(attempt + 1), 1500);
    };

    const startPayment = async () => {
      setIsPreparingPayment(true);
      setPaymentError("");
      try {
        const payload = await payOrderRequest(order.id, payCode ? { code: payCode } : {});
        if (!isActive) return;
        const nextPayment = payload.payment || null;
        if (nextPayment?.status === "requires_authorization" && nextPayment.authorizationUrl) {
          window.location.assign(nextPayment.authorizationUrl);
          return;
        }
        setPayment(nextPayment);
        if (nextPayment?.channel === "wechat_jsapi" && nextPayment.jsapi) {
          await invokeWechatJsapiPayment(nextPayment.jsapi);
          if (!isActive) return;
          const url = new URL(window.location.href);
          url.searchParams.delete("payCode");
          window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
          await refreshPaidOrder();
        }
        if (nextPayment?.channel === "wechat_native") {
          await refreshPaidOrder();
        }
      } catch (nextError) {
        if (isActive) setPaymentError(nextError.message || "发起微信支付失败，请稍后重试。");
      } finally {
        if (isActive) setIsPreparingPayment(false);
      }
    };

    void startPayment();
    return () => { isActive = false; };
  }, [order?.id, order?.orderStatus, orderConfig?.paymentMode, payCode, token]);

  async function handleCopyOrderNo() {
    if (!order?.orderNo) return;
    await copyText(order.orderNo);
    setOrderCopied(true);
    if (orderCopiedTimeoutRef.current) window.clearTimeout(orderCopiedTimeoutRef.current);
    orderCopiedTimeoutRef.current = window.setTimeout(() => setOrderCopied(false), 1600);
  }

  async function handleCopyContact() {
    await copyText(getContactWechatId(orderConfig));
    setContactCopied(true);
    if (contactCopiedTimeoutRef.current) window.clearTimeout(contactCopiedTimeoutRef.current);
    contactCopiedTimeoutRef.current = window.setTimeout(() => setContactCopied(false), 1600);
  }

  return (
    <main className={`app-shell${isBodyBookOrder ? " body-book-order-detail-page" : ""}`}>
      <section className="workspace order-page">
        <div className="task-toolbar">
          <div>
            <p className="eyebrow">{isBodyBookOrder ? "Body book order" : "Fridge order"}</p>
            <h2>订单详情</h2>
            <p className="storage-note">可在这里查看订单状态、收货信息和{isBodyBookOrder ? "认知书页面" : "下单图片"}。</p>
          </div>
          <button className="secondary-button" onClick={() => window.location.assign(isBodyBookOrder ? "/book/orders" : "/fridge/orders")} type="button">
            <Home size={18} />
            <span>返回我的订单</span>
          </button>
        </div>
        <div className="task-actions order-detail-contact-action">
          <button className="secondary-button" onClick={handleCopyContact} type="button">
            <Clipboard size={18} />
            <span>{contactCopied ? "客服微信已复制" : "联系客服"}</span>
          </button>
        </div>
        {isLoading ? <p className="storage-note">正在读取订单…</p> : null}
        {error ? <p className="error-note">{error}</p> : null}
        {paymentError ? <p className="error-note">{paymentError}</p> : null}
        {order ? (
          <section className="task-page">
            {isPreparingPayment ? <p className="storage-note">正在准备微信支付…</p> : null}
            {payment?.channel === "wechat_native" && payment.codeUrl ? (
              <article className="draw-observability-card native-payment-panel">
                <h3>请使用微信扫码付款</h3>
                <p className="storage-note">应付金额 {formatCurrencyCents(payableCents)}，扫码后无需手动输入金额。</p>
                <img alt="微信支付二维码" className="native-payment-qr" src={createQrSvgDataUrl(payment.codeUrl, { margin: 1 })} />
                <p className="storage-note">支付成功后，订单状态会自动更新。</p>
              </article>
            ) : null}
            {order.orderStatus === "pending_payment" && isManualPaymentOrder(order, orderConfig) ? (
              <article className="draw-observability-card manual-payment-guide">
                <div className="draw-observability-head">
                  <div className="draw-observability-main">
                    <div className="task-meta-row">
                      <strong>请扫描商户收款码付款</strong>
                      <span className="task-status queued">待确认收款</span>
                    </div>
                    <p className="storage-note">请按下方应付金额付款。付款成功后，管理员会核验到账并将订单更新为待发货。</p>
                  </div>
                </div>
                <img alt="微信商户收款码" className="manual-payment-qr" src="/payment/wechat-merchant-collection.png" />
                <div className="draw-observability-grid">
                  <div className="draw-observability-metric">
                    <strong>应付金额</strong>
                    <span>{formatCurrencyCents(payableCents)}</span>
                  </div>
                  <div className="draw-observability-metric">
                    <strong>订单号</strong>
                    <span>{order.orderNo}</span>
                  </div>
                </div>
                <p className="storage-note">请在 {formatDateTime(order.expiresAt)} 前完成付款；转账备注请填写订单号，便于快速核验。</p>
                <div className="manual-payment-actions">
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
                    <span className={`task-status ${orderStatusTone(order.orderStatus)}`}>{getOrderPrimaryStatusLabel(order)}</span>
                  </div>
                  <p className="storage-note">下单时间 {formatDateTime(order.createdAt)}，实付 {formatCurrencyCents(payableCents)}</p>
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
                {Number(order.beanDiscountCents || 0) > 0 ? <div className="draw-observability-metric"><strong>豆豆优惠</strong><span>-{formatCurrencyCents(order.beanDiscountCents)}</span></div> : null}
                <div className="draw-observability-metric"><strong>实付金额</strong><span>{formatCurrencyCents(payableCents)}</span></div>
              </div>
            </article>

            <article className="draw-observability-card">
              <h3>收货信息</h3>
              <p className="storage-note">{order.receiverName} · {order.receiverPhone}</p>
              <p className="storage-note">{order.addressDetail}</p>
              {order.remark ? <p className="storage-note">备注：{order.remark}</p> : null}
            </article>

            {order.shippingTrackingNo ? (
              <article className="draw-observability-card">
                <h3>物流信息</h3>
                <p className="storage-note">{order.shippingCarrier || "快递"} · {order.shippingTrackingNo}</p>
              </article>
            ) : null}

            <article className="draw-observability-card">
              <h3>{isBodyBookOrder ? "认知书内容" : "下单图片"}</h3>
              <div className="draw-card-order-items order-detail-items">
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
    lightboxResultAlt,
    pocketAddLabel = "加入卡夹",
    pocketAddedLabel = "已加入卡夹",
    pocketRemoveLabel = "移出卡夹",
    pendingRemovalBody,
    previewAlt,
    readErrorMessage,
    removeClipErrorMessage,
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
  const [originalPreview, setOriginalPreview] = useState(null);
  const [showOriginalUnlockPrompt, setShowOriginalUnlockPrompt] = useState(false);
  const [originalPreviewLoadingJobId, setOriginalPreviewLoadingJobId] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [flyingCard, setFlyingCard] = useState(null);
  const [clipReceiving, setClipReceiving] = useState(false);
  const [visitorState, setVisitorState] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [latestManualOrder, setLatestManualOrder] = useState(() => readLatestManualOrder());
  const [inviteCode, setInviteCode] = useState("");
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDrawConfigModal, setShowDrawConfigModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false);
  const [balanceAlert, setBalanceAlert] = useState("");
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
  const [stylePickerStyles, setStylePickerStyles] = useState([]);
  const [selectedStyleIds, setSelectedStyleIds] = useState([]);
  const [drawCount, setDrawCount] = useState(DEFAULT_PUBLIC_DRAW_COUNT);
  const [selectedSubjectType, setSelectedSubjectType] = useState("");
  const [stylePickerError, setStylePickerError] = useState("");
  const [isLoadingStylePicker, setIsLoadingStylePicker] = useState(false);
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

  function redirectToWechatAuthorization(authorizationUrl) {
    if (!authorizationUrl) return false;
    window.location.assign(authorizationUrl);
    return true;
  }

  async function openStylePicker() {
    setPhase("style-picker");
    setError("");
    setStylePickerError("");
    if (stylePickerStyles.length || isLoadingStylePicker || experienceType !== "draw-card") return;

    setIsLoadingStylePicker(true);
    try {
      const payload = await fetchPublicDrawCardStyles();
      setStylePickerStyles(Array.isArray(payload.styles) ? payload.styles : []);
    } catch (nextError) {
      setStylePickerError(nextError.message || "读取抽卡风格失败，请稍后再试。");
    } finally {
      setIsLoadingStylePicker(false);
    }
  }

  function clearPersistedSession() {
    try {
      window.localStorage.removeItem(sessionStorageKey);
    } catch {}
  }

  function applySession(payload) {
    const nextSessionId = String(payload?.sessionId || "");
    setSession(payload);
    setSessionId(nextSessionId);
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
        if (isActive) {
          setVisitorState(payload);
          setOrderForm((current) => fillOrderAddressFromSaved(current, payload?.account));
        }
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

    // 首页始终从上传图片开始。生成结果仅在当前页面会话中展示；用户加入卡夹的图片
    // 已由卡夹接口独立保存，因此不会受刷新或重新打开首页的影响。
    clearPersistedSession();

    return () => {
      isActive = false;
    };
  }, [clipErrorMessage, experienceType, sessionStorageKey]);

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

  const selectedDrawCardStyles = useMemo(() => {
    const styleById = new Map(stylePickerStyles.map((style) => [style.id, style]));
    return selectedStyleIds.map((styleId) => styleById.get(styleId)).filter(Boolean);
  }, [selectedStyleIds, stylePickerStyles]);

  const isDrawCardExperience = experienceType === "draw-card";
  const requestedDrawCount = Math.min(Math.max(Number(drawCount) || DEFAULT_PUBLIC_DRAW_COUNT, MIN_PUBLIC_DRAW_COUNT), MAX_PUBLIC_STYLE_SELECTION);
  const estimatedRandomDrawCost = isDrawCardExperience ? requestedDrawCount : 1;
  const canStart = Boolean(referenceFile) && !isSubmitting;
  const canStartCustomDraw = Boolean(referenceFile) && selectedStyleIds.length > 0 && !isSubmitting;
  const activeResult = activeResultIndex >= 0 ? toDisplayResult(displayItems[activeResultIndex]) : activeResultIndex === -3 ? activeClipPreview : null;
  const succeededCount = Number(session?.summary?.succeeded ?? displayItems.filter((item) => item.status === "succeeded").length);
  const totalCount = Number(session?.summary?.total ?? displayItems.length);
  const currentSessionStatus = String(session?.status || "");

  const resultsHeading = currentSessionStatus === "running" || currentSessionStatus === "queued"
    ? `已生成 ${succeededCount} / ${totalCount || "--"} 张结果`
    : currentSessionStatus === "partial"
      ? `部分结果已抵达，已扣 ${Number(session?.quotaChargedCount || succeededCount || 0)} 币。`
    : currentSessionStatus === "failed"
        ? "这一轮没有成功结果，本轮未扣次数。"
        : resultsTitle;

  const resultsBodyCopy = currentSessionStatus === "running" || currentSessionStatus === "queued"
    ? (session?.message || waitingFallback)
    : currentSessionStatus === "partial"
      ? (session?.message || "成功结果可以正常保留，仅扣除成功生成的币。")
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
    setStylePickerError("");
    setShowDrawConfigModal(false);
    setSelectedSubjectType("");
    setDrawCount(DEFAULT_PUBLIC_DRAW_COUNT);
    resultMediaRefs.current.clear();
  }

  function confirmResetExperience() {
    const confirmed = window.confirm("换张图片重做后，本轮未被放入口袋的结果会被删除。请先确认你喜欢的图片已经放入口袋。");
    if (!confirmed) return;
    resetExperience();
  }

  function handleFileChange(file, options = {}) {
    const successPhase = options.successPhase || "ready";
    const invalidPhase = options.invalidPhase || successPhase;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("请上传 JPG、PNG 或 WebP 图片。");
      setPhase(invalidPhase);
      return;
    }

    clearPersistedSession();
    setReferenceFile(file);
    setSessionId("");
    setSession(null);
    setResults([]);
    setError("");
    setStylePickerError("");
    setPhase(successPhase);
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

  function toggleSelectedStyle(styleId) {
    if (!styleId) return;
    setStylePickerError("");
    setSelectedStyleIds((current) => {
      if (current.includes(styleId)) {
        return current.filter((item) => item !== styleId);
      }
      if (current.length >= MAX_PUBLIC_STYLE_SELECTION) {
        setStylePickerError(`最多选择 ${MAX_PUBLIC_STYLE_SELECTION} 种风格。`);
        return current;
      }
      return [...current, styleId];
    });
  }

  async function startDrawCard(options = {}) {
    if (!referenceFile) return;
    const requestedStyleIds = Array.isArray(options.selectedStyleIds) ? options.selectedStyleIds.filter(Boolean).slice(0, MAX_PUBLIC_STYLE_SELECTION) : [];
    const isManualSelection = requestedStyleIds.length > 0;
    const estimatedCost = isManualSelection ? requestedStyleIds.length : estimatedRandomDrawCost;

    setIsSubmitting(true);
    setError("");
    setStylePickerError("");
    try {
      if (isDrawCardExperience && !isManualSelection && !selectedSubjectType) {
        setError("请先选择照片主体类型。");
        return;
      }

      const latestVisitorState = await fetchVisitorState();
      setVisitorState(latestVisitorState);
      if (!latestVisitorState?.authenticated) {
        if (redirectToWechatAuthorization(latestVisitorState?.authorizationUrl)) return;
        setError("请在微信内打开网页并完成授权后再开始制作。");
        return;
      }
      if (!latestVisitorState?.canGenerate) {
        setError(latestVisitorState?.contactMessage || clipContactFallback);
        if (requestedStyleIds.length) setStylePickerError(latestVisitorState?.contactMessage || clipContactFallback);
        return;
      }
      if (Number(latestVisitorState?.quotaRemaining || 0) < estimatedCost) {
        const message = `本次最多需要 ${estimatedCost} 币，当前剩余 ${Number(latestVisitorState?.account?.coinBalance || 0)} 币。`;
        setError(message);
        if (requestedStyleIds.length) setStylePickerError(message);
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
      if (requestedStyleIds.length) {
        formData.append("selectedStyleIds", JSON.stringify(requestedStyleIds));
      } else if (isDrawCardExperience) {
        formData.append("drawCount", String(requestedDrawCount));
        formData.append("subjectType", selectedSubjectType);
      }

      const response = await fetch(`${apiBase}/sessions`, {
        method: "POST",
        headers: { "x-draw-trace-id": traceId },
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || createErrorMessage);

      setShowDrawConfigModal(false);
      applySession(payload);
      refreshVisitorStateSilently();
    } catch (nextError) {
      setError(nextError.message || createErrorMessage);
      if (requestedStyleIds.length) {
        setStylePickerError(nextError.message || createErrorMessage);
        setPhase("style-picker");
      } else {
        setPhase("ready");
      }
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

  function closeOriginalPreview() {
    if (originalPreview?.url?.startsWith("blob:")) URL.revokeObjectURL(originalPreview.url);
    setOriginalPreview(null);
  }

  async function handleSwitchAccount() {
    setIsSwitchingAccount(true);
    try {
      await logoutCurrentAccount();
      const payload = await fetchVisitorState().catch(() => null);
      setVisitorState(payload);
      setClipItems([]);
      setShowUserMenu(false);
      setShowAuthModal(true);
    } catch (nextError) {
      setError(nextError.message || "切换账号失败，请稍后再试。");
    } finally {
      setIsSwitchingAccount(false);
    }
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

  async function handleDownloadClipOriginal(item) {
    if (!item?.jobId) return;

    let latestVisitorState = visitorState;
    try {
      latestVisitorState = await fetchVisitorState();
      setVisitorState(latestVisitorState);
    } catch {}

    if (!latestVisitorState?.authenticated) {
      if (!redirectToWechatAuthorization(latestVisitorState?.authorizationUrl)) {
        setError("请在微信内完成授权后再下载原图。");
      }
      return;
    }
    if (!latestVisitorState?.account?.canRedeemOriginalDownloads) {
      setShowOriginalUnlockPrompt(true);
      return;
    }

    const clipItem = clipItems.find((clip) => clip.jobId === item.jobId);
    const isAlreadyRedeemed = Boolean(clipItem?.originalRedeemed);
    if (!isAlreadyRedeemed && Number(latestVisitorState.account.coinBalance || 0) < 1) {
      setBalanceAlert("兑换原图需要 1 币，当前币不足。");
      return;
    }
    if (!isAlreadyRedeemed && !window.confirm("本次兑换将消耗 1 枚币。是否继续？")) return;

    try {
      setOriginalPreviewLoadingJobId(item.jobId);
      const url = await fetchPublicClipOriginalPreview(item.jobId);
      setOriginalPreview({
        jobId: item.jobId,
        styleName: item.styleName || "",
        url
      });
      const [nextVisitorState, nextClipPayload] = await Promise.all([
        fetchVisitorState(),
        fetchPublicClipItems(experienceType)
      ]);
      setVisitorState(nextVisitorState);
      setClipItems(nextClipPayload.items || []);
      setError("");
    } catch (nextError) {
      const message = nextError.message || "下载原图失败，请稍后再试。";
      if (isInsufficientBalanceMessage(message)) setBalanceAlert(message);
      else setError(message);
    } finally {
      setOriginalPreviewLoadingJobId("");
    }
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
      saveOrderAddress(visitorState?.account, orderForm);
      setShowOrderModal(false);
      if (created.payment?.mode === "wechat") {
        goToOrderDetail(created.order.id, created.order.publicToken);
        return;
      }
      syncLatestManualOrder(created.order, orderConfig, created.order.publicToken);
      setLatestManualOrder(readLatestManualOrder());
      setManualPaymentOrder(created);
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

  function renderClipPanel({ showCollection = true, showAccount = true } = {}) {
    return (
      <aside
        className={`draw-card-clip-panel ${showCollection ? "has-collection" : ""} ${showAccount ? "has-account" : ""} ${clipReceiving && showCollection ? "is-receiving" : ""}`}
        ref={showCollection ? cardClipPanelRef : null}
      >
        {showCollection ? (
          <>
            <div className="draw-card-clip-head">
              <div>
                <p className="draw-card-kicker">{clipKicker}</p>
                <h3>{clipTitle}</h3>
              </div>
              <div className="draw-card-clip-head-actions">
                <span className="draw-card-clip-count">{clipItems.length}</span>
              </div>
            </div>

            {clipItems.length ? (
              <div className="draw-card-clip-list">
                {clipItems.map((item, index) => experienceType === "draw-card" ? (
                  <button
                    aria-label={`放大查看 ${item.styleName || `${clipItemFallback} ${index + 1}`}`}
                    className="draw-card-clip-thumbnail"
                    key={`clip-${item.jobId}-${index}`}
                    onClick={() => openClipPreview(item.jobId)}
                    title={item.styleName || `${clipItemFallback} ${index + 1}`}
                    type="button"
                  >
                    <img alt={item.styleName || `${clipItemFallback} ${index + 1}`} src={item.thumbnailUrl || item.imageUrl} />
                    <AcrylicMagnetCorners />
                  </button>
                ) : (
                  <article className="draw-card-clip-item" key={`clip-${item.jobId}-${index}`}>
                    <button className="draw-card-clip-preview" onClick={() => openClipPreview(item.jobId)} type="button">
                      <img alt={item.styleName || `${clipItemFallback} ${index + 1}`} src={item.thumbnailUrl || item.imageUrl} />
                      <AcrylicMagnetCorners />
                    </button>
                    <div className="draw-card-clip-meta">
                      <strong>{item.styleName || `${clipItemFallback} ${index + 1}`}</strong>
                      <div className="draw-card-clip-item-actions">
                        <button className="draw-card-clip-remove" onClick={() => requestRemoveFromClip(item)} type="button">
                          {pocketRemoveLabel}
                        </button>
                        <button className="draw-card-clip-download" disabled={originalPreviewLoadingJobId === item.jobId} onClick={() => handleDownloadClipOriginal(item)} type="button">
                          {originalPreviewLoadingJobId === item.jobId ? "加载中" : item.originalRedeemed ? "下载原图" : visitorState?.account?.canRedeemOriginalDownloads ? "1币兑换原图" : "下单后兑换"}
                        </button>
                      </div>
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

            {experienceType === "draw-card" ? (
              <div className="draw-card-clip-order-row">
                <button className="draw-card-clip-order draw-card-clip-order-prominent" disabled={!clipItems.length || !orderConfig?.enabled} onClick={() => window.location.assign("/draw/order")} type="button">
                  <Sparkles size={16} />
                  <span>{orderConfig?.enabled ? "选图定制" : "定制暂未开放"}</span>
                </button>
                <span className="draw-card-clip-order-price">
                  {Number(orderConfig?.unitPriceCents || 0) > 0 ? `冰箱贴 ${formatCurrencyCents(orderConfig.unitPriceCents)} / 枚` : "冰箱贴价格加载中"}
                </span>
              </div>
            ) : null}
          </>
        ) : null}

        {showAccount ? <div className="draw-card-clip-empty draw-card-account-card">
          <div className="draw-card-account-summary">
            <span>账户币</span>
            <strong>{visitorState ? `${visitorState.account?.coinBalance || 0} 币` : "--"}</strong>
            <p>{visitorState?.account?.canRedeemOriginalDownloads ? "已获得原图兑换资格，每张兑换消耗 1 币" : "定制订单支付成功后即可兑换原图"}</p>
            <p>每定制1枚冰箱贴，可获赠10币。</p>
          </div>
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
            {experienceType === "draw-card" && visitorState?.account?.isRegistered ? (
              <button className="draw-card-secondary" onClick={() => window.location.assign("/fridge/orders")} type="button">
                <span>我的订单</span>
              </button>
            ) : null}
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
        </div> : null}
      </aside>
    );
  }

  return (
    <main className={`draw-card-shell ${themeClass} ${route} phase-${phase}`}>
      <div className="draw-card-ambient draw-card-ambient-a" />
      <div className="draw-card-ambient draw-card-ambient-b" />
      {experienceType === "draw-card" ? (
        <div className="draw-card-utility-bar draw-card-utility-bar-draw">
          {visitorState?.account?.isRegistered ? (
            <button
              className="draw-card-utility-link"
              onClick={() => setShowUserMenu(true)}
              type="button"
            >
              {visitorState.account.username || "已登录"}
            </button>
          ) : (
            <button className="draw-card-utility-link" onClick={() => setShowAuthModal(true)} type="button">登录 / 注册</button>
          )}
        </div>
      ) : null}

      {(phase === "idle" || phase === "ready") && (
        <section className="draw-card-stage">
          <div className="draw-card-stage-layout">
            <div className="draw-card-stage-main">
              <div className="draw-card-hero">
                {titleKicker ? <p className="draw-card-kicker">{titleKicker}</p> : null}
                {isDrawCardExperience ? (
                  <img className="draw-card-handwritten-title" src="/ui/ai-artist-handwritten.png" alt={title} />
                ) : (
                  <h1 className="draw-card-title">{title}</h1>
                )}
                {subtitle ? <p className="draw-card-subtitle">{subtitle}</p> : null}
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
                  <button
                    className="draw-card-primary"
                    disabled={!canStart}
                    onClick={isDrawCardExperience ? () => setShowDrawConfigModal(true) : startDrawCard}
                    type="button"
                  >
                    {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                    <span>{isSubmitting ? startButtonLoading : startButtonIdle}</span>
                  </button>
                  {experienceType === "draw-card" ? (
                    <button className="draw-card-secondary" disabled={isSubmitting} onClick={() => openStylePicker()} type="button">
                      <span>自选风格</span>
                    </button>
                  ) : null}
                  {referenceFile ? (
                    <button className="draw-card-secondary" onClick={resetExperience} type="button">
                      <RefreshCw size={18} />
                      <span>重新选择</span>
                    </button>
                  ) : null}
                </div>

                {error ? <p className="error-note draw-card-inline-error">{error}</p> : null}
              </section>

              {isDrawCardExperience ? renderClipPanel({ showAccount: false }) : null}
            </div>

            <div className={isDrawCardExperience ? "draw-card-account-column" : ""}>
              {isDrawCardExperience ? renderClipPanel({ showCollection: false }) : renderClipPanel()}
            </div>
          </div>
        </section>
      )}

      {phase === "style-picker" && experienceType === "draw-card" ? (
        <section className="draw-card-stage">
          <div className="draw-card-style-picker-page">
            <div className="draw-card-style-picker-head">
              <div>
                <p className="draw-card-kicker">Custom selection</p>
                <h2>自选最多 {MAX_PUBLIC_STYLE_SELECTION} 种风格</h2>
                <p className="draw-card-subtitle">这里不会随机抽取。你选中的风格会直接用于这一轮生成，所以缩略图做得更密一些，方便一屏快速挑选。</p>
              </div>
              <button
                className="draw-card-secondary"
                onClick={() => {
                  setError("");
                  setStylePickerError("");
                  setPhase(referenceFile ? "ready" : "idle");
                }}
                type="button"
              >
                <ArrowLeft size={18} />
                <span>返回抽卡页</span>
              </button>
            </div>

            <section className="draw-card-upload-panel draw-card-style-picker-panel">
              <div className="draw-card-style-picker-toolbar">
                <label className={`draw-card-style-upload ${referencePreviewUrl ? "has-image" : ""}`} htmlFor="draw-card-style-picker-input">
                  {referencePreviewUrl ? (
                    <img alt={previewAlt} className="draw-card-upload-preview" src={referencePreviewUrl} />
                  ) : (
                    <div className="draw-card-upload-empty">
                      <ImageUp size={20} />
                      <strong>先上传图片</strong>
                      <span>上传后再挑风格</span>
                    </div>
                  )}
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    id="draw-card-style-picker-input"
                    onChange={(event) => {
                      handleFileChange(event.target.files?.[0] || null, { successPhase: "style-picker", invalidPhase: "style-picker" });
                      event.target.value = "";
                    }}
                    type="file"
                  />
                </label>

                <div className="draw-card-style-picker-summary">
                  <div className="draw-card-style-picker-count">已选 {selectedStyleIds.length} / {MAX_PUBLIC_STYLE_SELECTION}</div>
                  <p className="draw-card-meta-note">每次最多选择 {MAX_PUBLIC_STYLE_SELECTION} 种风格。成功几张扣几币，失败结果不扣币。</p>
                  {selectedDrawCardStyles.length ? (
                    <div className="draw-card-style-picker-selected">
                      {selectedDrawCardStyles.map((style, index) => (
                        <span className="draw-card-style-chip" key={style.id}>
                          {index + 1}. {style.name || style.id}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="draw-card-meta-note">还没选风格，先点下面的小卡片。</p>
                  )}

                  <div className="draw-card-actions">
                    <button className="draw-card-primary" disabled={!canStartCustomDraw} onClick={() => startDrawCard({ selectedStyleIds })} type="button">
                      {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                      <span>{isSubmitting ? "生成中" : "用选中风格开始"}</span>
                    </button>
                    <button
                      className="draw-card-secondary"
                      disabled={!selectedStyleIds.length}
                      onClick={() => {
                        setStylePickerError("");
                        setSelectedStyleIds([]);
                      }}
                      type="button"
                    >
                      <span>清空已选</span>
                    </button>
                  </div>
                </div>
              </div>

              {stylePickerError ? <p className="error-note draw-card-inline-error">{stylePickerError}</p> : null}
              {isLoadingStylePicker ? <p className="storage-note">正在加载可选风格…</p> : null}
              {!isLoadingStylePicker && !stylePickerStyles.length ? <p className="empty-note">当前没有可选的抽卡风格。</p> : null}

              <div className="draw-card-style-grid" aria-label="可选抽卡风格">
                {stylePickerStyles.map((style) => {
                  const isSelected = selectedStyleIds.includes(style.id);
                  return (
                    <button
                      className={`draw-card-style-card ${isSelected ? "is-selected" : ""}`}
                      key={style.id}
                      onClick={() => toggleSelectedStyle(style.id)}
                      type="button"
                    >
                      <div className="draw-card-style-card-media">
                        <StylePreviewImage alt={style.name || "风格示意图"} className="draw-card-style-card-image" style={style} />
                        <span className="draw-card-style-card-subject">{SUBJECT_TYPE_LABELS[style.subjectType] || SUBJECT_TYPE_LABELS.both}</span>
                        {isSelected ? <span className="draw-card-style-card-check"><Check size={14} /></span> : null}
                      </div>
                      <span className="draw-card-style-card-name">{style.name || style.id}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          </div>
        </section>
      ) : null}

      {phase === "results" && (
        <section className="draw-card-stage draw-card-stage-results">
          <div className="draw-card-results-head">
            <div>
              <p className="draw-card-kicker">{resultsKicker}</p>
              <h2>{resultsHeading}</h2>
              <p className="draw-card-subtitle">{resultsBodyCopy}</p>
            </div>
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
                          <>
                            <button className={`draw-card-save-button ${result.isLiked ? "is-liked" : ""}`} disabled={Boolean(result.isLiked)} onClick={() => addToClip(result)} type="button">
                              {result.isLiked ? <Check size={16} /> : <Sparkles size={16} />}
                              <span>{result.isLiked ? pocketAddedLabel : pocketAddLabel}</span>
                            </button>
                            <button className="draw-card-save-button" onClick={() => handleDownloadClipOriginal(result)} type="button">
                              <Download size={16} />
                              <span>{visitorState?.account?.canRedeemOriginalDownloads ? "1币兑换原图" : "下单后兑换"}</span>
                            </button>
                          </>
                        ) : (
                          <span className={`task-status ${item.status}`}>{statusLabel(item.status)}</span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="draw-card-results-actions">
                <button className="draw-card-secondary draw-card-results-restart" onClick={confirmResetExperience} type="button">
                  <RefreshCw size={18} />
                  <span>换张图片重做</span>
                </button>
              </div>
              {isDrawCardExperience ? renderClipPanel({ showAccount: false }) : null}
            </div>

            {isDrawCardExperience ? renderClipPanel({ showCollection: false }) : renderClipPanel()}
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

      <footer className="draw-card-page-footer">
        <a className="draw-card-utility-link" href="/admin" aria-label="进入后台管理">
          后台入口
        </a>
      </footer>

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
                experienceType === "draw-card" ? (
                  <div className="draw-card-lightbox-actions">
                    <button className="draw-card-clip-remove" onClick={() => requestRemoveFromClip(activeResult)} type="button">
                      {pocketRemoveLabel}
                    </button>
                    <button className="draw-card-clip-download" disabled={originalPreviewLoadingJobId === activeResult.jobId} onClick={() => handleDownloadClipOriginal(activeResult)} type="button">
                      {originalPreviewLoadingJobId === activeResult.jobId ? "加载中" : "下载原图"}
                    </button>
                  </div>
                ) : (
                  <button className="draw-card-clip-remove" onClick={() => requestRemoveFromClip(activeResult)} type="button">
                    {pocketRemoveLabel}
                  </button>
                )
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

      {originalPreview ? (
        <div className="modal-backdrop draw-card-lightbox" onClick={closeOriginalPreview} role="presentation">
          <section className="draw-card-lightbox-panel draw-card-original-preview-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="原图预览">
            <button className="icon-button" onClick={closeOriginalPreview} type="button" aria-label="关闭原图预览">
              <X size={18} />
            </button>
            <img
              alt={`${originalPreview.styleName || resultNameFallback} 原图`}
              onError={() => setError("原图加载失败，请刷新页面后再试。")}
              src={originalPreview.url}
            />
            <div className="draw-card-lightbox-meta">
              <span>{originalPreview.styleName || resultNameFallback}</span>
              <span className="draw-card-meta-note">长按图片保存原图</span>
            </div>
          </section>
        </div>
      ) : null}

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

      {showDrawConfigModal && isDrawCardExperience ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => setShowDrawConfigModal(false)} role="presentation">
          <section className="draw-card-confirm-panel draw-card-config-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="抽卡设置">
            <button className="icon-button" onClick={() => setShowDrawConfigModal(false)} type="button" aria-label="关闭抽卡设置">
              <X size={18} />
            </button>
            <div>
              <p className="draw-card-kicker">Draw settings</p>
              <h2>设置本次抽卡</h2>
              <p className="storage-note">选好照片主体和出图张数后，系统会随机抽取合适风格开始生成。</p>
            </div>
            <div className="draw-card-config-panel">
              <div className="draw-card-config-group">
                <span className="draw-card-config-label">照片主体</span>
                <div className="draw-card-segmented-control" role="radiogroup" aria-label="照片主体">
                  {DRAW_CARD_SUBJECT_OPTIONS.map((option) => (
                    <button
                      className={`draw-card-segment ${selectedSubjectType === option.value ? "is-active" : ""}`}
                      disabled={isSubmitting}
                      key={option.value}
                      onClick={() => {
                        setSelectedSubjectType(option.value);
                        setError("");
                      }}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="draw-card-count-control">
                <span className="draw-card-config-label">本次抽卡</span>
                <div className="draw-card-count-options" role="radiogroup" aria-label="本次抽卡张数">
                  {DRAW_CARD_COUNT_OPTIONS.map((count) => (
                    <button
                      className={`draw-card-segment ${requestedDrawCount === count ? "is-active" : ""}`}
                      disabled={isSubmitting}
                      key={count}
                      onClick={() => setDrawCount(count)}
                      type="button"
                    >
                      {count}张
                    </button>
                  ))}
                </div>
              </div>
              <p className="draw-card-meta-note">本次最多消耗 {estimatedRandomDrawCost} 币，失败结果不扣币。</p>
            </div>
            {error ? <p className="error-note">{error}</p> : null}
            <div className="draw-card-confirm-actions">
              <button className="draw-card-secondary" disabled={isSubmitting} onClick={() => setShowDrawConfigModal(false)} type="button">
                取消
              </button>
              <button className="draw-card-primary" disabled={!selectedSubjectType || isSubmitting} onClick={() => startDrawCard()} type="button">
                {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                <span>{isSubmitting ? startButtonLoading : "确认抽卡"}</span>
              </button>
            </div>
          </section>
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
      {showOriginalUnlockPrompt ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => setShowOriginalUnlockPrompt(false)} role="presentation">
          <section className="draw-card-confirm-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="解锁原图">
            <p className="draw-card-kicker">Original images</p>
            <h2>下载原图</h2>
            <p className="storage-note">任意定制订单支付成功后可兑换原图，每张需消耗 1 币。已下单制作冰箱贴的图片会自动兑换，不额外消耗币。</p>
            <div className="draw-card-confirm-actions">
              <button className="draw-card-secondary" onClick={() => setShowOriginalUnlockPrompt(false)} type="button">暂不定制</button>
              <button className="draw-card-primary" onClick={() => window.location.assign("/draw/order")} type="button">选图定制</button>
            </div>
          </section>
        </div>
      ) : null}

      {balanceAlert ? <BalanceInsufficientModal message={balanceAlert} onClose={() => setBalanceAlert("")} /> : null}

      {showAuthModal ? (
        <AuthModal
          onAuthenticated={(account) => {
            setShowAuthModal(false);
            setVisitorState((current) => current ? { ...current, authenticated: true, account } : current);
            setOrderForm((current) => fillOrderAddressFromSaved(current, account));
          }}
          onClose={() => setShowAuthModal(false)}
        />
      ) : null}

      {showUserMenu ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => setShowUserMenu(false)} role="presentation">
          <section className="draw-card-confirm-panel draw-card-user-menu" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="账户菜单">
            <div className="draw-card-order-head">
              <div>
                <p className="draw-card-kicker">Account</p>
                <h2>{visitorState?.account?.username || "我的账户"}</h2>
              </div>
              <button className="icon-button" onClick={() => setShowUserMenu(false)} type="button" aria-label="关闭账户菜单">
                <X size={18} />
              </button>
            </div>
            <div className="draw-card-confirm-actions draw-card-user-menu-actions">
              <button className="draw-card-secondary" disabled={isSwitchingAccount} onClick={handleSwitchAccount} type="button">
                <span>{isSwitchingAccount ? "正在切换" : "切换账号"}</span>
              </button>
              <button className="draw-card-primary" onClick={() => window.location.assign("/fridge/orders")} type="button">
                <span>我的订单</span>
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
          <section className="draw-card-confirm-panel draw-card-order-panel draw-card-manual-payment-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="微信扫码付款">
            <div className="draw-card-order-head">
              <div>
                <p className="draw-card-kicker">Order created</p>
                <h2>订单已创建，请扫码付款</h2>
              </div>
              <button className="icon-button" onClick={() => goToOrderDetail(manualPaymentOrder.order.id, manualPaymentOrder.order.publicToken)} type="button" aria-label="查看订单详情">
                <X size={18} />
              </button>
            </div>
            <div className="draw-card-order-summary">
              <p>应付金额 {formatCurrencyCents(manualPaymentOrder.order.totalCents)}</p>
              <p>订单号 {manualPaymentOrder.order.orderNo}</p>
              <strong>请在 {formatDateTime(manualPaymentOrder.payment?.expiresAt || manualPaymentOrder.order.expiresAt)} 前完成付款</strong>
              <span className="storage-note">请使用微信扫描下方商户收款码，并按订单金额付款。转账备注请填写订单号；管理员核验到账后会更新订单状态。</span>
            </div>
            <img alt="微信商户收款码" className="manual-payment-qr" src="/payment/wechat-merchant-collection.png" />
            <div className="draw-card-confirm-actions">
              <button className="draw-card-secondary" onClick={handleCopyManualPaymentOrderNo} type="button">
                <Clipboard size={16} />
                <span>{manualOrderCopied ? "订单号已复制" : "复制订单号"}</span>
              </button>
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
    title: style?.title || style?.name || style?.tags?.join(" / ") || "",
    tags: style?.tags?.join("，") || "",
    subjectType: style?.subjectType || "both",
    drawCardEnabled: style?.drawCardEnabled !== false,
    drawCardWeight: Number(style?.drawCardWeight ?? DEFAULT_DRAW_CARD_WEIGHT),
    prompt: style?.prompt || "",
    useStyleImageAsReference: Boolean(style?.useStyleImageAsReference)
  };
}

function getStyleDisplayName(style) {
  return String(style?.title || style?.name || style?.tags?.join("、") || style?.id || "").trim();
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
                  <StylePreviewImage alt={`${getStyleDisplayName(style)}示例图`} style={style} />
                </div>
                <strong className="style-card-title">{getStyleDisplayName(style)}</strong>
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
              <div>
                <h2>{getStyleDisplayName(activeEditingStyle)}</h2>
                <div className="tag-row">
                  {activeEditingStyle.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="style-editor-preview">
              <div className="image-frame">
                <StylePreviewImage alt={`${getStyleDisplayName(activeEditingStyle)}示例图`} style={activeEditingStyle} />
              </div>
              <p className="storage-note">图片保存在 public/style-previews/{activeEditingStyle.id}/cover.*，标题、标签、适用主体、抽卡开关、抽卡权重和提示词保存在 data/styles.json。</p>
            </div>
            <div className="manage-body style-editor-fields">
              <label className="field-label">
                中文标题
                <input
                  onChange={(event) => updateDraft(activeEditingStyle, { title: event.target.value })}
                  placeholder="例如：童趣剪纸插画"
                  value={activeDraft.title}
                />
              </label>
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
          const providerDiagnostics = formatImageJobProviderDiagnostics(job);
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
                {providerDiagnostics ? <p className="storage-note">诊断：{providerDiagnostics}</p> : null}
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
        formData.append("styleName", getStyleDisplayName(style));
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
        if (!response.ok) throw new Error(payload.message || `提交 ${getStyleDisplayName(style)} 失败。`);
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
                    <img alt={getStyleDisplayName(style)} decoding="async" loading="lazy" src={cacheBust(style.galleryImage || style.image, style.imageUpdatedAt)} />
                    <span>{getStyleDisplayName(style)}</span>
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
                    <p className="storage-note">{group.styleIds.map((styleId) => getStyleDisplayName(styleMap.get(styleId)) || styleId).join(" / ") || "暂无风格"}</p>
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

async function updateAdminApiProviderSettingsRequest(payload) {
  const response = await fetch("/api/admin/api-providers/settings", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "保存 API 全局配置失败。");
  return data;
}

async function fetchVisitorState() {
  const response = await fetch("/api/visitor-state");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取访客状态失败。");
  return payload;
}

function invokeWechatJsapiPayment(params) {
  return new Promise((resolve, reject) => {
    const invoke = () => {
      if (!window.WeixinJSBridge?.invoke) {
        reject(new Error("请在微信内打开后完成支付。"));
        return;
      }
      window.WeixinJSBridge.invoke("getBrandWCPayRequest", params, (response) => {
        const message = String(response?.err_msg || "");
        if (message.includes("ok")) {
          resolve(response);
          return;
        }
        reject(new Error(message.includes("cancel") ? "已取消支付。" : "支付未完成，请稍后重试。"));
      });
    };
    if (window.WeixinJSBridge?.invoke) {
      invoke();
    } else {
      document.addEventListener("WeixinJSBridgeReady", invoke, { once: true });
    }
  });
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

async function fetchCurrentAccount() {
  const response = await fetch("/api/auth/me");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取账户信息失败。");
  return payload;
}

async function createReferralLink() {
  const response = await fetch("/api/referrals/link", { method: "POST" });
  const payload = await readAuthJsonResponse(response, { message: "创建邀请链接失败。" });
  if (!response.ok) throw new Error(payload.message || "创建邀请链接失败。");
  return payload;
}

async function captureReferral(token) {
  const response = await fetch("/api/referrals/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  const payload = await readAuthJsonResponse(response, { message: "识别邀请链接失败。" });
  if (!response.ok) throw new Error(payload.message || "识别邀请链接失败。");
  return payload;
}

async function readAuthJsonResponse(response, fallbackPayload = {}) {
  try {
    return await response.json();
  } catch {
    return fallbackPayload;
  }
}

async function requestEmailCode(email, purpose) {
  const response = await fetch("/api/auth/email-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, purpose })
  });
  const payload = await readAuthJsonResponse(response, { message: "验证码发送失败。" });
  if (!response.ok) throw new Error(payload.message || "验证码发送失败。");
  return payload;
}

async function registerWithEmail(payload) {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await readAuthJsonResponse(response, { message: "注册失败。" });
  if (!response.ok) throw new Error(data.message || "注册失败。");
  return data;
}

async function loginWithEmail(email, password) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await readAuthJsonResponse(response, { message: "登录失败。" });
  if (!response.ok) throw new Error(data.message || "登录失败。");
  return data;
}

async function mergeGuestAssets({ mergeClip, mergeBodyBooks }) {
  const response = await fetch("/api/auth/guest-assets/merge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mergeClip, mergeBodyBooks })
  });
  const data = await readAuthJsonResponse(response, { message: "访客资产合并失败。" });
  if (!response.ok) throw new Error(data.message || "访客资产合并失败。");
  return data;
}

async function resetPasswordWithEmail(payload) {
  const response = await fetch("/api/auth/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await readAuthJsonResponse(response, { message: "密码重设失败。" });
  if (!response.ok) throw new Error(data.message || "密码重设失败。");
  return data;
}

async function logoutCurrentAccount() {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "退出登录失败。");
  }
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

async function createBeanPurchase(payload) {
  const response = await fetch("/api/bean-purchases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "创建豆豆购买单失败。");
  return data;
}

async function fetchBeanPurchase(purchaseId) {
  const response = await fetch(`/api/bean-purchases/${encodeURIComponent(purchaseId)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "读取豆豆购买单失败。");
  return data;
}

async function fetchMyBeanPurchases() {
  const response = await fetch("/api/bean-purchases");
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "读取豆豆购买单失败。");
  return data;
}

async function payBeanPurchase(purchaseId, payload = {}) {
  const response = await fetch(`/api/bean-purchases/${encodeURIComponent(purchaseId)}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "发起豆豆购买支付失败。");
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

async function fetchPublicClipOriginalPreview(jobId) {
  const cacheKey = Date.now().toString(36);
  const response = await fetch(`/api/public/clip-items/${encodeURIComponent(jobId)}/download-original?preview=${cacheKey}`, {
    credentials: "same-origin"
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "下载原图失败，请稍后再试。");
  }
  return URL.createObjectURL(await response.blob());
}

function AcrylicMagnetCorners() {
  return <span aria-hidden="true" className="acrylic-magnet-corners">
    <i className="acrylic-magnet-corner top-left" />
    <i className="acrylic-magnet-corner top-right" />
    <i className="acrylic-magnet-corner bottom-left" />
    <i className="acrylic-magnet-corner bottom-right" />
  </span>;
}

async function readJsonPayload(response, fallbackMessage, options = {}) {
  const contentType = String(response.headers.get("content-type") || "");
  const text = await response.text().catch(() => "");
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const looksLikeHtml = contentType.includes("text/html") || /^\s*</.test(text);
    const error = new Error(
      looksLikeHtml
        ? options.htmlMessage || fallbackMessage
        : fallbackMessage
    );
    error.status = response.status;
    throw error;
  }
}

async function fetchPublicDrawCardStyles() {
  const response = await fetch("/api/public/draw-card-styles");
  const payload = await readJsonPayload(response, "读取抽卡风格失败。", {
    htmlMessage: "抽卡风格接口返回了页面内容。请重启当前 Node 服务后再试。"
  });
  if (!response.ok) throw new Error(payload.message || "读取抽卡风格失败。");
  return payload;
}

async function fetchAdminSession() {
  const response = await fetch("/api/admin/session");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取后台登录状态失败。");
  return payload;
}

async function fetchAdminCommercePayments() {
  const response = await fetch("/api/admin/commerce/payments?limit=100");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取收款记录失败。");
  return payload;
}

async function fetchAdminCreditLedger() {
  const response = await fetch("/api/admin/commerce/credits?limit=100");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取币流水失败。");
  return payload;
}

async function fetchAdminUsers(params = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") query.set(key, String(value));
  }
  const response = await fetch(`/api/admin/users${query.size ? `?${query}` : ""}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取用户列表失败。");
  return payload;
}

async function fetchAdminUser(userId) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取用户详情失败。");
  return payload;
}

async function fetchAdminUserClipItems(userId) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/clip-items`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取用户卡夹失败。");
  return payload;
}

function getAdminUserClipDownloadUrl(userId, jobId) {
  return `/api/admin/users/${encodeURIComponent(userId)}/clip-items/${encodeURIComponent(jobId)}/download-original`;
}

async function updateAdminUserStatus(userId, status) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "更新用户状态失败。");
  return payload;
}

async function adjustAdminUserWallet(userId, delta, currency, remark) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta, currency, remark })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "调整余额失败。");
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

async function deleteInviteCodeRequest(id) {
  const response = await fetch(`/api/admin/invite-codes/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "删除邀请码失败。");
  }
}

async function confirmAdminManualPayment(orderId) {
  const response = await fetch(`/api/admin/orders/${orderId}/confirm-manual-payment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "确认收款失败。");
  return data.order;
}

async function confirmAdminManualBeanPurchase(paymentIntentId) {
  const response = await fetch(`/api/admin/commerce/payments/${encodeURIComponent(paymentIntentId)}/confirm-manual`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "确认豆豆购买收款失败。");
  return data.payment;
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
  const [coinBonus, setCoinBonus] = useState(5);
  const [beanBonus, setBeanBonus] = useState(10);
  const [defaultCoinBonus, setDefaultCoinBonus] = useState(settings?.defaultCoinBonus ?? 5);
  const [defaultBeanBonus, setDefaultBeanBonus] = useState(settings?.defaultBeanBonus ?? 10);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const availableInviteCodes = useMemo(
    () => inviteCodes.filter((inviteCode) => inviteCode.enabled !== false && Number(inviteCode.remainingRedemptions || 0) > 0),
    [inviteCodes]
  );

  useEffect(() => {
    setDefaultCoinBonus(settings?.defaultCoinBonus ?? 5);
    setDefaultBeanBonus(settings?.defaultBeanBonus ?? 10);
  }, [settings]);

  async function createCodes() {
    setIsSubmitting(true);
    setError("");
    try {
      await createInviteCodesRequest({ count, prefix, coinBonus, beanBonus });
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
      await updateAdminSettings({ defaultCoinBonus, defaultBeanBonus });
      await onRefreshSettings();
    } catch (nextError) {
      setError(nextError.message || "更新系统设置失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteInvite(inviteCode) {
    if (!window.confirm(`确定删除邀请码 ${inviteCode.code} 吗？删除后将无法兑换。`)) return;
    setError("");
    try {
      await deleteInviteCodeRequest(inviteCode.id);
      await onRefreshInviteCodes();
    } catch (nextError) {
      setError(nextError.message || "删除邀请码失败。");
    }
  }

  return (
    <section className="task-page" aria-label="邀请码与访问记录">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">Invites</p>
          <h2>邀请码与访问记录</h2>
          <p className="storage-note">配置新访客默认奖励、创建邀请码，并查看最近访客的来源、停留、生成与下单情况。</p>
        </div>
        <button className="secondary-button" onClick={() => Promise.all([onRefreshInviteCodes(), onRefreshVisitorRecords(), onRefreshSettings()])} type="button">
          <RefreshCw size={18} />
          <span>刷新</span>
        </button>
      </div>

      <div className="draw-card-upload-panel">
        <label className="field-label">
          新访客默认币数
          <input max="999" min="0" onChange={(event) => setDefaultCoinBonus(clampInviteQuotaBonus(event.target.value))} type="number" value={defaultCoinBonus} />
        </label>
        <label className="field-label">
          新访客默认豆豆数
          <input max="999" min="0" onChange={(event) => setDefaultBeanBonus(clampInviteQuotaBonus(event.target.value))} type="number" value={defaultBeanBonus} />
        </label>
        <div className="card-actions generator-actions">
          <button className="secondary-button" disabled={isSubmitting} onClick={saveSettings} type="button">
            <Save size={18} />
            <span>保存默认奖励</span>
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
        <label className="field-label">
          每个邀请码币数
          <input max="999" min="0" onChange={(event) => setCoinBonus(clampInviteQuotaBonus(event.target.value))} type="number" value={coinBonus} />
        </label>
        <label className="field-label">
          每个邀请码豆豆数
          <input max="999" min="0" onChange={(event) => setBeanBonus(clampInviteQuotaBonus(event.target.value))} type="number" value={beanBonus} />
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
                <span>{Number(inviteCode.coinBonus ?? inviteCode.quotaBonus ?? 5)} 币</span>
                <span>{Number(inviteCode.beanBonus ?? 10)} 豆豆</span>
                <span>已兑换 {inviteCode.redeemedCount}</span>
                <span>剩余 {inviteCode.remainingRedemptions}</span>
              </div>
              <p className="storage-note">创建于 {formatDateTime(inviteCode.createdAt)}</p>
            </div>
            <div className="task-actions">
              <button className="danger-button" onClick={() => deleteInvite(inviteCode)} type="button">
                <Trash2 size={18} />
                <span>删除</span>
              </button>
            </div>
          </article>
        ))}
        {!availableInviteCodes.length ? <p className="empty-note">当前没有可继续兑换的邀请码。</p> : null}
      </div>


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
  const [savedDefaultProviderId, setSavedDefaultProviderId] = useState("");
  const [failoverMode, setFailoverMode] = useState("auto");
  const [savedFailoverMode, setSavedFailoverMode] = useState("auto");
  const [savedPriorityIds, setSavedPriorityIds] = useState([]);
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
    const nextProviders = Array.isArray(payload?.providers) ? payload.providers : [];
    const nextDefaultProviderId = String(payload?.defaultProviderId || "");
    const nextFailoverMode = String(payload?.failoverMode || "auto");
    const nextPriorityIds = Array.isArray(payload?.providerPriorityIds)
      ? payload.providerPriorityIds.map((item) => String(item || "")).filter(Boolean)
      : nextProviders.map((provider) => provider.id);
    setProviders(nextProviders);
    setDefaultProviderId(nextDefaultProviderId);
    setSavedDefaultProviderId(nextDefaultProviderId);
    setFailoverMode(nextFailoverMode);
    setSavedFailoverMode(nextFailoverMode);
    setSavedPriorityIds(nextPriorityIds);
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

  function moveProvider(providerId, direction) {
    setProviders((current) => {
      const index = current.findIndex((provider) => provider.id === providerId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
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

  async function saveApiSettings() {
    setIsSubmitting(true);
    setError("");
    setStatusMessage("");
    try {
      const payload = await updateAdminApiProviderSettingsRequest({
        defaultProviderId,
        failoverMode,
        providerPriorityIds: providers.map((provider) => provider.id)
      });
      applyPayload(payload);
      setStatusMessage("API 全局配置已更新。");
    } catch (nextError) {
      setError(nextError.message || "保存 API 全局配置失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deleteProvider(provider) {
    const message = `确认删除供应商“${provider.name || provider.id}”吗？这会直接从 .env 中移除对应配置。`;
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
      setStatusMessage("供应商已删除。");
    } catch (nextError) {
      setError(nextError.message || "删除 API 供应商失败。");
    } finally {
      setIsSubmitting(false);
    }
  }

  const isEditing = Boolean(editingId);
  const enabledProviders = providers.filter((provider) => provider.enabled);
  const currentPriorityIds = providers.map((provider) => provider.id);
  const hasPendingApiSettingsChanges =
    defaultProviderId !== savedDefaultProviderId ||
    failoverMode !== savedFailoverMode ||
    currentPriorityIds.join(",") !== savedPriorityIds.join(",");

  return (
    <section className="task-page" aria-label="API 配置">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">API providers</p>
          <h2>API 配置</h2>
          <p className="storage-note">这里统一管理生图供应商、默认供应商、优先级和失败策略。保存后会直接改写 `.env`，并立即对当前服务生效。</p>
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
        <div className="draw-card-upload-panel api-provider-form-panel">
          <div className="task-toolbar compact-toolbar">
            <div>
              <h3>全局生图策略</h3>
              <p className="storage-note">默认供应商和优先级都在这里维护，不再放到“下单配置”里。</p>
            </div>
          </div>

          <div className="api-provider-form-grid">
            <label className="field-label">
              默认图片供应商
              <select onChange={(event) => setDefaultProviderId(event.target.value)} value={defaultProviderId}>
                <option value="">自动（按优先级使用第一可用供应商）</option>
                {enabledProviders.map((provider) => (
                  <option key={`api-default-provider-${provider.id}`} value={provider.id}>
                    {provider.name} · {provider.model}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label api-provider-form-span">
              高优先级失败后的策略
              <select onChange={(event) => setFailoverMode(event.target.value)} value={failoverMode}>
                {API_FAILOVER_MODE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {!providers.length ? (
            <p className="storage-note">还没有可排序的供应商，先在下方新增一个。</p>
          ) : hasPendingApiSettingsChanges ? (
            <p className="storage-note">当前有未保存的默认供应商、优先级或失败策略变更。</p>
          ) : (
            <p className="storage-note">当前按列表顺序决定优先级；未手选供应商时，会先使用默认供应商或第一可用供应商。</p>
          )}

          <div className="card-actions generator-actions">
            <button className="secondary-button" disabled={isSubmitting || !hasPendingApiSettingsChanges} onClick={saveApiSettings} type="button">
              <Save size={18} />
              <span>保存全局策略</span>
            </button>
          </div>
        </div>

        <div className="task-list">
          {isLoading ? <p className="empty-note">正在读取 API 供应商配置…</p> : null}
          {!isLoading && !providers.length ? <p className="empty-note">当前还没有可管理的供应商。你可以先新建一个 `.env` 供应商配置。</p> : null}
          {!isLoading
            ? providers.map((provider) => {
                const isDefault = provider.id === defaultProviderId;
                const providerStatusClass = provider.enabled ? "succeeded" : "cancelled";
                const providerIndex = providers.findIndex((item) => item.id === provider.id);
                return (
                  <article className={`api-provider-card ${provider.enabled ? "" : "is-disabled"}`} key={provider.id}>
                    <div className="api-provider-card-head">
                      <div>
                        <h3>{provider.name || provider.id}</h3>
                        <p className="storage-note">ID：{provider.id}</p>
                      </div>
                      <div className="api-provider-badges">
                        <span className="api-provider-chip">优先级 #{providerIndex + 1}</span>
                        <span className={`task-status ${providerStatusClass}`}>{provider.enabled ? "启用中" : "已禁用"}</span>
                        <span className="api-provider-chip">{provider.sourceLabel}</span>
                        {isDefault ? <span className="api-provider-chip is-primary">默认</span> : null}
                      </div>
                    </div>
                    <div className="api-provider-meta">
                      <p className="storage-note">Base URL：{provider.baseUrl || "未配置"}</p>
                      <p className="storage-note">生图模型：{provider.model || "未配置"}</p>
                      <p className="storage-note">接口路线：{API_PROVIDER_ROUTE_OPTIONS.find((option) => option.value === provider.route)?.label || provider.route || "Images API (/images/*)"}</p>
                      <p className="storage-note">识图模型：{provider.visionModel || "未配置"}</p>
                      {provider.source === "page" ? <p className="storage-note">该供应商来自旧页面配置。编辑并保存后，会迁移到 `.env` 里统一管理。</p> : null}
                    </div>
                    <div className="task-actions">
                      <button className="secondary-button" disabled={isSubmitting || providerIndex === 0} onClick={() => moveProvider(provider.id, -1)} type="button">
                        <ArrowUp size={18} />
                        <span>上移</span>
                      </button>
                      <button className="secondary-button" disabled={isSubmitting || providerIndex === providers.length - 1} onClick={() => moveProvider(provider.id, 1)} type="button">
                        <ArrowDown size={18} />
                        <span>下移</span>
                      </button>
                      <button className="secondary-button" disabled={isSubmitting} onClick={() => startEdit(provider)} type="button">
                        <Pencil size={18} />
                        <span>编辑</span>
                      </button>
                      <button className="danger-button" disabled={isSubmitting} onClick={() => deleteProvider(provider)} type="button">
                        <Trash2 size={18} />
                        <span>删除</span>
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
                  : "新增一个供应商，并直接写入 `.env`。"}
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
              接口路线
              <select onChange={(event) => setForm((current) => ({ ...current, route: event.target.value }))} value={form.route}>
                {API_PROVIDER_ROUTE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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

          <p className="storage-note">保存后会直接更新 `.env` 中对应供应商的配置，不再只是页面覆盖。</p>
          <p className="storage-note">如果你需要让某个供应商参与自动切换，把它保持启用，并在左侧列表里调整到合适优先级。</p>

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

function UserAdminPage({ onOpenClip }) {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [delta, setDelta] = useState("");
  const [remark, setRemark] = useState("");
  const [currency, setCurrency] = useState("coin");
  const limit = 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function load(next = {}) {
    setBusy(true);
    try {
      const payload = await fetchAdminUsers({ page: next.page ?? page, limit, search: next.search ?? search, status: next.status ?? status });
      setUsers(payload.users || []);
      setTotal(Number(payload.total || 0));
      setPage(Number(payload.page || 1));
      setError("");
    } catch (nextError) {
      setError(nextError.message || "读取用户列表失败。");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { void load({ page: 1 }); }, []);

  async function openDetail(user) {
    setSelected(user);
    setDetail(null);
    setDelta("");
    setRemark("");
    setCurrency("coin");
    try {
      setDetail(await fetchAdminUser(user.id));
    } catch (nextError) {
      setError(nextError.message || "读取用户详情失败。");
    }
  }

  async function updateStatus(nextStatus) {
    if (!selected) return;
    try {
      const payload = await updateAdminUserStatus(selected.id, nextStatus);
      setSelected(payload.user);
      setDetail((current) => current ? { ...current, user: payload.user } : current);
      await load();
    } catch (nextError) {
      setError(nextError.message || "更新用户状态失败。");
    }
  }

  async function adjustWallet() {
    if (!selected) return;
    try {
      const payload = await adjustAdminUserWallet(selected.id, Number(delta), currency, remark);
      setSelected(payload.user);
      setDetail((current) => current ? { ...current, user: payload.user, ledger: payload.ledger, beanLedger: payload.beanLedger } : current);
      setDelta("");
      setRemark("");
      await load();
    } catch (nextError) {
      setError(nextError.message || "调整余额失败。");
    }
  }

  return (
    <section className="task-page user-admin-page" aria-label="用户管理">
      <div className="task-toolbar">
        <div><p className="eyebrow">Users</p><h2>用户管理</h2><p className="storage-note">管理邮箱注册用户、账户状态、币与豆豆余额。</p></div>
        <button className="secondary-button" disabled={busy} onClick={() => load()} type="button"><RefreshCw size={18} /><span>刷新</span></button>
      </div>
      <div className="task-filters">
        <select onChange={(event) => setStatus(event.target.value)} value={status}><option value="">全部状态</option><option value="active">正常</option><option value="disabled">已禁用</option></select>
        <label className="search-box"><Search size={18} /><input onChange={(event) => setSearch(event.target.value)} placeholder="用户名或邮箱" value={search} /></label>
        <button className="secondary-button" onClick={() => load({ page: 1 })} type="button">筛选</button>
      </div>
      {error ? <p className="error-note">{error}</p> : null}
      {users.length ? (
        <div className="user-admin-table-wrap">
          <table className="user-admin-table">
            <colgroup>
              <col className="user-admin-status-column" />
              <col className="user-admin-identity-column" />
              <col className="user-admin-credit-column" />
              <col className="user-admin-date-column" />
              <col className="user-admin-date-column" />
              <col className="user-admin-orders-column" />
              <col className="user-admin-clip-column" />
              <col className="user-admin-action-column" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">状态</th>
                <th scope="col">用户</th>
                <th scope="col">币 / 豆豆</th>
                <th scope="col">注册时间</th>
                <th scope="col">最近登录</th>
                <th scope="col">订单</th>
                <th scope="col">用户卡夹</th>
                <th scope="col" aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><span className={`task-status user-admin-status ${user.status === "disabled" ? "failed" : "succeeded"}`}>{user.status === "disabled" ? "已禁用" : "正常"}</span></td>
                  <td>
                    <div className="user-admin-identity">
                      <strong title={user.username}>{user.username}</strong>
                      <span title={user.email}>{user.email}</span>
                    </div>
                  </td>
                  <td className="user-admin-number">{user.coinBalance} 币 / {user.beanBalance} 豆豆</td>
                  <td className="user-admin-date">{formatDateTime(user.registeredAt)}</td>
                  <td className="user-admin-date">{formatDateTime(user.lastLoginAt)}</td>
                  <td><div className="user-admin-orders"><strong>{user.orderCount} 笔</strong><span>{formatCurrencyCents(user.paidTotalCents)}</span></div></td>
                  <td><button className="secondary-button user-admin-clip-button" onClick={() => onOpenClip(user.id)} type="button"><Layers3 size={15} /><span>查看卡夹</span></button></td>
                  <td className="user-admin-action"><button className="secondary-button user-admin-detail-button" onClick={() => openDetail(user)} type="button"><Eye size={15} /><span>详情</span></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="empty-note">暂无注册用户。</p>}
      <div className="task-pagination"><p className="storage-note">共 {total} 位用户，当前第 {page} / {totalPages} 页。</p><div className="task-pagination-actions"><button className="secondary-button" disabled={busy || page <= 1} onClick={() => load({ page: page - 1 })} type="button">上一页</button><button className="secondary-button" disabled={busy || page >= totalPages} onClick={() => load({ page: page + 1 })} type="button">下一页</button></div></div>
      {selected ? (
        <div className="modal-backdrop" onClick={() => setSelected(null)} role="presentation">
          <section className="prompt-modal order-admin-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="用户详情">
            <div className="modal-head"><div><p className="eyebrow">User detail</p><h2>{detail?.user?.username || selected.username}</h2></div><button className="icon-button" onClick={() => setSelected(null)} type="button"><X size={18} /></button></div>
            <p className="storage-note">{detail?.user?.email || selected.email} · {detail?.user?.coinBalance ?? selected.coinBalance} 币 / {detail?.user?.beanBalance ?? selected.beanBalance} 豆豆 · 关联访客 {detail?.user?.visitorCount ?? selected.visitorCount}</p>
            <div className="task-actions"><button className={detail?.user?.status === "disabled" ? "secondary-button" : "danger-button"} onClick={() => updateStatus(detail?.user?.status === "disabled" ? "active" : "disabled")} type="button">{detail?.user?.status === "disabled" ? "恢复用户" : "禁用用户"}</button></div>
            <div className="draw-card-order-form"><label className="field-label">币种<select onChange={(event) => setCurrency(event.target.value)} value={currency}><option value="coin">币</option><option value="bean">豆豆</option></select></label><label className="field-label">调整余额（正数增加、负数扣减）<input onChange={(event) => setDelta(event.target.value)} type="number" value={delta} /></label><label className="field-label">调整备注<textarea onChange={(event) => setRemark(event.target.value)} rows="2" value={remark} /></label><button className="secondary-button" disabled={!Number(delta) || !remark.trim()} onClick={adjustWallet} type="button">保存余额调整</button></div>
            <h3>币流水</h3><div className="task-list">{(detail?.ledger || []).slice(0, 20).map((item) => <div className="task-meta-row" key={item.id}><strong>{item.delta > 0 ? "+" : ""}{item.delta} 币</strong><span>{item.reason}{item.note ? `：${item.note}` : ""}</span><span>{formatDateTime(item.createdAt)}</span></div>)}</div>
            <h3>豆豆流水</h3><div className="task-list">{(detail?.beanLedger || []).slice(0, 20).map((item) => <div className="task-meta-row" key={item.id}><strong>{item.delta > 0 ? "+" : ""}{item.delta} 豆豆</strong><span>{item.reason}{item.note ? `：${item.note}` : ""}</span><span>{formatDateTime(item.createdAt)}</span></div>)}</div>
            <h3>订单摘要</h3><div className="task-list">{(detail?.orders || []).slice(0, 20).map((order) => <div className="task-meta-row" key={order.id}><strong>{order.orderNo}</strong><span>{order.paymentStatus === "paid" ? "已支付" : "未支付"}</span><span>{formatCurrencyCents(order.totalCents)}</span></div>)}</div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function UserClipAdminPage({ onBack, userId }) {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  async function load() {
    if (!userId) {
      setError("用户地址无效。");
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const payload = await fetchAdminUserClipItems(userId);
      setUser(payload.user || null);
      setItems(payload.items || []);
      setError("");
    } catch (nextError) {
      setError(nextError.message || "读取用户卡夹失败。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); }, [userId]);

  return (
    <section className="task-page user-clip-admin-page" aria-label="用户卡夹">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">User clip</p>
          <h2>{user?.username ? `${user.username} 的卡夹` : "用户卡夹"}</h2>
          <p className="storage-note">{user?.email || "查看该用户已收藏的生成图片，可下载原始生成文件。"}</p>
        </div>
        <div className="task-actions user-clip-admin-actions">
          <button className="secondary-button" onClick={onBack} type="button"><ArrowLeft size={18} /><span>返回用户列表</span></button>
          <button className="secondary-button" disabled={isLoading} onClick={() => void load()} type="button"><RefreshCw size={18} /><span>刷新</span></button>
        </div>
      </div>
      {error ? <p className="error-note">{error}</p> : null}
      {isLoading ? <p className="storage-note">正在读取用户卡夹...</p> : null}
      {!isLoading && !error && !items.length ? <p className="empty-note">该用户的卡夹中暂无图片。</p> : null}
      {items.length ? (
        <div className="user-clip-admin-grid">
          {items.map((item) => (
            <article className="user-clip-admin-card" key={item.jobId}>
              <img alt={item.styleName || "用户卡夹图片"} className="user-clip-admin-image" src={item.imageUrl || item.thumbnailUrl} />
              <div className="user-clip-admin-copy">
                <strong>{item.styleName || "未命名风格"}</strong>
                <span>{publicExperienceLabel(item.experienceType)} · 收藏于 {formatDateTime(item.likedAt || item.completedAt || item.createdAt)}</span>
              </div>
              <a className="secondary-button user-clip-admin-download" href={getAdminUserClipDownloadUrl(userId, item.jobId)}><Download size={16} /><span>下载原图</span></a>
            </article>
          ))}
        </div>
      ) : null}
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
  const [shippingCarrier, setShippingCarrier] = useState("");
  const [shippingTrackingNo, setShippingTrackingNo] = useState("");
  const [commercePayments, setCommercePayments] = useState([]);
  const [creditLedger, setCreditLedger] = useState([]);
  const [fridgeMagnetOrderingEnabled, setFridgeMagnetOrderingEnabled] = useState(settings?.fridgeMagnetOrderingEnabled === true);
  const [fridgeMagnetUnitPriceCents, setFridgeMagnetUnitPriceCents] = useState(settings?.fridgeMagnetUnitPriceCents || 2000);
  const [singleItemShippingFeeCents, setSingleItemShippingFeeCents] = useState(settings?.singleItemShippingFeeCents || 800);
  const [bodyBookOrderingEnabled, setBodyBookOrderingEnabled] = useState(settings?.bodyBookOrderingEnabled === true);
  const [bodyBookPriceCents, setBodyBookPriceCents] = useState(settings?.bodyBookPriceCents || 0);
  const [bodyBookShippingFeeCents, setBodyBookShippingFeeCents] = useState(settings?.bodyBookShippingFeeCents || 0);
  const [paymentMode, setPaymentMode] = useState(settings?.paymentMode || "wechat");
  const [manualPaymentExpireDays, setManualPaymentExpireDays] = useState(settings?.manualPaymentExpireDays || 7);
  const [contactWechatId, setContactWechatId] = useState(settings?.contactWechatId || DEFAULT_CONTACT_WECHAT_ID);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [downloadStatus, setDownloadStatus] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [isOrderSettingsExpanded, setIsOrderSettingsExpanded] = useState(false);

  useEffect(() => {
    setOrders(initialOrders || []);
  }, [initialOrders]);

  useEffect(() => {
    let active = true;
    Promise.all([fetchAdminCommercePayments(), fetchAdminCreditLedger()])
      .then(([paymentPayload, creditPayload]) => {
        if (!active) return;
        setCommercePayments(paymentPayload.payments || []);
        setCreditLedger(creditPayload.ledger || []);
      })
      .catch(() => {
        if (!active) return;
        setCommercePayments([]);
        setCreditLedger([]);
      });
    return () => { active = false; };
  }, []);

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
    setFridgeMagnetUnitPriceCents(settings?.fridgeMagnetUnitPriceCents || 2000);
    setSingleItemShippingFeeCents(settings?.singleItemShippingFeeCents || 800);
    setBodyBookOrderingEnabled(settings?.bodyBookOrderingEnabled === true);
    setBodyBookPriceCents(settings?.bodyBookPriceCents || 0);
    setBodyBookShippingFeeCents(settings?.bodyBookShippingFeeCents || 0);
    setPaymentMode(settings?.paymentMode || "wechat");
    setManualPaymentExpireDays(settings?.manualPaymentExpireDays || 7);
    setContactWechatId(settings?.contactWechatId || DEFAULT_CONTACT_WECHAT_ID);
  }, [settings]);
  const totalPages = Math.max(1, Math.ceil(orderTotal / Math.max(orderQuery.limit, 1)));

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
      setShippingCarrier(order.shippingCarrier || "");
      setShippingTrackingNo(order.shippingTrackingNo || "");
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
        fridgeMagnetOrderingEnabled,
        fridgeMagnetUnitPriceCents,
        singleItemShippingFeeCents,
        bodyBookOrderingEnabled,
        bodyBookPriceCents,
        bodyBookShippingFeeCents,
        paymentMode,
        manualPaymentExpireDays,
        contactWechatId
      });
      await onRefreshSettings();
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
      setShippingCarrier(updated.shippingCarrier || "");
      setShippingTrackingNo(updated.shippingTrackingNo || "");
      await refreshList({}, { showLoading: false });
      setStatusMessage("订单已更新。");
    } catch (nextError) {
      setError(nextError.message || "更新订单失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmManualPayment() {
    if (!selectedOrder?.id || selectedOrder.paymentStatus === "paid") return;
    const confirmationNote = selectedOrder.experienceType === "body-book" ? "确认后将触发符合条件的邀新豆豆奖励并转为待发货。" : "确认后将赠送币、解锁原图并转为待发货。";
    if (!window.confirm(`确认订单 ${selectedOrder.orderNo} 已收到 ${formatCurrencyCents(Number(selectedOrder.payableCents ?? selectedOrder.totalCents ?? 0))} 吗？${confirmationNote}`)) return;
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const updated = await confirmAdminManualPayment(selectedOrder.id);
      setSelectedOrder(updated);
      await refreshList({}, { showLoading: false });
      setStatusMessage("已确认收款，订单已转为待发货。");
    } catch (nextError) {
      setError(nextError.message || "确认收款失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function confirmManualBeanPurchase(payment) {
    if (!payment?.id || payment.status === "paid") return;
    const beanCount = Number(payment.metadata?.beanCount || payment.creditAmount || 0);
    if (!window.confirm(`确认已收到 ${formatCurrencyCents(payment.amountCents)}，并为用户发放 ${beanCount} 豆吗？`)) return;
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      await confirmAdminManualBeanPurchase(payment.id);
      const payload = await fetchAdminCommercePayments();
      setCommercePayments(payload.payments || []);
      setStatusMessage("已确认购买收款，豆豆已发放。");
    } catch (nextError) {
      setError(nextError.message || "确认豆豆购买收款失败。");
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

      <div className="draw-observability-card">
          <h3>最近实体订单、豆豆购买与币流水</h3>
          <div className="task-list">
          {commercePayments.filter((payment) => ["physical_order", "body_book_order"].includes(payment.kind)).slice(0, 8).map((payment) => (
            <div className="task-meta-row" key={payment.id}>
              <strong>{payment.kind === "body_book_order" ? "认知书实体书" : "冰箱贴订单"}</strong>
              <span>{formatCurrencyCents(payment.amountCents)}</span>
              <span>{payment.status === "paid" ? "已支付" : "待支付"}</span>
            </div>
          ))}
          {!commercePayments.length ? <p className="storage-note">暂无收款记录。</p> : null}
        </div>
        <div className="task-list">
          {commercePayments.filter((payment) => payment.kind === "bean_purchase").slice(0, 8).map((payment) => (
            <div className="task-meta-row" key={payment.id}>
              <strong>购买 {Number(payment.metadata?.beanCount || payment.creditAmount || 0)} 豆</strong>
              <span>{formatCurrencyCents(payment.amountCents)}</span>
              <span>{payment.status === "paid" ? "已支付" : "待确认"}</span>
              {payment.status !== "paid" && payment.channel === "manual_collection" ? <button className="secondary-button" disabled={isBusy} onClick={() => confirmManualBeanPurchase(payment)} type="button">确认收款</button> : null}
            </div>
          ))}
        </div>
        {creditLedger.length ? <p className="storage-note">最近币变动：{creditLedger.slice(0, 5).map((item) => `${item.delta > 0 ? "+" : ""}${item.delta}`).join("、")}</p> : null}
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
              支付方式
              <select onChange={(event) => setPaymentMode(event.target.value)} value={paymentMode}>
                <option value="manual">人工收款码</option>
                <option value="wechat">微信支付（微信内 JSAPI，其他环境 Native 扫码）</option>
              </select>
            </label>
            <p className="storage-note">微信支付会自动锁定订单金额并由回调更新订单状态；人工收款码仍需用户手动输入金额并由管理员确认。金额规则固定为：1 枚收邮费，2 枚及以上包邮。</p>
            <label className="toggle-field">
              <input checked={bodyBookOrderingEnabled} onChange={(event) => setBodyBookOrderingEnabled(event.target.checked)} type="checkbox" />
              <span>开启认知书实体书下单</span>
            </label>
            <label className="field-label">
              实体书固定售价（分）
              <input min="0" onChange={(event) => setBodyBookPriceCents(Number(event.target.value) || 0)} type="number" value={bodyBookPriceCents} />
            </label>
            <label className="field-label">
              实体书固定邮费（分）
              <input min="0" onChange={(event) => setBodyBookShippingFeeCents(Number(event.target.value) || 0)} type="number" value={bodyBookShippingFeeCents} />
            </label>
            <p className="storage-note">认知书实体书按固定售价与固定邮费结算；售价大于 0 后才可对用户开放。</p>
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
                <span>{order.experienceType === "body-book" ? "认知书实体书" : `共 ${order.itemCount} 只`}</span>
                <span>{formatCurrencyCents(Number(order.payableCents ?? order.totalCents ?? 0))}</span>
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
              <span>商品小计 {formatCurrencyCents(selectedOrder.subtotalCents)} · 邮费 {selectedOrder.shippingFeeCents > 0 ? formatCurrencyCents(selectedOrder.shippingFeeCents) : "包邮"} · 豆豆优惠 -{formatCurrencyCents(selectedOrder.beanDiscountCents || 0)} · 实付 {formatCurrencyCents(Number(selectedOrder.payableCents ?? selectedOrder.totalCents ?? 0))}</span>
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
            <div className="form-grid">
              <label className="field-label">
                快递公司
                <input onChange={(event) => setShippingCarrier(event.target.value)} placeholder="例如：顺丰速运" value={shippingCarrier} />
              </label>
              <label className="field-label">
                运单号
                <input onChange={(event) => setShippingTrackingNo(event.target.value)} placeholder="填写快递单号" value={shippingTrackingNo} />
              </label>
            </div>
            {downloadStatus ? <p className="success-note">{downloadStatus}</p> : null}
            <div className="task-filters">
              <button className="secondary-button" disabled={isBusy} onClick={downloadOrderOriginals} type="button">
                <Download size={18} />
                <span>下载原图</span>
              </button>
              {selectedOrder.paymentStatus !== "paid" ? (
                <button className="draw-card-primary" disabled={isBusy} onClick={confirmManualPayment} type="button">
                  <span>确认已收款</span>
                </button>
              ) : null}
              <button className="secondary-button" onClick={() => updateOrderStatus({ adminRemark, shippingCarrier, shippingTrackingNo, orderStatus: "shipped" })} type="button">
                <span>标记已发货</span>
              </button>
              <button className="secondary-button" onClick={() => updateOrderStatus({ adminRemark, shippingCarrier, shippingTrackingNo, orderStatus: "completed" })} type="button">
                <span>标记已完成</span>
              </button>
              <button className="danger-button" onClick={() => updateOrderStatus({ adminRemark, shippingCarrier, shippingTrackingNo, orderStatus: "cancelled" })} type="button">
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

async function fetchBodyBookSession(sessionId) {
  const response = await fetch(`/api/body-book/sessions/${encodeURIComponent(sessionId)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取认知书状态失败，请稍后再试。");
  return payload;
}

async function fetchLatestBodyBookSession() {
  const response = await fetch("/api/body-book/sessions/latest");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "恢复认知书进度失败，请稍后再试。");
  return payload;
}

async function fetchSavedBodyBooks() {
  const response = await fetch("/api/body-book/books");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取我的认知书失败，请稍后再试。");
  return payload;
}

async function fetchBodyBookThemes() {
  const response = await fetch("/api/body-book/themes");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取认知书主题失败，请稍后再试。");
  return payload;
}

async function createBodyBookSession(formData) {
  const response = await fetch("/api/body-book/sessions", { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "创建认知书失败，请稍后再试。");
  return payload;
}

async function confirmBodyBookCover(sessionId) {
  const response = await fetch(`/api/body-book/sessions/${encodeURIComponent(sessionId)}/confirm-cover`, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "启动认知卡生成失败，请稍后再试。");
  return payload;
}

async function saveBodyBook(sessionId) {
  const response = await fetch(`/api/body-book/sessions/${encodeURIComponent(sessionId)}/save`, { method: "POST" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "保存认知书失败，请稍后再试。");
  return payload;
}

async function deleteBodyBook(sessionId) {
  const response = await fetch(`/api/body-book/books/${encodeURIComponent(sessionId)}`, { method: "DELETE" });
  if (response.status === 204) return;
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message || "删除认知书失败，请稍后再试。");
}

async function regenerateBodyBookCard(sessionId, partKey, formData) {
  const response = await fetch(`/api/body-book/sessions/${encodeURIComponent(sessionId)}/cards/${encodeURIComponent(partKey)}/regenerate`, { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "重新生成认知卡失败，请稍后再试。");
  return payload;
}

async function fetchBodyBookProjects(themeId = "") {
  const query = themeId ? `?themeId=${encodeURIComponent(themeId)}` : "";
  const response = await fetch(`/api/body-book/projects${query}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取我的认知书失败，请稍后再试。");
  return payload;
}

async function fetchBodyBookProject(projectId) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取认知书工程失败，请稍后再试。");
  return payload;
}

async function createBodyBookProject(formData) {
  const response = await fetch("/api/body-book/projects", { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "创建认知书工程失败，请稍后再试。");
  return payload;
}

async function updateBodyBookProjectPages(projectId, contentKeys) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}/pages`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentKeys })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "更新认知书内容失败，请稍后再试。");
  return payload;
}

async function replaceBodyBookProjectReference(projectId, formData) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}/reference`, { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "替换参考图失败，请稍后再试。");
  return payload;
}

async function replaceBodyBookProjectPageReference(projectId, pageKey, formData) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageKey)}/reference`, { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "替换页面参考图失败，请稍后再试。");
  return payload;
}

async function generateBodyBookProjectPages(projectId, pageKeys, pagePrompts = {}) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageKeys, pagePrompts })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "提交图片生成失败，请稍后再试。");
  return payload;
}

async function deleteBodyBookProject(projectId) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
  if (response.status === 204) return;
  const payload = await response.json().catch(() => ({}));
  throw new Error(payload.message || "删除认知书工程失败，请稍后再试。");
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

function getBeanPurchaseListStatus(purchase) {
  if (purchase?.status === "paid") return "paid";
  if (purchase?.status === "cancelled" || (purchase?.expiresAt && Date.parse(purchase.expiresAt) <= Date.now())) return "expired";
  return "pending_payment";
}

function getBeanPurchaseListTone(status) {
  if (status === "paid") return "succeeded";
  if (status === "expired") return "cancelled";
  return "queued";
}

function getBeanPurchaseListStatusLabel(purchase, status) {
  if (status === "paid") return "已支付";
  if (status === "expired") return "已过期";
  return purchase?.channel === "manual_collection" ? "待确认收款" : "待付款";
}

function getAdminOrderPrimaryStatusLabel(order) {
  return getOrderPrimaryStatusLabel(order);
}

function getOrderPrimaryStatusLabel(order) {
  if (String(order?.orderStatus || "") === "pending_payment" && isManualPaymentOrder(order)) return "待确认收款";
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
  if (experienceType === "body-book") return "宝宝身体认知书";
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
    route: String(provider?.route || DEFAULT_API_PROVIDER_FORM.route),
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

function trimDebugText(value, maxLength = 72) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, Math.max(0, maxLength - 1))}…` : text;
}

function formatProviderDebugLabel(provider) {
  if (!provider) return "";
  const name = String(provider.name || provider.id || "").trim();
  const model = String(provider.model || "").trim();
  if (name && model) return `${name} · ${model}`;
  return name || model;
}

function formatImageJobAttemptSummary(attempt, index) {
  const providerLabel = formatProviderDebugLabel(attempt?.provider) || `provider-${index + 1}`;
  const status = String(attempt?.status || "").trim().toLowerCase();
  const statusLabel = status === "succeeded" ? "成功" : status === "aborted" ? "已停止" : "失败";
  const durationSeconds = Number(attempt?.durationMs || 0) > 0 ? `${Math.max(1, Math.round(Number(attempt.durationMs || 0) / 1000))}s` : "";
  const suffix = trimDebugText(attempt?.message || "", 56);
  return `${index + 1}. ${providerLabel} ${statusLabel}${durationSeconds ? ` ${durationSeconds}` : ""}${suffix ? `：${suffix}` : ""}`;
}

function formatImageJobProviderDiagnostics(job) {
  const telemetry = job?.telemetry || {};
  const parts = [];
  const requestedLabel = formatProviderDebugLabel(telemetry.requestedProvider) || String(telemetry.requestedProviderIdRaw || "").trim();
  if (requestedLabel) {
    parts.push(`请求：${requestedLabel}`);
  }

  if (Array.isArray(telemetry.providerChain) && telemetry.providerChain.length > 1) {
    const chainLabel = telemetry.providerChain
      .map((provider) => String(provider?.id || provider?.name || "").trim())
      .filter(Boolean)
      .join(" -> ");
    if (chainLabel) parts.push(`链路：${chainLabel}`);
  }

  if (Array.isArray(telemetry.attempts) && telemetry.attempts.length) {
    parts.push(`尝试：${telemetry.attempts.map((attempt, index) => formatImageJobAttemptSummary(attempt, index)).join(" | ")}`);
  } else if (telemetry.finalProvider) {
    const finalLabel = formatProviderDebugLabel(telemetry.finalProvider);
    if (finalLabel) parts.push(`最终：${finalLabel}`);
  }

  if (telemetry.finalError) {
    parts.push(`错误：${trimDebugText(telemetry.finalError, 72)}`);
  }

  return parts.join("；");
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

function buildOrderDetailUrl(orderId, token = "", experienceType = "") {
  const base = experienceType === "body-book" ? `/book/orders/${orderId}` : `/fridge/orders/${orderId}`;
  return token ? `${base}?token=${encodeURIComponent(token)}` : base;
}

function isManualPaymentOrder(order, config) {
  return ["manual", "manual_collection"].includes(String(order?.lastPaymentChannel || "")) || String(config?.paymentMode || "") === "manual";
}

function fillOrderAddressFromSaved(currentForm, account) {
  const saved = readSavedOrderAddress(account);
  if (!saved) return currentForm;
  const current = currentForm || DEFAULT_ORDER_ADDRESS;
  const currentAddress = String(current.address || current.addressDetail || "").trim();
  return {
    ...current,
    receiverName: String(current.receiverName || "").trim() || saved.receiverName,
    receiverPhone: String(current.receiverPhone || "").trim() || saved.receiverPhone,
    address: currentAddress || saved.address,
    addressDetail: String(current.addressDetail || "").trim() || currentAddress || saved.address,
    remark: String(current.remark || "").trim() || saved.remark
  };
}

function readSavedOrderAddress(account) {
  const accountId = String(account?.id || "").trim();
  if (!accountId) return null;
  try {
    const raw = window.localStorage.getItem(`${ORDER_ADDRESS_STORAGE_PREFIX}${accountId}`);
    const value = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== "object") return null;
    const saved = {
      receiverName: String(value.receiverName || "").trim(),
      receiverPhone: String(value.receiverPhone || "").trim(),
      address: String(value.address || value.addressDetail || "").trim(),
      remark: String(value.remark || "").trim()
    };
    return saved.receiverName || saved.receiverPhone || saved.address || saved.remark ? saved : null;
  } catch {
    return null;
  }
}

function saveOrderAddress(account, orderForm) {
  const accountId = String(account?.id || "").trim();
  if (!accountId || !orderForm) return;
  const address = {
    receiverName: String(orderForm.receiverName || "").trim(),
    receiverPhone: String(orderForm.receiverPhone || "").trim(),
    address: String(orderForm.address || orderForm.addressDetail || "").trim(),
    remark: String(orderForm.remark || "").trim()
  };
  if (!address.receiverName && !address.receiverPhone && !address.address && !address.remark) return;
  try {
    window.localStorage.setItem(`${ORDER_ADDRESS_STORAGE_PREFIX}${accountId}`, JSON.stringify(address));
  } catch {
    // The checkout still works if browser storage is unavailable.
  }
}

function getAdminUserClipId() {
  const match = window.location.pathname.match(/^\/admin\/users\/([^/]+)\/clip\/?$/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return "";
  }
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

function clampInviteQuotaBonus(value) {
  const quotaBonus = Number(value);
  if (!Number.isFinite(quotaBonus)) return 0;
  return Math.min(999, Math.max(0, Math.round(quotaBonus)));
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

createRoot(document.getElementById("root")).render(<AppErrorBoundary><App /></AppErrorBoundary>);
