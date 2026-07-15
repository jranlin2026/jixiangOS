import assert from 'node:assert/strict';
import { deliveryApi } from './deliveryApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Customer } from '../types/customer';
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

const now = '2026-06-20T08:00:00.000Z';

const agentStages = ['资料收集', '直播调试', '代理后台交付', '教程发送'];
const oemStages = ['资料收集', '直播调试', '贴牌后台交付', '教程发送', '域名申请备案', '贴牌的需求配置', '小程序申请备案', '贴牌小程序的配置'];

function makeOrder(index: number, productLevel = '代理'): Order {
  return {
    id: `order-${String(index).padStart(2, '0')}`,
    orderNo: `ORD-${String(index).padStart(4, '0')}`,
    customerId: `cust-${String(index).padStart(2, '0')}`,
    customerName: `客户${index}`,
    productName: productLevel === '贴牌' ? '29800贴牌' : '9800代理',
    productLevel,
    orderType: '新购',
    amount: 9800 + index,
    actualAmount: 9800 + index,
    paymentMethod: '对公转账',
    status: '已确认',
    refundStatus: '无',
    owner: '销售A',
    salesName: '销售A',
    successId: 'user-cs-1',
    successName: '客户成功A',
    payments: [{ id: `pay-${index}`, amount: 9800 + index, paidAt: `2026-06-${String(index).padStart(2, '0')}T00:00:00.000Z`, paymentMethod: '对公转账' }],
    createdAt: now,
    updatedAt: now,
  } as Order;
}

function makeCustomer(index: number): Customer {
  return {
    id: `cust-${String(index).padStart(2, '0')}`,
    name: `客户${index}`,
    company: `极享测试客户${index}有限公司`,
    phone: '13328951873',
    wechat: `wx_${index}`,
    industry: '软件',
    city: '福州',
    customerLevel: 'L3',
    owner: '销售A',
    totalSpent: 9800 + index,
    orderCount: 1,
    growthPath: [],
    growthRecords: [],
    createdAt: now,
    updatedAt: now,
  } as Customer;
}

function makeDelivery(index: number, overrides: Partial<Delivery> = {}): Delivery {
  return {
    id: `delivery-${String(index).padStart(2, '0')}`,
    orderId: `order-${String(index).padStart(2, '0')}`,
    orderNo: `ORD-${String(index).padStart(4, '0')}`,
    customerId: `cust-${String(index).padStart(2, '0')}`,
    customerName: `客户${index}`,
    productType: '代理',
    currentStage: '资料收集',
    stages: [...agentStages],
    tasks: [],
    owner: '客户成功A',
    ownerId: 'user-cs-1',
    status: '交付中',
    priority: 'normal',
    plannedCompletedAt: '2026-12-31',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  } as Delivery;
}

function seed(deliveries: Delivery[] = Array.from({ length: 12 }, (_, index) => makeDelivery(index + 1))) {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify([
    { id: 'prod-agent', name: '9800代理', level: '代理', price: 9800, deliveryStages: agentStages, isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
    { id: 'prod-oem', name: '29800贴牌', level: '贴牌', price: 29800, deliveryStages: oemStages, isActive: true, sortOrder: 2, createdAt: now, updatedAt: now },
    { id: 'prod-partner', name: '59800合伙人', level: '合伙人', price: 59800, deliveryStages: ['合伙人开通'], isActive: true, sortOrder: 3, createdAt: now, updatedAt: now },
    { id: 'prod-course-empty', name: '2980课程', level: '课程', price: 2980, deliveryStages: [], isActive: true, sortOrder: 4, createdAt: now, updatedAt: now },
  ]));
  storage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify([
    ...Array.from({ length: 12 }, (_, index) => makeOrder(index + 1, index % 3 === 0 ? '贴牌' : '代理')),
    makeOrder(99, '贴牌'),
    { ...makeOrder(100, '课程'), id: 'order-100', orderNo: 'ORD-0100', productId: 'prod-course-empty', productName: '2980课程' },
  ]));
  storage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify([
    ...Array.from({ length: 12 }, (_, index) => makeCustomer(index + 1)),
    makeCustomer(99),
  ]));
  storage.setItem(STORAGE_KEYS.DELIVERIES, JSON.stringify(deliveries));
}

