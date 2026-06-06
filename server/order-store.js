import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function nowIso() {
  return new Date().toISOString();
}

function safeJsonParse(text, fallback) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function mapOrderRow(row) {
  if (!row) return null;
  return {
    id: String(row.id || ""),
    orderNo: String(row.order_no || ""),
    visitorId: String(row.visitor_id || ""),
    publicToken: String(row.public_token || ""),
    experienceType: String(row.experience_type || ""),
    paymentStatus: String(row.payment_status || "unpaid"),
    fulfillmentStatus: String(row.fulfillment_status || "new"),
    itemCount: Number(row.item_count || 0),
    unitPriceCents: Number(row.unit_price_cents || 0),
    shippingFeeCents: Number(row.shipping_fee_cents || 0),
    subtotalCents: Number(row.subtotal_cents || 0),
    totalCents: Number(row.total_cents || 0),
    remark: String(row.remark || ""),
    receiverName: String(row.receiver_name || ""),
    receiverPhone: String(row.receiver_phone || ""),
    province: String(row.province || ""),
    city: String(row.city || ""),
    district: String(row.district || ""),
    addressDetail: String(row.address_detail || ""),
    adminRemark: String(row.admin_remark || ""),
    wechatOpenId: String(row.wechat_open_id || ""),
    wechatTransactionId: String(row.wechat_transaction_id || ""),
    outTradeNo: String(row.out_trade_no || ""),
    lastPaymentChannel: String(row.last_payment_channel || ""),
    lastPaymentError: String(row.last_payment_error || ""),
    expiresAt: row.expires_at || null,
    paidAt: row.paid_at || null,
    shippedAt: row.shipped_at || null,
    completedAt: row.completed_at || null,
    cancelledAt: row.cancelled_at || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  };
}

function mapItemRow(row) {
  return {
    orderId: String(row.order_id || ""),
    jobId: String(row.job_id || ""),
    styleId: String(row.style_id || ""),
    styleName: String(row.style_name || ""),
    imageUrl: String(row.image_url || ""),
    thumbnailUrl: String(row.thumbnail_url || ""),
    sortOrder: Number(row.sort_order || 0)
  };
}

function mapPaymentEventRow(row) {
  return {
    id: Number(row.id || 0),
    orderId: String(row.order_id || ""),
    eventType: String(row.event_type || ""),
    eventId: String(row.event_id || ""),
    success: Boolean(row.success),
    payload: safeJsonParse(row.payload_json, null),
    headers: safeJsonParse(row.headers_json, null),
    errorMessage: String(row.error_message || ""),
    createdAt: row.created_at || null
  };
}

