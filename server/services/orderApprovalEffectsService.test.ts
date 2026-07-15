import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { Order, OrderApplication } from '../../src/types/order';
import { createOrderApprovalDownstreamEffects } from './orderApprovalEffectsService';

const now = '2026-07-12T10:00:00.000Z';
const order: Order = {
  id: 'order-effects',
  orderNo: 'ORD-20260712-EFFECTS',
  customerId: 'customer-effects',
  customerName: '客户A',
  productId: 'product-effects',
  productName: '899课程',
  productLevel: '899',
  orderType: '899成交',
  amount: 1000,
  actualAmount: 1000,
  paymentMethod: '对公转账',
  officialPaymentChannel: '对公银行转账',
  status: '已确认',
  refundStatus: '无',
  owner: '销售A',
  salesId: 'user-sales',
  salesName: '销售A',
  resourceOwnership: '公司资源',
  payments: [],
  createdAt: now,
  updatedAt: now,
};
const application = {
  id: 'oa-effects',
  applicationNo: 'OAPP-EFFECTS',
  status: '待财务审核',
  orderData: order,
  applicantId: 'user-sales',
  applicantName: '销售A',
  submittedAt: now,
  reviewLogs: [],
  createdAt: now,
  updatedAt: now,
} as unknown as OrderApplication;
const reviewer = {
  id: 'user-finance',
  name: '财务A',
  account: 'finance',
  email: '',
  phone: '',
  role: '财务专员' as const,
  isActive: true,
  permissions: [],
};

