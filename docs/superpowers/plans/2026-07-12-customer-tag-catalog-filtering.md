# Customer Tag Catalog And Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text customer and lead tags with an administrator-managed manual tag catalog, enforce scope and single/multiple selection rules, inherit shared tags when a lead converts to a customer, and provide exact grouped customer filtering.

**Architecture:** Keep customers and leads in their current authoritative stores and add stable `manualTagIds` arrays alongside the legacy `tags` name snapshots during migration. Store tag groups and tag definitions as record-level business records managed only through dedicated Express commands; do not reuse destructive legacy whole-array storage writes. Lifecycle remains an independent system status, while manual tag selection and filtering resolve stable IDs through one server-owned catalog policy.

**Tech Stack:** React 18, TypeScript, MUI 6, Express 5, Prisma 6, MySQL JSON, Node assert tests, pnpm.

## Global Constraints

- Only the built-in active super-admin role may create, rename, merge, activate, deactivate, or reorder tag groups and tag definitions.
- Sales specialists, managers, directors, and other employees may only select active preset tags while editing records already allowed by their existing data scope.
- A group with `selectionMode: 'single'` permits at most one assigned tag on one subject; `selectionMode: 'multiple'` permits more than one.
- Tag group `scope` is exactly `lead`, `customer`, or `both`.
- When a lead converts to a customer, only active assignments from `scope: 'both'` are inherited automatically.
- Lead-only assignments remain on the lead history; customer-only tags may be selected after conversion.
- Customer lifecycle is never copied into `manualTagIds` and is never inferred from historical manual tags such as `已退款` or `无意向`.
- Existing `tags: string[]` values are retained as a compatibility snapshot until migration and rollback validation are complete.
- Active business records save tag IDs, not names. Renaming a tag must not rewrite every customer or lead.
- An in-use tag or group is never hard-deleted. It is deactivated or merged into an active target, with an audit record.
- Tag catalog writes use dedicated record-level commands. `PUT /api/storage/:key` must not manage `TAGS` or `TAG_GROUPS`.
- Customer data visibility remains `self`, `department`, or `all`; adding a tag filter must never broaden the visible record set.
- First version excludes automatic rule evaluation, nested arbitrary condition builders, saved audiences, and automated marketing actions.
- Existing 4,880 customers and their historical manual tag meanings must be preserved without automatic lifecycle conversion.

---

## File Structure

- `src/types/tag.ts`: shared tag group, tag definition, catalog, migration, and filter contracts.
- `src/types/customer.ts`: customer `manualTagIds` and grouped filter inputs.
- `src/types/lead.ts`: lead `manualTagIds` compatibility field.
- `src/shared/utils/constants.ts`: `TAG_GROUPS` storage domain key.
- `src/shared/utils/permissions.ts`: settings permission vocabulary for the tag management tab.
- `server/services/customerTagPolicy.ts`: pure normalization, assignment validation, inheritance, and filter grouping rules.
- `server/services/customerTagService.ts`: authoritative catalog CRUD, merge, usage counts, and audit events.
- `server/services/customerTagMigrationService.ts`: preview and idempotent application of legacy name-to-ID migration.
- `src/api/customerTagApi.ts`: browser adapter for active catalog and super-admin management commands.
- `src/shared/components/ManualTagSelector.tsx`: reusable grouped preset selector for leads and customers.
- `src/pages/Settings/CustomerTagConfig.tsx`: super-admin group/tag management page.
- `src/pages/Customers/CustomerTagFilter.tsx`: grouped customer list filter popover.
- Existing customer and lead form/detail/service files: assignment validation, display, and conversion inheritance.
- Existing customer list route/query files: exact tag-ID filters combined with current server-side pagination and data scope.

---

### Task 1: Lock Shared Contracts And The Super-Admin Settings Boundary

**Files:**
- Modify: `src/types/tag.ts`
- Modify: `src/types/customer.ts`
- Modify: `src/types/lead.ts`
- Modify: `src/shared/utils/constants.ts`
- Modify: `src/shared/utils/permissions.ts`
- Test: `src/api/customerTagPermissionModel.test.ts`

**Interfaces:**
- Produces `ManualTagScope`, `ManualTagSelectionMode`, `CustomerTagGroup`, `CustomerTag`, `CustomerTagCatalog`, `CustomerTagFilterMode`, and `CustomerTagMigrationPreview`.
- Produces `PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS`.
- Adds `Customer.manualTagIds`, `Lead.manualTagIds`, `CustomerFilters.tagIds`, and `CustomerFilters.tagMatch`.

- [ ] **Step 1: Write the failing permission and type contract test**

```ts
import assert from 'node:assert/strict';
import { PERMISSION_KEYS } from '../shared/utils/permissions';
import { STORAGE_KEYS } from '../shared/utils/constants';

assert.equal(PERMISSION_KEYS.SETTINGS_CUSTOMER_TAGS, '系统设置/客户设置/客户标签');
assert.equal(STORAGE_KEYS.TAG_GROUPS, 'aaos_tag_groups');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec tsx src/api/customerTagPermissionModel.test.ts`

