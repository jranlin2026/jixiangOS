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
- Tightened the Task 2 selector so both explicit-ID and whole-batch selection expand only imported records still in the module's pending status. Existing record-level commands continue to enforce live permission, data scope, and state transitions. Existing single-record actions are unchanged.

## TDD evidence

- RED: `businessImportReviewModel.test.ts` failed because the selection model did not exist; `businessImportApi.test.ts` failed because `review` did not exist; the page integration test failed because neither entry/review integration existed.
- GREEN: model/API tests cover cross-page IDs, full-batch payloads, exact modules, reason validation, mixed-result retry, and double-submit single-flight. Real SSR rendering covers both permission-gated entries, absence off the list tab, enabled batch controls, and disabled controls without imported selection.
- RED: order and recovery query tests returned unrelated batches; GREEN: `importBatchId` filters return only in-scope matching records.
- RED: selector tests expanded returned/processed imported rows; GREEN: only `待财务审核` order applications and `待审核` recovery orders are selectable.
- RED: compact payload tests exposed imported/target actor IDs and precheck warning details; GREEN: list payloads retain only the four display/filter metadata fields while detail endpoints retain the full record.

## Verification

- Focused Task 4 suite plus TypeScript build: passed.
- `npm test`: passed all 300 test files. Database-dependent integration tests reported their documented skip because `DATABASE_URL` was not set.
- `npm run build`: passed; Vite transformed 13,444 modules and kept ExcelJS as a separate emitted asset.
- `git diff --check`: passed.

## Remaining acceptance

- Automated model, API, service, static-integration, and real SSR-render checks are complete. A live browser session with suitable seeded users/imported pending records is still needed to click through both list entries, upload dialog launch, navigation, detail warnings, and actual bulk command states against a running app.
