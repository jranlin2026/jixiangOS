# Public Pool Claim Permission Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an independent public-pool claim permission and hide customer creation on the public-pool page.

**Architecture:** Add one permission key used consistently by role configuration, default built-in role migration, backend route/service authorization, and frontend permission gates. Keep customer assignment/release on the existing assignment permission and make the public-pool create-button rule depend on page scope rather than permissions.

**Tech Stack:** TypeScript, React, Express, Prisma, existing permission utilities and script-based test runner.

## Global Constraints

- Claiming always assigns the customer to the authenticated user.
- Claim permission must not grant assignment to another employee.
- Built-in sales consultant receives the new permission; custom roles do not receive implicit access.
- The public-pool page never renders the create-customer button.

---

### Task 1: Permission model and built-in role migration

**Files:**
- Modify: `src/shared/utils/permissions.ts`
- Modify: `src/pages/Settings/RolePermission.tsx`
- Modify: `server/services/roleMigrationService.ts`
- Test: `src/api/permissionModel.test.ts`
- Test: `server/services/roleMigrationService.test.ts`

**Interfaces:**
- Produces: `PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM` with value `客户/领取公海客户`.
- Produces: sales consultant default actions `['read', 'write']` for the new key.

- [ ] **Step 1: Add failing permission and migration assertions**

Assert that the key exists, is displayed as “领取公海客户”, sales consultant receives read/write, and a custom role remains unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec tsx src/api/permissionModel.test.ts && pnpm exec tsx server/services/roleMigrationService.test.ts`

Expected: failure because the new permission key/default is absent.

- [ ] **Step 3: Implement the permission key and default migration**

Add the key to the customer permission group and built-in sales role defaults. Do not add it to custom-role fallback expansion.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 command and expect exit 0.

### Task 2: Backend claim authorization

**Files:**
- Modify: `server/index.ts`
- Modify: `server/services/customerCommandService.ts`
- Test: `server/storageRoutesAuth.test.ts`
- Test: `server/services/customerCommandService.test.ts`

**Interfaces:**
- Consumes: `PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM`.
- Produces: `POST /api/customers/:id/claim` guarded by claim/write at route and service layers.

- [ ] **Step 1: Add failing route and service tests**

Cover a sales user with claim/write but without assign/write successfully claiming; a user with assign/write but no claim/write receives 403; assignment remains protected by assign/write.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec tsx server/services/customerCommandService.test.ts && pnpm exec tsx server/storageRoutesAuth.test.ts`

Expected: claim-only user is rejected or route still references assignment permission.

- [ ] **Step 3: Implement independent middleware and service check**

Create `requireCustomerPublicPoolClaimAccess` and use it only on the claim route. Change `claimFromPublicPool` to check the new permission; leave release and assign checks unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 2 command and expect exit 0.

### Task 3: Frontend gates and public-pool action layout

**Files:**
- Modify: `src/pages/Customers/index.tsx`
- Modify: `src/pages/Customers/CustomerDetail.tsx`
- Test: `src/api/uiPolishStatic.test.ts`
- Test: `src/api/reportedWorkflowRegressionStatic.test.ts`

**Interfaces:**
- Consumes: `PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM`.
- Produces: claim buttons gated by claim/write; create button rendered only when `!isPublicPoolScope`.

- [ ] **Step 1: Add failing static behavior assertions**

Assert claim buttons use the new key and the header create button is wrapped by `!isPublicPoolScope`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec tsx src/api/uiPolishStatic.test.ts && pnpm exec tsx src/api/reportedWorkflowRegressionStatic.test.ts`

Expected: existing claim gates still reference `CUSTOMER_ASSIGN`, and create is unconditional.

- [ ] **Step 3: Implement the two frontend rules**

Replace claim gates in list/detail and conditionally omit create on public pool. Do not change the normal customer list action.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Task 3 command and expect exit 0.

### Task 4: Full verification

**Files:**
- Modify: `BUG_FIX_LOG.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: verified release evidence for the permission change.

- [ ] **Step 1: Run type checking**

Run: `pnpm exec tsc -b --pretty false`

- [ ] **Step 2: Run all tests**

Run: `pnpm test`

- [ ] **Step 3: Run production build**

Run: `pnpm run build`

- [ ] **Step 4: Restart the local API and run a real role/API smoke test**

Verify a temporary sales consultant can claim but cannot assign another owner; clean all temporary records and sessions.

- [ ] **Step 5: Update logs with actual evidence**

Record only commands and behaviors that passed.
