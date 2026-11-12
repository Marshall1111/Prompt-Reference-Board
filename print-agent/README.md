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
  "print_seconds_per_sheet": 50,
  "scale_x": 1.0,
  "scale_y": 1.0,
  "offset_x_mm": 0.0,
  "offset_y_mm": 0.0
}
```

`print_seconds_per_sheet` 是 CUPS 队列清空后机器继续出纸的秒数（热升华打印机特有的延迟），用于避免提前上报「已打印」，按实际出纸时间调整。

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

## 全新设备部署（树莓派 4B / 斐讯 N1）

系统刷好（Raspberry Pi OS 或 Armbian，64 位）并联网后，只需要两步：

```bash
git clone https://github.com/Marshall1111/Prompt-Reference-Board.git
cd Prompt-Reference-Board/print-agent
sudo ./setup.sh \
  --server-url https://www.petpaint.top \
  --device-id dev_xxxxxxxxxxxx \
  --device-token xxxxxxxxxxxxxxxxxxxxxxxx
```

`--device-id` / `--device-token` 在后台「信息维护 - 打印设备」里获取；不传这两个参数时脚本只装环境、不启动服务。

`setup.sh` 会依次完成：

1. 安装 CUPS、Pillow 和编译依赖；
2. 屏蔽 `usblp`、停止并 mask `ipp-usb`，避免它们抢占 CP1500 的 USB 接口；
3. 检查系统里是否已有 CP1500 驱动，没有就编译安装 Gutenprint 5.3.5；
4. 自动识别 USB 打印机地址（带序列号）并创建 CUPS 队列 `cp1500`，默认 `PageSize=Postcard` + 无边距；
5. 生成/合并 `agent.json`（该文件含设备令牌，已被 git 忽略）；
6. 安装并启动 `print-agent.service`。

脚本可重复执行，已完成的步骤会自动跳过。部署完成后验证：

```bash
lpstat -p cp1500            # 队列存在且为空闲
systemctl status print-agent
```

后台设备列表出现心跳即为上线。要重新校准尺寸时执行 `sudo -u pi python3 print_agent.py calibrate`（会真实出纸）。
