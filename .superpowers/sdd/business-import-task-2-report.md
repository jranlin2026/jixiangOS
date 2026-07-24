# Business import Task 2 report — execution and batch review

## Delivered

- Added a persistent leased business-import worker with `queued`/`running` stale-lease claiming, lease epochs, restart recovery of interrupted rows, per-row success/failure persistence, isolated failures, and terminal `succeeded`/`partial_failed`/`failed` batch and job states.
- Added a startup/shutdown hook beside the existing customer batch worker. A restarted process immediately polls and can reclaim expired `running` jobs.
- Added an execution adapter that reloads the importer, permissions, scoped users, products/configuration, and customer matches at execution time. Order rows require the same unique active in-scope customer; recovery rows bind one in-scope match or remain an explicitly marked `售后临时客户` without creating a customer profile.
- Imported order rows call the existing `orderApplicationService` through an import-specific idempotent submission method. They create one `OrderApplication` and one payment only; formal orders and downstream effects remain behind the existing approval command.
- Imported recovery rows call the existing `recoveryOrderCommandService` through an import-specific idempotent creation method. They create only a `待审核` recovery record with `未分账` settlement state.
- Added import metadata snapshots to `OrderApplication`, formal `Order`, and `RecoveryOrder`: batch, row, importer, import time, target creator, and warning messages.
- Preserved the actual importer as the order applicant and pending recovery editor/creator. Blank template creator defaults to the importer. On approval, the formal order or approved recovery record uses the revalidated target creator snapshot.
- Added authenticated `GET /api/business-imports/jobs/:id`, `GET /api/business-imports/batches/:id`, and `POST /api/business-imports/reviews` routes. Public module values remain exactly `orders` and `recovery_orders`.
- Added imported-record selection by explicit IDs or `importBatchId`. Batch review invokes the existing per-record approve/return/reject commands sequentially, so their live permission and data-scope checks remain authoritative. Results are mixed per record; failures do not roll back successes and remain available for retry.

## Persistence

- Extended `BusinessImportJob` with success count, lease owner/epoch/expiry, heartbeat, and safe error fields.
- Added migration `20260724030000_add_business_import_execution` and a `(status, leaseExpiresAt)` claim index.
- Row state remains in the existing durable job snapshot. A claimed `running` row is reset to `queued` only when a new lease epoch reclaims an expired job. A stale lease cannot mark or finalize work.
- Imported record identifiers are deterministic per job/row for order applications and per external order number for recovery records. A crash after business-record creation but before row acknowledgement therefore replays idempotently.

## TDD evidence

- RED: `businessImportExecution.test.ts` failed with `ERR_MODULE_NOT_FOUND` before the execution module existed.
- GREEN: execution tests cover workflow applicant vs target creator, one payment, absence of a formal/downstream creation interface, recovery temporary-vs-bound customer behavior, blank-creator fallback, stale-worker rejection, restart claim, and idempotent successful-row skipping.
- RED: `businessImportReviewService.test.ts` failed with `ERR_MODULE_NOT_FOUND` before the review module existed.
- GREEN: review tests cover mixed results, per-record failure isolation, permission/data-scope failures returned from existing commands, and retrying failed IDs.
- Persistence adapter tests cover production lease-epoch fencing, stale `running` job recovery, interrupted-row reset, success persistence, and terminal batch state.
- Existing order and recovery command tests now cover target creator attribution after approval while retaining the importer during the pending workflow.
- Route tests cover job/batch lookup, 404 behavior, review posting, and exact route-owned module contracts.

## Verification

- `npm test`: passed repository-wide; live database integration tests reported their documented skip because `DATABASE_URL` was not set.
- Focused service/route suite: passed (`businessImportExecution`, `businessImportPersistence`, `businessImportReviewService`, `businessImportRoutes`, `orderApplicationService`, `recoveryOrderCommandService`, Task 1 service/adapter, permission model).
- `DATABASE_URL='mysql://user:password@127.0.0.1:3306/jixiangos' npx prisma validate`: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## Notes

- No live migration deployment was performed in this task; the migration and generated Prisma client were schema-validated and compile-verified.
