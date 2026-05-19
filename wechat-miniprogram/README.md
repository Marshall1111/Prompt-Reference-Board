# 照片风格转绘提示词小程序

这是当前 Web 项目的展示版小程序迁移骨架，适合先上线“浏览风格、搜索、查看提示词、复制提示词”的轻量版本。

## 导入

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择本目录：`wechat-miniprogram`。
4. 把 `project.config.json` 里的 `appid` 改成你自己的小程序 AppID。

## 数据模式

默认会读取 `miniprogram/data/styles.js` 的内置数据，不依赖后端。

如果要改成云数据库：

1. 在微信开发者工具中开通云开发。
2. 修改 `miniprogram/env.js`，填入 `cloudEnvId`。
3. 新建数据库集合 `styles`。
4. 每条记录建议包含：

```json
{
  "id": "anime",
  "tags": ["动漫", "人像", "插画"],
  "image": "cloud://你的环境ID/path/anime-cover.jpg",
  "prompt": "提示词内容",
  "enabled": true,
  "sort": 10
}
```

配置云环境后，小程序会优先读取云数据库；读取失败或集合为空时，会自动回退到内置数据。

## 图片

当前内置数据里的 `image` 先留空，页面会显示风格占位图。上线前建议把示例图上传到微信云存储，然后把云文件 ID 写入 `image` 字段。

已有 Web 项目的图片位置：

- `public/style-previews/anime/cover.jpg`
- `public/style-previews/*/cover.svg`

建议正式小程序优先使用 JPG、PNG 或 WebP 示例图。

## 功能范围

- 风格卡片展示
- 标签/提示词搜索
- 查看完整提示词
- 一键复制提示词
- 云数据库读取预留

这个版本不包含管理后台。提示词维护建议先在云数据库控制台完成，或后续单独做一个带权限的管理端。
