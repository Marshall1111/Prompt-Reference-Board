# 冰箱贴订单微信支付配置说明

本文说明当前项目里微信支付相关环境变量分别是什么、有什么作用、去哪里获取，以及上线前需要完成哪些微信侧配置。

## 一、当前项目会用到哪些变量

在项目根目录 `.env` 中需要配置这些字段：

```env
WECHAT_PAY_APP_ID=
WECHAT_PAY_MCH_ID=
WECHAT_PAY_API_V3_KEY=
WECHAT_PAY_SERIAL_NO=
WECHAT_PAY_PRIVATE_KEY=
WECHAT_PAY_PLATFORM_PUBLIC_KEY=
WECHAT_PAY_NOTIFY_URL=
WECHAT_OAUTH_REDIRECT_URL=
WECHAT_OAUTH_APP_SECRET=
```

它们已经在 [`.env.example`](../.env.example) 里预留了空位。

## 二、每个变量是什么意思

### 1. `WECHAT_PAY_APP_ID`

- 含义：发起微信支付时使用的应用 `AppID`
- 本项目用途：
  - JSAPI 支付时作为 `appid`
  - H5 支付请求里也会带上这个值
  - 网页授权换取 `openid` 时也会用到
- 一般来源：
  - 如果你做的是公众号内网页支付，这里通常填公众号的 `AppID`

### 2. `WECHAT_PAY_MCH_ID`

- 含义：微信支付商户号
- 本项目用途：
  - 下单时请求微信支付 API v3 必填
- 获取位置：
  - 微信支付商户平台

### 3. `WECHAT_PAY_API_V3_KEY`

- 含义：API v3 密钥
- 本项目用途：
  - 解密微信支付回调中的加密资源
- 获取/设置位置：
  - 微信支付商户平台中 API 安全相关设置页面
- 注意：
  - 这是你自己在商户平台设置的一串密钥，不是平台自动发给你的文件

### 4. `WECHAT_PAY_SERIAL_NO`

- 含义：你商户 API 证书的序列号
- 本项目用途：
  - 调用微信支付 API v3 时放在签名头里
- 获取位置：
  - 你生成并上传商户 API 证书后，对应证书的序列号

### 5. `WECHAT_PAY_PRIVATE_KEY`

- 含义：商户 API 证书对应的私钥内容
- 本项目用途：
  - 服务端请求微信支付 API 时用于 RSA-SHA256 签名
  - JSAPI 支付参数签名时也会用到
- 获取位置：
  - 你本地生成商户 API 证书时得到的私钥文件内容，通常是 PEM 格式
- 建议：
  - 直接把 PEM 全文放进环境变量，或改成从文件读取

### 6. `WECHAT_PAY_PLATFORM_PUBLIC_KEY`

- 含义：微信支付平台公钥
- 本项目用途：
  - 验签微信支付回调
- 获取位置：
  - 微信支付商户平台中下载或查看微信支付平台证书/平台公钥
- 注意：
  - 这不是你商户自己的公钥，而是微信支付平台的公钥

### 7. `WECHAT_PAY_NOTIFY_URL`

- 含义：微信支付异步回调地址
- 本项目用途：
  - 创建支付订单时告诉微信，支付结果要回调到哪里
- 本项目接口：
  - `/api/payments/wechat/notify`
- 示例：

```env
WECHAT_PAY_NOTIFY_URL=https://your-domain.com/api/payments/wechat/notify
```

### 8. `WECHAT_OAUTH_REDIRECT_URL`

- 含义：公众号网页授权回调地址
- 本项目用途：
  - 微信内浏览器下，先获取用户 `openid`，再走 JSAPI 支付
- 这个地址应该指向前端订单详情页或能继续支付的页面
- 推荐填写：

```env
WECHAT_OAUTH_REDIRECT_URL=https://your-domain.com/fridge/orders/oauth-return
```

- 说明：
  - 当前项目实现里，只要这个地址最终能带着 `code` 回到站点并继续发起支付即可

### 9. `WECHAT_OAUTH_APP_SECRET`

- 含义：公众号的 `AppSecret`
- 本项目用途：
  - 用 `code` 换取 `openid`
- 获取位置：
  - 微信公众平台后台

## 三、这些值分别去哪里拿

你至少需要两个微信侧后台：

### 1. 微信支付商户平台

主要拿这些：

- `WECHAT_PAY_MCH_ID`
- `WECHAT_PAY_API_V3_KEY`
- `WECHAT_PAY_SERIAL_NO`
- `WECHAT_PAY_PRIVATE_KEY`
- `WECHAT_PAY_PLATFORM_PUBLIC_KEY`

通常流程是：

1. 开通微信支付商户号
2. 进入商户平台
3. 设置 API v3 密钥
4. 生成并上传商户 API 证书
5. 记录证书序列号
6. 下载或查看微信支付平台公钥

### 2. 微信公众平台

主要拿这些：

- `WECHAT_PAY_APP_ID`
- `WECHAT_OAUTH_APP_SECRET`

通常流程是：

