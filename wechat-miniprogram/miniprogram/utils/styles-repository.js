const { styles: localStyles } = require("../data/styles");
const { cloudEnvId, useCloudDatabase } = require("../env");

let cloudInitialized = false;

async function loadStyles() {
  const cloudReady = ensureCloudReady();
  if (!cloudReady) {
    return localStyles;
  }

  if (!useCloudDatabase) {
    return resolveCloudImages(localStyles);
  }

  try {
    const db = wx.cloud.database();
    const result = await db
      .collection("styles")
      .where({ enabled: true })
      .orderBy("sort", "asc")
      .get();

    const styles = result.data.length ? result.data.map(normalizeStyle) : localStyles;
    return resolveCloudImages(styles);
  } catch (error) {
    console.warn("读取云数据库失败，已回退到内置数据", error);
    return resolveCloudImages(localStyles);
  }
}

function ensureCloudReady() {
  if (!cloudEnvId || !wx.cloud) {
    return false;
  }

  if (!cloudInitialized) {
    wx.cloud.init({
      env: cloudEnvId,
      traceUser: true
    });
    cloudInitialized = true;
  }

  return true;
}

function normalizeStyle(style) {
  return {
    id: style.id || style._id,
    sort: Number.isFinite(Number(style.sort)) ? Number(style.sort) : 0,
    tags: Array.isArray(style.tags) ? style.tags : [],
    image: style.image || "",
    prompt: style.prompt || ""
  };
}

async function resolveCloudImages(styles) {
  const cloudImages = styles
    .map((style) => style.image)
    .filter((image) => typeof image === "string" && image.startsWith("cloud://"));

  if (!cloudImages.length) {
    return styles;
  }

  try {
    const result = await wx.cloud.getTempFileURL({
      fileList: [...new Set(cloudImages)]
    });
    const urlMap = {};
    result.fileList.forEach((file) => {
      if (file.status === 0 && file.tempFileURL) {
        urlMap[file.fileID] = file.tempFileURL;
      }
    });

    return styles.map((style) => ({
      ...style,
      image: style.image.startsWith("cloud://") ? urlMap[style.image] || "" : style.image
    }));
  } catch (error) {
    console.error("云存储图片地址转换失败，请检查云环境、文件 ID 和存储权限", error);
    return styles.map((style) => ({
      ...style,
      image: typeof style.image === "string" && style.image.startsWith("cloud://") ? "" : style.image
    }));
  }
}

module.exports = {
  loadStyles
};
