# 极享OS 安全止血与迁移底座 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 在不中断现有页面的前提下，收紧核心 API 权限、限制旧 storage 接口、让持久化失败可见，并消除新浏览器创建客户时覆盖整张客户表的路径。

**Architecture:** 保留现有 Express + Prisma + React 结构。服务端新增旧存储访问策略，所有 storage route 都通过该策略检查；客户和线索的专用 route 使用明确的功能权限。客户新建改走单资源服务端命令，旧数组写入仅继续支撑尚未迁移的领域，并先改为事务内完成整次替换。

**Tech Stack:** TypeScript、Express 5、Prisma 6 / MySQL、React 18、MUI、Node assert 测试、tsx。

## Global Constraints

- 现有可用页面在迁移期间保持可操作；每个旧入口只有在新接口接管并通过回归测试后才关闭。
- 每个领域迁移前必须完成数据库备份、记录数核对和可恢复性检查。
- 按领域逐步迁移，每个阶段可独立部署、验证和回滚。
- 不保留永久运行时双写。迁移后的新写只进入新权威模型，旧数据源仅作为只读迁移输入或可丢弃投影。
- 姓名、公司名、手机号、微信号只能用于搜索或人工消歧，不能充当外键、权限主体或唯一身份。
- 所有业务权限以服务端当前会话、角色和资源事实为准；前端按钮权限只用于用户体验。
- 所有新增或改变的行为采用测试先行；测试必须先观察到正确原因的失败，再实现最小修复。
- 电商结算中心、GEO 增长中心和 AI 助手不改动业务流程；仅让它们经过受权限约束的兼容存储策略。
- 当前主工作区存在用户的客户列表修复和另一份已暂存设计文档。执行本计划前必须在隔离 worktree 中开始，且每次提交只包含本任务列出的文件。

---

## Scope boundary

本计划对应规格中的子项目 0：安全止血与迁移底座。它不建立正式的 Order、Delivery、AfterSales、Commission、Finance 或 Asset typed tables，也不删除旧的 localStorage API。

本计划完成后，未迁移业务 key 仍可能使用旧 JSON 结构，但不再是任意已登录用户可自由枚举或任意 key 读写的接口。对象级数据范围、订单/财务状态机和资产关系事务由后续子项目接管。

## File structure

| 文件 | 责任 |
|---|---|
| server/middleware/auth.ts | 提供任一许可即可通过的服务端 middleware。 |
| server/services/legacyStorageAccess.ts | 将已登记 storage key 映射到读、写、runtime 权限；未登记 key 默认拒绝。 |
| server/services/legacyStorageAccess.test.ts | 验证 key 白名单、权限映射和默认拒绝。 |
| server/index.ts | 为客户/线索 route 绑定权限，并让 storage route 执行兼容策略。 |
| server/storageRoutesAuth.test.ts | 锁定 storage route 不再使用仅登录访问模型。 |
| server/services/customerListService.ts | 增加仅创建一个 Customer 的过渡命令。 |
| server/services/customerListService.test.ts | 验证新建客户不会触发整域删除。 |
| server/services/storageService.ts | 让遗留整数组替换在一个 Prisma transaction 内执行。 |
| server/services/storageService.test.ts | 验证写入通过 transaction 执行，失败时不继续 delete。 |
| src/api/storageSyncStatus.ts | 提供持久化失败事件和订阅接口。 |
| src/api/storageSyncStatus.test.ts | 验证订阅、上报和清除。 |
| src/api/backendClient.ts | 把 storage PUT/DELETE 失败变为可订阅错误。 |
| src/api/mock/storage.ts | 在遗留同步调用点捕获失败并上报全局通知。 |
| src/shared/components/StorageSyncFailureNotice.tsx | 用 MUI Snackbar 告知用户本次修改未保存。 |
| src/App.tsx | 挂载全局持久化失败通知。 |
| src/api/customerApi.ts | backend 模式下把新建客户改为 POST /api/customers。 |
| src/api/customerCreateBackend.test.ts | 验证 backend 模式新建客户不写 localStorage 整表。 |
| docs/operations/phase-0-security-rollout.md | 记录备份、发布、验证、恢复和逐 key 关闭步骤。 |

## Storage policy inventory

所有未列出的 key 均返回 403。所有 Asset key 继续委托现有 assetStorageAccess 的读取过滤和写入判断。