type Row = {
  id: string;
  domain: string;
  recordId: string;
  data: any;
  status?: string | null;
  owner?: string | null;
  customerId?: string | null;
  orderId?: string | null;
  [key: string]: any;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function key(domain: string, recordId: string): string {
  return `${domain}:${recordId}`;
}

function fakeTransaction(options: {
  stages?: string[];
  rules?: any[];
  includeCustomer?: boolean;
  users?: any[];
} = {}) {
  const rows = new Map<string, Row>();
  let customerLockQueries = 0;
  if (options.includeCustomer !== false) {
    rows.set(key(STORAGE_KEYS.CUSTOMERS, order.customerId), {
      id: key(STORAGE_KEYS.CUSTOMERS, order.customerId),
      domain: STORAGE_KEYS.CUSTOMERS,
      recordId: order.customerId,
      customerId: order.customerId,
      owner: order.owner,
      data: {
        id: order.customerId,
        name: order.customerName,
        company: order.customerName,
        phone: '13900000000',
        owner: order.owner,
        customerLevel: 'L1',
        lifecycleStatusCode: 'following',
        totalSpent: 0,
        orderCount: 0,
        growthPath: [],
        growthRecords: [],
        activityRecords: [],
        createdAt: now,
        updatedAt: now,
      },
    });
  }
  rows.set(key(STORAGE_KEYS.ORDERS, order.id), {
    id: key(STORAGE_KEYS.ORDERS, order.id),
    domain: STORAGE_KEYS.ORDERS,
    recordId: order.id,
    customerId: order.customerId,
    orderId: order.id,
    data: clone(order),
  });
  rows.set(key(STORAGE_KEYS.PRODUCTS, order.productId!), {
    id: key(STORAGE_KEYS.PRODUCTS, order.productId!),
    domain: STORAGE_KEYS.PRODUCTS,
    recordId: order.productId!,
    data: {
      id: order.productId,
      name: order.productName,
      level: order.productLevel,
      deliveryStages: options.stages ?? ['合同签订', '交付验收'],
      isActive: true,
    },
  });

  const rules = options.rules ?? [{
    id: 'rule-sales-fixed',
    name: '销售固定提成',
    productLevel: '899',
    orderType: '899成交',
    sourceType: '',
    resourceOwnership: '公司资源',
    role: '销售',
    commissionType: 'fixed',
    commissionValue: 100,
    isActive: true,
    priority: 1,
  }];

  const tx: any = {
    appStorage: {
      findUnique: async ({ where }: any) => (
        where.key === STORAGE_KEYS.COMMISSION_RULES ? { key: where.key, value: clone(rules) } : null
      ),
    },
    user: {
      findMany: async () => clone(options.users || [
        { id: 'user-sales', name: '销售A', departmentId: 'dept-sales', isActive: true, employmentStatus: 'active' },
      ]),
    },
    department: {
      findMany: async () => [{ id: 'dept-sales', name: '销售部', managerId: null, isActive: true }],
    },
    businessRecord: {
      findUnique: async ({ where }: any) => {
        const target = where.domain_recordId;
        return clone(rows.get(key(target.domain, target.recordId)) || null);
      },
      findMany: async ({ where }: any) => Array.from(rows.values())
        .filter((row) => row.domain === where.domain)
        .filter((row) => !where.customerId || row.customerId === where.customerId)
        .filter((row) => !where.orderId || row.orderId === where.orderId)
        .map(clone),
      create: async ({ data }: any) => {
        const rowKey = key(data.domain, data.recordId);
        if (rows.has(rowKey)) throw Object.assign(new Error('duplicate'), { code: 'P2002' });
        rows.set(rowKey, clone(data));
        return clone(data);
      },
      update: async ({ where, data }: any) => {
        const target = where.domain_recordId
          ? key(where.domain_recordId.domain, where.domain_recordId.recordId)
          : where.id;
        const current = rows.get(target);
        if (!current) throw new Error(`missing row ${target}`);
        rows.set(target, { ...current, ...clone(data) });
        return clone(rows.get(target));
      },
    },
    $queryRaw: async () => {
      customerLockQueries += 1;
      return [];
    },
  };
  return { tx, rows, get customerLockQueries() { return customerLockQueries; } };
}

{
  const fake = fakeTransaction();
  const { tx, rows } = fake;
  const apply = createOrderApprovalDownstreamEffects();
  const context = { transaction: tx, application, order, reviewer, approvedAt: now } as any;
  const result = await apply(context);

  assert.deepEqual(result, {
    customerOrderStats: 'applied',
    commissionGeneration: 'applied',
    deliveryCreation: 'applied',
    customerLifecycle: 'applied',
  });
  const updatedCustomer = rows.get(key(STORAGE_KEYS.CUSTOMERS, order.customerId))!.data;
  assert.equal(updatedCustomer.orderCount, 1);
  assert.equal(updatedCustomer.totalSpent, 1000);
  assert.equal(updatedCustomer.lifecycleStatusCode, 'ordered');
  assert.equal(updatedCustomer.growthPath.length, 1);
  assert.equal(updatedCustomer.activityRecords.length, 1);

  const commissions = Array.from(rows.values()).filter((row) => row.domain === STORAGE_KEYS.COMMISSIONS);
  assert.equal(commissions.length, 1);
  assert.equal(commissions[0].data.commissionAmount, 100);
  assert.equal(commissions[0].data.owner, '销售A');
  assert.equal(commissions[0].data.status, '待确认');
  assert.equal(commissions[0].data.evidenceRequired, true);
  assert.equal(commissions[0].data.evidenceStatus, '缺付款截图');
  assert.equal(fake.customerLockQueries, 1, '更新客户订单统计前必须锁定客户行');

  const deliveries = Array.from(rows.values()).filter((row) => row.domain === STORAGE_KEYS.DELIVERIES);
  assert.equal(deliveries.length, 1);
  assert.deepEqual(deliveries[0].data.stages, ['合同签订', '交付验收']);

  await apply(context);
  assert.equal(Array.from(rows.values()).filter((row) => row.domain === STORAGE_KEYS.COMMISSIONS).length, 1);
  assert.equal(Array.from(rows.values()).filter((row) => row.domain === STORAGE_KEYS.DELIVERIES).length, 1);
  assert.equal(rows.get(key(STORAGE_KEYS.CUSTOMERS, order.customerId))!.data.growthPath.length, 1);
}

{
  const { tx, rows } = fakeTransaction();
  const otherCustomerOrder = {
    ...order,
    id: 'order-same-name-other-customer',
    orderNo: 'ORD-SAME-NAME-OTHER',
    customerId: 'customer-other',
    customerName: order.customerName,
  };
  rows.set(key(STORAGE_KEYS.ORDERS, otherCustomerOrder.id), {
    id: key(STORAGE_KEYS.ORDERS, otherCustomerOrder.id),
    domain: STORAGE_KEYS.ORDERS,
    recordId: otherCustomerOrder.id,
    customerId: otherCustomerOrder.customerId,
    orderId: otherCustomerOrder.id,
    data: otherCustomerOrder,
  });
  await createOrderApprovalDownstreamEffects()({ transaction: tx, application, order, reviewer, approvedAt: now } as any);
  const customer = rows.get(key(STORAGE_KEYS.CUSTOMERS, order.customerId))!.data;
  assert.equal(customer.orderCount, 1, '同名客户的订单不得串入当前客户统计');
  assert.equal(customer.totalSpent, 1000);
}

{
  const unsafeOrder = { ...order, id: 'order-invalid-sales-id', orderNo: 'ORD-INVALID-SALES', salesId: 'missing-user' };
  const { tx, rows } = fakeTransaction();
  rows.delete(key(STORAGE_KEYS.ORDERS, order.id));
  rows.set(key(STORAGE_KEYS.ORDERS, unsafeOrder.id), {
    id: key(STORAGE_KEYS.ORDERS, unsafeOrder.id),
    domain: STORAGE_KEYS.ORDERS,
    recordId: unsafeOrder.id,
    customerId: unsafeOrder.customerId,
    orderId: unsafeOrder.id,
    data: unsafeOrder,
  });
  await createOrderApprovalDownstreamEffects()({ transaction: tx, application, order: unsafeOrder, reviewer, approvedAt: now } as any);
  const generated = Array.from(rows.values()).find((row) => row.domain === STORAGE_KEYS.COMMISSIONS);
  assert.ok(generated);
  assert.equal(generated.data.owner, '待分配', '无效稳定员工 ID 不得回退按姓名发放提成');
  assert.equal(generated.data.ownerId, undefined);
}

{
  const { tx, rows } = fakeTransaction({ stages: [] });
  const existingDeliveryId = rows.get(key(STORAGE_KEYS.ORDERS, order.id))!.data.deliveryId;
  const result = await createOrderApprovalDownstreamEffects()({
    transaction: tx, application, order, reviewer, approvedAt: now,
  } as any);
  assert.equal(result?.deliveryCreation, 'applied');
  const delivery = Array.from(rows.values()).find((row) => row.domain === STORAGE_KEYS.DELIVERIES);
  assert.equal(delivery, undefined, '产品未配置交付阶段时不得自动创建交付单');
  assert.equal(rows.get(key(STORAGE_KEYS.ORDERS, order.id))!.data.deliveryId, existingDeliveryId, '不得写入新的交付关联');
}

{
  const { tx, rows } = fakeTransaction({ rules: [] });
  await createOrderApprovalDownstreamEffects()({ transaction: tx, application, order, reviewer, approvedAt: now } as any);
  const fallback = Array.from(rows.values()).find((row) => row.domain === STORAGE_KEYS.COMMISSIONS);
  assert.ok(fallback);
  assert.equal(fallback.data.commissionAmount, 0);
  assert.equal(fallback.data.auditReason, '规则未命中');
}

{
  const { tx } = fakeTransaction({ includeCustomer: false });
  await assert.rejects(
    () => createOrderApprovalDownstreamEffects()({ transaction: tx, application, order, reviewer, approvedAt: now } as any),
    /客户.*不存在/,
  );
}

{
  const { tx, rows } = fakeTransaction();
  const apply = createOrderApprovalDownstreamEffects({
    assignNext: async () => ({
      ownerId: 'user-cs-auto', owner: '自动客户成功', assignmentMode: 'auto' as const,
      assignedAt: now, assignedBy: 'system' as const,
    }),
  });
  await apply({ transaction: tx, application, order, reviewer, approvedAt: now } as any);
  const delivery = Array.from(rows.values()).find((row) => row.domain === STORAGE_KEYS.DELIVERIES)?.data;
  assert.equal(delivery.ownerId, 'user-cs-auto');
  assert.equal(delivery.assignmentMode, 'auto');
}
