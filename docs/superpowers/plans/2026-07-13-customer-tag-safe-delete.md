# 客户标签安全删除 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理员可安全删除零引用标签和空标签分组，同时保留已使用标签的可追溯治理路径。

**Architecture:** 标签目录服务在 MySQL 事务与现有目录写锁内重新计算引用和分组成员数，再决定是否删除并记录审计。HTTP API 只转发删除请求；设置页根据目录实时状态显示删除入口，并在操作后重新加载目录与失效标签选择缓存。

**Tech Stack:** TypeScript、Express、Prisma/MySQL、React、MUI、Node `assert` 测试。

## Global Constraints

- 已使用标签只能合并或停用，不能删除。
- 含标签分组只能合并或停用，不能删除。
- 删除必须二次确认，并由服务端在事务中再次校验。
- 默认不显示停用的标签和分组；管理员可显式显示它们。
- 合法分组作用域为 `customer`、`lead`、`both`；作用域或选择模式变更必须先验证真实引用。

---

## File structure

- `server/services/customerTagService.ts`：标签分组作用域、删除前置校验、事务删除和审计。
- `server/services/customerTagService.test.ts`：服务规则、事务安全和基线作用域回归测试。
- `server/customerTagRoutesAuth.test.ts`：删除路由状态码与权限映射。
- `src/api/customerTagApi.ts`：前端删除 API。
- `src/api/customerTagApi.test.ts`：前端删除请求路径和 HTTP 方法。
- `src/pages/Settings/CustomerTagConfig.tsx`：显示停用开关、删除菜单、确认弹窗和刷新行为。
- `src/pages/Settings/customerTagSafeDeleteStatic.test.ts`：设置页关键删除与筛选交互静态契约。

### Task 1: 修复分组作用域基线并实现目录安全删除

**Files:**
- Modify: `server/services/customerTagService.ts:19-360`
- Modify: `server/services/customerTagService.test.ts:10-300`

**Interfaces:**
- Produces: `deleteTag(id: string, user: AuthenticatedUser): Promise<ApiResponse<{ id: string }>>`
- Produces: `deleteGroup(id: string, user: AuthenticatedUser): Promise<ApiResponse<{ id: string }>>`
- Consumes: `loadCustomerTagCatalog(tx, true)` for fresh `usageCount` and group membership.

- [ ] **Step 1: Add failing service assertions and fake delete support**

```ts
businessRecord = {
  // existing methods
  delete: async ({ where }: any) => {
    const pair = where.domain_recordId;
    const key = rowKey(pair.domain, pair.recordId);
    const row = this.rows.get(key);
    if (!row) throw new Error('missing record');
    this.rows.delete(key);
    return clone(row);
  },
};

assert.equal((await service.updateGroup(leadOnlyGroupId, { scope: 'lead' }, superAdmin)).code, 409);
const unused = await service.createTag({ groupId, name: '可删除标签' }, superAdmin);
assert.equal((await service.deleteTag((unused.data as any).id, superAdmin)).code, 0);
assert.equal(prisma.rows.has(rowKey(STORAGE_KEYS.TAGS, (unused.data as any).id)), false);
assert.equal((await service.deleteTag(targetId, superAdmin)).code, 409);
const empty = await service.createGroup({ ...validGroup, name: '空分组' }, superAdmin);
assert.equal((await service.deleteGroup((empty.data as any).id, superAdmin)).code, 0);
assert.equal((await service.deleteGroup(groupId, superAdmin)).code, 409);
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm exec tsx server/services/customerTagService.test.ts
```

Expected: failure because `deleteTag` and `deleteGroup` do not exist; current scope regression remains visible.

- [ ] **Step 3: Restore valid scope persistence and add transactional delete methods**

