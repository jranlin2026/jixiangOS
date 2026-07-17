# Customer Standard Import Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver one JixiangOS V1 customer `.xlsx` template and safe, permission-scoped import/export jobs, without adding a CRM-vendor-specific import path.

**Architecture:** This is phase two and consumes the phase-one customer permission tree, `CustomerAccessContext`, batch precheck/job/worker primitives, and `CustomerCommandService`. It adds a controlled encrypted customer-data file store, a strict OOXML parser worker, and two handler-registry operations (`customer_import`, `customer_export`). Customer records remain `BusinessRecord(domain='aaos_customers', data=JSON)` and are created only through `customerCommandService.createImportedCustomer`.

**Tech Stack:** React 18, TypeScript, MUI 6, Zustand, Express 5, Prisma 6/MySQL, ExcelJS 4.4, `yauzl`, Node `crypto`, and standalone `tsx`/`node:assert` tests invoked with pnpm.

## Global Constraints

- Phase one owns permission registration, role migration, customer data-scope migration, `CustomerAccessContext`, batch schema, precheck tokens, handler registry, lease worker, and audit event foundations. This phase must not modify `src/shared/utils/permissions.ts` or `server/services/roleMigrationService.ts`.
- Use only `PERMISSION_KEYS.CUSTOMER_IMPORT`, `PERMISSION_KEYS.CUSTOMER_IMPORT_ATTRIBUTION_OVERRIDE`, `PERMISSION_KEYS.CUSTOMER_EXPORT`, `PERMISSION_KEYS.CUSTOMER_EXPORT_SENSITIVE`, `PERMISSION_KEYS.CUSTOMER_CREATE`, `PERMISSION_KEYS.CUSTOMER_TRANSFER`, `PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL`, and `PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE`. Do not test legacy string permission names.
- Reuse `AuthenticatedUser` and phase-one `CustomerAccessContext`; do not introduce `CustomerActor`, `CustomerDataScope`, or a parallel customer authorization type.
- Publish exactly one operational template: `JixiangOS-Customer-Import-V1`. External CRM data must first be converted into this template outside the operational import endpoint.
- Accept only `.xlsx`, at most 20 MB and 10,000 non-empty rows. The template has exactly three worksheets: `客户导入`, `填写说明`, and `数据字典`. `数据字典` uses clearly labelled sections in one sheet; it is not multiple dictionary worksheets.
- Treat every cell as untrusted text except explicitly permitted ISO date/number fields. Formula cells are invalid and are never evaluated. Reject macros, external links, drawings, embedded content, comments, unsupported archive structure, and zip bombs.
- Customer fields must match `src/types/customer.ts`: `id`, `name`, `company`, `phone`, `wechat`, `email`, `owner`, `ownerId`, `lifecycleStatusCode`, `customerLevel`, `leadSource`, `manualTagIds`, `industry`, `city`, `leadInputBy`, `leadInputById`, `leadContributorId`, `leadContributorName`, `originalSalesTransferBy`, `originalSalesTransferById`, and `remark`.
- Duplicate identities are checked globally through the shared `ContactIdentity` normalization. A duplicate outside the requester’s readable scope reports only `系统中已存在相同联系方式`; it must not disclose entity, name, owner, ID, or department.
- Import duplicates are skipped and reported; importing never overwrites or merges. The later duplicate-governance phase owns candidate and merge workflows.
- Every exchange creates a standard `CustomerBatchJob`, is limited to 10,000 rows/customers, and uses the phase-one one-time ten-minute precheck token. Import/export handlers are registered in the worker registry and must never be routed through `CustomerAtomicCommand`.
- Source uploads, generated reports, and exports stay in an AES-256-GCM private directory for at most 30 days. Downloads re-evaluate current permissions and readable scope; public URLs are prohibited.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `prisma/schema.prisma` | Adds customer-data-file metadata and exchange-only job/item columns. |
| `prisma/migrations/20260717100000_customer_data_exchange/migration.sql` | Makes this phase’s exact data-exchange migration. |
| `server/config/runtime.ts` | Resolves and guards the private encrypted customer-data root. |
| `server/services/customerDataFileService.ts` | Persists authoritative metadata and encrypted bytes; streams only authorized files. |
| `server/services/customerTemplateService.ts` | Produces and validates the one V1, three-sheet workbook. |
| `server/services/customerWorkbookArchiveGuard.ts` | Scans the OOXML central directory and forbidden relationships before ExcelJS sees the workbook. |
| `server/workers/customerImportParserWorker.ts` | Runs archive inspection and ExcelJS parsing inside a resource-limited worker thread. |
| `server/services/customerImportParser.ts` | Owns the parent/worker protocol, timeout, normalized DTOs, and worker termination. |
| `server/services/customerImportService.ts` | Prechecks and executes imports through `createImportedCustomer`. |
| `server/services/customerImportBatchHandler.ts` | Registers the itemized `customer_import` handler without changing generic worker code. |
| `server/services/customerExportService.ts` | Snapshots readable records and maps real `Customer` fields into escaped workbook rows. |
| `server/services/customerExportBatchHandler.ts` | Registers the aggregate `customer_export` handler without changing generic worker code. |
| `server/routes/customerDataExchangeRoutes.ts` | Raw-byte upload, precheck, job, report, and authenticated download routes. |
| `server/index.ts` | Mounts raw upload parsing and exchange routes; contains no exchange business logic. |
| `src/api/backendClient.ts` | Adds byte-upload and blob-download primitives that preserve auth and error bodies. |
| `src/api/customerDataExchangeApi.ts` | Provides typed import/export calls. |
| `src/types/customerDataExchange.ts` | Shares client DTOs only; server-only models stay server-side. |
| `src/pages/Customers/data-exchange/*` | Provides import/export dialogs and a visible-task panel. |
| `docs/releases/2026-07-customer-data-exchange-verification.md` | Records migration, tests, browser authorization and retention evidence without editing the finalized spec. |

