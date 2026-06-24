# 本机 MySQL 初始化说明

本项目第一阶段已经接入 Express + Prisma + MySQL。当前 `.env` 默认使用：

```env
DATABASE_URL="mysql://jixiang_os:jixiang_os_dev@127.0.0.1:3306/jixiang_os"
VITE_USE_BACKEND_API=true
```

## 1. 安装 MySQL 8

Windows 可以使用 MySQL Installer 或 winget。

```powershell
winget install Oracle.MySQL
```

如果 winget 安装过程要求确认，按提示确认即可。安装完成后，确保 MySQL 服务已启动。

```powershell
Get-Service -Name '*mysql*'
```

## 2. 创建数据库和账号

使用 MySQL root 账号执行：

```powershell
mysql -u root -p < scripts\mysql\init-local.sql
```

这会创建：

```text
Database: jixiang_os
User: jixiang_os
Password: jixiang_os_dev
```

## 3. 推送 Prisma 表结构

```powershell
npm.cmd run db:generate
npm.cmd run db:push
```

## 4. 写入初始化数据

```powershell
npm.cmd run db:seed
```

初始化后可以使用默认管理员登录：

```text
账号：admin
密码：Admin@123456
```

## 5. 启动项目

如果当前 Windows 终端没有管理员权限，MySQL 可能没有注册成系统服务。可以用项目脚本启动本机 MySQL 后台进程：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\mysql\start-local-mysql.ps1
```

```powershell
npm.cmd run dev
```

后端健康检查：

```text
http://127.0.0.1:3001/api/health
```

正常情况下应返回：

```json
{
  "ok": true,
  "database": true
}
```

## 当前迁移范围

第一阶段已经接入：

- 数据库连接
- Prisma schema
- 初始化种子数据
- 登录接口
- 当前用户接口
- 登出接口
- 用户列表
- 角色列表
- 部门列表
- 岗位列表

第二阶段 MVP 已继续接入：

- MySQL 共享业务存储表 `app_storage`
- 线索、客户、订单、交付、财务、退款、分账等 `aaos_*` 业务数据共享持久化
- 前端在 `VITE_USE_BACKEND_API=true` 时自动从后端同步业务数据
- 前端业务写入会同步回 MySQL

尚未迁移的模块仍会走前端 mock/localStorage：

- 单独结构化业务表，例如 `leads`、`customers`、`orders`

当前这些业务已经具备共享持久化能力；后续需要按业务顺序从 JSON 共享存储升级为结构化表。
