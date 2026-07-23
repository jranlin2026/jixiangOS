import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
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
  return structuredClone(value);
}

class FakePrisma {
  readonly rows = new Map<string, Row>();
  readonly forceCustomerVersionConflict: boolean;
  readonly users = [databaseUser(sales), databaseUser(otherSales)];
  readonly roles = [role()];
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
    this.rows.set(key(STORAGE_KEYS.PRODUCTS, 'product-1'), {
      id: `${STORAGE_KEYS.PRODUCTS}:product-1`,
      domain: STORAGE_KEYS.PRODUCTS,
      recordId: 'product-1',
      data: {
        id: 'product-1', name: '数据库产品', level: '899', price: 899,
        deliveryStages: [], isActive: true, sortOrder: 1, createdAt: NOW, updatedAt: NOW,
      },
    });
    if (options.commissionStatus) {
      this.rows.set(key(STORAGE_KEYS.COMMISSIONS, 'commission-1'), {
        id: `${STORAGE_KEYS.COMMISSIONS}:commission-1`,
        domain: STORAGE_KEYS.COMMISSIONS,
        recordId: 'commission-1',
        orderId: sourceOrder.id,
        status: options.commissionStatus,
        data: {
          id: 'commission-1', orderId: sourceOrder.id, status: options.commissionStatus,
          sourceType: options.commissionManual ? '人工新增' : '自动规则',
          isManualAdjusted: options.commissionManual || undefined,
        },
      });
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
            .filter((row) => row.domain === STORAGE_KEYS.COMMISSIONS && row.orderId === values[1])
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
            row.domain === where.domain && (!where.orderId || row.orderId === where.orderId)
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

  customerData(): any {
    return clone(this.rows.get(key(STORAGE_KEYS.CUSTOMERS, 'customer-1'))!.data);
  }
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
    .update('order-1', { thirdPartyOrderNo: 'TP-20260723-001', notes: '已核对平台单号' } as any, sales);

  assert.equal(result.code, 0, result.message);
  assert.equal((result.data as any)?.thirdPartyOrderNo, 'TP-20260723-001');
  assert.equal(result.data?.notes, '已核对平台单号');
  assert.deepEqual(result.data?.changeHistory?.[0].changes?.map((change) => change.field), [
    'thirdPartyOrderNo',
    'notes',
  ]);
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认' });
  let rebuiltFor: Order | undefined;
  const result = await createOrderCommandService(prisma as any, {
    now: () => new Date(NOW),
    rebuildPendingCommissions: async (_transaction: any, nextOrder: Order) => {
      rebuiltFor = clone(nextOrder);
    },
  } as any).update('order-1', { officialPaymentChannel: '企业支付宝转账' }, sales);

  assert.equal(result.code, 0, result.message);
  assert.equal(result.data?.officialPaymentChannel, '企业支付宝转账');
  assert.equal(result.data?.paymentMethod, '支付宝');
  assert.equal(rebuiltFor?.officialPaymentChannel, '企业支付宝转账');
  assert.equal(prisma.rows.size > 0, true);
  assert.equal(
    Array.from(prisma.rows.values()).some((row) => row.domain === STORAGE_KEYS.COMMISSION_OPERATION_LOGS),
    true,
    '收款渠道更正必须留下分账操作日志',
  );
}

{
  const prisma = new FakePrisma({ commissionStatus: '已确认' });
  const result = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  } as any).update('order-1', { officialPaymentChannel: '企业支付宝转账' }, sales);

  assert.equal(result.code, 409);
  assert.match(result.message, /待确认/);
  assert.equal(prisma.orderData().officialPaymentChannel, undefined);
}

{
  const prisma = new FakePrisma({ commissionStatus: '待确认', commissionManual: true });
  const result = await createOrderCommandService(prisma as any, {
    rebuildPendingCommissions: async () => undefined,
  }).update('order-1', { officialPaymentChannel: '企业支付宝转账' }, sales);

  assert.equal(result.code, 409);
  assert.match(result.message, /人工/);
  assert.equal(prisma.rows.has(key(STORAGE_KEYS.COMMISSIONS, 'commission-1')), true, '人工分账不得被重算删除');
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
