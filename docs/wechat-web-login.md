# 微信网页登录配置

网站在微信内置浏览器中会显示“微信登录 / 注册”。点击后使用公众号网页授权的 `snsapi_userinfo` scope 获取 OpenID、昵称和头像，并创建或登录本站账户。

## 公众号后台

在用于网页授权的**认证服务号**后台，将生产站点的域名添加到“网页授权域名”。只填写域名，不填写 `https://`、路径或端口。

网页授权回调地址使用：

```text
https://你的域名/api/auth/wechat/callback
```

该地址必须属于已配置的网页授权域名，并且外网可通过 HTTPS 访问。

## 服务端环境变量

现有微信支付配置中的下列两项会被复用，且必须属于同一个公众号：

```env
WECHAT_PAY_APP_ID=公众号AppID
WECHAT_OAUTH_APP_SECRET=公众号AppSecret
```

请额外设置：

```env
WECHAT_WEB_OAUTH_REDIRECT_URL=https://你的域名/api/auth/wechat/callback
WECHAT_OAUTH_STATE_SECRET=独立生成的高强度随机字符串
```

修改 `.env` 后重启服务。不要将 AppSecret 或状态密钥提交到版本库、发到聊天记录，或暴露给浏览器。

## 验收

1. 用微信扫描或在微信中打开网站。
2. 打开“登录 / 注册”，点击“微信登录 / 注册”。
3. 同意微信授权后，应返回原页面并显示微信昵称；刷新页面后保持登录。
4. 在非微信浏览器中，仍使用原有邮箱登录方式。
