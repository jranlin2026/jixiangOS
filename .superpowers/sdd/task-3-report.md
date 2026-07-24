# Task 3 report: WeChat customer automation routes

## Implementation summary

- Added the two bearer-authenticated WeChat customer POST routes and mounted them at `/api/automation/wechat`.
- Added the required fixed sender configuration `JIXIANG_WECHAT_AUTOMATION_SENDER_ID`; partial/weak configuration fails closed.
- Added fresh, session-free automation actor resolution. Routes require active actor status plus current customer list/read and create/write permissions.
- Added durable AppStorage idempotency records. Keys, request IDs, and audit idempotency keys are SHA-256 server derivations of the fixed integration ID, verified sender, and signed nonce. Records retain only version, hashes, state, result customer ID, timestamps, attempts, and derived IDs.
- Added recovery by matching successful `create_customer_from_wechat` audit idempotency key. An unrelated duplicate cannot become a replay.

## Files changed

- `.env.example`, `server/config/runtime.test.ts`, `server/config/productionConfigCheck.test.ts`
- `server/index.ts`, `server/storageRoutesAuth.test.ts`
- `server/services/authService.ts`, `server/services/wechatAutomationSecurity.ts`, `server/services/wechatAutomationSecurity.test.ts`
- `server/services/wechatCustomerAutomationService.ts`, `server/services/wechatCustomerAutomationService.test.ts`
- `server/routes/wechatCustomerAutomationRoutes.ts`, `server/routes/wechatCustomerAutomationRoutes.test.ts`

## TDD evidence

- RED: `npx tsx server/services/wechatCustomerAutomationService.test.ts` failed with `actual 'created' / expected 'replayed'` for the sequential replay behavior before idempotency existed.
- GREEN: the same focused service test passes after adding the AppStorage reservation/replay implementation.
- RED: `npx tsx server/routes/wechatCustomerAutomationRoutes.test.ts` failed with `ERR_MODULE_NOT_FOUND` before the route adapter existed.
- GREEN: route test passes after implementing constant-time token/sender auth and fresh actor authorization.
- RED: `npx tsx server/services/wechatAutomationSecurity.test.ts` initially reported the sender-only partial configuration was accepted.
- GREEN: security test passes after extending the all-or-nothing runtime configuration.

## Verification

- `npx tsx server/services/wechatCustomerAutomationService.test.ts` — passed (sequential/concurrent replay, fingerprint conflict, malformed record, pre-write failure, finalize recovery, audit provenance, PII assertions).
- `npx tsx server/routes/wechatCustomerAutomationRoutes.test.ts` — passed (credential/sender, active/permission, and check behavior).
- `npx tsx server/services/wechatAutomationSecurity.test.ts` — passed.
- `npx tsx server/storageRoutesAuth.test.ts` — passed.
- `npx tsc -b --pretty false` — passed.
- `git diff --check` — passed.
- `npm test` — passed; the existing `customer batch live database verification skipped: DATABASE_URL is not set` environment-only skip remains.

## Self-review and risks

- No raw token, sender, precheck token, phone, WeChat ID, customer text, or audit free text is persisted by idempotency records.
- Create uses server-derived request/idempotency IDs and the existing `create_customer_from_wechat` audit operation.
- AppStorage primary-key reservation prevents double creation; followers await the winner/audit and fail closed rather than replaying an unrelated duplicate.
- No employee login/session is created or reused. No MCP/Task 4 work was added.

## Review hardening follow-up

### Implementation

- Replaced direct BusinessRecord replay reads with fresh exact-contact lookup using the current customer access context. Completed records and matching audit recovery now replay only when the same customer ID is still exact-contact matched and currently visible.
- Replaced the ~100 ms follower window with durable polling (5-second production default). A live winner can complete normally; an unresolved bounded timeout produces HTTP 503 generic unavailable semantics, never a false 409. Duplicate terminal state is persisted and followers fail closed immediately.
- Tightened version-1 record parsing: canonical ISO timestamps are mandatory, `createStartedAt` is required, and ordering must be `createdAt <= createStartedAt <= updatedAt`.
- Expanded PII/secret assertions across AppStorage key/value, the actual customer create execution object, and the real audit append metadata path. Legitimate audit `afterSnapshot` customer fields are intentionally outside the metadata assertion.
- Expanded the route contract test to the exact two-POST surface plus create forwarding, 201 success, generic 409, retryable 503, and invalid-body 400.
- `attempts` remains the durable customer-creation attempt count. Followers do not rewrite it because an unguarded AppStorage JSON update could overwrite a concurrently completed winner; concurrency remains fail-closed without a race-prone counter update.

### Follow-up RED evidence

- `npx tsx server/services/wechatCustomerAutomationService.test.ts` — RED: `Missing expected rejection` after the created customer's exact contact mapping was removed; old replay bypassed contact/visibility checks.
- `npx tsx server/services/wechatCustomerAutomationService.test.ts` — RED: slow 250 ms winner caused `WeChat customer create idempotency conflict` in the follower under the old 20x5 ms loop.
- `npx tsx server/services/wechatCustomerAutomationService.test.ts` — RED: malformed timestamp cases reported `Missing expected rejection`; old parsing accepted empty/non-canonical/missing/out-of-order timestamps.
- `npx tsx server/routes/wechatCustomerAutomationRoutes.test.ts` — RED: retryable pending error returned HTTP 500 instead of expected HTTP 503.
- `npx tsx server/services/wechatCustomerAutomationService.test.ts` — RED: a follower observing a newly failed duplicate timed out as `still in progress` instead of immediately returning idempotency conflict.
- `npx tsx server/services/wechatCustomerAutomationService.test.ts` — RED: a duplicate discovered after check left an in-progress reservation and retry timed out as `still in progress` instead of terminal conflict.

### Follow-up GREEN and verification evidence

- `npx tsx server/services/wechatCustomerAutomationService.test.ts` — GREEN: passed all replay/contact/visibility, slow concurrency, timeout, failed terminal, strict record, storage recovery, and sensitive metadata scenarios.
- `npx tsx server/routes/wechatCustomerAutomationRoutes.test.ts` — GREEN: passed complete two-route create/check contract and generic error mapping.
- `npx tsx server/services/wechatAutomationSecurity.test.ts` — GREEN: passed.
- `npx tsx server/services/authService.test.ts` — GREEN: passed.
- `npx tsx server/services/customerListService.test.ts` — GREEN: passed.
- `npx tsx server/storageRoutesAuth.test.ts` — GREEN: passed.
- `npx tsc -b --pretty false` — GREEN: passed after replacing the test-only unsupported `Array.at` use.
- `git diff --check` — GREEN: passed.
- `npm test` — GREEN: passed; only the existing `DATABASE_URL is not set` live integration skip remains.

### Follow-up self-review

- Replay provenance and current contact/visibility must both agree; neither can substitute for the other.
- All customer-create paths reserve before create and never allow followers to create. Slow or indeterminate state returns retryable unavailable, while known duplicate/malformed state is a conflict.
- AppStorage and correlation/audit metadata contain hashes, IDs, states, timestamps, counters, and fixed labels only. Raw sender/contact/token/signing key/precheck token/customer message values are excluded.
- No schema/migration, session reuse, permission widening, logging of sensitive diagnostics, or MCP work was introduced.
