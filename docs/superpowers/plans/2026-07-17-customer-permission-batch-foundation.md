# 客户权限与批量管理底座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立可配置的客户权限与四级数据范围，并交付可审计、可恢复、可取消的客户批量管理底座，覆盖转让、放弃、进展、标签、待办和软删除。

**Architecture:** 在现有客户单笔服务上方增加统一的客户访问策略与字段权限策略，使单笔和批量命令走同一组原子写能力。批量层只负责冻结选择、预检、持久化任务、租约工作者、结果和审计；它不复制客户归属、生命周期、标签、待办或删除规则。前端从现有客户列表拆出选择、动作对话框和任务抽屉，始终以服务端预检结果为准。

**Tech Stack:** React 18、TypeScript、MUI 6、Zustand、Express 5、Prisma 6.19、MySQL、Node `tsx` 独立测试、Vite。

## Global Constraints

- 业务代码不得判断“销售”、“主管”、“超级管理员”或任何角色名称；角色仅承载叶子权限和 `customers` 数据范围。
- 仅 `customers` 域使用 `self`（仅本人）、`department_only`（仅本部门）、`department_and_descendants`（本部门及所有下级部门）、`all`（全部客户）四档。其他业务域继续兼容既有 `self | department | all`，不得被本次迁移改写。
- 仅客户域的旧 `department` 输入必须幂等规范化为 `department_and_descendants`；`self` 与 `all` 保持语义不变。
- 服务端必须区分 `canReadCustomer` 与 `canManageCustomer`；贡献人、公海可见性只能授予读取，不能授予客户写入。
- `canManageCustomer` 只能使用稳定 `ownerId` 与实时 `customers` 数据范围计算；负责人身份未解析的客户除身份修复外全部写操作失败关闭。
- 单笔和批量转让、放弃、进展、标签、待办、删除必须调用同一原子命令服务，不得维护两套业务规则。
- 每个批量任务最多冻结 10,000 个客户；全筛选结果或超过 200 个客户必须后台运行；不超过 200 个也必须先持久化任务和任务明细。
- 预检确认令牌有效期 10 分钟，只能成功消费一次，并绑定操作人、操作、处理器键、冻结目标键、参数哈希、客户版本清单和守卫清单；该原语可由后续导入、导出计划复用。
- 任务状态只能按 `queued → running → succeeded | partial_failed | failed`、`queued → cancelled` 或 `running → cancel_requested → cancelled` 条件迁移；排队任务允许原子直接取消，运行中任务必须经过取消请求和租约围栏结算。
- 工作者必须使用数据库租约、租约代次、心跳和条件更新；失去租约或收到取消请求的旧工作者不得继续提交。
- 任务、任务明细和业务副作用均必须具备数据库唯一幂等约束；可重试失败只允许通过新的标准预检创建新任务。
- 批量操作保留部分成功和逐项原因；删除为软删除且存在关联业务时必须阻断；不实现客户共享、撤销共享、批量短信或外呼。
- 所有批量任务、明细、审计和结果下载均须按请求时的当前权限与当前数据范围重新授权。

---

## File Structure

| 文件 | 责任 |
| --- | --- |
| `src/types/role.ts` | 保留通用业务域范围，同时定义客户四级范围和旧输入类型。 |
| `src/shared/utils/permissions.ts` | 定义客户叶子权限、只读父节点展开规则和前端权限判断。 |
| `src/shared/utils/organizationConfig.ts` | 规范化角色数据范围、内置角色默认权限和权限树数据。 |
| `server/services/roleMigrationService.ts` | 执行有版本、幂等、不覆盖管理员后续配置的权限与范围迁移。 |
| `server/services/customerOwnerIdentityService.ts` | 回填并报告客户 `ownerId`、解析状态和待修复项。 |
| `server/services/customerAccessPolicy.ts` | 统一实现 `canReadCustomer`、`canManageCustomer`、动作权限和字段权限判断，并把 `BusinessRecord(domain: 'aaos_customers')` 映射为客户领域对象。 |
| `server/services/customerCommandService.ts` | 将现有单笔写命令收口为可供 HTTP 与批量调用的原子能力。 |
| `server/services/customerTodoService.ts` | 使用客户访问策略管理待办创建、更新、重开、取消及本人完成。 |
| `server/services/customerLifecyclePolicy.ts` | 校验客户生命周期转移及排除公海等系统状态。 |
| `server/services/customerDeletePolicy.ts` | 用显式关联检查阻断删除，并生成修复清单。 |
| `server/services/customerAssociationRegistry.ts` | 第一阶段登记所有稳定 `customerId` 查询路径，供删除阻断、历史关联审计和第三阶段迁移适配器扩展。 |
| `server/services/customerAuditService.ts` | 追加客户审计事件，屏蔽普通视图中的敏感字段。 |
| `prisma/schema.prisma` | 增加批量预检、任务、任务明细、审计、联系方式身份、身份关联和重复候选模型。 |
| `server/services/contactIdentityService.ts` | 维护手机/微信 HMAC 唯一身份、客户/线索关联和冲突候选组。 |
| `server/services/customerBatchSelectionService.ts` | 按当前过滤条件和实时范围冻结不超过 10,000 个客户。 |
| `server/services/customerBatchPrecheckService.ts` | 提供可共享的预检令牌签发/消费原语及守卫清单校验。 |
| `server/services/customerBatchService.ts` | 执行预检、建任务、任务查询、取消、结果汇总和重试筛选；不直接持有工作者租约。 |
| `server/services/customerBatchJobHandler.ts` | 注册 `customer_mutation` 处理器，并为后续导入、导出处理器预留同一分发契约。 |
| `server/services/customerBatchWorker.ts` | 启动时恢复任务、抢占租约、向处理器分发并做取消结算。 |
| `server/routes/customerBatchRoutes.ts` | 注册批量任务 HTTP 路由并在路由层做授权、输入解析和请求ID传递。 |
| `server/index.ts` | 挂载批量路由、初始化工作者和关闭时停止轮询。 |
| `src/types/customerBatch.ts` | 前端与接口共享的请求、预检、任务、明细和进度类型。 |
| `src/api/customerBatchApi.ts` | 批量任务 HTTP 客户端。 |
| `src/shared/utils/customerBatchSelection.ts` | 管理当前页/全筛选结果选择状态，不把客户明细缓存为权限事实。 |
| `src/pages/Customers/batch/CustomerBatchToolbar.tsx` | 显示所选数量、选择范围和可用动作。 |
| `src/pages/Customers/batch/CustomerBatchActionDialog.tsx` | 收集动作参数、原因、调用预检并显示阻断明细。 |
| `src/pages/Customers/batch/CustomerBatchTaskDrawer.tsx` | 轮询任务、展示进度、明细、取消与报告下载入口。 |
| `src/pages/Customers/index.tsx` | 接入复选框、固定工具条和任务抽屉，不把批量规则写进页面。 |
| `src/pages/Settings/RolePermission.tsx` | 以树型、半选方式配置新客户叶子权限和四级范围。 |
| `src/api/customerBatchApi.test.ts`、`server/services/*.test.ts`、`src/api/*.test.ts` | 覆盖权限、迁移、预检、租约、取消、幂等、部分失败和 UI 静态契约。 |

### Task 1: 定义客户叶子权限、四级范围和树型配置契约

**Files:**
- Modify: `src/types/role.ts`
- Modify: `src/shared/utils/permissions.ts`
- Modify: `src/shared/utils/organizationConfig.ts`
- Modify: `src/pages/Settings/RolePermission.tsx`
- Modify: `src/api/permissionModel.test.ts`
- Create: `src/shared/utils/customerPermissionModel.test.ts`

**Interfaces:**
- Produces `type CustomerDataScopeLevel = 'self' | 'department_only' | 'department_and_descendants' | 'all'`, `type LegacyCustomerDataScopeInput = CustomerDataScopeLevel | 'department'`, and preserves the existing generic `DataScopeLevel = 'self' | 'department' | 'all'` for all non-customer domains.
- Produces the leaf keys `CUSTOMER_EDIT_PROFILE`, `CUSTOMER_SET_PROGRESS`, `CUSTOMER_SET_TAGS`, `CUSTOMER_SET_TODOS`, `CUSTOMER_EDIT_ATTRIBUTION`, `CUSTOMER_DELETE`, `CUSTOMER_TRANSFER`, `CUSTOMER_RELEASE_TO_POOL`, `CUSTOMER_BATCH_MANAGE`, `CUSTOMER_IMPORT`, `CUSTOMER_IMPORT_ATTRIBUTION_OVERRIDE`, `CUSTOMER_EXPORT`, `CUSTOMER_EXPORT_SENSITIVE`, `CUSTOMER_MERGE`, `CUSTOMER_MERGE_UNDO`, `CUSTOMER_BATCH_CANCEL`, `CUSTOMER_BATCH_AUDIT_READ`.
- Produces `getCustomerPermissionTree(): CustomerPermissionTreeNode[]` and `getCustomerBatchActionPermissions(action: CustomerBatchOperation): string[]` for later route and UI gates.

- [ ] **Step 1: 写出范围迁移与叶子权限展开的失败测试**

```ts
import assert from 'node:assert/strict';
import { CUSTOMER_LEAF_PERMISSION_KEYS, getGrantedPermissionModules, PERMISSION_KEYS } from './permissions';
import { normalizeRoleDataScopes } from './organizationConfig';

const granted = getGrantedPermissionModules([
  { module: PERMISSION_KEYS.CUSTOMERS, actions: ['read'] },
]);
assert.equal(granted.has(PERMISSION_KEYS.CUSTOMER_LIST), true);
assert.equal(granted.has(PERMISSION_KEYS.CUSTOMER_DETAIL), true);
assert.equal(granted.has(PERMISSION_KEYS.CUSTOMER_SET_PROGRESS), false);
assert.equal(granted.has(PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE), false);
assert.equal(getGrantedPermissionModules([{ module: PERMISSION_KEYS.CUSTOMERS, actions: ['write'] }]).has(PERMISSION_KEYS.CUSTOMER_SET_PROGRESS), false);
assert.equal(getGrantedPermissionModules([{ module: PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, actions: ['write'] }]).has(PERMISSION_KEYS.CUSTOMER_SET_PROGRESS), true);
for (const leaf of CUSTOMER_LEAF_PERMISSION_KEYS) {
  assert.equal(getGrantedPermissionModules([{ module: leaf, actions: ['write'] }]).has(leaf), true);
}
for (const highRiskKey of [
  PERMISSION_KEYS.CUSTOMER_SET_PROGRESS,
  PERMISSION_KEYS.CUSTOMER_TRANSFER,
  PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE,
  PERMISSION_KEYS.CUSTOMER_DELETE,
  PERMISSION_KEYS.CUSTOMER_IMPORT,
  PERMISSION_KEYS.CUSTOMER_EXPORT,
  PERMISSION_KEYS.CUSTOMER_MERGE,
  PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL,
]) {
  for (const legacyAction of ['read', 'write', 'delete', 'admin']) {
    const legacyGrant = getGrantedPermissionModules([{ module: PERMISSION_KEYS.CUSTOMERS, actions: [legacyAction] }]);
    assert.equal(legacyGrant.has(highRiskKey), false);
  }
}
assert.equal(normalizeRoleDataScopes({ code: 'test', dataScopes: { customers: 'department' } }).customers, 'department_and_descendants');
assert.equal(normalizeRoleDataScopes({ code: 'test', dataScopes: { customers: 'department_only' } }).customers, 'department_only');
assert.equal(normalizeRoleDataScopes({ code: 'test', dataScopes: { orders: 'department' } }).orders, 'department');
assert.equal(normalizeRoleDataScopes({ code: 'test', dataScopes: { orders: 'department' } }).deliveries, 'department');
assert.equal(normalizeRoleDataScopes({ code: 'finance_specialist' }).orders, 'all');
```

