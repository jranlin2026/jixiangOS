# Customer Duplicate Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a permission-scoped, auditable customer duplicate-governance workflow that detects candidate groups, safely merges 2–10 customers, redirects old records, and supports a guarded 72-hour undo.

**Architecture:** Build the duplicate domain as focused server services instead of adding merge rules to the customer list page or generic update route. A static association registry owns every cross-domain `customerId` migration; the merge service orchestrates precheck, fixed-order locking, a single transaction, append-only ledger/audit records, and conflict-aware undo. The React experience uses a dedicated governance page and wizard, while all authorization and data-scope decisions remain server-side.

**Tech Stack:** React 18, TypeScript, Material UI 6, Zustand, Express 5, Prisma 6, MySQL, Node `assert/strict` tests run through `tsx`.

## Global Constraints

- Implement this plan after the permission-and-batch foundation and standard import/export plans; reuse their access policy, one-time precheck primitive, audit sequence, contact identities, candidate groups, encrypted-file conventions, and leaf permissions.
- Do not test role names or hard-code a role in any client, route, service, migration, or seed. Use configurable leaf permissions and the `customers` data scope only.
- Merge requires the `CUSTOMER_MERGE` leaf permission and `canManageCustomer` for the main customer and every secondary customer at precheck and execution time.
- Undo requires `CUSTOMER_MERGE_UNDO`, normal real-time manage access to the active main customer, and the dedicated historical-scope check for every merged secondary; that narrow historical check is unavailable to ordinary writes.
- A merge is always an explicit human action over 2–10 active, non-deleted, non-merged customers; the system must never auto-merge a candidate group.
- “共享客户” and “撤销客户共享” are outside this feature and must not be added to the permission tree, UI, route surface, or data model.
- Use stable IDs for ownership and business association. Preserve historical names, amounts, attribution, and approval snapshots; only migrate stable customer-location IDs.
- Reject an unregistered customer association domain before a merge can begin. Do not infer associations by searching arbitrary JSON at merge time.
- Acquire every participating customer row in one global ascending customer-ID order, independent of which customer is selected as main; then contact identities/links by identity ID/link ID, then association rows in registry order, and finally an existing ledger row for undo. Merge and undo use the same applicable order so opposite main-customer choices, contact edits, and concurrent undo requests cannot invert locks.
- All primary merge writes, secondary merge markers, `ContactIdentity` changes, association migration, ledger rows, duplicate-group state, and success audit events commit in one database transaction. A failed merge writes its failure audit in a separate transaction after rollback.
- An old customer ID remains addressable only as a redirect result; read commands return a merged redirect and write commands return HTTP 409 with `canonicalCustomerId`.
- Auto-undo is available only before `mergedAt + 72 hours` and only when row revisions, audit-event watermarks, and association changes prove no post-merge business change. Expose conflicts; do not partially undo.
- Encrypt full pre-merge customer snapshots with a dedicated AES-256-GCM key and key version. Ledger entries for associations store only stable-ID path deltas and concurrency tokens, never copied attachment bytes or unrelated sensitive business snapshots.
- Run the migration and preflight reports on a production-data copy before release. A historical association that cannot be uniquely linked by stable `customerId` blocks its candidate group from merge.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | Adds merge ledger/entries and nullable customer-only redirect/revision columns to the existing `BusinessRecord` table. |
| `prisma/migrations/20260717110000_customer_duplicate_governance/migration.sql` | Applies the third-stage schema after the foundation and data-exchange migrations without creating a nonexistent `Customer` table. |
| `src/types/customer.ts` | Adds redirect and revision fields to the `Customer` JSON contract stored in `BusinessRecord.data`. |
| `src/types/customerMerge.ts` | Shared API contracts for candidates, field decisions, prechecks, merge execution, redirects, and undo conflicts. |
| `src/shared/utils/permissions.ts` | First-stage dependency only; this plan consumes, but does not redefine, `CUSTOMER_MERGE` and `CUSTOMER_MERGE_UNDO`. |
| `server/config/runtime.ts`, `.env.example` | Validate the dedicated versioned merge-snapshot encryption keyring and active key version. |
| `server/services/customerMergeSnapshotCrypto.ts` | AES-256-GCM sealing/opening of the recovery-only customer snapshot payload. |
| `server/services/customerDuplicateService.ts` | Creates, reads, filters, and resolves candidate groups without exposing out-of-scope customers. |
| `server/services/customerAssociationRegistry.ts` | Declares the complete ordered association adapter registry and its migration, restoration, and change-detection contract. |
| `server/services/customerMergeGuardService.ts` | Captures revision/event-watermark manifests and rejects undo after post-merge changes. |
| `server/services/customerMergeService.ts` | Performs merge/undo prechecks, fixed-order locking, transactional mutations, ledger creation, and audit writes. |
| `server/services/customerMergeReleaseGate.ts` | Queries live undo-ledger key versions and blocks release/startup when registry, repair, migration, or snapshot-key safety is incomplete. |
| `server/services/customerMergeReleaseGate.test.ts` | Verifies release decisions and key rotation throughout the 72-hour undo window. |
| `scripts/check-customer-merge-release-gate.ts` | Runs the same live-data safety gate during deployment before application traffic is served. |
| `package.json` | Exposes the exact `customer:merge-release-gate` deployment command. |
| `server/routes/customerMergeRoutes.ts` | Provides duplicate, merge, undo, and redirect-aware HTTP endpoints with route-level authorization. |
| `server/index.ts` | Mounts the customer merge router and routes legacy customer reads/writes through canonical-ID resolution. |
| `src/api/customerMergeApi.ts` | Typed browser client for candidate queries, prechecks, merge, undo, and redirect-aware detail loading. |
| `src/store/useCustomerMergeStore.ts` | Owns governance-page fetch state, latest-request protection, and merge/undo refresh behavior. |
| `src/pages/Customers/CustomerDuplicateGovernance.tsx` | Provides candidate list, status filters, and history entry points. |
| `src/pages/Customers/CustomerMergeWizard.tsx` | Provides the 2–10-customer comparison, field-decision, association-preview, reason, and confirmation flow. |
| `src/pages/Customers/CustomerMergeHistory.tsx` | Displays completed merges, undo deadline, undo conflicts, and redacted audit summaries. |
| `src/pages/Customers/index.tsx` | Adds the permission-gated governance entry without enlarging the existing customer table workflow. |
| `src/layouts/Sidebar.tsx` | Adds the permission-gated “重复客户治理” navigation item. |
| `src/App.tsx` | Registers the governance route. |
| `server/services/customerDuplicateService.test.ts` | Exercises candidate creation, scope filtering, and no-auto-merge behavior. |
| `server/services/customerAssociationRegistry.test.ts` | Verifies every registered domain migrates and restores only stable customer-ID paths. |
| `server/services/customerMergeGuardService.test.ts` | Verifies 72-hour deadline, revision, watermark, and new-association conflict detection. |
| `server/services/customerMergeService.test.ts` | Verifies permission/scope rejection, field decisions, locking, atomic merge, redirects, and atomic undo. |
| `server/routes/customerMergeRoutes.test.ts` | Verifies HTTP authorization, response shapes, and 409 redirect behavior. |
| `src/api/customerMergeApi.test.ts` | Verifies API payload serialization and client handling of merged redirects. |
| `src/pages/Customers/customerMergeWorkflowStatic.test.ts` | Verifies the page/wizard contains required permissions, confirmations, labels, and no sharing actions. |

### Task 1: Define the shared merge contract, BusinessRecord fields, encrypted snapshots, and persistent ledger

**Files:**
- Create: `src/types/customerMerge.ts`
- Modify: `src/types/customer.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260717110000_customer_duplicate_governance/migration.sql`
- Modify: `server/config/runtime.ts`
- Modify: `server/config/runtime.test.ts`
- Modify: `.env.example`
- Create: `server/services/customerMergeSnapshotCrypto.ts`
- Create: `server/services/customerMergeSnapshotCrypto.test.ts`
- Test: `server/services/customerMergeService.test.ts`

**Interfaces:**
- Consumes: `CustomerDuplicateGroup`, `ContactIdentity`, `ContactIdentityLink`, `CustomerAuditEvent.eventSequence`, `CustomerBatchPrecheck`, `PERMISSION_KEYS.CUSTOMER_MERGE`, and `PERMISSION_KEYS.CUSTOMER_MERGE_UNDO` created by the foundation plan.
- Produces: `CustomerMergePrecheckInput`, `CustomerMergeExecutionInput`, `CustomerMergePrecheckResult`, `CustomerMergeLedgerView`, `CustomerMergeUndoPrecheckResult`, `CustomerMergeUndoExecutionInput`, `MergedCustomerRedirect`, `CustomerMergeField`, and `sealMergeSnapshot`/`openMergeSnapshot`.

- [ ] **Step 1: Write the failing contract test**

```ts
// server/services/customerMergeService.test.ts
import assert from 'node:assert/strict';
import {
  CUSTOMER_MERGE_FIELDS,
  isCustomerMergeExecutionInput,
} from '../../src/types/customerMerge';

assert.deepEqual(CUSTOMER_MERGE_FIELDS, [
  'name', 'phone', 'wechat', 'email', 'company', 'ownerId', 'lifecycleStatusCode',
]);
assert.equal(isCustomerMergeExecutionInput({ mainCustomerId: 'c1' }), false);
assert.equal(isCustomerMergeExecutionInput({
  mainCustomerId: 'c1', secondaryCustomerIds: ['c2'], reason: '同一客户重复录入',
  precheckToken: 'token', idempotencyKey: 'merge-click-1', fieldDecisions: {}, tagDecision: { selectedTagIds: [] },
}), true);
console.log('customer merge contracts: ok');
```

- [ ] **Step 2: Run the contract test and confirm the missing module error**

Run: `pnpm exec tsx server/services/customerMergeService.test.ts`

Expected: exit code non-zero and an error naming `src/types/customerMerge`.

- [ ] **Step 3: Add the complete shared contract, BusinessRecord fields, and encrypted ledger**

