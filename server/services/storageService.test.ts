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
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
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

const service = createStorageService(prisma);

const listResult = await service.list();
assert.equal(listResult.code, 0);
assert.deepEqual((listResult.data as any)[STORAGE_KEYS.LEADS].map((item: any) => item.id), ['lead-new', 'lead-old']);
assert.deepEqual((listResult.data as any)[STORAGE_KEYS.USERS].map((item: any) => item.name), ['真实销售']);

const getResult = await service.get(STORAGE_KEYS.LEADS);
assert.equal(getResult.code, 0);
assert.deepEqual((getResult.data as any[]).map((item) => item.id), ['lead-new', 'lead-old']);

const getUsersResult = await service.get(STORAGE_KEYS.USERS);
assert.equal(getUsersResult.code, 0);
assert.deepEqual((getUsersResult.data as any[]).map((item) => item.name), ['真实销售']);

const nextLeads = [
  { id: 'lead-a', name: 'A线索', phone: '+8613800000000', status: '新线索', createdAt: '2026-06-24T01:00:00.000Z', updatedAt: '2026-06-24T01:00:00.000Z' },
  { id: 'lead-b', name: 'B线索', phone: '+8613900000000', status: '已联系', createdAt: '2026-06-24T02:00:00.000Z', updatedAt: '2026-06-24T02:00:00.000Z' },
];

const setResult = await service.set(STORAGE_KEYS.LEADS, nextLeads);
assert.equal(setResult.code, 0);
assert.equal(upserts.length, 2);
assert.equal(upserts[0].where.id, 'lead-a');
assert.equal(upserts[0].create.name, 'A线索');
assert.equal(deletedWhere.id.notIn.length, 2);
assert.equal(appStorageUpserted, false);

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
assert.equal(businessDeletedWhere.domain, STORAGE_KEYS.CUSTOMERS);