- [ ] **Step 2: 运行失败测试，确认新契约尚未存在**

Run: `pnpm exec tsx src/shared/utils/customerPermissionModel.test.ts`

Expected: 失败，提示 `CUSTOMER_SET_PROGRESS` 或 `department_and_descendants` 尚未定义。

- [ ] **Step 3: 实现精确的类型、权限常量和树展开**

```ts
// src/types/role.ts
export type DataScopeLevel = 'self' | 'department' | 'all';
export type CustomerDataScopeLevel = 'self' | 'department_only' | 'department_and_descendants' | 'all';
export type LegacyCustomerDataScopeInput = CustomerDataScopeLevel | 'department';
export type NonCustomerDataScopeDomain = Exclude<DataScopeDomain, 'customers'>;
export type RoleDataScopes = Partial<Record<NonCustomerDataScopeDomain, DataScopeLevel>> & {
  customers?: LegacyCustomerDataScopeInput;
};
export type NormalizedRoleDataScopes = Required<Record<NonCustomerDataScopeDomain, DataScopeLevel>> & {
  customers: CustomerDataScopeLevel;
};

export function normalizeCustomerDataScope(value: LegacyCustomerDataScopeInput): CustomerDataScopeLevel {
  return value === 'department' ? 'department_and_descendants' : value;
}

// src/shared/utils/permissions.ts
export const CUSTOMER_LEAF_PERMISSION_KEYS = [
  PERMISSION_KEYS.CUSTOMER_LIST,
  PERMISSION_KEYS.CUSTOMER_DETAIL,
  PERMISSION_KEYS.CUSTOMER_CREATE,
  PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE,
  PERMISSION_KEYS.CUSTOMER_SET_PROGRESS,
  PERMISSION_KEYS.CUSTOMER_SET_TAGS,
  PERMISSION_KEYS.CUSTOMER_SET_TODOS,
  PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION,
  PERMISSION_KEYS.CUSTOMER_DELETE,
  PERMISSION_KEYS.CUSTOMER_TRANSFER,
  PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL,
  PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM,
  PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE,
  PERMISSION_KEYS.CUSTOMER_IMPORT,
  PERMISSION_KEYS.CUSTOMER_IMPORT_ATTRIBUTION_OVERRIDE,
  PERMISSION_KEYS.CUSTOMER_EXPORT,
  PERMISSION_KEYS.CUSTOMER_EXPORT_SENSITIVE,
  PERMISSION_KEYS.CUSTOMER_MERGE,
  PERMISSION_KEYS.CUSTOMER_MERGE_UNDO,
  PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL,
  PERMISSION_KEYS.CUSTOMER_BATCH_AUDIT_READ,
  PERMISSION_KEYS.CUSTOMER_CREATE_ORDER,
  PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS,
  PERMISSION_KEYS.CUSTOMER_PROFILE,
  PERMISSION_KEYS.CUSTOMER_AI_CARD,
] as const;

export const CUSTOMER_BATCH_ACTION_PERMISSION_MAP = {
  transfer: [PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, PERMISSION_KEYS.CUSTOMER_TRANSFER],
  release_to_pool: [PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL],
  set_progress: [PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, PERMISSION_KEYS.CUSTOMER_SET_PROGRESS],
  update_tags: [PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, PERMISSION_KEYS.CUSTOMER_SET_TAGS],
  add_todo: [PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, PERMISSION_KEYS.CUSTOMER_SET_TODOS],
  soft_delete: [PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, PERMISSION_KEYS.CUSTOMER_DELETE],
} as const;

export const CUSTOMER_PARENT_READ_ACTIONS = ['read'] as const;
export function getGrantedPermissionModules(modules: Permission[]): Set<string> {
  const granted = new Set<string>();
  for (const module of modules) {
    granted.add(module.module);
    if (module.module === PERMISSION_KEYS.CUSTOMERS && module.actions.some((action) => CUSTOMER_PARENT_READ_ACTIONS.includes(action as 'read'))) {
      granted.add(PERMISSION_KEYS.CUSTOMER_LIST);
      granted.add(PERMISSION_KEYS.CUSTOMER_DETAIL);
    }
  }
  return granted;
}
```

Keep the existing `normalizeRoleDataScopes(role)` signature, role-code defaults, complete required-domain return shape, `deliveries ← orders` fallback, recovery-review fallback, and super-admin behavior. Its implementation must run the existing logic unchanged for every `NonCustomerDataScopeDomain`; only the `customers` assignment calls `normalizeCustomerDataScope` after selecting the stored value or existing default. Never return a sparse object. Add regression fixtures for omitted scopes, deliveries fallback, recovery review, finance defaults, assets, and every non-customer domain.

Set `PERMISSION_GRANT_TREE[PERMISSION_KEYS.CUSTOMERS]` to **only** `CUSTOMER_LIST` and `CUSTOMER_DETAIL`; the richer tree returned by `getCustomerPermissionTree` is an editor-only structure whose parent/group checkboxes save explicit leaves. Add every non-delete customer mutation leaf to both `WRITE_ACTION_PERMISSION_KEYS` and `ROLE_EDITOR_WRITE_ACTION_PERMISSION_KEYS`; add `CUSTOMER_DELETE` to both `DELETE_ACTION_PERMISSION_KEYS` and `ROLE_EDITOR_DELETE_ACTION_PERMISSION_KEYS`. For runtime authorization, parent `write/create/update/delete` actions never expand into high-risk leaves. Keep `CUSTOMER_EDIT` and `CUSTOMER_ASSIGN` only as legacy migration inputs, never as route authorization keys. Wire `hasPermission` through the same safe expansion and add a P0 regression proving a persisted `{ module: CUSTOMERS, actions: ['read'] }` role cannot pass progress, transfer, batch-manage, delete, import, export, merge or batch-cancel gates.

- [ ] **Step 4: 更新角色权限页面的树型数据源和范围选项**

```ts
const CUSTOMER_SCOPE_OPTIONS = [
  { value: 'self', label: '仅本人' },
  { value: 'department_only', label: '仅本部门' },
  { value: 'department_and_descendants', label: '本部门及所有下级部门' },
  { value: 'all', label: '全部客户' },
] as const;

<Checkbox
  checked={node.leafKeys.every((key) => selectedModules.has(key))}
  indeterminate={node.leafKeys.some((key) => selectedModules.has(key)) && !node.leafKeys.every((key) => selectedModules.has(key))}
  onChange={() => togglePermissionNode(node.leafKeys)}
/>
```

The parent checkbox writes only leaf modules. It does not save a synthetic parent permission or a parent `read`/`write` action. When loading legacy parent records, show the two read leaves selected and label them as “旧权限兼容”；do not infer any write leaf. Add a tooltip stating that permissions decide actions and the customer data scope decides manageable owner coverage.

- [ ] **Step 5: 运行权限模型测试与类型检查**

Run: `pnpm exec tsx src/shared/utils/customerPermissionModel.test.ts && pnpm exec tsx src/api/permissionModel.test.ts && pnpm run build`

Expected: 两个测试均通过；TypeScript 与 Vite 构建成功。

- [ ] **Step 6: 提交该独立权限契约**

```bash
git add src/types/role.ts src/shared/utils/permissions.ts src/shared/utils/organizationConfig.ts src/pages/Settings/RolePermission.tsx src/shared/utils/customerPermissionModel.test.ts src/api/permissionModel.test.ts
git commit -m "feat: split customer permissions and data scopes"
```

### Task 2: 以版本化迁移保留现有角色有效权限和范围

**Files:**
- Modify: `server/services/roleMigrationService.ts`
- Modify: `server/services/roleMigrationService.test.ts`
- Create: `scripts/prepare-customer-permission-migration.ts`
- Modify: `server/index.ts`
- Modify: `src/shared/utils/organizationConfig.ts`

**Interfaces:**
- Consumes `PERMISSION_KEYS` and `RoleDataScopes` from Task 1.
- Produces `migrateCustomerPermissionAndScopeBaseline(prisma): Promise<CustomerPermissionMigrationSummary>`.
- Produces `CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION = 1` and storage marker key `aaos_customer_permission_scope_baseline_version`.
- Produces a checksummed `CustomerPermissionMigrationManifest` keyed by immutable role IDs; runtime business code never derives delete access from role names/codes.

- [ ] **Step 1: 写出幂等迁移的失败测试**

```ts
const first = await migrateCustomerPermissionAndScopeBaseline(prisma);
assert.equal(first.migratedRoleIds.includes('role-legacy-editor'), true);
assert.deepEqual(await roleModules('role-legacy-editor'), [
  PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE,
  PERMISSION_KEYS.CUSTOMER_SET_TAGS,
  PERMISSION_KEYS.CUSTOMER_SET_TODOS,
  PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION,
]);
assert.equal((await roleScope('role-legacy-department')).customers, 'department_and_descendants');
const second = await migrateCustomerPermissionAndScopeBaseline(prisma);
assert.equal(second.migratedRoleIds.length, 0);
await assert.rejects(
  () => migrateCustomerPermissionAndScopeBaseline(prismaWithoutValidManifest),
  /CUSTOMER_PERMISSION_MIGRATION_MANIFEST_REQUIRED/,
);
```

Include fixtures for: legacy assign grants both transfer and release; legacy edit does not grant progress; only roles proven to have current effective delete ability receive delete; and an administrator-edited role after marker creation is not altered.

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec tsx server/services/roleMigrationService.test.ts`

Expected: 失败，提示迁移函数或 marker 常量不存在。

- [ ] **Step 3: 实现版本化、一次性角色迁移**

```ts
export const CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY = 'aaos_customer_permission_scope_baseline_version';
export const CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION = 1;