```ts
// src/types/customerMerge.ts
export const CUSTOMER_MERGE_FIELDS = [
  'name', 'phone', 'wechat', 'email', 'company', 'ownerId', 'lifecycleStatusCode',
] as const;
export type CustomerMergeField = typeof CUSTOMER_MERGE_FIELDS[number];
export type CustomerMergeStatus = 'open' | 'merged' | 'dismissed' | 'blocked';
export type CustomerMergeConfidence = 'high' | 'possible' | 'manual';
export const CUSTOMER_MERGE_HANDLER_KEY = 'customer_merge' as const;
export const CUSTOMER_MERGE_UNDO_HANDLER_KEY = 'customer_merge_undo' as const;

export interface CustomerMergeFieldDecision {
  sourceCustomerId: string;
}
export interface CustomerMergeTagDecision {
  selectedTagIds: string[];
  singleGroupSelections?: Record<string, string>;
}
export interface CustomerMergePrecheckInput {
  mainCustomerId: string;
  secondaryCustomerIds: string[];
  fieldDecisions: Partial<Record<CustomerMergeField, CustomerMergeFieldDecision>>;
  tagDecision: CustomerMergeTagDecision;
  reason: string;
}
export interface CustomerMergeExecutionInput extends CustomerMergePrecheckInput {
  precheckToken: string;
  idempotencyKey: string;
}
export interface CustomerMergeConflict {
  code: string;
  message: string;
  recordType?: string;
  recordId?: string;
}
export interface CustomerMergePrecheckResult {
  executable: boolean;
  precheckToken?: string;
  expiresAt?: string;
  conflicts: CustomerMergeConflict[];
  associationCounts: Record<string, number>;
  requiredDecisions: CustomerMergeField[];
}
export interface CustomerMergeLedgerView {
  id: string;
  mainCustomerId: string;
  secondaryCustomerIds: string[];
  status: 'merged' | 'undone';
  mergedAt: string;
  undoDeadlineAt: string;
  reason: string;
  actor: { id: string; name: string };
  undoneAt?: string;
  undoneBy?: { id: string; name: string };
  lastUndoBlockedAt?: string;
  undoConflicts?: Array<Pick<CustomerMergeConflict, 'code' | 'message' | 'recordType'>>;
}
export interface CustomerMergeUndoPrecheckResult {
  executable: boolean;
  conflicts: CustomerMergeConflict[];
  undoDeadlineAt: string;
  precheckToken?: string;
  expiresAt?: string;
}
export interface CustomerMergeUndoExecutionInput {
  ledgerId: string;
  precheckToken: string;
  idempotencyKey: string;
}
export interface MergedCustomerRedirect {
  merged: true;
  canonicalCustomerId: string;
  mergeLedgerId: string;
}
export function isCustomerMergeExecutionInput(value: unknown): value is CustomerMergeExecutionInput {
  const input = value as Partial<CustomerMergeExecutionInput>;
  return Boolean(
    input && typeof input.mainCustomerId === 'string' &&
    Array.isArray(input.secondaryCustomerIds) && input.secondaryCustomerIds.length > 0 &&
    typeof input.reason === 'string' && input.reason.trim().length > 0 &&
    typeof input.precheckToken === 'string' && input.precheckToken.length > 0 &&
    typeof input.idempotencyKey === 'string' && input.idempotencyKey.length > 0 &&
    input.fieldDecisions && input.tagDecision && Array.isArray(input.tagDecision.selectedTagIds),
  );
}
```

Do not add or migrate permissions in this stage. Task 1 of the foundation plan is the single owner of every customer leaf key; add a regression assertion that both merge leaves already exist and carry `write`, while this stage changes no role row.

Customers are not a Prisma `Customer` model in this repository. They are `BusinessRecord` rows with `domain = STORAGE_KEYS.CUSTOMERS` (`aaos_customers`) and a `Customer` JSON value in `data`. Add `mergedIntoId?: string`, `mergedAt?: Timestamp`, `mergedById?: string`, `mergedByName?: string`, `mergeLedgerId?: string`, and `recordRevision?: number` to `src/types/customer.ts`. Mirror the query-critical values in nullable top-level `BusinessRecord` columns, and keep the two representations synchronized through one mapper/helper. Use the name `recordRevision` in both representations; never introduce `mergeRevision`.

```prisma
// BusinessRecord additions; populated only when domain = aaos_customers
mergedIntoId  String?   @db.VarChar(80)
mergedAt      DateTime?
mergedById    String?   @db.VarChar(64)
mergedByName  String?   @db.VarChar(100)
mergeLedgerId String?   @db.VarChar(64)
recordRevision Int      @default(0)

@@index([domain, mergedIntoId])
@@index([domain, mergeLedgerId])

model CustomerMergeLedger {
  id                   String   @id @default(cuid())
  duplicateGroupId     String?
  mainCustomerId       String
  secondaryCustomerIds Json
  fieldDecisions       Json
  tagDecision          Json
  encryptedCustomerSnapshots String @db.LongText
  snapshotKeyVersion   Int
  guardManifest        Json
  reason               String
  actorId              String
  actorName            String
  mergeInputHash       String   @db.Char(64)
  mergeIdempotencyKey  String   @db.VarChar(80)
  mergeIdempotencyFingerprint String @db.Char(64)
  mergedAt             DateTime @default(now())
  undoDeadlineAt       DateTime
  status               String   @default("merged")
  undoneAt             DateTime?
  undoneById           String?  @db.VarChar(64)
  undoneByName         String?
  undoInputHash        String?  @db.Char(64)
  undoIdempotencyKey   String?  @db.VarChar(80)
  undoIdempotencyFingerprint String? @db.Char(64)
  lastUndoBlockedAt    DateTime?
  undoConflicts        Json?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  entries              CustomerMergeLedgerEntry[]

  @@index([mainCustomerId])
  @@index([duplicateGroupId])
  @@index([status, undoDeadlineAt])
  @@unique([actorId, mergeIdempotencyKey])
  @@unique([undoneById, undoIdempotencyKey])
}

model CustomerMergeLedgerEntry {
  id             String   @id @default(cuid())
  ledgerId       String
  domain         String
  recordId       String
  beforeSnapshot Json
  afterSnapshot  Json
  rowRevision    Int?
  updatedAtValue DateTime?
  createdAt      DateTime @default(now())
  ledger         CustomerMergeLedger @relation(fields: [ledgerId], references: [id], onDelete: Cascade)

  @@unique([ledgerId, domain, recordId])
  @@index([domain, recordId])
}

```

Reuse `CustomerBatchPrecheck` for `customer_merge` and `customer_merge_undo`; its `guardManifest`, `customerVersionManifest`, status, ten-minute expiry, token hash, and atomic consume semantics are the only precheck persistence path. Do not create `CustomerMergePrecheck`.

`CustomerMergeLedgerEntry.beforeSnapshot` and `afterSnapshot` contain only the exact customer-ID paths, prior/new IDs, revision, and `updatedAt` token needed by the adapter. Seal full main/secondary `Customer` JSON snapshots into `encryptedCustomerSnapshots` with `CUSTOMER_MERGE_SNAPSHOT_ACTIVE_KEY_VERSION` and a versioned `CUSTOMER_MERGE_SNAPSHOT_KEYS_JSON` keyring; each decoded AES-256-GCM key is exactly 32 bytes and the active positive version must exist. Writes save the active version and reads resolve the ledger's `snapshotKeyVersion`. Rotation adds a new active version but may not remove any version referenced by a `status='merged'` ledger whose `undoDeadlineAt >= now`; Task 10 enforces this against live data at release and process startup. `server/config/runtime.ts` must reject missing/placeholder/invalid production values. Test successful decrypt, changed auth tag rejection, wrong-key rejection, old-version decrypt after rotation, unknown-version rejection, active-key dispatch, and premature old-key removal blocking startup.

In the migration, add nullable redirect columns before indexes, preserve every existing `business_records` row, and create the ledger tables with `utf8mb4`. The migration must not create, copy, or dual-write a new customer table. Generate it only after the first two stage migrations; the committed directory name is `20260717110000_customer_duplicate_governance`.

- [ ] **Step 4: Run the contract test and schema generation**

Run: `pnpm exec tsx server/services/customerMergeService.test.ts && pnpm exec tsx server/services/customerMergeSnapshotCrypto.test.ts && pnpm run db:generate`

Expected: `customer merge contracts: ok` and Prisma Client generation exits with code 0.

- [ ] **Step 5: Commit the contract boundary**

```bash
git add src/types/customerMerge.ts src/types/customer.ts prisma/schema.prisma prisma/migrations/20260717110000_customer_duplicate_governance/migration.sql server/config/runtime.ts server/config/runtime.test.ts .env.example server/services/customerMergeSnapshotCrypto.ts server/services/customerMergeSnapshotCrypto.test.ts server/services/customerMergeService.test.ts
git commit -m "feat: add customer merge contracts and ledger schema"
```

### Task 2: Build candidate groups and contact-identity-safe duplicate detection

**Files:**
- Create: `server/services/customerDuplicateService.ts`
- Modify: `server/services/customerOwnerIdentityService.ts`
- Modify: `server/services/customerCommandService.ts`
- Test: `server/services/customerDuplicateService.test.ts`

**Interfaces:**
- Consumes: `ContactIdentity`, `ContactIdentityLink`, `CustomerDuplicateGroup`, `canReadCustomer`, `canManageCustomer`, and `CustomerMergeConfidence`.
- Produces: `createDuplicateCandidateGroup(input)`, `listDuplicateGroups(actor, query)`, `createManualDuplicateGroup(actor, customerIds)`, `assertContactIdentityWriteAllowed(tx, input)`, and `DuplicateGroupListItem`.

- [ ] **Step 1: Write failing candidate and privacy tests**

```ts
// server/services/customerDuplicateService.test.ts
import assert from 'node:assert/strict';
import { classifyContactIdentityConflict, redactOutOfScopeConflict } from './customerDuplicateService';

assert.equal(classifyContactIdentityConflict({ type: 'phone', activeCustomerIds: ['c1', 'c2'] }).confidence, 'high');
assert.equal(classifyContactIdentityConflict({ type: 'name_company', activeCustomerIds: ['c1', 'c2'] }).confidence, 'possible');
assert.deepEqual(
  redactOutOfScopeConflict({ customerId: 'c9', customerName: '张三', ownerName: '李四' }, false),
  { code: 'CONTACT_EXISTS_OUT_OF_SCOPE', message: '系统中已存在相同联系方式' },
);
console.log('customer duplicate candidates: ok');
```

