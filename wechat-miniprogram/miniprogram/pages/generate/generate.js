const stylesRepository = require("../../utils/styles-repository");
const imageJobs = require("../../utils/image-jobs");

const MAX_REFERENCE_IMAGES = 10;
const SIZE_OPTIONS = [
  { value: "1024x1536", label: "2:3" },
  { value: "1536x1024", label: "3:2" },
  { value: "1024x1024", label: "1:1" },
  { value: "1024x1365", label: "3:4" },
  { value: "1365x1024", label: "4:3" }
];

Page({
  data: {
    style: null,
    prompt: "",
    size: SIZE_OPTIONS[0].value,
    sizeLabel: SIZE_OPTIONS[0].label,
    sizeIndex: 0,
    sizeOptions: SIZE_OPTIONS,
    providers: [],
    providerIndex: 0,
    selectedProvider: "",
    selectedProviderModel: "",
    providerDisplayName: "Not Ready",
    referenceImages: [],
    referenceHint: buildReferenceHint(false),
    referenceNotice: "",
    canAddReference: true,
    job: null,
    jobIdText: "",
    jobStatusClass: "",
    jobStatusText: "Idle",
    resultImageUrl: "",
    errorMessage: "",
    statusMessage: "",
    showStatusPanel: false,
    emptyMessage: "Please go back and select a style again.",
    apiReady: Boolean(imageJobs.getImageApiBaseUrl()),
    isSubmitting: false,
    submitButtonText: "Generate",
    submitDisabled: !imageJobs.getImageApiBaseUrl()
  },

  onLoad: function (options) {
    var styleId = decodeURIComponent((options && options.id) || "");
    var self = this;

    this.loadStyle(styleId).then(function () {
      return self.loadProviders();
    }).catch(function (error) {
      self.setData({
        errorMessage: (error && error.message) || "Failed to load page",
        showStatusPanel: true
      });
    });
  },

  onUnload: function () {
    this.stopPolling();
  },

  openTasks: function () {
    wx.navigateTo({
      url: "/pages/tasks/tasks"
    });
  },

  openTaskDetail: function () {
    if (!this.data.jobIdText) {
      return;
    }

    wx.navigateTo({
      url: "/pages/task-detail/task-detail?jobId=" + encodeURIComponent(this.data.jobIdText)
    });
  },

  loadStyle: function (styleId) {
    var self = this;

    return stylesRepository.loadStyles().then(function (styles) {
      var style = findStyleById(styles, styleId);

      if (!style) {
        self.setData({
          style: null,
          errorMessage: "Style not found. Please choose a style again.",
          emptyMessage: "Style not found. Please choose a style again."
        });
        return;
      }

      self.setData({
        style: style,
        prompt: style.prompt || "",
        errorMessage: "",
        emptyMessage: "Please go back and select a style again."
      });

      return self.preloadStyleReference(style);
    });
  },

  preloadStyleReference: function (style) {
    var self = this;
    var styleUsesReference = Boolean(style && style.useStyleImageAsReference);
    var lockedReferences = [];
    var nextNotice = "";

    if (!styleUsesReference) {
      this.setReferenceImages([], "");
      return Promise.resolve();
    }

    if (!isUploadableReferenceImage(style.image)) {
      nextNotice = "This style preview cannot be used as an auto reference.";
      this.setReferenceImages([], nextNotice);
      return Promise.resolve();
    }

    return createStyleReference(style).then(function (reference) {
      lockedReferences = [reference];
      nextNotice = "The style preview was added as reference 1.";
      self.setReferenceImages(lockedReferences, nextNotice);
    }).catch(function () {
      self.setReferenceImages([], "Auto style reference failed. You can upload manually.");
    });
  },

  loadProviders: function () {
    var self = this;

    if (!this.data.apiReady) {
      this.setData({
        providers: [],
        selectedProvider: "",
        selectedProviderModel: "",
        providerDisplayName: "Not Ready",
        errorMessage: "Please set imageApiBaseUrl in miniprogram/env.js first.",
        showStatusPanel: true,
        submitDisabled: true
      });
      return Promise.resolve();
    }

    return imageJobs.fetchImageProviders().then(function (payload) {
      var providers = Array.isArray(payload.providers) ? payload.providers : [];
      var defaultProviderId = payload.defaultProvider || (providers[0] && providers[0].id) || "";
      var providerIndex = findProviderIndex(providers, defaultProviderId);
      var selectedProvider = providers[providerIndex] || null;

      self.setData({
        providers: providers,
        providerIndex: providerIndex,
        selectedProvider: selectedProvider ? selectedProvider.id : "",
        selectedProviderModel: selectedProvider ? selectedProvider.model : "",
        providerDisplayName: selectedProvider ? selectedProvider.name : "Not Ready",
        errorMessage: "",
        submitDisabled: false
      });
    }).catch(function (error) {
      self.setData({
        providers: [],
        selectedProvider: "",
        selectedProviderModel: "",
        providerDisplayName: "Not Ready",
        errorMessage: (error && error.message) || "Failed to load providers",
        showStatusPanel: true,
        submitDisabled: true
      });
    });
  },

  onPromptInput: function (event) {
    this.setData({
      prompt: event.detail.value
    });
  },

  onSizeChange: function (event) {
    var sizeIndex = Number((event.detail && event.detail.value) || 0);
    var option = SIZE_OPTIONS[sizeIndex] || SIZE_OPTIONS[0];

    this.setData({
      sizeIndex: sizeIndex,
      size: option.value,
      sizeLabel: option.label
    });
  },

  onProviderChange: function (event) {
    var providerIndex = Number((event.detail && event.detail.value) || 0);
    var provider = this.data.providers[providerIndex] || null;

    this.setData({
      providerIndex: providerIndex,
      selectedProvider: provider ? provider.id : "",
      selectedProviderModel: provider ? provider.model : "",
      providerDisplayName: provider ? provider.name : "Not Ready"
    });
  },

  chooseReferenceImages: function () {
    var remaining = MAX_REFERENCE_IMAGES - this.data.referenceImages.length;
    var self = this;

    if (remaining <= 0) {
      wx.showToast({
        title: "Max 10 refs",
        icon: "none"
      });
      return;
    }

    wx.chooseImage({
      count: remaining,
      sizeType: ["compressed", "original"],
      sourceType: ["album", "camera"],
      success: function (result) {
        var tempFiles = Array.isArray(result.tempFiles) ? result.tempFiles : [];
        var currentTime = Date.now();
        var nextImages = [];
        var referenceImages = [];

        if (!tempFiles.length) {
          return;
        }

        nextImages = tempFiles.map(function (file, index) {
          return {
            id: "user-reference-" + currentTime + "-" + index + "-" + Number(file.size || 0),
            filePath: file.path,
            name: file.name || ("reference-" + currentTime + "-" + (index + 1) + ".jpg"),
            size: Number(file.size || 0),
            previewUrl: file.path,
            locked: false
          };
        });

        referenceImages = self.data.referenceImages.concat(nextImages).slice(0, MAX_REFERENCE_IMAGES);
        self.setReferenceImages(referenceImages, self.data.referenceNotice);
      }
    });
  },

  removeReferenceImage: function (event) {
    var imageId = event.currentTarget.dataset.id;
    var target = findReferenceById(this.data.referenceImages, imageId);
    var nextImages = [];

    if (!imageId) {
      return;
    }

    if (target && target.locked) {
      wx.showToast({
        title: "Locked ref",
        icon: "none"
      });
      return;
    }

    nextImages = this.data.referenceImages.filter(function (item) {
      return item.id !== imageId;
    });

    this.setReferenceImages(nextImages, this.data.referenceNotice);
  },

  clearReferenceImages: function () {
    var lockedReferences = this.data.referenceImages.filter(function (item) {
      return Boolean(item.locked);
    });

    this.setReferenceImages(lockedReferences, this.data.referenceNotice);
  },

  submitJob: function () {
    var self = this;
    var prompt = String(this.data.prompt || "").trim();

    if (!this.data.style) {
      return;
    }

    if (!this.data.apiReady) {
      this.setData({
        errorMessage: "Image backend is not configured.",
        showStatusPanel: true
      });
      return;
    }

    if (!prompt) {
      this.setData({
        errorMessage: "Please enter a prompt.",
        showStatusPanel: true
      });
      return;
    }

    if (!this.data.selectedProvider) {
      this.setData({
        errorMessage: "Please select a provider.",
        showStatusPanel: true
      });
      return;
    }

    this.stopPolling();
    this.setData({
      isSubmitting: true,
      errorMessage: "",
      statusMessage: this.data.referenceImages.length ? "Uploading references..." : "Creating image job...",
      showStatusPanel: true,
      jobIdText: "",
      jobStatusClass: "queued",
      jobStatusText: formatJobStatus("queued"),
      resultImageUrl: "",
      job: null,
      submitButtonText: "Submitting...",
      submitDisabled: true
    });

    uploadSelectedReferences(this.data.referenceImages, function (current, total) {
      self.setData({
        statusMessage: "Uploading refs " + current + "/" + total + "..."
      });
    }).then(function (referenceIds) {
      return imageJobs.createImageJob({
        prompt: prompt,
        size: self.data.size,
        provider: self.data.selectedProvider,
        styleId: self.data.style.id,
        styleName: Array.isArray(self.data.style.tags) ? self.data.style.tags.join(" / ") : "",
        referenceIds: referenceIds
      });
    }).then(function (job) {
      self.setData({
        job: job,
        jobIdText: job.jobId || "",
        jobStatusClass: job.status || "",
        statusMessage: job.message || "Job created.",
        jobStatusText: formatJobStatus(job.status)
      });

      self.startPolling(job.jobId);
    }).catch(function (error) {
      self.setData({
        errorMessage: (error && error.message) || "Failed to create image job",
        showStatusPanel: true
      });
    }).finally(function () {
      self.setData({
        isSubmitting: false,
        submitButtonText: "Generate",
        submitDisabled: !self.data.apiReady
      });
    });
  },

  startPolling: function (jobId) {
    var self = this;

    this.stopPolling();
    if (!jobId) {
      return;
    }

    this.loadJob(jobId);
    this.pollingTimer = setInterval(function () {
      self.loadJob(jobId);
    }, 2000);
  },

  stopPolling: function () {
    if (!this.pollingTimer) {
      return;
    }

    clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  },

  loadJob: function (jobId) {
    var self = this;

    imageJobs.fetchImageJob(jobId).then(function (job) {
      self.setData({
        job: job,
        jobIdText: job.jobId || "",
        jobStatusClass: job.status || "",
        statusMessage: job.message || "",
        resultImageUrl: resolveResultImage(job),
        jobStatusText: formatJobStatus(job.status),
        showStatusPanel: true
      });

      if (job.status === "succeeded" || job.status === "failed" || job.status === "cancelled") {
        self.stopPolling();
      }
    }).catch(function (error) {
      self.stopPolling();
      self.setData({
        errorMessage: (error && error.message) || "Failed to read job status",
        jobStatusText: formatJobStatus("failed"),
        jobStatusClass: "failed",
        showStatusPanel: true
      });
    });
  },

  previewResult: function () {
    if (!this.data.resultImageUrl) {
      return;
    }

    wx.previewImage({
      current: this.data.resultImageUrl,
      urls: [this.data.resultImageUrl]
    });
  },

  saveResult: function () {
    if (!this.data.resultImageUrl) {
      return;
    }

    wx.showLoading({
      title: "Saving...",
      mask: true
    });

    wx.downloadFile({
      url: this.data.resultImageUrl,
      success: function (downloadResult) {
        if (downloadResult.statusCode < 200 || downloadResult.statusCode >= 300) {
          wx.hideLoading();
          wx.showToast({
            title: "Download failed",
            icon: "none"
          });
          return;
        }

        wx.saveImageToPhotosAlbum({
          filePath: downloadResult.tempFilePath,
          success: function () {
            wx.hideLoading();
            wx.showToast({
              title: "Saved",
              icon: "success"
            });
          },
          fail: function () {
            wx.hideLoading();
            wx.showToast({
              title: "Save failed",
              icon: "none"
            });
          }
        });
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({
          title: "Download failed",
          icon: "none"
        });
      }
    });
  },

  copyPrompt: function () {
    if (!this.data.prompt) {
      return;
    }

    wx.setClipboardData({
      data: this.data.prompt,
      success: function () {
        wx.showToast({
          title: "Copied",
          icon: "success"
        });
      }
    });
  },

  setReferenceImages: function (referenceImages, notice) {
    var hasLockedReference = referenceImages.some(function (item) {
      return Boolean(item && item.locked);
    });

    this.setData({
      referenceImages: referenceImages,
      referenceHint: buildReferenceHint(hasLockedReference),
      referenceNotice: notice || "",
      canAddReference: referenceImages.length < MAX_REFERENCE_IMAGES
    });
  }
});

