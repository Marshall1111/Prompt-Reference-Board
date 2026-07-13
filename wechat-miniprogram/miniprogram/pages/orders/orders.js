const publicExperience = require("../../utils/public-experience");
const publicApi = require("../../utils/public-api");
const format = require("../../utils/format");

Page({
  data: {
    orders: [],
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
    return publicExperience.fetchMyOrders().then(function (payload) {
      self.setData({
        orders: (payload.orders || []).map(normalizeOrder),
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
    wx.navigateTo({ url: "/pages/fridge/fridge" });
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
    statusText: format.orderStatusLabel(order.orderStatus),
    statusClass: order.orderStatus,
    itemCount: order.itemCount,
    totalText: format.formatCurrencyCents(order.totalCents),
    createdAtText: format.formatDateTime(order.createdAt),
    expiresAtText: format.formatDateTime(order.expiresAt),
    imageUrl: imageUrl,
    canCancel: canCancel
  };
}
