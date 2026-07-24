import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

function nowIso() {
  return new Date().toISOString();
}

function normalizeCommissionRateBps(value) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  return Math.min(Math.max(Math.round(next), 0), 10000);
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
    accountId: String(row.account_id || ""),
    publicToken: String(row.public_token || ""),
    experienceType: String(row.experience_type || ""),
    bodyBookThemeName: String(row.body_book_theme_name || ""),
    paymentStatus: String(row.payment_status || "unpaid"),
    fulfillmentStatus: String(row.fulfillment_status || "new"),
    itemCount: Number(row.item_count || 0),
    unitPriceCents: Number(row.unit_price_cents || 0),
    shippingFeeCents: Number(row.shipping_fee_cents || 0),
    subtotalCents: Number(row.subtotal_cents || 0),
    totalCents: Number(row.total_cents || 0),
    beanDiscountCents: Number(row.bean_discount_cents || 0),
    coinDiscountCents: Number(row.coin_discount_cents || 0),
    payableCents: Number(row.payable_cents ?? row.total_cents ?? 0),
    remark: String(row.remark || ""),
    receiverName: String(row.receiver_name || ""),
    receiverPhone: String(row.receiver_phone || ""),
    province: String(row.province || ""),
    city: String(row.city || ""),
    district: String(row.district || ""),
    addressDetail: String(row.address_detail || ""),
    sourceMerchantId: String(row.source_merchant_id || ""),
    sourceMerchantName: String(row.source_merchant_name || ""),
    commissionRateBps: Number(row.commission_rate_bps || 0),
    sourceClaimedAt: row.source_claimed_at || null,
    adminRemark: String(row.admin_remark || ""),
    wechatOpenId: String(row.wechat_open_id || ""),
    wechatTransactionId: String(row.wechat_transaction_id || ""),
    outTradeNo: String(row.out_trade_no || ""),
    lastPaymentChannel: String(row.last_payment_channel || ""),
    lastPaymentError: String(row.last_payment_error || ""),
    expiresAt: row.expires_at || null,
    paidAt: row.paid_at || null,
    shippedAt: row.shipped_at || null,
    shippingCarrier: String(row.shipping_carrier || ""),
    shippingTrackingNo: String(row.shipping_tracking_no || ""),
    completedAt: row.completed_at || null,
    cancelledAt: row.cancelled_at || null,
    userDeletedAt: row.user_deleted_at || null,
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
    quantity: Number(row.quantity || 1),
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
      account_id TEXT NOT NULL DEFAULT '',
      public_token TEXT NOT NULL UNIQUE,
      experience_type TEXT NOT NULL,
      body_book_theme_name TEXT NOT NULL DEFAULT '',
      payment_status TEXT NOT NULL,
      fulfillment_status TEXT NOT NULL,
      item_count INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL,
      shipping_fee_cents INTEGER NOT NULL,
      subtotal_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL,
      bean_discount_cents INTEGER NOT NULL DEFAULT 0,
      coin_discount_cents INTEGER NOT NULL DEFAULT 0,
      payable_cents INTEGER NOT NULL DEFAULT 0,
      remark TEXT NOT NULL DEFAULT '',
      receiver_name TEXT NOT NULL,
      receiver_phone TEXT NOT NULL,
      province TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT NOT NULL,
      address_detail TEXT NOT NULL,
      source_merchant_id TEXT NOT NULL DEFAULT '',
      source_merchant_name TEXT NOT NULL DEFAULT '',
      commission_rate_bps INTEGER NOT NULL DEFAULT 0,
      source_claimed_at TEXT,
      admin_remark TEXT NOT NULL DEFAULT '',
      wechat_open_id TEXT NOT NULL DEFAULT '',
      wechat_transaction_id TEXT NOT NULL DEFAULT '',
      out_trade_no TEXT NOT NULL UNIQUE,
      last_payment_channel TEXT NOT NULL DEFAULT '',
      last_payment_error TEXT NOT NULL DEFAULT '',
      expires_at TEXT,
      paid_at TEXT,
      shipped_at TEXT,
      shipping_carrier TEXT NOT NULL DEFAULT '',
    shipping_tracking_no TEXT NOT NULL DEFAULT '',
    completed_at TEXT,
    cancelled_at TEXT,
    user_deleted_at TEXT,
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
      quantity INTEGER NOT NULL DEFAULT 1,
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

  const orderItemColumns = db.prepare("PRAGMA table_info(order_items)").all();
  if (!orderItemColumns.some((column) => String(column.name || "") === "quantity")) {
    db.exec("ALTER TABLE order_items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1");
  }
  const orderColumns = db.prepare("PRAGMA table_info(orders)").all();
  if (!orderColumns.some((column) => String(column.name || "") === "account_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN account_id TEXT NOT NULL DEFAULT ''");
  }
  if (!orderColumns.some((column) => String(column.name || "") === "body_book_theme_name")) {
    db.exec("ALTER TABLE orders ADD COLUMN body_book_theme_name TEXT NOT NULL DEFAULT ''");
  }
  if (!orderColumns.some((column) => String(column.name || "") === "shipping_carrier")) {
    db.exec("ALTER TABLE orders ADD COLUMN shipping_carrier TEXT NOT NULL DEFAULT ''");
  }
  if (!orderColumns.some((column) => String(column.name || "") === "shipping_tracking_no")) {
    db.exec("ALTER TABLE orders ADD COLUMN shipping_tracking_no TEXT NOT NULL DEFAULT ''");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_orders_account_id ON orders(account_id)");
  if (!orderColumns.some((column) => String(column.name || "") === "source_merchant_id")) {
    db.exec("ALTER TABLE orders ADD COLUMN source_merchant_id TEXT NOT NULL DEFAULT ''");
  }
  if (!orderColumns.some((column) => String(column.name || "") === "source_merchant_name")) {
    db.exec("ALTER TABLE orders ADD COLUMN source_merchant_name TEXT NOT NULL DEFAULT ''");
  }
  if (!orderColumns.some((column) => String(column.name || "") === "commission_rate_bps")) {
    db.exec("ALTER TABLE orders ADD COLUMN commission_rate_bps INTEGER NOT NULL DEFAULT 0");
  }
  if (!orderColumns.some((column) => String(column.name || "") === "source_claimed_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN source_claimed_at TEXT");
  }
  if (!orderColumns.some((column) => String(column.name || "") === "bean_discount_cents")) {
    db.exec("ALTER TABLE orders ADD COLUMN bean_discount_cents INTEGER NOT NULL DEFAULT 0");
  }
  if (!orderColumns.some((column) => String(column.name || "") === "coin_discount_cents")) {
    db.exec("ALTER TABLE orders ADD COLUMN coin_discount_cents INTEGER NOT NULL DEFAULT 0");
  }
  if (!orderColumns.some((column) => String(column.name || "") === "payable_cents")) {
    db.exec("ALTER TABLE orders ADD COLUMN payable_cents INTEGER NOT NULL DEFAULT 0");
    db.exec("UPDATE orders SET payable_cents = total_cents WHERE payable_cents = 0");
  }
  if (!orderColumns.some((column) => String(column.name || "") === "user_deleted_at")) {
    db.exec("ALTER TABLE orders ADD COLUMN user_deleted_at TEXT");
  }

  const insertOrderStatement = db.prepare(`
    INSERT INTO orders (
      id, order_no, visitor_id, account_id, public_token, experience_type, body_book_theme_name,
      payment_status, fulfillment_status, item_count,
      unit_price_cents, shipping_fee_cents, subtotal_cents, total_cents, bean_discount_cents, coin_discount_cents, payable_cents,
      remark, receiver_name, receiver_phone, province, city, district, address_detail,
      source_merchant_id, source_merchant_name, commission_rate_bps, source_claimed_at,
      admin_remark, wechat_open_id, wechat_transaction_id, out_trade_no,
      last_payment_channel, last_payment_error, expires_at, paid_at, shipped_at, shipping_carrier, shipping_tracking_no,
      completed_at, cancelled_at, user_deleted_at, created_at, updated_at
    ) VALUES (
      @id, @orderNo, @visitorId, @accountId, @publicToken, @experienceType, @bodyBookThemeName,
      @paymentStatus, @fulfillmentStatus, @itemCount,
      @unitPriceCents, @shippingFeeCents, @subtotalCents, @totalCents, @beanDiscountCents, @coinDiscountCents, @payableCents,
      @remark, @receiverName, @receiverPhone, @province, @city, @district, @addressDetail,
      @sourceMerchantId, @sourceMerchantName, @commissionRateBps, @sourceClaimedAt,
      @adminRemark, @wechatOpenId, @wechatTransactionId, @outTradeNo,
      @lastPaymentChannel, @lastPaymentError, @expiresAt, @paidAt, @shippedAt, @shippingCarrier, @shippingTrackingNo,
      @completedAt, @cancelledAt, @userDeletedAt, @createdAt, @updatedAt
    )
  `);

  const insertOrderItemStatement = db.prepare(`
    INSERT INTO order_items (
      order_id, job_id, style_id, style_name, image_url, thumbnail_url, quantity, sort_order
    ) VALUES (
      @orderId, @jobId, @styleId, @styleName, @imageUrl, @thumbnailUrl, @quantity, @sortOrder
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

  function replaceOrderOutTradeNo(orderId, outTradeNo) {
    const existing = readOrder(orderId);
    if (!existing) return null;
    db.prepare("UPDATE orders SET out_trade_no = ?, updated_at = ? WHERE id = ?")
      .run(String(outTradeNo || ""), nowIso(), existing.id);
    return readOrderWithRelations(existing.id);
  }

  function createOrder({ order, items = [], initialPaymentEvent = null }) {
    return withTransaction(db, () => {
      insertOrderStatement.run({
        accountId: order.accountId || "",
        bodyBookThemeName: order.bodyBookThemeName || "",
        beanDiscountCents: Math.max(0, Math.trunc(Number(order.beanDiscountCents || 0))),
        coinDiscountCents: Math.max(0, Math.trunc(Number(order.coinDiscountCents || 0))),
        payableCents: Math.max(0, Math.trunc(Number(order.payableCents ?? order.totalCents ?? 0))),
        adminRemark: "",
        cancelledAt: null,
        completedAt: null,
        userDeletedAt: null,
        lastPaymentChannel: order.lastPaymentChannel || "",
        lastPaymentError: order.lastPaymentError || "",
        paidAt: null,
        shippedAt: null,
        shippingCarrier: order.shippingCarrier || "",
        shippingTrackingNo: order.shippingTrackingNo || "",
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
          quantity: Math.max(1, Number(item.quantity || 1)),
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
    const persisted = {
      id: next.id,
      paymentStatus: next.paymentStatus,
      fulfillmentStatus: next.fulfillmentStatus,
      remark: next.remark,
      receiverName: next.receiverName,
      receiverPhone: next.receiverPhone,
      province: next.province,
      city: next.city,
      district: next.district,
      addressDetail: next.addressDetail,
      sourceMerchantId: next.sourceMerchantId,
      sourceMerchantName: next.sourceMerchantName,
      commissionRateBps: next.commissionRateBps,
      sourceClaimedAt: next.sourceClaimedAt,
      adminRemark: next.adminRemark,
      wechatOpenId: next.wechatOpenId,
      wechatTransactionId: next.wechatTransactionId,
      lastPaymentChannel: next.lastPaymentChannel,
      lastPaymentError: next.lastPaymentError,
      expiresAt: next.expiresAt,
      paidAt: next.paidAt,
      shippedAt: next.shippedAt,
      shippingCarrier: next.shippingCarrier,
      shippingTrackingNo: next.shippingTrackingNo,
      completedAt: next.completedAt,
      cancelledAt: next.cancelledAt,
      userDeletedAt: next.userDeletedAt,
      updatedAt: next.updatedAt
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
        source_merchant_id = @sourceMerchantId,
        source_merchant_name = @sourceMerchantName,
        commission_rate_bps = @commissionRateBps,
        source_claimed_at = @sourceClaimedAt,
        admin_remark = @adminRemark,
        wechat_open_id = @wechatOpenId,
        wechat_transaction_id = @wechatTransactionId,
        last_payment_channel = @lastPaymentChannel,
        last_payment_error = @lastPaymentError,
        expires_at = @expiresAt,
        paid_at = @paidAt,
        shipped_at = @shippedAt,
        shipping_carrier = @shippingCarrier,
        shipping_tracking_no = @shippingTrackingNo,
        completed_at = @completedAt,
        cancelled_at = @cancelledAt,
        user_deleted_at = @userDeletedAt,
        updated_at = @updatedAt
      WHERE id = @id
    `).run(persisted);

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

  function listOrders({ visitorId = "", accountId = "", merchantId = "", experienceScope = "", orderStatus = "", search = "", startDate = "", endDate = "", excludeUserDeleted = false, page = 1, limit = 20 } = {}) {
    expireUnpaidOrders();

    const conditions = [];
    const params = {};
    if (visitorId) {
      conditions.push("visitor_id = @visitorId");
      params.visitorId = visitorId;
    }
    if (accountId) {
      conditions.push("account_id = @accountId");
      params.accountId = accountId;
    }
    if (experienceScope === "body-book") {
      conditions.push("experience_type = 'body-book'");
    } else if (experienceScope === "fridge") {
      conditions.push("experience_type != 'body-book'");
    }
    if (excludeUserDeleted) {
      conditions.push("(user_deleted_at IS NULL OR user_deleted_at = '')");
    }
    if (merchantId) {
      conditions.push("source_merchant_id = @merchantId");
      params.merchantId = merchantId;
    }
    if (orderStatus) {
      if (orderStatus === "pending_payment") {
        conditions.push("payment_status = 'unpaid' AND fulfillment_status != 'cancelled'");
      } else if (orderStatus === "pending_shipment") {
        conditions.push("payment_status = 'paid' AND fulfillment_status NOT IN ('shipped', 'completed', 'cancelled')");
      } else if (orderStatus === "shipped") {
        conditions.push("fulfillment_status = 'shipped'");
      } else if (orderStatus === "completed") {
        conditions.push("fulfillment_status = 'completed'");
      } else if (orderStatus === "cancelled") {
        conditions.push("fulfillment_status = 'cancelled'");
      } else if (orderStatus === "expired") {
        conditions.push("payment_status = 'expired' AND fulfillment_status != 'cancelled'");
      }
    }
    if (search) {
      conditions.push("(order_no LIKE @search OR receiver_name LIKE @search OR receiver_phone LIKE @search OR source_merchant_name LIKE @search)");
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
    const requestedPage = Math.max(Number(page || 1), 1);

    const countRow = db.prepare(`SELECT COUNT(*) AS total FROM orders ${where}`).get(params);
    const total = Number(countRow?.total || 0);
    const totalPages = total > 0 ? Math.ceil(total / safeLimit) : 1;
    const safePage = Math.min(requestedPage, totalPages);
    const offset = (safePage - 1) * safeLimit;
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
      total,
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

  function listOrdersForExport({ visitorId = "", accountId = "", merchantId = "", orderStatus = "", search = "", startDate = "", endDate = "" } = {}) {
    expireUnpaidOrders();

    const conditions = [];
    const params = {};
    if (visitorId) {
      conditions.push("visitor_id = @visitorId");
      params.visitorId = visitorId;
    }
    if (accountId) {
      conditions.push("account_id = @accountId");
      params.accountId = accountId;
    }
    if (merchantId) {
      conditions.push("source_merchant_id = @merchantId");
      params.merchantId = merchantId;
    }
    if (orderStatus) {
      if (orderStatus === "pending_payment") {
        conditions.push("payment_status = 'unpaid' AND fulfillment_status != 'cancelled'");
      } else if (orderStatus === "pending_shipment") {
        conditions.push("payment_status = 'paid' AND fulfillment_status NOT IN ('shipped', 'completed', 'cancelled')");
      } else if (orderStatus === "shipped") {
        conditions.push("fulfillment_status = 'shipped'");
      } else if (orderStatus === "completed") {
        conditions.push("fulfillment_status = 'completed'");
      } else if (orderStatus === "cancelled") {
        conditions.push("fulfillment_status = 'cancelled'");
      } else if (orderStatus === "expired") {
        conditions.push("payment_status = 'expired' AND fulfillment_status != 'cancelled'");
      }
    }
    if (search) {
      conditions.push("(order_no LIKE @search OR receiver_name LIKE @search OR receiver_phone LIKE @search OR source_merchant_name LIKE @search)");
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
    const rows = db.prepare(`
      SELECT *
      FROM orders
      ${where}
      ORDER BY created_at DESC
    `).all(params);

    return rows.map((row) => mapOrderRow(row));
  }

  function listMerchantCommissionSummary({ merchantId = "", startDate = "", endDate = "", fallbackCommissionRateByMerchantId = {} } = {}) {
    expireUnpaidOrders();

    const conditions = ["payment_status = 'paid'", "source_merchant_id != ''"];
    const params = {};
    if (merchantId) {
      conditions.push("source_merchant_id = @merchantId");
      params.merchantId = merchantId;
    }
    if (startDate) {
      conditions.push("created_at >= @startDate");
      params.startDate = `${startDate}T00:00:00.000Z`;
    }
    if (endDate) {
      conditions.push("created_at <= @endDate");
      params.endDate = `${endDate}T23:59:59.999Z`;
    }

    const rows = db.prepare(`
      SELECT source_merchant_id, source_merchant_name, commission_rate_bps, payable_cents, total_cents, paid_at, created_at
      FROM orders
      WHERE ${conditions.join(" AND ")}
      ORDER BY created_at DESC
    `).all(params);

    const fallbackCommissionRateMap = new Map(
      Object.entries(fallbackCommissionRateByMerchantId).map(([nextMerchantId, nextRate]) => [
        String(nextMerchantId || ""),
        normalizeCommissionRateBps(nextRate)
      ])
    );

    const summaryByMerchantId = new Map();
    rows.forEach((row) => {
      const nextMerchantId = String(row.source_merchant_id || "");
      if (!nextMerchantId) return;
      const snapshotCommissionRateBps = normalizeCommissionRateBps(row.commission_rate_bps);
      const effectiveCommissionRateBps = snapshotCommissionRateBps || fallbackCommissionRateMap.get(nextMerchantId) || 0;

      const current = summaryByMerchantId.get(nextMerchantId) || {
        merchantId: nextMerchantId,
        merchantName: String(row.source_merchant_name || ""),
        paidOrderCount: 0,
        paidTotalCents: 0,
        commissionAmountCents: 0,
        latestPaidAt: row.paid_at || null,
        latestCreatedAt: row.created_at || null
      };

      current.paidOrderCount += 1;
      const paidCents = Number(row.payable_cents ?? row.total_cents ?? 0);
      current.paidTotalCents += paidCents;
      current.commissionAmountCents += Math.round(paidCents * effectiveCommissionRateBps / 10000);
      current.merchantName = current.merchantName || String(row.source_merchant_name || "");
      current.latestPaidAt = current.latestPaidAt || row.paid_at || null;
      current.latestCreatedAt = current.latestCreatedAt || row.created_at || null;
      summaryByMerchantId.set(nextMerchantId, current);
    });

    return Array.from(summaryByMerchantId.values()).sort(
      (left, right) => Number(right.commissionAmountCents || 0) - Number(left.commissionAmountCents || 0)
    );
  }

  function backfillMissingCommissionSnapshots({ merchantById = {} } = {}) {
    const merchantEntries = Object.entries(merchantById).map(([merchantId, merchant]) => [
      String(merchantId || ""),
      {
        id: String(merchant?.id || merchantId || ""),
        name: String(merchant?.name || ""),
        commissionRateBps: normalizeCommissionRateBps(merchant?.commissionRateBps)
      }
    ]);
    const safeMerchantById = new Map(merchantEntries.filter(([merchantId]) => merchantId));

    if (!safeMerchantById.size) {
      return { updatedOrderCount: 0 };
    }

    const ordersToRepair = db.prepare(`
      SELECT id, source_merchant_id, source_merchant_name, commission_rate_bps
      FROM orders
      WHERE source_merchant_id != ''
        AND commission_rate_bps = 0
    `).all();

    let updatedOrderCount = 0;
    withTransaction(db, () => {
      const statement = db.prepare(`
        UPDATE orders
        SET source_merchant_name = @sourceMerchantName,
            commission_rate_bps = @commissionRateBps,
            updated_at = @updatedAt
        WHERE id = @id
      `);

      ordersToRepair.forEach((row) => {
        const merchantId = String(row.source_merchant_id || "");
        const merchant = safeMerchantById.get(merchantId);
        if (!merchant || !merchant.commissionRateBps) return;

        statement.run({
          id: String(row.id || ""),
          sourceMerchantName: merchant.name || String(row.source_merchant_name || ""),
          commissionRateBps: merchant.commissionRateBps,
          updatedAt: nowIso()
        });
        updatedOrderCount += 1;
      });
    });

    return { updatedOrderCount };
  }

  return {
    appendPaymentEvent,
    backfillMissingCommissionSnapshots,
    createOrder,
    expireUnpaidOrders,
    listOrders,
    listOrdersForExport,
    listMerchantCommissionSummary,
    readOrder,
    readOrderByOutTradeNo,
    readOrderItems,
    readOrderWithRelations,
    replaceOrderOutTradeNo,
    updateOrder,
    updateOrderAndAppendEvent
  };
}
