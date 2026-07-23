import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { BusinessAttachment } from '../../src/types/businessAttachment';
import type { OrderApplication } from '../../src/types/order';
import {
  createOrderApplicationService,
  type OrderApprovalEffectState,
} from './orderApplicationService';
import { CustomerWriteConflictError } from './customerBusinessRecordRepository';

type StoredRow = {
  id: string;
  domain: string;
  recordId: string;
  title?: string | null;
  status?: string | null;
  owner?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  amount?: number | null;
  eventAt?: Date | null;
  data: any;
  createdAt?: Date;
  updatedAt?: Date;
};

const NOW = '2026-07-12T08:00:00.000Z';
const attachment = (id: string, category: BusinessAttachment['category']): BusinessAttachment => ({
  id,
  name: `${id}.png`,
  mimeType: 'image/png',
  size: 100,
  category,
  uploadedById: 'user-sales',
  uploadedByName: '销售小王',
  uploadedAt: NOW,
});

const reviewer: AuthenticatedUser = {
  id: 'user-finance',
  name: '财务小李',
  account: 'finance',
  email: 'finance@example.com',
  phone: '',
  role: '财务专员',
  roleId: 'role-finance',
  departmentId: 'dept-finance',
  permissions: [{ module: '订单/订单审核台', actions: ['read', 'write'] }],
  isActive: true,
};

const salesApplicant: AuthenticatedUser = {
  ...reviewer,
  id: 'user-sales',
  name: '销售小王',
  account: 'sales',
  role: '销售顾问',
  roleId: 'role-sales',
  departmentId: 'dept-sales',
  permissions: [{ module: '订单/新增订单', actions: ['read', 'write'] }],
};

const salesManager: AuthenticatedUser = {
  ...salesApplicant,
  id: 'user-manager',
  name: '销售经理',
  account: 'sales_manager',
  role: '销售经理',
  roleId: 'role-sales-manager',
  permissions: [
    { module: '订单/新增订单', actions: ['read', 'write'] },
    { module: '订单/订单列表', actions: ['read', 'write'] },
  ],
};

const superAdmin: AuthenticatedUser = {
  ...reviewer,
  id: 'user-super-admin',
  name: '超级管理员',
  account: 'super_admin',
  role: '超级管理员',
  roleId: 'role-super-admin',
  permissions: [{ module: '全部', actions: ['admin'] }],
};

function application(overrides: Partial<OrderApplication> = {}): OrderApplication {
  return {
    id: 'oa-concurrent-1',
    applicationNo: 'OAPP-20260712-0001',
    status: '待财务审核',
    orderData: {
      customerId: 'customer-1',
      customerName: '数据库客户',
      productId: 'product-1',
      productName: '数据库产品',
      productLevel: '899',
      orderType: '新购',
      amount: 899,
      actualAmount: 899,
      paymentMethod: '对公转账',
      status: '已确认',
      refundStatus: '无',
      owner: '销售小王',
      salesId: 'user-sales',
      salesName: '销售小王',
      payments: [],
    },
    applicantId: 'user-sales',
    applicantName: '销售小王',
    submittedAt: '2026-07-12T07:00:00.000Z',
    reviewLogs: [{
      id: 'log-submit',
      action: 'submit',
      operatorId: 'user-sales',
      operatorName: '销售小王',
      createdAt: '2026-07-12T07:00:00.000Z',
    }],
    createdAt: '2026-07-12T07:00:00.000Z',
    updatedAt: '2026-07-12T07:00:00.000Z',
    ...overrides,
  };
}

