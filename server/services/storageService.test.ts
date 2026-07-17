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
    createMany: async ({ data }: any) => ({ count: data.length }),
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
    createMany: async ({ data }: any) => ({ count: data.length }),
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
assert.equal(
  Object.prototype.hasOwnProperty.call(listResult.data, STORAGE_KEYS.CUSTOMERS),
  false,
  '数据维护原始列表不得导出客户资产，即使 app_storage 残留同名 key',
);

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
assert.equal(customersResult.code, 403, '单 key 原始读取也不得绕过客户查询与导出权限');
assert.match(customersResult.message, /客户.*原始存储/);

const removeCustomerResult = await service.remove(STORAGE_KEYS.CUSTOMERS);
assert.equal(removeCustomerResult.code, 403, '单 key 原始删除不得绕过客户删除命令');
assert.equal(businessDeletedWhere, null, '拒绝客户原始删除时不得触碰客户记录');

const clearCalls = { appStorage: [] as any[], leads: 0, business: [] as any[] };
const clearPrisma = {
  appStorage: {
    findMany: async () => [],
    findUnique: async () => null,
    upsert: async () => ({ value: null }),
    deleteMany: async (input: any) => {
      clearCalls.appStorage.push(input);
      return { count: 2 };
    },
  },
  leadRecord: {
    findMany: async () => [],
    upsert: async () => ({}),
    deleteMany: async () => {
      clearCalls.leads += 1;
      return { count: 1 };
    },
  },
  businessRecord: {
    findMany: async () => [],
    upsert: async () => ({}),
    deleteMany: async (input: any) => {
      clearCalls.business.push(input);
      return { count: 3 };
    },
  },
  user: { findMany: async () => [] },
  $transaction: async (callback: (tx: any) => Promise<unknown>) => callback(clearPrisma),
} as any;
const clearResult = await createStorageService(clearPrisma).clearPrefix();
assert.equal(clearResult.code, 0);
assert.deepEqual(clearResult.data, {
  clearedPrefix: 'aaos_',
  preservedKeys: [STORAGE_KEYS.CUSTOMERS],
});
assert.deepEqual(clearCalls.appStorage, [{
  where: { key: { startsWith: 'aaos_', notIn: [STORAGE_KEYS.CUSTOMERS] } },
}]);
assert.equal(clearCalls.leads, 1, '整体维护清理仍应清理非客户线索数据');
assert.deepEqual(clearCalls.business, [{
  where: { domain: { not: STORAGE_KEYS.CUSTOMERS } },
}], '整体维护清理必须保留客户域，同时清理其他 BusinessRecord 域');

const nextCustomers = [
  { id: 'customer-a', name: '客户A', company: 'A公司', owner: '销售A', totalSpent: 1200, createdAt: '2026-06-24T01:00:00.000Z', updatedAt: '2026-06-24T01:00:00.000Z' },
];
const rawCustomerSetResult = await service.set(STORAGE_KEYS.CUSTOMERS, nextCustomers);
assert.equal(rawCustomerSetResult.code, 403, '客户资产不得通过原始存储整表写入');
assert.match(rawCustomerSetResult.message, /客户.*原始存储/);
assert.equal(businessUpserts.length, 0, '拒绝客户原始写入时不得触碰客户记录');
assert.equal(businessDeletedWhere, null, '拒绝客户原始写入时不得执行客户清理');

await service.set(STORAGE_KEYS.DELIVERIES, [{
  id: 'delivery-a',
  orderId: 'order-a',
  createdAt: '2026-06-24T03:00:00.000Z',
  updatedAt: '2026-06-24T03:00:00.000Z',
}]);
const deliveryDeletedWhere = businessDeletedWhere as any;
assert.equal(deliveryDeletedWhere.domain, STORAGE_KEYS.DELIVERIES);
assert.deepEqual(deliveryDeletedWhere.recordId.notIn, ['delivery-a']);

