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
