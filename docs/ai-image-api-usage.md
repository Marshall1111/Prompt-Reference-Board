# AI 生图 API 使用说明

这份文档给接入方 agent 使用。重点是：前端不要直接调用第三方生图站点，而是调用本项目后端的 `/api/generate-image`。后端会根据是否上传参考图，自动选择文生图或参考图编辑。

## 基本流程

1. 先请求 `/api/image-providers` 获取可用接口供应商。
2. 用户选择风格提示词、可选参考图和供应商。
3. 用 `multipart/form-data` POST 到 `/api/generate-image`。
4. 返回结果里优先读 `imageDataUrl`，如果没有再读 `imageUrl`。

## 获取可用供应商

```http
GET /api/image-providers
```

返回示例：

```json
{
  "defaultProvider": "kuaipao",
  "providers": [
    {
      "id": "kuaipao",
      "name": "快跑",
      "model": "gpt-image-2"
    }
  ]
}
```

字段说明：

- `defaultProvider`：默认供应商 ID。
- `providers[].id`：提交生图时传给 `provider` 的值。
- `providers[].name`：界面展示用名称。
- `providers[].model`：当前供应商配置的模型名。

如果没有可用供应商，说明 `.env` 没配好 API key 或 base URL。

## 生图请求

```http
POST /api/generate-image
Content-Type: multipart/form-data
```

必须用 `FormData`，不要用 JSON。即使没有参考图，也建议统一使用 `FormData`。

### 请求字段

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `prompt` | string | 是 | 无 | 生图提示词。不能为空。 |
| `provider` | string | 否 | 默认供应商 | 来自 `/api/image-providers` 的供应商 ID。 |
| `reference` | file | 否 | 无 | 参考图。可以传多张，字段名都叫 `reference`。 |
| `size` | string | 否 | `auto` | 输出尺寸，如 `auto`、`1024x1024`、`1024x1536`、`1536x1024`。非法值会回退到 `auto`。 |
| `quality` | string | 否 | `medium` | `low`、`medium`、`high`、`auto`。 |
| `output_format` | string | 否 | `png` | `png`、`jpeg`、`webp`。 |
| `background` | string | 否 | `auto` | `auto`、`opaque`、`transparent`。 |
| `moderation` | string | 否 | `auto` | `auto`、`low`。 |

参考图限制：

- 支持 `image/jpeg`、`image/png`、`image/webp`。
- 前端选择框不要允许 SVG。后端收到 SVG 参考图会拒绝。
- 最多 10 张参考图。
- 单个文件后端限制 40MB。
- 当前网页前端会在上传前把超过 4MB 或最长边超过 2048px 的参考图压缩成 JPEG，但如果另一个 agent 自己写请求，也应该主动压缩大图，避免请求太慢或失败。

## 没有参考图：文生图

没有传 `reference` 文件时，后端会调用供应商的 OpenAI 兼容接口：

```text
POST {baseUrl}/images/generations
```

前端请求示例：

```js
const formData = new FormData();
formData.append("prompt", "一只黑白猫坐在窗边，温暖自然光，照片质感");
formData.append("provider", "kuaipao");
formData.append("size", "auto");
formData.append("quality", "medium");
formData.append("output_format", "png");
formData.append("background", "auto");
formData.append("moderation", "auto");

const response = await fetch("/api/generate-image", {
  method: "POST",
  body: formData
});

const result = await response.json();
if (!response.ok) throw new Error(result.message || "生图失败");

const imageSrc = result.imageDataUrl || result.imageUrl;
```

## 一张参考图怎么传

只要把文件追加到字段名 `reference` 即可：

```js
const formData = new FormData();
formData.append("prompt", "把图一里的宠物改成像素头像，保留主要花色和表情");
formData.append("provider", "kuaipao");
formData.append("size", "auto");
formData.append("quality", "medium");
formData.append("output_format", "png");
formData.append("background", "auto");
formData.append("moderation", "auto");
formData.append("reference", fileInput.files[0]);

const response = await fetch("/api/generate-image", {
  method: "POST",
  body: formData
});
```

有参考图时，后端会调用供应商的 OpenAI 兼容接口：

```text
POST {baseUrl}/images/edits
```

注意：提示词里可以写“图一”，因为只有一张图时它就是第一张参考图。

## 多张参考图怎么传

多张参考图不是传数组字段，也不是叫 `reference[]`。正确做法是：按顺序重复追加同一个字段名 `reference`。

```js
const files = [characterFile, styleFile, layoutFile];

const formData = new FormData();
formData.append("prompt", "用图一作为角色主体，参考图二的画风，套用图三的版式，生成 2:3 竖图");
formData.append("provider", "kuaipao");
formData.append("size", "auto");
formData.append("quality", "medium");
formData.append("output_format", "png");
formData.append("background", "auto");
formData.append("moderation", "auto");

for (const file of files) {
  formData.append("reference", file);
}

const response = await fetch("/api/generate-image", {
  method: "POST",
  body: formData
});
```

