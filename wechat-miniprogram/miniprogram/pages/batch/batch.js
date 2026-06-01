const stylesRepository = require("../../utils/styles-repository");
const imageJobs = require("../../utils/image-jobs");
const pageNav = require("../../utils/page-nav");

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
    apiReady: Boolean(imageJobs.getImageApiBaseUrl()),
    isLoading: true,
    isSubmitting: false,
    errorMessage: "",
    statusMessage: "",
    groups: [],
    activeGroupId: "",
    activeGroupName: "",
    activeGroupSummary: "",
    selectedStyles: [],
    selectedStyleCount: 0,
    groupUsesAutoReference: false,
    sizeOptions: SIZE_OPTIONS,
    sizeIndex: 0,
    size: SIZE_OPTIONS[0].value,
    sizeLabel: SIZE_OPTIONS[0].label,
    providers: [],
    providerIndex: 0,
    selectedProvider: "",
    selectedProviderModel: "",
    providerDisplayName: "Not Ready",
    promptOverride: "",
    referenceImages: [],
    referenceLimit: MAX_REFERENCE_IMAGES,
    referenceHint: buildReferenceHint(false, MAX_REFERENCE_IMAGES),
    canAddReference: true,
    submittedCount: 0,
    submittedJobs: [],
    submitDisabled: true
  },

  onLoad: function () {
    this.loadPage();
  },

  onPullDownRefresh: function () {
    this.loadPage(true);
  },

  openIndex: function () {
    pageNav.goToMainPage("index");
  },

  openTasks: function () {
    pageNav.goToMainPage("tasks");
  },

  loadPage: function (fromPullDown) {
    var self = this;
    var activeGroupId = this.data.activeGroupId;

    if (!this.data.apiReady) {
      this.setData({
        isLoading: false,
        errorMessage: "Please set imageApiBaseUrl in miniprogram/env.js first.",
        submitDisabled: true
      });
      if (fromPullDown) {
        wx.stopPullDownRefresh();
      }
      return Promise.resolve();
    }

    this.setData({
      isLoading: true,
      errorMessage: ""
    });

    return Promise.all([
      stylesRepository.loadStyles(),
      imageJobs.fetchStyleGroups(),
      imageJobs.fetchImageProviders()
    ]).then(function (results) {
      var styles = Array.isArray(results[0]) ? results[0].map(prepareStyle) : [];
      var groups = Array.isArray(results[1]) ? results[1] : [];
      var providerPayload = results[2] || {};
      var styleMap = createStyleMap(styles);
      var normalizedGroups = groups.map(function (group) {
        return normalizeGroup(group, styleMap);
      }).filter(function (group) {
        return group.styleCount > 0;
      });
      var selectedGroupId = resolveGroupId(activeGroupId, normalizedGroups);
      var selectionData = buildGroupSelectionData(normalizedGroups, selectedGroupId, self.data.referenceImages);
      var providers = Array.isArray(providerPayload.providers) ? providerPayload.providers : [];
      var defaultProviderId = providerPayload.defaultProvider || (providers[0] && providers[0].id) || "";
      var providerIndex = findProviderIndex(providers, self.data.selectedProvider || defaultProviderId);
      var selectedProvider = providers[providerIndex] || null;

      self.styleMap = styleMap;
      self.setData({
        isLoading: false,
        errorMessage: "",
        groups: normalizedGroups,
        providers: providers,
        providerIndex: providerIndex,
        selectedProvider: selectedProvider ? selectedProvider.id : "",
        selectedProviderModel: selectedProvider ? selectedProvider.model : "",
        providerDisplayName: selectedProvider ? selectedProvider.name : "Not Ready",
        activeGroupId: selectionData.activeGroupId,
        activeGroupName: selectionData.activeGroupName,
        activeGroupSummary: selectionData.activeGroupSummary,
        selectedStyles: selectionData.selectedStyles,
        selectedStyleCount: selectionData.selectedStyleCount,
        groupUsesAutoReference: selectionData.groupUsesAutoReference,
        referenceImages: selectionData.referenceImages,
        referenceLimit: selectionData.referenceLimit,
        referenceHint: selectionData.referenceHint,
        canAddReference: selectionData.canAddReference,
        submitDisabled: computeSubmitDisabled({
          apiReady: true,
          isSubmitting: self.data.isSubmitting,
          activeGroupId: selectionData.activeGroupId,
          selectedStyleCount: selectionData.selectedStyleCount,
          selectedProvider: selectedProvider ? selectedProvider.id : ""
        })
      });
    }).catch(function (error) {
      self.setData({
        isLoading: false,
        errorMessage: (error && error.message) || "Failed to load batch page.",
        submitDisabled: true
      });
    }).finally(function () {
      if (fromPullDown) {
        wx.stopPullDownRefresh();
      }
    });
  },

  selectGroup: function (event) {
    var groupId = event.currentTarget.dataset.id;
    var selectionData = buildGroupSelectionData(this.data.groups, groupId, this.data.referenceImages);

    this.setData({
      activeGroupId: selectionData.activeGroupId,
      activeGroupName: selectionData.activeGroupName,
      activeGroupSummary: selectionData.activeGroupSummary,
      selectedStyles: selectionData.selectedStyles,
      selectedStyleCount: selectionData.selectedStyleCount,
      groupUsesAutoReference: selectionData.groupUsesAutoReference,
      referenceImages: selectionData.referenceImages,
      referenceLimit: selectionData.referenceLimit,
      referenceHint: selectionData.referenceHint,
      canAddReference: selectionData.canAddReference,
      errorMessage: "",
      statusMessage: "",
      submittedCount: 0,
      submittedJobs: [],
      submitDisabled: computeSubmitDisabled({
        apiReady: this.data.apiReady,
        isSubmitting: this.data.isSubmitting,
        activeGroupId: selectionData.activeGroupId,
        selectedStyleCount: selectionData.selectedStyleCount,
        selectedProvider: this.data.selectedProvider
      })
    });

    if (selectionData.trimmedByLimit) {
      wx.showToast({
        title: "Refs trimmed",
        icon: "none"
      });
    }
  },

  onProviderChange: function (event) {
    var providerIndex = Number((event.detail && event.detail.value) || 0);
    var provider = this.data.providers[providerIndex] || null;

    this.setData({
      providerIndex: providerIndex,
      selectedProvider: provider ? provider.id : "",
      selectedProviderModel: provider ? provider.model : "",
      providerDisplayName: provider ? provider.name : "Not Ready",
      errorMessage: "",
      submitDisabled: computeSubmitDisabled({
        apiReady: this.data.apiReady,
        isSubmitting: this.data.isSubmitting,
        activeGroupId: this.data.activeGroupId,
        selectedStyleCount: this.data.selectedStyleCount,
        selectedProvider: provider ? provider.id : ""
      })
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

  onPromptOverrideInput: function (event) {
    this.setData({
      promptOverride: String((event.detail && event.detail.value) || "")
    });
  },

  chooseReferenceImages: function () {
    var remaining = this.data.referenceLimit - this.data.referenceImages.length;
    var self = this;

    if (remaining <= 0) {
      wx.showToast({
        title: "Max refs reached",
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
            id: "batch-reference-" + currentTime + "-" + index + "-" + Number(file.size || 0),
            filePath: file.path,
            name: file.name || ("reference-" + currentTime + "-" + (index + 1) + ".jpg"),
            size: Number(file.size || 0),
            previewUrl: file.path
          };
        });

        referenceImages = self.data.referenceImages.concat(nextImages).slice(0, self.data.referenceLimit);
        self.setReferenceImages(referenceImages);
      }
    });
  },

  removeReferenceImage: function (event) {
    var imageId = event.currentTarget.dataset.id;
    var nextImages = this.data.referenceImages.filter(function (item) {
      return item.id !== imageId;
    });

    this.setReferenceImages(nextImages);
  },

  clearReferenceImages: function () {
    this.setReferenceImages([]);
  },

  submitBatchJobs: function () {
    var self = this;
    var promptOverride = String(this.data.promptOverride || "").trim();

    if (!this.data.activeGroupId) {
      this.setData({
        errorMessage: "Please choose a style group first."
      });
      return;
    }

    if (!this.data.selectedStyleCount) {
      this.setData({
        errorMessage: "The selected style group has no valid styles."
      });
      return;
    }

    if (!this.data.selectedProvider) {
      this.setData({
        errorMessage: "Please choose a provider first."
      });
      return;
    }

    this.setData({
      isSubmitting: true,
      errorMessage: "",
      statusMessage: this.data.referenceImages.length ? "Uploading shared references..." : "Creating batch jobs...",
      submittedCount: 0,
      submittedJobs: [],
      submitDisabled: true
    });

    uploadSelectedReferences(this.data.referenceImages, function (current, total) {
      self.setData({
        statusMessage: "Uploading shared refs " + current + "/" + total + "..."
      });
    }).then(function (referenceIds) {
      self.setData({
        statusMessage: "Creating batch jobs..."
      });

      return imageJobs.createBatchImageJobs({
        styleGroupId: self.data.activeGroupId,
        provider: self.data.selectedProvider,
        size: self.data.size,
        promptOverride: promptOverride,
        referenceIds: referenceIds
      });
    }).then(function (payload) {
      var jobs = Array.isArray(payload.jobs) ? payload.jobs.map(normalizeSubmittedJob) : [];
      var submittedCount = Number(payload.submittedCount || jobs.length || 0);

      self.setData({
        statusMessage: "Submitted " + submittedCount + " jobs.",
        submittedCount: submittedCount,
        submittedJobs: jobs.slice(0, 5)
      });

      wx.showToast({
        title: "Submitted",
        icon: "success"
      });
    }).catch(function (error) {
      self.setData({
        errorMessage: (error && error.message) || "Failed to submit batch jobs."
      });
    }).finally(function () {
      self.setData({
        isSubmitting: false,
        submitDisabled: computeSubmitDisabled({
          apiReady: self.data.apiReady,
          isSubmitting: false,
          activeGroupId: self.data.activeGroupId,
          selectedStyleCount: self.data.selectedStyleCount,
          selectedProvider: self.data.selectedProvider
        })
      });
    });
  },

  setReferenceImages: function (referenceImages) {
    this.setData({
      referenceImages: referenceImages,
      canAddReference: referenceImages.length < this.data.referenceLimit
    });
  }
});