function databaseUser(user: AuthenticatedUser) {
  return {
    id: user.id,
    name: user.name,
    account: user.account,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar: null,
    departmentId: user.departmentId || null,
    positionId: null,
    positionName: null,
    roleId: user.roleId || null,
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: user.isActive,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}

function role(dataScope: 'all' | 'self' = 'all') {
  return {
    id: 'role-finance',
    name: '财务专员',
    code: 'finance_specialist',
    description: null,
    departmentId: 'dept-finance',
    permissions: [{ module: '订单/订单审核台', actions: ['read', 'write'] }],
    dataScopes: { orderApplications: dataScope },
    memberCount: 1,
    isActive: true,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}

function department() {
  return {
    id: 'dept-finance',
    name: '财务部',
    code: 'FINANCE',
    description: null,
    parentId: null,
    managerId: null,
    memberCount: 1,
    sortOrder: 1,
    isActive: true,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}

function rowKey(domain: string, recordId: string): string {
  return `${domain}\u0000${recordId}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

class FakePrisma {
  readonly rows = new Map<string, StoredRow>();
  readonly users: any[];
  readonly roles: any[];
  readonly departments: any[];
  readonly associationLockKeys: string[] = [];
  transactionAttempts = 0;
  p2034FailuresRemaining = 0;
  private lockTails = new Map<string, Promise<void>>();

  readonly user = { findMany: async () => clone(this.users) };
  readonly role = { findMany: async () => clone(this.roles) };
  readonly department = { findMany: async () => clone(this.departments) };

  constructor(options: { application?: OrderApplication; dataScope?: 'all' | 'self' } = {}) {
    const storedApplication = options.application || application();
    this.users = [
      databaseUser(reviewer),
      databaseUser(salesApplicant),
      databaseUser(salesManager),
    ];
    this.roles = [role(options.dataScope), {
      ...role('self'),
      id: 'role-sales',
      name: '销售顾问',
      code: 'sales_consultant',
      departmentId: 'dept-sales',
      permissions: [
        { module: '订单/新增订单', actions: ['read', 'write'] },
        { module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] },
      ],
      dataScopes: { customers: 'self', orders: 'self', orderApplications: 'self' },
    }, {
      ...role('self'),
      id: 'role-sales-manager',
      name: '销售经理',
      code: 'sales_manager',
      departmentId: 'dept-sales',
      permissions: [
        { module: '订单/新增订单', actions: ['read', 'write'] },
        { module: '订单/订单列表', actions: ['read', 'write'] },
        { module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] },
      ],
      dataScopes: { customers: 'department', orders: 'department', orderApplications: 'department' },
    }];
    this.departments = [department(), { ...department(), id: 'dept-sales', name: '销售部', code: 'SALES' }];
    this.rows.set(rowKey(STORAGE_KEYS.ORDER_APPLICATIONS, storedApplication.id), {
      id: `${STORAGE_KEYS.ORDER_APPLICATIONS}:${storedApplication.id}`,
      domain: STORAGE_KEYS.ORDER_APPLICATIONS,
      recordId: storedApplication.id,
      title: storedApplication.applicationNo,
      status: storedApplication.status,
      owner: storedApplication.applicantName,
      customerId: storedApplication.orderData.customerId,
      orderId: storedApplication.orderId || null,
      amount: storedApplication.orderData.actualAmount,
      eventAt: new Date(storedApplication.updatedAt),
      data: clone(storedApplication),
      createdAt: new Date(storedApplication.createdAt),
      updatedAt: new Date(storedApplication.updatedAt),
    });
    this.rows.set(rowKey(STORAGE_KEYS.CUSTOMERS, 'customer-1'), {
      id: `${STORAGE_KEYS.CUSTOMERS}:customer-1`,
      domain: STORAGE_KEYS.CUSTOMERS,
      recordId: 'customer-1',
      title: '数据库客户',
      status: 'following',
      owner: '销售小王',
      customerId: 'customer-1',
      data: {
        id: 'customer-1',
        name: '数据库客户',
        company: '数据库公司',
        phone: '13900000000',
        owner: '销售小王',
        sourceType: '公司资源',
        leadSource: '官网',
        customerLevel: 'L1',
        lifecycleStatusCode: 'following',
        totalSpent: 0,
        orderCount: 0,
        growthPath: [],
        growthRecords: [],
        createdAt: NOW,
        updatedAt: NOW,
      },
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    });
    this.rows.set(rowKey(STORAGE_KEYS.PRODUCTS, 'product-1'), {
      id: `${STORAGE_KEYS.PRODUCTS}:product-1`,
      domain: STORAGE_KEYS.PRODUCTS,
      recordId: 'product-1',
      title: '数据库产品',
      data: {
        id: 'product-1',
        name: '数据库产品',
        level: '899',
        price: 899,
        deliveryStages: [],
        isActive: true,
        sortOrder: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
    });
  }

  private async acquire(key: string): Promise<() => void> {
    const previous = this.lockTails.get(key) || Promise.resolve();
    let releaseCurrent!: () => void;
    const current = new Promise<void>((resolve) => { releaseCurrent = resolve; });
    this.lockTails.set(key, previous.then(() => current));
    await previous;
    return releaseCurrent;
  }

  async $transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    this.transactionAttempts += 1;
    if (this.p2034FailuresRemaining > 0) {
      this.p2034FailuresRemaining -= 1;
      throw Object.assign(new Error('deadlock'), { code: 'P2034' });
    }

    const journal = new Map<string, StoredRow | null>();
    let release: (() => void) | undefined;
    const remember = (key: string) => {
      if (!journal.has(key)) journal.set(key, this.rows.has(key) ? clone(this.rows.get(key)!) : null);
    };
    const businessRecord = {
      findUnique: async ({ where }: any) => {
        const target = where.domain_recordId;
        const value = this.rows.get(rowKey(target.domain, target.recordId));
        return value ? clone(value) : null;
      },
      create: async ({ data }: any) => {
        const key = rowKey(data.domain, data.recordId);
        if (this.rows.has(key)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        remember(key);
        const value = { ...clone(data), createdAt: new Date(NOW), updatedAt: new Date(NOW) } as StoredRow;
        this.rows.set(key, value);
        return clone(value);
      },
      update: async ({ where, data }: any) => {
        const target = where.domain_recordId;
        const key = rowKey(target.domain, target.recordId);
        const current = this.rows.get(key);
        if (!current) throw Object.assign(new Error('missing'), { code: 'P2025' });
        remember(key);
        const value = { ...current, ...clone(data), updatedAt: new Date(NOW) };
        this.rows.set(key, value);
        return clone(value);
      },
      delete: async ({ where }: any) => {
        const target = where.domain_recordId;
        const key = rowKey(target.domain, target.recordId);
        const current = this.rows.get(key);
        if (!current) throw Object.assign(new Error('missing'), { code: 'P2025' });
        remember(key);
        this.rows.delete(key);
        return clone(current);
      },
    };
    const tx = {
      businessRecord,
      appStorage: {
        upsert: async ({ where }: any) => {
          this.associationLockKeys.push(String(where.key));
          return { key: where.key, value: { kind: 'customer_association_lock' } };
        },
      },
      $queryRaw: async (query: TemplateStringsArray | { strings?: string[]; values?: unknown[] }, ...taggedValues: unknown[]) => {
        const rawQuery = query as any;
        const text = Array.isArray(rawQuery)
          ? rawQuery.join('?')
          : Array.isArray(rawQuery?.strings) ? rawQuery.strings.join('?') : '';
        const values = Array.isArray(rawQuery?.values)
          ? rawQuery.values as unknown[]
          : taggedValues;
        // The association lock protocol issues several lock-only SQL queries.
        // They need no row emulation in this in-memory aggregate fixture.
        if (text.includes('app_storage') || text.includes('lead_records') || text.includes('customer_todos')) {
          return [];
        }
        if (text.includes('SELECT id FROM business_records') && text.includes('customerId IN')) {
          return [];
        }
        const domain = String(values[0] || '');
        const recordId = String(values[1] || '');
        release = await this.acquire(rowKey(domain, recordId));
        const value = this.rows.get(rowKey(domain, recordId));
        return value ? [clone(value)] : [];
      },
    };

    try {
      return await callback(tx);
    } catch (error) {
      for (const [key, original] of journal) {
        if (original) this.rows.set(key, original);
        else this.rows.delete(key);
      }
      throw error;
    } finally {
      release?.();
    }
  }

  domainRows(domain: string): StoredRow[] {
    return Array.from(this.rows.values()).filter((row) => row.domain === domain).map(clone);
  }

  applicationRow(id = 'oa-concurrent-1'): StoredRow {
    return clone(this.rows.get(rowKey(STORAGE_KEYS.ORDER_APPLICATIONS, id))!);
  }
}

const deferredEffects: OrderApprovalEffectState = {
  customerOrderStats: 'deferred',
  commissionGeneration: 'deferred',
  deliveryCreation: 'deferred',
  customerLifecycle: 'deferred',
};

{
  const approvedApplication = application({
    status: '已入库',
    orderId: 'order-deleted',
    orderNo: 'ORD-DELETED',
  });
  const prisma = new FakePrisma({ application: approvedApplication });
  prisma.rows.set(rowKey(STORAGE_KEYS.ORDERS, 'order-deleted'), {
    id: `${STORAGE_KEYS.ORDERS}:order-deleted`,
    domain: STORAGE_KEYS.ORDERS,
    recordId: 'order-deleted',
    title: '已删除订单',
    status: '已确认',
    orderId: 'order-deleted',
    data: {
      ...approvedApplication.orderData,
      id: 'order-deleted',
      orderNo: 'ORD-DELETED',
      deletedAt: NOW,
      deletedBy: '超级管理员',
      deleteReason: '测试删除',
      createdAt: NOW,
      updatedAt: NOW,
    },
  });
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });

  assert.equal((await service.cleanupDeletedSource('oa-concurrent-1', '清理残留', reviewer)).code, 403);
  assert.equal((await service.cleanupDeletedSource('oa-concurrent-1', '', superAdmin)).code, 400);
  const result = await service.cleanupDeletedSource('oa-concurrent-1', '源订单已删除，清理残留', superAdmin);
  assert.equal(result.code, 0, result.message);
  assert.equal(result.data, true);
  assert.equal(prisma.rows.has(rowKey(STORAGE_KEYS.ORDER_APPLICATIONS, 'oa-concurrent-1')), false);
}

{
  const approvedApplication = application({ status: '已入库', orderId: 'order-active', orderNo: 'ORD-ACTIVE' });
  const prisma = new FakePrisma({ application: approvedApplication });
  prisma.rows.set(rowKey(STORAGE_KEYS.ORDERS, 'order-active'), {
    id: `${STORAGE_KEYS.ORDERS}:order-active`, domain: STORAGE_KEYS.ORDERS, recordId: 'order-active',
    title: '活动订单', status: '已确认', orderId: 'order-active',
    data: { ...approvedApplication.orderData, id: 'order-active', orderNo: 'ORD-ACTIVE', createdAt: NOW, updatedAt: NOW },
  });
  const result = await createOrderApplicationService(prisma as any).cleanupDeletedSource(
    'oa-concurrent-1',
    '不可清理活动订单',
    superAdmin,
  );
  assert.equal(result.code, 409);
  assert.equal(prisma.rows.has(rowKey(STORAGE_KEYS.ORDER_APPLICATIONS, 'oa-concurrent-1')), true);
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const result = await service.approve('oa-concurrent-1', reviewer);

  assert.equal(result.code, 0, result.message);
  assert.equal(result.data?.application.status, '已入库');
  assert.equal(result.data?.application.reviewerId, reviewer.id);
  assert.equal(result.data?.application.reviewerName, reviewer.name);
  assert.equal(result.data?.replayed, false);
  assert.match(result.data?.order.id || '', /^order-[a-f0-9]{16}$/);
  assert.match(result.data?.order.orderNo || '', /^ORD-20260712-[A-Z0-9]+$/);
  assert.deepEqual(result.data?.downstreamEffects, deferredEffects, 'service does not pretend legacy downstream effects ran');
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS).length, 1);
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS)[0].data.sourceApplicationId, 'oa-concurrent-1');
  assert.ok(
    prisma.associationLockKeys.includes('aaos_customer_association_lock:customer-1'),
    '审批入库写正式订单前必须取得客户关联锁',
  );
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const [first, second] = await Promise.all([
    service.approve('oa-concurrent-1', reviewer),
    service.approve('oa-concurrent-1', reviewer),
  ]);

  assert.equal(first.code, 0);
  assert.equal(second.code, 0);
  assert.equal(first.data?.order.id, second.data?.order.id);
  assert.equal(first.data?.order.orderNo, second.data?.order.orderNo);
  assert.equal([first.data?.replayed, second.data?.replayed].filter(Boolean).length, 1);
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS).length, 1);
  const stored = prisma.applicationRow().data as OrderApplication;
  assert.equal(stored.reviewLogs.filter((log) => log.action === 'approve').length, 1);
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const first = await service.approve('oa-concurrent-1', reviewer);
  const replay = await service.approve('oa-concurrent-1', reviewer);
  assert.equal(replay.code, 0);
  assert.equal(replay.data?.replayed, true);
  assert.equal(replay.data?.order.id, first.data?.order.id);
  assert.equal(replay.data?.application.reviewerId, reviewer.id);
}

{
  const prisma = new FakePrisma({ application: application({ status: '已驳回' }) });
  const result = await createOrderApplicationService(prisma as any).approve('oa-concurrent-1', reviewer);
  assert.equal(result.code, 409);
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS).length, 0);
}

{
  const approved = application({
    status: '已入库',
    orderId: 'order-missing',
    orderNo: 'ORD-20260712-MISSING',
  });
  const prisma = new FakePrisma({ application: approved });
  const result = await createOrderApplicationService(prisma as any).approve(approved.id, reviewer);
  assert.equal(result.code, 409);
  assert.match(result.message, /正式订单/);
}

{
  const prisma = new FakePrisma({ dataScope: 'self' });
  const result = await createOrderApplicationService(prisma as any).approve('oa-concurrent-1', reviewer);
  assert.equal(result.code, 403);
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS).length, 0);
}

{
  const prisma = new FakePrisma();
  let hookCalls = 0;
  const service = createOrderApplicationService(prisma as any, {
    now: () => new Date(NOW),
    applyDownstreamEffects: async ({ transaction, application: source, order }) => {
      hookCalls += 1;
      assert.ok(transaction.businessRecord);
      assert.equal(source.id, 'oa-concurrent-1');
      assert.match(order.id, /^order-/);
      return {
        customerOrderStats: 'applied',
        deliveryCreation: 'applied',
      };
    },
  });
  const first = await service.approve('oa-concurrent-1', reviewer);
  const replay = await service.approve('oa-concurrent-1', reviewer);
  assert.equal(hookCalls, 1, 'transactional downstream hook is not repeated on idempotent replay');
  assert.deepEqual(first.data?.downstreamEffects, {
    ...deferredEffects,
    customerOrderStats: 'applied',
    deliveryCreation: 'applied',
  });
  assert.deepEqual(replay.data?.downstreamEffects, first.data?.downstreamEffects);
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, {
    now: () => new Date(NOW),
    applyDownstreamEffects: async () => {
      throw new Error('commission projection failed');
    },
  });
  await assert.rejects(() => service.approve('oa-concurrent-1', reviewer), /commission projection failed/);
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS).length, 0, 'hook failure rolls the formal order back');
  assert.equal(prisma.applicationRow().data.status, '待财务审核', 'hook failure rolls the application transition back');
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, {
    now: () => new Date(NOW),
    applyDownstreamEffects: async () => {
      throw new CustomerWriteConflictError();
    },
  });
  const result = await service.approve('oa-concurrent-1', reviewer);
  assert.equal(result.code, 409);
  assert.match(result.message, /客户记录已更新/);
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS).length, 0, '客户投影冲突回滚正式订单');
  assert.equal(prisma.applicationRow().data.status, '待财务审核', '客户投影冲突回滚申请状态');
}

{
  const prisma = new FakePrisma();
  prisma.p2034FailuresRemaining = 2;
  const result = await createOrderApplicationService(prisma as any, { now: () => new Date(NOW) })
    .approve('oa-concurrent-1', reviewer);
  assert.equal(result.code, 0);
  assert.equal(prisma.transactionAttempts, 3);
}

{
  const prisma = new FakePrisma();
  prisma.p2034FailuresRemaining = 3;
  const result = await createOrderApplicationService(prisma as any, { now: () => new Date(NOW) })
    .approve('oa-concurrent-1', reviewer);
  assert.equal(result.code, 409);
  assert.equal(prisma.transactionAttempts, 3, 'P2034 retry loop is bounded');
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS).length, 0);
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const result = await service.submit({
    ...application().orderData,
    customerName: '客户端伪造客户名',
    productId: 'product-1',
    productName: '客户端伪造产品名',
    owner: '其他销售',
    salesId: 'user-other',
    salesName: '其他销售',
  }, salesApplicant);

  assert.equal(result.code, 403, '普通销售不得伪造订单归属，也不得静默回退为自己');
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDER_APPLICATIONS).length, 1, '越权代录不得新增申请');
}

{
  const prisma = new FakePrisma();
  const result = await createOrderApplicationService(prisma as any, { now: () => new Date(NOW) }).submit({
    ...application().orderData,
    productId: 'product-1',
    salesId: undefined,
  }, salesApplicant);

  assert.equal(result.code, 400, '缺少稳定销售负责人 ID 时必须拒绝，不能回退到提交人');
  assert.match(result.message, /销售负责人/);
}

{
  const prisma = new FakePrisma();
  const storedApplicant = prisma.users.find((user) => user.id === salesApplicant.id)!;
  storedApplicant.roleId = 'role-customer-access-revoked';
  const result = await createOrderApplicationService(prisma as any, { now: () => new Date(NOW) }).submit({
    ...application().orderData,
    productId: 'product-1',
  }, salesApplicant);

  assert.equal(result.code, 403, '客户读权必须使用实时目录中的稳定 roleId，不得继续信任会话角色');
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDER_APPLICATIONS).length, 1, '被拒绝时不得新建订单申请');
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const invalid = await service.submit({
    ...application().orderData,
    productId: 'product-1',
    actualAmount: 0,
  }, salesApplicant);
  const missingProduct = await service.submit({
    ...application().orderData,
    productId: 'product-missing',
  }, salesApplicant);
  const invalidListAmount = await service.submit({
    ...application().orderData,
    productId: 'product-1',
    amount: -1,
    actualAmount: 899,
  }, salesApplicant);

  assert.equal(invalid.code, 400);
  assert.equal(missingProduct.code, 409);
  assert.equal(invalidListAmount.code, 400);
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const tooManyPaymentProofs = await service.submit({
    ...application().orderData,
    productId: 'product-1',
    payments: [{
      id: 'payment-1', amount: 899, paymentMethod: '对公转账', paidAt: NOW,
      attachments: [
        attachment('payment-1', 'order-payment-proof'),
        attachment('payment-2', 'order-payment-proof'),
      ],
    }],
  }, salesApplicant);
  assert.equal(tooManyPaymentProofs.code, 400);
  assert.match(tooManyPaymentProofs.message, /付款截图最多上传 1 张/);

  const eightDealEvidence = await service.submit({
    ...application().orderData,
    productId: 'product-1',
    dealEvidenceAttachments: Array.from({ length: 8 }, (_, index) => (
      attachment(`deal-${index}`, 'order-deal-evidence')
    )),
  }, salesApplicant);
  assert.equal(eightDealEvidence.code, 0);
  assert.equal(eightDealEvidence.data?.orderData.dealEvidenceAttachments?.length, 8);
}

{
  const prisma = new FakePrisma();
  prisma.users.push(databaseUser({
    ...salesApplicant,
    id: 'user-sales-same-name',
    account: 'sales_same_name',
    email: 'sales_same_name@example.com',
  }));
  const result = await createOrderApplicationService(prisma as any, { now: () => new Date(NOW) }).submit({
    ...application().orderData,
    productId: 'product-1',
  }, salesApplicant);

  assert.equal(result.code, 409, '员工姓名不唯一时不能依赖姓名范围提交订单');
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const result = await service.submit({
    ...application().orderData,
    productId: 'product-1',
    owner: '销售小王',
    salesId: 'user-sales',
    salesName: '销售小王',
  }, salesManager);

  assert.equal(result.code, 0);
  assert.equal(result.data?.applicantId, salesManager.id, '申请人必须取当前登录用户');
  assert.equal(result.data?.orderData.salesId, salesApplicant.id, '部门主管可通过稳定员工 ID 代录');
  assert.equal(result.data?.orderData.salesName, salesApplicant.name);
}

{
  const prisma = new FakePrisma();
  prisma.users.push(databaseUser(superAdmin));
  prisma.roles.push({
    ...role('all'),
    id: superAdmin.roleId,
    name: '超级管理员',
    code: 'super_admin',
    permissions: [{ module: '全部', actions: ['admin'] }],
    dataScopes: { customers: 'all', orders: 'all', orderApplications: 'all' },
  });
  const result = await createOrderApplicationService(prisma as any, { now: () => new Date(NOW) }).submit({
    ...application().orderData,
    productId: 'product-1',
    owner: salesApplicant.name,
    salesId: salesApplicant.id,
    salesName: salesApplicant.name,
  }, superAdmin);

  assert.equal(result.code, 0, result.message);
  assert.equal(result.data?.applicantId, superAdmin.id, '管理员是提交人');
  assert.equal(result.data?.applicantName, superAdmin.name);
  assert.equal(result.data?.orderData.salesId, salesApplicant.id, '管理员代录不得覆盖选定销售负责人');
  assert.equal(result.data?.orderData.salesName, salesApplicant.name);
  assert.equal(result.data?.orderData.owner, salesApplicant.name);
}

{
  const returned = application({
    status: '退回修改',
    reviewerId: reviewer.id,
    reviewerName: reviewer.name,
    reviewedAt: '2026-07-12T07:30:00.000Z',
    reason: '补充凭证',
  });
  const prisma = new FakePrisma({ application: returned });
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const result = await service.resubmit(returned.id, {
    ...returned.orderData,
    productId: 'product-1',
    notes: '已经补充',
    owner: salesApplicant.name,
    salesId: salesApplicant.id,
    salesName: salesApplicant.name,
  }, salesApplicant);

  assert.equal(result.code, 0);
  assert.equal(result.data?.status, '待财务审核');
  assert.equal(result.data?.reason, undefined);
  assert.equal(result.data?.reviewerId, undefined);
  assert.equal(result.data?.orderData.salesId, salesApplicant.id);
  assert.equal(result.data?.reviewLogs[0].action, 'resubmit');
  assert.equal(result.data?.reviewLogs[0].operatorId, salesApplicant.id);
  assert.ok(
    prisma.associationLockKeys.includes('aaos_customer_association_lock:customer-1'),
    '重新提交更新客户关联申请前必须取得客户关联锁',
  );
}

{
  const returned = application({ status: '退回修改' });
  const prisma = new FakePrisma({ application: returned });
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const otherSales = { ...salesApplicant, id: 'user-sales-other', name: '其他销售' };
  const result = await service.resubmit(returned.id, {
    ...returned.orderData,
    productId: 'product-1',
  }, otherSales);

  assert.equal(result.code, 403);
  assert.equal(prisma.applicationRow().data.status, '退回修改');
}

{
  const rejected = application({ status: '已驳回' });
  const prisma = new FakePrisma({ application: rejected });
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const result = await service.resubmit(rejected.id, {
    ...rejected.orderData,
    productId: 'product-1',
  }, salesApplicant);

  assert.equal(result.code, 409, '已驳回是终态，不允许重新提交');
  assert.equal(prisma.applicationRow().data.status, '已驳回');
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const returned = await service.returnApplication('oa-concurrent-1', '补充付款凭证', reviewer);

  assert.equal(returned.code, 0);
  assert.equal(returned.data?.status, '退回修改');
  assert.equal(returned.data?.reason, '补充付款凭证');
  assert.equal(returned.data?.reviewerId, reviewer.id);
  assert.equal(returned.data?.reviewLogs[0].action, 'return');
  assert.ok(
    prisma.associationLockKeys.includes('aaos_customer_association_lock:customer-1'),
    '退回更新客户关联申请前必须取得客户关联锁',
  );
}

{
  const prisma = new FakePrisma();
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const rejected = await service.reject('oa-concurrent-1', '付款信息无效', reviewer);

  assert.equal(rejected.code, 0);
  assert.equal(rejected.data?.status, '已驳回');
  assert.equal(rejected.data?.reason, '付款信息无效');
  assert.equal(rejected.data?.reviewLogs[0].action, 'reject');
}

// 锁住客户关联后，审核写入仍要重新确认客户未被删除；否则历史脏数据
// 会让退回/驳回继续写入一个已经失效的客户关联申请。
for (const action of [
  (service: ReturnType<typeof createOrderApplicationService>) => service.returnApplication('oa-concurrent-1', '客户已失效', reviewer),
  (service: ReturnType<typeof createOrderApplicationService>) => service.reject('oa-concurrent-1', '客户已失效', reviewer),
]) {
  const prisma = new FakePrisma();
  const customerRow = prisma.rows.get(rowKey(STORAGE_KEYS.CUSTOMERS, 'customer-1'))!;
  customerRow.data.deletedAt = NOW;
  const result = await action(createOrderApplicationService(prisma as any, { now: () => new Date(NOW) }));

  assert.equal(result.code, 409, '客户删除后不得继续审核写入订单申请');
  assert.equal(prisma.applicationRow().data.status, '待财务审核', '客户复核失败时订单申请状态必须保持不变');
}

{
  const prisma = new FakePrisma({ dataScope: 'self' });
  const service = createOrderApplicationService(prisma as any, { now: () => new Date(NOW) });
  const result = await service.returnApplication('oa-concurrent-1', '越权退回', reviewer);

  assert.equal(result.code, 403);
  assert.equal(prisma.applicationRow().data.status, '待财务审核');
}

{
  const dirtyProduct = application({
    orderData: { ...application().orderData, productId: 'product-missing' },
  });
  const prisma = new FakePrisma({ application: dirtyProduct });
  const result = await createOrderApplicationService(prisma as any, { now: () => new Date(NOW) })
    .approve(dirtyProduct.id, reviewer);

  assert.equal(result.code, 409, '历史待审申请的产品稳定 ID 不存在时必须拒绝入库');
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS).length, 0);
}

{
  const dirtySales = application({
    orderData: {
      ...application().orderData,
      salesId: 'user-missing',
      salesName: '不存在销售',
      owner: '不存在销售',
    },
  });
  const prisma = new FakePrisma({ application: dirtySales });
  const result = await createOrderApplicationService(prisma as any, { now: () => new Date(NOW) })
    .approve(dirtySales.id, reviewer);

  assert.equal(result.code, 409, '历史待审申请的销售稳定 ID 不存在时必须拒绝入库');
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS).length, 0);
}

{
  const dirtyCustomer = application({
    orderData: { ...application().orderData, customerName: '被篡改客户名' },
  });
  const prisma = new FakePrisma({ application: dirtyCustomer });
  const result = await createOrderApplicationService(prisma as any, { now: () => new Date(NOW) })
    .approve(dirtyCustomer.id, reviewer);

  assert.equal(result.code, 409, '历史待审申请的客户名称与稳定 ID 不一致时必须拒绝入库');
  assert.equal(prisma.domainRows(STORAGE_KEYS.ORDERS).length, 0);
}
