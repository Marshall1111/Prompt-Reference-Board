const MAIN_PAGE_URLS = {
  index: "/pages/index/index",
  tasks: "/pages/tasks/tasks",
  batch: "/pages/batch/batch"
};

function goToMainPage(targetRoute) {
  var targetUrl = MAIN_PAGE_URLS[targetRoute];
  var pages = [];
  var currentRoute = "";
  var matchIndex = -1;
  var delta = 0;

  if (!targetUrl) {
    return Promise.reject(new Error("Unknown main page route: " + targetRoute));
  }

  pages = getCurrentPages() || [];
  currentRoute = pages.length ? toPageUrl(pages[pages.length - 1].route) : "";
  if (currentRoute === targetUrl) {
    return Promise.resolve({ type: "noop", url: targetUrl });
  }

  matchIndex = findPageIndexByUrl(pages, targetUrl);
  if (matchIndex >= 0) {
    delta = pages.length - 1 - matchIndex;
    if (delta > 0) {
      return new Promise(function (resolve, reject) {
        wx.navigateBack({
          delta: delta,
          success: function () {
            resolve({ type: "back", url: targetUrl, delta: delta });
          },
          fail: function (error) {
            reject(error || new Error("navigateBack failed"));
          }
        });
      });
    }

    return Promise.resolve({ type: "noop", url: targetUrl });
  }

  return new Promise(function (resolve, reject) {
    wx.redirectTo({
      url: targetUrl,
      success: function () {
        resolve({ type: "redirect", url: targetUrl });
      },
      fail: function (error) {
        reject(error || new Error("redirectTo failed"));
      }
    });
  });
}

function findPageIndexByUrl(pages, targetUrl) {
  var index;

  for (index = pages.length - 1; index >= 0; index -= 1) {
    if (toPageUrl(pages[index] && pages[index].route) === targetUrl) {
      return index;
    }
  }

  return -1;
}

function toPageUrl(route) {
  var normalized = String(route || "");

  if (!normalized) {
    return "";
  }

  if (normalized.charAt(0) !== "/") {
    normalized = "/" + normalized;
  }

  return normalized;
}

module.exports = {
  goToMainPage: goToMainPage
};
