const env = require("../env");
const localData = require("../data/styles");

function loadStyles() {
  if (!env.useCloudDatabase || !env.cloudEnvId || !wx.cloud) {
    return Promise.resolve((localData.styles || []).map(normalizeStyle));
  }

  return Promise.resolve((localData.styles || []).map(normalizeStyle));
}

function normalizeStyle(style) {
  return {
    id: style.id || style._id,
    sort: Number(style.sort || 0),
    tags: Array.isArray(style.tags) ? style.tags : [],
    image: style.image || "",
    prompt: style.prompt || "",
    useStyleImageAsReference: Boolean(style.useStyleImageAsReference)
  };
}

module.exports = {
  loadStyles: loadStyles
};
