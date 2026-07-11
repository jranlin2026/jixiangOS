#!/usr/bin/env python3
"""
Deploy JixiangOS to the Alibaba Cloud ECS server.

This script builds locally, packages the current workspace, uploads it to the
server, preserves the server .env file, reuses server dependencies when safe,
syncs Prisma, restarts PM2, reloads nginx, and performs health checks.

Required:
  pip install paramiko

Recommended environment variables:
  JIXIANG_DEPLOY_HOST=120.24.250.244
  JIXIANG_DEPLOY_USER=root
  JIXIANG_DEPLOY_PASSWORD=...
"""

from __future__ import annotations

import argparse
import getpass
import os
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

try:
    import paramiko
except ImportError:
    print("缺少 Python 依赖 paramiko。请先运行：python -m pip install paramiko", file=sys.stderr)
    sys.exit(2)


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_HOST = "120.24.250.244"
DEFAULT_USER = "root"
DEFAULT_APP_DIR = "/opt/jixiang-os"
DEFAULT_HEALTH_URL = "https://jixiangos.cn/api/health"

EXCLUDE_DIRS = {
    ".git",
    ".local",
    ".recovery",
    ".tools",
    ".worktrees",
    "backups",
    "coverage",
    "node_modules",
}

EXCLUDE_FILES = {
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
}

EXCLUDE_SUFFIXES = (
    ".log",
    ".map",
    ".tsbuildinfo",
    ".zip",
)


def run_local(command: list[str], *, cwd: Path = PROJECT_ROOT) -> None:
    print(f"\n> {' '.join(command)}")
    subprocess.run(command, cwd=cwd, check=True)


def print_remote_line(line: str) -> None:
    try:
        print(line, end="")
    except UnicodeEncodeError:
        sys.stdout.buffer.write(line.encode("utf-8", errors="replace"))
        sys.stdout.buffer.flush()


def should_include(path: Path) -> bool:
    relative = path.relative_to(PROJECT_ROOT)
    parts = set(relative.parts)
    if parts & EXCLUDE_DIRS:
        return False
    if path.name in EXCLUDE_FILES:
        return False
    if path.name.startswith(".codex-"):
        return False
    if path.suffix in EXCLUDE_SUFFIXES:
        return False
    return True


