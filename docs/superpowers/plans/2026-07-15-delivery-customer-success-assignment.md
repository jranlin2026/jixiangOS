# Delivery Customer Success Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent single-pool customer-success round-robin allocator for every new delivery and stop manual assignment from opening the delivery detail dialog.

**Architecture:** Keep selection logic in a pure policy module, persistence and cursor locking in a focused assignment service, and call that service from both delivery-creation paths inside their existing transactions. Expose configuration through authenticated settings endpoints and a new System Settings page; manual reassignment refreshes list state without selecting a detail record.

**Tech Stack:** TypeScript, React 18, Material UI, Express, Prisma/MySQL, Node tests via `tsx`.

## Global Constraints

- All products use one shared participant pool.
- Allocation is strict configured-order round robin; do not use product routing or workload scoring.
- Persist the cursor across server restarts.
- Skip paused, inactive, left, or missing users.
- Manual reassignment must not advance the automatic cursor.
- No eligible participant must degrade to `待分配` without blocking delivery creation.
- Existing deliveries are not automatically reassigned.
- Do not deploy or mutate production data as part of this plan.

---

### Task 1: Assignment Types and Pure Round-Robin Policy

**Files:**
- Create: `src/types/deliveryAssignment.ts`
- Create: `server/services/deliveryAssignmentPolicy.ts`
- Create: `server/services/deliveryAssignmentPolicy.test.ts`
- Modify: `src/types/delivery.ts`

**Interfaces:**
- Produces: `DeliveryAssignmentConfig`, `DeliveryAssignmentParticipant`, `DeliveryAssignmentParticipantView`, `DeliveryAssignmentUser`, `selectNextDeliveryAssignee(config, users)`.
- Produces: delivery audit fields `assignmentMode`, `assignedAt`, and `assignedBy`.

- [ ] **Step 1: Write the failing policy tests**

```ts
assert.equal(selectNextDeliveryAssignee(config(['a', 'b', 'c']), users())?.user.id, 'a');
assert.equal(selectNextDeliveryAssignee(config(['a', 'b', 'c'], 'a'), users())?.user.id, 'b');
assert.equal(selectNextDeliveryAssignee(config(['a', 'b', 'c'], 'c'), users())?.user.id, 'a');
assert.equal(selectNextDeliveryAssignee(config(['a', 'b', 'c'], 'a', ['b']), users())?.user.id, 'c');
assert.equal(selectNextDeliveryAssignee(config(['a']), [{ ...user('a'), isActive: false }]), null);
```

- [ ] **Step 2: Run the test and verify the module is missing**

Run: `node node_modules/tsx/dist/cli.mjs server/services/deliveryAssignmentPolicy.test.ts`

Expected: FAIL because `deliveryAssignmentPolicy.ts` does not exist.

- [ ] **Step 3: Add exact shared types**

```ts
export interface DeliveryAssignmentParticipant {
  userId: string;
  paused: boolean;
}

export interface DeliveryAssignmentConfig {
  enabled: boolean;
  participants: DeliveryAssignmentParticipant[];
  lastAssignedUserId?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface DeliveryAssignmentUser {
  id: string;
  name: string;
  isActive: boolean;
  employmentStatus?: string;
}

export interface DeliveryAssignmentParticipantView extends DeliveryAssignmentParticipant {
  userName: string;
  eligible: boolean;
  status: 'active' | 'paused' | 'inactive' | 'left' | 'missing';
}
```

Extend `Delivery` with:

```ts
assignmentMode?: 'auto' | 'manual';
assignedAt?: Timestamp;
assignedBy?: string;
```

- [ ] **Step 4: Implement deterministic cyclic selection**

