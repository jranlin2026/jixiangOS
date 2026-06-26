# 极享OS 云服务器运维 Runbook

这份文档用于系统已经部署到云服务器之后的日常操作：更新、检查、备份、恢复和回滚。

## 常用目录

```bash
APP_DIR=/var/www/jixiang-os/current
BACKUP_DIR=/var/backups/jixiang-os
API_NAME=jixiang-os-api
```

## 发布更新

推荐使用自动部署脚本：

```bash
cd /var/www/jixiang-os/current
chmod +x scripts/deploy/deploy-linux.sh
scripts/deploy/deploy-linux.sh
```

脚本会按顺序执行：

1. 读取 `.env`
2. 发布前数据库备份
3. `git pull --ff-only`
4. `npm ci`
5. `npm run db:generate`
6. `npm run db:deploy`
7. `npm run build`
8. PM2 启动或重载后端
9. 检查 `http://127.0.0.1:3001/api/ready`

如果要发布后顺带跑公网冒烟检查：

```bash
JIXIANG_SMOKE_BASE_URL=https://你的域名 \
JIXIANG_SMOKE_PASSWORD='管理员密码' \
scripts/deploy/deploy-linux.sh
```

## 冒烟检查

单独运行：

```bash
cd /var/www/jixiang-os/current
chmod +x scripts/deploy/smoke-test.sh
JIXIANG_SMOKE_PASSWORD='管理员密码' scripts/deploy/smoke-test.sh https://你的域名
```

通过标准：

- `/api/ready` 返回 `ok: true`
- `/api/ready` 返回 `database: true`
- 未登录访问 `/api/settings/users` 返回 401
- 管理员可以登录并获得 token
- 登录后访问 `/api/settings/users` 返回 200

## 查看运行状态

```bash
pm2 status
pm2 logs jixiang-os-api --lines 100
curl http://127.0.0.1:3001/api/ready
sudo nginx -t
sudo systemctl status nginx --no-pager
```

## 手动备份

```bash
cd /var/www/jixiang-os/current
set -a
. ./.env
set +a
chmod +x scripts/mysql/backup-linux.sh
scripts/mysql/backup-linux.sh
```

备份文件默认在：

```bash
/var/backups/jixiang-os
```

建议每周至少做一次恢复演练，不要只确认“有备份文件”。

## 从备份恢复

恢复会覆盖目标数据库，必须先确认恢复文件和目标数据库。

```bash
cd /var/www/jixiang-os/current
set -a
. ./.env
set +a

pm2 stop jixiang-os-api
JIXIANG_CONFIRM_RESTORE=YES scripts/mysql/restore-linux.sh /var/backups/jixiang-os/jixiang_os-YYYYMMDD-HHMMSS.sql.gz
npm run db:deploy
pm2 start ecosystem.config.cjs --env production
curl http://127.0.0.1:3001/api/ready
```

恢复后再跑公网冒烟：

```bash
JIXIANG_SMOKE_PASSWORD='管理员密码' scripts/deploy/smoke-test.sh https://你的域名
```

## 回滚代码

如果更新后发现问题，优先回滚代码，不要先动数据库。

```bash
cd /var/www/jixiang-os/current
git log --oneline -5
git revert <问题提交>
npm ci
npm run build
pm2 reload ecosystem.config.cjs --env production
```

如果问题来自数据库迁移，先保留当前数据库备份，再评估是否需要用备份恢复。

## 每周检查清单

- `pm2 status` 为 online
- `sudo certbot renew --dry-run` 正常
- 最近 7 天每天都有 `.sql.gz` 备份
- 至少一份备份已复制到服务器外部位置，例如 OSS
- `scripts/deploy/smoke-test.sh` 能通过
- Nginx 只开放 80/443，MySQL 不暴露公网