export async function migrateCustomerPermissionAndScopeBaseline(
  prisma: RoleMigrationPrisma,
): Promise<CustomerPermissionMigrationSummary> {
  return prisma.$transaction!(async (tx) => {
    const marker = await tx.appStorage.findUnique({ where: { key: CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY } });
    if (readBaselineVersion(marker?.value) >= CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION) {
      return { migratedRoleIds: [], version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION };
    }
    const roles = await tx.role.findMany();
    const migratedRoleIds = await migrateLegacyCustomerRoleRows(tx, roles);
    await tx.appStorage.upsert({
      where: { key: CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY },
      create: { key: CUSTOMER_PERMISSION_SCOPE_BASELINE_KEY, value: { version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION } },
      update: { value: { version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION } },
    });
    return { migratedRoleIds, version: CUSTOMER_PERMISSION_SCOPE_BASELINE_VERSION };
  });
}
```

`scripts/prepare-customer-permission-migration.ts capture` runs against the pre-release behavior on a production-data copy and emits `{ version, roleDataHash, deleteRoleIds, generatedAt, checksum }`. Its compatibility-only capture adapter evaluates the old effective delete path once, then discards names/codes and records immutable role IDs. `apply-manifest` verifies the checksum and current role-data hash and stores it under `aaos_customer_permission_scope_migration_manifest_v1`. The release must stop if the manifest is missing, stale, or contains an unknown role ID.

`migrateLegacyCustomerRoleRows` calculates list/detail, assign and edit mappings from stored pre-migration modules/actions, then grants `CUSTOMER_DELETE` only when the role ID occurs in that verified manifest. A legacy parent `CUSTOMERS/read` expands only to list/detail; legacy assign expands only to transfer/release; legacy edit expands only to profile/tags/todos/attribution and never progress. Neither the migration service nor any runtime route/service calls a role-name/code predicate.

- [ ] **Step 4: 在服务启动的既有迁移入口顺序执行新迁移**

```ts
await migrateDefaultRoleAccess(prisma);
await migrateCustomerPermissionAndScopeBaseline(prisma);
```

Run it before serving HTTP traffic and log only counts/version, not complete role permission payloads.

- [ ] **Step 5: 运行迁移回归测试**

Run: `pnpm exec tsx server/services/roleMigrationService.test.ts`

Expected: 通过；第二次运行零变更；管理员修改后的角色权限保持不变。

- [ ] **Step 6: 提交迁移**

```bash
git add server/services/roleMigrationService.ts server/services/roleMigrationService.test.ts scripts/prepare-customer-permission-migration.ts server/index.ts src/shared/utils/organizationConfig.ts
git commit -m "feat: migrate customer permissions without role-name checks"
```

### Task 3: 建立读取/管理分离的客户访问与字段策略，并接管单笔命令

**Files:**
- Create: `server/services/customerAccessPolicy.ts`
- Create: `server/services/customerAccessPolicy.test.ts`
- Modify: `server/services/customerListService.ts`
- Modify: `server/services/customerCommandService.ts`
- Modify: `server/services/customerTodoService.ts`
- Modify: `server/index.ts`
- Modify: `src/shared/utils/dataVisibility.ts`
- Modify: `src/api/customerCommandBackend.test.ts`
- Modify: `src/api/customerTodoFeatureStatic.test.ts`

**Interfaces:**
- Produces `CustomerAccessContext`, `canReadCustomer`, `canManageCustomer`, `assertCustomerActionPermission`, and `assertCustomerFieldPermissions`.
- Produces `CustomerMutationAction = 'transfer' | 'release_to_pool' | 'set_progress' | 'update_tags' | 'add_todo' | 'soft_delete'`.
- Consumes `CustomerDataScopeLevel` and leaf permissions from Task 1.
- The current persistence source is `BusinessRecord` where `domain = 'aaos_customers'` and `data` contains the serialized customer JSON. This task must introduce a repository/mapper boundary; it must not add or assume a Prisma `Customer` model.

- [ ] **Step 1: 写出读取不等于管理的失败测试**

```ts
assert.equal(canReadCustomer(contributorContext, customerOwnedByOtherUser), true);
assert.equal(canManageCustomer(contributorContext, customerOwnedByOtherUser), false);
assert.equal(canReadCustomer(publicPoolReaderContext, publicPoolCustomer), true);
assert.equal(canManageCustomer(publicPoolReaderContext, publicPoolCustomer), false);
assert.throws(
  () => assertCustomerFieldPermissions(profileOnlyContext, { lifecycleStatusCode: 'contacted' }),
  /设置客户进展/,
);
assert.throws(
  () => assertCustomerActionPermission(noTransferContext, 'transfer'),
  /转让／分配客户/,
);
```

Include one test each for `department_only` excluding a descendant department, `department_and_descendants` including it, unresolved `ownerId` failing closed, and the public-pool claim command using its dedicated permission instead of `canManageCustomer`.

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec tsx server/services/customerAccessPolicy.test.ts`

Expected: 失败，提示 `customerAccessPolicy.ts` 不存在。

- [ ] **Step 3: 实现可复用的访问策略**

```ts
export function canManageCustomer(context: CustomerAccessContext, customer: Customer): boolean {
  if (customer.deletedAt) return false;
  if (customer.ownerIdentityStatus !== 'resolved' || !customer.ownerId) return false;
  return context.manageableOwnerIds.has(customer.ownerId);
}

export function canReadCustomer(context: CustomerAccessContext, customer: Customer): boolean {
  if (customer.deletedAt) return false;
  if (canManageCustomer(context, customer)) return true;
  return customer.ownerId === context.actorId
    || customer.leadContributorId === context.actorId
    || (customer.lifecycleStatusCode === LIFECYCLE_STATUS_CODES.PUBLIC_POOL && context.canReadPublicPool);
}

export function assertCustomerFieldPermissions(context: CustomerAccessContext, patch: Record<string, unknown>): void {
  const groups = new Set<CustomerFieldGroup>();
  if (Object.keys(patch).some((key) => PROFILE_FIELDS.has(key))) groups.add('profile');
  if ('lifecycleStatusCode' in patch) groups.add('progress');
  if ('manualTagIds' in patch) groups.add('tags');
  if (Object.keys(patch).some((key) => ATTRIBUTION_FIELDS.has(key))) groups.add('attribution');
  for (const group of groups) assertPermission(context, FIELD_GROUP_PERMISSION[group]);
}
```

Add a domain-aware visibility branch instead of broadening the generic `department` behavior:

```ts
function visibleDepartmentIdsForScope(
  domain: DataScopeDomain,
  level: DataScopeLevel | CustomerDataScopeLevel,
  currentDepartmentId: string,
  departments: Department[],
): Set<string> {
  if (domain === 'customers' && level === 'department_only') return new Set([currentDepartmentId]);
  if (domain === 'customers' && level === 'department_and_descendants') {
    return new Set([currentDepartmentId, ...getDepartmentDescendantIds(departments, currentDepartmentId)]);
  }
  if (domain !== 'customers' && level === 'department') {
    return new Set([currentDepartmentId, ...getDepartmentDescendantIds(departments, currentDepartmentId)]);
  }
  return new Set();
}
```

Update `DataVisibilityScope.dataScopeLevel` to the union needed by the customer branch. `buildDataVisibilityScopeForUser` must use the two customer cases above, while every non-customer domain continues to interpret `department` exactly as before. Add direct regression tests for customers/self, customers/department-only, customers/department-and-descendants, customers/all, and orders/deliveries/recovery/assets with their legacy scopes so an unknown value cannot silently fall back to self.

Use `ownerId` and department-derived user IDs only for manageability. Preserve existing contributor/public-pool read behavior explicitly. Map `BusinessRecord.data` into the existing `Customer` type, apply policy to that value, and serialize only through the repository's compare-and-save method. Map role scope through a server-side directory query rather than browser `localStorage`. The merge phase later adds historical merged-customer handling; this foundation must not reference `mergedIntoId` before that field exists.

- [ ] **Step 4: 将所有现有单笔写路径改为调用策略和原子命令**

Replace `canMutateCustomer` in `customerCommandService.ts` with `canManageCustomer`. Split the generic edit path by `assertCustomerFieldPermissions`; reject the whole request before any database write when one field group lacks permission. Require `CUSTOMER_TRANSFER` for transfer, `CUSTOMER_RELEASE_TO_POOL` for release, `CUSTOMER_SET_PROGRESS` for lifecycle change, `CUSTOMER_SET_TAGS` for tag updates, and `CUSTOMER_DELETE` for delete. Preserve self-completion of an assigned todo as an explicit narrow branch.

```ts
if (input.action === 'complete_own_todo' && todo.assigneeId === context.actorId && canReadCustomer(context, customer)) {
  return completeTodo(tx, todo, context);
}
assertCustomerActionPermission(context, 'add_todo');
assertCanManageCustomer(context, customer);
```

Do not authorize any route with `CUSTOMER_EDIT`, `CUSTOMER_ASSIGN`, owner name, public-pool visibility or a role name after this task.

- [ ] **Step 5: 运行服务与接口回归测试**

Run: `pnpm exec tsx server/services/customerAccessPolicy.test.ts && pnpm exec tsx server/services/customerCommandService.test.ts && pnpm exec tsx server/services/customerTodoService.test.ts && pnpm exec tsx src/api/customerCommandBackend.test.ts && pnpm exec tsx src/api/customerTodoFeatureStatic.test.ts`

Expected: 全部通过；贡献人只读、未解析负责人拒写、字段混合更新原子拒绝均有覆盖。

- [ ] **Step 6: 提交访问策略与单笔收口**

```bash
git add server/services/customerAccessPolicy.ts server/services/customerAccessPolicy.test.ts server/services/customerListService.ts server/services/customerCommandService.ts server/services/customerTodoService.ts server/index.ts src/shared/utils/dataVisibility.ts src/api/customerCommandBackend.test.ts src/api/customerTodoFeatureStatic.test.ts
git commit -m "feat: enforce customer read and manage policies"
```

### Task 4: 完成负责人身份、生命周期、待办和删除的原子业务规则

**Files:**
- Modify: `server/services/customerOwnerIdentityService.ts`
- Modify: `server/services/customerOwnerIdentityService.test.ts`
- Create: `server/services/customerLifecyclePolicy.ts`
- Create: `server/services/customerLifecyclePolicy.test.ts`
- Create: `server/services/customerDeletePolicy.ts`
- Create: `server/services/customerDeletePolicy.test.ts`
- Create: `server/services/customerAssociationRegistry.ts`
- Create: `server/services/customerAssociationRegistry.test.ts`
- Create: `scripts/audit-customer-associations.ts`
- Modify: `src/shared/utils/constants.ts`
- Modify: `server/services/customerCommandService.ts`
- Modify: `server/services/customerTodoService.ts`
- Modify: `src/types/customer.ts`

**Interfaces:**
- Produces `backfillCustomerOwnerIdentities(prisma, { apply, checkpointKey }): Promise<CustomerOwnerBackfillSummary>`.
- Produces `assertLifecycleTransition({ from, to, config }): void` and `getManualLifecycleTargets(config): CustomerLifecycleStatus[]`.
- Produces `assertCustomerCanBeSoftDeleted(tx, customerId): Promise<void>`.
- Produces the phase-one `CUSTOMER_ASSOCIATED_BUSINESS_DOMAINS`, `CustomerAssociationDefinition`, `DiscoveredCustomerAssociationPath`, `discoverCustomerAssociationDomains(tx, customerIds): Promise<DiscoveredCustomerAssociationPath[]>`, `findBlockingCustomerAssociations(tx, customerId)`, and `auditHistoricalCustomerAssociationIds(prisma, options)` inventory contract; phase three extends the same registry with lock/migrate/restore adapters and must reuse the discovery function rather than implement another scanner. Despite the historical function name, each discovery result is a `(storageDomain, pathKey)` occurrence, not a bare domain string.
- Produces the transaction-aware `CustomerAuditAppender` port and a test-composed `CustomerAtomicCommandService.execute(input, context)`; Task 5 supplies the Prisma adapter and production composition before Task 8 consumes it.

- [ ] **Step 1: 写出生命周期、待办和删除阻断的失败测试**

```ts
assert.deepEqual(getManualLifecycleTargets(config).map((item) => item.code), ['contacted', 'following']);
assert.throws(() => assertLifecycleTransition({ from: 'new', to: 'public_pool', config }), /系统状态/);
await assert.rejects(() => assertCustomerCanBeSoftDeleted(txWithOrder, 'c-1'), /存在订单关联/);
const result = await commands.execute({ action: 'release_to_pool', customerId: 'c-1', reason: '客户主动放弃' }, context);
assert.equal(result.cancelledTodoCount, 2);
```

Also assert: transfer reassigns only incomplete todos; release cancels incomplete todos with the reason; tag update is additive/removal only and checks tag group conflict; action inputs require non-empty reason; owner identity backfill does not overwrite a pre-existing `ownerId`.

