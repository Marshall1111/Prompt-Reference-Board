const publicExperience = require("./public-experience");
const publicApi = require("./public-api");
const format = require("./format");

const SUBJECT_OPTIONS = [
  { value: "person", label: "仅人物" },
  { value: "pet", label: "仅宠物" },
  { value: "mixed", label: "人+宠" },
  { value: "other", label: "其他" }
];
const DRAW_COUNT_OPTIONS = [1, 2, 4];
const MAX_STYLE_SELECTION = 6;
const REFERENCE_UPLOAD_QUALITY = 72;
function readInviteToken(inviteUrl) {
  var match = String(inviteUrl || "").match(/[?&]invite=([^&#]+)/);
  if (!match) return "";
  try {
    return decodeURIComponent(match[1]);
  } catch (error) {
    return match[1];
  }
}

function createExperiencePage(config) {
  const experienceType = config.experienceType;
  const isDrawCard = experienceType === "draw-card";

  return {
    data: {
      experienceType: experienceType,
      isDrawCard: isDrawCard,
      isFridge: experienceType === "fridge-magnet",
      themeClass: config.themeClass,
      titleKicker: config.titleKicker || "",
      title: config.title,
      subtitle: config.subtitle,
      startButtonText: config.startButtonText,
      clipTitle: config.clipTitle,
      clipEmptyText: config.clipEmptyText,
      clipItemFallback: config.clipItemFallback,
      pocketAddLabel: config.pocketAddLabel,
      pocketAddedLabel: config.pocketAddedLabel,
      pocketRemoveLabel: config.pocketRemoveLabel,
      contactFallback: config.contactFallback,
      otherPageLabel: config.otherPageLabel,
      showOtherEntry: config.showOtherEntry === true,
      subjectOptions: SUBJECT_OPTIONS,
      drawCountOptions: DRAW_COUNT_OPTIONS,
      selectedSubjectType: "",
      selectedSubjectLabel: "",
      requestedDrawCount: 2,
      referenceFilePath: "",
      referencePreviewUrl: "",
      phase: "idle",
      phaseLabel: "准备开始",
      visitorState: null,
      orderConfig: null,
      session: null,
      isSessionInProgress: false,
      displayItems: [],
      clipItems: [],
      showImagePreview: false,
      previewImageUrl: "",
      previewJobId: "",
      previewIsClip: false,
      previewIsLiked: false,
      previewIsOriginal: false,
      previewNeedsLongPress: false,
      isPreviewOriginalLoading: false,
      isPreviewClipUpdating: false,
      showOriginalDownloadUnlock: false,
      inviteCode: "",
      errorMessage: "",
      isSubmitting: false,
      isDiscardConfirming: false,
      isLoading: true,
      showDrawConfig: false,
      showStylePicker: false,
      styles: [],
      selectedStyleIds: [],
      selectedStyleLabels: "",
      stylePickerError: "",
      showOrderModal: false,
      showManualPayment: false,
      manualPaymentOrder: null,
      orderForm: {
        receiverName: "",
        receiverPhone: "",
        address: "",
        remark: ""
      },
      orderQuantities: {},
      orderItems: [],
      orderSelectedImageCount: 0,
      orderAmount: format.calculateAmount(0, null),
      orderAmountText: "¥0.00",
      orderUnitPriceText: "¥0.00",
      orderShippingText: "包邮",
      orderError: "",
      isCreatingOrder: false,
      showAccountModal: false,
      showProfileSetup: false,
      profileEditorMode: "settings",
      profileNickname: "小画家00000000",
      profileAvatarTempUrl: "",
      profileDefaultAvatarUrl: publicApi.toAbsoluteUrl("/account-avatars/default-avatar.svg"),
      profileAvatarPreviewUrl: publicApi.toAbsoluteUrl("/account-avatars/default-avatar.svg"),
      profileAvatarMode: "default",
      profileError: "",
      isSavingProfile: false,
      showCoinInfo: false,
      showCoinPurchase: false,
      coinPurchaseCount: 20,
      coinPurchaseAmountText: "¥20.00",
      coinPurchaseFirstMagnetPriceYuan: "5",
      coinPurchaseError: "",
      isCoinPurchaseBusy: false,
      showOrdersOverlay: false,
      orderOverlayItems: [],
      payingOverlayPurchaseId: "",
      isOrdersOverlayLoading: false,
      ordersOverlayError: "",
      showUserMenu: false,
      isAccountRegistered: false,
      accountDisplayInitial: "登录",
      accountAvatarUrl: "",
      coinPurchaseDiscountText: "¥0.00",
      isPreparingReferral: false,
      referralSharePath: "",
      referralError: "",
      isLoggingOut: false,
      authMode: "login",
      authForm: {
        email: "",
        username: "",
        password: "",
        code: ""
      },
      authError: "",
      authMessage: "",
      authBusy: false
    },

    onLoad: function (options) {
      this.incomingReferralToken = String(options && options.invite || "").trim();
      this.loadInitialState();
    },

    onShareAppMessage: function () {
      return {
        title: "上传照片，一键制作AI小画冰箱贴",
        path: this.data.referralSharePath || "pages/draw/draw",
        imageUrl: "/images/share-home.png"
      };
    },

    onShow: function () {
      if (!this.data.isLoading) {
        if (!this.data.isAccountRegistered) {
          this.setData({ showAccountModal: true });
          return;
        }
        this.refreshPublicState();
        if (this.data.session && !publicExperience.isTerminalStatus(this.data.session.status)) {
          this.startPolling(this.data.session.sessionId);
        }
      }
    },

    onUnload: function () {
      this.stopPolling();
    },

    onHide: function () {
      this.stopPolling();
    },

    onPullDownRefresh: function () {
      var self = this;
      if (!this.data.isAccountRegistered) {
        wx.stopPullDownRefresh();
        return;
      }
      this.refreshPublicState().finally(function () {
        wx.stopPullDownRefresh();
        if (self.data.session && !publicExperience.isTerminalStatus(self.data.session.status)) {
          self.startPolling(self.data.session.sessionId);
        }
      });
    },

    loadInitialState: function () {
      var self = this;
      var isAuthenticated = false;
      this.setData({ isLoading: true });

      publicExperience.ensureMiniProgramLogin(this.incomingReferralToken).then(function (accountState) {
        self.incomingReferralToken = "";
        isAuthenticated = Boolean(accountState && accountState.authenticated);
        if (!isAuthenticated) {
          self.setData({
            showAccountModal: true,
            visitorState: null,
            session: null,
            isSessionInProgress: false,
            displayItems: [],
            clipItems: []
          });
          return isDrawCard ? self.loadStyles() : Promise.resolve();
        }
        if (isDrawCard) self.prefetchOrdersCache();
        return Promise.all([
          self.refreshPublicState(),
          isDrawCard ? self.loadStyles() : Promise.resolve()
        ]);
      }).then(function () {
        return isAuthenticated ? self.restoreSession() : null;
      }).catch(function (error) {
        self.setData({
          errorMessage: (error && error.message) || "页面加载失败，请稍后再试。"
        });
      }).finally(function () {
        self.setData({ isLoading: false });
      });
    },

    refreshPublicState: function (options) {
      var self = this;
      var skipClipItems = Boolean(options && options.skipClipItems);
      return Promise.all([
        publicExperience.fetchVisitorState().catch(function () { return null; }),
        publicExperience.fetchOrderConfig().catch(function () { return null; }),
        skipClipItems ? Promise.resolve([]) : publicExperience.fetchClipItems(experienceType).catch(function () { return []; })
      ]).then(function (results) {
        var visitorState = results[0];
        var account = visitorState && visitorState.account ? visitorState.account : {};
        var isAccountRegistered = Boolean(account.isRegistered);
        var accountName = String(account.username || "我的账户").trim();
        self.setData({
          visitorState: visitorState,
          orderConfig: results[1],
          clipItems: results[2],
          isAccountRegistered: isAccountRegistered,
          accountDisplayInitial: isAccountRegistered ? (accountName.slice(0, 1) || "我") : "登录",
          accountAvatarUrl: publicApi.toAbsoluteUrl(account.wechatAvatarUrl || ""),
          coinPurchaseDiscountText: format.formatCurrencyCents(Math.max(0, Number(visitorState && visitorState.coinPurchaseDiscount && visitorState.coinPurchaseDiscount.availableCents || 0))),
          coinPurchaseFirstMagnetPriceYuan: formatFirstMagnetPriceYuan(self.data.coinPurchaseCount, results[1]),
          errorMessage: ""
        });
        self.rebuildOrderSummary();
      });
    },

    restoreSession: function () {
      var self = this;
      var sessionId = publicExperience.readSessionId(experienceType);
      var loader = sessionId
        ? publicExperience.fetchSession(experienceType, sessionId)
        : publicExperience.fetchLatestSession(experienceType);

      return loader.then(function (session) {
        if (session && session.sessionId) {
          self.applySession(session);
          if (!publicExperience.isTerminalStatus(session.status)) {
            self.startPolling(session.sessionId);
          }
        }
      }).catch(function () {});
    },

    loadStyles: function () {
      var self = this;
      return publicExperience.fetchDrawCardStyles().then(function (styles) {
        self.setData({ styles: markSelectedStyles(styles, self.data.selectedStyleIds) });
      }).catch(function (error) {
        self.setData({
          stylePickerError: (error && error.message) || "风格加载失败。"
        });
      });
    },

    chooseImage: function () {
      var self = this;
      wx.chooseImage({
        count: 1,
        sizeType: ["compressed"],
        sourceType: ["album", "camera"],
        success: function (result) {
          var path = result.tempFilePaths && result.tempFilePaths[0] || "";
          if (!path) return;
          self.setData({
            referenceFilePath: path,
            referencePreviewUrl: path,
            errorMessage: "",
            phase: self.data.session ? self.data.phase : "idle",
            phaseLabel: self.data.session ? self.data.phaseLabel : "准备开始"
          });
        }
      });
    },

    clearImage: function () {
      this.setData({
        referenceFilePath: "",
        referencePreviewUrl: ""
      });
    },

    openOtherPage: function () {
      wx.navigateTo({
        url: isDrawCard ? "/pages/fridge/fridge" : "/pages/draw/draw"
      });
    },

    openOrders: function () {
      this.setData({ showUserMenu: false, showOrdersOverlay: true });
      this.loadOrdersOverlay();
    },

    closeOrdersOverlay: function () {
      this.setData({ showOrdersOverlay: false });
    },

    loadOrdersOverlay: function () {
      var self = this;
      var cached = publicExperience.readOrdersCache();
      var hasCachedOrders = Boolean(cached);
      var nextCache = cached || { orders: [], purchases: [], orderConfig: null, cachedAt: 0 };
      var pendingRequests = 2;
      var hasSuccessfulResponse = false;
      var firstError = null;

      function applyLatestCache() {
        nextCache.cachedAt = Date.now();
        publicExperience.saveOrdersCache(nextCache);
        hasSuccessfulResponse = true;
        self.applyOrdersOverlay(nextCache);
        self.setData({ isOrdersOverlayLoading: false });
      }

      function finishRequest() {
        pendingRequests -= 1;
        if (pendingRequests > 0) return;
        if (!hasSuccessfulResponse && !hasCachedOrders) {
          self.setData({ ordersOverlayError: (firstError && firstError.message) || "读取订单失败。" });
        }
        self.setData({ isOrdersOverlayLoading: false });
      }

      if (hasCachedOrders) this.applyOrdersOverlay(nextCache);
      this.setData({ isOrdersOverlayLoading: !hasCachedOrders, ordersOverlayError: "" });
      Promise.all([
        publicExperience.fetchMyOrders("fridge").then(function (payload) {
          nextCache.orders = payload && payload.orders || [];
          nextCache.orderConfig = payload && payload.config || null;
          applyLatestCache();
        }).catch(function (error) {
          firstError = firstError || error;
        }).then(finishRequest),
        publicExperience.fetchCoinPurchases().then(function (payload) {
          nextCache.purchases = payload && payload.purchases || [];
          applyLatestCache();
        }).catch(function (error) {
          firstError = firstError || error;
        }).then(finishRequest)
      ]);
    },

    applyOrdersOverlay: function (cached) {
      var orders = (cached.orders || []).map(normalizeOverlayOrder);
      var purchases = (cached.purchases || []).map(normalizeOverlayCoinPurchase);
      this.setData({
        orderOverlayItems: orders.concat(purchases).sort(function (left, right) {
          return Date.parse(String(right.createdAt || "")) - Date.parse(String(left.createdAt || ""));
        }),
        ordersOverlayError: ""
      });
    },

    openOverlayOrder: function (event) {
      var orderId = event.currentTarget.dataset.id;
      if (!orderId) return;
      wx.navigateTo({ url: "/pages/order-detail/order-detail?id=" + encodeURIComponent(orderId) });
    },

    deleteOverlayOrder: function (event) {
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
            self.loadOrdersOverlay();
          }).catch(function (error) {
            wx.showToast({ title: (error && error.message) || "删除失败", icon: "none" });
          });
        }
      });
    },

    openOverlayCoinPurchase: function (event) {
      var purchaseId = event.currentTarget.dataset.id;
      var purchase = (this.data.orderOverlayItems || []).find(function (item) {
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
          if (result.confirm && purchase.canPay) self.payOverlayCoinPurchase(purchaseId);
        }
      });
    },

    payOverlayCoinPurchase: function (eventOrPurchaseId) {
      var purchaseId = typeof eventOrPurchaseId === "string" ? eventOrPurchaseId : eventOrPurchaseId.currentTarget.dataset.id;
      var purchase = (this.data.orderOverlayItems || []).find(function (item) {
        return item.type === "coin_purchase" && item.id === purchaseId;
      });
      if (!purchase || !purchase.canPay || this.data.payingOverlayPurchaseId) return;
      var self = this;
      this.setData({ payingOverlayPurchaseId: purchaseId, ordersOverlayError: "" });
      publicExperience.payCoinPurchase(purchaseId).then(function (payload) {
        return requestMiniProgramPayment(payload && payload.payment);
      }).then(function () {
        wx.showToast({ title: "支付已提交", icon: "success" });
        self.loadOrdersOverlay();
      }).catch(function (error) {
        wx.showToast({ title: (error && error.message) || "支付未完成", icon: "none" });
      }).finally(function () {
        self.setData({ payingOverlayPurchaseId: "" });
      });
    },

    deleteOverlayCoinPurchase: function (event) {
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
            self.loadOrdersOverlay();
          }).catch(function (error) {
            wx.showToast({ title: (error && error.message) || "删除失败", icon: "none" });
          });
        }
      });
    },

    openLatestSession: function () {
      var self = this;
      if (this.data.isSubmitting) return;
      this.setData({ errorMessage: "" });
      publicExperience.fetchLatestSession(experienceType).then(function (session) {
        if (!session || !session.sessionId) throw new Error("还没有可恢复的生成记录。");
        self.applySession(session);
        if (!publicExperience.isTerminalStatus(session.status)) {
          self.startPolling(session.sessionId);
        }
      }).catch(function (error) {
        self.setData({ errorMessage: (error && error.message) || "读取最近生成失败，请稍后重试。" });
      });
    },

    prefetchOrdersCache: function () {
      return publicExperience.prefetchOrdersCache();
    },

    openDrawConfig: function () {
      if (this.data.isSessionInProgress || this.data.isSubmitting) return;
      if (!this.ensureImageReady()) return;
      this.setData({
        showDrawConfig: true,
        errorMessage: ""
      });
    },

    closeDrawConfig: function () {
      this.setData({ showDrawConfig: false });
    },

    selectSubject: function (event) {
      var value = event.currentTarget.dataset.value;
      var option = SUBJECT_OPTIONS.find(function (item) { return item.value === value; }) || null;
      this.setData({
        selectedSubjectType: option ? option.value : "",
        selectedSubjectLabel: option ? option.label : ""
      });
    },

    setDrawCount: function (event) {
      var count = Number(event.currentTarget.dataset.count || 2);
      this.setData({ requestedDrawCount: count });
    },

    confirmDrawConfig: function () {
      if (!this.data.selectedSubjectType) {
        this.setData({ errorMessage: "请先选择照片主体。" });
        return;
      }
      this.setData({ showDrawConfig: false });
      this.startSession({
        subjectType: this.data.selectedSubjectType,
        drawCount: this.data.requestedDrawCount
      });
    },

    openStylePicker: function () {
      if (this.data.isSessionInProgress || this.data.isSubmitting) return;
      if (!this.ensureImageReady()) return;
      if (!this.data.styles.length) {
        this.loadStyles();
      }
      this.setData({
        showStylePicker: true,
        stylePickerError: ""
      });
    },

    closeStylePicker: function () {
      this.setData({ showStylePicker: false });
    },

    toggleStyle: function (event) {
      var styleId = event.currentTarget.dataset.id;
      var current = this.data.selectedStyleIds.slice();
      var index = current.indexOf(styleId);
      var labels = "";

      if (index >= 0) {
        current.splice(index, 1);
      } else {
        if (current.length >= MAX_STYLE_SELECTION) {
          this.setData({ stylePickerError: "最多选择 " + MAX_STYLE_SELECTION + " 种风格。" });
          return;
        }
        current.push(styleId);
      }

      labels = current.map(function (id) {
        var style = findById(this.data.styles, id);
        return style ? style.title : "";
      }, this).filter(Boolean).join("、");

      this.setData({
        selectedStyleIds: current,
        styles: markSelectedStyles(this.data.styles, current),
        selectedStyleLabels: labels,
        stylePickerError: ""
      });
    },

    confirmStylePicker: function () {
      if (!this.data.selectedStyleIds.length) {
        this.setData({ stylePickerError: "请至少选择一种风格。" });
        return;
      }
      this.setData({ showStylePicker: false });
      this.startSession({ selectedStyleIds: this.data.selectedStyleIds });
    },

    startDefault: function () {
      if (this.data.isSessionInProgress || this.data.isSubmitting) return;
      if (!this.ensureImageReady()) return;
      if (isDrawCard) {
        this.openDrawConfig();
        return;
      }
      this.startSession({});
    },

    startSession: function (options, skipDiscardConfirm) {
      var self = this;
      var nextOptions = options || {};
      var estimatedCost = estimateCost(experienceType, nextOptions);

      if (!this.ensureImageReady()) return;
      if (this.data.isSubmitting || this.data.isSessionInProgress || this.data.isDiscardConfirming) return;

      var hasUncollectedResults = this.data.displayItems.some(function (item) {
        return item.result && !item.isLiked;
      });
      if (hasUncollectedResults && !skipDiscardConfirm) {
        this.setData({ isDiscardConfirming: true });
        wx.showModal({
          title: "开始新一轮生成？",
          content: "上一轮未加入卡夹的图片将被清空，有喜欢的图片请先加入卡夹。",
          confirmText: "确定开始",
          cancelText: "暂不开始",
          success: function (result) {
            self.setData({ isDiscardConfirming: false });
            if (result.confirm) self.startSession(nextOptions, true);
          },
          fail: function () {
            self.setData({ isDiscardConfirming: false });
          }
        });
        return;
      }

      if (this.data.visitorState && Number(this.data.visitorState.quotaRemaining || 0) < estimatedCost) {
        this.setData({
          errorMessage: "本次最多需要 " + estimatedCost + " 点，当前剩余 " + Number(this.data.visitorState.quotaRemaining || 0) + " 点。"
        });
        return;
      }

      this.stopPolling();
      this.setData({
        isSubmitting: true,
        phase: "waiting",
        phaseLabel: "正在提交",
        errorMessage: "",
        session: null,
        isSessionInProgress: true,
        displayItems: []
      });

      prepareReferenceUpload(this.data.referenceFilePath).then(function (prepared) {
        self.setData({ phaseLabel: "正在提交" });
        return publicExperience.createSession(experienceType, Object.assign({}, nextOptions, {
          filePath: prepared.filePath,
          uploadMetrics: prepared.metrics
        }));
      }).then(function (session) {
        self.applySession(session);
        self.startPolling(session.sessionId);
        return self.refreshPublicState();
      }).catch(function (error) {
        self.setData({
          phase: "error",
          phaseLabel: "没有顺利开始",
          isSessionInProgress: false,
          errorMessage: (error && error.message) || "任务启动失败，请稍后再试。"
        });
      }).finally(function () {
        self.setData({ isSubmitting: false });
      });
    },

    startPolling: function (sessionId) {
      var self = this;
      this.stopPolling();
      if (!sessionId) return;
      this.pollingTimer = setInterval(function () {
        publicExperience.fetchSession(experienceType, sessionId).then(function (session) {
          self.applySession(session);
          if (publicExperience.isTerminalStatus(session.status)) {
            self.stopPolling();
            self.refreshPublicState();
          }
        }).catch(function (error) {
          self.stopPolling();
          self.setData({
            errorMessage: (error && error.message) || "读取任务进度失败。"
          });
        });
      }, 2200);
    },

    stopPolling: function () {
      if (this.pollingTimer) {
        clearInterval(this.pollingTimer);
        this.pollingTimer = null;
      }
    },

    applySession: function (session) {
      var displayItems = buildDisplayItems(session);
      var phase = "waiting";
      var label = format.sessionStatusLabel(session.status);

      if (publicExperience.isTerminalStatus(session.status)) {
        phase = session.status === "failed" && !displayItems.some(function (item) { return item.result; }) ? "error" : "results";
      }

      this.setData({
        session: session,
        isSessionInProgress: !publicExperience.isTerminalStatus(session.status),
        displayItems: displayItems,
        phase: phase,
        phaseLabel: label,
        errorMessage: session.failedReason || ""
      });
    },

    previewResult: function (event) {
      var url = event.currentTarget.dataset.url;
      this.previewRemoteImage(url, event.currentTarget.dataset.jobid, false);
    },

    previewClip: function (event) {
      var url = event.currentTarget.dataset.url;
      this.previewRemoteImage(url, event.currentTarget.dataset.jobid, true);
    },

    previewRemoteImage: function (url, jobId, isClip) {
      var self = this;
      var imageUrl = String(url || "").trim();
      var displayItem = this.data.displayItems.filter(function (item) {
        return String(item.jobId || "") === String(jobId || "");
      })[0];
      if (!imageUrl || this.isPreviewingRemoteImage) return;
      this.isPreviewingRemoteImage = true;
      wx.showLoading({ title: "正在打开预览", mask: true });
      publicApi.downloadFile(imageUrl).then(function (tempFilePath) {
        wx.hideLoading();
        self.setData({
          showImagePreview: true,
          previewImageUrl: tempFilePath,
          previewJobId: String(jobId || ""),
          previewIsClip: Boolean(isClip),
          previewIsLiked: Boolean(isClip || (displayItem && displayItem.isLiked)),
          previewIsOriginal: false,
          previewNeedsLongPress: false,
          isPreviewOriginalLoading: false,
          isPreviewClipUpdating: false
        });
      }).catch(function (error) {
        wx.hideLoading();
        wx.showToast({
          title: (error && error.message) || "图片加载失败，请重试",
          icon: "none"
        });
      }).finally(function () {
        self.isPreviewingRemoteImage = false;
      });
    },

    closeImagePreview: function () {
      if (this.data.isPreviewOriginalLoading || this.data.isPreviewClipUpdating) return;
      this.setData({
        showImagePreview: false,
        previewImageUrl: "",
        previewJobId: "",
        previewIsClip: false,
        previewIsLiked: false,
        previewIsOriginal: false,
        previewNeedsLongPress: false,
        isPreviewClipUpdating: false
      });
    },

    downloadPreviewOriginal: function () {
      var self = this;
      var jobId = String(this.data.previewJobId || "");
      var visitorState = this.data.visitorState || {};
      var account = visitorState.account || {};

      if (!jobId || this.data.isPreviewOriginalLoading) return;
      if (!account.canRedeemOriginalDownloads) {
        this.setData({ showOriginalDownloadUnlock: true });
        return;
      }

      this.setData({ isPreviewOriginalLoading: true });
      wx.showLoading({ title: "正在加载原图", mask: true });
      publicExperience.downloadClipOriginal(jobId).then(function (tempFilePath) {
        return saveImageToAlbum(tempFilePath).then(function () {
          wx.hideLoading();
          wx.showToast({ title: "原图已保存到相册", icon: "success" });
          return self.refreshPublicState();
        }).catch(function () {
          wx.hideLoading();
          self.setData({
            previewImageUrl: tempFilePath,
            previewIsOriginal: true,
            previewNeedsLongPress: true
          });
        });
      }).catch(function (error) {
        wx.hideLoading();
        var message = String(error && error.message || "");
        if (message.indexOf("购买币累计满 20 元") !== -1) {
          self.setData({ showOriginalDownloadUnlock: true });
          return;
        }
        wx.showToast({ title: message || "原图加载失败，请重试", icon: "none" });
      }).finally(function () {
        self.setData({ isPreviewOriginalLoading: false });
      });
    },

    closeOriginalDownloadUnlock: function () {
      this.setData({ showOriginalDownloadUnlock: false });
    },

    openOriginalUnlockCoinPurchase: function () {
      this.setData({
        showOriginalDownloadUnlock: false,
        showImagePreview: false,
        previewImageUrl: "",
        previewJobId: "",
        previewIsOriginal: false,
        previewNeedsLongPress: false,
        isPreviewOriginalLoading: false
      });
      this.openCoinPurchase();
    },

    openOriginalUnlockOrder: function () {
      this.setData({ showOriginalDownloadUnlock: false, showImagePreview: false });
      this.openOrderModal();
    },

    downloadClipOriginal: function (event) {
      var self = this;
      var jobId = event.currentTarget.dataset.jobid;
      var visitorState = this.data.visitorState || {};

      if (!jobId) return;
      if (!visitorState.account || !visitorState.account.canRedeemOriginalDownloads) {
        showOriginalDownloadUnlockModal(self);
        return;
      }
      downloadClipOriginalToAlbum(self, jobId);
    },

    togglePreviewClip: function () {
      var self = this;
      var jobId = String(this.data.previewJobId || "");
      var isLiked = Boolean(this.data.previewIsLiked);
      if (!jobId || this.data.isPreviewClipUpdating) return;

      this.setData({ isPreviewClipUpdating: true });
      (isLiked ? publicExperience.unlikeJob(jobId) : publicExperience.likeJob(jobId)).then(function () {
        self.markLiked(jobId, !isLiked);
        return publicExperience.fetchClipItems(experienceType);
      }).then(function (items) {
        self.setData({
          clipItems: items,
          errorMessage: "",
          previewIsClip: !isLiked,
          previewIsLiked: !isLiked
        });
        self.rebuildOrderSummary();
        wx.showToast({ title: isLiked ? "已移出卡夹" : "已加入卡夹", icon: "success" });
      }).catch(function (error) {
        wx.showToast({
          title: (error && error.message) || (isLiked ? "移出失败，请稍后再试。" : "加入失败，请稍后再试。"),
          icon: "none"
        });
      }).finally(function () {
        self.setData({ isPreviewClipUpdating: false });
      });
    },

    addToClip: function (event) {
      var self = this;
      var jobId = event.currentTarget.dataset.jobid;
      if (!jobId) return;

      publicExperience.likeJob(jobId).then(function () {
        self.markLiked(jobId, true);
        return publicExperience.fetchClipItems(experienceType);
      }).then(function (items) {
        self.setData({
          clipItems: items,
          errorMessage: ""
        });
        self.rebuildOrderSummary();
      }).catch(function (error) {
        self.setData({ errorMessage: (error && error.message) || "加入失败，请稍后再试。" });
      });
    },

    removeFromClip: function (event) {
      var self = this;
      var jobId = event.currentTarget.dataset.jobid;
      if (!jobId) return;

      publicExperience.unlikeJob(jobId).then(function () {
        self.markLiked(jobId, false);
        return publicExperience.fetchClipItems(experienceType);
      }).then(function (items) {
        self.setData({
          clipItems: items,
          errorMessage: ""
        });
        self.rebuildOrderSummary();
      }).catch(function (error) {
        self.setData({ errorMessage: (error && error.message) || "移出失败，请稍后再试。" });
      });
    },

    markLiked: function (jobId, isLiked) {
      var displayItems = this.data.displayItems.map(function (item) {
        if (item.jobId !== jobId) return item;
        return Object.assign({}, item, {
          isLiked: isLiked,
          result: item.result ? Object.assign({}, item.result, { isLiked: isLiked }) : item.result
        });
      });
      this.setData({ displayItems: displayItems });
    },

    redeemInvite: function () {
      var self = this;
      var code = String(this.data.inviteCode || "").trim();
      if (!code) {
        this.setData({ errorMessage: "请输入兑换码。" });
        return;
      }
      publicExperience.redeemInviteCode(code).then(function (visitor) {
        self.setData({
          visitorState: visitor,
          inviteCode: "",
          errorMessage: ""
        });
        wx.showToast({ title: "已兑换", icon: "success" });
      }).catch(function (error) {
        self.setData({ errorMessage: (error && error.message) || "兑换码兑换失败。" });
      });
    },

    onInviteInput: function (event) {
      this.setData({ inviteCode: event.detail.value });
    },

    copyContact: function () {
      var contact = getContact(this.data.orderConfig);
      wx.setClipboardData({
        data: contact,
        success: function () {
          wx.showToast({ title: "已复制微信号", icon: "success" });
        }
      });
    },

    openAccountModal: function () {
      this.setData({
        showAccountModal: true,
        showUserMenu: false,
        authMode: "login",
        authError: "",
        authMessage: ""
      });
    },

    openProfileSettings: function () {
      var account = this.data.visitorState && this.data.visitorState.account ? this.data.visitorState.account : {};
      var currentAvatarUrl = String(this.data.accountAvatarUrl || "").trim();
      var usesDefaultAvatar = currentAvatarUrl.indexOf("/account-avatars/default-avatar.svg") !== -1;
      this.setData({
        showProfileSetup: true,
        profileEditorMode: "settings",
        profileNickname: String(account.username || account.defaultWechatNickname || "小画家00000000").trim(),
        profileAvatarTempUrl: "",
        profileAvatarPreviewUrl: currentAvatarUrl || this.data.profileDefaultAvatarUrl,
        profileAvatarMode: usesDefaultAvatar || !currentAvatarUrl ? "default" : "existing",
        profileError: ""
      });
    },

    closeProfileSettings: function () {
      if (this.data.isSavingProfile) return;
      this.setData({
        showProfileSetup: false,
        profileAvatarTempUrl: "",
        profileError: ""
      });
    },

    openCoinInfo: function () {
      this.setData({ showCoinInfo: true, showUserMenu: false });
      this.prepareReferralShare();
    },

    closeCoinInfo: function () {
      this.setData({ showCoinInfo: false });
    },

    prepareReferralShare: function () {
      var self = this;
      if (this.data.isPreparingReferral || this.data.referralSharePath) return;
      if (!this.data.isAccountRegistered) {
        this.setData({ referralError: "请先登录后再邀请好友。" });
        return;
      }
      this.setData({ isPreparingReferral: true, referralError: "" });
      publicExperience.createReferralLink().then(function (payload) {
        var token = readInviteToken(payload && payload.inviteUrl);
        if (!token) throw new Error("邀请链接生成失败，请稍后重试。");
        self.setData({
          referralSharePath: "pages/draw/draw?invite=" + encodeURIComponent(token)
        });
      }).catch(function (error) {
        self.setData({ referralError: (error && error.message) || "邀请链接生成失败，请稍后重试。" });
      }).finally(function () {
        self.setData({ isPreparingReferral: false });
      });
    },

    stopTap: function () {},

    toggleAccountMenu: function () {
      if (!this.data.isAccountRegistered) {
        this.openAccountModal();
        return;
      }
      this.setData({
        showUserMenu: !this.data.showUserMenu,
        showCoinInfo: false
      });
    },

    closeUserMenu: function () {
      this.setData({ showUserMenu: false });
    },

    openOrdersFromUserMenu: function () {
      this.setData({ showUserMenu: false });
      this.openOrders();
    },

    openProfileSettingsFromUserMenu: function () {
      this.setData({ showUserMenu: false });
      this.openProfileSettings();
    },

    logoutAccount: function () {
      var self = this;
      if (this.data.isLoggingOut) return;
      this.stopPolling();
      publicExperience.clearSessionId(experienceType);
      this.setData({
        isLoggingOut: true,
        session: null,
        isSessionInProgress: false,
        displayItems: [],
        clipItems: [],
        showImagePreview: false,
        previewImageUrl: "",
        previewJobId: "",
        phase: "idle",
        showUserMenu: false,
        visitorState: null,
        isAccountRegistered: false,
        accountDisplayInitial: "登录",
        accountAvatarUrl: ""
      });
      publicExperience.logout().then(function () {
        self.setData({
          showAccountModal: true,
          referralSharePath: "",
          referralError: ""
        });
        wx.showToast({ title: "已退出登录", icon: "success" });
      }).catch(function (error) {
        self.setData({ errorMessage: (error && error.message) || "退出登录失败，请稍后重试。" });
      }).finally(function () {
        self.setData({ isLoggingOut: false });
      });
    },

    closeAccountModal: function () {
      if (this.data.authBusy) return;
      this.setData({ showAccountModal: false, authError: "", authMessage: "" });
    },

    setAuthMode: function (event) {
      var mode = String(event.currentTarget.dataset.mode || "login");
      if (["login", "register", "reset"].indexOf(mode) === -1) return;
      this.setData({ authMode: mode, authError: "", authMessage: "" });
    },

    onAuthFieldInput: function (event) {
      var field = String(event.currentTarget.dataset.field || "");
      if (["email", "username", "password", "code"].indexOf(field) === -1) return;
      var form = Object.assign({}, this.data.authForm);
      form[field] = event.detail.value;
      this.setData({ authForm: form });
    },

    sendAuthCode: function () {
      var self = this;
      var form = this.data.authForm || {};
      var purpose = this.data.authMode === "reset" ? "reset_password" : "register";
      if (!String(form.email || "").trim()) {
        this.setData({ authError: "请先填写邮箱地址。" });
        return;
      }
      this.setData({ authBusy: true, authError: "", authMessage: "" });
      publicExperience.requestEmailCode(form.email, purpose).then(function (result) {
        var developmentCode = String(result && result.developmentCode || "");
        var nextForm = Object.assign({}, self.data.authForm);
        if (developmentCode) nextForm.code = developmentCode;
        self.setData({
          authForm: nextForm,
          authMessage: developmentCode ? "本地验证码已自动填入。" : "验证码已发送，请查收邮箱。"
        });
      }).catch(function (error) {
        self.setData({ authError: (error && error.message) || "验证码发送失败，请稍后重试。" });
      }).finally(function () {
        self.setData({ authBusy: false });
      });
    },

    submitEmailAuth: function () {
      var self = this;
      var mode = this.data.authMode;
      var form = this.data.authForm || {};
      var email = String(form.email || "").trim();
      var password = String(form.password || "");

      if (!email || !password) {
        this.setData({ authError: "请填写邮箱和密码。" });
        return;
      }
      if ((mode === "register" || mode === "reset") && !String(form.code || "").trim()) {
        this.setData({ authError: "请填写邮箱验证码。" });
        return;
      }
      if (mode === "register" && !String(form.username || "").trim()) {
        this.setData({ authError: "请填写用户名。" });
        return;
      }

      this.setData({ authBusy: true, authError: "", authMessage: "" });
      var request = mode === "login"
        ? publicExperience.loginWithEmail(email, password)
        : mode === "reset"
          ? publicExperience.resetPasswordWithEmail({ email: email, password: password, code: form.code })
          : publicExperience.logout().then(function () {
            return publicExperience.initializeGuestAccount();
          }).then(function () {
            return publicExperience.registerWithEmail({
              email: email,
              username: form.username,
              password: password,
              code: form.code
            });
          });

      request.then(function () {
        if (mode === "reset") {
          self.setData({ authMode: "login", authMessage: "密码已更新，请使用新密码登录。" });
          return;
        }
        self.setData({ showAccountModal: false, authMessage: "", authError: "" });
        return self.refreshPublicState().then(function () {
          wx.showToast({ title: mode === "login" ? "登录成功" : "注册成功", icon: "success" });
        });
      }).catch(function (error) {
        self.setData({ authError: (error && error.message) || "账号操作失败，请稍后重试。" });
      }).finally(function () {
        self.setData({ authBusy: false });
      });
    },

    onProfileAvatarChosen: function (event) {
      var avatarUrl = String(event && event.detail && event.detail.avatarUrl || "").trim();
      if (!avatarUrl) return;
      this.setData({
        profileAvatarTempUrl: avatarUrl,
        profileAvatarPreviewUrl: avatarUrl,
        profileAvatarMode: "custom",
        profileError: ""
      });
    },

    onProfileNicknameInput: function (event) {
      this.setData({
        profileNickname: String(event && event.detail && event.detail.value || "").slice(0, 80),
        profileError: ""
      });
    },

    submitProfileSetup: function () {
      var self = this;
      var nickname = String(this.data.profileNickname || "").trim();
      var avatarFilePath = String(this.data.profileAvatarTempUrl || "").trim();

      if (!nickname) nickname = "小画家00000000";

      this.setData({ isSavingProfile: true, profileError: "" });
      publicExperience.updateMiniProgramProfile(nickname, avatarFilePath, this.data.profileAvatarMode).then(function () {
        return self.refreshPublicState();
      }).then(function () {
        self.setData({ showProfileSetup: false, profileAvatarTempUrl: "" });
        wx.showToast({ title: "资料已保存", icon: "success" });
      }).catch(function (error) {
        self.setData({ profileError: (error && error.message) || "资料保存失败，请稍后重试。" });
      }).finally(function () {
        self.setData({ isSavingProfile: false });
      });
    },

    loginWithWechat: function () {
      var self = this;
      this.stopPolling();
      publicExperience.clearSessionId(experienceType);
      this.setData({
        session: null,
        isSessionInProgress: false,
        displayItems: [],
        clipItems: [],
        showImagePreview: false,
        previewImageUrl: "",
        previewJobId: "",
        phase: "idle",
        showUserMenu: false,
        visitorState: null,
        isAccountRegistered: false,
        accountAvatarUrl: "",
        accountDisplayInitial: "登录",
        authBusy: true,
        authError: "",
        authMessage: ""
      });
      publicExperience.loginWithMiniProgram().then(function () {
        self.setData({ showAccountModal: false });
        return self.refreshPublicState();
      }).then(function () {
        return self.restoreSession();
      }).then(function () {
        wx.showToast({ title: "微信登录成功", icon: "success" });
      }).catch(function (error) {
        self.setData({ authError: (error && error.message) || "微信登录失败，请稍后重试。" });
      }).finally(function () {
        self.setData({ authBusy: false });
      });
    },

    openCoinPurchase: function () {
      this.setData({
        showCoinInfo: false,
        showCoinPurchase: true,
        coinPurchaseCount: 20,
        coinPurchaseAmountText: format.formatCurrencyCents(2000),
        coinPurchaseFirstMagnetPriceYuan: formatFirstMagnetPriceYuan(20, this.data.orderConfig),
        coinPurchaseError: ""
      });
    },

    closeCoinPurchase: function () {
      if (this.data.isCoinPurchaseBusy) return;
      this.setData({ showCoinPurchase: false, coinPurchaseError: "" });
    },

    selectCoinPurchaseCount: function (event) {
      this.updateCoinPurchaseCount(event.currentTarget.dataset.count);
    },

    onCoinPurchaseCountInput: function (event) {
      this.updateCoinPurchaseCount(event.detail.value);
    },

    updateCoinPurchaseCount: function (value) {
      var rawValue = String(value === undefined || value === null ? "" : value).replace(/[^0-9]/g, "");
      var count = rawValue ? Math.min(1000, Number(rawValue)) : 0;
      this.setData({
        coinPurchaseCount: count || "",
        coinPurchaseAmountText: format.formatCurrencyCents(count * 100),
        coinPurchaseFirstMagnetPriceYuan: formatFirstMagnetPriceYuan(count, this.data.orderConfig),
        coinPurchaseError: ""
      });
    },

    submitCoinPurchase: function () {
      var coinCount = Number(this.data.coinPurchaseCount || 0);
      if (!Number.isInteger(coinCount) || coinCount < 1 || coinCount > 1000) {
        this.setData({ coinPurchaseError: "请输入 1–1000 之间的购币数量。" });
        return;
      }
      purchaseCoins(this, coinCount);
    },

    openOrderModal: function () {
      if (!this.data.clipItems.length) {
        this.setData({ errorMessage: "请先把想要的冰箱贴加入口袋。" });
        return;
      }
      this.rebuildOrderSummary();
      this.setData({
        showOrderModal: true,
        orderError: ""
      });
    },

    closeOrderModal: function () {
      this.setData({ showOrderModal: false });
    },

    onOrderFieldInput: function (event) {
      var field = event.currentTarget.dataset.field;
      var value = event.detail.value;
      var orderForm = Object.assign({}, this.data.orderForm);
      orderForm[field] = value;
      this.setData({ orderForm: orderForm });
    },

    increaseQuantity: function (event) {
      this.setQuantity(event.currentTarget.dataset.jobid, 1);
    },

    decreaseQuantity: function (event) {
      this.setQuantity(event.currentTarget.dataset.jobid, -1);
    },

    setQuantity: function (jobId, delta) {
      var current = Object.assign({}, this.data.orderQuantities);
      var existingQuantity = Object.prototype.hasOwnProperty.call(current, jobId) ? Number(current[jobId]) : 1;
      current[jobId] = format.clampQuantity(existingQuantity + delta);
      this.setData({ orderQuantities: current });
      this.rebuildOrderSummary();
    },

    rebuildOrderSummary: function () {
      var quantities = this.data.orderQuantities || {};
      var orderItems = this.data.clipItems.map(function (item) {
        var quantity = Object.prototype.hasOwnProperty.call(quantities, item.jobId)
          ? format.clampQuantity(quantities[item.jobId])
          : 1;
        return Object.assign({}, item, {
          quantity: quantity,
          subtotalText: format.formatCurrencyCents(Number(this.data.orderConfig && this.data.orderConfig.unitPriceCents || 0) * quantity)
        });
      }, this);
      var totalCount = orderItems.reduce(function (sum, item) { return sum + item.quantity; }, 0);
      var selectedImageCount = orderItems.filter(function (item) { return item.quantity > 0; }).length;
      var amount = format.calculateAmount(totalCount, this.data.orderConfig);

      this.setData({
        orderItems: orderItems,
        orderSelectedImageCount: selectedImageCount,
        orderAmount: amount,
        orderAmountText: format.formatCurrencyCents(amount.totalCents),
        orderUnitPriceText: format.formatCurrencyCents(amount.unitPriceCents),
        orderShippingText: amount.shippingFeeCents > 0 ? format.formatCurrencyCents(amount.shippingFeeCents) : "包邮"
      });
    },

    submitOrder: function () {
      var self = this;
      var form = this.data.orderForm;

      if (this.data.isCreatingOrder) return;
      if (!this.data.orderAmount || Number(this.data.orderAmount.itemCount || 0) < 1) {
        this.setData({ orderError: "请至少选择 1 张图片定制。" });
        return;
      }
      this.setData({
        isCreatingOrder: true,
        orderError: ""
      });

      publicExperience.createOrder({
          experienceType: isDrawCard ? "draw-card" : "fridge-magnet",
        items: this.data.orderItems.filter(function (item) {
          return Number(item.quantity || 0) > 0;
        }).map(function (item) {
          return {
            jobId: item.jobId,
            quantity: item.quantity
          };
        }),
        receiverName: form.receiverName,
        receiverPhone: form.receiverPhone,
        address: form.address,
        remark: form.remark
      }).then(function (created) {
        return settleMiniProgramPayment(created).then(function (settlement) {
          return { created: created, settlement: settlement };
        });
      }).then(function (result) {
        var created = result.created;
        var settlement = result.settlement || {};
        if (settlement.mode !== "manual") {
          self.setData({
            showOrderModal: false,
            orderForm: {
              receiverName: "",
              receiverPhone: "",
              address: "",
              remark: ""
            }
          });
          wx.showToast({ title: settlement.mode === "already_paid" ? "订单已支付" : "支付已提交", icon: "success" });
          return self.refreshPublicState().then(function () {
            wx.navigateTo({ url: "/pages/order-detail/order-detail?id=" + encodeURIComponent(created.order.id) });
          });
        }
        self.setData({
          showOrderModal: false,
          showManualPayment: true,
          manualPaymentOrder: created,
          orderForm: {
            receiverName: "",
            receiverPhone: "",
            address: "",
            remark: ""
          }
        });
      }).catch(function (error) {
        self.setData({ orderError: (error && error.message) || "提交订单失败。" });
      }).finally(function () {
        self.setData({ isCreatingOrder: false });
      });
    },

    closeManualPayment: function () {
      this.setData({ showManualPayment: false });
    },

    copyManualOrderNo: function () {
      var order = this.data.manualPaymentOrder && this.data.manualPaymentOrder.order;
      if (!order) return;
      wx.setClipboardData({
        data: order.orderNo,
        success: function () {
          wx.showToast({ title: "已复制订单号", icon: "success" });
        }
      });
    },

    viewManualOrder: function () {
      var order = this.data.manualPaymentOrder && this.data.manualPaymentOrder.order;
      if (!order) return;
      wx.navigateTo({
        url: "/pages/order-detail/order-detail?id=" + encodeURIComponent(order.id) + "&token=" + encodeURIComponent(order.publicToken || "")
      });
    },

    ensureImageReady: function () {
      if (!this.data.referenceFilePath) {
        this.setData({ errorMessage: "请先上传 1 张图片。" });
        return false;
      }
      return true;
    }
  };
}

