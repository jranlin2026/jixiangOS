import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Order } from '../../src/types/order';
import { createDeliveryCommandService } from './deliveryCommandService';

const NOW = '2026-07-12T17:00:00.000Z';

const engineer: AuthenticatedUser = {
  id: 'user-delivery', name: '交付A', account: 'delivery', email: 'delivery@example.com', phone: '',
  role: '交付工程师', roleId: 'role-delivery', departmentId: 'dept-delivery', isActive: true,
  permissions: [{ module: PERMISSION_KEYS.DELIVERY_MOVE_CARD, actions: ['read', 'write'] }],
};
const otherEngineer: AuthenticatedUser = {
  ...engineer, id: 'user-other', name: '交付B', account: 'other', email: 'other@example.com',
};

function databaseUser(user: AuthenticatedUser) {
  return {
    id: user.id, name: user.name, account: user.account, email: user.email, phone: user.phone,
    role: user.role, avatar: null, departmentId: user.departmentId || null, positionId: null,
    positionName: null, roleId: user.roleId || null, passwordHash: null, passwordSalt: null,
    passwordUpdatedAt: null, lastLoginAt: null, isActive: user.isActive, employmentStatus: 'active',
    leftAt: null, leftBy: null, createdAt: new Date(NOW), updatedAt: new Date(NOW),
  };
}

function sourceOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-delivery', orderNo: 'ORD-DELIVERY', customerId: 'customer-1', customerName: '数据库客户',
    productId: 'product-1', productName: '交付产品', productLevel: '代理', orderType: '新购',
    amount: 9800, actualAmount: 9800, paymentMethod: '对公转账', status: '已确认', refundStatus: '无',
    owner: '销售A', salesId: 'user-sales', salesName: '销售A', serviceId: engineer.id,
    serviceName: engineer.name, payments: [], createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

type Row = { id: string; domain: string; recordId: string; data: any; orderId?: string | null; status?: string | null; [key: string]: any };
const rowKey = (domain: string, recordId: string) => `${domain}\u0000${recordId}`;
const clone = <T>(value: T): T => structuredClone(value);

class FakePrisma {
  rows = new Map<string, Row>();
  failOrderUpdate = false;
  readonly user = { findMany: async () => [databaseUser(engineer), databaseUser(otherEngineer)] };
  readonly role = { findMany: async () => [{
    id: 'role-delivery', name: '交付工程师', code: 'delivery_engineer', departmentId: 'dept-delivery',
    permissions: engineer.permissions, dataScopes: { orders: 'self' }, memberCount: 2, isActive: true,
    createdAt: new Date(NOW), updatedAt: new Date(NOW), description: null,
  }] };
  readonly department = { findMany: async () => [{
    id: 'dept-delivery', name: '交付部', code: 'DELIVERY', description: null, parentId: null,
    managerId: null, memberCount: 2, sortOrder: 1, isActive: true,
    createdAt: new Date(NOW), updatedAt: new Date(NOW),
  }] };

  constructor(order: Order = sourceOrder()) {
    this.rows.set(rowKey(STORAGE_KEYS.ORDERS, order.id), {
      id: `${STORAGE_KEYS.ORDERS}:${order.id}`, domain: STORAGE_KEYS.ORDERS, recordId: order.id,
      orderId: order.id, status: order.status, data: clone(order),
    });
    this.rows.set(rowKey(STORAGE_KEYS.PRODUCTS, 'product-1'), {
      id: `${STORAGE_KEYS.PRODUCTS}:product-1`, domain: STORAGE_KEYS.PRODUCTS, recordId: 'product-1',
      data: {
        id: 'product-1', name: '交付产品', level: '代理', price: 9800,
        deliveryStages: ['资料收集', '账号搭建', '交付验收'], isActive: true,
        sortOrder: 1, createdAt: NOW, updatedAt: NOW,
      },
    });
    this.rows.set(rowKey(STORAGE_KEYS.CUSTOMERS, 'customer-1'), {
      id: `${STORAGE_KEYS.CUSTOMERS}:customer-1`, domain: STORAGE_KEYS.CUSTOMERS, recordId: 'customer-1',
      data: { id: 'customer-1', name: '数据库客户', company: '数据库客户', owner: '销售A', createdAt: NOW, updatedAt: NOW },
    });
  }

  async $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
    const staged = new Map(Array.from(this.rows.entries()).map(([key, value]) => [key, clone(value)]));
    const businessRecord = {
      findUnique: async ({ where }: any) => {
        const target = where.domain_recordId;
        return clone(staged.get(rowKey(target.domain, target.recordId)) || null);
      },
      findMany: async ({ where }: any) => Array.from(staged.values())
        .filter((row) => row.domain === where.domain)
        .filter((row) => !where.orderId || row.orderId === where.orderId)
        .map(clone),
      create: async ({ data }: any) => {
        const key = rowKey(data.domain, data.recordId);
        if (staged.has(key)) Object.assign(new Error('unique'), { code: 'P2002' });
        staged.set(key, clone(data));
        return clone(data);
      },
      update: async ({ where, data }: any) => {
        const target = where.domain_recordId;
        const key = rowKey(target.domain, target.recordId);
        if (this.failOrderUpdate && target.domain === STORAGE_KEYS.ORDERS) throw new Error('order update failed');
        const current = staged.get(key);
        if (!current) throw new Error(`missing ${key}`);
        const next = { ...current, ...clone(data) };
        staged.set(key, next);
        return clone(next);
      },
      delete: async ({ where }: any) => {
        const target = where.domain_recordId;
        const key = rowKey(target.domain, target.recordId);
        const current = staged.get(key);
        if (!current) throw new Error(`missing ${key}`);
        staged.delete(key);
        return clone(current);
      },
    };
    const tx = {
      businessRecord,
      $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
        const row = staged.get(rowKey(String(values[0] || ''), String(values[1] || '')));
        return row ? [clone(row)] : [];
      },
    };
    const result = await callback(tx);
    this.rows = staged;
    return result;
  }

  order(): Order { return clone(this.rows.get(rowKey(STORAGE_KEYS.ORDERS, 'order-delivery'))!.data); }
  deliveries() { return Array.from(this.rows.values()).filter((row) => row.domain === STORAGE_KEYS.DELIVERIES); }
}

