# print-agent：4×6 相纸打印代理

把网页上的成品图排成「一张 4×6 相纸出 2 个 50×75mm 成品」，并通过 IPP 直接发给局域网打印机。
目前是单机版（自己测试用），后续扩展成树莓派上的常驻代理，从 petpaint 服务端拉任务打印。

## 当前硬件与环境

- 打印机：HP Smart Tank 510 series（Wi-Fi 接入家庭网络，IP `192.168.31.100`，IPP 端口 631，路径 `/ipp/print`）
- 相纸：4×6 英寸（101.6 × 152.4 mm），300 DPI → 页面 1200 × 1800 px
- 打印环境：Windows + Python 3，依赖 `Pillow`
- 打印机不支持无边距，实际可打印区约 x 0.63~95.81mm、y 1.85~146.75mm

```powershell
pip install pillow
```

## 用法

```powershell
# 打印校准验证页（量尺寸用）
python print_agent.py calibrate

# 只生成不打印
python print_agent.py calibrate --save check.jpg

# 正式排版：1~2 张原图，一张相纸出 2 个 50×75 成品
python print_agent.py layout a.jpg b.jpg

# 只生成排版文件
python print_agent.py layout a.jpg --save out.jpg
```

成功后输出 `打印完成`（IPPS 任务状态 9）。失败时会打印打印机上报的原因，例如缺纸、出纸托盘已满。

## config.json

```json
{
  "printer_ip": "192.168.31.100",
  "printer_uri_path": "/ipp/print",
  "media": "na_index-4x6_4x6in",
  "scale_x": 0.9368,
  "scale_y": 0.9508,
  "offset_x_mm": 0.63,
  "offset_y_mm": 1.85
}
```

后四个是**本机实测校准值**，换打印机必须重新校准。

## 校准原理与步骤

这台 HP 会无视 IPP 的 `print-scaling=none`，把整页 4×6 缩小塞进可打印区，实测关系是：

```
实际位置(mm) = offset + scale × 设计位置(mm)
```

所以程序在出图前做反向补偿（`apply_compensation`）：按 `1/scale` 放大整页、按 `-offset/scale` 平移，打印机再缩回去就正好 1:1。注意 x/y 缩放并不一致，必须分开标定。

重新校准：

1. 把 `config.json` 的 `scale_x` / `scale_y` 改回 `1.0`，`offset_x_mm` / `offset_y_mm` 改回 `0`；
2. 打一张 `calibrate`，量出标尺/框的真实长度，解出 `scale` 与 `offset`；
3. 填回配置，再打一张验证页，量 90mm 横标尺、140mm 竖标尺、50×75 成品框，误差进 ±0.3mm 即可。

当前校准精度：横 90mm、竖 140mm、成品框 50×75 均已对上。

## 排版规则

- 4×6 纸放不下两个 50×75 竖放（100mm 宽 > 95.2mm 可打印宽），所以**成品旋转 90°**：纸面上每个占 75 宽 × 50 高，两张上下排列，中间 10mm 间距。
- 每张四周各留 2mm 出血（成品框内被裁掉），因此两张图之间的白边是 6mm。
- 四边各画一条灰色辅助线，从成品裁切边**贯穿到相纸边缘**，裁刀沿线走即可；灰线才是 50×75 的裁切线，线外的 2mm 是出血。
- 内容整体居中于可打印区，距纸边 ≥10mm，进纸偏移 1~2mm 也不会切到画面。

## IPP 踩坑记录（重要）

- IPP 请求里，`media`、`print-scaling`、`print-quality` 这类**作业模板属性必须放在独立的 `0x02` 属性组**，混进操作属性组（`0x01`）会被判 `0x0400 bad-request`。
- `print-quality` 的类型必须是 enum `0x23`（4 字节），用 integer `0x21` 同样返回 `0x0400`。
- `media-type`（如 `photographic-glossy`）本机直接拒绝 `0x0001`，即使 `Get-Printer-Attributes` 里列出了该值；已不再发送，纸型交给打印机面板设定。
- `job-state` 的返回类型是 enum `0x23`，按 integer 解析会一直读到 0。
- 提交失败时先看 `status-message`，再用 `Get-Printer-Attributes` 的 `printer-state-reasons`（`media-empty-error` 缺纸、`spool-area-full-report` 出纸托盘满）定位。
- Windows 自带的 "Microsoft IPP Class Driver" 取不到这台机器的真实能力（没有 4×6、没有纸型），所以不要走 Windows 打印队列，直接 IPP 直发。

## 已知限制

- 进纸有轻微歪斜（每次 1~2mm），软件无法补偿，靠留白规避；裁切以打印出的辅助线为准，因此不影响成品尺寸。
- 目前一张纸固定出 2 个，且必须人工裁切。
- 只支持 JPEG/300DPI 页面，未做色彩管理。

## 下一步（树莓派方案）

1. 服务端（petpaint）：新增 `print_jobs` 表 + 接口
   - `POST /api/print/agent/claim`：代理长轮询领取任务（返回 jobId + 图片地址 + 商户打印机标识）
   - `POST /api/print/agent/:jobId/result`：上报成功/失败与原因
   - 表里预留 `printer_id`，先单商户跑通，后续按商户路由不用改表结构
2. 代理端：在树莓派上 `python print_agent.py agent --server ... --token ...` 常驻运行，循环「领取 → 下载 → build_layout → submit_job → 上报」，断网自动重试。
3. 树莓派需要在同一局域网内访问打印机 IP；若打印机 IP 变化，用路由器 DHCP 静态绑定固定为 `192.168.31.100`。
4. 安装：树莓派 `apt install python3-pil`，把本目录拷过去，`config.json` 沿用当前校准值（同一台打印机）。

## 换电脑恢复步骤

1. 装 Python 3 + `pip install pillow`；
2. 拷贝整个 `print-agent/` 目录（含 `config.json`，校准值在里面）；
3. 确认新电脑和打印机同一局域网：`ping 192.168.31.100`，能通即可；
4. `python print_agent.py calibrate` 验证能打出来。
