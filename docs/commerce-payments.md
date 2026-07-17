# 冰箱贴支付上线清单

公开页面支持微信内、手机外部浏览器与电脑浏览器。用户首次访问会获得同浏览器访客账户；点数、卡夹和订单记录保存在浏览器 Cookie 对应的账户中。

## 支付方式

- 微信内浏览器：网页授权取得 OpenID 后使用 JSAPI 支付。
- 手机外部浏览器：使用微信 H5 支付。
- 电脑浏览器：展示微信 Native 扫码支付二维码。

支付回调会验签并校验 AppID、商户号、订单金额与微信交易号。只有回调确认支付成功后，订单才会变为已付款。

## 必填环境变量

```env
WECHAT_PAY_APP_ID=关联商户号的公众号AppID
WECHAT_PAY_MCH_ID=微信支付商户号
WECHAT_PAY_API_V3_KEY=APIv3密钥
WECHAT_PAY_SERIAL_NO=商户API证书序列号
WECHAT_PAY_PRIVATE_KEY=商户API私钥PEM内容
WECHAT_PAY_PLATFORM_PUBLIC_KEY=微信支付平台公钥PEM内容
WECHAT_PAY_NOTIFY_URL=https://你的域名/api/payments/wechat/notify
WECHAT_OAUTH_APP_SECRET=公众号AppSecret
WECHAT_OAUTH_STATE_SECRET=随机高强度字符串
WECHAT_OAUTH_REDIRECT_URL=https://你的域名/api/payments/wechat/oauth-callback
```

`WECHAT_OAUTH_REDIRECT_URL` 必须与公众号后台的网页授权回调地址一致。该回调仅用于微信内 JSAPI 付款时取得 OpenID，不会替换当前访客账户。

## 商户平台配置

- 关联上述 AppID，并开通 JSAPI、H5、Native 支付产品。
- 配置 H5 支付域名、支付授权目录和 HTTPS 站点域名。
- 将支付通知地址配置为 `WECHAT_PAY_NOTIFY_URL`。
- 在公众号后台配置网页授权域名。

## 商品与点数规则

- 每张成功生成图片消耗 1 点；生成失败不扣点。
- 新浏览器访客默认获赠 5 点；邀请码奖励仍可使用。
- 冰箱贴定制入口位于“抽卡”页面的卡夹，订单页只读取该卡夹中的抽卡图片；冰箱贴页面不参与此流程。
- 冰箱贴单价和邮费由后台下单配置决定；当前规则为 1 枚收邮费，2 枚及以上包邮。
- 每支付成功 1 枚实体冰箱贴，赠送 10 点；重复支付通知不会重复赠送。
- 支付任意实体冰箱贴订单后，永久解锁该浏览器账户卡夹中的全部原图下载。

点数不再提供充值或购买入口。清除站点数据或更换浏览器后，访客账户不会自动迁移。

## 本地联调（不调用微信）

在本机 `.env` 中设置 `LOCAL_MOCK_PAYMENT=true`，并通过 `http://localhost` 或 `http://127.0.0.1` 访问。提交订单后系统会直接模拟支付成功，用于验证订单状态、每枚赠 10 点和原图解锁。

该开关会额外校验本机主机名；非本机域名即使误设该变量也不会模拟支付。上线前必须保持 `LOCAL_MOCK_PAYMENT=false` 或移除该变量。
