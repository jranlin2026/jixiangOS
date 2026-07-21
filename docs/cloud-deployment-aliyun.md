# 极享OS 阿里云上云部署 Runbook

本文件用于把极享OS部署到阿里云 ECS 或轻量应用服务器，给公司内部通过域名和 HTTPS 使用。

## 目标架构

```text
浏览器
  -> https://crm.example.com
  -> Nginx
     -> /            静态文件 dist/
     -> /api/*       反向代理到 127.0.0.1:3001
  -> PM2 托管 Express API
  -> MySQL 8 / 阿里云 RDS
  -> cron 每日备份数据库
```

## 服务器建议

- 系统：Ubuntu 22.04 LTS 或 Ubuntu 24.04 LTS
- 规格：2 核 4G 起步；多人使用建议 4 核 8G
- 磁盘：80G 起步，单独预留备份目录
- 安全组：只开放 22、80、443；MySQL 3306 不对公网开放
- 域名：解析 `crm.example.com` 到服务器公网 IP

## 1. 安装基础软件

```bash
sudo apt update
sudo apt install -y git curl nginx mysql-client gzip

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

sudo npm install -g pm2
```

如果 MySQL 也装在这台服务器：

```bash
sudo apt install -y mysql-server
sudo systemctl enable --now mysql
```

## 2. 准备代码目录

```bash
sudo mkdir -p /var/www/jixiang-os
sudo chown -R "$USER":"$USER" /var/www/jixiang-os

git clone -b codex/core-crm-polish https://github.com/jranlin2026/jixiangOS.git /var/www/jixiang-os/current
cd /var/www/jixiang-os/current
npm ci
```

## 3. 配置生产环境变量

```bash
cp .env.example .env
nano .env
```

必须改掉这些值：

```env
NODE_ENV=production
DATABASE_URL="mysql://jixiang_os:强密码@127.0.0.1:3306/jixiang_os"
CORS_ORIGINS="https://你的域名"
VITE_USE_BACKEND_API=true
VITE_AI_API_BASE="/api"
JIXIANG_DEFAULT_ADMIN_PASSWORD="强管理员初始密码"
JIXIANG_DEFAULT_USER_PASSWORD="强员工初始密码"
JIXIANG_MYSQL_PASSWORD="数据库密码"
DEEPSEEK_API_KEY="你的 DeepSeek Key"
```

生产环境启动时会强制检查这些配置。缺少 `DATABASE_URL`、`CORS_ORIGINS`、`JIXIANG_DEFAULT_ADMIN_PASSWORD`、`JIXIANG_DEFAULT_USER_PASSWORD`，或者把 CORS 配成非 HTTPS 公网域名，后端会直接启动失败。

注意：上线后进入系统，把管理员密码改成只由管理员本人知道的密码。

## 4. 核对数据库迁移与管理员前置条件

如果是本机 MySQL，先创建数据库和账号：

```bash
sudo mysql
```

