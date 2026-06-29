# 风格提示词图库

本地个人使用的风格提示词图库。主页用瀑布流展示示例图，图片保持原始比例；每张图下方展示标签，并提供“复制提示词”和“查看提示词”按钮。

## 使用

```bash
npm install
npm run build
npm start
```

打开 `http://127.0.0.1:3000`。

也可以直接双击 `start.bat`。它会自动检查 Node.js、安装依赖、构建页面、启动服务并打开浏览器。

## 维护位置

- 标签、示例图路径、提示词：`data/styles.json`
- 示例图文件：`public/style-previews/<风格ID>/cover.*`
- 页面维护入口：`http://127.0.0.1:3000/manage`

在维护页可以新增/删除风格、编辑标签、替换示例图、修改并保存提示词。上传后的图片会保存到对应风格目录，标签和提示词会写回 `data/styles.json`。

## AI 生图

首页每张风格卡片提供“AI 生图”按钮。它会使用当前风格提示词调用第三方中转 API 的 `gpt-image-2` 模型，支持上传多张 JPG、PNG 或 WebP 参考图；页面会按选择顺序标记为“图一、图二、图三”，方便在提示词里引用。生成成功后可预览并下载到浏览器默认下载位置，不会自动改动图库数据。

使用前在项目根目录新建 `.env`，参考 `.env.example` 填写：

```bash
IMAGE_API_PROVIDER=kuaipao_grok
IMAGE_API_PROVIDERS=kuaipao_grok,kuaipao,duckcoding

IMAGE_API_KUAIPAO_NAME=快跑
IMAGE_API_KUAIPAO_BASE_URL=https://kuaipao.pro/v1
IMAGE_API_KUAIPAO_KEY=你的快跑密钥
IMAGE_API_KUAIPAO_MODEL=gpt-image-2

IMAGE_API_KUAIPAO_GROK_NAME=Kuaipao Grok Image
IMAGE_API_KUAIPAO_GROK_BASE_URL=https://kuaipao.pro/v1
IMAGE_API_KUAIPAO_GROK_KEY=你的快跑密钥
IMAGE_API_KUAIPAO_GROK_MODEL=grok-image
IMAGE_API_KUAIPAO_GROK_ROUTE=responses

IMAGE_API_DUCKCODING_NAME=DuckCoding
IMAGE_API_DUCKCODING_BASE_URL=https://api.duckcoding.ai/v1
IMAGE_API_DUCKCODING_KEY=你的 DuckCoding 密钥
IMAGE_API_DUCKCODING_MODEL=gpt-image-2
```

未上传参考图时调用 `/images/generations`；上传参考图时会尝试调用 OpenAI 兼容的 `/images/edits`，该端点是否可用取决于中转站实际支持情况。生成尺寸默认传 `auto`，如果需要 2:3、3:2 等比例请写在提示词里。参考图如果超过 4MB 或最长边超过 2048px，页面会先自动压缩成较小的 JPEG 再上传给后端，仍按“图一、图二”的当前编号顺序提交。页面会先提交异步任务，再每 2 秒查询一次状态；结果会保存到本地 `public/generated-images/` 并在弹窗仍打开时自动显示。复杂图片可能耗时数分钟，`KUAIPAO_IMAGE_TIMEOUT_MS` 默认 1800000 毫秒，最大 3600000 毫秒。

如果配置了多个 `IMAGE_API_PROVIDERS`，AI 生图弹窗会显示“接口供应商”下拉框，可在生成前手动切换。

## 同步微信小程序

本地维护页现在会自动同步微信小程序文件：

- 新增、删除、修改标签或提示词后，会自动更新 `wechat-miniprogram/miniprogram/data/styles.js`
- 替换示例图后，会自动压缩一份小图到 `wechat-miniprogram/miniprogram/images-small/<风格ID>.jpg`
- 小程序读取压缩后的小图，避免预览包过大

如果需要手动同步一次，可以在服务启动后请求：

```bash
curl -X POST http://127.0.0.1:3000/api/sync-miniprogram
```

便携使用说明见 `PORTABLE_USAGE.md`。
