import assert from 'node:assert/strict';
import express from 'express';
import { createCustomerFollowUpHandler } from './customerFollowUpRoutes';

const app = express();
app.use(express.json());
app.post('/api/customers/:id/follow-ups', (request, _response, next) => {
  (request as any).currentUser = { id: 'user-sales', name: '销售甲' };
  next();
}, createCustomerFollowUpHandler({
  addFollowUp: async () => ({
    code: 409,
    data: null,
    message: '客户记录已更新，请刷新后重试',
  }),
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');

try {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/customers/customer-1/follow-ups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: '跟进记录' }),
  });
  assert.equal(response.status, 409, '客户写冲突必须保留 HTTP 409');
  assert.deepEqual(await response.json(), {
    code: 409,
    data: null,
    message: '客户记录已更新，请刷新后重试',
  });
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