- [ ] **Step 2: Run the candidate test and confirm the missing service error**

Run: `pnpm exec tsx server/services/customerDuplicateService.test.ts`

Expected: exit code non-zero and an error naming `customerDuplicateService`.

- [ ] **Step 3: Implement the identity-aware candidate service and wire write protection**

```ts
// server/services/customerDuplicateService.ts
import type { CustomerMergeConfidence } from '../../src/types/customerMerge';

export interface DuplicateContactConflict {
  type: 'phone' | 'wechat' | 'name_company';
  activeCustomerIds: string[];
}
export interface DuplicateGroupListItem {
  id: string;
  confidence: CustomerMergeConfidence;
  status: 'open' | 'merged' | 'dismissed' | 'blocked';
  customerIds: string[];
  visibleCustomers: Array<{ id: string; name: string }>;
  createdAt: Date;
}
export function classifyContactIdentityConflict(conflict: DuplicateContactConflict): { confidence: CustomerMergeConfidence } {
  return { confidence: conflict.type === 'name_company' ? 'possible' : 'high' };
}
export function redactOutOfScopeConflict(
  conflict: { customerId: string; customerName: string; ownerName: string },
  canRead: boolean,
): { code: string; message: string; customerId?: string; customerName?: string; ownerName?: string } {
  return canRead
    ? { code: 'CONTACT_EXISTS', message: '系统中已存在相同联系方式', ...conflict }
    : { code: 'CONTACT_EXISTS_OUT_OF_SCOPE', message: '系统中已存在相同联系方式' };
}
```

Implement `createDuplicateCandidateGroup` with the foundation model's unique `groupKey = sha256(rule + ':' + sortedUniqueCustomerIds.join(','))`. Insert-or-reload on the unique constraint so concurrent identity backfills produce exactly one candidate. The method must write only `open`, `high`, `possible`, or `manual` group data; it never calls `customerMergeService`. `listDuplicateGroups` must pass each candidate customer through `canReadCustomer` and return a group only when all customer IDs are visible and manageable by an actor who has `CUSTOMER_MERGE`; otherwise return neither hidden customer data nor a partial candidate. `createManualDuplicateGroup` must require 2–10 unique active customer IDs and use `canManageCustomer` for each. Add a concurrent-create test asserting one row and one stable group ID.

Update `customerOwnerIdentityService.ts` and `customerCommandService.ts` so create, edit, lead-to-customer conversion, and contact updates call `assertContactIdentityWriteAllowed` inside their database transaction. A normal lead conversion adds an active customer link while retaining its lead link and setting `canonicalCustomerId` to the new customer. A second independent active customer or unresolved historical conflict returns a readable duplicate error; it never creates another customer link.

- [ ] **Step 4: Run candidate tests and existing customer-command tests**

Run: `pnpm exec tsx server/services/customerDuplicateService.test.ts && pnpm exec tsx server/services/customerCommandService.test.ts && pnpm exec tsx server/services/customerOwnerIdentityService.test.ts`

Expected: each command exits with code 0; the new candidate test prints `customer duplicate candidates: ok`.

- [ ] **Step 5: Commit candidate governance**

```bash
git add server/services/customerDuplicateService.ts server/services/customerDuplicateService.test.ts server/services/customerOwnerIdentityService.ts server/services/customerCommandService.ts
git commit -m "feat: add customer duplicate candidate governance"
```

### Task 3: Establish the closed association registry, monotonic guards, and unknown-domain fail-closed scan

**Files:**
- Modify: `server/services/customerAssociationRegistry.ts`
- Create: `server/services/customerMergeGuardService.ts`
- Create: `server/services/customerRevisionService.ts`
- Modify: `src/shared/utils/constants.ts`
- Modify: `server/services/customerListService.ts`
- Modify: `server/services/customerCommandService.ts`
- Modify: `server/services/customerTodoService.ts`
- Modify: `server/services/customerBatchService.ts`
- Modify: `server/services/customerImportService.ts`
- Test: `server/services/customerAssociationRegistry.test.ts`
- Test: `server/services/customerMergeGuardService.test.ts`

**Interfaces:**
- Consumes: the foundation registry's stable customer-ID inventory/discovery/audit contract, `Prisma.TransactionClient`, `CustomerMergeLedgerEntry`, monotonic `CustomerAuditEvent.eventSequence`, `BusinessRecord`, `LeadRecord`, `CustomerTodo`, and `CustomerMergeLedger`.
- Produces: `CUSTOMER_ASSOCIATION_DOMAIN_ORDER`, `CUSTOMER_ASSOCIATED_BUSINESS_DOMAINS`, `getCustomerAssociationAdapters()`, `assertAssociationRegistryComplete(tx, customerIds)`, `captureMergeGuardManifest()`, `assertUndoGuardIntact()`, `touchCustomerRevision()`, and `MergeGuardManifest`.

- [ ] **Step 1: Write failing registry and guard tests**

```ts
// server/services/customerAssociationRegistry.test.ts
import assert from 'node:assert/strict';
import { CUSTOMER_ASSOCIATION_DOMAIN_ORDER, assertAssociationRegistryComplete } from './customerAssociationRegistry';

assert.deepEqual(CUSTOMER_ASSOCIATION_DOMAIN_ORDER, [
  'lead_records', 'orders', 'order_applications', 'deliveries', 'refunds',
  'recovery_orders', 'service_tickets', 'opportunities', 'commissions_finance',
  'customer_todos', 'customer_json_subrecords', 'ai_cards',
]);
await assert.doesNotReject(() => assertAssociationRegistryComplete(tx, ['c1', 'c2']));
await assert.rejects(
  () => assertAssociationRegistryComplete(txWithUnknownDomain, ['c1']),
  /UNREGISTERED_CUSTOMER_ASSOCIATION_PATH:aaos_new_customer_domain:data.customerId/,
);
await assert.rejects(
  () => assertAssociationRegistryComplete(txWithKnownDomainUnknownPath, ['c1']),
  /UNREGISTERED_CUSTOMER_ASSOCIATION_PATH:aaos_orders:data.orderData.customerId/,
);
console.log('customer association registry: ok');

// server/services/customerMergeGuardService.test.ts
import assert from 'node:assert/strict';
import { isUndoDeadlineOpen, compareGuardSnapshot } from './customerMergeGuardService';

assert.equal(isUndoDeadlineOpen(new Date('2026-07-20T00:00:00.000Z'), new Date('2026-07-17T00:00:00.000Z')), true);
assert.equal(isUndoDeadlineOpen(new Date('2026-07-20T00:00:00.001Z'), new Date('2026-07-17T00:00:00.000Z')), false);
assert.equal(compareGuardSnapshot(
  { revision: 4, auditWatermark: '20', updatedAt: '2026-07-17T00:00:00.000Z' },
  { revision: 5, auditWatermark: '20', updatedAt: '2026-07-17T00:00:00.000Z' },
).length, 1);
console.log('customer merge guard: ok');
```

- [ ] **Step 2: Run the tests and confirm the missing-module errors**

Run: `pnpm exec tsx server/services/customerAssociationRegistry.test.ts && pnpm exec tsx server/services/customerMergeGuardService.test.ts`

Expected: exit code non-zero because merge adapter methods and the guard service are absent from the phase-one inventory registry.

- [ ] **Step 3: Implement the ordered adapters and guard manifest**

```ts
// server/services/customerAssociationRegistry.ts
export const CUSTOMER_ASSOCIATION_DOMAIN_ORDER = [
  'lead_records', 'orders', 'order_applications', 'deliveries', 'refunds',
  'recovery_orders', 'service_tickets', 'opportunities', 'commissions_finance',
  'customer_todos', 'customer_json_subrecords', 'ai_cards',
] as const;
export type CustomerAssociationDomain = typeof CUSTOMER_ASSOCIATION_DOMAIN_ORDER[number];
export interface AssociationSnapshot {
  domain: CustomerAssociationDomain;
  recordId: string;
  beforeSnapshot: Record<string, unknown>;
  afterSnapshot: Record<string, unknown>;
  revision?: number;
  updatedAt?: Date;
}
export interface CustomerAssociationAdapter {
  domain: CustomerAssociationDomain;
  capture(tx: Prisma.TransactionClient, customerIds: string[]): Promise<AssociationSnapshot[]>;
  lock(tx: Prisma.TransactionClient, recordIds: string[]): Promise<void>;
  migrate(tx: Prisma.TransactionClient, mainCustomerId: string, snapshots: AssociationSnapshot[]): Promise<AssociationSnapshot[]>;
  restore(tx: Prisma.TransactionClient, snapshots: AssociationSnapshot[]): Promise<void>;
  findChangesAfter(tx: Prisma.TransactionClient, customerIds: string[], mergedAt: Date, recordedIds: string[]): Promise<Array<{ recordId: string; message: string }>>;
}
export async function assertAssociationRegistryComplete(tx: Prisma.TransactionClient, customerIds: string[]): Promise<void> {
  const domains = getCustomerAssociationAdapters().map((adapter) => adapter.domain);
  if (domains.length !== CUSTOMER_ASSOCIATION_DOMAIN_ORDER.length || domains.some((domain, index) => domain !== CUSTOMER_ASSOCIATION_DOMAIN_ORDER[index])) {
    throw new Error('CUSTOMER_ASSOCIATION_REGISTRY_INCOMPLETE');
  }
  const discovered = await discoverCustomerAssociationDomains(tx, customerIds);
  const registeredPaths = new Set(
    getCustomerAssociationDefinitions().map((definition) => `${definition.storageDomain}:${definition.pathKey}`),
  );
  const unknown = discovered
    .filter((occurrence) => !registeredPaths.has(`${occurrence.storageDomain}:${occurrence.pathKey}`))
    .map((occurrence) => `${occurrence.storageDomain}:${occurrence.pathKey}`)
    .sort();
  if (unknown.length) throw new Error(`UNREGISTERED_CUSTOMER_ASSOCIATION_PATH:${unknown.join(',')}`);
}
```

