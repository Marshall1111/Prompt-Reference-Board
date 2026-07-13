function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatDateTime(value) {
  var date;

  if (!value) return "";
  date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) + " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
}

function formatCurrencyCents(value) {
  var cents = Number(value || 0);
  return "¥" + (cents / 100).toFixed(2);
}

function orderStatusLabel(status) {
  var labels = {
    pending_payment: "待付款",
    pending_shipment: "待发货",
    shipped: "已发货",
    completed: "已完成",
    cancelled: "已取消",
    expired: "已过期"
  };
  return labels[status] || "未知状态";
}

function sessionStatusLabel(status) {
  var labels = {
    queued: "排队中",
    running: "生成中",
    succeeded: "已完成",
    partial: "部分完成",
    failed: "生成失败",
    cancelled: "已取消"
  };
  return labels[status] || "准备中";
}

function clampQuantity(value) {
  var next = Number(value);
  if (!Number.isFinite(next)) return 1;
  return Math.min(99, Math.max(1, Math.round(next)));
}

function calculateAmount(itemCount, config) {
  var count = Math.max(0, Number(itemCount || 0));
  var unitPriceCents = Number(config && config.unitPriceCents || 0);
  var shippingFeeCents = count === 1 ? Number(config && config.singleItemShippingFeeCents || 0) : 0;
  var subtotalCents = unitPriceCents * count;

  return {
    itemCount: count,
    unitPriceCents: unitPriceCents,
    shippingFeeCents: shippingFeeCents,
    subtotalCents: subtotalCents,
    totalCents: subtotalCents + shippingFeeCents
  };
}

module.exports = {
  calculateAmount: calculateAmount,
  clampQuantity: clampQuantity,
  formatCurrencyCents: formatCurrencyCents,
  formatDateTime: formatDateTime,
  orderStatusLabel: orderStatusLabel,
  sessionStatusLabel: sessionStatusLabel
};