| Key 组 | 读权限（任一） | 写权限（任一） | runtime |
|---|---|---|---|
| LEADS | LEADS_LIST | LEADS_CREATE、LEADS_FOLLOW、LEADS_FLOW_CONFIG | 否 |
| CUSTOMERS | CUSTOMER_LIST | CUSTOMER_CREATE、CUSTOMER_EDIT、CUSTOMER_ASSIGN | 否 |
| ORDERS | ORDER_MANAGE | ORDER_CREATE、ORDER_EDIT、ORDER_DELETE | 是 |
| ORDER_APPLICATIONS | ORDER_REVIEW、ORDER_MANAGE | ORDER_REVIEW | 是 |
| DELIVERIES | DELIVERY_CENTER | DELIVERY_MOVE_CARD、DELIVERY_STAGE_CONFIG | 是 |
| COMMISSIONS | FINANCE_MY_COMMISSION、FINANCE_SETTLEMENT、FINANCE_RECOVERY_SETTLEMENT、FINANCE_PAYOUT | FINANCE_SETTLEMENT、FINANCE_RECOVERY_SETTLEMENT、FINANCE_PAYOUT | 是 |
| COMMISSION_OPERATION_LOGS | FINANCE_SETTLEMENT、FINANCE_RECOVERY_SETTLEMENT、FINANCE_PAYOUT | FINANCE_SETTLEMENT、FINANCE_RECOVERY_SETTLEMENT、FINANCE_PAYOUT | 是 |
| COMMISSION_SETTLEMENT_BATCHES | FINANCE_PAYOUT、FINANCE_SETTLEMENT | FINANCE_PAYOUT | 是 |
| MONTHLY_COMMISSION_TIER_CONFIGS、COMMISSION_RULES、COMMISSION_ROLE_CONFIGS | FINANCE_RULES | FINANCE_RULES | 是 |
| FINANCE | FINANCE_OVERVIEW、FINANCE_FLOW、FINANCE_PAYOUT | FINANCE_OVERVIEW、FINANCE_FLOW、FINANCE_PAYOUT | 是 |
| RECOVERY_ORDERS | AFTER_SALES_RECOVERY | AFTER_SALES_RECOVERY_CREATE、AFTER_SALES_RECOVERY_EDIT、AFTER_SALES_RECOVERY_REVIEW、AFTER_SALES_RECOVERY_DELETE | 是 |
| REFUNDS | AFTER_SALES_REFUND、FINANCE_REFUND | AFTER_SALES_REFUND、FINANCE_REFUND | 是 |
| SERVICE_TICKETS | AFTER_SALES_TICKETS | AFTER_SALES_TICKETS | 是 |
| OPPORTUNITIES | CUSTOMER_VIEW_ORDERS | CUSTOMER_CREATE_ORDER | 是 |
| AI_CARDS | CUSTOMER_AI_CARD | CUSTOMER_AI_CARD | 是 |
| AI_SESSIONS | AI_CHAT | AI_CHAT | 是 |
| PRODUCTS、PRODUCT_LEVELS | SETTINGS_PRODUCTS | SETTINGS_PRODUCTS | 是 |
| TAGS | CUSTOMER_LIST | CUSTOMER_EDIT | 是 |
| USERS、DEPARTMENTS、POSITIONS | SETTINGS_EMPLOYEES_DEPARTMENTS | SETTINGS_EMPLOYEES_DEPARTMENTS | 是 |
| ROLES | SETTINGS_ROLES | SETTINGS_ROLES | 是 |
| ORGANIZATION_PROFILE、ORGANIZATION_SCHEMA_VERSION | SETTINGS_EMPLOYEES_DEPARTMENTS | SETTINGS_EMPLOYEES_DEPARTMENTS | 是 |
| ORDER_TYPE_CONFIGS | SETTINGS_ORDER_TYPES | SETTINGS_ORDER_TYPES | 是 |
| CUSTOMER_LEVEL_CONFIGS | SETTINGS_CUSTOMER_LEVELS | SETTINGS_CUSTOMER_LEVELS | 是 |
| LIFECYCLE_STATUS_CONFIGS | SETTINGS_LIFECYCLE | SETTINGS_LIFECYCLE | 是 |
| LEAD_SOURCE_CONFIGS、LEAD_FLOW_CONFIG、LEAD_INTAKE_RECORDS | SETTINGS_LEAD_FLOW、LEADS_INTAKE_STATUS | SETTINGS_LEAD_FLOW、LEADS_FLOW_CONFIG | 是 |
| ECOMMERCE_SETTLEMENT_RECORDS | ECOMMERCE_SETTLEMENT_WORKBENCH、ECOMMERCE_SETTLEMENT_HISTORY、ECOMMERCE_SETTLEMENT_EXCEPTIONS、ECOMMERCE_SETTLEMENT_TALENTS | ECOMMERCE_SETTLEMENT_WORKBENCH | 是 |
| ECOMMERCE_SETTLEMENT_CONFIG | ECOMMERCE_SETTLEMENT_SETTINGS、ECOMMERCE_SETTLEMENT_RULES | ECOMMERCE_SETTLEMENT_SETTINGS、ECOMMERCE_SETTLEMENT_RULES | 是 |
| INITIALIZED | HOME | HOME | 是 |

### Task 1: Add reusable server-side any-permission middleware

**Files:**

- Modify: server/middleware/auth.ts
- Modify: server/middleware/auth.test.ts

**Interfaces:**

- Consumes: AuthReader.getCurrentUser(token) and shared hasPermission.
- Produces: createRequireAnyPermission(authService, permissionKeys, action), an Express RequestHandler.

- [ ] **Step 1: Write the failing test**

Append to server/middleware/auth.test.ts:

    import { createRequireAnyPermission } from './auth';

    middleware = createRequireAnyPermission({
      getCurrentUser: async () => ({
        code: 0,
        data: {
          ...activeUser,
          permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
        },
        message: 'success',
      }),
    }, [PERMISSION_KEYS.CUSTOMER_LIST, PERMISSION_KEYS.LEADS_LIST]);
    response = createResponse();
    nextCalled = false;
    await middleware({ headers: { authorization: 'Bearer token' } } as any, response as any, next as any);
    assert.equal(response.statusCode, 200);
    assert.equal(nextCalled, true);

    middleware = createRequireAnyPermission({
      getCurrentUser: async () => ({ code: 0, data: { ...activeUser, permissions: [] }, message: 'success' }),
    }, [PERMISSION_KEYS.CUSTOMER_LIST, PERMISSION_KEYS.LEADS_LIST]);
    response = createResponse();
    nextCalled = false;
    await middleware({ headers: { authorization: 'Bearer token' } } as any, response as any, next as any);
    assert.equal(response.statusCode, 403);
    assert.equal(nextCalled, false);

- [ ] **Step 2: Run the test to verify it fails**

Run:

    npx tsx server/middleware/auth.test.ts

Expected: TypeScript fails because createRequireAnyPermission is not exported.

- [ ] **Step 3: Implement the middleware**

Add below createRequireAuth in server/middleware/auth.ts:

    export function createRequireAnyPermission(
      authService: AuthReader,
      permissionKeys: readonly string[],
      action = 'read',
    ): RequestHandler {
      return async (req: Request, res: Response, next: NextFunction) => {
        const auth = await authService.getCurrentUser(bearerToken(req));
        const user = auth.code === 0 ? auth.data : null;
        if (!user) {
          res.status(401).json({ code: 401, data: null, message: 'Unauthorized' });
          return;
        }
        if (!permissionKeys.some((permissionKey) => hasPermission(user, permissionKey, action))) {
          res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
          return;
        }
        (req as AuthenticatedRequest).currentUser = user;
        next();
      };
    }

