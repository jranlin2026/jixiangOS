# Task 1 report — backend export foundation

## Delivered

- Added three independent export permissions. They are configurable in role permissions and, by default, only the super-admin wildcard has them.
- Added shared `BusinessExportRequest`/`BusinessExportResult` contracts, using `columnMode: 'current_view' | 'all'`, optional `columnIds`, and explicit `summaryColumns`/`detailColumns` metadata.
- Added browser API methods for order, order-settlement, and recovery-settlement export.
- Added `BusinessExportAudit` Prisma model and migration. Audit captures module, actor, reason, server-owned filter snapshot, column mode/list, row counts, filename, and time.
- Added authenticated `POST /api/business-exports/:module` routes. The browser can only send reason, filters, column mode, and column ids; module and filename are server-owned.
- Added server projection/validation for all three modules: independent permission gates, required reason, exact page-column allowlists, 10,000 summary-row cap, user data-scope filtering, payment/person-split details, and attachment names/counts only.
- Reviewer follow-up aligned all-field pools exactly with `ORDER_COLUMNS`, `ORDER_SPLIT_COLUMNS`, and `RECOVERY_SETTLEMENT_COLUMNS`; every returned column has a Chinese label and stable type.
- Order-settlement export is now driven only by formal commission-backed rows and reuses the shared active-commission/processing summary helpers for amount, performance, withdrawn count, operator, confirmation, payout, and withdrawal reason.
- Fixed details now include payout plan, calculation type/formula/note, evidence status, and audit reason, while excluding internal person IDs.
- Empty exports return HTTP/business 400, audit creation is mandatory, local calendar-day boundaries are respected, and recovery deleted/cleaned behavior matches the finance page.

## API

`POST /api/business-exports/orders|order_settlements|recovery_settlements`

Body: `{ reason, filters, columnMode: 'current_view' | 'all', columnIds?: string[] }`

Response data includes `filename`, two `sheetNames`, `summaryColumns`, `detailColumns`, `summaryRows`, `detailRows`, and audit metadata.

## Verification

Passed:

- `npx tsx server/services/businessExportService.test.ts`
- `npx tsx server/routes/businessExportRoutes.test.ts`
- `npx tsx src/api/businessExportPermissionModel.test.ts`
- `npx tsx src/shared/utils/financeSettlementPresentation.test.ts`
- `npx tsc --noEmit`
- `npx prisma validate`
- `git diff --check`
- `TZ=Asia/Shanghai npm test` (full sequential suite)

## Concern

The export service shares the finance presentation aggregators but still owns export-oriented order/recovery predicates so it can retrieve all filtered rows up to the cap. Focused checks and the full sequential test suite pass.
