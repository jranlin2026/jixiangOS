# Business import Task 4 report — page and review-table integration

## Delivered

- Added shared permission-aware import entry buttons. `导入订单` appears only on the order list with `订单/订单列表/导入订单`; `导入售后挽回订单` appears only on the recovery list with `售后服务/售后挽回订单列表/导入售后挽回订单`. Explicit leaf grants and the existing super-admin wildcard are respected; review tabs never render either entry.
- Reused `BusinessImportDialog` with exact modules `orders` and `recovery_orders`. The dialog now exposes queued jobs immediately through `onQueued` and displays both job and batch IDs. Queueing navigates authorized users to the matching review tab with `importBatchId` in the URL; terminal completion refreshes that filtered review table.
- Added server-side `importBatchId` filtering to order applications and recovery orders in both SQL and restricted-scope fallback paths. The filter is applied after/alongside the existing data-scope conditions and is passed through the backend routes and mock-compatible clients.
- Added optional review columns for import batch, Excel row, importer, and import time without changing the existing default visible columns or persisted view-setting schema.
- Kept list projections compact: the list carries only the metadata needed for filtering and optional columns, while internal actor IDs, target-creator identity, and warning detail remain detail-only. Existing inline attachment stripping is preserved.
- Added classified `导入信息` detail sections with batch, Excel row, importer/time, target creator, customer match status, credential state, and precheck warnings. Imported recovery details show explicit temporary-customer and missing-evidence warnings; imported order details show the missing payment/deal-evidence warning.
- Added imported-pending-only row selection, current-page selection, explicit IDs retained across pages, and server-expanded `选择当前导入批次全部待审记录`. Manual rows, returned rows, and processed rows remain non-selectable.
- Added shared bulk approve/return/reject controls. Return/reject require trimmed reasons; impossible actions are disabled; synchronous single-flight prevents duplicate posts. Mixed results display success/failure totals and item messages, retain only failed IDs for retry, and refresh the table.
- Tightened the Task 2 selector so both explicit-ID and whole-batch selection expand only imported records still in the module's pending status. The selector now resolves the actor's authoritative server-side user/role/department directory and applies the existing `orderApplications` or `recoveryOrderApplications` data scope before returning any ID, so self, department, all, and no-access scopes cannot leak out-of-scope IDs or totals. Existing record-level commands continue to enforce live permission and state transitions. Existing single-record actions are unchanged.
- Added request-ID plus `AbortController` fencing to the order review list. Starting a newer filter/batch request aborts the older request, and only the latest request may update rows, pagination, or loading state; rapid batch A → B changes therefore cannot display a late A response under the B filter/selection.
- Replaced both review-table header selectors with one permission-aware page selector. The checkbox is disabled for read-only reviewers, and its handler independently refuses selection without review-write permission; row handlers have the same hard guard.

## TDD evidence

- RED: `businessImportReviewModel.test.ts` failed because the selection model did not exist; `businessImportApi.test.ts` failed because `review` did not exist; the page integration test failed because neither entry/review integration existed.
- GREEN: model/API tests cover cross-page IDs, full-batch payloads, exact modules, reason validation, mixed-result retry, and double-submit single-flight. Real SSR rendering covers both permission-gated entries, absence off the list tab, enabled batch controls, and disabled controls without imported selection.
- RED: order and recovery query tests returned unrelated batches; GREEN: `importBatchId` filters return only in-scope matching records.
- RED: selector tests expanded returned/processed imported rows; GREEN: only `待财务审核` order applications and `待审核` recovery orders are selectable.
- RED: compact payload tests exposed imported/target actor IDs and precheck warning details; GREEN: list payloads retain only the four display/filter metadata fields while detail endpoints retain the full record.
- RED: a self-scoped selector expanded four records from a batch, including teammate, descendant, and outside-department applications. GREEN: server-authoritative selector tests cover self batch expansion, department plus descendants, all, no-access, and explicit-ID attempts containing an unauthorized ID.
- RED: the order review page had no request gate, so tests could not prevent late batch A from applying after batch B. GREEN: the behavioral gate test proves B aborts A, only B applies, stale requests cannot clear loading, and unmount aborts the active request.
- RED: page-selection behavior had no permission-aware model/component. GREEN: model tests prove a read-only handler preserves the empty selection, while real SSR renders disabled order and recovery header checkboxes even when the page contains imported pending records.

## Verification

- Focused Task 4 suite: passed all 15 selected files, including selector/service/routes, request-gate behavior, permission SSR/model, order/recovery APIs, scoped query paths, and review-state regressions. `npx tsc -b --pretty false` also passed.
- `npm test`: passed all 301 test files. Database-dependent integration tests reported their documented skip because `DATABASE_URL` was not set.
- `npm run build`: passed; Vite transformed 13,444 modules and kept ExcelJS as a separate emitted asset.
- `git diff --check`: passed.

## Browser evidence and limits

- A logged-in live browser session first confirmed both list-only import entries and both import-dialog launches. After the review fixes, a second current-worktree session confirmed both review tabs, the import-batch filter, disabled page-selection headers with no eligible records, and disabled bulk actions at zero selection. No review mutation or file upload was executed.
- The browser's port 3001 API process was an older checkout, so the dialog's template request returned HTTP 404. This was recorded as a local front/back version mismatch, not as evidence that the current worktree endpoint passed. Current endpoint behavior is covered by the route/service tests; a fully version-matched browser environment with seeded imported pending records is still required for an end-to-end upload and bulk-review mutation acceptance run.
