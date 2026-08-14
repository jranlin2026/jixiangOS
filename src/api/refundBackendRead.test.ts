import assert from 'node:assert/strict';
import test from 'node:test';
import { refundApi } from './refundApi';

test('refund cockpit drill-down reads completed refunds from the backend source', async () => {
  const originalBackend = process.env.VITE_USE_BACKEND_API;
  const originalFetch = globalThis.fetch;
  const originalStorage = globalThis.localStorage;
  const requests: string[] = [];
  process.env.VITE_USE_BACKEND_API = 'true';
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
  globalThis.fetch = (async (input: string | URL | Request) => {
    requests.push(String(input));
    return new Response(JSON.stringify({
      code: 0,
      message: 'success',
      data: [
        {
          id: 'refund-completed', refundNo: 'RF-1', orderId: 'order-1', orderNo: 'ORD-1',
          customerId: 'customer-1', customerName: '客户', productLevel: '899', orderAmount: 999,
          refundAmount: 300, refundReason: '测试', refundCategory: '其他', status: '退款已完成',
          applicantId: 'user-1', applicantName: '用户', refundedAt: '2026-08-14T02:00:00.000Z',
          createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-14T02:00:00.000Z',
        },
        {
          id: 'refund-active', refundNo: 'RF-2', orderId: 'order-2', orderNo: 'ORD-2',
          customerId: 'customer-2', customerName: '客户2', productLevel: '899', orderAmount: 999,
          refundAmount: 200, refundReason: '测试', refundCategory: '其他', status: '挽回中',
          applicantId: 'user-1', applicantName: '用户', createdAt: '2026-08-14T02:00:00.000Z', updatedAt: '2026-08-14T02:00:00.000Z',
        },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  try {
    const response = await refundApi.getRefunds({
      status: '退款已完成', startDate: '2026-08-14', endDate: '2026-08-14', page: 1, pageSize: 20,
    });
    assert.equal(response.code, 0);
    assert.deepEqual(response.data.items.map((item) => item.id), ['refund-completed']);
    assert.ok(requests.some((url) => url.endsWith('/storage/aaos_refunds')));
  } finally {
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
    if (originalBackend === undefined) delete process.env.VITE_USE_BACKEND_API;
    else process.env.VITE_USE_BACKEND_API = originalBackend;
  }
});
