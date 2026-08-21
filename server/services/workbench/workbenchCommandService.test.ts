import assert from 'node:assert/strict';
import type { AuthenticatedUser } from '../../../src/types/auth';
import type { EmployeeTask } from '../../../src/types/enterpriseBrain';
import { PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import { createMemoryWorkbenchRepository, type WorkbenchRepository } from './workbenchRepository';
import { createWorkbenchCommandService } from './workbenchCommandService';

const employee: AuthenticatedUser = {
  id: 'employee-1', name: '员工甲', account: 'employee-1', email: '', phone: '', role: '员工',
  departmentId: 'dept-sales-child', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.TASK_SELF, actions: ['read', 'write'] }],
};
const manager: AuthenticatedUser = {
  ...employee, id: 'manager-1', name: '销售经理', account: 'manager-1', role: '销售经理', departmentId: 'dept-sales',
  permissions: [
    { module: PERMISSION_KEYS.TASK_TEAM, actions: ['read'] },
    { module: PERMISSION_KEYS.TASK_ASSIGN, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.TASK_CONFIRM, actions: ['read', 'write'] },
  ],
};
const administrator: AuthenticatedUser = {
  ...employee, id: 'admin-1', name: '超级管理员', account: 'admin-1', role: '超级管理员', departmentId: undefined,
  permissions: [{ module: '全部', actions: ['admin'] }],
};

const task = (overrides: Partial<EmployeeTask> = {}): EmployeeTask => ({
  id: 'task-1', employeeId: employee.id, employeeName: employee.name,
  departmentIdSnapshot: employee.departmentId || null, positionIdSnapshot: null,
  positionNameSnapshot: null, workDate: '2026-08-20', title: '跟进客户', description: null,
  targetValue: null, actualValue: null, unit: null, evidenceRequired: false,
  status: 'PENDING', result: null, dueAt: null, returnedReason: null, evidence: [],
  ...overrides,
});
const last = <T>(items: T[]): T | undefined => items[items.length - 1];

const customerOutcome = {
  followUpSummary: '已与客户确认预算和决策人',
  nextActionTitle: '发送正式报价单',
  nextActionDueAt: '2026-08-22T03:00:00.000Z',
  opportunityStageCode: 'proposal' as const,
  opportunityAmount: 68000,
};

{
  const applied: unknown[] = [];
  const memory = createMemoryWorkbenchRepository({
    tasks: [task({ sourceType: 'COCKPIT_INTERVENTION', sourceId: 'customer-1' })],
    departments: [
      { id: 'dept-sales', parentId: null },
      { id: 'dept-sales-child', parentId: 'dept-sales' },
    ],
    applyCustomerInterventionOutcome: async (input) => { applied.push(input); },
  });
  const service = createWorkbenchCommandService({ repository: memory.repository });

  const incomplete = await service.completeTask('task-1', { result: '已处理' }, employee);
  assert.equal(incomplete.code, 400, '客户介入任务必须提交结构化处理结果');

  const completed = await service.completeTask('task-1', {
    result: customerOutcome.followUpSummary,
    customerOutcome,
  }, employee);
  assert.equal(completed.code, 0);
  assert.equal(completed.data?.evidence.some((item) => item.type === 'CUSTOMER_OUTCOME'), true);
  assert.equal(applied.length, 0, '员工提交时不得提前回写客户');

  const confirmed = await service.confirmTask('task-1', { comment: '结果合格' }, manager);
  assert.equal(confirmed.code, 0);
  assert.equal(applied.length, 1, '老板验收后必须回写客户并触发风险重算');
}

{
  const memory = createMemoryWorkbenchRepository({
    tasks: [task({ status: 'COMPLETED', sourceType: 'COCKPIT_INTERVENTION', sourceId: 'customer-1', evidence: [] })],
    departments: [
      { id: 'dept-sales', parentId: null },
      { id: 'dept-sales-child', parentId: 'dept-sales' },
    ],
  });
  const service = createWorkbenchCommandService({ repository: memory.repository });
  const rejected = await service.confirmTask('task-1', {}, manager);
  assert.equal(rejected.code, 409);
  assert.equal(memory.tasks[0]?.status, 'COMPLETED', '结构化结果无效时不得提前确认任务');
}

{
  const memory = createMemoryWorkbenchRepository({ tasks: [task()] });
  const service = createWorkbenchCommandService({
    repository: memory.repository,
    now: () => new Date('2026-08-20T09:00:00.000Z'),
  });

  const started = await service.startTask('task-1', employee);
  assert.equal(started.code, 0);
  assert.equal(started.data?.status, 'IN_PROGRESS');
  assert.equal(last(memory.activities)?.action, 'START');

  const denied = await service.startTask('task-other', employee);
  assert.equal(denied.code, 404);
}

