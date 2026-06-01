const imageJobs = require("../../utils/image-jobs");

const thumbnailTempCache = {};
const thumbnailPromiseCache = {};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "succeeded", label: "Done" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Cancelled" }
];

Page({
  data: {
    filters: FILTERS,
    statusFilter: "all",
    jobs: [],
    visibleJobs: [],
    queuedCount: 0,
    completedCount: 0,
    errorMessage: "",
    isLoading: true,
    isRefreshing: false,
    cancelingJobId: ""
  },

  onLoad: function () {
    this.loadJobs();
  },

  onShow: function () {
    this.startPolling();
  },

  onPullDownRefresh: function () {
    this.refreshJobs({ showLoading: false, isPullDown: true });
  },

  onHide: function () {
    this.stopPolling();
  },

  onUnload: function () {
    this.stopPolling();
  },

  openIndex: function () {
    wx.navigateTo({
      url: "/pages/index/index"
    });
  },

  refreshButtonTap: function () {
    this.refreshJobs({ showLoading: false });
  },

  openTaskDetail: function (event) {
    var jobId = event.currentTarget.dataset.jobid;
    if (!jobId) {
      return;
    }

    wx.navigateTo({
      url: "/pages/task-detail/task-detail?jobId=" + encodeURIComponent(jobId)
    });
  },

  setFilter: function (event) {
    var statusFilter = event.currentTarget.dataset.filter;
    this.setData({
      statusFilter: statusFilter,
      visibleJobs: filterJobs(this.data.jobs, statusFilter)
    });
  },

  loadJobs: function () {
    return this.refreshJobs({ showLoading: true });
  },

  refreshJobs: function (options) {
    var self = this;
    var nextOptions = options || {};

    if (this.data.isRefreshing) {
      if (nextOptions.isPullDown) {
        wx.stopPullDownRefresh();
      }
      return Promise.resolve();
    }

    if (nextOptions.showLoading) {
      this.setData({ isLoading: true });
    }

    this.setData({ isRefreshing: true });

    return imageJobs.fetchImageJobs(80).then(function (payload) {
      var rawJobs = (payload.jobs || []).map(normalizeJob);

      return Promise.all(rawJobs.map(attachTaskThumbnail));
    }).then(function (jobs) {

      self.setData({
        jobs: jobs,
        visibleJobs: filterJobs(jobs, self.data.statusFilter),
        queuedCount: jobs.filter(function (job) { return isActiveJob(job.status); }).length,
        completedCount: jobs.filter(function (job) { return job.status === "succeeded"; }).length,
        errorMessage: "",
        isLoading: false
      });
    }).catch(function (error) {
      self.setData({
        errorMessage: (error && error.message) || "Failed to load tasks",
        isLoading: false
      });
    }).finally(function () {
      self.setData({ isRefreshing: false });
      if (nextOptions.isPullDown) {
        wx.stopPullDownRefresh();
      }
    });
  },

  startPolling: function () {
    var self = this;

    this.stopPolling();
    this.refreshJobs({ showLoading: true });
    this.pollingTimer = setInterval(function () {
      self.refreshJobs({ showLoading: false });
    }, 3000);
  },

  stopPolling: function () {
    if (!this.pollingTimer) {
      return;
    }
    clearInterval(this.pollingTimer);
    this.pollingTimer = null;
  },

  cancelJob: function (event) {
    var self = this;
    var jobId = event.currentTarget.dataset.jobid;

    if (!jobId) {
      return;
    }

    this.setData({ cancelingJobId: jobId });
    imageJobs.cancelImageJob(jobId).then(function () {
      wx.showToast({
        title: "Cancelled",
        icon: "success"
      });
      return self.loadJobs();
    }).catch(function (error) {
      wx.showToast({
        title: (error && error.message) || "Cancel failed",
        icon: "none"
      });
    }).finally(function () {
      self.setData({ cancelingJobId: "" });
    });
  },

  previewResult: function (event) {
    var imageUrl = event.currentTarget.dataset.url;

    if (!imageUrl) {
      return;
    }

    wx.previewImage({
      current: imageUrl,
      urls: [imageUrl]
    });
  },

  copyPrompt: function (event) {
    var prompt = event.currentTarget.dataset.prompt;

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

function filterJobs(jobs, statusFilter) {
  if (statusFilter === "all") {
    return jobs;
  }
  if (statusFilter === "active") {
    return jobs.filter(function (job) {
      return isActiveJob(job.status);
    });
  }
  return jobs.filter(function (job) {
    return job.status === statusFilter;
  });
}

function isActiveJob(status) {
  return status === "queued" || status === "running";
}

function normalizeJob(job) {
  var result = job && job.result ? job.result : null;
  var provider = job && job.provider ? job.provider : null;
  var previewImageUrl = imageJobs.toAbsoluteImageUrl((result && (result.imageUrl || result.originalImageUrl)) || "");

  return {
    jobId: job.jobId,
    status: job.status,
    prompt: job.prompt,
    message: job.message,
    displayStatus: formatJobStatus(job.status),
    previewImageUrl: previewImageUrl,
    renderImageUrl: imageJobs.canRenderRemoteImage(previewImageUrl) ? previewImageUrl : "",
    createdAtText: formatDateTime(job.createdAt),
    completedAtText: formatDateTime(job.completedAt),
    durationText: formatDuration(job.durationSeconds),
    promptPreview: formatPromptPreview(job.prompt),
    styleNameText: job.styleName || "Untitled Style",
    providerText: (provider && provider.name) || "Unknown Provider",
    canCancel: isActiveJob(job.status)
  };
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

function formatPromptPreview(prompt) {
  var text = String(prompt || "").trim();
  if (!text) {
    return "No prompt";
  }
  return text.length > 120 ? (text.slice(0, 120) + "...") : text;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function attachTaskThumbnail(job) {
  if (!job.previewImageUrl || job.renderImageUrl) {
    return Promise.resolve(job);
  }

  return resolveRenderableImageUrl(job.previewImageUrl).then(function (renderImageUrl) {
    return {
      jobId: job.jobId,
      status: job.status,
      prompt: job.prompt,
      message: job.message,
      displayStatus: job.displayStatus,
      previewImageUrl: job.previewImageUrl,
      renderImageUrl: renderImageUrl || "",
      createdAtText: job.createdAtText,
      completedAtText: job.completedAtText,
      durationText: job.durationText,
      promptPreview: job.promptPreview,
      styleNameText: job.styleNameText,
      providerText: job.providerText,
      canCancel: job.canCancel
    };
  }).catch(function () {
    return job;
  });
}

function resolveRenderableImageUrl(url) {
  if (!url) {
    return Promise.resolve("");
  }

  if (imageJobs.canRenderRemoteImage(url)) {
    return Promise.resolve(url);
  }

  if (thumbnailTempCache[url]) {
    return Promise.resolve(thumbnailTempCache[url]);
  }

  if (thumbnailPromiseCache[url]) {
    return thumbnailPromiseCache[url];
  }

  thumbnailPromiseCache[url] = new Promise(function (resolve) {
    wx.downloadFile({
      url: url,
      success: function (result) {
        var ok = result.statusCode >= 200 && result.statusCode < 300;
        var tempPath = ok ? result.tempFilePath : "";

        if (tempPath) {
          thumbnailTempCache[url] = tempPath;
        }

        resolve(tempPath);
      },
      fail: function () {
        resolve("");
      },
      complete: function () {
        delete thumbnailPromiseCache[url];
      }
    });
  });

  return thumbnailPromiseCache[url];
}
