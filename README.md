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