// Legacy storage is still available for several customer-adjacent domains. It
// must join the same customer association lock protocol as record commands and
// re-read the customer after the lock so a concurrent soft-delete cannot leave
// a new dangling stable-ID link behind.
const associationGuardEvents: string[] = [];
const associationGuardWrites: any[] = [];
const associationCustomers = new Map<string, any>([
  ['customer-live', { data: { id: 'customer-live', name: '仍在使用的客户' } }],
  ['customer-deleted', { data: { id: 'customer-deleted', name: '已删除客户', deletedAt: '2026-07-18T00:00:00.000Z' } }],
]);
const associationGuardPrisma: any = {
  ...prisma,
  appStorage: {
    ...prisma.appStorage,
    upsert: async ({ where }: any) => {
      associationGuardEvents.push(`lock:${where.key}`);
      return { key: where.key, value: {} };
    },
  },
  businessRecord: {
    ...prisma.businessRecord,
    findUnique: async ({ where }: any) => {
      if (where.domain_recordId?.domain === STORAGE_KEYS.CUSTOMERS) {
        associationGuardEvents.push(`validate:${where.domain_recordId.recordId}`);
        return associationCustomers.get(where.domain_recordId.recordId) || null;
      }
      return null;
    },
    upsert: async (input: any) => {
      associationGuardWrites.push(input);
      return input.create;
    },
  },
  $queryRaw: async () => [],
};
associationGuardPrisma.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(associationGuardPrisma);
const associationGuardService = createStorageService(associationGuardPrisma);
const stableAssociationResult = await associationGuardService.set(STORAGE_KEYS.SERVICE_TICKETS, [{
  id: 'ticket-live', customerId: 'customer-live', title: '正常客户工单',
}]);
assert.equal(stableAssociationResult.code, 0);
assert.ok(
  associationGuardEvents.indexOf('lock:aaos_customer_association_lock:customer-live')
    < associationGuardEvents.indexOf('validate:customer-live'),
  '稳定客户关联必须先取得关联锁，再校验客户仍可用',
);
assert.equal(associationGuardWrites.length, 1);

const deletedAssociationResult = await associationGuardService.set(STORAGE_KEYS.SERVICE_TICKETS, [{
  id: 'ticket-deleted', customerId: 'customer-deleted', title: '不应写入已删除客户',
}]);
assert.equal(deletedAssociationResult.code, 409, '原始存储不得给已删除客户新增稳定关联');
assert.equal(associationGuardWrites.length, 1, '客户复核失败后不得写入关联业务记录');

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
const longPrefix = `product-${'a'.repeat(180)}`;
const longIdProducts = [
  { id: `${longPrefix}-one`, name: '长ID产品A', createdAt: '2026-06-24T01:00:00.000Z' },
  { id: `${longPrefix}-two`, name: '长ID产品B', createdAt: '2026-06-24T02:00:00.000Z' },
];
await assert.doesNotReject(() => collisionService.set(STORAGE_KEYS.PRODUCTS, longIdProducts));
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
await transactionalService.set(STORAGE_KEYS.PRODUCTS, [{ id: 'product-transactional', name: '事务产品' }]);
assert.equal(transactionCalls, 1);

transactionCalls = 0;
const migrationResult = await transactionalService.importCrmMigration(nextCustomers.map((customer) => ({
  ...customer,
  owner: '公海',
})));
assert.equal(migrationResult.code, 0);
assert.equal(transactionCalls, 1, 'EC CRM 客户与线索迁移必须在同一事务中保存');

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
  () => createStorageService(failingPrisma).set(STORAGE_KEYS.PRODUCTS, [{ id: 'product-failing', name: '失败产品' }]),
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

