# 小程序正式上线部署说明

本文档对应当前仓库的最小可用上线方案：

- 目标场景：你自己 / 内部少量人使用
- 运行形态：1 台 Linux 云服务器 + 1 个 HTTPS 域名 + 1 份持久磁盘
- 服务结构：当前 Node/Express 后端继续同时提供
  - 小程序 API `/api/*`
  - 图片静态资源 `/style-previews/*`、`/generated-images/*`、`/job-references/*`
  - Web 管理页 `/manage`

## 1. 上线前要准备的东西

- 一台可公网访问的 Linux 云服务器
- 一个已经备案并能签发 HTTPS 证书的域名
- Node.js 运行环境
- 项目代码和 `.env`
- 可写的持久化目录
- 微信公众平台的小程序管理权限

推荐域名规划：

- `https://api.your-domain.com`
  这一个域名同时给小程序 API、图片资源和 `/manage` 使用

## 2. 当前项目里哪些目录必须持久化

这套项目现在仍然使用本地文件系统存数据，所以以下目录必须放在持久磁盘上：

- `data/`
- `public/style-previews/`
- `public/generated-images/`
- `public/generated-thumbnails/`
- `public/job-references/`
- `public/job-reference-thumbnails/`
- `wechat-miniprogram/miniprogram/images-small/`

其中：

- `data/styles.json`：风格数据
- `data/style-groups.json`：风格组数据
- `data/image-jobs/`：任务记录
- `public/style-previews/`：示例图
- `public/generated-images/`：生成结果图
- `public/generated-thumbnails/`：生成结果缩略图
- `public/job-references/`：任务参考图副本
- `public/job-reference-thumbnails/`：任务参考图缩略图
- `wechat-miniprogram/miniprogram/images-small/`：风格图库小图

这次上线默认单实例运行，不做多机共享文件系统。

## 3. 服务器上的环境变量

服务器根目录准备 `.env`，至少包含：

```bash
IMAGE_API_PROVIDER=kuaipao_grok
IMAGE_API_PROVIDERS=kuaipao_grok,kuaipao,duckcoding

IMAGE_API_KUAIPAO_NAME=Kuaipao
IMAGE_API_KUAIPAO_BASE_URL=https://kuaipao.pro/v1
IMAGE_API_KUAIPAO_KEY=replace_with_real_key
IMAGE_API_KUAIPAO_MODEL=gpt-image-2

IMAGE_API_KUAIPAO_GROK_NAME=Kuaipao Grok Image
IMAGE_API_KUAIPAO_GROK_BASE_URL=https://kuaipao.pro/v1
IMAGE_API_KUAIPAO_GROK_KEY=replace_with_real_key
IMAGE_API_KUAIPAO_GROK_MODEL=grok-image
IMAGE_API_KUAIPAO_GROK_ROUTE=responses

IMAGE_API_DUCKCODING_NAME=DuckCoding
IMAGE_API_DUCKCODING_BASE_URL=https://api.duckcoding.ai/v1
IMAGE_API_DUCKCODING_KEY=replace_with_real_key
IMAGE_API_DUCKCODING_MODEL=gpt-image-2

KUAIPAO_IMAGE_TIMEOUT_MS=1800000
PORT=3000
```

说明：

- 所有第三方 API Key 只放在后端 `.env`
- 小程序端不要放这些密钥
- `PORT` 保持 `3000` 即可，由反向代理对外暴露 443

## 4. 服务器部署步骤

以项目部署到 `/srv/prompt-gallery` 为例：

```bash
cd /srv
git clone <your-repo-url> prompt-gallery
cd prompt-gallery
npm install
npm run build
```

把生产 `.env` 放到项目根目录后，先手动验证：

```bash
npm start
```

如果这是首次部署缩略图版本，建议在服务启动前补一次历史任务缩略图：

```bash
npm install
npm run backfill:thumbnails
```

确认以下接口能通：

- `GET /api/health`
- `GET /api/image-providers`
- `GET /manage`
- 首页样式图
- 一次生成任务
- 任务列表与任务详情
- 批量任务

手动验证通过后，再交给 `systemd` 管理。

## 5. systemd 服务模板

仓库已提供模板：

- `deploy/prompt-gallery.service.example`

使用方式：

1. 复制到 `/etc/systemd/system/prompt-gallery.service`
2. 按实际路径修改 `WorkingDirectory`、`ExecStart`、`User`
3. 启用服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable prompt-gallery
sudo systemctl start prompt-gallery
sudo systemctl status prompt-gallery
```

## 6. Nginx 反向代理与后台保护

仓库已提供模板：

- `deploy/nginx.prompt-gallery.conf.example`

模板做了三件事：

- 443 HTTPS 反代到 `127.0.0.1:3000`
- 放行小程序和 Web 正常访问的公开 API 与静态资源
- 对 `/manage` 和后台写接口加 `Basic Auth`

受保护的入口包括：

- `/manage`
- `POST /api/sync-miniprogram`
- 非 `GET` 的 `/api/styles`
- `/api/styles/*`
- 非 `GET` 的 `/api/style-groups`
- `/api/style-groups/*`

创建 Basic Auth 密码文件示例：

```bash
sudo apt-get install apache2-utils
sudo htpasswd -c /etc/nginx/.prompt-gallery-manage.htpasswd your_admin_name
```

然后把模板中的域名、证书路径、项目路径改成你的实际值，放到：

- `/etc/nginx/conf.d/prompt-gallery.conf`
  或
- `/etc/nginx/sites-available/prompt-gallery`

最后重载 Nginx：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 7. 小程序正式环境配置

### 7.1 修改小程序 API 根地址

把：

- `wechat-miniprogram/miniprogram/env.js`

里的：

```js
imageApiBaseUrl: "http://127.0.0.1:3000"
```

改成正式地址，例如：

```js
imageApiBaseUrl: "https://api.your-domain.com"
```

仓库里额外提供了一个生产配置模板：

- `wechat-miniprogram/miniprogram/env.production.example.js`

可直接参考并覆盖本地 `env.js`。

### 7.2 微信公众平台配置

在小程序后台的“开发管理 -> 开发设置 -> 服务器域名”里，至少配置同一个 HTTPS 域名到：

- `request` 合法域名
- `uploadFile` 合法域名
- `downloadFile` 合法域名

如果你使用了带端口的地址，微信后台填写值必须和小程序真实请求地址完全一致。

这次方案不需要配置 `web-view` 业务域名，因为当前小程序没有内嵌网页。

## 8. 正式上线前回归清单

上线前至少确认：

- 小程序首页能正常加载
- AI 生图可提交
- 参考图上传可用
- 任务列表可查看、删除、刷新
- 任务详情可查看、编辑 Prompt / References / Size、重新生成
- 批量生成页可提交整组任务
- 结果图和参考图都能通过 HTTPS 正常显示
- `/manage` 需要密码才能进入
- 未授权用户不能写风格和风格组接口
- 服务器重启后历史数据仍存在

## 9. 本次不做的长期改造

这次方案不包含：

- 用户身份体系
- 多租户任务隔离
- 对象存储
- 数据库化
- 自动扩容多实例

如果后续准备公开给大量用户，建议下一阶段再做：

- `data/*.json` 迁数据库
- 图片与结果图迁对象存储 / CDN
- 小程序登录、用户归属、任务隔离、额度控制
