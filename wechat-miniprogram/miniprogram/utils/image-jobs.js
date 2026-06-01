const env = require("../env");

function getImageApiBaseUrl() {
  return String(env.imageApiBaseUrl || "").trim().replace(/\/+$/, "");
}

function buildApiUrl(path) {
  var baseUrl = getImageApiBaseUrl();
  var safePath = String(path || "");

  if (!baseUrl) {
    throw new Error("Please set imageApiBaseUrl in miniprogram/env.js");
  }

  if (safePath.charAt(0) !== "/") {
    safePath = "/" + safePath;
  }

  return baseUrl + safePath;
}

function toAbsoluteImageUrl(pathOrUrl) {
  var text = String(pathOrUrl || "");
  var baseUrl = "";

  if (!text) {
    return "";
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  baseUrl = getImageApiBaseUrl();
  if (!baseUrl) {
    return text;
  }

  if (text.charAt(0) !== "/") {
    text = "/" + text;
  }

  return baseUrl + text;
}

function canRenderRemoteImage(url) {
  return /^https:\/\//i.test(String(url || ""));
}

function request(options) {
  return new Promise(function (resolve, reject) {
    wx.request({
      url: options.url,
      method: options.method,
      header: options.header,
      data: options.data,
      success: function (response) {
        var ok = response.statusCode >= 200 && response.statusCode < 300;
        var payload = safeParseJson(response.data);

        if (ok) {
          if (response.data && typeof response.data === "string" && !isPlainObject(payload)) {
            reject(new Error("API did not return JSON. Please restart the local backend and try again."));
            return;
          }

          resolve(isPlainObject(payload) ? payload : response.data);
          return;
        }

        reject(new Error(payload.message || ("Request failed: " + response.statusCode)));
      },
      fail: function (error) {
        reject(new Error((error && error.errMsg) || "Network request failed"));
      }
    });
  });
}

function fetchImageProviders() {
  return request({
    url: buildApiUrl("/api/image-providers"),
    method: "GET"
  });
}

function fetchStyleGroups() {
  return request({
    url: buildApiUrl("/api/style-groups"),
    method: "GET"
  });
}

function createImageJob(payload) {
  return request({
    url: buildApiUrl("/api/image-jobs"),
    method: "POST",
    header: {
      "Content-Type": "application/json"
    },
    data: payload
  });
}

function createBatchImageJobs(payload) {
  return request({
    url: buildApiUrl("/api/image-jobs/batch"),
    method: "POST",
    header: {
      "Content-Type": "application/json"
    },
    data: payload
  });
}

function uploadReferenceImage(referenceImage) {
  return new Promise(function (resolve, reject) {
    if (!referenceImage || !referenceImage.filePath) {
      reject(new Error("Please select a reference image first"));
      return;
    }

    wx.uploadFile({
      url: buildApiUrl("/api/image-references"),
      filePath: referenceImage.filePath,
      name: "reference",
      success: function (response) {
        var data = safeParseJson(response.data);
        var ok = response.statusCode >= 200 && response.statusCode < 300;

        if (ok && data.reference) {
          resolve(data.reference);
          return;
        }

        reject(new Error(data.message || ("Upload failed: " + response.statusCode)));
      },
      fail: function (error) {
        reject(new Error((error && error.errMsg) || "Reference upload failed"));
      }
    });
  });
}

function fetchImageJob(jobId) {
  return request({
    url: buildApiUrl("/api/image-jobs/" + encodeURIComponent(jobId)),
    method: "GET"
  });
}

function fetchImageJobs(limit) {
  var query = typeof limit === "number" ? "?limit=" + limit : "";
  return request({
    url: buildApiUrl("/api/image-jobs" + query),
    method: "GET"
  });
}

function cancelImageJob(jobId) {
  return request({
    url: buildApiUrl("/api/image-jobs/" + encodeURIComponent(jobId) + "/cancel"),
    method: "POST"
  });
}

function safeParseJson(text) {
  if (!text) {
    return {};
  }

  if (typeof text === "object") {
    return text;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

module.exports = {
  canRenderRemoteImage: canRenderRemoteImage,
  cancelImageJob: cancelImageJob,
  createBatchImageJobs: createBatchImageJobs,
  createImageJob: createImageJob,
  fetchImageJob: fetchImageJob,
  fetchImageJobs: fetchImageJobs,
  fetchImageProviders: fetchImageProviders,
  fetchStyleGroups: fetchStyleGroups,
  getImageApiBaseUrl: getImageApiBaseUrl,
  toAbsoluteImageUrl: toAbsoluteImageUrl,
  uploadReferenceImage: uploadReferenceImage
};
