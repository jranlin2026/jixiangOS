import assert from 'node:assert/strict';
import type { AuthenticatedUser } from '../../../src/types/auth';
import { PERMISSION_KEYS } from '../../../src/shared/utils/permissions';
import { createWorkbenchCommandService } from './workbenchCommandService';
import { createPrismaWorkbenchRepository } from './prismaWorkbenchRepository';

const actor: AuthenticatedUser = {
  id: 'employee-1', name: '员工甲', account: 'employee-1', email: '', phone: '', role: '员工',
  departmentId: 'dept-sales', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.TASK_SELF, actions: ['read', 'write'] }],
};

const initialTask = () => ({
  id: 'task-1', sourceKey: 'legacy:employee_task:task-1', taskType: 'ACTION', priority: 'NORMAL',
  businessModule: 'GENERAL', sourceRoute: null, sourceLabel: null,
  employeeId: actor.id, employeeName: actor.name, departmentIdSnapshot: actor.departmentId,
  positionIdSnapshot: null, positionNameSnapshot: null, workDate: new Date('2026-08-20T00:00:00.000Z'),
  title: '跟进客户', description: null, targetValue: null, actualValue: null, unit: null,
  evidenceRequired: true, status: 'PENDING', result: null, dueAt: null, returnedReason: null,
  startedAt: null, completedAt: null, confirmedAt: null, confirmedById: null, confirmedByName: null,
  canceledAt: null, canceledById: null, canceledReason: null, collaboratorIds: null,
  estimatedMinutes: null, qualityScore: null, qualityComment: null, remindedAt: null,
  lastOverdueNotifiedAt: null, sourceType: null, sourceId: null, sourceItemId: null, sourceVersion: null,
});

function createTransactionalPrismaHarness(failActivity = false) {
  const calls: string[] = [];
  let committedTask = initialTask();
  let committedEvidence: any[] = [];
  let committedActivities: any[] = [];
  let transactionActive = false;

  const prisma = {
    async $transaction(work: (transaction: any) => Promise<any>, options: unknown) {
      assert.deepEqual(options, { isolationLevel: 'Serializable' });
      calls.push('BEGIN');
      const stagedTask = structuredClone(committedTask);
      const stagedEvidence = structuredClone(committedEvidence);
      const stagedActivities = structuredClone(committedActivities);
      transactionActive = true;
      const transaction = {
        async $queryRawUnsafe(query: string, taskId: string) {
          assert.equal(transactionActive, true, '行锁必须在事务内获取');
          assert.match(query, /FOR UPDATE/);
          assert.equal(taskId, 'task-1');
          calls.push('LOCK');
          return [{ id: taskId }];
        },
        employeeTask: {
          async findUnique() {
            calls.push('FIND_TASK');
            return { ...structuredClone(stagedTask), evidence: structuredClone(stagedEvidence) };
          },
          async updateMany({ data }: any) {
            calls.push('UPDATE_TASK');
            Object.assign(stagedTask, data);
            return { count: 1 };
          },
        },
        taskEvidence: {
          async deleteMany() {
            calls.push('DELETE_EVIDENCE');
            stagedEvidence.splice(0, stagedEvidence.length);
          },
          async createMany({ data }: any) {
            calls.push('CREATE_EVIDENCE');
            stagedEvidence.push(...data.map((item: any) => ({ ...item, createdAt: new Date('2026-08-20T09:00:00.000Z') })));
            return { count: data.length };
          },
        },
        taskActivity: {
          async create({ data }: any) {
            calls.push('CREATE_ACTIVITY');
            if (failActivity) throw new Error('活动写入失败');
            const row = { ...data, createdAt: data.createdAt || new Date('2026-08-20T09:00:00.000Z') };
            stagedActivities.push(row);
            return row;
          },
        },
        user: { findUnique: async () => null, findMany: async () => [] },
        role: { findMany: async () => [] },
        department: { findUnique: async () => null, findMany: async () => [] },
        businessRecord: { findUnique: async () => null },
      };
      try {
        const result = await work(transaction);
        committedTask = stagedTask;
        committedEvidence = stagedEvidence;
        committedActivities = stagedActivities;
        calls.push('COMMIT');
        return result;
      } catch (error) {
        calls.push('ROLLBACK');
        throw error;
      } finally {
        transactionActive = false;
      }
    },
    employeeTask: {}, taskEvidence: {}, taskActivity: {}, user: {}, role: {}, department: {}, businessRecord: {},
  };

  return {
    prisma,
    calls,
    state: () => ({ task: committedTask, evidence: committedEvidence, activities: committedActivities }),
  };
}

