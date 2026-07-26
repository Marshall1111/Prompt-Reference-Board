const env = require("../env");

const VISITOR_COOKIE_NAME = "pg_visitor";
const WEB_ACCOUNT_COOKIE_NAME = "pg_web_account";
const USER_SESSION_COOKIE_NAME = "pg_user_session";
const COOKIE_STORAGE_KEY = "petpaint.public.cookie";
const UPLOAD_TOO_LARGE_MESSAGE = "图片太大，服务器拒绝了本次上传。请换一张较小的图片，或把服务器 Nginx 的 client_max_body_size 调大后重试。";

function getApiBaseUrl() {
  return String(env.imageApiBaseUrl || "").trim().replace(/\/+$/, "");
}

function buildUrl(path) {
  var baseUrl = getApiBaseUrl();
  var safePath = String(path || "");

  if (!baseUrl) {
    throw new Error("请先在 miniprogram/env.js 配置后端域名。");
  }
  if (safePath.charAt(0) !== "/") {
    safePath = "/" + safePath;
  }
  return baseUrl + safePath;
}

function toAbsoluteUrl(pathOrUrl) {
  var text = String(pathOrUrl || "");

  if (!text) return "";
  if (/^https?:\/\//i.test(text)) return text;
  return buildUrl(text);
}

function getStoredCookie() {
  try {
    return wx.getStorageSync(COOKIE_STORAGE_KEY) || "";
  } catch (error) {
    return "";
  }
}

function setStoredCookie(cookie) {
  try {
    wx.setStorageSync(COOKIE_STORAGE_KEY, cookie || "");
  } catch (error) {}
}

function getRequestCookieHeader() {
  var cookie = getStoredCookie();
  return cookie ? cookie : "";
}

function getCookieValue(name) {
  var prefix = String(name || "") + "=";
  var cookies = getRequestCookieHeader().split(";");
  var index = 0;

  for (index = 0; index < cookies.length; index += 1) {
    var item = String(cookies[index] || "").trim();
    if (item.indexOf(prefix) === 0) return item.slice(prefix.length);
  }
  return "";
}

function getAccountCacheKey() {
  return getCookieValue(WEB_ACCOUNT_COOKIE_NAME);
}

function mergeHeaders(headers) {
  var next = headers ? Object.assign({}, headers) : {};
  var cookie = getRequestCookieHeader();
  if (cookie) next.Cookie = cookie;
  next["X-PetPaint-Client"] = "miniprogram";
  return next;
}

function readHeader(headers, key) {
  var lowerKey = String(key || "").toLowerCase();
  var source = headers || {};
  var names = Object.keys(source);
  var index = 0;

  for (index = 0; index < names.length; index += 1) {
    if (names[index].toLowerCase() === lowerKey) {
      return source[names[index]];
    }
  }
  return "";
}

function persistResponseCookie(headers, cookies) {
  var setCookie = readHeader(headers, "set-cookie");
  var cookieParts = [];
  var cookieText = "";
  var match = null;

  if (Array.isArray(cookies)) {
    cookieParts = cookieParts.concat(cookies);
  }
  if (setCookie) {
    cookieParts = cookieParts.concat(Array.isArray(setCookie) ? setCookie : [setCookie]);
  }

  cookieText = cookieParts.join(",");
  [VISITOR_COOKIE_NAME, WEB_ACCOUNT_COOKIE_NAME, USER_SESSION_COOKIE_NAME].forEach(function (name) {
    match = cookieText.match(new RegExp("(?:^|[,;\\s])" + name + "=([^;,\\s]*)"));
    if (match) setCookieValue(name, match[1]);
  });
}

function setCookieValue(name, value) {
  var current = getRequestCookieHeader().split(";").map(function (item) { return item.trim(); }).filter(Boolean);
  var next = current.filter(function (item) { return item.indexOf(name + "=") !== 0; });
  if (value) next.push(name + "=" + value);
  setStoredCookie(next.join("; "));
}

function safeParseJson(data) {
  if (!data) return {};
  if (typeof data === "object") return data;
  try {
    return JSON.parse(data);
  } catch (error) {
    return {};
  }
}

function request(options) {
  var nextOptions = options || {};
  var requestUrl = buildUrl(nextOptions.path || nextOptions.url || "");

  return new Promise(function (resolve, reject) {
    wx.request({
      url: requestUrl,
      method: nextOptions.method || "GET",
      header: mergeHeaders(nextOptions.header),
      data: nextOptions.data,
      success: function (response) {
        var ok = response.statusCode >= 200 && response.statusCode < 300;
        var payload = safeParseJson(response.data);

        persistResponseCookie(response.header, response.cookies);
        if (ok) {
          resolve(payload);
          return;
        }
        if (response.statusCode === 413) {
          reject(new Error(UPLOAD_TOO_LARGE_MESSAGE));
          return;
        }
        reject(new Error(payload.message || ("请求失败：" + response.statusCode)));
      },
      fail: function (error) {
        reject(new Error(formatNetworkError(error, "request", requestUrl)));
      }
    });
  });
}

function uploadFile(options) {
  var nextOptions = options || {};
  var uploadUrl = buildUrl(nextOptions.path || nextOptions.url || "");

  return new Promise(function (resolve, reject) {
    wx.uploadFile({
      url: uploadUrl,
      filePath: nextOptions.filePath,
      name: nextOptions.name || "image",
      header: mergeHeaders(nextOptions.header),
      formData: nextOptions.formData || {},
      success: function (response) {
        var ok = response.statusCode >= 200 && response.statusCode < 300;
        var payload = safeParseJson(response.data);

        persistResponseCookie(response.header, response.cookies);
        if (ok) {
          resolve(payload);
          return;
        }
        if (response.statusCode === 413) {
          reject(new Error(UPLOAD_TOO_LARGE_MESSAGE));
          return;
        }
        reject(new Error(payload.message || ("上传失败：" + response.statusCode)));
      },
      fail: function (error) {
        reject(new Error(formatNetworkError(error, "uploadFile", uploadUrl)));
      }
    });
  });
}

function downloadFile(url) {
  var downloadUrl = toAbsoluteUrl(url);

  return new Promise(function (resolve, reject) {
    wx.downloadFile({
      url: downloadUrl,
      header: mergeHeaders(),
      success: function (response) {
        persistResponseCookie(response.header, response.cookies);
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.tempFilePath);
          return;
        }
        if (response.statusCode === 413) {
          reject(new Error(UPLOAD_TOO_LARGE_MESSAGE));
          return;
        }
        reject(new Error("下载失败：" + response.statusCode));
      },
      fail: function (error) {
        reject(new Error(formatNetworkError(error, "downloadFile", downloadUrl)));
      }
    });
  });
}

