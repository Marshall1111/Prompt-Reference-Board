const stylesRepository = require("../../utils/styles-repository");

Page({
  data: {
    styles: [],
    visibleStyles: [],
    query: "",
    isLoading: true,
    errorMessage: "",
    totalCount: 0,
    visibleCount: 0,
    copiedStyleId: "",
    promptModalVisible: false,
    activePrompt: "",
    activePromptTitle: ""
  },

  onLoad: function () {
    this.loadStyles();
  },

  onPullDownRefresh: function () {
    this.loadStyles(true);
  },

  loadStyles: function (fromPullDown) {
    var self = this;

    this.setData({
      isLoading: true,
      errorMessage: ""
    });

    return stylesRepository.loadStyles().then(function (styles) {
      var normalized = Array.isArray(styles) ? styles.slice().sort(sortStyles).map(prepareStyleCard) : [];
      var visibleStyles = filterStyles(normalized, self.data.query);

      self.setData({
        styles: normalized,
        visibleStyles: visibleStyles,
        totalCount: normalized.length,
        visibleCount: visibleStyles.length,
        isLoading: false
      });
    }).catch(function (error) {
      self.setData({
        isLoading: false,
        errorMessage: (error && error.message) || "Failed to load styles."
      });
    }).finally(function () {
      if (fromPullDown) {
        wx.stopPullDownRefresh();
      }
    });
  },

  onSearchInput: function (event) {
    var query = String((event.detail && event.detail.value) || "");
    var visibleStyles = filterStyles(this.data.styles, query);

    this.setData({
      query: query,
      visibleStyles: visibleStyles,
      visibleCount: visibleStyles.length
    });
  },

  clearSearch: function () {
    this.setData({
      query: "",
      visibleStyles: this.data.styles,
      visibleCount: this.data.styles.length
    });
  },

  openGenerate: function (event) {
    var styleId = event.currentTarget.dataset.id;

    if (!styleId) {
      return;
    }

    wx.navigateTo({
      url: "/pages/generate/generate?id=" + encodeURIComponent(styleId)
    });
  },

  openTasks: function () {
    wx.navigateTo({
      url: "/pages/tasks/tasks"
    });
  },

  previewStyleImage: function (event) {
    var url = event.currentTarget.dataset.url;

    if (!url) {
      return;
    }

    wx.previewImage({
      current: url,
      urls: [url]
    });
  },

  copyPrompt: function (event) {
    var self = this;
    var prompt = event.currentTarget.dataset.prompt;
    var styleId = event.currentTarget.dataset.id;

    if (!prompt) {
      return;
    }

    wx.setClipboardData({
      data: prompt,
      success: function () {
        self.setData({
          copiedStyleId: styleId || ""
        });

        setTimeout(function () {
          if (self.data.copiedStyleId === styleId) {
            self.setData({
              copiedStyleId: ""
            });
          }
        }, 1500);
      }
    });
  },

  openPromptModal: function (event) {
    var prompt = event.currentTarget.dataset.prompt;
    var title = event.currentTarget.dataset.title;

    this.setData({
      promptModalVisible: true,
      activePrompt: prompt || "",
      activePromptTitle: title || "Prompt"
    });
  },

  closePromptModal: function () {
    this.setData({
      promptModalVisible: false,
      activePrompt: "",
      activePromptTitle: ""
    });
  },

  copyActivePrompt: function () {
    if (!this.data.activePrompt) {
      return;
    }

    wx.setClipboardData({
      data: this.data.activePrompt
    });
  },

  noop: function () {}
});

function sortStyles(left, right) {
  var leftSort = Number(left && left.sort);
  var rightSort = Number(right && right.sort);

  if (leftSort !== rightSort) {
    return leftSort - rightSort;
  }

  return String((left && left.id) || "").localeCompare(String((right && right.id) || ""));
}

function prepareStyleCard(style) {
  var tags = Array.isArray(style.tags) ? style.tags.filter(Boolean) : [];
  var title = tags.length ? tags.join(" / ") : (style.id || "Untitled Style");
  var prompt = String(style.prompt || "");
  var searchableText = (title + " " + prompt).toLowerCase();

  return {
    id: style.id,
    image: style.image || "",
    prompt: prompt,
    promptPreview: formatPromptPreview(prompt),
    tags: tags,
    title: title,
    searchableText: searchableText,
    useStyleImageAsReference: Boolean(style.useStyleImageAsReference)
  };
}

function filterStyles(styles, query) {
  var keyword = String(query || "").trim().toLowerCase();

  if (!keyword) {
    return styles;
  }

  return styles.filter(function (style) {
    return String(style.searchableText || "").indexOf(keyword) !== -1;
  });
}

function formatPromptPreview(prompt) {
  var text = String(prompt || "").replace(/\s+/g, " ").trim();

  if (!text) {
    return "No prompt yet.";
  }

  return text.length > 96 ? (text.slice(0, 96) + "...") : text;
}
