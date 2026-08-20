# Unified Employee Workbench Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn 极享OS into a unified employee execution, manager collaboration, and owner operating-feedback workbench across the existing business modules.

**Architecture:** Extend the existing `EmployeeTask` aggregate instead of adding a parallel work-item table. Business-source adapters produce idempotent desired tasks, a reconciliation/scheduler layer keeps them synchronized, existing notifications deliver lifecycle reminders, and unified APIs power employee, manager, and cockpit views while preserving each source module's authorization.

**Tech Stack:** TypeScript, React 18, Material UI, Express, Prisma 6, MySQL, Node test runner/tsx, Vitest for rendered UI seams.

**Spec:** `docs/superpowers/specs/2026-08-20-unified-employee-workbench-phase3-design.md`

## Global Constraints

- Preserve current CRM, order, delivery, after-sales, finance, academy, OKR, asset, and marketing state machines; tasks reference source records rather than replacing them.
- Keep legacy `/enterprise-brain/tasks/*`, old marketing-plan URLs, old permission grants, and existing task IDs working.
- Use `Asia/Shanghai` for business dates and deadlines.
- All source-generated tasks must have an idempotent `sourceKey`; repeated reconciliation must not duplicate tasks.
- Notifications are in-app only in this phase; delivery failure must not roll back committed business or task state.
- Video assets remain external links; do not store video binaries on the server.
- Every growing list must use server pagination with total, page, page size, and jump-to-page. Desktop tables and mobile cards share filters, totals, and page results.
- Workbench visibility never expands source-module data permissions. Company cockpit permission grants aggregate access, not source-record edit access.
- Write a failing test and observe the expected failure before every production behavior change.
- Each task ends with focused tests, `npx tsc -b --pretty false`, `git diff --check`, and a commit.

---

## Delivery Package A: Unified Task Foundation

### Task 1: Extend the Prisma task aggregate and migrate legacy rows

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260820133000_unified_employee_workbench_phase3/migration.sql`
- Create: `server/db/unifiedWorkbenchMigration.test.ts`
- Modify: `src/types/enterpriseBrain.ts`

**Interfaces:**
- Produces `EmployeeTask.sourceKey`, `taskType`, `priority`, `businessModule`, `sourceRoute`, `sourceLabel`, lifecycle timestamps, collaborators, workload, quality, reminder metadata, and `TaskActivity`.
- Preserves current `EmployeeTask.status`, `TaskEvidence`, template uniqueness, and old nullable source fields.

- [ ] **Step 1: Write the failing schema contract test**

```ts
const schema = readFileSync('prisma/schema.prisma', 'utf8');
assert.match(schema, /sourceKey\s+String\s+@unique/);
assert.match(schema, /model TaskActivity/);
assert.match(schema, /activities\s+TaskActivity\[\]/);
const migration = readFileSync('prisma/migrations/20260820133000_unified_employee_workbench_phase3/migration.sql', 'utf8');
assert.match(migration, /legacy:employee_task:/);
assert.match(migration, /CREATE UNIQUE INDEX `employee_tasks_source_key_key`/);
```

- [ ] **Step 2: Run the schema contract and observe failure**

Run: `npx tsx server/db/unifiedWorkbenchMigration.test.ts`  
Expected: FAIL because the migration and new schema fields do not exist.

- [ ] **Step 3: Add schema fields and activity relation**

```prisma
sourceKey             String    @unique @db.VarChar(180)
taskType              String    @default("ACTION") @db.VarChar(32)
priority              String    @default("NORMAL") @db.VarChar(16)
businessModule        String    @default("GENERAL") @db.VarChar(40)
sourceRoute           String?   @db.VarChar(500)
sourceLabel           String?   @db.VarChar(120)
startedAt             DateTime?
canceledAt            DateTime?
canceledById          String?   @db.VarChar(64)
canceledReason        String?   @db.VarChar(500)
collaboratorIds       Json?
estimatedMinutes      Int?
qualityScore          Int?
qualityComment        String?   @db.VarChar(500)
remindedAt            DateTime?
lastOverdueNotifiedAt DateTime?
sourceVersion         String?   @db.VarChar(80)
activities            TaskActivity[]
```

Define `TaskActivity` with task ID, action, actor snapshots, from/to status, comment, JSON metadata, and `createdAt`. In SQL, add nullable columns first, backfill `sourceKey = CONCAT('legacy:employee_task:', id)`, then make it non-null and unique.

- [ ] **Step 4: Regenerate Prisma and run migration contract**

Run: `npx prisma generate && npx tsx server/db/unifiedWorkbenchMigration.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit the task model**

```bash
git add prisma src/types/enterpriseBrain.ts server/db/unifiedWorkbenchMigration.test.ts
git commit -m "feat(workbench): extend unified task model"
```

### Task 2: Add a tested task lifecycle domain

**Files:**
- Create: `src/domain/workbench/taskLifecycle.ts`
- Create: `src/domain/workbench/taskLifecycle.test.ts`
- Create: `src/domain/workbench/taskPriority.ts`
- Create: `src/domain/workbench/taskPriority.test.ts`

**Interfaces:**
- Produces `transitionTaskStatus(current, action): EmployeeTaskStatus`.
- Produces `rankWorkbenchTask(task, now): number` and stable comparator `compareWorkbenchTasks(a, b, now)`.

- [ ] **Step 1: Write failing lifecycle and priority tests**

