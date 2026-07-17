# 微信支付配置说明

本项目会根据用户设备自动选择微信支付产品：微信内网页使用 JSAPI，手机外部浏览器使用 H5，电脑浏览器使用 Native 扫码支付。

## 环境变量

在 `.env` 中填写：

```env
WECHAT_PAY_APP_ID=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_PLATFORM_PUBLIC_KEY=
WECHAT_PAY_NOTIFY_URL=https://your-domain.com/api/payments/wechat/notify
WECHAT_OAUTH_APP_SECRET=
WECHAT_OAUTH_STATE_SECRET=
WECHAT_OAUTH_REDIRECT_URL=https://your-domain.com/api/payments/wechat/oauth-callback
```

其中：

- `WECHAT_PAY_APP_ID` 必须已关联到商户号。
- `WECHAT_PAY_PRIVATE_KEY` 与 `WECHAT_PAY_SERIAL_NO` 对应商户 API 证书。
- `WECHAT_PAY_PLATFORM_PUBLIC_KEY` 用于验签支付回调。
- `WECHAT_PAY_API_V3_KEY` 用于解密回调中的加密资源。
- `WECHAT_OAUTH_REDIRECT_URL` 必须填写项目的 `/api/payments/wechat/oauth-callback`，并在公众号后台登记对应网页授权域名。

## 平台侧开通项

1. 在微信支付商户平台开通 JSAPI、H5、Native 支付。
2. 配置支付通知 URL、H5 支付域名和支付授权目录。
3. 确保正式站点使用可被微信访问的 HTTPS 域名。
4. 在公众号后台配置网页授权域名。

## 支付流程

- 微信内：用户提交订单后，系统仅为该笔订单发起网页授权；拿到 OpenID 后调起 JSAPI。
- 手机外部浏览器：系统创建 H5 支付单并跳转微信返回的支付地址。
- 电脑浏览器：系统创建 Native 支付单并展示二维码；用户以微信扫码支付。

三种场景都以 `/api/payments/wechat/notify` 的签名验证和金额校验结果为准。前端支付完成提示不作为发货或赠点依据。

## 本地模拟支付

本地无需配置微信支付即可联调。将 `.env` 中的 `LOCAL_MOCK_PAYMENT` 设为 `true`，并从 `localhost` 或 `127.0.0.1` 打开站点；订单会直接模拟支付成功。

模拟支付仅允许本机主机名，非本机域名不会生效。部署生产环境时设为 `false` 或删除该变量。
