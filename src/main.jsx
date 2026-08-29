import React, { useEffect, useMemo, useRef, useState } from "react";
import { useCallback } from "react";
import { Activity, AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, CheckCircle2, Clipboard, Cpu, Download, Eye, GripVertical, HardDrive, Home, ImageUp, Layers3, ListTodo, LoaderCircle, MemoryStick, Pencil, Plus, QrCode, RefreshCw, Save, Search, Server, Settings, Share2, Sparkles, Store, Trash2, Wifi, X, XCircle } from "lucide-react";
import { createRoot } from "react-dom/client";
import HTMLFlipBook from "react-pageflip";
import { createLabeledQrPngDataUrl, createQrSvgDataUrl, downloadQrPng, downloadQrSvg } from "./qr-code";
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
const MAX_ORDER_ITEM_QUANTITY = 99;
const MAX_BEAN_PURCHASE_COUNT = 1000;
const ORDER_STATUS_LABELS = {
  pending_payment: "待付款",
  pending_shipment: "待发货",
  shipped: "已发货",
  completed: "已完成",
  cancelled: "已取消",
  expired: "已过期",
  refunded: "已退款"
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
  likedOnly: false,
  owner: ""
};
const DEFAULT_ADMIN_ORDER_QUERY = {
  page: 1,
  limit: 20,
  orderType: "",
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
const SHIPPING_CARRIER_OPTIONS = [
  { value: "shunfeng", label: "顺丰速运" },
  { value: "zhongtong", label: "中通快递" },
  { value: "yuantong", label: "圆通速递" },
  { value: "shentong", label: "申通快递" },
  { value: "yunda", label: "韵达快递" },
  { value: "jtexpress", label: "极兔速递" },
  { value: "jingdong", label: "京东快递" },
  { value: "debangwuliu", label: "德邦快递" },
  { value: "baishiwuliu", label: "百世快递" },
  { value: "ems", label: "EMS" },
  { value: "youzhengguonei", label: "中国邮政速递物流" },
  { value: "zhaijisong", label: "宅急送" },
  { value: "dhl", label: "DHL" },
  { value: "fedex", label: "FedEx" },
  { value: "ups", label: "UPS" },
  { value: "tnt", label: "TNT" }
];

function getSizeLabel(size) {
  return GENERATION_SIZE_OPTIONS.find((option) => option.value === size)?.label || size || DEFAULT_GENERATION_SIZE;
}
const GALLERY_INITIAL_BATCH = 18;
const GALLERY_BATCH_STEP = 12;
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
const BODY_BOOK_CART_STORAGE_PREFIX = "petpaint-body-book-cart:";
const MAX_BODY_BOOK_CART_QUANTITY = 20;
const BODY_BOOK_THEME_BASE_FALLBACKS = [
  { id: "body", name: "身体认知书", englishName: "My First Body Book", title: "我的第一本身体认知书", themeCategory: "realistic" },
  { id: "career", name: "职业认知书", englishName: "My First Jobs", title: "我的第一本职业认知书", themeCategory: "realistic" },
  { id: "color", name: "颜色认知书", englishName: "My First Colors", title: "我的第一本颜色认知书", themeCategory: "realistic" },
  { id: "emotion", name: "情绪认知书", englishName: "My First Feelings", title: "我的第一本情绪认知书", themeCategory: "realistic" },
  { id: "transport", name: "交通工具认知书", englishName: "My First Vehicles", title: "我的第一本交通工具认知书", themeCategory: "realistic" },
  { id: "animal", name: "动物认知书", englishName: "My First Animals", title: "我的第一本动物认知书", themeCategory: "realistic" },
  { id: "daily", name: "日常行为认知书", englishName: "My First Daily Routines", title: "我的第一本日常行为认知书", themeCategory: "realistic" },
  { id: "kindergarten", name: "入园适应绘本", englishName: "My First Day at Kindergarten", title: "我的入园第一天", themeCategory: "picturebook" }
];
const BODY_BOOK_THEME_FALLBACKS = [
  ...BODY_BOOK_THEME_BASE_FALLBACKS,
  ...BODY_BOOK_THEME_BASE_FALLBACKS.filter((theme) => theme.id !== "kindergarten").map((theme) => ({
    ...theme,
    id: `${theme.id}-cartoon`,
    baseThemeId: theme.id,
    visualVariant: "animated-3d-cartoon",
    themeCategory: "cartoon",
    name: `${theme.name}（动画卡通版）`,
    englishName: `${theme.englishName} · Cartoon Edition`,
    title: `${theme.title}（动画卡通版）`
  }))
];
const BODY_BOOK_THEME_EFFECT_SAMPLES = {
  color: [
    { label: "封面效果", src: "/body-book-samples/effects/color-cover.webp", type: "cover" },
    { label: "宝宝内页效果", src: "/body-book-samples/effects/color-page-01.webp", type: "baby" },
    { label: "内置认知页", src: "/body-book-samples/effects/color-red-objects.webp", type: "preset" }
  ],
  body: [
    { label: "封面效果", src: "/body-book-samples/effects/body-cover.webp", type: "cover" },
    { label: "宝宝内页效果", src: "/body-book-samples/effects/body-page-01.webp", type: "baby" },
    { label: "内置身体部位页", src: "/body-book-samples/effects/body-head.webp", type: "preset" }
  ],
  transport: [
    { label: "封面效果", src: "/body-book-samples/effects/transport-cover.webp", type: "cover" },
    { label: "宝宝内页效果", src: "/body-book-samples/effects/transport-page-01.webp", type: "baby" },
    { label: "内置交通工具页", src: "/body-book-samples/effects/transport-car.webp", type: "preset" }
  ],
  animal: [
    { label: "封面效果", src: "/body-book-samples/effects/animal-cover.webp", type: "cover" },
    { label: "宝宝内页效果", src: "/body-book-samples/effects/animal-page-01.webp", type: "baby" },
    { label: "内置动物页", src: "/body-book-samples/effects/animal-cat.webp", type: "preset" }
  ],
  career: [
    { label: "封面效果", src: "/body-book-samples/effects/career-cover.webp", type: "cover" },
    { label: "宝宝内页效果", src: "/body-book-samples/effects/career-page-01.webp", type: "baby" }
  ],
  emotion: [
    { label: "封面效果", src: "/body-book-samples/effects/emotion-cover.webp", type: "cover" },
    { label: "宝宝内页效果", src: "/body-book-samples/effects/emotion-page-01.webp", type: "baby" }
  ],
  daily: [
    { label: "封面效果", src: "/body-book-samples/effects/daily-cover.webp", type: "cover" },
    { label: "宝宝内页效果", src: "/body-book-samples/effects/daily-page-01.webp", type: "baby" }
  ],
  kindergarten: [
    { label: "手账绘本封面", src: "/body-book-samples/effects/kindergarten-cover-thumbnail.webp", type: "cover" },
    { label: "入园故事内页", src: "/body-book-samples/effects/kindergarten-page-01-thumbnail.webp", type: "baby" }
  ]
};
const BODY_BOOK_CARTOON_EFFECT_SAMPLES = Object.fromEntries([
  ["body", "身体认知书"], ["career", "职业认知书"], ["color", "颜色认知书"], ["emotion", "情绪认知书"],
  ["transport", "交通工具认知书"], ["animal", "动物认知书"], ["daily", "日常行为认知书"]
].map(([id, name]) => {
  const preset = (BODY_BOOK_THEME_EFFECT_SAMPLES[id] || []).find((page) => page.type === "preset");
  return [id, [
    { label: `${name}卡通封面`, src: `/body-book-samples/cartoon-effects/${id}-cover.webp`, type: "cover" },
    { label: `${name}卡通内页`, src: `/body-book-samples/cartoon-effects/${id}-page.webp`, type: "baby" },
    ...(preset ? [{ ...preset, label: `内置${preset.label}` }] : [])
  ]];
}));
const LATEST_MANUAL_ORDER_STORAGE_KEY = "pg.fridge.latest-manual-order";
const DRAW_CARD_EXPERIENCE_CONFIG = {
  route: "public-draw",
  experienceType: "draw-card",
  apiBase: "/api/draw-card",
  sessionStorageKey: DRAW_CARD_SESSION_STORAGE_KEY,
  themeClass: "theme-draw-card",
  titleKicker: "",
  title: "AI小画家",
  subtitle: "让有意义的照片更精美",
  waitingLines: ["总计需要约 5 分钟，请耐心等待。", "无需保持当前页面开启，可切到后台，稍后回来查看结果。", "正在制作 AI 小画，你可以稍后回来查看。"],
  waitingFallback: "生成已提交，无需保持当前页面开启，可切到后台，稍后回来查看结果。",
  startButtonIdle: "试试手气",
  startButtonLoading: "任务启动中",
  resultsKicker: "Collection",
  resultsTitle: "本轮已全部完成",
  resultsSubtitle: "右侧卡夹会收纳你选中的结果。点击结果可放大查看，加入时会直接飞入卡夹。",
  clipKicker: "Card clip",
  clipTitle: "卡夹",
  clipEmptyText: "挑中想保留的结果后，它会被收进这里，并在你下次回来时继续保留。",
  clipInvitePlaceholder: "输入兑换码",
  clipContactFallback: "如需更多生图机会，请联系客服领取兑换码。",
  errorTitle: "这一轮没有顺利完成。",
  restoreErrorMessage: "恢复上次抽卡进度失败，请稍后再试。",
  readErrorMessage: "读取抽卡状态失败，请稍后再试。",
  latestErrorMessage: "恢复抽卡进度失败，请稍后再试。",
  createErrorMessage: "抽卡暂时不可用，请稍后再试。",
  clipErrorMessage: "读取卡夹失败，请稍后再试。",
  addClipErrorMessage: "加入卡夹失败，请稍后再试。",
  removeClipErrorMessage: "移出卡夹失败，请稍后再试。",
  inviteErrorMessage: "兑换码兑换失败，请稍后再试。",
  originalAlt: "抽卡原图",
  resultAltPrefix: "抽卡结果",
  previewAlt: "待抽卡图片预览",
  waitingAlt: "正在抽卡的原图",
  lightboxResultAlt: "抽卡结果大图",
  lightboxOriginalAlt: "抽卡原图大图",
  resultNameFallback: "结果",
  clipItemFallback: "卡片",
  pendingRemovalBody: "这张图片不属于本次生成结果，移出卡夹后将无法在当前小画页再次加入。确认移出吗？"
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
  waitingLines: ["预计共需要2~3分钟", "美图值得等待", "无需保持当前页面开启，可切到后台，稍后回来查看结果。"],
  waitingFallback: "生成已提交，无需保持当前页面开启，可切到后台，稍后回来查看结果。",
  startButtonIdle: "开始制作",
  startButtonLoading: "制作开启中",
  resultsKicker: "Magnet board",
  resultsTitle: "这一轮冰箱贴已经全部做好了。",
  resultsSubtitle: "结果会直接贴在白色展示面上，配合轻阴影模拟透明感；右侧口袋只保留冰箱贴结果。",
  clipKicker: "Pocket",
  clipTitle: "口袋",
  clipEmptyText: "挑中想保留的冰箱贴后，它会被收进口袋，并在你下次回来时继续保留。",
  clipInvitePlaceholder: "输入兑换码",
  clipContactFallback: "如需更多制作次数，请联系客服领取兑换码。",
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
  inviteErrorMessage: "兑换码兑换失败，请稍后再试。",
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
  if (pathname.startsWith("/draw/share/")) return "public-draw-share";
  if (pathname === "/fridge/orders") return "public-fridge-orders";
  if (pathname.startsWith("/fridge/orders/")) return "public-fridge-order";
  if (pathname === "/fridge/magnet") return "public-draw";
  if (pathname === "/book/orders") return "public-body-book-orders";
  if (pathname.startsWith("/book/orders/")) return "public-body-book-order";
  if (pathname === "/book/cart") return "public-body-book-cart";
  if (pathname === "/book/works") return "public-body-book-works";
  if (pathname.startsWith("/book/share/")) return "public-body-book-share";
  if (pathname === "/book/referrals") return "public-referrals";
  if (pathname === "/fridge") return "public-draw";
  if (pathname === "/book") return "public-body-book";
  if (pathname === "/gallery") return "admin-gallery";
  if (pathname === "/admin" || pathname === "/admin/") return "admin-gallery";
  if (pathname === "/admin/login") return "admin-login";
  if (pathname === "/admin/orders") return "admin-orders";
  if (/^\/admin\/users\/[^/]+\/clip\/?$/.test(pathname)) return "admin-user-clip";
  if (pathname === "/admin/users") return "admin-users";
  if (pathname === "/admin/visits") return "admin-visits";
  if (pathname === "/admin/merchants") return "admin-referrals";
  if (pathname === "/admin/store-owners") return "admin-store-owners";
  if (pathname === "/admin/referrals") return "admin-referrals";
  if (pathname === "/admin/styles") return "admin-gallery";
  if (pathname === "/admin/style-publications") return "admin-style-publications";
  if (pathname === "/admin/tasks") return "admin-tasks";
  if (pathname === "/admin/batch") return "admin-batch";
  if (pathname === "/admin/invites") return "admin-invites";
  if (pathname === "/admin/api-providers") return "admin-api-providers";
  if (pathname === "/admin/storage") return "admin-storage";
  if (pathname === "/admin/monitor") return "admin-monitor";
  return "public-draw";
}

const MODAL_HISTORY_DEPTH_KEY = "__petpaintModalHistoryDepth";

function getOpenModalBackdrops() {
  return Array.from(document.querySelectorAll(".modal-backdrop"));
}

/**
 * Keeps every DOM modal on its own browser-history entry.  We deliberately
 * close a modal by clicking its existing backdrop handler so a browser back
 * gesture has exactly the same effect as dismissing that modal in the UI.
 */
function ModalRouteHistory() {
  useEffect(() => {
    let openModals = getOpenModalBackdrops();
    let pageUrl = window.location.href;
    let closesRequestedByHistory = 0;
    let disposed = false;

    const getModalDepth = (state = window.history.state) => {
      const depth = Number(state?.[MODAL_HISTORY_DEPTH_KEY]);
      return Number.isFinite(depth) && depth > 0 ? Math.trunc(depth) : 0;
    };

    const pushModalHistory = (depth) => {
      window.history.pushState({
        ...(window.history.state || {}),
        [MODAL_HISTORY_DEPTH_KEY]: Math.max(0, depth)
      }, "", window.location.href);
    };

    const syncOpenModals = () => {
      if (disposed) return;
      const nextModals = getOpenModalBackdrops();
      const previousCount = openModals.length;
      const nextCount = nextModals.length;
      const urlChanged = pageUrl !== window.location.href;

      if (nextCount > previousCount) {
        for (let depth = previousCount + 1; depth <= nextCount; depth += 1) pushModalHistory(depth);
      } else if (nextCount < previousCount) {
        const closedCount = previousCount - nextCount;
        if (closesRequestedByHistory) {
          closesRequestedByHistory = Math.max(0, closesRequestedByHistory - closedCount);
        } else if (!urlChanged && getModalDepth() >= previousCount) {
          // A normal UI close consumes the entry that was created when the
          // modal opened. The following popstate sees no modal to dismiss.
          window.history.go(-closedCount);
        }
      }

      openModals = nextModals;
      pageUrl = window.location.href;
    };

    const observer = new MutationObserver(syncOpenModals);
    observer.observe(document.body, { childList: true, subtree: true });

    // Effects run after the first commit. Record a modal that happened to be
    // open on that initial commit as well.
    if (openModals.length) {
      for (let depth = 1; depth <= openModals.length; depth += 1) pushModalHistory(depth);
    }

    const dismissToHistoryDepth = (targetDepth) => {
      const beforeCount = getOpenModalBackdrops().length;
      if (beforeCount <= targetDepth) return;
      const topModal = getOpenModalBackdrops().at(-1);
      if (!topModal) return;

      closesRequestedByHistory += 1;
      topModal.dispatchEvent(new MouseEvent("click", { bubbles: true }));

      window.requestAnimationFrame(() => {
        if (disposed) return;
        const remainingCount = getOpenModalBackdrops().length;
        if (remainingCount < beforeCount) {
          if (remainingCount > targetDepth) dismissToHistoryDepth(targetDepth);
          return;
        }

        // Some dialogs intentionally cannot be dismissed while processing.
        // Restore the consumed entry, rather than letting that back gesture
        // navigate away from the still-visible modal.
        closesRequestedByHistory = Math.max(0, closesRequestedByHistory - 1);
        pushModalHistory(remainingCount);
        openModals = getOpenModalBackdrops();
        pageUrl = window.location.href;
      });
    };

    const onPopState = (event) => {
      pageUrl = window.location.href;
      const targetDepth = getModalDepth(event.state);
      if (openModals.length > targetDepth) dismissToHistoryDepth(targetDepth);
    };

    window.addEventListener("popstate", onPopState);
    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return null;
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
      "public-fridge-product": "照片冰箱贴 · 产品详情",
      "public-body-book": "宝宝的认知书",
      "public-draw-checkout": "选图定制",
      "public-draw-share": "好友分享的小画",
      "public-fridge-order": "冰箱贴订单",
      "public-body-book-order": "宝宝的认知书",
      "public-body-book-orders": "宝宝的认知书",
      "public-body-book-cart": "认知书购物车",
      "public-body-book-works": "我的作品",
      "public-body-book-share": "好友分享的认知书",
      "public-referrals": "我的邀请",
      "public-fridge-orders": "我的冰箱贴订单",
      "admin-api-providers": "API 配置",
      "admin-referrals": "推荐管理",
      "admin-store-owners": "商户管理",
      "admin-visits": "访问记录",
      "admin-user-clip": "图片资产"
    };
    document.title = titleByRoute[route] || "AI小画家";
  }, [route]);

  function navigate(nextRoute) {
    const pathByRoute = {
      "public-draw": "/",
      "public-fridge": "/fridge",
      "public-fridge-product": "/fridge/magnet",
      "public-body-book": "/book",
      "public-draw-checkout": "/draw/order",
      "public-fridge-orders": "/fridge/orders",
      "public-body-book-orders": "/book/orders",
      "public-body-book-cart": "/book/cart",
      "public-body-book-works": "/book/works",
      "public-referrals": "/book/referrals",
      "public-fridge-order": window.location.pathname,
      "public-body-book-order": window.location.pathname,
      "admin-gallery": "/gallery",
      "admin-style-publications": "/admin/style-publications",
      "admin-login": "/admin/login",
      "admin-orders": "/admin/orders",
      "admin-users": "/admin/users",
      "admin-visits": "/admin/visits",
      "admin-referrals": "/admin/referrals",
      "admin-store-owners": "/admin/store-owners",
      "admin-tasks": "/admin/tasks",
      "admin-batch": "/admin/batch",
      "admin-invites": "/admin/invites",
      "admin-api-providers": "/admin/api-providers",
      "admin-storage": "/admin/storage",
      "admin-monitor": "/admin/monitor"
    };
    const path = pathByRoute[nextRoute] || "/";
    window.history.pushState({}, "", path);
    setRoute(nextRoute);
  }

  if (route === "public-draw") {
    return <LuckDrawCardPage />;
  }
  if (route === "public-draw-share") {
    return <DrawSharePage />;
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
  if (route === "public-body-book-cart") {
    return <BodyBookCartPage />;
  }
  if (route === "public-body-book-works") {
    return <BodyBookWorksPage />;
  }
  if (route === "public-body-book-share") {
    return <BodyBookSharePage />;
  }
  if (route === "public-referrals") {
    return <ReferralPage />;
  }
  if (route === "public-fridge") {
    return <FridgeMagnetPage />;
  }
  if (route === "public-fridge-product") {
    return <FridgeMagnetProductPage />;
  }
  if (route === "public-body-book") {
    return <BodyBookPage />;
  }

  return <AdminApp navigate={navigate} route={route} />;
}

function ReferralPage() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const referralSource = new URLSearchParams(window.location.search).get("source") === "draw" ? "draw" : "book";
  const isDrawReferralView = referralSource === "draw";

  useEffect(() => {
    let active = true;
    fetch("/api/referrals/me")
      .then(async (response) => {
        const payload = await readAuthJsonResponse(response, { message: "读取邀请奖励失败。" });
        if (!response.ok) throw new Error(payload.message || "读取邀请奖励失败。");
        return payload;
      })
      .then((payload) => { if (active) setSummary(payload); })
      .catch((nextError) => { if (active) setError(nextError.message || "读取邀请奖励失败。"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // The standalone refrigerator-magnet page has been retired. Keep old
    // bookmarked links useful by taking visitors to the current 小画页.
    if (window.location.pathname === "/fridge" || window.location.pathname === "/fridge/magnet") {
      window.history.replaceState({}, "", "/");
      setRoute("public-draw");
    }
  }, []);

  async function copyValue(value, successMessage) {
    try {
      await copyText(value);
      setNotice(successMessage);
    } catch (nextError) {
      setError(nextError.message || "复制失败，请手动复制。");
    }
  }

  const detailLabel = (detail) => {
    if (detail.type === "registration_bean") return `好友注册奖励 +${detail.amount} 豆豆`;
    if (detail.type === "registration_coin") return `好友注册奖励 +${detail.amount} 币`;
    if (detail.type === "referral_withdrawal") return `推荐金提现 ${formatCurrencyCents(detail.amount)}`;
    if (detail.type === "referral_payment_refund_reversal") return `订单退款扣回 ${formatCurrencyCents(detail.amount)}`;
    const kind = {
      physical_order: "冰箱贴订单",
      body_book_order: "认知书实体书",
      coin_purchase: "购买普通币",
      bean_purchase: "购买豆豆"
    }[detail.paymentKind] || "实付订单";
    return `${kind}推荐奖励 ${detail.amount >= 0 ? "+" : ""}${formatCurrencyCents(detail.amount)}${detail.status === "pending" ? "（预发放）" : ""}`;
  };
  const visibleDetails = (summary?.details || []).filter((detail) =>
    !((isDrawReferralView && detail.type === "registration_bean") || (!isDrawReferralView && detail.type === "registration_coin"))
  );

  return (
    <main className="referral-page">
      <header className="referral-header">
        <a className="referral-back" href={isDrawReferralView ? "/" : "/book"}><ArrowLeft size={18} />返回{isDrawReferralView ? "抽卡" : "认知书"}</a>
        <h1>我的邀请</h1>
      </header>
      {error ? <section className="referral-panel"><p className="error-note">{error}</p><a className="draw-card-primary" href="/book">返回主页登录</a></section> : null}
      {!summary && !error ? <section className="referral-panel referral-loading"><LoaderCircle className="spin" size={24} />正在读取邀请奖励…</section> : null}
      {summary ? <>
        <section className="referral-hero">
          <p>邀请好友，一起制作专属作品</p>
          <h2>好友注册得 5 {isDrawReferralView ? "币" : "豆"}</h2>
          <span>好友实付后先预发放推荐金，订单完成后才可提现</span>
        </section>
        <section className="referral-panel">
          <h2>专属邀请链接</h2>
          <div className="referral-link-row"><input readOnly value={summary.inviteUrl || ""} /><button className="draw-card-primary" onClick={() => copyValue(summary.inviteUrl, "邀请链接已复制，快去分享给朋友吧。")} type="button"><Clipboard size={16} />复制链接</button></div>
          {notice ? <p className="success-note">{notice}</p> : null}
        </section>
        <section className="referral-stat-grid">
          <article><span>已邀请注册</span><strong>{summary.registeredCount || 0}<small> 人</small></strong></article>
          <article><span>注册奖励</span><strong>{isDrawReferralView ? summary.registrationCoinTotal || 0 : summary.registrationBeanTotal || 0}<small> {isDrawReferralView ? "币" : "豆"}</small></strong></article>
          <article><span>可提现推荐金</span><strong>{formatCurrencyCents(summary.referralBalanceCents || 0)}</strong><em>累计 {formatCurrencyCents(summary.referralTotalCents || 0)}</em></article>
          <article><span>预发放推荐金</span><strong>{formatCurrencyCents(summary.referralPendingCents || 0)}</strong><em>订单完成后可提现</em></article>
        </section>
        <section className="referral-panel referral-withdrawal">
          <div><h2>推荐金提现</h2><p>{Number(summary.referralBalanceCents || 0) >= 2000 ? "可提现推荐金已达到 20 元，可联系客服提现。" : `可提现推荐金满 20 元可提现，还差 ${formatCurrencyCents(Math.max(0, 2000 - Number(summary.referralBalanceCents || 0)))}。`}</p></div>
          <button className="draw-card-secondary" disabled={Number(summary.referralBalanceCents || 0) < 2000} onClick={() => copyValue(DEFAULT_CONTACT_WECHAT_ID, `客服微信 ${DEFAULT_CONTACT_WECHAT_ID} 已复制。`)} type="button">{Number(summary.referralBalanceCents || 0) >= 2000 ? "联系客服提现" : "未达提现门槛"}</button>
        </section>
        <section className="referral-panel">
          <h2>奖励明细</h2>
          {visibleDetails.length ? <div className="referral-detail-list">{visibleDetails.map((detail, index) => <article key={`${detail.type}-${detail.createdAt}-${index}`}><div><strong>{detailLabel(detail)}</strong>{detail.type === "referral_payment_reward" ? <small>好友实付 {formatCurrencyCents(detail.orderAmountCents)}</small> : null}{detail.note ? <small>{detail.note}</small> : null}</div><time>{formatDateTime(detail.createdAt)}</time></article>)}</div> : <p className="storage-note">分享邀请链接后，奖励会显示在这里。</p>}
        </section>
      </> : null}
    </main>
  );
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
            <button className="draw-card-primary" onClick={() => window.location.assign("/")} type="button">返回小画页</button>
          </article>
        </section>
      </main>
    );
  }
}

function AuthModal({ onAuthenticated, onClose, reloadOnLogin = true, description = "" }) {
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
  const canUseWechatLogin = /MicroMessenger/i.test(window.navigator.userAgent);

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

  function startWechatLogin() {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.assign(`/api/auth/wechat/authorize?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <div className="modal-backdrop draw-card-confirm" onClick={closeModal} role="presentation">
      <section className="draw-card-confirm-panel auth-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="账户登录与注册">
        <button className="icon-button" onClick={closeModal} type="button" aria-label="关闭账户弹窗"><X size={18} /></button>
        <p className="draw-card-kicker">Account</p>
        <h2>{mode === "merge" ? "继承访客内容" : mode === "login" ? "登录" : mode === "register" ? "注册账户" : "找回密码"}</h2>
        <p className="storage-note">{mode === "merge" ? "请选择要转入当前账户的访客内容。币和豆豆不会合并或重置。" : description || (canUseWechatLogin ? "在微信内可使用微信一键登录或注册；也可继续使用邮箱账户。" : "访客可继续生图和加入卡夹；提交定制订单前需要完成注册。")}</p>
        {mode === "merge" ? <div className="draw-card-order-form auth-asset-merge">
          {Number(mergeableAssets?.clipCount || 0) > 0 ? <label className="toggle-field"><input checked={mergeClip} onChange={(event) => setMergeClip(event.target.checked)} type="checkbox" /><span>继承卡夹内的 {mergeableAssets.clipCount} 张图片</span></label> : null}
          {Number(mergeableAssets?.projectCount ?? mergeableAssets?.savedBookCount ?? 0) > 0 ? <label className="toggle-field"><input checked={mergeBodyBooks} onChange={(event) => setMergeBodyBooks(event.target.checked)} type="checkbox" /><span>继承“我的认知书”中的 {mergeableAssets.projectCount ?? mergeableAssets.savedBookCount} 个工程</span></label> : null}
          {error ? <p className="error-note">{error}</p> : null}
          <div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={busy} onClick={closeModal} type="button">暂不继承</button><button className="draw-card-primary" disabled={busy} onClick={finishAssetMerge} type="button">{busy ? "转移中" : "确认继承"}</button></div>
        </div> : <form className="draw-card-order-form" onSubmit={submit}>
          {canUseWechatLogin && mode !== "reset" ? <button className="draw-card-primary" disabled={busy} onClick={startWechatLogin} type="button">微信登录 / 注册</button> : null}
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

function BeanPurchaseModal({ beanCount, busy, error, payment, purchase, unitPriceCents, onClose, onCountChange, onRestart, onRetry, onSubmit }) {
  const safeCount = Math.min(Math.max(Math.trunc(Number(beanCount || 0)), 0), MAX_BEAN_PURCHASE_COUNT);
  const unitPrice = Math.max(1, Number(purchase?.unitPriceCents || unitPriceCents || 100));
  const amountCents = purchase?.amountCents ?? safeCount * unitPrice;
  const isPaid = purchase?.status === "paid";
  const isExpired = purchase?.status === "cancelled" || (purchase?.expiresAt && Date.parse(purchase.expiresAt) <= Date.now());
  const isManual = payment?.channel === "manual_collection";
  const isNative = payment?.channel === "wechat_native" && payment?.codeUrl;
  return <div className="modal-backdrop draw-card-confirm" onClick={() => !busy && onClose()} role="presentation"><section className="draw-card-confirm-panel body-book-bean-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="购买豆豆">
    <button className="icon-button" disabled={busy} onClick={onClose} type="button" aria-label="关闭购买豆豆"><X size={18} /></button><p className="draw-card-kicker">Buy beans</p><h2>购买豆豆</h2>
    <p className="storage-note">{formatCurrencyCents(unitPrice)} = 1 个豆豆。</p>
    {isPaid ? <><p className="success-note">购买成功，{purchase.beanCount} 个豆豆已到账。</p><div className="draw-card-confirm-actions"><button className="draw-card-primary" onClick={onClose} type="button">完成</button></div></> : isExpired ? <><p className="error-note">该购买单已过期，未产生扣款。请重新创建购买单后再支付。</p><div className="draw-card-confirm-actions"><button className="draw-card-secondary" onClick={onClose} type="button">关闭</button><button className="draw-card-primary" disabled={busy} onClick={onRestart} type="button">重新购买</button></div></> : isManual ? <article className="manual-payment-guide"><strong>请扫描商户收款码付款</strong><img alt="微信商户收款码" className="manual-payment-qr" src="/payment/wechat-merchant-collection.png" /><p>应付金额 {formatCurrencyCents(amountCents)}</p><p>购买单号：{purchase?.purchaseNo || "--"}</p><small>付款后管理员确认到账，豆豆将自动发放。</small></article> : isNative ? <article className="native-payment-panel"><h3>请使用微信扫码付款</h3><p className="storage-note">应付金额 {formatCurrencyCents(amountCents)}，扫码后无需手动输入金额。</p><img alt="购买豆豆微信支付二维码" className="native-payment-qr" src={createQrSvgDataUrl(payment.codeUrl, { margin: 1 })} /><p className="storage-note">支付成功后豆豆会自动到账。</p></article> : <><div className="body-book-wallet-actions">{[10, 20, 40, 100].map((count) => <button className="draw-card-secondary" disabled={busy || Boolean(purchase)} key={count} onClick={() => onCountChange(count)} type="button">{count} 豆</button>)}</div><label className="body-book-wallet-field"><span>购买数量（1–1000 个）</span><input disabled={busy || Boolean(purchase)} min="1" max={MAX_BEAN_PURCHASE_COUNT} onChange={(event) => onCountChange(event.target.value)} type="number" value={beanCount} /></label><p className="body-book-bean-balance">应付 <strong>{formatCurrencyCents(amountCents)}</strong></p><div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={busy} onClick={onClose} type="button">取消</button><button className="draw-card-primary" disabled={busy || safeCount < 1} onClick={purchase ? onRetry : onSubmit} type="button">{busy ? "处理中" : purchase ? "重新发起支付" : `支付 ${formatCurrencyCents(amountCents)}`}</button></div></>}
    {error ? <p className="error-note">{error}</p> : null}
  </section></div>;
}

function CoinPurchaseModal({ coinCount, busy, error, payment, purchase, unitPriceCents, onClose, onCountChange, onRestart, onRetry, onSubmit }) {
  const safeCount = Math.min(Math.max(Math.trunc(Number(coinCount || 0)), 0), MAX_BEAN_PURCHASE_COUNT);
  const unitPrice = Math.max(1, Number(purchase?.unitPriceCents || unitPriceCents || 100));
  const amountCents = purchase?.amountCents ?? safeCount * unitPrice;
  const isPaid = purchase?.status === "paid";
  const isExpired = purchase?.status === "cancelled" || (purchase?.expiresAt && Date.parse(purchase.expiresAt) <= Date.now());
  const isManual = payment?.channel === "manual_collection";
  const isNative = payment?.channel === "wechat_native" && payment?.codeUrl;
  return <div className="modal-backdrop draw-card-confirm" onClick={() => !busy && onClose()} role="presentation"><section className="draw-card-confirm-panel body-book-bean-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="购买币">
    <button className="icon-button" disabled={busy} onClick={onClose} type="button" aria-label="关闭购买币"><X size={18} /></button><p className="draw-card-kicker">Buy coins</p><h2>购买币</h2>
    <p className="storage-note">{formatCurrencyCents(unitPrice)} = 1 币。</p>
    {isPaid ? <><p className="success-note">购买成功，{purchase.coinCount} 币已到账。</p><div className="draw-card-confirm-actions"><button className="draw-card-primary" onClick={onClose} type="button">完成</button></div></> : isExpired ? <><p className="error-note">该购买单已过期，未产生扣款。请重新创建购买单后再支付。</p><div className="draw-card-confirm-actions"><button className="draw-card-secondary" onClick={onClose} type="button">关闭</button><button className="draw-card-primary" disabled={busy} onClick={onRestart} type="button">重新购买</button></div></> : isManual ? <article className="manual-payment-guide"><strong>请扫描商户收款码付款</strong><img alt="微信商户收款码" className="manual-payment-qr" src="/payment/wechat-merchant-collection.png" /><p>应付金额 {formatCurrencyCents(amountCents)}</p><p>购买单号：{purchase?.purchaseNo || "--"}</p><small>付款后管理员确认到账，币将自动发放。</small></article> : isNative ? <article className="native-payment-panel"><h3>请使用微信扫码付款</h3><p className="storage-note">应付金额 {formatCurrencyCents(amountCents)}，扫码后无需手动输入金额。</p><img alt="购买币微信支付二维码" className="native-payment-qr" src={createQrSvgDataUrl(payment.codeUrl, { margin: 1 })} /><p className="storage-note">支付成功后币会自动到账。</p></article> : <><div className="body-book-wallet-actions">{[10, 20, 40, 100].map((count) => <button className="draw-card-secondary" disabled={busy || Boolean(purchase)} key={count} onClick={() => onCountChange(count)} type="button">{count} 币</button>)}</div><label className="body-book-wallet-field"><span>购买数量（1–1000 币）</span><input disabled={busy || Boolean(purchase)} min="1" max={MAX_BEAN_PURCHASE_COUNT} onChange={(event) => onCountChange(event.target.value)} type="number" value={coinCount} /></label><p className="body-book-bean-balance">应付 <strong>{formatCurrencyCents(amountCents)}</strong></p><div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={busy} onClick={onClose} type="button">取消</button><button className="draw-card-primary" disabled={busy || safeCount < 1} onClick={purchase ? onRetry : onSubmit} type="button">{busy ? "处理中" : purchase ? "重新发起支付" : `支付 ${formatCurrencyCents(amountCents)}`}</button></div></>}
    {error ? <p className="error-note">{error}</p> : null}
  </section></div>;
}

function DrawCardConfigModal({ busy, error, onClose, onSubmit }) {
  const [subjectType, setSubjectType] = useState("");
  const [drawCount, setDrawCount] = useState(DEFAULT_PUBLIC_DRAW_COUNT);
  const requestedDrawCount = Math.min(Math.max(Number(drawCount) || DEFAULT_PUBLIC_DRAW_COUNT, MIN_PUBLIC_DRAW_COUNT), MAX_PUBLIC_STYLE_SELECTION);

  return (
    <div className="modal-backdrop draw-card-confirm" onClick={onClose} role="presentation">
      <section className="draw-card-confirm-panel draw-card-config-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="抽卡设置">
        <button className="icon-button" onClick={onClose} type="button" aria-label="关闭抽卡设置"><X size={18} /></button>
        <div>
          <p className="draw-card-kicker">Draw settings</p>
          <h2>设置本次抽卡</h2>
          <p className="storage-note">选好照片主体和出图张数后，系统会随机抽取合适风格开始生成。</p>
        </div>
        <div className="draw-card-config-panel">
          <div className="draw-card-config-group">
            <span className="draw-card-config-label">照片主体</span>
            <div className="draw-card-segmented-control" role="radiogroup" aria-label="照片主体">
              {DRAW_CARD_SUBJECT_OPTIONS.map((option) => <button className={`draw-card-segment ${subjectType === option.value ? "is-active" : ""}`} disabled={busy} key={option.value} onClick={() => setSubjectType(option.value)} type="button">{option.label}</button>)}
            </div>
          </div>
          <div className="draw-card-count-control">
            <span className="draw-card-config-label">本次抽卡</span>
            <div className="draw-card-count-options" role="radiogroup" aria-label="本次抽卡张数">
              {DRAW_CARD_COUNT_OPTIONS.map((count) => <button className={`draw-card-segment ${requestedDrawCount === count ? "is-active" : ""}`} disabled={busy} key={count} onClick={() => setDrawCount(count)} type="button">{count}张</button>)}
            </div>
          </div>
          <p className="draw-card-meta-note">本次最多消耗 {requestedDrawCount} 币，失败结果不扣币。</p>
        </div>
        {error ? <p className="error-note">{error}</p> : null}
        <div className="draw-card-confirm-actions">
          <button className="draw-card-secondary" disabled={busy} onClick={onClose} type="button">取消</button>
          <button className="draw-card-primary" disabled={!subjectType || busy} onClick={() => onSubmit({ subjectType, drawCount: requestedDrawCount })} type="button">
            {busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            <span>{busy ? "任务启动中" : "确认抽卡"}</span>
          </button>
        </div>
      </section>
    </div>
  );
}

function AdminApp({ navigate, route }) {
  const [styles, setStyles] = useState([]);
  const [styleGroups, setStyleGroups] = useState([]);
  const [inviteCodes, setInviteCodes] = useState([]);
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
    return styles.filter((style) => `${style.title || ""} ${getStyleTags(style).join(" ")} ${style.prompt || ""}`.toLowerCase().includes(keyword));
  }, [query, styles]);

  async function reloadStyles() {
    const nextStyles = await refreshStyles();
    setStyles(nextStyles);
    return nextStyles;
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
      body: JSON.stringify({
        title: "新风格",
        tags: ["新风格"],
        subjectType: "both",
        drawCardEnabled: true,
        drawCardWeight: DEFAULT_DRAW_CARD_WEIGHT,
        prompt: "在这里填写这个风格对应的提示词。"
      })
    });
    const created = await readJsonPayload(response, "新增风格失败。");
    if (!response.ok) throw new Error(created.message || "新增风格失败。");
    setStyles((current) => [created, ...current]);
    return created;
  }

  async function updateStyle(styleId, payload) {
    const response = await fetch(`/api/styles/${styleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const updated = await readJsonPayload(response, "保存风格失败。");
    if (!response.ok) throw new Error(updated.message || "保存风格失败。");
    setStyles((current) => current.map((style) => (style.id === styleId ? updated : style)));
  }

  async function deleteStyle(styleId) {
    await fetch(`/api/styles/${styleId}`, { method: "DELETE" });
    setStyles((current) => current.filter((style) => style.id !== styleId));
  }

  async function uploadStyleImage(styleId, file, variant = "") {
    const formData = new FormData();
    formData.append("image", file);
    if (variant) formData.append("variant", variant);
    const response = await fetch(`/api/styles/${styleId}/image`, {
      method: "POST",
      body: formData
    });
    const updated = await readJsonPayload(response, "上传风格图片失败。");
    if (!response.ok) throw new Error(updated.message || "上传风格图片失败。");
    setStyles((current) => current.map((style) => (style.id === styleId ? updated : style)));
    return updated;
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
    return <main className="app-shell admin-shell"><section className="workspace admin-workspace"><p className="storage-note">正在检查后台登录状态...</p></section></main>;
  }

  if (!isAuthenticated) {
    return <AdminLoginPage onLogin={handleLogin} />;
  }

  return (
    <main className="app-shell admin-shell">
      <section className="workspace admin-workspace">
        <header className="topbar">
          <div className="topbar-main admin-title-row">
            <p className="eyebrow">Prompt reference board</p>
            <h1>后台管理</h1>
          </div>
          <div className="subtle-entry-row admin-public-row" aria-label="公开页面入口">
            <span>公共页</span>
            <a className="subtle-entry-link" href="/">小画页</a>
            <a className="subtle-entry-link" href="/book">认知书页</a>
          </div>
          <nav className="top-actions admin-page-nav" aria-label="后台页面导航">
            <button aria-current={route === "admin-gallery" ? "page" : undefined} className={`nav-button ${route === "admin-gallery" ? "is-active" : ""}`} onClick={() => navigate("admin-gallery")} type="button">
              <Home size={18} />
              <span>图库</span>
            </button>
            <button aria-current={route === "admin-tasks" ? "page" : undefined} className={`nav-button ${route === "admin-tasks" ? "is-active" : ""}`} onClick={() => navigate("admin-tasks")} type="button">
              <ListTodo size={18} />
              <span>任务记录</span>
            </button>
            <button aria-current={route === "admin-style-publications" ? "page" : undefined} className={`nav-button ${route === "admin-style-publications" ? "is-active" : ""}`} onClick={() => navigate("admin-style-publications")} type="button">
              <Sparkles size={18} />
              <span>风格发布</span>
            </button>
            <button aria-current={route === "admin-orders" ? "page" : undefined} className={`nav-button ${route === "admin-orders" ? "is-active" : ""}`} onClick={() => navigate("admin-orders")} type="button">
              <Clipboard size={18} />
              <span>订单管理</span>
            </button>
            <button aria-current={route === "admin-users" ? "page" : undefined} className={`nav-button ${route === "admin-users" ? "is-active" : ""}`} onClick={() => navigate("admin-users")} type="button">
              <Eye size={18} />
              <span>用户管理</span>
            </button>
            <button aria-current={route === "admin-visits" ? "page" : undefined} className={`nav-button ${route === "admin-visits" ? "is-active" : ""}`} onClick={() => navigate("admin-visits")} type="button">
              <Eye size={18} />
              <span>访问记录</span>
            </button>
            <button aria-current={route === "admin-referrals" ? "page" : undefined} className={`nav-button ${route === "admin-referrals" ? "is-active" : ""}`} onClick={() => navigate("admin-referrals")} type="button">
              <Sparkles size={18} />
              <span>推荐</span>
            </button>
            <button aria-current={route === "admin-store-owners" ? "page" : undefined} className={`nav-button ${route === "admin-store-owners" ? "is-active" : ""}`} onClick={() => navigate("admin-store-owners")} type="button">
              <Store size={18} />
              <span>商户</span>
            </button>
            <button aria-current={route === "admin-batch" ? "page" : undefined} className={`nav-button ${route === "admin-batch" ? "is-active" : ""}`} onClick={() => navigate("admin-batch")} type="button">
              <Layers3 size={18} />
              <span>批量生成</span>
            </button>
            <button aria-current={route === "admin-invites" ? "page" : undefined} className={`nav-button ${route === "admin-invites" ? "is-active" : ""}`} onClick={() => navigate("admin-invites")} type="button">
              <Sparkles size={18} />
              <span>兑换码</span>
            </button>
            <button aria-current={route === "admin-api-providers" ? "page" : undefined} className={`nav-button ${route === "admin-api-providers" ? "is-active" : ""}`} onClick={() => navigate("admin-api-providers")} type="button">
              <ImageUp size={18} />
              <span>API配置</span>
            </button>
            <button aria-current={route === "admin-storage" ? "page" : undefined} className={`nav-button ${route === "admin-storage" ? "is-active" : ""}`} onClick={() => navigate("admin-storage")} type="button">
              <HardDrive size={18} />
              <span>存储管理</span>
            </button>
            <button aria-current={route === "admin-monitor" ? "page" : undefined} className={`nav-button ${route === "admin-monitor" ? "is-active" : ""}`} onClick={() => navigate("admin-monitor")} type="button">
              <Activity size={18} />
              <span>系统监控</span>
            </button>
            <button className="nav-button" onClick={handleLogout} type="button">
              <Home size={18} />
              <span>退出登录</span>
            </button>
          </nav>
        </header>

        {route === "admin-gallery" ? (
          <GalleryPage
            onCreateStyle={createStyle}
            onDeleteStyle={deleteStyle}
            onGenerate={setActiveGenerator}
            onRefreshStyles={reloadStyles}
            onReorderStyles={reorderVisibleStyles}
            onStyleChange={updateStyle}
            onUploadImage={uploadStyleImage}
            onViewPrompt={setActivePrompt}
            searchQuery={query}
            onSearchChange={setQuery}
            styles={filteredStyles}
          />
        ) : route === "admin-tasks" ? (
          <ImageJobsPage onStylePreviewReplaced={reloadStyles} />
        ) : route === "admin-style-publications" ? (
          <AdminStylePublicationsPage />
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
            onRefreshSettings={() => refreshAdminSettings().then(setSettings)}
            settings={settings}
          />
        ) : route === "admin-referrals" ? (
          <ReferralAdminPage onRefreshSettings={() => refreshAdminSettings().then(setSettings)} settings={settings} />
        ) : route === "admin-store-owners" ? (
          <StoreOwnerAdminPage />
        ) : route === "admin-users" ? (
          <UserAdminPage onOpenClip={openUserClip} />
        ) : route === "admin-visits" ? (
          <VisitRecordsAdminPage />
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
            onRefreshSettings={() => refreshAdminSettings().then(setSettings)}
            settings={settings}
          />
        ) : route === "admin-api-providers" ? (
          <ApiProviderAdminPage />
        ) : route === "admin-storage" ? (
          <StorageAdminPage
            storageSummary={storageSummary}
            onRefreshStorage={() => refreshStorageSummary().then(setStorageSummary)}
          />
        ) : route === "admin-monitor" ? (
          <MonitorAdminPage />
        ) : (
          <GalleryPage
            onCreateStyle={createStyle}
            onDeleteStyle={deleteStyle}
            onGenerate={setActiveGenerator}
            onRefreshStyles={reloadStyles}
            onReorderStyles={reorderVisibleStyles}
            onStyleChange={updateStyle}
            onUploadImage={uploadStyleImage}
            onViewPrompt={setActivePrompt}
            searchQuery={query}
            onSearchChange={setQuery}
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
                  {getStyleTags(activePrompt).map((tag) => (
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

const FRIDGE_MAGNET_PRODUCT_IMAGES = [
  {
    src: "/product/acrylic-magnet/magnet-front.png",
    alt: "透明亚克力照片冰箱贴正面展示",
    label: "正面展示"
  },
  {
    src: "/product/acrylic-magnet/magnet-in-hand.png",
    alt: "手持透明亚克力照片冰箱贴",
    label: "手持尺寸感"
  },
  {
    src: "/product/acrylic-magnet/magnet-on-fridge.png",
    alt: "照片冰箱贴贴在冰箱门上的效果",
    label: "冰箱展示"
  },
  {
    src: "/product/acrylic-magnet/magnet-on-table.png",
    alt: "照片冰箱贴桌面摆放展示",
    label: "桌面摆放"
  },
  {
    src: "/product/acrylic-magnet/magnet-keychain.png",
    alt: "带挂绳的透明照片冰箱贴",
    label: "可配挂绳"
  }
];

function FridgeMagnetProductPage() {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const activeImage = FRIDGE_MAGNET_PRODUCT_IMAGES[activeImageIndex] || FRIDGE_MAGNET_PRODUCT_IMAGES[0];

  return (
    <main className="magnet-product-page">
      <header className="magnet-product-nav">
        <a aria-label="返回冰箱贴工作室" className="magnet-product-brand" href="/fridge">
          <span className="magnet-product-brand-mark">P</span>
          <span>PetPaint</span>
        </a>
        <a className="magnet-product-nav-link" href="/fridge">去定制</a>
      </header>

      <section className="magnet-product-hero">
        <div className="magnet-product-gallery" aria-label="产品图片预览">
          <div className="magnet-product-main-image-wrap">
            <img alt={activeImage.alt} className="magnet-product-main-image" src={activeImage.src} />
            <span className="magnet-product-image-caption">{activeImage.label}</span>
          </div>
          <div className="magnet-product-thumbnails" role="list" aria-label="切换产品图片">
            {FRIDGE_MAGNET_PRODUCT_IMAGES.map((image, index) => (
              <button
                aria-current={index === activeImageIndex ? "true" : undefined}
                aria-label={`查看${image.label}`}
                className={`magnet-product-thumbnail ${index === activeImageIndex ? "is-active" : ""}`}
                key={image.src}
                onClick={() => setActiveImageIndex(index)}
                type="button"
              >
                <img alt="" src={image.src} />
              </button>
            ))}
          </div>
        </div>

        <div className="magnet-product-summary">
          <p className="magnet-product-eyebrow">PHOTO MAGNET · MADE FOR EVERYDAY</p>
          <h1>把喜欢的瞬间，<br />留在每天看得见的地方。</h1>
          <p className="magnet-product-lead">一张照片，一块小小的透明冰箱贴。把人、宠物和那些值得反复想起的画面，变成生活里的温柔注脚。</p>

          <div className="magnet-product-size-card">
            <div>
              <span>实物尺寸</span>
              <strong>6 <small>cm</small> × 9 <small>cm</small></strong>
            </div>
            <svg aria-hidden="true" className="magnet-product-dimension" viewBox="0 0 154 118">
              <path d="M36 14h80v91H36z" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M36 7v14M116 7v14M36 11h80M26 14v91M19 14h14M19 105h14" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <text x="76" y="8" textAnchor="middle">6 cm</text>
              <text x="14" y="62" textAnchor="middle" transform="rotate(-90 14 62)">9 cm</text>
            </svg>
          </div>

          <ul className="magnet-product-feature-list">
            <li><span>01</span><div><strong>透明亚克力框体</strong><p>清透边缘包住你的专属画面，轻盈又有存在感。</p></div></li>
            <li><span>02</span><div><strong>四角金色固定点</strong><p>细节为画面加上一点精致感，展示更有层次。</p></div></li>
            <li><span>03</span><div><strong>照片 / AI 小画均可定制</strong><p>上传喜欢的图片，生成后选中满意的那一张再下单。</p></div></li>
          </ul>

          <a className="magnet-product-cta" href="/fridge">
            <span>立即开始定制</span>
            <ArrowRight size={19} />
          </a>
          <p className="magnet-product-note">尺寸为框体外径：6 cm × 9 cm</p>
        </div>
      </section>

      <section className="magnet-product-story">
        <div className="magnet-product-story-copy">
          <p className="magnet-product-eyebrow">ONE PHOTO, MANY MOMENTS</p>
          <h2>不止贴在冰箱上，<br />也是随身的小小纪念。</h2>
          <p>在厨房里做一枚每日可见的小惊喜；摆在桌面，给忙碌留一点快乐；也可以搭配挂绳，带着喜欢的画面一起出门。</p>
        </div>
        <div className="magnet-product-story-grid">
          <figure className="magnet-product-story-image magnet-product-story-image-fridge">
            <img alt="冰箱门场景中的照片冰箱贴" src="/product/acrylic-magnet/magnet-on-fridge.png" />
            <figcaption>冰箱门上的每日相见</figcaption>
          </figure>
          <figure className="magnet-product-story-image magnet-product-story-image-keychain">
            <img alt="搭配挂绳使用的照片冰箱贴" src="/product/acrylic-magnet/magnet-keychain.png" />
            <figcaption>可搭配挂绳随身携带</figcaption>
          </figure>
        </div>
      </section>

      <section className="magnet-product-specs" aria-label="商品规格">
        <p className="magnet-product-eyebrow">PRODUCT DETAILS</p>
        <h2>小小一块，装下大大的喜欢。</h2>
        <dl>
          <div><dt>产品名称</dt><dd>透明照片冰箱贴</dd></div>
          <div><dt>产品尺寸</dt><dd>6 cm × 9 cm</dd></div>
          <div><dt>画面内容</dt><dd>支持照片或 AI 小画定制</dd></div>
          <div><dt>使用场景</dt><dd>冰箱、桌面展示、挂绳搭配</dd></div>
        </dl>
      </section>

      <section className="magnet-product-final-cta">
        <p>给一张喜欢的照片，一个每天都会看到的位置。</p>
        <a href="/fridge">开始制作我的冰箱贴 <ArrowRight size={18} /></a>
      </section>
    </main>
  );
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
      setError(nextError.message || "兑换码兑换失败，请稍后再试。");
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
          <p className="body-book-kicker">My cognition book</p>
          <h1>{session?.theme?.englishName || selectedTheme?.englishName || "My First Book"}</h1>
          <p>{session?.theme ? `正在制作：${session.theme.name}` : selectedTheme ? `正在制作：${selectedTheme.name}` : "选择一个主题，制作一套中英双语宝宝认知书。"}</p>
        </div>
        <div className="body-book-header-actions">
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
            <div className="body-book-theme-groups">{getBodyBookThemeGroups(themes).map((group) => <section className="body-book-theme-group" key={group.id}><div className="body-book-theme-group-head"><span>{group.title}</span><p>{group.description}</p></div><div className="body-book-theme-grid">{group.items.map(({ theme, index }) => <button className="body-book-theme-card" key={theme.id} onClick={() => { setSelectedTheme(theme); setError(""); }} type="button"><img alt={`${theme.name} 例图`} className="body-book-theme-preview" decoding="async" loading={index > 3 ? "lazy" : "eager"} src={getBodyBookThemePreviewSrc(theme)} /><span className="body-book-theme-index">{String(index).padStart(2, "0")}</span><strong>{theme.name}</strong><small>{theme.englishName}</small></button>)}</div></section>)}</div>
          </div>
          <aside className="body-book-wallet-panel">
            <span className="body-book-wallet-label">我的豆豆</span>
            <strong>{visitorState ? `${visitorState.account?.beanBalance || 0} 个豆豆` : "--"}</strong>
            <p>{billingEnabled ? "认知书封面、内页和重新生成均消耗豆豆。" : "内测阶段，认知书暂不消耗豆豆。"}</p>
            <label className="body-book-wallet-field"><span>兑换码</span><input disabled={isSubmitting} onChange={(event) => setInviteCode(event.target.value)} placeholder="输入兑换码" value={inviteCode} /></label>
            <div className="body-book-wallet-actions">
              <button className="draw-card-primary" disabled={isSubmitting || !inviteCode.trim()} onClick={redeemBookInvite} type="button">兑换</button>
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
                <img alt={`${book.title} 封面`} decoding="async" loading="lazy" src={getBodyBookThumbnail(book.cover)} />
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
      {succeeded ? <button className="body-book-item-media" onClick={() => onOpen(item)} type="button"><img alt={item.title} decoding="async" loading="lazy" src={getBodyBookThumbnail(item)} /></button> : <div className="body-book-placeholder">{pending ? <LoaderCircle className="spin" size={24} /> : <AlertTriangle size={24} />}<strong>{pending ? "正在生成" : item?.status === "not_started" ? "等待封面确认" : "生成失败"}</strong><span>{item?.errorMessage || (pending ? "图片完成后会自动出现。" : "")}</span></div>}
      <div className="body-book-item-meta"><div><strong>{item.title}</strong></div>{succeeded ? <div className="body-book-item-actions"><button className="icon-button" onClick={() => onOpen(item)} title="查看大图" type="button"><Eye size={17} /></button><a className="icon-button" download={getBodyBookDownloadName(item)} href={item.result.imageUrl} title="下载图片"><Download size={17} /></a>{onRegenerate ? <button className="icon-button" disabled={regenerating} onClick={() => onRegenerate(item)} title="重新生成" type="button">{regenerating ? <LoaderCircle className="spin" size={17} /> : <RefreshCw size={17} />}</button> : null}</div> : onRegenerate && !pending && item?.status !== "not_started" ? <button className="body-book-regenerate" disabled={regenerating} onClick={() => onRegenerate(item)} type="button">{regenerating ? "生成中" : "重新生成"}</button> : null}</div>
    </article>
  );
}

function getBodyBookDownloadName(item) {
  const extension = item?.result?.mimeType === "image/svg+xml" ? "svg" : "png";
  return `my-first-body-${item?.key || "page"}.${extension}`;
}

function getBodyBookThumbnail(item) {
  const originalUrl = String(item?.result?.imageUrl || "");
  return item?.result?.thumbnailUrl || item?.result?.previewUrl || (originalUrl.startsWith("/generated-images/") ? "" : originalUrl);
}

function getCompletedBodyBookPrintPreviewPages(pages) {
  const printPages = Array.isArray(pages) ? pages : [];
  const succeededBabyKeys = new Set(printPages
    .filter((page) => !page?.isBuiltIn && page?.status === "succeeded" && getBodyBookThumbnail(page))
    .map((page) => String(page?.key || "").toLowerCase()));
  return printPages.filter((page) => {
    if (page?.isBuiltIn) {
      if (page?.pageType === "back-cover" || page?.key === "back-cover") return Boolean(getBodyBookThumbnail(page));
      const conceptKey = String(page?.conceptKey || page?.colorKey || "").trim().toLowerCase();
      return Boolean(conceptKey) && succeededBabyKeys.has(`${conceptKey}-baby`);
    }
    return page?.status === "succeeded" && Boolean(getBodyBookThumbnail(page));
  });
}

function getBodyBookCartEligibility(book) {
  const requiredCount = Math.max(1, Number(book?.theme?.generationPageCount || getBodyBookThemeGenerationCost(book?.theme) || 0));
  const pages = Array.isArray(book?.pages) ? book.pages.filter((page) => !page?.isBuiltIn && page?.pageType !== "back-cover") : [];
  const incompleteCount = pages.filter((page) => page?.status !== "succeeded" || !page?.result?.imageUrl).length;
  const missingCount = Math.max(0, requiredCount - pages.length) + incompleteCount;
  return { eligible: pages.length === requiredCount && incompleteCount === 0, missingCount: Math.max(1, missingCount) };
}

function readBodyBookCart(account) {
  const accountId = String(account?.id || "").trim();
  if (!accountId) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${BODY_BOOK_CART_STORAGE_PREFIX}${accountId}`) || "[]");
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    return items.reduce((cart, item) => {
      const projectId = String(item?.projectId || "").trim();
      const quantity = Math.trunc(Number(item?.quantity || 0));
      if (projectId && quantity > 0) cart[projectId] = Math.min(MAX_BODY_BOOK_CART_QUANTITY, quantity);
      return cart;
    }, {});
  } catch {
    return {};
  }
}

function saveBodyBookCart(account, cart) {
  const accountId = String(account?.id || "").trim();
  if (!accountId) return;
  const items = Object.entries(cart || {})
    .map(([projectId, quantity]) => ({ projectId, quantity: Math.trunc(Number(quantity || 0)) }))
    .filter((item) => item.projectId && item.quantity > 0)
    .slice(0, MAX_BODY_BOOK_CART_QUANTITY);
  try {
    window.localStorage.setItem(`${BODY_BOOK_CART_STORAGE_PREFIX}${accountId}`, JSON.stringify(items));
  } catch {
    // Checkout remains available even if browser storage is unavailable.
  }
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

function DrawSharePage() {
  const token = window.location.pathname.split("/").filter(Boolean).pop() || "";
  const visitSource = useMemo(() => ({ type: "share", token }), [token]);
  const [sharedImage, setSharedImage] = useState(null);
  const [showingReference, setShowingReference] = useState(false);
  const [mainImageLoaded, setMainImageLoaded] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!mainImageLoaded) return;
    const referenceUrl = String(sharedImage?.references?.[0]?.originalUrl || "").trim();
    if (!referenceUrl) return;
    // 效果图加载完成后立即预载原始参考图，长按对比时即可立即显示。
    const preloader = new Image();
    preloader.decoding = "async";
    preloader.src = referenceUrl;
  }, [mainImageLoaded, sharedImage]);

  useEffect(() => {
    const button = document.querySelector(".draw-share-compare-button");
    if (!button) return undefined;
    button.setAttribute("aria-label", "长按此处对比原图");
    let timer = 0;
    let active = false;
    const clearPress = () => {
      if (timer) window.clearTimeout(timer);
      timer = 0;
      if (active) setShowingReference(false);
      active = false;
    };
    const startPress = (event) => {
      event.stopPropagation();
      clearPress();
      timer = window.setTimeout(() => {
        active = true;
        setShowingReference(true);
      }, 500);
    };
    const endPress = (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearPress();
    };
    button.addEventListener("pointerdown", startPress, true);
    button.addEventListener("pointerup", endPress, true);
    button.addEventListener("pointercancel", endPress, true);
    button.addEventListener("pointerleave", endPress, true);
    button.addEventListener("touchstart", startPress, true);
    button.addEventListener("touchend", endPress, true);
    button.addEventListener("touchcancel", endPress, true);
    return () => {
      clearPress();
      button.removeEventListener("pointerdown", startPress, true);
      button.removeEventListener("pointerup", endPress, true);
      button.removeEventListener("pointercancel", endPress, true);
      button.removeEventListener("pointerleave", endPress, true);
      button.removeEventListener("touchstart", startPress, true);
      button.removeEventListener("touchend", endPress, true);
      button.removeEventListener("touchcancel", endPress, true);
    };
  }, [sharedImage]);

  useVisitSessionTracking("draw-card", true, visitSource);

  useEffect(() => {
    let active = true;
    fetchPublicDrawShare(token)
      .then(async (payload) => {
        if (!active) return;
        setSharedImage(payload);
        try { await recordPublicDrawShareVisit(token); } catch {}
      })
      .catch((nextError) => { if (active) setError(nextError.message || "分享内容暂时不可访问。"); });
    return () => { active = false; };
  }, [token]);

  const makeUrl = useMemo(() => {
    const url = new URL(sharedImage?.makeUrl || "/", window.location.origin);
    const styleId = String(sharedImage?.styleId || "").trim();
    if (styleId) {
      // “我也要做”直达“做同款”模式，避免同时触发普通风格选择。
      url.searchParams.delete("styleId");
      url.searchParams.set("sameStyleId", styleId);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  }, [sharedImage?.makeUrl, sharedImage?.styleId]);
  return <main className="draw-card-page body-book-share-page">
    {error ? <section className="body-book-share-empty"><AlertTriangle size={30} /><h2>分享链接已失效</h2><p>{error}</p><a className="draw-card-primary" href="/">我也要做</a></section> : null}
    {!sharedImage && !error ? <section className="body-book-share-empty"><LoaderCircle className="spin" size={30} /><p>正在打开好友分享的小画…</p></section> : null}
    {sharedImage ? <section className="body-book-share-content draw-share-content"><figure className="draw-share-figure"><div className="draw-share-stage"><img alt={sharedImage.styleName || "好友分享的小画"} className={`draw-share-stage-image${showingReference ? " is-hidden" : ""}`} decoding="async" fetchPriority="high" loading="eager" onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} onLoad={() => setMainImageLoaded(true)} src={sharedImage.previewUrl || sharedImage.imageUrl} />{showingReference && sharedImage.references?.[0]?.originalUrl ? <img alt="好友上传的原参考图" className="draw-share-stage-image draw-share-reference-image is-visible" decoding="async" fetchPriority="high" loading="eager" src={sharedImage.references[0].originalUrl} /> : null}{sharedImage.references?.[0]?.originalUrl ? <div aria-label="长按此处对比原图" className="draw-share-compare-button" onContextMenu={(event) => event.preventDefault()} onDragStart={(event) => event.preventDefault()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setShowingReference(true); } }} onKeyUp={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setShowingReference(false); } }} onLostPointerCapture={() => setShowingReference(false)} onPointerCancel={() => setShowingReference(false)} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId); setShowingReference(true); }} onPointerLeave={() => setShowingReference(false)} onPointerUp={(event) => { event.preventDefault(); event.stopPropagation(); setShowingReference(false); }} onTouchCancel={(event) => { event.preventDefault(); setShowingReference(false); }} onTouchEnd={(event) => { event.preventDefault(); setShowingReference(false); }} onTouchStart={(event) => { event.preventDefault(); event.stopPropagation(); setShowingReference(true); }} role="button" tabIndex={0}>对比原图</div> : null}</div><figcaption>{sharedImage.styleName || "小画"}</figcaption></figure><div className="body-book-share-cta"><p>AI小画，让有意义的照片更精美。</p><a className="draw-card-primary" href={makeUrl}>我也要做</a></div></section> : null}
  </main>;
}

function BodyBookSharePage() {
  const token = window.location.pathname.split("/").filter(Boolean).pop() || "";
  const visitSource = useMemo(() => ({ type: "share", token }), [token]);
  const [sharedBook, setSharedBook] = useState(null);
  const [error, setError] = useState("");

  useVisitSessionTracking("body-book", true, visitSource);

  useEffect(() => {
    let active = true;
    fetchPublicBodyBookShare(token)
      .then(async (payload) => {
        if (!active) return;
        setSharedBook(payload);
        try { await recordPublicBodyBookShareVisit(token); } catch {}
      })
      .catch((nextError) => { if (active) setError(nextError.message || "分享内容暂时不可访问。"); });
    return () => { active = false; };
  }, [token]);

  const makeUrl = sharedBook?.makeUrl || "/book";
  return <main className="body-book-page body-book-share-page">
    <header className="body-book-header body-book-share-header">
      <div className="body-book-header-copy"><p className="body-book-kicker">Shared book</p><h1>好友分享的认知书</h1><p>看看这本正在制作的专属认知书吧。</p></div>
      <a className="draw-card-secondary" href={makeUrl}>我也要做</a>
    </header>
    {error ? <section className="body-book-share-empty"><AlertTriangle size={30} /><h2>分享链接已失效</h2><p>{error}</p><a className="draw-card-primary" href="/book">我也要做</a></section> : null}
    {!sharedBook && !error ? <section className="body-book-share-empty"><LoaderCircle className="spin" size={30} /><p>正在打开好友分享的认知书…</p></section> : null}
    {sharedBook ? <section className="body-book-share-content"><BodyBookFlipBook ariaLabel={`${sharedBook.title || "好友分享的认知书"}翻页预览`} pages={sharedBook.pages.map((page, index) => ({ id: page.key || String(index), isPreset: page.isBuiltIn === true, src: page.thumbnailUrl, title: page.title || `第 ${index + 1} 页` }))} /><div className="body-book-share-cta"><p>也来制作一本属于自己的认知书吧。</p><a className="draw-card-primary" href={makeUrl}>我也要做</a></div></section> : null}
  </main>;
}

function BodyBookPage() {
  const [themes, setThemes] = useState(BODY_BOOK_THEME_FALLBACKS);
  const [billingEnabled, setBillingEnabled] = useState(false);
  const [visitorState, setVisitorState] = useState(null);
  const [orderConfig, setOrderConfig] = useState(null);
  const [bodyBookOrders, setBodyBookOrders] = useState([]);
  const [savedBooks, setSavedBooks] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [themePreview, setThemePreview] = useState(null);
  const [showcasePayload, setShowcasePayload] = useState(null);
  const [project, setProject] = useState(null);
  const [openingProjectId, setOpeningProjectId] = useState(() => String(new URLSearchParams(window.location.search).get("project") || "").trim());
  const [draftKeys, setDraftKeys] = useState([]);
  const [draftReferences, setDraftReferences] = useState([]);
  const [draftChildName, setDraftChildName] = useState("");
  const [draftReferencePreviews, setDraftReferencePreviews] = useState([]);
  const [draftPageReferences, setDraftPageReferences] = useState({});
  const [draftPageReferencePreviews, setDraftPageReferencePreviews] = useState({});
  const [pagePrompts, setPagePrompts] = useState({});
  const [dirtyPromptKeys, setDirtyPromptKeys] = useState([]);
  const [error, setError] = useState("");
  const [activeItem, setActiveItem] = useState(null);
  const [originalPreview, setOriginalPreview] = useState(null);
  const [activeReferencePreview, setActiveReferencePreview] = useState(null);
  const [activePageReferenceKey, setActivePageReferenceKey] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactCopied, setContactCopied] = useState(false);
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
  const [showBookPreview, setShowBookPreview] = useState(false);
  const [showBookShareModal, setShowBookShareModal] = useState(false);
  const [bookShareUrl, setBookShareUrl] = useState("");
  const [bookShareNotice, setBookShareNotice] = useState("");
  const [bookShareError, setBookShareError] = useState("");
  const [bookShareBusy, setBookShareBusy] = useState(false);
  const [showBookOriginalUnlockPrompt, setShowBookOriginalUnlockPrompt] = useState(false);
  const [bodyBookCart, setBodyBookCart] = useState({});
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
  const pendingBookShareRef = useRef(false);
  const pendingBookOriginalDownloadRef = useRef(null);
  const bodyBookEditorRef = useRef(false);
  const bodyBookThemePreviewRef = useRef(null);
  const bodyBookThemesRef = useRef(themes);
  const contactCopiedTimeoutRef = useRef(null);
  const bookVisitSource = useMemo(() => {
    const query = new URLSearchParams(window.location.search);
    const shareToken = String(query.get("share") || "").trim();
    const inviteToken = String(query.get("invite") || "").trim();
    if (shareToken) return { type: "share", token: shareToken };
    if (inviteToken) return { type: "invite", token: inviteToken };
    return { type: "organic", token: "" };
  }, []);

  useVisitSessionTracking("body-book", true, bookVisitSource);

  const activeTheme = project?.theme || selectedTheme;
  const isKindergartenBook = activeTheme?.id === "kindergarten";
  const referenceUploadLimit = getBodyBookReferenceUploadLimit(activeTheme);
  const referenceUploadHint = referenceUploadLimit === 1
    ? "请上传1张宝宝的全身正面照片。"
    : isKindergartenBook
      ? "请上传孩子照片，1张即可，最多3张。"
      : "请上传宝宝照片，1张即可，最多3张。";
  bodyBookEditorRef.current = Boolean(activeTheme);
  bodyBookThemePreviewRef.current = themePreview;
  bodyBookThemesRef.current = themes;
  const contents = getBodyBookThemeContents(activeTheme);
  const selectableContents = useMemo(() => contents.filter((content) => !content.isBuiltIn && content.pageType !== "back-cover"), [contents]);
  const selectedKeys = (project?.pages?.map((page) => page.key) || draftKeys).filter((key) => selectableContents.some((content) => content.key === key));
  const draftPages = useMemo(() => selectableContents
    .filter((content) => draftKeys.includes(content.key))
    .map((content) => ({ ...content, status: "not_started", result: null, errorMessage: "", referenceUrls: draftPageReferencePreviews[content.key] || draftReferencePreviews })), [selectableContents, draftKeys, draftReferencePreviews, draftPageReferencePreviews]);
  const pages = (project?.pages || draftPages).filter((page) => !page.isBuiltIn && page.pageType !== "back-cover");
  const topReferenceUrls = project?.referenceUrls?.length ? project.referenceUrls : draftReferencePreviews;
  const topReferenceThumbnailUrls = project?.referenceThumbnailUrls?.length ? project.referenceThumbnailUrls : topReferenceUrls;
  const activePageReferencePage = pages.find((page) => page.key === activePageReferenceKey) || null;
  const activePageReferenceUrls = activePageReferencePage
    ? (activePageReferencePage.referenceUrls || topReferenceUrls)
    : [];
  const activePageReferenceThumbnailUrls = activePageReferencePage
    ? (activePageReferencePage.referenceThumbnailUrls || topReferenceThumbnailUrls)
    : [];
  const pendingCount = pages.filter((page) => ["queued", "running"].includes(page.status)).length;
  const incompleteKeys = pages.filter((page) => !["succeeded", "queued", "running"].includes(page.status)).map((page) => page.key);
  const allAvailableKeys = pages.filter((page) => !page.isBuiltIn && !["queued", "running"].includes(page.status)).map((page) => page.key);
  const bodyBookPricing = orderConfig?.bodyBook || {};
  const bodyBookThemeCardPriceCents = Math.max(0, Number(bodyBookPricing.priceCents || 0));
  const redemptionEntitlements = visitorState?.redemptionEntitlements || { fridgeMagnetItemCount: 0, bodyBookPrintCount: 0 };
  const hasBodyBookPrintRedemption = Number(redemptionEntitlements.bodyBookPrintCount || 0) > 0;
  const bookOrderGrossCents = Number(bodyBookPricing.priceCents || 0) + Number(bodyBookPricing.shippingFeeCents || 0);
  const bookOrderPayablePreviewCents = hasBodyBookPrintRedemption ? 0 : bookOrderGrossCents;
  const usesPairedPresetLayout = activeTheme?.id === "color"
    || project?.layoutVersion === "paired-preset-v2"
    || (!project && ["body", "transport", "animal"].includes(activeTheme?.id));
  const selectionTargetCount = usesPairedPresetLayout ? 9 : 17;
  const selectionRemaining = selectionTargetCount - selectedKeys.length;
  const selectionActionText = selectionRemaining >= 0 ? `还需要选择 ${selectionRemaining} 张` : `需要去除 ${Math.abs(selectionRemaining)} 张`;
  const printedInnerPageCount = 16;
  const selectionProgressText = usesPairedPresetLayout
    ? `当前认知书需要 1 张封面页 + ${printedInnerPageCount} 张内页（其中 8 张为内置认知页，无需生成），${selectionActionText}专属认知页。`
    : `当前认知书需要 1 张封面页 + ${printedInnerPageCount} 张内页，${selectionActionText}。`;
  const pickerSelectionRemaining = selectionTargetCount - pickerKeys.filter((key) => selectableContents.some((content) => content.key === key)).length;
  const pickerSelectionActionText = pickerSelectionRemaining >= 0 ? `还需要选择 ${pickerSelectionRemaining} 张` : `需要去除 ${Math.abs(pickerSelectionRemaining)} 张`;
  const pickerSelectionProgressText = usesPairedPresetLayout
    ? `当前认知书需要 1 张封面页 + ${printedInnerPageCount} 张内页（其中 8 张为内置认知页，无需生成），${pickerSelectionActionText}专属认知页。`
    : `当前认知书需要 1 张封面页 + ${printedInnerPageCount} 张内页，${pickerSelectionActionText}。`;
  const bookPreviewPages = project?.printPreviewPages || [];
  const completedBookPreviewPages = useMemo(() => getCompletedBodyBookPrintPreviewPages(bookPreviewPages), [bookPreviewPages]);
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
  const currentBookCartEligibility = useMemo(() => getBodyBookCartEligibility(project ? { ...project, theme: project.theme || activeTheme } : null), [project, activeTheme]);
  const currentBookCartQuantity = Math.max(0, Number(bodyBookCart[project?.sessionId] || 0));

  function applyProject(nextProject) {
    if (!nextProject?.sessionId) return;
    setProject(nextProject);
    setSelectedTheme(nextProject.theme || selectedTheme);
    setDraftKeys(nextProject.pages?.map((page) => page.key) || []);
    setDraftChildName(nextProject.personalization?.childName || "");
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
    Promise.allSettled([fetchVisitorState(), fetchOrderConfig(), fetchBodyBookThemes(), fetchBodyBookShowcases(), loadSavedBooks(), fetchMyOrders()]).then((results) => {
      if (!active) return;
      const [visitor, config, themePayload, showcaseResult, , ordersPayload] = results;
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
      if (showcaseResult.status === "fulfilled") setShowcasePayload(showcaseResult.value);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!themePreview) return undefined;
    let active = true;
    const refresh = () => fetchBodyBookShowcases().then((payload) => {
      if (active) setShowcasePayload(payload);
    }).catch(() => {});
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [themePreview?.id]);

  useEffect(() => {
    setBodyBookCart(readBodyBookCart(visitorState?.account));
  }, [visitorState?.account?.id]);

  useEffect(() => {
    if (!openingProjectId) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    window.history.replaceState({ ...(window.history.state || {}), bodyBookHistoryView: "editor" }, "", `${url.pathname}${url.search}${url.hash}`);
    void openProject(openingProjectId, { preserveHistory: true }).finally(() => setOpeningProjectId(""));
  }, [openingProjectId]);

  useEffect(() => () => {
    if (contactCopiedTimeoutRef.current) window.clearTimeout(contactCopiedTimeoutRef.current);
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    recordReferralVisit(token).catch(() => {});
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
    const currentState = window.history.state || {};
    if (!currentState.bodyBookHistoryView) {
      window.history.replaceState({ ...currentState, bodyBookHistoryView: "home" }, "", window.location.href);
    }
    const handleBrowserBack = (event) => {
      const historyView = String(event.state?.bodyBookHistoryView || "home");
      if (historyView === "theme-preview") {
        const themeId = String(event.state?.bodyBookThemeId || "");
        const theme = bodyBookThemesRef.current.find((item) => item.id === themeId);
        if (theme) {
          bodyBookEditorRef.current = false;
          setThemePreview(theme);
        }
        return;
      }
      if (historyView === "home" && (bodyBookEditorRef.current || bodyBookThemePreviewRef.current)) backToHome();
    };
    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
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
    const previews = draftReferences.map((file) => URL.createObjectURL(file));
    setDraftReferencePreviews(previews);
    return () => previews.forEach((url) => URL.revokeObjectURL(url));
  }, [draftReferences]);

  useEffect(() => {
    const entries = Object.entries(draftPageReferences).filter(([, files]) => Array.isArray(files) && files.length);
    const previews = Object.fromEntries(entries.map(([key, files]) => [key, files.map((file) => URL.createObjectURL(file))]));
    setDraftPageReferencePreviews(previews);
    return () => Object.values(previews).flat().forEach((url) => URL.revokeObjectURL(url));
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
    bodyBookEditorRef.current = true;
    setProject(null);
    setThemePreview(null);
    setSelectedTheme(theme);
    setDraftKeys(theme.id === "kindergarten" ? themeContents.map((item) => item.key) : themeContents.slice(0, 2).map((item) => item.key));
    setDraftReferences([]);
    setDraftChildName("");
    setDraftPageReferences({});
    setPagePrompts({});
    setDirtyPromptKeys([]);
    setHistoryTheme(null);
    setHistoryProjects([]);
    setError("");
    pushBodyBookEditorHistory();
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function openThemePreview(theme) {
    const currentState = window.history.state || {};
    if (currentState.bodyBookHistoryView !== "theme-preview") {
      window.history.replaceState({ ...currentState, bodyBookHistoryView: "home" }, "", window.location.href);
      window.history.pushState({ ...currentState, bodyBookHistoryView: "theme-preview", bodyBookThemeId: theme.id }, "", window.location.href);
    }
    setThemePreview(theme);
    setError("");
  }

  function closeThemePreview() {
    if (window.history.state?.bodyBookHistoryView === "theme-preview") {
      window.history.back();
      return;
    }
    setThemePreview(null);
    setError("");
  }

  async function copyBookContactWechat() {
    try {
      await copyText(getContactWechatId(orderConfig));
      setContactCopied(true);
      if (contactCopiedTimeoutRef.current) window.clearTimeout(contactCopiedTimeoutRef.current);
      contactCopiedTimeoutRef.current = window.setTimeout(() => setContactCopied(false), 2000);
    } catch (nextError) {
      setError(nextError.message || "复制微信号失败，请手动复制。");
    }
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

  async function openProject(projectId, { preserveHistory = false } = {}) {
    setBusy(true);
    setError("");
    try {
      applyProject(await fetchBodyBookProject(projectId));
      setThemePreview(null);
      bodyBookEditorRef.current = true;
      setHistoryTheme(null);
      setHistoryProjects([]);
      if (!preserveHistory) pushBodyBookEditorHistory();
    } catch (nextError) {
      setError(nextError.message || "打开认知书工程失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  function backToHome() {
    bodyBookEditorRef.current = false;
    setProject(null);
    setSelectedTheme(null);
    setThemePreview(null);
    setDraftReferences([]);
    setDraftChildName("");
    setDraftPageReferences({});
    setDraftKeys([]);
    setPagePrompts({});
    setDirtyPromptKeys([]);
    setError("");
    loadSavedBooks().catch(() => {});
  }

  function pushBodyBookEditorHistory() {
    const currentState = window.history.state || {};
    if (currentState.bodyBookHistoryView === "editor") return;
    // This transition can be triggered by an action inside a dialog (for
    // example “创建新的工程”). Do not carry that dialog's history marker into
    // the editor entry, otherwise dismissing the dialog can immediately pop
    // the just-opened editor back to the theme home.
    const { [MODAL_HISTORY_DEPTH_KEY]: _modalHistoryDepth, ...baseState } = currentState;
    window.history.replaceState({ ...baseState, bodyBookHistoryView: "home" }, "", window.location.href);
    window.history.pushState({ ...baseState, bodyBookHistoryView: "editor" }, "", window.location.href);
  }

  function returnToBookHome() {
    if (window.history.state?.bodyBookHistoryView === "editor") {
      window.history.back();
      return;
    }
    backToHome();
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

  function toggleCurrentBookCart() {
    if (!project?.sessionId || !currentBookCartEligibility.eligible) {
      window.alert(`暂时无法加入购物车，当前还差${currentBookCartEligibility.missingCount}张页面，请补齐后再加入购物车`);
      return;
    }
    if (!visitorState?.account?.isRegistered) {
      setShowAuthModal(true);
      return;
    }
    if (currentBookCartQuantity > 0) {
      if (!window.confirm("本书已经在购物车，是否要移出？")) return;
      setBodyBookCart((current) => {
        const next = { ...current };
        delete next[project.sessionId];
        saveBodyBookCart(visitorState.account, next);
        return next;
      });
      return;
    }
    setBodyBookCart((current) => {
      const total = Object.values(current).reduce((sum, quantity) => sum + Math.max(0, Number(quantity || 0)), 0);
      if (total >= MAX_BODY_BOOK_CART_QUANTITY) {
        window.alert("购物车最多可加入 20 本认知书。");
        return current;
      }
      const next = { ...current, [project.sessionId]: 1 };
      saveBodyBookCart(visitorState.account, next);
      return next;
    });
  }

  function openBookPreview() {
    if (!completedBookPreviewPages.length) {
      setError("请至少完成一张图片后再预览成书效果。");
      return;
    }
    setShowBookPreview(true);
  }

  async function openBookShare() {
    if (!project?.sessionId) return;
    if (!project.pages?.some((page) => page.status === "succeeded" && page.result?.imageUrl)) {
      setError("请至少完成一张图片后再分享。");
      return;
    }
    if (!visitorState?.account?.isRegistered) {
      pendingBookShareRef.current = true;
      setShowAuthModal(true);
      return;
    }
    await createAndShareBookProject();
  }

  async function createAndShareBookProject() {
    if (!project?.sessionId || bookShareBusy) return;
    setBookShareBusy(true);
    setBookShareError("");
    setBookShareNotice("");
    try {
      const payload = await createBodyBookProjectShare(project.sessionId);
      const nextUrl = String(payload?.shareUrl || "");
      setBookShareUrl(nextUrl);
      setProject((current) => current ? { ...current, share: payload?.share || current.share } : current);
      setShowBookShareModal(true);
      if (nextUrl) {
        try {
          await copyText(formatShareCopy(nextUrl, "book"));
          setBookShareNotice("链接已复制，可发送给好友。");
        } catch {
          setBookShareNotice("链接已生成，请点击下方按钮复制。");
        }
      }
    } catch (nextError) {
      setBookShareError(nextError.message || "创建分享链接失败，请稍后重试。");
      setShowBookShareModal(true);
    } finally {
      setBookShareBusy(false);
    }
  }

  async function openBookOriginalUnlockPrompt() {
    if (!project?.sessionId || bookShareBusy) return;
    setBookShareBusy(true);
    setBookShareUrl("");
    setBookShareError("");
    setBookShareNotice("");
    setShowBookOriginalUnlockPrompt(true);
    try {
      const payload = await createBodyBookProjectShare(project.sessionId);
      const nextUrl = String(payload?.shareUrl || "");
      if (!nextUrl) throw new Error("分享链接生成失败，请刷新后重试。");
      setBookShareUrl(nextUrl);
      setProject((current) => current ? { ...current, share: payload?.share || current.share } : current);
    } catch (nextError) {
      setBookShareError(nextError.message || "创建分享链接失败，请稍后重试。");
    } finally {
      setBookShareBusy(false);
    }
  }

  async function closeBookShare() {
    if (!project?.sessionId || bookShareBusy) return;
    setBookShareBusy(true);
    setBookShareError("");
    try {
      const payload = await closeBodyBookProjectShare(project.sessionId);
      setProject((current) => current ? { ...current, share: payload?.share || { enabled: false } } : current);
      setBookShareUrl("");
      setBookShareNotice("分享链接已关闭，原链接将无法再访问。");
    } catch (nextError) {
      setBookShareError(nextError.message || "关闭分享失败，请稍后重试。");
    } finally {
      setBookShareBusy(false);
    }
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

  async function updateTopReference(file, referenceIndex = null) {
    if (!file) return;
    if (!isValidBodyBookReference(file)) {
      setError("请上传 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (!project) {
      setDraftReferences((current) => {
        if (referenceIndex === null) return current.length < referenceUploadLimit ? [...current, file] : current;
        return current.map((item, index) => index === referenceIndex ? file : item);
      });
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
      if (referenceIndex !== null) data.append("referenceIndex", String(referenceIndex));
      applyProject(await replaceBodyBookProjectReference(project.sessionId, data));
    } catch (nextError) {
      setError(nextError.message || "替换参考图失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  async function removeTopReference(referenceIndex) {
    if (!Number.isInteger(referenceIndex) || referenceIndex < 0) return;
    if (!project) {
      setDraftReferences((current) => current.filter((_, index) => index !== referenceIndex));
      setDraftPageReferences({});
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    try {
      applyProject(await deleteBodyBookProjectReference(project.sessionId, referenceIndex));
    } catch (nextError) {
      setError(nextError.message || "删除参考图失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  async function updatePageReference(page, file, referenceIndex = null) {
    if (!file) return;
    if (!isValidBodyBookReference(file)) {
      setError("请上传 JPG、PNG 或 WebP 图片。");
      return;
    }
    if (!project) {
      setDraftPageReferences((current) => {
        const existing = [...(current[page.key] || draftReferences)];
        if (referenceIndex === null) {
          if (existing.length < referenceUploadLimit) existing.push(file);
        } else {
          existing[referenceIndex] = file;
        }
        return { ...current, [page.key]: existing.filter(Boolean) };
      });
      setError("");
      return;
    }
    setBusyPageKey(page.key);
    setError("");
    try {
      const prepared = await prepareReferenceForUpload({ id: `body-book-page-${page.key}`, file });
      const data = new FormData();
      data.append("image", prepared.file);
      if (referenceIndex !== null) data.append("referenceIndex", String(referenceIndex));
      applyProject(await replaceBodyBookProjectPageReference(project.sessionId, page.key, data));
    } catch (nextError) {
      setError(nextError.message || "替换页面参考图失败，请稍后再试。");
    } finally {
      setBusyPageKey("");
    }
  }

  async function removePageReference(page, referenceIndex) {
    const references = project ? (page.referenceUrls || []) : (draftPageReferences[page.key] || draftReferences);
    if (!project) {
      setDraftPageReferences((current) => ({ ...current, [page.key]: (current[page.key] || draftReferences).filter((_, index) => index !== referenceIndex) }));
      return;
    }
    setBusyPageKey(page.key);
    setError("");
    try {
      applyProject(await deleteBodyBookProjectPageReference(project.sessionId, page.key, referenceIndex));
    } catch (nextError) {
      setError(nextError.message || "删除页面参考图失败，请稍后再试。");
    } finally {
      setBusyPageKey("");
    }
  }

  function updatePagePrompt(pageKey, value) {
    const key = String(pageKey || "");
    if (!key) return;
    setPagePrompts((current) => ({ ...current, [key]: value }));
    setDirtyPromptKeys((current) => current.includes(key) ? current : [...current, key]);
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
      return true;
    }
    setBusy(true);
    setError("");
    try {
      applyProject(await updateBodyBookProjectPages(project.sessionId, normalized));
      return true;
    } catch (nextError) {
      setError(nextError.message || "更新认知书内容失败，请稍后再试。");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openContentPicker() {
    setPickerKeys(selectedKeys.filter((key) => selectableContents.some((content) => content.key === key)));
    setShowContentPicker(true);
  }

  async function toggleContentSelection(contentKey, checked) {
    const nextKeys = checked
      ? [...new Set([...pickerKeys, contentKey])]
      : pickerKeys.filter((key) => key !== contentKey);
    setPickerKeys(nextKeys);
    const saved = await savePageSelection(nextKeys);
    if (!saved) setPickerKeys(selectedKeys.filter((key) => selectableContents.some((content) => content.key === key)));
  }

  async function submitGeneration(keys, busyKey = "") {
    if (!keys.length) {
      setError("没有可提交的页面。");
      return;
    }
    const hasMissingReference = keys.some((key) => {
      const page = pages.find((item) => item.key === key);
      if (!page || page.isBuiltIn) return false;
      const references = project
        ? page.referenceUrls || []
        : draftPageReferences[key] ?? draftReferences;
      return !references.length;
    });
    if (hasMissingReference) {
      window.alert("存在尚未上传参考图的任务");
      return;
    }
    if (!(await ensureBookAccount())) return;
    if (!project && isKindergartenBook && !draftChildName.trim()) {
      setError("请先填写孩子昵称。");
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
        const data = new FormData();
        const preparedReferences = await Promise.all(draftReferences.map((file, index) => prepareReferenceForUpload({ id: `body-book-project-reference-${index}`, file })));
        preparedReferences.forEach((prepared) => data.append("images", prepared.file));
        data.append("themeId", activeTheme.id);
        if (isKindergartenBook) data.append("childName", draftChildName.trim());
        data.append("contentKeys", JSON.stringify(draftKeys));
        data.append("generationKeys", JSON.stringify(keys));
        data.append("pagePrompts", JSON.stringify(selectBodyBookPagePrompts(pagePrompts, draftKeys, dirtyPromptKeys)));
        Object.entries(draftPageReferences).forEach(([key, files]) => {
          if (draftKeys.includes(key)) files.forEach((file) => data.append(`pageReference-${key}`, file));
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
      if (project?.sessionId === book.sessionId) returnToBookHome();
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
      setError(nextError.message || "兑换码兑换失败，请稍后再试。");
    } finally {
      setBusy(false);
    }
  }

  function openActiveItem(item) {
    setActiveItem(item);
  }

  function closeActiveItem() {
    setActiveItem(null);
  }

  async function downloadBookOriginal(page, projectId = project?.sessionId) {
    if (!projectId || !page?.key) return;
    if (!visitorState?.account?.isRegistered) {
      pendingBookOriginalDownloadRef.current = { projectId, page };
      setShowAuthModal(true);
      return;
    }
    try {
      const latestProject = await fetchBodyBookProject(projectId);
      applyProject(latestProject);
      const latestPage = latestProject?.pages?.find((item) => item.key === page.key);
      if (!latestPage?.originalDownloadAvailable) {
        setError("");
        await openBookOriginalUnlockPrompt();
        return;
      }
    } catch (nextError) {
      setError(nextError.message || "读取原图下载权限失败，请稍后再试。");
      return;
    }
    setOriginalPreview({ url: getBodyBookProjectPageOriginalUrl(projectId, page), title: page.title || "认知书原图" });
  }

  const isOpeningProject = Boolean(openingProjectId && !activeTheme);
  const home = !isOpeningProject && !activeTheme && !themePreview;
  const showingThemePreview = Boolean(themePreview && !activeTheme);
  const isBookAccountRegistered = Boolean(visitorState?.account?.isRegistered);
  const bookAccountName = visitorState?.account?.username || "我的账户";
  const bookWechatAvatarUrl = String(visitorState?.account?.wechatAvatarUrl || "").trim();
  return (
    <main className="body-book-page">
      <header className={`body-book-header${home ? " body-book-home-header" : ""}`}>
        <div className="body-book-header-copy">
          <div className="body-book-title-lockup">
            <p aria-hidden="true" className="body-book-title-english"><span className="title-coral title-tilt-1">M</span><span className="title-gold title-tilt-2">y</span><span className="title-space" /><span className="title-green title-tilt-3">F</span><span className="title-teal title-tilt-4">i</span><span className="title-blue title-tilt-5">r</span><span className="title-indigo title-tilt-6">s</span><span className="title-purple title-tilt-7">t</span><span className="title-space" /><span className="title-orange title-tilt-8">B</span><span className="title-pink title-tilt-9">o</span><span className="title-cyan title-tilt-10">o</span><span className="title-mint title-tilt-11">k</span><span className="title-blue title-tilt-12">s</span></p>
            <h1>我的第一本认知书</h1>
          </div>
          <p>{activeTheme ? `正在制作：${activeTheme.name}` : "让孩子成为书中的主角"}</p>
        </div>
        <div className="body-book-header-actions">
          <button className="draw-card-secondary body-book-header-orders" onClick={() => window.location.assign("/book/orders")} type="button"><ListTodo size={16} /><span>我的订单</span></button>
          <button className="draw-card-secondary body-book-header-cart" onClick={() => window.location.assign("/book/cart")} type="button"><Plus size={16} /><span>购物车</span></button>
          <button className="draw-card-secondary body-book-header-works" onClick={() => window.location.assign("/book/works")} type="button"><Layers3 size={16} /><span>我的作品</span></button>
          <button className="draw-card-secondary body-book-header-balance" onClick={() => setShowBeanInfo(true)} type="button"><span>余额</span><strong>{visitorState ? visitorState.account?.beanBalance || 0 : "--"}</strong><span>豆</span></button>
          <div className="body-book-user-area" ref={userMenuRef}><button aria-label={isBookAccountRegistered ? `账户：${bookAccountName}` : "登录或注册"} className={`draw-card-secondary body-book-account-button${isBookAccountRegistered ? " is-signed-in" : " is-guest"}`} onClick={() => isBookAccountRegistered ? setShowUserMenu((value) => !value) : setShowAuthModal(true)} title={isBookAccountRegistered ? bookAccountName : "登录 / 注册"} type="button">{isBookAccountRegistered && bookWechatAvatarUrl ? <img alt="" src={bookWechatAvatarUrl} /> : <span>{isBookAccountRegistered ? bookAccountName.slice(0, 1) : "登录"}</span>}</button>{showUserMenu && isBookAccountRegistered ? <div className="body-book-user-menu"><span className="body-book-user-menu-name">{bookAccountName}</span><button onClick={() => window.location.assign("/book/referrals?source=book")} type="button">我的邀请</button><button onClick={async () => { await logoutCurrentAccount(); setShowUserMenu(false); setVisitorState(await fetchVisitorState()); }} type="button">退出登录</button></div> : null}</div>
        </div>
      </header>

      {isOpeningProject ? <section className="body-book-share-empty"><LoaderCircle className="spin" size={30} /><p>正在打开认知书工程…</p></section> : home ? <>
        <section className="body-book-theme-home body-book-theme-layout">
          <div className="body-book-theme-content"><div className="body-book-theme-head"><span className="body-book-step">01</span><h2>选择认知主题</h2><p>先查看整本效果，再开始制作专属认知书。</p></div><BodyBookThemePager busy={busy} discountCents={0} groups={getBodyBookThemeGroups(themes)} onSelectTheme={openThemePreview} priceCents={bodyBookThemeCardPriceCents} showcasePayload={showcasePayload} /></div>
        </section>
      </> : showingThemePreview ? <BodyBookThemeEffectPreview busy={busy} onBack={closeThemePreview} onStart={() => selectTheme(themePreview)} showcasePayload={showcasePayload} theme={themePreview} /> : <section className="body-book-workspace body-book-project-workspace">
        <div className="body-book-status-row"><div><span className="body-book-step">02</span><h2>{project?.message || "配置你的认知书页面"}</h2></div></div>
        {error ? <p className="error-note">{error}</p> : null}
        {isKindergartenBook ? <section className="body-book-kindergarten-profile"><div><span className="body-book-step">STORY HERO</span><h3>孩子昵称</h3><p>会出现在封面上，例如“乐乐去幼儿园啦”。</p></div>{project ? <strong>{draftChildName || "小朋友"}</strong> : <label><span>昵称（必填）</span><input disabled={busy} maxLength={12} onChange={(event) => setDraftChildName(event.target.value)} placeholder="例如：乐乐" value={draftChildName} /></label>}</section> : null}
        <section className="body-book-project-reference"><div><span className="body-book-step">REFERENCE</span><h3>{isKindergartenBook ? "孩子参考图" : "全局参考图"}</h3><p>{referenceUploadHint}</p></div><div className={`body-book-reference-list${topReferenceUrls.length ? " has-references" : " is-empty"}`}>{topReferenceUrls.length ? <div className="body-book-reference-previews">{topReferenceUrls.map((url, index) => <div className="body-book-reference-preview" key={`${url}-${index}`}><button aria-label={`查看${isKindergartenBook ? "孩子" : "宝宝"}参考图 ${index + 1} 大图`} className="body-book-reference-preview-open" onClick={() => setActiveReferencePreview({ url, index })} type="button"><img alt={`${isKindergartenBook ? "孩子" : "宝宝"}参考图 ${index + 1}`} decoding="async" src={topReferenceThumbnailUrls[index] || url} /><span className="body-book-reference-index">{index + 1}</span></button><button aria-label={`删除第 ${index + 1} 张${isKindergartenBook ? "孩子" : "宝宝"}参考图`} className="body-book-reference-delete icon-button" disabled={busy} onClick={() => removeTopReference(index)} title="删除参考图" type="button"><X size={15} /></button></div>)}{topReferenceUrls.length < referenceUploadLimit ? <label aria-label={`继续上传${isKindergartenBook ? "孩子" : "宝宝"}照片`} className="body-book-upload body-book-project-upload body-book-reference-add is-compact" title={`继续上传${isKindergartenBook ? "孩子" : "宝宝"}照片`}><Plus aria-hidden="true" size={24} /><input accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { updateTopReference(event.target.files?.[0] || null); event.target.value = ""; }} type="file" /></label> : null}</div> : <label aria-label={`上传${isKindergartenBook ? "孩子" : "宝宝"}照片`} className="body-book-upload body-book-project-upload body-book-reference-add is-initial" title={`上传${isKindergartenBook ? "孩子" : "宝宝"}照片`}><Plus aria-hidden="true" size={32} /><strong>上传{isKindergartenBook ? "孩子" : "宝宝"}照片</strong><input accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { updateTopReference(event.target.files?.[0] || null); event.target.value = ""; }} type="file" /></label>}</div></section>
        <section className="body-book-content-panel">
          <div className="body-book-project-pages-head"><div><span className="body-book-step">03</span><h3>内容选择</h3><p>{usesPairedPresetLayout ? "制作时仅选择封面和各主题专属认知页；对应内置认知页会在下单预览中自动加入。" : "每张卡片可单独替换参考图并生成。"}</p><p className="body-book-selection-progress">{selectionProgressText}</p></div></div>
          <div className="body-book-grid body-book-project-grid">{pages.map((page) => <BodyBookProjectItem busy={busy} busyPageKey={busyPageKey} key={`${page.key}-${page.jobId || "new"}`} onDelete={() => savePageSelection(selectedKeys.filter((key) => key !== page.key))} onDownload={() => { void downloadBookOriginal(page); }} onEditReferences={() => setActivePageReferenceKey(page.key)} onGenerate={() => submitGeneration([page.key], page.key)} onOpen={openActiveItem} page={page} />)}<button className="body-book-add-page-card" disabled={busy} onClick={openContentPicker} type="button" aria-label="添加或编辑内容"><Plus size={36} /><span>添加内容</span></button>{!pages.length ? <p className="body-book-library-empty">点击“添加内容”选择要制作的页面。</p> : null}</div>
          <div className="body-book-content-panel-actions"><div className="body-book-content-panel-order-actions"><button className="draw-card-secondary" disabled={busy || !completedBookPreviewPages.length} onClick={openBookPreview} type="button"><Eye size={18} /><span>效果预览</span></button><button className="draw-card-secondary" disabled={busy || !project?.pages?.some((page) => page.status === "succeeded" && page.result?.imageUrl)} onClick={() => { void openBookShare(); }} type="button"><Share2 size={18} /><span>分享给好友</span></button><button className="draw-card-secondary" onClick={() => setShowBatchDialog(true)} type="button">{busy && !busyPageKey ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}<span>批量生成</span></button><button className="draw-card-secondary" disabled={busy} onClick={returnToBookHome} type="button"><ArrowLeft size={18} /><span>保存并返回</span></button><button className="draw-card-primary body-book-cart-add-button" disabled={busy} onClick={toggleCurrentBookCart} type="button"><span>{currentBookCartQuantity > 0 ? "已在购物车" : "加入购物车"}</span></button><button className="draw-card-secondary" onClick={() => window.location.assign("/book/cart")} type="button"><span>去结算</span></button></div></div>
        </section>
      </section>}

      {activeItem?.result?.imageUrl ? <div className="modal-backdrop body-book-lightbox" onClick={closeActiveItem} role="presentation"><section className="body-book-lightbox-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true"><button className="icon-button" onClick={closeActiveItem} type="button" aria-label="关闭预览"><X size={18} /></button><img alt={activeItem.title} src={getBodyBookThumbnail(activeItem)} /><div className="body-book-lightbox-meta"><strong>{activeItem.title}</strong><button className="draw-card-primary" onClick={() => { void downloadBookOriginal(activeItem); }} type="button"><Download size={17} /><span>下载原图</span></button></div></section></div> : null}
      {originalPreview ? <div className="modal-backdrop body-book-lightbox" onClick={() => setOriginalPreview(null)} role="presentation"><section className="body-book-lightbox-panel body-book-original-preview-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-label={`${originalPreview.title}原图`} aria-modal="true"><button className="icon-button" onClick={() => setOriginalPreview(null)} type="button" aria-label="关闭原图"><X size={18} /></button><img alt={originalPreview.title} onError={() => { setOriginalPreview(null); setError("加载认知书原图失败，请稍后再试。"); }} src={originalPreview.url} /><div className="body-book-lightbox-meta"><strong>{originalPreview.title}原图</strong><p className="body-book-lightbox-save-tip">请长按图片，选择“保存图片”到手机。</p></div></section></div> : null}
      {activeReferencePreview ? <div className="modal-backdrop body-book-lightbox" onClick={() => setActiveReferencePreview(null)} role="presentation"><section className="body-book-lightbox-panel body-book-reference-lightbox-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-label={`宝宝参考图 ${activeReferencePreview.index + 1} 大图预览`} aria-modal="true"><button className="icon-button" onClick={() => setActiveReferencePreview(null)} type="button" aria-label="关闭预览"><X size={18} /></button><img alt={`宝宝参考图 ${activeReferencePreview.index + 1} 大图`} src={activeReferencePreview.url} /><div className="body-book-lightbox-meta"><strong>宝宝参考图 {activeReferencePreview.index + 1}</strong></div></section></div> : null}
      {activePageReferencePage ? <div className="modal-backdrop body-book-page-reference-modal" onClick={() => setActivePageReferenceKey("")} role="presentation"><section className="body-book-project-modal body-book-page-reference-modal-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-label={`修改${activePageReferencePage.title}`} aria-modal="true"><button className="icon-button" disabled={busy || ["queued", "running"].includes(activePageReferencePage.status)} onClick={() => setActivePageReferenceKey("")} type="button" aria-label="关闭修改"><X size={18} /></button><p className="body-book-kicker">Edit page</p><h2>修改页面</h2><p>可分别修改本页参考图和提示词；提示词会在下次单张或批量生成本页时生效。</p><div className="body-book-page-reference-editor-list">{activePageReferenceUrls.map((referenceUrl, index) => <div className="body-book-page-reference-editor-item" key={`${referenceUrl}-${index}`}><img alt={`${activePageReferencePage.title} 参考图 ${index + 1}`} decoding="async" src={activePageReferenceThumbnailUrls[index] || referenceUrl} /><div><strong>参考图 {index + 1}</strong><label className="draw-card-secondary"><RefreshCw size={15} /><span>替换参考图</span><input accept="image/png,image/jpeg,image/webp" disabled={busy || ["queued", "running"].includes(activePageReferencePage.status)} onChange={(event) => { updatePageReference(activePageReferencePage, event.target.files?.[0] || null, index); event.target.value = ""; }} type="file" /></label></div><button aria-label={`删除第 ${index + 1} 张参考图`} className="body-book-page-reference-editor-remove icon-button" disabled={busy || ["queued", "running"].includes(activePageReferencePage.status)} onClick={() => removePageReference(activePageReferencePage, index)} title="删除参考图" type="button"><X size={16} /></button></div>)}{activePageReferenceUrls.length < referenceUploadLimit ? <label aria-label="增加参考图" className="body-book-page-reference-editor-add" title="增加参考图"><Plus size={24} /><span>增加参考图</span><input accept="image/png,image/jpeg,image/webp" disabled={busy || ["queued", "running"].includes(activePageReferencePage.status)} onChange={(event) => { updatePageReference(activePageReferencePage, event.target.files?.[0] || null); event.target.value = ""; }} type="file" /></label> : null}</div><label className="body-book-page-prompt-editor"><span>本页提示词</span><textarea disabled={busy || ["queued", "running"].includes(activePageReferencePage.status)} maxLength={6000} onChange={(event) => updatePagePrompt(activePageReferencePage.key, event.target.value)} value={pagePrompts[activePageReferencePage.key] ?? activePageReferencePage.prompt ?? ""} /></label></section></div> : null}

      {showContentPicker ? <div className="modal-backdrop" onClick={() => !busy && setShowContentPicker(false)} role="presentation"><section className="body-book-project-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="选择认知书内容"><button className="icon-button" disabled={busy} onClick={() => setShowContentPicker(false)} type="button"><X size={18} /></button><p className="body-book-kicker">Contents</p><h2>选择认知书内容</h2><p>封面为固定页；勾选或取消后会立即生效。</p><p className="body-book-selection-progress">{pickerSelectionProgressText}</p><div className="body-book-content-options">{selectableContents.map((content) => <label key={content.key}><input checked={pickerKeys.includes(content.key)} disabled={content.isRequired || busy} onChange={(event) => { void toggleContentSelection(content.key, event.target.checked); }} type="checkbox" /><span>{content.chinese} <small>{content.english}</small></span></label>)}</div><div className="draw-card-confirm-actions"><button className="draw-card-primary" disabled={busy} onClick={() => setShowContentPicker(false)} type="button">完成</button></div></section></div> : null}

      {showBatchDialog ? <div className="modal-backdrop" onClick={() => !busy && setShowBatchDialog(false)} role="presentation"><section className="body-book-project-modal body-book-batch-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="选择批量生成方式"><button className="icon-button" disabled={busy} onClick={() => setShowBatchDialog(false)} type="button"><X size={18} /></button><p className="body-book-kicker">Batch generate</p><h2>选择生成方式</h2><p>{pendingCount ? `${pendingCount} 张正在生成，将自动跳过。` : "选择本次要提交的页面。"}</p><button className="body-book-batch-choice" disabled={busy || !incompleteKeys.length} onClick={() => submitGeneration(incompleteKeys)} type="button"><strong>仅生成未完成页</strong><span>提交 {incompleteKeys.length} 张未生成或失败页面，成功图片不变。</span></button><button className="body-book-batch-choice" disabled={busy || !allAvailableKeys.length} onClick={() => submitGeneration(allAvailableKeys)} type="button"><strong>全部重新生成</strong><span>提交 {allAvailableKeys.length} 张非生成中页面，成功图片会被覆盖。</span></button></section></div> : null}

      {balanceAlert ? <BalanceInsufficientModal message={balanceAlert} onClose={() => setBalanceAlert("")} useBodyBookTheme /> : null}

      {historyTheme ? <div className="modal-backdrop" onClick={() => !busy && setHistoryTheme(null)} role="presentation"><section className="body-book-project-modal body-book-history-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="选择历史认知书工程"><button className="icon-button" disabled={busy} onClick={() => setHistoryTheme(null)} type="button"><X size={18} /></button><p className="body-book-kicker">Existing projects</p><h2>{historyTheme.name}已有历史工程</h2><p>请选择继续历史任务，或新建一本独立工程。</p><div className="body-book-history-list">{historyProjects.map((book) => <button key={book.sessionId} onClick={() => openProject(book.sessionId)} type="button">{book.thumbnail ? <img alt="工程缩略图" src={book.thumbnail} /> : <span className="body-book-history-placeholder">{book.theme?.name}</span>}<span><strong>{book.title}</strong><small>{formatBodyBookUpdatedAt(book.updatedAt || book.savedAt)}</small></span></button>)}</div><div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={busy} onClick={() => startNewDraft(historyTheme)} type="button">创建新的工程</button></div></section></div> : null}

      {showReferralModal ? <div className="modal-backdrop draw-card-confirm" onClick={() => setShowReferralModal(false)} role="presentation"><section className="draw-card-confirm-panel body-book-referral-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="邀请好友"><button className="icon-button" onClick={() => setShowReferralModal(false)} type="button"><X size={18} /></button><p className="draw-card-kicker">Invite friends</p><h2>邀请好友</h2><p>邀请新用户注册，即得 <strong>5 豆</strong>；好友每笔实付订单还可返你 <strong>20% 推荐金</strong>。</p>{referralUrl ? <><label className="body-book-wallet-field"><span>专属邀请链接</span><input readOnly value={referralUrl} /></label><button className="draw-card-primary" onClick={async () => { try { await copyText(referralUrl); setReferralNotice("邀请链接已复制，快去分享给新朋友吧。"); setReferralError(""); } catch (nextError) { setReferralError(nextError.message || "复制失败，请手动复制链接。"); } }} type="button"><Clipboard size={17} /><span>复制邀请链接</span></button></> : null}{referralNotice ? <p className="success-note">{referralNotice}</p> : null}{referralError ? <p className="error-note">{referralError}</p> : null}</section></div> : null}
      {showBeanInfo ? <div className="modal-backdrop draw-card-confirm" onClick={() => setShowBeanInfo(false)} role="presentation"><section className="draw-card-confirm-panel body-book-bean-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="我的豆豆"><button className="icon-button" onClick={() => setShowBeanInfo(false)} type="button"><X size={18} /></button><p className="draw-card-kicker">My beans</p><h2>我的豆豆</h2><p className="body-book-bean-balance">当前剩余 <strong>{visitorState ? visitorState.account?.beanBalance || 0 : "--"}</strong> 豆</p><p className="body-book-bean-cost-note">{billingEnabled ? "每张成功生成的图片消耗 1 个豆豆。" : "内测阶段，认知书暂不消耗豆豆。"}</p><ul className="body-book-bean-benefits"><li>购买单价：{formatCurrencyCents(orderConfig?.beanPurchaseUnitPriceCents || 100)} / 豆。</li><li>邀请新用户注册可获得 5 豆；好友每笔实付订单返 20% 推荐金。</li></ul><div className="body-book-wallet-actions"><button className="draw-card-primary" onClick={openBeanPurchase} type="button">购买豆豆</button><button className="draw-card-secondary" onClick={() => { setShowBeanInfo(false); openReferral(); }} type="button">邀请好友</button><button className="draw-card-secondary" onClick={() => { setShowBeanInfo(false); setShowContactModal(true); }} type="button">联系客服</button></div><label className="body-book-wallet-field"><span>兑换码</span><input disabled={busy} onChange={(event) => setInviteCode(event.target.value)} placeholder="输入兑换码" value={inviteCode} /></label><div className="body-book-wallet-actions"><button className="draw-card-primary" disabled={busy || !inviteCode.trim()} onClick={redeemBookInvite} type="button">兑换</button></div></section></div> : null}
      {showBeanPurchase ? <BeanPurchaseModal beanCount={beanPurchaseCount} busy={beanPurchaseBusy} error={beanPurchaseError} onClose={() => !beanPurchaseBusy && setShowBeanPurchase(false)} onCountChange={setBeanPurchaseCount} onRestart={restartBeanPurchase} onRetry={() => prepareBeanPurchase(beanPurchase?.id)} onSubmit={submitBeanPurchase} payment={beanPurchasePayment} purchase={beanPurchase} unitPriceCents={orderConfig?.beanPurchaseUnitPriceCents} /> : null}
      {showBookPreview ? <div className="modal-backdrop body-book-flip-preview-backdrop" onClick={() => setShowBookPreview(false)} role="presentation"><section className="body-book-project-modal body-book-flip-preview-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="认知书效果预览"><button className="icon-button" onClick={() => setShowBookPreview(false)} type="button" aria-label="关闭预览"><X size={18} /></button><p className="body-book-kicker">Book preview</p><h2>认知书效果预览</h2><p>仅展示当前已完成的页面；对应的内置预设页会自动插入。</p><BodyBookFlipBook ariaLabel="当前认知书翻页预览" pages={completedBookPreviewPages.map((page, index) => ({ id: page.key || String(index), isPreset: page.isBuiltIn === true, src: getBodyBookThumbnail(page), title: page.title || `第 ${index + 1} 页` }))} /><div className="draw-card-confirm-actions"><button className="draw-card-secondary" onClick={() => setShowBookPreview(false)} type="button">关闭</button><button className="draw-card-primary" disabled={bookShareBusy} onClick={() => { setShowBookPreview(false); void openBookShare(); }} type="button"><Share2 size={17} /><span>分享给好友</span></button></div></section></div> : null}
      {showBookShareModal ? <div className="modal-backdrop draw-card-confirm" onClick={() => !bookShareBusy && setShowBookShareModal(false)} role="presentation"><section className="draw-card-confirm-panel body-book-share-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="分享认知书"><button className="icon-button" disabled={bookShareBusy} onClick={() => setShowBookShareModal(false)} type="button"><X size={18} /></button><p className="draw-card-kicker">Share your book</p><h2>分享给好友</h2><p>好友可免登录查看压缩预览，不能修改或下载原图。首位新访客打开链接后，本工程即可下载全部原图。</p>{bookShareUrl ? <label className="body-book-wallet-field"><span>分享链接</span><input readOnly value={bookShareUrl} /></label> : null}{bookShareUrl ? <div className="draw-card-confirm-actions"><button className="draw-card-primary" disabled={bookShareBusy} onClick={async () => { try { await copyText(formatShareCopy(bookShareUrl, "book")); setBookShareNotice("链接已复制，可发送给好友。"); } catch (nextError) { setBookShareError(nextError.message || "复制失败，请手动复制链接。"); } }} type="button"><Clipboard size={17} /><span>复制链接</span></button><button className="draw-card-secondary" disabled={bookShareBusy} onClick={() => { if (window.confirm("停止分享后，已复制的链接将立即失效。确定停止分享吗？")) void closeBookShare(); }} type="button">停止分享</button></div> : null}{bookShareNotice ? <p className="success-note">{bookShareNotice}</p> : null}{bookShareError ? <p className="error-note">{bookShareError}</p> : null}</section></div> : null}
      {showBookOriginalUnlockPrompt ? <div className="modal-backdrop draw-card-confirm" onClick={() => !bookShareBusy && setShowBookOriginalUnlockPrompt(false)} role="presentation"><section className="draw-card-confirm-panel body-book-share-modal body-book-original-unlock-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="分享获得下载权限"><button className="icon-button" disabled={bookShareBusy} onClick={() => setShowBookOriginalUnlockPrompt(false)} type="button" aria-label="关闭弹窗"><X size={18} /></button><p className="draw-card-kicker">Original images</p><h2>分享获得下载权限</h2><ul className="body-book-bean-benefits body-book-original-unlock-rules"><li>分享给新用户，且新用户点击查看后，可获得本工程全部原图下载权限。</li><li>每购买 1 个币或豆豆，获得 1 次免分享下载权益；实体订单每实付满 1 元获得 1 次。</li><li>本站累计消费 20 元，获得永久下载权益。</li></ul>{bookShareBusy ? <p className="storage-note">正在生成分享链接…</p> : null}{bookShareUrl ? <><label className="body-book-wallet-field"><span>分享链接</span><input readOnly value={bookShareUrl} /></label><div className="draw-card-confirm-actions"><button className="draw-card-primary" onClick={async () => { try { await copyText(formatShareCopy(bookShareUrl, "book")); setBookShareNotice("分享链接已复制，可发送给好友。"); setBookShareError(""); } catch (nextError) { setBookShareError(nextError.message || "复制失败，请手动复制链接。"); } }} type="button"><Clipboard size={17} /><span>复制分享链接</span></button></div></> : null}{bookShareNotice ? <p className="success-note">{bookShareNotice}</p> : null}{bookShareError ? <p className="error-note">{bookShareError}</p> : null}</section></div> : null}
      {showBookCheckout ? <div className="modal-backdrop" onClick={() => !bookOrderBusy && setShowBookCheckout(false)} role="presentation"><section className="body-book-project-modal body-book-checkout-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="下单认知书实体书"><button className="icon-button" disabled={bookOrderBusy} onClick={() => setShowBookCheckout(false)} type="button"><X size={18} /></button><p className="body-book-kicker">Print your book</p><h2>{bookOrderBlockReason ? "暂时无法下单" : "下单认知书实体书"}</h2>{bookOrderBlockReason ? <><div className="body-book-checkout-blocked"><AlertTriangle size={24} /><p>{bookOrderBlockReason}</p></div><div className="draw-card-confirm-actions"><button className="draw-card-primary" onClick={() => setShowBookCheckout(false)} type="button">知道了</button></div></> : <><p>以下为将要印刷的全部页面，共 {bookPreviewPages.length} 页；成书时会自动插入对应的内置认知页，不含固定封底。</p><div className="body-book-checkout-preview" aria-label="成书预览">{bookPreviewPages.map((page, index) => <figure className="body-book-checkout-preview-item" key={`${page.key}-${index}`}><img alt={`${page.title} 成书预览`} decoding="async" loading="lazy" src={getBodyBookThumbnail(page)} /><figcaption><span>第 {index + 1} 页</span><strong>{page.title}</strong></figcaption></figure>)}</div><div className="draw-card-order-summary"><p>实体书 {formatCurrencyCents(bodyBookPricing.priceCents)}</p><p>邮费 {Number(bodyBookPricing.shippingFeeCents || 0) > 0 ? formatCurrencyCents(bodyBookPricing.shippingFeeCents) : "包邮"}</p><strong>实付 {formatCurrencyCents(bookOrderPayablePreviewCents)}</strong></div><div className="draw-card-order-form"><label className="field-label">收件人<input onChange={(event) => setBookOrderForm((current) => ({ ...current, receiverName: event.target.value }))} type="text" value={bookOrderForm.receiverName} /></label><label className="field-label">手机号<input onChange={(event) => setBookOrderForm((current) => ({ ...current, receiverPhone: event.target.value }))} type="tel" value={bookOrderForm.receiverPhone} /></label><label className="field-label">收货地址<input onChange={(event) => setBookOrderForm((current) => ({ ...current, address: event.target.value, addressDetail: event.target.value }))} type="text" value={bookOrderForm.address || bookOrderForm.addressDetail || ""} /></label><label className="field-label">备注<textarea onChange={(event) => setBookOrderForm((current) => ({ ...current, remark: event.target.value }))} rows="2" value={bookOrderForm.remark} /></label></div><div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={bookOrderBusy} onClick={() => setShowBookCheckout(false)} type="button">取消</button><button className="draw-card-primary" disabled={bookOrderBusy} onClick={submitBookOrder} type="button">{bookOrderBusy ? "创建订单中" : formatPaymentButtonLabel(bookOrderPayablePreviewCents)}</button></div></>}</section></div> : null}
      {showAuthModal ? <AuthModal description={pendingBookOriginalDownloadRef.current ? "下载认知书原图前，请先注册并登录。" : pendingBookShareRef.current ? "分享认知书前，请先注册并登录。" : ""} onAuthenticated={async () => { setShowAuthModal(false); const nextVisitorState = await fetchVisitorState(); setVisitorState(nextVisitorState); setBookOrderForm((current) => fillOrderAddressFromSaved(current, nextVisitorState?.account)); await loadSavedBooks(); if (pendingReferralRef.current) { pendingReferralRef.current = false; await showReferralDialog(); } if (pendingBookCheckoutRef.current) { pendingBookCheckoutRef.current = false; setShowBookCheckout(true); } if (pendingBeanPurchaseRef.current) { pendingBeanPurchaseRef.current = false; openBeanPurchase(); } if (pendingBookShareRef.current) { pendingBookShareRef.current = false; await createAndShareBookProject(); } const pendingDownload = pendingBookOriginalDownloadRef.current; pendingBookOriginalDownloadRef.current = null; if (pendingDownload) await downloadBookOriginal(pendingDownload.page, pendingDownload.projectId); }} onClose={() => { pendingReferralRef.current = false; pendingBookCheckoutRef.current = false; pendingBeanPurchaseRef.current = false; pendingBookShareRef.current = false; pendingBookOriginalDownloadRef.current = null; setShowAuthModal(false); }} reloadOnLogin={false} /> : null}
      {showContactModal ? <div className="modal-backdrop draw-card-confirm" onClick={() => setShowContactModal(false)} role="presentation"><section className="draw-card-confirm-panel draw-card-contact-panel body-book-contact-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="联系客服"><button className="icon-button" onClick={() => setShowContactModal(false)} type="button" aria-label="关闭弹窗"><X size={18} /></button><div className="draw-card-contact-copy"><h3>联系客服</h3><p>复制客服微信，返回微信添加</p><div className="draw-card-contact-id"><span>{getContactWechatId(orderConfig)}</span></div></div><div className="draw-card-confirm-actions"><button className="draw-card-primary" onClick={copyBookContactWechat} type="button"><Clipboard size={16} /><span>{contactCopied ? "已复制" : "复制微信号"}</span></button></div></section></div> : null}
      <footer className="body-book-page-footer"><a className="body-book-admin-entry" href="/admin" aria-label="进入后台管理">后台入口</a></footer>
    </main>
  );
}

function BodyBookProjectItem({ page, onOpen, onDownload, onEditReferences, onGenerate, onDelete, busy, busyPageKey }) {
  const pending = ["queued", "running"].includes(page.status);
  const succeeded = page.status === "succeeded" && page.result?.imageUrl;
  const working = busyPageKey === page.key;
  const handleGenerate = () => {
    if (succeeded && !window.confirm("重新生成将消耗 1 豆豆，是否继续？")) return;
    onGenerate();
  };
  return <article className={`body-book-item body-book-project-item ${pending ? "is-pending" : ""} ${page.status === "failed" ? "is-failed" : ""}`}>
    {!page.isBuiltIn && !page.isRequired ? <button className="body-book-project-delete icon-button" disabled={busy || pending} onClick={onDelete} title="删除页面" type="button"><X size={17} /></button> : null}
    {succeeded ? <button className="body-book-item-media" onClick={() => onOpen(page)} type="button"><img alt={page.title} decoding="async" loading="lazy" src={getBodyBookThumbnail(page)} /></button> : <div className="body-book-placeholder">{pending ? <LoaderCircle className="spin" size={24} /> : <AlertTriangle size={24} />}<strong>{pending ? "正在生成" : page.status === "failed" ? "生成失败" : "尚未生成"}</strong><span>{page.errorMessage || (pending ? "图片完成后会自动出现。" : "可单张生成或加入批量生成。")}</span></div>}
    <div className="body-book-item-meta"><div><strong>{page.title}</strong></div>{succeeded ? <button aria-label={`下载${page.title}原图`} className="icon-button" onClick={onDownload} title="下载原图" type="button"><Download size={17} /></button> : null}</div>
    {page.isBuiltIn ? <div className="body-book-project-card-controls"><span className="body-book-built-in-note">项目内置认知页 · 无需生成</span></div> : <div className="body-book-project-card-controls"><button className="draw-card-secondary" disabled={busy || pending} onClick={onEditReferences} type="button"><ImageUp size={16} /><span>修改</span></button><button className="draw-card-secondary" disabled={busy || pending} onClick={handleGenerate} type="button">{working ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}<span>{succeeded ? "单张重新生成" : "单张生成"}</span></button></div>}
  </article>;
}

function getBodyBookThemeContents(theme) {
  if (Array.isArray(theme?.contents) && theme.contents.length) return theme.contents;
  return [{ key: "cover", chinese: "封面", english: "Cover", title: "封面 Cover", order: 0 }];
}

function getBodyBookThemeGenerationCost(theme) {
  const fromServer = Number(theme?.generationPageCount);
  if (Number.isInteger(fromServer) && fromServer > 0) return fromServer;
  return ["color", "body", "transport", "animal"].includes(getBodyBookBaseThemeId(theme)) ? 9 : 17;
}

function getBodyBookBaseThemeId(theme) {
  const id = String(theme?.baseThemeId || theme?.id || "").toLowerCase();
  return id.endsWith("-cartoon") ? id.slice(0, -"-cartoon".length) : id;
}

function isBodyBookCartoonTheme(theme) {
  return ["flat-cartoon", "animated-3d-cartoon"].includes(theme?.visualVariant) || String(theme?.id || "").toLowerCase().endsWith("-cartoon");
}

function getBodyBookThemePreviewSrc(theme, showcasePayload = null) {
  const showcaseTheme = showcasePayload?.themes?.find((item) => String(item?.themeId || "") === String(theme?.id || ""));
  const showcaseCover = showcaseTheme?.pages
    ?.slice()
    .sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0))
    .find((page) => page?.key === "cover" && page?.status === "succeeded" && String(page?.src || "").startsWith("/generated-previews/"));
  if (showcaseCover?.src) return showcaseCover.src;
  if (isBodyBookCartoonTheme(theme)) return BODY_BOOK_CARTOON_EFFECT_SAMPLES[getBodyBookBaseThemeId(theme)]?.[0]?.src || "/body-book-samples/cartoon-effects/body-cover.webp";
  if (theme?.id === "kindergarten") return "/body-book-samples/effects/kindergarten-cover-thumbnail.webp";
  return `/body-book-samples/${encodeURIComponent(getBodyBookBaseThemeId(theme))}-cover-thumbnail.webp`;
}

function orderBodyBookThemes(themes) {
  const items = Array.isArray(themes) ? themes : [];
  const regularThemes = items.filter((theme) => !isBodyBookCartoonTheme(theme) && getBodyBookBaseThemeId(theme) !== "kindergarten");
  const cartoonsByBaseTheme = new Map(items.filter((theme) => isBodyBookCartoonTheme(theme)).map((theme) => [getBodyBookBaseThemeId(theme), theme]));
  const pairedThemes = regularThemes.flatMap((theme) => [theme, cartoonsByBaseTheme.get(getBodyBookBaseThemeId(theme))].filter(Boolean));
  const kindergartenThemes = items.filter((theme) => getBodyBookBaseThemeId(theme) === "kindergarten");
  const includedThemeIds = new Set([...pairedThemes, ...kindergartenThemes].map((theme) => theme.id));
  return [...pairedThemes, ...kindergartenThemes, ...items.filter((theme) => !includedThemeIds.has(theme.id))];
}

const BODY_BOOK_THEME_CATEGORY_META = {
  realistic: { title: "写实认知书", description: "高度保留宝宝真实照片特征，但对参考图要求高，可能需多次生图尝试以获更好效果。" },
  cartoon: { title: "卡通认知书", description: "提炼宝宝的关键特征，变成卡通电影风格，效果更稳定。" },
  picturebook: { title: "手绘绘本", description: "以连续故事和手绘叙事，陪孩子探索新的成长体验。" }
};

function getBodyBookThemeCategory(theme) {
  if (theme?.themeCategory && BODY_BOOK_THEME_CATEGORY_META[theme.themeCategory]) return theme.themeCategory;
  if (isBodyBookCartoonTheme(theme)) return "cartoon";
  return getBodyBookBaseThemeId(theme) === "kindergarten" ? "picturebook" : "realistic";
}

function getBodyBookReferenceUploadLimit(theme) {
  return ["cartoon", "picturebook"].includes(getBodyBookThemeCategory(theme)) ? 1 : 3;
}

function getBodyBookThemeGroups(themes) {
  const orderedThemes = orderBodyBookThemes(themes);
  let themeIndex = 0;
  return Object.keys(BODY_BOOK_THEME_CATEGORY_META).map((category) => {
    const items = orderedThemes
      .filter((theme) => getBodyBookThemeCategory(theme) === category)
      .map((theme) => ({ theme, index: ++themeIndex }));
    return { id: category, ...BODY_BOOK_THEME_CATEGORY_META[category], items };
  }).filter((group) => group.items.length);
}

function BodyBookThemePager({ busy, groups, onSelectTheme, priceCents = 0, discountCents = 0, showcasePayload = null }) {
  const [activeCategory, setActiveCategory] = useState("cartoon");
  const [slideDirection, setSlideDirection] = useState("");
  const touchStartRef = useRef(null);
  const pagerRef = useRef(null);
  const shouldRevealThemeCardRef = useRef(false);
  const activeIndex = Math.max(0, groups.findIndex((group) => group.id === activeCategory));
  const activeGroup = groups[activeIndex];

  useEffect(() => {
    if (groups.some((group) => group.id === activeCategory)) return;
    setActiveCategory(groups[0]?.id || "cartoon");
  }, [activeCategory, groups]);

  useEffect(() => {
    if (!shouldRevealThemeCardRef.current) return undefined;
    shouldRevealThemeCardRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      const cards = Array.from(pagerRef.current?.querySelectorAll(".body-book-theme-card") || []);
      const viewportTop = 16;
      const viewportBottom = window.innerHeight - 16;
      const hasCompleteCard = cards.some((card) => {
        const rect = card.getBoundingClientRect();
        return rect.top >= viewportTop && rect.bottom <= viewportBottom;
      });
      if (hasCompleteCard) return;

      const firstVisibleCard = cards.find((card) => card.getBoundingClientRect().bottom > viewportTop);
      const card = firstVisibleCard || cards[0];
      if (!card) return;
      const rect = card.getBoundingClientRect();
      if (rect.top < viewportTop) {
        window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - viewportTop), left: 0, behavior: "auto" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCategory]);

  function selectCategory(categoryId) {
    if (!groups.some((group) => group.id === categoryId) || categoryId === activeCategory) return;
    const nextIndex = groups.findIndex((group) => group.id === categoryId);
    setSlideDirection(nextIndex > activeIndex ? "from-right" : "from-left");
    shouldRevealThemeCardRef.current = true;
    setActiveCategory(categoryId);
  }

  function moveToCategory(index) {
    const nextGroup = groups[index];
    if (nextGroup) selectCategory(nextGroup.id);
  }

  function handleTouchStart(event) {
    const touch = event.touches?.[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event) {
    const start = touchStartRef.current;
    const touch = event.changedTouches?.[0];
    touchStartRef.current = null;
    if (!start || !touch) return;
    const horizontalDistance = touch.clientX - start.x;
    const verticalDistance = touch.clientY - start.y;
    if (Math.abs(horizontalDistance) < 48 || Math.abs(horizontalDistance) <= Math.abs(verticalDistance)) return;

    // Keep the gesture aligned with the tab order: swipe left for the tab on
    // the right, and swipe right for the tab on the left.
    moveToCategory(activeIndex + (horizontalDistance < 0 ? 1 : -1));
  }

  if (!activeGroup) return null;

  return <div className="body-book-theme-pager" ref={pagerRef}>
    <div aria-label="认知书类型" className="body-book-theme-tabs" role="tablist">
      {groups.map((group) => <button aria-controls={`body-book-theme-panel-${group.id}`} aria-selected={group.id === activeGroup.id} className={group.id === activeGroup.id ? "is-active" : ""} key={group.id} onClick={() => selectCategory(group.id)} role="tab" type="button">{group.title}</button>)}
    </div>
    <div className="body-book-theme-viewport" onTouchEnd={handleTouchEnd} onTouchStart={handleTouchStart}>
      <section className={`body-book-theme-group body-book-theme-screen body-book-theme-screen-${activeGroup.id}${slideDirection ? ` slide-${slideDirection}` : ""}`} id={`body-book-theme-panel-${activeGroup.id}`} key={activeGroup.id} role="tabpanel">
        <div className="body-book-theme-group-head"><span>{activeGroup.title}</span><p>{activeGroup.description}</p></div>
        <div className="body-book-theme-grid">{activeGroup.items.map(({ theme, index }) => <button className="body-book-theme-card" disabled={busy} key={theme.id} onClick={() => onSelectTheme(theme)} type="button"><img alt={`${theme.name} 例图`} className="body-book-theme-preview" decoding="async" loading={index > 3 ? "lazy" : "eager"} src={getBodyBookThemePreviewSrc(theme, showcasePayload)} /><span className="body-book-theme-index">{String(index).padStart(2, "0")}</span><strong>{theme.name}</strong><small>{theme.englishName}</small><em>预计消耗 {getBodyBookThemeGenerationCost(theme)} 豆</em>{priceCents > 0 ? <span className="body-book-theme-price">{discountCents > 0 ? <><del>￥{(priceCents / 100).toFixed(2)}</del><b>￥{((priceCents - discountCents) / 100).toFixed(2)}</b></> : <b>￥{(priceCents / 100).toFixed(2)}</b>}</span> : null}</button>)}</div>
      </section>
    </div>
    <div aria-label={`当前为${activeGroup.title}，第${activeIndex + 1}类，共${groups.length}类`} className="body-book-theme-pagination">
      {groups.map((group) => <button aria-label={`切换到${group.title}`} className={group.id === activeGroup.id ? "is-active" : ""} key={group.id} onClick={() => selectCategory(group.id)} type="button" />)}
    </div>
  </div>;
}

function getBodyBookThemeEffectSamples(theme, showcasePayload = null) {
  const showcaseTheme = showcasePayload?.themes?.find((item) => String(item?.themeId || "") === String(theme?.id || ""));
  if (showcaseTheme?.pages?.length) {
    return [...showcaseTheme.pages]
      .sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0))
      .map((page) => ({
        label: page.title || `第 ${Number(page.order || 0) + 1} 页`,
        src: String(page.src || "").startsWith("/generated-images/") ? "" : page.src || "",
        type: page.type || "baby",
        status: page.status || "queued",
        jobId: page.jobId || ""
      }));
  }
  if (isBodyBookCartoonTheme(theme)) {
    return BODY_BOOK_CARTOON_EFFECT_SAMPLES[getBodyBookBaseThemeId(theme)] || [];
  }
  return BODY_BOOK_THEME_EFFECT_SAMPLES[String(theme?.id || "")] || [];
}

const BodyBookFlipPage = React.forwardRef(function BodyBookFlipPage({ page, index }, ref) {
  // The printed book uses board pages throughout, so every page must use the
  // rigid-card flip animation rather than a curled paper animation.
  return <article className="body-book-flip-page" data-density="hard" ref={ref}>
    <div className="body-book-flip-page-inner">
      {page.src ? <img alt={page.title || `认知书第 ${index + 1} 页`} decoding="async" loading={index < 3 ? "eager" : "lazy"} src={page.src} /> : <div className="body-book-flip-page-placeholder"><LoaderCircle className="spin" size={24} /><span>正在加载书页…</span></div>}
    </div>
  </article>;
});

function BodyBookFlipBook({ pages, ariaLabel = "认知书翻页预览" }) {
  const bookRef = useRef(null);
  const stageRef = useRef(null);
  const landscapeTouchStartRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [landscapeMode, setLandscapeMode] = useState(false);
  const [viewportSize, setViewportSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const [stageWidth, setStageWidth] = useState(0);
  const safePages = (pages || []).filter((page) => String(page?.src || "").trim());
  const pageCount = safePages.length;

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setPrefersReducedMotion(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsCompactViewport(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const sync = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const sync = () => setStageWidth(Math.round(stage.getBoundingClientRect().width));
    sync();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(sync);
    observer?.observe(stage);
    window.addEventListener("resize", sync);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [pageCount]);

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, Math.max(0, pageCount - 1)));
  }, [pageCount]);

  const turnPage = useCallback((direction) => {
    const pageFlip = bookRef.current?.pageFlip?.();
    if (!pageFlip) return;
    if (direction === "previous") {
      if (prefersReducedMotion) pageFlip.turnToPrevPage();
      else pageFlip.flipPrev("bottom");
      return;
    }
    if (prefersReducedMotion) pageFlip.turnToNextPage();
    else pageFlip.flipNext("bottom");
  }, [prefersReducedMotion]);

  const toggleLandscapeMode = useCallback(() => {
    if (landscapeMode) {
      if (window.history.state?.bodyBookFlipLandscape) window.history.back();
      else setLandscapeMode(false);
      return;
    }
    const currentState = window.history.state || {};
    window.history.replaceState({ ...currentState, bodyBookFlipLandscape: false }, "", window.location.href);
    window.history.pushState({ ...currentState, bodyBookFlipLandscape: true }, "", window.location.href);
    setLandscapeMode(true);
  }, [landscapeMode]);

  useEffect(() => {
    const handleLandscapeHistory = (event) => {
      setLandscapeMode(Boolean(event.state?.bodyBookFlipLandscape));
    };
    window.addEventListener("popstate", handleLandscapeHistory);
    return () => window.removeEventListener("popstate", handleLandscapeHistory);
  }, []);

  const handleLandscapeTouchStart = useCallback((event) => {
    if (!landscapeMode) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    landscapeTouchStartRef.current = { x: touch.clientX, y: touch.clientY };
    // The displayed book has been rotated, so its native horizontal gesture
    // must not compete with the rotated vertical gesture below.
    event.stopPropagation();
  }, [landscapeMode]);

  const handleLandscapeTouchMove = useCallback((event) => {
    if (!landscapeMode || !landscapeTouchStartRef.current) return;
    event.stopPropagation();
  }, [landscapeMode]);

  const handleLandscapeTouchEnd = useCallback((event) => {
    if (!landscapeMode) return;
    const start = landscapeTouchStartRef.current;
    landscapeTouchStartRef.current = null;
    event.stopPropagation();
    const touch = event.changedTouches?.[0];
    if (!start || !touch) return;
    const deltaY = touch.clientY - start.y;
    const deltaX = touch.clientX - start.x;
    // A clockwise-rotated book advances by swiping toward the top of the
    // upright phone screen, and returns by swiping toward the bottom.
    if (Math.abs(deltaY) < 42 || Math.abs(deltaY) <= Math.abs(deltaX)) return;
    if (deltaY < 0 && currentPage < pageCount - 1) turnPage("next");
    if (deltaY > 0 && currentPage > 0) turnPage("previous");
  }, [currentPage, landscapeMode, pageCount, turnPage]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (["INPUT", "TEXTAREA", "SELECT"].includes(String(event.target?.tagName || ""))) return;
      if (event.key === "ArrowLeft" && currentPage > 0) {
        event.preventDefault();
        turnPage("previous");
      }
      if (event.key === "ArrowRight" && currentPage < pageCount - 1) {
        event.preventDefault();
        turnPage("next");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentPage, pageCount, turnPage]);

  if (!pageCount) return <div className="body-book-flip-empty">暂时没有可预览的书页。</div>;

  // In virtual landscape mode the book is rotated inside the page rather than
  // asking the browser to rotate.  Size it from the phone's longer axis so a
  // two-page spread is genuinely larger instead of rotating a tiny portrait
  // book inside the same box.
  const landscapePageSize = Math.max(160, Math.floor(Math.min(
    Math.max(160, viewportSize.width - 32),
    Math.max(160, (viewportSize.height - 132) / 2)
  )));
  // The share page and the preview dialog both add horizontal padding around
  // the stage.  Use the stage's measured width (rather than the full viewport)
  // so the two-page spread never extends past the clipping boundary on phones.
  const portraitSpreadWidth = Math.max(240, (stageWidth || Math.max(240, viewportSize.width - 96)) - 20);
  const portraitPageSize = Math.max(120, Math.floor(Math.min(220, portraitSpreadWidth / 2)));
  const compactPageSize = landscapeMode ? landscapePageSize : portraitPageSize;
  const pageMinSize = isCompactViewport ? compactPageSize : 260;
  const landscapeBookStyle = landscapeMode ? { "--body-book-landscape-page-size": `${compactPageSize}px` } : undefined;
  const portraitStageStyle = isCompactViewport && !landscapeMode
    ? { minHeight: `${compactPageSize + 24}px`, padding: "8px" }
    : undefined;

  return <section aria-label={ariaLabel} className={`body-book-flip-reader${landscapeMode ? " is-landscape-mode" : ""}`}>
    <div className="body-book-flip-stage" onTouchCancelCapture={() => { landscapeTouchStartRef.current = null; }} onTouchEndCapture={handleLandscapeTouchEnd} onTouchMoveCapture={handleLandscapeTouchMove} onTouchStartCapture={handleLandscapeTouchStart} ref={stageRef} style={portraitStageStyle}>
      <div className="body-book-flip-rotator" style={landscapeBookStyle}>
      <HTMLFlipBook
        /* react-pageflip only reads its dimensions on initialization.  The key
           deliberately remounts it when switching the virtual orientation. */
        autoSize={!(isCompactViewport && landscapeMode)}
        className="body-book-flip-book"
        clickEventForward={false}
        disableFlipByClick={false}
        drawShadow={!prefersReducedMotion}
        flippingTime={prefersReducedMotion ? 1 : 620}
        height={isCompactViewport ? compactPageSize : 360}
        maxHeight={440}
        maxShadowOpacity={0.28}
        maxWidth={440}
        minHeight={pageMinSize}
        minWidth={pageMinSize}
        mobileScrollSupport={true}
        onFlip={(event) => setCurrentPage(Number(event.data || 0))}
        key={`${isCompactViewport ? "compact" : "desktop"}-${landscapeMode ? "landscape" : "portrait"}-${compactPageSize}`}
        ref={bookRef}
        showCover={true}
        showPageCorners={!prefersReducedMotion}
        size={isCompactViewport ? "fixed" : "stretch"}
        startPage={currentPage}
        startZIndex={1}
        swipeDistance={30}
        useMouseEvents={true}
        usePortrait={false}
        width={isCompactViewport ? compactPageSize : 360}
      >
        {safePages.map((page, index) => <BodyBookFlipPage index={index} key={page.id || `${page.src}-${index}`} page={page} />)}
      </HTMLFlipBook>
      </div>
    </div>
    <div className="body-book-flip-controls">
      <button aria-label="上一页" className="draw-card-secondary body-book-flip-control" disabled={currentPage <= 0} onClick={() => turnPage("previous")} type="button"><ArrowLeft size={17} /><span>上一页</span></button>
      <span aria-live="polite" className="body-book-flip-progress">第 {currentPage + 1} / {pageCount} 页</span>
      <button aria-label="下一页" className="draw-card-secondary body-book-flip-control" disabled={currentPage >= pageCount - 1} onClick={() => turnPage("next")} type="button"><span>下一页</span><ArrowRight size={17} /></button>
      {isCompactViewport || landscapeMode ? <button aria-pressed={landscapeMode} className="draw-card-secondary body-book-flip-orientation" onClick={toggleLandscapeMode} type="button">{landscapeMode ? "返回" : "横屏查看"}</button> : null}
    </div>
  </section>;
}

function BodyBookThemeEffectPreview({ theme, busy, onBack, onStart, showcasePayload }) {
  const showcaseTheme = showcasePayload?.themes?.find((item) => String(item?.themeId || "") === String(theme?.id || ""));
  const showcasePages = getBodyBookThemeEffectSamples(theme, showcasePayload);
  const hasShowcase = Boolean(showcasePayload?.batch?.batchId && showcaseTheme);
  const showcaseReady = hasShowcase && showcasePages.length > 0 && showcasePages.every((page) => page.status === "succeeded" && page.src);
  const pages = showcaseReady || !hasShowcase ? showcasePages : [];
  const hasPresetPage = pages.some((page) => page.type === "preset");
  const isKindergartenTheme = theme?.id === "kindergarten";
  const generationCost = getBodyBookThemeGenerationCost(theme);
  const progress = showcasePayload?.batch || { succeeded: 0, failed: 0, remaining: 0 };
  return <section className="body-book-theme-effect" aria-label={`${theme.name} 效果预览`}>
    <div className="body-book-theme-effect-head">
      <div><p className="body-book-kicker">Book preview</p><h2>{theme.name}</h2><p>{theme.englishName} · 成书效果预览</p></div>
      <span className="body-book-theme-effect-cost">预计消耗 {generationCost} 豆</span>
    </div>
    <div className="body-book-theme-effect-copy"><strong>先看成书效果</strong><p>{isKindergartenTheme ? "上传孩子照片并填写昵称后，将生成一整天连续叙事的专属入园适应绘本。" : hasPresetPage ? "封面和专属认知页将根据上传照片生成；对应的内置认知页会自动插入成书与订单 ZIP。" : "上传照片后，将生成同一风格的封面和专属认知内页，做成一本专属认知书。"}</p></div>
    {hasShowcase && !showcaseReady ? <div className="body-book-flip-empty" role="status"><LoaderCircle className="spin" size={24} /><span>样书准备中（成功 {progress.succeeded} 张 · 失败 {progress.failed} 张 · 剩余 {progress.remaining} 张）</span></div> : <BodyBookFlipBook ariaLabel={`${theme.name}成书效果预览`} pages={pages.map((page, index) => ({ id: page.jobId || page.src || page.label || String(index), isPreset: page.type === "preset", src: page.src, title: `${theme.name}${page.label || `第 ${index + 1} 页`}` }))} />}
    <div className="body-book-theme-effect-actions"><button className="draw-card-primary" disabled={busy} onClick={onStart} type="button"><Sparkles size={18} /><span>{busy ? "准备中" : "开始制作"}</span></button></div>
  </section>;
}

function isValidBodyBookReference(file) {
  return ["image/jpeg", "image/png", "image/webp"].includes(String(file?.type || ""));
}

function formatBodyBookUpdatedAt(value) {
  if (!value) return "刚刚制作";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "已制作" : `最近制作于 ${date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

function selectBodyBookPagePrompts(prompts, keys, dirtyKeys = []) {
  const dirty = new Set(dirtyKeys || []);
  return Object.fromEntries((keys || []).filter((key) => dirty.has(key)).map((key) => [key, String(prompts?.[key] || "")]).filter(([, prompt]) => prompt.trim()));
}

function FridgeMagnetOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [coinPurchases, setCoinPurchases] = useState([]);
  const [orderConfig, setOrderConfig] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deletingOrderId, setDeletingOrderId] = useState("");

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    Promise.all([fetchMyOrders("fridge"), fetchMyCoinPurchases()])
      .then(([ordersPayload, purchasesPayload]) => {
        if (!isActive) return;
        setOrders(ordersPayload.orders || []);
        setCoinPurchases(purchasesPayload.purchases || []);
        setOrderConfig(ordersPayload.config || null);
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

  const listItems = [
    ...orders.map((order) => ({ type: "fridge_order", record: order, createdAt: order.createdAt })),
    ...coinPurchases.map((purchase) => ({ type: "coin_purchase", record: purchase, createdAt: purchase.createdAt }))
  ].sort((left, right) => Date.parse(String(right.createdAt || "")) - Date.parse(String(left.createdAt || "")));

  async function handleDeleteOrder(order) {
    if (!order?.id) return;
    const canRemove = ["expired", "cancelled"].includes(order.orderStatus);
    const confirmation = canRemove
      ? `确定删除订单 ${order.orderNo} 吗？删除后将不再显示在“我的订单”中。`
      : `确定取消订单 ${order.orderNo} 吗？取消后订单状态会显示为“已取消”。`;
    if (!window.confirm(confirmation)) return;
    setDeletingOrderId(order.id);
    setError("");
    try {
      const deleted = await deleteMyOrder(order.id, order.publicToken);
      setOrders((current) => canRemove ? current.filter((item) => item.id !== order.id) : current.map((item) => (item.id === order.id ? deleted : item)));
      syncLatestManualOrder(deleted, orderConfig, deleted.publicToken || order.publicToken || "");
      if (readLatestManualOrder()?.orderId === order.id) {
        clearLatestManualOrder();
      }
    } catch (nextError) {
      setError(nextError.message || (canRemove ? "删除订单失败。" : "取消订单失败。"));
    } finally {
      setDeletingOrderId("");
    }
  }

  return (
    <main className="draw-card-shell theme-draw-card draw-card-orders-page">
      <section className="draw-card-stage draw-card-orders-stage">
        <div className="draw-card-orders-head">
          <div>
            <p className="draw-card-kicker">My orders</p>
            <h1 className="draw-card-title">我的订单</h1>
            <p className="draw-card-subtitle">查看你的冰箱贴订单、购买币记录与处理状态。</p>
          </div>
          <button className="draw-card-secondary" onClick={() => window.location.assign("/")} type="button">
            <Home size={18} />
            <span>返回主页</span>
          </button>
        </div>
        {isLoading ? <p className="draw-card-orders-note">正在读取订单列表…</p> : null}
        {error ? <p className="error-note">{error}</p> : null}
        {!isLoading && !error && !listItems.length ? <p className="draw-card-orders-empty">你还没有冰箱贴订单或购买币记录。</p> : null}
        <div className="draw-card-orders-list">
          {listItems.map((item) => {
            if (item.type === "coin_purchase") {
              const purchase = item.record;
              const status = getBeanPurchaseListStatus(purchase);
              return (
                <article className="draw-card-order-list-card draw-card-coin-purchase-card" key={`coin-purchase:${purchase.id}`}>
                  <div className="draw-card-order-list-open">
                    <span className="draw-card-order-list-cover draw-card-coin-purchase-cover">币</span>
                    <span className="draw-card-order-list-summary">
                      <strong>购买 {purchase.coinCount} 币</strong>
                      <small>{formatCurrencyCents(Number(purchase.amountCents || 0))}</small>
                      <em className={`task-status ${getBeanPurchaseListTone(status)}`}>{getBeanPurchaseListStatusLabel(purchase, status)}</em>
                    </span>
                  </div>
                </article>
              );
            }

            const order = item.record;
            const isManualUnpaid = order.orderStatus === "pending_payment" && isManualPaymentOrder(order, orderConfig);
            const canRemove = ["expired", "cancelled"].includes(order.orderStatus);
            const canCancel = order.orderStatus === "pending_payment";
            const cover = [...(order.items || [])].sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))[0];
            return (
              <article className="draw-card-order-list-card" key={order.id}>
                <button className="draw-card-order-list-open" onClick={() => window.location.assign(buildOrderDetailUrl(order.id, order.publicToken, order.experienceType))} type="button">
                  <span className="draw-card-order-list-cover">
                    {cover?.thumbnailUrl || cover?.imageUrl ? <img alt="订单冰箱贴缩略图" src={cover.thumbnailUrl || cover.imageUrl} /> : <span>冰箱贴</span>}
                  </span>
                  <span className="draw-card-order-list-summary">
                    <strong>{formatCurrencyCents(Number(order.payableCents ?? order.totalCents ?? 0))}</strong>
                    <small>{`订单号 ${order.orderNo}`}</small>
                    <em className={`task-status ${orderStatusTone(order.orderStatus)}`}>{getOrderPrimaryStatusLabel(order)}</em>
                  </span>
                </button>
                <div className="draw-card-order-list-actions">
                  {isManualUnpaid ? <span>待付款</span> : null}
                  <button className="draw-card-secondary" onClick={() => window.location.assign(buildOrderDetailUrl(order.id, order.publicToken, order.experienceType))} type="button">
                    <Eye size={17} />
                    <span>查看详情</span>
                  </button>
                  {canRemove || canCancel ? (
                    <button className="draw-card-order-delete" disabled={deletingOrderId === order.id} onClick={() => handleDeleteOrder(order)} type="button">
                      <Trash2 size={18} />
                      <span>{deletingOrderId === order.id ? (canRemove ? "删除中" : "取消中") : (canRemove ? "删除" : "取消订单")}</span>
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

function BodyBookCartPage() {
  const [books, setBooks] = useState([]);
  const [account, setAccount] = useState(null);
  const [orderConfig, setOrderConfig] = useState(null);
  const [redemptionEntitlements, setRedemptionEntitlements] = useState({ bodyBookPrintCount: 0 });
  const [cart, setCart] = useState({});
  const [orderForm, setOrderForm] = useState(DEFAULT_ORDER_ADDRESS);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showAuthModal, setShowAuthModal] = useState(false);

  const loadCartPage = useCallback(async () => {
    const [config, visitor] = await Promise.all([fetchOrderConfig(), fetchVisitorState()]);
    const nextAccount = visitor?.account || null;
    if (!nextAccount?.isRegistered) {
      setBooks([]);
      setOrderConfig(config || null);
      setAccount(nextAccount);
      setRedemptionEntitlements(visitor?.redemptionEntitlements || { bodyBookPrintCount: 0 });
      setCart({});
      return;
    }
    const projectsPayload = await fetchBodyBookProjects();
    const projectList = projectsPayload?.projects || [];
    const savedCart = readBodyBookCart(nextAccount);
    const validProjectIds = new Set(projectList.filter((book) => getBodyBookCartEligibility(book).eligible).map((book) => String(book?.sessionId || book?.projectId || "")));
    const nextCart = Object.fromEntries(Object.entries(savedCart).filter(([projectId]) => validProjectIds.has(projectId)));
    saveBodyBookCart(nextAccount, nextCart);
    setBooks(projectList);
    setOrderConfig(config || null);
    setAccount(nextAccount);
    setRedemptionEntitlements(visitor?.redemptionEntitlements || { bodyBookPrintCount: 0 });
    setOrderForm((current) => fillOrderAddressFromSaved(current, nextAccount));
    setCart(nextCart);
  }, []);

  useEffect(() => {
    let active = true;
    loadCartPage()
      .then(() => { if (active) setError(""); })
      .catch((nextError) => { if (active) setError(nextError.message || "读取购物车失败，请稍后再试。"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, [loadCartPage]);

  const eligibleBooks = useMemo(() => books.map((book) => ({ book, eligibility: getBodyBookCartEligibility(book) })), [books]);
  const cartItems = useMemo(() => eligibleBooks
    .map(({ book, eligibility }) => ({ book, eligibility, projectId: String(book?.sessionId || book?.projectId || ""), quantity: Math.max(0, Number(cart[String(book?.sessionId || book?.projectId || "")] || 0)) }))
    .filter((item) => item.eligibility.eligible && item.quantity > 0 && item.projectId), [eligibleBooks, cart]);
  const totalQuantity = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const bodyBookPricing = orderConfig?.bodyBook || {};
  const unitPriceCents = Math.max(0, Number(bodyBookPricing.priceCents || 0));
  const shippingFeeCents = totalQuantity > 0 ? Math.max(0, Number(bodyBookPricing.shippingFeeCents || 0)) : 0;
  const subtotalCents = unitPriceCents * totalQuantity;
  const redemptionBookCount = Math.min(totalQuantity, Math.max(0, Number(redemptionEntitlements.bodyBookPrintCount || 0)));
  const redemptionDiscountCents = redemptionBookCount * unitPriceCents + (totalQuantity > 0 && redemptionBookCount === totalQuantity ? shippingFeeCents : 0);
  const payableCents = Math.max(0, subtotalCents + shippingFeeCents - redemptionDiscountCents);

  function persistCart(nextCart) {
    setCart(nextCart);
    saveBodyBookCart(account, nextCart);
  }

  function setBookQuantity(book, nextQuantity) {
    const projectId = String(book?.sessionId || book?.projectId || "");
    const eligibility = getBodyBookCartEligibility(book);
    if (!projectId || !eligibility.eligible) return;
    const requestedQuantity = Math.max(0, Math.trunc(Number(nextQuantity || 0)));
    const currentQuantity = Math.max(0, Number(cart[projectId] || 0));
    const otherQuantity = Object.entries(cart).reduce((sum, [id, quantity]) => id === projectId ? sum : sum + Math.max(0, Number(quantity || 0)), 0);
    if (requestedQuantity + otherQuantity > MAX_BODY_BOOK_CART_QUANTITY) {
      window.alert("购物车最多可加入 20 本认知书。");
      return;
    }
    const nextCart = { ...cart };
    if (requestedQuantity) nextCart[projectId] = requestedQuantity;
    else delete nextCart[projectId];
    if (requestedQuantity === currentQuantity) return;
    persistCart(nextCart);
  }

  function toggleBook(book) {
    const projectId = String(book?.sessionId || book?.projectId || "");
    const quantity = Math.max(0, Number(cart[projectId] || 0));
    setBookQuantity(book, quantity > 0 ? 0 : 1);
  }

  async function submitOrder() {
    if (!totalQuantity || isSubmitting) return;
    if (!account?.isRegistered) {
      setShowAuthModal(true);
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const created = await createOrderRequest({
        experienceType: "body-book",
        bodyBookItems: cartItems.map((item) => ({ projectId: item.projectId, quantity: item.quantity })),
        ...orderForm
      });
      saveOrderAddress(account, orderForm);
      window.location.assign(buildOrderDetailUrl(created.order.id, created.order.publicToken, "body-book"));
    } catch (nextError) {
      setError(nextError.message || "创建认知书订单失败，请稍后重试。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main className="body-book-page">
    <section className="body-book-cart-page">
      <div className="body-book-order-list-head">
        <div><p className="body-book-kicker">Shopping cart</p><h1>选书加购</h1><p>选择要印刷的认知书，统一结算与发货。</p></div>
      </div>
      {isLoading ? <p className="body-book-library-empty">正在读取你的认知书…</p> : null}
      {error ? <p className="error-note">{error}</p> : null}
      {!isLoading && !error ? <>
        {!account?.isRegistered ? <section className="body-book-cart-checkout"><div className="draw-card-order-summary"><h2>登录后查看购物车</h2><p>登录后可查看已保存的认知书并统一结算。</p></div><div className="draw-card-confirm-actions"><button className="draw-card-primary" onClick={() => setShowAuthModal(true)} type="button">登录 / 注册</button></div></section> : null}
        {account?.isRegistered ? <><section className="body-book-cart-grid" aria-label="选择认知书">
          {eligibleBooks.map(({ book, eligibility }) => {
            const projectId = String(book?.sessionId || book?.projectId || "");
            const quantity = Math.max(0, Number(cart[projectId] || 0));
            const selected = eligibility.eligible && quantity > 0;
            const cover = book.thumbnail || getBodyBookThumbnail((book.pages || []).find((page) => page.key === "cover"));
            return <article className={`body-book-cart-card${selected ? " is-selected" : ""}${!eligibility.eligible ? " is-disabled" : ""}`} key={projectId || book.title}>
              <button aria-label={`${selected ? "取消选择" : "选择"}《${book.title || "认知书"}》`} aria-pressed={selected} className="body-book-cart-cover" disabled={!eligibility.eligible} onClick={() => toggleBook(book)} type="button">
                {cover ? <img alt={`${book.title || "认知书"}封面`} src={cover} /> : <span>{book.theme?.name || "认知书"}</span>}
                {!eligibility.eligible ? <b>页数不足</b> : null}
              </button>
              <div className="body-book-cart-card-title"><strong>{book.title || book.theme?.title || "认知书"}</strong><span>{book.theme?.name || "认知书"}</span></div>
              <div aria-label={`${book.title || "认知书"}的数量`} className="body-book-cart-quantity">
                <button aria-label="减少数量" disabled={!eligibility.eligible || quantity <= 0} onClick={() => setBookQuantity(book, quantity - 1)} type="button">−</button>
                <span>{eligibility.eligible ? quantity : 0}</span>
                <button aria-label="增加数量" disabled={!eligibility.eligible || totalQuantity >= MAX_BODY_BOOK_CART_QUANTITY} onClick={() => setBookQuantity(book, quantity + 1)} type="button">＋</button>
              </div>
              <button className="draw-card-secondary body-book-cart-view" onClick={() => window.location.assign(`/book?project=${encodeURIComponent(projectId)}`)} type="button">查看</button>
            </article>;
          })}
          {!eligibleBooks.length ? <p className="body-book-library-empty">还没有已保存的认知书，先去制作一本吧。</p> : null}
        </section>
        <section className="body-book-cart-checkout">
          <div className="draw-card-order-summary"><h2>结算信息</h2><p>已选 {totalQuantity} 本</p><p>书价 {formatCurrencyCents(subtotalCents)}</p><p>邮费 {shippingFeeCents > 0 ? formatCurrencyCents(shippingFeeCents) : "包邮"}</p>{redemptionBookCount > 0 ? <p>实体书兑换 -{formatCurrencyCents(redemptionDiscountCents)}（已使用 {redemptionBookCount} 册）</p> : null}<strong>实付 {formatCurrencyCents(payableCents)}</strong></div>
          <div className="draw-card-order-form"><h2>收货信息</h2><label className="field-label">收件人<input onChange={(event) => setOrderForm((current) => ({ ...current, receiverName: event.target.value }))} type="text" value={orderForm.receiverName} /></label><label className="field-label">手机号<input onChange={(event) => setOrderForm((current) => ({ ...current, receiverPhone: event.target.value }))} type="tel" value={orderForm.receiverPhone} /></label><label className="field-label">收货地址<input onChange={(event) => setOrderForm((current) => ({ ...current, address: event.target.value, addressDetail: event.target.value }))} type="text" value={orderForm.address || orderForm.addressDetail || ""} /></label><label className="field-label">备注<textarea onChange={(event) => setOrderForm((current) => ({ ...current, remark: event.target.value }))} rows="2" value={orderForm.remark} /></label></div>
          <div className="draw-card-confirm-actions"><button className="draw-card-primary" disabled={!bodyBookPricing.enabled || !totalQuantity || isSubmitting} onClick={submitOrder} type="button">{isSubmitting ? "创建订单中" : formatPaymentButtonLabel(payableCents)}</button></div>
        </section></> : null}
      </> : null}
    </section>
    {showAuthModal ? <AuthModal onAuthenticated={async () => { setShowAuthModal(false); setIsLoading(true); try { await loadCartPage(); setError(""); } catch (nextError) { setError(nextError.message || "读取购物车失败，请稍后再试。"); } finally { setIsLoading(false); } }} onClose={() => setShowAuthModal(false)} reloadOnLogin={false} /> : null}
  </main>;
}

function BodyBookWorksPage() {
  const [books, setBooks] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [deletingProjectId, setDeletingProjectId] = useState("");

  useEffect(() => {
    let active = true;
    fetchBodyBookProjects()
      .then((payload) => {
        if (!active) return;
        setBooks(payload.projects || []);
        setError("");
      })
      .catch((nextError) => { if (active) setError(nextError.message || "读取我的作品失败。"); })
      .finally(() => { if (active) setIsLoading(false); });
    return () => { active = false; };
  }, []);

  async function deleteBook(book) {
    if (!book?.sessionId || deletingProjectId) return;
    if (!window.confirm(`确定删除《${book.title}》吗？删除后无法恢复。`)) return;
    setDeletingProjectId(book.sessionId);
    setError("");
    try {
      await deleteBodyBookProject(book.sessionId);
      setBooks((current) => current.filter((item) => item.sessionId !== book.sessionId));
    } catch (nextError) {
      setError(nextError.message || "删除认知书工程失败，请稍后再试。");
    } finally {
      setDeletingProjectId("");
    }
  }

  return <main className="body-book-page">
    <section className="body-book-order-list-page body-book-works-page">
      <div className="body-book-order-list-head">
        <div><p className="body-book-kicker">My works</p><h1>我的作品</h1><p>继续编辑、生成或删除已创建的认知书。</p></div>
      </div>
      {isLoading ? <p className="body-book-library-empty">正在读取我的作品…</p> : null}
      {error ? <p className="error-note">{error}</p> : null}
      {!isLoading && !error ? <><section className="body-book-library" aria-label="我的作品">{books.length ? <div className="body-book-library-grid">{books.map((book) => <article className="body-book-library-item" key={book.sessionId}><button className="body-book-library-cover" onClick={() => window.location.assign(`/book?project=${encodeURIComponent(book.sessionId)}`)} type="button">{book.thumbnail ? <img alt={`${book.title} 缩略图`} src={book.thumbnail} /> : <div className="body-book-library-placeholder">{book.theme?.name || "认知书"}</div>}<span>{book.title}</span><small>继续制作 · {formatBodyBookUpdatedAt(book.updatedAt || book.savedAt)}</small></button><button aria-label={`删除《${book.title}》`} className="body-book-library-delete icon-button" disabled={deletingProjectId === book.sessionId} onClick={() => deleteBook(book)} title="删除" type="button">{deletingProjectId === book.sessionId ? <LoaderCircle className="spin" size={16} /> : <X size={17} />}</button></article>)}</div> : <p className="body-book-library-empty">还没有已保存的认知书，先去开始制作吧。</p>}</section><div className="body-book-works-cart-action"><button className="draw-card-primary" onClick={() => window.location.assign("/book/cart")} type="button">选书加购</button></div></> : null}
    </section>
  </main>;
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
    Promise.all([fetchMyOrders("body-book"), fetchMyBeanPurchases()])
      .then(([ordersPayload, purchasesPayload]) => {
        if (!isActive) return;
        setOrders(ordersPayload.orders || []);
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
            const orderedBooks = Array.isArray(order.bodyBookBooks) ? order.bodyBookBooks : [];
            const firstBook = orderedBooks[0];
            const cover = order.items?.find((item) => Number(item.sortOrder) === 0) || order.items?.[0];
            const themeName = firstBook?.title || order.bodyBookThemeName || cover?.styleName || "认知书";
            const totalBooks = orderedBooks.length ? orderedBooks.reduce((sum, book) => sum + Math.max(0, Number(book.quantity || 0)), 0) : Math.max(1, Number(order.itemCount || 1));
            const canDelete = ["expired", "cancelled"].includes(order.orderStatus);
            return (
              <article className="body-book-order-list-item" key={order.id}>
                <button className="body-book-order-list-open" onClick={() => window.location.assign(buildOrderDetailUrl(order.id, order.publicToken, "body-book"))} type="button">
                  <span className="body-book-order-cover">
                    {firstBook?.coverUrl || cover?.thumbnailUrl || cover?.imageUrl ? <img alt={`${themeName}封面`} src={firstBook?.coverUrl || cover.thumbnailUrl || cover.imageUrl} /> : <span>{themeName}</span>}
                  </span>
                  <span className="body-book-order-summary">
                    <strong>{themeName}</strong>
                    <span>共 {totalBooks} 本 · {formatCurrencyCents(Number(order.payableCents ?? order.totalCents ?? 0))}</span>
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
  const [redemptionEntitlements, setRedemptionEntitlements] = useState({ fridgeMagnetItemCount: 0 });
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [fulfillmentMode, setFulfillmentMode] = useState("mail");
  const [onsiteCopied, setOnsiteCopied] = useState(false);
  const [storeOwnerContext, setStoreOwnerContext] = useState(null);
  const pendingCheckoutRef = useRef(false);
  const hasInitializedDefaultSelectionRef = useRef(false);

  useEffect(() => {
    let isActive = true;
    Promise.all([fetchPublicClipItems("draw-card"), fetchOrderConfig(), fetchVisitorState()])
      .then(([clipPayload, config, accountPayload]) => {
        if (!isActive) return;
        const items = Array.isArray(clipPayload?.items) ? clipPayload.items : [];
        setClipItems(items);
        if (!hasInitializedDefaultSelectionRef.current) {
          setSelectedJobIds(items[0]?.jobId ? [items[0].jobId] : []);
          hasInitializedDefaultSelectionRef.current = true;
        }
        setOrderConfig(config || null);
        setAccount(accountPayload?.account || null);
        setRedemptionEntitlements(accountPayload?.redemptionEntitlements || { fridgeMagnetItemCount: 0 });
        setOrderForm((current) => fillOrderAddressFromSaved(current, accountPayload?.account));
        setQuantities((current) => syncOrderQuantitiesWithClipItems(current, items));
        const activeStoreOwner = String(accountPayload?.storeOwnerWechatId || "").trim()
          ? {
              accountId: String(accountPayload?.storeOwnerAccountId || ""),
              name: String(accountPayload?.storeOwnerName || ""),
              wechatId: String(accountPayload?.storeOwnerWechatId || "")
            }
          : null;
        setStoreOwnerContext(activeStoreOwner);
        if (activeStoreOwner) setFulfillmentMode("onsite");
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

  useEffect(() => {
    if (storeOwnerContext?.wechatId) setFulfillmentMode("onsite");
  }, [storeOwnerContext]);

  const selectedItems = useMemo(
    () => clipItems.filter((item) => selectedJobIds.includes(item.jobId)),
    [clipItems, selectedJobIds]
  );
  const totalItemCount = getTotalOrderItemCount(selectedItems, quantities);
  const amountPreview = calculateClientOrderAmount(totalItemCount, orderConfig);
  const fridgeMagnetRedemptionCount = Math.max(0, Number(redemptionEntitlements.fridgeMagnetItemCount || 0));
  const usesFridgeMagnetRedemption = totalItemCount > 0 && fridgeMagnetRedemptionCount >= totalItemCount;
  const payablePreviewCents = usesFridgeMagnetRedemption ? 0 : amountPreview.totalCents;
  const isStoreOwnerCheckout = Boolean(storeOwnerContext?.wechatId);
  const contactWechatId = storeOwnerContext?.wechatId || getContactWechatId(orderConfig);

  function toggleSelectedItem(jobId) {
    setSelectedJobIds((current) => current.includes(jobId)
      ? current.filter((item) => item !== jobId)
      : current.concat(jobId));
  }

  async function copyOnsiteWechat() {
    try {
      await copyText(contactWechatId);
      setOnsiteCopied(true);
      window.setTimeout(() => setOnsiteCopied(false), 1600);
      setError("");
    } catch (nextError) {
      setError(nextError.message || "复制失败，请手动复制。");
    }
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
            <p className="storage-note">点击图片即可选择要制作的冰箱贴。</p>
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
              <h3>制作方式</h3>
              <div className="draw-card-fulfillment">
                <span className="field-label">制作方式</span>
                <div className="draw-card-segmented-control draw-card-fulfillment-control">
                  <button className={`draw-card-segment${fulfillmentMode === "onsite" ? " is-active" : ""}`} onClick={() => setFulfillmentMode("onsite")} type="button">现场制作</button>
                  <button className={`draw-card-segment${fulfillmentMode === "mail" ? " is-active" : ""}`} onClick={() => setFulfillmentMode("mail")} type="button">邮寄</button>
                </div>
              </div>
              {fulfillmentMode === "onsite" ? (
                <div className="draw-card-order-onsite">
                  <div className="draw-card-order-summary">
                    <p>现场制作无需在线付款，也不会生成订单。</p>
                  </div>
                  <div className="draw-card-onsite-wechat">
                    <p className="field-label">请添加店家微信</p>
                    <div className="draw-card-onsite-wechat-row">
                      <strong>{contactWechatId}</strong>
                      <button className="draw-card-primary" onClick={copyOnsiteWechat} type="button">
                        <Clipboard size={16} />
                        <span>{onsiteCopied ? "已复制" : "复制微信号"}</span>
                      </button>
                    </div>
                    <p className="storage-note">{isStoreOwnerCheckout ? "请先在卡夹页下载原图，然后通过上方微信号把原图发给店家，即可现场制作。" : "请先在卡夹页下载原图，然后通过上方微信号把原图发给客服，即可现场制作。"}</p>
                  </div>
                </div>
              ) : null}
            </section>
            {fulfillmentMode === "mail" ? (
              <>
            <section className="draw-observability-card">
              <h3>选择图片</h3>
              <div className="draw-card-order-items checkout-order-items checkout-image-grid">
                {clipItems.map((item, index) => {
                  const selected = selectedJobIds.includes(item.jobId);
                  const quantity = getOrderItemQuantity(quantities, item.jobId);
                  return (
                    <article className={`checkout-image-option ${selected ? "is-selected" : ""}`} key={`${item.jobId}-${index}`}>
                      <button
                        aria-label={`${selected ? "取消选择" : "选择"}图片 ${index + 1}`}
                        aria-pressed={selected}
                        className="checkout-image-select"
                        onClick={() => toggleSelectedItem(item.jobId)}
                        type="button"
                      >
                        <OrderItemPreview alt="" note="图片准备中" src={item.thumbnailUrl || item.imageUrl} />
                      </button>
                      {selected ? (
                        <div aria-label={`图片 ${index + 1} 的下单数量`} className="checkout-image-quantity">
                          <button aria-label="减少数量" disabled={quantity <= 1} onClick={() => updateQuantity(item.jobId, quantity - 1)} type="button">−</button>
                          <span>{quantity}</span>
                          <button aria-label="增加数量" disabled={quantity >= MAX_ORDER_ITEM_QUANTITY} onClick={() => updateQuantity(item.jobId, quantity + 1)} type="button">+</button>
                        </div>
                      ) : null}
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
                {usesFridgeMagnetRedemption ? <p>将使用实体冰箱贴兑换权益 {totalItemCount} 个</p> : null}
                <strong>实付 {formatCurrencyCents(payablePreviewCents)}</strong>
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
                      <span>{isSubmitting ? "创建订单中" : formatPaymentButtonLabel(payablePreviewCents)}</span>
                    </button>
                  </div>
              </section>
              </>
            ) : null}
          </>
        ) : null}
      </section>
      {showAuthModal ? (
        <AuthModal
          onAuthenticated={async (nextAccount) => {
            const nextVisitorState = await fetchVisitorState().catch(() => null);
            setAccount(nextVisitorState?.account || nextAccount);
            setOrderForm((current) => fillOrderAddressFromSaved(current, nextVisitorState?.account || nextAccount));
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
  const [shipmentCopied, setShipmentCopied] = useState(false);
  const [contactCopied, setContactCopied] = useState(false);
  const orderCopiedTimeoutRef = useRef(null);
  const shipmentCopiedTimeoutRef = useRef(null);
  const contactCopiedTimeoutRef = useRef(null);
  const paymentRequestRef = useRef("");
  const paymentRefreshTimeoutRef = useRef(null);
  const payableCents = Number(order?.payableCents ?? order?.totalCents ?? 0);
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const bodyBookBooks = Array.isArray(order?.bodyBookBooks) ? order.bodyBookBooks : [];

  useEffect(() => {
    return () => {
      if (orderCopiedTimeoutRef.current) window.clearTimeout(orderCopiedTimeoutRef.current);
      if (shipmentCopiedTimeoutRef.current) window.clearTimeout(shipmentCopiedTimeoutRef.current);
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

  async function handleCopyShipmentNo() {
    const trackingNo = String(order?.shippingTrackingNo || "").trim();
    if (!trackingNo) return;
    try {
      await copyText(trackingNo);
      setShipmentCopied(true);
      if (shipmentCopiedTimeoutRef.current) window.clearTimeout(shipmentCopiedTimeoutRef.current);
      shipmentCopiedTimeoutRef.current = window.setTimeout(() => setShipmentCopied(false), 2400);
      setError("");
    } catch (nextError) {
      setError(nextError.message || "复制快递号失败，请手动复制。");
    }
  }

  return (
    <main className={isBodyBookOrder ? "app-shell body-book-order-detail-page" : "draw-card-shell theme-draw-card draw-card-order-detail-page"}>
      <section className={isBodyBookOrder ? "workspace order-page" : "draw-card-stage draw-card-order-detail-stage"}>
        <div className={isBodyBookOrder ? "task-toolbar" : "draw-card-order-detail-head"}>
          <div>
            <p className={isBodyBookOrder ? "eyebrow" : "draw-card-kicker"}>{isBodyBookOrder ? "Body book order" : "Fridge order"}</p>
            <h2 className={isBodyBookOrder ? "" : "draw-card-title"}>订单详情</h2>
            <p className={isBodyBookOrder ? "storage-note" : "draw-card-subtitle"}>可在这里查看订单状态、收货信息和{isBodyBookOrder ? "认知书页面" : "下单图片"}。</p>
          </div>
          <button className={isBodyBookOrder ? "secondary-button" : "draw-card-secondary"} onClick={() => window.location.assign(isBodyBookOrder ? "/book/orders" : "/fridge/orders")} type="button">
            <Home size={18} />
            <span>{isBodyBookOrder ? "返回我的订单" : "返回"}</span>
          </button>
        </div>
        {isBodyBookOrder ? <div className="task-actions order-detail-contact-action">
          <button className="secondary-button" onClick={handleCopyContact} type="button">
            <Clipboard size={18} />
            <span>{contactCopied ? "客服微信已复制" : "联系客服"}</span>
          </button>
        </div> : null}
        {isLoading ? <p className={isBodyBookOrder ? "storage-note" : "draw-card-order-detail-note"}>正在读取订单…</p> : null}
        {error ? <p className="error-note">{error}</p> : null}
        {paymentError ? <p className="error-note">{paymentError}</p> : null}
        {order ? (
          <section className={isBodyBookOrder ? "task-page" : "task-page draw-card-order-detail-content"}>
            {isPreparingPayment ? <p className={isBodyBookOrder ? "storage-note" : "draw-card-order-detail-note"}>正在准备微信支付…</p> : null}
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
                <div className="draw-observability-metric"><strong>冰箱贴兑换（个）</strong><span>{Math.max(0, Number(order.fridgeMagnetRedemptionCount || 0))}</span></div>
                <div className="draw-observability-metric"><strong>实体书兑换（册）</strong><span>{Math.max(0, Number(order.bodyBookPrintRedemptionCount || 0))}</span></div>
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
                <p className="storage-note">{order.shippingCarrierName || "快递"} · {order.shippingTrackingNo}</p>
                <p className="storage-note">复制快递号后，请打开支付宝，在“我的快递”中查询物流信息。</p>
                <div className="task-actions">
                  <button className="secondary-button" onClick={handleCopyShipmentNo} type="button">
                    <Clipboard size={18} />
                    <span>{shipmentCopied ? "快递号已复制" : "复制快递号"}</span>
                  </button>
                </div>
              </article>
            ) : null}

            <article className="draw-observability-card">
              <h3>{isBodyBookOrder ? `认知书内容${bodyBookBooks.length ? ` · 共 ${bodyBookBooks.reduce((sum, book) => sum + Math.max(0, Number(book.quantity || 0)), 0)} 本` : ""}` : "下单图片"}</h3>
              {isBodyBookOrder && bodyBookBooks.length ? <div className="draw-card-order-items order-detail-items">{bodyBookBooks.map((book, index) => { const quantity = Math.max(1, Number(book.quantity || 1)); return <article className="draw-card-order-item" key={`${book.projectId}-${index}`}><OrderItemPreview alt={book.title || `认知书 ${index + 1}`} src={book.coverUrl || book.pages?.find((page) => page.key === "cover")?.thumbnailUrl} /><strong>{book.title || book.themeName || `认知书 ${index + 1}`}</strong><span className="draw-card-order-item-note">{book.themeName || "认知书"} · {book.pageCount || 0} 页 · <b className={quantity > 1 ? "is-multiple" : ""}>数量 x{quantity}</b></span></article>; })}</div> : <div className="draw-card-order-items order-detail-items">{orderItems.map((item, index) => (<article className="draw-card-order-item" key={`${item.jobId}-${index}`}><OrderItemPreview alt={item.styleName || `冰箱贴 ${index + 1}`} src={item.thumbnailUrl || item.imageUrl} /><strong>{item.styleName || `冰箱贴 ${index + 1}`}</strong><span className="draw-card-order-item-note">数量 x{Math.max(1, Number(item.quantity || 1))}</span></article>))}{!orderItems.length ? <p className="empty-note">该历史订单未保存商品明细。</p> : null}</div>}
            </article>
            {!isBodyBookOrder ? <div className="draw-card-order-detail-contact draw-card-order-detail-contact-bottom">
              <button className="draw-card-secondary" onClick={handleCopyContact} type="button">
                <Clipboard size={18} />
                <span>{contactCopied ? "客服微信已复制" : "联系客服"}</span>
              </button>
            </div> : null}
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
  const [referenceSessionId, setReferenceSessionId] = useState("");
  const [referencePreviewUrl, setReferencePreviewUrl] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [session, setSession] = useState(null);
  const [results, setResults] = useState([]);
  const [clipItems, setClipItems] = useState([]);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpeningLatestSession, setIsOpeningLatestSession] = useState(false);
  const [isRestoringSessionReference, setIsRestoringSessionReference] = useState(false);
  const [showPhotoChangeConfirm, setShowPhotoChangeConfirm] = useState(false);
  const [waitingLineIndex, setWaitingLineIndex] = useState(0);
  const [waitingStage, setWaitingStage] = useState("offering");
  const [activeResultIndex, setActiveResultIndex] = useState(-1);
  const [activeClipPreview, setActiveClipPreview] = useState(null);
  const [originalPreview, setOriginalPreview] = useState(null);
  const [showOriginalUnlockPrompt, setShowOriginalUnlockPrompt] = useState(false);
  const [originalUnlockTarget, setOriginalUnlockTarget] = useState(null);
  const [originalUnlockShareUrl, setOriginalUnlockShareUrl] = useState("");
  const [originalUnlockShareBusy, setOriginalUnlockShareBusy] = useState(false);
  const [originalUnlockShareError, setOriginalUnlockShareError] = useState("");
  const [originalUnlockShareNotice, setOriginalUnlockShareNotice] = useState("");
  const [originalPreviewLoadingJobId, setOriginalPreviewLoadingJobId] = useState("");
  const [drawShareTarget, setDrawShareTarget] = useState(null);
  const [drawShareUrl, setDrawShareUrl] = useState("");
  const [drawShareBusy, setDrawShareBusy] = useState(false);
  const [drawShareNotice, setDrawShareNotice] = useState("");
  const [drawShareError, setDrawShareError] = useState("");
  const [drawShareCopied, setDrawShareCopied] = useState(false);
  const [styleQrPreview, setStyleQrPreview] = useState(null);
  const [styleQrBusy, setStyleQrBusy] = useState(false);
  const [styleQrError, setStyleQrError] = useState("");
  const [pendingRemoval, setPendingRemoval] = useState(null);
  const [flyingCard, setFlyingCard] = useState(null);
  const [clipReceiving, setClipReceiving] = useState(false);
  const [visitorState, setVisitorState] = useState(null);
  const [myOrders, setMyOrders] = useState([]);
  const [latestManualOrder, setLatestManualOrder] = useState(() => readLatestManualOrder());
  const [inviteCode, setInviteCode] = useState("");
  const [showCoinInfo, setShowCoinInfo] = useState(false);
  const [showCoinPurchase, setShowCoinPurchase] = useState(false);
  const [coinPurchaseCount, setCoinPurchaseCount] = useState(20);
  const [coinPurchase, setCoinPurchase] = useState(null);
  const [coinPurchasePayment, setCoinPurchasePayment] = useState(null);
  const [coinPurchaseBusy, setCoinPurchaseBusy] = useState(false);
  const [coinPurchaseError, setCoinPurchaseError] = useState("");
  const [showReferralModal, setShowReferralModal] = useState(false);
  const [referralUrl, setReferralUrl] = useState("");
  const [referralNotice, setReferralNotice] = useState("");
  const [referralError, setReferralError] = useState("");
  const [showContactModal, setShowContactModal] = useState(false);
  const [showDrawConfigModal, setShowDrawConfigModal] = useState(false);
  const [showPhotoRequiredModal, setShowPhotoRequiredModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
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
  const [publishedStyles, setPublishedStyles] = useState([]);
  const [publishedTag, setPublishedTag] = useState("推荐");
  const [activePublishedStyle, setActivePublishedStyle] = useState(null);
  const [selectedStyleIds, setSelectedStyleIds] = useState([]);
  const [sameStyleId, setSameStyleId] = useState("");
  const [stylePickerError, setStylePickerError] = useState("");
  const [isLoadingStylePicker, setIsLoadingStylePicker] = useState(false);
  const [sharedStyleId, setSharedStyleId] = useState(() => experienceType === "draw-card" ? String(new URLSearchParams(window.location.search).get("styleId") || "").trim() : "");
  const [linkedSameStyleId] = useState(() => experienceType === "draw-card" ? String(new URLSearchParams(window.location.search).get("sameStyleId") || "").trim() : "");
  const sharedStylePickerOpenedRef = useRef(false);
  const linkedSameStylePickerOpenedRef = useRef(false);
  const resultMediaRefs = useRef(new Map());
  const cardClipPanelRef = useRef(null);
  const userMenuRef = useRef(null);
  const flightTimeoutRef = useRef(null);
  const clipPulseTimeoutRef = useRef(null);
  const finishAnimTimeoutRef = useRef(null);
  const pendingSeenAtRef = useRef(new Map());
  const prevSucceededRef = useRef(new Set());
  const [justFinishedIds, setJustFinishedIds] = useState(() => new Set());
  const [elapsedTick, setElapsedTick] = useState(0);
  const contactCopiedTimeoutRef = useRef(null);
  const manualContactCopiedTimeoutRef = useRef(null);
  const manualOrderCopiedTimeoutRef = useRef(null);
  const manualMessageCopiedTimeoutRef = useRef(null);
  const merchantClaimKeyRef = useRef("");
  const visitSessionIdRef = useRef("");
  const visitLifecycleTokenRef = useRef(0);
  const visitSource = useMemo(() => {
    const inviteToken = experienceType === "draw-card" ? String(new URLSearchParams(window.location.search).get("invite") || "").trim() : "";
    return inviteToken ? { type: "invite", token: inviteToken } : { type: "organic", token: "" };
  }, [experienceType]);
  const pendingCoinPurchaseRef = useRef(false);
  const pendingReferralRef = useRef(false);
  const pendingDrawShareRef = useRef(null);
  const pendingOriginalDownloadRef = useRef(null);
  const drawShareCopiedTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (contactCopiedTimeoutRef.current) window.clearTimeout(contactCopiedTimeoutRef.current);
      if (manualContactCopiedTimeoutRef.current) window.clearTimeout(manualContactCopiedTimeoutRef.current);
      if (manualOrderCopiedTimeoutRef.current) window.clearTimeout(manualOrderCopiedTimeoutRef.current);
      if (manualMessageCopiedTimeoutRef.current) window.clearTimeout(manualMessageCopiedTimeoutRef.current);
      if (drawShareCopiedTimeoutRef.current) window.clearTimeout(drawShareCopiedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showUserMenu) return undefined;
    const closeMenu = (event) => {
      if (event.type === "keydown") {
        if (event.key === "Escape") setShowUserMenu(false);
        return;
      }
      if (!userMenuRef.current?.contains(event.target)) setShowUserMenu(false);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeMenu);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeMenu);
    };
  }, [showUserMenu]);

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
          route: window.location.pathname || "/",
          visitSource
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
  }, [experienceType, visitSource.token, visitSource.type, visitTrackingReady]);

  function refreshVisitorStateSilently() {
    fetchVisitorState().then(setVisitorState).catch(() => {});
  }

  function redirectToWechatAuthorization(authorizationUrl) {
    if (!authorizationUrl) return false;
    window.location.assign(authorizationUrl);
    return true;
  }

  async function showReferralDialog() {
    setReferralError("");
    setReferralNotice("");
    try {
      const payload = await createReferralLink("draw-card");
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

  function openCoinPurchase() {
    if (!visitorState?.account?.isRegistered) {
      pendingCoinPurchaseRef.current = true;
      setShowAuthModal(true);
      return;
    }
    setCoinPurchase(null);
    setCoinPurchasePayment(null);
    setCoinPurchaseError("");
    setCoinPurchaseCount(20);
    setShowCoinInfo(false);
    setShowCoinPurchase(true);
  }

  function restartCoinPurchase() {
    setCoinPurchase(null);
    setCoinPurchasePayment(null);
    setCoinPurchaseError("");
  }

  async function applyCoinPurchasePayment(payload) {
    const nextPurchase = payload?.purchase || null;
    const nextPayment = payload?.payment || null;
    if (nextPurchase) setCoinPurchase(nextPurchase);
    setCoinPurchasePayment(nextPayment);
    if (nextPayment?.status === "requires_authorization" && nextPayment.authorizationUrl) {
      window.location.assign(nextPayment.authorizationUrl);
      return;
    }
    if (nextPayment?.channel === "wechat_jsapi" && nextPayment.jsapi) {
      await invokeWechatJsapiPayment(nextPayment.jsapi);
      const refreshed = await fetchCoinPurchase(nextPurchase?.id || coinPurchase?.id);
      setCoinPurchase(refreshed.purchase);
      setVisitorState(await fetchVisitorState());
    }
  }

  async function prepareCoinPurchase(purchaseId, code = "") {
    if (!purchaseId) return;
    setCoinPurchaseBusy(true);
    setCoinPurchaseError("");
    try {
      await applyCoinPurchasePayment(await payCoinPurchase(purchaseId, code ? { code } : {}));
    } catch (nextError) {
      setCoinPurchaseError(nextError.message || "发起币购买支付失败，请稍后重试。");
    } finally {
      setCoinPurchaseBusy(false);
    }
  }

  async function submitCoinPurchase() {
    const count = Math.trunc(Number(coinPurchaseCount || 0));
    if (coinPurchaseBusy) return;
    if (!Number.isFinite(count) || count < 1 || count > MAX_BEAN_PURCHASE_COUNT) {
      setCoinPurchaseError(`请输入 1 到 ${MAX_BEAN_PURCHASE_COUNT} 之间的整数。`);
      return;
    }
    setCoinPurchaseBusy(true);
    setCoinPurchaseError("");
    try {
      const created = await createCoinPurchase({ coinCount: count });
      setCoinPurchase(created.purchase);
      setCoinPurchasePayment(created.payment || null);
      if (created.payment?.channel !== "manual_collection") {
        await applyCoinPurchasePayment(await payCoinPurchase(created.purchase.id, {}));
      }
    } catch (nextError) {
      setCoinPurchaseError(nextError.message || "创建币购买单失败，请稍后重试。");
    } finally {
      setCoinPurchaseBusy(false);
    }
  }

  async function openStylePicker(options = {}) {
    if (isGenerationInProgress || isSubmitting || isRestoringSessionReference) return;
    const lockedStyleId = String(options.sameStyleId || "").trim();
    const isSameStyleMode = Boolean(lockedStyleId);

    if (isSameStyleMode) {
      const cachedStyle = stylePickerStyles.find((style) => String(style.id) === lockedStyleId);
      setSameStyleId(lockedStyleId);
      setSelectedStyleIds([cachedStyle?.id || lockedStyleId]);
      // “做同款”必须使用一张新照片，不能沿用原任务的参考图。
      setReferenceFile(null);
      setReferenceSessionId("");
    } else {
      setSameStyleId("");
    }

    const needsCurrentSessionReference = Boolean(sessionId && referenceSessionId !== sessionId);
    if (!isSameStyleMode && needsCurrentSessionReference) {
      if (experienceType !== "draw-card" || !sessionId) {
        window.alert("请先上传参考图");
        return;
      }
      setIsRestoringSessionReference(true);
      try {
        const restoredReference = await fetchPublicExperienceSessionReference(apiBase, sessionId);
        setReferenceFile(restoredReference);
        setReferenceSessionId(sessionId);
      } catch (nextError) {
        setError(nextError.message || "读取本次任务的参考图失败，请稍后再试。");
        return;
      } finally {
        setIsRestoringSessionReference(false);
      }
    } else if (!isSameStyleMode && !referenceFile && experienceType !== "draw-card") {
      window.alert("请先上传参考图");
      return;
    }
    setPhase(isSameStyleMode ? "ready" : "style-picker");
    // 风格页与首页共用同一个页面容器；切换内容时浏览器不会自动重置滚动位置。
    window.scrollTo(0, 0);
    setError("");
    setStylePickerError("");
    if (experienceType !== "draw-card") return;
    if (stylePickerStyles.length && publishedStyles.length) return;

    setIsLoadingStylePicker(true);
    try {
      const [stylePayload, publicationPayload] = await Promise.all([
        stylePickerStyles.length ? Promise.resolve({ styles: stylePickerStyles }) : fetchPublicDrawCardStyles(),
        refreshStylePublications(publishedTag)
      ]);
      const nextStyles = Array.isArray(stylePayload.styles) ? stylePayload.styles : [];
      setStylePickerStyles(nextStyles);
      setPublishedStyles(Array.isArray(publicationPayload.items) ? publicationPayload.items : []);
      if (isSameStyleMode) {
        const lockedStyle = nextStyles.find((style) => String(style.id) === lockedStyleId);
        setSelectedStyleIds(lockedStyle ? [lockedStyle.id] : [lockedStyleId]);
      }
    } catch (nextError) {
      setStylePickerError(nextError.message || "读取风格发布失败，请稍后再试。");
    } finally {
      setIsLoadingStylePicker(false);
    }
  }

  function openRandomDrawConfig() {
    if (!referenceFile) {
      setShowPhotoRequiredModal(true);
      return;
    }
    if (isSubmitting) return;
    setShowDrawConfigModal(true);
  }

  useEffect(() => {
    if (experienceType !== "draw-card" || !sharedStyleId || sharedStylePickerOpenedRef.current) return;
    sharedStylePickerOpenedRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("styleId");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    void openStylePicker();
  }, [experienceType, sharedStyleId]);

  useEffect(() => {
    if (experienceType !== "draw-card" || !linkedSameStyleId || linkedSameStylePickerOpenedRef.current) return;
    linkedSameStylePickerOpenedRef.current = true;

    const url = new URL(window.location.href);
    url.searchParams.delete("sameStyleId");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);

    void openStylePicker({ sameStyleId: linkedSameStyleId });
  }, [experienceType, linkedSameStyleId]);

  useEffect(() => {
    if (!sharedStyleId || !stylePickerStyles.length) return;
    const sharedStyle = stylePickerStyles.find((style) => String(style.id) === sharedStyleId);
    if (sharedStyle) {
      setSelectedStyleIds([sharedStyle.id]);
    }
    setSharedStyleId("");
  }, [sharedStyleId, stylePickerStyles]);

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

  async function openLatestSession() {
    if (isOpeningLatestSession) return;

    setIsOpeningLatestSession(true);
    setError("");
    try {
      const payload = await fetchLatestPublicExperienceSession(apiBase, "读取最近生成任务失败，请稍后再试。");
      if (!payload?.sessionId) {
        setError("暂无最近生成任务。");
        return;
      }
      setReferenceSessionId("");
      applySession(payload);
    } catch (nextError) {
      setError(nextError.message || "读取最近生成任务失败，请稍后再试。");
    } finally {
      setIsOpeningLatestSession(false);
    }
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

  const hasPendingItems = displayItems.some((item) => item.status === "queued" || item.status === "running");
  const estimatedWaitSeconds = Number(session?.estimatedWaitSeconds || 0) > 0
    ? Number(session.estimatedWaitSeconds)
    : 120;

  // 每张 pending 卡片记录首次出现时间，用于计算已等待秒数与伪进度。
  useEffect(() => {
    const nowMs = Date.now();
    displayItems.forEach((item) => {
      if (item.status === "queued" || item.status === "running") {
        if (!pendingSeenAtRef.current.has(item.jobId)) {
          pendingSeenAtRef.current.set(item.jobId, nowMs);
        }
      }
    });
  }, [displayItems]);

  // 有任务在等待时，每秒驱动一次重渲染，让秒数与进度条动起来。
  useEffect(() => {
    if (!hasPendingItems) return undefined;
    const timer = window.setInterval(() => setElapsedTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [hasPendingItems]);

  // 检测刚完成的卡片，给入场动画 class，2.6 秒后移除。
  useEffect(() => {
    const currentSucceeded = new Set(
      displayItems.filter((item) => item.status === "succeeded").map((item) => item.jobId)
    );
    const newlyFinished = [...currentSucceeded].filter((jobId) => !prevSucceededRef.current.has(jobId));
    prevSucceededRef.current = currentSucceeded;
    if (!newlyFinished.length) return undefined;
    setJustFinishedIds((current) => {
      const next = new Set(current);
      newlyFinished.forEach((jobId) => next.add(jobId));
      return next;
    });
    if (finishAnimTimeoutRef.current) window.clearTimeout(finishAnimTimeoutRef.current);
    finishAnimTimeoutRef.current = window.setTimeout(() => {
      finishAnimTimeoutRef.current = null;
      setJustFinishedIds((current) => {
        const next = new Set(current);
        newlyFinished.forEach((jobId) => next.delete(jobId));
        return next;
      });
    }, 2600);
    return undefined;
  }, [displayItems]);

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
      likedAt: item.result.likedAt || null,
      originalDownloadAccess: Boolean(item.result.originalDownloadAccess),
      originalDownloadAvailable: Boolean(item.result.originalDownloadAvailable)
    };
  }

  useEffect(() => {
    if (!referenceFile) {
      setReferencePreviewUrl("");
      return undefined;
    }

    const nextPreviewUrl = URL.createObjectURL(referenceFile);
    setReferencePreviewUrl(nextPreviewUrl);
    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [referenceFile]);

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
    if (experienceType !== "draw-card") return;
    const token = new URLSearchParams(window.location.search).get("invite");
    if (!token) return;
    captureReferral(token).catch(() => {});
    claimStoreOwnerContext(token)
      .then(() => fetchVisitorState())
      .then((payload) => {
        if (!payload) return;
        setVisitorState((current) => ({ ...(current || {}), ...payload }));
      })
      .catch(() => {})
      .finally(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete("invite");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
      });
  }, [experienceType]);

  useEffect(() => {
    if (experienceType !== "draw-card") return;
    const url = new URL(window.location.href);
    const purchaseId = String(url.searchParams.get("coinPurchaseId") || "");
    const payCode = String(url.searchParams.get("coinPayCode") || "");
    if (!purchaseId || !payCode) return;
    setShowCoinPurchase(true);
    setCoinPurchaseError("");
    url.searchParams.delete("coinPurchaseId");
    url.searchParams.delete("coinPayCode");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    void prepareCoinPurchase(purchaseId, payCode);
  }, [experienceType]);

  useEffect(() => {
    if (!showCoinPurchase || !coinPurchase?.id || coinPurchase.status === "paid") return undefined;
    let active = true;
    const refresh = async () => {
      try {
        const payload = await fetchCoinPurchase(coinPurchase.id);
        if (!active) return;
        setCoinPurchase(payload.purchase);
        if (payload.purchase?.status === "paid") setVisitorState(await fetchVisitorState());
      } catch {}
    };
    const timer = window.setInterval(refresh, 2200);
    void refresh();
    return () => { active = false; window.clearInterval(timer); };
  }, [coinPurchase?.id, coinPurchase?.status, showCoinPurchase]);

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
      if (finishAnimTimeoutRef.current) window.clearTimeout(finishAnimTimeoutRef.current);
    };
  }, []);

  const lockedSameStyle = sameStyleId
    ? stylePickerStyles.find((style) => String(style.id) === sameStyleId) || null
    : null;

  const publicStyleItems = publishedStyles.filter((item) => item.effectImageUrl);
  const getPublishedStylePrompt = (publication) => {
    if (publication?.prompt) return publication.prompt;
    return stylePickerStyles.find((style) => String(style.id) === String(publication?.styleId))?.prompt || "";
  };

  const isDrawCardExperience = experienceType === "draw-card";
  const canStart = Boolean(referenceFile) && !isSubmitting;
  const canStartSameStyleDraw = Boolean(referenceFile) && Boolean(lockedSameStyle) && !isLoadingStylePicker && !isSubmitting;
  const activeResult = activeResultIndex >= 0 ? toDisplayResult(displayItems[activeResultIndex]) : activeResultIndex === -3 ? activeClipPreview : null;
  const succeededCount = Number(session?.summary?.succeeded ?? displayItems.filter((item) => item.status === "succeeded").length);
  const totalCount = Number(session?.summary?.total ?? displayItems.length);
  const currentSessionStatus = String(session?.status || "");
  const isGenerationInProgress = currentSessionStatus === "running" || currentSessionStatus === "queued";

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
      ? (session?.message || "成功结果可以正常保留，失败任务的币已自动退回。")
      : currentSessionStatus === "failed"
        ? (session?.message || "所有卡位都已结束，本轮没有可保留的成功结果。")
        : resultsSubtitle;

  function resetExperience() {
    clearPersistedSession();
    setPhase("idle");
    setReferenceFile(null);
    setReferenceSessionId("");
    setSessionId("");
    setSession(null);
    setResults([]);
    setError("");
    setIsSubmitting(false);
    setActiveResultIndex(-1);
    setActiveClipPreview(null);
    setFlyingCard(null);
    setClipReceiving(false);
    setSameStyleId("");
    setSelectedStyleIds([]);
    setStylePickerError("");
    setShowDrawConfigModal(false);
    resultMediaRefs.current.clear();
  }

  function confirmResetExperience() {
    setShowPhotoChangeConfirm(false);
    resetExperience();
  }

  function requestPhotoChange() {
    if (isGenerationInProgress) return;
    setShowPhotoChangeConfirm(true);
  }

  function returnToHome() {
    if (isGenerationInProgress) return;
    // 保留当前会话与生成结果，用户可随时通过“最近生成”重新打开。
    setPhase("idle");
    setError("");
    setActiveResultIndex(-1);
    setActiveClipPreview(null);
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
    setReferenceSessionId("");
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

  function openSameStyle(styleId) {
    const safeStyleId = String(styleId || "").trim();
    if (!safeStyleId || isGenerationInProgress || isSubmitting) return;
    closeActivePreview();
    void openStylePicker({ sameStyleId: safeStyleId });
  }

  async function startDrawCard(options = {}) {
    if (!referenceFile) {
      setShowPhotoRequiredModal(true);
      return;
    }
    if (isSubmitting) return;
    const requestedStyleIds = Array.isArray(options.selectedStyleIds) ? options.selectedStyleIds.filter(Boolean).slice(0, MAX_PUBLIC_STYLE_SELECTION) : [];
    const isManualSelection = requestedStyleIds.length > 0;
    const requestedSubjectType = String(options.subjectType || "").trim();
    const requestedDrawCount = Math.min(Math.max(Number(options.drawCount) || DEFAULT_PUBLIC_DRAW_COUNT, MIN_PUBLIC_DRAW_COUNT), MAX_PUBLIC_STYLE_SELECTION);
    const estimatedCost = isManualSelection ? requestedStyleIds.length : isDrawCardExperience ? requestedDrawCount : 1;

    setIsSubmitting(true);
    setError("");
    setStylePickerError("");
    try {
      if (isDrawCardExperience && !isManualSelection && !requestedSubjectType) {
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
        formData.append("subjectType", requestedSubjectType);
      }

      const response = await fetch(`${apiBase}/sessions`, {
        method: "POST",
        headers: { "x-draw-trace-id": traceId },
        body: formData
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || createErrorMessage);

      setShowDrawConfigModal(false);
      setReferenceSessionId(String(payload?.sessionId || ""));
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

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logoutCurrentAccount();
      const payload = await fetchVisitorState().catch(() => null);
      setVisitorState(payload);
      setClipItems([]);
      setShowUserMenu(false);
    } catch (nextError) {
      setError(nextError.message || "退出登录失败，请稍后再试。");
    } finally {
      setIsLoggingOut(false);
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

    if (!latestVisitorState?.authenticated || !latestVisitorState?.account?.isRegistered) {
      pendingOriginalDownloadRef.current = item;
      setShowAuthModal(true);
      return;
    }

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
      if (
        message.includes("免分享下载次数已用完")
        || message.includes("分享给一位新访客")
        || message.includes("累计实付满 20 元")
        || message.includes("购买币累计满 20 元")
        || message.includes("定制订单支付成功")
      ) {
        await openOriginalUnlockPrompt(item);
      }
      else if (isInsufficientBalanceMessage(message)) setBalanceAlert(message);
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
      if (created.payment?.status === "already_paid") {
        goToOrderDetail(created.order.id, created.order.publicToken);
        return;
      }
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
  const fridgeMagnetRedemptionCount = Math.max(0, Number(visitorState?.redemptionEntitlements?.fridgeMagnetItemCount || 0));
  const usesFridgeMagnetRedemption = experienceType === "fridge-magnet" && fridgeMagnetRedemptionCount >= totalOrderItemCount && totalOrderItemCount > 0;
  const orderPayablePreviewCents = usesFridgeMagnetRedemption ? 0 : orderAmountPreview.totalCents;
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

  async function openOriginalUnlockPrompt(item) {
    if (!item?.jobId) return;
    setOriginalUnlockTarget(item);
    setOriginalUnlockShareUrl("");
    setOriginalUnlockShareError("");
    setOriginalUnlockShareNotice("");
    setShowOriginalUnlockPrompt(true);
    await requestOriginalUnlockShare(item);
  }

  async function requestOriginalUnlockShare(item) {
    if (!item?.jobId) return "";
    setOriginalUnlockShareBusy(true);
    setOriginalUnlockShareError("");
    try {
      const payload = await createDrawImageShare(item.jobId);
      const shareToken = String(payload?.shareToken || payload?.token || "").trim();
      const fallbackUrl = shareToken
        ? new URL(`/draw/share/${encodeURIComponent(shareToken)}`, window.location.origin).toString()
        : "";
      const nextUrl = String(payload?.shareUrl || payload?.url || fallbackUrl || "").trim();
      if (!nextUrl) throw new Error("分享链接生成失败，请刷新后重试。");
      setOriginalUnlockShareUrl(nextUrl);
      return nextUrl;
    } catch (nextError) {
      setOriginalUnlockShareError(nextError.message || "创建分享链接失败，请稍后重试。");
      return "";
    } finally {
      setOriginalUnlockShareBusy(false);
    }
  }

  async function openDrawShare(item) {
    if (!item?.jobId || drawShareBusy) return;
    const latest = await fetchVisitorState().catch(() => visitorState);
    if (!latest?.account?.isRegistered) {
      pendingDrawShareRef.current = item;
      setShowAuthModal(true);
      return;
    }
    setVisitorState(latest);
    setDrawShareTarget(item);
    setDrawShareBusy(true);
    setDrawShareUrl("");
    setDrawShareError("");
    setDrawShareNotice("");
    setDrawShareCopied(false);
    if (drawShareCopiedTimeoutRef.current) window.clearTimeout(drawShareCopiedTimeoutRef.current);
    try {
      const payload = await createDrawImageShare(item.jobId);
      const nextUrl = String(payload?.shareUrl || "");
      setDrawShareUrl(nextUrl);
      if (nextUrl) {
        setDrawShareNotice("分享链接已生成，请点击下方按钮复制。");
      }
    } catch (nextError) {
      setDrawShareError(nextError.message || "创建分享链接失败，请稍后重试。");
    } finally {
      setDrawShareBusy(false);
    }
  }

  async function openStyleQr(item) {
    const safeStyleId = String(item?.styleId || "").trim();
    if (!safeStyleId || styleQrBusy) return;
    const latest = await fetchVisitorState().catch(() => visitorState);
    if (!latest?.account?.isRegistered) {
      setShowAuthModal(true);
      return;
    }
    setVisitorState(latest);
    setStyleQrBusy(true);
    setStyleQrError("");
    setStyleQrPreview(null);
    try {
      const payload = await createStyleInviteLink(safeStyleId);
      const qrUrl = String(payload?.inviteUrl || "");
      if (!qrUrl) throw new Error("生成风格码失败，请稍后再试。");
      const styleName = String(item?.styleName || safeStyleId || "风格");
      setStyleQrPreview({
        styleName,
        dataUrl: await createLabeledQrPngDataUrl(qrUrl, styleName, {
          errorCorrectionLevel: "H",
          margin: 4,
          pixelSize: 1024
        })
      });
    } catch (nextError) {
      setStyleQrError(nextError.message || "生成风格码失败，请稍后再试。");
    } finally {
      setStyleQrBusy(false);
    }
  }

  async function closeDrawShare() {
    if (!drawShareTarget?.jobId || drawShareBusy) return;
    setDrawShareBusy(true);
    setDrawShareError("");
    try {
      await closeDrawImageShare(drawShareTarget.jobId);
      setDrawShareUrl("");
      setDrawShareNotice("分享链接已关闭，原链接将无法再访问。");
    } catch (nextError) {
      setDrawShareError(nextError.message || "关闭分享失败，请稍后重试。");
    } finally {
      setDrawShareBusy(false);
    }
  }

  function renderDrawCardUtilityBar() {
    const accountName = visitorState?.account?.username || "我的账户";
    const isRegistered = Boolean(visitorState?.account?.isRegistered);
    const wechatAvatarUrl = String(visitorState?.account?.wechatAvatarUrl || "").trim();
    return (
      <div className="draw-card-utility-bar draw-card-utility-bar-draw">
        <button className="draw-card-utility-link draw-card-coin-balance" onClick={() => setShowCoinInfo(true)} type="button">
          余额 {visitorState ? `${visitorState.account?.coinBalance || 0} 币` : "--"}
        </button>
        <div className="draw-card-user-area" ref={userMenuRef}>
          <button
            aria-label={isRegistered ? `账户：${accountName}` : "登录或注册"}
            className={`draw-card-utility-link draw-card-account-button${isRegistered ? " is-signed-in" : " is-guest"}`}
            onClick={() => isRegistered ? setShowUserMenu((value) => !value) : setShowAuthModal(true)}
            title={isRegistered ? accountName : "登录 / 注册"}
            type="button"
          >
            {isRegistered && wechatAvatarUrl ? <img alt="" src={wechatAvatarUrl} /> : <span>{isRegistered ? accountName.slice(0, 1) : "登录"}</span>}
          </button>
          {showUserMenu && isRegistered ? (
            <div className="draw-card-user-inline-menu" role="menu">
              <span className="draw-card-user-inline-menu-name">{accountName}</span>
              <button onClick={() => window.location.assign("/fridge/orders")} role="menuitem" type="button">
                我的订单
              </button>
              <button onClick={() => window.location.assign("/book/referrals?source=draw")} role="menuitem" type="button">
                我的邀请
              </button>
              <button disabled={isLoggingOut} onClick={handleLogout} role="menuitem" type="button">
                {isLoggingOut ? "正在退出" : "退出登录"}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
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
                          {originalPreviewLoadingJobId === item.jobId ? "加载中" : visitorState?.account?.canRedeemOriginalDownloads ? "下载原图" : "解锁后下载"}
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
                <button className="draw-card-clip-order draw-card-clip-order-prominent draw-card-clip-order-secondary" onClick={() => window.location.assign("/product/acrylic-magnet/detail/")} type="button">
                  <span>商品详情</span>
                </button>
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
            <p>{visitorState?.account?.canRedeemOriginalDownloads ? "已获得全账户永久原图下载权限" : `累计实付每满 1 元可免分享下载 1 张原图（剩余 ${visitorState?.account?.originalDownloadAllowance?.remaining || 0} 次）；小画分享被新用户首次打开也可获得下载次数（每位新用户只计 1 次）`}</p>
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
              <span>兑换</span>
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
      {experienceType === "draw-card" && !["idle", "ready", "style-picker"].includes(phase) ? renderDrawCardUtilityBar() : null}
      {(phase === "idle" || phase === "ready") && (
        <section className="draw-card-stage">
          <div className={`draw-card-stage-layout${isDrawCardExperience ? " draw-card-stage-layout-no-account" : ""}`}>
            <div className="draw-card-stage-main">
              <div className="draw-card-hero">
                {titleKicker ? <p className="draw-card-kicker">{titleKicker}</p> : null}
                {isDrawCardExperience ? (
                  <img className="draw-card-handwritten-title" src="/ui/ai-artist-title.png" alt={title} />
                ) : (
                  <h1 className="draw-card-title">{title}</h1>
                )}
                {subtitle ? <p className="draw-card-subtitle">{subtitle}</p> : null}
                {isDrawCardExperience ? renderDrawCardUtilityBar() : null}
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

                <div className={`draw-card-actions${isDrawCardExperience ? " draw-card-home-actions" : ""}`}>
                  {isDrawCardExperience ? (
                    sameStyleId ? (
                      <button className="draw-card-primary" disabled={!canStartSameStyleDraw} onClick={() => startDrawCard({ selectedStyleIds })} type="button">
                        {isSubmitting ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                        <span>{isSubmitting ? "生成中" : "上传照片做同款"}</span>
                      </button>
                    ) : (
                      <>
                        <button className="draw-card-secondary" onClick={openStylePicker} type="button">
                          <span>选择风格</span>
                        </button>
                        <button className="draw-card-secondary draw-card-home-random-button" onClick={openRandomDrawConfig} type="button">
                          {isSubmitting ? <LoaderCircle className="spin" size={18} /> : null}
                          <span>{isSubmitting ? startButtonLoading : startButtonIdle}</span>
                        </button>
                        <button className="draw-card-secondary draw-card-recent-session-button" disabled={isOpeningLatestSession} onClick={openLatestSession} type="button">
                          {isOpeningLatestSession ? <LoaderCircle className="spin" size={18} /> : null}
                          <span>{isOpeningLatestSession ? "读取中" : "最近生成"}</span>
                        </button>
                      </>
                    )
                  ) : (
                    <>
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
                    </>
                  )}
                </div>

                {error ? <p className="error-note draw-card-inline-error">{error}</p> : null}
              </section>

              {isDrawCardExperience ? renderClipPanel({ showAccount: false }) : null}
            </div>

            {isDrawCardExperience ? null : <div>{renderClipPanel()}</div>}
          </div>
        </section>
      )}

      {phase === "style-picker" && experienceType === "draw-card" ? (
        <section className="draw-card-stage">
          <div className="draw-card-style-picker-page">
            <div className="draw-card-style-picker-head">
              <div>
                <p className="draw-card-kicker">Custom selection</p>
                <h2>{sameStyleId ? "做同款" : "让有意义的照片更精美"}</h2>
                <div className="draw-card-style-picker-actions">
                  <button
                    className="draw-card-utility-link draw-card-style-picker-back-button"
                    onClick={() => {
                      setError("");
                      setStylePickerError("");
                      if (sameStyleId) {
                        // “更多风格”：解除同款锁定，留在本页浏览全部风格。
                        setSameStyleId("");
                        setSelectedStyleIds([]);
                        return;
                      }
                      setPhase(referenceFile ? "ready" : "idle");
                    }}
                    type="button"
                  >
                    <ArrowLeft size={18} />
                    <span>{sameStyleId ? "更多风格" : "返回主页"}</span>
                  </button>
                  {renderDrawCardUtilityBar()}
                </div>
              </div>
            </div>

            <section className="draw-card-style-picker-panel">
              {stylePickerError ? <p className="error-note draw-card-inline-error">{stylePickerError}</p> : null}
              {isLoadingStylePicker ? <p className="storage-note">正在加载可选风格…</p> : null}
              <div className="draw-card-style-picker-tabs" role="tablist" aria-label="风格标签">
                {STYLE_PUBLICATION_TAGS.map((tag) => (
                  <button aria-selected={publishedTag === tag} className={`draw-card-style-picker-tab ${publishedTag === tag ? "is-active" : ""}`} key={tag} onClick={async () => {
                    setPublishedTag(tag);
                    try {
                      const payload = await refreshStylePublications(tag);
                      setPublishedStyles(Array.isArray(payload.items) ? payload.items : []);
                    } catch (nextError) { setStylePickerError(nextError.message); }
                  }} role="tab" type="button">{tag}</button>
                ))}
              </div>
              <div className="draw-card-publication-grid">
                {publicStyleItems.map((item) => (
                  <button className="draw-card-publication-card" key={item.publicationId} onClick={() => setActivePublishedStyle(item)} type="button">
                    <div className="draw-card-publication-effect">
                      <img alt={`${item.styleName}发布效果`} src={item.effectImageUrl} />
                      {(item.referenceThumbnailUrl || item.referenceImageUrl) ? <img alt="用户原图缩略图" className="draw-card-publication-reference" src={item.referenceThumbnailUrl || item.referenceImageUrl} /> : null}
                    </div>
                    <strong>{item.styleName}</strong>
                  </button>
                ))}
              </div>
              {!isLoadingStylePicker && !publicStyleItems.length ? <p className="empty-note">当前标签还没有发布效果。</p> : null}
              {activePublishedStyle ? <div className="modal-backdrop draw-card-lightbox" onClick={() => setActivePublishedStyle(null)} role="presentation">
                <section className="draw-card-lightbox-panel draw-card-publication-detail" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={`${activePublishedStyle.styleName}风格详情`}>
                  <button className="icon-button" onClick={() => setActivePublishedStyle(null)} type="button" aria-label="关闭详情"><X size={18} /></button>
                  <img alt={`${activePublishedStyle.styleName}发布效果`} src={activePublishedStyle.effectImageUrl} />
                  <div className="draw-card-lightbox-meta"><strong>{activePublishedStyle.styleName}</strong><span>{getPublishedStylePrompt(activePublishedStyle)}</span></div>
                  <div className="draw-card-lightbox-actions">
                    <button className="draw-card-primary" onClick={() => openSameStyle(activePublishedStyle.styleId)} type="button"><Sparkles size={16} /><span>做同款</span></button>
                    <button className="draw-card-secondary" onClick={async () => { try { await copyText(getPublishedStylePrompt(activePublishedStyle)); setStylePickerError("提示词已复制。"); } catch (nextError) { setStylePickerError(nextError.message || "复制提示词失败。"); } }} type="button"><Clipboard size={16} /><span>复制提示词</span></button>
                  </div>
                </section>
              </div> : null}
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

          <div className={`draw-card-results-layout${isDrawCardExperience ? " draw-card-results-layout-no-account" : ""}`}>
            <div className="draw-card-results-main">
              <div className="draw-card-results-grid">
                {displayItems.map((item, index) => {
                  const result = toDisplayResult(item);
                  const isSucceeded = item.status === "succeeded" && result;
                  const isRunning = item.status === "running" || item.status === "queued";
                  const isFailed = item.status === "failed" || item.status === "cancelled";
                  const pendingSeenAtMs = pendingSeenAtRef.current.get(item.jobId) || Date.now();
                  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - pendingSeenAtMs) / 1000));
                  const remainingEstimate = Math.max(5, estimatedWaitSeconds - elapsedSeconds);
                  const waitingText = isFailed
                    ? item.errorMessage || "该风格本轮未能成功生成。"
                    : (estimatedWaitSeconds > 0 && waitingLineIndex === 0)
                      ? `预计还需约 ${remainingEstimate} 秒`
                      : waitingLines[waitingLineIndex] || "结果会在完成后自动出现。";
                  return (
                    <article
                      className={`draw-card-result-card ${result?.isLiked ? "is-in-clip" : ""} ${isRunning ? "is-pending" : ""} ${isFailed ? "is-failed" : ""} ${justFinishedIds.has(item.jobId) ? "is-new" : ""}`}
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
                          {isRunning ? <WaitProgress elapsedSeconds={elapsedSeconds} estimatedSeconds={estimatedWaitSeconds} /> : null}
                          <span>{waitingText}</span>
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
              <div className={`draw-card-results-actions${isDrawCardExperience ? " has-style-picker" : ""}`}>
                <button className="draw-card-secondary draw-card-results-restart draw-card-results-return" disabled={isGenerationInProgress} onClick={returnToHome} type="button">
                  <ArrowLeft size={18} />
                  <span>返回</span>
                </button>
                {isDrawCardExperience ? <button className="draw-card-secondary draw-card-results-restart draw-card-results-change-style" disabled={isGenerationInProgress || isRestoringSessionReference} onClick={openStylePicker} type="button">
                  <Sparkles size={18} />
                  <span>{isRestoringSessionReference ? "读取中" : "换风格"}</span>
                </button> : null}
                <button className="draw-card-secondary draw-card-results-restart draw-card-results-new-photo" disabled={isGenerationInProgress} onClick={requestPhotoChange} type="button">
                  <RefreshCw size={18} />
                  <span>换照片</span>
                </button>
              </div>
              {isDrawCardExperience ? renderClipPanel({ showAccount: false }) : null}
            </div>

            {isDrawCardExperience ? null : renderClipPanel()}
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
                    <button className="draw-card-secondary" disabled={!activeResult.styleId || isGenerationInProgress || isSubmitting} onClick={() => openSameStyle(activeResult.styleId)} type="button"><Sparkles size={16} /><span>做同款</span></button>
                    <button className="draw-card-secondary" onClick={() => { void openDrawShare(activeResult); }} type="button"><Share2 size={16} /><span>分享</span></button>
                    <button className="draw-card-secondary" disabled={styleQrBusy} onClick={() => { void openStyleQr(activeResult); }} type="button"><QrCode size={16} /><span>{styleQrBusy ? "生成中" : "风格码"}</span></button>
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
              {styleQrError ? <p className="error-note draw-card-inline-error">{styleQrError}</p> : null}
            </div>
          </section>
        </div>
      )}

      {styleQrPreview ? (
        <div className="modal-backdrop style-qr-preview-backdrop" onClick={() => setStyleQrPreview(null)} role="presentation">
          <section aria-label={`${styleQrPreview.styleName}风格码`} aria-modal="true" className="style-qr-preview-modal" onClick={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="关闭风格码预览" className="icon-button" onClick={() => setStyleQrPreview(null)} type="button"><X size={18} /></button>
            <h2>扫码做同款</h2>
            <img alt={`${styleQrPreview.styleName}风格码`} className="style-qr-preview-image" src={styleQrPreview.dataUrl} />
            <p className="storage-note">长按二维码保存到手机，或在电脑上右键保存图片。</p>
            <p className="storage-note">好友扫码后可直接做同款，并记为你邀请的新用户。</p>
          </section>
        </div>
      ) : null}

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
        <DrawCardConfigModal
          busy={isSubmitting}
          error={error}
          onClose={() => setShowDrawConfigModal(false)}
          onSubmit={(settings) => startDrawCard(settings)}
        />
      ) : null}

      {showPhotoRequiredModal ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => setShowPhotoRequiredModal(false)} role="presentation">
          <section className="draw-card-confirm-panel" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="请上传照片">
            <button className="icon-button" onClick={() => setShowPhotoRequiredModal(false)} type="button" aria-label="关闭弹窗">
              <X size={18} />
            </button>
            <p className="draw-card-kicker">Photo required</p>
            <h2>请上传照片</h2>
            <p className="storage-note">请上传1张照片。</p>
            <div className="draw-card-confirm-actions">
              <button className="draw-card-primary" onClick={() => setShowPhotoRequiredModal(false)} type="button">我知道了</button>
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

      {showCoinInfo ? <div className="modal-backdrop draw-card-confirm" onClick={() => setShowCoinInfo(false)} role="presentation"><section className="draw-card-confirm-panel body-book-bean-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="我的币"><button className="icon-button" onClick={() => setShowCoinInfo(false)} type="button" aria-label="关闭弹窗"><X size={18} /></button><p className="draw-card-kicker">My coins</p><h2>我的币</h2><p className="body-book-bean-balance">当前剩余 <strong>{visitorState ? visitorState.account?.coinBalance || 0 : "--"}</strong> 币</p><p className="body-book-bean-cost-note">每成功生成 1 张图片消耗 1 币，生成失败不消耗币。</p><ul className="body-book-bean-benefits"><li>购买单价：{formatCurrencyCents(orderConfig?.coinPurchaseUnitPriceCents || 100)} / 币。</li><li>邀请新用户注册可获得 5 币；好友每笔实付订单返 20% 推荐金。</li></ul><div className="body-book-wallet-actions"><button className="draw-card-primary" onClick={openCoinPurchase} type="button">购买币</button><button className="draw-card-secondary" onClick={() => { setShowCoinInfo(false); openReferral(); }} type="button">邀请好友</button><button className="draw-card-secondary" onClick={() => { setShowCoinInfo(false); setShowContactModal(true); }} type="button">联系客服</button></div><label className="body-book-wallet-field"><span>兑换码</span><input disabled={isSubmitting} onChange={(event) => setInviteCode(event.target.value)} placeholder="输入兑换码" value={inviteCode} /></label><div className="body-book-wallet-actions"><button className="draw-card-primary" disabled={isSubmitting || !inviteCode.trim()} onClick={async () => { try { setIsSubmitting(true); const payload = await redeemInviteCode(inviteCode); setVisitorState(payload); setInviteCode(""); setError(""); } catch (nextError) { setError(nextError.message || inviteErrorMessage); } finally { setIsSubmitting(false); } }} type="button">兑换</button></div></section></div> : null}
      {showReferralModal ? <div className="modal-backdrop draw-card-confirm" onClick={() => setShowReferralModal(false)} role="presentation"><section className="draw-card-confirm-panel body-book-referral-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="邀请好友"><button className="icon-button" onClick={() => setShowReferralModal(false)} type="button"><X size={18} /></button><p className="draw-card-kicker">Invite friends</p><h2>邀请好友</h2><p>邀请新用户注册，即得 <strong>5 币</strong>；好友每笔实付订单还可返你 <strong>20% 推荐金</strong>。</p>{referralUrl ? <><label className="body-book-wallet-field"><span>专属邀请链接</span><input readOnly value={referralUrl} /></label><button className="draw-card-primary" onClick={async () => { try { await copyText(referralUrl); setReferralNotice("邀请链接已复制，快去分享给新朋友吧。"); setReferralError(""); } catch (nextError) { setReferralError(nextError.message || "复制失败，请手动复制链接。"); } }} type="button"><Clipboard size={17} /><span>复制邀请链接</span></button></> : null}{referralNotice ? <p className="success-note">{referralNotice}</p> : null}{referralError ? <p className="error-note">{referralError}</p> : null}</section></div> : null}
      {showCoinPurchase ? <CoinPurchaseModal coinCount={coinPurchaseCount} busy={coinPurchaseBusy} error={coinPurchaseError} payment={coinPurchasePayment} purchase={coinPurchase} onClose={() => setShowCoinPurchase(false)} onCountChange={setCoinPurchaseCount} onRestart={restartCoinPurchase} onRetry={() => prepareCoinPurchase(coinPurchase?.id)} onSubmit={submitCoinPurchase} unitPriceCents={orderConfig?.coinPurchaseUnitPriceCents} /> : null}

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
        <div className="modal-backdrop draw-card-confirm" onClick={() => { setShowOriginalUnlockPrompt(false); setOriginalUnlockTarget(null); setOriginalUnlockShareUrl(""); setOriginalUnlockShareError(""); setOriginalUnlockShareNotice(""); }} role="presentation">
          <section className="draw-card-confirm-panel original-download-unlock-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="分享获得下载权限">
            <button className="icon-button original-download-unlock-close" onClick={() => { setShowOriginalUnlockPrompt(false); setOriginalUnlockTarget(null); setOriginalUnlockShareUrl(""); setOriginalUnlockShareError(""); setOriginalUnlockShareNotice(""); }} type="button" aria-label="关闭弹窗">
              <X size={18} />
            </button>
            <p className="draw-card-kicker">Original images</p>
            <h2>分享获得下载权限</h2>
            <ul className="original-download-rules">
              <li>分享给新用户，每位新用户首次打开你的分享链接后，你获得 1 次原图下载权益，可用于任意小画原图（每位新用户只计 1 次）。</li>
              <li>每购买 1 个币或豆豆，获得 1 次免分享下载权益；实体订单每实付满 1 元获得 1 次。</li>
              <li>本站累计消费 20 元，获得永久下载权益。</li>
            </ul>
            {originalUnlockShareBusy ? <p className="storage-note">正在生成分享链接…</p> : null}
            {originalUnlockShareUrl ? (
              <div className="original-download-share-row">
                <label className="body-book-wallet-field">
                  <span>分享链接</span>
                  <input readOnly value={originalUnlockShareUrl} />
                </label>
                <button className="draw-card-primary" disabled={originalUnlockShareBusy} onClick={async () => {
                  try {
                    await copyText(formatShareCopy(originalUnlockShareUrl, "draw"));
                    setOriginalUnlockShareNotice("分享链接已复制，可发送给好友。");
                    setOriginalUnlockShareError("");
                  } catch (nextError) {
                    setOriginalUnlockShareError(nextError.message || "复制失败，请手动复制链接。");
                    setOriginalUnlockShareNotice("");
                  }
                }} type="button">
                  <Clipboard size={17} />
                  <span>复制分享链接</span>
                </button>
              </div>
            ) : null}
            {!originalUnlockShareUrl ? <div className="draw-card-confirm-actions">
              <button className="draw-card-primary" disabled={!originalUnlockTarget || originalUnlockShareBusy} onClick={async () => {
                try {
                  const nextUrl = originalUnlockShareUrl || await requestOriginalUnlockShare(originalUnlockTarget);
                  if (!nextUrl) return;
                  await copyText(formatShareCopy(nextUrl, "draw"));
                  setOriginalUnlockShareNotice("分享链接已复制，可发送给好友。");
                  setOriginalUnlockShareError("");
                } catch (nextError) {
                  setOriginalUnlockShareError(nextError.message || "复制失败，请手动复制链接。");
                  setOriginalUnlockShareNotice("");
                }
              }} type="button">
                <Clipboard size={17} />
                <span>复制分享链接</span>
              </button>
            </div> : null}
            {originalUnlockShareNotice ? <p className="success-note">{originalUnlockShareNotice}</p> : null}
            {originalUnlockShareError ? <p className="error-note">{originalUnlockShareError}</p> : null}
          </section>
        </div>
      ) : null}

      {drawShareTarget ? <div className="modal-backdrop draw-card-confirm" onClick={() => !drawShareBusy && setDrawShareTarget(null)} role="presentation"><section className="draw-card-confirm-panel body-book-share-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="分享小画"><button className="icon-button" disabled={drawShareBusy} onClick={() => setDrawShareTarget(null)} type="button"><X size={18} /></button><p className="draw-card-kicker">Share your artwork</p><h2>分享给好友</h2><p>好友可查看压缩预览。每位新访客首次打开你的任意小画分享链接后，你获得 1 次原图下载权益（每位新用户只计 1 次），可用于任意小画原图。</p>{drawShareUrl ? <label className="body-book-wallet-field"><span>分享链接</span><input readOnly value={drawShareUrl} /></label> : null}{drawShareUrl ? <div className="draw-card-confirm-actions"><button className="draw-card-primary" disabled={drawShareBusy} onClick={async () => { try { await copyText(formatShareCopy(drawShareUrl, "draw")); setDrawShareCopied(true); setDrawShareNotice("链接已复制，可发送给好友。"); setDrawShareError(""); if (drawShareCopiedTimeoutRef.current) window.clearTimeout(drawShareCopiedTimeoutRef.current); drawShareCopiedTimeoutRef.current = window.setTimeout(() => setDrawShareCopied(false), 2000); } catch (nextError) { setDrawShareError(nextError.message || "复制失败，请手动复制链接。"); } }} type="button"><Clipboard size={17} /><span>{drawShareCopied ? "已复制" : "复制链接"}</span></button><button className="draw-card-secondary" disabled={drawShareBusy} onClick={() => { if (window.confirm("停止分享后，已复制的链接将立即失效。确定停止分享吗？")) void closeDrawShare(); }} type="button">停止分享</button></div> : null}{drawShareNotice ? <p className="success-note">{drawShareNotice}</p> : null}{drawShareError ? <p className="error-note">{drawShareError}</p> : null}</section></div> : null}

      {showPhotoChangeConfirm ? (
        <div className="modal-backdrop draw-card-confirm" onClick={() => setShowPhotoChangeConfirm(false)} role="presentation">
          <section className="draw-card-confirm-panel draw-card-photo-change-confirm" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="确认换照片">
            <p className="draw-card-kicker">New photo</p>
            <h2>换张照片</h2>
            <p className="storage-note">换张照片后，本轮未加入卡夹的结果将不再显示。请先确认喜欢的图片已加入卡夹。</p>
            <div className="draw-card-confirm-actions">
              <button className="draw-card-secondary" onClick={() => setShowPhotoChangeConfirm(false)} type="button">取消</button>
              <button className="draw-card-primary" onClick={confirmResetExperience} type="button">确定</button>
            </div>
          </section>
        </div>
      ) : null}

      {balanceAlert ? <BalanceInsufficientModal message={balanceAlert} onClose={() => setBalanceAlert("")} /> : null}

      {showAuthModal ? (
        <AuthModal
          onAuthenticated={async (account) => {
            setShowAuthModal(false);
            const nextVisitorState = await fetchVisitorState().catch(() => null);
            setVisitorState(nextVisitorState || ((current) => current ? { ...current, authenticated: true, account } : current));
            setOrderForm((current) => fillOrderAddressFromSaved(current, account));
            if (pendingReferralRef.current) {
              pendingReferralRef.current = false;
              await showReferralDialog();
            }
            if (pendingCoinPurchaseRef.current) {
              pendingCoinPurchaseRef.current = false;
              setCoinPurchase(null);
              setCoinPurchasePayment(null);
              setCoinPurchaseError("");
              setShowCoinPurchase(true);
            }
            const pendingDrawShare = pendingDrawShareRef.current;
            pendingDrawShareRef.current = null;
            if (pendingDrawShare) await openDrawShare(pendingDrawShare);
            const pendingOriginalDownload = pendingOriginalDownloadRef.current;
            pendingOriginalDownloadRef.current = null;
            if (pendingOriginalDownload) await handleDownloadClipOriginal(pendingOriginalDownload);
          }}
          onClose={() => { pendingReferralRef.current = false; pendingCoinPurchaseRef.current = false; pendingDrawShareRef.current = null; pendingOriginalDownloadRef.current = null; setShowAuthModal(false); }}
        />
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
              {usesFridgeMagnetRedemption ? <p>将使用实体冰箱贴兑换权益 {totalOrderItemCount} 个（剩余 {fridgeMagnetRedemptionCount} 个）</p> : fridgeMagnetRedemptionCount ? <p>当前有 {fridgeMagnetRedemptionCount} 个实体冰箱贴兑换权益；本次数量不足以覆盖整单。</p> : null}
              <strong>实付 {formatCurrencyCents(orderPayablePreviewCents)}</strong>
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
                <span>{isCreatingOrder ? "提交中" : formatPaymentButtonLabel(orderPayablePreviewCents)}</span>
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
              <p>应付金额 {formatCurrencyCents(Number(manualPaymentOrder.order.payableCents ?? manualPaymentOrder.order.totalCents ?? 0))}</p>
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
    title: style?.title || style?.name || getStyleTags(style).join(" / ") || "",
    tags: getStyleTags(style).join("，"),
    subjectType: style?.subjectType || "both",
    drawCardEnabled: style?.drawCardEnabled !== false,
    drawCardWeight: Number(style?.drawCardWeight ?? DEFAULT_DRAW_CARD_WEIGHT),
    prompt: style?.prompt || "",
    useStyleImageAsReference: Boolean(style?.useStyleImageAsReference)
  };
}

function getStyleTags(style) {
  return Array.isArray(style?.tags) ? style.tags.filter(Boolean) : [];
}

function getStyleDisplayName(style) {
  return String(style?.title || style?.name || getStyleTags(style).join("、") || style?.id || "").trim();
}

function makeSameStyleUrl(styleId) {
  const safeStyleId = String(styleId || "").trim();
  if (!safeStyleId) throw new Error("风格 ID 无效，无法生成风格码。");
  const url = new URL("/", window.location.origin);
  url.searchParams.set("sameStyleId", safeStyleId);
  return url.toString();
}

async function createStyleQrPreview(style) {
  const styleId = String(style?.id || "").trim();
  const styleName = getStyleDisplayName(style);
  if (!styleId || !styleName) throw new Error("风格信息不完整，无法生成风格码。");
  return {
    styleName,
    dataUrl: await createLabeledQrPngDataUrl(makeSameStyleUrl(styleId), styleName, {
    errorCorrectionLevel: "H",
    margin: 4,
    pixelSize: 1024
    })
  };
}

function GalleryPage({ onCreateStyle, onDeleteStyle, onGenerate, onRefreshStyles, onReorderStyles, onStyleChange, onUploadImage, onViewPrompt, searchQuery, onSearchChange, styles }) {
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [editingId, setEditingId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState("");
  const [actionError, setActionError] = useState("");
  const [styleQrPreview, setStyleQrPreview] = useState(null);
  const hasRefreshedStyles = useRef(false);
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
    if (hasRefreshedStyles.current) return;
    hasRefreshedStyles.current = true;
    void onRefreshStyles?.();
  }, [onRefreshStyles]);

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
    setActionError("");
    try {
      const created = await onCreateStyle();
      if (!created?.id) return;
      setEditingId(created.id);
      setDrafts((current) => ({
        ...current,
        [created.id]: createStyleDraft(created)
      }));
    } catch (error) {
      setActionError(error.message || "新增风格失败，请稍后重试。");
    }
  }

  function updateDraft(style, patch) {
    setDrafts((current) => ({
      ...current,
      [style.id]: { ...(current[style.id] || createStyleDraft(style)), ...patch }
    }));
  }

  async function saveStyle(style) {
    setSavingId(style.id);
    setActionError("");
    try {
      await onStyleChange(style.id, drafts[style.id] || createStyleDraft(style));
    } catch (error) {
      setActionError(error.message || "保存风格失败，请稍后重试。");
    } finally {
      setSavingId("");
    }
  }

  async function handleFile(style, file, variant = "") {
    if (!file) return;
    setSavingId(style.id);
    setActionError("");
    try {
      await onUploadImage(style.id, file, variant);
    } catch (error) {
      setActionError(error.message || "上传图片失败，请稍后重试。");
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

  async function handleDownloadStyleQr(style) {
    setActionError("");
    try {
      setStyleQrPreview(await createStyleQrPreview(style));
    } catch (error) {
      setActionError(error.message || "下载风格码失败，请稍后再试。");
    }
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
          <label className="search-box gallery-search-box">
            <Search size={18} />
            <input aria-label="搜索标签或提示词" onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索标签、风格或提示词" value={searchQuery} />
          </label>
          <p className="storage-note">直接拖拽卡片左上角手柄可以排序，点击“编辑”会弹出窗口修改风格内容。</p>
        </div>
        {actionError ? <p className="error-note">{actionError}</p> : null}
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
                  {getStyleTags(style).map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="card-actions gallery-actions">
                  <button
                    aria-label="编辑风格"
                    aria-expanded={isEditing}
                    className="copy-button"
                    onClick={() => setEditingId(style.id)}
                    type="button"
                  >
                    <Pencil size={18} />
                    <span>编辑</span>
                  </button>
                  <button aria-label="查看提示词" className="secondary-button" onClick={() => onViewPrompt(style)} type="button">
                    <Eye size={18} />
                    <span>查看提示词</span>
                  </button>
                  <button aria-label="AI 生图" className="generate-button" onClick={() => onGenerate(style)} type="button">
                    <Sparkles size={18} />
                    <span>AI 生图</span>
                  </button>
                  {style.drawCardEnabled !== false ? <button aria-label="下载风格码" className="secondary-button" onClick={() => handleDownloadStyleQr(style)} type="button">
                    <QrCode size={18} />
                    <span>下载风格码</span>
                  </button> : null}
                </div>
              </article>
            );
          })}
          {canLoadMore ? <button className="progressive-loader" onClick={loadMore} ref={sentinelRef} type="button">Load more styles</button> : null}
        </div>
      </section>

      {styleQrPreview ? <div className="modal-backdrop style-qr-preview-backdrop" onClick={() => setStyleQrPreview(null)} role="presentation">
        <section aria-label={`${styleQrPreview.styleName}风格码`} aria-modal="true" className="style-qr-preview-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <button aria-label="关闭风格码预览" className="icon-button" onClick={() => setStyleQrPreview(null)} type="button"><X size={18} /></button>
          <h2>{styleQrPreview.styleName}</h2>
          <img alt={`${styleQrPreview.styleName}风格码`} className="style-qr-preview-image" src={styleQrPreview.dataUrl} />
          <p className="storage-note">请长按二维码保存到手机，或在电脑上右键保存图片。</p>
        </section>
      </div> : null}

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
                  {getStyleTags(activeEditingStyle).map((tag) => (
                    <span className="tag" key={tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="style-editor-preview">
              <div className="image-frame">
                <StylePreviewImage alt={`${getStyleDisplayName(activeEditingStyle)}示例图`} previewImage={activeEditingStyle.personGalleryImage || activeEditingStyle.personImage || activeEditingStyle.petGalleryImage || activeEditingStyle.petImage} previewImageUpdatedAt={activeEditingStyle.personImageUpdatedAt || activeEditingStyle.petImageUpdatedAt} style={activeEditingStyle} />
              </div>
              <p className="storage-note">图片保存在 public/style-previews/{activeEditingStyle.id}/cover.*，标题、标签、抽卡开关、抽卡权重和提示词保存在 data/styles.json。</p>
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
                <input accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => handleFile(activeEditingStyle, event.target.files?.[0], "person")} type="file" />
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
            {actionError ? <p className="error-note">{actionError}</p> : null}
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

function StylePreviewImage({ alt, className = "", preferOriginal = false, previewImage = "", previewImageUpdatedAt = null, style }) {
  const image = previewImage || style?.image;
  const galleryImage = previewImage || style?.galleryImage;
  const imageUpdatedAt = previewImageUpdatedAt || style?.imageUpdatedAt;
  const candidates = (preferOriginal
    ? [image, galleryImage]
    : [galleryImage, image]
  )
    .map((item) => cacheBust(item, imageUpdatedAt))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [galleryImage, image, imageUpdatedAt, preferOriginal, style?.id]);

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
              {getStyleTags(style).map((tag) => (
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

function WaitProgress({ elapsedSeconds, estimatedSeconds }) {
  const target = Math.max(10, Number(estimatedSeconds) || 120);
  const percent = Math.min(92, Math.max(4, Math.round((elapsedSeconds / target) * 100)));
  return (
    <div className="draw-card-wait-progress" role="status" aria-live="polite">
      <div className="draw-card-wait-progress-track">
        <div className="draw-card-wait-progress-bar" style={{ width: `${percent}%` }} />
      </div>
      <span className="draw-card-wait-progress-caption">已等待 {elapsedSeconds}s</span>
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

function AdminStylePublicationsPage() {
  const [items, setItems] = useState([]);
  const [tags, setTags] = useState(STYLE_PUBLICATION_TAGS);
  const [draftTags, setDraftTags] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadPublications() {
    setIsLoading(true);
    try {
      const payload = await refreshAdminStylePublications();
      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setItems(nextItems);
      setTags(Array.isArray(payload.tags) && payload.tags.length ? payload.tags : STYLE_PUBLICATION_TAGS);
      setDraftTags(Object.fromEntries(nextItems.map((item) => [item.publicationId, Array.isArray(item.tags) ? item.tags : []])));
      setError("");
    } catch (nextError) {
      setError(nextError.message || "读取风格发布失败。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadPublications(); }, []);

  function toggleTag(publicationId, tag) {
    setDraftTags((current) => {
      const selected = current[publicationId] || [];
      return { ...current, [publicationId]: selected.includes(tag) ? selected.filter((item) => item !== tag) : [...selected, tag] };
    });
  }

  async function saveTags(item) {
    const nextTags = draftTags[item.publicationId] || [];
    if (!nextTags.length) { setError("每条风格发布至少保留一个标签。"); return; }
    setBusyId(item.publicationId);
    try {
      const updated = await updateAdminStylePublication(item.publicationId, nextTags);
      setItems((current) => current.map((entry) => entry.publicationId === item.publicationId ? { ...entry, ...updated } : entry));
      setNotice("标签已更新。");
      setError("");
    } catch (nextError) { setError(nextError.message || "更新标签失败。"); }
    finally { setBusyId(""); }
  }

  async function removePublication(item) {
    if (!window.confirm(`确定删除“${item.styleName || "未命名风格"}”的发布记录吗？`)) return;
    setBusyId(item.publicationId);
    try {
      await deleteAdminStylePublication(item.publicationId);
      setItems((current) => current.filter((entry) => entry.publicationId !== item.publicationId));
      setNotice("发布记录已删除。");
      setError("");
    } catch (nextError) { setError(nextError.message || "删除风格发布失败。"); }
    finally { setBusyId(""); }
  }

  return <section className="admin-style-publications-page">
    <div className="task-toolbar">
      <div><p className="eyebrow">Style publications</p><h2>风格发布</h2><p className="storage-note">管理公开风格效果、原图、提示词和发布标签。</p></div>
      <button className="secondary-button" onClick={() => void loadPublications()} type="button"><RefreshCw size={18} /><span>{isLoading ? "刷新中" : "刷新"}</span></button>
    </div>
    {error ? <p className="error-note">{error}</p> : null}
    {notice ? <p className="success-note">{notice}</p> : null}
    {!isLoading && !items.length ? <p className="empty-note">还没有风格发布记录。</p> : null}
    <div className="admin-style-publication-list">
      {items.map((item) => {
        const selectedTags = draftTags[item.publicationId] || [];
        const effectUrl = item.effectImageUrl || item.sourceEffectImageUrl;
        const referenceUrl = item.referenceImageUrl || item.sourceReferenceImageUrl;
        return <article className="admin-style-publication-card" key={item.publicationId}>
          <div className="admin-style-publication-images">
            <figure><img alt="发布效果图" src={effectUrl} /><figcaption>效果图</figcaption></figure>
            <figure><img alt="用户原图" src={referenceUrl} /><figcaption>原图</figcaption></figure>
          </div>
          <div className="admin-style-publication-info">
            <div className="task-meta-row"><strong>{item.styleName || "未命名风格"}</strong><span>风格 ID：{item.styleId || "未记录"}</span><span>任务：{item.jobId || "未记录"}</span></div>
            <p className="task-prompt">{item.prompt || "未记录提示词"}</p>
            <div className="admin-style-publication-tags">{tags.map((tag) => <button aria-pressed={selectedTags.includes(tag)} className={`style-publication-tag ${selectedTags.includes(tag) ? "is-selected" : ""}`} key={tag} onClick={() => toggleTag(item.publicationId, tag)} type="button">{selectedTags.includes(tag) ? <Check size={14} /> : null}<span>{tag}</span></button>)}</div>
            <div className="admin-style-publication-actions"><button className="copy-button" disabled={busyId === item.publicationId} onClick={() => void saveTags(item)} type="button"><Pencil size={17} /><span>{busyId === item.publicationId ? "保存中" : "保存标签"}</span></button><button className="danger-button" disabled={busyId === item.publicationId} onClick={() => void removePublication(item)} type="button"><Trash2 size={17} /><span>删除</span></button></div>
          </div>
        </article>;
      })}
    </div>
  </section>;
}

function ImageJobsPage({ onStylePreviewReplaced }) {
  const [jobs, setJobs] = useState([]);
  const [jobTotal, setJobTotal] = useState(0);
  const [jobQuery, setJobQuery] = useState(DEFAULT_IMAGE_JOB_QUERY);
  const [searchInput, setSearchInput] = useState(DEFAULT_IMAGE_JOB_QUERY.search);
  const [dateInput, setDateInput] = useState(DEFAULT_IMAGE_JOB_QUERY.date);
  const [likedOnlyInput, setLikedOnlyInput] = useState(DEFAULT_IMAGE_JOB_QUERY.likedOnly);
  const [ownerInput, setOwnerInput] = useState(DEFAULT_IMAGE_JOB_QUERY.owner);
  const [ownerOptions, setOwnerOptions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [styleQrPreview, setStyleQrPreview] = useState(null);
  const [editingJob, setEditingJob] = useState(null);
  const [previewingJob, setPreviewingJob] = useState(null);
  const [replacingStylePreviewKey, setReplacingStylePreviewKey] = useState("");
  const [publishingJob, setPublishingJob] = useState(null);
  const [publishingTags, setPublishingTags] = useState([]);
  const [publishingBusy, setPublishingBusy] = useState(false);
  const [creatingStyleJob, setCreatingStyleJob] = useState(null);
  const [newStyleName, setNewStyleName] = useState("");
  const [creatingStyleBusy, setCreatingStyleBusy] = useState(false);
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
      setOwnerOptions(jobPayload.ownerOptions || []);
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

  async function deleteJob(jobId) {
    try {
      await deleteImageJob(jobId);
      await loadDashboard(queryRef.current, { showLoading: false });
      setError("");
    } catch (nextError) {
      setError(nextError.message);
    }
  }

  async function replaceStylePreview(job) {
    if (!job?.jobId || !job?.stylePreviewMatch) return;

    const replacementKey = `${job.jobId}:example`;
    const variantLabel = "示例图";
    setReplacingStylePreviewKey(replacementKey);
    setError("");
    setNotice("");
    try {
      await replaceImageJobStylePreview(job.jobId, "person");
      await onStylePreviewReplaced?.();
      await loadDashboard(queryRef.current, { showLoading: false });
      setNotice(`已用当前任务图片替换“${job.stylePreviewMatch.name}”的${variantLabel}效果图。`);
    } catch (nextError) {
      setError(nextError.message || "替换风格效果图失败。");
    } finally {
      setReplacingStylePreviewKey("");
    }
  }

  async function openPublicationModal(job) {
    setPublishingJob(job);
    setPublishingTags(Array.isArray(job?.stylePublication?.tags) ? job.stylePublication.tags : []);
    setError("");
    setNotice("");
  }

  function togglePublishingTag(tag) {
    setPublishingTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  async function publishStyle() {
    if (!publishingJob?.jobId) return;
    if (!publishingTags.length) {
      setError("请至少选择一个发布标签。");
      return;
    }
    setPublishingBusy(true);
    setError("");
    try {
      await publishImageJobStyle(publishingJob.jobId, publishingTags);
      await loadDashboard(queryRef.current, { showLoading: false });
      setPublishingJob(null);
      setNotice("风格已发布，重复发布会按本次所选标签覆盖。");
    } catch (nextError) {
      setError(nextError.message || "发布风格失败。");
    } finally {
      setPublishingBusy(false);
    }
  }

  function openCreateStyleModal(job) {
    setCreatingStyleJob(job);
    setNewStyleName("");
    setError("");
    setNotice("");
  }

  async function createNewStyleFromJob() {
    if (!creatingStyleJob?.jobId) return;
    const styleName = newStyleName.trim();
    if (!styleName) {
      setError("请输入风格名称。");
      return;
    }
    setCreatingStyleBusy(true);
    setError("");
    setNotice("");
    try {
      await createImageJobStyle(creatingStyleJob.jobId, styleName);
      await onStylePreviewReplaced?.();
      await loadDashboard(queryRef.current, { showLoading: false });
      setCreatingStyleJob(null);
      setNewStyleName("");
      setNotice(`新风格“${styleName}”已创建，该任务现已匹配图库风格。`);
    } catch (nextError) {
      setError(nextError.message || "创建新风格失败。");
    } finally {
      setCreatingStyleBusy(false);
    }
  }

  async function handleDownloadStyleQr(styleMatch) {
    setError("");
    try {
      setStyleQrPreview(await createStyleQrPreview(styleMatch));
    } catch (nextError) {
      setError(nextError.message || "下载风格码失败，请稍后再试。");
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
        setOwnerOptions(jobPayload.ownerOptions || []);
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
      likedOnly: likedOnlyInput,
      owner: ownerInput
    });
  }

  function handleResetFilters() {
    setSearchInput(DEFAULT_IMAGE_JOB_QUERY.search);
    setDateInput(DEFAULT_IMAGE_JOB_QUERY.date);
    setLikedOnlyInput(DEFAULT_IMAGE_JOB_QUERY.likedOnly);
    setOwnerInput(DEFAULT_IMAGE_JOB_QUERY.owner);
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
    <section className="task-page image-jobs-page" aria-label="AI 生图任务记录">
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
          <label className="field-label task-query-field">
            发起用户
            <select onChange={(event) => setOwnerInput(event.target.value)} value={ownerInput}>
              <option value="">全部用户与访客</option>
              {ownerOptions.map((owner) => <option key={owner.key} value={owner.key}>{owner.type === "visitor" ? "访客 · " : "用户 · "}{owner.name}</option>)}
            </select>
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
      {notice && <p className="success-note">{notice}</p>}
      {!isLoading && !jobs.length && <p className="empty-note">还没有符合条件的生图任务。</p>}

      <div className="task-list">
        {jobs.map((job) => {
          const imageSource = job.result?.previewUrl || job.result?.thumbnailUrl || job.result?.imageDataUrl || job.result?.imageUrl;
          const providerDiagnostics = formatImageJobProviderDiagnostics(job);
          const stylePreviewMatch = job.stylePreviewMatch;
          const styleQrMatch = stylePreviewMatch?.drawCardEnabled ? stylePreviewMatch : null;
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
                  <span className="task-owner-badge" title={job.owner?.email || job.owner?.visitorId || ""}>{job.owner?.type === "visitor" ? "访客" : "用户"}：{job.owner?.name || "未识别"}</span>
                  {job.styleName ? <span>{job.styleName}</span> : null}
                  {job.styleGroupName ? <span>组：{job.styleGroupName}</span> : null}
                  <span>{modeLabel(job.mode)}</span>
                  <span>{job.provider?.name || "未记录接口"}</span>
                  <span>{formatDateTime(job.createdAt)}</span>
                  {job.durationSeconds !== null && job.durationSeconds !== undefined ? <span>耗时 {formatDuration(job.durationSeconds)}</span> : null}
                  {job.totalTokens ? <span>{job.totalTokens} tokens</span> : null}
                  {job.showcase ? <>
                    <span className="task-showcase-badge">成书效果样书</span>
                    <span>主题：{job.showcase.themeName || job.showcase.themeId}</span>
                    <span>第 {Number(job.showcase.pageOrder || 0) + 1} 页 · {job.showcase.pageTitle || job.showcase.pageKey}</span>
                    {job.showcaseProgress ? <span>成功 {job.showcaseProgress.succeeded} 张 · 失败 {job.showcaseProgress.failed} 张 · 剩余 {job.showcaseProgress.remaining} 张</span> : null}
                    {Number(job.showcase.retryCount || 0) > 0 ? <span>自动重试 {job.showcase.retryCount}/1</span> : null}
                  </> : null}
                </div>
                <p className="task-prompt">{job.prompt || "未记录提示词"}</p>
                {stylePreviewMatch ? <p className="storage-note task-style-match-note">提示词匹配图库风格：<strong>{stylePreviewMatch.name}</strong></p> : null}
                <p className="storage-note">
                  {job.message || statusLabel(job.status)}
                  {job.referenceCount ? `，参考图 ${job.referenceCount} 张` : ""}
                  {job.completedAt ? `，完成于 ${formatDateTime(job.completedAt)}` : ""}
                </p>
                {providerDiagnostics ? <p className="storage-note">诊断：{providerDiagnostics}</p> : null}
              </div>
              <div className="task-actions">
                <button className="secondary-button" disabled={!job.result?.imageUrl} onClick={() => setPreviewingJob(job)} type="button">
                  <Eye size={18} />
                  <span>查看</span>
                </button>
                {!stylePreviewMatch ? <>
                  <button className="secondary-button" disabled={!job.result?.imageUrl} onClick={() => downloadAdminJobResult(job.jobId)} type="button">
                    <Download size={18} />
                    <span>下载</span>
                  </button>
                  <button className="copy-button" disabled={!job.result?.imageUrl} onClick={() => openCreateStyleModal(job)} type="button">
                    <Plus size={18} />
                    <span>创建新风格</span>
                  </button>
                </> : null}
                {styleQrMatch ? <button className="secondary-button" onClick={() => handleDownloadStyleQr(styleQrMatch)} type="button">
                  <QrCode size={18} />
                  <span>下载风格码</span>
                </button> : null}
                {stylePreviewMatch ? <>
                  <button className="secondary-button" disabled={!job.result?.imageUrl || Boolean(replacingStylePreviewKey)} onClick={() => replaceStylePreview(job)} type="button">
                    {replacingStylePreviewKey === `${job.jobId}:example` ? <LoaderCircle className="spin" size={18} /> : <ImageUp size={18} />}
                    <span>{replacingStylePreviewKey === `${job.jobId}:example` ? "替换中" : "替换示例图"}</span>
                  </button>
                  <button className="copy-button" disabled={!job.result?.imageUrl} onClick={() => openPublicationModal(job)} type="button">
                    <Sparkles size={18} />
                    <span>发布</span>
                  </button>
                </> : null}
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
      {styleQrPreview ? <div className="modal-backdrop style-qr-preview-backdrop" onClick={() => setStyleQrPreview(null)} role="presentation">
        <section aria-label={`${styleQrPreview.styleName}风格码`} aria-modal="true" className="style-qr-preview-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <button aria-label="关闭风格码预览" className="icon-button" onClick={() => setStyleQrPreview(null)} type="button"><X size={18} /></button>
          <h2>{styleQrPreview.styleName}</h2>
          <img alt={`${styleQrPreview.styleName}风格码`} className="style-qr-preview-image" src={styleQrPreview.dataUrl} />
          <p className="storage-note">请长按二维码保存到手机，或在电脑上右键保存图片。</p>
        </section>
      </div> : null}
      {creatingStyleJob ? <div className="modal-backdrop" onClick={() => !creatingStyleBusy && setCreatingStyleJob(null)} role="presentation">
        <section aria-label="创建新风格" aria-modal="true" className="prompt-modal style-publication-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <button aria-label="关闭创建新风格弹窗" className="icon-button" disabled={creatingStyleBusy} onClick={() => setCreatingStyleJob(null)} type="button"><X size={20} /></button>
          <div className="modal-head"><div><p className="eyebrow">New style</p><h2>创建新风格</h2><p className="storage-note">将基于当前任务的提示词与效果图创建一个新的图库风格。</p></div></div>
          <label className="field-label">
            风格名称
            <input autoFocus disabled={creatingStyleBusy} maxLength={40} onChange={(event) => setNewStyleName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !creatingStyleBusy) createNewStyleFromJob(); }} placeholder="例如：波普红底插画" type="text" value={newStyleName} />
          </label>
          <div className="modal-actions">
            <button className="secondary-button" disabled={creatingStyleBusy} onClick={() => setCreatingStyleJob(null)} type="button">取消</button>
            <button className="copy-button" disabled={creatingStyleBusy || !newStyleName.trim()} onClick={createNewStyleFromJob} type="button">{creatingStyleBusy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}<span>{creatingStyleBusy ? "创建中" : "创建"}</span></button>
          </div>
        </section>
      </div> : null}
      {publishingJob ? <div className="modal-backdrop" onClick={() => !publishingBusy && setPublishingJob(null)} role="presentation">
        <section aria-label="发布风格" aria-modal="true" className="prompt-modal style-publication-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <button aria-label="关闭发布弹窗" className="icon-button" disabled={publishingBusy} onClick={() => setPublishingJob(null)} type="button"><X size={20} /></button>
          <div className="modal-head"><div><p className="eyebrow">Style publication</p><h2>发布风格</h2><p className="storage-note">请选择至少一个标签；再次发布会使用本次选择覆盖已有标签。</p></div></div>
          <div className="style-publication-tag-list" role="group" aria-label="发布标签">
            {STYLE_PUBLICATION_TAGS.map((tag) => <button aria-pressed={publishingTags.includes(tag)} className={`style-publication-tag ${publishingTags.includes(tag) ? "is-selected" : ""}`} key={tag} onClick={() => togglePublishingTag(tag)} type="button">{publishingTags.includes(tag) ? <Check size={15} /> : null}<span>{tag}</span></button>)}
          </div>
          <div className="modal-actions">
            <button className="secondary-button" disabled={publishingBusy} onClick={() => setPublishingJob(null)} type="button">取消</button>
            <button className="copy-button" disabled={publishingBusy || !publishingTags.length} onClick={publishStyle} type="button">{publishingBusy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}<span>{publishingBusy ? "发布中" : "确认发布"}</span></button>
          </div>
        </section>
      </div> : null}
      {editingJob && <JobEditModal job={editingJob} onClose={() => setEditingJob(null)} />}
      {previewingJob ? <div className="modal-backdrop" onClick={() => setPreviewingJob(null)} role="presentation">
        <section aria-label="生成图片预览" aria-modal="true" className="prompt-modal image-job-preview-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <button aria-label="关闭预览" className="icon-button" onClick={() => setPreviewingJob(null)} type="button"><X size={20} /></button>
          <div className="modal-head">
            <div>
              <p className="eyebrow">Generated image</p>
              <h2>{previewingJob.styleName || "生成图片"}</h2>
            </div>
          </div>
          <img alt={previewingJob.styleName || "AI 生成结果"} onError={() => { setPreviewingJob(null); setError("加载生成图片失败，请稍后重试。"); }} src={`/api/admin/image-jobs/${encodeURIComponent(previewingJob.jobId)}/result`} />
          <div className="image-job-preview-actions">
            <span className="storage-note">手机上可长按图片保存。</span>
            <button className="draw-card-primary" onClick={() => downloadAdminJobResult(previewingJob.jobId)} type="button"><Download size={17} /><span>下载原图</span></button>
          </div>
        </section>
      </div> : null}
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
              <h2>创建风格组</h2>
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
            if (!response.ok) {
              const fetchError = new Error("Failed to fetch original reference");
              fetchError.status = response.status;
              throw fetchError;
            }
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
      } catch (error) {
        if (!isActive) return;
        if (error?.status === 401) {
          setError("后台登录已失效，请刷新页面并重新登录后再编辑。");
        } else {
          setError("原始参考图加载失败，请手动重新上传。");
        }
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

const STYLE_PUBLICATION_TAGS = ["推荐", "儿童", "宠物", "绘画", "设计", "幽默"];

async function refreshStylePublications(tag = "") {
  const query = tag ? `?tag=${encodeURIComponent(tag)}` : "";
  const response = await fetch(`/api/style-publications${query}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取风格发布失败。");
  return payload;
}

async function publishImageJobStyle(jobId, tags) {
  const response = await fetch(`/api/image-jobs/${encodeURIComponent(jobId)}/style-publication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "发布风格失败。");
  return payload.publication;
}

async function createImageJobStyle(jobId, title) {
  const response = await fetch(`/api/image-jobs/${encodeURIComponent(jobId)}/style`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "创建新风格失败。");
  return payload;
}

async function refreshAdminStylePublications() {
  const response = await fetch("/api/admin/style-publications");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取风格发布失败。");
  return payload;
}

async function updateAdminStylePublication(publicationId, tags) {
  const response = await fetch(`/api/admin/style-publications/${encodeURIComponent(publicationId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tags })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "更新风格发布标签失败。");
  return payload.publication;
}

async function deleteAdminStylePublication(publicationId) {
  const response = await fetch(`/api/admin/style-publications/${encodeURIComponent(publicationId)}`, { method: "DELETE" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "删除风格发布失败。");
  }
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

async function createReferralLink(target = "") {
  const response = await fetch("/api/referrals/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(target ? { target } : {})
  });
  const payload = await readAuthJsonResponse(response, { message: "创建邀请链接失败。" });
  if (!response.ok) throw new Error(payload.message || "创建邀请链接失败。");
  return payload;
}

async function createStyleInviteLink(styleId) {
  const response = await fetch("/api/referrals/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target: "draw-card", styleId })
  });
  const payload = await readAuthJsonResponse(response, { message: "生成风格码失败。" });
  if (!response.ok) throw new Error(payload.message || "生成风格码失败。");
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

async function recordReferralVisit(token) {
  const response = await fetch("/api/referrals/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token })
  });
  if (!response.ok) throw new Error("记录推荐访问失败。");
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

async function testAdminApiProviderConnection(provider) {
  const response = await fetch("/api/admin/api-providers/test/connection", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "供应商连通性测试失败。");
  return data;
}

async function testAdminApiProviderGeneration(provider, { prompt, reference, size }) {
  const formData = new FormData();
  formData.append("provider", JSON.stringify(provider));
  formData.append("prompt", prompt);
  formData.append("size", size);
  if (reference) formData.append("reference", reference);
  const response = await fetch("/api/admin/api-providers/test/generation", { method: "POST", body: formData });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "供应商生图测试失败。");
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

async function fetchMyCoinPurchases() {
  const response = await fetch("/api/coin-purchases");
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "读取购买币记录失败。");
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

async function createCoinPurchase(payload) {
  const response = await fetch("/api/coin-purchases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "创建币购买单失败。");
  return data;
}

async function fetchCoinPurchase(purchaseId) {
  const response = await fetch(`/api/coin-purchases/${encodeURIComponent(purchaseId)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "读取币购买单失败。");
  return data;
}

async function payCoinPurchase(purchaseId, payload = {}) {
  const response = await fetch(`/api/coin-purchases/${encodeURIComponent(purchaseId)}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "发起币购买支付失败。");
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

async function fetchMyOrders(scope = "") {
  const query = scope ? `?scope=${encodeURIComponent(scope)}` : "";
  const response = await fetch(`/api/my/orders${query}`);
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
  const response = await fetch("/api/redemption-codes/redeem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "兑换码兑换失败。");
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

async function deleteAdminUser(userId) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "删除用户失败。");
  return payload;
}

async function fetchAdminUserClipItems(userId) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/clip-items`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取用户图片资产失败。");
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

async function adjustAdminUserWallet(userId, delta, currency, remark, isRechargeRefund = false) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta, currency, remark, isRechargeRefund })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "调整余额失败。");
  return payload;
}

async function adjustAdminUserDownloadAllowance(userId, delta, remark) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/download-allowance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ delta, remark })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "调整下载额度失败。");
  return payload;
}

async function exportAdminUserDetails(userId) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/export-details`, { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "导出用户明细失败。");
  }
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("spreadsheetml")) throw new Error("导出文件格式异常，请刷新并重新登录后台后再试。");
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = parseDownloadFilename(response.headers.get("content-disposition"), "user-details.xlsx");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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
  const response = await fetch("/api/admin/redemption-codes");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取兑换码失败。");
  return payload.inviteCodes || [];
}

async function createInviteCodesRequest(payload) {
  const response = await fetch("/api/admin/redemption-codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "创建兑换码失败。");
  return data;
}

async function updateInviteCodeRequest(id, payload) {
  const response = await fetch(`/api/admin/redemption-codes/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "更新兑换码失败。");
  return data;
}

async function refreshVisitors() {
  const response = await fetch("/api/admin/visitors");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取访客额度失败。");
  return payload.visitors || [];
}

function formatChinaDateInput(value) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function createDefaultVisitRecordFilters() {
  const today = formatChinaDateInput(new Date());
  const start = new Date(`${today}T12:00:00+08:00`);
  start.setUTCDate(start.getUTCDate() - 2);
  return {
    user: "", userType: "", startDate: formatChinaDateInput(start), endDate: today,
    durationMin: "", durationMax: "", pageType: "", browserType: "", sourceType: "", sourceUser: "",
    generationMin: "", generationMax: "", orderMin: "", orderMax: ""
  };
}

function createDefaultAdminUserFilters() {
  const today = formatChinaDateInput(new Date());
  const start = new Date(`${today}T12:00:00+08:00`);
  start.setUTCDate(start.getUTCDate() - 2);
  return {
    lastLoginStart: formatChinaDateInput(start),
    lastLoginEnd: today,
    registeredStart: "",
    registeredEnd: ""
  };
}

async function refreshVisitorRecords(params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value) !== "").map(([key, value]) => [key, String(value)]));
  const response = await fetch(`/api/admin/visitor-records${query.size ? `?${query}` : ""}`, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取访问记录失败。");
  return payload;
}

async function exportVisitRecordsCsv(params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value) !== "").map(([key, value]) => [key, String(value)]));
  const response = await fetch(`/api/admin/visitor-records/export${query.size ? `?${query}` : ""}`, { cache: "no-store" });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.message || "导出访问记录失败。");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = `访问记录-${formatChinaDateInput(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
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

function useVisitSessionTracking(experienceType, enabled = true, visitSource = null) {
  const visitSessionIdRef = useRef("");
  const visitLifecycleTokenRef = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    let isActive = true;

    async function beginVisit() {
      if (!isActive || document.visibilityState === "hidden") return;
      const lifecycleToken = ++visitLifecycleTokenRef.current;
      try {
        const payload = await reportVisitSessionEvent({ eventType: "enter", experienceType, route: window.location.pathname || "/", visitSource });
        const nextSessionId = String(payload?.session?.sessionId || "");
        if (!nextSessionId) return;
        if (!isActive || lifecycleToken !== visitLifecycleTokenRef.current || document.visibilityState === "hidden") {
          sendVisitSessionLeaveEvent({ eventType: "leave", experienceType, route: window.location.pathname || "/", currentSessionId: nextSessionId });
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
      sendVisitSessionLeaveEvent({ eventType: "leave", experienceType, route: window.location.pathname || "/", currentSessionId });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") endVisit();
      else if (!visitSessionIdRef.current) void beginVisit();
    }

    function heartbeatVisit() {
      const currentSessionId = visitSessionIdRef.current;
      if (!currentSessionId || document.visibilityState === "hidden") return;
      reportVisitSessionEvent({ eventType: "heartbeat", experienceType, route: window.location.pathname || "/", currentSessionId })
        .then((payload) => {
          const nextSession = payload?.session;
          visitSessionIdRef.current = nextSession?.status === "active" ? String(nextSession.sessionId || currentSessionId) : "";
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
  }, [enabled, experienceType, visitSource?.token, visitSource?.type]);
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

async function refundAdminPurchase(paymentIntentId, adminRemark = "") {
  const response = await fetch(`/api/admin/commerce/payments/${encodeURIComponent(paymentIntentId)}/refund`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminRemark })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "登记退款失败。");
  return data.payment;
}

async function fetchAdminReferralLedger(params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value) !== "").map(([key, value]) => [key, String(value)]));
  const response = await fetch(`/api/admin/referrals/ledger${query.size ? `?${query}` : ""}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取推荐明细失败。");
  return payload;
}

async function fetchAdminReferralRankings(params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && String(value) !== "").map(([key, value]) => [key, String(value)]));
  const response = await fetch(`/api/admin/referrals/rankings${query.size ? `?${query}` : ""}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取推荐排名失败。");
  return payload;
}

async function createAdminReferralWithdrawal(payload) {
  const response = await fetch("/api/admin/referrals/withdrawals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "扣除推荐金失败。");
  return data;
}

async function fetchAdminReferralInfluencers() {
  const response = await fetch("/api/admin/referrals/influencers");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取达人列表失败。");
  return payload;
}

async function addAdminReferralInfluencer(accountId) {
  const response = await fetch("/api/admin/referrals/influencers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "设置达人失败。");
  return payload;
}

async function removeAdminReferralInfluencer(accountId) {
  const response = await fetch(`/api/admin/referrals/influencers/${encodeURIComponent(accountId)}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "移除达人失败。");
  return payload;
}

async function fetchAdminStoreOwners() {
  const response = await fetch("/api/admin/store-owners");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取小画店家列表失败。");
  return payload;
}

async function addAdminStoreOwner(accountId, wechatId) {
  const response = await fetch("/api/admin/store-owners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, wechatId })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "设置小画店家失败。");
  return payload;
}

async function updateAdminStoreOwnerWechat(accountId, wechatId) {
  const response = await fetch(`/api/admin/store-owners/${encodeURIComponent(accountId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wechatId })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "更新店家微信号失败。");
  return payload;
}

async function removeAdminStoreOwner(accountId) {
  const response = await fetch(`/api/admin/store-owners/${encodeURIComponent(accountId)}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "移除小画店家失败。");
  return payload;
}

async function claimStoreOwnerContext(inviteToken) {
  const response = await fetch("/api/public/store-owner/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite: inviteToken })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.message || "锁定店家来源失败。");
  return data;
}

async function deleteInviteCodeRequest(id) {
  const response = await fetch(`/api/admin/redemption-codes/${id}`, { method: "DELETE" });
  if (!response.ok && response.status !== 204) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || "删除兑换码失败。");
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

function downloadAdminOrderOriginals(orderId) {
  const link = document.createElement("a");
  link.href = `/api/admin/orders/${encodeURIComponent(orderId)}/download-originals`;
  document.body.appendChild(link);
  link.click();
  link.remove();
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

async function fetchSystemMonitor() {
  const response = await fetch("/api/admin/monitor/system");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取系统状态失败。");
  return payload;
}

async function fetchNetworkMonitor() {
  const response = await fetch("/api/admin/monitor/network");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取网络状态失败。");
  return payload;
}

async function fetchApiHealthMonitor() {
  const response = await fetch("/api/admin/monitor/api-health");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取 API 健康度失败。");
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

async function replaceImageJobStylePreview(jobId, variant) {
  const response = await fetch(`/api/image-jobs/${encodeURIComponent(jobId)}/style-preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ variant })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "替换风格效果图失败。");
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
    <main className="app-shell admin-shell">
      <section className="workspace admin-workspace">
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

function InviteAdminPage({ inviteCodes, settings, onRefreshInviteCodes, onRefreshSettings }) {
  const [count, setCount] = useState(1);
  const [prefix, setPrefix] = useState("");
  const [coinBonus, setCoinBonus] = useState(0);
  const [beanBonus, setBeanBonus] = useState(0);
  const [fridgeMagnetItemCount, setFridgeMagnetItemCount] = useState(0);
  const [bodyBookPrintCount, setBodyBookPrintCount] = useState(0);
  const [bodyBookCouponYuan, setBodyBookCouponYuan] = useState(0);
  const [originalDownloadAllowanceCount, setOriginalDownloadAllowanceCount] = useState(0);
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
      await createInviteCodesRequest({ count, prefix, coinBonus, beanBonus, fridgeMagnetItemCount, bodyBookPrintCount, bodyBookCouponYuan, originalDownloadAllowanceCount });
      await onRefreshInviteCodes();
      setPrefix("");
    } catch (nextError) {
      setError(nextError.message || "创建兑换码失败。");
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
    if (!window.confirm(`确定删除兑换码 ${inviteCode.code} 吗？删除后将无法兑换。`)) return;
    setError("");
    try {
      await deleteInviteCodeRequest(inviteCode.id);
      await onRefreshInviteCodes();
    } catch (nextError) {
      setError(nextError.message || "删除兑换码失败。");
    }
  }

  return (
    <section className="task-page redemption-admin-page" aria-label="兑换码">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">Redemption codes</p>
          <h2>兑换码</h2>
          <p className="storage-note">配置新访客默认奖励，并创建一次性兑换码。</p>
        </div>
        <button className="secondary-button" onClick={() => Promise.all([onRefreshInviteCodes(), onRefreshSettings()])} type="button">
          <RefreshCw size={18} />
          <span>刷新</span>
        </button>
      </div>

      <div className="redemption-admin-controls">
        <section className="redemption-control-card">
          <div className="redemption-control-head"><div><h3>新访客默认奖励</h3><p>注册后自动发放，不影响兑换码权益。</p></div><button className="secondary-button" disabled={isSubmitting} onClick={saveSettings} type="button"><Save size={16} /><span>保存</span></button></div>
          <div className="redemption-field-grid defaults"><label className="field-label">默认币<input max="999" min="0" onChange={(event) => setDefaultCoinBonus(clampInviteQuotaBonus(event.target.value))} type="number" value={defaultCoinBonus} /></label><label className="field-label">默认豆豆<input max="999" min="0" onChange={(event) => setDefaultBeanBonus(clampInviteQuotaBonus(event.target.value))} type="number" value={defaultBeanBonus} /></label></div>
        </section>

        <section className="redemption-control-card create-card">
          <div className="redemption-control-head"><div><h3>创建兑换码</h3><p>每个兑换码仅可兑换一次，可叠加虚拟余额、实体定制和免分享原图下载权益。</p></div><button className="copy-button" disabled={isSubmitting} onClick={createCodes} type="button">{isSubmitting ? <LoaderCircle className="spin" size={16} /> : <Plus size={16} />}<span>{isSubmitting ? "创建中" : "创建"}</span></button></div>
          <div className="redemption-field-grid"><label className="field-label">数量<input max="20" min="1" onChange={(event) => setCount(Number(event.target.value) || 1)} type="number" value={count} /></label><label className="field-label">前缀<input onChange={(event) => setPrefix(event.target.value.toUpperCase())} placeholder="例如 SHOP" type="text" value={prefix} /></label><label className="field-label">币<input max="999" min="0" onChange={(event) => setCoinBonus(normalizeOptionalInviteQuotaBonus(event.target.value))} type="number" value={coinBonus} /></label><label className="field-label">豆豆<input max="999" min="0" onChange={(event) => setBeanBonus(normalizeOptionalInviteQuotaBonus(event.target.value))} type="number" value={beanBonus} /></label><label className="field-label">冰箱贴（个）<input max="999" min="0" onChange={(event) => setFridgeMagnetItemCount(normalizeOptionalInviteQuotaBonus(event.target.value))} type="number" value={fridgeMagnetItemCount} /></label><label className="field-label">实体书（册）<input max="999" min="0" onChange={(event) => setBodyBookPrintCount(normalizeOptionalInviteQuotaBonus(event.target.value))} type="number" value={bodyBookPrintCount} /></label><label className="field-label">实体优惠券（元）<input max="999" min="0" onChange={(event) => setBodyBookCouponYuan(Number(event.target.value) || 0)} type="number" value={bodyBookCouponYuan} /></label><label className="field-label">免分享原图下载（次）<input max="999" min="0" onChange={(event) => setOriginalDownloadAllowanceCount(normalizeOptionalInviteQuotaBonus(event.target.value))} type="number" value={originalDownloadAllowanceCount} /></label></div>
        </section>
      </div>
      {error ? <p className="error-note">{error}</p> : null}

      <section className="redemption-code-section" aria-label="可用兑换码">
        <div className="redemption-section-head"><div><h3>可用兑换码</h3><p>已创建 {availableInviteCodes.length} 个，删除后不可恢复。</p></div></div>
        {availableInviteCodes.length ? <div className="redemption-code-table"><div className="redemption-code-table-head" role="presentation"><span>兑换码</span><span>发放权益</span><span>核销情况</span><span>创建时间</span><span>操作</span></div>{availableInviteCodes.map((inviteCode) => <article className="redemption-code-row" key={inviteCode.id}><div className="redemption-code-primary"><strong>{inviteCode.code}</strong><span className={`task-status ${inviteCode.enabled ? "succeeded" : "cancelled"}`}>{inviteCode.enabled ? "可用" : "已停用"}</span></div><div className="redemption-code-benefits"><span>{Number(inviteCode.coinBonus ?? inviteCode.quotaBonus ?? 5)} 币</span><span>{Number(inviteCode.beanBonus ?? 10)} 豆豆</span><span>冰箱贴 {Number(inviteCode.fridgeMagnetItemCount || 0)} 个</span><span>实体书 {Number(inviteCode.bodyBookPrintCount || 0)} 册</span><span>实体优惠券 {formatCurrencyCents(inviteCode.bodyBookCouponCents || 0)}</span><span>免分享原图 {Number(inviteCode.originalDownloadAllowanceCount || 0)} 次</span></div><div className="redemption-code-usage">已兑换 {inviteCode.redeemedCount} · 剩余 {inviteCode.remainingRedemptions}</div><time>{formatDateTime(inviteCode.createdAt)}</time><button className="danger-button" onClick={() => deleteInvite(inviteCode)} type="button"><Trash2 size={16} /><span>删除</span></button></article>)}</div> : <p className="empty-note">当前没有可继续兑换的兑换码。</p>}
      </section>
    </section>
  );
}

function VisitRecordsAdminPage() {
  const [records, setRecords] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 50 });
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(() => createDefaultVisitRecordFilters());
  const [appliedFilters, setAppliedFilters] = useState(() => createDefaultVisitRecordFilters());
  const [showFilters, setShowFilters] = useState(false);

  const loadRecords = useCallback(async (page = 1, activeFilters = appliedFilters) => {
    setIsLoading(true);
    setError("");
    try {
      const payload = await refreshVisitorRecords({ ...activeFilters, page });
      setRecords(payload.records || []);
      setMeta({ total: Number(payload.total || 0), page: Number(payload.page || 1), limit: Number(payload.limit || 50) });
    } catch (nextError) {
      setError(nextError.message || "读取访问记录失败。");
    } finally {
      setIsLoading(false);
    }
  }, [appliedFilters]);

  useEffect(() => { void loadRecords(1, appliedFilters); }, [appliedFilters, loadRecords]);
  const totalPages = Math.max(1, Math.ceil(meta.total / Math.max(1, meta.limit)));
  const updateFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const applyFilters = () => setAppliedFilters({ ...filters });
  const resetFilters = () => {
    const next = createDefaultVisitRecordFilters();
    setFilters(next);
    setAppliedFilters(next);
  };

  async function exportRecords() {
    setIsExporting(true);
    setError("");
    try {
      await exportVisitRecordsCsv(appliedFilters);
    } catch (nextError) {
      setError(nextError.message || "导出访问记录失败。");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="task-page visit-records-page" aria-label="访问记录">
      <div className="task-toolbar compact-toolbar">
        <div><p className="eyebrow">Visit activity</p><h2>访问记录</h2><p className="storage-note">每行代表一次“小画”或“认知书”访问；生成和订单金额均按该次访问统计。</p></div>
        <div className="visit-record-actions"><button className="secondary-button" onClick={() => setShowFilters((current) => !current)} type="button"><Settings size={17} /><span>筛选</span></button><button className="secondary-button" disabled={isExporting} onClick={exportRecords} type="button"><Download size={17} /><span>{isExporting ? "导出中" : "导出"}</span></button><button className="secondary-button" disabled={isLoading} onClick={() => loadRecords(meta.page, appliedFilters)} type="button"><RefreshCw size={17} /><span>{isLoading ? "加载中" : "刷新"}</span></button></div>
      </div>
      {error ? <p className="error-note">{error}</p> : null}
      {showFilters ? <section className="visit-record-filters" aria-label="访问记录筛选">
        <label className="field-label">用户<input onChange={(event) => updateFilter("user", event.target.value)} placeholder="用户名、邮箱或访客 ID" value={filters.user} /></label>
        <label className="field-label">用户类型<select onChange={(event) => updateFilter("userType", event.target.value)} value={filters.userType}><option value="">全部</option><option value="registered">注册</option><option value="visitor">访客</option></select></label>
        <label className="field-label visit-filter-wide">访问时间<span className="visit-filter-range"><input onChange={(event) => updateFilter("startDate", event.target.value)} type="date" value={filters.startDate} /><b>至</b><input onChange={(event) => updateFilter("endDate", event.target.value)} type="date" value={filters.endDate} /></span></label>
        <label className="field-label">访问时长（秒）<span className="visit-filter-range"><input min="0" onChange={(event) => updateFilter("durationMin", event.target.value)} placeholder="最小" type="number" value={filters.durationMin} /><b>–</b><input min="0" onChange={(event) => updateFilter("durationMax", event.target.value)} placeholder="最大" type="number" value={filters.durationMax} /></span></label>
        <label className="field-label">访问页面<select onChange={(event) => updateFilter("pageType", event.target.value)} value={filters.pageType}><option value="">全部</option><option value="小画">小画</option><option value="认知书">认知书</option></select></label>
        <label className="field-label">浏览器类型<select onChange={(event) => updateFilter("browserType", event.target.value)} value={filters.browserType}><option value="">全部</option><option value="微信浏览器">微信浏览器</option><option value="手机浏览器">手机浏览器</option><option value="PC浏览器">PC浏览器</option></select></label>
        <label className="field-label">访问来源<select onChange={(event) => updateFilter("sourceType", event.target.value)} value={filters.sourceType}><option value="">全部</option><option value="invite">邀请链接</option><option value="share">分享链接</option><option value="organic">主动</option></select></label>
        <label className="field-label">邀请用户<input onChange={(event) => updateFilter("sourceUser", event.target.value)} placeholder="昵称或邮箱" value={filters.sourceUser} /></label>
        <label className="field-label">生成次数<span className="visit-filter-range"><input min="0" onChange={(event) => updateFilter("generationMin", event.target.value)} placeholder="最小" type="number" value={filters.generationMin} /><b>–</b><input min="0" onChange={(event) => updateFilter("generationMax", event.target.value)} placeholder="最大" type="number" value={filters.generationMax} /></span></label>
        <label className="field-label">订单金额（元）<span className="visit-filter-range"><input min="0" onChange={(event) => updateFilter("orderMin", event.target.value)} placeholder="最小" type="number" value={filters.orderMin} /><b>–</b><input min="0" onChange={(event) => updateFilter("orderMax", event.target.value)} placeholder="最大" type="number" value={filters.orderMax} /></span></label>
        <div className="visit-filter-actions"><button className="secondary-button" onClick={resetFilters} type="button">重置</button><button className="copy-button" onClick={applyFilters} type="button">应用筛选</button></div>
      </section> : null}
      <section className="visit-records-card">
        {records.length ? <div className="visit-record-table">
          <div className="visit-record-head" role="presentation"><span>用户</span><span>用户类型</span><span>访问时间</span><span>访问时长</span><span>访问页面</span><span>浏览器类型</span><span>访问来源</span><span>邀请用户</span><span>生成次数</span><span>订单金额</span></div>
          {records.map((record) => {
            const isRegistered = record.userType === "registered";
            const visitorId = String(record.visitorId || "");
            const sourceType = record.sourceType === "share" ? "分享链接" : record.sourceType === "invite" ? "邀请链接" : "主动";
            return <article className="visit-record-row" key={record.sessionId || visitorId}>
              <div className="visit-record-user" data-label="用户" title={!isRegistered ? visitorId : ""}><strong>{record.userName || visitorId || "未记录用户"}</strong>{record.userEmail ? <small>{record.userEmail}</small> : null}</div>
              <span data-label="用户类型"><i className={`visit-type-badge ${isRegistered ? "registered" : "visitor"}`}>{isRegistered ? "注册" : "访客"}</i></span>
              <time data-label="访问时间">{formatDateTime(record.visitedAt || record.lastActiveAt)}</time>
              <span data-label="访问时长">{formatStayDuration(record.durationSeconds ?? record.lastVisitDurationSeconds)}{record.isActive ? " · 进行中" : ""}</span>
              <span data-label="访问页面">{record.page || "未记录"}</span>
              <span data-label="浏览器类型">{record.browserType || "未记录"}</span>
              <span data-label="访问来源">{sourceType}</span>
              <div className="visit-record-inviter" data-label="邀请用户"><strong>{record.sourceUserName || "—"}</strong>{record.sourceUserEmail ? <small>{record.sourceUserEmail}</small> : null}</div>
              <span data-label="生成次数">{Number(record.generationCount || 0)}</span>
              <strong data-label="订单金额">{formatCurrencyCents(record.orderTotalCents)}</strong>
            </article>;
          })}
        </div> : <p className="empty-note">{isLoading ? "正在读取访问记录…" : "还没有访问记录。"}</p>}
        {meta.total > meta.limit ? <div className="visit-record-pagination"><span>共 {meta.total} 条</span><button className="secondary-button" disabled={isLoading || meta.page <= 1} onClick={() => loadRecords(meta.page - 1)} type="button">上一页</button><span>{meta.page} / {totalPages}</span><button className="secondary-button" disabled={isLoading || meta.page >= totalPages} onClick={() => loadRecords(meta.page + 1)} type="button">下一页</button></div> : null}
      </section>
    </section>
  );
}

function ApiProviderAdminPage() {
  const [providers, setProviders] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState(() => createEmptyApiProviderFormState());
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [testPrompt, setTestPrompt] = useState("一只可爱的橙色小猫，纯白背景，简洁的儿童绘本插画风格。");
  const [testSize, setTestSize] = useState("1024x1024");
  const [testReference, setTestReference] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const [testBusyAction, setTestBusyAction] = useState("");

  useEffect(() => {
    let isActive = true;

    refreshAdminApiProviders()
      .then((payload) => {
        if (!isActive) return;
        setProviders(Array.isArray(payload.providers) ? payload.providers : []);
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
    setProviders(nextProviders);
  }

  function startCreate() {
    setEditingId("");
    setForm(createEmptyApiProviderFormState());
    setError("");
    setStatusMessage("");
    setTestReference(null);
    setTestResult(null);
  }

  function startEdit(provider) {
    setEditingId(provider.id);
    setForm(toApiProviderFormState(provider));
    setError("");
    setStatusMessage("");
    setTestReference(null);
    setTestResult(null);
  }

  async function testConnection() {
    setTestBusyAction("connection");
    setError("");
    setTestResult(null);
    try {
      const result = await testAdminApiProviderConnection(form);
      setTestResult({ kind: "success", message: `连通性测试通过（${result.endpoint}）。` });
    } catch (nextError) {
      setTestResult({ kind: "error", message: nextError.message || "供应商连通性测试失败。" });
    } finally {
      setTestBusyAction("");
    }
  }

  async function testGeneration() {
    if (!testPrompt.trim()) {
      setTestResult({ kind: "error", message: "请输入生图测试提示词。" });
      return;
    }
    setTestBusyAction("generation");
    setError("");
    setTestResult(null);
    try {
      const result = await testAdminApiProviderGeneration(form, {
        prompt: testPrompt.trim(),
        reference: testReference,
        size: testSize
      });
      setTestResult({
        kind: "success",
        message: `生图测试已提交（${result.endpoint}），任务编号：${shortJobId(result.jobId)}。可在“任务记录”查看进度、结果和报错。`,
        jobId: result.jobId || ""
      });
    } catch (nextError) {
      setTestResult({ kind: "error", message: nextError.message || "供应商生图测试失败。" });
    } finally {
      setTestBusyAction("");
    }
  }

  async function moveProvider(providerId, direction) {
    const index = providers.findIndex((provider) => provider.id === providerId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= providers.length) return;
    const nextProviders = [...providers];
    const [item] = nextProviders.splice(index, 1);
    nextProviders.splice(nextIndex, 0, item);
    setIsSubmitting(true);
    setError("");
    setStatusMessage("");
    try {
      const payload = await updateAdminApiProviderSettingsRequest({ providerPriorityIds: nextProviders.map((provider) => provider.id) });
      applyPayload(payload);
      setStatusMessage(`已更新供应商顺序，“${nextProviders[0]?.name || nextProviders[0]?.id || "第一项"}”现在是默认供应商。`);
    } catch (nextError) {
      setError(nextError.message || "更新供应商顺序失败。");
    } finally {
      setIsSubmitting(false);
    }
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
  const canTestProvider = Boolean(form.id.trim() && form.baseUrl.trim() && form.apiKey.trim() && form.model.trim());

  return (
    <section className="task-page" aria-label="API 配置">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">API providers</p>
          <h2>API 配置</h2>
          <p className="storage-note">供应商按列表顺序调用：第一项为默认供应商，失败后自动尝试后续供应商。调整顺序会立即生效。</p>
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
        <div className="task-list api-provider-list">
          {isLoading ? <p className="empty-note">正在读取 API 供应商配置…</p> : null}
          {!isLoading && !providers.length ? <p className="empty-note">当前还没有可管理的供应商。你可以先新建一个 `.env` 供应商配置。</p> : null}
          {!isLoading
            ? providers.map((provider) => {
                const providerStatusClass = provider.enabled ? "succeeded" : "cancelled";
                const providerIndex = providers.findIndex((item) => item.id === provider.id);
                const isDefault = providerIndex === 0;
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
                        {provider.health?.degraded ? <span className="api-provider-chip is-degraded" title={`1 小时内因供应商自身原因失败 ${provider.health.failureCount} 次，已临时降级为最后兜底供应商`}>降级中</span> : null}
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

          <section className="api-provider-test-panel" aria-label="供应商测试">
            <div className="api-provider-test-head">
              <div>
                <h4>供应商测试</h4>
                <p className="storage-note">使用当前表单的配置测试，不会自动保存。生图测试会消耗供应商额度。</p>
              </div>
              <button className="secondary-button" disabled={!canTestProvider || Boolean(testBusyAction)} onClick={testConnection} type="button">
                {testBusyAction === "connection" ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}
                <span>{testBusyAction === "connection" ? "测试中" : "测试连通性"}</span>
              </button>
            </div>
            <div className="api-provider-test-fields">
              <label className="field-label api-provider-test-prompt">
                生图测试提示词
                <textarea onChange={(event) => setTestPrompt(event.target.value)} rows="3" value={testPrompt} />
              </label>
              <label className="field-label">
                测试尺寸
                <select onChange={(event) => setTestSize(event.target.value)} value={testSize}>
                  <option value="1024x1024">1024 × 1024</option>
                  <option value="1024x1536">1024 × 1536</option>
                  <option value="1536x1024">1536 × 1024</option>
                  <option value="auto">自动</option>
                </select>
              </label>
              <label className="field-label">
                参考图（可选）
                <input accept="image/jpeg,image/png,image/webp" onChange={(event) => setTestReference(event.target.files?.[0] || null)} type="file" />
              </label>
              <button className="copy-button api-provider-generation-test" disabled={!canTestProvider || Boolean(testBusyAction) || !testPrompt.trim()} onClick={testGeneration} type="button">
                {testBusyAction === "generation" ? <LoaderCircle className="spin" size={16} /> : <ImageUp size={16} />}
                <span>{testBusyAction === "generation" ? "生图测试中" : "生图测试"}</span>
              </button>
            </div>
            {testReference ? <p className="storage-note">已选择参考图：{testReference.name}。本次将进行图生图测试。</p> : null}
            {testResult ? <div className={`api-provider-test-result ${testResult.kind}`}><p>{testResult.message}</p></div> : null}
          </section>

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
  const [type, setType] = useState("");
  const [dateFilters, setDateFilters] = useState(() => createDefaultAdminUserFilters());
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [delta, setDelta] = useState("");
  const [remark, setRemark] = useState("");
  const [currency, setCurrency] = useState("coin");
  const [isRechargeRefund, setIsRechargeRefund] = useState(true);
  const [isExportingDetails, setIsExportingDetails] = useState(false);
  const limit = 20;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function load(next = {}) {
    setBusy(true);
    try {
      const nextDateFilters = next.dateFilters ?? dateFilters;
      const payload = await fetchAdminUsers({
        page: next.page ?? page,
        limit,
        search: next.search ?? search,
        status: next.status ?? status,
        type: next.type ?? type,
        ...nextDateFilters
      });
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
    setIsRechargeRefund(true);
    if (user.recordType === "visitor") {
      setDetail({ user });
      return;
    }
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
      const payload = await adjustAdminUserWallet(selected.id, Number(delta), currency, remark, Number(delta) < 0 && isRechargeRefund);
      setSelected(payload.user);
      setDetail((current) => current ? { ...current, user: payload.user, ledger: payload.ledger, beanLedger: payload.beanLedger } : current);
      setDelta("");
      setRemark("");
      setIsRechargeRefund(true);
      await load();
    } catch (nextError) {
      setError(nextError.message || "调整余额失败。");
    }
  }

  async function exportDetails() {
    if (!selected || isExportingDetails) return;
    setIsExportingDetails(true);
    try {
      await exportAdminUserDetails(selected.id);
    } catch (nextError) {
      setError(nextError.message || "导出用户明细失败。");
    } finally {
      setIsExportingDetails(false);
    }
  }

  async function deleteUser() {
    if (!selected || isDeleting) return;
    const name = detail?.user?.username || selected.username || "该用户";
    if (!window.confirm(`确定永久删除“${name}”吗？\n\n该操作会删除账户资料、余额流水、订单、支付记录、生成图片、卡夹和项目记录，且无法恢复。该用户下次进入将作为新用户。`)) return;

    setIsDeleting(true);
    try {
      await deleteAdminUser(selected.id);
      setSelected(null);
      setDetail(null);
      await load({ page });
    } catch (nextError) {
      setError(nextError.message || "删除用户失败。");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <section className="task-page user-admin-page" aria-label="用户管理">
      <div className="task-toolbar">
        <div><p className="eyebrow">Users</p><h2>用户管理</h2><p className="storage-note">查看注册用户与访客，并管理注册用户的账户状态、币与豆豆余额。</p></div>
        <button className="secondary-button" disabled={busy} onClick={() => load()} type="button"><RefreshCw size={18} /><span>刷新</span></button>
      </div>
      <div className="task-filters">
        <select onChange={(event) => setType(event.target.value)} value={type}><option value="">全部类型</option><option value="registered">注册用户</option><option value="visitor">访客</option></select>
        <select onChange={(event) => setStatus(event.target.value)} value={status}><option value="">全部状态</option><option value="active">正常</option><option value="disabled">已禁用</option></select>
        <label className="field-label task-query-field">最近访问时间<span className="visit-filter-range"><input aria-label="最近访问开始日期" onChange={(event) => setDateFilters((current) => ({ ...current, lastLoginStart: event.target.value }))} type="date" value={dateFilters.lastLoginStart} /><b>至</b><input aria-label="最近访问结束日期" onChange={(event) => setDateFilters((current) => ({ ...current, lastLoginEnd: event.target.value }))} type="date" value={dateFilters.lastLoginEnd} /></span></label>
        <label className="field-label task-query-field">注册时间<span className="visit-filter-range"><input aria-label="注册开始日期" onChange={(event) => setDateFilters((current) => ({ ...current, registeredStart: event.target.value }))} type="date" value={dateFilters.registeredStart} /><b>至</b><input aria-label="注册结束日期" onChange={(event) => setDateFilters((current) => ({ ...current, registeredEnd: event.target.value }))} type="date" value={dateFilters.registeredEnd} /></span></label>
        <label className="search-box"><Search size={18} /><input onChange={(event) => setSearch(event.target.value)} placeholder="用户、访客 ID、邮箱或邀请人" value={search} /></label>
        <button className="secondary-button" onClick={() => load({ page: 1 })} type="button">筛选</button>
      </div>
      {error ? <p className="error-note">{error}</p> : null}
      {users.length ? (
        <div className="user-admin-table-wrap">
          <table className="user-admin-table">
            <colgroup>
              <col className="user-admin-status-column" />
              <col className="user-admin-status-column" />
              <col className="user-admin-identity-column" />
              <col className="user-admin-identity-column" />
              <col className="user-admin-credit-column" />
              <col className="user-admin-download-column" />
              <col className="user-admin-download-column" />
              <col className="user-admin-date-column" />
              <col className="user-admin-date-column" />
              <col className="user-admin-orders-column" />
              <col className="user-admin-tasks-column" />
              <col className="user-admin-clip-column" />
              <col className="user-admin-action-column" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">状态</th>
                <th scope="col">类型</th>
                <th scope="col">用户</th>
                <th scope="col">邀请人</th>
                <th scope="col">币 / 豆豆</th>
                <th scope="col">下载额度</th>
                <th scope="col">实体优惠券</th>
                <th scope="col">注册时间</th>
                <th scope="col">最近访问</th>
                <th scope="col">订单</th>
                <th scope="col">生成任务</th>
                <th scope="col">图片资产</th>
                <th scope="col" aria-label="操作" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td><span className={`task-status user-admin-status ${user.status === "disabled" ? "failed" : "succeeded"}`}>{user.status === "disabled" ? "已禁用" : "正常"}</span></td>
                  <td><span className="user-admin-record-type">{user.recordType === "visitor" ? "访客" : user.inviter ? "受邀注册" : "注册"}</span></td>
                  <td>
                    <div className="user-admin-identity">
                      <strong title={user.username}>{user.username}</strong>
                      <span title={user.email || user.visitorId}>{user.email || `ID：${user.visitorId}`}</span>
                    </div>
                  </td>
                  <td><div className="user-admin-identity"><strong title={user.inviter?.name || user.invitationSource || ""}>{user.inviter?.name || user.invitationSource || "—"}</strong>{user.inviter?.email ? <span title={user.inviter.email}>{user.inviter.email}</span> : null}</div></td>
                  <td className="user-admin-number">{user.coinBalance} 币 / {user.beanBalance} 豆豆</td>
                  <td className="user-admin-download">{user.recordType === "registered" ? (user.originalDownloadAllowance?.unlimited ? "永久" : `${Math.max(0, Number(user.originalDownloadAllowance?.remaining || 0))} 次`) : "—"}</td>
                  <td className="user-admin-download">{user.recordType === "registered" ? formatCurrencyCents(user.bodyBookCouponCents || 0) : "—"}</td>
                  <td className="user-admin-date">{formatDateTime(user.registeredAt || user.createdAt)}</td>
                  <td className="user-admin-date">{formatDateTime(user.lastLoginAt)}</td>
                  <td>{user.recordType === "visitor" ? <span className="storage-note">—</span> : <div className="user-admin-orders"><strong>{user.orderCount} 笔</strong><span>{formatCurrencyCents(user.paidTotalCents)}</span></div>}</td>
                  <td><div className="user-admin-orders"><strong>{user.generationCount || 0} 个</strong><span>生成任务</span></div></td>
                  <td>{user.recordType === "registered" || user.generationCount > 0 ? <button className="secondary-button user-admin-clip-button" onClick={() => onOpenClip(user.recordType === "visitor" ? user.visitorId : user.accountId || user.id)} type="button"><Layers3 size={15} /><span>查看</span></button> : <span className="storage-note">—</span>}</td>
                  <td className="user-admin-action"><button className="secondary-button user-admin-detail-button" onClick={() => openDetail(user)} type="button"><Eye size={15} /><span>详情</span></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="empty-note">暂无符合条件的用户或访客。</p>}
      <div className="task-pagination"><p className="storage-note">共 {total} 位用户与访客，当前第 {page} / {totalPages} 页。</p><div className="task-pagination-actions"><button className="secondary-button" disabled={busy || page <= 1} onClick={() => load({ page: page - 1 })} type="button">上一页</button><button className="secondary-button" disabled={busy || page >= totalPages} onClick={() => load({ page: page + 1 })} type="button">下一页</button></div></div>
      {selected ? (
        <div className="modal-backdrop" onClick={() => setSelected(null)} role="presentation">
          <section className="prompt-modal order-admin-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="用户详情">
            <div className="modal-head"><div><p className="eyebrow">User detail</p><h2>{detail?.user?.username || selected.username}</h2></div><button className="icon-button" onClick={() => setSelected(null)} type="button"><X size={18} /></button></div>
            <p className="storage-note">{detail?.user?.email || (detail?.user?.visitorId ? `访客 ID：${detail.user.visitorId}` : selected.email)} · {detail?.user?.coinBalance ?? selected.coinBalance} 币 / {detail?.user?.beanBalance ?? selected.beanBalance} 豆豆 · 下载额度：{detail?.user?.originalDownloadAllowance?.unlimited ? "永久" : `${Math.max(0, Number(detail?.user?.originalDownloadAllowance?.remaining || 0))} 次`} · 实体优惠券：{formatCurrencyCents(detail?.user?.bodyBookCouponCents || 0)} · 邀请人：{detail?.user?.inviter?.name || detail?.user?.invitationSource || "无"}</p>
            {selected.recordType === "registered" ? <>
              <div className="task-actions"><button className={detail?.user?.status === "disabled" ? "secondary-button" : "danger-button"} disabled={isDeleting} onClick={() => updateStatus(detail?.user?.status === "disabled" ? "active" : "disabled")} type="button">{detail?.user?.status === "disabled" ? "恢复用户" : "禁用用户"}</button><button className="danger-button" disabled={isDeleting} onClick={deleteUser} type="button">{isDeleting ? "正在永久删除..." : "永久删除用户"}</button></div>
              <div className="draw-card-order-form"><label className="field-label">权益<select onChange={(event) => { setCurrency(event.target.value); setIsRechargeRefund(false); }} value={currency}><option value="coin">币</option><option value="bean">豆豆</option><option value="download">下载额度</option><option value="body_book_coupon">实体优惠券</option></select></label><label className="field-label">调整数量（正数增加、负数扣减）<input onChange={(event) => { const value = event.target.value; setDelta(value); if (Number(value) < 0 && ["coin", "bean"].includes(currency)) setIsRechargeRefund(true); else setIsRechargeRefund(false); }} type="number" value={delta} /></label><label className="field-label">调整备注<textarea onChange={(event) => setRemark(event.target.value)} rows="2" value={remark} /></label>{["coin", "bean"].includes(currency) ? <label className="field-label admin-wallet-refund-toggle"><span>权益处理</span><span className="checkbox-row"><input checked={isRechargeRefund} disabled={Number(delta) >= 0} onChange={(event) => setIsRechargeRefund(event.target.checked)} type="checkbox" />是否为充值退款</span><small>勾选后，扣减币/豆豆会同步扣除购买充值带来的下载和优惠权益。</small></label> : null}<button className="secondary-button" disabled={!Number(delta) || !remark.trim() || (currency === "download" && detail?.user?.originalDownloadAllowance?.unlimited)} onClick={adjustWallet} type="button">保存权益调整</button></div>
              {currency === "download" && detail?.user?.originalDownloadAllowance?.unlimited ? <p className="storage-note">该用户已获得永久原图下载资格，不能再调整下载次数。</p> : null}
              <div className="admin-user-detail-export"><button className="secondary-button" disabled={isExportingDetails} onClick={exportDetails} type="button"><Download size={16} /><span>{isExportingDetails ? "正在导出…" : "导出明细（Excel）"}</span></button></div>
            </> : <p className="storage-note">访客记录为匿名会话信息，暂无可管理的钱包、订单或卡夹。</p>}
          </section>
        </div>
      ) : null}
    </section>
  );
}

function UserClipAdminPage({ onBack, userId }) {
  const [user, setUser] = useState(null);
  const [assets, setAssets] = useState({ clipItems: [], bodyBookItems: [], historyItems: [] });
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
      setAssets({
        clipItems: payload.clipItems || [],
        bodyBookItems: payload.bodyBookItems || [],
        historyItems: payload.historyItems || []
      });
      setError("");
    } catch (nextError) {
      setError(nextError.message || "读取用户图片资产失败。");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void load(); }, [userId]);

  return (
    <section className="task-page user-clip-admin-page" aria-label="用户图片资产">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">Image assets</p>
          <h2>{user?.username ? `${user.username} 的图片资产` : "图片资产"}</h2>
          <p className="storage-note">{user?.email || "按卡夹、认知书工程及其他历史生成图片分类查看，并可下载原图。"}</p>
        </div>
        <div className="task-actions user-clip-admin-actions">
          <button className="secondary-button" onClick={onBack} type="button"><ArrowLeft size={18} /><span>返回用户列表</span></button>
          <button className="secondary-button" disabled={isLoading} onClick={() => void load()} type="button"><RefreshCw size={18} /><span>刷新</span></button>
        </div>
      </div>
      {error ? <p className="error-note">{error}</p> : null}
      {isLoading ? <p className="storage-note">正在读取用户图片资产...</p> : null}
      {!isLoading && !error ? <div className="user-asset-groups">{[
        ["卡夹内图片", assets.clipItems, "用户收藏到卡夹的图片"],
        ["认知书工程图片", assets.bodyBookItems, "认知书工程中生成的图片"],
        ["其他历史生成图片", assets.historyItems, "未收藏、且不属于认知书工程的历史生成图片"]
      ].map(([title, items, description]) => <section className="user-asset-group" key={title}><div className="user-asset-group-head"><div><h3>{title}</h3><p>{description}</p></div><span>{items.length} 张</span></div>{items.length ? <div className="user-clip-admin-grid">{items.map((item) => <article className="user-clip-admin-card" key={item.jobId}><img alt={item.styleName || title} className="user-clip-admin-image" src={item.imageUrl || item.thumbnailUrl} /><div className="user-clip-admin-copy"><strong>{item.styleName || "未命名风格"}</strong><span>{publicExperienceLabel(item.experienceType)} · 生成于 {formatDateTime(item.completedAt || item.createdAt)}</span></div><a className="secondary-button user-clip-admin-download" href={getAdminUserClipDownloadUrl(userId, item.jobId)}><Download size={16} /><span>下载原图</span></a></article>)}</div> : <p className="storage-note user-asset-empty">暂无图片。</p>}</section>)}</div> : null}
    </section>
  );
}

function OrderAdminPage({ initialOrders, initialOrdersMeta, onRefreshOrders, onRefreshSettings, settings }) {
  const [orders, setOrders] = useState(initialOrders || []);
  const [orderQuery, setOrderQuery] = useState(DEFAULT_ADMIN_ORDER_QUERY);
  const [orderType, setOrderType] = useState(DEFAULT_ADMIN_ORDER_QUERY.orderType);
  const [orderStatus, setOrderStatus] = useState(DEFAULT_ADMIN_ORDER_QUERY.orderStatus);
  const [search, setSearch] = useState(DEFAULT_ADMIN_ORDER_QUERY.search);
  const [startDate, setStartDate] = useState(DEFAULT_ADMIN_ORDER_QUERY.startDate);
  const [endDate, setEndDate] = useState(DEFAULT_ADMIN_ORDER_QUERY.endDate);
  const [orderTotal, setOrderTotal] = useState(Number(initialOrdersMeta?.total || 0));
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [adminRemark, setAdminRemark] = useState("");
  const [shippingCarrier, setShippingCarrier] = useState("");
  const [shippingTrackingNo, setShippingTrackingNo] = useState("");
  const [fridgeMagnetOrderingEnabled, setFridgeMagnetOrderingEnabled] = useState(settings?.fridgeMagnetOrderingEnabled === true);
  const [fridgeMagnetUnitPriceCents, setFridgeMagnetUnitPriceCents] = useState(settings?.fridgeMagnetUnitPriceCents || 2000);
  const [singleItemShippingFeeCents, setSingleItemShippingFeeCents] = useState(settings?.singleItemShippingFeeCents || 800);
  const [bodyBookOrderingEnabled, setBodyBookOrderingEnabled] = useState(settings?.bodyBookOrderingEnabled === true);
  const [bodyBookPriceCents, setBodyBookPriceCents] = useState(settings?.bodyBookPriceCents || 0);
  const [bodyBookShippingFeeCents, setBodyBookShippingFeeCents] = useState(settings?.bodyBookShippingFeeCents || 0);
  const [coinPurchaseUnitPriceCents, setCoinPurchaseUnitPriceCents] = useState(settings?.coinPurchaseUnitPriceCents || 100);
  const [beanPurchaseUnitPriceCents, setBeanPurchaseUnitPriceCents] = useState(settings?.beanPurchaseUnitPriceCents || 100);
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
    setCoinPurchaseUnitPriceCents(settings?.coinPurchaseUnitPriceCents || 100);
    setBeanPurchaseUnitPriceCents(settings?.beanPurchaseUnitPriceCents || 100);
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
        orderType: nextQuery.orderType || "",
        orderStatus: nextQuery.orderStatus,
        search: nextQuery.search,
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
      orderType,
      orderStatus,
      search: search.trim(),
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
        coinPurchaseUnitPriceCents,
        beanPurchaseUnitPriceCents,
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
    const confirmationNote = "确认后将转为待发货。";
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
    const isCoinPurchase = payment.kind === "coin_purchase";
    const unitName = isCoinPurchase ? "币" : "豆";
    const count = Number((isCoinPurchase ? payment.metadata?.coinCount : payment.metadata?.beanCount) || payment.creditAmount || 0);
    if (!window.confirm(`确认已收到 ${formatCurrencyCents(payment.amountCents)}，并为用户发放 ${count} ${unitName}吗？`)) return;
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      await confirmAdminManualBeanPurchase(payment.id);
      await refreshList({}, { showLoading: false });
      setStatusMessage(`已确认购买收款，${unitName}已发放。`);
    } catch (nextError) {
      setError(nextError.message || "确认购买收款失败。");
    } finally {
      setIsBusy(false);
    }
  }

  async function refundPurchase(payment) {
    if (!payment?.id || payment.orderStatus !== "paid") return;
    if (!window.confirm(`确认该购买单已在线下退款吗？系统将回收已发放的${payment.kind === "coin_purchase" ? "币" : "豆豆"}及对应推荐金。`)) return;
    setIsBusy(true); setError(""); setStatusMessage("");
    try {
      await refundAdminPurchase(payment.id);
      await refreshList({}, { showLoading: false });
      setStatusMessage("已登记退款并完成相关余额回收。");
    } catch (nextError) { setError(nextError.message || "登记退款失败。"); } finally { setIsBusy(false); }
  }

  async function refundSelectedOrder() {
    if (!selectedOrder?.id || selectedOrder.orderStatus === "refunded") return;
    if (!window.confirm("确认已在线下完成退款吗？系统会扣回本单推荐金；此订单将成为已退款终态。")) return;
    await updateOrderStatus({ adminRemark, shippingCarrier, shippingTrackingNo, orderStatus: "refunded" });
  }

  async function downloadOrderOriginals() {
    if (!selectedOrder?.id) return;
    setIsBusy(true);
    setError("");
    setDownloadStatus("");
    try {
      await downloadAdminOrderOriginals(selectedOrder.id);
      setDownloadStatus("原图压缩包已开始下载。");
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
        orderType: orderQuery.orderType,
        orderStatus: orderQuery.orderStatus,
        search: orderQuery.search,
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
          <p className="storage-note">统一查看实体定制、购买币和购买豆豆订单。共 {orderTotal} 条，当前第 {orderQuery.page} / {totalPages} 页。</p>
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

      <div className="order-settings-panel">
        <div className="task-toolbar compact-toolbar">
          <div>
            <p className="eyebrow">Commerce settings</p>
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
          <div className="order-settings-content">
            <section className="order-settings-group">
              <div className="order-settings-group-head"><div><h4>冰箱贴定制</h4><p>1 枚收邮费，2 枚及以上包邮。</p></div><label className="apple-toggle"><input checked={fridgeMagnetOrderingEnabled} onChange={(event) => setFridgeMagnetOrderingEnabled(event.target.checked)} type="checkbox" /><span aria-hidden="true" /><b>{fridgeMagnetOrderingEnabled ? "已开启" : "已关闭"}</b></label></div>
              <div className="order-settings-fields"><label className="field-label">单张价格（分）<input min="0" onChange={(event) => setFridgeMagnetUnitPriceCents(Number(event.target.value) || 0)} type="number" value={fridgeMagnetUnitPriceCents} /></label><label className="field-label">单张邮费（分）<input min="0" onChange={(event) => setSingleItemShippingFeeCents(Number(event.target.value) || 0)} type="number" value={singleItemShippingFeeCents} /></label></div>
            </section>
            <section className="order-settings-group">
              <div className="order-settings-group-head"><div><h4>认知书实体书</h4><p>售价大于 0 后才会对用户开放。</p></div><label className="apple-toggle"><input checked={bodyBookOrderingEnabled} onChange={(event) => setBodyBookOrderingEnabled(event.target.checked)} type="checkbox" /><span aria-hidden="true" /><b>{bodyBookOrderingEnabled ? "已开启" : "已关闭"}</b></label></div>
              <div className="order-settings-fields"><label className="field-label">固定售价（分）<input min="0" onChange={(event) => setBodyBookPriceCents(Number(event.target.value) || 0)} type="number" value={bodyBookPriceCents} /></label><label className="field-label">固定邮费（分）<input min="0" onChange={(event) => setBodyBookShippingFeeCents(Number(event.target.value) || 0)} type="number" value={bodyBookShippingFeeCents} /></label></div>
            </section>
            <section className="order-settings-group">
              <div className="order-settings-group-head"><div><h4>购买币与豆豆</h4><p>单价只用于新建购买单；已创建的购买单仍按原金额支付。</p></div></div>
              <div className="order-settings-fields"><label className="field-label">币单价（分）<input min="1" onChange={(event) => setCoinPurchaseUnitPriceCents(Math.max(1, Number(event.target.value) || 1))} type="number" value={coinPurchaseUnitPriceCents} /></label><label className="field-label">豆豆单价（分）<input min="1" onChange={(event) => setBeanPurchaseUnitPriceCents(Math.max(1, Number(event.target.value) || 1))} type="number" value={beanPurchaseUnitPriceCents} /></label></div>
            </section>
            <section className="order-settings-group order-settings-payment-group">
              <div className="order-settings-group-head"><div><h4>支付与确认</h4><p>微信支付由回调更新订单；人工收款由管理员确认。</p></div></div>
              <div className="order-settings-fields"><label className="field-label">支付方式<select onChange={(event) => setPaymentMode(event.target.value)} value={paymentMode}><option value="manual">人工收款码</option><option value="wechat">微信支付（JSAPI / Native）</option></select></label><label className="field-label">人工收款有效期（天）<input min="1" onChange={(event) => setManualPaymentExpireDays(Number(event.target.value) || 1)} type="number" value={manualPaymentExpireDays} /></label><label className="field-label">客服微信<input onChange={(event) => setContactWechatId(event.target.value)} type="text" value={contactWechatId} /></label></div>
            </section>
            <div className="order-settings-save">
              <button className="secondary-button" disabled={isBusy} onClick={saveOrderSettings} type="button">
                <Save size={18} />
                <span>保存下单配置</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="task-filters">
        <select onChange={(event) => setOrderType(event.target.value)} value={orderType}>
          <option value="">全部订单类型</option>
          <option value="fridge">冰箱贴定制</option>
          <option value="body_book">认知书实体书</option>
          <option value="coin_purchase">购买币</option>
          <option value="bean_purchase">购买豆豆</option>
        </select>
        <select onChange={(event) => setOrderStatus(event.target.value)} value={orderStatus}>
          <option value="">全部订单状态</option>
          <option value="pending_payment">待付款</option>
          <option value="pending_shipment">待发货</option>
          <option value="shipped">已发货</option>
          <option value="completed">已完成</option>
          <option value="cancelled">已取消</option>
          <option value="expired">已过期</option>
          <option value="refunded">已退款</option>
          <option value="paid">已支付（购买币/豆豆）</option>
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
          <input onChange={(event) => setSearch(event.target.value)} placeholder="订单号 / 用户 / 姓名 / 手机号" value={search} />
        </label>
        <button className="secondary-button" onClick={applyFilters} type="button">
          <span>筛选</span>
        </button>
      </div>

      {error ? <p className="error-note">{error}</p> : null}
      {statusMessage ? <p className="success-note">{statusMessage}</p> : null}

      <div className="order-table-wrap">
        <table className="order-table">
          <thead>
            <tr><th>订单类型</th><th>订单号</th><th>下单用户</th><th>收件人</th><th>金额</th><th>状态</th><th>创建时间</th><th aria-label="操作"></th></tr>
          </thead>
          <tbody>
            {orders.map((order) => (
              <tr key={`${order.recordType || "order"}:${order.id}`}>
                <td><span className="order-type-tag">{getAdminOrderTypeLabel(order)}</span></td>
                <td className="order-number-cell"><strong>{order.orderNo}</strong>{order.recordType !== "purchase" && order.experienceType === "body-book" ? <small>共 {(order.bodyBookBooks || []).reduce((sum, book) => sum + Math.max(0, Number(book.quantity || 0)), 0) || order.itemCount} 本</small> : null}{order.recordType !== "purchase" && order.experienceType !== "body-book" ? <small>共 {order.itemCount} 枚</small> : null}{order.recordType === "purchase" ? <small>{order.purchaseQuantityText}</small> : null}</td>
                <td className="order-user-cell"><strong>{order.accountName || "用户"}</strong><small>{order.accountEmail || (order.accountId ? `账户 ${String(order.accountId).slice(-8)}` : "")}</small></td>
                <td>{order.recordType === "purchase" ? <span className="order-table-empty-action">—</span> : <>{order.receiverName || "--"}<small>{order.receiverPhone || ""}</small></>}</td>
                <td>{formatCurrencyCents(Number(order.amountCents ?? order.payableCents ?? order.totalCents ?? 0))}</td>
                <td><span className={`task-status ${getAdminOrderPrimaryStatusTone(order)}`}>{getAdminOrderPrimaryStatusLabel(order)}</span></td>
                <td>{formatDateTime(order.createdAt)}</td>
                <td className="order-table-actions">
                  {order.recordType === "purchase" && order.canConfirmManual ? <button className="secondary-button" disabled={isBusy} onClick={() => confirmManualBeanPurchase(order)} type="button">确认收款</button> : null}
                  {order.recordType !== "purchase" ? <button className="secondary-button" onClick={() => loadOrderDetail(order.id)} type="button"><Eye size={16} /><span>详情</span></button> : null}
                  {order.recordType === "purchase" && !order.canConfirmManual ? <span className="order-table-empty-action">—</span> : null}
                </td>
              </tr>
            ))}
            {!orders.length ? <tr><td className="order-table-empty" colSpan="8">当前没有符合条件的订单。</td></tr> : null}
          </tbody>
        </table>
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
              <span>商品小计 {formatCurrencyCents(selectedOrder.subtotalCents)} · 邮费 {selectedOrder.shippingFeeCents > 0 ? formatCurrencyCents(selectedOrder.shippingFeeCents) : "包邮"} · 冰箱贴兑换（个）{Math.max(0, Number(selectedOrder.fridgeMagnetRedemptionCount || 0))} · 实体书兑换（册）{Math.max(0, Number(selectedOrder.bodyBookPrintRedemptionCount || 0))} · 实付 {formatCurrencyCents(Number(selectedOrder.payableCents ?? selectedOrder.totalCents ?? 0))}</span>
            </div>
            <p className="storage-note">{selectedOrder.receiverName} · {selectedOrder.receiverPhone}</p>
            <p className="storage-note">{selectedOrder.addressDetail}</p>
            {selectedOrder.remark ? <p className="storage-note">备注：{selectedOrder.remark}</p> : null}
            <div className="draw-card-order-items">
              {selectedOrder.experienceType === "body-book" && selectedOrder.bodyBookBooks?.length ? selectedOrder.bodyBookBooks.map((book, index) => { const quantity = Math.max(1, Number(book.quantity || 1)); return <article className="draw-card-order-item" key={`${book.projectId}-${index}`}><OrderItemPreview alt={book.title || `认知书 ${index + 1}`} src={book.coverUrl || book.pages?.find((page) => page.key === "cover")?.thumbnailUrl} title={book.title || `认知书 ${index + 1}`} /><strong>{book.title || book.themeName || `认知书 ${index + 1}`}</strong><span className="draw-card-order-item-note">{book.themeName || "认知书"} · {book.pageCount || 0} 页 · <b className={quantity > 1 ? "is-multiple" : ""}>数量 x{quantity}</b></span></article>; }) : selectedOrder.items.map((item, index) => (<article className="draw-card-order-item" key={`${item.jobId}-${index}`}><OrderItemPreview alt={item.styleName || `订单图片 ${index + 1}`} src={item.thumbnailUrl || item.imageUrl} title={item.styleName || `订单图片 ${index + 1}`} /><strong>{item.styleName || `订单图片 ${index + 1}`}</strong><span className="draw-card-order-item-note">数量 x{Math.max(1, Number(item.quantity || 1))}</span></article>))}
            </div>
            <label className="field-label">
              管理员备注
              <textarea onChange={(event) => setAdminRemark(event.target.value)} rows="3" value={adminRemark} />
            </label>
            <div className="form-grid">
              <label className="field-label">
                快递公司
                <select onChange={(event) => setShippingCarrier(event.target.value)} value={shippingCarrier}>
                  <option value="">请选择快递公司</option>
                  {SHIPPING_CARRIER_OPTIONS.map((carrier) => <option key={carrier.value} value={carrier.value}>{carrier.label}</option>)}
                </select>
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
              <button className="secondary-button" disabled={isBusy || !shippingCarrier || !shippingTrackingNo.trim()} onClick={() => updateOrderStatus({ adminRemark, shippingCarrier, shippingTrackingNo, orderStatus: "shipped" })} type="button">
                <span>标记已发货</span>
              </button>
              <button className="secondary-button" onClick={() => updateOrderStatus({ adminRemark, shippingCarrier, shippingTrackingNo, orderStatus: "completed" })} type="button">
                <span>标记已完成</span>
              </button>
              <button className="danger-button" onClick={() => updateOrderStatus({ adminRemark, shippingCarrier, shippingTrackingNo, orderStatus: "cancelled" })} type="button">
                <span>取消订单</span>
              </button>
              {selectedOrder.orderStatus !== "refunded" ? <button className="danger-button" disabled={isBusy || selectedOrder.paymentStatus !== "paid"} onClick={() => { void refundSelectedOrder(); }} type="button"><span>登记已退款</span></button> : null}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function ReferralAdminPage({ settings, onRefreshSettings }) {
  const [ledger, setLedger] = useState([]);
  const [ledgerMeta, setLedgerMeta] = useState({ total: 0, page: 1, limit: 30 });
  const [rankings, setRankings] = useState([]);
  const [rankingMeta, setRankingMeta] = useState({ total: 0, page: 1, limit: 30 });
  const [ledgerFilters, setLedgerFilters] = useState({ search: "", type: "", status: "", startDate: "", endDate: "", sortBy: "createdAt", sortDir: "desc" });
  const [rankingFilters, setRankingFilters] = useState({ search: "", sortBy: "totalEarned", sortDir: "desc" });
  const [withdrawal, setWithdrawal] = useState({ accountId: "", amountYuan: "", note: "" });
  const [withdrawalTarget, setWithdrawalTarget] = useState(null);
  const [influencers, setInfluencers] = useState([]);
  const [influencerSearch, setInfluencerSearch] = useState("");
  const [influencerCandidates, setInfluencerCandidates] = useState([]);
  const [hasSearchedInfluencers, setHasSearchedInfluencers] = useState(false);
  const [standardRatePercent, setStandardRatePercent] = useState(Number(settings?.referralStandardRateBps ?? 2000) / 100);
  const [influencerRatePercent, setInfluencerRatePercent] = useState(Number(settings?.referralInfluencerRateBps ?? 2000) / 100);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const identity = (account) => {
    if (!account) return "—";
    const name = account.username || account.wechatNickname || "微信用户";
    return `${name} · #${String(account.id || "").slice(-8)}`;
  };
  const reasonLabel = (reason) => ({
    referral_payment_reward: "订单推荐奖励",
    referral_payment_refund_reversal: "退款扣回推荐金",
    referral_withdrawal: "提现扣除"
  }[reason] || reason || "推荐金变动");

  async function loadLedger(next = {}, options = {}) {
    const filters = { ...ledgerFilters, ...next };
    const payload = await fetchAdminReferralLedger({ ...filters, page: options.page || ledgerMeta.page, limit: ledgerMeta.limit });
    setLedger(payload.items || []);
    setLedgerMeta({ total: Number(payload.total || 0), page: Number(payload.page || 1), limit: Number(payload.limit || 30) });
    if (!options.keepFilters) setLedgerFilters(filters);
    return payload;
  }
  async function loadRankings(next = {}, options = {}) {
    const filters = { ...rankingFilters, ...next };
    const payload = await fetchAdminReferralRankings({ ...filters, page: options.page || rankingMeta.page, limit: rankingMeta.limit });
    setRankings(payload.items || []);
    setRankingMeta({ total: Number(payload.total || 0), page: Number(payload.page || 1), limit: Number(payload.limit || 30) });
    if (!options.keepFilters) setRankingFilters(filters);
    return payload;
  }
  async function refreshAll() {
    setBusy(true); setError("");
    try {
      const [influencerPayload] = await Promise.all([
        fetchAdminReferralInfluencers(),
        loadLedger({}, { page: 1 }),
        loadRankings({}, { page: 1 })
      ]);
      setInfluencers(influencerPayload.influencers || []);
    } catch (nextError) { setError(nextError.message || "读取推荐数据失败。"); } finally { setBusy(false); }
  }
  useEffect(() => { void refreshAll(); }, []);
  useEffect(() => {
    setStandardRatePercent(Number(settings?.referralStandardRateBps ?? 2000) / 100);
    setInfluencerRatePercent(Number(settings?.referralInfluencerRateBps ?? 2000) / 100);
  }, [settings?.referralStandardRateBps, settings?.referralInfluencerRateBps]);

  const toRateBps = (value) => Math.min(10000, Math.max(0, Math.round(Number(value || 0) * 100)));
  async function saveReferralRates() {
    setBusy(true); setError(""); setNotice("");
    try {
      await updateAdminSettings({
        referralStandardRateBps: toRateBps(standardRatePercent),
        referralInfluencerRateBps: toRateBps(influencerRatePercent)
      });
      await onRefreshSettings?.();
      setNotice("推荐金分成比例已保存；仅之后产生的推荐金会按新比例计算。");
    } catch (nextError) { setError(nextError.message || "保存分成比例失败。"); } finally { setBusy(false); }
  }
  async function searchInfluencerCandidates() {
    const search = influencerSearch.trim();
    if (!search) {
      setInfluencerCandidates([]);
      setHasSearchedInfluencers(false);
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = await fetchAdminUsers({ type: "registered", search, limit: 20 });
      setInfluencerCandidates((payload.users || []).filter((user) => !user.isReferralInfluencer));
      setHasSearchedInfluencers(true);
    } catch (nextError) { setError(nextError.message || "搜索用户失败。"); } finally { setBusy(false); }
  }
  async function addInfluencer(accountId) {
    if (!accountId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await addAdminReferralInfluencer(accountId);
      setInfluencerCandidates((current) => current.filter((user) => user.id !== accountId));
      await refreshAll();
      setNotice("已加入达人列表，之后产生的推荐金将按达人分成比例计算。");
    } catch (nextError) { setError(nextError.message || "设置达人失败。"); } finally { setBusy(false); }
  }
  async function removeInfluencer(accountId) {
    if (!window.confirm("确认移出达人列表吗？该用户之后产生的推荐金将按普通用户分成比例计算。")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await removeAdminReferralInfluencer(accountId);
      await refreshAll();
      setNotice("已移出达人列表，之后产生的推荐金将按普通用户分成比例计算。");
    } catch (nextError) { setError(nextError.message || "移除达人失败。"); } finally { setBusy(false); }
  }

  async function submitWithdrawal() {
    if (!withdrawal.accountId || !Number(withdrawal.amountYuan) || !withdrawal.note.trim()) return;
    if (!window.confirm(`确认已线下完成提现，并扣除 ¥${Number(withdrawal.amountYuan).toFixed(2)} 推荐金吗？该操作会写入不可删除的流水。`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await createAdminReferralWithdrawal(withdrawal);
      setWithdrawal((current) => ({ ...current, amountYuan: "", note: "" }));
      setWithdrawalTarget(null);
      await Promise.all([loadLedger({}, { page: 1 }), loadRankings({}, { page: 1 })]);
      setNotice("推荐金提现扣除已记录。");
    } catch (nextError) { setError(nextError.message || "扣除推荐金失败。"); } finally { setBusy(false); }
  }
  const ledgerPages = Math.max(1, Math.ceil(ledgerMeta.total / Math.max(ledgerMeta.limit, 1)));
  const rankingPages = Math.max(1, Math.ceil(rankingMeta.total / Math.max(rankingMeta.limit, 1)));
  function openWithdrawal(item) {
    setWithdrawalTarget(item);
    setWithdrawal({ accountId: item.account.id, amountYuan: "", note: "" });
  }

  return <section className="task-page referral-admin-page" aria-label="推荐管理">
    <div className="task-toolbar"><div><p className="eyebrow">Referrals</p><h2>推荐</h2><p className="storage-note">推荐金流水、用户排名与线下提现扣除。昵称相同的用户以账户尾号区分。</p></div><button className="secondary-button" disabled={busy} onClick={refreshAll} type="button"><RefreshCw size={18} /><span>{busy ? "刷新中" : "刷新"}</span></button></div>
    {error ? <p className="error-note">{error}</p> : null}{notice ? <p className="success-note">{notice}</p> : null}

    <div className="referral-admin-card referral-rate-card">
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Rates</p><h3>推荐金分成比例</h3></div></div>
      <div className="task-filters">
        <label className="field-label task-query-field">普通用户分成比例（%）<input max="100" min="0" onChange={(event) => setStandardRatePercent(event.target.value)} step="0.01" type="number" value={standardRatePercent} /></label>
        <label className="field-label task-query-field">达人分成比例（%）<input max="100" min="0" onChange={(event) => setInfluencerRatePercent(event.target.value)} step="0.01" type="number" value={influencerRatePercent} /></label>
        <button className="secondary-button" disabled={busy} onClick={saveReferralRates} type="button">保存比例</button>
      </div>
      <p className="storage-note">按推荐人的身份与好友实付订单金额计算；历史推荐金流水不会重算。</p>
    </div>

    <div className="referral-admin-card referral-influencer-card">
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Influencers</p><h3>达人列表</h3></div></div>
      <div className="task-filters">
        <label className="search-box"><Search size={18} /><input onChange={(event) => { setInfluencerSearch(event.target.value); setInfluencerCandidates([]); setHasSearchedInfluencers(false); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchInfluencerCandidates(); } }} placeholder="搜索昵称、邮箱或账户 ID" value={influencerSearch} /></label>
        <button className="secondary-button" disabled={busy || !influencerSearch.trim()} onClick={searchInfluencerCandidates} type="button">搜索用户</button>
      </div>
      {influencerSearch.trim() ? <div className="user-admin-table-wrap referral-table-wrap"><table className="user-admin-table"><thead><tr><th>匹配用户</th><th>注册信息</th><th /></tr></thead><tbody>{influencerCandidates.map((user) => <tr key={user.id}><td><div className="user-admin-identity"><strong>{identity(user)}</strong><span>{user.email || "微信账户"}</span></div></td><td>{user.registeredAt ? formatDateTime(user.registeredAt) : "—"}</td><td><button className="secondary-button" disabled={busy} onClick={() => addInfluencer(user.id)} type="button">加入达人</button></td></tr>)}{!influencerCandidates.length ? <tr><td colSpan="3" className="order-table-empty">{hasSearchedInfluencers ? "未找到可加入的已注册用户。" : "点击“搜索用户”后显示匹配的已注册用户。"}</td></tr> : null}</tbody></table></div> : <p className="storage-note">输入昵称、邮箱或账户 ID 后搜索，再从匹配结果中加入达人。</p>}
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Current</p><h3>已加入的达人</h3></div></div>
      <div className="user-admin-table-wrap referral-table-wrap"><table className="user-admin-table"><thead><tr><th>用户</th><th>注册信息</th><th>设为达人时间</th><th /></tr></thead><tbody>{influencers.map((user) => <tr key={user.id}><td><div className="user-admin-identity"><strong>{identity(user)}</strong><span>{user.email || "微信账户"}</span></div></td><td>{user.registeredAt ? formatDateTime(user.registeredAt) : "—"}</td><td>{user.updatedAt ? formatDateTime(user.updatedAt) : "—"}</td><td><button className="danger-button" disabled={busy} onClick={() => removeInfluencer(user.id)} type="button">移出达人</button></td></tr>)}{!influencers.length ? <tr><td colSpan="4" className="order-table-empty">暂未设置达人。</td></tr> : null}</tbody></table></div>
    </div>

    <div className="referral-admin-card referral-ranking-card">
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Ranking</p><h3>用户推荐排名</h3></div></div>
      <div className="task-filters"><label className="search-box"><Search size={18} /><input onChange={(event) => setRankingFilters((current) => ({ ...current, search: event.target.value }))} placeholder="昵称、邮箱或账户 ID" value={rankingFilters.search} /></label><select onChange={(event) => setRankingFilters((current) => ({ ...current, sortBy: event.target.value }))} value={rankingFilters.sortBy}><option value="totalEarned">累计获得推荐金</option><option value="withdrawable">当前可提现推荐金</option><option value="registrations">推荐注册数</option><option value="visits">推荐访问数</option></select><select onChange={(event) => setRankingFilters((current) => ({ ...current, sortDir: event.target.value }))} value={rankingFilters.sortDir}><option value="desc">从高到低</option><option value="asc">从低到高</option></select><button className="secondary-button" onClick={() => loadRankings({}, { page: 1 }).catch((nextError) => setError(nextError.message))} type="button">筛选</button></div>
      <div className="user-admin-table-wrap referral-table-wrap"><table className="user-admin-table referral-ranking-table"><thead><tr><th>用户</th><th>累计获得推荐金</th><th>当前可提现推荐金</th><th>推荐注册数</th><th>推荐访问数</th><th /></tr></thead><tbody>{rankings.map((item) => <tr key={item.account.id}><td><div className="user-admin-identity"><strong>{identity(item.account)}</strong><span>{item.account.email || "微信账户"}</span></div></td><td>{formatCurrencyCents(item.totalEarnedCents)}</td><td className={item.withdrawableCents < 0 ? "error-note" : ""}>{formatCurrencyCents(item.withdrawableCents)}{item.pendingCents ? <small>预发放 {formatCurrencyCents(item.pendingCents)}</small> : null}</td><td>{item.registeredCount}</td><td>{item.visitCount}</td><td><button className="secondary-button referral-withdraw-button" disabled={item.withdrawableCents <= 0} onClick={() => openWithdrawal(item)} type="button">提现</button></td></tr>)}{!rankings.length ? <tr><td colSpan="6" className="order-table-empty">暂无推荐数据。</td></tr> : null}</tbody></table></div>
      <div className="task-pagination"><p className="storage-note">共 {rankingMeta.total} 位，当前第 {rankingMeta.page} / {rankingPages} 页。</p><div className="task-pagination-actions"><button className="secondary-button" disabled={rankingMeta.page <= 1} onClick={() => loadRankings({}, { page: rankingMeta.page - 1 }).catch((nextError) => setError(nextError.message))} type="button">上一页</button><button className="secondary-button" disabled={rankingMeta.page >= rankingPages} onClick={() => loadRankings({}, { page: rankingMeta.page + 1 }).catch((nextError) => setError(nextError.message))} type="button">下一页</button></div></div>
    </div>

    <div className="referral-admin-card referral-ledger-card">
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Ledger</p><h3>推荐明细</h3></div></div>
      <div className="task-filters"><label className="search-box"><Search size={18} /><input onChange={(event) => setLedgerFilters((current) => ({ ...current, search: event.target.value }))} placeholder="推荐人、受邀用户、邮箱或 ID" value={ledgerFilters.search} /></label><select onChange={(event) => setLedgerFilters((current) => ({ ...current, type: event.target.value }))} value={ledgerFilters.type}><option value="">全部类型</option><option value="referral_payment_reward">订单推荐奖励</option><option value="referral_payment_refund_reversal">退款扣回</option><option value="referral_withdrawal">提现扣除</option></select><select onChange={(event) => setLedgerFilters((current) => ({ ...current, status: event.target.value }))} value={ledgerFilters.status}><option value="">全部状态</option><option value="available">可提现</option><option value="pending">预发放</option></select><select onChange={(event) => setLedgerFilters((current) => ({ ...current, sortBy: event.target.value }))} value={ledgerFilters.sortBy}><option value="createdAt">按时间</option><option value="amount">按金额</option><option value="balance">按余额</option></select><select onChange={(event) => setLedgerFilters((current) => ({ ...current, sortDir: event.target.value }))} value={ledgerFilters.sortDir}><option value="desc">从高到低</option><option value="asc">从低到高</option></select><label className="field-label task-query-field">开始日期<input onChange={(event) => setLedgerFilters((current) => ({ ...current, startDate: event.target.value }))} type="date" value={ledgerFilters.startDate} /></label><label className="field-label task-query-field">结束日期<input onChange={(event) => setLedgerFilters((current) => ({ ...current, endDate: event.target.value }))} type="date" value={ledgerFilters.endDate} /></label><button className="secondary-button" onClick={() => loadLedger({}, { page: 1 }).catch((nextError) => setError(nextError.message))} type="button">筛选</button></div>
      <div className="user-admin-table-wrap referral-table-wrap"><table className="user-admin-table referral-ledger-table"><thead><tr><th>时间</th><th>推荐人</th><th>受邀用户</th><th>事件</th><th>关联订单</th><th>变动</th><th>状态 / 余额</th><th>备注</th></tr></thead><tbody>{ledger.map((item) => <tr key={item.id}><td className="user-admin-date">{formatDateTime(item.createdAt)}</td><td>{identity(item.account)}</td><td>{identity(item.invitee)}</td><td>{reasonLabel(item.reason)}</td><td>{item.paymentKind ? `${item.paymentKind} · ${formatCurrencyCents(item.orderAmountCents)}` : "—"}</td><td className={item.deltaCents < 0 ? "error-note" : "success-note"}>{item.deltaCents < 0 ? "" : "+"}{formatCurrencyCents(item.deltaCents)}</td><td>{item.status === "pending" ? "预发放" : "可提现"}<small>{formatCurrencyCents(item.balanceAfterCents)}</small></td><td title={item.note}>{item.note || "—"}</td></tr>)}{!ledger.length ? <tr><td colSpan="8" className="order-table-empty">暂无推荐金流水。</td></tr> : null}</tbody></table></div>
      <div className="task-pagination"><p className="storage-note">共 {ledgerMeta.total} 条，当前第 {ledgerMeta.page} / {ledgerPages} 页。</p><div className="task-pagination-actions"><button className="secondary-button" disabled={ledgerMeta.page <= 1} onClick={() => loadLedger({}, { page: ledgerMeta.page - 1 }).catch((nextError) => setError(nextError.message))} type="button">上一页</button><button className="secondary-button" disabled={ledgerMeta.page >= ledgerPages} onClick={() => loadLedger({}, { page: ledgerMeta.page + 1 }).catch((nextError) => setError(nextError.message))} type="button">下一页</button></div></div>
    </div>
    {withdrawalTarget ? <div className="modal-backdrop referral-withdrawal-backdrop" onClick={() => !busy && setWithdrawalTarget(null)} role="presentation">
      <section className="prompt-modal referral-withdrawal-modal" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label="扣除推荐金">
        <div className="modal-head"><div><p className="eyebrow">Withdrawal</p><h2>扣除推荐金</h2></div><button className="icon-button" disabled={busy} onClick={() => setWithdrawalTarget(null)} type="button"><X size={18} /></button></div>
        <div className="referral-withdrawal-user"><strong>{identity(withdrawalTarget.account)}</strong><span>当前可提现 {formatCurrencyCents(withdrawalTarget.withdrawableCents)}{withdrawalTarget.pendingCents ? ` · 预发放 ${formatCurrencyCents(withdrawalTarget.pendingCents)}` : ""}</span></div>
        <label className="field-label">扣除推荐金金额（元）<input autoFocus max={Math.max(0, Number(withdrawalTarget.withdrawableCents || 0)) / 100} min="0.01" onChange={(event) => setWithdrawal((current) => ({ ...current, amountYuan: event.target.value }))} step="0.01" type="number" value={withdrawal.amountYuan} /></label>
        <label className="field-label">备注<textarea onChange={(event) => setWithdrawal((current) => ({ ...current, note: event.target.value }))} placeholder="例如：微信转账，流水号 xxx" rows="3" value={withdrawal.note} /></label>
        <div className="draw-card-confirm-actions"><button className="draw-card-secondary" disabled={busy} onClick={() => setWithdrawalTarget(null)} type="button">取消</button><button className="draw-card-primary" disabled={busy || !Number(withdrawal.amountYuan) || !withdrawal.note.trim()} onClick={submitWithdrawal} type="button">确认扣除</button></div>
      </section>
    </div> : null}
  </section>;
}

function StoreOwnerAdminPage() {
  const [storeOwners, setStoreOwners] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [search, setSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [wechatByCandidate, setWechatByCandidate] = useState({});
  const [editingWechat, setEditingWechat] = useState({});
  const [wechatInputs, setWechatInputs] = useState({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const identity = (account) => {
    if (!account) return "—";
    const name = account.username || account.wechatNickname || "微信用户";
    return `${name} · #${String(account.id || "").slice(-8)}`;
  };

  async function refreshAll() {
    setBusy(true); setError("");
    try {
      const payload = await fetchAdminStoreOwners();
      setStoreOwners(payload.storeOwners || []);
    } catch (nextError) { setError(nextError.message || "读取小画店家列表失败。"); } finally { setBusy(false); }
  }
  useEffect(() => { void refreshAll(); }, []);

  async function searchCandidates() {
    const keyword = search.trim();
    if (!keyword) {
      setCandidates([]);
      setHasSearched(false);
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const payload = await fetchAdminUsers({ type: "registered", search: keyword, limit: 20 });
      setCandidates((payload.users || []).filter((user) => !user.isStoreOwner));
      setHasSearched(true);
    } catch (nextError) { setError(nextError.message || "搜索用户失败。"); } finally { setBusy(false); }
  }

  async function addStoreOwner(accountId) {
    const wechatId = String(wechatByCandidate[accountId] || "").trim();
    if (!wechatId) {
      setError("请先填写店家微信号。");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      await addAdminStoreOwner(accountId, wechatId);
      setCandidates((current) => current.filter((user) => user.id !== accountId));
      await refreshAll();
      setNotice("已设为小画店家，之后该店家的风格码进入选图定制时会默认选择现场制作并展示店家微信。");
    } catch (nextError) { setError(nextError.message || "设置小画店家失败。"); } finally { setBusy(false); }
  }

  async function saveWechat(accountId) {
    const wechatId = String(wechatInputs[accountId] || "").trim();
    if (!wechatId) {
      setError("请填写店家微信号。");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      await updateAdminStoreOwnerWechat(accountId, wechatId);
      setEditingWechat((current) => ({ ...current, [accountId]: false }));
      setWechatInputs((current) => ({ ...current, [accountId]: "" }));
      await refreshAll();
      setNotice("店家微信号已更新。");
    } catch (nextError) { setError(nextError.message || "更新店家微信号失败。"); } finally { setBusy(false); }
  }

  async function removeStoreOwner(accountId) {
    if (!window.confirm("确认移出小画店家吗？之后该用户的风格码不再默认进入店家现场制作模式。")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await removeAdminStoreOwner(accountId);
      await refreshAll();
      setNotice("已移出小画店家列表。");
    } catch (nextError) { setError(nextError.message || "移除小画店家失败。"); } finally { setBusy(false); }
  }

  function startEditWechat(account) {
    setEditingWechat((current) => ({ ...current, [account.id]: true }));
    setWechatInputs((current) => ({ ...current, [account.id]: account.storeWechatId || "" }));
    setError(""); setNotice("");
  }

  return <section className="task-page referral-admin-page" aria-label="商户管理">
    <div className="task-toolbar"><div><p className="eyebrow">Merchants</p><h2>商户</h2><p className="storage-note">将注册用户设为小画店家并维护店家微信号；扫店家的风格码进入选图定制时，默认选择现场制作并展示店家微信。</p></div><button className="secondary-button" disabled={busy} onClick={refreshAll} type="button"><RefreshCw size={18} /><span>{busy ? "刷新中" : "刷新"}</span></button></div>
    {error ? <p className="error-note">{error}</p> : null}{notice ? <p className="success-note">{notice}</p> : null}

    <div className="referral-admin-card referral-influencer-card">
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Store owners</p><h3>小画店家列表</h3></div></div>
      <div className="task-filters">
        <label className="search-box"><Search size={18} /><input onChange={(event) => { setSearch(event.target.value); setCandidates([]); setHasSearched(false); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchCandidates(); } }} placeholder="搜索昵称、邮箱或账户 ID" value={search} /></label>
        <button className="secondary-button" disabled={busy || !search.trim()} onClick={searchCandidates} type="button">搜索用户</button>
      </div>
      {search.trim() ? <div className="user-admin-table-wrap referral-table-wrap"><table className="user-admin-table"><thead><tr><th>匹配用户</th><th>注册信息</th><th>店家微信号</th><th /></tr></thead><tbody>{candidates.map((user) => <tr key={user.id}><td><div className="user-admin-identity"><strong>{identity(user)}</strong><span>{user.email || "微信账户"}</span></div></td><td>{user.registeredAt ? formatDateTime(user.registeredAt) : "—"}</td><td><input className="field-inline-input" onChange={(event) => setWechatByCandidate((current) => ({ ...current, [user.id]: event.target.value }))} placeholder="输入店家微信号" value={wechatByCandidate[user.id] || ""} /></td><td><button className="secondary-button" disabled={busy} onClick={() => addStoreOwner(user.id)} type="button">设为小画店家</button></td></tr>)}{!candidates.length ? <tr><td colSpan="4" className="order-table-empty">{hasSearched ? "未找到可加入的已注册用户。" : "点击“搜索用户”后显示匹配的已注册用户。"}</td></tr> : null}</tbody></table></div> : <p className="storage-note">输入昵称、邮箱或账户 ID 后搜索，再从匹配结果中设为小画店家。</p>}
      <div className="task-toolbar compact-toolbar"><div><p className="eyebrow">Current</p><h3>已加入的小画店家</h3></div></div>
      <div className="user-admin-table-wrap referral-table-wrap"><table className="user-admin-table"><thead><tr><th>用户</th><th>注册信息</th><th>设为店家时间</th><th>店家微信号</th><th /></tr></thead><tbody>{storeOwners.map((user) => <tr key={user.id}><td><div className="user-admin-identity"><strong>{identity(user)}</strong><span>{user.email || "微信账户"}</span></div></td><td>{user.registeredAt ? formatDateTime(user.registeredAt) : "—"}</td><td>{user.updatedAt ? formatDateTime(user.updatedAt) : "—"}</td><td>{editingWechat[user.id] ? <div className="task-filters store-owner-wechat-edit"><input className="field-inline-input" onChange={(event) => setWechatInputs((current) => ({ ...current, [user.id]: event.target.value }))} value={wechatInputs[user.id] || ""} /><button className="secondary-button" disabled={busy} onClick={() => saveWechat(user.id)} type="button">保存</button><button className="secondary-button" disabled={busy} onClick={() => setEditingWechat((current) => ({ ...current, [user.id]: false }))} type="button">取消</button></div> : <div className="store-owner-wechat-value"><strong>{user.storeWechatId || "—"}</strong><button className="secondary-button" disabled={busy} onClick={() => startEditWechat(user)} type="button"><Pencil size={14} />编辑</button></div>}</td><td><button className="danger-button" disabled={busy} onClick={() => removeStoreOwner(user.id)} type="button">移出店家</button></td></tr>)}{!storeOwners.length ? <tr><td colSpan="5" className="order-table-empty">暂未设置小画店家。</td></tr> : null}</tbody></table></div>
    </div>
  </section>;
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
  const [showcaseReference, setShowcaseReference] = useState(null);

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

  async function handleCreateShowcases() {
    if (!showcaseReference) {
      setError("请先选择样书参考图。");
      setStatusMessage("");
      return;
    }
    if (!window.confirm("将以这张参考图重建全部主题的成书效果样书；旧样书排队任务会停止。确认继续吗？")) return;
    setIsBusy(true);
    setError("");
    setStatusMessage("");
    try {
      const payload = await createBodyBookShowcaseBatch(showcaseReference);
      const total = Number(payload?.batch?.total || 0);
      setStatusMessage(`已提交 ${total} 张成书效果样书任务，服务器将持续低优先级生成。`);
      setShowcaseReference(null);
    } catch (nextError) {
      setError(nextError.message || "创建成书效果样书任务失败。");
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

      <section className="draw-card-upload-panel" aria-label="成书效果样书">
        <p className="eyebrow">Book showcase</p>
        <h3>成书效果样书</h3>
        <p className="storage-note">上传一张参考图后，服务器会为全部主题补齐成书效果页。任务低优先级执行，不会抢占用户生图任务。</p>
        <label className="field-label">样书参考图
          <input accept="image/png,image/jpeg,image/webp" disabled={isBusy} onChange={(event) => setShowcaseReference(event.target.files?.[0] || null)} type="file" />
        </label>
        {showcaseReference ? <p className="storage-note">已选择：{showcaseReference.name}</p> : null}
        <div className="card-actions generator-actions">
          <button className="copy-button" disabled={isBusy || !showcaseReference} onClick={handleCreateShowcases} type="button">
            {isBusy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
            <span>{isBusy ? "提交中" : "创建 / 重建样书"}</span>
          </button>
        </div>
      </section>

      <div className="task-list storage-directory-grid">
        {directories.map((item) => (
          <article className="task-card storage-directory-card" key={item.key}>
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
            <span>默认不会动风格库、分组、兑换码和系统设置。点击后会清空历史任务及其关联图片文件；访客记录默认也不删，除非你手动勾选。</span>
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

function formatSpeed(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "--";
  if (bytes < 1024) return `${Math.round(bytes)} B/s`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes >= 10240 ? 0 : 1)} KB/s`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB/s`;
}

function MonitorBar({ percent }) {
  const safe = Math.max(0, Math.min(100, Number(percent) || 0));
  const tone = safe >= 85 ? "is-high" : safe >= 60 ? "is-mid" : "is-low";
  return (
    <div className="monitor-bar">
      <div className={`monitor-bar-fill ${tone}`} style={{ width: `${safe}%` }} />
    </div>
  );
}

function MonitorSparkline({ values, color = "#007aff", max = 100 }) {
  if (!values || values.length < 2) {
    return <p className="monitor-sparkline-empty">等待采样…</p>;
  }
  const width = 120;
  const height = 34;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - Math.min(1, Math.max(0, (Number(value) || 0) / max)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="monitor-sparkline" height={height} viewBox={`0 0 ${width} ${height}`} width={width}>
      <polyline fill="none" points={points} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  );
}

function MonitorAdminPage() {
  const [system, setSystem] = useState(null);
  const [network, setNetwork] = useState(null);
  const [apiHealth, setApiHealth] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const [systemResult, networkResult, healthResult] = await Promise.allSettled([
      fetchSystemMonitor(),
      fetchNetworkMonitor(),
      fetchApiHealthMonitor()
    ]);
    const nextSystem = systemResult.status === "fulfilled" ? systemResult.value : null;
    const nextNetwork = networkResult.status === "fulfilled" ? networkResult.value : null;
    const nextHealth = healthResult.status === "fulfilled" ? healthResult.value : null;
    if (nextSystem) setSystem(nextSystem);
    if (nextNetwork) setNetwork(nextNetwork);
    if (nextHealth) setApiHealth(nextHealth);
    if (nextSystem) {
      setHistory((current) => {
        const next = [
          ...current,
          {
            t: Date.now(),
            cpu: nextSystem.cpu?.percent ?? null,
            mem: nextSystem.memory?.percent ?? null,
            disk: nextSystem.disk?.percent ?? null,
            rx: nextNetwork?.rxBytesPerSec ?? null,
            tx: nextNetwork?.txBytesPerSec ?? null
          }
        ];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
    }
    const failures = [systemResult, networkResult, healthResult].filter((result) => result.status === "rejected");
    setError(failures.length ? failures.map((result) => result.reason?.message || "读取监控数据失败。").join("；") : "");
    setIsLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 10 * 1000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const lastUpdated = system?.timestamp ? formatDateTime(system.timestamp) : "";
  const cpuValues = history.map((item) => item.cpu).filter((value) => value !== null);
  const memValues = history.map((item) => item.mem).filter((value) => value !== null);
  const diskValues = history.map((item) => item.disk).filter((value) => value !== null);
  const providers = apiHealth?.providers || [];

  return (
    <section className="task-page monitor-page" aria-label="系统监控">
      <div className="task-toolbar">
        <div>
          <p className="eyebrow">Server monitor</p>
          <h2>系统监控</h2>
          <p className="storage-note">
            每 10 秒自动刷新。查看 CPU、内存、磁盘、网络与进程资源占用，以及各生图 API 供应商最近 10 次任务的健康度。
            {lastUpdated ? <span className="monitor-updated-at">最近更新 {lastUpdated}</span> : null}
          </p>
        </div>
        <button className="secondary-button" disabled={isLoading} onClick={() => { setIsLoading(true); refresh(); }} type="button">
          <RefreshCw className={isLoading ? "spin" : ""} size={18} />
          <span>刷新</span>
        </button>
      </div>

      {error ? <p className="error-note">{error}</p> : null}
      {!system && !error ? <p className="storage-note">正在读取监控数据…</p> : null}

      <div className="monitor-stat-grid">
        <article className="task-card monitor-stat-card">
          <div className="monitor-stat-icon"><Cpu size={18} /></div>
          <div className="monitor-stat-label">CPU 使用率</div>
          <div className="monitor-stat-value">{system?.cpu?.percent != null ? `${system.cpu.percent}%` : "--"}</div>
          <MonitorBar percent={system?.cpu?.percent} />
          <p className="storage-note">负载 1/5/15 分钟：{system?.cpu?.loadAverage?.map((value) => Number(value).toFixed(2)).join(" / ") || "--"}</p>
        </article>

        <article className="task-card monitor-stat-card">
          <div className="monitor-stat-icon"><MemoryStick size={18} /></div>
          <div className="monitor-stat-label">内存使用率</div>
          <div className="monitor-stat-value">{system?.memory?.percent != null ? `${system.memory.percent}%` : "--"}</div>
          <MonitorBar percent={system?.memory?.percent} />
          <p className="storage-note">{system?.memory ? `${formatBytes(system.memory.usedBytes)} / ${formatBytes(system.memory.totalBytes)}` : "--"}</p>
        </article>

        <article className="task-card monitor-stat-card">
          <div className="monitor-stat-icon"><HardDrive size={18} /></div>
          <div className="monitor-stat-label">磁盘使用率</div>
          <div className="monitor-stat-value">{system?.disk?.percent != null ? `${system.disk.percent}%` : "--"}</div>
          <MonitorBar percent={system?.disk?.percent} />
          <p className="storage-note">
            {system?.disk ? `${formatBytes(system.disk.usedBytes)} / ${formatBytes(system.disk.totalBytes)}，可用 ${formatBytes(system.disk.freeBytes)}` : "--"}
          </p>
        </article>

        <article className="task-card monitor-stat-card">
          <div className="monitor-stat-icon"><Server size={18} /></div>
          <div className="monitor-stat-label">Node 进程内存</div>
          <div className="monitor-stat-value">{system?.processMemory ? formatBytes(system.processMemory.rssBytes) : "--"}</div>
          <MonitorBar
            percent={
              system?.processMemory && system.memory?.totalBytes
                ? Math.round((system.processMemory.rssBytes / system.memory.totalBytes) * 1000) / 10
                : null
            }
          />
          <p className="storage-note">
            {system?.processMemory
              ? `堆 ${formatBytes(system.processMemory.heapUsedBytes)} / ${formatBytes(system.processMemory.heapTotalBytes)}`
              : "--"}
          </p>
        </article>
      </div>

      <div className="monitor-stat-grid">
        <article className="task-card monitor-stat-card">
          <div className="monitor-stat-icon"><ArrowDown size={18} /></div>
          <div className="monitor-stat-label">下行带宽</div>
          <div className="monitor-stat-value">{formatSpeed(network?.rxBytesPerSec)}</div>
          <p className="storage-note">{network && network.supported === false ? "当前系统不支持带宽采集（仅 Linux 可用）" : "实时下行速率（最近两次采样差值）"}</p>
        </article>
        <article className="task-card monitor-stat-card">
          <div className="monitor-stat-icon"><ArrowUp size={18} /></div>
          <div className="monitor-stat-label">上行带宽</div>
          <div className="monitor-stat-value">{formatSpeed(network?.txBytesPerSec)}</div>
          <p className="storage-note">{network && network.supported === false ? "当前系统不支持带宽采集（仅 Linux 可用）" : "实时上行速率（最近两次采样差值）"}</p>
        </article>
        <article className="task-card monitor-stat-card">
          <div className="monitor-stat-icon"><Wifi size={18} /></div>
          <div className="monitor-stat-label">服务器信息</div>
          <div className="monitor-stat-value is-hostname" title={system?.hostname || ""}>{system?.hostname || "--"}</div>
          <p className="storage-note">
            {system ? `${system.platform} ${system.arch} · Node ${system.nodeVersion} · 运行 ${formatDuration(system.osUptimeSeconds)}` : "--"}
          </p>
        </article>
        <article className="task-card monitor-stat-card">
          <div className="monitor-stat-icon"><Activity size={18} /></div>
          <div className="monitor-stat-label">进程运行时长</div>
          <div className="monitor-stat-value">{system?.processUptimeSeconds != null ? formatDuration(system.processUptimeSeconds) : "--"}</div>
          <p className="storage-note">当前 Node 服务进程持续运行的时间。</p>
        </article>
      </div>

      <section className="task-page monitor-charts" aria-label="趋势图">
        <div className="task-toolbar">
          <div>
            <p className="eyebrow">Trends</p>
            <h2>近 10 分钟趋势</h2>
            <p className="storage-note">每 10 秒采样一次，最多保留 60 个点。</p>
          </div>
        </div>
        <div className="monitor-chart-grid">
          <div className="monitor-chart-card">
            <span className="monitor-chart-label">CPU %</span>
            <MonitorSparkline color="#007aff" values={cpuValues} />
          </div>
          <div className="monitor-chart-card">
            <span className="monitor-chart-label">内存 %</span>
            <MonitorSparkline color="#af52de" values={memValues} />
          </div>
          <div className="monitor-chart-card">
            <span className="monitor-chart-label">磁盘 %</span>
            <MonitorSparkline color="#34c759" values={diskValues} />
          </div>
        </div>
      </section>

      <section className="task-page monitor-api-health" aria-label="API 健康度">
        <div className="task-toolbar">
          <div>
            <p className="eyebrow">API health</p>
            <h2>API 供应商健康度</h2>
            <p className="storage-note">统计各供应商最近 10 次生图任务的成功率与平均生成时长。</p>
          </div>
        </div>
        {providers.length ? (
          <div className="order-table-wrap">
            <table className="order-table monitor-health-table">
              <thead>
                <tr><th>供应商</th><th>最近任务</th><th>成功率</th><th>平均生成时长</th><th>进行中</th></tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.providerId}>
                    <td><strong>{provider.name}</strong>{provider.model ? <small>{provider.model}</small> : null}</td>
                    <td>{provider.taskCount} 次（成功 {provider.succeeded} / 失败 {provider.failed}）</td>
                    <td>
                      {provider.successRate != null
                        ? <span className={`task-status ${provider.successRate >= 80 ? "succeeded" : provider.successRate >= 50 ? "partial" : "failed"}`}>{provider.successRate}%</span>
                        : <span className="task-status cancelled">--</span>}
                    </td>
                    <td>{provider.avgDurationSeconds != null ? formatDuration(Math.round(provider.avgDurationSeconds)) : "--"}</td>
                    <td>{provider.inProgress > 0 ? <span className="task-status running">{provider.inProgress} 个</span> : <span className="order-table-empty-action">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-note">还没有记录到任何供应商的生图任务，生成过图片后会在这里展示健康度。</p>
        )}
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

async function fetchPublicExperienceSessionReference(apiBase, sessionId) {
  const response = await fetch(`${apiBase}/sessions/${encodeURIComponent(sessionId)}/reference`);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error = new Error(payload.message || "读取本次任务的参考图失败，请稍后再试。");
    error.status = response.status;
    throw error;
  }
  const image = await response.blob();
  const mimeType = String(image.type || response.headers.get("content-type") || "image/jpeg").split(";")[0];
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  return new File([image], `recent-session-reference.${extension}`, { type: mimeType });
}

async function fetchLatestPublicExperienceSession(apiBase, fallbackMessage) {
  const response = await fetch(`${apiBase}/sessions/latest`);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.message || fallbackMessage || "读取最近生成任务失败，请稍后再试。");
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

async function createBodyBookShowcaseBatch(reference) {
  const formData = new FormData();
  formData.append("reference", reference);
  const response = await fetch("/api/admin/body-book-showcases", { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "创建成书效果样书任务失败。");
  return payload;
}

async function fetchBodyBookShowcases() {
  const response = await fetch("/api/body-book/showcases");
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "读取成书效果样书失败，请稍后再试。");
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

async function fetchPublicBodyBookShare(token) {
  const response = await fetch(`/api/body-book/shares/${encodeURIComponent(token)}`, { credentials: "omit" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "分享链接已失效或不存在。");
  return payload;
}

async function recordPublicBodyBookShareVisit(token) {
  const response = await fetch(`/api/body-book/shares/${encodeURIComponent(token)}/visit`, { method: "POST" });
  if (!response.ok) throw new Error("记录分享访问失败。");
  return response.json();
}

async function fetchPublicDrawShare(token) {
  const response = await fetch(`/api/draw/shares/${encodeURIComponent(token)}`, { credentials: "omit" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "分享链接已失效或不存在。");
  return payload;
}

async function recordPublicDrawShareVisit(token) {
  const response = await fetch(`/api/draw/shares/${encodeURIComponent(token)}/visit`, { method: "POST" });
  if (!response.ok) throw new Error("记录分享访问失败。");
  return response.json();
}

async function createDrawImageShare(jobId) {
  const response = await fetch(`/api/public/clip-items/${encodeURIComponent(jobId)}/share`, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "创建分享链接失败，请稍后重试。");
  return payload;
}

async function closeDrawImageShare(jobId) {
  const response = await fetch(`/api/public/clip-items/${encodeURIComponent(jobId)}/share`, { method: "DELETE" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "关闭分享失败，请稍后重试。");
  return payload;
}

async function createBodyBookProjectShare(projectId) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}/share`, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "创建分享链接失败，请稍后重试。");
  return payload;
}

async function closeBodyBookProjectShare(projectId) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}/share`, { method: "DELETE" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || "关闭分享失败，请稍后重试。");
  return payload;
}

function getBodyBookProjectPageOriginalUrl(projectId, page) {
  return `/api/body-book/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(page.key)}/download-original?inline=1`;
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

async function deleteBodyBookProjectReference(projectId, referenceIndex) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}/reference/${encodeURIComponent(referenceIndex)}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "删除参考图失败，请稍后再试。");
  return payload;
}

async function replaceBodyBookProjectPageReference(projectId, pageKey, formData) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageKey)}/reference`, { method: "POST", body: formData });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "替换页面参考图失败，请稍后再试。");
  return payload;
}

async function deleteBodyBookProjectPageReference(projectId, pageKey, referenceIndex) {
  const response = await fetch(`/api/body-book/projects/${encodeURIComponent(projectId)}/pages/${encodeURIComponent(pageKey)}/reference/${encodeURIComponent(referenceIndex)}`, { method: "DELETE" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "删除页面参考图失败，请稍后再试。");
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
  if (status === "pending_shipment") return "partial";
  if (status === "paid" || status === "completed" || status === "shipped") return "succeeded";
  if (status === "cancelled" || status === "expired" || status === "refunded") return "cancelled";
  return "queued";
}

function getBeanPurchaseListStatus(purchase) {
  if (purchase?.status === "paid") return "paid";
  if (purchase?.status === "refunded") return "refunded";
  if (purchase?.status === "cancelled" || (purchase?.expiresAt && Date.parse(purchase.expiresAt) <= Date.now())) return "expired";
  return "pending_payment";
}

function getBeanPurchaseListTone(status) {
  if (status === "paid") return "succeeded";
  if (status === "expired" || status === "refunded") return "cancelled";
  return "queued";
}

function getBeanPurchaseListStatusLabel(purchase, status) {
  if (status === "paid") return "已支付";
  if (status === "refunded") return "已退款";
  if (status === "expired") return "已过期";
  return purchase?.channel === "manual_collection" ? "待确认收款" : "待付款";
}

function getAdminOrderPrimaryStatusLabel(order) {
  if (order?.recordType === "purchase") return String(order.purchaseStatusLabel || orderStatusLabel(order.orderStatus));
  return getOrderPrimaryStatusLabel(order);
}

function getOrderPrimaryStatusLabel(order) {
  if (String(order?.orderStatus || "") === "pending_payment" && isManualPaymentOrder(order)) return "待确认收款";
  return orderStatusLabel(String(order?.orderStatus || ""));
}

function getAdminOrderPrimaryStatusTone(order) {
  return orderStatusTone(String(order?.orderStatus || ""));
}

function getAdminOrderTypeLabel(order) {
  if (order?.recordType === "purchase") return order.orderType === "coin_purchase" ? "购买币" : "购买豆豆";
  return order?.experienceType === "body-book" ? "认知书实体书" : "冰箱贴定制";
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
  if (experienceType === "admin-provider-test") return "供应商测试";
  if (experienceType === "body-book") return "宝宝身体认知书";
  if (experienceType === "fridge-magnet") return "冰箱贴";
  if (experienceType === "draw-card") return "抽卡";
  return "公开玩法";
}

function areAdminOrderQueriesEqual(left, right) {
  return (
    Number(left?.page || 0) === Number(right?.page || 0) &&
    Number(left?.limit || 0) === Number(right?.limit || 0) &&
    String(left?.orderType || "") === String(right?.orderType || "") &&
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
    Boolean(left?.likedOnly) === Boolean(right?.likedOnly) &&
    String(left?.owner || "") === String(right?.owner || "")
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

function formatPaymentButtonLabel(value) {
  const yuan = Math.max(0, Number(value || 0)) / 100;
  return `支付${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}元`;
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
    `应付金额：${formatCurrencyCents(order?.payableCents ?? order?.totalCents)}`,
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
  drawPaymentCardRow(context, "应付金额", formatCurrencyCents(order?.payableCents ?? order?.totalCents), 192, 584);
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

function normalizeOptionalInviteQuotaBonus(value) {
  return String(value ?? "") === "" ? "" : clampInviteQuotaBonus(value);
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

function downloadAdminJobResult(jobId) {
  if (!jobId) return;
  const link = document.createElement("a");
  link.href = `/api/admin/image-jobs/${encodeURIComponent(jobId)}/download`;
  link.download = "";
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

function formatShareCopy(url, type) {
  const slogan = type === "book"
    ? "我给娃定制了一本专属认知书，娃成主角了，你看看~"
    : "用照片定制的AI小画，太绝了！";
  return `${String(url || "").trim()}\n${slogan}`;
}

function cacheBust(path, version = "") {
  const normalizedPath = String(path || "");
  if (!normalizedPath) return "";
  const separator = normalizedPath.includes("?") ? "&" : "?";
  const safeVersion = String(version || "").trim();
  return safeVersion ? `${normalizedPath}${separator}v=${encodeURIComponent(safeVersion)}` : normalizedPath;
}

createRoot(document.getElementById("root")).render(<AppErrorBoundary><ModalRouteHistory /><App /></AppErrorBoundary>);
