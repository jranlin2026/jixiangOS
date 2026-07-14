# CRM Import Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block unsafe CRM customer imports and bind uniquely matched employee and customer-tag IDs without adding new unmatched-customer UI.

**Architecture:** A small shared exact-name matcher provides one normalization rule for browser precheck and server enforcement. The browser presents missing and ambiguous owner/tag results and disables import, while `storageService.importCrmMigration` independently re-resolves current employee and tag directories inside the import transaction before writing any customer.

**Tech Stack:** React 18, TypeScript, MUI, Express, Prisma/MySQL, Node assert tests executed with tsx.

## Global Constraints

- Names remain display snapshots; authorization and tag assignment use IDs.
- Do not auto-bind the first employee or tag when more than one active record has the same name.
- Do not use fuzzy matching, aliases, or AI inference.
- Only team-customer final owners block import; public-pool owners and historical operator names do not.
- Keep source and tag synchronization; remove only the disabled bulk-employee creation UI.
- Do not add unmatched-owner badges, filters, or batch assignment pages.
- Do not clear or mutate current test data as part of implementation.

---

### Task 1: Shared unique-name matcher

**Files:**
- Create: `src/shared/utils/exactNameIdentity.ts`
- Create: `src/shared/utils/exactNameIdentity.test.ts`

**Interfaces:**
- Consumes: arrays of source names and active directory entries shaped as `{ id: string; name: string }`.
- Produces: `matchExactNamesToUniqueIds(names, entries): ExactNameIdentityMatch` with `idsByName`, `matched`, `missing`, and `ambiguous`.

- [ ] **Step 1: Write the failing matcher test**

```ts
import assert from 'node:assert/strict';
import { matchExactNamesToUniqueIds } from './exactNameIdentity';

const result = matchExactNamesToUniqueIds(
  [' 吕煜阳 ', 'VIP', '不存在'],
  [
    { id: 'u-1', name: '吕煜阳' },
    { id: 'tag-1', name: 'vip' },
    { id: 'tag-2', name: 'VIP' },
  ],
);
assert.deepEqual(result.matched, ['吕煜阳']);
assert.deepEqual(result.missing, ['不存在']);
assert.deepEqual(result.ambiguous, ['VIP']);
assert.equal(result.idsByName['吕煜阳'], 'u-1');
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node node_modules/tsx/dist/cli.mjs src/shared/utils/exactNameIdentity.test.ts
```

Expected: FAIL because `exactNameIdentity.ts` does not exist.

- [ ] **Step 3: Implement exact, case-insensitive unique matching**

```ts
export interface ExactNameDirectoryEntry { id: string; name: string }
export interface ExactNameIdentityMatch {
  idsByName: Record<string, string>;
  matched: string[];
  missing: string[];
  ambiguous: string[];
}

const key = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();

export function matchExactNamesToUniqueIds(names: string[], entries: ExactNameDirectoryEntry[]): ExactNameIdentityMatch {
  const normalizedNames = [...new Map(names.map((name) => [key(name), String(name).replace(/\s+/g, ' ').trim()])).entries()]
    .filter(([nameKey]) => Boolean(nameKey));
  const entriesByKey = new Map<string, ExactNameDirectoryEntry[]>();
  entries.forEach((entry) => entriesByKey.set(key(entry.name), [...(entriesByKey.get(key(entry.name)) || []), entry]));
  return normalizedNames.reduce<ExactNameIdentityMatch>((result, [nameKey, displayName]) => {
    const matches = entriesByKey.get(nameKey) || [];
    if (matches.length === 1) {
      result.matched.push(displayName);
      result.idsByName[displayName] = matches[0].id;
    } else if (matches.length > 1) result.ambiguous.push(displayName);
    else result.missing.push(displayName);
    return result;
  }, { idsByName: {}, matched: [], missing: [], ambiguous: [] });
}
```

- [ ] **Step 4: Run the matcher test and verify GREEN**

Run the Step 2 command. Expected: PASS with exit code 0.

- [ ] **Step 5: Commit the matcher**

