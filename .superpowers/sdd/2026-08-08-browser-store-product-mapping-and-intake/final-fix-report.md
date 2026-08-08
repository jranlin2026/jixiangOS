# Final release fix report

Status: AUTOMATED GATES PASSED; MANUAL RELEASE GATES REMAIN OPEN

Date: 2026-08-09

## Consolidated fixes

- Logout now treats only repository `code === 0` as success. Application codes `-1` and `500` preserve worker auth and mounted UI login state, permanently cancel the old completion attempt, and show `FeedbackDialog`.
- Every HTTP 401 is a terminal session-expiry outcome. The worker atomically clears token/operator and returns `SESSION_EXPIRED_LOCAL_LOGOUT`; LOGOUT converts it to a successful local logout for JSON, empty, or malformed bodies, while every other authenticated command drives the mounted panel to the logged-out state.
- Preview and intake require a unique nonblank platform product name, exact finite nonnegative amount with at most two decimals (including zero), and a valid zoned payment timestamp. Product/SKU IDs remain optional; a unique unmapped raw name remains valid and creates an unmatched lead. Adapter readiness and backend validation fail closed before catalog resolution, reservation, or lead creation.
- Completion clicks reread the complete latest Feige context, validate customer/order/status/shop/facts, and always request an authoritative preview before new intake. Intake is built only from that snapshot. If facts or preview differ, the panel installs the latest context/preview, clears confirmation, performs no intake/page/report write, and asks the operator to confirm and retry; the second click submits the latest facts.
- `BrowserLeadSync.attemptToken` now owns each PENDING attempt. Create/reclaim rotates the token; success/failure updates require `id + PENDING + attemptToken`; ownership loss rereads the winner, and stale owners cannot overwrite a newer PENDING or regress SUCCEEDED.
- Mapping writes now lock the shop row and read its current existence/active state inside the same transaction before conflict scans or writes. Missing/inactive-after-precheck cases stop without mapping reads or writes.

## Test-first evidence

- Logout RED: worker code `-1` cleared session auth and mounted UI logged out. GREEN: worker and mounted tests cover `-1`, `500`, `0`, HTTP 401 JSON/empty/malformed, generic authenticated-command 401, preserved non-401 UI/storage, cancellation, and feedback.
- Mandatory-facts RED: adapter readiness was absent and backend preview/intake accepted missing product facts. GREEN: adapter, catalog, and intake tests cover missing/blank/ambiguous/invalid product, amount, and time, exact cents, zero, unmatched names, and no resolver/reservation/create writes.
- Latest-snapshot RED: changed product/amount/time still completed with cached values. GREEN: workflow and mounted tests require zero create/page/report on first click, install latest facts/preview, and submit only latest values on the confirmed retry; loading-completion is covered.
- Lease RED: a new PENDING reservation returned no ownership token. GREEN: exact old-lease/new-reclaim races cover new success then old failure, old success against newer PENDING, and current-token success/failure.
- Shop-lock RED: precheck-success followed by missing/inactive locked state still wrote a mapping. GREEN: service and Prisma repository tests require `SELECT id, active ... FOR UPDATE`, then stop before conflict scan/write.

## Verification executed

- Focused backend: `npm exec -- tsx --test server/services/browserAgent/browserCatalogService.test.ts server/services/browserAgent/prismaBrowserCatalogRepository.test.ts server/services/browserAgent/browserLeadIntakeService.test.ts server/services/browserAgent/prismaBrowserLeadSyncRepository.test.ts server/services/browserAgent/prismaBrowserLeadSyncRepository.lease.test.ts server/routes/browserAgentRoutes.test.ts` -> 6/6 passed.
- Focused extension: worker, Feige adapter, panel reducer, completion workflow, mounted panel, and cancellation suites -> passed after same-request preview de-duplication.
- Full extension `npm test` -> all 13 scripts passed.
- Extension `npm run typecheck` -> passed.
- Extension `npm run build` -> passed; generated MV3 manifest has module service worker, side panel, required permissions, and Feige host permissions.
- `npm exec -- prisma format`, `npm exec -- prisma validate`, and `npm run db:generate` -> passed with Prisma 6.19.3.
- Node config `npm exec -- tsc --noEmit -p tsconfig.node.json` -> passed.
- Root `npm run build` (`tsc -b && vite build`) -> passed; existing chunk-size warnings only.
- Database preflight printed only `mysql / 127.0.0.1 / 3306 / jixiang_os`; authorized `npm run db:deploy` applied `20260809020000_browser_sync_attempt_token` successfully.
- `git diff --check` -> passed.
- Root `npm test` was intentionally not run because it includes unsafe database integration coverage outside this release wave.

## Migration

- `prisma/migrations/20260809020000_browser_sync_attempt_token/migration.sql`
  - adds nullable `attemptToken VARCHAR(64)` for migration-first deployment;
  - backfills existing rows with unique UUIDs;
  - is deployed to the authorized local `127.0.0.1/jixiang_os` database.

## Remaining release gates and concerns

- Manual: administrator product-mapping UI acceptance.
- Manual: authorized real Feige mapped-order and unmapped-order end-to-end acceptance.
- Non-blocking deferred evidence: an isolated live `_test` database concurrency run for mapping lock behavior. It must never target `jixiang_os`; unit coverage verifies the transaction/lock contract.
- No manual gate is claimed as passed. No root integration suite was run. Existing root build chunk-size warnings are unchanged and non-blocking for this scoped release.
