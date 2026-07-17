# Email accounts and Tencent Cloud SES

Visitors may generate images and add them to the draw-card clip without registering. Creating a physical-magnet order requires an email account. Registration upgrades the current browser guest account in place, preserving its credits, clip, generated images, orders, and payment records.

Configure Tencent Cloud SES in production:

```env
TENCENTCLOUD_SECRET_ID=
TENCENTCLOUD_SECRET_KEY=
TENCENTCLOUD_SES_REGION=ap-guangzhou
TENCENTCLOUD_SES_FROM_EMAIL=verified-sender@example.com
TENCENTCLOUD_SES_TEMPLATE_ID=12345
EMAIL_CODE_SECRET=a-long-random-secret
```

The SES sender domain/address must be verified. The approved template must accept the `code` and `minutes` variables. Install the official Node SDK before deploying:

```bash
npm install tencentcloud-sdk-nodejs
```

For local registration testing without SES, set `EMAIL_CODE_LOG_ONLY=true`. The six-digit code is returned in the API response and written to the server log. Never enable this setting in production.