function findStyleById(styles, styleId) {
  var index;

  if (!Array.isArray(styles)) {
    return null;
  }

  for (index = 0; index < styles.length; index += 1) {
    if (styles[index] && styles[index].id === styleId) {
      return styles[index];
    }
  }

  return null;
}

function findProviderIndex(providers, providerId) {
  var index;

  if (!Array.isArray(providers) || !providers.length) {
    return 0;
  }

  for (index = 0; index < providers.length; index += 1) {
    if (providers[index] && providers[index].id === providerId) {
      return index;
    }
  }

  return 0;
}

function findReferenceById(referenceImages, referenceId) {
  var index;

  for (index = 0; index < referenceImages.length; index += 1) {
    if (referenceImages[index] && referenceImages[index].id === referenceId) {
      return referenceImages[index];
    }
  }

  return null;
}

function buildReferenceHint(hasStyleReference) {
  if (hasStyleReference) {
    return "Up to 10 refs. The style preview is ref 1. Your uploads start from ref 2.";
  }

  return "Up to 10 refs. Files are uploaded in the current order.";
}

function isUploadableReferenceImage(imagePath) {
  return /\.(png|jpe?g|webp)(\?|$)/i.test(String(imagePath || ""));
}

function extensionFromImagePath(imagePath) {
  var path = String(imagePath || "").toLowerCase();

  if (path.indexOf(".png") !== -1) {
    return "png";
  }
  if (path.indexOf(".webp") !== -1) {
    return "webp";
  }
  return "jpg";
}