Extend—not replace—the phase-one registry and keep its delete/audit callers compatible. Reuse its exported `discoverCustomerAssociationDomains` as the only runtime scanner; phase three may add registered path metadata but must not create a second discovery implementation. Preserve each definition's independent `blocksSoftDelete` and `mergeAdapterKind` semantics: merge adapters can migrate intrinsic subrecords that do not block ordinary soft deletion. Implement all twelve merge/restore adapters in the listed order. Their only migration paths are:

| Adapter domain | Stable ID paths to update | Fields that must remain untouched |
| --- | --- | --- |
| `lead_records` | `LeadRecord.data.customerId` | lead business snapshots |
| `orders` | `BusinessRecord.customerId`, `data.customerId` for `aaos_orders` | name, amount, sales snapshot |
| `order_applications` | top-level, `data.customerId`, `data.orderData.customerId` for `aaos_order_applications` | approval snapshot |
| `deliveries` | top-level and `data.customerId` for `aaos_deliveries` | delivery snapshot |
| `refunds` | top-level and `data.customerId` for `aaos_refunds` | refund amount and approval snapshot |
| `recovery_orders` | top-level and `data.customerId` for `aaos_recovery_orders` | recovery and settlement snapshot |
| `service_tickets` | top-level and `data.customerId` for `aaos_service_tickets` | ticket history |
| `opportunities` | top-level and `data.customerId` for `aaos_opportunities` | opportunity history |
| `commissions_finance` | top-level or JSON `customerId` for `aaos_commissions` and `aaos_finance` | amount, attribution, order linkage |
| `customer_todos` | `CustomerTodo.customerId`, then display `customerName` | completion history and executor |
| `customer_json_subrecords` | customer JSON follow-up, activity, growth, tag, and attachment references by record ID | attachment binary data |
| `ai_cards` | `data.subjectId` where `data.subjectType = 'customer'` for `aaos_ai_cards` | AI conclusion history |

`CUSTOMER_ASSOCIATED_BUSINESS_DOMAINS` and the phase-one path metadata are the central source of truth for domains with stable customer links. The shared runtime discovery query returns `{ storageDomain, pathKey, recordId, definitionId? }` occurrences after examining the top-level `BusinessRecord.customerId` and **every registered standard JSON customer-ID path shape**, including nested `data.orderData.customerId` and conditional `data.subjectId`. Completeness is checked by the `(storageDomain, pathKey)` pair, not by domain alone; a new path in an otherwise known domain blocks precheck until a definition and adapter behavior are registered. Add tests for both an unknown domain and a known domain with an unknown path. A build-time test compares the central set with `STORAGE_KEYS` and a production-copy audit scans every business-record domain. Do not scan arbitrary JSON keys or infer migration rules at execution time.

Use adapter snapshots as the sole source of ledger entries. Each snapshot contains only the changed stable-ID paths and concurrency tokens; each adapter’s `restore` restores only those recorded paths. `ai_cards` retains secondary-card history and marks the main customer card for regeneration; it never concatenates AI conclusions.

```ts
// server/services/customerMergeGuardService.ts
export interface GuardSnapshot { revision: number; auditWatermark: string; updatedAt: string }
export interface MergeGuardManifest {
  customers: Record<string, GuardSnapshot>;
  associations: Record<string, GuardSnapshot>;
  mergedAt: string;
}
export function isUndoDeadlineOpen(now: Date, mergedAt: Date): boolean {
  return now.getTime() <= mergedAt.getTime() + 72 * 60 * 60 * 1000;
}
export function compareGuardSnapshot(expected: GuardSnapshot, actual: GuardSnapshot): string[] {
  const conflicts: string[] = [];
  if (expected.revision !== actual.revision) conflicts.push('ROW_REVISION_CHANGED');
  if (expected.auditWatermark !== actual.auditWatermark) conflicts.push('AUDIT_WATERMARK_CHANGED');
  if (expected.updatedAt !== actual.updatedAt) conflicts.push('UPDATED_AT_CHANGED');
  return conflicts;
}
```

`captureMergeGuardManifest` records each customer `BusinessRecord.recordRevision`, `updatedAt`, and the maximum numeric `CustomerAuditEvent.eventSequence`, plus every migrated association revision/`updatedAt` token and recorded ID set. `assertUndoGuardIntact` queries `eventSequence > watermark`, compares all stored tokens, and calls every adapter’s `findChangesAfter` with the full participating customer-ID set so a new order, follow-up, todo, attachment, identity link, or second merge is detected. It returns a complete conflict list instead of stopping at the first conflict.

`touchCustomerRevision(tx, recordId, expectedRevision)` performs a conditional increment on the `aaos_customers` `BusinessRecord` row and updates the mirrored `Customer.recordRevision` JSON field to the same new value. Route every server-side customer mutation, including follow-ups in `customerListService`, generic/atomic commands, todo lifecycle actions, import, batch handlers, and merge/undo, through this helper. Revisions are monotonic: merge and undo both increment from the currently locked value and never restore an older snapshot revision. `BusinessRecord.updatedAt` remains an independent guard so an unregistered legacy mutation still blocks undo rather than being missed.

- [ ] **Step 4: Run the registry and guard tests**

Run: `pnpm exec tsx server/services/customerAssociationRegistry.test.ts && pnpm exec tsx server/services/customerMergeGuardService.test.ts`

Expected: `customer association registry: ok`, `customer merge guard: ok`, and exit code 0.

- [ ] **Step 5: Commit the registry and protection primitives**

```bash
git add server/services/customerAssociationRegistry.ts server/services/customerAssociationRegistry.test.ts server/services/customerMergeGuardService.ts server/services/customerMergeGuardService.test.ts server/services/customerRevisionService.ts src/shared/utils/constants.ts server/services/customerListService.ts server/services/customerCommandService.ts server/services/customerTodoService.ts server/services/customerBatchService.ts server/services/customerImportService.ts
git commit -m "feat: add customer merge association registry and guards"
```

### Task 4: Implement merge precheck with permission, scope, field-decision, and association gates

**Files:**
- Create: `server/services/customerMergeService.ts`
- Modify: `server/services/customerDuplicateService.ts`
- Test: `server/services/customerMergeService.test.ts`

**Interfaces:**
- Consumes: `CustomerMergePrecheckInput`, `CustomerMergePrecheckResult`, `CustomerMergeConflict`, `PERMISSION_KEYS.CUSTOMER_MERGE`, `canManageCustomer`, `getCustomerAssociationAdapters`, `assertAssociationRegistryComplete`, and the foundation `issueBatchPrecheckToken` primitive.
- Produces: `precheckCustomerMerge(actor, input): Promise<CustomerMergePrecheckResult>` and a `customer_merge` guard manifest that execution can recompute under lock.

- [ ] **Step 1: Add failing merge-precheck tests**

```ts
// append to server/services/customerMergeService.test.ts
import {
  buildCustomerMergeInputHash,
  validateMergeSelection,
  requiredFieldDecisions,
} from './customerMergeService';

assert.throws(() => validateMergeSelection('c1', ['c1']), /MERGE_REQUIRES_TWO_TO_TEN_CUSTOMERS/);
assert.throws(() => validateMergeSelection('c1', Array.from({ length: 10 }, (_, i) => `c${i + 2}`)), /MERGE_REQUIRES_TWO_TO_TEN_CUSTOMERS/);
assert.deepEqual(
  requiredFieldDecisions({ name: ['甲', '乙'], phone: ['13800000000'] }),
  ['name'],
);
const commonDecision = { fieldDecisions: {}, tagDecision: { selectedTagIds: [] }, reason: '同一客户' };
assert.notEqual(
  buildCustomerMergeInputHash({ mainCustomerId: 'c1', secondaryCustomerIds: ['c2'], ...commonDecision }),
  buildCustomerMergeInputHash({ mainCustomerId: 'c2', secondaryCustomerIds: ['c1'], ...commonDecision }),
);
console.log('customer merge precheck: ok');
```

- [ ] **Step 2: Run the precheck test and confirm it fails**

Run: `pnpm exec tsx server/services/customerMergeService.test.ts`

Expected: exit code non-zero because `validateMergeSelection` is not exported.

- [ ] **Step 3: Implement precheck as the only source of execution tokens**

```ts
// server/services/customerMergeService.ts
import type { CustomerMergeField, CustomerMergePrecheckInput } from '../../src/types/customerMerge';
import { sha256Json } from './customerBatchPrecheckService';

export function validateMergeSelection(mainCustomerId: string, secondaryCustomerIds: string[]): void {
  const ids = [mainCustomerId, ...secondaryCustomerIds];
  if (ids.length < 2 || ids.length > 10 || new Set(ids).size !== ids.length) {
    throw new Error('MERGE_REQUIRES_TWO_TO_TEN_CUSTOMERS');
  }
}
export function requiredFieldDecisions(values: Partial<Record<CustomerMergeField, string[]>>): CustomerMergeField[] {
  return Object.entries(values)
    .filter(([, candidates]) => new Set((candidates ?? []).filter(Boolean)).size > 1)
    .map(([field]) => field as CustomerMergeField);
}
export function buildCustomerMergeInputHash(input: CustomerMergePrecheckInput): string {
  return sha256Json({
    mainCustomerId: input.mainCustomerId,
    secondaryCustomerIds: [...input.secondaryCustomerIds].sort(),
    fieldDecisions: input.fieldDecisions,
    tagDecision: {
      selectedTagIds: [...input.tagDecision.selectedTagIds].sort(),
      singleGroupSelections: input.tagDecision.singleGroupSelections ?? {},
    },
    reason: input.reason.trim(),
  });
}
```

