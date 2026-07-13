const publicExperience = require("../../utils/public-experience");
const publicApi = require("../../utils/public-api");
const format = require("../../utils/format");

Page({
  data: {
    orderId: "",
    token: "",
    order: null,
    orderConfig: null,
    isLoading: true,
    errorMessage: ""
  },

  onLoad: function (options) {
    this.setData({
      orderId: decodeURIComponent(options && options.id || ""),
      token: decodeURIComponent(options && options.token || "")
    });
    this.loadOrder();
  },

  onPullDownRefresh: function () {
    this.loadOrder().finally(function () {
      wx.stopPullDownRefresh();
    });
  },

  loadOrder: function () {
    var self = this;
    if (!this.data.orderId) {
      this.setData({
        isLoading: false,
        errorMessage: "订单不存在。"
      });
      return Promise.resolve();
    }

    this.setData({ isLoading: true });
    return publicExperience.fetchOrder(this.data.orderId, this.data.token).then(function (payload) {
      if (!payload || !payload.order) {
        throw new Error("订单不存在或已无法访问。");
      }
      self.setData({
        order: normalizeOrder(payload.order),
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

  copyOrderNo: function () {
    if (!this.data.order) return;
    wx.setClipboardData({
      data: this.data.order.orderNo,
      success: function () {
        wx.showToast({ title: "已复制订单号", icon: "success" });
      }
    });
  },

  copyContact: function () {
    var contact = String(this.data.orderConfig && this.data.orderConfig.contactWechatId || "PetPaint");
    wx.setClipboardData({
      data: contact,
      success: function () {
        wx.showToast({ title: "已复制微信号", icon: "success" });
      }
    });
  },

  previewItem: function (event) {
    var url = event.currentTarget.dataset.url;
    var urls = this.data.order.items.map(function (item) { return item.imageUrl; }).filter(Boolean);
    if (!url) return;
    wx.previewImage({
      current: url,
      urls: urls.length ? urls : [url]
    });
  },

  cancelOrder: function () {
    var self = this;
    if (!this.data.order) return;
    wx.showModal({
      title: "取消订单",
      content: "确认取消这个未付款订单吗？",
      confirmText: "取消订单",
      confirmColor: "#9f2418",
      success: function (result) {
        if (!result.confirm) return;
        publicExperience.deleteOrder(self.data.order.id, self.data.token).then(function () {
          wx.showToast({ title: "已取消", icon: "success" });
          return self.loadOrder();
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
  return {
    id: order.id,
    orderNo: order.orderNo,
    orderStatus: order.orderStatus,
    statusText: format.orderStatusLabel(order.orderStatus),
    statusClass: order.orderStatus,
    itemCount: order.itemCount,
    totalText: format.formatCurrencyCents(order.totalCents),
    subtotalText: format.formatCurrencyCents(order.subtotalCents),
    shippingText: Number(order.shippingFeeCents || 0) > 0 ? format.formatCurrencyCents(order.shippingFeeCents) : "包邮",
    receiverName: order.receiverName,
    receiverPhone: order.receiverPhone,
    addressDetail: order.addressDetail,
    remark: order.remark,
    createdAtText: format.formatDateTime(order.createdAt),
    expiresAtText: format.formatDateTime(order.expiresAt),
    canCancel: order.orderStatus === "pending_payment",
    items: (order.items || []).map(function (item) {
      return {
        jobId: item.jobId,
        styleName: item.styleName,
        quantity: Number(item.quantity || 1),
        imageUrl: publicApi.toAbsoluteUrl(item.imageUrl || item.thumbnailUrl || ""),
        thumbnailUrl: publicApi.toAbsoluteUrl(item.thumbnailUrl || item.imageUrl || "")
      };
    })
  };
}
