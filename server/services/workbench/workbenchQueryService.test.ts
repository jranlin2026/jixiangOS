import assert from 'node:assert/strict';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { EmployeeTask, TaskActivity } from '../../../src/types/enterpriseBrain';
import { PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import { createMemoryWorkbenchRepository } from './workbenchRepository';
import { createPrismaWorkbenchRepository } from './prismaWorkbenchRepository';
import { createWorkbenchQueryService } from './workbenchQueryService';
import { WORKBENCH_MAX_PAGE, WORKBENCH_MAX_PAGE_SIZE } from '../../../src/types/workbench';

const employee: AuthenticatedUser = {
  id: 'employee-1', name: '员工甲', account: 'employee-1', email: '', phone: '', role: '员工',
  departmentId: 'dept-sales-child', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.TASK_SELF, actions: ['read', 'write'] }],
};

const manager: AuthenticatedUser = {
  ...employee, id: 'manager-1', name: '销售经理', account: 'manager-1', role: '销售经理', departmentId: 'dept-sales',
  permissions: [
    { module: PERMISSION_KEYS.TASK_TEAM, actions: ['read'] },
    { module: PERMISSION_KEYS.BRAIN_DASHBOARD, actions: ['read'] },
  ],
};

const owner: AuthenticatedUser = {
  ...employee, id: 'owner-1', name: '老板', account: 'owner-1', role: '超级管理员', departmentId: undefined,
  permissions: [{ module: '全部', actions: ['admin'] }],
};

type StoredTask = EmployeeTask & { createdAt?: string };
const task = (id: string, overrides: Partial<StoredTask> = {}): StoredTask => ({
  id, employeeId: employee.id, employeeName: employee.name,
  departmentIdSnapshot: employee.departmentId || null, positionIdSnapshot: null,
  positionNameSnapshot: null, workDate: '2026-08-20', title: `任务 ${id}`, description: null,
  taskType: 'ACTION', priority: 'NORMAL', businessModule: 'CRM',
  targetValue: null, actualValue: null, unit: null, evidenceRequired: false,
  status: 'PENDING', result: null, dueAt: '2026-08-21T02:00:00.000Z', returnedReason: null,
  createdAt: '2026-08-19T01:00:00.000Z', evidence: [],
  ...overrides,
});

const departments = [
  { id: 'dept-sales', parentId: null },
  { id: 'dept-sales-child', parentId: 'dept-sales' },
  { id: 'dept-market', parentId: null },
];

{
  const tasks = Array.from({ length: 24 }, (_, index) => task(`mine-${String(index + 1).padStart(2, '0')}`));
  tasks[0]!.evidence = [{
    id: 'secret-evidence', type: 'BUSINESS_RECORD', referenceId: 'orders:outside-secret', content: '敏感业务凭证内容',
  }];
  tasks.push(task('outside', {
    employeeId: 'outside', employeeName: '外部员工', departmentIdSnapshot: 'dept-market',
  }));
  const memory = createMemoryWorkbenchRepository({ tasks, departments });
  const service = createWorkbenchQueryService({ repository: memory.repository, now: () => new Date('2026-08-20T02:00:00.000Z') });

  const mine = await service.listMine({ page: 2, pageSize: 10 }, employee);
  assert.equal(mine.code, 0);
  assert.deepEqual(mine.data?.pagination, { page: 2, pageSize: 10, total: 24, totalPages: 3 });
  assert.equal(mine.data?.items.length, 10);
  assert.equal(mine.data?.items.some((item) => item.employeeId === 'outside'), false);

  const team = await service.listTeam({}, manager);
  assert.equal(team.code, 0);
  assert.equal(team.data?.pagination.total, 24);
  assert.equal(team.data?.items.some((item) => item.employeeId === 'outside'), false);
  const serializedTeam = JSON.stringify(team.data?.items);
  assert.equal('evidence' in (team.data?.items[0] || {}), false, '列表 DTO 不得携带证据数组');
  assert.doesNotMatch(serializedTeam, /secret-evidence|orders:outside-secret|敏感业务凭证内容/,
    '只有团队任务权限、没有来源模块权限的主管不得从列表读取证据内容或引用ID');

  const deniedDepartment = await service.listTeam({ departmentId: 'dept-market' }, manager);
  assert.equal(deniedDepartment.code, 403);

  for (const invalid of [0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '1.5', '1e2', 'Infinity']) {
    assert.equal((await service.listMine({ page: invalid }, employee)).code, 400, `page=${String(invalid)} 必须被拒绝`);
    assert.equal((await service.listMine({ pageSize: invalid }, employee)).code, 400, `pageSize=${String(invalid)} 必须被拒绝`);
  }
  const capped = await service.listMine({ page: '999999999', pageSize: '999999999' }, employee);
  assert.deepEqual(capped.data?.pagination, {
    page: WORKBENCH_MAX_PAGE, pageSize: WORKBENCH_MAX_PAGE_SIZE, total: 24, totalPages: 1,
  });
}