function createStyleMap(styles) {
  var map = {};

  styles.forEach(function (style) {
    map[style.id] = style;
  });

  return map;
}

function prepareStyle(style) {
  var tags = Array.isArray(style.tags) ? style.tags.filter(Boolean) : [];
  var title = tags.length ? tags.join(" / ") : (style.id || "Untitled Style");

  return {
    id: style.id,
    title: title,
    tags: tags,
    image: style.image || "",
    prompt: String(style.prompt || ""),
    useStyleImageAsReference: Boolean(style.useStyleImageAsReference)
  };
}

function normalizeGroup(group, styleMap) {
  var styleIds = Array.isArray(group && group.styleIds) ? group.styleIds : [];
  var styles = styleIds.map(function (styleId) {
    return styleMap[styleId];
  }).filter(Boolean);

  return {
    id: String((group && group.id) || ""),
    name: String((group && group.name) || "").trim() || "Untitled Group",
    styleIds: styleIds,
    styles: styles,
    styleCount: styles.length,
    summaryText: buildGroupSummary(styles),
    usesAutoReference: styles.some(function (style) {
      return Boolean(style && style.useStyleImageAsReference);
    })
  };
}

function resolveGroupId(activeGroupId, groups) {
  var hasActive = groups.some(function (group) {
    return group.id === activeGroupId;
  });

  if (hasActive) {
    return activeGroupId;
  }

  return groups[0] ? groups[0].id : "";
}