- [ ] **Step 4: Run the focused test**

Run:

    npx tsx server/middleware/auth.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

    git add server/middleware/auth.ts server/middleware/auth.test.ts
    git commit -m "feat: add server any-permission middleware"

### Task 2: Define a deny-by-default legacy storage permission policy

**Files:**

- Create: server/services/legacyStorageAccess.ts
- Create: server/services/legacyStorageAccess.test.ts

**Interfaces:**

- Produces:

    export type LegacyStorageOperation = 'read' | 'write' | 'runtime';

    export function canAccessLegacyStorageKey(
      user: AuthenticatedUser,
      key: string,
      operation: LegacyStorageOperation,
    ): boolean;

    export function isLegacyStorageKeyRegistered(key: string): boolean;

- [ ] **Step 1: Write the failing test**

Create server/services/legacyStorageAccess.test.ts:

    import assert from 'node:assert/strict';
    import { STORAGE_KEYS } from '../../src/shared/utils/constants';
    import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
    import {
      canAccessLegacyStorageKey,
      isLegacyStorageKeyRegistered,
    } from './legacyStorageAccess';

    const user = {
      id: 'user-sales', name: '销售', account: 'sales', email: '', phone: '',
      role: '销售顾问' as any, isActive: true,
      permissions: [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
    };

    assert.equal(isLegacyStorageKeyRegistered(STORAGE_KEYS.CUSTOMERS), true);
    assert.equal(canAccessLegacyStorageKey(user, STORAGE_KEYS.CUSTOMERS, 'read'), true);
    assert.equal(canAccessLegacyStorageKey(user, STORAGE_KEYS.CUSTOMERS, 'write'), false);
    assert.equal(canAccessLegacyStorageKey(user, STORAGE_KEYS.COMMISSIONS, 'read'), false);
    assert.equal(isLegacyStorageKeyRegistered('aaos_unknown_private_data'), false);
    assert.equal(canAccessLegacyStorageKey(user, 'aaos_unknown_private_data', 'read'), false);

- [ ] **Step 2: Run the test to verify it fails**

Run:

    npx tsx server/services/legacyStorageAccess.test.ts

Expected: TypeScript fails because the module does not exist.

- [ ] **Step 3: Implement the policy**

Create server/services/legacyStorageAccess.ts. Populate policies with every row in Storage policy inventory, using the exact STORAGE_KEYS and PERMISSION_KEYS symbols listed there.

    import type { AuthenticatedUser } from '../../src/types/auth';
    import { STORAGE_KEYS } from '../../src/shared/utils/constants';
    import { PERMISSION_KEYS, hasPermission } from '../../src/shared/utils/permissions';
    import { canReadStorageKey, canWriteStorageKey, isAssetStorageKey } from './assetStorageAccess';

    export type LegacyStorageOperation = 'read' | 'write' | 'runtime';

    type LegacyStoragePolicy = {
      read: readonly string[];
      write: readonly string[];
      runtime: boolean;
    };

    const policies: Record<string, LegacyStoragePolicy> = {};

    function register(
      keys: readonly string[],
      read: readonly string[],
      write: readonly string[],
      runtime = true,
    ) {
      keys.forEach((key) => {
        policies[key] = { read, write, runtime };
      });
    }

    register([STORAGE_KEYS.LEADS], [PERMISSION_KEYS.LEADS_LIST],
      [PERMISSION_KEYS.LEADS_CREATE, PERMISSION_KEYS.LEADS_FOLLOW, PERMISSION_KEYS.LEADS_FLOW_CONFIG], false);
    register([STORAGE_KEYS.CUSTOMERS], [PERMISSION_KEYS.CUSTOMER_LIST],
      [PERMISSION_KEYS.CUSTOMER_CREATE, PERMISSION_KEYS.CUSTOMER_EDIT, PERMISSION_KEYS.CUSTOMER_ASSIGN], false);
    register([STORAGE_KEYS.ORDERS], [PERMISSION_KEYS.ORDER_MANAGE],
      [PERMISSION_KEYS.ORDER_CREATE, PERMISSION_KEYS.ORDER_EDIT, PERMISSION_KEYS.ORDER_DELETE]);
    register([STORAGE_KEYS.ORDER_APPLICATIONS], [PERMISSION_KEYS.ORDER_REVIEW, PERMISSION_KEYS.ORDER_MANAGE],
      [PERMISSION_KEYS.ORDER_REVIEW]);
    register([STORAGE_KEYS.DELIVERIES], [PERMISSION_KEYS.DELIVERY_CENTER],
      [PERMISSION_KEYS.DELIVERY_MOVE_CARD, PERMISSION_KEYS.DELIVERY_STAGE_CONFIG]);
    register([STORAGE_KEYS.COMMISSIONS],
      [PERMISSION_KEYS.FINANCE_MY_COMMISSION, PERMISSION_KEYS.FINANCE_SETTLEMENT, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, PERMISSION_KEYS.FINANCE_PAYOUT],
      [PERMISSION_KEYS.FINANCE_SETTLEMENT, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, PERMISSION_KEYS.FINANCE_PAYOUT]);
    register([STORAGE_KEYS.COMMISSION_OPERATION_LOGS],
      [PERMISSION_KEYS.FINANCE_SETTLEMENT, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, PERMISSION_KEYS.FINANCE_PAYOUT],
      [PERMISSION_KEYS.FINANCE_SETTLEMENT, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, PERMISSION_KEYS.FINANCE_PAYOUT]);
    register([STORAGE_KEYS.COMMISSION_SETTLEMENT_BATCHES],
      [PERMISSION_KEYS.FINANCE_PAYOUT, PERMISSION_KEYS.FINANCE_SETTLEMENT], [PERMISSION_KEYS.FINANCE_PAYOUT]);
    register([STORAGE_KEYS.MONTHLY_COMMISSION_TIER_CONFIGS, STORAGE_KEYS.COMMISSION_RULES, STORAGE_KEYS.COMMISSION_ROLE_CONFIGS],
      [PERMISSION_KEYS.FINANCE_RULES], [PERMISSION_KEYS.FINANCE_RULES]);
    register([STORAGE_KEYS.FINANCE],
      [PERMISSION_KEYS.FINANCE_OVERVIEW, PERMISSION_KEYS.FINANCE_FLOW, PERMISSION_KEYS.FINANCE_PAYOUT],
      [PERMISSION_KEYS.FINANCE_OVERVIEW, PERMISSION_KEYS.FINANCE_FLOW, PERMISSION_KEYS.FINANCE_PAYOUT]);
    register([STORAGE_KEYS.RECOVERY_ORDERS], [PERMISSION_KEYS.AFTER_SALES_RECOVERY],
      [PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE]);
    register([STORAGE_KEYS.REFUNDS], [PERMISSION_KEYS.AFTER_SALES_REFUND, PERMISSION_KEYS.FINANCE_REFUND],
      [PERMISSION_KEYS.AFTER_SALES_REFUND, PERMISSION_KEYS.FINANCE_REFUND]);
    register([STORAGE_KEYS.SERVICE_TICKETS], [PERMISSION_KEYS.AFTER_SALES_TICKETS], [PERMISSION_KEYS.AFTER_SALES_TICKETS]);
    register([STORAGE_KEYS.OPPORTUNITIES], [PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS], [PERMISSION_KEYS.CUSTOMER_CREATE_ORDER]);
    register([STORAGE_KEYS.AI_CARDS], [PERMISSION_KEYS.CUSTOMER_AI_CARD], [PERMISSION_KEYS.CUSTOMER_AI_CARD]);
    register([STORAGE_KEYS.AI_SESSIONS], [PERMISSION_KEYS.AI_CHAT], [PERMISSION_KEYS.AI_CHAT]);
    register([STORAGE_KEYS.PRODUCTS, STORAGE_KEYS.PRODUCT_LEVELS], [PERMISSION_KEYS.SETTINGS_PRODUCTS], [PERMISSION_KEYS.SETTINGS_PRODUCTS]);
    register([STORAGE_KEYS.TAGS], [PERMISSION_KEYS.CUSTOMER_LIST], [PERMISSION_KEYS.CUSTOMER_EDIT]);
    register([STORAGE_KEYS.USERS, STORAGE_KEYS.DEPARTMENTS, STORAGE_KEYS.POSITIONS],
      [PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS], [PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS]);
    register([STORAGE_KEYS.ROLES], [PERMISSION_KEYS.SETTINGS_ROLES], [PERMISSION_KEYS.SETTINGS_ROLES]);
    register([STORAGE_KEYS.ORGANIZATION_PROFILE, STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION],
      [PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS], [PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS]);
    register([STORAGE_KEYS.ORDER_TYPE_CONFIGS], [PERMISSION_KEYS.SETTINGS_ORDER_TYPES], [PERMISSION_KEYS.SETTINGS_ORDER_TYPES]);
    register([STORAGE_KEYS.CUSTOMER_LEVEL_CONFIGS], [PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS], [PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS]);
    register([STORAGE_KEYS.LIFECYCLE_STATUS_CONFIGS], [PERMISSION_KEYS.SETTINGS_LIFECYCLE], [PERMISSION_KEYS.SETTINGS_LIFECYCLE]);
    register([STORAGE_KEYS.LEAD_SOURCE_CONFIGS, STORAGE_KEYS.LEAD_FLOW_CONFIG, STORAGE_KEYS.LEAD_INTAKE_RECORDS],
      [PERMISSION_KEYS.SETTINGS_LEAD_FLOW, PERMISSION_KEYS.LEADS_INTAKE_STATUS],
      [PERMISSION_KEYS.SETTINGS_LEAD_FLOW, PERMISSION_KEYS.LEADS_FLOW_CONFIG]);
    register([STORAGE_KEYS.ECOMMERCE_SETTLEMENT_RECORDS],
      [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_HISTORY, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_EXCEPTIONS, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_TALENTS],
      [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH]);
    register([STORAGE_KEYS.ECOMMERCE_SETTLEMENT_CONFIG],
      [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES],
      [PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS, PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES]);
    register([STORAGE_KEYS.INITIALIZED], [PERMISSION_KEYS.HOME], [PERMISSION_KEYS.HOME]);

    function anyPermission(user: AuthenticatedUser, keys: readonly string[], action: 'read' | 'write') {
      return keys.some((key) => hasPermission(user, key, action));
    }

    export function isLegacyStorageKeyRegistered(key: string): boolean {
      return isAssetStorageKey(key) || Boolean(policies[key]);
    }

    export function canAccessLegacyStorageKey(user: AuthenticatedUser, key: string, operation: LegacyStorageOperation): boolean {
      if (isAssetStorageKey(key)) {
        return operation === 'write' ? canWriteStorageKey(user, key) : canReadStorageKey(user, key);
      }
      const policy = policies[key];
      if (!policy) return false;
      if (operation === 'runtime') return policy.runtime && anyPermission(user, policy.read, 'read');
      return operation === 'write'
        ? anyPermission(user, policy.write, 'write')
        : anyPermission(user, policy.read, 'read');
    }

The register calls above are the complete key inventory for this phase. Do not add a wildcard policy.

- [ ] **Step 4: Run focused policy tests**

Run:

    npx tsx server/services/legacyStorageAccess.test.ts
    npx tsx server/services/assetStorageAccess.test.ts

Expected: both PASS and existing asset filtering behavior remains unchanged.

- [ ] **Step 5: Commit**

    git add server/services/legacyStorageAccess.ts server/services/legacyStorageAccess.test.ts
    git commit -m "feat: gate legacy storage keys by permission"

### Task 3: Enforce route-level permissions and legacy storage policy

**Files:**

- Modify: server/index.ts
- Modify: server/storageRoutesAuth.test.ts

**Interfaces:**

- Consumes: createRequireAuth and canAccessLegacyStorageKey.
- Produces: customer and lead routes with explicit capabilities; storage routes that deny unregistered keys and prevent ordinary users from retrieving the complete storage snapshot.

- [ ] **Step 1: Write failing route-contract assertions**

Replace the old all-storage-routes-use-requireStorageAccess checks in server/storageRoutesAuth.test.ts with:

    assert.match(source, /const requireCustomerListAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_LIST\);/);
    assert.match(source, /const requireCustomerEditAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_EDIT, 'write'\);/);
    assert.match(source, /const requireCustomerAssignAccess = createRequireAuth\(authService, PERMISSION_KEYS\.CUSTOMER_ASSIGN, 'write'\);/);
    assert.match(source, /const requireLeadListAccess = createRequireAuth\(authService, PERMISSION_KEYS\.LEADS_LIST\);/);
    assert.match(source, /app\.get\('\/api\/customers', requireCustomerListAccess,/);
    assert.match(source, /app\.post\('\/api\/customers\/:id\/follow-ups', requireCustomerEditAccess,/);
    assert.match(source, /app\.post\('\/api\/customers\/:id\/release', requireCustomerAssignAccess,/);
    assert.match(source, /app\.get\('\/api\/leads', requireLeadListAccess,/);
    assert.match(source, /canAccessLegacyStorageKey\(req\.currentUser, key, 'read'\)/);
    assert.match(source, /canAccessLegacyStorageKey\(req\.currentUser, key, 'write'\)/);
    assert.match(source, /Legacy storage deletion is disabled/);

- [ ] **Step 2: Run the test to verify it fails**

Run:

    npx tsx server/storageRoutesAuth.test.ts

Expected: FAIL because the new guards and policy calls do not yet exist.

- [ ] **Step 3: Wire the guards**

Replace the existing server/middleware/auth import in server/index.ts with:

    import { createRequireAnyPermission, createRequireAuth, bearerToken, type AuthenticatedRequest } from './middleware/auth';
    import { canAccessLegacyStorageKey } from './services/legacyStorageAccess';

    const requireCustomerListAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_LIST);
    const requireCustomerEditAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_EDIT, 'write');
    const requireCustomerAssignAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_ASSIGN, 'write');
    const requireLeadListAccess = createRequireAuth(authService, PERMISSION_KEYS.LEADS_LIST);
    const requireAssignableUsersAccess = createRequireAnyPermission(authService, assignableUsersPermissions);

Change the explicit routes:

    GET  /api/customers                    -> requireCustomerListAccess
    POST /api/customers/:id/follow-ups     -> requireCustomerEditAccess
    POST /api/customers/:id/release        -> requireCustomerAssignAccess
    GET  /api/leads                        -> requireLeadListAccess

For GET /api/storage?scope=runtime, filter runtimeStorageKeys with:

    req.currentUser && canAccessLegacyStorageKey(req.currentUser, key, 'runtime')

Replace the existing two-element requireAssignableUsersAccess array with the single middleware above so the reusable middleware has a production caller.

For GET /api/storage/:key and PUT /api/storage/:key, return status 403 when the matching read or write policy check is false. Keep the existing asset filtered-read branch after the policy check.

For GET /api/storage without scope=runtime, require SETTINGS_DATA_MAINTENANCE after authentication. Replace DELETE /api/storage/:key with:

    app.delete('/api/storage/:key', requireStorageAccess, async (_req: AuthenticatedRequest, res) => {
      res.status(405).json({ code: 405, data: null, message: 'Legacy storage deletion is disabled' });
    });

Do not remove DELETE /api/storage. It stays behind SETTINGS_DATA_MAINTENANCE for the data-maintenance screen.

- [ ] **Step 4: Run focused tests**

Run:

    npx tsx server/middleware/auth.test.ts
    npx tsx server/services/legacyStorageAccess.test.ts
    npx tsx server/storageRoutesAuth.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

    git add server/index.ts server/storageRoutesAuth.test.ts
    git commit -m "fix: enforce permissions on storage and crm routes"

### Task 4: Surface storage persistence failures to the user

**Files:**

- Create: src/api/storageSyncStatus.ts
- Create: src/api/storageSyncStatus.test.ts
- Create: src/shared/components/StorageSyncFailureNotice.tsx
- Modify: src/api/backendClient.ts
- Modify: src/api/mock/storage.ts
- Modify: src/api/backendClient.test.ts
- Modify: src/App.tsx

**Interfaces:**

    export type StorageSyncFailure = {
      key: string;
      operation: 'save' | 'delete' | 'clear';
      message: string;
    };

    export function reportStorageSyncFailure(failure: StorageSyncFailure): void;
    export function clearStorageSyncFailure(): void;
    export function subscribeStorageSyncFailures(
      listener: (failure: StorageSyncFailure | null) => void,
    ): () => void;

- [ ] **Step 1: Write the failing status-store test**

Create src/api/storageSyncStatus.test.ts:

    import assert from 'node:assert/strict';
    import {
      clearStorageSyncFailure,
      reportStorageSyncFailure,
      subscribeStorageSyncFailures,
    } from './storageSyncStatus';

    const events: Array<string | null> = [];
    const unsubscribe = subscribeStorageSyncFailures((failure) => events.push(failure?.message || null));
    reportStorageSyncFailure({ key: 'aaos_customers', operation: 'save', message: 'Forbidden' });
    clearStorageSyncFailure();
    unsubscribe();

    assert.deepEqual(events, ['Forbidden', null]);

- [ ] **Step 2: Run the test to verify it fails**

Run:

    npx tsx src/api/storageSyncStatus.test.ts

Expected: TypeScript fails because storageSyncStatus.ts does not exist.

- [ ] **Step 3: Implement the status store and rejected writes**

Create src/api/storageSyncStatus.ts:

    export type StorageSyncFailure = {
      key: string;
      operation: 'save' | 'delete' | 'clear';
      message: string;
    };

    let currentFailure: StorageSyncFailure | null = null;
    const listeners = new Set<(failure: StorageSyncFailure | null) => void>();

    function emit() {
      listeners.forEach((listener) => listener(currentFailure));
    }

    export function reportStorageSyncFailure(failure: StorageSyncFailure): void {
      currentFailure = failure;
      emit();
    }

    export function clearStorageSyncFailure(): void {
      currentFailure = null;
      emit();
    }

    export function subscribeStorageSyncFailures(listener: (failure: StorageSyncFailure | null) => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

Change persistBackendStorageValue, removeBackendStorageValue and clearBackendStorageValues in src/api/backendClient.ts to return Promise<void>. After backendRequest, throw Error(response.message || '数据未保存') when response.code is not zero. These functions do not swallow or report errors themselves.

Use this PUT pattern:

    const writePromise = backendRequest('/storage/' + encodeURIComponent(key), {
      method: 'PUT',
      body: JSON.stringify({ value }),
    }).then((response) => {
      if (response.code !== 0) throw new Error(response.message || '数据未保存');
    }).finally(() => {
      pendingStorageWriteKeys.delete(key);
      protectStorageKeyFromHydration(key);
      pendingStorageWritePromises.delete(writePromise);
    });

In src/api/mock/storage.ts, import reportStorageSyncFailure and define:

    function reportFailedSync(key: string, operation: 'save' | 'delete' | 'clear', error: unknown): void {
      reportStorageSyncFailure({
        key,
        operation,
        message: error instanceof Error ? error.message : '数据未保存',
      });
    }

Replace every direct persistence call in initializeStorage, setStorageData, removeStorageData, clearAllStorageData and markStorageInitialized with the matching safe call:

    void persistBackendStorageValue(key, data).catch((error) => reportFailedSync(key, 'save', error));

    void removeBackendStorageValue(key).catch((error) => reportFailedSync(key, 'delete', error));

    void clearBackendStorageValues().catch((error) => reportFailedSync('aaos_', 'clear', error));

Create StorageSyncFailureNotice.tsx as a subscriber around MUI Snackbar and Alert. Its text is 数据未保存： followed by failure.message. Mount StorageSyncFailureNotice immediately before Routes in src/App.tsx.

- [ ] **Step 4: Extend and run tests**

Add a mocked 403 PUT to src/api/backendClient.test.ts and assert:

    await assert.rejects(
      () => persistBackendStorageValue(STORAGE_KEYS.CUSTOMERS, []),
      /Forbidden/,
    );

Run:

    npx tsx src/api/storageSyncStatus.test.ts
    npx tsx src/api/backendClient.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

    git add src/api/storageSyncStatus.ts src/api/storageSyncStatus.test.ts src/shared/components/StorageSyncFailureNotice.tsx src/api/backendClient.ts src/api/mock/storage.ts src/api/backendClient.test.ts src/App.tsx
    git commit -m "fix: surface backend storage persistence failures"

### Task 5: Move backend-mode customer creation to a single-record command

**Files:**

- Modify: server/services/customerListService.ts
- Create: server/services/customerListService.test.ts
- Modify: server/index.ts
- Modify: src/api/customerApi.ts
- Create: src/api/customerCreateBackend.test.ts
- Modify: server/storageRoutesAuth.test.ts

**Interfaces:**

    customerListService.create(input: CustomerCreateInput, actor: AuthenticatedUser): Promise<ApiResponse<Customer>>
    POST /api/customers
    customerApi.createCustomer(input): Promise<ApiResponse<Customer>>

- [ ] **Step 1: Write failing server and client tests**

Create server/services/customerListService.test.ts with a Prisma fake whose businessRecord.create pushes its input into created. Test:

    const result = await service.create(
      { name: '新客户', phone: '13800000000', sourceType: '公司资源' },
      actor,
    );
    assert.equal(result.code, 0);
    assert.equal(created.length, 1);
    assert.equal(created[0].data.domain, STORAGE_KEYS.CUSTOMERS);
    assert.equal(created[0].data.data.name, '新客户');

The fake must not expose deleteMany. This proves creation is a single-row command.

Add a second service assertion with input owner: '另一位销售' and an actor that only has CUSTOMER_CREATE. It must return code 403 and leave created.length unchanged. This proves a creator cannot assign a newly created customer to an unrelated owner without CUSTOMER_ASSIGN.

Create src/api/customerCreateBackend.test.ts with backend mode enabled. Its fetch mock records calls and returns a Customer. Assert exactly one POST to http://127.0.0.1:3001/api/customers and assert the local storage map has no aaos_customers entry after customerApi.createCustomer resolves.

- [ ] **Step 2: Run tests to verify they fail**

Run:

    npx tsx server/services/customerListService.test.ts
    npx tsx src/api/customerCreateBackend.test.ts

Expected: FAIL because the service lacks create and the client still calls setStorageData.

- [ ] **Step 3: Implement the server command and route**

In server/services/customerListService.ts import randomUUID from node:crypto, CustomerCreateInput, getPhoneNumberError, normalizePhoneForStorage, hasPermission and PERMISSION_KEYS. Add create to the returned service:

    async create(input: CustomerCreateInput, currentUser: AuthenticatedUser) {
      const phone = normalizePhoneForStorage(input.phone);
      const sourceType = normalizeResourceOwnership(input.sourceType);
      if (sourceType === '个人资源' && !input.leadContributorId && !input.leadContributorName) {
        return failure<Customer>('个人资源必须填写线索贡献人', 400);
      }
      const requestedOwner = String(input.owner || '').trim();
      const actorName = currentUser.name || currentUser.account;
      if (requestedOwner && requestedOwner !== actorName && !hasPermission(currentUser, PERMISSION_KEYS.CUSTOMER_ASSIGN, 'write')) {
        return failure<Customer>('无权把客户分配给其他负责人', 403);
      }
      const phoneError = getPhoneNumberError(phone);
      if (phoneError) return failure<Customer>(phoneError, 400);

      const now = new Date().toISOString();
      const id = 'cust-' + randomUUID().slice(0, 8);
      const customer: Customer = {
        ...input, id, phone, sourceType,
        owner: requestedOwner || actorName,
        customerLevel: input.customerLevel || 'L1',
        lifecycleStatusCode: input.lifecycleStatusCode || LIFECYCLE_STATUS_CODES.PENDING_FOLLOWUP,
        lifecycleStatusUpdatedAt: now,
        totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [],
        activityRecords: [{
          id: 'act-' + randomUUID().slice(0, 8),
          type: 'create', title: '创建了客户',
          operator: currentUser.name || currentUser.account,
          content: input.remark, createdAt: now,
        }],
        createdAt: now, updatedAt: now,
      };

      await prisma.businessRecord.create({
        data: {
          id: STORAGE_KEYS.CUSTOMERS + ':' + id,
          domain: STORAGE_KEYS.CUSTOMERS,
          recordId: id,
          title: customer.name || customer.company || id,
          status: customer.lifecycleStatusCode,
          owner: customer.owner || null,
          customerId: id,
          amount: 0,
          eventAt: new Date(now),
          data: customer as any,
        },
      });
      return success(customer);
    }

Add requireCustomerCreateAccess and POST /api/customers before GET /api/customers:

    const requireCustomerCreateAccess = createRequireAuth(authService, PERMISSION_KEYS.CUSTOMER_CREATE, 'write');

    app.post('/api/customers', requireCustomerCreateAccess, async (req: AuthenticatedRequest, res) => {
      const result = await customerListService.create(req.body || {}, req.currentUser!);
      res.status(result.code === 0 ? 201 : 400).json(result);
    });

In customerApi.createCustomer, put this backend branch before ensureInit():

    if (shouldUseBackendApi()) {
      const response = await backendRequest<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response.code === 0 && response.data
        ? createSuccessResponse(response.data)
        : createErrorResponse(response.message, response.code);
    }

Do not write aaos_customers locally in the backend branch.

- [ ] **Step 4: Run customer tests**

Run:

    npx tsx server/services/customerListService.test.ts
    npx tsx src/api/customerCreateBackend.test.ts
    npx tsx src/api/customerFollowUpBackend.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

    git add server/services/customerListService.ts server/services/customerListService.test.ts server/index.ts src/api/customerApi.ts src/api/customerCreateBackend.test.ts server/storageRoutesAuth.test.ts
    git commit -m "fix: create backend customers without full-array overwrite"

### Task 6: Make remaining legacy array replacements atomic

**Files:**

- Modify: server/services/storageService.ts
- Modify: server/services/storageService.test.ts

**Interfaces:**

- Consumes: PrismaClient.$transaction and the existing appStorage, leadRecord and businessRecord delegates.
- Produces: storageService.set(key, value) that commits all upserts and its deleteMany in one transaction or returns a failed response with no committed partial write.

- [ ] **Step 1: Write the failing transaction test**

Extend the Prisma fake in server/services/storageService.test.ts:

    let transactionCalls = 0;
    const transactionalPrisma = {
      ...prisma,
      $transaction: async (callback: (tx: any) => Promise<unknown>) => {
        transactionCalls += 1;
        return callback(prisma);
      },
    } as any;

    const transactionalService = createStorageService(transactionalPrisma);
    await transactionalService.set(STORAGE_KEYS.CUSTOMERS, nextCustomers);
    assert.equal(transactionCalls, 1);

Add a second fake where businessRecord.upsert throws. Assert that storageService.set rejects and the deleteMany spy was not called after the failed upsert.

- [ ] **Step 2: Run test to verify it fails**

Run:

    npx tsx server/services/storageService.test.ts

Expected: FAIL because storageService.set currently invokes delegates directly.

- [ ] **Step 3: Wrap structured and business-array writes in a transaction**

Change the write helper signatures:

    type StorageTransaction = Pick<Prisma.TransactionClient, 'appStorage' | 'leadRecord' | 'businessRecord'>;
    type StoragePrisma = StorageTransaction & Pick<PrismaClient, '$transaction' | 'user'>;

    const setLeads = async (db: StorageTransaction, value: unknown) => {
      if (!Array.isArray(value)) return failure('aaos_leads must be an array', 400);
      const ids = value
        .map((item) => normalizeLead(item).id)
        .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()));

      for (const item of value) {
        const lead = normalizeLead(item);
        const id = nullableText(lead.id);
        if (!id) continue;
        const createdAt = parseDate(lead.createdAt);
        const updatedAt = parseDate(lead.updatedAt || lead.createdAt);
        await db.leadRecord.upsert({
          where: { id },
          update: {
            name: String(lead.name || ''),
            company: nullableText(lead.company),
            phone: nullableText(lead.phone),
            wechat: nullableText(lead.wechat),
            source: nullableText(lead.source),
            status: nullableText(lead.status),
            lifecycleStatusCode: nullableText(lead.lifecycleStatusCode),
            owner: nullableText(lead.owner),
            assignedTo: nullableText(lead.assignedTo),
            inputBy: nullableText(lead.inputBy),
            leadContributorId: nullableText(lead.leadContributorId),
            data: lead as Prisma.InputJsonValue,
            createdAt,
            updatedAt,
          },
          create: {
            id,
            name: String(lead.name || ''),
            company: nullableText(lead.company),
            phone: nullableText(lead.phone),
            wechat: nullableText(lead.wechat),
            source: nullableText(lead.source),
            status: nullableText(lead.status),
            lifecycleStatusCode: nullableText(lead.lifecycleStatusCode),
            owner: nullableText(lead.owner),
            assignedTo: nullableText(lead.assignedTo),
            inputBy: nullableText(lead.inputBy),
            leadContributorId: nullableText(lead.leadContributorId),
            data: lead as Prisma.InputJsonValue,
            createdAt,
            updatedAt,
          },
        });
      }

      await db.leadRecord.deleteMany({ where: { id: { notIn: ids } } });
      return success(value);
    };

    const setBusinessRecords = async (db: StorageTransaction, domain: string, value: unknown) => {
      if (!Array.isArray(value)) return failure(domain + ' must be an array', 400);
      const recordIds: string[] = [];

      for (let index = 0; index < value.length; index += 1) {
        const item = normalizeLead(value[index]);
        const recordId = toRecordId(domain, item, index);
        recordIds.push(recordId);
        await db.businessRecord.upsert({
          where: { domain_recordId: { domain, recordId } },
          update: {
            title: titleValue(domain, item),
            status: nullableText(item.status),
            owner: ownerValue(item),
            customerId: nullableText(item.customerId),
            orderId: nullableText(item.orderId),
            amount: amountValue(item),
            eventAt: eventDate(item),
            data: item as Prisma.InputJsonValue,
          },
          create: {
            id: businessRecordId(domain, recordId),
            domain,
            recordId,
            title: titleValue(domain, item),
            status: nullableText(item.status),
            owner: ownerValue(item),
            customerId: nullableText(item.customerId),
            orderId: nullableText(item.orderId),
            amount: amountValue(item),
            eventAt: eventDate(item),
            data: item as Prisma.InputJsonValue,
          },
        });
      }

      await db.businessRecord.deleteMany({ where: { domain, recordId: { notIn: recordIds } } });
      return success(value);
    };