{
  const memory = createMemoryWorkbenchRepository({ tasks: [task('malformed-total')] });
  memory.repository.listWorkbenchTasks = async () => ({ items: [], total: Number.POSITIVE_INFINITY });
  const service = createWorkbenchQueryService({ repository: memory.repository });
  const malformed = await service.listMine({}, employee);
  assert.equal(malformed.code, 500);
  assert.equal(malformed.data, null);
}

{
  const inactiveDepartments = [
    { id: 'dept-sales', parentId: null, isActive: false },
    { id: 'dept-sales-child', parentId: 'dept-sales', isActive: true },
  ];
  const memory = createMemoryWorkbenchRepository({ tasks: [task('inactive-root')], departments: inactiveDepartments });
  const service = createWorkbenchQueryService({ repository: memory.repository });
  assert.equal((await service.listTeam({}, manager)).code, 409, '停用的主管根部门不得被加入授权树');
  assert.equal((await service.listMine({ departmentId: 'missing-department' }, employee)).code, 404,
    '不存在的筛选根部门不得被伪造为有效子树');
}

{
  const tasks = [
    task('collaboration', {
      employeeId: 'employee-2', employeeName: '员工乙', collaboratorIds: [employee.id], priority: 'URGENT',
    }),
    task('normalized-filter', { status: 'RETURNED', priority: 'HIGH', businessModule: 'CRM' }),
    task('wrong-filter', { status: 'PENDING', priority: 'LOW', businessModule: 'FINANCE' }),
  ];
  const memory = createMemoryWorkbenchRepository({ tasks, departments });
  const service = createWorkbenchQueryService({
    repository: memory.repository,
    now: () => new Date('2026-08-20T02:00:00.000Z'),
  });

  const collaboration = await service.listMine({ employeeId: 'employee-2' }, employee);
  assert.deepEqual(collaboration.data?.items.map((item) => item.id), ['collaboration']);

  const normalized = await service.listMine({
    status: ' returned ', priority: ' high ', module: ' crm ', overdue: 'false', confirmation: 'false',
  }, employee);
  assert.deepEqual(normalized.data?.items.map((item) => item.id), ['normalized-filter']);

  const normalizedBoolean = await service.listMine({ overdue: ' FALSE ', confirmation: ' FALSE ' }, employee);
  assert.equal(normalizedBoolean.code, 0, '布尔查询参数应与其他筛选一样先去空格并归一化大小写');

  assert.equal((await service.listMine({ overdue: 'sometimes' }, employee)).code, 400);
  assert.equal((await service.listMine({ dateFrom: '2026-02-30' }, employee)).code, 400);
  assert.equal((await service.listMine({ dateFrom: '2026-08-21', dateTo: '2026-08-20' }, employee)).code, 400);
}

