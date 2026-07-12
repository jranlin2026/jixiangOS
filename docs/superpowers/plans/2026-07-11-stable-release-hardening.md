# 极享OS 员工稳定版修复执行计划

> **执行方式：** 使用 `superpowers:executing-plans` 逐批实施；所有行为修复遵循 `superpowers:test-driven-development`，先观察回归测试按预期失败，再做最小实现。

**目标：** 在不改变产品定位和现有视觉风格的前提下，先消除数据丢失、越权和凭据泄露风险，再让线索 → 客户 → 订单 → 审核 → 提成 → 交付及退款挽回链路由服务端可靠持久化，最终给出可复现的发布结论。

**架构原则：** 继续使用 React + Express + Prisma/MySQL；迁移期间逐领域收口旧 `storage` 整表接口。服务端是权限、状态机和持久化成功与否的唯一裁决者；前端缓存只做投影，不再作为权威数据源。所有跨领域核心命令使用服务端事务、幂等键和唯一约束。

## 不可突破的边界

- 不自动恢复、覆盖或清理生产数据库；任何生产数据变更前先做 SQL 备份、校验和、异库恢复演练和双源对账。
- 生产环境禁止运行 `db:seed` 和 `prisma db push --accept-data-loss`。
- 不提交 `.local/`、`.recovery/`、`.env*`、数据库文件或用户另行创建的未跟踪文档。
- 每批只修改同一问题组；聚焦测试通过后再执行全量测试。
- 未真实跑通的流程只标记“未验收”，不写“已修复”。
- 电商结算中心、GEO 增长中心和 AI 助手不做业务梳理；仅修复影响全站的权限和安全问题。

## 执行批次

### 批次 0：修复基线和敏感文件止血

**文件：**

- 修改：`.gitignore`
- 创建：`BUG_FIX_LOG.md`
- 验证：Git 分支、依赖锁、TypeScript、测试、构建、Prisma schema/migration 状态

**步骤：**

1. 在 `codex/fix-stable-release` 分支记录初始 Git 状态。
2. 先运行 `git check-ignore` 证明 `.local/`、`.recovery/` 尚未受保护。
3. 将两个目录加入 `.gitignore`，再用 `git check-ignore -v` 验证。
4. 运行 `pnpm install --frozen-lockfile`、`pnpm exec tsc -b --pretty false`、`pnpm test`、`pnpm run build`、`pnpm exec prisma validate`、`pnpm exec prisma migrate status`。
5. 项目没有 lint 命令时，将其记录为基线缺口，不伪造通过结果。

### 批次 1：P0 权限与凭据止血

**测试文件：**

- `src/shared/utils/permissions.test.ts`
- `server/middleware/auth.test.ts`
- `server/db/prismaMappers.test.ts`
- `server/services/settingsService.test.ts`
- `server/services/aiConfigService.test.ts`
- `server/services/assetStorageAccess.test.ts`
- 新增 CRM 迁移凭据回归测试（根据当前组件边界放入 `src/pages/Settings` 或提取的纯函数模块）

**生产文件：**

- `src/shared/utils/permissions.ts`
- `server/index.ts`
- `server/db/prismaMappers.ts`
- `server/services/settingsService.ts`
- `server/services/aiConfigService.ts`
- `server/services/assetStorageAccess.ts`
- `src/pages/Settings/CrmMigration.tsx`

**验收行为：**

- `全部/read` 不再等于超级管理员；只有有效 super-admin 角色或 `全部/admin` 才拥有全权。
- 组织、角色、AI 配置和数据维护的 POST/PUT/DELETE 明确要求 `write`/`delete`，只读用户均返回 403。
- 所有用户响应 DTO 永不包含 `passwordHash`、`passwordSalt`。
- AI base URL 只允许明确配置的 HTTPS 主机，不能把现有 key 发往任意地址。
- 资产权限按目标 key 精确判定，单一子权限不能升级为全资产写权限。
- 删除前端包中的共享硬编码密码；账号初始化改为服务端随机一次性凭据并要求首次改密，若当前数据模型尚不支持，则在安全流程完成前禁用该批量创建入口并明确显示原因。