function formatFirstMagnetPriceYuan(coinCount, orderConfig) {
  var unitPriceCents = Math.max(0, Number(orderConfig && orderConfig.unitPriceCents || 2000));
  var discountCents = Math.min(unitPriceCents, 1500, Math.max(0, Number(coinCount || 0)) * 100);
  var priceYuan = (unitPriceCents - discountCents) / 100;
  return Number.isInteger(priceYuan) ? String(priceYuan) : priceYuan.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function normalizeOverlayOrder(order) {
  var firstItem = order && order.items && order.items[0] || null;
  var imageUrl = publicApi.toAbsoluteUrl(firstItem && (firstItem.thumbnailUrl || firstItem.imageUrl) || "");
  return {
    id: order.id,
    key: "order:" + order.id,
    type: "order",
    imageUrl: imageUrl,
    orderNo: order.orderNo,
    totalText: format.formatCurrencyCents(order.totalCents),
    createdAt: order.createdAt,
    statusText: order.orderStatus === "pending_payment" && order.lastPaymentChannel === "manual_collection" ? "待确认收款" : format.orderStatusLabel(order.orderStatus),
    statusClass: order.orderStatus,
    canDelete: ["pending_payment", "expired", "cancelled"].indexOf(order.orderStatus) !== -1
  };
}

function normalizeOverlayCoinPurchase(purchase) {
  var status = getOverlayCoinPurchaseStatus(purchase);
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
    createdAt: purchase.createdAt,
    createdAtText: format.formatDateTime(purchase.createdAt),
    statusText: status.label,
    statusClass: status.className,
    canPay: !isManualCollection && !isExpired && ["created", "pending"].indexOf(rawStatus) !== -1,
    canDelete: rawStatus !== "paid"
  };
}

