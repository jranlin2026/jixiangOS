import assert from 'node:assert/strict';
import { createStorageService } from './storageService';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';

const leadRows: any[] = [
  {
    id: 'lead-old',
    data: { id: 'lead-old', name: '旧线索', createdAt: '2026-06-20T00:00:00.000Z' },
    createdAt: new Date('2026-06-20T00:00:00.000Z'),
  },
  {
    id: 'lead-new',
    data: { id: 'lead-new', name: '新线索', createdAt: '2026-06-24T00:00:00.000Z' },
    createdAt: new Date('2026-06-24T00:00:00.000Z'),
  },
];

const upserts: any[] = [];
const businessUpserts: any[] = [];
let deletedWhere: any = null;
let businessDeletedWhere: any = null;
let appStorageUpserted = false;
const userRows = [
  {
    id: 'user-real-sales',
    name: '真实销售',
    account: 'real_sales',
    email: '',
    phone: '',
    role: '销售顾问',
    avatar: null,
    departmentId: 'dept-sales',
    positionId: null,
    positionName: null,
    roleId: 'role-sales-consultant',
    passwordHash: 'private-hash',
    passwordSalt: 'private-salt',
    passwordUpdatedAt: new Date('2026-06-24T00:00:00.000Z'),
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: new Date('2026-06-24T00:00:00.000Z'),
    updatedAt: new Date('2026-06-24T00:00:00.000Z'),
  },
];

const prisma = {
  appStorage: {
    findMany: async () => [
      { key: STORAGE_KEYS.CUSTOMERS, value: [] },
      { key: STORAGE_KEYS.USERS, value: [{ id: 'user-stale', name: '李娜' }] },
    ],
    findUnique: async ({ where }: any) => ({ key: where.key, value: ['app-storage-value'] }),
    upsert: async () => {
      appStorageUpserted = true;
      return { value: true };
    },
    deleteMany: async () => ({ count: 0 }),
  },
  leadRecord: {
    findMany: async () => leadRows,
    upsert: async (input: any) => {
      upserts.push(input);
      return input.create;
    },
    deleteMany: async (input: any) => {
      deletedWhere = input.where;
      return { count: 0 };
    },
  },
  businessRecord: {
    findMany: async ({ where }: any) => (where.domain === STORAGE_KEYS.CUSTOMERS ? [
      {
        data: { id: 'customer-1', name: '客户A', createdAt: '2026-06-24T00:00:00.000Z' },
        createdAt: new Date('2026-06-24T00:00:00.000Z'),
        eventAt: new Date('2026-06-24T00:00:00.000Z'),
      },
    ] : []),
    upsert: async (input: any) => {
      businessUpserts.push(input);
      return input.create;
    },
    deleteMany: async (input: any) => {
      businessDeletedWhere = input.where;
      return { count: 0 };
    },
  },
  user: {
    findMany: async () => userRows,
  },
} as any;
(prisma as any).$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(prisma);

const service = createStorageService(prisma);

const listResult = await service.list();
assert.equal(listResult.code, 0);
assert.deepEqual((listResult.data as any)[STORAGE_KEYS.LEADS].map((item: any) => item.id), ['lead-new', 'lead-old']);
assert.deepEqual((listResult.data as any)[STORAGE_KEYS.USERS].map((item: any) => item.name), ['真实销售']);
const listedUser = (listResult.data as any)[STORAGE_KEYS.USERS][0];
assert.equal('passwordHash' in listedUser, false);
assert.equal('passwordSalt' in listedUser, false);
assert.equal('passwordUpdatedAt' in listedUser, false);

const getResult = await service.get(STORAGE_KEYS.LEADS);
assert.equal(getResult.code, 0);
assert.deepEqual((getResult.data as any[]).map((item) => item.id), ['lead-new', 'lead-old']);

const getUsersResult = await service.get(STORAGE_KEYS.USERS);
assert.equal(getUsersResult.code, 0);
assert.deepEqual((getUsersResult.data as any[]).map((item) => item.name), ['真实销售']);
const fetchedUser = (getUsersResult.data as any[])[0];
assert.equal('passwordHash' in fetchedUser, false);
assert.equal('passwordSalt' in fetchedUser, false);
assert.equal('passwordUpdatedAt' in fetchedUser, false);

const nextLeads = [
  { id: 'lead-a', name: 'A线索', phone: '+8613800000000', status: '新线索', createdAt: '2026-06-24T01:00:00.000Z', updatedAt: '2026-06-24T01:00:00.000Z' },
  { id: 'lead-b', name: 'B线索', phone: '+8613900000000', status: '已联系', createdAt: '2026-06-24T02:00:00.000Z', updatedAt: '2026-06-24T02:00:00.000Z' },
];