{
  const memory = createMemoryWorkbenchRepository({ tasks: [task({ evidenceRequired: true })] });
  const service = createWorkbenchCommandService({ repository: memory.repository });

  const completed = await service.completeTask('task-1', {
    result: '已完成客户跟进',
    actualValue: null,
    evidence: [{ type: 'PUBLISH_URL', content: 'https://example.com/result' }],
    comment: '请主管确认',
  }, employee);

  assert.equal(completed.code, 0);
  assert.equal(completed.data?.status, 'COMPLETED');
  assert.equal(completed.data?.evidence[0]?.content, 'https://example.com/result');
  assert.equal(last(memory.activities)?.action, 'COMPLETE');
  assert.equal(last(memory.activities)?.comment, '请主管确认');
}

{
  const memory = createMemoryWorkbenchRepository({
    tasks: [
      task({ status: 'COMPLETED' }),
      task({ id: 'task-outside', status: 'COMPLETED', departmentIdSnapshot: 'dept-market' }),
    ],
    departments: [
      { id: 'dept-sales', parentId: null },
      { id: 'dept-sales-child', parentId: 'dept-sales' },
      { id: 'dept-market', parentId: null },
    ],
  });
  const service = createWorkbenchCommandService({ repository: memory.repository });

  const confirmed = await service.confirmTask('task-1', { qualityScore: 90, comment: '结果合格' }, manager);
  assert.equal(confirmed.code, 0);
  assert.equal(confirmed.data?.status, 'CONFIRMED');
  assert.equal(confirmed.data?.qualityScore, 90);
  assert.equal(last(memory.activities)?.action, 'CONFIRM');

  const denied = await service.confirmTask('task-outside', {}, manager);
  assert.equal(denied.code, 403);
}

{
  const memory = createMemoryWorkbenchRepository({
    tasks: [task({ status: 'COMPLETED' })],
    departments: [
      { id: 'dept-sales', parentId: null },
      { id: 'dept-sales-child', parentId: 'dept-sales' },
    ],
  });
  const service = createWorkbenchCommandService({ repository: memory.repository });

  const missingReason = await service.returnTask('task-1', { reason: '' }, manager);
  assert.equal(missingReason.code, 400);
  const longReason = await service.returnTask('task-1', { reason: 'x'.repeat(501) }, manager);
  assert.equal(longReason.code, 400);

  const returned = await service.returnTask('task-1', { reason: '证据不清晰' }, manager);
  assert.equal(returned.code, 0);
  assert.equal(returned.data?.status, 'RETURNED');
  assert.equal(returned.data?.returnedReason, '证据不清晰');
  assert.equal(last(memory.activities)?.action, 'RETURN');
}

{
  const memory = createMemoryWorkbenchRepository({
    tasks: [task({ remindedAt: '2026-08-20T08:00:00.000Z', lastOverdueNotifiedAt: '2026-08-20T09:00:00.000Z' })],
    employees: [
      { id: 'employee-2', name: '员工乙', departmentId: 'dept-sales-child', departmentName: '销售一部', isActive: true },
      { id: 'outside', name: '外部员工', departmentId: 'dept-market', isActive: true },
    ],
    departments: [
      { id: 'dept-sales', parentId: null },
      { id: 'dept-sales-child', parentId: 'dept-sales' },
      { id: 'dept-market', parentId: null },
    ],
  });
  let notificationRecipients: string[] = [];
  const service = createWorkbenchCommandService({
    repository: memory.repository,
    notify: async (event) => { notificationRecipients = event.recipientIds; },
  });

  const denied = await service.reassignTask('task-1', { employeeId: 'outside', reason: '调整分工' }, manager);
  assert.equal(denied.code, 403);

  const reassigned = await service.reassignTask('task-1', { employeeId: 'employee-2', reason: '调整分工' }, manager);
  assert.equal(reassigned.code, 0);
  assert.equal(reassigned.data?.employeeId, 'employee-2');
  assert.equal(reassigned.data?.departmentIdSnapshot, 'dept-sales-child');
  assert.equal(memory.tasks[0]?.departmentNameSnapshot, '销售一部', '内存仓储必须与 Prisma 一样保留转派部门名称快照');
  assert.equal(memory.tasks[0]?.remindedAt, null, '转派后新负责人必须重新获得临期提醒');
  assert.equal(memory.tasks[0]?.lastOverdueNotifiedAt, null, '转派后新负责人必须重新获得逾期提醒');
  assert.equal(last(memory.activities)?.action, 'REASSIGN');
  assert.deepEqual(last(memory.activities)?.metadata, {
    previousEmployeeId: 'employee-1',
    previousEmployeeName: '员工甲',
    employeeId: 'employee-2',
    employeeName: '员工乙',
  });
  assert.deepEqual(notificationRecipients, ['employee-1', 'employee-2'], '转派必须通知原负责人和新负责人');
}