```bash
git add src/shared/utils/exactNameIdentity.ts src/shared/utils/exactNameIdentity.test.ts
git commit -m "feat: add exact CRM identity matcher"
```

---

### Task 2: Precheck only final owners and detect ambiguous tags

**Files:**
- Modify: `src/api/crmMigrationApi.ts`
- Modify: `src/api/crmMigrationApi.test.ts`

**Interfaces:**
- Consumes: `matchExactNamesToUniqueIds` from Task 1, active users, active customer/both-scope tag catalog, and parsed team-customer rows.
- Produces: `CrmMigrationNameGroup` extended with `ambiguous: string[]`; `result.employees` represents final team-customer owners only.

- [ ] **Step 1: Add failing precheck assertions**

```ts
const result = analyzeCrmMigrationTables({
  teamCustomers: [
    { 客户跟进人: '吕煜阳', 客户创建人: '历史操作员', 客户标签: '高意向,VIP' },
  ],
  publicPool: [{ 客户跟进人: '不存在的原负责人' }],
}, {
  users: [
    { id: 'u-1', name: '吕煜阳', isActive: true, employmentStatus: 'active' },
  ],
  leadSourceConfigs: [],
  tagGroups: [
    { id: 'g-1', name: '意向', scope: 'customer', isActive: true },
    { id: 'g-2', name: '价值', scope: 'both', isActive: true },
  ],
  tags: [
    { id: 'tag-1', groupId: 'g-1', name: '高意向', isActive: true },
    { id: 'tag-2', groupId: 'g-1', name: 'VIP', isActive: true },
    { id: 'tag-3', groupId: 'g-2', name: 'vip', isActive: true },
  ],
});
assert.deepEqual(result.employees.matched, ['吕煜阳']);
assert.deepEqual(result.employees.missing, []);
assert.deepEqual(result.employees.ambiguous, []);
assert.deepEqual(result.tags.ambiguous, ['VIP']);
```

- [ ] **Step 2: Run the CRM API test and verify RED**

Run:

```bash
node node_modules/tsx/dist/cli.mjs src/api/crmMigrationApi.test.ts
```

Expected: FAIL because `ambiguous` is missing and historical/public-pool names still enter employee readiness.

- [ ] **Step 3: Replace set-only grouping with the shared matcher**

Update `CrmMigrationNameGroup`:

```ts
export interface CrmMigrationNameGroup {
  all: string[];
  matched: string[];
  missing: string[];
  ambiguous: string[];
  system: string[];
}
```

Build owner names only from `tables.teamCustomers` using the same fallback used by `createCustomerFromMigrationRow`:

```ts
const ownerNames = new Set((tables.teamCustomers || [])
  .map((row) => getAny(row, ['客户跟进人', '最后跟进人', '当前跟进人', '上一个跟进人']))
  .map(normalizeValue)
  .filter((name) => name && !EMPTY_MARKERS.has(name)));
const ownerMatch = matchExactNamesToUniqueIds([...ownerNames], users.map(({ id, name }) => ({ id: id || '', name })));
```

Build tag readiness with active tags and return `ambiguous` alongside `matched` and `missing`. Keep `system: []` for both result groups.

Extend `CrmMigrationExistingData` with `tagGroups` and require tag IDs/group IDs for matching:

```ts
export interface CrmMigrationExistingData {
  users?: Array<Pick<User, 'name' | 'isActive' | 'employmentStatus'> & Partial<Pick<User, 'id'>>>;
  leadSourceConfigs?: LeadSourceConfig[];
  tagGroups?: CustomerTagGroup[];
  tags?: Array<Pick<CustomerTag, 'id' | 'groupId' | 'name' | 'isActive'>>;
}
```

Only tags belonging to active groups with scope `customer` or `both` participate. `precheckFiles` passes both `catalogResponse.data.groups` and `catalogResponse.data.tags` to analysis.

- [ ] **Step 4: Run the CRM API test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit precheck behavior**

```bash
git add src/api/crmMigrationApi.ts src/api/crmMigrationApi.test.ts
git commit -m "feat: detect unsafe CRM owner and tag matches"
```

---

### Task 3: Gate import UI and remove the disabled employee action

