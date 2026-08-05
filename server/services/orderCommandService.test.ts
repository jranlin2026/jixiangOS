import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Commission, CommissionPayoutRecord } from '../../src/types/commission';
import type { Order } from '../../src/types/order';
import { createOrderCommandService } from './orderCommandService';

const NOW = '2026-07-12T13:00:00.000Z';

const sales: AuthenticatedUser = {
  id: 'user-sales',
  name: '销售小王',
  account: 'sales',
  email: 'sales@example.com',
  phone: '',
  role: '销售顾问',
  roleId: 'role-sales',
  departmentId: 'dept-sales',
  permissions: [
    { module: '订单/编辑订单', actions: ['read', 'write'] },
    { module: '订单/删除订单', actions: ['read', 'delete'] },
  ],
  isActive: true,
};

const otherSales: AuthenticatedUser = {
  ...sales,
  id: 'user-other',
  name: '其他销售',
  account: 'other',
  email: 'other@example.com',
};

const scopedCorrector: AuthenticatedUser = {
  ...sales,
  permissions: [{ module: '订单/订单更正', actions: ['read', 'write'] }],
};

const superAdmin: AuthenticatedUser = {
  ...sales,
  id: 'user-admin',
  name: '超级管理员',
  account: 'admin',
  email: 'admin@example.com',
  role: '超级管理员',
  roleId: 'role-super-admin',
  departmentId: 'dept-admin',
  permissions: [{ module: '全部', actions: ['admin'] }],
};

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    orderNo: 'ORD-20260712-ORDER1',
    customerId: 'customer-1',
    customerName: '数据库客户',
    productId: 'product-1',
    productName: '数据库产品',
    productLevel: '899',
    orderType: '899成交',
    amount: 899,
    actualAmount: 899,
    paymentMethod: '对公转账',
    status: '已确认',
    refundStatus: '无',
    owner: sales.name,
    salesId: sales.id,
    salesName: sales.name,
    resourceOwnership: '公司资源',
    payments: [],
    changeHistory: [],
    createdAt: '2026-07-12T10:00:00.000Z',
    updatedAt: '2026-07-12T10:00:00.000Z',
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