function getOverlayCoinPurchaseStatus(purchase) {
  if (purchase && purchase.status === "cancelled") return { label: "已取消", className: "cancelled" };
  if (purchase && purchase.status !== "paid" && purchase.expiresAt && Date.parse(purchase.expiresAt) <= Date.now()) return { label: "已过期", className: "expired" };
  if (purchase && purchase.status === "paid") return { label: "已支付", className: "paid" };
  if (purchase && (purchase.status === "cancelled" || (purchase.expiresAt && Date.parse(purchase.expiresAt) <= Date.now()))) {
    return { label: "已过期", className: "cancelled" };
  }
  return {
    label: purchase && purchase.channel === "manual_collection" ? "待确认收款" : "待付款",
    className: "pending_payment"
  };
}

function buildDisplayItems(session) {
  return (session.items || []).map(function (item, index) {
    var result = item.result || null;
    var imageUrl = result ? (result.imageUrl || result.previewUrl || result.thumbnailUrl) : "";
    return {
      order: item.order,
      index: index + 1,
      jobId: item.jobId,
      styleId: item.styleId,
      styleName: item.styleName || ("结果 " + (index + 1)),
      status: item.status,
      statusLabel: format.sessionStatusLabel(item.status),
      errorMessage: item.errorMessage,
      result: result,
      imageUrl: imageUrl,
      thumbnailUrl: result ? result.thumbnailUrl : "",
      isLiked: Boolean(result && result.isLiked),
      canLike: item.status === "succeeded" && Boolean(result)
    };
  });
}