```ts
export function selectNextDeliveryAssignee(
  config: DeliveryAssignmentConfig,
  users: DeliveryAssignmentUser[],
): { user: DeliveryAssignmentUser; participantIndex: number } | null {
  if (!config.enabled || !config.participants.length) return null;
  const usersById = new Map(users.map((user) => [user.id, user]));
  const lastIndex = config.lastAssignedUserId
    ? config.participants.findIndex((item) => item.userId === config.lastAssignedUserId)
    : -1;
  for (let offset = 1; offset <= config.participants.length; offset += 1) {
    const participantIndex = (lastIndex + offset) % config.participants.length;
    const participant = config.participants[participantIndex];
    const user = usersById.get(participant.userId);
    if (!participant.paused && user?.isActive && (user.employmentStatus || 'active') === 'active') {
      return { user, participantIndex };
    }
  }
  return null;
}
```

- [ ] **Step 5: Run the policy tests**

Run: `node node_modules/tsx/dist/cli.mjs server/services/deliveryAssignmentPolicy.test.ts`

Expected: PASS for first, next, wraparound, paused, and inactive cases.

- [ ] **Step 6: Commit the isolated policy**

```powershell
git add src/types/deliveryAssignment.ts src/types/delivery.ts server/services/deliveryAssignmentPolicy.ts server/services/deliveryAssignmentPolicy.test.ts
git commit -m "feat: add delivery assignment rotation policy"
```

### Task 2: Persistent Configuration, Cursor Locking, and Settings API

**Files:**
- Create: `server/services/deliveryAssignmentService.ts`
- Create: `server/services/deliveryAssignmentService.test.ts`
- Modify: `src/shared/utils/constants.ts`
- Modify: `src/shared/utils/permissions.ts`
- Modify: `server/index.ts`
- Modify: `server/storageRoutesAuth.test.ts`

**Interfaces:**
- Consumes: `selectNextDeliveryAssignee` from Task 1.
- Produces: `createDeliveryAssignmentService(prisma)` with `getConfig()` returning resolved participant status, `saveConfig(input, actor)`, and `assignNext(transaction, assignedAt)`.
- Produces: `GET` and `PUT /api/settings/delivery-assignment`.

- [ ] **Step 1: Write failing service tests**

```ts
assert.deepEqual((await service.getConfig()).data, { enabled: false, participants: [] });
assert.equal((await service.saveConfig({ enabled: true, participants: [{ userId: 'a', paused: false }] }, admin)).code, 0);
assert.equal((await service.assignNext(transaction, now))?.ownerId, 'a');
assert.equal((await service.assignNext(transaction, now))?.ownerId, 'b');
assert.equal(savedConfig.lastAssignedUserId, 'b');
assert.equal(await service.assignNext(noEligibleTransaction, now), null);
```

Also assert duplicate participant IDs return code `400`; inactive users remain readable but are skipped.

- [ ] **Step 2: Run the service test red**

Run: `node node_modules/tsx/dist/cli.mjs server/services/deliveryAssignmentService.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Add storage and permission constants**

```ts
DELIVERY_ASSIGNMENT_CONFIG: `${STORAGE_PREFIX}delivery_assignment_config`,
SETTINGS_DELIVERY_ASSIGNMENT: '系统设置/交付设置/客户成功分配',
```

Include the permission in super-admin and customer-success supervisor defaults without broadening ordinary employee permissions.

- [ ] **Step 4: Implement persistence and cursor advance**

`assignNext` upserts a default app-storage row, locks it using `SELECT ... FOR UPDATE`, loads users from `transaction.user`, calls the pure selector, updates `lastAssignedUserId`, and returns:

```ts
{
  ownerId: selected.user.id,
  owner: selected.user.name,
  assignmentMode: 'auto' as const,
  assignedAt,
  assignedBy: 'system',
}
```

`getConfig` joins every configured participant to the employee directory and returns `DeliveryAssignmentParticipantView`, including inactive, left, and missing entries. `saveConfig` rejects duplicates, preserves the cursor only while its user remains in the list, and stamps `updatedAt` and `updatedBy`.

- [ ] **Step 5: Add authenticated settings routes**

```ts
app.get('/api/settings/delivery-assignment', requireDeliveryAssignmentReadAccess, async (_req, res) => {
  res.json(await deliveryAssignmentService.getConfig());
});