`sha256Json` is the foundation canonical JSON SHA-256 helper: recursively sorted object keys, preserved array order unless the caller explicitly sorts a set-valued array, UTF-8 bytes, lowercase 64-character hex output. Therefore object-valued decisions require no second sorting helper, while `secondaryCustomerIds` and `selectedTagIds` are explicitly sorted because they are sets. The exact merge `inputHash` semantics are `sha256Json({ mainCustomerId, secondaryCustomerIds: sorted, fieldDecisions: canonicalized, tagDecision: canonicalized, reason: trimmed })`; the identity of the chosen main customer is never hidden inside the order-insensitive `selectionHash`.

`precheckCustomerMerge` must perform these checks in this order and accumulate all independent conflicts:

1. Require `CUSTOMER_MERGE`, validate 2–10 unique IDs, reject deleted and `mergedIntoId` customers, and reject a selected main customer that is a historical secondary.
2. Fetch all selected customers in one query; run `canManageCustomer` for all and reject any customer outside real-time manage scope.
3. Require an open candidate group containing exactly the selected IDs, or create an auditable manual group only after the actor passes the same manage checks.
4. Call `assertAssociationRegistryComplete(tx, selectedIds)`, capture association counts/revision tokens and reject any record on the historical-repair block list or unknown linked business domain.
5. Compute conflict fields from non-empty values. Require a decision for name, phone, wechat, email, company, ownerId, and lifecycleStatusCode only when the values differ. Verify each decision points to a selected customer and tag selections satisfy single-select tag-group policy.
6. Check all active `ContactIdentity` links. A contact identity linked to an unselected active customer produces a conflict. A selected secondary identity may be moved only when the main customer will become the unique canonical customer.
7. Call `issueBatchPrecheckToken` with `handlerKey=CUSTOMER_MERGE_HANDLER_KEY`, operation `customer_merge`, actor ID, `selectionHash = sha256Json([...selectedIds].sort())`, and `inputHash = buildCustomerMergeInputHash(input)`, plus `BusinessRecord.recordRevision`/`updatedAt` as `customerVersionManifest`, maximum audit sequence, contact-identity/link manifest, and every adapter record revision/`updatedAt` in `guardManifest`. Return its raw random token only once; persist only the token hash and manifests in `CustomerBatchPrecheck`.

Task 5 consumes this token only through foundation `consumeBatchPrecheckToken(input, consumer)`. That primitive revalidates actor, handler key, operation, selection hash, input hash, version manifest and full guard manifest under locks. Its merge consumer uses typed result `customer_merge_ledger`, resolves a consumed ledger, finds an existing ledger by actor/idempotency key, or creates the ledger in the same transaction. A changed/new order, todo, attachment, contact link, customer field, association, permission or scope returns HTTP 409 before mutation. A committed merge retried with the same token/key returns the same ledger; a changed key/input is rejected.

- [ ] **Step 4: Run merge-precheck and policy regression tests**

Run: `pnpm exec tsx server/services/customerMergeService.test.ts && pnpm exec tsx server/services/customerCommandService.test.ts`

Expected: `customer merge contracts: ok`, `customer merge precheck: ok`, and tests proving post-precheck order/todo/contact changes return 409 all exit with code 0.

- [ ] **Step 5: Commit the merge precheck**

```bash
git add server/services/customerMergeService.ts server/services/customerMergeService.test.ts server/services/customerDuplicateService.ts
git commit -m "feat: add customer merge precheck"
```

### Task 5: Execute a fixed-lock, all-or-nothing customer merge and ledger write

**Files:**
- Modify: `server/services/customerMergeService.ts`
- Modify: `server/services/customerAssociationRegistry.ts`
- Modify: `server/services/customerDuplicateService.ts`
- Test: `server/services/customerMergeService.test.ts`

**Interfaces:**
- Consumes: `CustomerMergeExecutionInput`, `consumeBatchPrecheckToken`, `captureMergeGuardManifest`, `CustomerAssociationAdapter.migrate`, `sealMergeSnapshot`, and `CustomerMergeLedger`.
- Produces: `executeCustomerMerge(actor, input): Promise<CustomerMergeLedgerView>`.

- [ ] **Step 1: Add a failing atomic-merge test**

```ts
// append to server/services/customerMergeService.test.ts
import { buildLockOrder } from './customerMergeService';

assert.deepEqual(
  buildLockOrder('c9', ['c3', 'c7'], ['i9', 'i2'], ['l7', 'l1'], ['orders', 'customer_todos']),
  ['customer:c3', 'customer:c7', 'customer:c9', 'identity:i2', 'identity:i9', 'identity_link:l1', 'identity_link:l7', 'domain:orders', 'domain:customer_todos'],
);
assert.deepEqual(
  buildLockOrder('c3', ['c9', 'c7'], ['i2', 'i9'], ['l1', 'l7'], ['orders', 'customer_todos']),
  buildLockOrder('c9', ['c3', 'c7'], ['i9', 'i2'], ['l7', 'l1'], ['orders', 'customer_todos']),
);
console.log('customer merge locking: ok');
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm exec tsx server/services/customerMergeService.test.ts`

Expected: exit code non-zero because `buildLockOrder` is not exported.

- [ ] **Step 3: Implement the transactional merge routine**

```ts
// add to server/services/customerMergeService.ts
import type { CustomerAssociationDomain } from './customerAssociationRegistry';

export function buildLockOrder(
  mainCustomerId: string,
  secondaryCustomerIds: string[],
  identityIds: string[],
  identityLinkIds: string[],
  domains: readonly CustomerAssociationDomain[],
  ledgerId?: string,
): string[] {
  return [
    ...[mainCustomerId, ...secondaryCustomerIds].sort().map((id) => `customer:${id}`),
    ...[...identityIds].sort().map((id) => `identity:${id}`),
    ...[...identityLinkIds].sort().map((id) => `identity_link:${id}`),
    ...domains.map((domain) => `domain:${domain}`),
    ...(ledgerId ? [`ledger:${ledgerId}`] : []),
  ];
}
```

`executeCustomerMerge` validates the request shape, then calls foundation `consumeBatchPrecheckToken` directly with the merge consumer; it must not open an outer transaction. After the primitive locks and validates the private precheck row, the consumer callbacks execute this exact sequence on the primitive's single `tx`:

1. `lockAndRevalidate` requires the merge leaf, then locks all selected `business_records` customer rows by globally sorted `recordId`. It resolves selected phone/WeChat identities without trusting the precheck payload, locks `ContactIdentity` rows by global identity ID and their `ContactIdentityLink` rows by link ID, then locks adapter rows in `CUSTOMER_ASSOCIATION_DOMAIN_ORDER`. Every customer lock query includes `domain = STORAGE_KEYS.CUSTOMERS`; use parameter binding with `SELECT ... FOR UPDATE` where Prisma lacks row locks. Customer contact-edit transactions must use the same customer → identity → link order.
2. Still inside `lockAndRevalidate`, re-run `canManageCustomer`, active/deleted/merged, identity, association-repair and field-decision checks; recompute and compare the complete permission/scope/selection/input/version/guard manifest. Return to the primitive only after every comparison passes; it then enters `createResult` on the same transaction.
3. Inside `createResult`, before any field, association, identity, candidate or audit write, deep-clone and freeze the complete pre-merge `Customer` JSON for every participant plus every selected identity/canonical pointer/link row. This immutable `preMergeRecoveryPayload` is the only payload later passed to `sealMergeSnapshot`; never reconstruct it from mutated objects.
4. Apply field decisions to the main customer's `BusinessRecord.data`, synchronize its top-level merge/revision columns, and preserve `Customer.id`. Fill blank values from selected secondary values only when no explicit conflict decision is required. Union tags, requiring `singleGroupSelections` for conflicting single-select groups.
5. For each adapter, capture ID-path before/after snapshots, migrate stable IDs to the main customer, and write one `CustomerMergeLedgerEntry` per association record.
6. For every selected phone/WeChat identity, first upsert one active `identity → main customer` link, then end secondary links while retaining their history, and finally set `canonicalCustomerId` to main. Reject an identity still active on an unselected customer.
7. Mark every secondary in both JSON and top-level `BusinessRecord` columns with `mergedIntoId`, `mergedAt`, `mergedById`, `mergedByName`, and `mergeLedgerId`; call `touchCustomerRevision` once per participant so top-level and JSON `recordRevision` both increase monotonically, then append success audit events.
8. Seal the immutable pre-merge recovery payload with `sealMergeSnapshot`, capture the post-merge guard manifest, create the ledger/ID-path entries with `mergeInputHash`, `mergeIdempotencyKey`, `mergeIdempotencyFingerprint`, and `undoDeadlineAt = mergedAt + 72 hours`, and mark the duplicate group `merged`. Return typed result `{ type: 'customer_merge_ledger', id: ledger.id, idempotencyFingerprint }`; the precheck primitive links it atomically.

If any adapter mutation, identity mutation, ledger write, encryption, or audit write fails, roll back the whole transaction, including token consumption. In the catch path, begin a new transaction to append a redacted `merge_failed` audit event containing only selected IDs, actor ID, reason hash, and error code. Retry at most twice only for the database's classified deadlock code (for MySQL, error 1213); never retry permission, guard, business, identity, or validation conflicts. Add concurrent same-token/same-key requests proving one ledger and the same response, plus same-token/different-key, same-key/different-input, and **same selected set/same idempotency key but a different main customer** rejections; the last two return HTTP 409 and never replay the first ledger.

- [ ] **Step 4: Run atomic merge, association, and contact-identity tests**

Run: `pnpm exec tsx server/services/customerMergeService.test.ts && pnpm exec tsx server/services/customerAssociationRegistry.test.ts && pnpm exec tsx server/services/customerOwnerIdentityService.test.ts`

Expected: `customer merge locking: ok`; opposite main-customer selections produce the same lock order, a secondary-only phone remains searchable on the main link, and all commands exit with code 0.

- [ ] **Step 5: Commit the atomic merge**

```bash
git add server/services/customerMergeService.ts server/services/customerMergeService.test.ts server/services/customerAssociationRegistry.ts server/services/customerDuplicateService.ts
git commit -m "feat: execute atomic customer merges"
```

### Task 6: Enforce canonical customer resolution for all reads and writes

