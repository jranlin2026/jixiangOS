# Business import Task 3 report — Excel tools and shared import dialog

## Delivered

- Added a browser-safe business-import client for the existing `orders` and `recovery-orders` template-options, precheck, confirm, and persistent job endpoints. Public request bodies preserve the server-owned module discriminator contract and confirmation sends the exact parsed rows, one-time token, and original filename.
- Added lazy-loaded ExcelJS workbook tooling. Browser ExcelJS is loaded only after a workbook action through the emitted local `exceljs.min.js` asset; Node tests use a runtime dynamic import. No eager `exceljs` runtime import was added to page-load code.
- Added standard order and recovery-order templates with the approved headers, instructions, frozen/filterable headers, hidden active-option sheets, practical dropdowns, text formats for contact/external numbers, money/date formats, and validation capacity through data row 5,001 (5,000 records). Evidence/image columns are absent.
- Added strict `.xlsx` intake: extension/MIME agreement, 20 MB maximum, 5,000 non-empty-row maximum, formula rejection anywhere in the import sheet, unknown/duplicate/missing/unmapped headers, client-side required/contact validation, strict money/date/text types, field lengths, and leading-zero preservation.
- Added order/recovery error workbooks for precheck warnings/blocks and background job failures. Reports include Excel row, original row, status and reason, with frozen/filterable headers, sane widths, money/date formats, and formula-injection escaping.
- Added one shared Material UI `BusinessImportDialog` with module-specific copy and a five-step flow: template, upload/local parse, precheck, confirmation, and persistent job progress/result. It renders ready/warning/blocked or execution states in a paginated table, blocks confirmation when any row is blocked, allows warnings, and supports error-report download.
- Added synchronous single-flight guards for precheck, confirm, and downloads; loading/disabled states prevent repeat actions. Queued job IDs persist by tenant, authenticated user, and module; reopening resumes polling through `queued`/`running` until `succeeded`, `partial_failed`, or `failed`.
- Kept Task 4 boundaries intact: no order/recovery page button, permission gate, review-table, selection, or navigation integration was added.

## TDD evidence

- RED: `businessImportDialogModel.test.ts` first failed with `ERR_MODULE_NOT_FOUND`; subsequent slices failed for missing polling and single-flight exports. GREEN: blocked/empty/warning confirmation rules, succeeded/partial-failure terminal polling, and double-click coalescing pass through the public model interface.
- RED: `businessImportWorkbook.test.ts` first failed with `ERR_MODULE_NOT_FOUND`; later slices failed for missing recovery templates, file checks, strict parser, formula rejection, text/date/money validation, unmapped columns, and error workbook generation. GREEN: both template/header/option contracts, all strict parser limits, leading-zero identifiers, precheck/job reports, injection escaping, and lazy-loading source contract pass.
- RED: `businessImportApi.test.ts` first failed with `ERR_MODULE_NOT_FOUND`. GREEN: exact module routes and exact precheck/confirm JSON bodies pass.
- RED: `BusinessImportDialog.test.ts` first failed because the shared dialog did not exist. GREEN: the shared module-specific flow, workbook/API seams, guard/model usage, persistence, polling, pagination, partial-failure state, and Task 4 non-integration contract pass.

## Review hardening

- ExcelJS native `Date` values are interpreted as timezone-free Excel wall-clock fields through their UTC components. Real workbook round-trips under `Asia/Shanghai` cover `2026-07-24 10:30` and a late-night value without CST double-offset or cross-day drift; serial-number semantics are documented alongside the conversion.
- Numeric money cells now use the same maximum-two-decimal rule as strings. Tests cover `1.234`, negative values, large values, and floating-point tolerance such as `0.1 + 0.2`.
- Persistent jobs use an isolated storage module keyed by deployment tenant, authenticated user, and import module. A queued job enters React state before best-effort persistence, so storage failures retain the job and surface a visible warning. Missing, forbidden, gone, or stale jobs clear persistence and return the dialog to upload.
- Polling passes `AbortSignal` into the fetch seam and fences every awaited boundary. Closing/reopening, replacing callbacks, or aborting an obsolete request cannot write stale job state or repeat a terminal completion notification.
- The dialog checks now render the real component through Vite SSR for blocked, warning, recovery, stale-storage, reopen, and download states. Workbook tests execute the browser lazy-loader contract with an emitted ExcelJS asset URL, and download behavior is exercised through its public interface instead of source-regex assertions.
- Review RED evidence included CST date drift (`10:30` becoming `18:30`), acceptance of numeric `1.234`, unscoped storage, post-abort updates, and source-only dialog/lazy-loader tests. Each failed before its corresponding implementation change and passes afterward.

## Verification

- `npx tsx src/api/businessImportApi.test.ts && npx tsx src/api/businessImportWorkbook.test.ts && npx tsx src/shared/components/businessImportDialogModel.test.ts && npx tsx src/shared/components/BusinessImportDialog.test.ts` — passed.
- `npm test` — passed all 296 test files. Database-dependent integration tests retained their documented skip because `DATABASE_URL` was not set.
- `npm run build` — passed TypeScript project build and Vite production build. ExcelJS remains a separate emitted asset.
- `git diff --check` — passed.

Review-fix verification before the hardening commit:

- `TZ=Asia/Shanghai npx tsx src/api/businessImportWorkbook.test.ts && npx tsx src/api/businessImportApi.test.ts && npx tsx src/shared/components/businessImportDialogModel.test.ts && npx tsx src/shared/components/BusinessImportDialog.test.ts && npx tsc -b --pretty false` — passed.
- `npm run build` — passed; Vite transformed 13,436 modules and emitted ExcelJS as a separate production asset.
- `npm test` — passed all 296 test files after the review commit. Database-dependent integration checks retained their documented skip because `DATABASE_URL` was not set.

## Follow-up boundary

Task 4 should import `BusinessImportDialog` from the relevant order and recovery pages, add permission-gated entry buttons, and integrate review-table filtering/selection/actions. This task deliberately provides the shared dialog only.
