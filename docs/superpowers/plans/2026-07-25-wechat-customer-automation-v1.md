# WeChat Customer Automation V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one allowlisted WeChat direct-message account create a single validated customer in JixiangOS through OpenClaw and two narrowly-scoped MCP tools.

**Architecture:** A dedicated OpenClaw MCP server converts structured tool calls into two authenticated JixiangOS automation endpoints. JixiangOS owns normalization, configuration lookup, duplicate detection, signed ten-minute precheck tokens, idempotent creation, permission checks, and audit records; OpenClaw only parses conversation text and follows the returned state machine.

**Tech Stack:** TypeScript, Express, Prisma/MySQL, Node crypto, Model Context Protocol stdio transport, OpenClaw Weixin channel.

## Global Constraints

- Only direct text and quoted-text customer creation is in V1; no image, voice, contact-card, batch, delete, overwrite, stage-change, or outbound-message automation.
- The two public tools are exactly `jxos_customer_check` and `jxos_customer_create`.
- Customer name, one of phone/WeChat, and lead source are required.
- Resource ownership defaults to `公司资源`; owner defaults to the dedicated automation actor.
- A ready precheck auto-creates without a second user confirmation; missing data asks one question; duplicate data never creates.
- Existing customer permissions, data scope, contact identity locks, tag policy, and customer creation transaction remain authoritative.
- No new database table or Prisma migration. Idempotency metadata in `AppStorage` contains no raw contact value, raw WeChat message, or secret.
- Production integration configuration fails closed. Secrets never appear in logs, audit free text, tool output, or repository files.
- The existing business-export checkout and uncommitted user files must not be changed.

---

### Task 1: Automation configuration, authentication, and signed precheck tokens

**Files:**
- Create: `server/services/wechatAutomationSecurity.ts`
- Create: `server/services/wechatAutomationSecurity.test.ts`
- Modify: `server/config/runtime.ts`
- Modify: `server/config/runtime.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces `WechatAutomationConfig`, `readWechatAutomationConfig(env)`, `validateWechatAutomationRuntimeConfig(env)`, `authenticateWechatAutomationToken(provided, configured)`, `issueWechatCustomerPrecheckToken(payload, signingKey, now?)`, and `verifyWechatCustomerPrecheckToken(token, signingKey, now?)`.
- Token payload contains only `version`, `actorId`, `senderIdHash`, `inputHash`, `nonce`, `issuedAt`, and `expiresAt`; TTL is exactly ten minutes.

- [ ] Write a failing public-interface test proving all three integration variables must be configured together, secrets require at least 32 characters, token comparison rejects wrong length/value, and production validation fails closed.
- [ ] Run `npx tsx server/services/wechatAutomationSecurity.test.ts` and confirm RED.
- [ ] Implement configuration parsing and constant-time bearer-token comparison with Node `timingSafeEqual`; add production runtime validation and documented `.env.example` entries.
- [ ] Re-run the focused test and `npx tsx server/config/runtime.test.ts`; confirm GREEN.
- [ ] Add a failing test for ten-minute signed tokens, expiry, signature tampering, actor/sender/input binding, and absence of contact fields in decoded payload.
- [ ] Implement HMAC-SHA256 issue/verify functions with base64url headerless payload plus signature and strict schema validation.
- [ ] Re-run both focused tests and commit `feat: add WeChat automation security`.

### Task 2: Customer check/create deep module

**Files:**
- Create: `server/services/wechatCustomerAutomationService.ts`
- Create: `server/services/wechatCustomerAutomationService.test.ts`
- Modify: `server/services/contactIdentityService.ts`
- Modify: `server/services/contactIdentityService.test.ts`
- Modify: `server/services/customerListService.ts`
- Modify: `server/db/customerAuditProjection.ts`

**Interfaces:**

```ts
type WechatCustomerInput = {
  name?: string; company?: string; phone?: string; wechat?: string;
  leadSource?: string; sourceName?: string; sourceType?: string;
  ownerAccount?: string; ownerName?: string;
  leadContributorAccount?: string; industry?: string; city?: string;
  tagNames?: string[]; remark?: string;
};