const bulkCreateCalls: Array<{ domain: string; count: number }> = [];
const bulkMigrationPrisma: any = {
  appStorage: prisma.appStorage,
  user: prisma.user,
  businessRecord: {
    findMany: async () => [],
    createMany: async ({ data }: any) => {
      bulkCreateCalls.push({ domain: data[0]?.domain, count: data.length });
      return { count: data.length };
    },
    upsert: async () => {
      throw new Error('sequential business upsert timed out');
    },
    deleteMany: async () => ({ count: 0 }),
  },
  leadRecord: {
    createMany: async () => {
      throw new Error('CRM migration must not create leads');
    },
  },
};
bulkMigrationPrisma.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(bulkMigrationPrisma);

const bulkCustomers = Array.from({ length: 1_200 }, (_, index) => ({
  id: `bulk-customer-${index}`,
  name: `Customer ${index}`,
  owner: '公海',
  createdAt: '2026-07-13T00:00:00.000Z',
  updatedAt: '2026-07-13T00:00:00.000Z',
}));
const bulkMigrationResult = await createStorageService(bulkMigrationPrisma).importCrmMigration(bulkCustomers);
assert.equal(bulkMigrationResult.code, 0);
assert.equal(
  bulkCreateCalls.filter((call) => call.domain === STORAGE_KEYS.CUSTOMERS).reduce((total, call) => total + call.count, 0),
  bulkCustomers.length,
);

const identityCreatedRows: any[] = [];
const identityTagGroups = [
  { id: 'group-intent', name: '意向', scope: 'customer', isActive: true, sortOrder: 0 },
  { id: 'group-value-a', name: '价值A', scope: 'both', isActive: true, sortOrder: 1 },
  { id: 'group-value-b', name: '价值B', scope: 'customer', isActive: true, sortOrder: 2 },
];
const identityTags = [
  { id: 'tag-intent', groupId: 'group-intent', name: '高意向', isActive: true, sortOrder: 0 },
  { id: 'tag-vip-a', groupId: 'group-value-a', name: 'VIP', isActive: true, sortOrder: 0 },
  { id: 'tag-vip-b', groupId: 'group-value-b', name: 'vip', isActive: true, sortOrder: 0 },
];
const identityMigrationPrisma: any = {
  user: {
    findMany: async () => [
      {
        id: 'u-1', name: '吕煜阳', account: 'lv_yuyang', email: '', phone: '', role: '销售顾问',
        avatar: null, departmentId: 'dept-sales', positionId: null, positionName: null,
        roleId: 'role-sales-consultant', passwordHash: '', passwordSalt: '', passwordUpdatedAt: null,
        lastLoginAt: null, isActive: true, employmentStatus: 'active', leftAt: null, leftBy: null,
        createdAt: new Date('2026-07-14T00:00:00.000Z'), updatedAt: new Date('2026-07-14T00:00:00.000Z'),
      },
      { id: 'u-placeholder-pending', name: '待分配', isActive: true, employmentStatus: 'active' },
      { id: 'u-placeholder-unassigned', name: '未分配', isActive: true, employmentStatus: 'active' },
      { id: 'u-placeholder-missing', name: '未填写负责人', isActive: true, employmentStatus: 'active' },
    ],
  },
  businessRecord: {
    findMany: async ({ where }: any) => {
      if (where.domain === STORAGE_KEYS.TAG_GROUPS) return identityTagGroups.map((data) => ({ data }));
      if (where.domain === STORAGE_KEYS.TAGS) return identityTags.map((data) => ({ data }));
      return [];
    },
    createMany: async ({ data }: any) => {
      identityCreatedRows.push(...data);
      return { count: data.length };
    },
  },
  leadRecord: { findMany: async () => [] },
};
identityMigrationPrisma.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(identityMigrationPrisma);
const identityMigrationService = createStorageService(identityMigrationPrisma);

const missingEmptyOwnerResult = await identityMigrationService.importCrmMigration([
  { id: 'identity-empty-owner', owner: '', tags: [] },
]);
assert.equal(missingEmptyOwnerResult.code, 409);
assert.equal(identityCreatedRows.length, 0, '团队客户负责人为空时整批不得写入');

