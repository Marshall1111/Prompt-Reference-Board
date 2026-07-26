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

  cancelOrder: function (event) {
    var self = this;
    var orderId = event.currentTarget.dataset.id;
    if (!orderId) return;
    wx.showModal({
      title: "取消订单",
      content: "确认取消这个未付款订单吗？",
      confirmText: "取消订单",
      confirmColor: "#9f2418",
      success: function (result) {
        if (!result.confirm) return;
        publicExperience.deleteOrder(orderId).then(function () {
          wx.showToast({ title: "已取消", icon: "success" });
          return self.loadOrders();
        }).catch(function (error) {
          wx.showToast({
            title: (error && error.message) || "取消失败",
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
  var canCancel = order && order.orderStatus === "pending_payment";

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
    canCancel: canCancel,
    type: "order",
    key: "order:" + order.id
  };
}

function normalizeCoinPurchase(purchase) {
  var status = getCoinPurchaseStatus(purchase);
  return {
    id: purchase.id,
    key: "coin-purchase:" + purchase.id,
    type: "coin_purchase",
    coinCount: Math.max(0, Number(purchase.coinCount || 0)),
    amountText: format.formatCurrencyCents(purchase.amountCents),
    purchaseNo: String(purchase.purchaseNo || "--"),
    statusText: status.label,
    statusClass: status.className,
    createdAt: purchase.createdAt
  };
}

function getCoinPurchaseStatus(purchase) {
  if (purchase && purchase.status === "paid") return { label: "已支付", className: "paid" };
  if (purchase && (purchase.status === "cancelled" || (purchase.expiresAt && Date.parse(purchase.expiresAt) <= Date.now()))) {
    return { label: "已过期", className: "cancelled" };
  }
  return {
    label: purchase && purchase.channel === "manual_collection" ? "待确认收款" : "待付款",
    className: "pending_payment"
  };
}