### 批次 2：P0 Legacy Storage 防丢失与行级权限

**测试文件：**

- `server/services/storageService.test.ts`
- `server/services/legacyStorageAccess.test.ts`
- `server/storageRoutesAuth.test.ts`
- 新增双用户旧快照并发回归测试

**生产文件：**

- `server/services/storageService.ts`
- `server/services/legacyStorageAccess.ts`
- `server/index.ts`
- `src/api/backendClient.ts`
- `src/api/mock/storage.ts`

**验收行为：**

- 局部数组写入只 upsert 请求内记录，绝不通过 `notIn` 删除请求外记录。
- 空数组和旧快照不能清空或覆盖整个业务域。
- 删除只能经过有资源校验、审计和明确权限的单资源命令。
- 非管理员无法通过 `/api/storage/:key` 读取或修改超出本人/本部门范围的客户、线索、订单、提成和售后数据。
- 前端只有收到服务端成功响应才提示“保存成功”；403/500 时恢复或重新加载服务端权威状态。

### 批次 3：线索与客户服务端命令收口

**测试：** 登录、列表范围、创建、详情、编辑、分配、领取、释放公海、软删除、并发版本冲突、非法参数和重复提交。

**实现：** 为线索和客户补齐记录级 GET/POST/PATCH 命令；所有操作者从会话取得；客户与关联线索的归属变化在同一事务中完成；关系只使用稳定 ID，不再用姓名/手机号/微信作为外键。

### 批次 4：订单审核事务与幂等

**测试：** 同一申请并发审核两次只能产生一个订单；任一步失败不得留下半成品；重复请求返回同一结果；失败不能提示成功。

**实现：** 服务端 `approve order application` 命令在单一 Prisma 事务中更新申请、订单、提成、交付和生命周期；使用申请 ID/幂等键及数据库唯一约束；前端等待命令完成后刷新。

### 批次 5：交付、售后挽回、提成和财务一致性

**测试：** 空交付模板不创建幽灵交付单；退款挽回分账失败全回滚；提成防重复；退款/撤回同步调整；发放批次可审计且不可被普通整表写修改。

**实现：** 将跨表状态机迁到服务端事务命令；财务流水改为不可变账本事件/发放批次；保留历史快照与操作人。

### 批次 6：发布与数据安全

**测试文件：** 为 `scripts/deploy/deploy-ecs.py` 增加静态/命令生成测试，验证 production 默认、禁止 accept-data-loss、备份失败即停止、上传目录持久化。

**实现：** `NODE_ENV=production` 默认；发布前 `prod:check`；`mysqldump → 校验和 → 恢复演练标记 → prisma migrate deploy → 应用切换`；`uploads/`、`private_uploads/` 使用持久目录；失败自动保留现网版本。先为现有数据库建立 migration baseline，再允许部署。

### 批次 7：质量门禁与最终验收

**新增：** lint 配置/命令、CI、关键 API 集成测试、至少一套浏览器角色回归测试。

**全量命令：**

```bash
pnpm install --frozen-lockfile
pnpm exec tsc -b --pretty false
pnpm run lint
pnpm test
pnpm run build
pnpm exec prisma validate
pnpm exec prisma migrate status
```

**人工/自动链路：**

1. 线索创建 → 分配 → 跟进 → 转客户 → 建单 → 财务审核 → 提成 → 交付 → 升单并保留原销售归属。
2. 退款申请 → 审核 → 售后挽回 → 挽回分账 → 提成 → 防重复。
3. 管理员、老板、销售、线索人员、售后、财务分别验证菜单、页面、接口和数据范围。
4. 双击、重复提交、越权参数、空值、负金额、失效对象、两个页面并发、接口 403/500/超时、刷新/后退和空库首次启动。

## 完成标准

- `BUG_FIX_LOG.md` 中每项都有根因、文件、RED/GREEN 证据、结果和剩余风险。
- 所有全量门禁真实通过，浏览器与服务端控制台无未解释错误。
- 生产备份与恢复演练完成，双源对账有人工确认；否则最多只能进入隔离测试环境。
- 最终只给出 A/B/C 之一的发布结论，不以“理论上”代替验证。
