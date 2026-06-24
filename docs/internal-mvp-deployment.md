# 极享OS 第二阶段内部 MVP 部署说明

日期：2026-06-24

## 当前达成状态

本机已经完成第二阶段 MVP 的基础落地：

- MySQL Server 8.4.9 已安装。
- 数据库 `jixiang_os` 已创建。
- 项目数据库账号 `jixiang_os / jixiang_os_dev` 已创建。
- Prisma schema 已同步到 MySQL。
- 初始化种子数据已写入。
- 登录、角色、用户、部门、岗位已接后端 MySQL。
- 线索、客户、订单、交付、财务、退款、分账等业务数据已接入 MySQL 共享存储 `app_storage`。
- 前端 `.env` 已开启 `VITE_USE_BACKEND_API=true`。

## 当前架构

```text
React/Vite 前端
  -> src/api 业务 API
  -> localStorage 本地缓存
  -> /api/storage 同步到后端
  -> Express 后端
  -> Prisma
  -> MySQL app_storage
```

说明：

- `users`、`roles`、`departments`、`positions` 是结构化 MySQL 表。
- 业务模块数据先集中存入 `app_storage`，每个 `aaos_*` key 保存一个业务域 JSON。
- 这是第二阶段 MVP 的过渡架构，优先解决多人共享、统一持久化和数据不再丢失的问题。
- 后续可以继续把高频核心域拆成结构化表，例如 `leads`、`customers`、`orders`、`commissions`。

## 本机启动

推荐使用一键启动脚本：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start-local-stack.ps1
```

也可以双击：

```text
scripts\start-local-stack.cmd
```

如果没有管理员权限，无法注册 Windows 服务或计划任务。可把下面这个文件放到当前用户启动目录，实现登录 Windows 后自动启动：

```text
%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\JixiangOS Local Stack.cmd
```

如果重启电脑后 MySQL 没有自动运行，先执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\mysql\start-local-mysql.ps1
```

启动后端：

```powershell
npm.cmd run dev:api
```

启动前端 3002：

```powershell
npx.cmd vite --host 127.0.0.1 --port 3002 --strictPort
```

访问：

```text
http://127.0.0.1:3002/login
```

默认管理员：

```text
账号：admin
密码：Admin@123456
```

## 健康检查

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/health'
```

正常结果：

```json
{
  "ok": true,
  "database": true
}
```

## 数据库初始化命令

如果需要重新建表或刷新初始数据：

```powershell
npm.cmd run db:generate
npm.cmd run db:push
npm.cmd run db:seed
```

## 数据库备份

手动备份：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\mysql\backup-local.ps1
```

备份文件会输出到：

```text
backups/
```

`backups/` 已加入 `.gitignore`，不会上传到 GitHub。

## 验证共享业务数据

查看共享存储 key 数量：

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/storage'
```

查看 MySQL 里的线索数量：

```powershell
@'
import mysql from 'mysql2/promise';
const conn = await mysql.createConnection({ host: '127.0.0.1', port: 3306, user: 'jixiang_os', password: 'jixiang_os_dev', database: 'jixiang_os' });
const [rows] = await conn.query("SELECT JSON_LENGTH(value) AS count FROM app_storage WHERE `key` = 'aaos_leads'");
console.log(rows[0]);
await conn.end();
'@ | node --input-type=module
```

## 后续生产化建议

当前本机环境已经满足内部 MVP 试运行。正式放到公司内网或云服务器时，需要补：

- MySQL 注册为系统服务。
- 数据库每日自动备份。
- Nginx 反向代理。
- PM2 托管后端 Node 服务。
- HTTPS 域名。
- 独立生产 `.env`。
- 管理员密码上线后立即修改。
- 后续把 `app_storage` 中的核心业务域逐步拆成结构化表。