顺序非常重要：

- 第 1 个 `reference` = 提示词里的“图一”
- 第 2 个 `reference` = 提示词里的“图二”
- 第 3 个 `reference` = 提示词里的“图三”

如果界面支持拖拽排序或编号选择，提交前必须按用户当前看到的编号排序后再 append。

错误示例：

```js
// 不要这样：后端不会把它当成参考图文件列表
formData.append("reference[]", file);

// 也不要这样：multipart 里传 JSON 字符串没有文件内容
formData.append("reference", JSON.stringify(files));
```

## 返回格式

成功返回：

```json
{
  "imageDataUrl": "data:image/png;base64,...",
  "imageUrl": "",
  "mimeType": "image/png",
  "usage": {
    "total_tokens": 1234
  },
  "mode": "edit",
  "provider": {
    "id": "kuaipao",
    "name": "快跑",
    "model": "gpt-image-2"
  }
}
```

字段说明：

- `imageDataUrl`：如果供应商返回 `b64_json`，后端会拼成可直接展示的 Data URL。
- `imageUrl`：如果供应商返回 URL，会放在这里。
- `mimeType`：根据 `output_format` 得出，例如 `image/png`、`image/jpeg`、`image/webp`。
- `usage`：供应商返回的消耗信息，可能为 `null`。
- `mode`：`generation` 表示没有参考图的文生图；`edit` 表示带参考图的图片编辑。
- `provider`：实际使用的供应商信息。

前端展示时这样读：

```js
const imageSrc = result.imageDataUrl || result.imageUrl;
if (!imageSrc) throw new Error("接口没有返回图片");
previewImage.src = imageSrc;
```

下载时也用同一个 `imageSrc`。如果是远程 `imageUrl`，浏览器可能会直接打开新标签页，这是正常的。

## 错误格式

失败返回通常是：

```json
{
  "message": "生图失败，请稍后再试。"
}
```

常见错误：

- `400`：`prompt` 为空、没有配置可用供应商、参考图格式不支持。
- `502`：供应商返回内容无法解析，或没有返回 `b64_json` / `url`。
- `504`：生图超时。
- `500`：后端内部错误或供应商异常。

调用方必须判断 `response.ok`。不要只看 JSON 里有没有字段。

```js
const payload = await response.json();
if (!response.ok) {
  throw new Error(payload.message || `请求失败：${response.status}`);
}
```

## 后端转发给供应商的格式

接入方通常不需要直接调用供应商，但理解这个有助于排查问题。

没有参考图时，后端发 JSON 到 `/images/generations`：

```json
{
  "model": "gpt-image-2",
  "prompt": "提示词",
  "size": "auto",
  "quality": "medium",
  "n": 1,
  "output_format": "png",
  "background": "auto",
  "moderation": "auto"
}
```

有参考图时，后端发 `FormData` 到 `/images/edits`：

```text
model=gpt-image-2
prompt=提示词
size=auto
quality=medium
n=1
output_format=png
background=auto
moderation=auto
image=<第 1 张参考图文件>
image=<第 2 张参考图文件>
image=<第 3 张参考图文件>
```

这里有一个容易混淆的点：项目自己的接口收参考图字段叫 `reference`，但后端转发给供应商时字段名叫 `image`。接入前端只需要传 `reference`，不要自己传 `image`。

## 最小可用封装

```js
export async function generateImage({
  prompt,
  provider,
  references = [],
  size = "auto",
  quality = "medium",
  outputFormat = "png",
  background = "auto",
  moderation = "auto"
}) {
  const formData = new FormData();
  formData.append("prompt", prompt);
  if (provider) formData.append("provider", provider);
  formData.append("size", size);
  formData.append("quality", quality);
  formData.append("output_format", outputFormat);
  formData.append("background", background);
  formData.append("moderation", moderation);

  for (const file of references) {
    formData.append("reference", file);
  }

  const response = await fetch("/api/generate-image", {
    method: "POST",
    body: formData
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || `生图失败：${response.status}`);
  }

  const imageSrc = payload.imageDataUrl || payload.imageUrl;
  if (!imageSrc) {
    throw new Error("生图接口没有返回图片数据");
  }

  return {
    ...payload,
    imageSrc
  };
}
```

## 接入检查清单

- 使用 `FormData`，不要使用 JSON 请求 `/api/generate-image`。
- `prompt` 必须非空。
- 多张参考图用同一个字段名 `reference` 重复 append。
- 提交顺序必须和提示词里的“图一、图二、图三”一致。
- 只上传 JPG、PNG、WebP 参考图。
- 结果优先使用 `imageDataUrl || imageUrl`。
- 必须检查 `response.ok`，失败时展示 `message`。
- 不要把项目接口的 `reference` 和供应商接口的 `image` 混用。