{
  const memory = createMemoryWorkbenchRepository({ tasks: [task()] });
  let notificationAttempts = 0;
  let notificationActivityId: string | undefined;
  const service = createWorkbenchCommandService({
    repository: memory.repository,
    notify: async (event) => {
      notificationAttempts += 1;
      notificationActivityId = event.activity?.id;
      assert.equal(memory.tasks[0]?.status, 'IN_PROGRESS', '通知必须在事务提交后调用');
      assert.equal(last(memory.activities)?.action, 'START', '通知时活动记录必须已提交');
      throw new Error('通知服务不可用');
    },
  });

  const started = await service.startTask('task-1', employee);
  assert.equal(notificationAttempts, 1);
  assert.equal(notificationActivityId, last(memory.activities)?.id, '通知必须携带已提交的不可变活动 ID');
  assert.equal(started.code, 0, '通知失败不得回滚任务');
  assert.equal(memory.tasks[0]?.status, 'IN_PROGRESS');
}

{
  const memory = createMemoryWorkbenchRepository({
    tasks: [task()],
    departments: [
      { id: 'dept-sales', parentId: null },
      { id: 'dept-sales-child', parentId: 'dept-sales' },
    ],
  });
  let markerWasUnsetAtPublish = false;
  const service = createWorkbenchCommandService({
    repository: memory.repository,
    now: () => new Date('2026-08-20T10:00:00.000Z'),
    notify: async (event) => {
      markerWasUnsetAtPublish = !memory.tasks[0]?.remindedAt;
      return { task: { ...event.task, remindedAt: event.activity.createdAt } };
    },
  });

  const reminded = await service.remindTask('task-1', manager);
  assert.equal(reminded.code, 0);
  assert.equal(markerWasUnsetAtPublish, true, '通知成功前不得写入催办时间');
  assert.equal(reminded.data?.remindedAt, '2026-08-20T10:00:00.000Z');
  assert.equal(last(memory.activities)?.action, 'REMIND');
  assert.equal(last(memory.activities)?.fromStatus, 'PENDING');
  assert.equal(last(memory.activities)?.toStatus, 'PENDING');
  assert.deepEqual(last(memory.activities)?.metadata, {
    expectedEmployeeId: 'employee-1',
    expectedDepartmentIdSnapshot: 'dept-sales-child',
    expectedDueAt: null,
    expectedWorkDate: '2026-08-20',
    expectedSourceVersion: null,
  });
}

{
  const memory = createMemoryWorkbenchRepository({
    tasks: [task()],
    departments: [
      { id: 'dept-sales', parentId: null },
      { id: 'dept-sales-child', parentId: 'dept-sales' },
    ],
  });
  const service = createWorkbenchCommandService({
    repository: memory.repository,
    now: () => new Date('2026-08-20T10:00:00.000Z'),
    notify: async () => { throw new Error('notification unavailable'); },
  });

  const reminded = await service.remindTask('task-1', manager);
  assert.equal(reminded.code, 0, '通知失败不得回滚已提交的催办活动');
  assert.equal(memory.tasks[0]?.remindedAt, undefined, '通知失败必须保留无标记的可重试状态');
  assert.equal(last(memory.activities)?.action, 'REMIND');
}

{
  const memory = createMemoryWorkbenchRepository({
    tasks: [task({ status: 'IN_PROGRESS' })],
    departments: [
      { id: 'dept-sales', parentId: null },
      { id: 'dept-sales-child', parentId: 'dept-sales' },
    ],
  });
  const service = createWorkbenchCommandService({
    repository: memory.repository,
    now: () => new Date('2026-08-20T11:00:00.000Z'),
  });

  const canceled = await service.cancelTask('task-1', { reason: '来源业务已终止' }, manager);
  assert.equal(canceled.code, 0);
  assert.equal(canceled.data?.status, 'CANCELED');
  assert.equal(canceled.data?.canceledById, manager.id);
  assert.equal(canceled.data?.canceledReason, '来源业务已终止');
  assert.equal(last(memory.activities)?.action, 'CANCEL');
}