{
  const tasks = [
    task('confirmed', {
      status: 'CONFIRMED', dueAt: '2026-08-20T08:00:00.000Z', startedAt: '2026-08-20T06:00:00.000Z',
      completedAt: '2026-08-20T09:00:00.000Z', confirmedAt: '2026-08-20T10:00:00.000Z', estimatedMinutes: 60,
    }),
    task('awaiting', { status: 'COMPLETED', completedAt: '2026-08-20T09:00:00.000Z', estimatedMinutes: null }),
    task('canceled', { status: 'CANCELED', canceledAt: '2026-08-20T06:00:00.000Z', estimatedMinutes: 30 }),
    task('outside-confirmed', {
      employeeId: 'outside', employeeName: '外部员工', departmentIdSnapshot: 'dept-market', status: 'CONFIRMED',
      completedAt: '2026-08-20T07:00:00.000Z', confirmedAt: '2026-08-20T08:00:00.000Z',
    }),
  ];
  const activities: TaskActivity[] = [
    { id: 'start-confirmed', taskId: 'confirmed', action: 'START', actorId: employee.id, actorName: employee.name, fromStatus: 'PENDING', toStatus: 'IN_PROGRESS', comment: null, metadata: null, createdAt: '2026-08-19T02:00:00.000Z' },
    { id: 'complete-confirmed', taskId: 'confirmed', action: 'COMPLETE', actorId: employee.id, actorName: employee.name, fromStatus: 'IN_PROGRESS', toStatus: 'COMPLETED', comment: null, metadata: null, createdAt: '2026-08-20T07:00:00.000Z' },
    { id: 'confirm-confirmed', taskId: 'confirmed', action: 'CONFIRM', actorId: manager.id, actorName: manager.name, fromStatus: 'COMPLETED', toStatus: 'CONFIRMED', comment: null, metadata: null, createdAt: '2026-08-20T07:30:00.000Z' },
    { id: 'return-awaiting', taskId: 'awaiting', action: 'RETURN', actorId: manager.id, actorName: manager.name, fromStatus: 'COMPLETED', toStatus: 'RETURNED', comment: '补充材料', metadata: null, createdAt: '2026-08-20T08:00:00.000Z' },
    { id: 'complete-awaiting', taskId: 'awaiting', action: 'COMPLETE', actorId: employee.id, actorName: employee.name, fromStatus: 'RETURNED', toStatus: 'COMPLETED', comment: null, metadata: null, createdAt: '2026-08-20T09:00:00.000Z' },
    { id: 'return-canceled-history', taskId: 'canceled', action: 'RETURN', actorId: manager.id, actorName: manager.name, fromStatus: 'COMPLETED', toStatus: 'RETURNED', comment: '历史退回', metadata: null, createdAt: '2026-08-20T05:00:00.000Z' },
  ];
  const memory = createMemoryWorkbenchRepository({ tasks, activities, departments });
  const service = createWorkbenchQueryService({ repository: memory.repository, now: () => new Date('2026-08-20T10:00:00.000Z') });

  const summary = await service.summaryMine({ dateFrom: '2026-08-20', dateTo: '2026-08-20' }, employee);
  assert.equal(summary.code, 0);
  assert.equal(summary.data?.total, 3);
  assert.equal(summary.data?.awaitingConfirmation, 1);
  assert.equal(summary.data?.confirmed, 1);
  assert.equal(summary.data?.estimatedMinutes, 90);
  assert.equal(summary.data?.estimatedMinutesTaskCount, 2);
  assert.equal(summary.data?.dueToday, 0, '已确认任务的历史截止时间不计入今日到期');
  const summaryMetricKeys = Object.keys(summary.data || {}).filter((key) => key !== 'metricDefinitions').sort();
  assert.deepEqual(Object.keys(summary.data?.metricDefinitions || {}).sort(), summaryMetricKeys,
    '摘要的每个公开指标都必须有且只有一条口径定义');

  const cockpit = await service.cockpit({ dateFrom: '2026-08-20', dateTo: '2026-08-20' }, owner);
  assert.equal(cockpit.code, 0);
  assert.equal(cockpit.data?.confirmed, 2);
  assert.equal(cockpit.data?.awaitingConfirmation, 1);
  assert.equal(cockpit.data?.canceled, 1);
  assert.equal(cockpit.data?.completionDenominator, 3);
  assert.equal(cockpit.data?.canceledDenominator, 0);
  assert.equal(cockpit.data?.onTime, 2);
  assert.equal(cockpit.data?.onTimeDenominator, 2);
  assert.equal(cockpit.data?.historicalReturnEventCount, 2, '历史事件数可以保留取消任务的审计记录');
  assert.equal(cockpit.data?.returnedTaskCount, 1, '退回率分子必须排除取消任务，与分母使用同一人口');
  assert.equal(cockpit.data?.returnRate, 33.3);
  assert.equal(cockpit.data?.range.timeZone, 'Asia/Shanghai');
  assert.equal(cockpit.data?.metricDefinitions.completionRate.denominator, 'completionDenominator');
  assert.equal('total' in (cockpit.data || {}), false, 'cockpit total 与 created 完全重复，必须只保留一个任务数口径');
  const cockpitMetricKeys = Object.keys(cockpit.data || {})
    .filter((key) => key !== 'range' && key !== 'metricDefinitions').sort();
  assert.deepEqual(Object.keys(cockpit.data?.metricDefinitions || {}).sort(), cockpitMetricKeys,
    '驾驶舱的每个公开指标都必须有且只有一条口径定义');

  const scopedCockpit = await service.cockpit({ dateFrom: '2026-08-20', dateTo: '2026-08-20' }, manager);
  assert.equal(scopedCockpit.code, 0);
  assert.equal(scopedCockpit.data?.created, 3);
  assert.equal(scopedCockpit.data?.confirmed, 1);
  assert.equal((await service.cockpit({ dateFrom: '2026-08-20', dateTo: '2026-08-20', departmentId: 'dept-market' }, manager)).code, 403);
}