```ts
const group: CustomerTagGroup = {
  // existing fields
  scope: input.scope ?? 'customer',
};

const next: CustomerTagGroup = {
  ...current,
  scope: input.scope ?? current.scope,
  selectionMode: input.selectionMode ?? current.selectionMode,
};

async function deleteTag(id: string, user: AuthenticatedUser) {
  if (!await requireSuperAdmin(user)) return failure('仅超级管理员可管理标签目录', 403);
  return catalogWriteTransaction(prisma, async (tx) => {
    const catalog = await loadCustomerTagCatalog(tx, true);
    const tag = catalog.tags.find((item) => item.id === id);
    if (!tag) return failure('标签不存在', 404);
    if (tag.usageCount > 0) return failure('标签已被客户或线索使用，请先合并或停用', 409);
    await tx.businessRecord.delete({ where: { domain_recordId: { domain: STORAGE_KEYS.TAGS, recordId: id } } });
    await tx.businessRecord.create({ data: recordData(CATALOG_AUDIT_DOMAIN, { id: randomUUID(), name: `删除客户标签：${tag.name}`, isActive: true }) });
    return success({ id });
  });
}

async function deleteGroup(id: string, user: AuthenticatedUser) {
  if (!await requireSuperAdmin(user)) return failure('仅超级管理员可管理标签目录', 403);
  return catalogWriteTransaction(prisma, async (tx) => {
    const catalog = await loadCustomerTagCatalog(tx, true);
    const group = catalog.groups.find((item) => item.id === id);
    if (!group) return failure('标签分组不存在', 404);
    if (catalog.tags.some((tag) => tag.groupId === id)) return failure('标签分组仍包含标签，请先合并、停用或删除标签', 409);
    await tx.businessRecord.delete({ where: { domain_recordId: { domain: STORAGE_KEYS.TAG_GROUPS, recordId: id } } });
    await tx.businessRecord.create({ data: recordData(CATALOG_AUDIT_DOMAIN, { id: randomUUID(), name: `删除客户标签分组：${group.name}`, isActive: true }) });
    return success({ id });
  });
}
```

Return both methods from `createCustomerTagService`. Keep the existing `validateAffectedAssignments` call for scope and selection-mode changes so the test rejects a `both → lead` transition that would invalidate customer records.

- [ ] **Step 4: Run focused service test and verify it passes**

Run:

```bash
pnpm exec tsx server/services/customerTagService.test.ts
```

Expected: process exits 0; scope conflict, safe deletes, non-admin rejection, and existing merge/rollback assertions pass.

- [ ] **Step 5: Commit the service rule**

```bash
git add server/services/customerTagService.ts server/services/customerTagService.test.ts
git commit -m "feat: add safe customer tag deletion rules"
```

### Task 2: Expose safe deletion through the authenticated API

**Files:**
- Modify: `server/services/customerTagService.ts:363-430`
- Modify: `server/customerTagRoutesAuth.test.ts:20-95`
- Modify: `src/api/customerTagApi.ts:1-20`
- Modify: `src/api/customerTagApi.test.ts:1-45`

**Interfaces:**
- Consumes: `service.deleteTag(id, currentUser)` and `service.deleteGroup(id, currentUser)` from Task 1.
- Produces: `deleteCustomerTag(id)` and `deleteCustomerTagGroup(id)` for the settings page.

- [ ] **Step 1: Add failing route and API client assertions**

```ts
// customerTagRoutesAuth.test.ts service fixture
deleteTag: async (id: string) => id === 'in-use' ? { code: 409, data: null, message: 'in use' } : { code: 0, data: { id }, message: 'success' },
deleteGroup: async (id: string) => id === 'nonempty' ? { code: 409, data: null, message: 'nonempty' } : { code: 0, data: { id }, message: 'success' },

assert.equal((await request('/unused', { method: 'DELETE' })).status, 200);
assert.equal((await request('/in-use', { method: 'DELETE' })).status, 409);
assert.equal((await request('/groups/empty', { method: 'DELETE' })).status, 200);
assert.equal((await request('/groups/nonempty', { method: 'DELETE' })).status, 409);

// customerTagApi.test.ts
await deleteCustomerTag('t/1');
await deleteCustomerTagGroup('g/1');
```

- [ ] **Step 2: Run route and API tests and verify they fail**

Run:

```bash
pnpm exec tsx server/customerTagRoutesAuth.test.ts
pnpm exec tsx src/api/customerTagApi.test.ts
```

Expected: failure because no `DELETE` routes or client functions exist.

- [ ] **Step 3: Add HTTP handlers and client functions**

```ts
// router: place group route before '/:id'
router.delete('/groups/:id', requireManage, async (req: any, res) => {
  const result = await service.deleteGroup(String(req.params.id), req.currentUser!);
  res.status(status(result.code, 200)).json(result);
});
router.delete('/:id', requireManage, async (req: any, res) => {
  const result = await service.deleteTag(String(req.params.id), req.currentUser!);
  res.status(status(result.code, 200)).json(result);
});

export function deleteCustomerTag(id: string): Promise<ApiResponse<{ id: string }>> {
  return backendRequest(`${base}/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