function loginWithMiniProgram(inviteToken) {
  if (!wx.login) return Promise.reject(new Error("当前微信版本不支持小程序登录。"));
  return new Promise(function (resolve, reject) {
    wx.login({
      success: function (result) {
        var code = String(result && result.code || "");
        if (!code) {
          reject(new Error("微信登录失败，请重试。"));
          return;
        }
        request({
          path: "/api/auth/miniprogram/login",
          method: "POST",
          header: { "Content-Type": "application/json" },
          data: {
            code: code,
            invite: String(inviteToken || "").trim()
          }
        }).then(resolve, reject);
      },
      fail: function () {
        reject(new Error("微信登录失败，请重试。"));
      }
    });
  });
}

function updateMiniProgramProfile(nickname, avatarFilePath, useDefaultAvatar) {
  if (!avatarFilePath && useDefaultAvatar) {
    return request({
      path: "/api/auth/miniprogram/profile",
      method: "POST",
      header: { "Content-Type": "application/json" },
      data: {
        nickname: String(nickname || "").trim(),
        useDefaultAvatar: "true"
      }
    });
  }
  return uploadFile({
    path: "/api/auth/miniprogram/profile",
    filePath: String(avatarFilePath || ""),
    name: "avatar",
    formData: {
      nickname: String(nickname || "").trim(),
      useDefaultAvatar: useDefaultAvatar ? "true" : "false"
    }
  });
}

function requestEmailCode(email, purpose) {
  return request({
    path: "/api/auth/email-code",
    method: "POST",
    header: { "Content-Type": "application/json" },
    data: { email: String(email || "").trim(), purpose: String(purpose || "register") }
  });
}

function loginWithEmail(email, password) {
  return request({
    path: "/api/auth/login",
    method: "POST",
    header: { "Content-Type": "application/json" },
    data: { email: String(email || "").trim(), password: String(password || "") }
  });
}

function registerWithEmail(payload) {
  var data = payload || {};
  return request({
    path: "/api/auth/register",
    method: "POST",
    header: { "Content-Type": "application/json" },
    data: {
      email: String(data.email || "").trim(),
      username: String(data.username || "").trim(),
      password: String(data.password || ""),
      code: String(data.code || "").trim()
    }
  });
}

function resetPasswordWithEmail(payload) {
  var data = payload || {};
  return request({
    path: "/api/auth/password-reset",
    method: "POST",
    header: { "Content-Type": "application/json" },
    data: {
      email: String(data.email || "").trim(),
      password: String(data.password || ""),
      code: String(data.code || "").trim()
    }
  });
}

function createReferralLink(target) {
  return request({
    path: "/api/referrals/link",
    method: "POST",
    header: { "Content-Type": "application/json" },
    data: { target: String(target || "draw-card") }
  });
}

function logout() {
  return request({ path: "/api/auth/logout", method: "POST" }).finally(function () {
    setCookieValue(WEB_ACCOUNT_COOKIE_NAME, "");
    setCookieValue(USER_SESSION_COOKIE_NAME, "");
  });
}

function initializeGuestAccount() {
  return request({ path: "/api/account" });
}

function ensureMiniProgramLogin(inviteToken) {
  return request({ path: "/api/account" });
}

function formatNetworkError(error, apiName, url) {
  var message = String((error && error.errMsg) || "");
  var baseUrl = getApiBaseUrl();

  if (message.indexOf("url not in domain list") !== -1) {
    return "当前后端域名未加入微信小程序 " + apiName + " 合法域名：" + baseUrl + "。请在小程序后台的“开发管理 -> 开发设置 -> 服务器域名”里添加该 HTTPS 域名。";
  }
  if (message) return message;
  return "网络请求失败：" + String(url || baseUrl || "");
}

function createTraceId(prefix) {
  return String(prefix || "mp") + "-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

module.exports = {
  buildUrl: buildUrl,
  createReferralLink: createReferralLink,
  createTraceId: createTraceId,
  downloadFile: downloadFile,
  ensureMiniProgramLogin: ensureMiniProgramLogin,
  getAccountCacheKey: getAccountCacheKey,
  getApiBaseUrl: getApiBaseUrl,
  initializeGuestAccount: initializeGuestAccount,
  loginWithEmail: loginWithEmail,
  loginWithMiniProgram: loginWithMiniProgram,
  logout: logout,
  registerWithEmail: registerWithEmail,
  requestEmailCode: requestEmailCode,
  request: request,
  resetPasswordWithEmail: resetPasswordWithEmail,
  toAbsoluteUrl: toAbsoluteUrl,
  updateMiniProgramProfile: updateMiniProgramProfile,
  uploadFile: uploadFile
};
