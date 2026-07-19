import assert from 'node:assert/strict';
import { createCustomerTodoService } from './customerTodoService';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';

const actor = {
  id: 'user-admin', name: '系统管理员', account: 'admin', email: 'admin@example.com', phone: '',
  role: '自定义', roleId: 'role-todo', departmentId: 'dept-sales',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_SET_TODOS, actions: ['read', 'write'] }], isActive: true,
} as AuthenticatedUser;

const customer: Customer = {
  id: 'customer-1', name: '测试客户', company: '', phone: '+8613800000000', owner: actor.name, ownerId: actor.id,
  ownerIdentityStatus: 'resolved',
  customerLevel: 'L1', lifecycleStatusCode: 'pending_followup', totalSpent: 0, orderCount: 0,
  growthPath: [], growthRecords: [], activityRecords: [], createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
};

let todoRow: any = null;
let customerData: Customer = customer;
let lastFindManyArgs: any = null;
const auditEvents: any[] = [];
const queriedCustomerIds: string[] = [];
const associationLockKeys: string[] = [];
let failAuditWrite = false;
let version = new Date('2026-07-15T03:00:00.000Z');
const at = new Date('2026-07-15T03:00:00.000Z');
const customerRow = () => ({
  id: `${STORAGE_KEYS.CUSTOMERS}:${customerData.id}`,
  domain: STORAGE_KEYS.CUSTOMERS,
  recordId: customerData.id,
  data: customerData,
  updatedAt: new Date(version),
});
const tx = {
  user: {
    findMany: async () => [{
      ...actor, avatar: null, positionId: null, positionName: null, passwordHash: null, passwordSalt: null,
      passwordUpdatedAt: null, lastLoginAt: null, employmentStatus: 'active', leftAt: null, leftBy: null,
      createdAt: at, updatedAt: at,
    }],
    findUnique: async ({ where }: any) => ({ id: where.id, name: '系统管理员', isActive: true, employmentStatus: 'active' }),
  },
  role: { findMany: async () => [{
    id: 'role-todo', name: '自定义', code: 'custom', description: null, departmentId: 'dept-sales',
    permissions: [
      { module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] },
      { module: PERMISSION_KEYS.CUSTOMER_SET_TODOS, actions: ['read', 'write'] },
    ],
    dataScopes: { customers: 'self' }, memberCount: 1, isActive: true, createdAt: at, updatedAt: at,
  }] },
  department: { findMany: async () => [{
    id: 'dept-sales', name: '销售部', code: 'SALES', parentId: null, managerId: null,
    memberCount: 1, sortOrder: 1, isActive: true, createdAt: at, updatedAt: at,
  }] },
  customerTodo: {
    create: async ({ data }: any) => (todoRow = { ...data, status: 'PENDING', completedAt: null, completedById: null, completedByName: null, canceledAt: null, canceledById: null, canceledByName: null, cancelReason: null, createdAt: at, updatedAt: at }),
    findMany: async (args: any) => {
      lastFindManyArgs = args;
      return todoRow ? [
        todoRow,
        { ...todoRow, id: 'todo-hidden', customerId: 'customer-hidden', customerName: '不可见客户' },
      ] : [];
    },
    findFirst: async ({ where }: any) => todoRow?.id === where.id ? todoRow : null,
    update: async ({ data }: any) => (todoRow = { ...todoRow, ...data, updatedAt: at }),
  },
  customerAuditEvent: {
    create: async ({ data }: any) => {
      if (failAuditWrite) throw new Error('audit write failed');
      const event = { ...data, eventSequence: BigInt(auditEvents.length + 1), createdAt: at };
      auditEvents.push(event);
      return event;
    },
  },
  businessRecord: {
    findUnique: async ({ where }: any) => {
      const customerId = where.domain_recordId.recordId;
      queriedCustomerIds.push(customerId);
      return customerId === customerData.id ? customerRow() : null;
    },
    updateMany: async ({ where, data }: any) => {
      if (new Date(where.updatedAt).getTime() !== version.getTime()) return { count: 0 };
      customerData = data.data;
      version = new Date(version.getTime() + 1);
      return { count: 1 };
    },
  },
  appStorage: {
    upsert: async ({ where }: any) => {
      associationLockKeys.push(where.key);
      return { key: where.key };
    },
  },
  $queryRaw: async () => [customerRow()],
};
const prisma = {
  ...tx,
  $transaction: async (operation: any) => {
    const beforeTodo = structuredClone(todoRow);
    const beforeCustomer = structuredClone(customerData);
    const beforeVersion = new Date(version);
    const beforeAuditCount = auditEvents.length;
    try {
      return await operation(tx);
    } catch (error) {
      todoRow = beforeTodo;
      customerData = beforeCustomer;
      version = beforeVersion;
      auditEvents.splice(beforeAuditCount);
      throw error;
    }
  },
};

