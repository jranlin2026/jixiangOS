import assert from 'node:assert/strict';

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null, removeItem: () => undefined }, configurable: true });
process.env.VITE_USE_BACKEND_API = 'true';
process.env.VITE_AI_API_BASE = 'http://127.0.0.1:3001/api';

const requests: string[] = [];
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input);
  requests.push(url);
  const data = url.includes('/export')
    ? '\uFEFF流水编号,流水类型'
    : url.includes('/finance-transactions/order_payment%3Aorder-1%3Apayment-1')
      ? { id: 'order_payment:order-1:payment-1', sourceEventId: 'order-1:payment-1' }
      : { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 }, summary: { incomeAmount: 0, expenseAmount: 0, netAmount: 0, transactionCount: 0 } };
  return new Response(JSON.stringify({ code: 0, data, message: 'success' }), { status: 200, headers: { 'content-type': 'application/json' } });
}) as typeof fetch;

const { financeApi } = await import('./financeApi');
const list = await financeApi.fetchFinanceTransactions({ search: '客户A', direction: 'income', page: 1, pageSize: 20 });
assert.equal(list.code, 0);
assert.deepEqual(list.data.summary, { incomeAmount: 0, expenseAmount: 0, netAmount: 0, transactionCount: 0 });
assert.match(requests[0], /\/finance-transactions\?/);
assert.match(requests[0], /search=%E5%AE%A2%E6%88%B7A/);
assert.match(requests[0], /direction=income/);

const detail = await financeApi.fetchFinanceTransactionById('order_payment:order-1:payment-1');
assert.equal(detail.code, 0);
assert.match(requests[1], /order_payment%3Aorder-1%3Apayment-1/);

const exported = await financeApi.exportFinanceTransactionsCsv({ type: '订单实收' });
assert.equal(exported.code, 0);
assert.match(exported.data, /^\uFEFF/);
assert.match(requests[2], /\/finance-transactions\/export\?/);

console.log('finance flow backend API tests passed');
