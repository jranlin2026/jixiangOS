# 极享OS

极享OS 是基于 React、Express、Prisma 和 MySQL 的企业运营系统。本仓库当前处于员工稳定版验收阶段；截至 2026-07-12，**尚未达到正式发布标准**，请先处理 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) 中的阻断项。

## 本地运行

要求：Node.js、pnpm、MySQL。

```bash
pnpm install --frozen-lockfile
cp .env.example .env
pnpm exec prisma generate
pnpm run dev
```

默认 API 由 `AI_PROXY_PORT` 控制，前端开发端口由 `package.json` 中的 Vite 命令控制。生产环境必须设置独立强密码和正式域名，不得直接使用示例值。

## 质量检查

```bash
pnpm exec tsc -b --pretty false
pnpm test
pnpm run build
pnpm exec prisma validate
pnpm exec prisma migrate status
NODE_ENV=production pnpm run prod:check
```

当前项目没有 lint 命令，这是发布门禁缺口，不能把 lint 记为通过。

## 数据库与发布

- 生产环境只允许执行 `prisma migrate deploy`，禁止使用 `db push --accept-data-loss`。
- 发布前必须完成 SQL 备份、校验和、异库恢复演练和迁移基线确认。
- `.local/`、`.recovery/`、`.env` 和数据库备份不得提交到 Git。
- 当前验收库缺少 `_prisma_migrations` 表，不能直接部署到服务器。

修复证据见 [BUG_FIX_LOG.md](./BUG_FIX_LOG.md)，发布判定见 [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)，版本变化见 [CHANGELOG.md](./CHANGELOG.md)。

## 客户人工标签

- 超级管理员在“系统设置 → 客户设置 → 客户标签”维护标签组和预设标签。
- 线索和客户表单只允许选择目录中的有效标签；标签 ID 是稳定关联键，改名不会重写历史分配。
- 客户列表支持组内任一、任一标签、全部标签以及未打标签筛选，并可与生命周期筛选组合。
- 历史自由文本标签必须先由超级管理员预览再执行迁移；自动规则标签和高级人群包不在当前版本范围内。

本地集成冒烟脚本只允许连接回环地址和非生产环境。运行前启动本地 API，并通过环境变量提供隔离测试账号：

```bash
QA_API_BASE=http://127.0.0.1:3001/api \
QA_ADMIN_ACCOUNT=... QA_ADMIN_PASSWORD=... \
QA_SALES_ACCOUNT=... QA_SALES_PASSWORD=... \
pnpm exec tsx scripts/qa/customer-tag-smoke.ts
```