Build these fixtures through a `BusinessRecord` with `domain: 'aaos_customers'` and customer JSON in `data`; assert the repository writes a new JSON version only after the policy and domain validation both pass.

Add registry cases for orders, order applications, deliveries, refunds, recovery orders, service tickets, opportunities, commissions/finance, leads, todos, customer JSON subrecords and AI cards. Cover every registered stable-ID path shape: top-level `customerId`, `data.customerId`, `data.orderData.customerId`, and conditional `data.subjectId` when `data.subjectType='customer'`. A row matching any registered path shape in an unregistered business domain must conservatively block deletion and appear in the audit report. Also add a known-domain regression such as `aaos_orders + data.orderData.customerId`: because that `(storageDomain, pathKey)` pair is not registered for orders, it must block both deletion and later merge rather than pass merely because `aaos_orders` is known. Assert that true external business links and customer attachment references block soft deletion, while intrinsic follow-up/activity/growth/tag subrecords do not make every customer permanently undeletable. A legacy row with only a customer name is never guessed when zero or multiple customers match.

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec tsx server/services/customerLifecyclePolicy.test.ts && pnpm exec tsx server/services/customerDeletePolicy.test.ts && pnpm exec tsx server/services/customerAssociationRegistry.test.ts && pnpm exec tsx server/services/customerOwnerIdentityService.test.ts`

Expected: 失败，提示生命周期和删除策略文件不存在或新命令未导出。

- [ ] **Step 3: 实现生命周期和删除策略**

```ts
const SYSTEM_ONLY_LIFECYCLE_CODES = new Set([
  LIFECYCLE_STATUS_CODES.PUBLIC_POOL,
  LIFECYCLE_STATUS_CODES.DEAL_CLOSED,
]);

export function assertLifecycleTransition(input: LifecycleTransitionInput): void {
  if (SYSTEM_ONLY_LIFECYCLE_CODES.has(input.to)) throw new Error('该状态由归属或业务命令驱动，不能手工设置');
  if (!input.config.enabledStatusCodes.includes(input.to)) throw new Error('目标进展已停用');
  if (!input.config.transitions[input.from]?.includes(input.to)) throw new Error('当前进展不允许转入目标进展');
}

export async function assertCustomerCanBeSoftDeleted(tx: CustomerAssociationReader, customerId: string): Promise<void> {
  const blockingDomains = await findBlockingCustomerAssociations(tx, customerId);
  if (blockingDomains.length > 0) throw new Error(`存在关联业务，不能删除：${blockingDomains.join('、')}`);
}
```

Add a lifecycle transition map to the existing lifecycle configuration and migrate enabled legacy statuses to a transition graph that preserves prior allowed manual behavior. The delete association reader must explicitly inspect orders, order applications, deliveries, refunds, recovery orders, service tickets, commissions, finance records, opportunities, leads, todos and customer attachments; return domain labels only, never delete any associated record.

Implement the first-stage association registry as explicit metadata for each known association definition: storage model/domain, declared stable-ID path (including any discriminator such as `subjectType='customer'`), legacy name paths used only for audit, Chinese blocker label, `blocksSoftDelete: boolean`, and `mergeAdapterKind: 'stable_id' | 'intrinsic_subrecord' | 'none'`. Multiple definitions may target one domain; for `customer_json_subrecords`, attachment references set `blocksSoftDelete=true`, while follow-up/activity/growth/tag definitions set it to `false` and remain available to merge governance. `findBlockingCustomerAssociations` returns only matches whose definition has `blocksSoftDelete=true`, plus fail-closed unknown-domain matches; it must not treat every registered merge association as a delete blocker.

Export one `discoverCustomerAssociationDomains(tx, customerIds)` implementation as the only unknown-domain scanner for deletion, audit, and later merge precheck. It returns objects shaped `{ storageDomain, pathKey, recordId, definitionId? }`; `pathKey` is the stable registry key for a path plus discriminator, never an arbitrary display string. It examines the top-level field and **all registered stable JSON path shapes** (`data.customerId`, nested `data.orderData.customerId`, conditional `data.subjectId`, and future paths added to the metadata), without arbitrary recursive JSON inference. Every caller compares the pair `(storageDomain, pathKey)` against `CustomerAssociationDefinition`; a known domain with an unregistered path fails closed just like an unknown domain. `auditHistoricalCustomerAssociationIds` supports dry-run and checkpointed apply: it may backfill a missing stable ID only when exactly one active customer matches the preserved legacy identity, otherwise it emits a repair row with domain/record ID/reason and leaves data unchanged. This stage does not migrate associations between customers; Task 3 of duplicate governance adds lock/migrate/restore methods to this same file without replacing metadata, discovery, delete semantics, or audit behavior.

- [ ] **Step 4: 把动作规则落入原子命令服务**

```ts
export type CustomerAtomicCommand =
  | { action: 'transfer'; customerId: string; targetOwnerId: string; reason: string }
  | { action: 'release_to_pool'; customerId: string; reason: string }
  | { action: 'set_progress'; customerId: string; lifecycleStatusCode: string; reason: string }
  | { action: 'update_tags'; customerId: string; mode: 'add' | 'remove'; tagIds: string[]; reason: string }
  | { action: 'add_todo'; customerId: string; title: string; content: string; dueAt: string; executionMethod: string; reason: string }
  | { action: 'soft_delete'; customerId: string; reason: string; confirmed: true };

export interface CustomerAuditAppender {
  append(tx: CustomerCommandTx, input: CustomerAuditEventInput): Promise<{ id: string }>;
}
```

Execute each command in one database transaction: lock the customer, re-load configuration, call Task 3 authorization, validate current lifecycle/tag/owner state, mutate related todo/lead state where required, append customer activity and call the required injected `CustomerAuditAppender`. Return `beforeSnapshot`, `afterSnapshot`, `operationId` and action-specific counts to the batch service. The Task 4 tests inject a capturing appender and assert it receives the same transaction, before/after snapshots, reason, actor and idempotency key. Do not reference a not-yet-generated `CustomerAuditEvent` Prisma delegate, provide a no-op appender, or switch production route composition in this task; Task 5 creates the table/service and then makes this engine the production command path.

- [ ] **Step 5: 运行原子行为回归测试**

Run: `pnpm exec tsx server/services/customerLifecyclePolicy.test.ts && pnpm exec tsx server/services/customerDeletePolicy.test.ts && pnpm exec tsx server/services/customerAssociationRegistry.test.ts && pnpm exec tsx server/services/customerOwnerIdentityService.test.ts && pnpm exec tsx server/services/customerCommandService.test.ts && pnpm exec tsx server/services/customerTodoService.test.ts`

Expected: 通过；进展不能绕过放弃权限；关联客户不能软删除；待办转派和取消可追溯。

- [ ] **Step 6: 提交原子业务规则**

```bash
git add server/services/customerOwnerIdentityService.ts server/services/customerOwnerIdentityService.test.ts server/services/customerLifecyclePolicy.ts server/services/customerLifecyclePolicy.test.ts server/services/customerDeletePolicy.ts server/services/customerDeletePolicy.test.ts server/services/customerAssociationRegistry.ts server/services/customerAssociationRegistry.test.ts scripts/audit-customer-associations.ts src/shared/utils/constants.ts server/services/customerCommandService.ts server/services/customerTodoService.ts src/types/customer.ts
git commit -m "feat: centralize customer lifecycle and deletion rules"
```

### Task 5: 持久化批量预检、任务、明细和审计模型

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260717090000_customer_batch_foundation/migration.sql`
- Create: `src/types/customerBatch.ts`
- Create: `server/services/customerAuditService.ts`
- Create: `server/services/customerAuditService.test.ts`
- Modify: `server/db/prismaMappers.ts`
- Modify: `server/services/customerCommandService.ts`
- Modify: `server/services/customerCommandService.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces Prisma models `CustomerBatchPrecheck`, `CustomerBatchJob`, `CustomerBatchJobItem`, `CustomerAuditEvent`, `ContactIdentity`, `ContactIdentityLink`, `CustomerDuplicateGroup`.
- Produces `appendCustomerAuditEvent(tx, event: CustomerAuditEventInput): Promise<CustomerAuditEvent>`.
- Produces the Prisma implementation of Task 4's `CustomerAuditAppender` and injects it into the production `CustomerAtomicCommandService`; from this point all existing single and later batch mutations use the same atomic audited path.
- Produces `CustomerBatchOperation`, `CustomerBatchJobStatus`, `CustomerBatchItemStatus`, `CustomerBatchPrecheckStatus` shared types.
- These models reference customer IDs as opaque strings because customers remain serialized in `BusinessRecord(domain: 'aaos_customers')`; do not add a Prisma relation to a nonexistent `Customer` table.

- [ ] **Step 1: 写出模型约束与审计脱敏的失败测试**

```ts
await prisma.customerBatchJob.create({ data: job });
await assert.rejects(
  () => prisma.customerBatchJob.create({ data: { ...job, id: 'job-2' } }),
  /Unique constraint/,
);
const event = sanitizeAuditEventForViewer({ beforeSnapshot: { phone: '13800138000', name: '甲' } });
assert.deepEqual(event.beforeSnapshot, { phone: '138****8000', name: '甲' });
const [first, second] = await Promise.all([
  appendCustomerAuditEvent(tx, auditInput('c-1')),
  appendCustomerAuditEvent(tx, auditInput('c-2')),
]);
assert.notEqual(first.eventSequence, second.eventSequence);
```

The test must also prove `(jobId, targetKey)`, item `idempotencyKey`, and duplicate-candidate `groupKey` are unique. For the first handler use non-null `targetKey = customer:<customerId>` and derive its item idempotency key from `jobId + targetKey`; later handlers use `row:<sourceRowNumber>` or one documented aggregate key. No item may have an empty target key. Two concurrent creates for the same rule plus sorted customer IDs must reload one `CustomerDuplicateGroup`, not create two rows.

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec tsx server/services/customerAuditService.test.ts`

Expected: 失败，提示 Prisma client 缺少 `customerBatchJob` 或审计服务不存在。

- [ ] **Step 3: 添加 Prisma 模型与唯一约束**

```prisma
model CustomerBatchJob {
  id                 String   @id
  handlerKey         String
  operation          String
  status             String
  selectionMode      String
  selectedCustomerIds Json
  filterSnapshot     Json?
  input              Json
  inputHash          String
  idempotencyFingerprint String @db.Char(64)
  reason             String
  idempotencyKey     String
  actorId            String
  actorName          String
  actorDepartmentId  String?
  totalCount         Int      @default(0)
  successCount       Int      @default(0)
  failedCount        Int      @default(0)
  skippedCount       Int      @default(0)
  cancelledCount     Int      @default(0)
  leaseOwner         String?
  leaseEpoch         Int      @default(0)
  leaseExpiresAt     DateTime?
  heartbeatAt        DateTime?
  cursor             Int      @default(0)
  cancelRequestedAt  DateTime?
  cancelledAt        DateTime?
  createdAt          DateTime @default(now())
  startedAt          DateTime?
  finishedAt         DateTime?
  items              CustomerBatchJobItem[]

  @@unique([actorId, handlerKey, operation, idempotencyKey])
  @@index([status, leaseExpiresAt])
}
```

Define the remaining models and fields exactly as follows, using `Json?` for optional snapshots and `String?` for optional references:

```prisma
model CustomerBatchPrecheck {
  id                      String   @id
  actorId                 String
  handlerKey              String
  operation               String
  status                  String
  tokenHash               String   @unique
  selectionHash           String
  inputHash               String
  guardManifest           Json
  fileHash                String?
  normalizedRowsHash      String?
  customerVersionManifest Json
  selectedCustomerIds     Json
  filterSnapshot          Json?
  expiresAt               DateTime
  consumedAt              DateTime?
  consumedResultType      String?
  consumedResultId        String?
  consumedIdempotencyKey  String?
  createdAt               DateTime @default(now())
  @@index([actorId, operation, expiresAt])
  @@index([consumedResultType, consumedResultId])
}

model CustomerBatchJobItem {
  id                    String   @id
  jobId                 String
  targetKey             String
  status                String
  errorCode             String?
  errorMessage          String?
  expectedUpdatedAt     DateTime?
  beforeHash            String?
  afterHash             String?
  beforeSnapshot        Json?
  afterSnapshot         Json?
  idempotencyKey        String   @unique
  attemptCount          Int      @default(0)
  retryable             Boolean  @default(false)
  startedAt             DateTime?
  finishedAt            DateTime?
  job                   CustomerBatchJob @relation(fields: [jobId], references: [id], onDelete: Cascade)
  @@unique([jobId, targetKey], map: "customer_batch_job_item_target_unique")
  @@index([jobId, status])
}

model CustomerAuditEvent {
  id             String   @id
  eventSequence  BigInt   @unique @default(autoincrement())
  customerId     String
  batchJobId     String?
  operation      String
  actorId        String
  actorName      String
  reason         String?
  inputHash      String?
  beforeSnapshot Json?
  afterSnapshot  Json?
  result         String
  requestId      String?
  idempotencyKey String?
  ip             String?
  createdAt      DateTime @default(now())
  @@index([customerId, eventSequence])
  @@index([batchJobId, createdAt])
}

model ContactIdentity {
  id                       String   @id
  type                     String
  normalizedHash           String
  hashKeyVersion           Int
  status                   String
  encryptedNormalizedValue String
  canonicalCustomerId      String?
  conflictReason           String?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
  links                    ContactIdentityLink[]
  @@unique([type, normalizedHash])
}

model ContactIdentityLink {
  id         String   @id
  identityId String
  entityType String
  entityId   String
  linkStatus String
  source     String
  createdAt  DateTime @default(now())
  endedAt    DateTime?
  identity   ContactIdentity @relation(fields: [identityId], references: [id], onDelete: Cascade)
  @@unique([identityId, entityType, entityId])
  @@index([entityType, entityId, linkStatus])
}

model CustomerDuplicateGroup {
  id                String   @id
  groupKey          String   @unique
  rule              String
  confidence        String
  status            String
  customerIds       Json
  contactIdentityId String?
  sourceJobId       String?
  createdById       String?
  createdAt         DateTime @default(now())
  resolvedAt        DateTime?
  mergeLedgerId     String?
  @@index([status, createdAt])
  @@index([contactIdentityId])
}
```

Extend `CustomerBatchJob` in this phase only with `frozenCustomerCount Int`, `expiresAt DateTime?`, `attemptCount Int @default(0)`, `lastError String?`, `retryOfJobId String?`, and `retryOf CustomerBatchJob? @relation("CustomerBatchJobRetry", fields: [retryOfJobId], references: [id])`; add `retryChildren CustomerBatchJob[] @relation("CustomerBatchJobRetry")`. Write the reviewed SQL in the deterministic first-stage directory `20260717090000_customer_batch_foundation`; run it before the `20260717100000` data-exchange and `20260717110000` merge migrations. Import row metadata, source/result files and export-specific fields are introduced only in the second-stage plan.

- [ ] **Step 4: 实现追加式审计服务**

```ts
export async function appendCustomerAuditEvent(tx: CustomerAuditStore, input: CustomerAuditEventInput): Promise<CustomerAuditEvent> {
  return tx.customerAuditEvent.create({
    data: {
      id: input.id,
      customerId: input.customerId,
      batchJobId: input.batchJobId ?? null,
      operation: input.operation,
      actorId: input.actor.id,
      actorName: input.actor.name,
      reason: input.reason,
      inputHash: input.inputHash,
      beforeSnapshot: pickAuditFields(input.beforeSnapshot),
      afterSnapshot: pickAuditFields(input.afterSnapshot),
      result: input.result,
      requestId: input.requestId,
      idempotencyKey: input.idempotencyKey,
      ip: input.ip ?? null,
    },
  });
}
```

`pickAuditFields` must omit attachment bytes, raw contact values, authentication data and arbitrary JSON blobs. It may retain only the documented allowlist of business fields plus already masked phone, WeChat and email strings; it must store an `inputHash` for correlation rather than future retrieval. Audit writes never depend on an undeclared key-management or recovery service.

Map `eventSequence` to a decimal string in every API/audit view before JSON serialization; never pass a JavaScript `bigint` to `JSON.stringify`. Merge guards compare this persisted monotonic sequence numerically through Prisma/SQL, not by timestamp or lexicographic string ordering.

Implement `CustomerAuditAppender.append` as a thin adapter around `appendCustomerAuditEvent(tx, input)`, then update `server/index.ts` and the existing customer command composition to require this adapter. Add a command-service regression proving a customer JSON mutation, its related todo/activity change, and `CustomerAuditEvent` either all commit or all roll back in the same Prisma transaction.

- [ ] **Step 5: 生成 Prisma client 并运行测试**

Run: `pnpm run db:generate && pnpm exec tsx server/services/customerAuditService.test.ts && pnpm exec tsx server/services/customerCommandService.test.ts && pnpm run build`

Expected: Prisma client generated; uniqueness and masking tests pass; production build succeeds.

- [ ] **Step 6: 提交任务与审计模型**

```bash
git add prisma/schema.prisma prisma/migrations src/types/customerBatch.ts server/services/customerAuditService.ts server/services/customerAuditService.test.ts server/db/prismaMappers.ts server/services/customerCommandService.ts server/services/customerCommandService.test.ts server/index.ts
git commit -m "feat: persist customer batch jobs and audit events"
```

### Task 6: 交付联系方式身份回填与新写入冲突阻断

**Files:**
- Create: `server/services/contactIdentityService.ts`
- Create: `server/services/contactIdentityService.test.ts`
- Create: `scripts/backfill-contact-identities.ts`
- Modify: `server/services/customerCommandService.ts`
- Modify: `server/services/customerOwnerIdentityService.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces `normalizeContactIdentity(type, value): string`, `upsertCustomerContactIdentities(tx, input): Promise<ContactIdentity[]>`, `linkLeadAndCustomerIdentity(tx, input)`, and `backfillContactIdentities(prisma, options)`.
- Produces `ContactIdentityConflictError` with `code: 'CONTACT_IDENTITY_CONFLICT'` and a safe viewer payload.

- [ ] **Step 1: 写出唯一身份、多关联与冲突回填的失败测试**

```ts
const identity = await upsertCustomerContactIdentities(tx, { customerId: 'c-1', phone: '138 0013 8000', wechat: '' });
assert.equal(identity[0].normalizedHash, hmac('13800138000'));
await linkLeadAndCustomerIdentity(tx, { leadId: 'lead-1', customerId: 'c-1', phone: '13800138000' });
assert.equal(await countActiveLinks(identity[0].id), 2);
await assert.rejects(
  () => upsertCustomerContactIdentities(tx, { customerId: 'c-2', phone: '13800138000', wechat: '' }),
  (error: unknown) => (error as ContactIdentityConflictError).code === 'CONTACT_IDENTITY_CONFLICT',
);
```

Also assert a historical phone linked to two active customers becomes `conflict` with no canonical customer and one duplicate candidate group, while a normal lead-to-customer conversion preserves both links and points `canonicalCustomerId` to the customer.

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec tsx server/services/contactIdentityService.test.ts`

Expected: 失败，提示联系方式服务不存在。

- [ ] **Step 3: 实现 HMAC 身份与链接写入**

```ts
export function normalizeContactIdentity(type: ContactIdentityType, value: string): string {
  return type === 'phone' ? normalizePhoneForComparison(value) : value.trim().toLocaleLowerCase('en-US');
}

export function hashContactIdentity(value: string, key: Buffer): string {
  return createHmac('sha256', key).update(value, 'utf8').digest('hex');
}

export async function upsertCustomerContactIdentities(tx: ContactIdentityStore, input: CustomerIdentityInput): Promise<ContactIdentity[]> {
  const identities: ContactIdentity[] = [];
  for (const candidate of toIdentityCandidates(input)) {
    const identity = await lockOrCreateIdentity(tx, candidate);
    await assertIdentityCanAcceptCustomer(tx, identity, input.customerId);
    await upsertActiveLink(tx, identity.id, 'customer', input.customerId, input.source);
    identities.push(await tx.contactIdentity.update({ where: { id: identity.id }, data: { canonicalCustomerId: input.customerId, status: 'active' } }));
  }
  return identities;
}
```

Use a server-side HMAC key with version field, never a plaintext contact index. On conflict, include object details only when the actor passes `canReadCustomer`; otherwise return only `系统中已存在相同联系方式`.

- [ ] **Step 4: 在单客户创建、编辑、线索转客户事务中接入身份服务**

Call identity writes inside the same Prisma transaction as the customer/lead mutation. When edit changes a phone or WeChat, end the obsolete link only after the new identity update succeeds. On a conflict, roll back the whole customer write and return a 409 semantic error.

- [ ] **Step 5: 增加可重复运行的回填脚本和启动前报告**

```ts
const summary = await backfillContactIdentities(prisma, { apply: process.argv.includes('--apply') });
console.info(JSON.stringify({
  canonicalCustomers: summary.canonicalCustomers,
  conflicts: summary.conflicts,
  invalidValues: summary.invalidValues,
  duplicateGroups: summary.duplicateGroups,
}));
```

The script must support dry-run and apply modes, derive identity/link idempotence from their unique indexes, and derive every candidate `CustomerDuplicateGroup.groupKey` as SHA-256 of the rule plus sorted unique customer IDs. Concurrent discovery/backfill therefore creates one group or reloads the unique-key winner; it must not alter existing customer records outside its own transaction.

- [ ] **Step 6: 运行身份测试**

Run: `pnpm exec tsx server/services/contactIdentityService.test.ts && pnpm exec tsx server/services/customerCommandService.test.ts && pnpm exec tsx server/services/customerOwnerIdentityService.test.ts`

Expected: 通过；转换可保留线索与客户双关联，冲突不扩散且不泄露无权对象。

- [ ] **Step 7: 提交身份底座**

```bash
git add server/services/contactIdentityService.ts server/services/contactIdentityService.test.ts scripts/backfill-contact-identities.ts server/services/customerCommandService.ts server/services/customerOwnerIdentityService.ts server/index.ts
git commit -m "feat: add customer contact identity governance"
```

### Task 7: 实现筛选冻结、预检令牌和批量任务创建

**Files:**
- Create: `server/services/customerBatchSelectionService.ts`
- Create: `server/services/customerBatchSelectionService.test.ts`
- Create: `server/services/customerBatchPrecheckService.ts`
- Create: `server/services/customerBatchPrecheckService.test.ts`
- Create: `server/services/customerBatchService.ts`
- Create: `server/services/customerBatchService.test.ts`
- Create: `server/routes/customerBatchRoutes.ts`
- Create: `src/api/customerBatchApi.ts`
- Create: `src/api/customerBatchApi.test.ts`

