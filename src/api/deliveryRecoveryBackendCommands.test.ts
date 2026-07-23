import assert from 'node:assert/strict';
import { clearBackendToken, flushBackendStorageWrites, writeBackendToken } from './backendClient';
import { deliveryApi } from './deliveryApi';
import { recoveryOrderApi } from './recoveryOrderApi';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { Delivery } from '../types/delivery';
import type { RecoveryOrder, RecoveryOrderInput } from '../types/recoveryOrder';

const values = new Map<string, string>();
const storage = {
  get length() { return values.size; }, key: (index: number) => Array.from(values.keys())[index] ?? null,
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key), clear: () => values.clear(),
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });

const originalFetch = globalThis.fetch;
const originalUseBackend = process.env.VITE_USE_BACKEND_API;
const originalApiBase = process.env.VITE_AI_API_BASE;
const now = '2026-07-12T19:00:00.000Z';

const delivery: Delivery = {
  id: 'delivery-backend', orderId: 'order-1', orderNo: 'ORD-1', customerId: 'customer-1',
  customerName: '客户A', productName: '代理', productType: '代理', currentStage: '资料收集',
  stages: ['资料收集', '账号搭建'], tasks: [
    { id: 'task-1', title: '资料收集', description: '资料收集', status: '进行中', records: [] },
    { id: 'task-2', title: '账号搭建', description: '账号搭建', status: '待开始', records: [] },
  ], owner: '交付A', ownerId: 'user-delivery', status: '待开始', priority: 'normal',
  progressPercent: 0, approvalStatus: '未提交', customerSuccessStatus: '未开始', createdAt: now, updatedAt: now,
};
const recoveryInput: RecoveryOrderInput = {
  customerName: '客户A', thirdPartyOrderNo: 'TP-001', originalProduct: '899课程',
  originalAmount: 899, recoveryAmount: 2980, recoveryUserId: 'user-delivery',
  recoveryUserName: '交付A', createdBy: 'forged', createdByName: '伪造',
};
const recovery: RecoveryOrder = {
  ...recoveryInput, id: 'recovery-backend', recoveryNo: 'RCV-001', customerId: '',
  customerMatchStatus: '手工填写', status: '待审核', settlementStatus: '未分账', commissionIds: [],
  createdBy: 'user-delivery', createdByName: '交付A', createdAt: now, updatedAt: now,
};

