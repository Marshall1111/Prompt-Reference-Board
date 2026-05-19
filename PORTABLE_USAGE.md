# 便携使用说明

## 换到另一台电脑

1. 把整个项目文件夹复制过去。
2. 双击 `start.bat`。
3. 脚本会自动检查 Node.js。
4. 如果电脑支持 `winget`，脚本会自动安装 Node.js LTS。
5. 脚本会自动安装依赖、构建页面、启动服务并打开浏览器。

## 数据在哪里

- 标签和提示词：`data/styles.json`
- 示例图片：`public/style-previews`
- 管理页面：`http://127.0.0.1:3000/manage`

复制到另一台电脑时，只要整个文件夹一起复制，提示词和图片都会保留。

## 关闭工具

关闭 `start.bat` 打开的命令行窗口，或在窗口里按 `Ctrl+C`。

如果新电脑没有 `winget`，脚本会提示你手动安装 Node.js。Windows 10/11 通常自带 `winget`。