### Task 1: Add phase-two contracts and the exact schema migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260717100000_customer_data_exchange/migration.sql`
- Modify: `src/types/customer.ts`
- Create: `src/types/customerDataExchange.ts`
- Create: `src/types/customerDataExchange.test.ts`

**Interfaces:**
- Consumes: phase-one `PERMISSION_KEYS`, `CustomerBatchJob`, `CustomerBatchJobItem`, `CustomerBatchPrecheck`, `CustomerAccessContext`, and `AuthenticatedUser`.
- Produces: `CustomerDataExchangeOperation`, request/result DTOs, and named `sourceFile`/`resultFile` relations.

- [ ] **Step 1: Write the contract test first.**

```ts
import assert from 'node:assert/strict';
import {
  CUSTOMER_DATA_EXCHANGE_OPERATIONS,
  CUSTOMER_IMPORT_TEMPLATE_VERSION,
  CUSTOMER_EXPORT_FIELDS,
} from './customerDataExchange';

assert.deepEqual(CUSTOMER_DATA_EXCHANGE_OPERATIONS, ['customer_import', 'customer_export']);
assert.equal(CUSTOMER_IMPORT_TEMPLATE_VERSION, 'JixiangOS-Customer-Import-V1');
assert.equal(CUSTOMER_EXPORT_FIELDS.includes('phone'), true);
assert.equal(CUSTOMER_EXPORT_FIELDS.includes('lifecycleStatusCode'), true);
console.log('customerDataExchange.test.ts passed');
```

- [ ] **Step 2: Confirm it fails.**

Run: `pnpm exec tsx src/types/customerDataExchange.test.ts`

Expected: module-not-found failure for `customerDataExchange`.

- [ ] **Step 3: Define DTOs without duplicating permission or scope types.**

```ts
export const CUSTOMER_IMPORT_TEMPLATE_VERSION = 'JixiangOS-Customer-Import-V1' as const;
export const CUSTOMER_DATA_EXCHANGE_OPERATIONS = ['customer_import', 'customer_export'] as const;
export type CustomerDataExchangeOperation = (typeof CUSTOMER_DATA_EXCHANGE_OPERATIONS)[number];
export const CUSTOMER_EXPORT_FIELDS = [
  'id', 'name', 'company', 'phone', 'wechat', 'email', 'owner', 'lifecycleStatusCode',
  'customerLevel', 'leadSource', 'manualTagIds', 'industry', 'city', 'leadInputBy',
  'leadContributorName', 'originalSalesTransferBy', 'remark', 'createdAt', 'updatedAt',
] as const;
export type CustomerExportField = (typeof CUSTOMER_EXPORT_FIELDS)[number];
export type CustomerImportDefaultOwner =
  | { mode: 'self' }
  | { mode: 'employee'; employeeId: string }
  | { mode: 'public_pool' };
export interface CustomerImportPrecheckRequest { sourceFileId: string; defaultOwner: CustomerImportDefaultOwner; }
export interface CustomerDataExchangeJobRequest { confirmationToken: string; idempotencyKey: string; }
export interface CustomerExportPrecheckRequest {
  selection: { mode: 'ids'; customerIds: string[] } | { mode: 'filter_snapshot'; filters: Record<string, unknown> };
  fields: CustomerExportField[];
}
export interface CustomerDataFileView { id: string; fileName: string; byteSize: number; expiresAt: string; }
```

`20260717100000_customer_data_exchange` is the only migration created in this phase. Add these named relations and fields exactly:

```prisma
model CustomerDataFile {
  id                   String   @id @db.VarChar(64)
  kind                 String   @db.VarChar(20)
  storageKey           String   @unique @db.VarChar(200)
  contentType          String   @db.VarChar(150)
  originalFileName     String   @db.VarChar(240)
  byteSize             Int
  sha256               String   @db.VarChar(64)
  encryptionIv         String   @db.VarChar(32)
  encryptionAuthTag    String   @db.VarChar(32)
  encryptionKeyVersion Int
  createdById          String   @db.VarChar(64)
  createdAt            DateTime @default(now())
  expiresAt            DateTime
  purgePendingAt       DateTime?
  deletedAt            DateTime?
  sourceJobs           CustomerBatchJob[] @relation("CustomerBatchJobSourceFile")
  resultJobs           CustomerBatchJob[] @relation("CustomerBatchJobResultFile")
  @@index([expiresAt, deletedAt])
  @@index([createdById, createdAt])
}

// CustomerBatchJob additions
sourceFileId String? @db.VarChar(64)
resultFileId String? @db.VarChar(64)
templateVersion String?
downloadCount Int @default(0)
lastDownloadedAt DateTime?
sourceFile CustomerDataFile? @relation("CustomerBatchJobSourceFile", fields: [sourceFileId], references: [id], onDelete: SetNull)
resultFile CustomerDataFile? @relation("CustomerBatchJobResultFile", fields: [resultFileId], references: [id], onDelete: SetNull)

// CustomerBatchJobItem additions
sourceRowNumber Int?
rowHash String?
normalizedPayloadHash String?
resultCustomerId String?
@@unique([jobId, sourceRowNumber], map: "customer_batch_job_item_source_row_unique")
```

Extend the `Customer` JSON contract with optional stable attribution IDs `leadInputById` and `originalSalesTransferById`; keep their existing name fields as display snapshots. Do not place source or result file payloads in `BusinessRecord`.

The code consumes the phase-one permission leaves exclusively through `PERMISSION_KEYS.*`; it neither registers keys nor changes role migration.