Use these set branches:

    if (key === STORAGE_KEYS.LEADS) {
      return prisma.$transaction((tx) => setLeads(tx, value));
    }
    if (BUSINESS_RECORD_KEYS.has(key)) {
      return prisma.$transaction((tx) => setBusinessRecords(tx, key, value));
    }

Do not change array replacement semantics in this task. The policy and customer create bridge remove the proven customer-create loss path; versioned record commands replace full arrays domain by domain in later plans.

- [ ] **Step 4: Run storage tests**

Run:

    npx tsx server/services/storageService.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

    git add server/services/storageService.ts server/services/storageService.test.ts
    git commit -m "fix: write legacy storage arrays transactionally"

### Task 7: Write the rollout runbook and perform full verification

**Files:**

- Create: docs/operations/phase-0-security-rollout.md

**Interfaces:**

- Consumes: the built application and local/production MySQL credentials supplied through a MySQL defaults file outside the repository.
- Produces: backup manifest, test evidence and rollback instructions that do not reintroduce unrestricted storage writes.

- [ ] **Step 1: Write the runbook**

The defaults file must live outside the repository and must contain the MySQL user/password. The runbook contains these commands:

    export JIXIANGOS_BACKUP_DIR="$HOME/jixiangos-backups/phase-0-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$JIXIANGOS_BACKUP_DIR"
    mysqldump --defaults-extra-file="$HOME/.jixiangos-mysql.cnf" --single-transaction --routines --events --no-tablespaces jixiang_os --result-file="$JIXIANGOS_BACKUP_DIR/jixiang_os.sql"
    shasum -a 256 "$JIXIANGOS_BACKUP_DIR/jixiang_os.sql" > "$JIXIANGOS_BACKUP_DIR/jixiang_os.sql.sha256"
    mysql --defaults-extra-file="$HOME/.jixiangos-mysql.cnf" -e "CREATE DATABASE IF NOT EXISTS jixiang_os_phase0_restore_check"
    mysql --defaults-extra-file="$HOME/.jixiangos-mysql.cnf" jixiang_os_phase0_restore_check < "$JIXIANGOS_BACKUP_DIR/jixiang_os.sql"
    mysql --defaults-extra-file="$HOME/.jixiangos-mysql.cnf" -N -e "SELECT COUNT(*) FROM jixiang_os.business_records; SELECT COUNT(*) FROM jixiang_os_phase0_restore_check.business_records"