{
  const pageIds = Array.from({ length: 10 }, (_, index) => `database-page-${index + 1}`);
  const sqlCalls: Array<{ sql: string; params: unknown[] }> = [];
  const readSequence: string[] = [];
  let hydratedIds: string[] = [];
  let transactionIsolation: string | undefined;
  const readClient = {
    async $queryRawUnsafe(sql: string, ...params: unknown[]) {
      sqlCalls.push({ sql, params });
      if (/^\s*SELECT COUNT\(\*\).*FROM `employee_tasks`/s.test(sql)) {
        readSequence.push('count');
        return [{ total: 24 }];
      }
      if (/SELECT t\.`id`/s.test(sql)) {
        readSequence.push('pageIds');
        return pageIds.map((id) => ({ id }));
      }
      readSequence.push('metrics');
      assert.match(
        sql,
        /t\.`employeeId` <> \? AND JSON_CONTAINS\(COALESCE\(t\.`collaboratorIds`/,
        '本人摘要的协作任务数必须只计算“他人负责且本人协作”，不能把本人负责的任务重复计入',
      );
      return [{ total: 0 }];
    },
    employeeTask: {
      async findMany(input: any) {
        readSequence.push('hydrate');
        hydratedIds = input.where.id.in;
        return hydratedIds.map((id) => ({
          id, sourceKey: `source:${id}`, taskType: 'ACTION', priority: 'NORMAL', businessModule: 'CRM',
          employeeId: employee.id, employeeName: employee.name, departmentIdSnapshot: employee.departmentId,
          positionIdSnapshot: null, positionNameSnapshot: null, workDate: new Date('2026-08-19T16:00:00.000Z'),
          title: id, description: null, targetValue: null, actualValue: null, unit: null,
          evidenceRequired: false, status: 'PENDING', result: null, dueAt: null, returnedReason: null,
          evidence: [],
        }));
      },
    },
  };
  const prisma = {
    ...readClient,
    async $transaction<T>(work: (transaction: typeof readClient) => Promise<T>, options: { isolationLevel: string }) {
      readSequence.push('transaction:start');
      transactionIsolation = options.isolationLevel;
      const result = await work(readClient);
      readSequence.push('transaction:end');
      return result;
    },
  };
  const repository = createPrismaWorkbenchRepository(prisma as any);
  const page = await repository.listWorkbenchTasks({
    scope: { kind: 'mine', actorId: employee.id }, page: 2, pageSize: 10,
    now: new Date('2026-08-20T02:00:00.000Z'),
  });
  assert.equal(page.total, 24);
  assert.deepEqual(page.items.map((item) => item.id), pageIds);
  assert.deepEqual(hydratedIds, pageIds, '只允许回补当前数据库页的任务详情');
  const countSql = sqlCalls.find((call) => /^\s*SELECT COUNT\(\*\)/s.test(call.sql));
  assert.match(countSql?.sql || '', /t\.`employeeId` = \? OR JSON_CONTAINS\(COALESCE\(t\.`collaboratorIds`, JSON_ARRAY\(\)\), JSON_QUOTE\(\?\)\)/);
  assert.deepEqual(countSql?.params, [employee.id, employee.id], '协作人JSON查询必须重用同一服务端衍生的 actorId');
  const pageSql = sqlCalls.find((call) => /SELECT t\.`id`/s.test(call.sql));
  assert.match(pageSql?.sql || '', /LIMIT \? OFFSET \?/);
  assert.match(pageSql?.sql || '', /WHEN t\.`status` = 'RETURNED' THEN 0/);
  assert.match(pageSql?.sql || '', /WHEN t\.`status` IN \('PENDING', 'IN_PROGRESS', 'RETURNED'\).*t\.`dueAt` < \? THEN 1/s);
  assert.match(pageSql?.sql || '', /t\.`dueAt` ASC, t\.`createdAt` ASC, t\.`id` ASC/,
    '稳定排序必须以不可变任务ID作最终破平手段');
  assert.deepEqual(pageSql?.params.slice(-2), [10, 10]);
  assert.deepEqual(pageSql?.params.slice(0, 2), [employee.id, employee.id]);
  assert.equal((pageSql?.params[2] as Date).toISOString(), '2026-08-20T02:00:00.000Z');
  assert.equal((pageSql?.params[3] as Date).toISOString(), '2026-08-19T16:00:00.000Z');
  assert.equal((pageSql?.params[4] as Date).toISOString(), '2026-08-20T16:00:00.000Z');
  assert.equal(transactionIsolation, 'RepeatableRead');
  assert.deepEqual(readSequence.slice(0, 5), ['transaction:start', 'count', 'pageIds', 'hydrate', 'transaction:end'],
    '总数、页ID和当前页回填必须位于同一个短读事务快照');

  await repository.summarizeWorkbenchTasks({
    scope: { kind: 'mine', actorId: employee.id }, now: new Date('2026-08-20T02:00:00.000Z'),
  });
  const metricSql = sqlCalls.find((call) => /AS `historicalReturnEventCount`/s.test(call.sql));
  assert.match(metricSql?.sql || '', /t\.`status` <> 'CANCELED' AND COALESCE\(a\.`returnCount`, 0\) > 0.*AS `returnedTaskCount`/s);
  assert.match(metricSql?.sql || '', /COALESCE\(a\.`firstCompleteAt`, t\.`completedAt`\)/,
    '聚合查询必须在活动缺失时回退迁移任务时间戳');
  assert.match(metricSql?.sql || '', /FROM `task_activities`\s+GROUP BY `taskId`/s);
  assert.deepEqual(
    metricSql?.params.map((value) => value instanceof Date ? value.toISOString() : value),
    [
      '2026-08-20T02:00:00.000Z', '2026-08-19T16:00:00.000Z', '2026-08-20T16:00:00.000Z',
      employee.id, employee.id, '2026-08-20T02:00:00.000Z', employee.id, employee.id,
    ],
    '聚合查询参数顺序必须与上海窗口、协作口径和可见性谓词的占位符一致',
  );
}

{
  const memory = createMemoryWorkbenchRepository({
    tasks: [task('midnight-boundary', { dueAt: '2026-08-20T16:00:00.000Z' })],
  });
  const clockValues = [
    new Date('2026-08-20T15:59:00.000Z'),
    new Date('2026-08-20T16:01:00.000Z'),
  ];
  const service = createWorkbenchQueryService({
    repository: memory.repository,
    now: () => clockValues.shift() || new Date('2026-08-20T16:01:00.000Z'),
  });
  const cockpit = await service.cockpit({}, owner);
  assert.equal(cockpit.data?.range.dateFrom, '2026-08-20');
  assert.equal(cockpit.data?.range.startAt, '2026-08-19T16:00:00.000Z');
  assert.equal(cockpit.data?.range.endAtExclusive, '2026-08-20T16:00:00.000Z');
  assert.equal(cockpit.data?.overdue, 0, '同一次查询必须共享一个时钟快照，不得在上海零点前后混用两个 now');
}

{
  const memory = createMemoryWorkbenchRepository({
    tasks: [task('migrated-confirmed', {
      status: 'CONFIRMED', createdAt: '2026-08-20T00:00:00.000Z',
      startedAt: '2026-08-20T00:30:00.000Z', completedAt: '2026-08-20T01:00:00.000Z',
      confirmedAt: '2026-08-20T01:30:00.000Z', dueAt: '2026-08-20T02:00:00.000Z',
    })],
    activities: [],
  });
  const service = createWorkbenchQueryService({
    repository: memory.repository,
    now: () => new Date('2026-08-20T10:00:00.000Z'),
  });
  const cockpit = await service.cockpit({ dateFrom: '2026-08-20', dateTo: '2026-08-20' }, owner);
  assert.equal(cockpit.data?.onTime, 1, '无 COMPLETE 活动的迁移任务必须回退 completedAt');
  assert.equal(cockpit.data?.onTimeDenominator, 1);
  assert.equal(cockpit.data?.averageFirstActionMinutes, 30, '无 START 活动时回退 startedAt');
  assert.equal(cockpit.data?.firstActionDenominator, 1);
  assert.equal(cockpit.data?.averageConfirmationMinutes, 30, '无 CONFIRM 活动时回退 confirmedAt');
  assert.equal(cockpit.data?.confirmationDurationDenominator, 1);
}

console.log('workbench query service tests passed');