- [ ] **Step 4: Verify generated types and migration SQL.**

Run: `pnpm exec tsx src/types/customerDataExchange.test.ts && pnpm exec prisma validate && pnpm run db:generate`

Expected: contract passes, Prisma validates both named relations and native ID types, generated client succeeds, and the reviewed SQL matches the schema. Task 8 applies the migration to the disposable release database.

- [ ] **Step 5: Commit.**

```bash
git add prisma/schema.prisma prisma/migrations/20260717100000_customer_data_exchange src/types/customer.ts src/types/customerDataExchange.ts src/types/customerDataExchange.test.ts
git commit -m "feat: add customer data exchange schema"
```

### Task 2: Build the private encrypted file service around authoritative metadata

**Files:**
- Modify: `server/config/runtime.ts`
- Modify: `server/config/runtime.test.ts`
- Modify: `.env.example`
- Create: `server/services/customerDataFileService.ts`
- Create: `server/services/customerDataFileService.test.ts`

**Interfaces:**
- Consumes: `PrismaClient` (or a narrow injected `customerDataFile` repository), phase-one audit service, `AuthenticatedUser`, and `CustomerAccessContext`.
- Produces: file IDs; callers never receive a filesystem path or a presigned/public URL.

- [ ] **Step 1: Write storage lifecycle tests.**

```ts
import assert from 'node:assert/strict';
import { createCustomerDataFileService } from './customerDataFileService';

const service = createCustomerDataFileService(fixture.dependencies);
const saved = await service.store({ actor: fixture.user, kind: 'source', fileName: '客户.xlsx', bytes: Buffer.from('secret') });
assert.equal((await service.readAuthorized(saved.id, fixture.user, fixture.access)).toString(), 'secret');
await service.markExpiredForTest(saved.id);
assert.equal(await service.purgeExpired(new Date()), 1);
assert.equal(fixture.bytesDeleteBeforeMetadataDeleted(), true);
console.log('customerDataFileService.test.ts passed');
```

- [ ] **Step 2: Confirm it fails.**

Run: `pnpm exec tsx server/services/customerDataFileService.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement encryption, metadata lookup, authorization boundary, and recoverable purge.**

```ts
export interface CustomerDataFileServiceDependencies {
  prisma: Pick<PrismaClient, 'customerDataFile' | '$transaction'>;
  rootDir: string;
  activeKeyVersion: number;
  resolveKey(version: number): Buffer;
  authorizeRead(file: CustomerDataFile, actor: AuthenticatedUser, access: CustomerAccessContext): Promise<void>;
  appendAudit(event: CustomerAuditEventInput): Promise<void>;
}
export interface CustomerDataFileService {
  store(input: { actor: AuthenticatedUser; kind: 'source' | 'report' | 'export'; fileName: string; bytes: Buffer }): Promise<CustomerDataFile>;
  readAuthorized(fileId: string, actor: AuthenticatedUser, access: CustomerAccessContext): Promise<Buffer>;
  purgeExpired(now: Date): Promise<number>;
}
```

`readAuthorized` first retrieves the `CustomerDataFile` by `fileId` from Prisma. It must ignore all browser-supplied metadata and reject missing, `purgePendingAt`, `deletedAt`, or expired records before opening bytes. Before a source file has a linked job, only its `createdById` may read it and only while that actor still has both import and create permissions; after job creation, authorization follows the linked job’s current visibility, operation, sensitive-data state, and every current readable customer ID. Reports and exports always require a linked visible job. Only after authorization does the service decrypt and return bytes. The download route, not the store, increments `downloadCount`, sets `lastDownloadedAt`, and appends the audit entry in one database transaction after a successful authorization decision.

Use AES-256-GCM with a 12-byte random IV, opaque UUID storage keys under `sources/`, `reports/`, or `exports/`, and SHA-256 of plaintext stored in metadata. `.env.example` defines `CUSTOMER_DATA_FILE_ACTIVE_KEY_VERSION=1` and `CUSTOMER_DATA_FILE_KEYS_JSON={"1":"<base64-32-byte-key>"}`. Runtime parses the JSON as a positive-integer-version map, rejects placeholders and every decoded key not exactly 32 bytes, and requires the active version to exist. Writes save `activeKeyVersion`, while reads call `resolveKey(file.encryptionKeyVersion)` so rotation does not break retained files. `getCustomerDataPrivateStorageDir` rejects a missing root and any root equal to/nested under the public upload directory. Retention is `min(configuredDays, 30)`.

Purge state sequence is fixed: transactionally set `purgePendingAt` for due undeleted records; delete encrypted bytes; transactionally set `deletedAt`; clear neither record nor audit history. If byte deletion fails, keep `purgePendingAt` so the next sweep resumes. If metadata finalization fails after bytes are removed, the next sweep recognizes the missing byte file and finalizes `deletedAt`; reads stay denied from the first state transition.

- [ ] **Step 4: Run focused tests.**

Run: `pnpm exec tsx server/services/customerDataFileService.test.ts && pnpm exec tsx server/config/runtime.test.ts`

Expected: encrypted disk bytes differ from plaintext, files below public uploads are rejected, expired/purge-pending IDs cannot be read, and recovery finalizes safely. Tests also reject a missing active version, non-32-byte key and unknown historical version, then prove a file written under version 1 still decrypts after version 2 becomes active.

- [ ] **Step 5: Commit.**

```bash
git add server/config/runtime.ts server/config/runtime.test.ts .env.example server/services/customerDataFileService.ts server/services/customerDataFileService.test.ts
git commit -m "feat: add private customer data files"
```

### Task 3: Publish and validate the one three-sheet V1 template

**Files:**
- Create: `server/services/customerTemplateService.ts`
- Create: `server/services/customerTemplateService.test.ts`

**Interfaces:**
- Consumes: active configuration dictionaries and employee IDs/accounts.
- Produces: `createCustomerImportTemplate` and `validateCustomerImportTemplate` shared by download and parser services.

- [ ] **Step 1: Write the workbook contract test.**

```ts
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { createCustomerImportTemplate, validateCustomerImportTemplate } from './customerTemplateService';