function role() {
  return {
    id: 'role-sales',
    name: '销售顾问',
    code: 'sales_consultant',
    description: null,
    departmentId: 'dept-sales',
    permissions: sales.permissions,
    dataScopes: { orders: 'self' },
    memberCount: 2,
    isActive: true,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}

function superAdminRole() {
  return {
    id: 'role-super-admin',
    name: '超级管理员',
    code: 'super_admin',
    description: null,
    departmentId: 'dept-admin',
    permissions: superAdmin.permissions,
    dataScopes: { orders: 'all' },
    memberCount: 1,
    isActive: true,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}

type Row = {
  id: string;
  domain: string;
  recordId: string;
  data: any;
  updatedAt?: Date;
  status?: string | null;
  owner?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  amount?: number | null;
  [key: string]: any;
};

function key(domain: string, recordId: string): string {
  return `${domain}\u0000${recordId}`;
}

function clone<T>(value: T): T {
  try {
    return structuredClone(value);
  } catch {
    return structuredClone(JSON.parse(JSON.stringify(value)));
  }
}

class FakePrisma {
  readonly rows = new Map<string, Row>();
  readonly forceCustomerVersionConflict: boolean;
  readonly users = [databaseUser(sales), databaseUser(otherSales), databaseUser(superAdmin)];
  readonly roles = [role(), superAdminRole()];
  readonly departments = [{
    id: 'dept-sales', name: '销售部', code: 'SALES', description: null, parentId: null,
    managerId: null, memberCount: 2, sortOrder: 1, isActive: true,
    createdAt: new Date(NOW), updatedAt: new Date(NOW),
  }];
  readonly user = { findMany: async () => clone(this.users) };
  readonly role = { findMany: async () => clone(this.roles) };
  readonly department = { findMany: async () => clone(this.departments) };

  constructor(options: {
    sourceOrder?: Order;
    commissionStatus?: string;
    commissionManual?: boolean;
    deliveryStatus?: string;
    customerDataId?: string;
    forceCustomerVersionConflict?: boolean;
  } = {}) {
    this.forceCustomerVersionConflict = options.forceCustomerVersionConflict === true;
    const sourceOrder = options.sourceOrder || order();
    this.rows.set(key(STORAGE_KEYS.ORDERS, sourceOrder.id), {
      id: `${STORAGE_KEYS.ORDERS}:${sourceOrder.id}`,
      domain: STORAGE_KEYS.ORDERS,
      recordId: sourceOrder.id,
      status: sourceOrder.status,
      owner: sourceOrder.owner,
      customerId: sourceOrder.customerId,
      orderId: sourceOrder.id,
      amount: sourceOrder.actualAmount,
      data: clone(sourceOrder),
    });
    this.rows.set(key(STORAGE_KEYS.CUSTOMERS, 'customer-1'), {
      id: `${STORAGE_KEYS.CUSTOMERS}:customer-1`,
      domain: STORAGE_KEYS.CUSTOMERS,
      recordId: 'customer-1',
      customerId: 'customer-1',
      owner: sales.name,
      amount: 899,
      updatedAt: new Date(NOW),
      data: {
        id: options.customerDataId || 'customer-1', name: '数据库客户', company: '数据库公司', phone: '13900000000',
        owner: sales.name, customerLevel: 'L1', lifecycleStatusCode: 'ordered', totalSpent: 899,
        orderCount: 1, growthPath: [], growthRecords: [], activityRecords: [], createdAt: NOW, updatedAt: NOW,
      },
    });
    this.rows.set(key(STORAGE_KEYS.CUSTOMERS, 'customer-2'), {
      id: `${STORAGE_KEYS.CUSTOMERS}:customer-2`,
      domain: STORAGE_KEYS.CUSTOMERS,
      recordId: 'customer-2',
      customerId: 'customer-2',
      owner: otherSales.name,
      amount: 0,
      updatedAt: new Date(NOW),
      data: {
        id: 'customer-2', name: '更正后客户', company: '更正后公司', phone: '13800000000',
        owner: otherSales.name, ownerId: otherSales.id, sourceType: '个人资源', leadSource: '个人线索',
        sourceName: '合作伙伴', customerLevel: 'L1', lifecycleStatusCode: 'following', totalSpent: 0,
        orderCount: 0, growthPath: [], growthRecords: [], activityRecords: [], createdAt: NOW, updatedAt: NOW,
      },
    });
    this.rows.set(key(STORAGE_KEYS.PRODUCTS, 'product-1'), {
      id: `${STORAGE_KEYS.PRODUCTS}:product-1`,
      domain: STORAGE_KEYS.PRODUCTS,
      recordId: 'product-1',
      data: {
        id: 'product-1', name: '数据库产品', level: '899', price: 899,
        deliveryStages: [], isActive: true, sortOrder: 1, createdAt: NOW, updatedAt: NOW,
      },
    });
    this.rows.set(key(STORAGE_KEYS.PRODUCTS, 'product-2'), {
      id: `${STORAGE_KEYS.PRODUCTS}:product-2`,
      domain: STORAGE_KEYS.PRODUCTS,
      recordId: 'product-2',
      data: {
        id: 'product-2', name: '更正后产品', level: '贴牌', price: 29800,
        deliveryStages: ['方案确认', '正式交付'], isActive: true, sortOrder: 2, createdAt: NOW, updatedAt: NOW,
      },
    });
    if (options.commissionStatus) {
      const sourceCommission: Commission = {
        id: 'commission-1', orderId: sourceOrder.id, orderNo: sourceOrder.orderNo,
        customerName: sourceOrder.customerName, productLevel: sourceOrder.productLevel,
        orderAmount: sourceOrder.actualAmount, performanceAmount: sourceOrder.actualAmount,
        commissionRate: 0, commissionAmount: 100, role: '销售', ownerId: sourceOrder.salesId,
        owner: sourceOrder.salesName || sourceOrder.owner, departmentId: 'dept-sales', department: '销售部',
        paymentDate: sourceOrder.payments?.[0]?.paidAt || sourceOrder.createdAt,
        status: options.commissionStatus as Commission['status'],
        sourceType: options.commissionManual ? '人工新增' : '自动规则',
        sourceBusinessType: 'formal_order', isManualAdjusted: options.commissionManual || undefined,
        paidAt: options.commissionStatus === '已发放' ? NOW : undefined,
        payoutRecordId: options.commissionStatus === '已发放' ? 'payout-1' : undefined,
        createdAt: sourceOrder.createdAt, updatedAt: NOW,
      };
      this.rows.set(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'), {
        id: `${STORAGE_KEYS.COMMISSIONS}:commission-1`,
        domain: STORAGE_KEYS.COMMISSIONS,
        recordId: 'commission-1',
        orderId: sourceOrder.id,
        status: options.commissionStatus,
        owner: sourceCommission.owner,
        amount: sourceCommission.commissionAmount,
        data: sourceCommission,
      });
      if (options.commissionStatus === '已发放') {
        const payout: CommissionPayoutRecord = {
          id: 'payout-1', payoutNo: 'FF-202607-000001', period: '2026-07', status: '已发放',
          totalCount: 1, totalAmount: sourceCommission.commissionAmount, commissionIds: [sourceCommission.id],
          commissionSnapshots: [clone(sourceCommission)], byOwner: [], createdAt: NOW,
          createdById: superAdmin.id, createdByName: superAdmin.name, issuedAt: NOW,
          issuedById: superAdmin.id, issuedByName: superAdmin.name,
        };
        this.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payout.id), {
          id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${payout.id}`,
          domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
          recordId: payout.id,
          status: payout.status,
          amount: payout.totalAmount,
          data: payout,
        });
      }
    }
    if (options.deliveryStatus) {
      this.rows.set(key(STORAGE_KEYS.DELIVERIES, 'delivery-1'), {
        id: `${STORAGE_KEYS.DELIVERIES}:delivery-1`,
        domain: STORAGE_KEYS.DELIVERIES,
        recordId: 'delivery-1',
        orderId: sourceOrder.id,
        status: options.deliveryStatus,
        data: { id: 'delivery-1', orderId: sourceOrder.id, status: options.deliveryStatus },
      });
    }
  }

  async $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
    const before = clone(Array.from(this.rows.entries()));
    const tx = {
      $queryRaw: async (queryOrStrings: TemplateStringsArray | { values?: unknown[] }, ...taggedValues: unknown[]) => {
        const values: unknown[] = Array.isArray(queryOrStrings)
          ? taggedValues
          : (queryOrStrings as { values?: unknown[] }).values || [];
        if (values[0] === STORAGE_KEYS.COMMISSIONS) {
          return Array.from(this.rows.values())
            .filter((row) => row.domain === STORAGE_KEYS.COMMISSIONS
              && (row.orderId === values[1] || row.data?.orderId === values[1]))
            .map(clone);
        }
        const row = this.rows.get(key(String(values[0] || ''), String(values[1] || '')));
        return row ? [clone(row)] : [];
      },
      businessRecord: {
        findUnique: async ({ where }: any) => {
          const target = where.domain_recordId;
          return clone(this.rows.get(key(target.domain, target.recordId)) || null);
        },
        findMany: async ({ where }: any) => Array.from(this.rows.values())
          .filter((row) => row.domain === where.domain)
          .filter((row) => !where.orderId || row.orderId === where.orderId)
          .map(clone),
        create: async ({ data }: any) => {
          const rowKey = key(data.domain, data.recordId);
          if (this.rows.has(rowKey)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
          const next = clone(data);
          this.rows.set(rowKey, next);
          return clone(next);
        },
        deleteMany: async ({ where }: any) => {
          const matches = Array.from(this.rows.entries()).filter(([, row]) => (
            row.domain === where.domain
            && (!where.orderId || row.orderId === where.orderId)
            && (!where.recordId?.in || where.recordId.in.includes(row.recordId))
          ));
          matches.forEach(([rowKey]) => this.rows.delete(rowKey));
          return { count: matches.length };
        },
        update: async ({ where, data }: any) => {
          const target = where.domain_recordId;
          const rowKey = key(target.domain, target.recordId);
          const current = this.rows.get(rowKey);
          if (!current) throw new Error(`missing ${rowKey}`);
          const next = { ...current, ...clone(data) };
          this.rows.set(rowKey, next);
          return clone(next);
        },
        updateMany: async ({ where, data }: any) => {
          if (this.forceCustomerVersionConflict) return { count: 0 };
          const current = Array.from(this.rows.values()).find((row) => row.id === where.id);
          const matchesVersion = current?.updatedAt?.getTime() === where.updatedAt?.getTime();
          if (!current || current.domain !== where.domain || current.recordId !== where.recordId || !matchesVersion) {
            return { count: 0 };
          }
          const rowKey = key(current.domain, current.recordId);
          this.rows.set(rowKey, {
            ...current,
            ...clone(data),
            updatedAt: new Date(current.updatedAt!.getTime() + 1),
          });
          return { count: 1 };
        },
      },
    };
    try {
      return await callback(tx);
    } catch (error) {
      this.rows.clear();
      before.forEach(([rowKey, row]) => this.rows.set(rowKey, row));
      throw error;
    }
  }

  orderData(): Order {
    return clone(this.rows.get(key(STORAGE_KEYS.ORDERS, 'order-1'))!.data);
  }

  customerData(customerId = 'customer-1'): any {
    return clone(this.rows.get(key(STORAGE_KEYS.CUSTOMERS, customerId))!.data);
  }
}

function seedOrderPaymentFlow(prisma: FakePrisma, sourceOrder: Order, paymentId: string, amount: number, paidAt: string) {
  const sourceEventId = `${sourceOrder.id}:${paymentId}`;
  const recordId = `order_payment:${sourceEventId}`;
  prisma.rows.set(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, recordId), {
    id: `${STORAGE_KEYS.FINANCE_TRANSACTIONS}:${recordId}`,
    domain: STORAGE_KEYS.FINANCE_TRANSACTIONS,
    recordId,
    title: `FT-${paymentId}`,
    status: '已确认',
    orderId: sourceOrder.id,
    amount,
    eventAt: new Date(paidAt),
    data: {
      id: recordId,
      transactionNo: `FT-${paymentId}`,
      type: '订单实收',
      direction: 'income',
      sourceType: 'order_payment',
      sourceDomain: STORAGE_KEYS.ORDERS,
      sourceId: sourceOrder.id,
      sourceEventId,
      sourceModule: '订单',
      amount,
      status: '已确认',
      relatedBusiness: sourceOrder.orderNo,
      orderId: sourceOrder.id,
      orderNo: sourceOrder.orderNo,
      occurredAt: paidAt,
      createdAt: paidAt,
    },
  });
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const correctedPayment = {
    id: 'payment-1',
    amount: 1299,
    paymentMethod: '对公转账' as const,
    paidAt: NOW,
    paymentOrderNo: 'PAY-CORRECTED',
  };
  const result = await createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '录入金额错误',
    data: {
      actualAmount: 1299,
      payments: [correctedPayment],
    },
  }, superAdmin);

  assert.equal(result.code, 0, result.message);
  assert.equal(result.data?.actualAmount, 1299);
  assert.equal(result.data?.payments[0].paymentOrderNo, 'PAY-CORRECTED');
  assert.equal(result.data?.changeHistory?.[0].action, 'correct');
  assert.match(result.data?.changeHistory?.[0].summary || '', /录入金额错误/);
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const service = createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async () => undefined,
  });
  const blankId = await service.correct('order-1', {
    reason: '验证空白付款标识',
    data: {
      actualAmount: 100,
      payments: [{ id: '   ', amount: 100, paymentMethod: '对公转账', paidAt: NOW }],
    },
  }, superAdmin);
  const result = await service.correct('order-1', {
    reason: '验证重复付款标识',
    data: {
      actualAmount: 100,
      payments: [
        { id: 'duplicate-payment', amount: 60, paymentMethod: '对公转账', paidAt: NOW },
        { id: 'duplicate-payment', amount: 40, paymentMethod: '对公转账', paidAt: NOW },
      ],
    },
  }, superAdmin);

  assert.equal(blankId.code, 400);
  assert.match(blankId.message, /缺少唯一标识/);
  assert.equal(result.code, 400);
  assert.match(result.message, /付款标识重复/);
  assert.equal(prisma.orderData().actualAmount, 899, '重复付款标识被拒绝时不得写入半成品订单');
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const result = await createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '验证对象付款标识',
    data: {
      actualAmount: 100,
      payments: [{ id: {} as any, amount: 100, paymentMethod: '对公转账', paidAt: NOW }],
    },
  }, superAdmin);

  assert.equal(result.code, 400);
  assert.equal(prisma.orderData().actualAmount, 899);
}

{
  const existingPayment = { id: 'stable-payment', amount: 100, paymentMethod: '对公转账' as const, paidAt: NOW };
  const cases = [
    {
      label: '替换付款ID',
      data: { actualAmount: 100, payments: [{ ...existingPayment, id: 'replacement-payment' }] },
      message: /不能删除或更换标识/,
    },
    {
      label: '调高旧付款',
      data: { actualAmount: 120, payments: [{ ...existingPayment, amount: 120 }] },
      message: /不能直接调高/,
    },
    {
      label: '修改旧付款时间',
      data: { actualAmount: 100, payments: [{ ...existingPayment, paidAt: '2026-07-31T00:00:00.000Z' }] },
      message: /付款时间属于不可变资金记录/,
    },
  ];
  for (const testCase of cases) {
    const sourceOrder = order({ actualAmount: 100, amount: 100, payments: [existingPayment] });
    const prisma = new FakePrisma({ sourceOrder, commissionStatus: '待确认' });
    seedOrderPaymentFlow(prisma, sourceOrder, existingPayment.id, existingPayment.amount, existingPayment.paidAt);
    const result = await createOrderCommandService(prisma as any, {
      now: () => new Date(NOW),
      rebuildPendingCommissions: async () => undefined,
    }).correct(sourceOrder.id, { reason: testCase.label, data: testCase.data }, superAdmin);
    assert.equal(result.code, 409, testCase.label);
    assert.match(result.message, testCase.message);
  }
}

{
  const sourceOrder = order({
    actualAmount: 100,
    amount: 100,
    payments: [{ id: 'payment-1', amount: 100, paymentMethod: '对公转账', paidAt: NOW }],
  });
  const prisma = new FakePrisma({ sourceOrder, commissionStatus: '待确认' });
  seedOrderPaymentFlow(prisma, sourceOrder, 'payment-1', 100, NOW);
  let correctionNow = new Date(NOW);
  const service = createOrderCommandService(prisma as any, {
    now: () => correctionNow,
    rebuildPendingCommissions: async () => undefined,
  });
  const increased = await service.correct(sourceOrder.id, {
    reason: '新增一笔收款',
    data: {
      actualAmount: 120,
      payments: [
        sourceOrder.payments![0],
        { id: 'payment-2', amount: 20, paymentMethod: '对公转账', paidAt: NOW },
      ],
    },
  }, superAdmin);
  assert.equal(increased.code, 0, increased.message);
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.FINANCE_TRANSACTIONS, 'order_payment:order-1:payment-2')), true,
    '新增付款必须与订单更正在同一事务写入原实收流水');

  correctionNow = new Date(new Date(NOW).getTime() + 1_000);
  const decreased = await service.correct(sourceOrder.id, {
    reason: '下调原付款',
    data: {
      actualAmount: 100,
      payments: [
        { ...sourceOrder.payments![0], amount: 80 },
        { id: 'payment-2', amount: 20, paymentMethod: '对公转账', paidAt: NOW },
      ],
    },
  }, superAdmin);
  assert.equal(decreased.code, 0, decreased.message);
  assert.equal(prisma.rows.has(key(
    STORAGE_KEYS.FINANCE_TRANSACTIONS,
    'order_payment_adjustment:order-1:payment-1:80',
  )), true, '旧付款下调必须与订单更正在同一事务写入规范冲正');
}

{
  const sourceOrder = order({
    actualAmount: 100,
    amount: 100,
    payments: [{ id: 'missing-original', amount: 100, paymentMethod: '对公转账', paidAt: NOW }],
  });
  const prisma = new FakePrisma({ sourceOrder, commissionStatus: '待确认' });
  const result = await createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async () => undefined,
  }).correct(sourceOrder.id, {
    reason: '下调缺失原流水的付款',
    data: { actualAmount: 80, payments: [{ ...sourceOrder.payments![0], amount: 80 }] },
  }, superAdmin);

  assert.equal(result.code, 409, '缺失原流水时订单更正必须返回可处理冲突，不能抛500');
  assert.match(result.message, /原实收流水不存在/);
  assert.equal(prisma.orderData().actualAmount, 100, '资金链修复失败时订单更正必须整单回滚');
}

{
  const prisma = new FakePrisma({ sourceOrder: order({ salesId: otherSales.id, salesName: otherSales.name, owner: otherSales.name }) });
  const precheck = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).precheckCorrection('order-1', scopedCorrector);

  assert.equal(precheck.code, 403);
  assert.match(precheck.message, /无权更正/);
  assert.equal(precheck.data, null, '越权预检不能泄露分账状态');

  const result = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '尝试越权更正',
    data: { notes: '不应保存' },
  }, scopedCorrector);

  assert.equal(result.code, 403);
  assert.match(result.message, /无权更正/);
  assert.notEqual(prisma.orderData().notes, '不应保存');
}

{
  const prisma = new FakePrisma({ sourceOrder: order({ salesId: undefined, salesName: sales.name, owner: sales.name }) });
  const precheck = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).precheckCorrection('order-1', scopedCorrector);

  assert.equal(precheck.code, 403);
  assert.match(precheck.message, /无权更正/);
  assert.equal(precheck.data, null, '历史姓名相同也不能替代员工 ID 授权');
}

{
  const prisma = new FakePrisma({ commissionStatus: '待发放' });
  const result = await createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async (transaction: any, nextOrder: Order) => {
      await transaction.businessRecord.create({
        data: {
          id: `${STORAGE_KEYS.COMMISSIONS}:commission-rebuilt`,
          domain: STORAGE_KEYS.COMMISSIONS,
          recordId: 'commission-rebuilt',
          orderId: nextOrder.id,
          status: '待确认',
          amount: 100,
          data: {
            id: 'commission-rebuilt', orderId: nextOrder.id, orderNo: nextOrder.orderNo,
            customerName: nextOrder.customerName, productLevel: nextOrder.productLevel,
            orderAmount: nextOrder.actualAmount, commissionRate: 0, commissionAmount: 100,
            role: '销售', owner: nextOrder.owner, department: '销售部', status: '待确认',
          },
        },
      });
    },
  }).correct('order-1', {
    reason: '付款金额录错',
    data: {
      actualAmount: 999,
      payments: [{ id: 'pay-1', amount: 999, paymentMethod: '对公转账', paidAt: NOW }],
    },
  }, superAdmin);

  assert.equal(result.code, 0, result.message);
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, 'commission-1')), false, '原待发放分账应自动撤回并移除');
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, 'commission-rebuilt')), true, '应按更正后的订单重新生成待确认分账');
  const log = Array.from(prisma.rows.values()).find((row) => row.domain === STORAGE_KEYS.COMMISSION_OPERATION_LOGS);
  assert.equal(log?.data.action, '更正订单');
  assert.match(log?.data.reason || '', /付款金额录错/);
}

{
  const sourceOrder = order({
    amount: 30699,
    actualAmount: 30699,
    items: [
      {
        id: 'item-product-1', productId: 'product-1', productName: '数据库产品', productLevel: '899',
        unitPrice: 899, quantity: 1, subtotal: 899, allocatedActualAmount: 899, isPrimary: true, sortOrder: 1,
      },
      {
        id: 'item-product-2', productId: 'product-2', productName: '更正后产品', productLevel: '贴牌',
        unitPrice: 29800, quantity: 1, subtotal: 29800, allocatedActualAmount: 29800, isPrimary: false, sortOrder: 2,
      },
    ],
    standardTotalAmount: 30699,
  });
  const prisma = new FakePrisma({ sourceOrder, commissionStatus: '待确认' });
  for (const item of sourceOrder.items!) {
    const recordId = `delivery-${item.id}`;
    prisma.rows.set(key(STORAGE_KEYS.DELIVERIES, recordId), {
      id: `${STORAGE_KEYS.DELIVERIES}:${recordId}`,
      domain: STORAGE_KEYS.DELIVERIES,
      recordId,
      orderId: sourceOrder.id,
      status: '待开始',
      amount: item.allocatedActualAmount,
      data: {
        id: recordId,
        orderId: sourceOrder.id,
        orderItemId: item.id,
        orderNo: sourceOrder.orderNo,
        customerId: sourceOrder.customerId,
        customerName: sourceOrder.customerName,
        productName: item.productName,
        productType: item.productLevel,
        productQuantity: item.quantity,
        orderAmount: item.allocatedActualAmount,
        status: '待开始',
        stages: ['交付'],
        tasks: [],
      },
    });
  }
  const result = await createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '只修改备注',
    data: { notes: '已复核', items: sourceOrder.items },
  }, superAdmin);

  assert.equal(result.code, 0, result.message);
  const firstDelivery = prisma.rows.get(key(STORAGE_KEYS.DELIVERIES, 'delivery-item-product-1'))?.data;
  const secondDelivery = prisma.rows.get(key(STORAGE_KEYS.DELIVERIES, 'delivery-item-product-2'))?.data;
  assert.equal(firstDelivery.orderItemId, 'item-product-1');
  assert.equal(firstDelivery.productName, '数据库产品');
  assert.equal(firstDelivery.orderAmount, 899);
  assert.equal(secondDelivery.orderItemId, 'item-product-2');
  assert.equal(secondDelivery.productName, '更正后产品');
  assert.equal(secondDelivery.orderAmount, 29800);

  const switchedItems = result.data!.items!.map((item) => ({ ...item, isPrimary: item.id === 'item-product-2' }));
  const switched = await createOrderCommandService(prisma as any, {
    now: () => new Date('2026-07-12T13:01:00.000Z'),
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '切换主产品',
    data: { items: switchedItems },
  }, superAdmin);
  assert.equal(switched.code, 0, switched.message);
  assert.equal(switched.data?.deliveryId, 'delivery-item-product-2', '切换主产品后旧的单交付入口应指向新主产品');
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const result = await createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '更正为需交付的产品',
    data: {
      items: [{
        id: 'legacy-primary', productId: 'product-2', productName: '更正后产品', productLevel: '贴牌',
        unitPrice: 29800, quantity: 1, subtotal: 29800, isPrimary: true, sortOrder: 1,
      }],
    },
  }, superAdmin);

  assert.equal(result.code, 409);
  assert.match(result.message, /新建交付单/);
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认', deliveryStatus: '待开始' });
  const result = await createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '客户、产品和负责人录入错误',
    data: {
      customerId: 'customer-2',
      productId: 'product-2',
      salesId: otherSales.id,
      orderType: '新代理',
      actualAmount: 29800,
      payments: [{ id: 'pay-1', amount: 29800, paymentMethod: '对公转账', paidAt: NOW }],
    },
  }, superAdmin);

  assert.equal(result.code, 0, result.message);
  assert.equal(result.data?.customerName, '更正后客户');
  assert.equal(result.data?.productName, '更正后产品');
  assert.equal(result.data?.productLevel, '贴牌');
  assert.equal(result.data?.salesName, otherSales.name);
  assert.equal(result.data?.owner, otherSales.name);
  assert.equal(result.data?.leadSource, '个人线索');
  assert.equal(result.data?.sourceName, '合作伙伴');
  assert.equal(prisma.customerData('customer-1').orderCount, 0, '原客户订单投影应扣除该订单');
  assert.equal(prisma.customerData('customer-2').orderCount, 1, '新客户订单投影应计入该订单');
  const delivery = prisma.rows.get(key(STORAGE_KEYS.DELIVERIES, 'delivery-1'))?.data;
  assert.equal(delivery.customerId, 'customer-2');
  assert.equal(delivery.productName, '更正后产品');
  assert.deepEqual(delivery.stages, ['方案确认', '正式交付'], '未开始交付应切换为更正后产品的交付阶段');
  assert.equal(delivery.salesOwnerId, otherSales.id);
  assert.equal(delivery.orderAmount, 29800);
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const result = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '普通账号尝试更正',
    data: { actualAmount: 999 },
  }, sales);

  assert.equal(result.code, 403);
  assert.match(result.message, /更正权限/);
  assert.equal(prisma.orderData().actualAmount, 899);
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放' });
  let correctionNowCall = 0;
  const previewCommissions = async (_transaction: any, nextOrder: Order): Promise<Commission[]> => [{
    ...(prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission),
    customerName: nextOrder.customerName,
    productLevel: nextOrder.productLevel,
    orderAmount: nextOrder.actualAmount,
    performanceAmount: nextOrder.actualAmount,
    commissionAmount: 120,
    paymentDate: nextOrder.payments?.[0]?.paidAt || nextOrder.createdAt,
    status: '待确认',
    paidAt: undefined,
    payoutRecordId: undefined,
    updatedAt: NOW,
  }];
  const service = createOrderCommandService(prisma as any, {
    // 预览和正式提交是两次独立请求，实际执行时间必然不同。
    now: () => new Date(correctionNowCall++ === 0 ? NOW : '2026-07-12T13:05:00.000Z'),
    rebuildPendingCommissions: async () => undefined,
    previewCommissions,
  });
  const preview = await service.previewCorrection('order-1', {
    reason: '已发放后尝试覆盖金额',
    data: { actualAmount: 999, payments: [{ id: 'paid-correction', amount: 999, paymentMethod: '对公转账', paidAt: NOW }] },
  }, superAdmin);
  assert.equal(preview.code, 0, preview.message);
  assert.equal(preview.data?.supplementAmount, 20);

  const result = await service.correct('order-1', {
    reason: '已发放后尝试覆盖金额',
    data: { actualAmount: 999, payments: [{ id: 'paid-correction', amount: 999, paymentMethod: '对公转账', paidAt: NOW }] },
    expectedImpactHash: preview.data!.impactHash,
  }, superAdmin);

  assert.equal(result.code, 0, result.message);
  assert.equal(prisma.orderData().actualAmount, 999);
  const preserved = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission;
  assert.equal(preserved.status, '已发放');
  assert.equal(preserved.commissionAmount, 100, '原已发放金额必须保留');
  assert.equal(preserved.payoutRecordId, 'payout-1');
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, 'payout-1')), true);
  assert.equal(Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSION_CORRECTIONS), true);
  assert.equal(Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSIONS && row.data.correctionDeltaType === '补发'), true);
  const repeated = await service.previewCorrection('order-1', {
    reason: '再次修改金额',
    data: { actualAmount: 1099, payments: [{ id: 'paid-correction-2', amount: 1099, paymentMethod: '对公转账', paidAt: NOW }] },
  }, superAdmin);
  assert.equal(repeated.code, 409);
  assert.match(repeated.message, /差额更正|叠加更正|财务.*撤回/);
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放' });
  const commissionRow = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!;
  commissionRow.data = { ...commissionRow.data, status: '待发放' };
  const previewCommissions = async (_transaction: any, nextOrder: Order): Promise<Commission[]> => [{
    ...(commissionRow.data as Commission),
    orderAmount: nextOrder.actualAmount,
    performanceAmount: nextOrder.actualAmount,
    commissionAmount: 120,
    status: '待确认',
    paidAt: undefined,
    payoutRecordId: undefined,
  }];
  const service = createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async () => undefined,
    previewCommissions,
  });
  const input = {
    reason: '兼容历史状态索引与JSON不一致',
    data: { actualAmount: 999, payments: [{ id: 'paid-stale-json', amount: 999, paymentMethod: '对公转账' as const, paidAt: NOW }] },
  };
  const preview = await service.previewCorrection('order-1', input, superAdmin);
  assert.equal(preview.code, 0, preview.message);
  const corrected = await service.correct('order-1', { ...input, expectedImpactHash: preview.data!.impactHash }, superAdmin);
  assert.equal(corrected.code, 0, corrected.message);
  const preserved = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission;
  assert.equal(preserved.status, '已发放', '历史JSON状态滞后时仍必须以锁定的数据库状态保护原发放事实');
  assert.equal(preserved.commissionAmount, 100);
  assert.equal(preserved.payoutRecordId, 'payout-1');
  assert.equal(Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSION_CORRECTIONS), true);
}

{
  const sourceOrder = order({
    amount: 5_000,
    actualAmount: 5_000,
    payments: [{ id: 'tier-source-payment', amount: 5_000, paymentMethod: '对公转账', paidAt: NOW }],
  });
  const prisma = new FakePrisma({ sourceOrder, commissionStatus: '待确认' });
  const tiers = [{ minAmount: 0, maxAmount: 30_000, rate: 8 }, { minAmount: 30_000, rate: 10 }];
  const sourceRow = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!;
  const sourceTierCommission: Commission = {
    ...(sourceRow.data as Commission),
    orderAmount: 5_000,
    performanceAmount: 5_000,
    commissionAmount: 400,
    commissionRate: 0.08,
    ruleCalculationType: 'tiered_percentage',
    payoutPlanId: 'monthly-tier-plan',
    payoutPlanName: '月度阶梯',
    payoutPlanVersion: 1,
    payoutPlanSnapshot: {
      id: 'monthly-tier-plan', name: '月度阶梯', version: 1,
      commissionType: 'tiered_percentage', commissionValue: 0, tiers,
    },
  };
  sourceRow.data = sourceTierCommission;
  sourceRow.amount = sourceTierCommission.commissionAmount;
  const linkedPaidCommission: Commission = {
    ...sourceTierCommission,
    id: 'commission-linked-paid-tier',
    orderId: 'order-linked-paid',
    orderNo: 'ORD-LINKED-PAID',
    orderAmount: 20_000,
    performanceAmount: 20_000,
    commissionAmount: 1_600,
    status: '已发放',
    paidAt: NOW,
    payoutRecordId: 'payout-linked-paid-tier',
  };
  prisma.rows.set(key(STORAGE_KEYS.COMMISSIONS, linkedPaidCommission.id), {
    id: `${STORAGE_KEYS.COMMISSIONS}:${linkedPaidCommission.id}`,
    domain: STORAGE_KEYS.COMMISSIONS,
    recordId: linkedPaidCommission.id,
    orderId: linkedPaidCommission.orderId,
    status: linkedPaidCommission.status,
    owner: linkedPaidCommission.owner,
    amount: linkedPaidCommission.commissionAmount,
    data: clone(linkedPaidCommission),
  });
  const linkedPayout: CommissionPayoutRecord = {
    id: 'payout-linked-paid-tier', payoutNo: 'FF-LINKED-TIER', period: '2026-07', status: '已发放',
    totalCount: 1, totalAmount: 1_600, commissionIds: [linkedPaidCommission.id],
    commissionSnapshots: [clone(linkedPaidCommission)], byOwner: [], createdAt: NOW,
    createdById: superAdmin.id, createdByName: superAdmin.name, issuedAt: NOW,
    issuedById: superAdmin.id, issuedByName: superAdmin.name,
  };
  prisma.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, linkedPayout.id), {
    id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${linkedPayout.id}`,
    domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
    recordId: linkedPayout.id,
    status: linkedPayout.status,
    amount: linkedPayout.totalAmount,
    data: linkedPayout,
  });
  const previewCommissions = async (_transaction: any, nextOrder: Order): Promise<Commission[]> => [{
    ...sourceTierCommission,
    orderAmount: nextOrder.actualAmount,
    performanceAmount: nextOrder.actualAmount,
    commissionAmount: 0,
    status: '待确认',
    updatedAt: NOW,
  }];
  const service = createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async () => undefined,
    previewCommissions,
  });
  const precheck = await service.precheckCorrection(sourceOrder.id, superAdmin);
  assert.equal(precheck.data?.requiresImpactPreview, true, '超管正式更正应统一预览跨订单阶梯联动');
  const correctionInput = {
    reason: '更正未发放订单业绩',
    data: {
      actualAmount: 15_000,
      payments: [
        { id: 'tier-source-payment', amount: 5_000, paymentMethod: '对公转账' as const, paidAt: NOW },
        { id: 'tier-source-payment-next', amount: 10_000, paymentMethod: '对公转账' as const, paidAt: NOW },
      ],
    },
  };
  const missingPreview = await service.correct(sourceOrder.id, correctionInput, superAdmin);
  assert.equal(missingPreview.code, 409, '源单本身未发放，但联动其他已发阶梯时仍必须先预览');
  const preview = await service.previewCorrection(sourceOrder.id, correctionInput, superAdmin);
  assert.equal(preview.code, 0, preview.message);
  assert.equal(preview.data?.supplementAmount, 400, '未发放A单跨档后，已发B单应补阶梯差额400元');
  assert.equal(preview.data?.impacts.some((impact) => impact.sourceCommissionId === linkedPaidCommission.id), true);
  const corrected = await service.correct(sourceOrder.id, { ...correctionInput, expectedImpactHash: preview.data!.impactHash }, superAdmin);
  assert.equal(corrected.code, 0, corrected.message);
  assert.equal((prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, linkedPaidCommission.id))!.data as Commission).commissionAmount, 1_600, '被联动的原已发记录不得改写');
  assert.equal(Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSIONS && row.data?.correctionDeltaType === '补发' && row.data?.commissionAmount === 400), true);
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放' });
  const previewCommissions = async (_transaction: any, nextOrder: Order): Promise<Commission[]> => [{
    ...(prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission),
    orderAmount: nextOrder.actualAmount, performanceAmount: nextOrder.actualAmount,
    commissionAmount: 120, status: '待确认', paidAt: undefined, payoutRecordId: undefined,
  }];
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions,
  });
  const precheck = await service.precheckCorrection('order-1', scopedCorrector);
  assert.equal(precheck.code, 0, precheck.message);
  assert.equal(precheck.data?.allowed, false);
  assert.equal(precheck.data?.reasonCode, 'payout_started');
  const result = await service.correct('order-1', {
    reason: '非超管尝试已发放更正',
    data: { actualAmount: 999, payments: [{ id: 'paid-correction', amount: 999, paymentMethod: '对公转账', paidAt: NOW }] },
    expectedImpactHash: 'invalid',
  }, scopedCorrector);
  assert.equal(result.code, 403);
  assert.equal(prisma.orderData().actualAmount, 899);
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放' });
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions: async (_transaction, nextOrder) => [{
      ...(prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission),
      orderAmount: nextOrder.actualAmount, performanceAmount: nextOrder.actualAmount,
      commissionAmount: 120, status: '待确认', paidAt: undefined, payoutRecordId: undefined,
    }],
  });
  const stale = await service.correct('order-1', {
    reason: '并发校验',
    data: { actualAmount: 999, payments: [{ id: 'paid-correction', amount: 999, paymentMethod: '对公转账', paidAt: NOW }] },
    expectedImpactHash: 'stale-hash',
  }, superAdmin);
  assert.equal(stale.code, 409);
  assert.match(stale.message, /重新预览/);
  assert.equal(prisma.orderData().actualAmount, 899);
}