**Files:**
- Create: `server/services/customerCanonicalService.ts`
- Modify: `server/services/customerAccessPolicy.ts`
- Modify: `server/services/customerAccessPolicy.test.ts`
- Modify: `server/services/customerListService.ts`
- Modify: `server/services/customerCommandService.ts`
- Modify: `server/services/customerTodoService.ts`
- Modify: `server/index.ts`
- Test: `server/routes/customerMergeRoutes.test.ts`

**Interfaces:**
- Consumes: customer `BusinessRecord` redirect columns/JSON, `MergedCustomerRedirect`, `canReadCustomer`, and `canManageCustomer`.
- Produces: `canManageHistoricalMergedCustomer`, `resolveCanonicalCustomerForRead(actor, customerId)`, `assertCanonicalCustomerForWrite(actor, customerId)`, and `MergedCustomerWriteError`.

- [ ] **Step 1: Write failing redirect tests**

```ts
// server/routes/customerMergeRoutes.test.ts
import assert from 'node:assert/strict';
import { toMergedCustomerRedirect, isMergedCustomerWriteError } from '../services/customerCanonicalService';

assert.deepEqual(toMergedCustomerRedirect({ id: 'old', mergedIntoId: 'new', mergeLedgerId: 'ledger1' }), {
  merged: true, canonicalCustomerId: 'new', mergeLedgerId: 'ledger1',
});
assert.equal(isMergedCustomerWriteError({ code: 'CUSTOMER_MERGED', canonicalCustomerId: 'new' }), true);
console.log('customer merged redirect: ok');
```

- [ ] **Step 2: Run the redirect test and confirm it fails**

Run: `pnpm exec tsx server/routes/customerMergeRoutes.test.ts`

Expected: exit code non-zero because `customerCanonicalService` is absent.

- [ ] **Step 3: Implement canonical resolution and route behavior**

```ts
// server/services/customerCanonicalService.ts
import type { MergedCustomerRedirect } from '../../src/types/customerMerge';

export function toMergedCustomerRedirect(customer: { id: string; mergedIntoId: string | null; mergeLedgerId: string | null }): MergedCustomerRedirect {
  if (!customer.mergedIntoId || !customer.mergeLedgerId) throw new Error('CUSTOMER_NOT_MERGED');
  return { merged: true, canonicalCustomerId: customer.mergedIntoId, mergeLedgerId: customer.mergeLedgerId };
}
export function isMergedCustomerWriteError(value: unknown): value is { code: 'CUSTOMER_MERGED'; canonicalCustomerId: string } {
  const error = value as { code?: string; canonicalCustomerId?: string };
  return error?.code === 'CUSTOMER_MERGED' && typeof error.canonicalCustomerId === 'string';
}
```

Use these exact authorization branches:

```ts
export function canManageHistoricalMergedCustomer(context: CustomerAccessContext, customer: Customer): boolean {
  if (customer.deletedAt || !customer.mergedIntoId) return false;
  if (customer.ownerIdentityStatus !== 'resolved' || !customer.ownerId) return false;
  return context.manageableOwnerIds.has(customer.ownerId);
}
```

This helper is exported only for canonical-error handling and merge undo; ordinary customer commands may not call it. A read of an old ID loads both old and canonical `aaos_customers` records and returns the canonical ID only when `canReadCustomer` passes for both. If the old record is readable but the main record is not, return a generic inaccessible result with no canonical ID. A write to an active customer uses normal `canManageCustomer`. A write to a merged secondary uses `canManageHistoricalMergedCustomer` and current read access to the main; if both pass, return controlled HTTP 409 with the canonical ID, otherwise return the normal non-disclosing 404/403. Never rewrite the mutation to the main customer.

Call the read resolver in customer detail, customer order, customer todo, AI-card, and follow-up reads. Call the write assertion in generic customer update, transfer, release, lifecycle, tag, todo create/edit/reopen/cancel, create-order, and all batch/import paths. Exclude merged customers from normal customer list and public-pool queries. Map the write error to HTTP 409 and map a read redirect to HTTP 200 with `redirect`; the browser then navigates to the canonical detail URL after showing “该客户已合并，正在跳转至主客户”.

- [ ] **Step 4: Run redirect and customer command regression tests**

Run: `pnpm exec tsx server/routes/customerMergeRoutes.test.ts && pnpm exec tsx server/services/customerCommandService.test.ts && pnpm exec tsx server/services/customerTodoService.test.ts && pnpm exec tsx server/services/customerListService.test.ts`

Expected: `customer merged redirect: ok` and exit code 0 for all commands.

- [ ] **Step 5: Commit canonical-ID protection**

```bash
git add server/services/customerCanonicalService.ts server/services/customerAccessPolicy.ts server/services/customerAccessPolicy.test.ts server/services/customerListService.ts server/services/customerCommandService.ts server/services/customerTodoService.ts server/index.ts server/routes/customerMergeRoutes.test.ts
git commit -m "feat: guard merged customer reads and writes"
```

### Task 7: Implement deterministic 72-hour undo with full conflict reporting

**Files:**
- Modify: `server/services/customerMergeService.ts`
- Modify: `server/services/customerMergeGuardService.ts`
- Modify: `server/services/customerAssociationRegistry.ts`
- Test: `server/services/customerMergeGuardService.test.ts`
- Test: `server/services/customerMergeService.test.ts`

**Interfaces:**
- Consumes: `CustomerMergeLedger`, `CustomerMergeLedgerEntry`, `CustomerMergeUndoPrecheckResult`, `CustomerMergeUndoExecutionInput`, `assertUndoGuardIntact`, `openMergeSnapshot`, `canManageHistoricalMergedCustomer`, `CustomerAssociationAdapter.restore`, and `PERMISSION_KEYS.CUSTOMER_MERGE_UNDO`.
- Produces: `precheckCustomerMergeUndo(actor, ledgerId): Promise<CustomerMergeUndoPrecheckResult>`, `undoCustomerMerge(actor, input: CustomerMergeUndoExecutionInput): Promise<CustomerMergeLedgerView>`, `listCustomerMergeHistory(actor, query)`, and `getCustomerMergeHistory(actor, ledgerId)`.

- [ ] **Step 1: Add failing deadline and conflict tests**

```ts
// append to server/services/customerMergeService.test.ts
import { sha256Json } from './customerBatchPrecheckService';
import { buildCustomerMergeUndoInputHash, formatUndoDeadlineConflict } from './customerMergeService';

assert.deepEqual(formatUndoDeadlineConflict('2026-07-20T00:00:00.000Z'), {
  code: 'UNDO_WINDOW_EXPIRED', message: '合并已超过72小时自动撤销期限', recordType: 'CustomerMergeLedger',
});
assert.equal(buildCustomerMergeUndoInputHash('ledger-1'), sha256Json({ ledgerId: 'ledger-1' }));
console.log('customer merge undo: ok');
```

- [ ] **Step 2: Run the undo test and confirm it fails**

Run: `pnpm exec tsx server/services/customerMergeService.test.ts`

Expected: exit code non-zero because `formatUndoDeadlineConflict` is not exported.

- [ ] **Step 3: Implement undo precheck and all-or-nothing restoration**

```ts
// add to server/services/customerMergeService.ts
export function formatUndoDeadlineConflict(undoDeadlineAt: string): { code: string; message: string; recordType: string } {
  return {
    code: 'UNDO_WINDOW_EXPIRED',
    message: '合并已超过72小时自动撤销期限',
    recordType: 'CustomerMergeLedger',
  };
}
export function buildCustomerMergeUndoInputHash(ledgerId: string): string {
  return sha256Json({ ledgerId });
}
```

`precheckCustomerMergeUndo` fetches the ledger plus all current `aaos_customers` records, requires `CUSTOMER_MERGE_UNDO`, runs normal `canManageCustomer` on the active main and the narrow `canManageHistoricalMergedCustomer` on every merged secondary, verifies ledger status/deadline, and calls `assertUndoGuardIntact`. It returns every changed-row, new-association, audit-sequence, identity-link, unavailable-customer, second-merge, and deadline conflict. When empty, call `issueBatchPrecheckToken` with `handlerKey=CUSTOMER_MERGE_UNDO_HANDLER_KEY`, operation `customer_merge_undo`, actor, sorted customer selection/hash, and the exact `inputHash = buildCustomerMergeUndoInputHash(ledgerId)`, plus the current version/guard manifests and the 72-hour deadline; return `precheckToken` and `expiresAt`.

`undoCustomerMerge` is invoked through the foundation consumer transaction. Its `lockAndRevalidate` locks all customer rows by global sorted ID, locks current snapshot identities/links by sorted stable IDs, locks adapter rows in registry order, and finally locks the existing ledger row; no outer transaction is opened. It repeats authorization/deadline/guard checks against the exact handler/operation/selection/input/version hashes. The typed `customer_merge_undo` consumer's `createResult` decrypts the immutable recovery payload, restores only business JSON fields and merge markers (never an old revision), restores association customer-ID paths while incrementing any native row revision, and restores exactly the prior `ContactIdentityLink` state. A main link created solely for merge is ended; each prior secondary link is reactivated; canonical pointers return to the encrypted snapshot state. Reject if a new active customer now occupies an identity. Call `touchCustomerRevision` from each currently locked customer revision so merge → undo is strictly increasing, reopen the candidate group, set ledger `status='undone'`, `undoInputHash`, `undoIdempotencyKey`, `undoIdempotencyFingerprint`, actor/time, and append monotonic undo audit events. Return `{ type: 'customer_merge_undo', id: ledger.id, idempotencyFingerprint }` so a lost-response retry returns the same ledger view. Any adapter/identity/decrypt/audit failure rolls back everything, including token consumption. On a pre-execution conflict, keep ledger status `merged`, set `lastUndoBlockedAt` and only redacted `undoConflicts`, append an `undo_blocked` audit in a separate transaction, and return the full list; a corrected state may be prechecked again before the deadline.

Add tests proving two concurrent undo submissions with the same token/key execute once, a different key is rejected, the ledger row is locked, and every participant's `recordRevision` after undo is greater than its post-merge revision.