export function deleteCustomerTagGroup(id: string): Promise<ApiResponse<{ id: string }>> {
  return backendRequest(`${base}/groups/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
```

- [ ] **Step 4: Run the focused API tests and verify they pass**

Run:

```bash
pnpm exec tsx server/customerTagRoutesAuth.test.ts
pnpm exec tsx src/api/customerTagApi.test.ts
```

Expected: process exits 0 and the API test records `DELETE /api/customer-tags/t%2F1` plus `DELETE /api/customer-tags/groups/g%2F1`.

- [ ] **Step 5: Commit the API boundary**

```bash
git add server/services/customerTagService.ts server/customerTagRoutesAuth.test.ts src/api/customerTagApi.ts src/api/customerTagApi.test.ts
git commit -m "feat: expose safe customer tag deletion api"
```

### Task 3: Build visible safe-delete controls in customer tag settings

**Files:**
- Modify: `src/pages/Settings/CustomerTagConfig.tsx:1-250`
- Create: `src/pages/Settings/customerTagSafeDeleteStatic.test.ts`

**Interfaces:**
- Consumes: `deleteCustomerTag`, `deleteCustomerTagGroup`, `fetchCustomerTagCatalog(scope, includeInactive)` from Task 2.
- Produces: default-clean configuration view with confirmed deletion controls.

- [ ] **Step 1: Add a failing static UI contract**

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/Settings/CustomerTagConfig.tsx', 'utf8');
assert.match(source, /const \[showInactive, setShowInactive\] = useState\(false\)/);
assert.match(source, /fetchCustomerTagCatalog\('all', showInactive\)/);
assert.match(source, /deleteCustomerTag\(deleteTarget\.id\)/);
assert.match(source, /deleteCustomerTagGroup\(deleteTarget\.id\)/);
assert.match(source, /使用 0 次的标签才可以永久删除/);
assert.match(source, /没有标签的分组才可以永久删除/);
```

- [ ] **Step 2: Run the UI contract and verify it fails**

Run:

```bash
pnpm exec tsx src/pages/Settings/customerTagSafeDeleteStatic.test.ts
```

Expected: failure because the page always loads inactive records and has no deletion controls.

- [ ] **Step 3: Add the toggle, menu and confirmation flow**

```tsx
const [showInactive, setShowInactive] = useState(false);
const [deleteTarget, setDeleteTarget] = useState<{ kind: 'tag' | 'group'; id: string; name: string } | null>(null);

const loadCatalog = useCallback(async () => {
  const response = await fetchCustomerTagCatalog('all', showInactive);
  // retain existing error/loading handling and selected-group fallback
}, [showInactive]);

const confirmDelete = () => deleteTarget && runMutation(
  () => deleteTarget.kind === 'tag' ? deleteCustomerTag(deleteTarget.id) : deleteCustomerTagGroup(deleteTarget.id),
  () => setDeleteTarget(null),
);
```

Add a `FormControlLabel`/`Switch` labeled `显示已停用` above the catalogue. Add a `MoreVert` menu to each tag and group: show red `删除标签` only when `tag.usageCount === 0`; show red `删除分组` only when no `catalog.tags` belong to that group. Keep existing edit, merge, and stop/start controls. Add one confirmation dialog whose copy is selected by `deleteTarget.kind`; disable its confirm button while `saving`. The success path must keep `invalidateManualTagCatalogCache()` through `runMutation` and reload the catalogue.

- [ ] **Step 4: Run the UI contract and type/build check**

Run:

```bash
pnpm exec tsx src/pages/Settings/customerTagSafeDeleteStatic.test.ts
pnpm build
```

Expected: static contract exits 0 and the production build completes without TypeScript errors.

- [ ] **Step 5: Commit the visible settings experience**

```bash
git add src/pages/Settings/CustomerTagConfig.tsx src/pages/Settings/customerTagSafeDeleteStatic.test.ts
git commit -m "feat: add safe delete controls for customer tags"
```

### Task 4: Verify the full repository and visible management flow

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: completed service, API, and settings-page changes from Tasks 1–3.
- Produces: verified branch ready for review.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
pnpm test
pnpm build
git diff --check main...HEAD
```

Expected: all test files pass, build exits 0, and no whitespace errors are reported.

- [ ] **Step 2: Start the branch-local API and Vite services**

Run:

```bash
pnpm exec tsx watch server/index.ts
pnpm exec vite --host 127.0.0.1 --port 3004 --strictPort
```

Expected: API and Vite listen without startup errors. Use port 3004 to avoid replacing the main local preview.

- [ ] **Step 3: Verify the visible management flow manually**

Check `/settings/customer-tags` (or its current settings route) as super administrator:

```text
1. Default view omits stopped tags and groups.
2. “显示已停用” exposes stopped entries and the enable action.
3. A zero-use tag shows Delete in More; confirmation removes it.
4. An in-use tag has no Delete action.
5. An empty group shows Delete in More; a nonempty group has no Delete action.
6. Merge and stop actions remain available and API responses show no errors.
```
