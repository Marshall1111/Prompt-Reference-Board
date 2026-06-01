const imageJobs = require("../../utils/image-jobs");

Page({
  data: {
    jobId: "",
    job: null,
    resultImageUrl: "",
    referenceImages: [],
    errorMessage: "",
    isLoading: true,
    canceling: false
  },

  onLoad: function (options) {
    var jobId = decodeURIComponent((options && options.jobId) || "");
    this.setData({ jobId: jobId });
    this.loadJob();
  },

  onShow: function () {
    this.startPolling();
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
      return;
    }

    imageJobs.fetchImageJob(this.data.jobId).then(function (job) {
      return hydrateJobAssets(job).then(function (assets) {
        self.setData({
          job: normalizeJob(job),
          resultImageUrl: assets.resultImageUrl,
          referenceImages: assets.referenceImages,
          errorMessage: "",
          isLoading: false
        });

        if (!isActiveJob(job.status)) {
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

  startPolling: function () {
    var self = this;

    this.stopPolling();
    if (!this.data.jobId) {
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

  cancelJob: function () {
    var self = this;

    if (!this.data.job || !isActiveJob(this.data.job.status)) {
      return;
    }

    this.setData({ canceling: true });
    imageJobs.cancelImageJob(this.data.jobId).then(function () {
      wx.showToast({
        title: "Cancelled",
        icon: "success"
      });
      self.loadJob();
    }).catch(function (error) {
      wx.showToast({
        title: (error && error.message) || "Cancel failed",
        icon: "none"
      });
    }).finally(function () {
      self.setData({ canceling: false });
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
      return item.previewUrl;
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
    var prompt = (this.data.job && this.data.job.prompt) || "";

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
    jobId: job.jobId,
    status: job.status,
    prompt: job.prompt,
    message: job.message,
    displayStatus: formatJobStatus(job.status),
    createdAtText: formatDateTime(job.createdAt),
    completedAtText: formatDateTime(job.completedAt),
    durationText: formatDuration(job.durationSeconds),
    providerText: (provider && provider.name) || "Unknown Provider",
    styleNameText: String(job.styleName || "").trim(),
    styleGroupNameText: String(job.styleGroupName || "").trim(),
    modeText: job.mode === "edit" ? "Image Edit" : "Text To Image",
    canCancel: isActiveJob(job.status),
    promptText: String(job.prompt || "").trim() || "No prompt"
  };
}

function hydrateJobAssets(job) {
  var result = job && job.result ? job.result : null;
  var rawResultImageUrl = imageJobs.toAbsoluteImageUrl((result && (result.imageUrl || result.originalImageUrl)) || "");
  var rawReferences = Array.isArray(job && job.originalReferences) ? job.originalReferences : [];

  return Promise.all([
    resolvePreviewUrl(rawResultImageUrl),
    Promise.all(rawReferences.map(function (item) {
      var absoluteUrl = imageJobs.toAbsoluteImageUrl(item.url);
      return resolvePreviewUrl(absoluteUrl).then(function (resolvedUrl) {
        return {
          name: item.name || "Reference image",
          previewUrl: resolvedUrl || absoluteUrl,
          renderUrl: resolvedUrl || "",
          originalUrl: absoluteUrl
        };
      });
    }))
  ]).then(function (results) {
    return {
      resultImageUrl: results[0],
      referenceImages: results[1]
    };
  });
}

function resolvePreviewUrl(url) {
  if (!url) {
    return Promise.resolve("");
  }

  if (imageJobs.canRenderRemoteImage(url)) {
    return Promise.resolve(url);
  }

  return imageJobs.resolveRenderableImageUrl(url).then(function (resolvedUrl) {
    return resolvedUrl || "";
  });
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