Expected: FAIL because `SETTINGS_CUSTOMER_TAGS`, `TAG_GROUPS`, and the grouped contracts do not exist.

- [ ] **Step 3: Add the exact shared contracts**

```ts
export type ManualTagScope = 'lead' | 'customer' | 'both';
export type ManualTagSelectionMode = 'single' | 'multiple';
export type CustomerTagFilterMode = 'grouped' | 'any' | 'all';

export interface CustomerTagGroup {
  id: ID;
  name: string;
  color: string;
  selectionMode: ManualTagSelectionMode;
  scope: ManualTagScope;
  isActive: boolean;
  sortOrder: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CustomerTag {
  id: ID;
  groupId: ID;
  name: string;
  color?: string;
  isActive: boolean;
  sortOrder: number;
  usageCount: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface CustomerTagCatalog {
  groups: CustomerTagGroup[];
  tags: CustomerTag[];
}

export interface CustomerTagMigrationPreview {
  customerCount: number;
  leadCount: number;
  assignmentCount: number;
  missingNames: string[];
  checksum: string;
}
```

Add `manualTagIds?: ID[]` to `Customer` and `Lead`. Add the following to `CustomerFilters`:

```ts
tagIds?: ID[];
tagMatch?: CustomerTagFilterMode;
withoutTags?: boolean;
missingTagGroupId?: ID;
tag?: string; // one-release compatibility for the old free-text URL
```

Add these constants:

```ts
TAG_GROUPS: `${STORAGE_PREFIX}tag_groups`,
SETTINGS_CUSTOMER_TAGS: '系统设置/客户设置/客户标签',
```

Register the permission as a leaf key, but do not add it to any non-super-admin default role. Task 6 mounts the settings tab only after its component exists.

- [ ] **Step 4: Run the focused permission and type checks**

Run: `pnpm exec tsx src/api/customerTagPermissionModel.test.ts && pnpm exec tsc -b --pretty false`

Expected: PASS.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add src/types/tag.ts src/types/customer.ts src/types/lead.ts src/shared/utils/constants.ts src/shared/utils/permissions.ts src/api/customerTagPermissionModel.test.ts
git commit -m "feat: define controlled customer tag contracts"
```

---

### Task 2: Build A Pure Tag Assignment And Inheritance Policy

**Files:**
- Create: `server/services/customerTagPolicy.ts`
- Test: `server/services/customerTagPolicy.test.ts`

**Interfaces:**
- Consumes `CustomerTagCatalog`, `ManualTagScope`, and tag ID arrays.
- Produces `normalizeManualTagIds`, `validateManualTagSelection`, `inheritableCustomerTagIds`, and `groupTagIdsForFilter`.

- [ ] **Step 1: Write failing policy tests for normalization, single-select enforcement, scope, and inheritance**

```ts
import assert from 'node:assert/strict';
import type { CustomerTagCatalog } from '../../src/types/tag';
import {
  groupTagIdsForFilter,
  inheritableCustomerTagIds,
  normalizeManualTagIds,
  validateManualTagSelection,
} from './customerTagPolicy';

const catalog: CustomerTagCatalog = {
  groups: [
    { id: 'g-intent', name: '意向', color: '#16a34a', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 1, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 'g-contact', name: '联系状态', color: '#ef4444', selectionMode: 'single', scope: 'lead', isActive: true, sortOrder: 2, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
  ],
  tags: [
    { id: 't-agent', groupId: 'g-intent', name: '代理意向', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 't-private', groupId: 'g-intent', name: '贴牌意向', isActive: true, sortOrder: 2, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 't-no-phone', groupId: 'g-contact', name: '无法接通', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 't-no-wechat', groupId: 'g-contact', name: '微信搜不到', isActive: true, sortOrder: 2, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
  ],
};

assert.deepEqual(normalizeManualTagIds([' t-agent ', 't-agent', 't-private']), ['t-agent', 't-private']);
assert.equal(validateManualTagSelection(catalog, 'customer', ['t-agent']).ok, true);
assert.equal(validateManualTagSelection(catalog, 'customer', ['t-no-phone']).ok, false);
assert.equal(validateManualTagSelection(catalog, 'lead', ['t-no-phone', 't-no-wechat']).ok, false);
assert.deepEqual(inheritableCustomerTagIds(catalog, ['t-agent', 't-no-phone']), ['t-agent']);
assert.deepEqual(groupTagIdsForFilter(catalog, ['t-agent', 't-private']), [['t-agent', 't-private']]);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec tsx server/services/customerTagPolicy.test.ts`

Expected: FAIL because `customerTagPolicy.ts` is absent.

- [ ] **Step 3: Implement the pure policy with bounded inputs**

```ts
import type { CustomerTagCatalog, ManualTagScope } from '../../src/types/tag';

const MAX_TAGS_PER_SUBJECT = 20;

export function normalizeManualTagIds(ids: string[] = []): string[] {
  return Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean))).slice(0, MAX_TAGS_PER_SUBJECT + 1);
}