```ts
assert.equal(transitionTaskStatus('PENDING', 'START'), 'IN_PROGRESS');
assert.equal(transitionTaskStatus('COMPLETED', 'RETURN'), 'RETURNED');
assert.throws(() => transitionTaskStatus('CONFIRMED', 'START'), /终态/);
assert.deepEqual(
  [normal, overdue, returned].sort((a, b) => compareWorkbenchTasks(a, b, now)).map((item) => item.id),
  ['returned', 'overdue', 'normal'],
);
```

- [ ] **Step 2: Run tests and observe missing-module failure**

Run: `npx tsx src/domain/workbench/taskLifecycle.test.ts && npx tsx src/domain/workbench/taskPriority.test.ts`  
Expected: FAIL because domain modules do not exist.

- [ ] **Step 3: Implement explicit transition maps and deterministic ranking**

```ts
const transitions = {
  PENDING: { START: 'IN_PROGRESS', COMPLETE: 'COMPLETED', CANCEL: 'CANCELED' },
  IN_PROGRESS: { COMPLETE: 'COMPLETED', CANCEL: 'CANCELED' },
  COMPLETED: { CONFIRM: 'CONFIRMED', RETURN: 'RETURNED' },
  RETURNED: { START: 'IN_PROGRESS', COMPLETE: 'COMPLETED', CANCEL: 'CANCELED' },
} as const;
```

Ranking order is returned, overdue, urgent, due today, high priority, then deadline and creation time.

- [ ] **Step 4: Run domain tests and typecheck**