type WechatCustomerCheckResult =
  | { status: 'needs_input'; field: string; message: string; candidates?: Array<{ account: string; name: string }> }
  | { status: 'duplicate'; message: string; customer?: { id: string; name: string; company: string; owner: string } }
  | { status: 'ready'; normalized: WechatNormalizedCustomer; precheckToken: string; expiresAt: string };

type WechatCustomerCreateResult =
  | { status: 'created' | 'replayed'; customer: WechatCustomerSummary; detailPath: string }
  | { status: 'duplicate'; message: string; customer?: WechatCustomerSummary };
```

- [ ] Add a failing contact-identity test for a non-locking, permission-safe exact duplicate lookup by normalized phone/WeChat.
- [ ] Implement the read helper by reusing current HMAC normalization and visibility-safe conflict projection; do not expose raw identity values.
- [ ] Run `npx tsx server/services/contactIdentityService.test.ts`; confirm GREEN.
- [ ] Add one failing automation-module test for required fields, phone normalization, default company resource/default actor owner, exact active lead-source resolution, and a ready signed precheck.
- [ ] Implement `createWechatCustomerAutomationService(deps)` behind only `check(input, context)` and `create(input, token, context)`; keep configuration/user/tag lookup internal.
- [ ] Add and satisfy tests for exact owner account, unique owner name, ambiguous owner candidates, inactive/out-of-scope owner, exact tag names, personal-resource contributor, and duplicate contact handling.
- [ ] Add and satisfy tests for expired/tampered/swapped tokens, execution-time permission/config changes, and create-time contact races.
- [ ] Extend customer creation execution context with `auditOperation` and `auditReason`; use `create_customer_from_wechat` without changing manual-create audit behavior.
- [ ] Commit `feat: add WeChat customer automation module` after focused tests pass.

### Task 3: Durable idempotency and authenticated HTTP routes

**Files:**
- Create: `server/routes/wechatCustomerAutomationRoutes.ts`
- Create: `server/routes/wechatCustomerAutomationRoutes.test.ts`
- Modify: `server/services/wechatCustomerAutomationService.ts`
- Modify: `server/services/wechatCustomerAutomationService.test.ts`
- Modify: `server/services/authService.ts`
- Modify: `server/index.ts`
- Modify: `server/storageRoutesAuth.test.ts`

**Interfaces:**

```text
POST /api/automation/wechat/customers/check
Authorization: Bearer <JIXIANG_WECHAT_AUTOMATION_TOKEN>
X-JXOS-WECHAT-SENDER: <fixed sender id>
body: { customer: WechatCustomerInput }

