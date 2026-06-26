# 极享OS 阿里云最小上线手册

目标是先让公司内部能通过 `https://你的域名` 使用系统，范围只包含：

- 阿里云服务器
- 域名和 HTTPS
- 登录账号
- MySQL
- 每日数据库备份

## 1. 购买和开放端口

推荐先买阿里云 ECS 或轻量应用服务器：

- 系统：Ubuntu 22.04 LTS 或 Ubuntu 24.04 LTS
- 配置：2 核 4G 起步
- 磁盘：40G 起步
- 安全组：只开放 `22`、`80`、`443`
- 不要开放 MySQL `3306` 到公网

域名解析：

```text
crm.你的域名.com -> 服务器公网 IP
```

## 2. 安装基础软件

```bash
sudo apt update
sudo apt install -y git curl nginx mysql-server mysql-client gzip certbot python3-certbot-nginx

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

sudo systemctl enable --now mysql nginx
```

## 3. 拉代码

```bash
sudo mkdir -p /var/www/jixiang-os
sudo chown -R "$USER":"$USER" /var/www/jixiang-os

git clone -b codex/core-crm-polish https://github.com/jranlin2026/jixiangOS.git /var/www/jixiang-os/current
cd /var/www/jixiang-os/current
npm ci
```

## 4. 创建 MySQL 数据库

把下面的 `强数据库密码` 换成你自己的强密码。

```bash
sudo mysql
```

```sql
CREATE DATABASE IF NOT EXISTS jixiang_os CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'jixiang_os'@'localhost' IDENTIFIED BY '强数据库密码';
GRANT ALL PRIVILEGES ON jixiang_os.* TO 'jixiang_os'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 5. 配置环境变量

```bash
cp .env.example .env
nano .env
```

最少改这些值：

```env
NODE_ENV=production
DATABASE_URL="mysql://jixiang_os:强数据库密码@127.0.0.1:3306/jixiang_os"
AI_PROXY_HOST=127.0.0.1
AI_PROXY_PORT=3001
CORS_ORIGINS="https://crm.你的域名.com"
VITE_USE_BACKEND_API=true
VITE_AI_API_BASE="/api"

JIXIANG_DEFAULT_ADMIN_PASSWORD="强管理员初始密码"
JIXIANG_DEFAULT_USER_PASSWORD="强员工初始密码"

JIXIANG_MYSQL_HOST=127.0.0.1
JIXIANG_MYSQL_PORT=3306
JIXIANG_MYSQL_DATABASE=jixiang_os
JIXIANG_MYSQL_USER=jixiang_os
JIXIANG_MYSQL_PASSWORD="强数据库密码"
JIXIANG_BACKUP_DIR=/var/backups/jixiang-os
JIXIANG_BACKUP_KEEP_DAYS=14
```

先跑配置检查：

```bash
npm run prod:check
```

## 6. 初始化并启动

```bash
npm run db:generate
npm run db:deploy
npm run db:seed
npm run build

pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

检查后端：

```bash
curl http://127.0.0.1:3001/api/ready
pm2 status
```

## 7. 配置 Nginx 和 HTTPS

```bash
sudo cp deploy/nginx/jixiang-os.conf /etc/nginx/sites-available/jixiang-os.conf
sudo nano /etc/nginx/sites-available/jixiang-os.conf
```

把里面的 `crm.example.com` 改成真实域名，然后启用：

```bash
sudo ln -sf /etc/nginx/sites-available/jixiang-os.conf /etc/nginx/sites-enabled/jixiang-os.conf
sudo nginx -t
sudo systemctl reload nginx
```

申请 HTTPS：

```bash
sudo certbot --nginx -d crm.你的域名.com
sudo certbot renew --dry-run
```

## 8. 每日备份

先手动跑一次：

```bash
cd /var/www/jixiang-os/current
set -a
. ./.env
set +a
chmod +x scripts/mysql/backup-linux.sh
scripts/mysql/backup-linux.sh
```

加入每天凌晨 2 点备份：

```bash
crontab -e
```

```cron
0 2 * * * cd /var/www/jixiang-os/current && set -a && . ./.env && set +a && bash scripts/mysql/backup-linux.sh >> /var/log/jixiang-os-backup.log 2>&1
```

验收标准：`/var/backups/jixiang-os` 里面每天都有 `.sql.gz` 文件。

## 9. 上线验收

确认这些都正常：

- `https://crm.你的域名.com` 能打开
- 浏览器显示 HTTPS 证书正常
- 管理员账号能登录
- 首页、线索、客户、订单、交付、财务、系统设置能打开
- `curl http://127.0.0.1:3001/api/ready` 返回 `ok: true`
- `pm2 status` 里 `jixiang-os-api` 是 online
- 服务器安全组没有开放 `3306`
- 每日备份目录已经生成 `.sql.gz`