`listCustomerMergeHistory` and `getCustomerMergeHistory` require `CUSTOMER_MERGE`, re-load the main and every secondary, and apply the canonical read rule: the actor must currently be allowed to read both each historical secondary and its active main. A ledger with any inaccessible participant is omitted from lists and returns the normal non-disclosing 404 for detail. Return `CustomerMergeLedgerView` with actor/undo metadata and redacted conflict `{ code, message, recordType }` only; never return encrypted snapshots, ID-path ledger entries, hidden record IDs, raw guard manifests or out-of-scope contact data. Paginate and sort by `mergedAt DESC, id DESC`.

- [ ] **Step 4: Run undo and registry tests**

Run: `pnpm exec tsx server/services/customerMergeGuardService.test.ts && pnpm exec tsx server/services/customerMergeService.test.ts && pnpm exec tsx server/services/customerAssociationRegistry.test.ts`

Expected: `customer merge undo: ok`, all tests exit with code 0, and the atomic-undo test proves no partial restored association remains after an adapter failure.

- [ ] **Step 5: Commit guarded undo**

```bash
git add server/services/customerMergeService.ts server/services/customerMergeGuardService.ts server/services/customerAssociationRegistry.ts server/services/customerMergeGuardService.test.ts server/services/customerMergeService.test.ts
git commit -m "feat: add guarded customer merge undo"
```

### Task 8: Expose permission-gated merge and undo HTTP APIs

**Files:**
- Create: `server/routes/customerMergeRoutes.ts`
- Modify: `server/index.ts`
- Test: `server/routes/customerMergeRoutes.test.ts`
- Create: `src/api/customerMergeApi.ts`
- Test: `src/api/customerMergeApi.test.ts`

**Interfaces:**
- Consumes: `listDuplicateGroups`, `createManualDuplicateGroup`, `precheckCustomerMerge`, `executeCustomerMerge`, `listCustomerMergeHistory`, `getCustomerMergeHistory`, `precheckCustomerMergeUndo`, `undoCustomerMerge`, `CustomerMergeExecutionInput`, and `CustomerMergeUndoPrecheckResult`.
- Produces: `GET /api/customer-duplicates`, `POST /api/customer-duplicates/manual`, `GET /api/customer-merges`, `GET /api/customer-merges/:id`, `POST /api/customer-merges/precheck`, `POST /api/customer-merges`, `POST /api/customer-merges/:id/undo-precheck`, and `POST /api/customer-merges/:id/undo`.

- [ ] **Step 1: Write failing route/client tests**

```ts
// src/api/customerMergeApi.test.ts
import assert from 'node:assert/strict';
import { buildMergeExecutionRequest } from './customerMergeApi';

assert.deepEqual(buildMergeExecutionRequest({
  mainCustomerId: 'c1', secondaryCustomerIds: ['c2'], reason: '同一手机号', precheckToken: 't', idempotencyKey: 'merge-click-1',
  fieldDecisions: {}, tagDecision: { selectedTagIds: ['tag-a'] },
}), {
  mainCustomerId: 'c1', secondaryCustomerIds: ['c2'], reason: '同一手机号', precheckToken: 't', idempotencyKey: 'merge-click-1',
  fieldDecisions: {}, tagDecision: { selectedTagIds: ['tag-a'] },
});
console.log('customer merge api: ok');
```

- [ ] **Step 2: Run the client test and confirm it fails**

Run: `pnpm exec tsx src/api/customerMergeApi.test.ts`

Expected: exit code non-zero because `customerMergeApi` is absent.

- [ ] **Step 3: Implement routes and typed client calls**

```ts
// src/api/customerMergeApi.ts
import type { CustomerMergeExecutionInput, CustomerMergePrecheckInput } from '../types/customerMerge';
import { backendRequest } from './backendClient';
export function buildMergeExecutionRequest(input: CustomerMergeExecutionInput): CustomerMergeExecutionInput {
  return {
    mainCustomerId: input.mainCustomerId,
    secondaryCustomerIds: input.secondaryCustomerIds,
    reason: input.reason,
    precheckToken: input.precheckToken,
    idempotencyKey: input.idempotencyKey,
    fieldDecisions: input.fieldDecisions,
    tagDecision: input.tagDecision,
  };
}
export async function precheckCustomerMerge(input: CustomerMergePrecheckInput) {
  return backendRequest('/customer-merges/precheck', { method: 'POST', body: JSON.stringify(input) });
}
export async function executeCustomerMerge(input: CustomerMergeExecutionInput) {
  return backendRequest('/customer-merges', { method: 'POST', body: JSON.stringify(buildMergeExecutionRequest(input)) });
}
```

Register the router under `/api`. For every route, use the project’s existing authenticated-actor middleware, then require the exact permission before invoking the service: `CUSTOMER_MERGE` for candidate list/manual creation/history list/detail/precheck/execute and `CUSTOMER_MERGE_UNDO` for both undo routes. Services repeat authorization and history scope filtering, so a route guard alone is not sufficient. Return 403 for missing permission, non-disclosing 404 for an inaccessible ledger, 422 for invalid selection or unresolved field decisions, 409 for stale prechecks, changed data, or merged-record writes, and 200/201 only after the service result is committed. Return candidate/history data after current read filtering; never accept client-supplied customer snapshots, owner names, association counts, audit fields or history metadata.

Add API functions for listing candidates, creating a manual group, paginated merge history list/detail, undo precheck, and undo. Parse the project’s normalized backend-error shape and preserve `{ code, canonicalCustomerId }` for redirect handling. Merge and undo clients accept a caller-supplied retry-stable UUID idempotency key; they never generate a new key during an automatic retry.

- [ ] **Step 4: Run route/client tests and build the front end**

Run: `pnpm exec tsx server/routes/customerMergeRoutes.test.ts && pnpm exec tsx src/api/customerMergeApi.test.ts && pnpm run build`

Expected: `customer merge api: ok` and `pnpm run build` exits with code 0.

- [ ] **Step 5: Commit the API surface**

```bash
git add server/routes/customerMergeRoutes.ts server/index.ts server/routes/customerMergeRoutes.test.ts src/api/customerMergeApi.ts src/api/customerMergeApi.test.ts
git commit -m "feat: expose customer merge governance api"
```

### Task 9: Build the duplicate-governance list, merge wizard, and history experience

**Files:**
- Create: `src/store/useCustomerMergeStore.ts`
- Create: `src/pages/Customers/CustomerDuplicateGovernance.tsx`
- Create: `src/pages/Customers/CustomerMergeWizard.tsx`
- Create: `src/pages/Customers/CustomerMergeHistory.tsx`
- Modify: `src/pages/Customers/index.tsx`
- Modify: `src/layouts/Sidebar.tsx`
- Modify: `src/App.tsx`
- Test: `src/pages/Customers/customerMergeWorkflowStatic.test.ts`

**Interfaces:**
- Consumes: `customerMergeApi` functions, `CustomerMergePrecheckResult`, `CustomerMergeLedgerView`, `CustomerMergeUndoPrecheckResult`, `PERMISSION_KEYS.CUSTOMER_MERGE`, and `PERMISSION_KEYS.CUSTOMER_MERGE_UNDO`.
- Produces: the `/customers/duplicates` route, permission-gated navigation, a three-step `CustomerMergeWizard`, and an undo-capable merge history view.

- [ ] **Step 1: Write a failing workflow/static test**

```ts
// src/pages/Customers/customerMergeWorkflowStatic.test.ts
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('src/pages/Customers/CustomerDuplicateGovernance.tsx', 'utf8');
const wizard = fs.readFileSync('src/pages/Customers/CustomerMergeWizard.tsx', 'utf8');
assert.match(page, /重复客户治理/);
assert.match(wizard, /选择主客户/);
assert.match(wizard, /关联业务迁移清单/);
assert.match(wizard, /合并原因/);
assert.doesNotMatch(page + wizard, /共享客户|撤销共享/);
console.log('customer merge workflow ui: ok');
```

- [ ] **Step 2: Run the UI test and confirm the missing-file error**

Run: `pnpm exec tsx src/pages/Customers/customerMergeWorkflowStatic.test.ts`

Expected: exit code non-zero because the governance components are absent.

- [ ] **Step 3: Implement focused state and the three-stage wizard**

```ts
// src/store/useCustomerMergeStore.ts
export interface CustomerMergeStoreState {
  loading: boolean;
  error: string | null;
  refreshCandidates(): Promise<void>;
  refreshHistory(): Promise<void>;
  submitMerge(input: import('../types/customerMerge').CustomerMergeExecutionInput): Promise<void>;
  submitUndo(input: import('../types/customerMerge').CustomerMergeUndoExecutionInput): Promise<void>;
}
```

The governance page must provide `待处理`, `已合并`, `已忽略`, and `已阻断` filters; show only candidates the server returns; and label high-confidence phone/wechat matches separately from possible name/company matches. It must offer manual candidate creation only for 2–10 currently selected, manageable customers and only when the merge leaf permission is present.

The wizard must use three explicit screens:

1. **选择主客户** — render all selected customers side by side; allow one main customer; show customer ID, owner, active contacts, and current lifecycle without exposing unselected customers.
2. **字段与关联确认** — require a source choice for every conflicting name, phone, wechat, email, company, owner, and lifecycle value; union tags and require one choice for every conflicting single-select tag group; show the server association-count preview under the exact heading “关联业务迁移清单”.
3. **最终确认** — require a non-empty reason, show that the action is atomic and has a 72-hour conditional undo window, run precheck, show all conflicts, and send the single-use token only after the user chooses “确认合并”. Generate one UUID idempotency key for that confirmation, retain it across network retries, and replace it only after a new precheck.

History loads only from the permission/scope-filtered history list/detail APIs and must show merged time, main customer, secondary customer count, undo deadline, actor, reason, undo actor/time, and redacted conflict summaries. Render “撤销合并” only when the user has `CUSTOMER_MERGE_UNDO`; always run undo precheck first and display every conflict rather than enabling a blind confirmation. Undo confirmation also generates one retry-stable UUID idempotency key. When the API returns a merged redirect, navigate to `/customers/${canonicalCustomerId}` and show the redirect message once.

