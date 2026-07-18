# Task 7 report — customer batch selection, precheck, and job creation

## Outcome

Implemented the Task 7 foundation for customer batch mutations. The system can
freeze a current manageable selection, issue a short-lived opaque confirmation
token, revalidate current authority and data inside one transaction, and create
an idempotent queued job with item rows. It deliberately does not run jobs yet;
the lease worker and actual customer mutation execution remain Task 8.

## Main implementation

- Added shared batch request/result/guard types in `src/types/customerBatch.ts`.
- Added the `CUSTOMER_BATCH_MANAGE`, `CUSTOMER_BATCH_CANCEL`, and
  `CUSTOMER_BATCH_AUDIT_READ` leaves to the authoritative customer access
  context and permission test coverage.
- Added `customerBatchSelectionService`:
  - freezes sorted manageable IDs and top-level `BusinessRecord.updatedAt`
    versions;
  - uses the exported shared `buildCustomerWhere` predicate plus a resolved
    owner-ID scope predicate;
  - performs one bounded `ORDER BY recordId LIMIT 10001` query, never a full
    customer scan or page-through;
  - returns generic blocked results only for explicit IDs outside the current
    manageable scope; filter snapshots do not disclose them;
  - uses only lightweight tag-group/tag catalog reads and validates tag filters
    before the bounded query.
- Added `customerBatchPrecheckService`:
  - stable UTF-8 canonical JSON SHA-256 with recursively sorted object keys;
  - 10-minute opaque random tokens, persisted only as SHA-256 hashes;
  - selected-ID and persisted command/reason hash binding;
  - a typed result-consumer primitive whose single transaction owns precheck
    locking, revalidation, job creation, and consumed-result pointer update;
  - bounded fresh-transaction retry for duplicate-key winner adoption, Prisma
    `P2034`, and MySQL deadlock/serialization conflict signals;
  - raw-MySQL JSON string decoding for precheck manifests, frozen IDs, and
    version manifests.
- Added `customerBatchService`:
  - strict normalized operations and filter snapshots;
  - confirmation order: precheck lock, soft-delete association guard (when
    relevant), current directory/scope lock, sorted/chunked customer locks,
    then lifecycle/tag guard locks;
  - current permission, owner/scope, top-level version, lifecycle configuration,
    tag configuration, and action-specific revalidation before any job/item
    insert;
  - raw-MySQL role permission/data-scope JSON normalization before rebuilding
    locked current access context;
  - transfer target checks for active/employed, receive-capable, currently
    manageable staff; lifecycle and tag operations validate current policy;
  - job and item creation in one transaction, with item insertion chunked at
    500 rows;
  - current authority re-check on replay/existing-result adoption, so a revoked
    action leaf cannot be bypassed by a precheck token;
  - creator cancellation without a separate cancel leaf; non-creators require
    the cancel leaf and current manageability of every affected customer;
  - creators can always read their own ID-free task summaries; audit readers
    can see an ID-free mixed-scope summary when at least one target remains
    currently readable, while item target keys are filtered to that scope.
- Added strict `/api/customer-batch-jobs` routes and `customerBatchApi`:
  - browser precheck accepts exactly `operation`, `selection`, `input`, and
    `reason`, then injects `customer_mutation` server-side;
  - confirmation accepts exactly `precheckToken` and `idempotencyKey`;
  - route parameters and cancel bodies are strict;
  - routes reload server-side customer access context for every request;
  - cancel is authentication-gated so job creators can reach the dynamic
    service authorization; non-creator authorization remains server-side.

## TDD evidence

The focused selection/precheck/service tests were first run before their
production modules existed and failed with missing-module failures. The
implementation was then added until the same tests passed.

The final focused regression coverage includes:

- canonical hash stability and array-order sensitivity;
- 10,001 selection rejection; department-only/manage-vs-read selection;
- token expiry, actor/handler/hash mismatch, persisted JSON/tamper detection,
  wrong result type, same-key/different-fingerprint rejection;
- fresh-transaction P2002 winner adoption and P2034 retry;
- version, config, permission, guard-manifest, owner/scope, and transfer-target
  drift before job insertion;
- empty-selection rejection without a dead token;
- replay after action-leaf revocation;
- creator/non-creator cancellation, creator summary retention after transfer,
  mixed-scope audit summary/item filtering, strict route payloads,
  invalid IDs, empty cancel body, and dynamic 403 authorization behavior.

## Verification

All commands used the bundled Node runtime.

```sh
pnpm exec tsx server/services/customerBatchSelectionService.test.ts
pnpm exec tsx server/services/customerBatchPrecheckService.test.ts
pnpm exec tsx server/services/customerBatchService.test.ts
pnpm exec tsx server/routes/customerBatchRoutes.test.ts
pnpm exec tsx src/api/customerBatchApi.test.ts
pnpm exec tsc --noEmit --pretty false
pnpm test
pnpm run build
pnpm run db:generate
DATABASE_URL='mysql://validation:validation@127.0.0.1:3306/jixiang_validation' pnpm exec prisma validate
git diff --check
```

Results:

- Focused tests: passed.
- TypeScript typecheck: passed.
- Full suite: passed, 207 test files.
- Production build: passed.
- Prisma client generation and schema validation: passed.
- Diff whitespace validation: passed.

## Deliberate boundary

No worker, lease, heartbeat, item execution, customer mutation execution,
partial-failure settlement, retry-job UI, or deployment was performed here.
Those runtime behaviors belong to Task 8 and later UI work.
