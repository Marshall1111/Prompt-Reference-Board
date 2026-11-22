# -*- coding: utf-8 -*-
"""petpaint 管理端接口客户端：登录、任务查询、图片下载、风格与店家列表。"""
from __future__ import annotations

import requests

DEFAULT_TIMEOUT = 30


class PetpaintError(Exception):
    """带用户可读提示的接口错误。"""


class PetpaintClient:
    def __init__(self, base_url: str):
        self.base_url = str(base_url or "").strip().rstrip("/")
        if not self.base_url:
            raise PetpaintError("请填写服务器地址。")
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "PetpaintVideoMaker/1.0"})
        # 忽略系统代理：部分代理把 https 代理写成 https://127.0.0.1:xxxx，
        # 旧版 urllib3 会报 "check_hostname requires server_hostname"；本站直连即可。
        self.session.trust_env = False

    # ------------------------------------------------------------------ 基础
    def _url(self, path: str) -> str:
        if str(path).startswith("http://") or str(path).startswith("https://"):
            return str(path)
        return self.base_url + path

    def _request(self, method: str, path: str, **kwargs) -> requests.Response:
        kwargs.setdefault("timeout", DEFAULT_TIMEOUT)
        try:
            response = self.session.request(method, self._url(path), **kwargs)
        except requests.RequestException as exc:
            raise PetpaintError("连接服务器失败：%s" % exc) from exc
        if response.status_code == 401:
            raise PetpaintError("登录已失效，请重新登录。")
        if response.status_code == 403:
            raise PetpaintError("当前账号没有权限执行该操作。")
        if response.status_code >= 400:
            message = ""
            try:
                payload = response.json()
                message = str(payload.get("message") or "")
            except ValueError:
                message = ""
            raise PetpaintError(message or ("请求失败（HTTP %s）" % response.status_code))
        return response

    def _get_json(self, path: str, params=None):
        return self._request("GET", path, params=params).json()

    # ------------------------------------------------------------------ 登录
    def login(self, username: str, password: str) -> None:
        username = str(username or "").strip()
        if not username or not password:
            raise PetpaintError("请输入管理员账号和密码。")
        self._request("POST", "/api/admin/login", json={"username": username, "password": password})

    # ------------------------------------------------------------------ 数据
    def list_styles(self) -> list:
        payload = self._get_json("/api/styles")
        return payload if isinstance(payload, list) else []

    def query_jobs(self, search: str = "", style_id: str = "", page: int = 1, limit: int = 50) -> dict:
        params = {"status": "succeeded", "page": max(1, int(page)), "limit": max(1, min(int(limit), 100))}
        search = str(search or "").strip()
        style_id = str(style_id or "").strip()
        if search:
            params["search"] = search
        if style_id:
            params["styleId"] = style_id
        return self._get_json("/api/image-jobs", params=params)

    def list_store_owner_invites(self) -> list:
        payload = self._get_json("/api/admin/store-owner-invites")
        items = payload.get("storeOwners") if isinstance(payload, dict) else None
        return items if isinstance(items, list) else []

    # ------------------------------------------------------------------ 图片
    def download_result(self, job_id: str) -> bytes:
        response = self._request("GET", "/api/admin/image-jobs/%s/result" % job_id)
        return response.content

    def download_reference(self, job_id: str, index: int = 0) -> bytes:
        response = self._request(
            "GET", "/api/admin/image-jobs/%s/references/%s" % (job_id, max(0, int(index)))
        )
        return response.content

    def fetch_thumbnail(self, url: str, timeout: float = 10) -> bytes:
        """缩略图是公开静态文件；用独立短超时会话，避免拖慢列表。"""
        if not url:
            return b""
        try:
            with requests.Session() as session:
                session.trust_env = False
                response = session.get(self._url(url), timeout=timeout)
        except requests.RequestException:
            return b""
        if response.status_code != 200:
            return b""
        return response.content