The runbook requires matching counts before deployment. Rollback restores the pre-deployment application version first; database restore occurs only when a database migration from this phase has been deployed; it never calls generic storage key DELETE.

- [ ] **Step 2: Run focused tests, full suite and production build**

Run:

    npx tsx server/middleware/auth.test.ts
    npx tsx server/services/legacyStorageAccess.test.ts
    npx tsx server/storageRoutesAuth.test.ts
    npx tsx server/services/customerListService.test.ts
    npx tsx server/services/storageService.test.ts
    npx tsx src/api/storageSyncStatus.test.ts
    npx tsx src/api/backendClient.test.ts
    npx tsx src/api/customerCreateBackend.test.ts
    npm test
    npm run build

Expected: every command exits 0. Stop the rollout if any existing test fails and record the failure before changing unrelated code.

- [ ] **Step 3: Browser smoke test**

1. Sign in with a user that lacks CUSTOMER_LIST; GET /api/customers returns 403 and the customers page remains inaccessible.
2. Sign in with a user that has CUSTOMER_LIST but lacks CUSTOMER_EDIT; list customers succeeds and POST /api/customers/:id/follow-ups returns 403.
3. Sign in with a customer-create user in a fresh browser profile, create one customer, refresh /customers, and verify existing customers remain with the new record.
4. Simulate a 403 or 500 storage PUT. The UI displays 数据未保存： followed by the server message; it must not display a false success.
5. Verify an ordinary user receives 403 for GET /api/storage without scope=runtime, GET /api/storage/aaos_unknown_private_data, and DELETE /api/storage/aaos_orders.

- [ ] **Step 4: Commit the runbook**

    git add docs/operations/phase-0-security-rollout.md
    git commit -m "docs: add phase zero security rollout runbook"

## Plan self-review

| Spec requirement | Covered by |
|---|---|
| Server-side function permissions and default denial | Tasks 1–3 |
| Remove ordinary full storage enumeration and single-key destructive delete | Task 3 |
| Keep half-finished modules functional through compatible permissions | Task 2 inventory and Task 3 runtime filtering |
| Make failed persistence observable | Task 4 |
| Eliminate fresh-browser customer full-array create path | Task 5 |
| Avoid partial multi-row legacy writes | Task 6 |
| Backup, restore check, test, build and browser verification | Task 7 |

The plan deliberately leaves per-record version conflicts, typed tables, full QueryScope enforcement for orders/finance/after-sales, finance ledger, customer ownership model, delivery, after-sales consolidation and asset registry to their dedicated approved subprojects. No task creates an online runtime dual-write path.
