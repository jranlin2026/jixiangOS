# Business import Task 3 report — Excel tools and shared import dialog

## Delivered

- Added a browser-safe business-import client for the existing `orders` and `recovery-orders` template-options, precheck, confirm, and persistent job endpoints. Public request bodies preserve the server-owned module discriminator contract and confirmation sends the exact parsed rows, one-time token, and original filename.
- Added lazy-loaded ExcelJS workbook tooling. Browser ExcelJS is loaded only after a workbook action through the emitted local `exceljs.min.js` asset; Node tests use a runtime dynamic import. No eager `exceljs` runtime import was added to page-load code.
- Added standard order and recovery-order templates with the approved headers, instructions, frozen/filterable headers, hidden active-option sheets, practical dropdowns, text formats for contact/external numbers, money/date formats, and validation capacity through data row 5,001 (5,000 records). Evidence/image columns are absent.
- Added strict `.xlsx` intake: extension/MIME agreement, 20 MB maximum, 5,000 non-empty-row maximum, formula rejection anywhere in the import sheet, unknown/duplicate/missing/unmapped headers, client-side required/contact validation, strict money/date/text types, field lengths, and leading-zero preservation.
- Added order/recovery error workbooks for precheck warnings/blocks and background job failures. Reports include Excel row, original row, status and reason, with frozen/filterable headers, sane widths, money/date formats, and formula-injection escaping.
- Added one shared Material UI `BusinessImportDialog` with module-specific copy and a five-step flow: template, upload/local parse, precheck, confirmation, and persistent job progress/result. It renders ready/warning/blocked or execution states in a paginated table, blocks confirmation when any row is blocked, allows warnings, and supports error-report download.
- Added synchronous single-flight guards for precheck, confirm, and downloads; loading/disabled states prevent repeat actions. Queued job IDs persist per module in local storage, and reopening the dialog resumes polling through `queued`/`running` until `succeeded`, `partial_failed`, or `failed`.
- Kept Task 4 boundaries intact: no order/recovery page button, permission gate, review-table, selection, or navigation integration was added.

## TDD evidence

- RED: `businessImportDialogModel.test.ts` first failed with `ERR_MODULE_NOT_FOUND`; subsequent slices failed for missing polling and single-flight exports. GREEN: blocked/empty/warning confirmation rules, succeeded/partial-failure terminal polling, and double-click coalescing pass through the public model interface.
- RED: `businessImportWorkbook.test.ts` first failed with `ERR_MODULE_NOT_FOUND`; later slices failed for missing recovery templates, file checks, strict parser, formula rejection, text/date/money validation, unmapped columns, and error workbook generation. GREEN: both template/header/option contracts, all strict parser limits, leading-zero identifiers, precheck/job reports, injection escaping, and lazy-loading source contract pass.
- RED: `businessImportApi.test.ts` first failed with `ERR_MODULE_NOT_FOUND`. GREEN: exact module routes and exact precheck/confirm JSON bodies pass.
- RED: `BusinessImportDialog.test.ts` first failed because the shared dialog did not exist. GREEN: the shared module-specific flow, workbook/API seams, guard/model usage, persistence, polling, pagination, partial-failure state, and Task 4 non-integration contract pass.

## Verification

- `npx tsx src/api/businessImportApi.test.ts && npx tsx src/api/businessImportWorkbook.test.ts && npx tsx src/shared/components/businessImportDialogModel.test.ts && npx tsx src/shared/components/BusinessImportDialog.test.ts` — passed.
- `npm test` — passed all 296 test files. Database-dependent integration tests retained their documented skip because `DATABASE_URL` was not set.
- `npm run build` — passed TypeScript project build and Vite production build. ExcelJS remains a separate emitted asset.
- `git diff --check` — passed.

## Follow-up boundary

Task 4 should import `BusinessImportDialog` from the relevant order and recovery pages, add permission-gated entry buttons, and integrate review-table filtering/selection/actions. This task deliberately provides the shared dialog only.