export function validateManualTagSelection(catalog: CustomerTagCatalog, scope: Exclude<ManualTagScope, 'both'>, ids: string[]) {
  const normalized = normalizeManualTagIds(ids);
  if (normalized.length > MAX_TAGS_PER_SUBJECT) return { ok: false as const, message: `每条记录最多选择 ${MAX_TAGS_PER_SUBJECT} 个标签` };
  const groups = new Map(catalog.groups.map((group) => [group.id, group]));
  const tags = new Map(catalog.tags.map((tag) => [tag.id, tag]));
  const counts = new Map<string, number>();
  for (const id of normalized) {
    const tag = tags.get(id);
    const group = tag ? groups.get(tag.groupId) : undefined;
    if (!tag || !group || !tag.isActive || !group.isActive) return { ok: false as const, message: '标签不存在或已停用' };
    if (group.scope !== 'both' && group.scope !== scope) return { ok: false as const, message: '标签不适用于当前记录类型' };
    counts.set(group.id, (counts.get(group.id) || 0) + 1);
    if (group.selectionMode === 'single' && (counts.get(group.id) || 0) > 1) return { ok: false as const, message: `标签分组“${group.name}”只能选择一项` };
  }
  return { ok: true as const, tagIds: normalized };
}

export function inheritableCustomerTagIds(catalog: CustomerTagCatalog, ids: string[]): string[] {
  const groupById = new Map(catalog.groups.map((group) => [group.id, group]));
  return normalizeManualTagIds(ids).filter((id) => {
    const tag = catalog.tags.find((item) => item.id === id && item.isActive);
    return tag && groupById.get(tag.groupId)?.isActive && groupById.get(tag.groupId)?.scope === 'both';
  });
}

export function groupTagIdsForFilter(catalog: CustomerTagCatalog, ids: string[]): string[][] {
  const tagById = new Map(catalog.tags.map((tag) => [tag.id, tag]));
  const grouped = new Map<string, string[]>();
  normalizeManualTagIds(ids).forEach((id) => {
    const tag = tagById.get(id);
    if (tag) grouped.set(tag.groupId, [...(grouped.get(tag.groupId) || []), id]);
  });
  return Array.from(grouped.values());
}
```

- [ ] **Step 4: Run the focused policy test**

Run: `pnpm exec tsx server/services/customerTagPolicy.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the policy**

```bash
git add server/services/customerTagPolicy.ts server/services/customerTagPolicy.test.ts
git commit -m "feat: enforce customer tag assignment policy"
```

---

### Task 3: Add Authoritative Record-Level Catalog Commands

**Files:**
- Create: `server/services/customerTagService.ts`
- Test: `server/services/customerTagService.test.ts`
- Modify: `server/index.ts`
- Modify: `server/services/legacyStorageAccess.ts`
- Modify: `server/services/legacyStorageAccess.test.ts`
- Test: `server/customerTagRoutesAuth.test.ts`

**Interfaces:**
- Produces active catalog read routes and super-admin-only catalog management routes.
- Produces `loadCustomerTagCatalog(tx, includeInactive)` for customer and lead command services.
- Removes catalog writes from the generic whole-array storage route.

The HTTP contract is:

```text
GET  /api/customer-tags/catalog?scope=customer|lead&includeInactive=false
POST /api/customer-tags/groups
PUT  /api/customer-tags/groups/:id
POST /api/customer-tags
PUT  /api/customer-tags/:id
POST /api/customer-tags/:id/merge
```

- [ ] **Step 1: Write failing service tests**

Cover all of these assertions in `customerTagService.test.ts`:

```ts
assert.equal((await service.createGroup(validGroup, salesUser)).code, 403);
assert.equal((await service.createGroup(validGroup, superAdmin)).code, 0);
assert.equal((await service.createGroup(validGroup, superAdmin)).code, 409);
assert.equal((await service.createTag({ groupId, name: '高意向' }, superAdmin)).code, 0);
assert.equal((await service.createTag({ groupId, name: ' 高意向 ' }, superAdmin)).code, 409);
assert.equal((await service.updateTag(inUseTagId, { isActive: false }, superAdmin)).code, 0);
assert.equal((await service.mergeTag(sourceId, targetId, superAdmin)).code, 0);
assert.deepEqual(updatedCustomer.manualTagIds, [targetId]);
assert.ok(updatedCustomer.activityRecords.some((item) => item.title === '合并客户标签'));
```

The fake Prisma role lookup must prove that management uses an active database role with `code === 'super_admin'`; session permission arrays alone are not accepted.

- [ ] **Step 2: Run service and route tests and verify RED**

Run: `pnpm exec tsx server/services/customerTagService.test.ts && pnpm exec tsx server/customerTagRoutesAuth.test.ts`

Expected: FAIL because the service and routes are missing.

