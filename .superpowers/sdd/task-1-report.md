# Task 1 report — backend export foundation

## Delivered

- Added three independent export permissions. They are configurable in role permissions and, by default, only the super-admin wildcard has them.
- Added shared `BusinessExportRequest`/`BusinessExportResult` contracts, using `columnMode: 'current_view' | 'all'`, optional `columnIds`, and explicit `summaryColumns`/`detailColumns` metadata.
- Added browser API methods for order, order-settlement, and recovery-settlement export.
- Added `BusinessExportAudit` Prisma model and migration. Audit captures module, actor, reason, server-owned filter snapshot, column mode/list, row counts, filename, and time.
- Added authenticated `POST /api/business-exports/:module` routes. The browser can only send reason, filters, column mode, and column ids; module and filename are server-owned.
- Added server projection/validation for all three modules: independent permission gates, required reason, module-specific allowlists, 10,000 summary-row cap, user data-scope filtering, payment/person-split details, and attachment names/counts only.

## API

`POST /api/business-exports/orders|order_settlements|recovery_settlements`

Body: `{ reason, filters, columnMode: 'current_view' | 'all', columnIds?: string[] }`

Response data includes `filename`, two `sheetNames`, `summaryColumns`, `detailColumns`, `summaryRows`, `detailRows`, and audit metadata.

## Verification

Passed:

- `npx tsx server/services/businessExportService.test.ts`
- `npx tsx server/routes/businessExportRoutes.test.ts`
- `npx tsx src/api/businessExportPermissionModel.test.ts`
- `npx tsc --noEmit`
- `npx prisma validate`
- `git diff --check`

## Concern

The new export service applies the same server-side scope rules as existing order/recovery list services, but it currently contains its own export-oriented filtering/projection path so it can retrieve all filtered rows up to the export cap. A future consolidation could extract shared filter predicates from those list services to prevent drift. Full `npm test` was not run due to the parent task's 10-minute delivery constraint; focused tests and type/schema checks passed.