const bytes = await createCustomerImportTemplate(fixture.dictionaries);
const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes);
assert.deepEqual(book.worksheets.map((sheet) => sheet.name), ['客户导入', '填写说明', '数据字典']);
assert.equal(book.getWorksheet('客户导入')!.getRow(3).getCell(1).text, '客户姓名');
assert.equal(validateCustomerImportTemplate(book).valid, true);
console.log('customerTemplateService.test.ts passed');
```

- [ ] **Step 2: Confirm it fails.**

Run: `pnpm exec tsx server/services/customerTemplateService.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement exact V1 layout.**

`客户导入!A1` and `客户导入!B2` both identify `JixiangOS-Customer-Import-V1`; row 3 is the exact ordered header: `客户姓名`, `手机号`, `微信号`, `邮箱`, `公司名称`, `负责人员工ID`, `负责人账号`, `负责人姓名`, `客户进展`, `客户等级`, `客户标签`, `线索来源`, `资源归属`, `行业`, `城市`, `线索录入人员工ID`, `线索贡献人员工ID`, `原销转人员工ID`, `备注`.

`填写说明` describes required identity fields, canonical-template-only policy, owner precedence, and employee-ID/account rules. `数据字典` contains a first-column section label then values for progress, level, tag, source, and employee `id/account/name`; all sections are on this one sheet. The template has exactly those three sheets, no hidden fourth sheet, and no formula, external link, drawing, comment, or embedded content. Server-side validation checks exact names/order, version, header row three, and that the archive has exactly three sheets; Excel validation lists are convenience only.

- [ ] **Step 4: Run the template test.**

Run: `pnpm exec tsx server/services/customerTemplateService.test.ts`

Expected: only the exact three-sheet V1 workbook validates.

- [ ] **Step 5: Commit.**

```bash
git add server/services/customerTemplateService.ts server/services/customerTemplateService.test.ts
git commit -m "feat: add customer import template"
```

### Task 4: Add archive-safe, bounded parsing and shared contact normalization

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `server/services/customerWorkbookArchiveGuard.ts`
- Create: `server/services/customerWorkbookArchiveGuard.test.ts`
- Create: `server/workers/customerImportParserWorker.ts`
- Create: `server/services/customerImportParser.ts`
- Create: `server/services/customerImportParser.test.ts`
- Modify: `server/services/contactIdentityService.ts`
- Modify: `server/services/contactIdentityService.test.ts`

**Interfaces:**
- Consumes: V1 template validator, shared `normalizeContactIdentity`, and raw source bytes.
- Produces: normalized rows where `normalized.phone` is canonical and WeChat is lower-cased by the identity service.

- [ ] **Step 1: Write parser and normalization tests.**

```ts
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseCustomerImportWorkbook } from './customerImportParser';
import { normalizeContactIdentity } from './contactIdentityService';

const workbook = fixture.makeV1Workbook();
const sheet = workbook.getWorksheet('客户导入')!;
sheet.getRow(4).values = [undefined, '张三', '138 0013 8000', 'WeiXin_A'];
sheet.getRow(5).values = [undefined, '李四', { formula: '1+1', result: 2 }, 'weixin_a'];
const parsed = await parseCustomerImportWorkbook({ bytes: Buffer.from(await workbook.xlsx.writeBuffer()) });
assert.equal(parsed.rows[0].rowNumber, 4);
assert.equal(parsed.rows[0].normalized.phone, '13800138000');
assert.equal(parsed.rows[1].errors.some((item) => item.code === 'FORMULA_NOT_ALLOWED'), true);
assert.equal(normalizeContactIdentity('wechat', ' WeiXin_A '), 'weixin_a');
console.log('customerImportParser.test.ts passed');
```

- [ ] **Step 2: Confirm it fails.**

Run: `pnpm exec tsx server/services/customerWorkbookArchiveGuard.test.ts && pnpm exec tsx server/services/customerImportParser.test.ts && pnpm exec tsx server/services/contactIdentityService.test.ts`

Expected: failures until parser and shared WeChat normalization are implemented.

- [ ] **Step 3: Add `yauzl` and enforce the archive gate before ExcelJS.**

Add `yauzl` with `pnpm add yauzl` and its declarations with `pnpm add -D @types/yauzl`; commit the resulting `package.json` and `pnpm-lock.yaml`. `inspectXlsxArchive` lives in `customerWorkbookArchiveGuard.ts`, uses `yauzl` with `lazyEntries: true`, rejects archives with encrypted entries, more than 200 entries, entry names that escape the archive root, an uncompressed total above 80 MB, a compression ratio above 100:1, or any entry exceeding 20 MB. It requires `[Content_Types].xml`, `xl/workbook.xml`, three worksheet XML parts, and rejects `xl/vbaProject.bin`, `xl/externalLinks/`, `xl/drawings/`, `xl/embeddings/`, `xl/comments`, and relationship XML that declares an external target. Never use ExcelJS `ignoreNodes` to conceal forbidden XML.