1. 有一个可用公众号
2. 进入公众号后台
3. 找到开发设置
4. 记录 `AppID` 和 `AppSecret`
5. 配置网页授权域名

## 四、为什么这个项目还需要公众号

因为你当前要求支持：

- 微信内浏览器支付：`JSAPI`
- 微信外手机浏览器支付：`H5 支付`

其中微信内 `JSAPI` 支付要先拿到用户 `openid`。  
网页里拿 `openid` 的常见路径就是公众号网页授权，所以这个项目除了商户号，还需要可用公众号。

如果没有公众号能力：

- H5 支付仍然可以在微信外浏览器使用
- 但微信内网页无法完整走 JSAPI 支付

## 五、上线前微信侧还要配什么

除了填环境变量，还要做微信后台配置。

### 1. 支付通知地址

- 你的 `WECHAT_PAY_NOTIFY_URL` 必须是公网 HTTPS 地址
- 微信支付能从外网访问到它

### 2. 网页授权域名

- 在公众号后台配置网页授权域名
- 否则拿不到 `openid`

### 3. 支付授权目录/业务域名

- 具体名称可能随后台界面变化
- 你需要把下单页面所在域名和路径加入允许范围

### 4. HTTPS 证书

- 你的站点必须是 HTTPS
- 微信支付和公众号授权都强依赖正式域名和 HTTPS

## 六、当前项目中每个变量实际对应什么流程

### 微信内浏览器支付

1. 用户点“提交订单并支付”
2. 服务端发现是微信内浏览器，准备走 `JSAPI`
3. 如果没有 `openid`：
   - 跳转公众号网页授权
   - 用 `WECHAT_PAY_APP_ID`
   - 回调后用 `WECHAT_OAUTH_APP_SECRET` 换 `openid`
4. 服务端调用微信支付 JSAPI 下单接口：
   - 用 `WECHAT_PAY_MCH_ID`
   - 用 `WECHAT_PAY_PRIVATE_KEY`
   - 带 `WECHAT_PAY_SERIAL_NO`
5. 前端拉起微信支付控件
6. 微信支付结果异步回调到：
   - `WECHAT_PAY_NOTIFY_URL`
7. 服务端用：
   - `WECHAT_PAY_PLATFORM_PUBLIC_KEY`
   - `WECHAT_PAY_API_V3_KEY`
   验签并解密回调

### 微信外手机浏览器支付

1. 用户点“提交订单并支付”
2. 服务端调用微信 H5 支付下单接口
3. 前端跳转到微信返回的 `h5_url`
4. 支付完成后再回到订单页
5. 异步结果仍通过 `WECHAT_PAY_NOTIFY_URL` 回来

## 七、推荐的 `.env` 填写样例

下面是示意，不是真实值：

```env
WECHAT_PAY_APP_ID=wx1234567890abcdef
WECHAT_PAY_MCH_ID=1900001234
WECHAT_PAY_API_V3_KEY=your_api_v3_key_here
WECHAT_PAY_SERIAL_NO=4A1B2C3D4E5F678901234567890ABCDE12345678
WECHAT_PAY_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----
WECHAT_PAY_PLATFORM_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----
WECHAT_PAY_NOTIFY_URL=https://your-domain.com/api/payments/wechat/notify
WECHAT_OAUTH_REDIRECT_URL=https://your-domain.com/fridge/orders/your-oauth-return
WECHAT_OAUTH_APP_SECRET=your_official_account_app_secret
```

如果你不想把多行 PEM 直接写进 `.env`，后续也可以把私钥、公钥改成读本地文件。

## 八、你现在缺少这些配置时，系统为什么会报错

当前代码会在发起支付前主动检查这些变量是否存在。

例如：

- 缺少 `WECHAT_PAY_APP_ID`
- 缺少 `WECHAT_PAY_MCH_ID`
- 缺少 `WECHAT_PAY_API_V3_KEY`
- 缺少 `WECHAT_PAY_SERIAL_NO`
- 缺少 `WECHAT_PAY_PRIVATE_KEY`
- 缺少 `WECHAT_PAY_NOTIFY_URL`

就会直接提示“微信支付配置缺失”，而不会假装支付成功。

这是故意这样设计的，方便你在正式接入前明确知道还缺哪一步。

## 九、建议的落地顺序

推荐按这个顺序准备：

1. 先准备正式域名和 HTTPS
2. 开通微信支付商户号
3. 准备公众号，并拿到 `AppID` / `AppSecret`
4. 在商户平台设置 API v3 密钥
5. 生成商户 API 证书，拿到私钥和序列号
6. 获取微信支付平台公钥
7. 配好支付通知地址
8. 配好公众号网页授权域名
9. 把所有变量填进 `.env`
10. 重启服务后联调

## 十、当前实现里的一个现实提醒

虽然现在代码里已经接上了微信支付下单、JSAPI、H5、回调和订单状态更新，但如果你还没有：

- 正式商户号
- 正式公众号
- 正式 HTTPS 域名
- 微信后台白名单配置

那么支付流程仍然不能真正跑通。

这不是代码问题，而是微信侧接入前置条件决定的。
