import assert from 'node:assert/strict';
import { createCustomerTodoService } from './customerTodoService';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Customer } from '../../src/types/customer';

const NOW = new Date('2026-07-17T04:00:00.000Z');
const actor: AuthenticatedUser = {
  id: 'user-a', name: '销售甲', account: 'sales-a', email: '', phone: '', role: '自定义' as any,
  roleId: 'role-todo', departmentId: 'dept-sales', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_SET_TODOS, actions: ['read', 'write'] }],
};
const users = [
  { ...actor, avatar: null, positionId: null, positionName: null, passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, lastLoginAt: null, employmentStatus: 'active', leftAt: null, leftBy: null, createdAt: NOW, updatedAt: NOW },
  { ...actor, id: 'user-b', name: '销售乙', account: 'sales-b', avatar: null, positionId: null, positionName: null, passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, lastLoginAt: null, employmentStatus: 'active', leftAt: null, leftBy: null, createdAt: NOW, updatedAt: NOW },
];
const baseRole = {
  id: 'role-todo', name: '自定义', code: 'custom', description: null, departmentId: 'dept-sales',
  permissions: [{ module: PERMISSION_KEYS.CUSTOMER_SET_TODOS, actions: ['read', 'write'] }],
  dataScopes: { customers: 'self' }, memberCount: 2, isActive: true, createdAt: NOW, updatedAt: NOW,
};
const department = { id: 'dept-sales', name: '销售部', code: 'SALES', parentId: null, managerId: null, memberCount: 2, sortOrder: 1, isActive: true, createdAt: NOW, updatedAt: NOW };

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'customer-todo', name: '客户', company: '公司', phone: '13800000000', owner: actor.name,
    ownerId: actor.id, ownerIdentityStatus: 'resolved', customerLevel: 'L1', lifecycleStatusCode: 'following',
    totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [],
    createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...overrides,
  };
}

function fixture(initialCustomer: Customer, role = baseRole, conflict = false) {
  let storedCustomer = structuredClone(initialCustomer);
  let version = new Date(NOW);
  let todo: any = null;
  let compareSaves = 0;
  const row = () => ({
    id: `${STORAGE_KEYS.CUSTOMERS}:${storedCustomer.id}`,
    domain: STORAGE_KEYS.CUSTOMERS,
    recordId: storedCustomer.id,
    data: structuredClone(storedCustomer),
    updatedAt: new Date(version),
  });
  const tx: any = {
    user: {
      findMany: async () => users,
      findUnique: async ({ where }: any) => users.find((user) => user.id === where.id) || null,
    },
    role: { findMany: async () => [role] },
    department: { findMany: async () => [department] },
    appStorage: { upsert: async ({ where }: any) => ({ key: where.key }) },
    businessRecord: {
      findUnique: async () => row(),
      updateMany: async ({ where, data }: any) => {
        compareSaves += 1;
        if (conflict) return { count: 0 };
        if (new Date(where.updatedAt).getTime() !== version.getTime()) return { count: 0 };
        storedCustomer = structuredClone(data.data);
        version = new Date(version.getTime() + 1);
        return { count: 1 };
      },
    },
    customerTodo: {
      findMany: async () => todo ? [todo] : [],
      findFirst: async ({ where }: any) => todo?.id === where.id && todo.customerId === where.customerId ? todo : null,
      create: async ({ data }: any) => (todo = {
        ...data, status: 'PENDING', completedAt: null, completedById: null, completedByName: null,
        canceledAt: null, canceledById: null, canceledByName: null, cancelReason: null, createdAt: NOW, updatedAt: NOW,
      }),
      update: async ({ data }: any) => (todo = { ...todo, ...data, updatedAt: NOW }),
    },
    $queryRaw: async () => [row()],
  };
  const prisma = { ...tx, $transaction: async (operation: any) => operation(tx) };
  return {
    service: createCustomerTodoService(prisma as any, { now: () => NOW, createId: () => 'todo-1' }),
    seedTodo: (input: any) => { todo = input; },
    todo: () => todo,
    get compareSaves() { return compareSaves; },
  };
}

const owned = fixture(customer());
const created = await owned.service.create('customer-todo', {
  title: '联系客户', dueAt: '2026-07-18T00:00:00.000Z', executionMethod: 'phone', assigneeId: actor.id,
}, actor);
assert.equal(created.code, 0);
assert.equal(owned.compareSaves, 1, '待办活动必须经 compare-and-save 追加');

const todoConflict = fixture(customer({ id: 'customer-todo-conflict' }), baseRole, true);
const todoConflictResult = await todoConflict.service.create('customer-todo-conflict', {
  title: '并发待办', dueAt: '2026-07-18T00:00:00.000Z', executionMethod: 'phone', assigneeId: actor.id,
}, actor);
assert.equal(todoConflictResult.code, 409);
assert.match(todoConflictResult.message, /客户记录已更新/);

const contributorOnly = fixture(customer({
  id: 'customer-contributor-todo', owner: '销售乙', ownerId: 'user-b', leadContributorId: actor.id,
}));
assert.equal((await contributorOnly.service.create('customer-contributor-todo', {
  title: '不得创建', dueAt: '2026-07-18T00:00:00.000Z', executionMethod: 'phone', assigneeId: actor.id,
}, actor)).code, 403);
assert.equal(contributorOnly.compareSaves, 0);

const readOnlyRole = { ...baseRole, permissions: [] };
const selfComplete = fixture(customer({
  id: 'customer-self-complete', owner: '销售乙', ownerId: 'user-b', leadContributorId: actor.id,
}), readOnlyRole);
selfComplete.seedTodo({
  id: 'todo-self', customerId: 'customer-self-complete', customerName: '客户', title: '本人待办', content: null,
  status: 'PENDING', dueAt: NOW, executionMethod: 'phone', assigneeId: actor.id, assigneeName: actor.name,
  createdById: 'user-b', createdByName: '销售乙', completedAt: null, completedById: null, completedByName: null,
  canceledAt: null, canceledById: null, canceledByName: null, cancelReason: null, createdAt: NOW, updatedAt: NOW,
});
const completed = await selfComplete.service.complete('customer-self-complete', 'todo-self', { ...actor, permissions: [] });
assert.equal(completed.code, 0, '只读贡献人仅可完成指派给本人的待办');
assert.equal(selfComplete.todo().status, 'COMPLETED');

const outsider = { ...actor, id: 'user-outsider', name: '外部人', permissions: [] };
selfComplete.seedTodo({ ...selfComplete.todo(), id: 'todo-outsider', status: 'PENDING', assigneeId: 'user-b' });
assert.equal((await selfComplete.service.complete('customer-self-complete', 'todo-outsider', outsider)).code, 403);

console.log('customer todo access policy tests passed');