const service = createCustomerTodoService(
  prisma as any,
  { now: () => at, createId: () => 'todo-1' },
);

const created = await service.create('customer-1', {
  title: '联系客户', content: '确认续费计划', dueAt: '2026-07-15T04:00:00.000Z', executionMethod: 'phone', assigneeId: actor.id,
}, actor);
assert.equal(created.code, 0);
assert.equal(created.data?.assigneeId, actor.id);
assert.equal(customerData.activityRecords?.[0]?.title, '新建了客户待办');
assert.ok(
  associationLockKeys.includes('aaos_customer_association_lock:customer-1'),
  '新建客户待办前必须取得客户关联锁，避免与删除/合并并发穿插',
);
assert.equal(auditEvents[0]?.operation, 'add_todo');
assert.match(auditEvents[0]?.inputHash || '', /^[a-f0-9]{64}$/);

const mine = await service.listMine(actor);
assert.equal(mine.code, 0);
assert.equal(mine.data?.[0]?.id, 'todo-1');
assert.equal(mine.data?.length, 1);
assert.deepEqual(lastFindManyArgs.where, { assigneeId: actor.id, status: 'PENDING' });
assert.equal('take' in lastFindManyArgs, false);
assert.ok(queriedCustomerIds.includes('customer-hidden'));

const outsider = { ...actor, id: 'user-outsider', role: '销售顾问', permissions: [] };
const forbidden = await service.complete('customer-1', 'todo-1', outsider);
assert.equal(forbidden.code, 403);

const completed = await service.complete('customer-1', 'todo-1', actor);
assert.equal(completed.code, 0);
assert.equal(completed.data?.status, 'completed');
assert.equal(customerData.activityRecords?.[0]?.title, '完成了客户待办');
assert.equal(auditEvents[1]?.operation, 'complete_todo');

const repeated = await service.complete('customer-1', 'todo-1', actor);
assert.equal(repeated.code, 409);

const reopened = await service.reopen('customer-1', 'todo-1', actor);
assert.equal(reopened.code, 0);
assert.equal(reopened.data?.status, 'pending');

const updated = await service.update('customer-1', 'todo-1', {
  title: '更新后的联系客户', content: '更新后的计划', dueAt: '2026-07-16T04:00:00.000Z', executionMethod: 'wechat', assigneeId: actor.id,
}, actor);
assert.equal(updated.code, 0);
assert.equal(updated.data?.title, '更新后的联系客户');

const cancelled = await service.cancel('customer-1', 'todo-1', '客户暂不方便', actor);
assert.equal(cancelled.code, 0);
assert.equal(cancelled.data?.status, 'canceled');
assert.deepEqual(auditEvents.map((event) => event.operation), [
  'add_todo', 'complete_todo', 'reopen_todo', 'update_todo', 'cancel_todo',
]);

const beforeAuditFailureCustomer = structuredClone(customerData);
const beforeAuditFailureTodo = structuredClone(todoRow);
const beforeAuditFailureCount = auditEvents.length;
failAuditWrite = true;
await assert.rejects(
  () => service.create('customer-1', {
    title: '审计失败待办', content: '不能提交', dueAt: '2026-07-17T04:00:00.000Z', executionMethod: 'phone', assigneeId: actor.id,
  }, actor),
  /audit write failed/,
);
failAuditWrite = false;
assert.deepEqual(customerData, beforeAuditFailureCustomer, 'audit failure rolls back the activity-bearing customer JSON');
assert.deepEqual(todoRow, beforeAuditFailureTodo, 'audit failure rolls back the todo write');
assert.equal(auditEvents.length, beforeAuditFailureCount, 'audit failure leaves no partial event');

console.log('customer todo service tests passed');