const placeholderOwnerResult = await identityMigrationService.importCrmMigration([
  { id: 'identity-pending-owner', owner: '待分配', tags: [] },
  { id: 'identity-unassigned-owner', owner: '未分配', tags: [] },
  { id: 'identity-missing-label-owner', owner: '未填写负责人', tags: [] },
]);
assert.equal(placeholderOwnerResult.code, 409);
assert.equal(identityCreatedRows.length, 0, '占位负责人即使存在同名在职员工也必须整批零写入');

const missingOwnerResult = await identityMigrationService.importCrmMigration([
  { id: 'identity-missing-owner', owner: '不存在', tags: [] },
]);
assert.equal(missingOwnerResult.code, 409);
assert.equal(identityCreatedRows.length, 0, '负责人缺失时整批不得写入');

const ambiguousTagResult = await identityMigrationService.importCrmMigration([
  { id: 'identity-ambiguous-tag', owner: '吕煜阳', tags: ['VIP'] },
]);
assert.equal(ambiguousTagResult.code, 409);
assert.equal(identityCreatedRows.length, 0, '标签重名时整批不得写入');

const validIdentityResult = await identityMigrationService.importCrmMigration([
  {
    id: 'identity-valid',
    owner: '吕煜阳',
    ownerId: 'client-forged-owner',
    ownerIdentityStatus: 'unresolved',
    tags: ['高意向'],
    manualTagIds: ['client-forged-tag'],
  },
]);
assert.equal(validIdentityResult.code, 0);
assert.equal(identityCreatedRows[0].data.ownerId, 'u-1');
assert.equal(identityCreatedRows[0].data.ownerIdentityStatus, 'resolved');
assert.deepEqual(identityCreatedRows[0].data.manualTagIds, ['tag-intent']);
assert.deepEqual(identityCreatedRows[0].data.tags, ['高意向']);

const publicPoolResult = await identityMigrationService.importCrmMigration([
  { id: 'identity-public-pool', owner: '公海', tags: [] },
]);
assert.equal(publicPoolResult.code, 0);
assert.equal(identityCreatedRows[1].data.ownerId, undefined);
assert.equal(identityCreatedRows[1].data.ownerIdentityStatus, 'public_pool');

const deduplicatedMigrationBatches: any[][] = [];
const duplicateAwareMigrationPrisma: any = {
  businessRecord: {
    findMany: async ({ where }: any) => where.domain === STORAGE_KEYS.CUSTOMERS ? [{
      data: { id: 'existing-customer', phone: '13800000001', wechat: 'existing-wechat' },
    }] : [],
    createMany: async ({ data }: any) => {
      deduplicatedMigrationBatches.push(data);
      return { count: data.length };
    },
  },
};
duplicateAwareMigrationPrisma.$transaction = async (callback: (tx: any) => Promise<unknown>) => callback(duplicateAwareMigrationPrisma);

const duplicateAwareMigrationResult = await createStorageService(duplicateAwareMigrationPrisma).importCrmMigration([
  { id: 'duplicate-phone', name: '重复手机号', phone: '13800000001', owner: '公海' },
  { id: 'duplicate-wechat', name: '重复微信', wechat: 'existing-wechat', owner: '公海' },
  { id: 'new-customer', name: '新客户', phone: '13900000001', wechat: 'new-wechat', owner: '公海' },
]);
assert.equal(duplicateAwareMigrationResult.code, 0);
assert.deepEqual(duplicateAwareMigrationResult.data, {
  createdIds: ['new-customer'],
  skippedDuplicates: 2,
  ownerResolution: { resolved: 0, unresolved: 0, ambiguous: 0, public_pool: 1 },
});
assert.deepEqual(
  deduplicatedMigrationBatches.flat().map((row) => row.recordId),
  ['new-customer'],
  'EC CRM 导入必须跳过数据库内已有手机号或微信的客户。',
);
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
