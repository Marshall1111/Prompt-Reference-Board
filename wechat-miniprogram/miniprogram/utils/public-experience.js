const publicApi = require("./public-api");

const STORAGE_KEYS = {
  "draw-card": "petpaint.draw.session-id",
  "fridge-magnet": "petpaint.fridge.session-id",
  latestManualOrder: "petpaint.fridge.latest-order"
};

function getSessionStorageKey(experienceType) {
  return STORAGE_KEYS[experienceType] || STORAGE_KEYS["draw-card"];
}

function saveSessionId(experienceType, sessionId) {
  try {
    wx.setStorageSync(getSessionStorageKey(experienceType), String(sessionId || ""));
  } catch (error) {}
}

function readSessionId(experienceType) {
  try {
    return wx.getStorageSync(getSessionStorageKey(experienceType)) || "";
  } catch (error) {
    return "";
  }
}

function clearSessionId(experienceType) {
  try {
    wx.removeStorageSync(getSessionStorageKey(experienceType));
  } catch (error) {}
}

function apiBaseForExperience(experienceType) {
  return experienceType === "fridge-magnet" ? "/api/fridge-magnet" : "/api/draw-card";
}

function fetchVisitorState() {
  return publicApi.request({ path: "/api/visitor-state" });
}

function ensureMiniProgramLogin(inviteToken) {
  return publicApi.ensureMiniProgramLogin(inviteToken);
}

function createReferralLink() {
  return publicApi.createReferralLink("draw-card");
}

function fetchDrawCardStyles() {
  return publicApi.request({ path: "/api/public/draw-card-styles" }).then(function (payload) {
    return (payload.styles || []).map(normalizeStyle);
  });
}

function createSession(experienceType, options) {
  var nextOptions = options || {};
  var formData = {};
  var uploadMetrics = nextOptions.uploadMetrics || {};

  if (experienceType === "draw-card") {
    if (nextOptions.selectedStyleIds && nextOptions.selectedStyleIds.length) {
      formData.selectedStyleIds = JSON.stringify(nextOptions.selectedStyleIds);
    } else {
      formData.drawCount = String(nextOptions.drawCount || 2);
      formData.subjectType = String(nextOptions.subjectType || "");
    }
  }

  if (uploadMetrics.originalBytes) formData.clientOriginalFileBytes = String(uploadMetrics.originalBytes);
  if (uploadMetrics.uploadedBytes) formData.clientUploadedFileBytes = String(uploadMetrics.uploadedBytes);
  if (uploadMetrics.originalWidth) formData.clientOriginalWidth = String(uploadMetrics.originalWidth);
  if (uploadMetrics.originalHeight) formData.clientOriginalHeight = String(uploadMetrics.originalHeight);
  if (uploadMetrics.uploadedWidth) formData.clientUploadedWidth = String(uploadMetrics.uploadedWidth);
  if (uploadMetrics.uploadedHeight) formData.clientUploadedHeight = String(uploadMetrics.uploadedHeight);
  if (uploadMetrics.wasCompressed !== undefined) formData.clientWasCompressed = uploadMetrics.wasCompressed ? "1" : "0";

  return publicApi.uploadFile({
    path: apiBaseForExperience(experienceType) + "/sessions",
    filePath: nextOptions.filePath,
    name: "image",
    header: {
      "x-draw-trace-id": publicApi.createTraceId(experienceType)
    },
    formData: formData
  }).then(function (session) {
    if (session && session.sessionId) {
      saveSessionId(experienceType, session.sessionId);
    }
    return normalizeSession(session);
  });
}

function fetchSession(experienceType, sessionId) {
  return publicApi.request({
    path: apiBaseForExperience(experienceType) + "/sessions/" + encodeURIComponent(sessionId)
  }).then(normalizeSession);
}

function fetchLatestSession(experienceType) {
  return publicApi.request({
    path: apiBaseForExperience(experienceType) + "/sessions/latest"
  }).then(function (session) {
    if (session && session.sessionId) {
      saveSessionId(experienceType, session.sessionId);
    }
    return normalizeSession(session);
  });
}

function fetchClipItems(experienceType) {
  return publicApi.request({
    path: "/api/public/clip-items?experience=" + encodeURIComponent(experienceType)
  }).then(function (payload) {
    return (payload.items || []).map(normalizeClipItem);
  });
}