Run: `npx tsx src/domain/workbench/taskLifecycle.test.ts && npx tsx src/domain/workbench/taskPriority.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit task domains**

```bash
git add src/domain/workbench
git commit -m "feat(workbench): define task lifecycle and priority"
```

### Task 3: Build the unified task repository and command service

**Files:**
- Create: `server/services/workbench/workbenchRepository.ts`
- Create: `server/services/workbench/prismaWorkbenchRepository.ts`
- Create: `server/services/workbench/workbenchCommandService.ts`
- Create: `server/services/workbench/workbenchCommandService.test.ts`
- Modify: `server/services/enterpriseBrain/taskService.ts`
- Modify: `server/services/enterpriseBrain/prismaTaskRepository.ts`

**Interfaces:**
- Produces `startTask`, `completeTask`, `confirmTask`, `returnTask`, `reassignTask`, `remindTask`, `cancelTask`, and `reopenTask`.
- Every command returns `ApiResponse<EmployeeTask>` and appends a `TaskActivity` in the same transaction.
- Legacy enterprise-brain commands delegate to this service.

- [ ] **Step 1: Write failing command tests**

Test that an employee can start and complete only their task, a manager can confirm/return only inside the department tree, reassign records both owners, a notification exception does not roll back the task, and a confirmed task rejects normal reopening.

```ts
const started = await service.startTask('task-1', employee);
assert.equal(started.data?.status, 'IN_PROGRESS');
assert.equal(activities.at(-1)?.action, 'START');
const denied = await service.reassignTask('task-1', { employeeId: 'outside' }, manager);
assert.equal(denied.code, 403);
```

- [ ] **Step 2: Run command tests and observe failure**

Run: `npx tsx server/services/workbench/workbenchCommandService.test.ts`  
Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement transactional commands**

Use repository methods `findTaskForUpdate`, `appendActivity`, `updateTask`, `findEmployee`, and `listDepartmentTree`. Validate URL evidence as `http:` or `https:` and cap comments at 500 characters. Commit task/activity before invoking the optional notification callback.

```ts
export type WorkbenchCommandService = {
  startTask(taskId: string, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>>;
  completeTask(taskId: string, input: CompleteTaskInput, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>>;
  confirmTask(taskId: string, input: ConfirmTaskInput, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>>;
  returnTask(taskId: string, input: { reason: string }, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>>;
  reassignTask(taskId: string, input: { employeeId: string; reason: string }, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>>;
  remindTask(taskId: string, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>>;
  cancelTask(taskId: string, input: { reason: string }, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>>;
  reopenTask(taskId: string, input: { reason: string }, actor: AuthenticatedUser): Promise<ApiResponse<EmployeeTask>>;
};
```

- [ ] **Step 4: Delegate old task methods and run tests**

Run: `npx tsx server/services/workbench/workbenchCommandService.test.ts && npx tsx server/services/enterpriseBrain/taskService.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit the command foundation**

```bash
git add server/services/workbench server/services/enterpriseBrain
git commit -m "feat(workbench): add unified task commands"
```

### Task 4: Add unified query, summaries, and server pagination

**Files:**
- Create: `server/services/workbench/workbenchQueryService.ts`
- Create: `server/services/workbench/workbenchQueryService.test.ts`
- Create: `src/types/workbench.ts`
- Modify: `server/services/workbench/workbenchRepository.ts`
- Modify: `server/services/workbench/prismaWorkbenchRepository.ts`

**Interfaces:**
- Produces `listMine`, `listTeam`, `summaryMine`, `summaryTeam`, `cockpit`.
- Accepts `page`, `pageSize`, date range, status, module, priority, employee, department, overdue, and confirmation filters.
- Returns `{ items, pagination }` and explicit metric definitions.

- [ ] **Step 1: Write failing visibility and metric tests**

```ts
const mine = await service.listMine({ page: 2, pageSize: 10 }, employee);
assert.deepEqual(mine.data?.pagination, { page: 2, pageSize: 10, total: 24, totalPages: 3 });
assert.equal((await service.listTeam({}, manager)).data?.items.some((item) => item.employeeId === 'outside'), false);
assert.equal(cockpit.data?.confirmed, 1);
assert.equal(cockpit.data?.awaitingConfirmation, 1);
assert.equal(cockpit.data?.canceledDenominator, 0);
```

- [ ] **Step 2: Run query test and observe failure**

Run: `npx tsx server/services/workbench/workbenchQueryService.test.ts`  
Expected: FAIL because query service is absent.

- [ ] **Step 3: Implement scoped queries and Shanghai metric windows**

Use database pagination and grouped queries. `COMPLETED` counts as awaiting confirmation, `CONFIRMED` counts as final completion, and canceled tasks are excluded from completion-rate denominator.

```ts
export type WorkbenchQueryService = {
  listMine(filters: WorkbenchTaskFilters, actor: AuthenticatedUser): Promise<ApiResponse<Paginated<EmployeeTask>>>;
  listTeam(filters: WorkbenchTaskFilters, actor: AuthenticatedUser): Promise<ApiResponse<Paginated<EmployeeTask>>>;
  summaryMine(filters: WorkbenchSummaryFilters, actor: AuthenticatedUser): Promise<ApiResponse<WorkbenchSummary>>;
  summaryTeam(filters: WorkbenchSummaryFilters, actor: AuthenticatedUser): Promise<ApiResponse<WorkbenchSummary>>;
  cockpit(filters: WorkbenchCockpitFilters, actor: AuthenticatedUser): Promise<ApiResponse<WorkbenchCockpit>>;
};
```

- [ ] **Step 4: Run query tests and typecheck**

Run: `npx tsx server/services/workbench/workbenchQueryService.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit query services**

```bash
git add server/services/workbench src/types/workbench.ts
git commit -m "feat(workbench): add scoped task queries and metrics"
```

## Delivery Package B: Automation and Notifications

### Task 5: Add idempotent desired-task synchronization

**Files:**
- Create: `server/services/workbench/sourceAdapter.ts`
- Create: `server/services/workbench/taskSyncService.ts`
- Create: `server/services/workbench/taskSyncService.test.ts`
- Modify: `server/services/workbench/workbenchRepository.ts`

**Interfaces:**
- Defines `WorkbenchSourceAdapter`, `DesiredEmployeeTask`, `ReconcileContext`, and `ReconcileResult` exactly as in the spec.
- Produces `syncDesiredTask(desired)` and `reconcileAdapters(adapters, context)`.

```ts
export type TaskSyncService = {
  syncDesiredTask(desired: DesiredEmployeeTask | null, sourceKey: string): Promise<EmployeeTask | null>;
  reconcileAdapters(adapters: WorkbenchSourceAdapter[], context: ReconcileContext): Promise<ReconcileResult>;
};
```

- [ ] **Step 1: Write failing idempotency tests**

```ts
await service.syncDesiredTask(desired);
await service.syncDesiredTask(desired);
assert.equal(tasks.filter((item) => item.sourceKey === desired.sourceKey).length, 1);
assert.equal(tasks[0].sourceVersion, desired.sourceVersion);
```

Also assert source updates cannot overwrite employee result/evidence and a null desired task cancels only non-terminal tasks.

- [ ] **Step 2: Run sync tests and observe failure**

Run: `npx tsx server/services/workbench/taskSyncService.test.ts`  
Expected: FAIL because the sync service is absent.

- [ ] **Step 3: Implement source-owned field updates**

Allow synchronization to change title, description, owner, due time, priority, route, label, and source version. Do not change result, evidence, completion timestamps, quality, or confirmed status.

```ts
export async function syncDesiredTask(desired: DesiredEmployeeTask | null, sourceKey: string) {
  const existing = await repository.findBySourceKey(sourceKey);
  if (!desired) return existing && !isTerminal(existing.status) ? repository.cancelFromSource(existing.id) : existing;
  return existing
    ? repository.updateSourceOwnedFields(existing.id, desired)
    : repository.createFromDesired(desired);
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx tsx server/services/workbench/taskSyncService.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit synchronization**

```bash
git add server/services/workbench
git commit -m "feat(workbench): synchronize source tasks idempotently"
```

### Task 6: Automate templates with a leased scheduler and run history

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `prisma/migrations/20260820133000_unified_employee_workbench_phase3/migration.sql`
- Create: `server/services/workbench/workbenchScheduler.ts`
- Create: `server/services/workbench/workbenchScheduler.test.ts`
- Create: `server/services/workbench/prismaSchedulerStore.ts`
- Modify: `server/index.ts`

**Interfaces:**
- Produces `start()`, `stop()`, `runDailyGeneration(date)`, `runReconciliation()`, and `runReminderScan()`.
- Uses `WorkbenchSchedulerLease` and `WorkbenchSchedulerRun` records.

- [ ] **Step 1: Write failing scheduler tests**

Assert two worker instances cannot hold the same lease, startup generates today's tasks once, repeated daily generation skips duplicates, one adapter failure leaves other adapters running, and `stop()` clears timers.

- [ ] **Step 2: Run scheduler test and observe failure**

Run: `npx tsx server/services/workbench/workbenchScheduler.test.ts`  
Expected: FAIL because scheduler modules are absent.

- [ ] **Step 3: Implement lease and schedule loops**

Use a database row with owner token and `expiresAt`. Run daily generation at the next Shanghai midnight, reconciliation every five minutes, reminder scan every fifteen minutes, and startup compensation immediately. Call `.unref()` on timers and stop them during server shutdown.

```ts
export type WorkbenchScheduler = {
  start(): void;
  stop(): Promise<void>;
  runDailyGeneration(date: string): Promise<SchedulerRunResult>;
  runReconciliation(): Promise<SchedulerRunResult>;
  runReminderScan(): Promise<SchedulerRunResult>;
};
```

- [ ] **Step 4: Run scheduler and server startup tests**

Run: `npx tsx server/services/workbench/workbenchScheduler.test.ts && npx tsx server/services/systemSetupStartupStatic.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit scheduler**

```bash
git add prisma server/index.ts server/services/workbench
git commit -m "feat(workbench): automate daily tasks and reconciliation"
```

### Task 7: Publish lifecycle notifications with dedupe and throttling

**Files:**
- Create: `server/services/workbench/workbenchNotificationService.ts`
- Create: `server/services/workbench/workbenchNotificationService.test.ts`
- Modify: `server/services/notificationWorkflow.ts`
- Modify: `server/services/notificationWorkflow.test.ts`
- Modify: `server/services/workbench/workbenchCommandService.ts`
- Modify: `server/services/workbench/workbenchScheduler.ts`

**Interfaces:**
- Produces lifecycle notification methods `taskCreated`, `taskReassigned`, `taskCompleted`, `taskReturned`, `taskConfirmed`, `taskCanceled`, `taskDueSoon`, `taskOverdue`, and `schedulerFailed`.
- Dedupe key contains activity ID for transitions and Shanghai date for daily overdue summaries.

- [ ] **Step 1: Write failing notification tests**

```ts
await service.taskReturned(task, activity, employee);
await service.taskReturned(task, activity, employee);
assert.equal(notifications.length, 1);
await service.taskOverdue(task, employee, manager, shanghaiDate);
await service.taskOverdue(task, employee, manager, shanghaiDate);
assert.equal(overdueForEmployee.length, 1);
```

- [ ] **Step 2: Run notification tests and observe failure**

Run: `npx tsx server/services/workbench/workbenchNotificationService.test.ts`  
Expected: FAIL because the workbench workflow does not exist.

- [ ] **Step 3: Implement notification mapping**

Publish via the existing notification workflow after task transactions commit. Group manager overdue notifications by manager and date. Record `remindedAt` and `lastOverdueNotifiedAt` only after deduped publish succeeds.

```ts
const transitionDedupeKey = (activity: TaskActivity) => `workbench:${activity.taskId}:${activity.id}`;
const overdueDedupeKey = (taskId: string, shanghaiDate: string, recipientId: string) =>
  `workbench:overdue:${taskId}:${shanghaiDate}:${recipientId}`;
```

- [ ] **Step 4: Run focused notification and command tests**

Run: `npx tsx server/services/workbench/workbenchNotificationService.test.ts && npx tsx server/services/notificationWorkflow.test.ts && npx tsx server/services/workbench/workbenchCommandService.test.ts`  
Expected: PASS.

- [ ] **Step 5: Commit notifications**

```bash
git add server/services/workbench server/services/notificationWorkflow.*
git commit -m "feat(workbench): notify task lifecycle and overdue events"
```

## Delivery Package C: Business Source Adapters

### Task 8: Connect CRM customer todos and lead follow-ups

**Files:**
- Create: `server/services/workbench/adapters/crmWorkbenchAdapter.ts`
- Create: `server/services/workbench/adapters/crmWorkbenchAdapter.test.ts`
- Modify: `server/services/customerTodoService.ts`
- Modify: `server/services/customerTodoService.test.ts`
- Modify: `server/services/customerCommandService.ts`

**Interfaces:**
- Produces source keys `customer_todo:{id}` and `lead_follow_up:{leadId}:{dueDate}`.
- Customer todo completion and task completion synchronize transactionally.

- [ ] **Step 1: Write failing CRM adapter tests**

Assert a pending customer todo creates one task, completing either side completes the other, a canceled todo cancels an open task, overdue lead follow-up assigns the lead owner, and out-of-scope users cannot open or mutate the task source.

- [ ] **Step 2: Run CRM adapter tests and observe failure**

Run: `npx tsx server/services/workbench/adapters/crmWorkbenchAdapter.test.ts`  
Expected: FAIL because the adapter is absent.

- [ ] **Step 3: Implement CRM desired-task mapping and hooks**

Set `businessModule='CRM'`, routes to customer/lead detail, priority high for overdue follow-up, and use the original assignee ID. Register direct synchronization after todo commands commit.

```ts
export const crmWorkbenchAdapter: WorkbenchSourceAdapter = {
  module: 'CRM',
  reconcile: (context) => reconcileCrmTasks(context),
  resolveTask: (sourceKey) => resolveCrmDesiredTask(sourceKey),
  onTaskTransition: (event) => synchronizeCustomerTodoCompletion(event),
};
```

- [ ] **Step 4: Run CRM regression tests**

Run: `npx tsx server/services/workbench/adapters/crmWorkbenchAdapter.test.ts && npx tsx server/services/customerTodoService.test.ts && npx tsx src/api/crmWorkflowRegression.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit CRM integration**

```bash
git add server/services/workbench/adapters server/services/customerTodoService.* server/services/customerCommandService.ts
git commit -m "feat(workbench): connect CRM actions"
```

### Task 9: Connect order, delivery, after-sales, and finance actions

**Files:**
- Create: `server/services/workbench/adapters/orderWorkbenchAdapter.ts`
- Create: `server/services/workbench/adapters/deliveryWorkbenchAdapter.ts`
- Create: `server/services/workbench/adapters/afterSalesWorkbenchAdapter.ts`
- Create: `server/services/workbench/adapters/financeWorkbenchAdapter.ts`
- Create: `server/services/workbench/adapters/operationalAdapters.test.ts`
- Modify: `server/services/orderCommandService.ts`
- Modify: `server/services/deliveryCommandService.ts`
- Modify: `server/services/recoveryOrderCommandService.ts`
- Modify: `server/services/orderSettlementCommandService.ts`

**Interfaces:**
- Source keys use stable business IDs and workflow stage codes.
- Adapters expose routes and safe summaries; finance amounts remain protected by source authorization.

- [ ] **Step 1: Write failing operational adapter tests**

Cover pending order review, returned order correction, delivery step assignment/deadline change, recovery/refund review, and settlement execution. Assert source terminal/canceled states cancel only open tasks and task completion never silently approves source business records.

- [ ] **Step 2: Run adapter tests and observe failure**

Run: `npx tsx server/services/workbench/adapters/operationalAdapters.test.ts`  
Expected: FAIL because adapters are absent.

- [ ] **Step 3: Implement four adapters and direct sync hooks**

Map existing assignee/reviewer IDs, source route, deadline, priority, and source version. Return `null` for source states that no longer require action. Register adapters in a single `workbenchAdapterRegistry.ts`.

```ts
export const operationalWorkbenchAdapters: WorkbenchSourceAdapter[] = [
  orderWorkbenchAdapter,
  deliveryWorkbenchAdapter,
  afterSalesWorkbenchAdapter,
  financeWorkbenchAdapter,
];
```

- [ ] **Step 4: Run source-module regressions**

Run: `npx tsx server/services/workbench/adapters/operationalAdapters.test.ts && npx tsx server/services/orderCommandService.test.ts && npx tsx server/services/deliveryCommandService.test.ts && npx tsx server/services/recoveryOrderCommandService.test.ts && npx tsx server/services/orderSettlementCommandService.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit operational integrations**

```bash
git add server/services/workbench/adapters server/services/orderCommandService.ts server/services/deliveryCommandService.ts server/services/recoveryOrderCommandService.ts server/services/orderSettlementCommandService.ts
git commit -m "feat(workbench): connect operational workflows"
```

### Task 10: Connect marketing, academy, and OKR without duplicate task systems

**Files:**
- Create: `server/services/workbench/adapters/marketingWorkbenchAdapter.ts`
- Create: `server/services/workbench/adapters/academyWorkbenchAdapter.ts`
- Create: `server/services/workbench/adapters/okrWorkbenchAdapter.ts`
- Create: `server/services/workbench/adapters/growthEnablementAdapters.test.ts`
- Modify: `server/services/assetCommandService.ts`
- Modify: `server/services/academy/academyService.ts`
- Modify: `server/services/okr/okrService.ts`

**Interfaces:**
- Reuses existing employee task IDs for marketing publishing.
- Academy tasks enter unified queries through stable source mapping; academy remains source of course progress.
- OKR task completion records contribution but does not set KR progress to 100%.

- [ ] **Step 1: Write failing adapter tests**

Assert marketing plan target maps to one real task, academy task status appears in the unified queue, canceled academy activity closes the open task, and OKR-linked task completion preserves KR progress while retaining the link.

- [ ] **Step 2: Run growth/enablement adapter tests and observe failure**

Run: `npx tsx server/services/workbench/adapters/growthEnablementAdapters.test.ts`  
Expected: FAIL because adapters are absent.

- [ ] **Step 3: Implement adapters and legacy source-key backfill**

Use `marketing_publish:{planId}:{accountId}`, `academy_task:{academyTaskId}`, and `okr_task:{objectiveId}:{krId}:{period}`. Update marketing creation to populate all unified task fields atomically.

```ts
export const growthEnablementWorkbenchAdapters: WorkbenchSourceAdapter[] = [
  marketingWorkbenchAdapter,
  academyWorkbenchAdapter,
  okrWorkbenchAdapter,
];
```

- [ ] **Step 4: Run marketing, academy, and OKR regressions**

Run: `npx tsx server/services/workbench/adapters/growthEnablementAdapters.test.ts && npx tsx server/services/assetCommandService.test.ts && npx tsx server/services/academy/academyService.test.ts && npx tsx server/services/okr/okrService.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit growth and enablement integrations**

```bash
git add server/services/workbench/adapters server/services/assetCommandService.ts server/services/academy/academyService.ts server/services/okr/okrService.ts
git commit -m "feat(workbench): connect growth and enablement tasks"
```

## Delivery Package D: Unified APIs and Workbench UI

### Task 11: Expose unified workbench APIs with legacy compatibility

**Files:**
- Create: `server/routes/workbenchRoutes.ts`
- Create: `server/routes/workbenchRoutes.test.ts`
- Modify: `server/index.ts`
- Create: `src/api/workbenchApi.ts`
- Modify: `src/api/index.ts`
- Modify: `src/api/enterpriseBrainApi.ts`

**Interfaces:**
- Implements the API list in spec section 15.
- Legacy enterprise-brain task routes call the same query/command services.

- [ ] **Step 1: Write failing route authentication and scope tests**

Assert unauthenticated requests return 401, employees cannot use team/cockpit routes, managers cannot reassign outside their department tree, company cockpit users receive aggregates without gaining source write access, and validation errors preserve Chinese service messages.

- [ ] **Step 2: Run route tests and observe failure**

Run: `npx tsx server/routes/workbenchRoutes.test.ts`  
Expected: FAIL because workbench routes do not exist.

- [ ] **Step 3: Implement route factory and frontend API**

Export `createWorkbenchRouter({ queryService, commandService, syncService })`, mount at `/api/workbench`, and keep `server/index.ts` limited to wiring. Parse booleans and pagination through shared list helpers.

```ts
export function createWorkbenchRouter(deps: {
  queryService: WorkbenchQueryService;
  commandService: WorkbenchCommandService;
  syncService: TaskSyncService;
}): Router;
```

- [ ] **Step 4: Run route, API, and compatibility tests**

Run: `npx tsx server/routes/workbenchRoutes.test.ts && npx tsx server/routes/businessCockpitRoutes.test.ts && npx tsx src/api/enterpriseBrainPermissionModel.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit unified APIs**

```bash
git add server/routes/workbenchRoutes* server/index.ts src/api/workbenchApi.ts src/api/index.ts src/api/enterpriseBrainApi.ts
git commit -m "feat(workbench): expose unified workbench APIs"
```

### Task 12: Build the employee execution workbench

**Files:**
- Create: `src/pages/Workbench/EmployeeWorkbench.tsx`
- Create: `src/pages/Workbench/TaskActionDialog.tsx`
- Create: `src/pages/Workbench/TaskTimelineDrawer.tsx`
- Create: `src/pages/Workbench/workbenchViewModel.ts`
- Create: `src/pages/Workbench/workbenchViewModel.test.ts`
- Create: `src/pages/Workbench/EmployeeWorkbench.dom.spec.tsx`
- Modify: `src/pages/Dashboard/index.tsx`
- Modify: `src/pages/Tasks/index.tsx`

**Interfaces:**
- Consumes `workbenchApi.listMine`, `summaryMine`, and lifecycle commands.
- Produces the same filtered/paginated result for desktop table and mobile cards.

- [ ] **Step 1: Write failing view-model and rendered-flow tests**

Test returned/overdue/urgent ordering, shared mobile/desktop page items, task start, completion evidence, source navigation, and timeline display. Render a marketing task and assert copy/open-material actions remain available.

- [ ] **Step 2: Run UI tests and observe failure**

Run: `npx tsx src/pages/Workbench/workbenchViewModel.test.ts && npx vitest run src/pages/Workbench/EmployeeWorkbench.dom.spec.tsx`  
Expected: FAIL because workbench components are absent.

- [ ] **Step 3: Implement employee workbench and protected write dialogs**

Use `ProtectedFormDialog`, `TablePagination`, `useAppFeedback`, and existing responsive patterns. Sections are today, overdue, returned, awaiting confirmation, upcoming, collaboration, and history. Source routes must begin with `/` and be navigated internally.

```tsx
<EmployeeWorkbench
  summary={summary}
  filters={filters}
  items={page.items}
  pagination={page.pagination}
  onAction={handleTaskAction}
  onOpenSource={openInternalSourceRoute}
/>
```

- [ ] **Step 4: Integrate the dashboard and preserve old task URL**

Render employee summary on `/`; `/tasks` remains the full history compatibility route and uses the unified query API. Run:

`npx tsx src/pages/Workbench/workbenchViewModel.test.ts && npx vitest run src/pages/Workbench/EmployeeWorkbench.dom.spec.tsx && npx tsx src/api/dashboardBusinessCockpitStatic.test.ts && npx tsc -b --pretty false`

Expected: PASS.

- [ ] **Step 5: Commit employee workbench**

```bash
git add src/pages/Workbench src/pages/Dashboard/index.tsx src/pages/Tasks/index.tsx
git commit -m "feat(workbench): build employee execution workspace"
```

### Task 13: Build the manager collaboration workspace

**Files:**
- Create: `src/pages/Workbench/TeamWorkbench.tsx`
- Create: `src/pages/Workbench/TeamTaskTable.tsx`
- Create: `src/pages/Workbench/TeamTaskCards.tsx`
- Create: `src/pages/Workbench/TeamWorkbench.dom.spec.tsx`
- Modify: `src/pages/Workbench/EmployeeWorkbench.tsx`
- Modify: `src/shared/utils/permissions.ts`
- Modify: `src/pages/Settings/RolePermission.tsx`

**Interfaces:**
- Consumes team list/summary plus confirm, return, reassign, remind, and cancel APIs.
- Uses permissions `WORKBENCH_SELF`, `WORKBENCH_TEAM`, `WORKBENCH_ASSIGN`, `WORKBENCH_CONFIRM`, `WORKBENCH_GOVERN`, `WORKBENCH_COCKPIT`, with exact legacy mappings for `TASK_SELF`, `TASK_TEAM`, and `TASK_ASSIGN`.

- [ ] **Step 1: Write failing manager-flow tests**

Render team data and assert filters, totals, page size, jump-to-page, mobile cards, confirmation, return reason, reassignment, batch remind, evidence/timeline, and source navigation. Assert a user without team permission sees no team tab.

- [ ] **Step 2: Run manager UI tests and observe failure**

Run: `npx vitest run src/pages/Workbench/TeamWorkbench.dom.spec.tsx`  
Expected: FAIL because manager components and permissions are absent.

- [ ] **Step 3: Implement team workspace and permission catalog**

Use server filters for date, department, employee, module, status, priority, overdue, and confirmation. Batch remind accepts selected task IDs but the server revalidates each task scope.

```tsx
<TeamWorkbench
  filters={filters}
  result={result}
  summary={summary}
  selectedTaskIds={selectedTaskIds}
  onConfirm={confirmTask}
  onReturn={returnTask}
  onReassign={reassignTask}
  onBatchRemind={batchRemind}
/>
```

- [ ] **Step 4: Run permission and UI tests**

Run: `npx vitest run src/pages/Workbench/TeamWorkbench.dom.spec.tsx && npx tsx src/api/permissionModel.test.ts && npx tsx src/pages/Settings/corePermissionCatalog.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit manager workspace**

```bash
git add src/pages/Workbench src/shared/utils/permissions.ts src/pages/Settings/RolePermission.tsx
git commit -m "feat(workbench): add manager collaboration workspace"
```

## Delivery Package E: Content Data and Owner Cockpit

### Task 14: Migrate marketing content and publish execution to structured tables

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260820200000_structured_marketing_content/migration.sql`
- Create: `server/services/marketing/marketingRepository.ts`
- Create: `server/services/marketing/prismaMarketingRepository.ts`
- Create: `server/services/marketing/marketingMigrationService.ts`
- Create: `server/services/marketing/marketingMigrationService.test.ts`
- Modify: `server/services/marketingContentService.ts`
- Modify: `server/services/marketingPublishService.ts`
- Modify: `server/services/assetCommandService.ts`

**Interfaces:**
- Produces structured content, revisions, asset links, review events, plans, targets, results, and performance snapshots from spec section 14.
- Preserves legacy IDs and reads; all new writes use structured tables.

- [ ] **Step 1: Write failing repeatable migration tests**

Seed AppStorage content/group/plan records, run migration twice, and assert one structured row per legacy ID, preserved task references, no overwrite of a newer structured revision, and an integrity report with source/target counts.

- [ ] **Step 2: Run marketing migration test and observe failure**

Run: `npx tsx server/services/marketing/marketingMigrationService.test.ts`  
Expected: FAIL because structured repositories are absent.

- [ ] **Step 3: Add schema, repository, and idempotent migration**

Store video/image assets as validated links. Wrap each content aggregate migration in a transaction. Keep compatibility reads for one release cycle and remove local-only publish success paths.

```ts
export type MarketingMigrationReport = {
  contents: { scanned: number; inserted: number; skipped: number };
  groups: { scanned: number; inserted: number; skipped: number };
  plans: { scanned: number; inserted: number; skipped: number };
  brokenReferences: Array<{ kind: string; id: string; reason: string }>;
};
```

- [ ] **Step 4: Switch services and run marketing regressions**

Run: `npx tsx server/services/marketing/marketingMigrationService.test.ts && npx tsx server/services/marketingContentService.test.ts && npx tsx server/services/assetCommandService.test.ts && npx tsx src/api/marketingContentCenterStatic.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit structured marketing data**

```bash
git add prisma server/services/marketing server/services/marketingContentService.ts server/services/marketingPublishService.ts server/services/assetCommandService.ts
git commit -m "feat(marketing): structure content and publish execution"
```

### Task 15: Add publish results and performance review

**Files:**
- Create: `server/services/marketing/marketingPerformanceService.ts`
- Create: `server/services/marketing/marketingPerformanceService.test.ts`
- Create: `server/routes/marketingPerformanceRoutes.ts`
- Modify: `server/index.ts`
- Modify: `src/api/marketingApi.ts`
- Create: `src/pages/Marketing/PerformancePanel.tsx`
- Modify: `src/pages/Marketing/index.tsx`

**Interfaces:**
- Accepts publish URL, screenshot URL, views, likes, comments, favorites, consultations, leads, and captured-at time.
- Links results to content, revision, plan target, task, account, and employee.

- [ ] **Step 1: Write failing result and permission tests**

Assert valid `http/https` links, non-negative integer metrics, target assignee/authorized operator writes, historical snapshots remain append-only, and content detail aggregates by account without double-counting the latest snapshot.

- [ ] **Step 2: Run performance test and observe failure**

Run: `npx tsx server/services/marketing/marketingPerformanceService.test.ts`  
Expected: FAIL because the service is absent.

- [ ] **Step 3: Implement service, routes, API, and panel**

The employee completion flow creates the publish result; later metric submissions append snapshots. The panel shows plan, platform, account, executor, publish link, latest metrics, and captured time with unified pagination.

```ts
export type MarketingPerformanceInput = {
  publishTargetId: string;
  publishUrl?: string;
  screenshotUrl?: string;
  views: number;
  likes: number;
  comments: number;
  favorites: number;
  consultations: number;
  leads: number;
  capturedAt: string;
};
```

- [ ] **Step 4: Run marketing performance and UI tests**

Run: `npx tsx server/services/marketing/marketingPerformanceService.test.ts && npx tsx src/api/marketingContentCenterStatic.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit content performance**

```bash
git add server/services/marketing server/routes/marketingPerformanceRoutes.ts server/index.ts src/api/marketingApi.ts src/pages/Marketing
git commit -m "feat(marketing): close publish performance loop"
```

### Task 16: Build the owner cockpit and drill-down

**Files:**
- Create: `server/services/workbench/workbenchCockpitService.ts`
- Create: `server/services/workbench/workbenchCockpitService.test.ts`
- Create: `src/pages/Dashboard/WorkbenchCockpitPanel.tsx`
- Create: `src/pages/Dashboard/workbenchCockpitModel.ts`
- Create: `src/pages/Dashboard/workbenchCockpitModel.test.ts`
- Modify: `src/pages/Dashboard/BusinessCockpit.tsx`
- Modify: `src/api/dashboardBusinessCockpitStatic.test.ts`

**Interfaces:**
- Produces company/department/employee/source metrics and drill-down filters with Shanghai boundaries.
- Company cockpit permissions bypass task ownership scope for aggregates, but task detail still uses authorized drill-down rules.

- [ ] **Step 1: Write failing metric and scope tests**

Assert confirmed vs awaiting-confirmation separation, canceled denominator exclusion, on-time rate based on first submission, return count retention, company visibility, department-limited visibility, and drill-down query preservation.

- [ ] **Step 2: Run cockpit tests and observe failure**

Run: `npx tsx server/services/workbench/workbenchCockpitService.test.ts && npx tsx src/pages/Dashboard/workbenchCockpitModel.test.ts`  
Expected: FAIL because cockpit service/model are absent.

- [ ] **Step 3: Implement aggregate queries and UI panel**

Show task volume, confirmed, on-time, overdue, returned, average first-action time, average confirmation time, blockers, and distributions. Every card links to filtered workbench details.

```ts
export type WorkbenchCockpit = {
  totals: WorkbenchCockpitTotals;
  byDepartment: WorkbenchCockpitBucket[];
  byEmployee: WorkbenchCockpitBucket[];
  byModule: WorkbenchCockpitBucket[];
  blockers: WorkbenchCockpitTask[];
};
```

- [ ] **Step 4: Run cockpit and permission regressions**

Run: `npx tsx server/services/workbench/workbenchCockpitService.test.ts && npx tsx src/pages/Dashboard/workbenchCockpitModel.test.ts && npx tsx src/api/dashboardBusinessCockpitStatic.test.ts && npx tsc -b --pretty false`  
Expected: PASS.

- [ ] **Step 5: Commit owner cockpit**

```bash
git add server/services/workbench src/pages/Dashboard src/api/dashboardBusinessCockpitStatic.test.ts
git commit -m "feat(workbench): add owner execution cockpit"
```

## Final Integration and Release Gate

### Task 17: Backfill, compatibility audit, end-to-end verification, and release documentation

**Files:**
- Create: `server/services/workbench/workbenchBackfillService.ts`
- Create: `server/services/workbench/workbenchBackfillService.test.ts`
- Create: `src/api/unifiedWorkbenchPhase3Static.test.ts`
- Create: `scripts/run-unified-workbench-backfill.ts`
- Create: `docs/operations/unified-workbench-phase3-runbook.md`
- Modify: `server/services/systemConfigMigrationService.ts`
- Modify: `server/services/systemSetupStartupStatic.test.ts`

**Interfaces:**
- Backfills source keys/modules/routes, links old marketing targets to tasks, reports counts and broken references, and never deletes legacy rows.
- Runbook defines migration, enablement order, rollback switches, health checks, and role setup.

- [ ] **Step 1: Write failing backfill and compatibility tests**

Test legacy general tasks, old matrix publish tasks, duplicate candidate source keys, broken source records, repeat execution, old URLs, old permission grants, and all eight adapter registrations.

- [ ] **Step 2: Run release-contract tests and observe failure**

Run: `npx tsx server/services/workbench/workbenchBackfillService.test.ts && npx tsx src/api/unifiedWorkbenchPhase3Static.test.ts`  
Expected: FAIL because backfill and release contract are absent.

- [ ] **Step 3: Implement backfill, startup registration, and runbook**

Backfill in batches with stable cursors. Produce `{ scanned, updated, skipped, brokenReferences, conflicts }`. Startup logs only counts and safe error codes. Feature switches independently control reconciliation, reminders, new UI, and structured marketing reads.

```ts
export type WorkbenchBackfillReport = {
  scanned: number;
  updated: number;
  skipped: number;
  brokenReferences: number;
  conflicts: number;
};

export async function runWorkbenchBackfill(input: {
  dryRun: boolean;
  verifyOnly: boolean;
  batchSize: number;
}): Promise<WorkbenchBackfillReport>;
```

- [ ] **Step 4: Run focused release tests**

Run: `npx tsx server/services/workbench/workbenchBackfillService.test.ts && npx tsx src/api/unifiedWorkbenchPhase3Static.test.ts && npx tsx server/services/systemSetupStartupStatic.test.ts && npx tsc -b --pretty false && git diff --check`  
Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `DATABASE_URL= npm test`  
Expected: all test files pass with zero failures.

Run: `npm run build`  
Expected: TypeScript and Vite production build exit 0.

- [ ] **Step 6: Apply migrations to an isolated QA database and verify reports**

Run with a `_qa` or `_test` database URL:

```bash
npx prisma migrate deploy
npx tsx scripts/run-unified-workbench-backfill.ts --dry-run
npx tsx scripts/run-unified-workbench-backfill.ts
npx tsx scripts/run-unified-workbench-backfill.ts --verify
```

Expected: second run updates zero rows; verify reports zero conflicts and zero broken required references.

- [ ] **Step 7: Browser acceptance**

Verify as employee, manager, content operator, finance user, and owner:

1. Employee sees mixed-source prioritized tasks and submits evidence.
2. Manager confirms, returns, reassigns, and batch-reminds within scope.
3. Automatic generation/reconciliation creates no duplicates.
4. Marketing publish result and performance appear on content detail.
5. Owner cockpit drills from company to department, employee, task, and authorized source.
6. Mobile task cards share filters, totals, and paging with desktop.

- [ ] **Step 8: Review and commit release gate**

Run the repository review workflow against the fixed point before Task 17. Resolve every P1/P2 and documented standards finding, rerun affected tests, then commit:

```bash
git add server src prisma docs scripts
git commit -m "feat(workbench): complete phase 3 operating loop"
```

- [ ] **Step 9: Push the feature branch**

```bash
git push -u origin codex/phase3-unified-workbench
```

Expected: remote branch points to the verified release commit; `main` remains unchanged until explicit merge approval.
