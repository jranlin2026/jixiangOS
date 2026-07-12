---
title: 极享OS AI CTO 项目上下文
category: AI CTO/项目配置
status: 试运行
version: v0.1
effective_date: 2026-07-12
review_date: 2026-08-12
owner: 待确认
approver: 用户（2026-07-12确认）
confidentiality: 内部
source:
  - README.md
  - docs/jixiang-os-project-knowledge-base.md
  - docs/superpowers/specs/2026-07-12-ai-cto-jixiangos-integration-design.md
related:
  - docs/ai-cto/AI-CTO.md
  - docs/ai-cto/routing-rules.md
---

# 极享OS AI CTO 项目上下文

## 项目定位

- 极享OS是面向公司内部使用的 AI 企业运营系统。
- 第一版围绕销售型公司的关键业务链路，先跑通业务事实、责任事实、收入事实和分配事实。
- 当前阶段是员工稳定版验收，尚未达到正式发布标准。

## 技术栈

- 前端：React
- 服务端：Express
- ORM：Prisma
- 数据库：MySQL
- 包管理和开发脚本：pnpm

## 核心业务链

```text
线索进入 → 客户沉淀 → 订单审核 → 订单分账 → 售后挽回 → 提成核算 → 员工查看 → 财务发放
```

核心模块包括首页、驾驶舱、线索、客户、订单、交付、售后服务、财务中心、开单中心、AI助手、系统设置和 AI 共创中心。

## 核心风险域

- 角色权限、菜单权限、按钮权限和数据范围。
- 客户归属、线索分配和公共池领取规则。
- 正式订单、订单审核状态和订单入库。
- 订单分账、售后挽回分账、员工提成和财务状态。
- Prisma schema、迁移、数据兼容和跨模块状态流转。
- 生产部署、生产环境变量、生产数据库和备份恢复。

## 当前发布约束

- 生产环境只允许执行 `prisma migrate deploy`，禁止 `db push --accept-data-loss`。
- 发布前必须完成 SQL 备份、校验和、异库恢复演练和迁移基线确认。
- `.local/`、`.recovery/`、`.env` 和数据库备份不得提交到 Git。
- 当前验收库缺少 `_prisma_migrations` 表，不能直接部署到服务器。
- 正式发布前必须先处理 `RELEASE_CHECKLIST.md` 中的阻断项。

## 质量检查基线

按任务影响范围选择检查；涉及数据库、发布或核心业务时不得省略对应检查：

```bash
pnpm exec tsc -b --pretty false
pnpm test
pnpm run build
pnpm exec prisma validate
pnpm exec prisma migrate status
NODE_ENV=production pnpm run prod:check
```

当前没有 lint 命令，任何任务不得声称 lint 已通过。若未来新增 lint，必须同步更新本文件和任务门禁。

## 事实源优先级

1. 任务相关且已确认的设计或用户决策。
2. `docs/jixiang-os-project-knowledge-base.md` 中的项目业务事实。
3. `RELEASE_CHECKLIST.md` 和 `README.md` 中的发布及质量约束。
4. 当前代码、Prisma schema 和迁移状态。
5. 历史设计、计划和聊天记录。

如果不同来源冲突，任务必须记录冲突并进入澄清或重新规划，不能静默选择一个版本。

## AI CTO 的项目边界

- AI CTO 可以读取项目文件、生成任务单、修改经批准的项目文件并记录验证证据。
- AI CTO 不得绕过人工审批修改生产数据、执行破坏性迁移、处理资金或正式发布。
- 未经任务单明确批准，不得因为分析结果而扩大任务范围。

## 更新规则

项目阶段、技术栈、质量命令、发布门禁或核心模块发生变化时，先更新本文件，再处理依赖它的任务。更新必须保留日期、来源和变更原因。