seed();

const pageRes = await deliveryApi.fetchDeliveries({ page: 2, pageSize: 5, status: '全部' });
assert.equal(pageRes.code, 0);
assert.equal(pageRes.data.page, 2);
assert.equal(pageRes.data.pageSize, 5);
assert.equal(pageRes.data.total, 12);
assert.equal(pageRes.data.items.length, 5);
assert.equal(pageRes.data.items[0].orderAmount, 9806);
assert.equal(pageRes.data.items[0].paymentDate?.startsWith('2026-06-06'), true);
assert.equal(pageRes.data.items[0].snapshot?.customer.company, '极享测试客户6有限公司');
assert.equal(pageRes.data.items[0].productName, '9800代理');

const agentStagesRes = await deliveryApi.fetchDeliveryStagesByProductType('代理');
assert.deepEqual(agentStagesRes.data, agentStages);

const oemStagesRes = await deliveryApi.fetchDeliveryStagesByProductType('贴牌');
assert.deepEqual(oemStagesRes.data, oemStages);

const partnerStagesRes = await deliveryApi.fetchDeliveryStagesByProductType('合伙人');
assert.deepEqual(partnerStagesRes.data, ['合伙人开通']);

const detailRes = await deliveryApi.fetchDeliveryById('delivery-01');
assert.equal(detailRes.code, 0);
assert.equal(detailRes.data?.tasks.length, agentStages.length);
assert.equal(detailRes.data?.tasks[0].status, '进行中');
assert.equal(detailRes.data?.materialItems?.find((item) => item.key === 'companyName')?.status, '已提供');
assert.equal(detailRes.data?.materialItems?.find((item) => item.key === 'domain')?.status, '缺失');

const taskId = detailRes.data!.tasks[0].id;
const completedStepRes = await deliveryApi.updateDeliveryTask('delivery-01', taskId, {
  status: '已完成',
  resultFields: { backendUrl: 'https://agent.example.com', account: 'admin' },
});
assert.equal(completedStepRes.code, 0);
assert.equal(completedStepRes.data?.currentStage, '直播调试');
assert.equal(completedStepRes.data?.tasks[1].status, '进行中');
assert.equal(completedStepRes.data?.tasks[0].resultFields?.backendUrl, 'https://agent.example.com');

const blockedFutureRes = await deliveryApi.updateDeliveryTask('delivery-01', completedStepRes.data!.tasks[3].id, { status: '已完成' });
assert.notEqual(blockedFutureRes.code, 0);
assert.match(blockedFutureRes.message, /当前步骤/);

const uploadRes = await deliveryApi.addDeliveryAttachment('delivery-01', completedStepRes.data!.tasks[1].id, {
  name: '直播需求确认.docx',
  size: 1024,
  fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  uploadedBy: '客户成功A',
});
assert.equal(uploadRes.code, 0);
assert.equal(uploadRes.data?.tasks[1].attachments?.[0].name, '直播需求确认.docx');

const skippedRes = await deliveryApi.updateDeliveryTask('delivery-01', completedStepRes.data!.tasks[1].id, {
  status: '已跳过',
  skipReason: '客户无直播需求',
});
assert.notEqual(skippedRes.code, 0);
assert.match(skippedRes.message, /不支持跳过/);

const completedOptionalRes = await deliveryApi.updateDeliveryTask('delivery-01', completedStepRes.data!.tasks[1].id, {
  status: '已完成',
});
assert.equal(completedOptionalRes.code, 0);
assert.equal(completedOptionalRes.data?.currentStage, '代理后台交付');

const exceptionRes = await deliveryApi.addDeliveryException('delivery-01', {
  type: '客户不提供资料',
  description: '客户暂未提供域名和 logo',
  createdBy: '客户成功A',
});
assert.equal(exceptionRes.code, 0);
assert.equal(exceptionRes.data?.status, '阻塞');
assert.equal(exceptionRes.data?.exceptions?.[0].status, '待主管处理');

