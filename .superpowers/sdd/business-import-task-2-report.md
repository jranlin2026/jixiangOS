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

- The original Task 2 migration was schema-validated only. The final hardening migration described below was deployed to the local `jixiang_os` MySQL database and exercised by the live reservation integration test.

## Important review fixes

- Added an independent periodic heartbeat for every actively processed import job. It renews `leaseExpiresAt` through a production `updateMany` fenced by job ID, `leaseOwner`, `leaseEpoch`, and `running` status. The heartbeat remains active throughout a long row, stops before finalize, and is awaited during worker shutdown so a second worker cannot reclaim a healthy long row or long batch.
- Wrapped each existing record-level review command in its own `try/catch`. An unexpected exception becomes a fixed one-line 500 item result, later records continue, and mixed results remain retryable.
- Formal order creation now explicitly copies the complete import snapshot from its application: `importBatchId`, `importRowNumber`, `importedById`, `importedByName`, `importedAt`, `targetCreatorId`, `targetCreatorName`, and `importWarnings`.
- Added a central allowlist-based import error sanitizer. Unknown, Prisma-like, SQL-like, multiline, stack, and secret-bearing messages are reduced to a fixed safe message before persistence. Job/batch GET projections sanitize persisted row errors again, including legacy unsafe values.

### Review-fix TDD evidence

- RED: the long-row test allowed worker B to reclaim worker A's active lease after expiry; GREEN: repeated independent heartbeats keep the lease active, owner/epoch fencing rejects stale heartbeats, and `stop()` waits for the active row's fenced persistence.
- RED: a thrown order review command aborted the whole batch and exposed its exception; GREEN: it returns one sanitized failed result and the following record succeeds.
- RED: imported application approval produced a formal order with no import metadata; GREEN: all eight metadata fields, including warning messages, are copied and asserted.
- RED: Prisma/SQL sample errors were persisted and returned verbatim; GREEN: both worker persistence and GET projection return only `导入执行失败，请重试或联系管理员`.

### Review-fix verification

- `npm test`: passed repository-wide; database-dependent integration tests retained their documented skip without `DATABASE_URL`.
- Focused Task 2 execution, persistence, review, route, order approval, and recovery tests: passed.
- `npm run build`: passed.
- Prisma schema validation and `git diff --check`: passed.

## Final cross-task hardening

- Corrected imported order payment semantics: the official channel is stored in `officialPaymentChannel`, while `paymentMethod` is normalized to the legal downstream enum (`微信支付` / `支付宝` / `对公转账` / `银行转账`). Approval, commission matching, and delivery therefore consume the same representation as manually submitted orders.
- Made `batchId` mandatory in the confirm response contract and retained it in browser recovery storage without changing the existing polling flow.
- Replaced per-row rewrites of the job's complete JSON snapshot with indexed `BusinessImportJobItem` rows. Claim/retry, row state transitions, final counts, and job/batch reads now use independent row records. Existing job JSON is retained as an immutable compatibility snapshot and migration backfill source.
- Added job-level execution snapshot caching: importer permissions, visibility, customer matches, users, products, and configuration load once per claimed job and are released after processing. Active-number lookup reads the reservation table instead of scanning queued/running job JSON.
- Added row ownership to number reservations. A lease-fenced failed row releases exactly its own reservation only when no imported business record exists; successful or already-created rows retain protection. The unique reservation index continues to serialize competing confirmations.
- Corrected recovery import visibility to the `recoveryOrderApplications` scope domain for template, precheck, and execution directory loading.
- Tightened imported recovery replay: idempotent success requires the exact import batch/row/importer/target-creator metadata. Manual records and records from another batch remain conflicts.
- Added exact per-module request DTO allowlists. Unknown keys and order/recovery cross-module fields are rejected before precheck or confirm.

### Final hardening TDD evidence

