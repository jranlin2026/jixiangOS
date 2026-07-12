import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Order, OrderApplication } from '../../src/types/order';
import { createOrderQueryService } from './orderQueryService';

const now = '2026-07-12T15:00:00.000Z';
const sales: AuthenticatedUser = {
  id: 'user-sales', name: '销售A', account: 'sales', email: 'sales@example.com', phone: '',
  role: '销售顾问', roleId: 'role-sales', departmentId: 'dept-sales', isActive: true,
  permissions: [{ module: '订单/订单列表', actions: ['read'] }],
};
const finance: AuthenticatedUser = {
  ...sales, id: 'user-finance', name: '财务A', account: 'finance', email: 'finance@example.com',
  role: '财务专员', roleId: 'role-finance', departmentId: 'dept-finance',
};

function order(id: string, salesId: string | undefined, salesName: string, overrides: Partial<Order> = {}): Order {
  return {
    id, orderNo: `ORD-${id}`, customerId: `customer-${id}`, customerName: `客户-${id}`,
    productLevel: '899', orderType: '899成交', amount: 899, actualAmount: 899,
    paymentMethod: '对公转账', status: '已确认', refundStatus: '无', owner: salesName,
    salesId, salesName, payments: [], createdAt: now, updatedAt: now, ...overrides,
  };
}

function application(id: string, applicantId: string | undefined, applicantName: string): OrderApplication {
  return {
    id, applicationNo: `OAPP-${id}`, status: '待财务审核',
    orderData: order(`draft-${id}`, applicantId, applicantName),
    applicantId, applicantName, submittedAt: now, reviewLogs: [], createdAt: now, updatedAt: now,
  };
}

function databaseUser(user: AuthenticatedUser) {
  return {
    id: user.id, name: user.name, account: user.account, email: user.email, phone: user.phone,
    role: user.role, avatar: null, departmentId: user.departmentId || null, positionId: null,
    positionName: null, roleId: user.roleId || null, passwordHash: null, passwordSalt: null,
    passwordUpdatedAt: null, lastLoginAt: null, isActive: user.isActive, employmentStatus: 'active',
    leftAt: null, leftBy: null, createdAt: new Date(now), updatedAt: new Date(now),
  };
}

const roles = [
  {
    id: 'role-sales', name: '销售顾问', code: 'sales_consultant', description: null,
    departmentId: 'dept-sales', permissions: sales.permissions, dataScopes: { orders: 'self', orderApplications: 'self' },
    memberCount: 1, isActive: true, createdAt: new Date(now), updatedAt: new Date(now),
  },
  {
    id: 'role-finance', name: '财务专员', code: 'finance_specialist', description: null,
    departmentId: 'dept-finance', permissions: finance.permissions, dataScopes: { orders: 'all', orderApplications: 'all' },
    memberCount: 1, isActive: true, createdAt: new Date(now), updatedAt: new Date(now),
  },
];
const departments = [
  { id: 'dept-sales', name: '销售部', code: 'SALES', description: null, parentId: null, managerId: null, memberCount: 1, sortOrder: 1, isActive: true, createdAt: new Date(now), updatedAt: new Date(now) },
  { id: 'dept-finance', name: '财务部', code: 'FINANCE', description: null, parentId: null, managerId: null, memberCount: 1, sortOrder: 2, isActive: true, createdAt: new Date(now), updatedAt: new Date(now) },
];

const records = [
  order('order-self', sales.id, sales.name),
  order('order-legacy-self', undefined, sales.name),
  order('order-other', 'user-other', '销售B'),
  order('order-deleted', sales.id, sales.name, { deletedAt: now }),
];
const applications = [
  application('application-self', sales.id, sales.name),
  application('application-legacy-self', undefined, sales.name),
  application('application-other', 'user-other', '销售B'),
];

const prisma: any = {
  user: { findMany: async () => [databaseUser(sales), databaseUser(finance)] },
  role: { findMany: async () => roles },
  department: { findMany: async () => departments },
  businessRecord: {
    findMany: async ({ where }: any) => {
      const rows = where.domain === STORAGE_KEYS.ORDERS ? records : applications;
      return rows.map((data) => ({
        domain: where.domain, recordId: data.id, data, eventAt: new Date(data.updatedAt), createdAt: new Date(data.createdAt),
      }));
    },
    findUnique: async ({ where }: any) => {
      const target = where.domain_recordId;
      const rows = target.domain === STORAGE_KEYS.ORDERS ? records : applications;
      const data = rows.find((item) => item.id === target.recordId);
      return data ? { domain: target.domain, recordId: data.id, data } : null;
    },
  },
};

const service = createOrderQueryService(prisma, { now: () => new Date(now) });

const salesOrders = await service.listOrders({ page: 1, pageSize: 10 }, sales);
assert.equal(salesOrders.code, 0);
assert.deepEqual(salesOrders.data?.items.map((item) => item.id).sort(), ['order-legacy-self', 'order-self']);
assert.equal(salesOrders.data?.pagination.total, 2);

const financeOrders = await service.listOrders({ search: 'order-other', page: 1, pageSize: 10 }, finance);
assert.deepEqual(financeOrders.data?.items.map((item) => item.id), ['order-other']);

const forbiddenOrder = await service.getOrder('order-other', sales);
assert.equal(forbiddenOrder.code, 403);
assert.equal(forbiddenOrder.data, null);
assert.equal((await service.getOrder('order-self', sales)).data?.id, 'order-self');

const salesStats = await service.getOrderStats(sales);
assert.equal(salesStats.code, 0);
assert.deepEqual(salesStats.data, {
  todayAmount: 1798,
  todayCount: 2,
  monthAmount: 1798,
  monthCount: 2,
  refundCount: 0,
  refundAmount: 0,
  upgradeCount: 0,
  upgradeAmount: 0,
});

const salesApplications = await service.listApplications({ page: 1, pageSize: 10 }, sales);
assert.deepEqual(
  salesApplications.data?.items.map((item) => item.id).sort(),
  ['application-legacy-self', 'application-self'],
);
assert.equal((await service.getApplication('application-other', sales)).code, 403);
assert.equal((await service.getApplication('application-self', sales)).data?.id, 'application-self');
assert.equal((await service.listApplications({ page: 1, pageSize: 1 }, finance)).data?.pagination.total, 3);
