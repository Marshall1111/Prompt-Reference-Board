const { cloudEnvId } = require("./env");

App({
  globalData: {
    cloudReady: false
  },

  onLaunch() {
    if (cloudEnvId && wx.cloud) {
      wx.cloud.init({
        env: cloudEnvId,
        traceUser: true
      });
      this.globalData.cloudReady = true;
    }
  }
});