{
  const memory = createMemoryWorkbenchRepository({ tasks: [task({ status: 'CONFIRMED' })] });
  const service = createWorkbenchCommandService({ repository: memory.repository });

  const denied = await service.reopenTask('task-1', { reason: '重新执行' }, manager);
  assert.equal(denied.code, 403, '已确认任务必须拒绝普通重开');
  assert.equal(memory.tasks[0]?.status, 'CONFIRMED');

  const reopened = await service.reopenTask('task-1', { reason: '业务治理重开' }, administrator);
  assert.equal(reopened.code, 0);
  assert.equal(reopened.data?.status, 'PENDING');
  assert.equal(last(memory.activities)?.action, 'REOPEN');
  assert.equal(last(memory.activities)?.fromStatus, 'CONFIRMED');
}

{
  const memory = createMemoryWorkbenchRepository({
    tasks: [task({ evidenceRequired: true }), task({ id: 'task-other', employeeId: 'employee-2' })],
  });
  const service = createWorkbenchCommandService({ repository: memory.repository });

  const invalidUrl = await service.completeTask('task-1', {
    result: '已完成', evidence: [{ type: 'PUBLISH_URL', content: 'javascript:alert(1)' }],
  }, employee);
  assert.equal(invalidUrl.code, 400);
  const longComment = await service.completeTask('task-1', {
    result: '已完成', evidence: [{ type: 'TEXT', content: '证据' }], comment: 'x'.repeat(501),
  }, employee);
  assert.equal(longComment.code, 400);
  const otherTask = await service.completeTask('task-other', { result: '已完成' }, employee);
  assert.equal(otherTask.code, 404);
  assert.equal(memory.activities.length, 0, '校验失败不得写入活动');
}

{
  const memory = createMemoryWorkbenchRepository({ tasks: [
    task({ evidenceRequired: true }),
    task({ id: 'task-lowercase-valid', evidenceRequired: true }),
    task({ id: 'task-mixed-valid', evidenceRequired: true }),
    task({ id: 'task-unknown', evidenceRequired: true }),
  ] });
  const service = createWorkbenchCommandService({ repository: memory.repository });

  const lowercaseBypass = await service.completeTask('task-1', {
    result: '已完成', evidence: [{ type: 'publish_url', content: 'javascript:alert(1)' }],
  }, employee);
  assert.equal(lowercaseBypass.code, 400, '小写 URL 证据类型不得绕过协议校验');
  assert.equal(memory.tasks[0]?.status, 'PENDING');

  const lowercaseValid = await service.completeTask('task-lowercase-valid', {
    result: '已完成', evidence: [{ type: 'url', content: 'https://example.com/evidence' }],
  }, employee);
  assert.equal(lowercaseValid.code, 0);
  assert.equal(lowercaseValid.data?.evidence[0]?.type, 'URL', '证据类型应持久化为规范大写值');

  const mixedCaseValid = await service.completeTask('task-mixed-valid', {
    result: '已完成', evidence: [{ type: 'ScreenShot_Url', content: 'http://example.com/screenshot' }],
  }, employee);
  assert.equal(mixedCaseValid.code, 0);
  assert.equal(mixedCaseValid.data?.evidence[0]?.type, 'SCREENSHOT_URL');

  const unknownType = await service.completeTask('task-unknown', {
    result: '已完成', evidence: [{ type: 'CUSTOM_HTML', content: '<script />' }],
  }, employee);
  assert.equal(unknownType.code, 400, '未知证据类型必须拒绝');
}

{
  const memory = createMemoryWorkbenchRepository({ tasks: [task({ evidenceRequired: true })] });
  const service = createWorkbenchCommandService({ repository: memory.repository });
  const overLimit = await service.completeTask('task-1', {
    result: '已完成',
    evidence: Array.from({ length: 21 }, (_, index) => ({ type: 'TEXT', content: `证据-${index + 1}` })),
  }, employee);
  assert.equal(overLimit.code, 400, '单次完成最多接受20条证据');
  assert.equal(memory.tasks[0]?.status, 'PENDING');
  assert.equal(memory.activities.length, 0);
}