Add the route in `src/App.tsx`, add its sidebar item in `src/layouts/Sidebar.tsx`, and add the list-page entry in `src/pages/Customers/index.tsx`. All three entry points must use the existing permission helper with `CUSTOMER_MERGE`; lack of permission hides the entry but server authorization remains authoritative.

- [ ] **Step 4: Run UI tests, API tests, and production build**

Run: `pnpm exec tsx src/pages/Customers/customerMergeWorkflowStatic.test.ts && pnpm exec tsx src/api/customerMergeApi.test.ts && pnpm run build`

Expected: `customer merge workflow ui: ok`, `customer merge api: ok`, and a successful production build.

- [ ] **Step 5: Commit the governance UI**

```bash
git add src/store/useCustomerMergeStore.ts src/pages/Customers/CustomerDuplicateGovernance.tsx src/pages/Customers/CustomerMergeWizard.tsx src/pages/Customers/CustomerMergeHistory.tsx src/pages/Customers/index.tsx src/layouts/Sidebar.tsx src/App.tsx src/pages/Customers/customerMergeWorkflowStatic.test.ts
git commit -m "feat: add customer duplicate governance workflow"
```

### Task 10: Run migration, release-gate, and end-to-end verification on realistic data

**Files:**
- Create: `server/services/customerMergeReleaseGate.ts`
- Create: `server/services/customerMergeReleaseGate.test.ts`
- Create: `scripts/check-customer-merge-release-gate.ts`
- Modify: `server/index.ts`
- Modify: `package.json`
- Modify: `server/services/customerAssociationRegistry.test.ts`
- Modify: `server/services/customerMergeService.test.ts`
- Create: `docs/releases/2026-07-customer-duplicate-governance-verification.md`

**Interfaces:**
- Consumes: every service and API in Tasks 1–9, the production-copy migration, and the foundation plan’s permission/data-scope migration reports.
- Produces: `queryActiveUndoSnapshotKeyVersions(prisma, now)`, `assertActiveUndoSnapshotKeysAvailable(prisma, configuredKeyVersions, now)`, and a deterministic release/startup gate that blocks deployment or process startup when registry coverage, historical data repair, security boundaries, or undo safety are not satisfied.

- [ ] **Step 1: Write the failing release-gate test**

```ts
// server/services/customerMergeReleaseGate.test.ts
import assert from 'node:assert/strict';
import { evaluateCustomerMergeReleaseGate } from './customerMergeReleaseGate';

assert.deepEqual(evaluateCustomerMergeReleaseGate({
  registryComplete: true, unresolvedHistoricalAssociationCount: 0,
  identityBackfillConflictCount: 3, candidateGroupCount: 3, migrationDryRunPassed: true,
  activeUndoSnapshotKeyVersions: [1, 2], configuredSnapshotKeyVersions: [1, 2, 3],
}), { releasable: true, blockers: [] });
assert.deepEqual(evaluateCustomerMergeReleaseGate({
  registryComplete: false, unresolvedHistoricalAssociationCount: 1,
  identityBackfillConflictCount: 0, candidateGroupCount: 0, migrationDryRunPassed: false,
  activeUndoSnapshotKeyVersions: [1], configuredSnapshotKeyVersions: [2],
}).blockers, [
  'ASSOCIATION_REGISTRY_INCOMPLETE',
  'HISTORICAL_ASSOCIATIONS_UNRESOLVED',
  'MIGRATION_DRY_RUN_FAILED',
  'MERGE_SNAPSHOT_KEY_VERSION_MISSING:1',
]);
console.log('customer merge release gate: ok');
```

- [ ] **Step 2: Run the release-gate test and confirm it fails**

Run: `pnpm exec tsx server/services/customerMergeReleaseGate.test.ts`

Expected: exit code non-zero because `customerMergeReleaseGate` is absent.

- [ ] **Step 3: Implement the release gate and execute the full verification matrix**

```ts
// server/services/customerMergeReleaseGate.ts
export function evaluateCustomerMergeReleaseGate(input: {
  registryComplete: boolean;
  unresolvedHistoricalAssociationCount: number;
  identityBackfillConflictCount: number;
  candidateGroupCount: number;
  migrationDryRunPassed: boolean;
  activeUndoSnapshotKeyVersions: number[];
  configuredSnapshotKeyVersions: number[];
}): { releasable: boolean; blockers: string[] } {
  const configured = new Set(input.configuredSnapshotKeyVersions);
  const missingKeyVersions = [...new Set(input.activeUndoSnapshotKeyVersions)]
    .filter((version) => !configured.has(version))
    .sort((a, b) => a - b);
  const blockers = [
    !input.registryComplete && 'ASSOCIATION_REGISTRY_INCOMPLETE',
    input.unresolvedHistoricalAssociationCount > 0 && 'HISTORICAL_ASSOCIATIONS_UNRESOLVED',
    !input.migrationDryRunPassed && 'MIGRATION_DRY_RUN_FAILED',
    missingKeyVersions.length > 0 && `MERGE_SNAPSHOT_KEY_VERSION_MISSING:${missingKeyVersions.join(',')}`,
  ].filter((value): value is string => Boolean(value));
  return { releasable: blockers.length === 0, blockers };
}
```

`queryActiveUndoSnapshotKeyVersions` must query distinct `snapshotKeyVersion` values from ledgers with `status='merged' AND undoDeadlineAt >= now`; exactly-at-deadline ledgers remain undoable under this plan. `assertActiveUndoSnapshotKeysAvailable` compares that live result with decoded versions from `CUSTOMER_MERGE_SNAPSHOT_KEYS_JSON` and throws `MERGE_SNAPSHOT_KEY_VERSION_MISSING:<sorted versions>` before serving traffic. Call it from `server/index.ts` after database/config initialization but before `listen`; the same check is executed by `scripts/check-customer-merge-release-gate.ts` through the `customer:merge-release-gate` package script during deployment. Expired or already-undone ledgers do not retain a key, but any still-open 72-hour undo window makes its key version non-removable. Add database-backed tests proving rotation with old+new versions passes, premature old-key removal fails, and removal after every referencing ledger expires or is undone passes.

Add this exact package script, using the repository's existing `tsx` dependency and no shell pipeline that could swallow the non-zero gate status:

```json
{
  "scripts": {
    "customer:merge-release-gate": "tsx scripts/check-customer-merge-release-gate.ts"
  }
}
```

Execute the schema migration and data repair only on a production-data copy first. Produce a signed run artifact containing: total active customers, `ContactIdentity` count, multiple-active-customer identity conflict count, generated candidate groups, candidate groups blocked by unresolved association records, all twelve adapter counts before and after dry run, every permission/data-scope migration difference, active undo ledger key versions, and configured keyring versions. The release gate passes only when the registry is complete, the historical association repair count is zero for merge-eligible groups, the migration dry run succeeds, and every unexpired undo ledger's snapshot key version exists; historical contact conflicts may remain only as blocked/open candidate groups, never as silently canonicalized customers.

Add integration fixtures covering: a customer with order, order application, delivery, refund, recovery, service ticket, opportunity, commission, finance, lead, todo, attachment reference, and AI card; a forced adapter failure proving full rollback; concurrent opposite-main merges and same-token retries proving one ledger without lock inversion; an old-link redirect allowed only when both old/main are readable; every authorized old write returning 409; a secondary-only contact becoming an active main link; a 71:59 undo success with revisions still increasing; a 72:00:00.001 undo rejection; concurrent undo executing once; a new order, follow-up, todo, attachment, identity link, and second merge each blocking undo; history list/detail omitting a ledger when any participant becomes unreadable; manager scope rejection; contributor-only read without write; and out-of-scope duplicate/history reports with no ID/name/owner disclosure.

- [ ] **Step 4: Run checks in release order**

Run: `pnpm run db:generate && pnpm run db:deploy && pnpm run customer:merge-release-gate && pnpm exec tsx server/services/customerDuplicateService.test.ts && pnpm exec tsx server/services/customerAssociationRegistry.test.ts && pnpm exec tsx server/services/customerMergeGuardService.test.ts && pnpm exec tsx server/services/customerMergeSnapshotCrypto.test.ts && pnpm exec tsx server/services/customerMergeService.test.ts && pnpm exec tsx server/routes/customerMergeRoutes.test.ts && pnpm exec tsx src/api/customerMergeApi.test.ts && pnpm exec tsx src/pages/Customers/customerMergeWorkflowStatic.test.ts && pnpm exec tsx server/services/customerMergeReleaseGate.test.ts && pnpm test && pnpm run build`

Expected: every command exits with code 0; release-gate output is `customer merge release gate: ok`; no test logs an unredacted out-of-scope customer identifier or a partial undo success.

- [ ] **Step 5: Commit verification and release documentation**

```bash
git add server/services/customerMergeReleaseGate.ts server/services/customerMergeReleaseGate.test.ts scripts/check-customer-merge-release-gate.ts server/index.ts package.json server/services/customerAssociationRegistry.test.ts server/services/customerMergeService.test.ts docs/releases/2026-07-customer-duplicate-governance-verification.md
git commit -m "test: verify customer duplicate governance release gate"
```

## Self-Review

- **Spec coverage:** Tasks 1–3 cover `ContactIdentity`/link history, duplicate groups, revision and audit watermarks, and the closed association registry. Tasks 4–5 cover 2–10 selection, scope/permission checks, explicit field decisions, fixed locks, atomic migration, ledger, and historical snapshots. Task 6 protects every old customer ID at read/write boundaries. Task 7 implements the conditional 72-hour undo with a full conflict list. Tasks 8–9 provide protected APIs, page, wizard, history, and redirect UX. Task 10 covers production-copy migration, repair reports, data-scope and privacy security tests, build, and release gate.
- **Placeholder scan:** The plan names every required module, route, persistence model, command, test file, migration filename, interface, and command. It contains no deferred implementation markers.
- **Type consistency:** All later tasks use `CustomerMergePrecheckInput`, `CustomerMergeExecutionInput`, `CustomerMergePrecheckResult`, `CustomerMergeUndoPrecheckResult`, `CustomerMergeLedgerView`, `CustomerAssociationAdapter`, `MergeGuardManifest`, and `MergedCustomerRedirect` exactly as declared in Tasks 1–3.