const setResult = await service.set(STORAGE_KEYS.LEADS, nextLeads);
assert.equal(setResult.code, 0);
assert.equal(upserts.length, 2);
assert.equal(upserts[0].where.id, 'lead-a');
assert.equal(upserts[0].create.name, 'A线索');
assert.equal(deletedWhere, null, '分页线索快照不得删除本次请求未提交的服务器线索');
await service.set(STORAGE_KEYS.LEADS, []);
assert.equal(deletedWhere, null, '空的线索局部快照不得清空服务器线索');
assert.equal(appStorageUpserted, false);

const payoutPlansResult = await service.set(STORAGE_KEYS.COMMISSION_PAYOUT_PLANS, []);
assert.equal(payoutPlansResult.code, 0, '提成方案存储 key 必须能被后端持久化');

const customersResult = await service.get(STORAGE_KEYS.CUSTOMERS);
assert.equal(customersResult.code, 0);
assert.deepEqual((customersResult.data as any[]).map((item) => item.id), ['customer-1']);

const nextCustomers = [
  { id: 'customer-a', name: '客户A', company: 'A公司', owner: '销售A', totalSpent: 1200, createdAt: '2026-06-24T01:00:00.000Z', updatedAt: '2026-06-24T01:00:00.000Z' },
];
await service.set(STORAGE_KEYS.CUSTOMERS, nextCustomers);
assert.equal(businessUpserts.length, 1);
assert.equal(businessUpserts[0].where.domain_recordId.domain, STORAGE_KEYS.CUSTOMERS);
assert.equal(businessUpserts[0].create.title, '客户A');
assert.equal(String(businessUpserts[0].create.amount), '1200');
assert.equal(businessDeletedWhere, null, '分页客户快照不得删除本次请求未提交的服务器客户');
await service.set(STORAGE_KEYS.CUSTOMERS, []);
assert.equal(businessDeletedWhere, null, '空的客户局部快照不得清空服务器客户');

await service.set(STORAGE_KEYS.DELIVERIES, [{
  id: 'delivery-a',
  orderId: 'order-a',
  createdAt: '2026-06-24T03:00:00.000Z',
  updatedAt: '2026-06-24T03:00:00.000Z',
}]);
const deliveryDeletedWhere = businessDeletedWhere as any;
assert.equal(deliveryDeletedWhere.domain, STORAGE_KEYS.DELIVERIES);
assert.deepEqual(deliveryDeletedWhere.recordId.notIn, ['delivery-a']);

const collidingCreateIds = new Set<string>();
const collisionPrisma = {
  ...prisma,
  businessRecord: {
    findMany: async () => [],
    upsert: async (input: any) => {
      if (collidingCreateIds.has(input.create.id)) {
        throw new Error(`duplicate primary id: ${input.create.id}`);
      }
      collidingCreateIds.add(input.create.id);
      return input.create;
    },
    deleteMany: async () => ({ count: 0 }),
  },
} as any;
(collisionPrisma as any).$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(collisionPrisma);
const collisionService = createStorageService(collisionPrisma);
const longPrefix = `customer-${'a'.repeat(180)}`;
const longIdCustomers = [
  { id: `${longPrefix}-one`, name: '长ID客户A', createdAt: '2026-06-24T01:00:00.000Z' },
  { id: `${longPrefix}-two`, name: '长ID客户B', createdAt: '2026-06-24T02:00:00.000Z' },
];
await assert.doesNotReject(() => collisionService.set(STORAGE_KEYS.CUSTOMERS, longIdCustomers));
assert.equal(collidingCreateIds.size, 2);

let transactionCalls = 0;
const transactionalPrisma = {
  ...prisma,
  $transaction: async (callback: (tx: any) => Promise<unknown>) => {
    transactionCalls += 1;
    return callback(prisma);
  },
} as any;
const transactionalService = createStorageService(transactionalPrisma);
await transactionalService.set(STORAGE_KEYS.CUSTOMERS, nextCustomers);
assert.equal(transactionCalls, 1);

let deleteAttemptedAfterUpsertFailure = false;
const failingPrisma: any = {
  ...prisma,
  businessRecord: {
    ...prisma.businessRecord,
    upsert: async () => {
      throw new Error('upsert failed');
    },
    deleteMany: async () => {
      deleteAttemptedAfterUpsertFailure = true;
      return { count: 0 };
    },
  },
};
failingPrisma.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(failingPrisma);

await assert.rejects(
  () => createStorageService(failingPrisma).set(STORAGE_KEYS.CUSTOMERS, nextCustomers),
  /upsert failed/,
);
assert.equal(deleteAttemptedAfterUpsertFailure, false);

