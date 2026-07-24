import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createBusinessExportRouter } from './businessExportRoutes';

const calls: any[] = [];
const app = express();
app.use(express.json());
app.use('/api/business-exports', createBusinessExportRouter({
  service: {
    export: async (input: unknown, actor: unknown) => {
      if ((input as any).module === 'recovery_settlements') throw new Error('database password leaked');
      calls.push({ input, actor });
      return { code: 0, data: {
        filename: 'orders.xlsx', summaryRows: [], detailRows: [], sheetNames: ['汇总', '明细'], summaryColumns: [], detailColumns: [],
        audit: { module: 'orders', reason: '月度对账', summaryRowCount: 0, detailRowCount: 0, createdAt: '2026-07-24T00:00:00.000Z' },
      }, message: 'success' };
    },
  },
  requireAuthenticated: (request, _response, next) => { (request as any).currentUser = { id: 'user-1' }; next(); },
}));
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address() as AddressInfo;
const root = `http://127.0.0.1:${address.port}/api/business-exports`;

try {
  const response = await fetch(`http://127.0.0.1:${address.port}/api/business-exports/orders`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: '月度对账', filters: { status: '已确认' }, columnMode: 'current_view', columnIds: ['orderNo'] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(calls[0], {
    input: { module: 'orders', reason: '月度对账', filters: { status: '已确认' }, columnMode: 'current_view', columnIds: ['orderNo'] },
    actor: { id: 'user-1' },
  });

  const invalid = await fetch(`http://127.0.0.1:${address.port}/api/business-exports/orders`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: '月度对账', filters: {}, columnMode: 'current_view', columnIds: ['orderNo'], filename: 'untrusted.xlsx' }),
  });
  assert.equal(invalid.status, 400, '浏览器不得指定文件名或服务端模块以外字段');

  const failed = await fetch(`${root}/recovery_settlements`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ reason: '异常检查', filters: {}, columnMode: 'all' }),
  });
  assert.equal(failed.status, 500);
  assert.deepEqual(await failed.json(), { code: 500, data: null, message: '业务导出服务暂时不可用' }, '路由异常必须统一脱敏为 JSON 500');
} finally {
  listener.close();
  await once(listener, 'close');
}
