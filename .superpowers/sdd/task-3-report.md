# Task 3 Report: Authoritative Customer Tag Catalog Commands

## 实施摘要

- 新增记录级客户标签目录服务，标签组和标签分别以 `STORAGE_KEYS.TAG_GROUPS` / `STORAGE_KEYS.TAGS` 下的单条 `BusinessRecord` 存储。
- 新增目录读取与标签组/标签创建、更新、合并 HTTP 路由。
- 管理命令每次都用 `currentUser.roleId` 查询数据库角色，仅允许激活的 `super_admin`；不信任会话权限数组。
- 合并在同一事务中替换客户/线索的 `manualTagIds` 与名称快照，写入“合并客户标签”审计活动，并停用源标签。
- 关闭通用 whole-array storage PUT 对标签和标签组的写入通道。

## 根因 / 设计

旧标签目录可通过通用 storage 路由整体覆盖，无法提供记录级唯一性、数据库角色授权、原子合并和审计保证。新服务把目录定义拆成单独 `BusinessRecord`，在事务内执行 trim 归一化、组内不区分大小写重名校验和合并副作用。`usageCount` 从当前客户/线索记录的 `manualTagIds` 动态汇总，不信任标签记录内的历史计数。

## 修改文件

- `server/services/customerTagService.ts`
- `server/services/customerTagService.test.ts`
- `server/index.ts`
- `server/services/legacyStorageAccess.ts`
- `server/services/legacyStorageAccess.test.ts`
- `server/customerTagRoutesAuth.test.ts`
- `.superpowers/sdd/task-3-report.md`

## TDD 与验证

RED：

```bash
pnpm exec tsx server/services/customerTagService.test.ts && pnpm exec tsx server/customerTagRoutesAuth.test.ts
```

结果：失败，`ERR_MODULE_NOT_FOUND` 指向尚未存在的 `customerTagService`，符合预期缺口。

GREEN / 回归：

```bash
pnpm exec tsc --noEmit && pnpm exec tsx server/services/customerTagService.test.ts && pnpm exec tsx server/customerTagRoutesAuth.test.ts && pnpm exec tsx server/services/legacyStorageAccess.test.ts && pnpm exec tsx server/storageRoutesAuth.test.ts
```

结果：退出码 0，类型检查和四项聚焦/授权测试全部通过。

## 遗留风险

- `loadCustomerTagCatalog` 按 brief 稳定签名仅依赖 `businessRecord`，因此线索用量汇总依赖线索命令将权威标签快照保持在 `STORAGE_KEYS.LEADS` 记录域中；合并命令同时兼容当前 `leadRecord` 表。
- 本任务只运行 brief 指定的聚焦回归和全量 TypeScript 类型检查，未运行整仓所有独立脚本测试。

## Commit

- `feat: add authoritative customer tag catalog`
