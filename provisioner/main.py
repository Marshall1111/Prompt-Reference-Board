"""Petpaint N1 现场配置工具（Windows / Python + tkinter）。"""

from __future__ import annotations

import csv
import glob
import json
import os
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText

from core import Box, BoxError, local_ipv4, scan_ssh, subnet_prefix

APP_TITLE = "小画家盒子配置工具"
DEFAULT_SERVER = "https://www.petpaint.top"
DEFAULT_QUEUE = "cp1500"
NAME_CACHE = os.path.join(
    os.environ.get("APPDATA") or os.path.expanduser("~"), "PetpaintProvisioner", "names.json"
)


def load_name_cache() -> dict[str, str]:
    """加载「IP → 主机名」缓存：反查不到名字的盒子，登录过一次后也能在列表里看到名称。"""
    try:
        with open(NAME_CACHE, encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def save_name_cache(cache: dict[str, str]) -> None:
    try:
        os.makedirs(os.path.dirname(NAME_CACHE), exist_ok=True)
        with open(NAME_CACHE, "w", encoding="utf-8") as fh:
            json.dump(cache, fh, ensure_ascii=False, indent=2)
    except OSError:
        pass


def app_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def find_offline_package() -> str:
    roots = [
        os.path.join(app_dir(), "offline"),
        os.path.join(os.path.dirname(app_dir()), "print-agent", "offline"),
    ]
    for root in roots:
        matches = sorted(glob.glob(os.path.join(root, "petpaint-offline-*.tgz")))
        if matches:
            return matches[-1]
    return ""


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("960x720")
        self.minsize(880, 640)

        self.box: Box | None = None
        self.scan_stop = threading.Event()
        self.worker: threading.Thread | None = None
        self.scanned: dict[str, dict] = {}
        self.devices: dict[str, dict] = {}
        self.wifi_rows: list[dict] = []
        self.name_cache: dict[str, str] = load_name_cache()

        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=10, pady=10)

        self.tab_device = ttk.Frame(self.notebook)
        self.tab_wifi = ttk.Frame(self.notebook)
        self.tab_run = ttk.Frame(self.notebook)
        self.notebook.add(self.tab_device, text=" 1. 连接设备 ")
        self.notebook.add(self.tab_wifi, text=" 2. 配置 WiFi ")
        self.notebook.add(self.tab_run, text=" 3. 选择设备并执行 ")

        self._build_device_tab()
        self._build_wifi_tab()
        self._build_run_tab()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ================================================================ 设备页
    def _build_device_tab(self):
        frame = self.tab_device

        top = ttk.Frame(frame)
        top.pack(fill="x", padx=12, pady=(12, 6))
        ttk.Label(top, text="本机网段：").pack(side="left")
        self.local_ip_var = tk.StringVar(value=local_ipv4() or "未获取到")
        ttk.Label(top, textvariable=self.local_ip_var, foreground="#0a6").pack(side="left")
        self.scan_btn = ttk.Button(top, text="扫描设备", command=self.on_scan)
        self.scan_btn.pack(side="left", padx=12)
        self.stop_btn = ttk.Button(top, text="停止", command=self.on_stop_scan, state="disabled")
        self.stop_btn.pack(side="left")

        body = ttk.Frame(frame)
        body.pack(fill="both", expand=True, padx=12, pady=6)

        left = ttk.LabelFrame(body, text="扫描结果：IP / 名称 / SSH 版本（双击选择）")
        left.pack(side="left", fill="both", expand=True)
        self.device_list = tk.Listbox(left, activestyle="dotbox")
        self.device_list.pack(fill="both", expand=True, padx=6, pady=6)
        self.device_list.bind("<Double-Button-1>", self.on_pick_device)

        right = ttk.LabelFrame(body, text="登录盒子")
        right.pack(side="left", fill="y", padx=(12, 0))
        form = ttk.Frame(right)
        form.pack(fill="x", padx=10, pady=10)

        ttk.Label(form, text="IP 地址").grid(row=0, column=0, sticky="w", pady=4)
        self.ip_var = tk.StringVar()
        ttk.Entry(form, textvariable=self.ip_var, width=24).grid(row=0, column=1, pady=4)

        ttk.Label(form, text="用户名").grid(row=1, column=0, sticky="w", pady=4)
        self.user_var = tk.StringVar(value="root")
        ttk.Entry(form, textvariable=self.user_var, width=24).grid(row=1, column=1, pady=4)

        ttk.Label(form, text="密码").grid(row=2, column=0, sticky="w", pady=4)
        self.password_var = tk.StringVar()
        self.password_entry = ttk.Entry(form, textvariable=self.password_var, show="*", width=24)
        self.password_entry.grid(row=2, column=1, pady=4)

        ttk.Button(form, text="连接", command=self.on_connect).grid(row=3, column=0, columnspan=2, pady=10, sticky="ew")

        self.device_info = tk.Text(right, height=8, width=34, state="disabled", relief="flat", background="#f6f6f6")
        self.device_info.pack(fill="x", padx=10, pady=(0, 10))

        ttk.Label(
            frame,
            text="提示：扫描会遍历本机所在 /24 网段的所有 IP（约 5～10 秒）。也可以直接填 IP 后点连接。",
            foreground="#666",
        ).pack(fill="x", padx=12, pady=(0, 10))

    def _set_device_info(self, text: str):
        self.device_info.configure(state="normal")
        self.device_info.delete("1.0", "end")
        self.device_info.insert("1.0", text)
        self.device_info.configure(state="disabled")

    def on_scan(self):
        ip = local_ipv4()
        prefix = subnet_prefix(ip)
        if not prefix:
            messagebox.showerror(APP_TITLE, "没有获取到本机 IP，请检查网络连接")
            return
        self.local_ip_var.set(ip)
        self.device_list.delete(0, "end")
        self.scan_btn.configure(state="disabled")
        self.stop_btn.configure(state="normal")
        self.scan_stop.clear()

        def worker():
            def found(host, banner, name):
                self.after(0, lambda: self._add_device(host, banner, name))

            try:
                scan_ssh(prefix, on_found=found, stop_event=self.scan_stop)
            finally:
                self.after(0, self._scan_finished)

        threading.Thread(target=worker, daemon=True).start()

    def _add_device(self, host: str, banner: str, name: str):
        name = name or self.name_cache.get(host, "")
        if name:
            self.name_cache[host] = name
        self.device_list.insert("end", self._device_line(host, name, banner))
        self.scanned[host] = {"banner": banner, "name": name}

    @staticmethod
    def _device_line(host: str, name: str, banner: str) -> str:
        return f"{host:<15} {name or '—':<14} {banner[:40]}"

    def _scan_finished(self):
        if self.name_cache:
            save_name_cache(self.name_cache)
        self.scan_btn.configure(state="normal")
        self.stop_btn.configure(state="disabled")
        if self.device_list.size() == 0:
            messagebox.showinfo(APP_TITLE, "没有扫描到开放 22 端口的设备。\n请确认盒子和电脑在同一个路由器下。")

    def on_stop_scan(self):
        self.scan_stop.set()

    def on_pick_device(self, _event=None):
        selection = self.device_list.curselection()
        if not selection:
            return
        text = self.device_list.get(selection[0])
        self.ip_var.set(text.split()[0])
        self.password_entry.focus_set()

    def on_connect(self):
        host = self.ip_var.get().strip()
        user = self.user_var.get().strip()
        password = self.password_var.get()
        if not host or not user or not password:
            messagebox.showwarning(APP_TITLE, "请填写 IP、用户名和密码")
            return

        self._set_device_info("正在连接…")
        box = Box(host, user, password)

        def worker():
            try:
                box.connect()
                info = box.system_info()
                printer = box.printer_present()
            except Exception as exc:
                self.after(0, lambda: self._connect_failed(str(exc)))
                return
            self.after(0, lambda: self._connect_ok(box, info, printer))

        threading.Thread(target=worker, daemon=True).start()

    def _connect_failed(self, error: str):
        self._set_device_info("连接失败：\n" + error)
        messagebox.showerror(APP_TITLE, "连接失败：" + error)

    def _connect_ok(self, box: Box, info: dict, printer: bool):
        if self.box is not None:
            self.box.close()
        self.box = box
        lines = [
            f"主机名：{info['hostname']}",
            f"系统：{info['os']}",
            f"架构：{info['arch']}",
            f"根分区：{info['rootfs']}",
            f"打印机：{'已识别 CP1500' if printer else '未发现（第三步可勾选「跳过打印机」）'}",
        ]
        self._set_device_info("\n".join(lines))
        self._remember_name(box.host, info["hostname"])
        self._load_wifi_async()
        # 没接打印机不算错误：只在这行信息里提示，不弹窗打断第一步连接。
        if info["arch"] and info["arch"] != "arm64":
            messagebox.showwarning(APP_TITLE, f"盒子架构是 {info['arch']}，离线包只支持 arm64")

    def _remember_name(self, host: str, name: str):
        """登录后拿到真实主机名，回填到扫描列表并缓存，下次扫描直接显示。"""
        if not name:
            return
        self.name_cache[host] = name
        save_name_cache(self.name_cache)
        banner = self.scanned.get(host, {}).get("banner", "")
        self.scanned.setdefault(host, {})["name"] = name
        for index in range(self.device_list.size()):
            if self.device_list.get(index).split()[0] == host:
                self.device_list.delete(index)
                self.device_list.insert(index, self._device_line(host, name, banner))
                break

    # ================================================================ WiFi 页
    def _build_wifi_tab(self):
        frame = self.tab_wifi
        ttk.Label(
            frame,
            text="连接成功后会自动读取盒子上的 WiFi 配置。修改会立即写入盒子；优先级数字越大越优先（店铺 300、家里 200、热点 100）。",
            foreground="#444",
        ).pack(fill="x", padx=12, pady=(12, 6))

        columns = ("conn", "ssid", "priority", "hidden", "active")
        self.wifi_tree = ttk.Treeview(frame, columns=columns, show="headings", height=9, selectmode="browse")
        for key, title, width in (
            ("conn", "连接名", 190),
            ("ssid", "WiFi 名称", 200),
            ("priority", "优先级", 80),
            ("hidden", "隐藏 SSID", 80),
            ("active", "状态", 90),
        ):
            self.wifi_tree.heading(key, text=title)
            self.wifi_tree.column(key, width=width, anchor="w")
        self.wifi_tree.pack(fill="both", expand=True, padx=12, pady=6)
        self.wifi_tree.bind("<<TreeviewSelect>>", self.on_pick_wifi)

        form = ttk.LabelFrame(frame, text="新增 / 修改（选中一行会自动填入）")
        form.pack(fill="x", padx=12, pady=6)
        self.wifi_conn = tk.StringVar()
        self.wifi_ssid = tk.StringVar()
        self.wifi_psk = tk.StringVar()
        self.wifi_priority = tk.StringVar(value="300")
        self.wifi_hidden = tk.BooleanVar(value=False)

        ttk.Label(form, text="连接名").grid(row=0, column=0, padx=6, pady=6, sticky="w")
        ttk.Entry(form, textvariable=self.wifi_conn, width=20, state="readonly").grid(row=0, column=1, pady=6)
        ttk.Label(form, text="WiFi 名称").grid(row=0, column=2, padx=6, pady=6, sticky="w")
        ttk.Entry(form, textvariable=self.wifi_ssid, width=22).grid(row=0, column=3, pady=6)
        ttk.Label(form, text="密码").grid(row=0, column=4, padx=6, pady=6, sticky="w")
        ttk.Entry(form, textvariable=self.wifi_psk, width=20).grid(row=0, column=5, pady=6)
        ttk.Label(form, text="优先级").grid(row=0, column=6, padx=6, pady=6, sticky="w")
        ttk.Spinbox(form, from_=1, to=999, textvariable=self.wifi_priority, width=6).grid(row=0, column=7, pady=6)
        ttk.Checkbutton(form, text="隐藏 SSID", variable=self.wifi_hidden).grid(row=0, column=8, padx=6)

        actions = ttk.Frame(frame)
        actions.pack(fill="x", padx=12, pady=(0, 6))
        self.wifi_buttons = [
            ttk.Button(actions, text="新增", command=self.on_add_wifi),
            ttk.Button(actions, text="保存修改", command=self.on_save_wifi),
            ttk.Button(actions, text="删除选中", command=self.on_delete_wifi),
            ttk.Button(actions, text="重新读取", command=self.on_reload_wifi),
        ]
        for button in self.wifi_buttons:
            button.pack(side="left", padx=(0, 8))
        self.wifi_status = tk.StringVar(value="尚未连接设备")
        ttk.Label(frame, textvariable=self.wifi_status, foreground="#555").pack(fill="x", padx=14, pady=(0, 4))

        ttk.Label(
            frame,
            text="注意：现场配置时请用网线连接盒子。切换 WiFi 会导致 SSH 短暂断开，网线可以保证配置过程不中断。",
            foreground="#a00",
        ).pack(fill="x", padx=12, pady=(0, 12))

    def _load_wifi_async(self):
        if self.box is None:
            return
        self.wifi_status.set("正在读取盒子上的 WiFi…")
        box = self.box

        def worker():
            try:
                rows = box.list_wifi()
            except Exception as exc:
                message = str(exc)
                self.after(0, lambda: self.wifi_status.set("读取失败：" + message))
                return
            self.after(0, lambda: self._apply_wifi_rows(rows))

        threading.Thread(target=worker, daemon=True).start()

    def _apply_wifi_rows(self, rows: list):
        self.wifi_rows = rows
        self._refresh_wifi_tree()
        active = [row for row in rows if row.get("active")]
        summary = f"已读取 {len(rows)} 条"
        if active:
            summary += f"，当前连接：{active[0]['ssid']}"
        self.wifi_status.set(summary)

    def _refresh_wifi_tree(self):
        for item in self.wifi_tree.get_children():
            self.wifi_tree.delete(item)
        for row in sorted(self.wifi_rows, key=lambda r: -int(r["priority"])):
            self.wifi_tree.insert(
                "", "end", iid=row["conn"],
                values=(
                    row["conn"],
                    row["ssid"],
                    row["priority"],
                    "是" if row["hidden"] else "否",
                    "已连接" if row.get("active") else "备用",
                ),
            )

    def on_pick_wifi(self, _event=None):
        selection = self.wifi_tree.selection()
        if not selection:
            return
        row = self._wifi_row(selection[0])
        if row is None:
            return
        self.wifi_conn.set(row["conn"])
        self.wifi_ssid.set(row["ssid"])
        self.wifi_psk.set(row.get("password", ""))
        self.wifi_priority.set(str(row["priority"]))
        self.wifi_hidden.set(bool(row["hidden"]))

    def _wifi_row(self, conn: str):
        for row in self.wifi_rows:
            if row["conn"] == conn:
                return row
        return None

    def _run_wifi_action(self, description: str, action):
        if self.box is None:
            messagebox.showwarning(APP_TITLE, "请先在第一步连接盒子")
            self.notebook.select(self.tab_device)
            return
        for button in self.wifi_buttons:
            button.configure(state="disabled")
        self.wifi_status.set(description + "…")
        box = self.box

        def worker():
            try:
                action(box)
            except Exception as exc:
                message = str(exc)
                self.after(0, lambda: self._wifi_failed(message))
                return
            self.after(0, self._wifi_done)

        threading.Thread(target=worker, daemon=True).start()

    def _wifi_failed(self, error: str):
        for button in self.wifi_buttons:
            button.configure(state="normal")
        self.wifi_status.set("失败：" + error)
        messagebox.showerror(APP_TITLE, error)

    def _wifi_done(self):
        for button in self.wifi_buttons:
            button.configure(state="normal")
        self._load_wifi_async()

    def _wifi_form_values(self):
        ssid = self.wifi_ssid.get().strip()
        if not ssid:
            messagebox.showwarning(APP_TITLE, "请填写 WiFi 名称")
            return None
        try:
            priority = int(self.wifi_priority.get())
        except ValueError:
            messagebox.showwarning(APP_TITLE, "优先级必须是数字")
            return None
        return ssid, self.wifi_psk.get(), priority, bool(self.wifi_hidden.get())

    def on_add_wifi(self):
        values = self._wifi_form_values()
        if values is None:
            return
        ssid, password, priority, hidden = values
        # 新增始终用新连接名（petpaint-<SSID>），避免误改当前选中的那条。
        self._run_wifi_action(
            f"新增 WiFi {ssid}",
            lambda box: box.save_wifi("", ssid, password, priority, hidden),
        )

    def on_save_wifi(self):
        conn = self.wifi_conn.get().strip()
        if not conn:
            messagebox.showwarning(APP_TITLE, "请先在上面的列表里选中要修改的一条 WiFi")
            return
        values = self._wifi_form_values()
        if values is None:
            return
        ssid, password, priority, hidden = values
        self._run_wifi_action(
            f"保存 WiFi {ssid}",
            lambda box: box.save_wifi(conn, ssid, password, priority, hidden),
        )

    def on_delete_wifi(self):
        conn = self.wifi_conn.get().strip()
        if not conn:
            messagebox.showwarning(APP_TITLE, "请先在列表里选中要删除的一条 WiFi")
            return
        if not messagebox.askyesno(APP_TITLE, f"删除连接「{conn}」？\n删除后盒子不会再自动连接这个 WiFi。"):
            return
        self._run_wifi_action(f"删除 WiFi {conn}", lambda box: box.delete_wifi(conn))

    def on_reload_wifi(self):
        self._load_wifi_async()

    # ================================================================ 执行页
    def _build_run_tab(self):
        frame = self.tab_run

        file_row = ttk.Frame(frame)
        file_row.pack(fill="x", padx=12, pady=(12, 6))
        ttk.Label(file_row, text="离线包").pack(side="left")
        self.offline_var = tk.StringVar(value=find_offline_package())
        ttk.Entry(file_row, textvariable=self.offline_var).pack(side="left", fill="x", expand=True, padx=8)
        ttk.Button(file_row, text="浏览", command=self.on_pick_offline).pack(side="left")

        csv_row = ttk.Frame(frame)
        csv_row.pack(fill="x", padx=12, pady=6)
        ttk.Label(csv_row, text="设备 CSV").pack(side="left")
        self.csv_var = tk.StringVar()
        ttk.Entry(csv_row, textvariable=self.csv_var).pack(side="left", fill="x", expand=True, padx=8)
        ttk.Button(csv_row, text="浏览", command=self.on_pick_csv).pack(side="left")

        pick_row = ttk.Frame(frame)
        pick_row.pack(fill="x", padx=12, pady=6)
        ttk.Label(pick_row, text="设备 ID").pack(side="left")
        self.device_id_var = tk.StringVar()
        self.device_combo = ttk.Combobox(pick_row, textvariable=self.device_id_var, width=28, state="readonly")
        self.device_combo.pack(side="left", padx=8)
        self.device_combo.bind("<<ComboboxSelected>>", self.on_pick_device_id)
        self.token_label = ttk.Label(pick_row, text="token：未选择", foreground="#666")
        self.token_label.pack(side="left", padx=12)

        cfg_row = ttk.Frame(frame)
        cfg_row.pack(fill="x", padx=12, pady=6)
        ttk.Label(cfg_row, text="服务器").pack(side="left")
        self.server_var = tk.StringVar(value=DEFAULT_SERVER)
        ttk.Entry(cfg_row, textvariable=self.server_var, width=34).pack(side="left", padx=8)
        ttk.Label(cfg_row, text="队列名").pack(side="left")
        self.queue_var = tk.StringVar(value=DEFAULT_QUEUE)
        ttk.Entry(cfg_row, textvariable=self.queue_var, width=12).pack(side="left", padx=8)
        self.skip_printer_var = tk.BooleanVar(value=False)
        ttk.Checkbutton(cfg_row, text="跳过打印机（未接 CP1500）", variable=self.skip_printer_var).pack(side="left", padx=8)

        action_row = ttk.Frame(frame)
        action_row.pack(fill="x", padx=12, pady=(6, 4))
        self.start_btn = ttk.Button(action_row, text="开始配置", command=self.on_start)
        self.start_btn.pack(side="left")
        self.reboot_btn = ttk.Button(action_row, text="重启盒子", command=self.on_reboot, state="disabled")
        self.reboot_btn.pack(side="left", padx=8)
        self.print_btn = ttk.Button(action_row, text="测试打印", command=self.on_test_print, state="disabled")
        self.print_btn.pack(side="left")
        self.progress = ttk.Progressbar(action_row, mode="determinate", maximum=100, length=260)
        self.progress.pack(side="right")

        self.log_view = ScrolledText(frame, height=22, state="disabled")
        self.log_view.pack(fill="both", expand=True, padx=12, pady=(4, 12))

        self._bind_mousewheel(self.log_view)

    @staticmethod
    def _bind_mousewheel(widget):
        widget.bind("<MouseWheel>", lambda event: widget.yview_scroll(int(-event.delta / 120), "units"))

    def _log(self, text: str):
        self.log_view.configure(state="normal")
        self.log_view.insert("end", text)
        self.log_view.see("end")
        self.log_view.configure(state="disabled")

    def on_pick_offline(self):
        path = filedialog.askopenfilename(title="选择离线包", filetypes=[("离线包", "*.tgz"), ("所有文件", "*.*")])
        if path:
            self.offline_var.set(path)

    def on_pick_csv(self):
        path = filedialog.askopenfilename(title="选择设备 CSV", filetypes=[("CSV", "*.csv"), ("所有文件", "*.*")])
        if not path:
            return
        self.csv_var.set(path)
        try:
            with open(path, encoding="utf-8-sig", newline="") as fh:
                rows = list(csv.DictReader(fh))
        except OSError as exc:
            messagebox.showerror(APP_TITLE, f"读取 CSV 失败：{exc}")
            return
        self.devices.clear()
        ids = []
        for row in rows:
            device_id = (row.get("deviceId") or "").strip()
            if not device_id:
                continue
            self.devices[device_id] = row
            label = (row.get("label") or "").strip()
            ids.append(f"{device_id}  {label}".strip())
        self.device_combo["values"] = ids
        self._log(f"已载入 {len(ids)} 台设备：{os.path.basename(path)}\n")

    def on_pick_device_id(self, _event=None):
        text = self.device_id_var.get()
        device_id = text.split()[0] if text else ""
        row = self.devices.get(device_id, {})
        token = row.get("token", "")
        self.token_label.configure(
            text=f"token：{token[:8]}…{token[-8:]}" if token else "token：缺失",
            foreground="#060" if token else "#a00",
        )

    def _selected_device(self):
        text = self.device_id_var.get()
        device_id = text.split()[0] if text else ""
        row = self.devices.get(device_id)
        if not row:
            return None, None
        return device_id, (row.get("token") or "").strip()

    def on_start(self):
        if self.box is None:
            messagebox.showwarning(APP_TITLE, "请先在第一步连接盒子")
            self.notebook.select(self.tab_device)
            return
        offline = self.offline_var.get().strip()
        if not offline or not os.path.exists(offline):
            messagebox.showwarning(APP_TITLE, "找不到离线包，请检查路径")
            return
        device_id, token = self._selected_device()
        if not device_id or not token:
            messagebox.showwarning(APP_TITLE, "请选择 CSV 中的设备 ID（或 CSV 里缺少 token）")
            return
        wifi_rows = [row for row in self.wifi_rows if row["ssid"].strip()]
        if not wifi_rows:
            messagebox.showwarning(APP_TITLE, "请至少添加一条 WiFi")
            self.notebook.select(self.tab_wifi)
            return
        if not messagebox.askyesno(
            APP_TITLE,
            "即将开始配置，过程中不要拔电源、不要拔打印机 USB。\n\n确定继续？",
        ):
            return

        self.start_btn.configure(state="disabled")
        self.reboot_btn.configure(state="disabled")
        self.print_btn.configure(state="disabled")
        self.progress["value"] = 0
        self._log("\n========== 开始配置 ==========\n")

        box = self.box
        server = self.server_var.get().strip()
        queue = self.queue_var.get().strip() or DEFAULT_QUEUE
        skip_printer = bool(self.skip_printer_var.get())

        def upload_progress(done, total):
            percent = done * 100 / total if total else 0
            self.after(0, lambda: self.progress.configure(value=percent * 0.4))

        def worker():
            try:
                self.after(0, lambda: self._log("上传离线包…\n"))
                box.start_provision(
                    offline, wifi_rows, server, device_id, token,
                    queue=queue, skip_printer=skip_printer, progress=upload_progress,
                )
                self.after(0, lambda: self._log("离线包已上传，开始执行 provision.sh…\n"))
                self.after(0, lambda: self.progress.configure(value=45))

                def on_chunk(chunk):
                    self.after(0, lambda: self._log(chunk))
                    self.after(0, lambda: self.progress.configure(value=90))

                code = box.wait_log(on_chunk=on_chunk)
                self.after(0, lambda: self._finish(code))
            except Exception as exc:
                message = str(exc)
                self.after(0, lambda: self._finish(1, message))

        self.worker = threading.Thread(target=worker, daemon=True)
        self.worker.start()

    def _finish(self, code: int, error: str = ""):
        self.start_btn.configure(state="normal")
        self.progress.configure(value=100)
        if code == 0:
            self._log("\n========== 配置成功 ==========\n")
            self.reboot_btn.configure(state="normal")
            self.print_btn.configure(state="normal")
            messagebox.showinfo(APP_TITLE, "配置完成。\n\n下一步：拔掉网线、重启盒子，然后到后台确认设备在线。")
        else:
            if error:
                self._log(f"\n连接/执行异常：{error}\n")
                self._log("如果日志显示 WiFi 切换后 SSH 断开，请重新扫描并连接盒子，日志仍在 /tmp/petpaint-provision.log\n")
            self._log(f"\n========== 配置失败（退出码 {code}） ==========\n")
            messagebox.showerror(APP_TITLE, "配置失败，请查看日志最后 20 行。")

    def on_reboot(self):
        if self.box is None:
            return
        if not messagebox.askyesno(APP_TITLE, "确定重启盒子？重启后需要等 1～2 分钟。"):
            return
        self.box.reboot()
        self._log("\n已下发重启命令，等待盒子重新上线…\n")

    def on_test_print(self):
        if self.box is None:
            return
        queue = self.queue_var.get().strip() or DEFAULT_QUEUE
        if not messagebox.askyesno(APP_TITLE, f"将通过 {queue} 打印一张测试页，会消耗 1 张相纸。继续？"):
            return

        def worker():
            try:
                output = self.box.test_print(queue)
                self.after(0, lambda: self._log(f"\n测试打印已提交：{output}\n"))
            except Exception as exc:
                message = str(exc)
                self.after(0, lambda: messagebox.showerror(APP_TITLE, f"测试打印失败：{message}"))

        threading.Thread(target=worker, daemon=True).start()

    # ================================================================ 其他
    def _on_close(self):
        self.scan_stop.set()
        if self.box is not None:
            self.box.close()
        self.destroy()


if __name__ == "__main__":
    App().mainloop()
