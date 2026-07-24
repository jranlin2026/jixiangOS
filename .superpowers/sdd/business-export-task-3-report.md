# Business export Task 3 report - Page integrations

## Implemented

- Added `导出订单` to the order list, gated by `ORDER_EXPORT`.
- Added `导出订单分账` and `导出售后挽回分账` to their Finance tabs, gated by the independent export permissions.
- Wired Finance header actions to embedded settlement pages with triggers, so each child owns live filters, totals, view configuration and dialog state.
- Requests preserve current search/status/person/role/date/sort filters, remove pagination, and send current visible summary columns in exact order. All-fields mode omits `columnIds`.
- Added safe `ApiResponse` unwrapping and a focused integration contract test.

## Verification

- `npx tsx src/api/businessExportPageIntegration.test.ts`
- `npx tsx src/api/actionPermissionGates.test.ts`
- `npx tsx src/api/commissionOrderSettlementView.test.ts`
- `npx tsx src/api/recoveryOrderExperienceStatic.test.ts`
- `npx tsc --noEmit`
- `npm run build`
- `git diff --check`

All passed. Vite only reports its existing chunk-size advisory.

## Shared dirty-file note

`src/pages/Finance/RecoverySettlement.tsx` already contained preserved uncommitted layout changes before this task. The export integration necessarily shares that file, so its complete content was preserved. The unrelated pre-existing `src/api/recoveryOrderExperienceStatic.test.ts` and `.superpowers/sdd/task-2-report.md` changes are not in this task commit.