{
  let batchCalls = 0;
  let singularCalls = 0;
  const memory = createMemoryWorkbenchRepository({
    tasks: [task({ evidenceRequired: true })],
  });
  const authorizeEvidenceReferences = async (input: { evidence: Array<{ referenceId?: string }> }) => {
    batchCalls += 1;
    assert.deepEqual(input.evidence.map((item) => item.referenceId), ['attachment-allowed']);
    return true;
  };
  const repository = {
    ...memory.repository,
    authorizeEvidenceReferences,
    transaction(work: (transaction: any) => Promise<any>) {
      return memory.repository.transaction((transaction) => work({
        ...transaction,
        authorizeEvidenceReferences,
        async authorizeEvidenceReference() {
          singularCalls += 1;
          return true;
        },
      } as any));
    },
  } as WorkbenchRepository;
  const service = createWorkbenchCommandService({ repository });

  const completed = await service.completeTask('task-1', {
    result: '已完成',
    evidence: [
      { type: 'attachment', referenceId: 'attachment-allowed' },
      { type: 'ATTACHMENT', referenceId: 'attachment-allowed' },
      { type: 'text', content: '同一文本' },
      { type: 'TEXT', content: '同一文本' },
    ],
  }, employee);
  assert.equal(completed.code, 0);
  assert.equal(batchCalls, 1, '重复引用必须只进入一次批量授权');
  assert.equal(singularCalls, 0, '不得回退为逐条授权');
  assert.equal(completed.data?.evidence.length, 2, '规范化后重复证据只保留一条');
}

{
  const authorizationCalls: string[] = [];
  const memory = createMemoryWorkbenchRepository({
    tasks: [
      task({ id: 'task-attachment-allowed', evidenceRequired: true }),
      task({ id: 'task-attachment-denied', evidenceRequired: true }),
      task({ id: 'task-record-allowed', evidenceRequired: true }),
      task({ id: 'task-record-denied', evidenceRequired: true }),
      task({ id: 'task-plain-text', evidenceRequired: true }),
      task({ id: 'task-plain-url', evidenceRequired: true }),
    ],
    authorizeEvidenceReferences: async ({ task: lockedTask, evidence, actor }) => {
      assert.equal(evidence.length, 1);
      authorizationCalls.push(`${lockedTask.id}:${evidence[0]?.type}:${evidence[0]?.referenceId}:${actor.id}`);
      assert.equal(lockedTask.status, 'PENDING', '引用授权必须在任务锁定后、更新前执行');
      return evidence[0]?.referenceId?.endsWith('-allowed') || false;
    },
  });
  const service = createWorkbenchCommandService({ repository: memory.repository });

  const allowedAttachment = await service.completeTask('task-attachment-allowed', {
    result: '已完成', evidence: [{ type: 'attachment', referenceId: 'attachment-allowed' }],
  }, employee);
  assert.equal(allowedAttachment.code, 0);
  const deniedAttachment = await service.completeTask('task-attachment-denied', {
    result: '已完成', evidence: [{ type: 'ATTACHMENT', referenceId: 'attachment-denied' }],
  }, employee);
  assert.equal(deniedAttachment.code, 403, '无权附件引用必须失败关闭');

  const allowedRecord = await service.completeTask('task-record-allowed', {
    result: '已完成', evidence: [{ type: 'business_record', referenceId: 'record-allowed' }],
  }, employee);
  assert.equal(allowedRecord.code, 0);
  const deniedRecord = await service.completeTask('task-record-denied', {
    result: '已完成', evidence: [{ type: 'BUSINESS_RECORD', referenceId: 'record-denied' }],
  }, employee);
  assert.equal(deniedRecord.code, 403, '无权业务记录引用必须失败关闭');

  assert.equal((await service.completeTask('task-plain-text', {
    result: '已完成', evidence: [{ type: 'TEXT', content: '纯文本证据' }],
  }, employee)).code, 0);
  assert.equal((await service.completeTask('task-plain-url', {
    result: '已完成', evidence: [{ type: 'URL', content: 'https://example.com/plain' }],
  }, employee)).code, 0);
  assert.equal(authorizationCalls.length, 4, '纯文本和纯 URL 证据不应进入引用授权');
}

{
  const memory = createMemoryWorkbenchRepository({ tasks: [task()] });
  const repository: WorkbenchRepository = {
    ...memory.repository,
    transaction(work) {
      return memory.repository.transaction((transaction) => work({
        ...transaction,
        async appendActivity() { throw new Error('活动写入失败'); },
      }));
    },
  };
  const service = createWorkbenchCommandService({ repository });

  await assert.rejects(() => service.startTask('task-1', employee), /活动写入失败/);
  assert.equal(memory.tasks[0]?.status, 'PENDING', '活动写入失败必须回滚任务更新');
  assert.equal(memory.activities.length, 0);
}

console.log('workbench command service tests passed');