- [ ] **Step 3: Implement catalog storage and validation**

Store groups under `STORAGE_KEYS.TAG_GROUPS` and tags under `STORAGE_KEYS.TAGS` as one `BusinessRecord` per definition. Normalize names with `trim()` and enforce case-insensitive uniqueness inside one group. Compute `usageCount` from customer and lead `manualTagIds`; do not trust the legacy stored counter.

Expose this stable loader:

```ts
export async function loadCustomerTagCatalog(
  tx: Pick<Prisma.TransactionClient, 'businessRecord'>,
  includeInactive = false,
): Promise<CustomerTagCatalog>;
```

Management commands must resolve `currentUser.roleId` against `prisma.role` and require an active row with `code === 'super_admin'`. Merge must update customer and lead IDs plus their name snapshots in one transaction and append audit entries.

- [ ] **Step 4: Disable legacy catalog writes**

Add both storage keys to `COMMAND_ONLY_WRITE_KEYS` in `legacyStorageAccess.ts`:

```ts
STORAGE_KEYS.TAGS,
STORAGE_KEYS.TAG_GROUPS,
```

Extend `legacyStorageAccess.test.ts` to assert both keys return `write: false` for customer editors and super-admins through the generic route.

- [ ] **Step 5: Mount routes with separate read and manage boundaries**

Catalog read requires any existing customer-list or lead-detail read permission. Management routes call the service's database-backed built-in super-admin check even if middleware has already run. Return 201 for creates, 200 for updates/merge, 403 for non-admin, 404 for missing IDs, and 409 for duplicate names or incompatible merge groups.

- [ ] **Step 6: Run focused and storage authorization tests**

