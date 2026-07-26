# Business Import Eligible Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow order and recovery-order batch imports to skip precheck-blocked rows and enqueue every still-eligible row without weakening signed precheck, attachment, duplicate-number, or audit protections.

**Architecture:** The browser confirms the complete signed workbook and requests `eligible_only` mode. The service revalidates every row, and the locked persistence transaction compares the original and current eligible row-number sets before creating a job from only `ready` and `warning` rows. The batch retains full-file counts and blocked reasons.

**Tech Stack:** TypeScript, React 18, Material UI 6, Express 5, Prisma 6/MySQL, Node `assert`, Vite SSR tests, `tsx`.

## Global Constraints

- Apply the same behavior to `orders` and `recovery_orders`.
- `ready` and `warning` are eligible; `blocked` is never imported.
- Keep the full workbook hash, signed one-time token, actor/type/expiry checks, attachment ownership validation, and duplicate-number reservation.
- If eligibility changes between precheck and confirmation, return `409` and require a new precheck.
- Batches keep full-file totals and rows; jobs/items contain only submitted rows.
- Precheck-blocked rows do not count as job failures.
- Callers omitting `mode: 'eligible_only'` retain all-or-nothing behavior.
- Preserve and do not stage unrelated worktree changes.

## File Map

- `src/types/businessImport.ts`: confirmation-mode contract.
- `src/api/businessImportApi.ts`: request serialization.
- `src/shared/components/businessImportDialogModel.ts`: pure eligibility and label helpers.
- `server/services/businessImportService.ts`: full revalidation and attachment scope.
- `server/services/businessImportAdapter.ts`: locked snapshot comparison and persistence filtering.
- `src/shared/components/BusinessImportDialog.tsx`: copy, button state, eligible ZIP images.
- Matching `*.test.ts` files: behavior and regression coverage.

---

### Task 1: Shared confirmation contract

**Files:**
- Modify: `src/types/businessImport.ts`
- Modify: `src/api/businessImportApi.ts`
- Test: `src/api/businessImportApi.test.ts`
- Modify: `src/shared/components/businessImportDialogModel.ts`
- Test: `src/shared/components/businessImportDialogModel.test.ts`

**Interfaces:**
- Produces `BusinessImportConfirmMode = 'eligible_only'` and optional `BusinessImportConfirmRequest.mode`.
- Produces `eligibleBusinessImportRowNumbers(precheck): Set<number>`.
- Produces `businessImportConfirmLabel(precheck): string`.
- Changes `businessImportApi.confirm(type, rows, token, fileName, mode)`.

- [ ] **Step 1: Write failing model tests**

Add a mixed result and assert:

```ts
assert.equal(getBusinessImportConfirmDisabledReason(mixed), '');
assert.equal(businessImportConfirmLabel(mixed), '跳过 1 条并后台导入 2 条');
assert.deepEqual([...eligibleBusinessImportRowNumbers(mixed)], [2, 3]);
assert.equal(getBusinessImportConfirmDisabledReason(allBlocked), '没有可导入的数据');
```

- [ ] **Step 2: Write the failing API test**

Call `businessImportApi.confirm('orders', rows, 'token', '订单.xlsx', 'eligible_only')` and assert the serialized body includes `mode: 'eligible_only'`.

- [ ] **Step 3: Verify tests fail**

Run:

```bash
npx tsx src/shared/components/businessImportDialogModel.test.ts
npx tsx src/api/businessImportApi.test.ts
```

Expected: missing helpers/argument and mixed-result disable assertion failures.

- [ ] **Step 4: Implement the minimal contract**

```ts
export type BusinessImportConfirmMode = 'eligible_only';
export type BusinessImportConfirmRequest = BusinessImportRequest & {
  confirmationToken: string;
  fileName: string;
  mode?: BusinessImportConfirmMode;
};

export function eligibleBusinessImportRowNumbers(precheck: BusinessImportPrecheckResult): Set<number> {
  return new Set(precheck.rows.filter((row) => row.status !== 'blocked').map((row) => row.rowNumber));
}

export function businessImportConfirmLabel(precheck: BusinessImportPrecheckResult): string {
  return precheck.blockedCount > 0
    ? `跳过 ${precheck.blockedCount} 条并后台导入 ${precheck.readyCount} 条`
    : `确认并后台导入 ${precheck.readyCount} 条`;
}
```

