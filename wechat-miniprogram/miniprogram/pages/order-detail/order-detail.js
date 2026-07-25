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
    isPaying: false,
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
        order: normalizeOrder(payload.order, payload.config || null),
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
  },

  payOrder: function () {
    var self = this;
    var order = this.data.order;
    if (!order || !order.canPay || this.data.isPaying) return;
    this.setData({ isPaying: true, errorMessage: "" });
    publicExperience.payOrder(order.id).then(function (payload) {
      return requestMiniProgramPayment(payload && payload.payment);
    }).then(function () {
      wx.showToast({ title: "支付已提交", icon: "success" });
      return self.loadOrder();
    }).catch(function (error) {
      self.setData({ errorMessage: (error && error.message) || "支付未完成，请稍后重试。" });
    }).finally(function () {
      self.setData({ isPaying: false });
    });
  }
});

function normalizeOrder(order, orderConfig) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    orderStatus: order.orderStatus,
    statusText: order.orderStatus === "pending_payment" && order.lastPaymentChannel === "manual_collection" ? "待确认收款" : format.orderStatusLabel(order.orderStatus),
    statusClass: order.orderStatus,
    experienceLabel: order.experienceType === "draw-card" ? "Draw card order" : "Fridge magnet order",
    experienceText: order.experienceType === "draw-card" ? "抽卡定制" : "冰箱贴定制",
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
    canPay: order.orderStatus === "pending_payment" && String(orderConfig && orderConfig.paymentMode || "").toLowerCase() !== "manual",
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