function estimateCost(experienceType, options) {
  if (experienceType === "fridge-magnet") return 1;
  if (options && options.selectedStyleIds && options.selectedStyleIds.length) return options.selectedStyleIds.length;
  return Number(options && options.drawCount || 2);
}

function findById(items, id) {
  return (items || []).find(function (item) {
    return item.id === id;
  }) || null;
}

function markSelectedStyles(styles, selectedIds) {
  return (styles || []).map(function (style) {
    return Object.assign({}, style, {
      selected: selectedIds.indexOf(style.id) !== -1
    });
  });
}

function saveImageToAlbum(filePath) {
  if (!filePath || !wx.saveImageToPhotosAlbum) {
    return Promise.reject(new Error("当前微信版本不支持保存到相册。"));
  }

  return new Promise(function (resolve, reject) {
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: resolve,
      fail: function (error) {
        var message = String(error && error.errMsg || "");
        if (message.indexOf("auth deny") !== -1 || message.indexOf("authorize no response") !== -1 || message.indexOf("fail auth") !== -1) {
          reject(new Error("请在微信设置里允许保存到相册后重试。"));
          return;
        }
        reject(new Error(message || "保存原图失败，请稍后再试。"));
      }
    });
  });
}

function downloadClipOriginalToAlbum(page, jobId) {
  wx.showLoading({ title: "正在下载", mask: true });
  publicExperience.downloadClipOriginal(jobId).then(function (tempFilePath) {
    return saveImageToAlbum(tempFilePath);
  }).then(function () {
    wx.hideLoading();
    page.setData({ errorMessage: "" });
    wx.showToast({ title: "已保存", icon: "success" });
    return page.refreshPublicState();
  }).catch(function (error) {
    wx.hideLoading();
    page.setData({ errorMessage: (error && error.message) || "保存原图失败，请稍后再试。" });
  });
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
        reject(new Error("微信支付未完成，请稍后在订单中继续支付。"));
      }
    });
  });
}