{
  const harness = createTransactionalPrismaHarness();
  const service = createWorkbenchCommandService({
    repository: createPrismaWorkbenchRepository(harness.prisma as any),
    now: () => new Date('2026-08-20T09:00:00.000Z'),
  });

  const completed = await service.completeTask('task-1', {
    result: '已完成', evidence: [{ type: 'TEXT', content: '可验证结果' }],
  }, actor);
  assert.equal(completed.code, 0);
  assert.deepEqual(harness.calls, [
    'BEGIN', 'LOCK', 'FIND_TASK', 'UPDATE_TASK', 'DELETE_EVIDENCE',
    'CREATE_EVIDENCE', 'FIND_TASK', 'CREATE_ACTIVITY', 'COMMIT',
  ]);
  assert.equal(harness.state().task.status, 'COMPLETED');
  assert.equal(harness.state().evidence.length, 1);
  assert.equal(harness.state().activities.length, 1);
}

{
  const harness = createTransactionalPrismaHarness(true);
  const service = createWorkbenchCommandService({
    repository: createPrismaWorkbenchRepository(harness.prisma as any),
  });

  await assert.rejects(() => service.completeTask('task-1', {
    result: '已完成', evidence: [{ type: 'TEXT', content: '可验证结果' }],
  }, actor), /活动写入失败/);
  assert.equal(harness.calls[1], 'LOCK');
  assert.equal(harness.calls[harness.calls.length - 1], 'ROLLBACK');
  assert.equal(harness.state().task.status, 'PENDING', '回滚后任务状态必须保持原值');
  assert.equal(harness.state().evidence.length, 0, '回滚后证据不得泄漏提交');
  assert.equal(harness.state().activities.length, 0, '回滚后活动不得泄漏提交');
}