function buildGroupSelectionData(groups, groupId, referenceImages) {
  var group = null;
  var referenceLimit = MAX_REFERENCE_IMAGES;
  var nextImages = Array.isArray(referenceImages) ? referenceImages.slice() : [];

  groups.some(function (item) {
    if (item.id === groupId) {
      group = item;
      return true;
    }
    return false;
  });

  if (group && group.usesAutoReference) {
    referenceLimit = MAX_REFERENCE_IMAGES - 1;
  }

  if (nextImages.length > referenceLimit) {
    nextImages = nextImages.slice(0, referenceLimit);
  }

  return {
    activeGroupId: group ? group.id : "",
    activeGroupName: group ? group.name : "",
    activeGroupSummary: group ? group.summaryText : "",
    selectedStyles: group ? group.styles : [],
    selectedStyleCount: group ? group.styleCount : 0,
    groupUsesAutoReference: Boolean(group && group.usesAutoReference),
    referenceImages: nextImages,
    referenceLimit: referenceLimit,
    referenceHint: buildReferenceHint(Boolean(group && group.usesAutoReference), referenceLimit),
    canAddReference: nextImages.length < referenceLimit,
    trimmedByLimit: Array.isArray(referenceImages) && referenceImages.length > referenceLimit
  };
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

function buildGroupSummary(styles) {
  var titles = styles.slice(0, 3).map(function (style) {
    return style.title;
  });

  if (!titles.length) {
    return "No valid styles.";
  }

  if (styles.length > 3) {
    return titles.join(" / ") + " +" + (styles.length - 3);
  }

  return titles.join(" / ");
}

function buildReferenceHint(groupUsesAutoReference, referenceLimit) {
  if (groupUsesAutoReference) {
    return "This group includes styles that reserve ref 1 for the style preview. You can upload up to " + referenceLimit + " shared refs.";
  }

  return "You can upload up to " + referenceLimit + " shared refs for every style in the group.";
}

function computeSubmitDisabled(state) {
  return !state.apiReady || state.isSubmitting || !state.activeGroupId || !state.selectedStyleCount || !state.selectedProvider;
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

function normalizeSubmittedJob(job) {
  return {
    jobId: String((job && job.jobId) || ""),
    styleNameText: String((job && job.styleName) || "Untitled Style"),
    promptPreview: formatPromptPreview((job && job.prompt) || "")
  };
}

function formatPromptPreview(prompt) {
  var text = String(prompt || "").replace(/\s+/g, " ").trim();

  if (!text) {
    return "No prompt";
  }

  return text.length > 70 ? (text.slice(0, 70) + "...") : text;
}