The parent `customerImportParser.ts` starts `server/workers/customerImportParserWorker.ts` through `node:worker_threads` `Worker` with `resourceLimits` (`maxOldGenerationSizeMb: 32`, `maxYoungGenerationSizeMb: 16`), transfers only the source `ArrayBuffer`, accepts only a bounded plain-data result, and owns a 30-second timer that terminates the thread. The worker runs the archive guard before ExcelJS, then rejects more than 100,000 cells, more than 10,000 nonblank data rows, and any formula cell object (`cell.value` containing `formula`) without consulting `cell.result`. It reads row 3 as the header and data from row 4 onward. It trims Unicode whitespace, maps both phone and WeChat through the shared `normalizeContactIdentity` (`phone` removes a single leading `+86` and canonicalizes digits; `wechat` lowercases), lowercases email, and derives row hashes from canonical normalized data. Missing name or both phone/WeChat is invalid; repeated normalized phone or WeChat marks all involved rows `DUPLICATE_IN_FILE`.

- [ ] **Step 4: Run archive, timeout, formula, and header tests.**

Run: `pnpm exec tsx server/services/customerWorkbookArchiveGuard.test.ts && pnpm exec tsx server/services/customerImportParser.test.ts && pnpm exec tsx server/services/contactIdentityService.test.ts`

Expected: row-three headers and row-four data parse correctly; formula result values are ignored; macro/external/drawing/embedded/zip-bomb fixtures fail before workbook loading.

- [ ] **Step 5: Commit.**

```bash
git add package.json pnpm-lock.yaml server/services/customerWorkbookArchiveGuard.ts server/services/customerWorkbookArchiveGuard.test.ts server/workers/customerImportParserWorker.ts server/services/customerImportParser.ts server/services/customerImportParser.test.ts server/services/contactIdentityService.ts server/services/contactIdentityService.test.ts
git commit -m "feat: parse customer import archives safely"
```

### Task 5: Precheck and execute imports through the real customer command boundary

**Files:**
- Modify: `server/services/customerCommandService.ts`
- Modify: `server/services/customerCommandService.test.ts`
- Create: `server/services/customerImportService.ts`
- Create: `server/services/customerImportService.test.ts`
- Create: `server/services/customerImportBatchHandler.ts`
- Create: `server/services/customerImportBatchHandler.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `AuthenticatedUser`, `CustomerAccessContext`, phase-one `canReadCustomer`/`canManageCustomer`, `issueBatchPrecheckToken`/`consumeBatchPrecheckToken`, `CustomerBatchJobHandler`, shared contact identities, and file service.
- Produces: a `customer_import` registry handler and transactionally-created `BusinessRecord(domain='aaos_customers')` customers.

- [ ] **Step 1: Write privacy, target-owner, and persistence tests.**

```ts
import assert from 'node:assert/strict';
import { precheckCustomerImport } from './customerImportService';