function withTransaction(db, callback) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createOrderStore({ dbPath }) {
  const directory = path.dirname(dbPath);
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_no TEXT NOT NULL UNIQUE,
      visitor_id TEXT NOT NULL,
      public_token TEXT NOT NULL UNIQUE,
      experience_type TEXT NOT NULL,
      payment_status TEXT NOT NULL,
      fulfillment_status TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      shipping_fee_cents INTEGER NOT NULL,
      subtotal_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      remark TEXT NOT NULL DEFAULT '',
      receiver_name TEXT NOT NULL,
      receiver_phone TEXT NOT NULL,
      province TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT NOT NULL,
      address_detail TEXT NOT NULL,
      admin_remark TEXT NOT NULL DEFAULT '',
      wechat_open_id TEXT NOT NULL DEFAULT '',
      wechat_transaction_id TEXT NOT NULL DEFAULT '',
      out_trade_no TEXT NOT NULL UNIQUE,
      last_payment_channel TEXT NOT NULL DEFAULT '',
      last_payment_error TEXT NOT NULL DEFAULT '',
      expires_at TEXT,
      paid_at TEXT,
      shipped_at TEXT,
      completed_at TEXT,
      cancelled_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      order_id TEXT NOT NULL,
      job_id TEXT NOT NULL,
      style_id TEXT NOT NULL,
      style_name TEXT NOT NULL,
      image_url TEXT NOT NULL,
      thumbnail_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      PRIMARY KEY (order_id, job_id),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_id TEXT NOT NULL,
      success INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      headers_json TEXT NOT NULL,
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      UNIQUE(order_id, event_type, event_id),
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
    CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status ON orders(fulfillment_status);
    CREATE INDEX IF NOT EXISTS idx_orders_visitor_id ON orders(visitor_id);
    CREATE INDEX IF NOT EXISTS idx_orders_out_trade_no ON orders(out_trade_no);
    CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON payment_events(order_id, created_at DESC);
  `);

  const insertOrderStatement = db.prepare(`
    INSERT INTO orders (
      id, order_no, visitor_id, public_token, experience_type,
      payment_status, fulfillment_status, item_count,
      unit_price_cents, shipping_fee_cents, subtotal_cents, total_cents,
      remark, receiver_name, receiver_phone, province, city, district, address_detail,
      admin_remark, wechat_open_id, wechat_transaction_id, out_trade_no,
      last_payment_channel, last_payment_error, expires_at, paid_at, shipped_at,
      completed_at, cancelled_at, created_at, updated_at
    ) VALUES (
      @id, @orderNo, @visitorId, @publicToken, @experienceType,
      @paymentStatus, @fulfillmentStatus, @itemCount,
      @unitPriceCents, @shippingFeeCents, @subtotalCents, @totalCents,
      @remark, @receiverName, @receiverPhone, @province, @city, @district, @addressDetail,
      @adminRemark, @wechatOpenId, @wechatTransactionId, @outTradeNo,
      @lastPaymentChannel, @lastPaymentError, @expiresAt, @paidAt, @shippedAt,
      @completedAt, @cancelledAt, @createdAt, @updatedAt
    )
  `);

  const insertOrderItemStatement = db.prepare(`
    INSERT INTO order_items (
      order_id, job_id, style_id, style_name, image_url, thumbnail_url, sort_order
    ) VALUES (
      @orderId, @jobId, @styleId, @styleName, @imageUrl, @thumbnailUrl, @sortOrder
    )
  `);

  const insertPaymentEventStatement = db.prepare(`
    INSERT OR IGNORE INTO payment_events (
      order_id, event_type, event_id, success, payload_json, headers_json, error_message, created_at
    ) VALUES (
      @orderId, @eventType, @eventId, @success, @payloadJson, @headersJson, @errorMessage, @createdAt
    )
  `);

  const selectOrderByIdStatement = db.prepare("SELECT * FROM orders WHERE id = ?");
  const selectOrderByOutTradeNoStatement = db.prepare("SELECT * FROM orders WHERE out_trade_no = ?");
  const selectOrderItemsStatement = db.prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY sort_order ASC");
  const selectPaymentEventsStatement = db.prepare("SELECT * FROM payment_events WHERE order_id = ? ORDER BY created_at DESC, id DESC");

  function readOrder(orderId) {
    return mapOrderRow(selectOrderByIdStatement.get(orderId));
  }

  function readOrderByOutTradeNo(outTradeNo) {
    return mapOrderRow(selectOrderByOutTradeNoStatement.get(outTradeNo));
  }

  function readOrderItems(orderId) {
    return selectOrderItemsStatement.all(orderId).map(mapItemRow);
  }

  function readPaymentEvents(orderId) {
    return selectPaymentEventsStatement.all(orderId).map(mapPaymentEventRow);
  }

  function readOrderWithRelations(orderId) {
    const order = readOrder(orderId);
    if (!order) return null;
    return {
      ...order,
      items: readOrderItems(orderId),
      paymentEvents: readPaymentEvents(orderId)
    };
  }

  function createOrder({ order, items = [], initialPaymentEvent = null }) {
    return withTransaction(db, () => {
      insertOrderStatement.run({
        adminRemark: "",
        cancelledAt: null,
        completedAt: null,
        lastPaymentChannel: order.lastPaymentChannel || "",
        lastPaymentError: order.lastPaymentError || "",
        paidAt: null,
        shippedAt: null,
        wechatOpenId: order.wechatOpenId || "",
        wechatTransactionId: order.wechatTransactionId || "",
        ...order
      });

      items.forEach((item, index) => {
        insertOrderItemStatement.run({
          orderId: order.id,
          jobId: String(item.jobId || ""),
          styleId: String(item.styleId || ""),
          styleName: String(item.styleName || ""),
          imageUrl: String(item.imageUrl || ""),
          thumbnailUrl: String(item.thumbnailUrl || ""),
          sortOrder: Number(item.sortOrder ?? index)
        });
      });

      if (initialPaymentEvent) {
        insertPaymentEventStatement.run({
          orderId: order.id,
          eventType: String(initialPaymentEvent.eventType || "order_created"),
          eventId: String(initialPaymentEvent.eventId || `${order.id}:order_created`),
          success: initialPaymentEvent.success ? 1 : 0,
          payloadJson: JSON.stringify(initialPaymentEvent.payload || null),
          headersJson: JSON.stringify(initialPaymentEvent.headers || null),
          errorMessage: String(initialPaymentEvent.errorMessage || ""),
          createdAt: initialPaymentEvent.createdAt || nowIso()
        });
      }

      return readOrderWithRelations(order.id);
    });
  }

  function appendPaymentEvent(event) {
    insertPaymentEventStatement.run({
      orderId: String(event.orderId || ""),
      eventType: String(event.eventType || ""),
      eventId: String(event.eventId || ""),
      success: event.success ? 1 : 0,
      payloadJson: JSON.stringify(event.payload || null),
      headersJson: JSON.stringify(event.headers || null),
      errorMessage: String(event.errorMessage || ""),
      createdAt: event.createdAt || nowIso()
    });
    return readPaymentEvents(String(event.orderId || ""));
  }

  function updateOrder(orderId, patch) {
    const existing = readOrder(orderId);
    if (!existing) return null;
    const next = {
      ...existing,
      ...patch,
      updatedAt: patch.updatedAt || nowIso()
    };

    db.prepare(`
      UPDATE orders SET
        payment_status = @paymentStatus,
        fulfillment_status = @fulfillmentStatus,
        remark = @remark,
        receiver_name = @receiverName,
        receiver_phone = @receiverPhone,
        province = @province,
        city = @city,
        district = @district,
        address_detail = @addressDetail,
        admin_remark = @adminRemark,
        wechat_open_id = @wechatOpenId,
        wechat_transaction_id = @wechatTransactionId,
        last_payment_channel = @lastPaymentChannel,
        last_payment_error = @lastPaymentError,
        expires_at = @expiresAt,
        paid_at = @paidAt,
        shipped_at = @shippedAt,
        completed_at = @completedAt,
        cancelled_at = @cancelledAt,
        updated_at = @updatedAt
      WHERE id = @id
    `).run(next);

    return readOrderWithRelations(orderId);
  }

  function updateOrderAndAppendEvent(orderId, patch, event = null) {
    return withTransaction(db, () => {
      const order = updateOrder(orderId, patch);
      if (!order) return null;
      if (event) {
        insertPaymentEventStatement.run({
          orderId: String(orderId),
          eventType: String(event.eventType || ""),
          eventId: String(event.eventId || ""),
          success: event.success ? 1 : 0,
          payloadJson: JSON.stringify(event.payload || null),
          headersJson: JSON.stringify(event.headers || null),
          errorMessage: String(event.errorMessage || ""),
          createdAt: event.createdAt || nowIso()
        });
      }
      return readOrderWithRelations(orderId);
    });
  }

  function expireUnpaidOrders(referenceTime = nowIso()) {
    const now = String(referenceTime || nowIso());
    db.prepare(`
      UPDATE orders
      SET payment_status = 'expired',
          last_payment_error = CASE
            WHEN last_payment_error = '' THEN '订单已过期'
            ELSE last_payment_error
          END,
          updated_at = @now
      WHERE payment_status = 'unpaid'
        AND expires_at IS NOT NULL
        AND expires_at <= @now
    `).run({ now });
  }

  function listOrders({ paymentStatus = "", fulfillmentStatus = "", search = "", startDate = "", endDate = "", page = 1, limit = 20 } = {}) {
    expireUnpaidOrders();

    const conditions = [];
    const params = {};
    if (paymentStatus) {
      conditions.push("payment_status = @paymentStatus");
      params.paymentStatus = paymentStatus;
    }
    if (fulfillmentStatus) {
      conditions.push("fulfillment_status = @fulfillmentStatus");
      params.fulfillmentStatus = fulfillmentStatus;
    }
    if (search) {
      conditions.push("(order_no LIKE @search OR receiver_name LIKE @search OR receiver_phone LIKE @search)");
      params.search = `%${search}%`;
    }
    if (startDate) {
      conditions.push("created_at >= @startDate");
      params.startDate = `${startDate}T00:00:00.000Z`;
    }
    if (endDate) {
      conditions.push("created_at <= @endDate");
      params.endDate = `${endDate}T23:59:59.999Z`;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const safeLimit = Math.min(Math.max(Number(limit || 20), 1), 100);
    const safePage = Math.max(Number(page || 1), 1);
    const offset = (safePage - 1) * safeLimit;

    const countRow = db.prepare(`SELECT COUNT(*) AS total FROM orders ${where}`).get(params);
    const rows = db.prepare(`
      SELECT * FROM orders
      ${where}
      ORDER BY created_at DESC
      LIMIT @limit OFFSET @offset
    `).all({
      ...params,
      limit: safeLimit,
      offset
    });

    return {
      total: Number(countRow?.total || 0),
      page: safePage,
      limit: safeLimit,
      items: rows.map((row) => {
        const order = mapOrderRow(row);
        return {
          ...order,
          items: readOrderItems(order.id)
        };
      })
    };
  }

  return {
    appendPaymentEvent,
    createOrder,
    expireUnpaidOrders,
    listOrders,
    readOrder,
    readOrderByOutTradeNo,
    readOrderItems,
    readOrderWithRelations,
    updateOrder,
    updateOrderAndAppendEvent
  };
}