try {
  process.env.VITE_USE_BACKEND_API = 'true';
  process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.DELIVERIES, JSON.stringify([delivery]));
  storage.setItem(STORAGE_KEYS.RECOVERY_ORDERS, JSON.stringify([{ ...recovery, id: 'recovery-old' }]));
  writeBackendToken('delivery-session');

  const requests: Array<{ url: string; method: string; body: any }> = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = String(init?.method || 'GET');
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body });
    const data = url.includes('/recovery-orders/recovery-backend/cleanup-review')
      ? { ...recovery, deletedAt: now, reviewCleanedAt: now, reviewCleanedBy: '超级管理员', reviewCleanupReason: '清理残留' }
      : url.includes('/deliveries/creatable-orders')
      ? [{ orderId: 'order-2', orderNo: 'ORD-2', customerId: 'customer-2', customerName: '客户B', productType: '代理' }]
      : url.includes('/deliveries/stats')
        ? { total: 1, pending: 1, inProgress: 0, overdue: 0, completed: 0, statusCounts: { 全部: 1 } }
        : /\/deliveries(?:\?|$)/.test(url)
          ? { items: [delivery], total: 1, page: 1, pageSize: 10 }
          : /\/recovery-orders(?:\?|$)/.test(url)
      ? method === 'GET'
        ? { items: [recovery], pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 } }
        : recovery
      : method === 'DELETE'
        ? true
        : { ...delivery, updatedAt: now };
    return new Response(JSON.stringify({ code: 0, data, message: 'success' }), {
      status: method === 'POST' && (url.endsWith('/from-order') || url.endsWith('/recovery-orders')) ? 201 : 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const listResult = await deliveryApi.fetchDeliveries({ status: '全部', page: 1, pageSize: 10 });
  assert.equal(listResult.data.total, 1, '后端模式必须从服务端读取交付列表');
  const statsResult = await deliveryApi.fetchDeliveryStats({ status: '全部' });
  assert.equal(statsResult.data.total, 1, '后端模式必须从服务端读取交付统计');
  const creatableResult = await deliveryApi.fetchCreatableDeliveryOrders('ORD');
  assert.equal(creatableResult.data[0]?.orderId, 'order-2', '后端模式必须从服务端读取可建交付订单');
  assert.equal((await deliveryApi.createDeliveryFromOrder('order-1')).code, 0);
  assert.equal((await deliveryApi.updateDelivery(delivery.id, { priority: 'high' })).code, 0);
  assert.equal((await deliveryApi.advanceDeliveryStage(delivery.id, '账号搭建')).code, 0);
  assert.equal((await deliveryApi.revertDeliveryStage(delivery.id)).code, 0);
  assert.equal((await deliveryApi.updateDeliveryTask(delivery.id, 'task-1', { status: '已完成' })).code, 0);
  assert.equal((await deliveryApi.addDeliveryAttachment(delivery.id, 'task-1', {
    name: 'proof.png', uploadedBy: '伪造',
  })).code, 0);
  assert.equal((await deliveryApi.addDeliveryException(delivery.id, {
    type: '其他', description: '等待资料', createdBy: '伪造',
  })).code, 0);
  assert.equal((await deliveryApi.resolveDeliveryException(delivery.id, 'exception-1', {
    resolvedBy: '伪造', resolution: '已解决',
  })).code, 0);
  assert.equal((await deliveryApi.confirmDeliveryCompletion(delivery.id, {
    confirmedBy: '伪造', notes: '完成',
  })).code, 0);
  assert.equal((await deliveryApi.deleteDelivery(delivery.id)).code, 0);
  storage.removeItem(STORAGE_KEYS.RECOVERY_ORDERS);
  const recoveryList = await recoveryOrderApi.fetchRecoveryOrders({
    scopeDomain: 'recoveryOrderApplications', page: 1, pageSize: 10,
  });
  assert.equal(recoveryList.data.pagination.total, 1, '切换账号清空缓存后必须从服务端数据库重新读取售后挽回订单');
  assert.equal((await recoveryOrderApi.updateRecoveryOrder(recovery.id, recoveryInput)).code, 0);
  assert.equal((await recoveryOrderApi.approveRecoveryOrder(recovery.id, 'forged', '伪造审核人')).code, 0);
  assert.equal((await recoveryOrderApi.returnRecoveryOrder(recovery.id, 'forged', '伪造审核人', '补充材料')).code, 0);
  assert.equal((await recoveryOrderApi.rejectRecoveryOrder(recovery.id, 'forged', '伪造审核人', '凭证无效')).code, 0);
  assert.equal((await recoveryOrderApi.deleteRecoveryOrder(recovery.id)).code, 0);
  assert.equal((await recoveryOrderApi.cleanupDeletedRecoveryOrderReview(recovery.id, '清理残留')).code, 0);
  assert.equal((await recoveryOrderApi.createRecoveryOrder(recoveryInput)).code, 0);

  await flushBackendStorageWrites();
  assert.equal(requests.some((request) => request.url.includes('/storage')), false);
  assert.deepEqual(requests.map(({ url, method }) => ({ url: url.replace('http://127.0.0.1:3001/api', ''), method })), [
    { url: '/deliveries?status=%E5%85%A8%E9%83%A8&page=1&pageSize=10', method: 'GET' },
    { url: '/deliveries/stats?status=%E5%85%A8%E9%83%A8', method: 'GET' },
    { url: '/deliveries/creatable-orders?search=ORD', method: 'GET' },
    { url: '/deliveries/from-order', method: 'POST' },
    { url: '/deliveries/delivery-backend/card', method: 'PATCH' },
    { url: '/deliveries/delivery-backend/advance', method: 'POST' },
    { url: '/deliveries/delivery-backend/revert', method: 'POST' },
    { url: '/deliveries/delivery-backend/tasks/task-1', method: 'PATCH' },
    { url: '/deliveries/delivery-backend/tasks/task-1/attachments', method: 'POST' },
    { url: '/deliveries/delivery-backend/exceptions', method: 'POST' },
    { url: '/deliveries/delivery-backend/exceptions/exception-1/resolve', method: 'POST' },
    { url: '/deliveries/delivery-backend/confirm', method: 'POST' },
    { url: '/deliveries/delivery-backend', method: 'DELETE' },
    { url: '/recovery-orders?scopeDomain=recoveryOrderApplications&page=1&pageSize=10', method: 'GET' },
    { url: '/recovery-orders/recovery-backend', method: 'PUT' },
    { url: '/recovery-orders/recovery-backend/approve', method: 'POST' },
    { url: '/recovery-orders/recovery-backend/return', method: 'POST' },
    { url: '/recovery-orders/recovery-backend/reject', method: 'POST' },
    { url: '/recovery-orders/recovery-backend', method: 'DELETE' },
    { url: '/recovery-orders/recovery-backend/cleanup-review', method: 'POST' },
    { url: '/recovery-orders', method: 'POST' },
  ]);
  assert.deepEqual(requests[3].body, { orderId: 'order-1' });
  assert.deepEqual(requests[4].body, { data: { priority: 'high' } });
  assert.deepEqual(requests[14].body, { data: recoveryInput });
  assert.deepEqual(requests[16].body, { reason: '补充材料' });
  assert.deepEqual(requests[17].body, { reason: '凭证无效' });
  assert.deepEqual(requests[19].body, { reason: '清理残留' });
  assert.deepEqual(requests[20].body, { data: recoveryInput });
  const cachedRecoveries = JSON.parse(storage.getItem(STORAGE_KEYS.RECOVERY_ORDERS) || '[]') as RecoveryOrder[];
  assert.ok(cachedRecoveries.some((item) => item.id === recovery.id));
} finally {
  clearBackendToken();
  globalThis.fetch = originalFetch;
  if (originalUseBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
  else process.env.VITE_USE_BACKEND_API = originalUseBackend;
  if (originalApiBase === undefined) delete process.env.VITE_AI_API_BASE;
  else process.env.VITE_AI_API_BASE = originalApiBase;
}