**Interfaces:**
- Produces `CustomerBatchPrecheckRequest`, `CustomerBatchPrecheckResult`, `CreateCustomerBatchJobRequest`, `BatchPrecheckGuardManifest`, and `BatchPrecheckHandlerKey` from `src/types/customerBatch.ts`.
- Produces exported `sha256Json(value): string`, shared `issueBatchPrecheckToken(input): Promise<IssuedBatchPrecheck>` and `consumeBatchPrecheckToken(input, consumer): Promise<ConsumedBatchPrecheckResult>`; both validate actor, handler key, operation, selection hash, input hash, version manifest and guard manifest. `sha256Json` recursively sorts object keys, preserves array order, hashes UTF-8 canonical JSON, and returns a lowercase 64-character SHA-256 hex digest; callers explicitly sort arrays that represent sets. The generic `BatchPrecheckResultConsumer<TType, TValue>` has a literal `resultType` plus transaction-bound `loadResult`, `findExistingResult`, `lockAndRevalidate`, and `createResult` callbacks. The customer mutation handler uses `handlerKey: 'customer_mutation'`; later import/export and merge handlers use this same primitive with their own handler key/result type.
- Produces `precheckCustomerBatch(input, context)`, `createCustomerBatchJob(input, context)`, `getCustomerBatchJob(id, context)`, `listCustomerBatchJobItems(id, context)`, `requestCustomerBatchCancellation(id, context)`.
- HTTP endpoints: `POST /api/customer-batch-jobs/precheck`, `POST /api/customer-batch-jobs`, `GET /api/customer-batch-jobs`, `GET /api/customer-batch-jobs/:id`, `GET /api/customer-batch-jobs/:id/items`, `POST /api/customer-batch-jobs/:id/cancel`.

- [ ] **Step 1: 写出冻结与一次性令牌的失败测试**

```ts
const precheck = await service.precheckCustomerBatch({
  handlerKey: 'customer_mutation',
  operation: 'transfer',
  selection: { mode: 'filter_snapshot', filters: { lifecycleStatusCode: 'following' } },
  input: { targetOwnerId: 'u-2' },
  reason: '团队调整',
}, actorContext);
assert.equal(precheck.totalCount, 201);
assert.equal(precheck.executionMode, 'background');
const created = await service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'click-1' }, actorContext);
const replayed = await service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'click-1' }, actorContext);
assert.equal(replayed.id, created.id);
await assert.rejects(
  () => service.createCustomerBatchJob({ precheckToken: precheck.confirmationToken, idempotencyKey: 'click-2' }, actorContext),
  /预检确认已使用/,
);
```

Add cases for 10,001 selected customers, token expiry, different actor, changed parameters, changed ID list, changed top-level `BusinessRecord.updatedAt`, same idempotency key returning the original job, and selection result omitting users outside `department_only` scope.

Add a guard-manifest replay test: changing either `requiredPermissionKeys`, `ownerId`/scope eligibility, lifecycle configuration revision or tag configuration revision after precheck must make consumption fail before any job or item is inserted. Add a handler-key mismatch test proving an import/export handler cannot consume a `customer_mutation` token.

Add canonical-hash regressions proving `{ b: 2, a: 1 }` and `{ a: 1, b: 2 }` hash identically, arrays with different order hash differently, and the output is exactly 64 lowercase hex characters. These tests make later merge/import idempotency hashes portable and deterministic.

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec tsx server/services/customerBatchSelectionService.test.ts && pnpm exec tsx server/services/customerBatchPrecheckService.test.ts && pnpm exec tsx server/services/customerBatchService.test.ts`

Expected: 失败，提示批量选择或批量服务不存在。

- [ ] **Step 3: 实现确定性选择冻结与版本清单**

```ts
export async function freezeCustomerSelection(input: FreezeSelectionInput): Promise<FrozenCustomerSelection> {
  const records = await findReadableCustomersBySnapshot(input.filters, input.context);
  const ids = input.mode === 'ids'
    ? records.filter((record) => input.customerIds.includes(record.customer.id)).map((record) => record.customer.id)
    : records.map((record) => record.customer.id);
  const frozenIds = [...new Set(ids)].sort();
  if (frozenIds.length > 10_000) throw new Error('单次任务最多处理 10,000 个客户，请缩小筛选范围');
  return {
    customerIds: frozenIds,
    selectionHash: sha256Json(frozenIds),
    versionManifest: Object.fromEntries(
      records
        .filter((record) => frozenIds.includes(record.customer.id))
        .map((record) => [record.customer.id, record.businessRecordUpdatedAt]),
    ),
  };
}
```

Use the *current manageable set* for writing operations, not just readable customers. The repository reads `BusinessRecord(domain: 'aaos_customers')`, parses customer JSON, and returns `{ customer, businessRecordUpdatedAt }`; concurrency always uses the top-level `BusinessRecord.updatedAt`, never the timestamp copied inside customer JSON. Build the version manifest only from `frozenIds`, so an unselected readable customer cannot invalidate the token. Store frozen IDs, original filter snapshot, parameter hash and version manifest in the precheck record. Build precheck item results for every selection row with one primary status and its reason.

- [ ] **Step 4: 实现 10 分钟、单次消费的令牌与任务幂等创建**

```ts
export interface BatchPrecheckResultEnvelope<TType extends string, TValue> {
  type: TType;
  id: string;
  idempotencyFingerprint: string;
  value: TValue;
}

export interface BatchPrecheckResultConsumer<TType extends string, TValue> {
  readonly resultType: TType;
  loadResult(tx: Prisma.TransactionClient, resultId: string): Promise<BatchPrecheckResultEnvelope<TType, TValue> | null>;
  findExistingResult(
    tx: Prisma.TransactionClient,
    input: { actorId: string; handlerKey: string; operation: string; idempotencyKey: string; idempotencyFingerprint: string },
  ): Promise<BatchPrecheckResultEnvelope<TType, TValue> | null>;
  lockAndRevalidate(tx: Prisma.TransactionClient, precheck: CustomerBatchPrecheck): Promise<void>;
  createResult(
    tx: Prisma.TransactionClient,
    precheck: CustomerBatchPrecheck,
    input: { idempotencyKey: string; idempotencyFingerprint: string },
  ): Promise<BatchPrecheckResultEnvelope<TType, TValue>>;
}

return prisma.$transaction(async (tx) => {
  const precheck = await lockBatchPrecheckByToken(tx, tokenHash); // SELECT ... FOR UPDATE
  assertTokenIdentityAndHashes(precheck, { actorId, handlerKey, operation, selectionHash, inputHash });
  const idempotencyFingerprint = sha256Json({ handlerKey, operation, selectionHash, inputHash });

  if (precheck.status === 'consumed') {
    if (precheck.consumedResultType !== consumer.resultType) throw new ConflictError('预检结果类型不匹配');
    const result = await consumer.loadResult(tx, precheck.consumedResultId!);
    if (
      precheck.consumedIdempotencyKey === idempotencyKey &&
      result?.type === consumer.resultType &&
      result.idempotencyFingerprint === idempotencyFingerprint
    ) return result.value;
    if (result && result.type !== consumer.resultType) throw new Error('预检已消费结果类型损坏');
    throw new Error('预检确认已使用');
  }

  assertReadyAndUnexpired(precheck, now);

  const existing = await consumer.findExistingResult(tx, { actorId, handlerKey, operation, idempotencyKey, idempotencyFingerprint });
  if (existing) {
    if (existing.type !== consumer.resultType || existing.idempotencyFingerprint !== idempotencyFingerprint) {
      throw new ConflictError('幂等键已用于不同请求');
    }
    await markPrecheckConsumed(tx, precheck.id, existing.type, existing.id, idempotencyKey, now);
    return existing.value;
  }

  await consumer.lockAndRevalidate(tx, precheck);
  const result = await consumer.createResult(tx, precheck, { idempotencyKey, idempotencyFingerprint });
  if (result.type !== consumer.resultType || result.idempotencyFingerprint !== idempotencyFingerprint) {
    throw new Error('预检结果消费者返回了错误的类型或指纹');
  }
  await markPrecheckConsumed(tx, precheck.id, result.type, result.id, idempotencyKey, now);
  return result.value;
});
```

`consumeBatchPrecheckToken` owns the **only** database transaction; callers must not open an outer transaction or pass a different transaction client. The precheck row lock, handler-specific `lockAndRevalidate`, optional existing-result adoption, result creation, and `status='consumed'`/typed result pointer update all run on that one `tx`. The base layer validates the common token envelope; each consumer locks its own records in deterministic order and revalidates its full guard (customer/config for mutation, file/template/rows/owner for import, current read scope for export, identities/associations/audit watermarks for merge). `loadResult` and `findExistingResult` must also re-authorize the actor's current result visibility before returning a value, so idempotent replay cannot bypass a later permission/scope revocation. Customer mutations/import/export return `type='customer_batch_job'`; merge and undo later return their ledger result without inventing a batch job.

Persist and compare `idempotencyFingerprint = sha256Json({ handlerKey, operation, selectionHash, inputHash })` on every result. A consumed token may return its committed result after the ten-minute deadline only when token identity, persisted result pointer type, the **loaded envelope's runtime `type`**, idempotency key and full fingerprint all match; an unconsumed token must still be unexpired. The same token plus a different key is rejected, and the same key with any different selection or input returns HTTP 409. Add concurrent/sequential tests for all cases, a loaded-envelope wrong-type corruption regression, a different-selection/same-input regression, and a fake non-job consumer proving typed reuse and transaction rollback.

For `customer_mutation`, the `customer_batch_job` consumer's `lockAndRevalidate` locks the frozen `aaos_customers` `BusinessRecord` rows by sorted ID and reloads current permissions, manage scope, top-level record versions, owner identities, lifecycle/tag revisions and action inputs. Its `createResult` writes `CustomerBatchJob.idempotencyFingerprint` and every item on the same `tx`. Phase two provides import/export consumers with their file/row/scope-specific guards; phase three provides merge/undo consumers with identity/association/audit-specific guards.

- [ ] **Step 5: 实现路由与客户端的精确输入验证**

```ts
router.post('/precheck', requireAuth, async (req, res) => {
  const parsed = parseCustomerBatchPrecheckRequest(req.body);
  const context = await loadCustomerAccessContext(req.auth.userId);
  assertCustomerBatchOperationPermissions(context, parsed.operation);
  return sendSuccess(res, await service.precheckCustomerBatch({ ...parsed, handlerKey: 'customer_mutation' }, context));
});
```

The parser must require non-empty reasons, a known action, valid action-specific inputs and a selection mode. The HTTP customer route always supplies `handlerKey: 'customer_mutation'`; it must not accept a client-provided handler key. Do not accept raw client count or client version manifest as authority.

- [ ] **Step 6: 运行预检、接口与构建验证**

Run: `pnpm exec tsx server/services/customerBatchSelectionService.test.ts && pnpm exec tsx server/services/customerBatchPrecheckService.test.ts && pnpm exec tsx server/services/customerBatchService.test.ts && pnpm exec tsx src/api/customerBatchApi.test.ts && pnpm run build`

Expected: 通过；token 不能重放，越权筛选不会扩大范围，重复点击只得到同一个任务。

- [ ] **Step 7: 提交预检与任务创建**

```bash
git add server/services/customerBatchSelectionService.ts server/services/customerBatchSelectionService.test.ts server/services/customerBatchPrecheckService.ts server/services/customerBatchPrecheckService.test.ts server/services/customerBatchService.ts server/services/customerBatchService.test.ts server/routes/customerBatchRoutes.ts src/api/customerBatchApi.ts src/api/customerBatchApi.test.ts src/types/customerBatch.ts
git commit -m "feat: add customer batch precheck and job creation"
```

### Task 8: 实现租约工作者、围栏、取消、部分失败与任务可见性

**Files:**
- Create: `server/services/customerBatchJobHandler.ts`
- Create: `server/services/customerBatchJobHandler.test.ts`
- Create: `server/services/customerBatchWorker.ts`
- Create: `server/services/customerBatchWorker.test.ts`
- Modify: `server/services/customerBatchService.ts`
- Modify: `server/services/customerBatchService.test.ts`
- Modify: `server/routes/customerBatchRoutes.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces `CustomerBatchJobHandler`, `CustomerBatchLeaseContext`, `CustomerBatchJobHandlerRegistry`, and a registered `customer_mutation` handler; later import/export plans register `itemized` or `aggregate` handlers rather than modifying worker business logic.
- Produces `CustomerBatchWorker.start(): void`, `stop(): Promise<void>`, `runOnce(): Promise<number>`.
- Produces `claimBatchJob(workerId)`, `heartbeatBatchJob(jobId, workerId, epoch)`, `processBatchJob(jobId, workerId, epoch)`, `finalizeBatchJob(jobId, workerId, epoch)`.
- Consumes the Task 5 production-composed `CustomerAtomicCommandService.execute` and `appendCustomerAuditEvent`.

