# print-agent：CP1500 相纸打印代理

把网页上的成品图排成「一张 100×148 相纸最多出 4 个 50×74mm 成品」，按原图比例缩放、不裁剪不变形。
树莓派上由 `agent.py` 常驻运行，从 petpaint 服务端拉任务，排版后交给 CUPS 队列出纸。

## 当前硬件与环境

- 打印机：Canon SELPHY CP1500（USB 直连树莓派，CUPS 队列名 `cp1500`）
- 相纸：100 × 148 mm，300 DPI；Gutenprint 的 Postcard 页面是 105.67 × 158.5 mm，成品区按 100×148 居中
- 打印环境：树莓派（Raspberry Pi OS，Python 3 + Pillow），驱动用 Gutenprint 5.3.5+
- 出纸走 CUPS：`PageSize=Postcard`、`StpBorderless=True`、`print-scaling=none`

```powershell
pip install pillow
```

## 用法

```powershell
# 打印校准验证页（量尺寸用）
python print_agent.py calibrate

# 只生成不打印
python print_agent.py calibrate --save check.jpg

# 正式排版：1~4 张原图，一页最多 4 个 50×74 成品（4 张时正好铺满整张相纸）
python print_agent.py layout a.jpg b.jpg c.jpg d.jpg

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
  "profile": {
    "sheet_width_mm": 105.67,
    "sheet_height_mm": 158.5,
    "piece_width_mm": 50.0,
    "piece_height_mm": 74.0,
    "gap_mm": 0.0,
    "print_x0_mm": 2.835,
    "print_x1_mm": 102.835,
    "print_y0_mm": 5.25,
    "print_y1_mm": 153.25
  },
  "scale_x": 1.0,
  "scale_y": 1.0,
  "offset_x_mm": 0.0,
  "offset_y_mm": 0.0
}
```

`profile` 是页面与成品尺寸：`sheet_*` 是**发给打印机的页面尺寸**（CP1500 要填 Gutenprint 的 Postcard 实际页面 105.67×158.5，不是相纸的 100×148）、`piece_*` 是成品上限（长边 `piece_height_mm`、短边 `piece_width_mm`）、`gap_mm` 成品间距、`print_*` 是相纸在页面里的位置（成品区居中，左右各留 2.835mm、上下各留 5.25mm，打印时被裁掉）。
排版按原图比例缩放，不裁剪不变形：方图 50×50，竖图长边不超过 74、短边不超过 50，横图先转 90°；一页最多 4 张（1 张居中、2 张上下、3–4 张 2×2），4 张时正好铺满 100×148。
`scale_*` / `offset_*` 是**本机实测校准值**；CP1500 实测 1:1，保持 1.0 / 0 即可。

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

当前校准精度：CP1500 实测 1:1（50×74 框实测 50×73.5，标尺误差 ≤1%），`scale_*` / `offset_*` 保持 1.0 / 0。

## 排版规则

- 100×148 相纸按 2×2 刚好放下 4 个 50×74 成品，`gap_mm` 设 0，四张之间不留白。
- 每张图按原比例缩放到 50×74 的格子里：方图 50×50 居中，3:4 竖图 50×66.6，横图先顺时针转 90° 再排。
- 每个格子的边界画灰色裁切线并贯穿整页；4 张时中间的十字线就是裁切线，沿线裁开即得 4 张 50×74。
- 不足 4 张时：1 张居中、2 张上下、3 张时第三张在左下，空位留白。

## IPP 踩坑记录（重要）

- IPP 请求里，`media`、`print-scaling`、`print-quality` 这类**作业模板属性必须放在独立的 `0x02` 属性组**，混进操作属性组（`0x01`）会被判 `0x0400 bad-request`。
- `print-quality` 的类型必须是 enum `0x23`（4 字节），用 integer `0x21` 同样返回 `0x0400`。
- `media-type`（如 `photographic-glossy`）本机直接拒绝 `0x0001`，即使 `Get-Printer-Attributes` 里列出了该值；已不再发送，纸型交给打印机面板设定。
- `job-state` 的返回类型是 enum `0x23`，按 integer 解析会一直读到 0。
- 提交失败时先看 `status-message`，再用 `Get-Printer-Attributes` 的 `printer-state-reasons`（`media-empty-error` 缺纸、`spool-area-full-report` 出纸托盘满）定位。
- Windows 自带的 "Microsoft IPP Class Driver" 取不到这台机器的真实能力（没有 4×6、没有纸型），所以不要走 Windows 打印队列，直接 IPP 直发。

## 已知限制

- 进纸有轻微歪斜（每次 1~2mm），软件无法补偿，靠留白规避；裁切以打印出的辅助线为准，因此不影响成品尺寸。
- 目前一张纸最多出 4 个，且必须人工裁切。
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