function settleMiniProgramPayment(created) {
  var order = created && created.order;
  var initialPayment = created && created.payment;
  if (!order || !order.id || !initialPayment || initialPayment.status === "already_paid") {
    return Promise.resolve({ mode: "already_paid" });
  }
  if (initialPayment.channel === "manual_collection") return Promise.resolve({ mode: "manual" });
  return publicExperience.payOrder(order.id).then(function (payload) {
    return requestMiniProgramPayment(payload && payload.payment).then(function () {
      return { mode: "wechat" };
    });
  });
}

function purchaseCoins(page, coinCount) {
  page.setData({ isCoinPurchaseBusy: true, coinPurchaseError: "" });
  publicExperience.createCoinPurchase(coinCount).then(function (created) {
    var purchase = created && created.purchase;
    var initialPayment = created && created.payment;
    if (!purchase || !purchase.id) throw new Error("购买单创建失败，请重试。");
    if (initialPayment && initialPayment.channel === "manual_collection") {
      return Promise.reject(new Error("当前购买币需等待人工确认收款。"));
    }
    return publicExperience.payCoinPurchase(purchase.id).then(function (payload) {
      return requestMiniProgramPayment(payload && payload.payment);
    });
  }).then(function () {
    wx.showToast({ title: "支付完成，币已到账", icon: "success" });
    page.setData({ showCoinPurchase: false, coinPurchaseError: "" });
    return page.refreshPublicState();
  }).catch(function (error) {
    page.setData({ coinPurchaseError: (error && error.message) || "购买币失败，请稍后重试。" });
  }).finally(function () {
    page.setData({ isCoinPurchaseBusy: false });
  });
}