{
  const prisma = new FakePrisma({ commissionStatus: '已撤回' });
  const result = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '尝试复活已撤回分账',
    data: { notes: '不应保存' },
  }, superAdmin);

  assert.equal(result.code, 409);
  assert.match(result.message, /撤回|财务/);
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, 'commission-1')), true);
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认', commissionManual: true });
  const precheck = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).precheckCorrection('order-1', superAdmin);

  assert.equal(precheck.code, 0, precheck.message);
  assert.equal(precheck.data?.allowed, false);
  assert.equal(precheck.data?.reasonCode, 'manual_commission');
  assert.equal(precheck.data?.manualCommissionCount, 1);
  assert.deepEqual(precheck.data?.commissionStatuses, ['待确认']);

  const result = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '尝试覆盖人工分账',
    data: { notes: '不应保存' },
  }, superAdmin);

  assert.equal(result.code, 409);
  assert.match(result.message, /人工|财务/);
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, 'commission-1')), true);
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放', commissionManual: true });
  const precheck = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions: async () => [],
  }).precheckCorrection('order-1', superAdmin, {
    payoutRecordId: 'payout-1',
    commissionId: 'commission-1',
  });

  assert.equal(precheck.code, 0, precheck.message);
  assert.equal(precheck.data?.allowed, true, '从有效发放记录进入时，已发放人工分账必须可以进入统一更正流程');
  assert.equal(precheck.data?.mode, 'post_payout');
  assert.equal(precheck.data?.requiresImpactPreview, true);
  assert.deepEqual(precheck.data?.manualCommissions, [{
    sourceCommissionId: 'commission-1',
    role: '销售',
    ownerId: sales.id,
    owner: sales.name,
    departmentId: 'dept-sales',
    department: '销售部',
    performanceAmount: 899,
    commissionAmount: 100,
    calculationNote: undefined,
  }]);
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放', commissionManual: true });
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions: async () => [],
  });
  const invalidStrategy = await service.previewCorrection('order-1', {
    reason: '非法策略不得进入影响测算',
    entitlementStrategy: 'unknown_strategy',
    data: { notes: '不会执行' },
  } as any, superAdmin);
  assert.equal(invalidStrategy.code, 400);
  const missingManualDrafts = await service.correct('order-1', {
    reason: '人工修正必须提交完整结果',
    entitlementStrategy: 'manual_correct',
    data: {},
  }, superAdmin);
  assert.equal(missingManualDrafts.code, 400);
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放', commissionManual: true });
  const current = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission;
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions: async (_transaction, nextOrder) => [{
      ...current,
      id: 'commission-rule-rebuilt',
      customerName: nextOrder.customerName,
      orderAmount: nextOrder.actualAmount,
      performanceAmount: nextOrder.actualAmount,
      commissionAmount: 120,
      status: '待确认',
      sourceType: '自动规则',
      isManualAdjusted: undefined,
      updatedAt: NOW,
    }],
  });
  const correctionInput = {
    reason: '更正业务时间并保留原人工提成结果',
    entitlementStrategy: 'preserve_manual' as const,
    data: {
      notes: '更正后的备注',
      payments: [{
        id: 'payment-corrected-month',
        amount: 899,
        paymentMethod: '对公转账' as const,
        paidAt: '2026-06-30T10:00:00.000Z',
      }],
    },
    payoutContext: { payoutRecordId: 'payout-1', commissionId: 'commission-1' },
  };

  const preview = await service.previewCorrection('order-1', correctionInput, superAdmin);
  assert.equal(preview.code, 0, preview.message);
  assert.equal(preview.data?.entitlementStrategy, 'preserve_manual');
  assert.equal(preview.data?.originalPaidAmount, 100);
  assert.equal(preview.data?.correctedEntitlementAmount, 100);
  assert.equal(preview.data?.supplementAmount, 0);
  assert.equal(preview.data?.recoverAmount, 0);
  assert.deepEqual(preview.data?.affectedPeriods, ['2026-06', '2026-07'], '跨月更正必须同时刷新原月与目标月归属');

  const corrected = await service.correct('order-1', {
    ...correctionInput,
    expectedImpactHash: preview.data!.impactHash,
  }, superAdmin);
  assert.equal(corrected.code, 0, corrected.message);
  assert.equal(corrected.data?.notes, '更正后的备注');
  assert.equal(corrected.data?.payments?.[0]?.paidAt, '2026-06-30T10:00:00.000Z', '更正后的业务时间必须写回源订单');
  assert.equal(Array.from(prisma.rows.values()).some((row) => (
    row.domain === STORAGE_KEYS.COMMISSIONS
    && row.recordId !== 'commission-1'
    && ['待确认', '待发放'].includes(String(row.status || row.data?.status || ''))
  )), false, '保留原人工结果时不得额外生成一笔自动规则全额提成');
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放', commissionManual: true });
  const current = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission;
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions: async (_transaction, nextOrder) => [{
      ...current,
      id: 'commission-rule-rebuilt',
      customerName: nextOrder.customerName,
      orderAmount: nextOrder.actualAmount,
      performanceAmount: nextOrder.actualAmount,
      commissionAmount: 120,
      status: '待确认',
      sourceType: '自动规则',
      isManualAdjusted: undefined,
      updatedAt: NOW,
    }],
  });
  const correctionInput = {
    reason: '取消原人工口径，改按当前规则重算',
    entitlementStrategy: 'recalculate_rules' as const,
    data: { notes: '已改为规则重算' },
    payoutContext: { payoutRecordId: 'payout-1', commissionId: 'commission-1' },
  };

  const preview = await service.previewCorrection('order-1', correctionInput, superAdmin);
  assert.equal(preview.code, 0, preview.message);
  assert.equal(preview.data?.correctedEntitlementAmount, 120);
  assert.equal(preview.data?.supplementAmount, 20);
  const corrected = await service.correct('order-1', {
    ...correctionInput,
    expectedImpactHash: preview.data!.impactHash,
  }, superAdmin);
  assert.equal(corrected.code, 0, corrected.message);
  const pending = Array.from(prisma.rows.values()).filter((row) => (
    row.domain === STORAGE_KEYS.COMMISSIONS
    && row.recordId !== 'commission-1'
    && ['待确认', '待发放'].includes(String(row.status || row.data?.status || ''))
  ));
  assert.equal(pending.length, 1, '规则重算只应生成一笔差额提成');
  assert.equal(pending[0].data?.correctionDeltaType, '补发');
  assert.equal(pending[0].data?.commissionAmount, 20);
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放', commissionManual: true });
  const current = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission;
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions: async () => [{ ...current, status: '待确认' }],
  });
  const correctionInput = {
    reason: '原人工提成金额录入错误',
    entitlementStrategy: 'manual_correct' as const,
    data: {},
    manualEntitlements: [{
      sourceCommissionId: 'commission-1',
      role: '销售',
      ownerId: sales.id,
      owner: sales.name,
      departmentId: 'dept-sales',
      department: '销售部',
      performanceAmount: 799,
      commissionAmount: 80,
      calculationNote: '人工更正应得提成为80元',
    }],
    payoutContext: { payoutRecordId: 'payout-1', commissionId: 'commission-1' },
  };

  const preview = await service.previewCorrection('order-1', correctionInput, superAdmin);
  assert.equal(preview.code, 0, preview.message);
  assert.equal(preview.data?.correctedEntitlementAmount, 80);
  assert.equal(preview.data?.recoverAmount, 20);
  const corrected = await service.correct('order-1', {
    ...correctionInput,
    expectedImpactHash: preview.data!.impactHash,
  }, superAdmin);
  assert.equal(corrected.code, 0, corrected.message);
  assert.equal(Array.from(prisma.rows.values()).some((row) => (
    row.domain === STORAGE_KEYS.COMMISSION_CORRECTIONS
    && row.data?.entitlementStrategy === 'manual_correct'
    && row.data?.recoverAmount === 20
  )), true, '仅修正应得结果时也必须生成留痕更正单');
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放', commissionManual: true });
  const current = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission;
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions: async () => [{ ...current, status: '待确认' }],
  });
  const preview = await service.previewCorrection('order-1', {
    reason: '原提成员工录入错误',
    entitlementStrategy: 'manual_correct',
    data: {},
    manualEntitlements: [{
      sourceCommissionId: 'commission-1',
      role: '销售',
      ownerId: otherSales.id,
      owner: otherSales.name,
      departmentId: 'dept-sales',
      department: '销售部',
      performanceAmount: 899,
      commissionAmount: 100,
    }],
    payoutContext: { payoutRecordId: 'payout-1', commissionId: 'commission-1' },
  }, superAdmin);
  assert.equal(preview.code, 0, preview.message);
  assert.equal(preview.data?.impacts[0]?.action, '人员调整');
  assert.deepEqual(preview.data?.legs.map((item) => ({ kind: item.kind, ownerId: item.ownerId, amount: item.amount })), [
    { kind: '追回', ownerId: sales.id, amount: 100 },
    { kind: '补发', ownerId: otherSales.id, amount: 100 },
  ], '跨员工更正必须分别向原员工追回、向新员工补发，不得净额抵消');
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认', commissionManual: true });
  const current = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission;
  const historicalPaid: Commission = {
    ...current,
    id: 'commission-historical-paid',
    status: '已发放',
    isManualAdjusted: undefined,
    sourceType: '自动规则',
    paidAt: NOW,
    payoutRecordId: 'payout-historical',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-30T10:00:00.000Z',
  };
  const payout: CommissionPayoutRecord = {
    id: 'payout-historical', payoutNo: 'FF-202607-HISTORY', period: '2026-07', status: '已发放',
    totalCount: 1, totalAmount: historicalPaid.commissionAmount, commissionIds: [historicalPaid.id],
    commissionSnapshots: [clone(historicalPaid)], byOwner: [], createdAt: NOW,
    createdById: superAdmin.id, createdByName: superAdmin.name, issuedAt: NOW,
    issuedById: superAdmin.id, issuedByName: superAdmin.name,
  };
  prisma.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payout.id), {
    id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${payout.id}`,
    domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
    recordId: payout.id,
    status: payout.status,
    amount: payout.totalAmount,
    data: payout,
  });
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions: async (_transaction, nextOrder) => [{
      ...current,
      id: 'commission-rebuilt',
      orderAmount: nextOrder.actualAmount,
      performanceAmount: nextOrder.actualAmount,
      commissionAmount: 120,
      status: '待确认',
      isManualAdjusted: undefined,
      sourceType: '自动规则',
      updatedAt: NOW,
    }],
  });

  const ordinary = await service.precheckCorrection('order-1', superAdmin);
  assert.equal(ordinary.data?.reasonCode, 'manual_commission', '无发放快照上下文时仍不得覆盖人工分账');
  assert.deepEqual(ordinary.data?.postPayoutContext, {
    payoutRecordId: payout.id,
    payoutNo: payout.payoutNo,
    commissionId: historicalPaid.id,
    sourceType: 'formal_order',
    sourceId: 'order-1',
    sourceBusinessNo: historicalPaid.orderNo,
    employee: historicalPaid.owner,
    role: historicalPaid.role,
    originalPaidAmount: historicalPaid.commissionAmount,
    attributedPeriod: String(historicalPaid.paymentDate || historicalPaid.createdAt).slice(0, 7),
  }, '普通订单入口应返回可直接打开统一发放后更正的上下文');

  const incompletePayout = { ...payout, id: 'payout-incomplete', commissionIds: [] };
  prisma.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, incompletePayout.id), {
    id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${incompletePayout.id}`,
    domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
    recordId: incompletePayout.id,
    status: incompletePayout.status,
    amount: incompletePayout.totalAmount,
    data: incompletePayout,
  });
  const incomplete = await service.precheckCorrection('order-1', superAdmin, {
    payoutRecordId: incompletePayout.id,
    commissionId: historicalPaid.id,
  });
  assert.equal(incomplete.data?.reasonCode, 'manual_commission', '发放单未关联该提成ID时不得解锁发放后更正');
  prisma.rows.delete(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, incompletePayout.id));

  const activeManualFromPayout = await service.precheckCorrection('order-1', superAdmin, {
    payoutRecordId: payout.id,
    commissionId: historicalPaid.id,
  });
  assert.equal(activeManualFromPayout.data?.allowed, true, '有效原发放上下文应进入统一人工分账更正策略');
  assert.equal(activeManualFromPayout.data?.manualCommissionCount, 1);

  const currentManualRow = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, current.id))!;
  currentManualRow.status = '待发放';
  currentManualRow.data = {
    ...current,
    status: '待发放',
    isManualAdjusted: undefined,
    sourceType: '自动规则',
  };
  const activePendingFromPayout = await service.precheckCorrection('order-1', superAdmin, {
    payoutRecordId: payout.id,
    commissionId: historicalPaid.id,
  });
  assert.equal(activePendingFromPayout.data?.allowed, true, '统一更正应同时接管历史已发与当前待发分账');
  assert.equal(activePendingFromPayout.data?.mode, 'post_payout');
  const activePendingFromOrdinaryEntry = await service.precheckCorrection('order-1', superAdmin);
  assert.equal(activePendingFromOrdinaryEntry.data?.allowed, false, '普通订单更正入口也必须自动识别历史发放');
  assert.equal(activePendingFromOrdinaryEntry.data?.mode, 'post_payout');
  assert.ok(activePendingFromOrdinaryEntry.data?.postPayoutContext, '普通入口应提供统一发放后更正上下文');

  currentManualRow.status = '已撤回';
  currentManualRow.data = {
    ...current,
    status: '已撤回',
    isManualAdjusted: undefined,
    sourceType: '自动规则',
  };
  const fromPayout = await service.precheckCorrection('order-1', superAdmin, {
    payoutRecordId: payout.id,
    commissionId: historicalPaid.id,
  });
  assert.equal(fromPayout.code, 0, fromPayout.message);
  assert.equal(fromPayout.data?.allowed, true);
  assert.equal(fromPayout.data?.mode, 'post_payout');
  assert.equal(fromPayout.data?.requiresImpactPreview, true);

  const preview = await service.previewCorrection('order-1', {
    reason: '从发放记录更正业务金额',
    data: {
      actualAmount: 999,
      payments: [{ id: 'history-correction-payment', amount: 999, paymentMethod: '对公转账', paidAt: NOW }],
    },
    payoutContext: {
      payoutRecordId: payout.id,
      commissionId: historicalPaid.id,
    },
  }, superAdmin);
  assert.equal(preview.code, 0, preview.message);
  assert.equal(preview.data?.supplementAmount, 20, '差额必须以所选历史发放快照为原发基准');

  const corrected = await service.correct('order-1', {
    reason: '从发放记录更正业务金额',
    data: {
      actualAmount: 999,
      payments: [{ id: 'history-correction-payment', amount: 999, paymentMethod: '对公转账', paidAt: NOW }],
    },
    payoutContext: {
      payoutRecordId: payout.id,
      commissionId: historicalPaid.id,
    },
    expectedImpactHash: preview.data!.impactHash,
  }, superAdmin);
  assert.equal(corrected.code, 0, corrected.message);
  assert.equal(prisma.orderData().actualAmount, 999);
  const retainedPayout = prisma.rows.get(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payout.id))!.data as CommissionPayoutRecord;
  assert.deepEqual(retainedPayout.commissionSnapshots, payout.commissionSnapshots, '原发放快照必须永久保留');
  assert.equal(Array.from(prisma.rows.values()).some((row) => (
    row.domain === STORAGE_KEYS.COMMISSIONS
    && row.data?.correctionDeltaType === '补发'
    && row.data?.commissionAmount === 20
  )), true);
  assert.equal(Array.from(prisma.rows.values()).some((row) => (
    row.domain === STORAGE_KEYS.COMMISSIONS
    && row.data?.orderId === 'order-1'
    && !row.data?.correctionDeltaType
    && ['待确认', '待发放'].includes(String(row.status || row.data?.status || ''))
  )), false, '历史已发应得只能生成差额，不得再生成一笔全额待发');
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const current = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission;
  const historicalManual: Commission = {
    ...current,
    id: 'commission-historical-manual',
    status: '已发放',
    isManualAdjusted: true,
    sourceType: '人工新增',
    paidAt: NOW,
    payoutRecordId: 'payout-historical-manual',
  };
  const payout: CommissionPayoutRecord = {
    id: 'payout-historical-manual', payoutNo: 'FF-202607-HISTORICAL-MANUAL', period: '2026-07', status: '已发放',
    totalCount: 1, totalAmount: historicalManual.commissionAmount, commissionIds: [historicalManual.id],
    commissionSnapshots: [clone(historicalManual)], byOwner: [], createdAt: NOW,
    createdById: superAdmin.id, createdByName: superAdmin.name, issuedAt: NOW,
    issuedById: superAdmin.id, issuedByName: superAdmin.name,
  };
  prisma.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payout.id), {
    id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${payout.id}`,
    domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
    recordId: payout.id,
    status: payout.status,
    amount: payout.totalAmount,
    data: payout,
  });
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions: async () => [{ ...current, status: '待确认' }],
  });
  const ordinary = await service.precheckCorrection('order-1', superAdmin);
  assert.equal(ordinary.data?.manualCommissionCount, 1, '历史发放快照中的人工提成也必须触发三策略选择');
  assert.equal(ordinary.data?.manualCommissions?.[0]?.sourceCommissionId, historicalManual.id);
  assert.ok(ordinary.data?.postPayoutContext);
  const fromPayout = await service.precheckCorrection('order-1', superAdmin, {
    payoutRecordId: payout.id,
    commissionId: historicalManual.id,
  });
  assert.equal(fromPayout.data?.allowed, true);
  assert.equal(fromPayout.data?.manualCommissionCount, 1);
  const nonSuper = await service.precheckCorrection('order-1', scopedCorrector);
  assert.equal(nonSuper.data?.postPayoutContext, undefined, '非超级管理员不得取得原发放处理上下文');
  assert.equal(nonSuper.data?.manualCommissions, undefined, '非超级管理员不得取得逐笔人工薪酬草稿');
}

{
  const prisma = new FakePrisma({ commissionStatus: '待发放', commissionManual: true });
  const current = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!.data as Commission;
  const historicalPaid: Commission = {
    ...current,
    id: 'commission-paid-before-manual-adjustment',
    status: '已发放',
    isManualAdjusted: undefined,
    sourceType: '自动规则',
    paidAt: NOW,
    payoutRecordId: 'payout-before-manual-adjustment',
    createdAt: '2026-06-01T10:00:00.000Z',
  };
  const payout: CommissionPayoutRecord = {
    id: 'payout-before-manual-adjustment', payoutNo: 'FF-202607-MANUAL-PENDING', period: '2026-07', status: '已发放',
    totalCount: 1, totalAmount: 100, commissionIds: [historicalPaid.id],
    commissionSnapshots: [clone(historicalPaid)], byOwner: [], createdAt: NOW,
    createdById: superAdmin.id, createdByName: superAdmin.name, issuedAt: NOW,
    issuedById: superAdmin.id, issuedByName: superAdmin.name,
  };
  prisma.rows.set(key(STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES, payout.id), {
    id: `${STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES}:${payout.id}`,
    domain: STORAGE_KEYS.COMMISSION_PAYOUT_BATCHES,
    recordId: payout.id,
    status: payout.status,
    amount: payout.totalAmount,
    data: payout,
  });
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
    previewCommissions: async () => [{ ...current, status: '待确认' }],
  });
  const correctionInput = {
    reason: '统一处理历史已发和当前待发人工调整',
    entitlementStrategy: 'manual_correct' as const,
    data: { notes: '待发人工调整已纳入本次更正' },
    manualEntitlements: [{
      sourceCommissionId: current.id,
      role: current.role,
      ownerId: current.ownerId || sales.id,
      owner: current.owner,
      departmentId: current.departmentId,
      department: current.department,
      performanceAmount: 799,
      commissionAmount: 80,
    }],
    payoutContext: { payoutRecordId: payout.id, commissionId: historicalPaid.id },
  };
  const preview = await service.previewCorrection('order-1', correctionInput, superAdmin);
  assert.equal(preview.code, 0, preview.message);
  assert.equal(preview.data?.recoverAmount, 20);
  const corrected = await service.correct('order-1', {
    ...correctionInput,
    expectedImpactHash: preview.data!.impactHash,
  }, superAdmin);
  assert.equal(corrected.code, 0, corrected.message);
  const projectedPending = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, current.id))!;
  assert.equal(projectedPending.status, '已撤回', '当前待发人工分账不得在更正后以旧金额继续保留');
  assert.equal(Array.from(prisma.rows.values()).some((row) => (
    row.domain === STORAGE_KEYS.COMMISSION_CORRECTIONS && row.data?.recoverAmount === 20
  )), true, '历史已发与当前待发必须形成同一份可审计差额结果');
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const precheck = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).precheckCorrection('order-1', superAdmin);

  assert.equal(precheck.code, 0, precheck.message);
  assert.equal(precheck.data?.allowed, true);
  assert.equal(precheck.data?.commissionCount, 1);
}

{
  const prisma = new FakePrisma({
    sourceOrder: order({ originalOrderId: 'order-original' }),
    commissionStatus: '待确认',
  });
  const result = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '尝试覆盖冲正关联订单',
    data: { notes: '不应保存' },
  }, superAdmin);

  assert.equal(result.code, 409);
  assert.match(result.message, /冲正/);
}

{
  const prisma = new FakePrisma({
    sourceOrder: order({ status: '退款中' }),
    commissionStatus: '待确认',
  });
  const result = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '尝试覆盖退款订单',
    data: { notes: '不应保存' },
  }, superAdmin);

  assert.equal(result.code, 409);
  assert.match(result.message, /退款|冲正/);
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const result = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '分笔付款合计错误',
    data: {
      actualAmount: 1000,
      payments: [
        { id: 'pay-1', amount: 600, paymentMethod: '对公转账', paidAt: NOW },
        { id: 'pay-2', amount: 300, paymentMethod: '对公转账', paidAt: NOW },
      ],
    },
  }, superAdmin);

  assert.equal(result.code, 400);
  assert.match(result.message, /付款.*合计|实付/);
  assert.equal(prisma.orderData().actualAmount, 899);
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认', deliveryStatus: '交付中' });
  const result = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).correct('order-1', {
    reason: '交付中尝试换产品',
    data: { productId: 'product-2' },
  }, superAdmin);

  assert.equal(result.code, 409);
  assert.match(result.message, /交付已经开始/);
  assert.equal(prisma.orderData().productId, 'product-1');
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, 'commission-1')), true, '更正失败时原分账必须回滚保留');
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认', deliveryStatus: '交付中' });
  const result = await createOrderCommandService(prisma as any, { now: () => new Date(NOW) })
    .update('order-1', { notes: '服务端备注' }, sales);

  assert.equal(result.code, 0);
  assert.equal(result.data?.notes, '服务端备注');
  assert.equal(result.data?.changeHistory?.[0].operator, sales.name);
  assert.equal(result.data?.changeHistory?.[0].action, 'update');
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const result = await createOrderCommandService(prisma as any, { now: () => new Date(NOW) })
    .update('order-1', {
      sourcePlatformId: 'platform-douyin',
      sourcePlatformName: '抖音',
      sourceShopId: 'shop-01',
      sourceShopName: '抖音小店01',
      thirdPartyOrderNo: 'TP-20260723-001',
      notes: '已核对平台单号',
    } as any, sales);

  assert.equal(result.code, 0, result.message);
  assert.equal((result.data as any)?.thirdPartyOrderNo, 'TP-20260723-001');
  assert.equal((result.data as any)?.sourcePlatformName, '抖音');
  assert.equal((result.data as any)?.sourceShopName, '抖音小店01');
  assert.equal(result.data?.notes, '已核对平台单号');
  assert.deepEqual(result.data?.changeHistory?.[0].changes?.map((change) => change.field), [
    'sourcePlatformId',
    'sourcePlatformName',
    'sourceShopId',
    'sourceShopName',
    'thirdPartyOrderNo',
    'notes',
  ]);
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const result = await createOrderCommandService(prisma as any)
    .update('order-1', { officialPaymentChannel: '企业支付宝转账' }, sales);

  assert.equal(result.code, 400);
  assert.match(result.message, /不支持|更正/);
  assert.equal(prisma.orderData().officialPaymentChannel, undefined);
}

{
  const existingPayment = {
    id: 'payment-1', amount: 899, paymentMethod: '对公转账' as const, paidAt: NOW,
  };
  const prisma = new FakePrisma({
    commissionStatus: '待确认',
    sourceOrder: order({ payments: [existingPayment] }),
  });
  const result = await createOrderCommandService(prisma as any, { now: () => new Date(NOW) }).update('order-1', {
    payments: [{ ...existingPayment, paymentOrderNo: 'PAY-METADATA', attachments: [{ id: 'att-1', name: '付款截图.png' } as any] }],
    dealEvidenceAttachments: [{ id: 'att-2', name: '成交记录.png' } as any],
  }, sales);

  assert.equal(result.code, 0, result.message);
  assert.equal(result.data?.payments[0].paymentOrderNo, 'PAY-METADATA');
  assert.equal(result.data?.payments[0].amount, 899, '资料编辑不得改变付款金额');
  assert.equal(result.data?.dealEvidenceAttachments?.[0]?.name, '成交记录.png');
  assert.equal(result.data?.proofStatus, '已上传');
}

{
  const prisma = new FakePrisma({ sourceOrder: order({ payments: [], proofStatus: '待补充' }) });
  const result = await createOrderCommandService(prisma as any, { now: () => new Date(NOW) }).update('order-1', {
    notes: '历史订单补充资料',
    payments: [{
      id: 'legacy-payment-1',
      amount: 899,
      paymentMethod: '对公转账',
      paidAt: '2026-07-12T10:00:00.000Z',
      paymentOrderNo: 'PAY-LEGACY',
      attachments: [{ id: 'att-legacy', name: '历史付款截图.png' } as any],
    }],
  }, sales);

  assert.equal(result.code, 0, result.message);
  assert.equal(result.data?.payments[0].paymentOrderNo, 'PAY-LEGACY');
  assert.equal(result.data?.proofStatus, '已上传');
  assert.equal(prisma.rows.has(key(
    STORAGE_KEYS.FINANCE_TRANSACTIONS,
    'order_payment:order-1:legacy-payment-1',
  )), true, '历史订单补首笔付款时必须同事务写入原实收流水');
}

{
  const prisma = new FakePrisma({ sourceOrder: order({ payments: [], proofStatus: '待补充' }) });
  const result = await createOrderCommandService(prisma as any, { now: () => new Date(NOW) }).update('order-1', {
    payments: [{
      id: {} as any,
      amount: 899,
      paymentMethod: '对公转账',
      paidAt: '2026-07-12T10:00:00.000Z',
    }],
  }, sales);

  assert.equal(result.code, 409, '普通资料编辑也不得把对象付款ID持久化');
  assert.equal(prisma.orderData().payments?.length, 0);
}

{
  const existingPayment = { id: 'payment-1', amount: 899, paymentMethod: '对公转账' as const, paidAt: NOW };
  const prisma = new FakePrisma({ sourceOrder: order({ payments: [existingPayment] }) });
  const result = await createOrderCommandService(prisma as any).update('order-1', {
    payments: [{ ...existingPayment, amount: 999 }],
  }, sales);
  assert.equal(result.code, 409);
  assert.match(result.message, /金额|更正/);
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const result = await createOrderCommandService(prisma as any).update('order-1', { actualAmount: 100 }, sales);
  assert.equal(result.code, 409, '存在提成时不得修改金额');
  assert.equal(prisma.orderData().actualAmount, 899);
}

{
  const prisma = new FakePrisma();
  const result = await createOrderCommandService(prisma as any).update('order-1', { orderNo: 'FORGED' }, sales);
  assert.equal(result.code, 400, '客户端不得修改服务端订单标识');
  assert.equal(prisma.orderData().orderNo, 'ORD-20260712-ORDER1');
}

{
  const prisma = new FakePrisma();
  const result = await createOrderCommandService(prisma as any).update('order-1', { notes: '越权编辑' }, otherSales);
  assert.equal(result.code, 403);
  assert.equal(prisma.orderData().notes, undefined);
}

{
  const prisma = new FakePrisma({ sourceOrder: order({ productId: 'product-missing' }) });
  const result = await createOrderCommandService(prisma as any).update('order-1', { notes: '不能保存' }, sales);
  assert.equal(result.code, 409, '正式订单关联产品不存在时不得继续编辑');
}

{
  const prisma = new FakePrisma({ commissionStatus: '已发放' });
  const result = await createOrderCommandService(prisma as any).softDelete('order-1', '重复订单', sales);
  assert.equal(result.code, 409);
  assert.match(result.message, /已发放提成/);
  assert.equal(prisma.orderData().deletedAt, undefined);
}

{
  const prisma = new FakePrisma({ deliveryStatus: '交付中' });
  const result = await createOrderCommandService(prisma as any).softDelete('order-1', '重复订单', sales);
  assert.equal(result.code, 409);
  assert.match(result.message, /交付/);
  assert.equal(prisma.orderData().deletedAt, undefined);
}

{
  const prisma = new FakePrisma({ sourceOrder: order({ status: '退款中' }) });
  const result = await createOrderCommandService(prisma as any).softDelete('order-1', '重复订单', sales);
  assert.equal(result.code, 409, '退款流程中的订单不得删除');
}

{
  const activeRefundStatuses: Order['refundStatus'][] = ['待分配', '挽回中', '挽回成功', '待财务退款', '退款申请中', '退款已批准', '退款已完成'];
  for (const refundStatus of activeRefundStatuses) {
    const prisma = new FakePrisma({
      sourceOrder: order({ refundStatus }),
      commissionStatus: '已取消',
      deliveryStatus: '已完成',
    });
    const result = await createOrderCommandService(prisma as any).softDelete('order-1', '重复订单', sales);
    assert.equal(result.code, 409, `${refundStatus} 状态的订单不得删除`);
    assert.match(result.message, /退款、挽回或冲正/);
    assert.equal(prisma.orderData().deletedAt, undefined);
  }
}

{
  const prisma = new FakePrisma({ commissionStatus: '已取消', deliveryStatus: '已完成' });
  const result = await createOrderCommandService(prisma as any, { now: () => new Date(NOW) })
    .softDelete('order-1', '重复订单', sales);

  assert.equal(result.code, 0);
  assert.equal(result.data?.deletedAt, NOW);
  assert.equal(result.data?.deletedBy, sales.name);
  assert.equal(result.data?.deleteReason, '重复订单');
  assert.equal(prisma.customerData().orderCount, 0);
  assert.equal(prisma.customerData().totalSpent, 0);
}

{
  const prisma = new FakePrisma({ customerDataId: 'corrupted-customer-id' });
  const result = await createOrderCommandService(prisma as any, { now: () => new Date(NOW) })
    .softDelete('order-1', '重复订单', sales);

  assert.equal(result.code, 409, '客户稳定ID损坏时不得继续删除并重算投影');
  assert.match(result.message, /客户.*ID/);
  assert.equal(prisma.orderData().deletedAt, undefined, '投影校验失败时订单删除必须回滚');
}

{
  const prisma = new FakePrisma({ forceCustomerVersionConflict: true });
  const result = await createOrderCommandService(prisma as any, { now: () => new Date(NOW) })
    .softDelete('order-1', '重复订单', sales);

  assert.equal(result.code, 409, '客户投影并发冲突时应提示刷新重试');
  assert.match(result.message, /客户记录已更新/);
  assert.equal(prisma.orderData().deletedAt, undefined, '客户投影并发冲突时订单删除必须回滚');
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  const legacyRow = prisma.rows.get(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'))!;
  legacyRow.orderId = null;
  const legacyCommission = legacyRow.data as Commission;
  const service = createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async (transaction: any, nextOrder: Order, changedAt: string) => {
      const rebuilt: Commission = {
        ...legacyCommission,
        id: 'commission-json-only-rebuilt',
        orderId: nextOrder.id,
        orderNo: nextOrder.orderNo,
        status: '待确认',
        updatedAt: changedAt,
      };
      await transaction.businessRecord.create({ data: {
        id: `${STORAGE_KEYS.COMMISSIONS}:${rebuilt.id}`,
        domain: STORAGE_KEYS.COMMISSIONS,
        recordId: rebuilt.id,
        orderId: rebuilt.orderId,
        status: rebuilt.status,
        data: rebuilt,
      } });
    },
  });
  const result = await service.correct('order-1', {
    reason: '验证历史 JSON 关联分账更正',
    data: { notes: '已更正' },
  }, superAdmin);
  assert.equal(result.code, 0, result.message);
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, legacyCommission.id)), false, 'JSON-only 历史分账必须被锁定并移除');
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, 'commission-json-only-rebuilt')), true);
}