Run: `pnpm exec tsx server/services/customerTagService.test.ts && pnpm exec tsx server/customerTagRoutesAuth.test.ts && pnpm exec tsx server/services/legacyStorageAccess.test.ts && pnpm exec tsx server/storageRoutesAuth.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit catalog commands**

```bash
git add server/services/customerTagService.ts server/services/customerTagService.test.ts server/index.ts server/services/legacyStorageAccess.ts server/services/legacyStorageAccess.test.ts server/customerTagRoutesAuth.test.ts
git commit -m "feat: add authoritative customer tag catalog"
```

---

### Task 4: Migrate Existing Name Tags To Stable IDs Without Changing Meaning

**Files:**
- Create: `server/services/customerTagMigrationService.ts`
- Test: `server/services/customerTagMigrationService.test.ts`
- Modify: `server/index.ts`
- Create: `src/api/customerTagApi.ts`
- Test: `src/api/customerTagApi.test.ts`

**Interfaces:**
- Produces `previewLegacyTagMigration()` and `applyLegacyTagMigration(checksum, actor)`.
- Produces super-admin endpoints `/api/customer-tags/migration/preview` and `/api/customer-tags/migration/apply`.
- Maintains dual `manualTagIds` and `tags` snapshots during the compatibility release.

- [ ] **Step 1: Write migration tests for exact mapping, unknown names, historical semantics, and idempotency**

Use fixtures containing `已退款`, `无意向`, `高意向`, and an unknown historical tag. Assert:

```ts
assert.deepEqual(preview.missingNames, ['历史自定义']);
assert.equal(preview.assignmentCount, 4);
assert.equal(applied.code, 0);
assert.equal(secondApply.code, 0);
assert.equal(secondApply.data?.updatedCustomers, 0);
assert.equal(updatedCustomer.lifecycleStatusCode, 'public_pool');
assert.ok(updatedCustomer.manualTagIds?.length);
assert.deepEqual(updatedCustomer.tags, ['已退款', '无意向']);
```

The lifecycle assertion proves historical tag names are not reinterpreted as system states.

- [ ] **Step 2: Run migration tests and verify RED**

Run: `pnpm exec tsx server/services/customerTagMigrationService.test.ts`

Expected: FAIL because the migration service is absent.

- [ ] **Step 3: Implement preview and checksum-protected apply**

Preview must:

- Read all non-deleted customers, leads, and existing tag definitions.
- Normalize names by trimming and exact case-insensitive comparison only.
- Create no data.
- Return counts, sorted missing names, and a SHA-256 checksum of the record IDs plus tag snapshots.

Apply must:

- Recompute and reject a stale checksum with HTTP 409.
- Create missing names inside an active `历史未归类` group with `selectionMode: 'multiple'` and `scope: 'both'`.
- Add stable `manualTagIds` while retaining the original `tags` names.
- Never modify lifecycle, owner, order, finance, or commission fields.
- Be idempotent after partial interruption.
- Append one migration audit record containing actor, counts, checksum, and time.

- [ ] **Step 4: Add and test browser API methods**

```ts
fetchCustomerTagCatalog(scope: 'lead' | 'customer', includeInactive = false)
previewCustomerTagMigration()
applyCustomerTagMigration(checksum: string)
createCustomerTagGroup(input)
updateCustomerTagGroup(id, input)
createCustomerTag(input)
updateCustomerTag(id, input)
mergeCustomerTag(sourceTagId, targetTagId)
```

Run: `pnpm exec tsx src/api/customerTagApi.test.ts`

Expected: PASS with exact HTTP methods, paths, and propagated 403/409 errors.

- [ ] **Step 5: Commit the migration boundary**

```bash
git add server/services/customerTagMigrationService.ts server/services/customerTagMigrationService.test.ts server/index.ts src/api/customerTagApi.ts src/api/customerTagApi.test.ts
git commit -m "feat: migrate legacy customer tags to stable ids"
```

---

### Task 5: Enforce Preset Assignments And Conversion Inheritance On The Server

**Files:**
- Modify: `server/services/customerListService.ts`
- Modify: `server/services/customerListService.test.ts`
- Modify: `server/services/customerCommandService.ts`
- Modify: `server/services/customerCommandService.test.ts`
- Modify: `src/api/leadBulkImportApi.ts`
- Modify: `src/api/leadBulkImportApi.test.ts`

**Interfaces:**
- Customer and lead creates/updates accept `manualTagIds` only for active preset selections.
- Server persists `manualTagIds` plus catalog-derived legacy `tags` name snapshots.
- `convertLeadToCustomer` inherits only tags whose active group scope is `both`.

- [ ] **Step 1: Add failing customer and lead command tests**

Cover these exact behaviors:

```ts
assert.equal((await createCustomer({ manualTagIds: ['missing'] }, sales)).code, 400);
assert.equal((await updateCustomer(customerId, { manualTagIds: ['lead-only'] }, sales)).code, 400);
assert.equal((await updateLead(leadId, { manualTagIds: ['single-a', 'single-b'] }, sales)).code, 400);
assert.deepEqual((await updateCustomer(customerId, { manualTagIds: ['shared'] }, sales)).data?.tags, ['高意向']);
assert.deepEqual(convertedCustomer.manualTagIds, ['shared']);
assert.deepEqual(convertedCustomer.tags, ['高意向']);
assert.deepEqual(convertedLead.manualTagIds, ['shared', 'lead-only']);
```

Also assert that a user without customer/lead edit permission still receives 403 before tag validation reveals catalog details.

- [ ] **Step 2: Run focused service tests and verify RED**

Run: `pnpm exec tsx server/services/customerListService.test.ts && pnpm exec tsx server/services/customerCommandService.test.ts`

Expected: FAIL on invalid tag acceptance and unfiltered conversion inheritance.

- [ ] **Step 3: Validate assignments inside existing transactions**

For customer create/update and lead create/update:

1. Load the catalog through `loadCustomerTagCatalog(tx, false)`.
2. Call `validateManualTagSelection(catalog, 'customer' | 'lead', input.manualTagIds || [])`.
3. Reject invalid IDs, inactive definitions, scope mismatches, and single-select conflicts with 400.
4. Persist normalized IDs and derive `tags` from catalog names.
5. Add assignment changes to `activityRecords` or `changeHistory` with actor and timestamp.

In `convertLeadToCustomer`, call `inheritableCustomerTagIds` and derive the customer name snapshot from those IDs. Do not remove lead-only tags from the lead.

- [ ] **Step 4: Tighten Excel import behavior**

The import parser may continue reading comma-separated names, but persistence must resolve every name against active preset tags valid for `lead` or `both`. Unknown names produce an import-row error:

```text
标签“{label}”未在系统设置中预设
```

CRM migration remains the only flow allowed to create missing historical definitions, and only through its super-admin migration command.

- [ ] **Step 5: Run focused customer, lead, import, and conversion tests**

Run: `pnpm exec tsx server/services/customerListService.test.ts && pnpm exec tsx server/services/customerCommandService.test.ts && pnpm exec tsx src/api/leadBulkImportApi.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit server assignment enforcement**

```bash
git add server/services/customerListService.ts server/services/customerListService.test.ts server/services/customerCommandService.ts server/services/customerCommandService.test.ts src/api/leadBulkImportApi.ts src/api/leadBulkImportApi.test.ts
git commit -m "feat: enforce preset tags across customer workflows"
```

---

### Task 6: Add The Super-Admin Tag Management Page

**Files:**
- Create: `src/pages/Settings/CustomerTagConfig.tsx`
- Modify: `src/pages/Settings/index.tsx`
- Test: `src/api/customerTagSettingsStatic.test.ts`

**Interfaces:**
- Consumes the management methods from `customerTagApi`.
- Produces group creation/editing, tag creation/editing, deactivate/reactivate, merge, migration preview/apply, and usage display.