function showOriginalDownloadUnlockModal(page) {
  wx.showModal({
    title: "解锁原图下载",
    content: "成功购买币累计满 20 元，或任意定制订单支付成功后，即可下载同一账户下的全部原图，无需额外消耗币。",
    confirmText: "购买币",
    cancelText: "知道了",
    success: function (result) {
      if (result.confirm) page.openCoinPurchase();
    }
  });
}

function prepareReferenceUpload(filePath) {
  var originalPath = String(filePath || "");
  var originalInfoPromise = Promise.all([
    getLocalFileInfo(originalPath),
    getLocalImageInfo(originalPath)
  ]);

  return originalInfoPromise.then(function (originalResults) {
    var originalFile = originalResults[0];
    var originalImage = originalResults[1];

    return compressLocalImage(originalPath).then(function (compressedPath) {
      return Promise.all([
        getLocalFileInfo(compressedPath),
        getLocalImageInfo(compressedPath)
      ]).then(function (compressedResults) {
        var compressedFile = compressedResults[0];
        var compressedImage = compressedResults[1];
        var uploadedBytes = Number(compressedFile.size || 0);
        var originalBytes = Number(originalFile.size || 0);
        var shouldUseCompressed = Boolean(compressedPath && compressedPath !== originalPath && (!uploadedBytes || !originalBytes || uploadedBytes <= originalBytes));
        var uploadPath = shouldUseCompressed ? compressedPath : originalPath;
        var uploadFile = shouldUseCompressed ? compressedFile : originalFile;
        var uploadImage = shouldUseCompressed ? compressedImage : originalImage;

        return {
          filePath: uploadPath,
          metrics: {
            originalBytes: originalBytes,
            uploadedBytes: Number(uploadFile.size || 0),
            originalWidth: Number(originalImage.width || 0),
            originalHeight: Number(originalImage.height || 0),
            uploadedWidth: Number(uploadImage.width || 0),
            uploadedHeight: Number(uploadImage.height || 0),
            wasCompressed: shouldUseCompressed
          }
        };
      });
    }).catch(function () {
      return {
        filePath: originalPath,
        metrics: {
          originalBytes: Number(originalFile.size || 0),
          uploadedBytes: Number(originalFile.size || 0),
          originalWidth: Number(originalImage.width || 0),
          originalHeight: Number(originalImage.height || 0),
          uploadedWidth: Number(originalImage.width || 0),
          uploadedHeight: Number(originalImage.height || 0),
          wasCompressed: false
        }
      };
    });
  });
}