- RED: imported order tests observed no `officialPaymentChannel`; GREEN: payment storage and an official-channel commission rule are asserted end to end through approval effects.
- RED: confirm adapter/API contracts omitted `batchId`; GREEN: service, adapter, route, client API, dialog callback, and persisted recovery identity all require and assert it.
- RED: cross-module and unknown row fields returned 200; GREEN: route tests assert 400 for each invalid DTO shape.
- RED: recovery import used the wrong scope domain; GREEN: the shared domain selector asserts `recoveryOrderApplications`.
- RED: manual recovery records could be accepted as imported replay; GREEN: manual and other-batch collisions both return 409, while exact imported metadata remains idempotent.
- RED: persistence still issued `SELECT *` against the 5,000-row job blob; GREEN: the 5,000-row test asserts bounded indexed item operations, zero job-row rewrites, task-level directory loading once, lease fencing, exact release, corrected retry, and success/created-record retention.

### Final hardening verification

- Focused affected tests: passed.
- `npm test`: 302 test files passed using the repository-default test environment. The live import integration is intentionally skipped in that invocation when `DATABASE_URL` is absent.
- Live MySQL: `20260725010000_business_import_job_items` deployed successfully to local `jixiang_os`; `businessImportReservation.integration.test.ts` passed with independent job-item and reservation-row assertions.
- `npx prisma validate` with the local development environment: passed.
- `npm run build`: passed.
- `git diff --check`: passed.

## Final standard re-review

- Long-running jobs now re-read the importer and effective permissions before every row. The expensive directory/customer/config index remains job-cached only while an indexed `MAX(updatedAt)` revision across users, roles, departments, configuration, and customers is unchanged. Employee/customer/config changes invalidate the snapshot before the next row; imported order/recovery writes do not invalidate it, so a stable 5,000-row job remains linear and loads the full directory once.
- Duplicate normalized `rowNumber` values are rejected both at the route DTO boundary and in service precheck/confirm before the `(jobId, rowNumber)` unique constraint.
- Historical job-item backfill retains the first valid row number and deterministically reassigns duplicate, missing, invalid, or sub-2 row numbers above the historical maximum. The rewritten payload and normalized payload receive the assigned value.
- Added an idempotent follow-up repair migration so environments that already applied the first job-item migration receive the same missing-row backfill and reservation cleanup safely.
- Migration cleanup releases reservations belonging to terminal failed rows only when no exact imported order-application/recovery business record exists. Successful rows and failed rows with an already-created business record retain number protection.
- Running/queued job reads no longer join or return all job items. Poll responses retain counts, omit full `rows`, and query at most 20 failed-row samples. Terminal job reads load complete rows on demand, preserving the existing completion page and failure-report behavior; batch reads remain summary-only.

### Re-review TDD evidence

- RED: after the first row, removing the importer's permission still allowed the second row to submit; GREEN: actor/permission loads occur for every row and the second row is rejected.
- RED: disabling the selected salesperson during a job still used the cached directory; GREEN: a changed indexed directory revision reloads facts before the next row, while 5,000 stable rows load the directory once.
- RED: duplicate row numbers reached precheck and route services; GREEN: both direct service and HTTP DTO tests return a 400 error.
- RED: the real MySQL migration failed with duplicate historical row numbers; GREEN: the same isolated real migration test backfills duplicate/null rows as deterministic unique values and validates payload row numbers.
- RED: a running 5,000-row job returned every item; GREEN: database-level `take: 20`, omitted full rows, and a bounded serialized response are asserted while terminal full rows remain available.
- The real migration test also proves terminal failed-row reservation cleanup, successful/created-row retention, and the five revision-query indexes.

### Re-review verification

- `npm test`: 303 test files passed in the repository-default environment.
- Focused execution, persistence, DTO/service, adapter, and route tests: passed.
- Real local MySQL migration/backfill/cleanup and reservation-concurrency integration tests: passed.
- Migrations `20260725020000_business_import_directory_revision` and `20260725030000_business_import_job_item_repair` deployed successfully to local `jixiang_os`.
- Prisma validation/client generation, production build, and `git diff --check`: passed.