- [ ] **Step 1: 写出租约、围栏、取消和部分失败的失败测试**

```ts
const claimA = await workerA.claimBatchJob('job-1');
assert.equal(claimA.leaseEpoch, 1);
advanceClockBy(61_000);
const claimB = await workerB.claimBatchJob('job-1');
assert.equal(claimB.leaseEpoch, 2);
await assert.rejects(() => workerA.commitItem('job-1', 1, 'c-1'), /租约已失效/);
await service.requestCustomerBatchCancellation('job-1', creatorContext);
await workerB.processBatchJob('job-1', 2);
assert.deepEqual(await jobCounts('job-1'), { success: 1, failed: 1, skipped: 0, cancelled: 3 });
assert.equal((await getJob('job-1')).status, 'cancelled');
```

Add cases for: service restart recovers an expired `running` job; successful item transaction cannot run twice; permission/data/version/state conflicts are non-retryable; worker/database transient failures are retryable; an audit reader sees only in-scope item rows; an audit reader without cancel permission receives 403 when cancelling another user’s task. Add both cancellation windows explicitly: (1) a live lease owner observes `cancel_requested` after its current item commit and settles immediately with the same lease/epoch without another handler call; (2) a lease owner dies after `cancel_requested`, a new worker claims only after `leaseExpiresAt`, marks every unstarted item `cancelled`, and finalizes without dispatching the customer-mutation handler.

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec tsx server/services/customerBatchJobHandler.test.ts && pnpm exec tsx server/services/customerBatchWorker.test.ts && pnpm exec tsx server/services/customerBatchService.test.ts`

Expected: 失败，提示工作者类或租约方法不存在。

- [ ] **Step 3: 实现数据库租约与围栏条件更新**

```ts
const claim = await prisma.customerBatchJob.updateMany({
  where: {
    id: jobId,
    OR: [
      { status: 'queued' },
      { status: 'running', leaseExpiresAt: { lt: now } },
      { status: 'cancel_requested', leaseExpiresAt: { lt: now } },
    ],
  },
  data: {
    leaseOwner: workerId,
    leaseEpoch: { increment: 1 },
    leaseExpiresAt: addSeconds(now, 60),
    heartbeatAt: now,
    startedAt: now,
  },
});
if (claim.count !== 1) return null;
```

After claim, reload the row under the same transaction. If it was `queued`, set it to `running`; if it was already `running`, retain `running`; if it was `cancel_requested`, retain that state. Before every business-handler batch and again inside each item transaction, verify `{ id, status: 'running', leaseOwner: workerId, leaseEpoch, cancelRequestedAt: null }`. A worker that loses this comparison returns without a business write. If a claimed or already-owned job is `cancel_requested`, it must execute only `settleCancelledJobWithLease` and never load/call a handler. That cancellation transaction uses the separate fence `{ id, status: 'cancel_requested', leaseOwner: workerId, leaseEpoch }`, marks all queued/unstarted items cancelled, recomputes counts, and conditionally moves the job to `cancelled`. Process `customer_mutation` target keys in lexicographic order in chunks of 100; lock and update one item plus its customer command/audit in one transaction.

```ts
export interface CustomerBatchJobHandler {
  readonly handlerKey: string;
  readonly executionKind: 'itemized' | 'aggregate';
  processItem?(input: ProcessBatchItemInput, lease: CustomerBatchLeaseContext): Promise<ProcessBatchItemResult>;
  processAggregate?(input: ProcessBatchJobInput, lease: CustomerBatchLeaseContext): Promise<ProcessBatchJobResult>;
  finalize?(input: FinalizeBatchJobInput, lease: CustomerBatchLeaseContext): Promise<void>;
}

export interface CustomerBatchLeaseContext {
  readonly jobId: string;
  readonly workerId: string;
  readonly leaseEpoch: number;
  assertActive(tx?: Prisma.TransactionClient): Promise<void>;
  heartbeat(): Promise<void>;
  cancellationRequested(): Promise<boolean>;
}

export class CustomerBatchJobHandlerRegistry {
  constructor(private readonly handlers: readonly CustomerBatchJobHandler[]) {}
  get(handlerKey: string): CustomerBatchJobHandler {
    const handler = this.handlers.find((candidate) => candidate.handlerKey === handlerKey);
    if (!handler) throw new Error(`未注册的批量任务处理器：${handlerKey}`);
    return handler;
  }
}
```

The worker owns lease acquisition, heartbeat, fencing, cancellation settlement and final counts only. An `itemized` handler is invoked once per persisted `targetKey` and may use `finalize` for a result report. An `aggregate` handler is invoked once for the frozen job and must call `lease.assertActive()` immediately before every database/file commit. Validate at registry construction that itemized handlers implement `processItem` and aggregate handlers implement `processAggregate`. The `customer_mutation` handler is itemized and invokes the Task 5 production-composed atomic command service. The second stage registers an itemized import handler and aggregate export handler; the worker contains no import/export conditionals.

- [ ] **Step 4: 实现已处理明细幂等与状态结算**

```ts
const item = await tx.customerBatchJobItem.findUnique({ where: { jobId_targetKey: { jobId, targetKey } } });
if (item?.status === 'succeeded') return { kind: 'already_succeeded' };
if (item?.status === 'cancelled') return { kind: 'already_cancelled' };
await tx.customerBatchJobItem.update({
  where: { id: item!.id },
  data: { status: 'running', attemptCount: { increment: 1 }, startedAt: now },
});
```

Use database unique item idempotency keys for todo/activity side effects. Convert a precheck version mismatch, changed owner, removed permission, scope loss, disabled tag/status or business-state violation into `failed` with `retryable: false`. Only connection-reset, worker crash recovery and classified transient database errors set `retryable: true`.

- [ ] **Step 5: 实现取消、读权限和报告入口**

```ts
export async function requestCustomerBatchCancellation(jobId: string, context: CustomerAccessContext): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const job = await lockJob(tx, jobId);
    const isCreator = job.actorId === context.actorId;
    if (!isCreator) {
      assertPermission(context, PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL);
      await assertEveryJobCustomerManageable(tx, job, context);
    }
    if (job.status === 'queued') {
      await tx.customerBatchJobItem.updateMany({
        where: { jobId, status: 'queued' },
        data: { status: 'cancelled', finishedAt: new Date() },
      });
      await transitionJob(tx, job.id, ['queued'], 'cancelled', { cancelRequestedAt: new Date(), cancelledAt: new Date() });
      return;
    }
    if (job.status === 'running') {
      await transitionJob(tx, job.id, ['running'], 'cancel_requested', { cancelRequestedAt: new Date() });
    }
  });
}
```

When a queued job is cancelled, the request transaction marks all unstarted rows cancelled and finishes immediately through the documented direct `queued → cancelled` edge. When a running job is changed to `cancel_requested`, the current lease owner checks that state immediately after its current item transaction and calls `settleCancelledJobWithLease`; it does not wait for lease expiry and cannot call the business handler again. If that owner dies, a new worker may claim the expired `cancel_requested` lease and run the same settlement-only path. Repeated cancellation of a terminal/cancel-requested job is idempotent. A job creator may see their own summary; another viewer needs `CUSTOMER_BATCH_AUDIT_READ` and item rows must be filtered through current `canReadCustomer`. Result-file download implementation belongs to the export plan; in this phase expose a structured JSON result endpoint under the same authorization rule.

- [ ] **Step 6: 启动并安全关闭工作者**

```ts
const customerBatchWorker = createCustomerBatchWorker({ prisma, workerId: `${process.pid}-${randomUUID()}` });
customerBatchWorker.start();
process.once('SIGTERM', () => void customerBatchWorker.stop());
process.once('SIGINT', () => void customerBatchWorker.stop());
```

Run polling at a fixed short interval with a re-entrancy guard. On startup call `runOnce` so stale leases become eligible without waiting for a new HTTP request.

- [ ] **Step 7: 运行并发、取消和恢复验证**

Run: `pnpm exec tsx server/services/customerBatchJobHandler.test.ts && pnpm exec tsx server/services/customerBatchWorker.test.ts && pnpm exec tsx server/services/customerBatchService.test.ts && pnpm exec tsx server/services/customerCommandService.test.ts`

Expected: 通过；双工作者只有新 epoch 可提交；服务重启不重复副作用；取消只中止未开始明细。

- [ ] **Step 8: 提交任务执行器**

```bash
git add server/services/customerBatchJobHandler.ts server/services/customerBatchJobHandler.test.ts server/services/customerBatchWorker.ts server/services/customerBatchWorker.test.ts server/services/customerBatchService.ts server/services/customerBatchService.test.ts server/routes/customerBatchRoutes.ts server/index.ts
git commit -m "feat: execute customer batch jobs with leases"
```

### Task 9: 在客户列表交付选择、预检确认、任务进度和取消界面

**Files:**
- Create: `src/shared/utils/customerBatchSelection.ts`
- Create: `src/shared/utils/customerBatchSelection.test.ts`
- Create: `src/pages/Customers/batch/CustomerBatchToolbar.tsx`
- Create: `src/pages/Customers/batch/CustomerBatchActionDialog.tsx`
- Create: `src/pages/Customers/batch/CustomerBatchTaskDrawer.tsx`
- Create: `src/pages/Customers/batch/CustomerBatchActionDialog.test.ts`
- Modify: `src/pages/Customers/index.tsx`
- Modify: `src/api/customerBatchApi.ts`
- Modify: `src/api/customerBatchApi.test.ts`

**Interfaces:**
- Consumes `CustomerBatchOperation`, `CustomerBatchPrecheckResult`, `CustomerBatchJobSummary` from Task 5 and `customerBatchApi` from Task 7.
- Produces `CustomerBatchSelectionState`, `CustomerBatchToolbar`, `CustomerBatchActionDialog`, `CustomerBatchTaskDrawer`.

- [ ] **Step 1: 写出选择范围和动作显示的失败测试**

```ts
const state = selectPageCustomers(emptySelection(), ['c-1', 'c-2']);
assert.deepEqual(state.selectedIds, ['c-1', 'c-2']);
assert.equal(canOfferBatchAction(['客户/批量管理客户'], 'transfer'), false);
assert.equal(canOfferBatchAction(['客户/批量管理客户', '客户/转让／分配客户'], 'transfer'), true);
assert.equal(getExecutionPresentation({ totalCount: 201, selectionMode: 'ids' }), 'background');
```

The dialog test must assert that no confirm button is enabled until an accepted precheck token exists, an action reason is non-empty, and the backend result shows both executable and blocked counts.

Keep `CustomerBatchActionDialog.test.ts` free of JSX: export and test pure dialog-state helpers such as `canSubmitBatchDialog(state)` and `getBatchDialogPresentation(precheck)`. Component rendering remains covered by the production build and browser acceptance step.

- [ ] **Step 2: 运行失败测试**

Run: `pnpm exec tsx src/shared/utils/customerBatchSelection.test.ts && pnpm exec tsx src/pages/Customers/batch/CustomerBatchActionDialog.test.ts`

Expected: 失败，提示选择工具或批量组件不存在。

- [ ] **Step 3: 实现只保存用户意图的选择状态**

```ts
export interface CustomerBatchSelectionState {
  mode: 'ids' | 'filter_snapshot';
  selectedIds: string[];
  filters: CustomerListFilters | null;
}