app.put('/api/settings/delivery-assignment', requireDeliveryAssignmentWriteAccess, async (req: AuthenticatedRequest, res) => {
  const result = await deliveryAssignmentService.saveConfig(req.body || {}, req.authUser!);
  res.status(result.code === 0 ? 200 : result.code || 400).json(result);
});
```

- [ ] **Step 6: Verify service and route tests**

Run: `node node_modules/tsx/dist/cli.mjs server/services/deliveryAssignmentService.test.ts; node node_modules/tsx/dist/cli.mjs server/storageRoutesAuth.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit configuration backend**

```powershell
git add server/services/deliveryAssignmentService.ts server/services/deliveryAssignmentService.test.ts src/shared/utils/constants.ts src/shared/utils/permissions.ts server/index.ts server/storageRoutesAuth.test.ts
git commit -m "feat: persist delivery assignment configuration"
```

### Task 3: Apply Rotation to Every Delivery Creation Path

**Files:**
- Modify: `server/services/orderApprovalEffectsService.ts`
- Modify: `server/services/orderApprovalEffectsService.test.ts`
- Modify: `server/services/deliveryCommandService.ts`
- Modify: `server/services/deliveryCommandService.test.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Consumes: `deliveryAssignmentService.assignNext(transaction, assignedAt)` from Task 2.
- Produces: auto-assigned deliveries for approval creation and manual backfill creation.

- [ ] **Step 1: Add failing creation-path tests**

Configure A/B, approve two orders, and assert owners A then B with `assignmentMode: 'auto'`, timestamp, and `assignedBy: 'system'`. Start manual creation after B and assert owner A. Add a no-eligible case that still creates a delivery owned by `待分配`.

- [ ] **Step 2: Run creation tests red**

Run: `node node_modules/tsx/dist/cli.mjs server/services/orderApprovalEffectsService.test.ts; node node_modules/tsx/dist/cli.mjs server/services/deliveryCommandService.test.ts`

Expected: FAIL because creation still inherits only order fields.

- [ ] **Step 3: Inject one allocator contract into both services**

```ts
type DeliveryAssigner = {
  assignNext(transaction: Prisma.TransactionClient, assignedAt: string): Promise<{
    ownerId: string;
    owner: string;
    assignmentMode: 'auto';
    assignedAt: string;
    assignedBy: 'system';
  } | null>;
};
```

Inside each creation transaction, merge automatic assignment into the delivery. When disabled, retain order customer-success/after-sales fallback. When enabled but no participant is eligible, use `owner: '待分配'`.

- [ ] **Step 4: Verify creation regressions**

Run: `node node_modules/tsx/dist/cli.mjs server/services/orderApprovalEffectsService.test.ts; node node_modules/tsx/dist/cli.mjs server/services/orderApplicationService.test.ts; node node_modules/tsx/dist/cli.mjs server/services/deliveryCommandService.test.ts`

Expected: PASS, including order linking and idempotency.

- [ ] **Step 5: Commit creation integration**

```powershell
git add server/services/orderApprovalEffectsService.ts server/services/orderApprovalEffectsService.test.ts server/services/deliveryCommandService.ts server/services/deliveryCommandService.test.ts server/index.ts
git commit -m "feat: auto assign new deliveries in rotation"
```

### Task 4: Settings UI and Manual Assignment Interaction

**Files:**
- Create: `src/api/deliveryAssignmentApi.ts`
- Create: `src/pages/Settings/DeliveryAssignmentConfig.tsx`
- Create: `src/api/deliveryAssignmentConfigStatic.test.ts`
- Modify: `src/pages/Settings/index.tsx`
- Modify: `src/pages/Settings/RolePermission.tsx`
- Modify: `src/pages/Delivery/index.tsx`
- Modify: `src/api/actionPermissionGates.test.ts`

**Interfaces:**
- Consumes: Task 2 endpoints and existing active-user API.
- Produces: settings UI and list-only refresh after manual assignment.

- [ ] **Step 1: Write failing UI/static tests**

```ts
assert.match(settingsSource, /DeliveryAssignmentConfig/);
assert.match(configSource, /客户成功分配/);
assert.match(configSource, /下一位预计分配人员/);
assert.match(configSource, /paused/);
assert.doesNotMatch(saveAssignSource, /refreshAfterMutation\(res\.data\?\.id\)/);
```

- [ ] **Step 2: Run UI tests red**

Run: `node node_modules/tsx/dist/cli.mjs src/api/deliveryAssignmentConfigStatic.test.ts; node node_modules/tsx/dist/cli.mjs src/api/actionPermissionGates.test.ts`

Expected: FAIL because the page is absent and assignment opens detail.

- [ ] **Step 3: Add typed API client**

Backend mode uses `GET`/`PUT /settings/delivery-assignment`. Mock mode stores the same config under `STORAGE_KEYS.DELIVERY_ASSIGNMENT_CONFIG`. Never use local cache as backend truth.

- [ ] **Step 4: Build the settings component**

Provide auto-assignment switch; active employee selection; ordered rows with drag handle plus move-up/move-down controls; pause/resume; remove; next-eligible preview; explicit save; and success/error feedback. Register a `delivery` settings group protected by the new permission.

- [ ] **Step 5: Fix manual assignment interaction**

Replace:

```ts
await refreshAfterMutation(res.data?.id);
```

with:

```ts
setAssignDelivery(null);
await loadWorkbench(filters);
await alert('分配成功');
```

Filter the dropdown to configured eligible participants. If configuration is disabled or empty, fall back only to active customer-success role/position users, never all employees.

- [ ] **Step 6: Verify UI contracts**

Run: `node node_modules/tsx/dist/cli.mjs src/api/deliveryAssignmentConfigStatic.test.ts; node node_modules/tsx/dist/cli.mjs src/api/actionPermissionGates.test.ts; node node_modules/tsx/dist/cli.mjs src/api/deliveryIndependentStepsStatic.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit UI changes**

