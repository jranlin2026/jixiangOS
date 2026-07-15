import assert from 'node:assert/strict';
import { createCustomerTodoService } from './customerTodoService';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';

const actor = {
  id: 'user-admin', name: '系统管理员', account: 'admin', email: 'admin@example.com', phone: '',
  role: '超级管理员', permissions: [], isActive: true,
} as AuthenticatedUser;

const customer: Customer = {
  id: 'customer-1', name: '测试客户', company: '', phone: '+8613800000000', owner: '销售甲', ownerId: 'user-sales',
  customerLevel: 'L1', lifecycleStatusCode: 'pending_followup', totalSpent: 0, orderCount: 0,
  growthPath: [], growthRecords: [], activityRecords: [], createdAt: '2026-07-15T00:00:00.000Z', updatedAt: '2026-07-15T00:00:00.000Z',
};

let todoRow: any = null;
let customerData: Customer = customer;
let lastFindManyArgs: any = null;
const visibleCustomerIds: string[] = [];
const at = new Date('2026-07-15T03:00:00.000Z');
const tx = {
  user: { findUnique: async ({ where }: any) => ({ id: where.id, name: '系统管理员', isActive: true, employmentStatus: 'active' }) },
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
  businessRecord: {
    findFirst: async () => ({ id: 'customers:customer-1', data: customerData }),
    update: async ({ data }: any) => { customerData = data.data; return { id: 'customers:customer-1' }; },
  },
};
const prisma = {
  ...tx,
  $transaction: async (operation: any) => operation(tx),
};

const service = createCustomerTodoService(
  prisma as any,
  async (customerId) => {
    visibleCustomerIds.push(customerId);
    return customerId === customer.id
      ? { code: 0, data: customerData, message: 'success' }
      : { code: 404, data: null, message: '客户不存在或无权访问' };
  },
  { now: () => at, createId: () => 'todo-1' },
);

const created = await service.create('customer-1', {
  title: '联系客户', content: '确认续费计划', dueAt: '2026-07-15T04:00:00.000Z', executionMethod: 'phone', assigneeId: actor.id,
}, actor);
assert.equal(created.code, 0);
assert.equal(created.data?.assigneeId, actor.id);
assert.equal(customerData.activityRecords?.[0]?.title, '新建了客户待办');

const mine = await service.listMine(actor);
assert.equal(mine.code, 0);
assert.equal(mine.data?.[0]?.id, 'todo-1');
assert.equal(mine.data?.length, 1);
assert.deepEqual(lastFindManyArgs.where, { assigneeId: actor.id, status: 'PENDING' });
assert.equal('take' in lastFindManyArgs, false);
assert.ok(visibleCustomerIds.includes('customer-hidden'));

const outsider = { ...actor, id: 'user-outsider', role: '销售顾问', permissions: [] };
const forbidden = await service.complete('customer-1', 'todo-1', outsider);
assert.equal(forbidden.code, 403);

const completed = await service.complete('customer-1', 'todo-1', actor);
assert.equal(completed.code, 0);
assert.equal(completed.data?.status, 'completed');
assert.equal(customerData.activityRecords?.[0]?.title, '完成了客户待办');

const repeated = await service.complete('customer-1', 'todo-1', actor);
assert.equal(repeated.code, 409);

console.log('customer todo service tests passed');