export function selectCurrentFilterResult(filters: CustomerListFilters): CustomerBatchSelectionState {
  return { mode: 'filter_snapshot', selectedIds: [], filters: structuredClone(filters) };
}
```

The client never invents an all-customer count or stores a privileged result set. It sends page IDs or a filter snapshot to the precheck API; the server freezes the actual permitted IDs.

- [ ] **Step 4: 实现工具条、参数表单和预检结果确认**

```tsx
<CustomerBatchToolbar
  selection={selection}
  availableActions={availableActions}
  onChooseAction={(operation) => setDialogOperation(operation)}
  onClear={() => setSelection(emptySelection())}
/>
<CustomerBatchActionDialog
  operation={dialogOperation}
  selection={selection}
  onPrecheck={customerBatchApi.precheck}
  onCreated={(job) => setOpenTaskId(job.id)}
/>
```

Render only actions whose entire leaf permission composition passes locally. Still send all requests to the server. Use action-specific form controls: active employee selector plus reason for transfer; reason for release/delete; lifecycle selector from manual targets plus reason; add/remove tag selector plus reason; title/content/dueAt/executionMethod plus reason for todo. Delete requires a typed high-risk confirmation and cannot show a confirm action before precheck.

- [ ] **Step 5: 实现任务抽屉并按状态轮询**

```tsx
useEffect(() => {
  if (!jobId || isTerminalJobStatus(job?.status)) return;
  const timer = window.setInterval(() => void refreshJob(jobId), 2_000);
  return () => window.clearInterval(timer);
}, [jobId, job?.status, refreshJob]);
```

Display total, success, failure, skipped and cancelled counts, then the filtered item reasons returned by the server. Show cancel only for creators or users with `CUSTOMER_BATCH_CANCEL`; hide it once status is terminal or the server says cancellation is unavailable. Leaving the page must not issue cancellation.

- [ ] **Step 6: 接入客户列表且保持原有单客户操作**

Add the selection checkbox as the first `TableCell`, a header checkbox for current page, and an explicit banner action for “选择当前筛选结果全部客户”. Do not remove existing filter, pagination, list/detail, public-pool or single-customer controls. Clear selection when the user changes the active tab or selects a different filter-result-all snapshot.

- [ ] **Step 7: 运行前端契约、后端接口和构建验证**

Run: `pnpm exec tsx src/shared/utils/customerBatchSelection.test.ts && pnpm exec tsx src/pages/Customers/batch/CustomerBatchActionDialog.test.ts && pnpm exec tsx src/api/customerBatchApi.test.ts && pnpm run build`

Expected: 通过；没有组合权限的动作不可见；无预检令牌不能创建任务；超过 200 项显示后台任务提示。

- [ ] **Step 8: 提交批量管理界面**

```bash
git add src/shared/utils/customerBatchSelection.ts src/shared/utils/customerBatchSelection.test.ts src/pages/Customers/batch/CustomerBatchToolbar.tsx src/pages/Customers/batch/CustomerBatchActionDialog.tsx src/pages/Customers/batch/CustomerBatchTaskDrawer.tsx src/pages/Customers/batch/CustomerBatchActionDialog.test.ts src/pages/Customers/index.tsx src/api/customerBatchApi.ts src/api/customerBatchApi.test.ts
git commit -m "feat: add customer batch management interface"
```

### Task 10: 做完整迁移演练、端到端验收和发布门禁

**Files:**
- Create: `scripts/audit-customer-permission-migration.ts`
- Create: `scripts/verify-customer-batch-foundation.ts`
- Modify: `scripts/audit-customer-associations.ts`
- Create: `server/services/customerBatchFoundation.integration.test.ts`
- Modify: `package.json`
- Create: `docs/releases/2026-07-customer-batch-foundation-verification.md`

**Interfaces:**
- Produces `pnpm run customer:permission-audit`, `pnpm run customer:association-audit`, and `pnpm run customer:batch-verify`.
- Consumes the migrations, command service, worker and batch API from Tasks 1–9.

- [ ] **Step 1: 写出发布门禁的失败集成测试**

```ts
await assert.rejects(
  () => batchService.precheckCustomerBatch(transferRequest, batchOnlyContext),
  /转让／分配客户/,
);
const departmentOnly = await batchService.precheckCustomerBatch(filterAllRequest, departmentOnlyContext);
assert.deepEqual(departmentOnly.executableCustomerIds, ['same-department-customer']);
await mutateCustomerOwner('same-department-customer', 'u-9');
await worker.runOnce();
assert.equal((await getJobItem('job-1', 'same-department-customer')).errorCode, 'CUSTOMER_VERSION_CONFLICT');
```

Add integration scenarios for: idempotent double submit, 10,000/10,001 boundary, worker restart, stale lease fencing, execution-time permission revocation, cancellation during execution, public-pool lifecycle bypass rejection, transfer/release todo behavior, and delete association block.

Add the P0 privilege-regression matrix using persisted legacy parent records whose actions are respectively `['read']`, `['write']`, `['delete']`, and `['admin']`: after normalization and after migration, only the `read` case may grant list/detail, while direct precheck and direct single-command requests for progress, transfer, batch manage, delete, import, export, merge and batch cancellation must be denied for every parent-action case. Explicit leaf grants are tested separately. This matrix is release-blocking.

- [ ] **Step 2: 运行失败集成测试**

Run: `pnpm exec tsx server/services/customerBatchFoundation.integration.test.ts`

Expected: 失败 until every prior task is merged and the migration-backed test database is initialized.

- [ ] **Step 3: 实现迁移差异审计和部署前检查**

```ts
const report = await auditCustomerPermissionMigration(prisma);
if (report.unexpectedPrivilegeChanges.length > 0 || report.unexpectedScopeChanges.length > 0) {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
} else {
  console.info(JSON.stringify(report, null, 2));
}
```

The audit must compare effective leaf permissions and `customers` scope before/after migration by role ID, list unresolved/ambiguous owner identities, and return a non-zero exit code for unapproved expansion or reduction. The batch verifier must create sample records, run both worker-recovery and cancellation cases, and clean up only its own prefixed fixtures.

- [ ] **Step 4: 加入精确脚本并运行全量门禁**

```json
{
  "customer:permission-audit": "tsx scripts/audit-customer-permission-migration.ts",
  "customer:association-audit": "tsx scripts/audit-customer-associations.ts",
  "customer:batch-verify": "tsx scripts/verify-customer-batch-foundation.ts"
}
```

Run on a production-data copy in this order: `pnpm exec tsx scripts/prepare-customer-permission-migration.ts capture --out private_reports/customer-permission-v1.json`, then `pnpm exec tsx scripts/prepare-customer-permission-migration.ts apply-manifest --file private_reports/customer-permission-v1.json`, then `pnpm run db:generate && pnpm run db:deploy && pnpm exec tsx server/services/customerBatchFoundation.integration.test.ts && pnpm test && pnpm run build && pnpm run customer:permission-audit && pnpm run customer:association-audit -- --dry-run --out private_reports/customer-association-v1.json && pnpm run customer:batch-verify`.

Expected: Prisma client generated; integration suite, complete suite and production build pass; permission migration reports zero unexpected changes; association audit lists every deterministic backfill and unresolved/ambiguous repair row without guessing; verifier reports lease recovery, cancellation and idempotency success. Any unknown customer-linked domain or unresolved record for a merge-eligible group blocks release until repaired or explicitly registered.

- [ ] **Step 5: 手工浏览器验收并记录结果**

Use two users configured through the role permission page: one with batch management only and one with batch management plus transfer. Verify that the first user sees no transfer action and receives 403 from a direct request; verify a `department_only` user cannot freeze descendants; verify a running task continues after closing the drawer; verify cancel stops only unstarted rows; verify customer detail shows the appended operation summary without exposing full sensitive values.

- [ ] **Step 6: 提交发布门禁**

```bash
git add scripts/audit-customer-permission-migration.ts scripts/audit-customer-associations.ts scripts/verify-customer-batch-foundation.ts server/services/customerBatchFoundation.integration.test.ts package.json docs/releases/2026-07-customer-batch-foundation-verification.md
git commit -m "test: verify customer batch foundation release gates"
```

## Acceptance Traceability

| 已确认验收项 | 实现任务 |
| --- | --- |
| 权限组合、管理员可配置、无角色名称判断 | 1、2、3、9、10 |
| 四级范围与 `department` 兼容迁移 | 1、2、3、7、10 |
| 读取与可管理分离、稳定 `ownerId` | 3、4、6、10 |
| 10,000 上限、全筛选冻结、10 分钟令牌、任务幂等 | 5、7、8、10 |
| 租约、围栏、心跳、恢复、取消和部分失败 | 8、10 |
| 转让、放弃、进展、标签、待办、软删除原子规则 | 3、4、8、9、10 |
| 联系方式身份、历史冲突候选和后续导入/合并前置条件 | 5、6、10 |
| 客户关联注册表、历史稳定ID审计清单和删除全关联阻断 | 4、10 |
| 批量 UI、任务中心、当前授权下的明细可见性 | 7、8、9、10 |

## Completion Definition

第一批完成时，管理员可用树型权限和四级范围配置客户操作；所有旧单笔客户写入口均无法绕过叶子权限和 `ownerId` 管理权；用户可在客户列表预检并执行六类批量操作；后台任务在重启、并发抢占、取消和部分失败下保持幂等与可审计；联系方式冲突不会继续扩大；迁移审计、模块测试、完整测试、生产构建与浏览器验收均通过。

## Self-Review

- **Spec coverage:** Tasks 1–3 cover permission-tree compatibility, four customer scopes and read/manage policy; Tasks 4–6 establish audited atomic commands and contact identity safety; Tasks 7–9 deliver reusable precheck/job/worker/UI infrastructure; Task 10 blocks release on privilege, migration, lease, cancellation or idempotency regressions.
- **Placeholder scan:** Every required migration, service, route, client, UI module, test and release artifact has an exact path; no role-name rule, sharing action, vendor importer or deferred authorization decision remains.
- **Type consistency:** Customers stay in `BusinessRecord(domain='aaos_customers')`; non-customer domains retain `DataScopeLevel`; only customers use `CustomerDataScopeLevel`; generic prechecks return typed results and generic workers dispatch strictly through `CustomerBatchJobHandler`.
