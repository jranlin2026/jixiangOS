#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
错误：scripts/deploy/deploy-linux.sh 已停用，禁止用于生产发布。

这个旧入口不能保证 Prisma migration baseline、迁移前数据库备份、持久上传目录切换和失败回滚，继续执行会绕过稳定版发布门禁。

请从可信任的本地工作区使用唯一受支持的 ECS 发布入口：
  python3 scripts/deploy/deploy-ecs.py

ECS 发布入口会执行生产配置检查、数据库备份、migration baseline 校验、prisma migrate deploy、版本切换和健康检查。
EOF

exit 64