function downloadClipOriginal(jobId) {
  return publicApi.downloadFile("/api/public/clip-items/" + encodeURIComponent(jobId) + "/download-original");
}

function likeJob(jobId) {
  return publicApi.request({
    path: "/api/image-jobs/" + encodeURIComponent(jobId) + "/like",
    method: "POST"
  });
}

function unlikeJob(jobId) {
  return publicApi.request({
    path: "/api/image-jobs/" + encodeURIComponent(jobId) + "/unlike",
    method: "POST"
  });
}

function redeemInviteCode(code) {
  return publicApi.request({
    path: "/api/invite-codes/redeem",
    method: "POST",
    header: {
      "Content-Type": "application/json"
    },
    data: {
      code: String(code || "").trim()
    }
  });
}

function fetchOrderConfig() {
  return publicApi.request({ path: "/api/orders/config" });
}

function createOrder(payload) {
  return publicApi.request({
    path: "/api/orders",
    method: "POST",
    header: {
      "Content-Type": "application/json"
    },
    data: payload
  }).then(function (created) {
    if (created && created.order) saveLatestManualOrder(created.order);
    return created;
  });
}

function payOrder(orderId) {
  return publicApi.request({
    path: "/api/orders/" + encodeURIComponent(orderId) + "/pay",
    method: "POST",
    header: {
      "Content-Type": "application/json"
    },
    data: {}
  });
}

function createCoinPurchase(coinCount) {
  return publicApi.request({
    path: "/api/coin-purchases",
    method: "POST",
    header: {
      "Content-Type": "application/json"
    },
    data: { coinCount: Number(coinCount || 0) }
  });
}

function payCoinPurchase(purchaseId) {
  return publicApi.request({
    path: "/api/coin-purchases/" + encodeURIComponent(purchaseId) + "/pay",
    method: "POST",
    header: {
      "Content-Type": "application/json"
    },
    data: {}
  });
}

function fetchMyOrders(scope) {
  var query = String(scope || "").trim();
  return publicApi.request({ path: "/api/my/orders" + (query ? "?scope=" + encodeURIComponent(query) : "") });
}

function fetchCoinPurchases() {
  return publicApi.request({ path: "/api/coin-purchases" });
}

function loginWithEmail(email, password) {
  return publicApi.loginWithEmail(email, password);
}

function registerWithEmail(payload) {
  return publicApi.registerWithEmail(payload);
}

function requestEmailCode(email, purpose) {
  return publicApi.requestEmailCode(email, purpose);
}

function resetPasswordWithEmail(payload) {
  return publicApi.resetPasswordWithEmail(payload);
}

function logout() {
  return publicApi.logout();
}

function initializeGuestAccount() {
  return publicApi.initializeGuestAccount();
}

function loginWithMiniProgram(inviteToken) {
  return publicApi.loginWithMiniProgram(inviteToken);
}

function fetchOrder(orderId, token) {
  var query = token ? "?token=" + encodeURIComponent(token) : "";
  return publicApi.request({
    path: "/api/orders/" + encodeURIComponent(orderId) + query
  });
}

function deleteOrder(orderId, token) {
  var query = token ? "?token=" + encodeURIComponent(token) : "";
  return publicApi.request({
    path: "/api/orders/" + encodeURIComponent(orderId) + query,
    method: "DELETE"
  });
}

function saveLatestManualOrder(order) {
  if (!order || !order.id) return;
  try {
    wx.setStorageSync(STORAGE_KEYS.latestManualOrder, {
      orderId: order.id,
      publicToken: order.publicToken || "",
      orderNo: order.orderNo || "",
      expiresAt: order.expiresAt || "",
      orderStatus: order.orderStatus || ""
    });
  } catch (error) {}
}

function readLatestManualOrder() {
  try {
    return wx.getStorageSync(STORAGE_KEYS.latestManualOrder) || null;
  } catch (error) {
    return null;
  }
}

function normalizeStyle(style) {
  return {
    id: String(style && style.id || ""),
    title: String(style && (style.title || style.name) || "未命名风格"),
    name: String(style && (style.name || style.title) || "未命名风格"),
    tags: Array.isArray(style && style.tags) ? style.tags : [],
    subjectType: String(style && style.subjectType || "both"),
    image: publicApi.toAbsoluteUrl(style && (style.galleryImage || style.image) || "")
  };
}

