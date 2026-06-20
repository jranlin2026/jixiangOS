import assert from 'node:assert/strict';
import { deliveryApi } from './deliveryApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Delivery } from '../types/delivery';
import type { Order } from '../types/order';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const zh = {
  notStarted: '\u5f85\u5f00\u59cb',
  inProgress: '\u4ea4\u4ed8\u4e2d',
  overdue: '\u8d85\u671f',
  blocked: '\u963b\u585e',
  pendingAcceptance: '\u5f85\u9a8c\u6536',
  completed: '\u5df2\u5b8c\u6210',
  taskPending: '\u5f85\u5f00\u59cb',
  taskDoing: '\u8fdb\u884c\u4e2d',
  taskDone: '\u5df2\u5b8c\u6210',
  confirmed: '\u5df2\u786e\u8ba4',
  none: '\u65e0',
  bankTransfer: '\u5bf9\u516c\u8f6c\u8d26',
} as const;

const now = '2026-06-20T08:00:00.000Z';

const stages = ['需求确认', '系统部署', '培训交付', '验收完成'];

function makeDelivery(index: number, overrides: Partial<Delivery> = {}): Delivery {
  const currentStage = stages[index % stages.length];
  return {
    id: `delivery-${String(index).padStart(2, '0')}`,
    orderId: `order-${String(index).padStart(2, '0')}`,
    orderNo: `ORD-${String(index).padStart(4, '0')}`,
    customerId: `cust-${String(index).padStart(2, '0')}`,
    customerName: `客户${index}`,
    productType: index % 2 === 0 ? '899' : '代理',
    currentStage,
    stages: [...stages],
    tasks: stages.map((stage, stageIndex) => ({
      id: `task-${index}-${stageIndex}`,
      title: stage,
      description: `${stage}任务`,
      status: stageIndex < stages.indexOf(currentStage) ? zh.taskDone : stageIndex === stages.indexOf(currentStage) ? zh.taskDoing : zh.taskPending,
      records: [],
    })),
    owner: index % 2 === 0 ? '交付A' : '交付B',
    ownerId: index % 2 === 0 ? 'user-delivery-a' : 'user-delivery-b',
    status: index === 3 ? zh.blocked : index === 4 ? zh.overdue : index === 5 ? zh.pendingAcceptance : index === 6 ? zh.completed : zh.inProgress,
    priority: index % 3 === 0 ? 'high' : 'normal',
    plannedCompletedAt: index === 4 ? '2026-01-01' : '2026-12-31',
    progressPercent: 25,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Delivery;
}

function makeOrder(index: number): Order {
  return {
    id: `order-${String(index).padStart(2, '0')}`,
    orderNo: `ORD-${String(index).padStart(4, '0')}`,
    customerId: `cust-${String(index).padStart(2, '0')}`,
    customerName: `客户${index}`,
    productLevel: index % 2 === 0 ? '899' : '代理',
    orderType: index % 2 === 0 ? '新签' : '升单',
    amount: 1000 + index,
    actualAmount: 1000 + index,
    paymentMethod: zh.bankTransfer,
    status: zh.confirmed,
    refundStatus: zh.none,
    owner: index % 2 === 0 ? '销售A' : '销售B',
    salesName: index % 2 === 0 ? '销售A' : '销售B',
    payments: [{ id: `pay-${index}`, amount: 1000 + index, paidAt: `2026-06-${String(index).padStart(2, '0')}T00:00:00.000Z`, paymentMethod: zh.bankTransfer }],
    createdAt: now,
    updatedAt: now,
  } as Order;
}

function seed() {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([
    { id: 'prod-899', name: '899智能体', level: '899', price: 899, deliveryStages: stages, isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
    { id: 'prod-agent', name: '代理', level: '代理', price: 9800, deliveryStages: stages, isActive: true, sortOrder: 2, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(Array.from({ length: 12 }, (_, index) => makeOrder(index + 1))));
  storage.setItem(STORAGE_KEYS.DELIVERIES, JSON.stringify(Array.from({ length: 12 }, (_, index) => makeDelivery(index + 1))));
}

seed();

const pageRes = await deliveryApi.fetchDeliveries({ page: 2, pageSize: 5, status: '\u5168\u90e8' });
assert.equal(pageRes.code, 0);
assert.equal(pageRes.data.page, 2);
assert.equal(pageRes.data.pageSize, 5);
assert.equal(pageRes.data.total, 12);
assert.equal(pageRes.data.items.length, 5);
assert.equal(pageRes.data.items[0].orderNo, 'ORD-0006');
assert.equal(pageRes.data.items[0].orderAmount, 1006);
assert.equal(pageRes.data.items[0].paymentDate?.startsWith('2026-06-06'), true);

const filteredRes = await deliveryApi.fetchDeliveries({ search: '客户1', page: 1, pageSize: 20, status: '\u5168\u90e8' });
assert.equal(filteredRes.data.items.some((item) => item.customerName === '客户10'), true);
assert.equal(filteredRes.data.items.every((item) => item.customerName.includes('客户1') || item.orderNo.includes('客户1')), true);

const statsRes = await deliveryApi.fetchDeliveryStats();
assert.equal(statsRes.code, 0);
assert.equal(statsRes.data.statusCounts['\u5168\u90e8'], 12);
assert.equal(statsRes.data.statusCounts[zh.blocked], 1);
assert.equal(statsRes.data.statusCounts[zh.overdue], 1);
assert.equal(statsRes.data.ownerWorkload.some((item) => item.owner === '交付A'), true);

const target = makeDelivery(99, {
  id: 'delivery-final',
  orderId: 'order-01',
  orderNo: 'ORD-FINAL',
  currentStage: stages[1],
});
storage.setItem(STORAGE_KEYS.DELIVERIES, JSON.stringify([target]));

const advancedRes = await deliveryApi.advanceDeliveryStage('delivery-final', '验收完成');
assert.equal(advancedRes.code, 0);
assert.equal(advancedRes.data?.currentStage, '验收完成');
assert.equal(advancedRes.data?.status, zh.completed);
assert.equal(advancedRes.data?.progressPercent, 100);
assert.ok(advancedRes.data?.actualCompletedAt);
