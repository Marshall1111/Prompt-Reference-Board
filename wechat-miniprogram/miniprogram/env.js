module.exports = {
  // 填入微信云开发环境 ID 后，小程序会优先读取云数据库 styles 集合。
  // 例如：cloudEnvId: "prod-abc123"
  cloudEnvId: "cloud1-d5gyjqja3dc0f5c84",

  // 你现在只用云存储放图片，提示词仍然读取 data/styles.js。
  // 等以后建好云数据库 styles 集合，再改成 true。
  useCloudDatabase: false
};