Change the disable helper to reject only submitting, missing precheck, or `readyCount <= 0`. Serialize the mode in the API body.

- [ ] **Step 5: Run both tests and verify pass**

Expected: both commands exit `0`.

- [ ] **Step 6: Commit**

```bash
git add src/types/businessImport.ts src/api/businessImportApi.ts src/api/businessImportApi.test.ts src/shared/components/businessImportDialogModel.ts src/shared/components/businessImportDialogModel.test.ts
git commit -m "feat(import): define eligible-only confirmation"
```

---

### Task 2: Service revalidation and attachment boundary

**Files:**
- Modify: `server/services/businessImportService.ts`
- Test: `server/services/businessImportService.test.ts`

**Interfaces:**
- Consumes optional `mode: 'eligible_only'`.
- Sends full `ValidatedBusinessImportRow[]` plus the mode to persistence.
- Validates attachment IDs only for current non-blocked rows.

- [ ] **Step 1: Write failing mixed confirmation tests**

Precheck two orders: row 31 valid and row 32 with a nonexistent product. Confirm using `eligible_only`; assert the persistence dependency receives statuses `['ready', 'blocked']` plus the mode. Assert the same input without a mode still returns `409`.

- [ ] **Step 2: Write failing attachment tests**

Use a mixed ZIP where both rows reference files but only the eligible row has uploaded IDs. Assert `validateAttachments` receives only the eligible row. Assert an all-blocked eligible-only request returns `没有可导入的数据`.

- [ ] **Step 3: Verify failure**

Run `npx tsx server/services/businessImportService.test.ts`.

Expected: mixed confirmation is rejected by the current all-or-nothing guard.

- [ ] **Step 4: Implement full revalidation and eligible attachment checks**

After checking the complete-workbook hash, derive:

```ts
const eligibleRows = prepared.validated.filter((row) => row.status !== 'blocked');
if (request.mode !== 'eligible_only' && eligibleRows.length !== prepared.validated.length) {
  throw new BusinessImportError('导入数据或配置已变化，请重新预检', 409);
}
if (!eligibleRows.length) throw new BusinessImportError('没有可导入的数据');
const eligibleNormalized = eligibleRows.map((row) => row.normalized);
assertUploadedAttachmentIds(request.type, eligibleNormalized);
```

Call `validateAttachments` only when eligible rows reference attachments, then pass full validated rows and `mode` into `consumePrecheckAndCreateJob`.

- [ ] **Step 5: Run the service test and verify pass**

- [ ] **Step 6: Commit**

```bash
git add server/services/businessImportService.ts server/services/businessImportService.test.ts
git commit -m "feat(import): revalidate eligible rows on confirm"
```

---

### Task 3: Locked persistence filtering

**Files:**
- Modify: `server/services/businessImportAdapter.ts`
- Test: `server/services/businessImportAdapter.test.ts`
- Test: `server/services/businessImportReservation.integration.test.ts`

**Interfaces:**
- Consumes full current rows and optional mode.
- Reads locked `business_import_batches.rows` JSON.
- Creates jobs/items/reservations from eligible rows only.

- [ ] **Step 1: Write failing mixed persistence tests**

Return the original snapshot in the fake locked batch, call with one ready and one blocked row, and assert:

```ts
assert.equal(result.totalCount, 1);
assert.equal(result.failedCount, 0);
assert.deepEqual(createdItems.map((item: any) => item.rowNumber), [2]);
assert.equal(reservations.has('orders:tp-blocked'), false);
```

Also assert original batch counts and rows are not overwritten.

- [ ] **Step 2: Write changed-set tests**

Make row 2 ready in the snapshot but blocked in the current result. Expect `409`, no job, and no token consumption. Test a zero-eligible snapshot also creates no job.

- [ ] **Step 3: Verify failure**

Run:

```bash
npx tsx server/services/businessImportAdapter.test.ts
npx tsx server/services/businessImportReservation.integration.test.ts
```

Expected: blocked rows currently become failed job items and no snapshot comparison exists.

- [ ] **Step 4: Implement canonical set comparison**

Select `rows` in the `FOR UPDATE` query. Accept either an already-decoded JSON array or a JSON string returned by the MySQL driver; malformed snapshots return `409`. Compare sorted original and current non-blocked row numbers in `eligible_only` mode.