function normalizeSession(session) {
  var items = Array.isArray(session && session.items) ? session.items : [];
  var results = Array.isArray(session && session.results) ? session.results : [];

  return {
    sessionId: String(session && session.sessionId || ""),
    experienceType: String(session && session.experienceType || ""),
    status: String(session && session.status || ""),
    message: String(session && session.message || ""),
    failedReason: String(session && session.failedReason || ""),
    charged: Boolean(session && session.charged),
    requestedDrawCount: Number(session && session.requestedDrawCount || 0),
    requestedSubjectType: String(session && session.requestedSubjectType || ""),
    summary: session && session.summary || {},
    items: items.map(normalizeSessionItem),
    results: results.map(normalizeResult)
  };
}

function normalizeSessionItem(item) {
  var result = item && item.result ? normalizeResult(Object.assign({}, item.result, {
    jobId: item.jobId,
    styleId: item.styleId,
    styleName: item.styleName,
    order: item.order
  })) : null;

  return {
    order: Number(item && item.order || 0),
    jobId: String(item && item.jobId || ""),
    styleId: String(item && item.styleId || ""),
    styleName: String(item && item.styleName || ""),
    status: String(item && item.status || "queued"),
    errorMessage: String(item && item.errorMessage || ""),
    result: result
  };
}

function normalizeResult(result) {
  return {
    order: Number(result && result.order || 0),
    jobId: String(result && result.jobId || ""),
    styleId: String(result && result.styleId || ""),
    styleName: String(result && result.styleName || ""),
    imageUrl: publicApi.toAbsoluteUrl(result && (result.imageUrl || result.previewUrl || result.thumbnailUrl) || ""),
    thumbnailUrl: publicApi.toAbsoluteUrl(result && (result.thumbnailUrl || result.previewUrl || result.imageUrl) || ""),
    originalImageUrl: publicApi.toAbsoluteUrl(result && result.originalImageUrl || ""),
    previewUrl: publicApi.toAbsoluteUrl(result && (result.previewUrl || result.imageUrl || result.thumbnailUrl) || ""),
    isLiked: Boolean(result && result.isLiked),
    likedAt: result && result.likedAt || null
  };
}

function normalizeClipItem(item) {
  return {
    jobId: String(item && item.jobId || ""),
    experienceType: String(item && item.experienceType || ""),
    styleId: String(item && item.styleId || ""),
    styleName: String(item && item.styleName || ""),
    imageUrl: publicApi.toAbsoluteUrl(item && (item.imageUrl || item.thumbnailUrl) || ""),
    thumbnailUrl: publicApi.toAbsoluteUrl(item && (item.thumbnailUrl || item.imageUrl) || ""),
    isLiked: Boolean(item && item.isLiked),
    originalRedeemed: Boolean(item && item.originalRedeemed),
    likedAt: item && item.likedAt || null
  };
}

function isTerminalStatus(status) {
  return ["succeeded", "partial", "failed", "cancelled"].indexOf(String(status || "")) !== -1;
}

module.exports = {
  clearSessionId: clearSessionId,
  createCoinPurchase: createCoinPurchase,
  createOrder: createOrder,
  createReferralLink: createReferralLink,
  createSession: createSession,
  deleteOrder: deleteOrder,
  downloadClipOriginal: downloadClipOriginal,
  ensureMiniProgramLogin: ensureMiniProgramLogin,
  fetchClipItems: fetchClipItems,
  fetchCoinPurchases: fetchCoinPurchases,
  fetchDrawCardStyles: fetchDrawCardStyles,
  fetchLatestSession: fetchLatestSession,
  fetchMyOrders: fetchMyOrders,
  fetchOrder: fetchOrder,
  fetchOrderConfig: fetchOrderConfig,
  fetchSession: fetchSession,
  fetchVisitorState: fetchVisitorState,
  isTerminalStatus: isTerminalStatus,
  initializeGuestAccount: initializeGuestAccount,
  likeJob: likeJob,
  loginWithEmail: loginWithEmail,
  loginWithMiniProgram: loginWithMiniProgram,
  logout: logout,
  payCoinPurchase: payCoinPurchase,
  payOrder: payOrder,
  readLatestManualOrder: readLatestManualOrder,
  readSessionId: readSessionId,
  redeemInviteCode: redeemInviteCode,
  registerWithEmail: registerWithEmail,
  requestEmailCode: requestEmailCode,
  resetPasswordWithEmail: resetPasswordWithEmail,
  saveSessionId: saveSessionId,
  unlikeJob: unlikeJob
};