const confirmBlockedRes = await deliveryApi.confirmDeliveryCompletion('delivery-01', { confirmedBy: '客户成功主管' });
assert.notEqual(confirmBlockedRes.code, 0);
assert.match(confirmBlockedRes.message, /未解除异常/);

const resolvedRes = await deliveryApi.resolveDeliveryException('delivery-01', exceptionRes.data!.exceptions![0].id, {
  resolvedBy: '客户成功主管',
  resolution: '客户已补齐资料',
});
assert.equal(resolvedRes.code, 0);
assert.equal(resolvedRes.data?.exceptions?.[0].status, '已解除');

const creatableRes = await deliveryApi.fetchCreatableDeliveryOrders('ORD-0099');
assert.equal(creatableRes.code, 0);
assert.equal(creatableRes.data.length, 1);
assert.equal(creatableRes.data[0].orderId, 'order-99');

const noStageCreatableRes = await deliveryApi.fetchCreatableDeliveryOrders('ORD-0100');
assert.equal(noStageCreatableRes.code, 0);
assert.equal(noStageCreatableRes.data.length, 0);
const noStageCreateRes = await deliveryApi.createDeliveryFromOrder('order-100');
assert.notEqual(noStageCreateRes.code, 0);
assert.match(noStageCreateRes.message, /未配置交付阶段/);

seed([
  makeDelivery(100, {
    id: 'delivery-hidden-no-stage',
    orderId: 'order-100',
    orderNo: 'ORD-0100',
    productType: '课程',
    productName: '2980课程',
    currentStage: '历史默认阶段',
    stages: ['历史默认阶段'],
  }),
]);
const hiddenNoStageRes = await deliveryApi.fetchDeliveries({ search: 'ORD-0100', page: 1, pageSize: 10, status: '全部' });
assert.equal(hiddenNoStageRes.data.total, 1);

seed();
const createDeliveryRes = await deliveryApi.createDeliveryFromOrder('order-99');
assert.equal(createDeliveryRes.code, 0);
assert.equal(createDeliveryRes.data?.orderId, 'order-99');
assert.equal(createDeliveryRes.data?.productName, '29800贴牌');
assert.equal(createDeliveryRes.data?.tasks.length, oemStages.length);
const creatableAfterCreateRes = await deliveryApi.fetchCreatableDeliveryOrders('ORD-0099');
assert.equal(creatableAfterCreateRes.data.length, 0);

const deleteRes = await deliveryApi.deleteDelivery('delivery-02');
assert.equal(deleteRes.code, 0);
assert.equal(deleteRes.data, true);
const afterDeleteRes = await deliveryApi.fetchDeliveries({ page: 1, pageSize: 20, status: '全部' });
assert.equal(afterDeleteRes.data.total, 12);
assert.equal(afterDeleteRes.data.items.some((item) => item.id === 'delivery-02'), false);

const finishTarget = makeDelivery(99, {
  id: 'delivery-finish',
  orderId: 'order-99',
  customerId: 'cust-99',
  productType: '贴牌',
  stages: [...oemStages],
  currentStage: oemStages[0],
});
seed([finishTarget]);
let current = (await deliveryApi.fetchDeliveryById('delivery-finish')).data!;
for (const task of current.tasks) {
  const latest = (await deliveryApi.fetchDeliveryById('delivery-finish')).data!;
  const openTask = latest.tasks.find((item) => item.status === '进行中')!;
  const res = await deliveryApi.updateDeliveryTask('delivery-finish', openTask.id, {
    status: '已完成',
  });
  assert.equal(res.code, 0);
  current = res.data!;
}
assert.equal(current.approvalStatus, '待主管确认');
assert.equal(current.status, '待验收');

const confirmedRes = await deliveryApi.confirmDeliveryCompletion('delivery-finish', {
  confirmedBy: '客户成功主管',
  notes: '步骤和交付资料均已确认',
});
assert.equal(confirmedRes.code, 0);
assert.equal(confirmedRes.data?.status, '已完成');
assert.equal(confirmedRes.data?.customerSuccessStatus, '维护中');
assert.ok(confirmedRes.data?.actualCompletedAt);