- [ ] **Step 1: Write the failing settings UI contract test**

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/pages/Settings/CustomerTagConfig.tsx', 'utf8');
assert.match(source, /人工标签/);
assert.match(source, /添加分组/);
assert.match(source, /单选/);
assert.match(source, /多选/);
assert.match(source, /适用范围/);
assert.match(source, /合并标签/);
assert.match(source, /整理历史标签/);
assert.doesNotMatch(source, /freeSolo/);
```

- [ ] **Step 2: Run the static test and verify RED**

Run: `pnpm exec tsx src/api/customerTagSettingsStatic.test.ts`

Expected: FAIL because the settings page does not exist.

- [ ] **Step 3: Implement the confirmed management interaction**

Build a two-pane MUI layout following the existing settings visual language:

- Left pane: groups, group color, scope icon/text, active state, add group.
- Right pane: selected group editor, single/multiple mode, scope, tags ordered by `sortOrder`.
- Tag actions: create, rename, recolor, reorder, activate/deactivate, merge into a compatible active tag.
- In-use definitions show computed usage count and no hard-delete button.
- Migration action first shows preview counts and missing names; apply requires typing `整理历史标签` and sends the preview checksum.
- A read-only note explains that lifecycle is configured in the existing `客户生命周期` tab and is not duplicated as a manual tag.

Use dialogs with server error propagation; never update catalog state optimistically before a successful response.

- [ ] **Step 4: Run static test, TypeScript, and permission tests**

Run: `pnpm exec tsx src/api/customerTagSettingsStatic.test.ts && pnpm exec tsx src/api/customerTagPermissionModel.test.ts && pnpm exec tsc -b --pretty false`

Expected: PASS.

- [ ] **Step 5: Commit the settings UI**

```bash
git add src/pages/Settings/CustomerTagConfig.tsx src/pages/Settings/index.tsx src/api/customerTagSettingsStatic.test.ts
git commit -m "feat: add customer tag settings"
```

---

### Task 7: Replace Free-Text Inputs With One Reusable Preset Selector

**Files:**
- Create: `src/shared/components/ManualTagSelector.tsx`
- Test: `src/api/manualTagSelectorStatic.test.ts`
- Modify: `src/pages/Customers/CustomerForm.tsx`
- Modify: `src/pages/Customers/CustomerDetail.tsx`
- Modify: `src/pages/Leads/LeadForm.tsx`
- Modify: `src/pages/Leads/LeadDetail.tsx`
- Modify: `src/pages/Customers/index.tsx`
- Modify: `src/pages/Leads/index.tsx`

**Interfaces:**
- `ManualTagSelector` accepts `scope`, `value`, `onChange`, `disabled`, and `includeInactiveSelected`.
- Forms submit `manualTagIds`; free-text tag creation is removed.
- Lists and details display catalog colors and retain inactive historical selections.

- [ ] **Step 1: Write a failing source contract test**

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const selector = readFileSync('src/shared/components/ManualTagSelector.tsx', 'utf8');
assert.match(selector, /scope: 'lead' \| 'customer'/);
assert.match(selector, /selectionMode === 'single'/);
assert.match(selector, /includeInactiveSelected/);
assert.doesNotMatch(selector, /freeSolo/);

for (const path of [
  'src/pages/Customers/CustomerForm.tsx',
  'src/pages/Customers/CustomerDetail.tsx',
  'src/pages/Leads/LeadForm.tsx',
  'src/pages/Leads/LeadDetail.tsx',
]) {
  const source = readFileSync(path, 'utf8');
  assert.match(source, /ManualTagSelector/);
  assert.doesNotMatch(source, /标签（逗号分隔）/);
}
```

- [ ] **Step 2: Run the static test and verify RED**

Run: `pnpm exec tsx src/api/manualTagSelectorStatic.test.ts`

Expected: FAIL because the selector is missing and forms still expose free text.

- [ ] **Step 3: Implement the selector**

The selector must:

- Fetch the active catalog for its `scope` through `customerTagApi`.
- Group options by active group and render group color plus tag color.
- Replace the prior selection when selecting a second item in a single-select group.
- Permit multiple selections in multi-select groups.
- Keep selected inactive tags visible with an `已停用` suffix, but disallow adding them.
- Return only stable IDs.
- Show load and server error states; never fall back to arbitrary text.

- [ ] **Step 4: Replace all four free-text edit surfaces and both list renderers**

Customer and lead payloads use:

```ts
manualTagIds: selectedManualTagIds,
```

Remove comma parsing from normal forms/details. Render tags by catalog lookup and use the group's color when a tag has no color override. Legacy names without an ID remain visible as neutral `历史未归类` chips until migration is applied.

- [ ] **Step 5: Run selector, existing tag display, customer, and lead tests**

Run: `pnpm exec tsx src/api/manualTagSelectorStatic.test.ts && pnpm exec tsx src/api/customerDetailTagInputStatic.test.ts && pnpm exec tsx src/api/leadListTagStyleStatic.test.ts && pnpm exec tsc -b --pretty false`

Expected: the new selector test passes. Update `customerDetailTagInputStatic.test.ts` to assert preset ID submission rather than the removed free-text parser; all focused tests pass.

- [ ] **Step 6: Commit selector adoption**

