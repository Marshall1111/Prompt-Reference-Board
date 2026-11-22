"""控制台版桥接助手入口：双击后保持窗口打开即可，日志直接显示在窗口里。"""

import argparse

from bridge import serve


def main():
    parser = argparse.ArgumentParser(description="Petpaint 本地桥接助手")
    parser.add_argument("--port", type=int, default=8791, help="监听端口，默认 8791")
    args = parser.parse_args()
    serve(args.port)


if __name__ == "__main__":
    main()