const checked = await precheckCustomerImport(fixture.restrictedUser, fixture.restrictedAccess, fixture.request);
assert.deepEqual(checked.rows[0].conflict, { visibility: 'hidden', message: '系统中已存在相同联系方式' });
assert.equal(checked.rows[1].errors[0].code, 'OWNER_OUT_OF_SCOPE');
await fixture.runImportHandler(checked.confirmationToken);
assert.equal(fixture.createdBusinessRecord().domain, 'aaos_customers');
assert.equal(fixture.createdBusinessRecord().data.phone, '13800138000');
console.log('customerImportService.test.ts passed');
```

- [ ] **Step 2: Confirm it fails.**

Run: `pnpm exec tsx server/services/customerImportService.test.ts`

Expected: service/handler is absent.

- [ ] **Step 3: Add the imported-customer command and precheck.**

```ts
export interface ImportedCustomerInput {
  name: string; company: string; phone: string; wechat?: string; email?: string;
  owner: string; ownerId?: string; lifecycleStatusCode?: string; customerLevel: CustomerLevel;
  leadSource?: string; manualTagIds?: string[]; industry?: string; city?: string;
  leadInputBy?: string; leadInputById?: string; leadContributorId?: string; leadContributorName?: string;
  originalSalesTransferBy?: string; originalSalesTransferById?: string; remark?: string;
}
export interface CustomerCommandService {
  createImportedCustomer(input: ImportedCustomerInput, actor: AuthenticatedUser, access: CustomerAccessContext, tx?: CustomerCommandTx): Promise<Customer>;
}
```

`createImportedCustomer` writes a `BusinessRecord` with `domain='aaos_customers'`, a newly allocated `recordId`, searchable `title/status/owner/customerId` columns, and the full real `Customer` object in `data`. In the same transaction it writes `ContactIdentity` and `ContactIdentityLink`, and appends the phase-one customer audit event. It must never assume a Prisma `Customer` model exists.

`precheckCustomerImport(actor, access, request)` verifies `PERMISSION_KEYS.CUSTOMER_IMPORT` and `PERMISSION_KEYS.CUSTOMER_CREATE`, reads source bytes through the authoritative file ID, parses V1, resolves the row/default owner, validates prospective ownership against `CustomerAccessContext.manageableOwnerIds` (or the phase-one equivalent assignment helper), active employment, configs, and identity uniqueness. Do not call `canManageCustomer` on a fabricated record. A different target owner requires `PERMISSION_KEYS.CUSTOMER_TRANSFER`; public-pool target requires `PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL`. If any of the template's `线索录入人员工ID`, `线索贡献人员工ID`, or `原销转人员工ID` cells is non-empty and the actor lacks `PERMISSION_KEYS.CUSTOMER_IMPORT_ATTRIBUTION_OVERRIDE`, block that row with `ATTRIBUTION_OVERRIDE_FORBIDDEN`; never silently ignore it. With the leaf, resolve every non-empty value by stable employee ID, require an active unambiguous employee, write the current name as display snapshot, and audit the submitted value, resolved target ID and actor. With all three cells empty, persist `leadInputById=actor.id` plus actor name and leave contributor/original-sales-transfer IDs/names empty. Global duplicate checks expose a readable conflict only through `canReadCustomer`; otherwise use the exact hidden message. Call `issueBatchPrecheckToken` and bind it to actor, handler key `customer_import`, operation, source file ID and SHA-256, template version, normalized rows hash, default owner, and row order.

Confirmation supplies `confirmationToken` plus a client-generated retry-stable `idempotencyKey` to `consumeBatchPrecheckToken` with a `customer_batch_job` result consumer. Its `lockAndRevalidate` locks authoritative file metadata and rechecks creator/permission, file SHA, template, normalized rows/order, owners, attribution, identities and configs. Its `createResult` creates a phase-one `CustomerBatchJob(operation='customer_import', handlerKey='customer_import', sourceFileId, templateVersion, idempotencyFingerprint)` plus one item per source row with non-null `targetKey='row:<sourceRowNumber>'` in the same database transaction, which atomically switches source-file authorization from creator-only to linked-job rules. Invalid/duplicate rows are inserted directly as terminal report items; ready rows are queued. `customerImportBatchHandler.ts` implements an itemized `CustomerBatchJobHandler` and `server/index.ts` constructs `CustomerBatchJobHandlerRegistry` with the existing `customer_mutation` handler plus `customer_import`; generic worker code is unchanged. For each ready item, `processItem` repeats owner/config/identity conditions inside the transaction, creates through `createImportedCustomer`, sets `resultCustomerId`, and marks a `P2002` contact race as duplicate skip. Its optional `finalize` creates the encrypted result report, calls `lease.assertActive()` immediately before the transaction that writes `resultFileId`, and deletes an unlinked encrypted artifact if fencing/association fails. Repeated confirmation returns the same job, and repeated worker delivery is idempotent from `(jobId,targetKey)`, the row hash, and the contact identity unique boundary.

- [ ] **Step 4: Run service and worker tests.**

Run: `pnpm exec tsx server/services/customerCommandService.test.ts && pnpm exec tsx server/services/customerImportService.test.ts && pnpm exec tsx server/services/customerImportBatchHandler.test.ts && pnpm exec tsx server/services/customerBatchWorker.test.ts`

Expected: no direct Prisma Customer use; a redelivered item creates one `aaos_customers` record only.

- [ ] **Step 5: Commit.**

```bash
git add server/services/customerCommandService.ts server/services/customerCommandService.test.ts server/services/customerImportService.ts server/services/customerImportService.test.ts server/services/customerImportBatchHandler.ts server/services/customerImportBatchHandler.test.ts server/index.ts
git commit -m "feat: execute customer imports through commands"
```

### Task 6: Build real-customer export rows and register the export handler

**Files:**
- Create: `server/services/customerExportService.ts`
- Create: `server/services/customerExportService.test.ts`
- Create: `server/services/customerExportBatchHandler.ts`
- Create: `server/services/customerExportBatchHandler.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `Customer`, `AuthenticatedUser`, `CustomerAccessContext`, `PERMISSION_KEYS.*`, `issueBatchPrecheckToken`/`consumeBatchPrecheckToken`, phase-one frozen selection, `CustomerBatchJobHandler`, and file service.
- Produces: `toCustomerExportRow`, an encrypted xlsx/report, and `customer_export` handler registration.

- [ ] **Step 1: Write mapping and masking tests.**

```ts
import assert from 'node:assert/strict';
import { escapeSpreadsheetText, toCustomerExportRow } from './customerExportService';

assert.equal(escapeSpreadsheetText('=1+1'), "'=1+1");
assert.deepEqual(toCustomerExportRow(fixture.customer, ['id', 'phone', 'company', 'owner', 'lifecycleStatusCode', 'customerLevel'], false), {
  id: fixture.customer.id, phone: '138****8000', company: fixture.customer.company,
  owner: fixture.customer.owner, lifecycleStatusCode: fixture.customer.lifecycleStatusCode ?? '', customerLevel: fixture.customer.customerLevel,
});
console.log('customerExportService.test.ts passed');
```

- [ ] **Step 2: Confirm it fails.**

Run: `pnpm exec tsx server/services/customerExportService.test.ts`

Expected: module-not-found failure.

- [ ] **Step 3: Implement explicit field mapping and real-time read rechecks.**

```ts
export function toCustomerExportRow(customer: Customer, fields: readonly CustomerExportField[], canExportSensitive: boolean): Partial<Record<CustomerExportField, string>> {
  return Object.fromEntries(fields.map((field) => [field, escapeSpreadsheetText(formatCustomerField(customer, field, canExportSensitive))])) as Partial<Record<CustomerExportField, string>>;
}
```

`formatCustomerField` uses the actual Customer shape: `phone`, `wechat`, and `email` are masked unless `PERMISSION_KEYS.CUSTOMER_EXPORT_SENSITIVE` is effective; `company`, `owner`, `lifecycleStatusCode`, `customerLevel`, `leadSource`, `manualTagIds`, and all other allowlisted fields have explicit mappings. No `mobile`, `customerNo`, `progress`, `level`, `tags`, `source`, or invented `resourceAttribution` field appears in the export DTO. Text beginning `=`, `+`, `-`, or `@` receives an apostrophe.