{
  const prisma = new FakePrisma();
  const service = createDeliveryCommandService(prisma as any, { now: () => new Date(NOW) });
  const created = await service.createFromOrder('order-delivery', engineer);
  assert.equal(created.code, 0);
  assert.equal(prisma.deliveries().length, 1);
  assert.equal(prisma.order().deliveryId, created.data?.id);
  assert.deepEqual(created.data?.stages, ['资料收集', '账号搭建', '交付验收']);
  assert.equal(created.data?.tasks[0].status, '进行中');

  const replayed = await service.createFromOrder('order-delivery', engineer);
  assert.equal(replayed.code, 0);
  assert.equal(replayed.data?.id, created.data?.id);
  assert.equal(prisma.deliveries().length, 1, '重试不得生成重复交付单');

  prisma.order().deliveryId = undefined;
  const rawOrder = prisma.rows.get(rowKey(STORAGE_KEYS.ORDERS, 'order-delivery'))!;
  rawOrder.data.deliveryId = undefined;
  const advanced = await service.advance(created.data!.id, '账号搭建', engineer);
  assert.equal(advanced.code, 0);
  assert.equal(advanced.data?.currentStage, '账号搭建');
  assert.equal(prisma.order().deliveryId, created.data?.id, '更新交付时应在同一事务修复订单反向关联');
  assert.equal((await service.advance(created.data!.id, '账号搭建', engineer)).code, 0, '命令重试应幂等');

  const forbidden = await service.updateCard(created.data!.id, { notes: '越权' }, otherEngineer);
  assert.equal(forbidden.code, 403);
  assert.equal(prisma.deliveries()[0].data.notes, undefined);
  const forgedAssignment = await service.updateCard(created.data!.id, { ownerId: otherEngineer.id }, engineer);
  assert.equal(forgedAssignment.code, 403, 'self scope 不得把交付单分配给其他员工');

  const deleted = await service.delete(created.data!.id, engineer);
  assert.equal(deleted.code, 0);
  assert.equal(deleted.data, true);
  assert.equal(prisma.deliveries().length, 0);
  assert.equal(prisma.order().deliveryId, undefined);
}

{
  const prisma = new FakePrisma();
  const service = createDeliveryCommandService(prisma as any, { now: () => new Date(NOW) });
  const created = (await service.createFromOrder('order-delivery', engineer)).data!;
  const firstTask = created.tasks[0];
  const attached = await service.addAttachment(created.id, firstTask.id, {
    name: 'proof.png', uploadedBy: '伪造操作人',
  }, engineer);
  assert.equal(attached.code, 0);
  assert.equal(attached.data?.tasks[0].attachments?.[0].uploadedBy, engineer.name);

  const blocked = await service.addException(created.id, {
    type: '其他', description: '等待客户资料', needsSupervisor: true,
  }, engineer);
  assert.equal(blocked.data?.status, '阻塞');
  const resolved = await service.resolveException(
    created.id,
    blocked.data!.exceptions![0].id,
    '客户已补齐资料',
    engineer,
  );
  assert.equal(resolved.code, 0);
  assert.equal(resolved.data?.exceptions?.[0].resolvedBy, engineer.name);

  let current = resolved.data!;
  for (const task of current.tasks) {
    if (task.status === '已完成') continue;
    const completed = await service.updateTask(current.id, task.id, {
      status: '已完成', resultFields: { result: 'ok' },
    }, engineer);
    assert.equal(completed.code, 0);
    current = completed.data!;
  }
  assert.equal(current.approvalStatus, '待主管确认');
  const confirmed = await service.confirmCompletion(current.id, '验收通过', engineer);
  assert.equal(confirmed.code, 0);
  assert.equal(confirmed.data?.status, '已完成');
  assert.equal(confirmed.data?.supervisorConfirmedBy, engineer.name);
  assert.equal(prisma.order().deliveryId, created.id);
}

{
  const prisma = new FakePrisma();
  prisma.failOrderUpdate = true;
  const service = createDeliveryCommandService(prisma as any, { now: () => new Date(NOW) });
  await assert.rejects(() => service.createFromOrder('order-delivery', engineer), /order update failed/);
  assert.equal(prisma.deliveries().length, 0, '订单关联失败时不得留下半成功交付单');
  assert.equal(prisma.order().deliveryId, undefined);
}