```bash
git add src/shared/components/ManualTagSelector.tsx src/pages/Customers/CustomerForm.tsx src/pages/Customers/CustomerDetail.tsx src/pages/Leads/LeadForm.tsx src/pages/Leads/LeadDetail.tsx src/pages/Customers/index.tsx src/pages/Leads/index.tsx src/api/manualTagSelectorStatic.test.ts src/api/customerDetailTagInputStatic.test.ts src/api/leadListTagStyleStatic.test.ts
git commit -m "feat: replace free-text customer tags"
```

---

### Task 8: Add Exact Grouped Customer Tag Filtering

**Files:**
- Create: `src/pages/Customers/CustomerTagFilter.tsx`
- Modify: `src/pages/Customers/index.tsx`
- Modify: `src/api/customerApi.ts`
- Modify: `src/api/customerApi.test.ts`
- Modify: `server/index.ts`
- Modify: `server/services/customerListService.ts`
- Modify: `server/services/customerListService.test.ts`

**Interfaces:**
- HTTP uses repeated `tagId` query parameters plus `tagMatch=grouped|any|all`.
- `grouped` means OR within one tag group and AND across selected groups.
- `any` means any selected tag matches; `all` means every selected tag must be assigned.
- The old single `tag` query remains exact-name compatible for one release and is not used by the new UI.
- `withoutTags=true` matches customers with no assigned manual tag IDs.
- `missingTagGroupId=<group-id>` matches customers with no assigned tag from that active group.

- [ ] **Step 1: Write failing client serialization tests**

```ts
await customerApi.fetchCustomers({ tagIds: ['t-agent', 't-private'], tagMatch: 'grouped', page: 1, pageSize: 10 });
assert.match(requestedUrl, /tagId=t-agent/);
assert.match(requestedUrl, /tagId=t-private/);
assert.match(requestedUrl, /tagMatch=grouped/);
assert.doesNotMatch(requestedUrl, /tagIds=t-agent%2Ct-private/);
```

- [ ] **Step 2: Write failing server query tests**

Use customers assigned `t-agent`, `t-private`, and a value-group `t-high-budget`. Assert:

```ts
assert.deepEqual(await ids(list({ tagIds: ['t-agent', 't-private'], tagMatch: 'any' })), ['agent-only', 'both-intents', 'private-only']);
assert.deepEqual(await ids(list({ tagIds: ['t-agent', 't-private'], tagMatch: 'all' })), ['both-intents']);
assert.deepEqual(await ids(list({ tagIds: ['t-agent', 't-private', 't-high-budget'], tagMatch: 'grouped' })), ['high-budget-agent', 'high-budget-private']);
```

Also assert count and pagination totals match, and a self-scoped salesperson never sees another owner's matching customer.

Add fixtures proving `withoutTags=true` returns only records with no manual assignments and `missingTagGroupId=g-intent` excludes every record carrying an intent-group tag.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `pnpm exec tsx src/api/customerApi.test.ts && pnpm exec tsx server/services/customerListService.test.ts`

Expected: FAIL because arrays are currently serialized as comma strings and the server only performs one fuzzy name search.

- [ ] **Step 4: Serialize repeated tag IDs and validate route inputs**

In `customerApi.fetchCustomers`, use `params.append('tagId', id)` for each normalized ID. In `server/index.ts`, add a helper returning all string values from `req.query.tagId`, cap at 20 IDs, and reject unsupported `tagMatch` with 400. Parse `withoutTags` as a strict boolean and validate `missingTagGroupId` against the active catalog.

- [ ] **Step 5: Build exact MySQL JSON conditions inside the existing combined WHERE**

Use a helper equivalent to:

```ts
const containsTagId = (tagId: string) => Prisma.sql`
  JSON_CONTAINS(
    COALESCE(JSON_EXTRACT(data, '$.manualTagIds'), JSON_ARRAY()),
    JSON_QUOTE(${tagId})
  ) = 1
`;
```

- `any`: join tag conditions with `OR`.
- `all`: join tag conditions with `AND`.
- `grouped`: load catalog definitions, group selected IDs through `groupTagIdsForFilter`, join IDs inside a group with `OR`, and join groups with `AND`.
- `withoutTags`: require `$.manualTagIds` to be absent or an empty JSON array.
- `missingTagGroupId`: load every active tag ID in the selected group and require every corresponding `JSON_CONTAINS` condition to be false.
- During the compatibility release, exact legacy-name checks use `JSON_CONTAINS` against `$.tags`; never use `%...%`.
- Append the final tag SQL to the same `conditions` array already combined with lifecycle, deleted-state, and `buildVisibilityWhere` data-scope SQL before count and pagination.

- [ ] **Step 6: Implement the grouped filter popover**

Replace the free-text `客户标签` field with `CustomerTagFilter`:

- Group active customer/both definitions by group.
- Multi-select preset labels only.
- Default mode `按分组匹配` (`grouped`).
- Offer `包含任意标签` (`any`) and `同时包含全部标签` (`all`).
- Offer `无人工标签` as an explicit empty-state filter represented by `withoutTags: true`.
- Offer `未设置某分组` by selecting one active group and sending `missingTagGroupId`.
- Applying or clearing tags resets page to 1 and reloads through the server.

