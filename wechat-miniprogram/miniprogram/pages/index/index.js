const { loadStyles } = require("../../utils/styles-repository");

Page({
  data: {
    styles: [],
    filteredStyles: [],
    columns: [[], []],
    query: "",
    activeStyle: null
  },

  async onLoad() {
    const styles = await loadStyles();
    this.setData({
      styles,
      filteredStyles: styles,
      columns: splitColumns(styles)
    });
  },

  onSearchInput(event) {
    const query = event.detail.value;
    const filteredStyles = filterStyles(this.data.styles, query);
    this.setData({
      query,
      filteredStyles,
      columns: splitColumns(filteredStyles)
    });
  },

  copyPrompt(event) {
    const style = findStyle(this.data.styles, event.currentTarget.dataset.id);
    if (style) {
      copyText(style.prompt);
    }
  },

  openPrompt(event) {
    const style = findStyle(this.data.styles, event.currentTarget.dataset.id);
    if (style) {
      this.setData({ activeStyle: style });
    }
  },

  copyActivePrompt() {
    if (this.data.activeStyle) {
      copyText(this.data.activeStyle.prompt);
    }
  },

  closePrompt() {
    this.setData({ activeStyle: null });
  },

  noop() {}
});

function filterStyles(styles, query) {
  const keyword = query.trim().toLowerCase();
  if (!keyword) return styles;

  return styles.filter((style) => {
    const content = `${style.tags.join(" ")} ${style.prompt}`.toLowerCase();
    return content.includes(keyword);
  });
}

function splitColumns(styles) {
  return styles.reduce(
    (columns, style, index) => {
      columns[index % 2].push(style);
      return columns;
    },
    [[], []]
  );
}

function findStyle(styles, id) {
  return styles.find((style) => style.id === id);
}

function copyText(text) {
  wx.setClipboardData({
    data: text,
    success() {
      wx.showToast({
        title: "已复制",
        icon: "success"
      });
    }
  });
}
