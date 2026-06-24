# 本机 MySQL + Prisma 落地设计

日期：2026-06-24
项目：极享OS / jixiang-ai

## 目标

把当前前端 mock/localStorage 演示系统，改造为可逐步落地的内部正式 MVP 架构。第一阶段先完成本机 MySQL 数据库底座、Prisma ORM、后端 API 基础结构、组织权限与登录链路，为后续线索、客户、订单、财务模块迁移提供稳定模式。

## 当前状态

- 前端是 React + Vite。
- 后端已有 Express 服务 `server/index.ts`，目前主要承载 AI 代理接口。
- 业务数据大量由 `src/api/mock/storage.ts` 写入浏览器 `localStorage`。
- 多人内部使用时，`localStorage` 会导致每个员工数据不一致、无法统一备份、无法审计操作。

## 推荐方案

采用 Express + MySQL + Prisma。

选择原因：

- 保留现有 Node/Express 技术栈，改造成本低。
- Prisma 能提供类型安全、迁移脚本和种子数据机制。
- MySQL 适合本机、公司服务器、云服务器多种部署形态。
- 前端 API 可以逐步从 mock 切换到真实后端，不需要一次性重写所有页面。

## 第一阶段范围

第一阶段只做数据库底座和组织权限链路：

- Prisma 初始化。
- MySQL 连接配置。
- 数据库 schema 第一版。
- 种子数据导入：管理员、部门、岗位、角色、用户。
- 后端 API 基础响应格式。
- 登录 API 改为后端 MySQL 查询。
- 健康检查增加数据库连接状态。
- 保留现有 mock API 作为未迁移模块的兜底。

第一阶段不迁移：

- 线索、客户、订单、交付、退款、分账等业务模块的完整数据。
- 复杂报表和 AI 经营分析的数据聚合。
- 文件上传和凭证存储。

这些模块在后续阶段按业务优先级逐个迁移。

## 数据模型原则

第一版 MySQL 表结构优先贴合现有 TypeScript 类型：

- `users` 对齐 `src/types/settings.ts` 的 `User`。
- `roles` 对齐 `src/types/role.ts` 的 `Role`。
- `departments` 对齐 `src/types/department.ts`。
- `positions` 对齐 `src/types/position.ts`。
- 角色权限、数据范围等结构化但变化频繁的字段，第一版用 JSON 字段保存。

这样可以减少前端适配成本，同时为后续规范化拆表预留空间。

## 本机配置

默认数据库：

```text
MySQL 8
Database: jixiang_os
User: jixiang_os
Password: jixiang_os_dev
Host: 127.0.0.1
Port: 3306
```

默认 `.env`：

```env
DATABASE_URL="mysql://jixiang_os:jixiang_os_dev@127.0.0.1:3306/jixiang_os"
AI_PROXY_PORT=3001
OPENAI_MODEL="gpt-4.1-mini"
OPENAI_API_KEY=""
```

## 后端 API 设计

后端保留 `/api` 前缀：

```text
GET  /api/health
POST /api/auth/login
GET  /api/auth/me
POST /api/auth/logout
GET  /api/settings/users
GET  /api/settings/roles
GET  /api/settings/departments
GET  /api/settings/positions
```

响应格式沿用前端现有结构：

```ts
{
  code: 0,
  data: unknown,
  message: "success"
}
```

## 前端切换策略

新增后端客户端工具：

- 默认仍可使用现有 mock API。
- 当环境变量 `VITE_USE_BACKEND_API=true` 时，登录和组织权限模块调用真实后端。
- 未迁移模块继续使用 localStorage，避免一次性破坏现有功能。

## 测试策略

第一阶段测试重点：

- Prisma 数据映射工具能把数据库用户转成前端 `User` 结构。
- 登录能校验账号、停用状态、离职状态、密码。
- 健康检查能返回数据库是否可用。
- 未配置 MySQL 时，前端开发仍不会被完全阻断。

## 后续迁移顺序

建议按以下顺序继续迁移：

1. 线索。
2. 客户。
3. 订单。
4. 交付。
5. 财务、退款、分账。
6. 操作日志、审计、备份、文件上传。

这个顺序符合业务流转链路，也能逐步验证数据一致性。