function createStyleReference(style) {
  return new Promise(function (resolve, reject) {
    var source = String((style && style.image) || "");
    var extension = extensionFromImagePath(source);

    if (!source) {
      reject(new Error("Missing style preview"));
      return;
    }

    wx.getImageInfo({
      src: source,
      success: function (result) {
        resolve({
          id: "style-reference-" + style.id,
          filePath: result.path || source,
          name: style.id + "-style-reference." + extension,
          size: 0,
          previewUrl: source,
          locked: true
        });
      },
      fail: function () {
        reject(new Error("Style preview could not be loaded"));
      }
    });
  });
}

function uploadSelectedReferences(referenceImages, onProgress) {
  var referenceIds = [];
  var chain = Promise.resolve();

  referenceImages.forEach(function (reference, index) {
    chain = chain.then(function () {
      if (typeof onProgress === "function") {
        onProgress(index + 1, referenceImages.length);
      }

      return imageJobs.uploadReferenceImage(reference).then(function (uploaded) {
        if (uploaded && uploaded.referenceId) {
          referenceIds.push(uploaded.referenceId);
        }
      });
    });
  });

  return chain.then(function () {
    return referenceIds;
  });
}

function resolveResultImage(job) {
  if (!job || !job.result) {
    return "";
  }

  return imageJobs.toAbsoluteImageUrl(job.result.imageUrl || job.result.originalImageUrl || "");
}

function formatJobStatus(status) {
  var labels = {
    queued: "Queued",
    running: "Running",
    succeeded: "Done",
    failed: "Failed",
    cancelled: "Cancelled"
  };

  return labels[status] || "Idle";
}