POST /api/automation/wechat/customers/create
Authorization: Bearer <same token>
X-JXOS-WECHAT-SENDER: <same sender id>
body: { customer: WechatCustomerInput, precheckToken: string }
```

- [ ] Write a failing route test for missing/wrong credentials, missing/mismatched sender, inactive actor, insufficient permission, and successful check.
- [ ] Add a narrow auth reader that resolves the configured active actor with current role permissions; compose middleware and routes without creating an employee session.
- [ ] Re-run the route test and existing auth/storage-route tests; confirm GREEN.
- [ ] Write a failing service test for sequential replay, concurrent replay, same key/different fingerprint, and recovery after create succeeded before request completion was persisted.
- [ ] Implement an `AppStorage` request record keyed by a SHA-256 integration/sender/nonce digest. Persist only version, input hash, state, result customer ID/status, timestamps, and attempt metadata; reconcile uncertain states through the customer audit idempotency key and existing contact uniqueness.
- [ ] Ensure create calls the existing customer transaction with server-derived request/idempotency IDs and returns `created`, `replayed`, or `duplicate` deterministically.
- [ ] Register both routes in `server/index.ts`, preserve JSON response conventions, add route-auth static coverage, and commit `feat: expose WeChat customer automation routes`.

### Task 4: Cross-platform MCP adapter

**Files:**
- Create: `integrations/openclaw-jixiangos/package.json`
- Create: `integrations/openclaw-jixiangos/src/index.ts`
- Create: `integrations/openclaw-jixiangos/src/client.ts`
- Create: `integrations/openclaw-jixiangos/src/client.test.ts`
- Create: `integrations/openclaw-jixiangos/README.md`
- Modify: root `package.json` and `package-lock.json`

**Interfaces:**
- Environment: `JIXIANG_OS_API_BASE`, `JIXIANG_OS_AUTOMATION_TOKEN`, `JIXIANG_OS_WECHAT_SENDER_ID`, `JIXIANG_OS_CUSTOMER_DETAIL_URL_TEMPLATE`, `JIXIANG_OS_REQUEST_TIMEOUT_MS`.
- `jxos_customer_check` accepts the structured customer fields from Task 2.
- `jxos_customer_create` accepts the same fields plus `precheckToken` returned by check.

- [ ] Add the MCP SDK dependency intentionally and write a failing client test for request headers/body, success states, 401, 409, 500, timeout, invalid JSON, and redacted diagnostics.
- [ ] Implement a small HTTP adapter that requires HTTPS except loopback development, applies timeout/abort, never logs request bodies or secrets, and returns Chinese tool-safe errors ending with `未写入系统` on uncertain create failures.
- [ ] Run the focused client test and confirm GREEN.
- [ ] Write a failing server-surface test proving exactly two tool names are registered and their schemas do not expose shell/file/database capabilities.
- [ ] Implement the stdio MCP server and tool state machine; tool output is concise JSON/text suitable for DeepSeek.
- [ ] Add root scripts for MCP test/start, run focused tests and TypeScript build, then commit `feat: add JixiangOS OpenClaw MCP tools`.

### Task 5: OpenClaw agent configuration and deployment/QA runbook

**Files:**
- Create: `integrations/openclaw-jixiangos/openclaw/AGENTS.md`
- Create: `integrations/openclaw-jixiangos/openclaw/TOOLS.md`
- Create: `integrations/openclaw-jixiangos/openclaw/openclaw.example.json`
- Create: `scripts/verify-wechat-customer-automation.ts`
- Modify: `docs/cloud-operations-runbook.md`

**Interfaces:**
- Agent name is `jixiangos-crm`.
- Weixin DM scope is `per-account-channel-peer`.
- Agent tool allowlist contains only `jxos_customer_check` and `jxos_customer_create`.

- [ ] Write a failing static test or verifier assertion for the agent name, DM scope, two-tool allowlist, no-guess/one-question/check-before-create/duplicate-stop/ready-auto-create/uncertain-failure wording.
- [ ] Add the agent prompt, tool policy, redacted Windows configuration template, MCP install/probe/reload commands, token generation/rotation instructions, dedicated-role permissions, and rollback procedure.
- [ ] Implement a non-destructive verification script that checks configuration and exercises check/create/replay only against loopback plus an explicitly named `_qa` or `_test` database environment.
- [ ] Run the verifier in static/config-only mode and commit `docs: add WeChat automation deployment runbook`.

### Task 6: Whole-feature verification and release evidence

**Files:**
- Create: `docs/releases/2026-07-wechat-customer-automation-v1-verification.md`
- Modify only files required to fix failures found by verification.

- [ ] Run all focused automation, route, contact identity, customer creation, MCP, runtime-config, and static agent tests.
- [ ] Run `npm run build`, `npm test`, `npx prisma validate`, and the repository production-config check with complete safe test values; record exact results.
- [ ] Run the QA verifier against an isolated database when credentials are available; otherwise record it as externally pending and do not claim live-chain completion.
- [ ] Audit the branch for raw secrets/contact fixtures, unrestricted tools, unexpected migrations, unrelated files, and accidental lockfile noise.
- [ ] Write release evidence separating automated proof, QA proof, Windows/OpenClaw pending actions, and production blockers.
- [ ] Commit `test: verify WeChat customer automation v1`.