```powershell
git add src/api/deliveryAssignmentApi.ts src/pages/Settings/DeliveryAssignmentConfig.tsx src/api/deliveryAssignmentConfigStatic.test.ts src/pages/Settings/index.tsx src/pages/Settings/RolePermission.tsx src/pages/Delivery/index.tsx src/api/actionPermissionGates.test.ts
git commit -m "feat: configure delivery assignment rotation"
```

### Task 5: Verification and Local Acceptance

**Files:**
- Modify: `docs/ai-cto/tasks/TASK-20260715-005-交付历史数据与整链路验收.md`

**Interfaces:**
- Consumes all prior tasks.
- Produces verification evidence only; no production deployment or repair writes.

- [ ] **Step 1: Run focused tests**

Run every assignment, approval, delivery-command, route-auth, settings-static, and Delivery-page test introduced or changed in Tasks 1-4.

Expected: all focused tests PASS.

- [ ] **Step 2: Run type, schema, and build checks**

```powershell
node node_modules/typescript/bin/tsc -b --pretty false
node node_modules/prisma/build/index.js validate
npm.cmd run build
```

Expected: all commands exit `0`.

- [ ] **Step 3: Run full tests and classify unrelated failures**

Run: `npm.cmd test`

Expected: assignment tests pass. Record existing Windows-only Bash exit-code, POSIX `/tmp`, or unrelated order-review contract failures without modifying unrelated modules.

- [ ] **Step 4: Perform local API acceptance**

Save A/B/C, create or simulate four delivery creations, and verify A/B/C/A. Pause B and verify subsequent rotation skips B. Restore the original local configuration after the check.

- [ ] **Step 5: Update task evidence and diff safety**

Record focused tests, type check, build, Prisma validation, API acceptance, and no production mutation. Run `git diff --check` and expect exit `0`.