**Files:**
- Create: `src/pages/Settings/crmMigrationImportState.ts`
- Create: `src/pages/Settings/crmMigrationImportState.test.ts`
- Modify: `src/pages/Settings/CrmMigration.tsx`

**Interfaces:**
- Consumes: `CrmMigrationPrecheckResult` from Task 2.
- Produces: `getCrmMigrationImportBlockers(result): string[]` and `canImportCrmMigration(result): boolean`.

- [ ] **Step 1: Write the failing import-state test**

```ts
import assert from 'node:assert/strict';
import { canImportCrmMigration, getCrmMigrationImportBlockers } from './crmMigrationImportState';

const result = {
  employees: { all: ['吕煜阳'], matched: [], missing: ['吕煜阳'], ambiguous: [], system: [] },
  tags: { all: ['VIP'], matched: [], missing: [], ambiguous: ['VIP'], system: [] },
} as any;
assert.equal(canImportCrmMigration(result), false);
assert.deepEqual(getCrmMigrationImportBlockers(result), [
  '请先创建负责人：吕煜阳',
  '标签名称不唯一：VIP',
]);
```

- [ ] **Step 2: Run the import-state test and verify RED**

Run:

```bash
node node_modules/tsx/dist/cli.mjs src/pages/Settings/crmMigrationImportState.test.ts
```

Expected: FAIL because the state module does not exist.

- [ ] **Step 3: Implement the pure UI gate**

```ts
export function getCrmMigrationImportBlockers(result: CrmMigrationPrecheckResult): string[] {
  return [
    result.employees.missing.length ? `请先创建负责人：${result.employees.missing.join('、')}` : '',
    result.employees.ambiguous.length ? `负责人姓名不唯一：${result.employees.ambiguous.join('、')}` : '',
    result.tags.missing.length ? `请先同步标签：${result.tags.missing.join('、')}` : '',
    result.tags.ambiguous.length ? `标签名称不唯一：${result.tags.ambiguous.join('、')}` : '',
  ].filter(Boolean);
}
export const canImportCrmMigration = (result: CrmMigrationPrecheckResult) => getCrmMigrationImportBlockers(result).length === 0;
```

- [ ] **Step 4: Wire the gate and remove obsolete employee UI**

In `CrmMigration.tsx`:

- remove `GroupAddIcon`, `createMissingEmployees`, and the “创建缺失员工” button;
- disable import with `!result || !canImportCrmMigration(result) || importing || checking || syncing`;
- render blocker alerts under the precheck summary;
- show separate lists for matched, missing, and ambiguous owners/tags;
- retain source synchronization and tag synchronization buttons.

- [ ] **Step 5: Run the state/API tests and build**

Run:

```bash
node node_modules/tsx/dist/cli.mjs src/pages/Settings/crmMigrationImportState.test.ts
node node_modules/tsx/dist/cli.mjs src/api/crmMigrationApi.test.ts
pnpm build
```

Expected: both tests PASS and Vite reports `built in`.

- [ ] **Step 6: Commit the UI gate**

```bash
git add src/pages/Settings/crmMigrationImportState.ts src/pages/Settings/crmMigrationImportState.test.ts src/pages/Settings/CrmMigration.tsx
git commit -m "feat: block unsafe CRM imports in precheck"
```

---

### Task 4: Enforce owner and tag IDs in the server transaction

**Files:**
- Modify: `server/services/storageService.ts`
- Modify: `server/services/storageService.test.ts`

**Interfaces:**
- Consumes: `matchExactNamesToUniqueIds`, active Prisma users, and active customer/both tag records stored under `aaos_customer_tag_groups` and `aaos_customer_tags`.
- Produces: imported customer JSON with `ownerId`, `ownerIdentityStatus: 'resolved'`, canonical `tags`, and ordered `manualTagIds`; returns code 409 without writes for missing/ambiguous owner or tag names.

- [ ] **Step 1: Add failing storage-service tests**

Add three import cases:

```ts
const missingOwner = await service.importCrmMigration([{ id: 'c-1', owner: '不存在', tags: [] }]);
assert.equal(missingOwner.code, 409);
assert.equal(createdRows.length, 0);

const ambiguousTag = await service.importCrmMigration([{ id: 'c-2', owner: '吕煜阳', tags: ['VIP'] }]);
assert.equal(ambiguousTag.code, 409);
assert.equal(createdRows.length, 0);

const valid = await service.importCrmMigration([{ id: 'c-3', owner: '吕煜阳', tags: ['高意向'] }]);
assert.equal(valid.code, 0);
assert.equal(createdRows[0].data.ownerId, 'u-1');
assert.deepEqual(createdRows[0].data.manualTagIds, ['tag-intent']);
assert.deepEqual(createdRows[0].data.tags, ['高意向']);
```

The fake Prisma directory must include one active user and active tag/group business records; the ambiguous case includes two active `VIP` tags in different groups.

- [ ] **Step 2: Run storage tests and verify RED**

Run:

```bash
node node_modules/tsx/dist/cli.mjs server/services/storageService.test.ts
```

Expected: FAIL because unsafe records are currently persisted and `manualTagIds` is not resolved.

- [ ] **Step 3: Resolve and validate identities before the first write**

Inside `importCrmMigration`:

```ts
const activeUsers = (await prisma.user.findMany()).filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active');
const catalog = await loadCustomerTagCatalog(prisma as any, false);
const activeGroupIds = new Set(catalog.groups.filter((group) => group.isActive && (group.scope === 'customer' || group.scope === 'both')).map((group) => group.id));
const activeTags = catalog.tags.filter((tag) => tag.isActive && activeGroupIds.has(tag.groupId));
```

For every team customer, require one employee match. For every customer tag name, require one tag match. Collect all failures before `createMany`; return a 409 response with the exact missing/ambiguous names if any list is non-empty. Rebuild accepted data from server matches:

```ts
const ownerMatch = matchExactNamesToUniqueIds([rawItem.owner], activeUsers);
const tagMatch = matchExactNamesToUniqueIds(rawItem.tags || [], activeTags);
const item = {
  ...rawItem,
  ownerId: rawItem.owner === '公海' ? undefined : ownerMatch.idsByName[rawItem.owner],
  ownerIdentityStatus: rawItem.owner === '公海' ? 'public_pool' : 'resolved',
  tags: (rawItem.tags || []).map((name: string) => activeTags.find((tag) => tag.id === tagMatch.idsByName[name])?.name || name),
  manualTagIds: (rawItem.tags || []).map((name: string) => tagMatch.idsByName[name]),
};
```

Do not use client-supplied `ownerId` or `manualTagIds`.

- [ ] **Step 4: Run server and client import tests**

Run:

```bash
node node_modules/tsx/dist/cli.mjs server/services/storageService.test.ts
node node_modules/tsx/dist/cli.mjs src/api/crmMigrationApi.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit server enforcement**

```bash
git add server/services/storageService.ts server/services/storageService.test.ts
git commit -m "feat: enforce CRM owner and tag identity binding"
```

---

### Task 5: Full verification and handoff

**Files:**
- Modify only if verification exposes a defect in files already listed above.

**Interfaces:**
- Consumes: completed browser precheck and server transaction behavior.
- Produces: a tested local preview ready for the user to clear test data and re-import.

- [ ] **Step 1: Run all tests**

```bash
pnpm test
```

Expected: all test files pass.

- [ ] **Step 2: Run production build**

```bash
pnpm build
```

Expected: TypeScript succeeds and Vite reports `built in`.

- [ ] **Step 3: Start isolated preview and verify API health**

Start API and Vite on free preview ports without stopping the current 3001/3002 services. Verify both endpoints return HTTP 200.

- [ ] **Step 4: Browser acceptance checks**

- missing owner: import button disabled and missing owner listed;
- duplicated owner: import button disabled and ambiguity listed;
- missing tag: sync action remains visible and import disabled;
- obsolete bulk employee action is absent;
- fully matched file: import enabled;
- imported customer shows a formal catalog tag rather than “历史未归类”.

- [ ] **Step 5: Commit any verification-only fix, otherwise record clean status**

```bash
git status --short
```

Expected: no uncommitted files.