Precheck requires `PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE` and `PERMISSION_KEYS.CUSTOMER_EXPORT`, accepts at least one allowlisted field, freezes at most 10,000 current IDs after `canReadCustomer`, and calls `issueBatchPrecheckToken` with handler key `customer_export`, the sorted frozen IDs/hash, fields, masking mode, and access guard. Confirmation supplies `confirmationToken` plus a client-generated retry-stable `idempotencyKey` to `consumeBatchPrecheckToken` with the same `customer_batch_job` result consumer. Its `lockAndRevalidate` reloads the frozen selection and current access; its `createResult` creates `CustomerBatchJob(operation='customer_export', handlerKey='customer_export', selectedCustomerIds, idempotencyFingerprint)` and exactly one item with non-null `targetKey='aggregate:customer_export'` in the same transaction. `customerExportBatchHandler.ts` implements an aggregate `CustomerBatchJobHandler`; `server/index.ts` adds it to the registry constructor and generic worker code remains unchanged. `processAggregate` runs once, loops the job's sorted frozen IDs, reloads each record and checks `canReadCustomer` with the current `CustomerAccessContext`; changed scope increments the returned skipped count without leaking a row. It calls `lease.assertActive()` immediately before committing authoritative result-file metadata and the job link, removes an uncommitted encrypted artifact if fencing fails, and returns total/success/skipped/failed counts to the generic worker. It never routes through `CustomerAtomicCommand`. Write `客户数据` and `导出说明`, then encrypt and link the workbook as `resultFile`; import result reports remain exclusively in the import handler’s `finalize` step.

- [ ] **Step 4: Run export and worker tests.**

Run: `pnpm exec tsx server/services/customerExportService.test.ts && pnpm exec tsx server/services/customerExportBatchHandler.test.ts && pnpm exec tsx server/services/customerBatchWorker.test.ts`

Expected: customer fields map consistently, sensitive data masks, and export dispatch never reaches atomic customer command handling.

- [ ] **Step 5: Commit.**

```bash
git add server/services/customerExportService.ts server/services/customerExportService.test.ts server/services/customerExportBatchHandler.ts server/services/customerExportBatchHandler.test.ts server/index.ts
git commit -m "feat: add secure customer exports"
```

### Task 7: Expose byte upload and authenticated downloads

**Files:**
- Modify: `src/api/backendClient.ts`
- Create: `src/api/backendClient.test.ts`
- Create: `src/api/customerDataExchangeApi.ts`
- Create: `src/api/customerDataExchangeApi.test.ts`
- Create: `server/routes/customerDataExchangeRoutes.ts`
- Create: `server/routes/customerDataExchangeRoutes.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: exchange services and authenticated route middleware.
- Produces: authenticated byte upload/blob download APIs with server-decided download authorization.

- [ ] **Step 1: Write client and route tests.**

```ts
import assert from 'node:assert/strict';
import { backendRequestBlob, backendUploadBytes } from './backendClient';