```ts
const submittedRows = input.mode === 'eligible_only'
  ? input.rows.filter((row) => row.status !== 'blocked')
  : input.rows;
```

Use `submittedRows` for reservations, job totals/JSON, and items. Set initial `failedCount` to `0`; preserve batch statistics while updating only status, source filename, and consumed time.

- [ ] **Step 5: Run both persistence tests and verify pass**

- [ ] **Step 6: Commit**

```bash
git add server/services/businessImportAdapter.ts server/services/businessImportAdapter.test.ts server/services/businessImportReservation.integration.test.ts
git commit -m "feat(import): persist only eligible job rows"
```

---

### Task 4: Dialog and ZIP behavior

**Files:**
- Modify: `src/shared/components/BusinessImportDialog.tsx`
- Test: `src/shared/components/BusinessImportDialog.test.ts`
- Test: `src/api/businessImportPackageUpload.test.ts`

**Interfaces:**
- Consumes Task 1 helpers.
- Confirms with `mode: 'eligible_only'` while retaining all workbook rows.
- Uploads images only for eligible row numbers.

- [ ] **Step 1: Write failing rendered tests for both modules**

Render a mixed order dialog and a mixed recovery-order dialog. Both must contain `确认后将跳过被阻止记录，仅导入可导入记录` and an enabled `跳过 1 条并后台导入 2 条` button. Keep all-blocked disabled.

- [ ] **Step 2: Write the image-subset test**

Pass all workbook rows but images only for the eligible row into `uploadBusinessImportPackageImages`. Assert all rows are returned, only the eligible row gains IDs, and only one upload occurs.

- [ ] **Step 3: Verify failure**

Run:

```bash
npx tsx src/shared/components/BusinessImportDialog.test.ts
npx tsx src/api/businessImportPackageUpload.test.ts
```

- [ ] **Step 4: Implement the dialog**

```ts
const eligibleRowNumbers = eligibleBusinessImportRowNumbers(precheck);
const eligibleImages = packageImages.filter((image) => eligibleRowNumbers.has(image.rowNumber));
```

Upload all rows with `eligibleImages`, call `businessImportApi.confirm(..., 'eligible_only')`, use the new alert copy, and render `businessImportConfirmLabel(precheck)`.

- [ ] **Step 5: Run both tests and verify pass**

- [ ] **Step 6: Commit**

```bash
git add src/shared/components/BusinessImportDialog.tsx src/shared/components/BusinessImportDialog.test.ts src/api/businessImportPackageUpload.test.ts
git commit -m "feat(import): skip blocked rows in batch dialog"
```

---

### Task 5: Regression and release evidence

**Files:**
- Modify only planned files if a focused regression is found.

**Interfaces:**
- Verifies the complete feature; introduces no new public API.

- [ ] **Step 1: Run targeted regression tests**

```bash
npx tsx src/api/businessImportApi.test.ts
npx tsx src/api/businessImportPackageUpload.test.ts
npx tsx src/shared/components/businessImportDialogModel.test.ts
npx tsx src/shared/components/BusinessImportDialog.test.ts
npx tsx server/services/businessImportService.test.ts
npx tsx server/services/businessImportAdapter.test.ts
npx tsx server/services/businessImportReservation.integration.test.ts
npx tsx server/services/businessImportExecution.test.ts
npx tsx server/services/businessImportPersistence.test.ts
```

Expected: every command exits `0`.

- [ ] **Step 2: Run the production build**

Run `npm run build`.

Expected: TypeScript and Vite builds succeed.

- [ ] **Step 3: Audit the diff boundary**

Run `git diff --check`, `git status --short`, and `git log -5 --oneline`. Confirm feature commits contain only planned files and all pre-existing unrelated modifications remain unstaged.

- [ ] **Step 4: Browser smoke test**

In both import dialogs, use a fixture with eligible and blocked rows. Verify the enabled mixed-count button, eligible-only task total, downloadable blocked-row report, job counts excluding precheck blocks, and cleanup after a definitive `409`.

- [ ] **Step 5: Commit only if regression correction was required**

Stage only the planned corrected files and use `git commit -m "fix(import): close eligible-only regression"`. Do not create an empty commit.
