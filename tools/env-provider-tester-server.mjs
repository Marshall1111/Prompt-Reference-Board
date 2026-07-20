import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pagePath = path.join(__dirname, "env-provider-tester.html");
const host = "127.0.0.1";
const port = Number(process.env.ENV_PROVIDER_TESTER_PORT || 8787);
const maxRequestBytes = 64 * 1024 * 1024;
const requestTimeoutMs = 30 * 60 * 1000;

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store"
  });
  res.end(text);
}

function publicError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readJsonBody(req) {
  const parts = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > maxRequestBytes) throw publicError(413, "请求内容过大；请使用不超过约 45MB 的参考图。");
    parts.push(part);
  }
  if (!parts.length) return {};
  try {
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } catch {
    throw publicError(400, "请求数据格式无效。");
  }
}

function normalizeProvider(value) {
  const provider = value && typeof value === "object" ? value : {};
  const id = String(provider.id || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 48);
  const baseUrl = String(provider.baseUrl || "").trim().replace(/\/+$/, "");
  const apiKey = String(provider.apiKey || "").trim();
  const model = String(provider.model || "").trim();
  const route = String(provider.route || "images").trim().toLowerCase();
  if (!id) throw publicError(400, "供应商 ID 无效。");
  if (!baseUrl) throw publicError(400, "请填写 Base URL。");
  try {
    const url = new URL(baseUrl);
    if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported protocol");
  } catch {
    throw publicError(400, "Base URL 必须以 http:// 或 https:// 开头。");
  }
  if (!apiKey) throw publicError(400, "请填写 API Key。");
  if (!model) throw publicError(400, "请填写生图模型。");
  if (!["images", "responses", "chat_completions"].includes(route)) throw publicError(400, "不支持的接口路线。");
  return { id, name: String(provider.name || id).trim() || id, baseUrl, apiKey, model, route };
}

function errorMessage(payload, rawText, status) {
  return String(payload?.error?.message || payload?.message || rawText || `接口返回 HTTP ${status}`).trim();
}

async function callProvider(provider, endpoint, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(`${provider.baseUrl}${endpoint}`, {
      ...options,
      headers: { Authorization: `Bearer ${provider.apiKey}`, ...(options.headers || {}) },
      signal: controller.signal
    });
    const rawText = await response.text();
    let payload = {};
    try { payload = rawText ? JSON.parse(rawText) : {}; } catch { payload = { raw: rawText }; }
    if (!response.ok) throw publicError(response.status, errorMessage(payload, rawText, response.status));
    return payload;
  } catch (error) {
    if (error.name === "AbortError") throw publicError(504, `供应商请求超过 ${Math.round(requestTimeoutMs / 60000)} 分钟仍未完成。`);
    if (error.status) throw error;
    throw publicError(502, `无法连接供应商：${error.message || "网络请求失败"}`);
  } finally {
    clearTimeout(timeout);
  }
}

function findImage(value, seen = new WeakSet()) {
  if (!value) return "";
  if (typeof value === "string") {
    if (/^data:image\//i.test(value) || /^https?:\/\//i.test(value)) return value;
    const dataUrl = value.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=\r\n]+/i);
    if (dataUrl) return dataUrl[0];
    const url = value.match(/https?:\/\/[^\s"'`<>()]+/i);
    return url?.[0] || "";
  }
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  if (typeof value.b64_json === "string") return `data:image/png;base64,${value.b64_json.replace(/\s/g, "")}`;
  if (typeof value.url === "string") return findImage(value.url, seen);
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const image = findImage(item, seen);
    if (image) return image;
  }
  return "";
}

function referenceFile(reference) {
  if (!reference?.dataUrl) return null;
  const match = String(reference.dataUrl).match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) throw publicError(400, "参考图数据无效。");
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!bytes.length) throw publicError(400, "参考图为空。");
  return {
    blob: new Blob([bytes], { type: String(reference.type || match[1] || "image/png") }),
    name: path.basename(String(reference.name || "reference.png")) || "reference.png"
  };
}

function imageRequestBody(provider, prompt, size, reference) {
  const options = { size, quality: "low", n: 1, output_format: "png", background: "auto", moderation: "auto" };
  if (!reference) {
    return {
      endpoint: "/images/generations",
      options: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: provider.model, prompt, ...options }) }
    };
  }
  const form = new FormData();
  form.append("model", provider.model);
  form.append("prompt", prompt);
  Object.entries(options).forEach(([key, value]) => form.append(key, String(value)));
  form.append("image", reference.blob, reference.name);
  return { endpoint: "/images/edits", options: { method: "POST", body: form } };
}

function responseInput(prompt, referenceDataUrl = "") {
  const content = [{ type: "input_text", text: prompt }];
  if (referenceDataUrl) content.push({ type: "input_image", image_url: referenceDataUrl });
  return [{ role: "user", content }];
}

async function testGeneration(payload) {
  const provider = normalizeProvider(payload.provider);
  const prompt = String(payload.prompt || "").trim().slice(0, 2000);
  const size = String(payload.size || "1024x1024").trim();
  const reference = referenceFile(payload.reference);
  if (!prompt) throw publicError(400, "请输入生图测试提示词。");

  let result;
  let endpoint;
  if (provider.route === "images") {
    const request = imageRequestBody(provider, prompt, size, reference);
    endpoint = request.endpoint;
    result = await callProvider(provider, endpoint, request.options);
  } else if (provider.route === "responses") {
    endpoint = "/responses";
    const requestBody = { model: provider.model, stream: false, input: responseInput(prompt, payload.reference?.dataUrl || "") };
    result = await callProvider(provider, endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
    if (!findImage(result)) {
      result = await callProvider(provider, endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestBody, tools: [{ type: "image_generation" }] })
      });
    }
  } else {
    endpoint = "/chat/completions";
    const content = [{ type: "text", text: prompt }];
    if (payload.reference?.dataUrl) content.push({ type: "image_url", image_url: { url: payload.reference.dataUrl } });
    result = await callProvider(provider, endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: provider.model, stream: false, messages: [{ role: "user", content }] })
    });
  }

  const image = findImage(result);
  if (!image) throw publicError(502, "供应商响应中没有找到图片 URL 或 Base64 图片数据。请确认模型和接口路线。");
  return { endpoint, image };
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${host}:${port}`);
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const page = await readFile(pagePath);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(page);
    }
    if (req.method === "POST" && url.pathname === "/api/test/connection") {
      const provider = normalizeProvider((await readJsonBody(req)).provider);
      await callProvider(provider, "/models", { method: "GET" });
      return sendJson(res, 200, { endpoint: "/models", message: "连接、鉴权与 /models 响应均正常。" });
    }
    if (req.method === "POST" && url.pathname === "/api/test/generation") {
      return sendJson(res, 200, await testGeneration(await readJsonBody(req)));
    }
    return sendJson(res, 404, { message: "接口不存在。" });
  } catch (error) {
    return sendJson(res, error.status || 500, { message: error.message || "本地代理请求失败。" });
  }
});

server.listen(port, host, () => {
  console.log(`环境供应商测试工具已启动：http://${host}:${port}`);
  console.log("仅监听本机；按 Ctrl+C 停止。");
});
