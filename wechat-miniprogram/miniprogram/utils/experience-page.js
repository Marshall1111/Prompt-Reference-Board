const publicExperience = require("./public-experience");
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
      displayItems: [],
      clipItems: [],
      inviteCode: "",
      errorMessage: "",
      isSubmitting: false,
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
      orderAmount: format.calculateAmount(0, null),
      orderAmountText: "¥0.00",
      orderUnitPriceText: "¥0.00",
      orderShippingText: "包邮",
      orderError: "",
      isCreatingOrder: false
    },

    onLoad: function () {
      this.loadInitialState();
    },

    onShow: function () {
      if (!this.data.isLoading) {
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
      this.refreshPublicState().finally(function () {
        wx.stopPullDownRefresh();
        if (self.data.session && !publicExperience.isTerminalStatus(self.data.session.status)) {
          self.startPolling(self.data.session.sessionId);
        }
      });
    },

    loadInitialState: function () {
      var self = this;
      this.setData({ isLoading: true });

      Promise.all([
        this.refreshPublicState(),
        isDrawCard ? this.loadStyles() : Promise.resolve()
      ]).then(function () {
        return self.restoreSession();
      }).catch(function (error) {
        self.setData({
          errorMessage: (error && error.message) || "页面加载失败，请稍后再试。"
        });
      }).finally(function () {
        self.setData({ isLoading: false });
      });
    },

    refreshPublicState: function () {
      var self = this;
      return Promise.all([
        publicExperience.fetchVisitorState().catch(function () { return null; }),
        publicExperience.fetchOrderConfig().catch(function () { return null; }),
        publicExperience.fetchClipItems(experienceType).catch(function () { return []; })
      ]).then(function (results) {
        self.setData({
          visitorState: results[0],
          orderConfig: results[1],
          clipItems: results[2],
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
      wx.navigateTo({ url: "/pages/orders/orders" });
    },

    openDrawConfig: function () {
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
      if (!this.ensureImageReady()) return;
      if (isDrawCard) {
        this.openDrawConfig();
        return;
      }
      this.startSession({});
    },

    startSession: function (options) {
      var self = this;
      var nextOptions = options || {};
      var estimatedCost = estimateCost(experienceType, nextOptions);

      if (!this.ensureImageReady()) return;
      if (this.data.isSubmitting) return;

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
        displayItems: displayItems,
        phase: phase,
        phaseLabel: label,
        errorMessage: session.failedReason || ""
      });
    },

    previewResult: function (event) {
      var url = event.currentTarget.dataset.url;
      var urls = this.data.displayItems.map(function (item) {
        return item.imageUrl;
      }).filter(Boolean);

      if (!url) return;
      wx.previewImage({
        current: url,
        urls: urls.length ? urls : [url]
      });
    },

    previewClip: function (event) {
      var url = event.currentTarget.dataset.url;
      var urls = this.data.clipItems.map(function (item) {
        return item.imageUrl || item.thumbnailUrl;
      }).filter(Boolean);

      if (!url) return;
      wx.previewImage({
        current: url,
        urls: urls.length ? urls : [url]
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
        this.setData({ errorMessage: "请输入邀请码。" });
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
        self.setData({ errorMessage: (error && error.message) || "邀请码兑换失败。" });
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
      current[jobId] = format.clampQuantity(Number(current[jobId] || 1) + delta);
      this.setData({ orderQuantities: current });
      this.rebuildOrderSummary();
    },

    rebuildOrderSummary: function () {
      var quantities = this.data.orderQuantities || {};
      var orderItems = this.data.clipItems.map(function (item) {
        var quantity = format.clampQuantity(quantities[item.jobId] || 1);
        return Object.assign({}, item, {
          quantity: quantity,
          subtotalText: format.formatCurrencyCents(Number(this.data.orderConfig && this.data.orderConfig.unitPriceCents || 0) * quantity)
        });
      }, this);
      var totalCount = orderItems.reduce(function (sum, item) { return sum + item.quantity; }, 0);
      var amount = format.calculateAmount(totalCount, this.data.orderConfig);

      this.setData({
        orderItems: orderItems,
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
      this.setData({
        isCreatingOrder: true,
        orderError: ""
      });

      publicExperience.createOrder({
        experienceType: "fridge-magnet",
        items: this.data.orderItems.map(function (item) {
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