function compressLocalImage(filePath) {
  if (!filePath || !wx.compressImage) return Promise.resolve(filePath);

  return new Promise(function (resolve, reject) {
    wx.compressImage({
      src: filePath,
      quality: REFERENCE_UPLOAD_QUALITY,
      success: function (result) {
        resolve(result.tempFilePath || filePath);
      },
      fail: reject
    });
  });
}

function getLocalFileInfo(filePath) {
  if (!filePath || !wx.getFileInfo) return Promise.resolve({});

  return new Promise(function (resolve) {
    wx.getFileInfo({
      filePath: filePath,
      success: function (result) {
        resolve({ size: Number(result.size || 0) });
      },
      fail: function () {
        resolve({});
      }
    });
  });
}

function getLocalImageInfo(filePath) {
  if (!filePath || !wx.getImageInfo) return Promise.resolve({});

  return new Promise(function (resolve) {
    wx.getImageInfo({
      src: filePath,
      success: function (result) {
        resolve({
          width: Number(result.width || 0),
          height: Number(result.height || 0)
        });
      },
      fail: function () {
        resolve({});
      }
    });
  });
}

function getContact(config) {
  return String(config && config.contactWechatId || "PetPaint").trim() || "PetPaint";
}

module.exports = {
  createExperiencePage: createExperiencePage
};
