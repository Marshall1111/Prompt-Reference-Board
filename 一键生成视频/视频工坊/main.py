# -*- coding: utf-8 -*-
"""小画视频工坊：从 petpaint 历史任务选 6 组素材，生成卡点对比视频。"""
from __future__ import annotations

import io
import os
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import tkinter as tk
from concurrent.futures import ThreadPoolExecutor
from tkinter import filedialog, messagebox, ttk

from PIL import Image, ImageTk

import qr_page
import video
from config_store import load_config, save_config
from petpaint_api import PetpaintClient, PetpaintError

APP_TITLE = "小画视频工坊"
DEFAULT_SERVER = "https://www.petpaint.top"


def resource_path(*parts) -> str:
    base = getattr(sys, "_MEIPASS", None) or os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, *parts)


def app_dir() -> str:
    if getattr(sys, "frozen", False):
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def default_bgm() -> str:
    candidates = [
        os.path.join(app_dir(), "素材", "bgm.m4a"),
        os.path.join(os.path.dirname(app_dir()), "素材", "bgm.m4a"),
        resource_path("assets", "bgm.m4a"),
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return ""


def default_output_dir() -> str:
    return os.path.join(app_dir(), "输出")


def image_extension(data: bytes) -> str:
    try:
        fmt = (Image.open(io.BytesIO(data)).format or "").upper()
    except Exception:
        fmt = ""
    return {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp", "BMP": ".bmp"}.get(fmt, ".jpg")


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE)
        self.geometry("1200x840")
        self.minsize(1080, 760)

        self.config_data = load_config()
        self.client = None
        self.styles = []            # [{"id","title",...}]
        self.style_labels = {}      # 下拉显示 -> id
        self.store_owners = []
        self.jobs = []
        self.job_by_iid = {}
        self.selected = []          # 按点击顺序保存 job dict
        self.page = 1
        self.total = 0
        self.limit = int(self.config_data.get("page_size") or 50)
        self.total_pages = 1
        self.thumb_refs = {}
        self.image_cache = {}
        self.preview_token = 0
        self.log_queue = queue.Queue()
        self.last_output = ""
        self.busy = False
        self.bgm_path = self.config_data.get("bgm_path") or default_bgm()
        if not os.path.isfile(self.bgm_path):
            self.bgm_path = default_bgm()
        self.output_dir = self.config_data.get("output_dir") or default_output_dir()
        self.store_hint = ""

        self._build_style()
        self._build_tab_jobs()
        self._build_tab_qr()
        self._build_tab_video()
        self._poll_logs()
        self.protocol("WM_DELETE_WINDOW", self._on_close)
        self.after(300, self._refresh_qr_preview)

    # ------------------------------------------------------------------ 样式
    def _build_style(self):
        style = ttk.Style(self)
        try:
            style.theme_use("vista")
        except tk.TclError:
            pass
        style.configure("Title.TLabel", font=("Microsoft YaHei UI", 15, "bold"))
        style.configure("Hint.TLabel", foreground="#666666")
        style.configure("Danger.TLabel", foreground="#b3261e")
        style.configure("Treeview", rowheight=72)

    # ------------------------------------------------------------------ 第一步
    def _build_tab_jobs(self):
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True, padx=10, pady=8)

        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="① 选择历史任务")
        tab.columnconfigure(0, weight=1)
        tab.rowconfigure(2, weight=1)

        login = ttk.LabelFrame(tab, text="服务器与登录", padding=8)
        login.grid(row=0, column=0, sticky="ew")
        for col in (1, 3, 5):
            login.columnconfigure(col, weight=1)

        ttk.Label(login, text="服务器").grid(row=0, column=0, sticky="w")
        self.server_var = tk.StringVar(value=self.config_data.get("server") or DEFAULT_SERVER)
        ttk.Entry(login, textvariable=self.server_var).grid(row=0, column=1, sticky="ew", padx=(4, 12))
        ttk.Label(login, text="管理员账号").grid(row=0, column=2, sticky="w")
        self.user_var = tk.StringVar(value=self.config_data.get("username") or "")
        ttk.Entry(login, textvariable=self.user_var).grid(row=0, column=3, sticky="ew", padx=(4, 12))
        ttk.Label(login, text="密码").grid(row=0, column=4, sticky="w")
        self.pass_var = tk.StringVar()
        ttk.Entry(login, textvariable=self.pass_var, show="*").grid(row=0, column=5, sticky="ew", padx=(4, 12))
        self.login_btn = ttk.Button(login, text="登录", command=self.do_login)
        self.login_btn.grid(row=0, column=6, padx=(0, 8))
        self.login_status = ttk.Label(login, text="未登录", style="Hint.TLabel")
        self.login_status.grid(row=0, column=7, sticky="w")

        filters = ttk.LabelFrame(tab, text="筛选（仅成功任务）", padding=8)
        filters.grid(row=1, column=0, sticky="ew", pady=(8, 0))
        filters.columnconfigure(1, weight=1)
        ttk.Label(filters, text="关键词").grid(row=0, column=0, sticky="w")
        self.search_var = tk.StringVar()
        search_entry = ttk.Entry(filters, textvariable=self.search_var)
        search_entry.grid(row=0, column=1, sticky="ew", padx=(4, 12))
        search_entry.bind("<Return>", lambda _e: self.load_jobs(1))
        ttk.Label(filters, text="风格").grid(row=0, column=2, sticky="w")
        self.filter_style_var = tk.StringVar(value="全部风格")
        self.filter_style_combo = ttk.Combobox(filters, textvariable=self.filter_style_var, state="readonly", width=28)
        self.filter_style_combo.grid(row=0, column=3, sticky="w", padx=(4, 12))
        self.filter_style_combo.bind("<<ComboboxSelected>>", lambda _e: self.load_jobs(1))
        ttk.Button(filters, text="查询", command=lambda: self.load_jobs(1)).grid(row=0, column=4, padx=(0, 8))

        self.prev_btn = ttk.Button(filters, text="上一页", command=lambda: self.load_jobs(self.page - 1))
        self.prev_btn.grid(row=0, column=5)
        self.next_btn = ttk.Button(filters, text="下一页", command=lambda: self.load_jobs(self.page + 1))
        self.next_btn.grid(row=0, column=6, padx=(4, 8))
        self.page_label = ttk.Label(filters, text="第 1 页", style="Hint.TLabel")
        self.page_label.grid(row=0, column=7)

        body = ttk.Frame(tab)
        body.grid(row=2, column=0, sticky="nsew", pady=(8, 0))
        body.columnconfigure(0, weight=3)
        body.columnconfigure(1, weight=2)
        body.rowconfigure(0, weight=1)

        table_frame = ttk.Frame(body)
        table_frame.grid(row=0, column=0, sticky="nsew")
        table_frame.rowconfigure(0, weight=1)
        table_frame.columnconfigure(0, weight=1)

        columns = ("no", "style", "jobid", "time", "refs")
        self.tree = ttk.Treeview(table_frame, columns=columns, show="tree headings", selectmode="browse")
        self.tree.heading("#0", text="转绘结果")
        self.tree.column("#0", width=96, anchor="center", stretch=False)
        self.tree.heading("no", text="序号")
        self.tree.column("no", width=52, anchor="center", stretch=False)
        self.tree.heading("style", text="风格")
        self.tree.column("style", width=210, anchor="w")
        self.tree.heading("jobid", text="任务号")
        self.tree.column("jobid", width=140, anchor="w")
        self.tree.heading("time", text="完成时间")
        self.tree.column("time", width=150, anchor="w")
        self.tree.heading("refs", text="参考图")
        self.tree.column("refs", width=70, anchor="center", stretch=False)
        self.tree.grid(row=0, column=0, sticky="nsew")
        scrollbar = ttk.Scrollbar(table_frame, orient="vertical", command=self.tree.yview)
        scrollbar.grid(row=0, column=1, sticky="ns")
        self.tree.configure(yscrollcommand=scrollbar.set)
        self.tree.bind("<ButtonRelease-1>", self._on_tree_click)

        preview = ttk.LabelFrame(body, text="任务预览", padding=8)
        preview.grid(row=0, column=1, sticky="nsew", padx=(8, 0))
        preview.columnconfigure(0, weight=1)
        preview.columnconfigure(1, weight=1)

        ttk.Label(preview, text="原图").grid(row=0, column=0)
        ttk.Label(preview, text="转绘图").grid(row=0, column=1)
        self.before_label = ttk.Label(preview, text="—", anchor="center", width=18)
        self.before_label.grid(row=1, column=0, padx=4, pady=4)
        self.after_label = ttk.Label(preview, text="—", anchor="center", width=18)
        self.after_label.grid(row=1, column=1, padx=4, pady=4)
        self.job_info = tk.Text(preview, height=8, wrap="word", relief="flat", background=self.cget("background"))
        self.job_info.grid(row=2, column=0, columnspan=2, sticky="nsew", pady=(8, 0))
        self.job_info.configure(state="disabled")
        preview.rowconfigure(2, weight=1)

        picked = ttk.LabelFrame(tab, text="已选任务（0/6）", padding=8)
        picked.grid(row=3, column=0, sticky="ew", pady=(8, 0))
        picked.columnconfigure(0, weight=1)
        self.picked_frame = picked
        self.picked_list = tk.Listbox(picked, height=6, activestyle="none")
        self.picked_list.grid(row=0, column=0, rowspan=4, sticky="ew")
        ttk.Button(picked, text="上移", width=8, command=lambda: self._move_pick(-1)).grid(row=0, column=1, padx=(8, 0))
        ttk.Button(picked, text="下移", width=8, command=lambda: self._move_pick(1)).grid(row=1, column=1, padx=(8, 0))
        ttk.Button(picked, text="移除", width=8, command=self._remove_pick).grid(row=2, column=1, padx=(8, 0))
        ttk.Button(picked, text="清空", width=8, command=self._clear_picks).grid(row=3, column=1, padx=(8, 0))

    # ------------------------------------------------------------------ 第二步
    def _build_tab_qr(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="② 结尾页二维码")
        tab.columnconfigure(0, weight=1)
        tab.columnconfigure(1, weight=0)
        tab.rowconfigure(0, weight=1)

        form = ttk.LabelFrame(tab, text="二维码设置", padding=12)
        form.grid(row=0, column=0, sticky="nsew")
        form.columnconfigure(1, weight=1)

        ttk.Label(form, text="落地网址").grid(row=0, column=0, sticky="w")
        self.site_var = tk.StringVar(value=self.config_data.get("site_url") or DEFAULT_SERVER)
        site_entry = ttk.Entry(form, textvariable=self.site_var)
        site_entry.grid(row=0, column=1, sticky="ew", padx=(6, 0))

        ttk.Label(form, text="小画店家").grid(row=1, column=0, sticky="w", pady=(10, 0))
        self.store_var = tk.StringVar(value="（不使用）")
        self.store_combo = ttk.Combobox(form, textvariable=self.store_var, state="readonly")
        self.store_combo.grid(row=1, column=1, sticky="ew", padx=(6, 0), pady=(10, 0))
        self.store_combo.bind("<<ComboboxSelected>>", self._on_store_selected)
        ttk.Button(form, text="刷新店家", command=self.load_store_owners).grid(
            row=1, column=2, padx=(8, 0), pady=(10, 0)
        )

        ttk.Label(form, text="邀请码").grid(row=2, column=0, sticky="w", pady=(8, 0))
        self.invite_var = tk.StringVar()
        self.invite_entry = ttk.Entry(form, textvariable=self.invite_var)
        self.invite_entry.grid(row=2, column=1, sticky="ew", padx=(6, 0), pady=(8, 0))
        self.store_status = ttk.Label(form, text="登录后可拉取店家列表；也可手动填写邀请码。", style="Hint.TLabel")
        self.store_status.grid(row=3, column=0, columnspan=3, sticky="w", pady=(4, 0))

        ttk.Label(form, text="指定风格").grid(row=4, column=0, sticky="w", pady=(10, 0))
        self.qr_style_var = tk.StringVar(value="（不使用）")
        self.qr_style_combo = ttk.Combobox(form, textvariable=self.qr_style_var, state="readonly")
        self.qr_style_combo.grid(row=4, column=1, columnspan=2, sticky="ew", padx=(6, 0), pady=(10, 0))

        ttk.Separator(form).grid(row=5, column=0, columnspan=3, sticky="ew", pady=12)

        ttk.Label(form, text="二维码上方文案").grid(row=6, column=0, sticky="w")
        self.top_var = tk.StringVar(value=self.config_data.get("top_text") or "AI小画家，让照片更有趣")
        ttk.Entry(form, textvariable=self.top_var).grid(row=6, column=1, columnspan=2, sticky="ew", padx=(6, 0))

        ttk.Label(form, text="二维码下方文案").grid(row=7, column=0, sticky="w", pady=(8, 0))
        self.bottom_var = tk.StringVar(value=self.config_data.get("bottom_text") or "扫码做同款")
        ttk.Entry(form, textvariable=self.bottom_var).grid(
            row=7, column=1, columnspan=2, sticky="ew", padx=(6, 0), pady=(8, 0)
        )

        ttk.Label(form, text="最终链接").grid(row=8, column=0, sticky="nw", pady=(12, 0))
        self.url_label = ttk.Label(form, text="", style="Hint.TLabel", wraplength=520, justify="left")
        self.url_label.grid(row=8, column=1, columnspan=2, sticky="w", padx=(6, 0), pady=(12, 0))

        ttk.Label(
            form,
            text="扫码后会进入做同款页面：带店家邀请码时默认现场制作，带风格时自动锁定该风格。",
            style="Hint.TLabel",
            wraplength=560,
            justify="left",
        ).grid(row=9, column=0, columnspan=3, sticky="w", pady=(10, 0))

        preview_frame = ttk.LabelFrame(tab, text="结尾页预览", padding=8)
        preview_frame.grid(row=0, column=1, sticky="n", padx=(12, 0))
        self.qr_canvas = tk.Label(preview_frame, text="", background="#111111", width=34, height=50)
        self.qr_canvas.pack()

        for var in (self.site_var, self.top_var, self.bottom_var, self.invite_var):
            var.trace_add("write", lambda *_a: self._schedule_qr_preview())
        self.qr_style_combo.bind("<<ComboboxSelected>>", lambda _e: self._schedule_qr_preview())
        self._qr_after = None

    # ------------------------------------------------------------------ 第三步
    def _build_tab_video(self):
        tab = ttk.Frame(self.notebook)
        self.notebook.add(tab, text="③ 生成视频")
        tab.columnconfigure(0, weight=1)
        tab.rowconfigure(2, weight=1)

        paths = ttk.LabelFrame(tab, text="输出与音频", padding=10)
        paths.grid(row=0, column=0, sticky="ew")
        paths.columnconfigure(1, weight=1)
        ttk.Label(paths, text="输出目录").grid(row=0, column=0, sticky="w")
        self.out_var = tk.StringVar(value=self.output_dir)
        ttk.Entry(paths, textvariable=self.out_var).grid(row=0, column=1, sticky="ew", padx=6)
        ttk.Button(paths, text="选择", command=self._pick_output).grid(row=0, column=2)
        ttk.Label(paths, text="BGM").grid(row=1, column=0, sticky="w", pady=(8, 0))
        self.bgm_var = tk.StringVar(value=self.bgm_path)
        ttk.Entry(paths, textvariable=self.bgm_var).grid(row=1, column=1, sticky="ew", padx=6, pady=(8, 0))
        ttk.Button(paths, text="选择", command=self._pick_bgm).grid(row=1, column=2, pady=(8, 0))

        params = ttk.LabelFrame(tab, text="视频参数", padding=10)
        params.grid(row=1, column=0, sticky="ew", pady=(8, 0))
        self.frames_var = tk.StringVar(value="24")
        self.end_frames_var = tk.StringVar(value="62")
        self.zoom_var = tk.StringVar(value="0.04")
        self.width_var = tk.StringVar(value="1080")
        self.height_var = tk.StringVar(value="1620")
        fields = [
            ("每张帧数", self.frames_var, 6),
            ("结尾页帧数", self.end_frames_var, 6),
            ("推近幅度", self.zoom_var, 6),
            ("宽", self.width_var, 6),
            ("高", self.height_var, 6),
        ]
        for index, (label, var, width) in enumerate(fields):
            ttk.Label(params, text=label).grid(row=0, column=index * 2, sticky="w", padx=(0 if index == 0 else 14, 4))
            ttk.Entry(params, textvariable=var, width=width).grid(row=0, column=index * 2 + 1, sticky="w")

        bar = ttk.Frame(tab)
        bar.grid(row=2, column=0, sticky="ew", pady=(12, 6))
        self.generate_btn = ttk.Button(bar, text="开始生成视频", command=self.start_generate)
        self.generate_btn.pack(side="left")
        self.open_btn = ttk.Button(bar, text="打开输出文件夹", command=self._open_output, state="disabled")
        self.open_btn.pack(side="left", padx=(10, 0))
        self.progress_var = tk.StringVar(value="需要先在第一步选满 6 个任务。")
        ttk.Label(bar, textvariable=self.progress_var, style="Hint.TLabel").pack(side="left", padx=(14, 0))

        log_frame = ttk.LabelFrame(tab, text="日志", padding=6)
        log_frame.grid(row=3, column=0, sticky="nsew", pady=(6, 0))
        tab.rowconfigure(3, weight=1)
        log_frame.rowconfigure(0, weight=1)
        log_frame.columnconfigure(0, weight=1)
        self.log_text = tk.Text(log_frame, height=16, wrap="word", state="disabled")
        self.log_text.grid(row=0, column=0, sticky="nsew")
        log_scroll = ttk.Scrollbar(log_frame, orient="vertical", command=self.log_text.yview)
        log_scroll.grid(row=0, column=1, sticky="ns")
        self.log_text.configure(yscrollcommand=log_scroll.set)

    # ------------------------------------------------------------------ 登录
    def do_login(self):
        if self.busy:
            return
        server = self.server_var.get().strip()
        username = self.user_var.get().strip()
        password = self.pass_var.get()
        if not server or not username or not password:
            messagebox.showwarning(APP_TITLE, "请填写服务器、管理员账号和密码。")
            return
        self.busy = True
        self.login_btn.configure(state="disabled")
        self.login_status.configure(text="登录中…", style="Hint.TLabel")
        self._append_log("正在登录 %s …" % server)

        def work():
            try:
                client = PetpaintClient(server)
                client.login(username, password)
                styles = client.list_styles()
            except PetpaintError as exc:
                message = str(exc)
                self._post(lambda: self._login_failed(message))
                return
            except Exception as exc:  # noqa: BLE001
                message = "登录失败：%s" % exc
                self._post(lambda: self._login_failed(message))
                return
            self._post(lambda: self._login_ok(client, styles, server, username))

        threading.Thread(target=work, daemon=True).start()

    def _login_failed(self, message: str):
        self.busy = False
        self.login_btn.configure(state="normal")
        self.login_status.configure(text="登录失败", style="Danger.TLabel")
        self._append_log(message)
        messagebox.showerror(APP_TITLE, message)

    def _login_ok(self, client, styles, server, username):
        self.busy = False
        self.client = client
        self.styles = [item for item in styles if isinstance(item, dict)]
        self.login_btn.configure(state="normal")
        self.login_status.configure(text="已登录", style="Hint.TLabel")
        save_config({"server": server, "username": username})
        self._populate_style_combos()
        self._append_log("登录成功，读取到 %s 个风格。" % len(self.styles))
        self.load_jobs(1)
        self.load_store_owners()

    def _populate_style_combos(self):
        labels = ["全部风格"]
        qr_labels = ["（不使用）"]
        mapping = {}
        for style in self.styles:
            style_id = str(style.get("id") or "").strip()
            title = str(style.get("title") or style_id or "未命名风格").strip()
            if not style_id:
                continue
            label = "%s（%s）" % (title, style_id)
            labels.append(label)
            qr_labels.append(label)
            mapping[label] = style_id
        self.style_labels = mapping
        self.filter_style_combo["values"] = labels
        self.filter_style_var.set(labels[0])
        self.qr_style_combo["values"] = qr_labels
        if self.qr_style_var.get() not in qr_labels:
            self.qr_style_var.set(qr_labels[0])

    # ------------------------------------------------------------------ 任务
    def load_jobs(self, page: int):
        if not self.client:
            messagebox.showinfo(APP_TITLE, "请先登录。")
            return
        page = max(1, int(page))
        search = self.search_var.get().strip()
        style_id = self.style_labels.get(self.filter_style_var.get(), "")
        self.progress_var.set("正在查询任务…")

        def work():
            try:
                result = self.client.query_jobs(search=search, style_id=style_id, page=page, limit=self.limit)
            except PetpaintError as exc:
                message = str(exc)
                self._post(lambda: self._jobs_failed(message))
                return
            except Exception as exc:  # noqa: BLE001
                message = "查询失败：%s" % exc
                self._post(lambda: self._jobs_failed(message))
                return
            self._post(lambda: self._render_jobs(result, page))

        threading.Thread(target=work, daemon=True).start()

    def _jobs_failed(self, message: str):
        self.progress_var.set("查询失败")
        self._append_log(message)
        messagebox.showerror(APP_TITLE, message)

    def _render_jobs(self, result: dict, page: int):
        jobs = result.get("jobs") if isinstance(result, dict) else None
        jobs = jobs if isinstance(jobs, list) else []
        total = int(result.get("total") or 0) if isinstance(result, dict) else 0
        self.jobs = jobs
        self.page = page
        self.total = total
        self.total_pages = max(1, (total + self.limit - 1) // self.limit)
        self.page_label.configure(text="第 %s / %s 页 · 共 %s 条" % (self.page, self.total_pages, total))
        self.prev_btn.configure(state="normal" if self.page > 1 else "disabled")
        self.next_btn.configure(state="normal" if self.page < self.total_pages else "disabled")
        self.tree.delete(*self.tree.get_children())
        self.job_by_iid = {}
        self.thumb_refs = {}
        for job in jobs:
            if not isinstance(job, dict):
                continue
            job_id = str(job.get("jobId") or "")
            refs = job.get("originalReferences") or []
            result = job.get("result") if isinstance(job.get("result"), dict) else {}
            if not refs or not (result.get("thumbnailUrl") or result.get("imageUrl") or result.get("previewUrl")):
                continue
            item = self.tree.insert(
                "",
                "end",
                values=(self._pick_number(job_id), self._job_style(job), job_id, self._job_time(job), len(refs)),
            )
            self.job_by_iid[item] = job
        self._append_log("本页 %s 条任务。" % len(jobs))
        self._load_thumbnails(list(self.job_by_iid.items()))

    @staticmethod
    def _reference_index(job: dict) -> int:
        """多张参考图时取第 2 张（图二），否则取第 1 张。"""
        refs = job.get("originalReferences") or []
        return 1 if len(refs) > 1 else 0

    def _thumb_urls(self, job: dict):
        """返回（原图缩略图 URL，转绘图缩略图 URL）。"""
        result = job.get("result") if isinstance(job.get("result"), dict) else {}
        refs = job.get("originalReferences") or []
        before = ""
        index = self._reference_index(job)
        if refs and isinstance(refs[index], dict):
            before = refs[index].get("thumbnailUrl") or ""
        after = result.get("thumbnailUrl") or result.get("previewUrl") or ""
        return before, after

    def _cache_get(self, url: str):
        return self.image_cache.get(url) if url else None

    def _cache_put(self, url: str, data: bytes):
        if not url or not data:
            return
        if len(self.image_cache) >= 400:
            self.image_cache.clear()
        self.image_cache[url] = data

    def _load_thumbnails(self, items):
        if not self.client or not items:
            return
        pending = []
        for iid, job in items:
            url = self._thumb_urls(job)[1]
            cached = self._cache_get(url)
            if cached:
                self._apply_thumb(iid, cached)
            elif url:
                pending.append((iid, url))
        if not pending:
            return

        def work():
            def fetch(pair):
                iid, url = pair
                return iid, url, self.client.fetch_thumbnail(url, timeout=8)

            with ThreadPoolExecutor(max_workers=8) as pool:
                for iid, url, data in pool.map(fetch, pending):
                    if not data:
                        continue
                    self._cache_put(url, data)
                    self._post(lambda i=iid, d=data: self._apply_thumb(i, d))

        threading.Thread(target=work, daemon=True).start()

    def _apply_thumb(self, iid: str, data: bytes):
        if not self.tree.exists(iid):
            return
        try:
            image = Image.open(io.BytesIO(data)).convert("RGB")
            image.thumbnail((64, 64), Image.LANCZOS)
            photo = ImageTk.PhotoImage(image)
        except Exception:  # noqa: BLE001
            return
        self.thumb_refs[iid] = photo
        self.tree.item(iid, image=photo)

    def _on_tree_click(self, event):
        iid = self.tree.identify_row(event.y)
        if not iid or iid not in self.job_by_iid:
            return
        job = self.job_by_iid[iid]
        self._show_preview(job)
        self._toggle_pick(job)

    def _show_preview(self, job):
        job_id = str(job.get("jobId") or "")
        refs = job.get("originalReferences") or []
        lines = [
            "风格：%s" % self._job_style(job),
            "任务号：%s" % job_id,
            "完成时间：%s" % self._job_time(job),
            "参考图：%s 张%s" % (
                len(refs),
                "（取第 %s 张）" % (self._reference_index(job) + 1) if len(refs) > 1 else "",
            ),
            "",
            "提示词/备注：",
            str(job.get("prompt") or "（无）")[:600],
        ]
        self.job_info.configure(state="normal")
        self.job_info.delete("1.0", "end")
        self.job_info.insert("1.0", "\n".join(lines))
        self.job_info.configure(state="disabled")
        self._set_preview_image(self.before_label, "原图加载中…")
        self._set_preview_image(self.after_label, "转绘图加载中…")
        if not self.client:
            return
        before_url, after_url = self._thumb_urls(job)
        before_cached = self._cache_get(before_url)
        after_cached = self._cache_get(after_url)
        if before_cached:
            self._set_preview_image(self.before_label, "", before_cached)
        if after_cached:
            self._set_preview_image(self.after_label, "", after_cached)
        if before_cached and after_cached:
            return

        self.preview_token += 1
        token = self.preview_token
        reference_index = self._reference_index(job)

        def work():
            def load(thumb_url, full_loader):
                data = self.client.fetch_thumbnail(thumb_url, timeout=8) if thumb_url else b""
                if data:
                    self._cache_put(thumb_url, data)
                    return data
                try:
                    return full_loader()
                except Exception:  # noqa: BLE001
                    return b""

            with ThreadPoolExecutor(max_workers=2) as pool:
                before_future = pool.submit(
                    load, before_url, lambda: self.client.download_reference(job_id, reference_index)
                )
                after_future = pool.submit(
                    load, after_url, lambda: self.client.download_result(job_id)
                )
                before = before_future.result()
                after = after_future.result()
            self._post(lambda: self._apply_preview(before, after, token))

        threading.Thread(target=work, daemon=True).start()

    def _apply_preview(self, before: bytes, after: bytes, token: int):
        if token != self.preview_token:
            return
        self._set_preview_image(self.before_label, "", before)
        self._set_preview_image(self.after_label, "", after)

    def _set_preview_image(self, label, text: str, data: bytes = b""):
        if not data:
            label.configure(image="", text=text or "—")
            return
        try:
            image = Image.open(io.BytesIO(data)).convert("RGB")
            image.thumbnail((180, 220), Image.LANCZOS)
            photo = ImageTk.PhotoImage(image)
        except Exception:  # noqa: BLE001
            label.configure(image="", text="加载失败")
            return
        label.image = photo
        label.configure(image=photo, text="")

    def _toggle_pick(self, job):
        job_id = str(job.get("jobId") or "")
        if not job_id:
            return
        existing = next((item for item in self.selected if str(item.get("jobId")) == job_id), None)
        if existing:
            self.selected.remove(existing)
        else:
            if len(self.selected) >= 6:
                messagebox.showinfo(APP_TITLE, "最多选择 6 个任务，请先取消一个。")
                return
            self.selected.append(job)
        self._refresh_picked()

    def _refresh_picked(self):
        self.picked_frame.configure(text="已选任务（%s/6）" % len(self.selected))
        self.picked_list.delete(0, "end")
        for index, job in enumerate(self.selected, 1):
            self.picked_list.insert("end", "%s. %s · %s" % (index, self._job_style(job), job.get("jobId") or ""))
        for iid, job in self.job_by_iid.items():
            self.tree.set(iid, "no", self._pick_number(str(job.get("jobId") or "")))
        self.progress_var.set(
            "已选 %s/6 个任务。" % len(self.selected) if len(self.selected) < 6 else "已选 6 个任务，可生成视频。"
        )

    def _pick_number(self, job_id: str) -> str:
        for index, job in enumerate(self.selected, 1):
            if str(job.get("jobId")) == job_id:
                return str(index)
        return ""

    def _selected_index(self) -> int:
        selection = self.picked_list.curselection()
        return selection[0] if selection else -1

    def _move_pick(self, direction: int):
        index = self._selected_index()
        target = index + direction
        if index < 0 or not (0 <= target < len(self.selected)):
            return
        self.selected[index], self.selected[target] = self.selected[target], self.selected[index]
        self._refresh_picked()
        self.picked_list.selection_set(target)

    def _remove_pick(self):
        index = self._selected_index()
        if index < 0:
            return
        del self.selected[index]
        self._refresh_picked()

    def _clear_picks(self):
        self.selected = []
        self._refresh_picked()

    # ------------------------------------------------------------------ 店家与二维码
    def load_store_owners(self):
        if not self.client:
            self.store_status.configure(text="未登录，可手动填写邀请码。")
            return
        self.store_status.configure(text="正在读取店家…")

        def work():
            try:
                items = self.client.list_store_owner_invites()
            except Exception as exc:  # noqa: BLE001
                message = str(exc)
                self._post(lambda: self._store_failed(message))
                return
            self._post(lambda: self._store_ok(items))

        threading.Thread(target=work, daemon=True).start()

    def _store_failed(self, message):
        self.store_status.configure(
            text="店家接口不可用（%s），请手动填写邀请码。" % str(message)[:80], style="Danger.TLabel"
        )

    def _store_ok(self, items):
        self.store_owners = [item for item in items if isinstance(item, dict)]
        labels = ["（不使用）"]
        for item in self.store_owners:
            name = str(item.get("storeName") or "").strip() or "未命名店家"
            code = str(item.get("inviteCode") or "").strip()
            labels.append("%s（%s）" % (name, code or "无邀请码"))
        self.store_combo["values"] = labels
        if self.store_var.get() not in labels:
            self.store_var.set(labels[0])
        self.store_status.configure(
            text="已读取 %s 个店家，选择后自动填入邀请码。" % len(self.store_owners), style="Hint.TLabel"
        )

    def _on_store_selected(self, _event=None):
        label = self.store_var.get()
        for item in self.store_owners:
            name = str(item.get("storeName") or "").strip() or "未命名店家"
            code = str(item.get("inviteCode") or "").strip()
            if label == "%s（%s）" % (name, code or "无邀请码"):
                self.invite_var.set(code)
                break
        self._schedule_qr_preview()

    def _qr_url(self) -> str:
        style_id = self.style_labels.get(self.qr_style_var.get(), "")
        return qr_page.build_qr_url(self.site_var.get(), style_id, self.invite_var.get())

    def _schedule_qr_preview(self):
        if self._qr_after:
            self.after_cancel(self._qr_after)
        self._qr_after = self.after(250, self._refresh_qr_preview)

    def _refresh_qr_preview(self):
        self._qr_after = None
        url = self._qr_url()
        self.url_label.configure(text=url)
        try:
            image = qr_page.render_end_page_image(url, self.top_var.get(), self.bottom_var.get())
            preview = image.resize((300, 450), Image.LANCZOS)
            photo = ImageTk.PhotoImage(preview)
        except Exception as exc:  # noqa: BLE001
            self.qr_canvas.configure(image="", text="预览失败：%s" % exc)
            return
        self.qr_canvas.image = photo
        self.qr_canvas.configure(image=photo, text="")

    # ------------------------------------------------------------------ 视频
    def _pick_output(self):
        path = filedialog.askdirectory(initialdir=self.out_var.get() or app_dir())
        if path:
            self.out_var.set(path)

    def _pick_bgm(self):
        path = filedialog.askopenfilename(
            title="选择 BGM",
            filetypes=[("音频", "*.m4a *.mp3 *.wav *.aac"), ("所有文件", "*.*")],
            initialdir=os.path.dirname(self.bgm_var.get() or app_dir()),
        )
        if path:
            self.bgm_var.set(path)

    def _open_output(self):
        folder = self.out_var.get() or default_output_dir()
        if os.path.isdir(folder):
            os.startfile(folder)  # noqa: S606

    def start_generate(self):
        if self.busy:
            return
        if not self.client:
            messagebox.showinfo(APP_TITLE, "请先登录并选好任务。")
            return
        if len(self.selected) != 6:
            messagebox.showwarning(APP_TITLE, "请先在第一步选满 6 个任务（当前 %s 个）。" % len(self.selected))
            return
        bgm = self.bgm_var.get().strip()
        if not os.path.isfile(bgm):
            messagebox.showwarning(APP_TITLE, "BGM 文件不存在，请重新选择。")
            return
        out_dir = self.out_var.get().strip() or default_output_dir()
        try:
            frames_per = int(float(self.frames_var.get()))
            end_frames = int(float(self.end_frames_var.get()))
            zoom = float(self.zoom_var.get())
            width = int(float(self.width_var.get()))
            height = int(float(self.height_var.get()))
        except ValueError:
            messagebox.showwarning(APP_TITLE, "视频参数必须是数字。")
            return

        url = self._qr_url()
        top_text = self.top_var.get()
        bottom_text = self.bottom_var.get()
        selected = list(self.selected)

        self.busy = True
        self.generate_btn.configure(state="disabled")
        self.open_btn.configure(state="disabled")
        self.progress_var.set("正在下载素材…")
        self._append_log("开始生成：%s" % url)

        def work():
            temp_dir = tempfile.mkdtemp(prefix="petpaint_video_")
            try:
                pairs = []
                for index, job in enumerate(selected, 1):
                    job_id = str(job.get("jobId") or "")
                    self._log_async("下载 %s/%s：%s" % (index, len(selected), job_id))
                    before = self.client.download_reference(job_id, self._reference_index(job))
                    after = self.client.download_result(job_id)
                    if not before or not after:
                        raise RuntimeError("任务 %s 的原图或转绘图为空。" % job_id)
                    before_path = os.path.join(temp_dir, "%02d_原图%s" % (index, image_extension(before)))
                    after_path = os.path.join(temp_dir, "%02d_转绘%s" % (index, image_extension(after)))
                    with open(before_path, "wb") as fh:
                        fh.write(before)
                    with open(after_path, "wb") as fh:
                        fh.write(after)
                    pairs.append((before_path, after_path))

                end_page = os.path.join(temp_dir, "结尾页.png")
                qr_page.save_end_page(end_page, url, top_text, bottom_text)
                self._log_async("结尾页已生成：%s" % url)
                self._post(lambda: self.progress_var.set("正在渲染视频…"))
                output = video.render_video(
                    pairs,
                    end_page,
                    bgm,
                    out_dir,
                    frames_per=frames_per,
                    end_frames=end_frames,
                    zoom=zoom,
                    width=width,
                    height=height,
                    fps=30,
                    audio_start=None,
                    log=self._log_async,
                )
                self._post(lambda: self._generate_ok(output, out_dir))
            except Exception as exc:  # noqa: BLE001
                message = str(exc)
                self._post(lambda: self._generate_failed(message))
            finally:
                shutil.rmtree(temp_dir, ignore_errors=True)

        threading.Thread(target=work, daemon=True).start()

    def _generate_ok(self, output: str, out_dir: str):
        self.busy = False
        self.last_output = output
        self.generate_btn.configure(state="normal")
        self.open_btn.configure(state="normal")
        self.progress_var.set("生成完成：%s" % os.path.basename(output))
        save_config({"output_dir": out_dir, "bgm_path": self.bgm_var.get(), "site_url": self.site_var.get(),
                     "top_text": self.top_var.get(), "bottom_text": self.bottom_var.get()})
        messagebox.showinfo(APP_TITLE, "视频已生成：\n%s" % output)
        try:
            os.startfile(os.path.dirname(output))  # noqa: S606
        except OSError:
            pass

    def _generate_failed(self, exc):
        self.busy = False
        self.generate_btn.configure(state="normal")
        self.progress_var.set("生成失败")
        self._append_log("失败：%s" % exc)
        messagebox.showerror(APP_TITLE, "生成失败：\n%s" % exc)

    # ------------------------------------------------------------------ 工具
    def _post(self, callback):
        try:
            self.after(0, callback)
        except tk.TclError:
            pass

    def _log_async(self, message: str):
        self.log_queue.put(str(message))

    def _append_log(self, message: str):
        self.log_text.configure(state="normal")
        self.log_text.insert("end", message + "\n")
        self.log_text.see("end")
        self.log_text.configure(state="disabled")

    def _poll_logs(self):
        try:
            while True:
                self._append_log(self.log_queue.get_nowait())
        except queue.Empty:
            pass
        self.after(200, self._poll_logs)

    def _job_style(self, job: dict) -> str:
        style = str(job.get("styleName") or "").strip()
        if style:
            return style
        return str(job.get("styleId") or "未命名风格")

    def _job_time(self, job: dict) -> str:
        raw = str(job.get("completedAt") or job.get("createdAt") or "").strip()
        return raw.replace("T", " ")[:19] if raw else "—"

    def _on_close(self):
        if self.busy and not messagebox.askokcancel(APP_TITLE, "任务仍在进行，确定退出吗？"):
            return
        try:
            save_config({"site_url": self.site_var.get(), "top_text": self.top_var.get(),
                         "bottom_text": self.bottom_var.get(), "output_dir": self.out_var.get()})
        except Exception:  # noqa: BLE001
            pass
        self.destroy()


def main():
    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