{
  const scopedActor: AuthenticatedUser = {
    ...actor,
    roleId: 'role-bounded',
    permissions: [
      ...actor.permissions,
      { module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read'] },
      { module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.LEADS_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY, actions: ['read'] },
      { module: PERMISSION_KEYS.DELIVERY_CENTER, actions: ['read'] },
    ],
  };
  const attachment = (id: string, category: string, draftKey: string) => ({
    domain: 'jixiang_os_business_attachments', recordId: id,
    data: {
      id, name: `${id}.png`, mimeType: 'image/png', size: 1, category,
      uploadedById: 'employee-other', uploadedByName: '其他员工',
      uploadedAt: '2026-08-20T08:00:00.000Z', storageName: `${id}.png`, draftKey,
    },
  });
  const attachments = new Map<string, any>([
    ['order-in-file', attachment('order-in-file', 'order-payment-proof', 'order-in')],
    ['order-out-file', attachment('order-out-file', 'order-payment-proof', 'order-out')],
    ['zero-file', attachment('zero-file', 'order-payment-proof', 'order-missing')],
    ['ambiguous-file', attachment('ambiguous-file', 'order-payment-proof', 'order-ambiguous-a')],
    ['recovery-file', attachment('recovery-file', 'recovery-payment-proof', 'recovery-in')],
    ['delivery-file', attachment('delivery-file', 'delivery-task-file', 'delivery-in:delivery-task-1')],
    ['academy-file', attachment('academy-file', 'academy-task-evidence', 'academy-task:task-1')],
  ]);
  const embedded = (id: string, category: string) => ({ id, category });
  const businessRows = new Map<string, any>([
    ['aaos_orders:order-in', {
      id: 'aaos_orders:order-in', domain: 'aaos_orders', recordId: 'order-in',
      data: { id: 'order-in', salesId: scopedActor.id, owner: scopedActor.name, payments: [{ id: 'p1', attachments: [embedded('order-in-file', 'order-payment-proof')] }] },
    }],
    ['aaos_orders:order-out', {
      id: 'aaos_orders:order-out', domain: 'aaos_orders', recordId: 'order-out',
      data: { id: 'order-out', salesId: 'employee-other', owner: '其他员工', payments: [{ id: 'p2', attachments: [embedded('order-out-file', 'order-payment-proof')] }] },
    }],
    ['aaos_orders:order-ambiguous-a', {
      id: 'aaos_orders:order-ambiguous-a', domain: 'aaos_orders', recordId: 'order-ambiguous-a',
      data: { id: 'order-ambiguous-a', salesId: scopedActor.id, owner: scopedActor.name, payments: [{ id: 'pa', attachments: [embedded('ambiguous-file', 'order-payment-proof')] }] },
    }],
    ['aaos_orders:order-ambiguous-b', {
      id: 'aaos_orders:order-ambiguous-b', domain: 'aaos_orders', recordId: 'order-ambiguous-b',
      data: { id: 'order-ambiguous-b', salesId: scopedActor.id, owner: scopedActor.name, payments: [{ id: 'pb', attachments: [embedded('ambiguous-file', 'order-payment-proof')] }] },
    }],
    ['aaos_recovery_orders:recovery-in', {
      id: 'aaos_recovery_orders:recovery-in', domain: 'aaos_recovery_orders', recordId: 'recovery-in',
      data: { id: 'recovery-in', recoveryUserId: scopedActor.id, recoveryUserName: scopedActor.name, createdBy: scopedActor.id, createdByName: scopedActor.name, recoveryAttachments: [embedded('recovery-file', 'recovery-payment-proof')] },
    }],
    ['aaos_deliveries:delivery-in', {
      id: 'aaos_deliveries:delivery-in', domain: 'aaos_deliveries', recordId: 'delivery-in',
      data: { id: 'delivery-in', ownerId: scopedActor.id, owner: scopedActor.name, tasks: [{ id: 'delivery-task-1', attachments: [embedded('delivery-file', 'delivery-task-file')] }] },
    }],
    ['aaos_customers:customer-active', {
      id: 'aaos_customers:customer-active', domain: 'aaos_customers', recordId: 'customer-active',
      data: { id: 'customer-active', ownerId: scopedActor.id, owner: scopedActor.name },
    }],
    ['aaos_customers:customer-deleted-bounded', {
      id: 'aaos_customers:customer-deleted-bounded', domain: 'aaos_customers', recordId: 'customer-deleted-bounded',
      data: { id: 'customer-deleted-bounded', ownerId: scopedActor.id, owner: scopedActor.name, deletedAt: '2026-08-19T00:00:00.000Z' },
    }],
    ['aaos_customers:customer-merged-bounded', {
      id: 'aaos_customers:customer-merged-bounded', domain: 'aaos_customers', recordId: 'customer-merged-bounded', mergedIntoId: 'customer-active',
      data: { id: 'customer-merged-bounded', ownerId: scopedActor.id, owner: scopedActor.name },
    }],
  ]);
  const leadRows = new Map<string, any>([
    ['lead-active-bounded', { id: 'lead-active-bounded', data: { id: 'lead-active-bounded', owner: scopedActor.name, inputBy: scopedActor.name } }],
    ['lead-deleted-bounded', { id: 'lead-deleted-bounded', data: { id: 'lead-deleted-bounded', owner: scopedActor.name, inputBy: scopedActor.name, deletedAt: '2026-08-19T00:00:00.000Z' } }],
  ]);
  const academyLinks = new Map<string, any>([
    ['task-1', { domain: 'academy_task_attachments', recordId: 'task-1', data: { taskId: 'task-1', attachmentIds: ['academy-file'] } }],
  ]);
  const counts = { attachmentLookups: 0, backingLookups: 0, directLookups: 0, leadLookups: 0, users: 0, roles: 0, departments: 0 };
  const inValues = (value: unknown): string[] => Array.isArray((value as any)?.in) ? (value as any).in.map(String) : [];
  const transaction: any = {
    businessRecord: {
      async findMany({ where }: any) {
        if (where.domain === 'jixiang_os_business_attachments') {
          counts.attachmentLookups += 1;
          const ids = inValues(where.recordId);
          assert.ok(ids.length > 0 && ids.length <= 20, '附件查询必须使用有界索引 ID 集合');
          return ids.map((id) => attachments.get(id)).filter(Boolean);
        }
        if (where.id) {
          counts.directLookups += 1;
          const ids = inValues(where.id);
          assert.ok(ids.length > 0 && ids.length <= 20, '业务引用必须使用有界主键集合');
          return ids.map((id) => businessRows.get(id)).filter(Boolean);
        }
        counts.backingLookups += 1;
        const ids = inValues(where.recordId);
        assert.ok(ids.length > 0 && ids.length <= 60, '背景记录查询必须命中 domain+recordId 索引且保持有界');
        if (where.domain === 'academy_task_attachments') return ids.map((id) => academyLinks.get(id)).filter(Boolean);
        return ids.map((id) => businessRows.get(`${where.domain}:${id}`)).filter(Boolean);
      },
    },
    leadRecord: {
      async findMany({ where }: any) {
        counts.leadLookups += 1;
        return inValues(where.id).map((id) => leadRows.get(id)).filter(Boolean);
      },
    },
    user: { findMany: async () => { counts.users += 1; return [{ id: scopedActor.id, name: scopedActor.name, account: scopedActor.account, email: '', phone: '', role: scopedActor.role, avatar: null, departmentId: scopedActor.departmentId, positionId: null, positionName: null, roleId: scopedActor.roleId, passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, mustChangePassword: false, lastLoginAt: null, isActive: true, employmentStatus: 'active', leftAt: null, leftBy: null, createdAt: new Date(), updatedAt: new Date() }]; } },
    role: { findMany: async () => { counts.roles += 1; return [{ id: 'role-bounded', name: '员工', code: 'employee', description: null, departmentId: null, permissions: scopedActor.permissions, dataScopes: { orders: 'self', customers: 'self', leads: 'self', deliveries: 'self', recoveryOrders: 'self' }, memberCount: 1, isActive: true, createdAt: new Date(), updatedAt: new Date() }]; } },
    department: { findMany: async () => { counts.departments += 1; return [{ id: 'dept-sales', parentId: null, isActive: true }]; } },
    employeeTask: {}, taskEvidence: {}, taskActivity: {},
  };
  const repository = createPrismaWorkbenchRepository({
    ...transaction,
    $transaction: async (work: (client: any) => Promise<any>) => work(transaction),
  } as any);
  const lockedTask = {
    ...initialTask(), workDate: '2026-08-20', evidence: [],
  } as any;
  const authorize = (evidence: Array<{ type: string; referenceId: string }>, taskPatch: Record<string, unknown> = {}) => (
    repository.transaction((client) => client.authorizeEvidenceReferences({
      task: { ...lockedTask, ...taskPatch }, evidence, actor: scopedActor,
    }))
  );
  const ref = (type: string, referenceId: string) => ({ type, referenceId });

  assert.equal(await authorize([ref('ATTACHMENT', 'zero-file')]), false, '零条背景记录必须失败关闭');
  assert.equal(await authorize([ref('ATTACHMENT', 'ambiguous-file')], { sourceId: 'order-ambiguous-b' }), false, '多条背景记录必须失败关闭');
  assert.equal(await authorize([ref('ATTACHMENT', 'order-in-file')]), true);
  assert.equal(await authorize([ref('ATTACHMENT', 'order-out-file')]), false);
  assert.equal(await authorize([ref('ATTACHMENT', 'recovery-file')]), true, '范围内挽回凭证应通过背景单据授权');
  assert.equal(await authorize([ref('ATTACHMENT', 'delivery-file')]), true, '范围内交付任务附件应通过背景单据授权');
  assert.equal(await authorize([ref('ATTACHMENT', 'academy-file')]), true, '有效商学院任务链接应通过');

  const duplicateBefore = { ...counts };
  assert.equal(await authorize([
    ref('ATTACHMENT', 'order-in-file'), ref('ATTACHMENT', 'order-in-file'), ref('ATTACHMENT', 'order-in-file'),
  ]), true);
  assert.equal(counts.attachmentLookups - duplicateBefore.attachmentLookups, 1, '重复附件不得重复查找');
  assert.equal(counts.backingLookups - duplicateBefore.backingLookups, 1, '重复附件不得重复扫描背景记录');
  assert.equal(counts.users - duplicateBefore.users, 1, '同一批次目录只加载一次');
  assert.equal(counts.roles - duplicateBefore.roles, 1);
  assert.equal(counts.departments - duplicateBefore.departments, 1);

  const scopeBefore = { ...counts };
  assert.equal(await authorize([
    ref('BUSINESS_RECORD', 'aaos_orders:order-in'),
    ref('BUSINESS_RECORD', 'aaos_customers:customer-active'),
    ref('BUSINESS_RECORD', 'aaos_leads:lead-active-bounded'),
  ]), true);
  assert.equal(counts.users - scopeBefore.users, 1, '跨域批量也只加载一次行权限目录');
  assert.equal(counts.roles - scopeBefore.roles, 1);
  assert.equal(counts.departments - scopeBefore.departments, 1);
  assert.equal(await authorize([ref('BUSINESS_RECORD', 'aaos_customers:customer-deleted-bounded')]), false);
  assert.equal(await authorize([ref('BUSINESS_RECORD', 'aaos_customers:customer-merged-bounded')]), false);
  assert.equal(await authorize([ref('BUSINESS_RECORD', 'aaos_leads:lead-deleted-bounded')]), false);
}

{
  const scopedActor: AuthenticatedUser = {
    ...actor,
    roleId: 'role-employee',
    permissions: [
      ...actor.permissions,
      { module: PERMISSION_KEYS.ORDER_MANAGE, actions: ['read'] },
      { module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.LEADS_LIST, actions: ['read'] },
    ],
  };
  const rows = new Map<string, any>([
    ['attachment-allowed', {
      domain: 'jixiang_os_business_attachments', recordId: 'attachment-allowed',
      data: {
        id: 'attachment-allowed', name: '允许附件', mimeType: 'image/png', size: 1,
        category: 'order-payment-proof', uploadedById: scopedActor.id, uploadedByName: scopedActor.name,
        uploadedAt: '2026-08-20T08:00:00.000Z', storageName: 'attachment-allowed.png', draftKey: 'order-allowed',
      },
    }],
    ['attachment-denied', {
      domain: 'jixiang_os_business_attachments', recordId: 'attachment-denied',
      data: {
        id: 'attachment-denied', name: '拒绝附件', mimeType: 'image/png', size: 1,
        category: 'academy-task-evidence', uploadedById: 'employee-other', uploadedByName: '其他员工',
        uploadedAt: '2026-08-20T08:00:00.000Z', storageName: 'attachment-denied.png', draftKey: 'academy-task:task-other',
      },
    }],
    ['attachment-scoped-allowed', {
      domain: 'jixiang_os_business_attachments', recordId: 'attachment-scoped-allowed',
      data: {
        id: 'attachment-scoped-allowed', name: '范围内附件', mimeType: 'image/png', size: 1,
        category: 'order-payment-proof', uploadedById: 'employee-other', uploadedByName: '其他员工',
        uploadedAt: '2026-08-20T08:00:00.000Z', storageName: 'attachment-scoped-allowed.png', draftKey: 'order-attachment-allowed',
      },
    }],
    ['attachment-scoped-denied', {
      domain: 'jixiang_os_business_attachments', recordId: 'attachment-scoped-denied',
      data: {
        id: 'attachment-scoped-denied', name: '范围外附件', mimeType: 'image/png', size: 1,
        category: 'order-payment-proof', uploadedById: 'employee-other', uploadedByName: '其他员工',
        uploadedAt: '2026-08-20T08:00:00.000Z', storageName: 'attachment-scoped-denied.png', draftKey: 'order-attachment-denied',
      },
    }],
  ]);
  const businessRows = new Map<string, any>([
    ['aaos_orders:order-allowed', {
      id: 'aaos_orders:order-allowed', domain: 'aaos_orders', recordId: 'order-allowed',
      data: {
        id: 'order-allowed', salesId: scopedActor.id, owner: scopedActor.name,
        payments: [{ id: 'payment-existing', attachments: [{ id: 'attachment-allowed', category: 'order-payment-proof' }] }],
      },
    }],
    ['aaos_orders:order-denied', {
      id: 'aaos_orders:order-denied', domain: 'aaos_orders', recordId: 'order-denied',
      data: { id: 'order-denied', salesId: 'employee-other', owner: '其他员工' },
    }],
    ['aaos_orders:order-attachment-allowed', {
      id: 'aaos_orders:order-attachment-allowed', domain: 'aaos_orders', recordId: 'order-attachment-allowed',
      data: {
        id: 'order-attachment-allowed', salesId: scopedActor.id, owner: scopedActor.name,
        payments: [{ id: 'payment-allowed', attachments: [{ id: 'attachment-scoped-allowed', category: 'order-payment-proof' }] }],
      },
    }],
    ['aaos_orders:order-attachment-denied', {
      id: 'aaos_orders:order-attachment-denied', domain: 'aaos_orders', recordId: 'order-attachment-denied',
      data: {
        id: 'order-attachment-denied', salesId: 'employee-other', owner: '其他员工',
        payments: [{ id: 'payment-denied', attachments: [{ id: 'attachment-scoped-denied', category: 'order-payment-proof' }] }],
      },
    }],
    ['aaos_customers:customer-deleted', {
      id: 'aaos_customers:customer-deleted', domain: 'aaos_customers', recordId: 'customer-deleted',
      data: { id: 'customer-deleted', ownerId: scopedActor.id, owner: scopedActor.name, deletedAt: '2026-08-19T00:00:00.000Z' },
    }],
    ['aaos_customers:customer-merged', {
      id: 'aaos_customers:customer-merged', domain: 'aaos_customers', recordId: 'customer-merged',
      mergedIntoId: 'customer-survivor', mergeLedgerId: 'ledger-1',
      data: { id: 'customer-merged', ownerId: scopedActor.id, owner: scopedActor.name },
    }],
  ]);
  const leadRows = new Map<string, any>([
    ['lead-active', {
      id: 'lead-active', owner: scopedActor.name, inputBy: scopedActor.name,
      data: { id: 'lead-active', owner: scopedActor.name, inputBy: scopedActor.name },
    }],
    ['lead-deleted', {
      id: 'lead-deleted', owner: scopedActor.name, inputBy: scopedActor.name,
      data: { id: 'lead-deleted', owner: scopedActor.name, inputBy: scopedActor.name, deletedAt: '2026-08-19T00:00:00.000Z' },
    }],
  ]);
  const directoryUser = {
    id: scopedActor.id, name: scopedActor.name, account: scopedActor.account, email: '', phone: '',
    role: scopedActor.role, avatar: null, departmentId: scopedActor.departmentId, positionId: null,
    positionName: null, roleId: scopedActor.roleId, passwordHash: null, passwordSalt: null,
    passwordUpdatedAt: null, mustChangePassword: false, lastLoginAt: null, isActive: true,
    employmentStatus: 'active', leftAt: null, leftBy: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const role = {
    id: 'role-employee', name: '员工', code: 'employee', description: null, departmentId: null,
    permissions: scopedActor.permissions, dataScopes: { orders: 'self', customers: 'self', leads: 'self' }, memberCount: 1, isActive: true,
    createdAt: new Date('2026-01-01T00:00:00.000Z'), updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
  const transaction: any = {
    businessRecord: {
      findMany: async ({ where }: any) => {
        const ids = (value: any) => Array.isArray(value?.in) ? value.in.map(String) : [];
        if (where.domain === 'jixiang_os_business_attachments') {
          return ids(where.recordId).map((id: string) => rows.get(id)).filter(Boolean);
        }
        if (where.id) return ids(where.id).map((id: string) => businessRows.get(id)).filter(Boolean);
        return ids(where.recordId).map((id: string) => businessRows.get(`${where.domain}:${id}`)).filter(Boolean);
      },
    },
    leadRecord: { findMany: async ({ where }: any) => where.id.in.map((id: string) => leadRows.get(id)).filter(Boolean) },
    user: { findMany: async () => [directoryUser], findUnique: async () => directoryUser },
    role: { findMany: async () => [role] },
    department: { findMany: async () => [{ id: 'dept-sales', parentId: null, isActive: true }], findUnique: async () => null },
    employeeTask: {}, taskEvidence: {}, taskActivity: {},
  };
  const prisma = {
    ...transaction,
    $transaction: async (work: (client: any) => Promise<any>) => work(transaction),
  };
  const repository = createPrismaWorkbenchRepository(prisma as any);
  const lockedTask = {
    id: 'task-1', employeeId: scopedActor.id, employeeName: scopedActor.name,
    departmentIdSnapshot: scopedActor.departmentId || null, positionIdSnapshot: null,
    positionNameSnapshot: null, workDate: '2026-08-20', title: '跟进客户', description: null,
    targetValue: null, actualValue: null, unit: null, evidenceRequired: true,
    status: 'PENDING' as const, result: null, dueAt: null, returnedReason: null, evidence: [],
  };
  const authorize = (type: string, referenceId: string) => repository.transaction((client) => (
    client.authorizeEvidenceReferences({
      task: lockedTask, evidence: [{ type, referenceId }], actor: scopedActor,
    })
  ));

  assert.equal(await authorize('ATTACHMENT', 'attachment-allowed'), true);
  assert.equal(await authorize('ATTACHMENT', 'attachment-denied'), false);
  assert.equal(
    await authorize('ATTACHMENT', 'attachment-scoped-allowed'),
    true,
    '其他员工上传但关联范围内真实订单的同类附件应允许引用',
  );
  assert.equal(
    await authorize('ATTACHMENT', 'attachment-scoped-denied'),
    false,
    '模块权限不得越过关联订单的行级数据范围',
  );
  assert.equal(await authorize('BUSINESS_RECORD', 'aaos_orders:order-allowed'), true);
  assert.equal(await authorize('BUSINESS_RECORD', 'aaos_orders:order-denied'), false);
  assert.equal(await authorize('BUSINESS_RECORD', 'aaos_customers:customer-deleted'), false, '已软删除客户不得作为证据');
  assert.equal(await authorize('BUSINESS_RECORD', 'aaos_customers:customer-merged'), false, '已合并次客户不得直接作为证据');
  assert.equal(await authorize('BUSINESS_RECORD', 'aaos_leads:lead-active'), true, '应从真实 LeadRecord 授权有效线索');
  assert.equal(await authorize('BUSINESS_RECORD', 'aaos_leads:lead-deleted'), false, '已软删除线索不得作为证据');
}

console.log('prisma workbench repository transaction tests passed');
