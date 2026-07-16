import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Delivery } from '../../src/types/delivery';
import type { Order } from '../../src/types/order';
import { createDeliveryQueryService } from './deliveryQueryService';

const now = '2026-07-15T04:00:00.000Z';
const inlineAttachment = `data:image/png;base64,${'A'.repeat(10_000)}`;
const actor: AuthenticatedUser = {
  id: 'user-delivery', name: '交付A', account: 'delivery', email: '', phone: '', role: '交付工程师',
  roleId: 'role-delivery', departmentId: 'dept-delivery', isActive: true,
  permissions: [{ module: '交付/交付中心', actions: ['read', 'write'] }],
};

function sourceOrder(id: string, serviceId: string, overrides: Partial<Order> = {}): Order {
  return {
    id, orderNo: `ORD-${id}`, customerId: `customer-${id}`, customerName: `客户-${id}`,
    productId: 'product-1', productName: '9800代理', productLevel: '代理', orderType: '新购',
    amount: 9800, actualAmount: 9800, paymentMethod: '对公转账', status: '已确认', refundStatus: '无',
    owner: '销售A', salesId: 'user-sales', salesName: '销售A', serviceId,
    serviceName: serviceId === actor.id ? actor.name : '交付B', payments: [], createdAt: now, updatedAt: now,
    ...overrides,
  };
}

function sourceDelivery(order: Order, ownerId: string): Delivery {
  const stages = ['step-1', 'step-2', 'step-3', 'step-4', 'step-5'];
  return {
    id: `delivery-${order.id}`, orderId: order.id, orderNo: order.orderNo, customerId: order.customerId,
    customerName: order.customerName, productName: order.productName, productType: order.productLevel,
    currentStage: stages[0], stages, tasks: stages.map((title, index) => ({
      id: `task-${index}`, title, description: title,
      records: index === 0 ? [{ id: 'record-1', content: 'result', createdBy: actor.name, createdAt: now, attachments: [inlineAttachment] }] : [],
      attachments: index === 0 ? [{ id: 'attachment-1', name: 'proof.png', url: inlineAttachment, uploadedBy: actor.name, uploadedAt: now }] : undefined,
      status: index === 0 || index === 3 ? '已完成' : '待开始',
      completedAt: index === 0 || index === 3 ? now : undefined,
    })), owner: ownerId === actor.id ? actor.name : '交付B',
    ownerId, status: '待开始', priority: 'normal', progressPercent: 0, createdAt: now, updatedAt: now,
  };
}

const ownOrder = sourceOrder('own', actor.id);
const otherOrder = sourceOrder('other', 'user-other');
const candidateOrder = sourceOrder('candidate', actor.id);
const deliveries = [sourceDelivery(ownOrder, actor.id), sourceDelivery(otherOrder, 'user-other')];
const orders = [ownOrder, otherOrder, candidateOrder];
const product = { id: 'product-1', name: '9800代理', level: '代理', price: 9800, deliveryStages: [], isActive: true, sortOrder: 1, createdAt: now, updatedAt: now };

let deliveryScope: 'self' | 'department' = 'self';

const prisma: any = {
  user: { findMany: async () => [
    { ...actor, passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, createdAt: new Date(now), updatedAt: new Date(now), employmentStatus: 'active' },
    { ...actor, id: 'user-other', name: '交付B', account: 'delivery-b', passwordHash: null, passwordSalt: null, passwordUpdatedAt: null, createdAt: new Date(now), updatedAt: new Date(now), employmentStatus: 'active' },
  ] },
  role: { findMany: async () => [{ id: 'role-delivery', name: actor.role, code: 'delivery_engineer', permissions: actor.permissions, dataScopes: { orders: 'all', deliveries: deliveryScope }, memberCount: 2, isActive: true, createdAt: new Date(now), updatedAt: new Date(now) }] },
  department: { findMany: async () => [{ id: 'dept-delivery', name: '交付部', code: 'DELIVERY', memberCount: 1, sortOrder: 1, isActive: true, createdAt: new Date(now), updatedAt: new Date(now) }] },
  businessRecord: {
    findMany: async ({ where }: any) => {
      const data = where.domain === STORAGE_KEYS.DELIVERIES ? deliveries
        : where.domain === STORAGE_KEYS.ORDERS ? orders
          : where.domain === STORAGE_KEYS.PRODUCTS ? [product] : [];
      return data.map((item) => ({ domain: where.domain, recordId: item.id, data: item }));
    },
    findUnique: async ({ where }: any) => {
      const target = where.domain_recordId;
      const data = target.domain === STORAGE_KEYS.DELIVERIES ? deliveries : orders;
      const item = data.find((entry) => entry.id === target.recordId);
      return item ? { domain: target.domain, recordId: item.id, data: item } : null;
    },
  },
};

const service = createDeliveryQueryService(prisma);
const list = await service.list({ status: '全部', page: 1, pageSize: 10 }, actor);
assert.deepEqual(list.data?.items.map((item) => item.id), ['delivery-own']);
assert.equal(list.data?.total, 1);
assert.equal(list.data?.items[0].currentStage, 'step-4', 'legacy rows derive the last checked step on read');
assert.equal(list.data?.items[0].tasks[0].attachments?.[0].url, undefined);
assert.deepEqual(list.data?.items[0].tasks[0].records[0].attachments, []);
assert.equal((await service.get('delivery-other', actor)).code, 403);
const deliveryDetail = (await service.get('delivery-own', actor)).data;
assert.equal(deliveryDetail?.currentStage, 'step-4');
assert.equal(deliveryDetail?.tasks[0].attachments?.[0].url, inlineAttachment);
const stats = await service.stats({}, actor);
assert.equal(stats.data?.total, 1);
assert.deepEqual(stats.data?.stageCounts, [{ stage: 'step-4', count: 1 }]);
const candidates = await service.listCreatableOrders('', actor);
assert.deepEqual(candidates.data?.map((item) => item.orderId), [], '空交付阶段产品的订单不得出现在可创建交付列表');

deliveryScope = 'department';
const departmentList = await service.list({ page: 1, pageSize: 10 }, actor);
assert.deepEqual(departmentList.data?.items.map((item) => item.id), ['delivery-own', 'delivery-other']);