```sql
CREATE DATABASE IF NOT EXISTS jixiang_os CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'jixiang_os'@'localhost' IDENTIFIED BY '强密码';
GRANT ALL PRIVILEGES ON jixiang_os.* TO 'jixiang_os'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

生产环境禁止手工执行 `npm run db:seed` 或任何演示 seed 命令。正式部署会运行迁移，并由首次初始化向导在同一事务内创建企业、首个管理员及可选演示数据。

全新数据库完成 `prisma migrate deploy` 后通过初始化向导上线。ECS 部署工具会在服务器尚未配置时生成 `JIXIANG_SETUP_TOKEN`，并把一次性初始化码写入持久目录的 `initial-setup-token` 文件。部署人员读取该文件后，将初始化码交给客户在 `/setup` 完成企业、管理员和组织模板初始化。已有生产数据库会自动识别为已初始化，不会进入向导。

已有生产数据库只能在以下条件全部满足后迁移：

1. 已确认至少一名启用中的超级管理员能够登录，且凭据由管理员安全保管。
2. 已完成 SQL 备份、校验和验证、异库恢复演练和业务数据对账。
3. 已核对 Prisma migration baseline；若迁移历史缺失、分叉或无法解释，立即停止，不得直接执行 deploy。

迁移前只做状态检查：

```bash
npm run db:generate
npx --no-install prisma migrate status
```

正式迁移由受支持的 ECS 发布入口在生产配置检查、备份和 baseline 门禁通过后执行；不要在服务器上手工运行 `npm run db:deploy`。

完成 baseline 人工核验、备份和异库恢复演练后，在服务器 `.env` 中明确写入当前已核验的 baseline：

```bash
JIXIANG_PRISMA_BASELINE_CONFIRMED=20260710010000_enablement_knowledge_foundation
```

如果尚未核验，保持该值为空，不得为绕过发布门禁而填写。

## 5. 使用受支持的 ECS 发布入口

从可信任的本地工作区执行：

```bash
python3 scripts/deploy/deploy-ecs.py
```

旧的 `scripts/deploy/deploy-linux.sh` 已停用。ECS 发布入口会完成生产构建、迁移前备份、migration baseline 校验、`prisma migrate deploy`、版本切换和失败回滚。

检查 API：

```bash
curl http://127.0.0.1:3001/api/ready
pm2 status
pm2 logs jixiang-os-api --lines 100
```

## 6. 配置 Nginx 和 HTTPS

复制模板：

```bash
sudo cp deploy/nginx/jixiang-os.conf /etc/nginx/sites-available/jixiang-os.conf
sudo nano /etc/nginx/sites-available/jixiang-os.conf
```

把 `crm.example.com` 改成真实域名，然后启用：

```bash
sudo ln -sf /etc/nginx/sites-available/jixiang-os.conf /etc/nginx/sites-enabled/jixiang-os.conf
sudo nginx -t
sudo systemctl reload nginx
```

申请 HTTPS 证书：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

证书自动续期检查：

```bash
sudo certbot renew --dry-run
```

## 7. 配置每日备份

先试跑一次：

```bash
chmod +x scripts/mysql/backup-linux.sh
set -a
source .env
set +a
scripts/mysql/backup-linux.sh
```

加入 cron，每天凌晨 2 点备份：

```bash
crontab -e
```

```cron
0 2 * * * cd /var/www/jixiang-os/current && set -a && . ./.env && set +a && bash scripts/mysql/backup-linux.sh >> /var/log/jixiang-os-backup.log 2>&1
```

建议再把 `/var/backups/jixiang-os` 同步到阿里云 OSS 或另一台机器，避免服务器磁盘损坏时备份一起丢失。

## 8. 每次更新代码

不要在服务器上手工拉取并迁移。仍然从可信任的本地工作区运行受支持入口：

```bash
python3 scripts/deploy/deploy-ecs.py
```

## 9. 上线验收清单

可以先跑自动冒烟检查：

```bash
chmod +x scripts/deploy/smoke-test.sh
JIXIANG_SMOKE_PASSWORD="管理员密码" scripts/deploy/smoke-test.sh https://你的域名
```

脚本会检查：

- `/api/ready` 返回 `ok: true` 和 `database: true`
- 未登录访问 `/api/settings/users` 返回 401
- 管理员账号可以登录并拿到 token
- 登录后访问 `/api/settings/users` 返回 200

人工再确认：

- `https://你的域名` 能打开登录页
- 浏览器地址栏显示 HTTPS 证书正常
- 登录后首页、客户、订单、交付、财务、系统设置能正常打开
- `pm2 status` 中 `jixiang-os-api` 为 online
- Nginx 只开放 80/443，MySQL 未暴露公网
- 备份目录有当天 `.sql.gz` 文件
- 管理员初始密码已修改

## 10. 回滚

如果更新后异常：

```bash
cd /var/www/jixiang-os/current
git log --oneline -5
git revert <有问题的提交>
npm ci
npm run build
pm2 reload ecosystem.config.cjs --env production
```

如果数据库迁移已经执行，先不要随意删除表或回退数据库。先保留备份文件，再评估是否需要从 `.sql.gz` 恢复。