await backendUploadBytes('/customer-import/source-files', new Uint8Array([1, 2]), {
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  fileName: '客户导入.xlsx',
});
assert.equal((await backendRequestBlob('/customer-export/jobs/job-1/download')).code, 403);
console.log('backendClient.test.ts passed');
```

- [ ] **Step 2: Confirm they fail.**

Run: `pnpm exec tsx src/api/backendClient.test.ts && pnpm exec tsx server/routes/customerDataExchangeRoutes.test.ts`

Expected: missing client helpers and route module.

- [ ] **Step 3: Add robust byte/blob helpers and exact routes.**

```ts
export async function backendUploadBytes<T>(
  path: string,
  bytes: BlobPart,
  options: { contentType: string; fileName: string },
): Promise<ApiResponse<T>>;
export async function backendRequestBlob(path: string, init?: RequestInit): Promise<ApiResponse<{ blob: Blob; fileName?: string }>>;
```

Both helpers add the backend token, preserve bytes instead of JSON-stringifying them, parse JSON errors before constructing a fallback message, and clear the session on 401. The upload helper sends `X-Upload-File-Name: encodeURIComponent(options.fileName)`; the server decodes it, first rejects `/`, `\\`, control characters, empty names and names over 240 UTF-8 bytes, and only then applies `path.basename` as a defensive invariant. It never trusts the name as a storage path. Add tests for Authorization, content type, encoded Unicode filename, `../x.xlsx`/Windows separator/control-character rejection, JSON 403, and binary success. `customerDataExchangeApi` delegates upload/download strictly to these helpers.

Mount `express.raw({ type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', limit: '20mb' })` only on `POST /api/customer-import/source-files` before the JSON parser. Reject non-xlsx byte uploads and verify the parser/file-service hash server-side. Expose `GET /api/customer-import/template`, `POST /api/customer-import/source-files`, `POST /api/customer-import/precheck`, `POST /api/customer-import/jobs`, `GET /api/customer-import/jobs/:id/result-file`, `POST /api/customer-export/precheck`, `POST /api/customer-export/jobs`, and `GET /api/customer-export/jobs/:id/download`.

Every route and service checks the named `PERMISSION_KEYS.*`. Download resolves job then file ID, resolves a fresh `CustomerAccessContext`, checks task visibility/current job customer IDs/current readable scope/current operation permission, checks sensitive-export permission if full values are present, and calls `readAuthorized(fileId, actor, access)`. The route then increments count, writes audit, and streams bytes. Scope-reduced or audit-only users get 403 before bytes; hidden results never include cross-range target details. Full export downloads after permission revocation return `当前权限不允许下载该文件，请重新导出`.

- [ ] **Step 4: Run client and endpoint tests.**

Run: `pnpm exec tsx src/api/backendClient.test.ts && pnpm exec tsx src/api/customerDataExchangeApi.test.ts && pnpm exec tsx server/routes/customerDataExchangeRoutes.test.ts`

Expected: 403 JSON messages render correctly; no public URL, stale authorization, or raw file path is usable.

- [ ] **Step 5: Commit.**

```bash
git add src/api/backendClient.ts src/api/backendClient.test.ts src/api/customerDataExchangeApi.ts src/api/customerDataExchangeApi.test.ts server/routes/customerDataExchangeRoutes.ts server/routes/customerDataExchangeRoutes.test.ts server/index.ts
git commit -m "feat: expose customer data exchange APIs"
```

### Task 8: Add focused list UI and release gates

**Files:**
- Create: `src/pages/Customers/data-exchange/CustomerImportDialog.tsx`
- Create: `src/pages/Customers/data-exchange/CustomerExportDialog.tsx`
- Create: `src/pages/Customers/data-exchange/CustomerDataJobPanel.tsx`
- Create: `src/pages/Customers/data-exchange/customerDataExchangeUi.test.ts`
- Modify: `src/pages/Customers/index.tsx`
- Create: `server/services/customerDataExchangeAcceptance.test.ts`
- Create: `docs/releases/2026-07-customer-data-exchange-verification.md`

**Interfaces:**
- Consumes: server-returned capabilities/job summaries, the existing customer list filter state, and API DTOs.
- Produces: non-leaky import/export interfaces and executable release checks.

- [ ] **Step 1: Write UI visibility checks.**

```ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync('src/pages/Customers/data-exchange/CustomerImportDialog.tsx', 'utf8');
assert.match(source, /JixiangOS标准模板/);
assert.match(source, /预检完成后确认导入/);
assert.match(readFileSync('src/pages/Customers/data-exchange/CustomerExportDialog.tsx', 'utf8'), /敏感字段将脱敏/);
console.log('customerDataExchangeUi.test.ts passed');
```

- [ ] **Step 2: Confirm it fails.**

Run: `pnpm exec tsx src/pages/Customers/data-exchange/customerDataExchangeUi.test.ts`

Expected: dialog files do not yet exist.

- [ ] **Step 3: Build server-capability-driven dialogs.**

Show Import only when the current user has `PERMISSION_KEYS.CUSTOMER_IMPORT` and `PERMISSION_KEYS.CUSTOMER_CREATE`; show Export only for `PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE` plus `PERMISSION_KEYS.CUSTOMER_EXPORT`. Do not add client-side scope inference. Import supports default self/eligible employee/public-pool owner, template download, one file upload, grouped precheck rows, one-time confirmation, and permitted report download. Export supports selected IDs/current filters, only server-allowed fields, sensitive mask explanation, token confirmation, and job status. Each confirmation generates one UUID idempotency key, retains it across network retries, and clears it only after a terminal server response or a new precheck. The job panel renders server-returned masked summaries and refreshes after 403 instead of caching a URL. No CRM selector, CSV parser, or external-vendor mapping UI exists.

- [ ] **Step 4: Execute acceptance and release checks.**

```ts
for (const scenario of [
  'exact V1 three-sheet template only', 'row3 header and row4 data parsing', 'formula cell object rejected',
  'macro external drawing embedded and zip bomb rejected', 'foreign duplicate hidden',
  'import uses aaos_customers BusinessRecord', 'duplicate row skipped', 'transfer and public-pool permissions enforced',
  'export maps phone company owner lifecycle and level', 'sensitive export revoked before download',
  'scope-reduced user cannot read mixed report', 'purge pending blocks download and recovers', 'worker redelivery idempotent',
]) await fixture.assertScenario(scenario);
console.log('customerDataExchangeAcceptance.test.ts passed');
```

Run: `pnpm exec tsx src/pages/Customers/data-exchange/customerDataExchangeUi.test.ts && pnpm exec tsx server/services/customerDataExchangeAcceptance.test.ts && pnpm run db:generate && pnpm run db:deploy && pnpm test && pnpm run build`

Expected: all tests/build commands exit 0. Record command output, migration ID, permission accounts, file-retention evidence and browser evidence in `docs/releases/2026-07-customer-data-exchange-verification.md`. Perform one browser pass with an import-capable scoped account and one restricted account. Verify generated customer data is never reachable under `/uploads`, files expire at 30 days or sooner, and every download is authorized at request time. The finalized design spec remains unchanged.

- [ ] **Step 5: Commit.**

```bash
git add src/pages/Customers/data-exchange src/pages/Customers/index.tsx server/services/customerDataExchangeAcceptance.test.ts docs/releases/2026-07-customer-data-exchange-verification.md
git commit -m "test: verify customer data exchange release gates"
```

## Acceptance Traceability

| Confirmed requirement | Implementation tasks |
| --- | --- |
| One canonical JixiangOS `.xlsx` template; no CRM-specific importer | 1, 3, 4, 8 |
| Strict three-sheet parser, 20 MB/10,000-row bounds, formula/macro/archive rejection | 3, 4, 8 |
| Global contact duplicate skip with no out-of-scope disclosure | 4, 5, 8 |
| Stable owner/attribution IDs and configurable permission/scope enforcement | 1, 5, 7, 8 |
| Itemized import and aggregate export on the shared leased worker contract | 5, 6, 8 |
| Explicit export mapping and sensitive-field masking | 1, 6, 8 |
| AES-256-GCM private storage, key rotation, retention and request-time download authorization | 1, 2, 7, 8 |
| One-time precheck, retry-stable idempotency and no overwrite/auto-merge | 5, 6, 8 |

## Self-Review

- **Spec coverage:** Tasks 1–4 define the canonical template, safe file boundary and parser; Tasks 5–6 implement import/export through the shared precheck/worker contracts; Tasks 7–8 expose authenticated APIs, UI and release gates.
- **Placeholder scan:** Every created or modified module, migration, route, handler, test and verification artifact is named; there are no deferred CRM adapters or unspecified storage paths.
- **Type consistency:** Customer records remain `BusinessRecord(domain='aaos_customers')`; all authorization uses foundation `PERMISSION_KEYS`, `AuthenticatedUser`, `CustomerAccessContext`, `CustomerBatchJobHandler`, and typed precheck result consumers.