- [ ] **Step 7: Run client, server, data-scope, and TypeScript tests**

Run: `pnpm exec tsx src/api/customerApi.test.ts && pnpm exec tsx server/services/customerListService.test.ts && pnpm exec tsx src/api/dataVisibility.test.ts && pnpm exec tsc -b --pretty false`

Expected: PASS.

- [ ] **Step 8: Commit exact filtering**

```bash
git add src/pages/Customers/CustomerTagFilter.tsx src/pages/Customers/index.tsx src/api/customerApi.ts src/api/customerApi.test.ts server/index.ts server/services/customerListService.ts server/services/customerListService.test.ts
git commit -m "feat: add exact grouped customer tag filters"
```

---

### Task 9: Run Migration Smoke, Role QA, And Full Regression

**Files:**
- Create: `scripts/qa/customer-tag-smoke.ts`
- Modify: `BUG_FIX_LOG.md`
- Modify: `CHANGELOG.md`
- Modify: `RELEASE_CHECKLIST.md`

**Interfaces:**
- Produces a loopback-only QA script that creates isolated tag fixtures, validates assignment/filter/inheritance, and removes only its own fixtures.
- Produces current verification evidence without changing production data.

- [ ] **Step 1: Write the loopback-only QA script**

The script must reject non-loopback hosts and `NODE_ENV=production`, require credentials through environment variables, use a unique run ID, and verify:

1. Sales cannot create a tag group or tag: HTTP 403.
2. Super-admin can create one shared multi-select group, one lead-only single-select group, and three tags.
3. Sales can assign valid tags only to an editable record.
4. The second lead-only tag replaces or is rejected against the first according to the server contract.
5. Lead conversion inherits shared tags and retains lead-only history.
6. `grouped`, `any`, and `all` customer filters return the expected isolated fixture IDs.
7. Tag rename changes display through ID lookup without rewriting assignments.
8. Deactivated tags remain displayed but cannot be newly assigned.
9. Cleanup deletes only `qa-tag-*` definitions and fixture records after all assertions, even when an assertion fails.

- [ ] **Step 2: Run all focused tag tests**

Run:

```bash
pnpm exec tsx src/api/customerTagPermissionModel.test.ts
pnpm exec tsx server/services/customerTagPolicy.test.ts
pnpm exec tsx server/services/customerTagService.test.ts
pnpm exec tsx server/services/customerTagMigrationService.test.ts
pnpm exec tsx src/api/customerTagApi.test.ts
pnpm exec tsx src/api/customerTagSettingsStatic.test.ts
pnpm exec tsx src/api/manualTagSelectorStatic.test.ts
pnpm exec tsx src/api/customerApi.test.ts
pnpm exec tsx server/services/customerListService.test.ts
pnpm exec tsx server/services/customerCommandService.test.ts
```

Expected: every command exits 0.

- [ ] **Step 3: Run full automated verification**

Run:

```bash
pnpm test
pnpm build
```

Expected: all test files pass; TypeScript and Vite production build exit 0. Record the exact test-file count and any chunk warning rather than copying an older count.

- [ ] **Step 4: Run local API and browser role verification**

Run the QA script against `127.0.0.1`, then verify in the browser with super-admin, sales specialist, sales manager, and a read-only role:

- Super-admin sees `系统设置 → 客户设置 → 客户标签` and can manage the catalog.
- Other roles cannot navigate to or directly call management endpoints.
- Sales and managers can select presets only on records in their data scope.
- Customer list filters remain correct after refresh, page change, back/forward navigation, and logout/login.
- Lifecycle filters and manual tag filters can be combined without changing lifecycle values.

- [ ] **Step 5: Update release evidence**

Document the migration preview/apply counts, real role results, focused commands, full test count, build result, and any unverified production migration step. Do not mark automatic rule tags or advanced audiences as implemented.

- [ ] **Step 6: Commit QA and release evidence**

```bash
git add scripts/qa/customer-tag-smoke.ts BUG_FIX_LOG.md CHANGELOG.md RELEASE_CHECKLIST.md
git commit -m "test: verify controlled customer tag workflow"
```

---

## Self-Review Checklist

- Every confirmed role boundary is covered by Tasks 1, 3, 6, and 9.
- Single/multiple selection and lead/customer/both scope are covered by Tasks 2, 5, and 7.
- Shared-tag conversion inheritance is covered by Tasks 2, 5, and 9.
- Existing free-text data preservation and non-conversion of lifecycle semantics are covered by Task 4.
- Exact grouped/any/all filtering with current pagination and data scope is covered by Task 8.
- Tag rename, deactivate, merge, usage, and audit behavior are covered by Tasks 3, 6, and 9.
- Legacy whole-array catalog writes are disabled in Task 3.
- Automatic rule tags and advanced audience builders remain explicitly out of scope.
