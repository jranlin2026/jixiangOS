# Academy Permission and Customer List Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hide and block the academy for roles without academy permissions, and make the customer list default to stable customer creation order.

**Architecture:** Reuse the existing `hasPermission` and `ProtectedRoute` permission model for both academy navigation and routing. Keep customer filtering and pagination unchanged while replacing the list query's mutable event-time order with immutable business-record creation time plus record ID.

**Tech Stack:** React, React Router, TypeScript, Node test runner via `tsx`, Prisma SQL templates, npm build.

## Global Constraints

- Local implementation only; do not deploy or modify production data or role configuration.
- Any valid academy sub-permission allows module entry; existing page/action checks remain responsible for narrower capabilities.
- Customer ordering is applied in SQL before pagination as `business_records.createdAt DESC, business_records.id DESC`.
- Do not add a customer sort selector in this change.
- Preserve existing filters, access scope, totals, page, page size, jump-to-page, and desktop/mobile result semantics.

---

### Task 1: Protect Academy Navigation and Route

**Files:**
- Modify: `src/api/academyStandaloneModuleStatic.test.ts`
- Modify: `src/layouts/Sidebar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `hasPermission(currentUser, permissionKey)` and `<ProtectedRoute permissionKeys={string[]} />`.
- Produces: identical academy permission-key arrays for menu visibility and route access.

- [ ] **Step 1: Write the failing permission regression assertions**

Add assertions requiring the academy route to be nested under `ProtectedRoute` with all six academy leaf permissions, and requiring the academy sidebar block not to contain `publicForAuthenticated: true`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx tsx src/api/academyStandaloneModuleStatic.test.ts`

Expected: FAIL because the route is currently public and the sidebar bypass is present.

- [ ] **Step 3: Apply the minimal academy permission fix**

Remove the `publicForAuthenticated` property from `NavItem`, remove it from the academy item and visibility predicate, and wrap `/academy/*` in `ProtectedRoute` using:

```ts
[
  PERMISSION_KEYS.ACADEMY_VIEW,
  PERMISSION_KEYS.ACADEMY_PLAN_MANAGE,
  PERMISSION_KEYS.ACADEMY_COURSE_MANAGE,
  PERMISSION_KEYS.ACADEMY_SESSION_MANAGE,
  PERMISSION_KEYS.ACADEMY_ENGAGEMENT_MANAGE,
  PERMISSION_KEYS.ACADEMY_REVIEW_MANAGE,
]
```

- [ ] **Step 4: Run academy permission tests and verify GREEN**

Run:

```bash
npx tsx src/api/academyStandaloneModuleStatic.test.ts
npx tsx src/api/academyPermissionModel.test.ts
```

Expected: both PASS.

### Task 2: Make Customer Default Order Stable and Creation-Based

**Files:**
- Modify: `server/services/customerListService.test.ts`
- Modify: `server/services/customerListService.ts`

**Interfaces:**
- Consumes: existing `customerListService.list(filters, currentUser)` and its SQL query.
- Produces: SQL order `createdAt DESC, id DESC` before `LIMIT/OFFSET`.

- [ ] **Step 1: Write the failing customer-order regression assertion**

After calling `listService.list`, assert that the captured list SQL contains:

```ts
/ORDER BY createdAt DESC, id DESC[\s\S]*LIMIT[\s\S]*OFFSET/
```

and does not contain `ORDER BY COALESCE(eventAt, createdAt)`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx tsx server/services/customerListService.test.ts`

Expected: FAIL because the list still orders by mutable `eventAt`.

- [ ] **Step 3: Apply the minimal SQL order change**

Change only the customer list query order clause to:

```sql
ORDER BY createdAt DESC, id DESC
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npx tsx server/services/customerListService.test.ts`

Expected: PASS, including existing filters, access scope and pagination assertions.

### Task 3: Verify and Commit the Local Fix

**Files:**
- Verify all modified files from Tasks 1 and 2.

**Interfaces:**
- Consumes: completed academy and customer-order changes.
- Produces: tested local commit with no production deployment.

- [ ] **Step 1: Run type checking**

Run: `npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 2: Run the complete safe test suite**

Run:

```bash
JIXIANG_SKIP_BUSINESS_RECYCLE_PURGE_INTEGRATION=YES \
JIXIANG_SKIP_POSITION_GOVERNANCE_INTEGRATION=YES \
JIXIANG_DEFAULT_ADMIN_PASSWORD='' \
JIXIANG_DEFAULT_USER_PASSWORD='' \
npm test
```

Expected: PASS; database-dependent tests without `DATABASE_URL` may report their existing explicit skip.

- [ ] **Step 3: Run a local production build**

Run:

```bash
NODE_ENV=production VITE_USE_BACKEND_API=true VITE_AI_API_BASE=/api npm run build
```

Expected: PASS.

- [ ] **Step 4: Review the diff and check formatting**

Run:

```bash
git diff --check
git diff -- src/App.tsx src/layouts/Sidebar.tsx src/api/academyStandaloneModuleStatic.test.ts server/services/customerListService.ts server/services/customerListService.test.ts
```

Expected: no whitespace errors and no scope outside the approved implementation.

- [ ] **Step 5: Commit the implementation**

```bash
git add src/App.tsx src/layouts/Sidebar.tsx src/api/academyStandaloneModuleStatic.test.ts server/services/customerListService.ts server/services/customerListService.test.ts
git commit -m "fix: enforce academy access and customer creation order"
```
