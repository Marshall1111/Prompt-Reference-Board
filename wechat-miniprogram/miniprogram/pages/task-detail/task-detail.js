const imageJobs = require("../../utils/image-jobs");

const MAX_REFERENCE_IMAGES = 10;

Page({
  data: {
    jobId: "",
    job: null,
    prompt: "",
    resultImageUrl: "",
    referenceImages: [],
    referenceHint: buildReferenceHint(),
    referenceNotice: "",
    canAddReference: true,
    errorMessage: "",
    isLoading: true,
    isRegenerating: false,
    editorDirty: false
  },

  onLoad: function (options) {
    var jobId = decodeURIComponent((options && options.jobId) || "");
    this.setData({ jobId: jobId });
  },

  onShow: function () {
    if (!this.data.jobId) {
      return;
    }

    this.loadJob();
  },

  onHide: function () {
    this.stopPolling();
  },

  onUnload: function () {
    this.stopPolling();
  },

  openTasks: function () {
    wx.navigateBack({
      delta: 1
    });
  },

  loadJob: function () {
    var self = this;

    if (!this.data.jobId) {
      this.setData({
        errorMessage: "Missing job id",
        isLoading: false
      });
      return Promise.resolve();
    }

    return imageJobs.fetchImageJob(this.data.jobId).then(function (job) {
      return hydrateJobAssets(job).then(function (assets) {
        var normalizedJob = normalizeJob(job);
        var sameJob = self.data.job && self.data.job.jobId === normalizedJob.jobId;
        var preserveEditor = Boolean(sameJob && self.data.editorDirty);
        var nextData = {
          job: normalizedJob,
          resultImageUrl: assets.resultImageUrl,
          errorMessage: "",
          isLoading: false
        };

        if (!preserveEditor) {
          nextData.prompt = normalizedJob.prompt;
          nextData.referenceImages = assets.referenceImages;
          nextData.referenceHint = buildReferenceHint();
          nextData.referenceNotice = "";
          nextData.canAddReference = assets.referenceImages.length < MAX_REFERENCE_IMAGES;
          nextData.editorDirty = false;
        }

        self.setData(nextData);

        if (isActiveJob(normalizedJob.status) && !preserveEditor && !self.data.isRegenerating) {
          self.ensurePolling();
        } else {
          self.stopPolling();
        }
      });
    }).catch(function (error) {
      self.setData({
        errorMessage: (error && error.message) || "Failed to load task detail",
        isLoading: false
      });
      self.stopPolling();
    });
  },

  ensurePolling: function () {
    var self = this;

    if (this.pollingTimer || !this.data.jobId) {
      return;
    }

    this.pollingTimer = setInterval(function () {
      self.loadJob();
    }, 3000);
  },

  stopPolling: function () {
    if (!this.pollingTimer) {
      return;
    }
    clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  },

  onPromptInput: function (event) {
    this.markEditorDirty({
      prompt: event.detail.value
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

        if (!tempFiles.length) {
          return;
        }

        nextImages = tempFiles.map(function (file, index) {
          return {
            id: "detail-reference-" + currentTime + "-" + index + "-" + Number(file.size || 0),
            filePath: file.path,
            tempFilePath: file.path,
            name: file.name || ("reference-" + currentTime + "-" + (index + 1) + ".jpg"),
            size: Number(file.size || 0),
            previewUrl: file.path,
            renderUrl: file.path,
            originalUrl: "",
            sourceType: "local"
          };
        });

        self.setReferenceImages(self.data.referenceImages.concat(nextImages).slice(0, MAX_REFERENCE_IMAGES), "");
      }
    });
  },

  removeReferenceImage: function (event) {
    var imageId = event.currentTarget.dataset.id;
    var nextImages = [];

    if (!imageId) {
      return;
    }

    nextImages = this.data.referenceImages.filter(function (item) {
      return item.id !== imageId;
    });

    this.setReferenceImages(nextImages, "");
  },

  clearReferenceImages: function () {
    this.setReferenceImages([], "");
  },

  setReferenceImages: function (referenceImages, notice) {
    this.stopPolling();
    this.setData({
      referenceImages: referenceImages,
      referenceHint: buildReferenceHint(),
      referenceNotice: notice || "",
      canAddReference: referenceImages.length < MAX_REFERENCE_IMAGES,
      editorDirty: true
    });
  },

  markEditorDirty: function (nextData) {
    this.stopPolling();
    this.setData(Object.assign({
      editorDirty: true
    }, nextData || {}));
  },

  regenerateJob: function () {
    var self = this;
    var currentJob = this.data.job;
    var prompt = String(this.data.prompt || "").trim();

    if (!currentJob) {
      return;
    }

    if (!imageJobs.getImageApiBaseUrl()) {
      this.setData({
        errorMessage: "Please set imageApiBaseUrl in miniprogram/env.js first."
      });
      return;
    }

    if (!prompt) {
      this.setData({
        errorMessage: "Please enter a prompt."
      });
      return;
    }

    if (!currentJob.providerId) {
      this.setData({
        errorMessage: "The original task provider is missing."
      });
      return;
    }

    this.stopPolling();
    this.setData({
      isRegenerating: true,
      errorMessage: "",
      referenceNotice: this.data.referenceImages.length ? "Uploading references..." : "Creating image job..."
    });

    uploadSelectedReferences(this.data.referenceImages, function (current, total) {
      self.setData({
        referenceNotice: "Uploading refs " + current + "/" + total + "..."
      });
    }).then(function (referenceIds) {
      return imageJobs.createImageJob({
        prompt: prompt,
        size: currentJob.size,
        provider: currentJob.providerId,
        styleId: currentJob.styleId,
        styleName: currentJob.styleNameText,
        styleGroupId: currentJob.styleGroupId,
        styleGroupName: currentJob.styleGroupNameText,
        referenceIds: referenceIds
      });
    }).then(function (job) {
      self.setData({
        jobId: job.jobId || "",
        job: normalizeJob(job),
        prompt: String(job.prompt || "").trim(),
        resultImageUrl: "",
        referenceNotice: "New task created.",
        errorMessage: "",
        editorDirty: false
      });

      wx.showToast({
        title: "Regenerated",
        icon: "success"
      });

      return self.loadJob();
    }).catch(function (error) {
      self.setData({
        errorMessage: (error && error.message) || "Failed to regenerate task"
      });
    }).finally(function () {
      self.setData({
        isRegenerating: false
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

  previewReference: function (event) {
    var imageUrl = event.currentTarget.dataset.url;
    var urls = this.data.referenceImages.map(function (item) {
      return item.previewUrl || item.originalUrl || item.renderUrl;
    }).filter(Boolean);

    if (!imageUrl) {
      return;
    }

    wx.previewImage({
      current: imageUrl,
      urls: urls
    });
  },

  copyPrompt: function () {
    var prompt = String(this.data.prompt || "").trim();

    if (!prompt) {
      return;
    }

    wx.setClipboardData({
      data: prompt,
      success: function () {
        wx.showToast({
          title: "Copied",
          icon: "success"
        });
      }
    });
  }
});

function normalizeJob(job) {
  var provider = job && job.provider ? job.provider : null;

  return {
    jobId: String(job.jobId || ""),
    status: job.status,
    prompt: String(job.prompt || "").trim(),
    message: job.message,
    size: String(job.size || "auto"),
    styleId: String(job.styleId || ""),
    styleGroupId: String(job.styleGroupId || ""),
    displayStatus: formatJobStatus(job.status),
    createdAtText: formatDateTime(job.createdAt),
    completedAtText: formatDateTime(job.completedAt),
    durationText: formatDuration(job.durationSeconds),
    providerId: (provider && provider.id) || "",
    providerText: (provider && provider.name) || "Unknown Provider",
    styleNameText: String(job.styleName || "").trim(),
    styleGroupNameText: String(job.styleGroupName || "").trim(),
    modeText: job.mode === "edit" ? "Image Edit" : "Text To Image"
  };
}

function hydrateJobAssets(job) {
  var result = job && job.result ? job.result : null;
  var rawResultImageUrl = imageJobs.toAbsoluteImageUrl((result && (result.imageUrl || result.originalImageUrl)) || "");
  var rawReferences = Array.isArray(job && job.originalReferences) ? job.originalReferences : [];

  return Promise.all([
    resolvePreviewAsset(rawResultImageUrl),
    Promise.all(rawReferences.map(function (item, index) {
      var absoluteUrl = imageJobs.toAbsoluteImageUrl(item.url);

      return resolvePreviewAsset(absoluteUrl).then(function (asset) {
        return {
          id: "job-reference-" + index + "-" + String(item.order || index),
          name: item.name || ("Reference " + (index + 1)),
          previewUrl: asset.previewUrl || absoluteUrl,
          renderUrl: asset.renderUrl || "",
          originalUrl: absoluteUrl,
          tempFilePath: asset.tempFilePath || "",
          filePath: asset.tempFilePath || "",
          sourceType: "job"
        };
      });
    }))
  ]).then(function (results) {
    return {
      resultImageUrl: results[0].previewUrl || "",
      referenceImages: results[1]
    };
  });
}

function resolvePreviewAsset(url) {
  if (!url) {
    return Promise.resolve({
      previewUrl: "",
      renderUrl: "",
      tempFilePath: ""
    });
  }

  if (imageJobs.canRenderRemoteImage(url)) {
    return Promise.resolve({
      previewUrl: url,
      renderUrl: url,
      tempFilePath: ""
    });
  }

  return imageJobs.resolveRenderableImageUrl(url).then(function (resolvedUrl) {
    return {
      previewUrl: resolvedUrl || url,
      renderUrl: resolvedUrl || "",
      tempFilePath: isLocalFilePath(resolvedUrl) ? resolvedUrl : ""
    };
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

      return ensureReferenceFilePath(reference).then(function (uploadableReference) {
        return imageJobs.uploadReferenceImage(uploadableReference);
      }).then(function (uploaded) {
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

function ensureReferenceFilePath(reference) {
  if (reference && reference.sourceType === "job" && reference.originalUrl) {
    return downloadReferenceToTempFile(reference);
  }

  if (reference && isLocalFilePath(reference.filePath)) {
    return Promise.resolve(reference);
  }

  if (reference && isLocalFilePath(reference.tempFilePath)) {
    return Promise.resolve({
      id: reference.id,
      filePath: reference.tempFilePath,
      tempFilePath: reference.tempFilePath,
      name: reference.name,
      size: Number(reference.size || 0),
      previewUrl: reference.previewUrl,
      renderUrl: reference.renderUrl,
      originalUrl: reference.originalUrl
    });
  }

  return downloadReferenceToTempFile(reference);
}

function downloadReferenceToTempFile(reference) {
  var sourceUrl = String((reference && (reference.originalUrl || reference.previewUrl || reference.renderUrl)) || "");

  return new Promise(function (resolve, reject) {
    if (!sourceUrl) {
      reject(new Error("Reference image is missing."));
      return;
    }

    wx.downloadFile({
      url: sourceUrl,
      success: function (result) {
        var ok = result.statusCode >= 200 && result.statusCode < 300;

        if (!ok || !result.tempFilePath) {
          reject(new Error("Failed to download a reference image."));
          return;
        }

        resolve({
          id: reference.id,
          filePath: result.tempFilePath,
          tempFilePath: result.tempFilePath,
          name: reference.name,
          size: Number(reference.size || 0),
          previewUrl: result.tempFilePath,
          renderUrl: result.tempFilePath,
          originalUrl: sourceUrl,
          sourceType: reference.sourceType || "job"
        });
      },
      fail: function () {
        reject(new Error("Failed to download a reference image."));
      }
    });
  });
}

function buildReferenceHint() {
  return "Up to 10 refs. Add or remove references before regenerating.";
}

function isLocalFilePath(value) {
  var text = String(value || "");

  return Boolean(text) && !/^https?:\/\//i.test(text);
}

function isActiveJob(status) {
  return status === "queued" || status === "running";
}

function formatJobStatus(status) {
  var labels = {
    queued: "Queued",
    running: "Running",
    succeeded: "Done",
    failed: "Failed",
    cancelled: "Cancelled"
  };
  return labels[status] || "Unknown";
}

function formatDateTime(value) {
  var date;

  if (!value) {
    return "";
  }

  date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) + " " + pad2(date.getHours()) + ":" + pad2(date.getMinutes());
}

function formatDuration(seconds) {
  var safeSeconds = Number(seconds);
  var minutes = 0;
  var hours = 0;
  var restSeconds = 0;
  var restMinutes = 0;

  if (!Number.isFinite(safeSeconds) || safeSeconds < 0) {
    return "";
  }
  if (safeSeconds < 60) {
    return safeSeconds + "s";
  }

  minutes = Math.floor(safeSeconds / 60);
  restSeconds = safeSeconds % 60;
  if (minutes < 60) {
    return restSeconds ? (minutes + "m " + restSeconds + "s") : (minutes + "m");
  }

  hours = Math.floor(minutes / 60);
  restMinutes = minutes % 60;
  return restMinutes ? (hours + "h " + restMinutes + "m") : (hours + "h");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}