def create_release_zip() -> Path:
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    release_path = Path(tempfile.gettempdir()) / f"jixiang-os-release-{timestamp}.zip"
    if release_path.exists():
        release_path.unlink()

    print(f"\n正在打包：{release_path}")
    with zipfile.ZipFile(release_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for path in PROJECT_ROOT.rglob("*"):
            if not should_include(path):
                continue
            if path.is_file():
                zf.write(path, path.relative_to(PROJECT_ROOT).as_posix())

    size_mb = release_path.stat().st_size / 1024 / 1024
    print(f"打包完成：{size_mb:.1f} MB")
    return release_path


def clean_dist() -> None:
    dist_dir = PROJECT_ROOT / "dist"
    if dist_dir.exists():
        print(f"\nCleaning old build output: {dist_dir}")
        shutil.rmtree(dist_dir)


def ssh_connect(host: str, user: str, password: str, port: int) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(
        hostname=host,
        port=port,
        username=user,
        password=password,
        timeout=30,
        banner_timeout=30,
        auth_timeout=30,
    )
    return client


def run_remote(client: paramiko.SSHClient, command: str) -> None:
    print("\n> remote deploy")
    stdin, stdout, stderr = client.exec_command(command, get_pty=True)
    del stdin
    for line in iter(stdout.readline, ""):
        print_remote_line(line)
    exit_code = stdout.channel.recv_exit_status()
    err = stderr.read().decode("utf-8", errors="replace").strip()
    if err:
        print(err)
    if exit_code != 0:
        raise RuntimeError(f"远程部署失败，退出码：{exit_code}")


def upload_release(client: paramiko.SSHClient, local_zip: Path) -> str:
    remote_path = f"/tmp/{local_zip.name}"
    print(f"\n正在上传到服务器：{remote_path}")
    with client.open_sftp() as sftp:
        sftp.put(str(local_zip), remote_path)
    return remote_path


def build_remote_command(remote_zip: str, app_dir: str, node_env: str, fresh_install: bool) -> str:
    reuse_node_modules = "0" if fresh_install else "1"
    return f"""set -euo pipefail
APP_DIR="{app_dir}"
RELEASE_ZIP="{remote_zip}"
NODE_ENV_VALUE="{node_env}"
REUSE_NODE_MODULES="{reuse_node_modules}"
TS="$(date +%Y%m%d-%H%M%S)"
NEW_DIR="${{APP_DIR}}.new-${{TS}}"
BACKUP_DIR="${{APP_DIR}}.prev-${{TS}}"
ENV_BACKUP="/tmp/jixiang-os.env-${{TS}}"

echo "Preparing release..."
if [ ! -f "$RELEASE_ZIP" ]; then
  echo "Release zip not found: $RELEASE_ZIP" >&2
  exit 1
fi
if [ ! -f "$APP_DIR/.env" ]; then
  echo "Server .env not found: $APP_DIR/.env" >&2
  exit 1
fi

cp "$APP_DIR/.env" "$ENV_BACKUP"
rm -rf "$NEW_DIR"
mkdir -p "$NEW_DIR"
python3 -m zipfile -e "$RELEASE_ZIP" "$NEW_DIR"
cp "$ENV_BACKUP" "$NEW_DIR/.env"

echo "Preparing dependencies in new release..."
cd "$NEW_DIR"
if [ "$REUSE_NODE_MODULES" = "1" ] && [ -d "$APP_DIR/node_modules" ]; then
  echo "Reusing existing node_modules with hard links..."
  cp -al "$APP_DIR/node_modules" "$NEW_DIR/node_modules" 2>/dev/null || cp -a "$APP_DIR/node_modules" "$NEW_DIR/node_modules"
fi
npm install --prefer-offline --no-audit --no-fund
npm run db:generate
npm run db:push -- --accept-data-loss

echo "Switching release..."
rm -rf "$BACKUP_DIR"
mv "$APP_DIR" "$BACKUP_DIR"
mv "$NEW_DIR" "$APP_DIR"
cd "$APP_DIR"

echo "Restarting API..."
if pm2 describe jixiang-os-api >/dev/null 2>&1; then
  AI_PROXY_HOST=127.0.0.1 AI_PROXY_PORT=3001 NODE_ENV="$NODE_ENV_VALUE" pm2 restart jixiang-os-api --update-env
else
  AI_PROXY_HOST=127.0.0.1 AI_PROXY_PORT=3001 NODE_ENV="$NODE_ENV_VALUE" pm2 start node_modules/tsx/dist/cli.mjs --name jixiang-os-api -- server/index.ts
fi
pm2 save

echo "Reloading nginx..."
nginx -t
systemctl reload nginx

echo "Checking local health..."
for i in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3001/api/health; then
    break
  fi
  if [ "$i" = "30" ]; then
    echo "API health check failed after waiting." >&2
    exit 1
  fi
  sleep 1
done

echo
echo "Cleaning old releases..."
find "$(dirname "$APP_DIR")" -maxdepth 1 -type d -name "$(basename "$APP_DIR").prev-*" | sort | head -n -3 | xargs -r rm -rf
rm -f "$RELEASE_ZIP" "$ENV_BACKUP"

echo "Deploy finished."
"""


def public_health_check(url: str) -> None:
    print(f"\n检查公网访问：{url}")
    with urllib.request.urlopen(url, timeout=20) as response:
        body = response.read().decode("utf-8", errors="replace")
        if response.status != 200:
            raise RuntimeError(f"公网健康检查失败：HTTP {response.status}")
        if '"ok":true' not in body or '"database":true' not in body:
            raise RuntimeError(f"公网健康检查返回异常：{body}")
        print(body)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build and deploy JixiangOS to ECS.")
    parser.add_argument("--host", default=os.getenv("JIXIANG_DEPLOY_HOST", DEFAULT_HOST))
    parser.add_argument("--user", default=os.getenv("JIXIANG_DEPLOY_USER", DEFAULT_USER))
    parser.add_argument("--port", type=int, default=int(os.getenv("JIXIANG_DEPLOY_PORT", "22")))
    parser.add_argument("--app-dir", default=os.getenv("JIXIANG_DEPLOY_PATH", DEFAULT_APP_DIR))
    parser.add_argument("--node-env", default=os.getenv("JIXIANG_REMOTE_NODE_ENV", "development"))
    parser.add_argument("--health-url", default=os.getenv("JIXIANG_PUBLIC_HEALTH_URL", DEFAULT_HEALTH_URL))
    parser.add_argument("--skip-build", action="store_true", help="Skip local npm build.")
    parser.add_argument("--skip-public-health", action="store_true", help="Skip public /api/health check.")
    parser.add_argument("--fresh-install", action="store_true", help="Do not reuse server node_modules.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    password = os.getenv("JIXIANG_DEPLOY_PASSWORD")
    if not password:
        password = getpass.getpass(f"{args.user}@{args.host} password: ")

    try:
        if not args.skip_build:
            clean_dist()
            run_local(["npm.cmd" if os.name == "nt" else "npm", "run", "build"])

        release_zip = create_release_zip()
        client = ssh_connect(args.host, args.user, password, args.port)
        try:
            remote_zip = upload_release(client, release_zip)
            command = build_remote_command(remote_zip, args.app_dir, args.node_env, args.fresh_install)
            run_remote(client, command)
        finally:
            client.close()
            try:
                release_zip.unlink()
            except OSError:
                pass

        if not args.skip_public_health:
            public_health_check(args.health_url)

        print("\n上线完成。")
        return 0
    except Exception as exc:
        print(f"\n部署失败：{exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
