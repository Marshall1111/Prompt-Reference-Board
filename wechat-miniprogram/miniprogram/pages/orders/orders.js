const publicExperience = require("../../utils/public-experience");
const publicApi = require("../../utils/public-api");
const format = require("../../utils/format");

Page({
  data: {
    orders: [],
    listItems: [],
    orderConfig: null,
    isLoading: true,
    errorMessage: ""
  },

  onShow: function () {
    this.loadOrders();
  },

  onPullDownRefresh: function () {
    this.loadOrders().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadOrders: function () {
    var self = this;
    this.setData({ isLoading: true });
    return Promise.all([
      publicExperience.fetchMyOrders("fridge"),
      publicExperience.fetchCoinPurchases()
    ]).then(function (results) {
      var payload = results[0] || {};
      var purchasePayload = results[1] || {};
      var orders = (payload.orders || []).map(normalizeOrder);
      var purchases = (purchasePayload.purchases || []).map(normalizeCoinPurchase);
      self.setData({
        orders: orders,
        listItems: orders.concat(purchases).sort(function (left, right) {
          return Date.parse(String(right.createdAt || "")) - Date.parse(String(left.createdAt || ""));
        }),
        orderConfig: payload.config || null,
        errorMessage: ""
      });
    }).catch(function (error) {
      self.setData({
        errorMessage: (error && error.message) || "读取订单失败。"
      });
    }).finally(function () {
      self.setData({ isLoading: false });
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
  },

  goFridge: function () {
    if (getCurrentPages().length > 1) {
      wx.navigateBack();
      return;
    }
    wx.reLaunch({ url: "/pages/draw/draw" });
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
