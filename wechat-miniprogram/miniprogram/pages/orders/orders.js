const publicExperience = require("../../utils/public-experience");
const publicApi = require("../../utils/public-api");
const format = require("../../utils/format");

Page({
  data: {
    orders: [],
    listItems: [],
    orderConfig: null,
    isLoading: true,
    hasCachedOrders: false,
    payingPurchaseId: "",
    errorMessage: ""
  },

  onShow: function () {
    var restored = this.restoreCachedOrders();
    if (!restored) {
      this.setData({
        orders: [],
        listItems: [],
        orderConfig: null,
        hasCachedOrders: false,
        errorMessage: ""
      });
    }
    this.loadOrders({ hasCachedOrders: restored });
  },

  onPullDownRefresh: function () {
    this.loadOrders().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadOrders: function (options) {
    var self = this;
    var nextOptions = options || {};
    var hasCachedOrders = Object.prototype.hasOwnProperty.call(nextOptions, "hasCachedOrders")
      ? Boolean(nextOptions.hasCachedOrders)
      : Boolean(this.data.hasCachedOrders);
    var cached = publicExperience.readOrdersCache() || {
      orders: [],
      purchases: [],
      orderConfig: null,
      cachedAt: 0
    };
    var pendingRequests = 2;
    var hasSuccessfulResponse = false;
    var firstError = null;

    function applyLatestCache() {
      cached.cachedAt = Date.now();
      publicExperience.saveOrdersCache(cached);
      hasSuccessfulResponse = true;
      self.applyOrderData(cached, true);
      self.setData({ isLoading: false });
    }

    function finishRequest(error) {
      if (error && !firstError) firstError = error;
      pendingRequests -= 1;
      if (pendingRequests > 0) return;
      if (!hasSuccessfulResponse && !hasCachedOrders) {
        self.setData({
          errorMessage: (firstError && firstError.message) || "读取订单失败。"
        });
      }
      self.setData({ isLoading: false });
    }

    this.setData({
      isLoading: !hasCachedOrders,
      errorMessage: ""
    });
    return Promise.all([
      publicExperience.fetchMyOrders("fridge").then(function (payload) {
        cached.orders = payload && payload.orders || [];
        cached.orderConfig = payload && payload.config || null;
        applyLatestCache();
      }).catch(function (error) {
        firstError = firstError || error;
      }).then(function () {
        finishRequest();
      }),
      publicExperience.fetchCoinPurchases().then(function (payload) {
        cached.purchases = payload && payload.purchases || [];
        applyLatestCache();
      }).catch(function (error) {
        firstError = firstError || error;
      }).then(function () {
        finishRequest();
      })
    ]);
  },

  restoreCachedOrders: function () {
    var cached = publicExperience.readOrdersCache();
    if (!cached) return false;
    this.applyOrderData(cached, true);
    return true;
  },

  applyOrderData: function (cached, hasCachedOrders) {
    var orders = (cached.orders || []).map(normalizeOrder);
    var purchases = (cached.purchases || []).map(normalizeCoinPurchase);
    this.setData({
      orders: orders,
      listItems: orders.concat(purchases).sort(function (left, right) {
        return Date.parse(String(right.createdAt || "")) - Date.parse(String(left.createdAt || ""));
      }),
      orderConfig: cached.orderConfig || null,
      hasCachedOrders: Boolean(hasCachedOrders),
      errorMessage: ""
    });
  },

  openOrder: function (event) {
    var orderId = event.currentTarget.dataset.id;
    if (!orderId) return;
    wx.navigateTo({
      url: "/pages/order-detail/order-detail?id=" + encodeURIComponent(orderId)
    });
  },

  deleteOrder: function (event) {
    var self = this;
    var orderId = event.currentTarget.dataset.id;
    if (!orderId) return;
    wx.showModal({
      title: "删除订单",
      content: "确认删除此订单记录吗？",
      confirmText: "删除",
      confirmColor: "#9f2418",
      success: function (result) {
        if (!result.confirm) return;
        publicExperience.deleteOrder(orderId).then(function () {
          wx.showToast({ title: "已删除", icon: "success" });
          return self.loadOrders();
        }).catch(function (error) {
          wx.showToast({
            title: (error && error.message) || "取消失败",
            icon: "none"
          });
        });
      }
    });
  },

  openCoinPurchase: function (event) {
    var purchaseId = event.currentTarget.dataset.id;
    var purchase = (this.data.listItems || []).find(function (item) {
      return item.type === "coin_purchase" && item.id === purchaseId;
    });
    if (!purchase) return;
    var self = this;
    wx.showModal({
      title: "购买币订单",
      content: "订单号：" + purchase.purchaseNo + "\n购买数量：" + purchase.coinCount + " 币\n支付金额：" + purchase.amountText + "\n下单时间：" + purchase.createdAtText + "\n当前状态：" + purchase.statusText,
      showCancel: purchase.canPay,
      cancelText: "关闭",
      confirmText: purchase.canPay ? "继续支付" : "知道了",
      confirmColor: "#b98749",
      success: function (result) {
        if (result.confirm && purchase.canPay) self.payCoinPurchase(purchaseId);
      }
    });
  },

  payCoinPurchase: function (eventOrPurchaseId) {
    var purchaseId = typeof eventOrPurchaseId === "string" ? eventOrPurchaseId : eventOrPurchaseId.currentTarget.dataset.id;
    var purchase = (this.data.listItems || []).find(function (item) {
      return item.type === "coin_purchase" && item.id === purchaseId;
    });
    if (!purchase || !purchase.canPay || this.data.payingPurchaseId) return;
    var self = this;
    this.setData({ payingPurchaseId: purchaseId, errorMessage: "" });
    publicExperience.payCoinPurchase(purchaseId).then(function (payload) {
      return requestMiniProgramPayment(payload && payload.payment);
    }).then(function () {
      wx.showToast({ title: "支付已提交", icon: "success" });
      return self.loadOrders({ hasCachedOrders: true });
    }).catch(function (error) {
      wx.showToast({
        title: (error && error.message) || "支付未完成",
        icon: "none"
      });
    }).finally(function () {
      self.setData({ payingPurchaseId: "" });
    });
  },

  deleteCoinPurchase: function (event) {
    var purchaseId = event.currentTarget.dataset.id;
    if (!purchaseId) return;
    var self = this;
    wx.showModal({
      title: "删除订单",
      content: "确认删除这条购买币订单记录吗？",
      confirmText: "删除",
      confirmColor: "#9f2418",
      success: function (result) {
        if (!result.confirm) return;
        publicExperience.deleteCoinPurchase(purchaseId).then(function () {
          wx.showToast({ title: "已删除", icon: "success" });
          return self.loadOrders({ hasCachedOrders: true });
        }).catch(function (error) {
          wx.showToast({
            title: (error && error.message) || "删除失败",
            icon: "none"
          });
        });
      }
    });
  }
});

function normalizeOrder(order) {
  var firstItem = order && order.items && order.items[0] || null;
  var imageUrl = publicApi.toAbsoluteUrl(firstItem && (firstItem.thumbnailUrl || firstItem.imageUrl) || "");
  var canDelete = order && ["pending_payment", "expired", "cancelled"].indexOf(order.orderStatus) !== -1;

  return {
    id: order.id,
    orderNo: order.orderNo,
    orderStatus: order.orderStatus,
    statusText: order.orderStatus === "pending_payment" && order.lastPaymentChannel === "manual_collection" ? "待确认收款" : format.orderStatusLabel(order.orderStatus),
    statusClass: order.orderStatus,
    experienceText: order.experienceType === "draw-card" ? "抽卡定制" : "冰箱贴定制",
    itemCount: order.itemCount,
    totalText: format.formatCurrencyCents(order.totalCents),
    createdAtText: format.formatDateTime(order.createdAt),
    createdAt: order.createdAt,
    expiresAtText: format.formatDateTime(order.expiresAt),
    imageUrl: imageUrl,
    canDelete: canDelete,
    type: "order",
    key: "order:" + order.id
  };
}

function normalizeCoinPurchase(purchase) {
  var status = getCoinPurchaseStatus(purchase);
  var rawStatus = String(purchase && purchase.status || "");
  var isExpired = Boolean(purchase && purchase.expiresAt && Date.parse(purchase.expiresAt) <= Date.now());
  var isManualCollection = String(purchase && purchase.channel || "") === "manual_collection";
  return {
    id: purchase.id,
    key: "coin-purchase:" + purchase.id,
    type: "coin_purchase",
    coinCount: Math.max(0, Number(purchase.coinCount || 0)),
    amountText: format.formatCurrencyCents(purchase.amountCents),
    purchaseNo: String(purchase.purchaseNo || "--"),
    statusText: status.label,
    statusClass: status.className,
    createdAt: purchase.createdAt,
    createdAtText: format.formatDateTime(purchase.createdAt),
    canPay: !isManualCollection && !isExpired && ["created", "pending"].indexOf(rawStatus) !== -1,
    canDelete: rawStatus !== "paid",
    isManualCollection: isManualCollection
  };
}

function getCoinPurchaseStatus(purchase) {
  if (purchase && purchase.status === "cancelled") return { label: "已取消", className: "cancelled" };
  if (purchase && purchase.status !== "paid" && purchase.expiresAt && Date.parse(purchase.expiresAt) <= Date.now()) return { label: "已过期", className: "expired" };
  if (purchase && purchase.status === "paid") return { label: "已支付", className: "paid" };
  return {
    label: purchase && purchase.channel === "manual_collection" ? "待确认收款" : "待付款",
    className: "pending_payment"
  };
}

function requestMiniProgramPayment(payment) {
  if (!payment || payment.status === "already_paid") return Promise.resolve();
  if (payment.channel === "manual_collection") {
    return Promise.reject(new Error("当前订单需等待人工确认收款。"));
  }
  var jsapi = payment.jsapi || {};
  if (payment.channel !== "wechat_jsapi" || !jsapi.timeStamp || !jsapi.nonceStr || !jsapi.package || !jsapi.paySign) {
    return Promise.reject(new Error("微信支付参数准备失败，请稍后重试。"));
  }
  return new Promise(function (resolve, reject) {
    wx.requestPayment({
      timeStamp: String(jsapi.timeStamp),
      nonceStr: String(jsapi.nonceStr),
      package: String(jsapi.package),
      signType: String(jsapi.signType || "RSA"),
      paySign: String(jsapi.paySign),
      success: resolve,
      fail: function (error) {
        if (String(error && error.errMsg || "").indexOf("cancel") !== -1) {
          reject(new Error("已取消支付。"));
          return;
        }
        reject(new Error("微信支付未完成，请稍后重试。"));
      }
    });
  });
}