const protectedRecords = new Map<string, any>();
const protectedDeleteCalls: any[] = [];
const protectedPrisma: any = {
  ...prisma,
  businessRecord: {
    findMany: async () => [],
    findUnique: async ({ where }: any) => protectedRecords.get(`${where.domain_recordId.domain}:${where.domain_recordId.recordId}`) || null,
    upsert: async (input: any) => {
      const key = `${input.where.domain_recordId.domain}:${input.where.domain_recordId.recordId}`;
      const next = protectedRecords.has(key)
        ? { ...protectedRecords.get(key), ...input.update }
        : input.create;
      protectedRecords.set(key, next);
      return next;
    },
    updateMany: async ({ where, data }: any) => {
      const key = `${where.domain}:${where.recordId}`;
      const current = protectedRecords.get(key);
      if (!current || (where.status?.not && current.status === where.status.not)) return { count: 0 };
      protectedRecords.set(key, { ...current, ...data });
      return { count: 1 };
    },
    create: async ({ data }: any) => {
      const key = `${data.domain}:${data.recordId}`;
      if (protectedRecords.has(key)) throw Object.assign(new Error('unique conflict'), { code: 'P2002' });
      protectedRecords.set(key, data);
      return data;
    },
    deleteMany: async ({ where }: any) => {
      protectedDeleteCalls.push(where);
      return { count: 0 };
    },
  },
};
protectedPrisma.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(protectedPrisma);
const protectedService = createStorageService(protectedPrisma);

await protectedService.set(STORAGE_KEYS.ORDERS, [{ id: 'order-safe', orderNo: 'ORD-SAFE', status: '已确认' }]);
await protectedService.set(STORAGE_KEYS.ORDERS, []);
assert.equal(
  protectedDeleteCalls.some((where) => where.domain === STORAGE_KEYS.ORDERS),
  false,
  '订单局部或空快照不得删除服务器订单',
);

const approvedApplication = {
  id: 'application-approved',
  applicationNo: 'OAPP-APPROVED',
  status: '已入库',
  orderId: 'order-approved',
  orderNo: 'ORD-APPROVED',
  updatedAt: '2026-07-11T01:00:00.000Z',
};
protectedRecords.set(`${STORAGE_KEYS.ORDER_APPLICATIONS}:${approvedApplication.id}`, {
  id: `${STORAGE_KEYS.ORDER_APPLICATIONS}:${approvedApplication.id}`,
  domain: STORAGE_KEYS.ORDER_APPLICATIONS,
  recordId: approvedApplication.id,
  status: '已入库',
  orderId: approvedApplication.orderId,
  data: approvedApplication,
});

const staleApplicationResult = await protectedService.set(STORAGE_KEYS.ORDER_APPLICATIONS, [{
  ...approvedApplication,
  status: '待财务审核',
  orderId: undefined,
  orderNo: undefined,
  updatedAt: '2026-07-11T00:00:00.000Z',
}]);
assert.equal(staleApplicationResult.code, 0);
assert.equal(
  protectedRecords.get(`${STORAGE_KEYS.ORDER_APPLICATIONS}:${approvedApplication.id}`).status,
  '已入库',
  '旧快照不得将已入库申请降级回待审核',
);
assert.equal(
  protectedRecords.get(`${STORAGE_KEYS.ORDER_APPLICATIONS}:${approvedApplication.id}`).orderId,
  'order-approved',
  '旧快照不得清空已入库申请的订单关联',
);

const forgedApprovalResult = await protectedService.set(STORAGE_KEYS.ORDER_APPLICATIONS, [{
  id: 'application-forged',
  applicationNo: 'OAPP-FORGED',
  status: '已入库',
  orderId: 'order-forged',
  orderNo: 'ORD-FORGED',
}]);
assert.equal(forgedApprovalResult.code, 409, '旧 storage 接口不得伪造订单审批通过');
assert.equal(protectedRecords.has(`${STORAGE_KEYS.ORDER_APPLICATIONS}:application-forged`), false);

const pendingApplicationResult = await protectedService.set(STORAGE_KEYS.ORDER_APPLICATIONS, [{
  id: 'application-pending',
  applicationNo: 'OAPP-PENDING',
  status: '待财务审核',
  applicantName: '销售A',
}]);
assert.equal(pendingApplicationResult.code, 0);
assert.equal(
  protectedRecords.get(`${STORAGE_KEYS.ORDER_APPLICATIONS}:application-pending`).status,
  '待财务审核',
);
await protectedService.set(STORAGE_KEYS.ORDER_APPLICATIONS, []);
assert.equal(
  protectedDeleteCalls.some((where) => where.domain === STORAGE_KEYS.ORDER_APPLICATIONS),
  false,
  '订单申请空快照不得清空服务器审核记录',
);
