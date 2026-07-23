import assert from 'node:assert/strict';
import express from 'express';
import { createCustomerDataExchangeRouter } from './customerDataExchangeRoutes';

const calls: string[] = [];
const app = express();
app.use(express.json());
const auth: express.RequestHandler = (request, _response, next) => {
  (request as any).currentUser = { id: 'u1', name: '管理员', account: 'admin', permissions: [], isActive: true };
  next();
};
app.use('/api/customer-data-exchange', createCustomerDataExchangeRouter({
  requireImport: auth,
  requireExport: auth,
  service: {
    templateOptions: async () => ({ ownerNames: [] }),
    precheckImport: async (rows, destination) => { calls.push(`precheck:${destination}:${rows[0]?.previousOwnerName}:${rows[0]?.firstOwnerName}:${rows[0]?.leadInputByName}:${rows[0]?.leadContributorName}:${rows[0]?.lastFollowUpRecord}:${rows[0]?.remark}`); return { readyCount: rows.length }; },
    confirmImport: async ({ rows, destination }) => { calls.push(`confirm:${destination}:${rows[0]?.previousOwnerName}:${rows[0]?.firstOwnerName}:${rows[0]?.leadInputByName}:${rows[0]?.leadContributorName}:${rows[0]?.lastFollowUpRecord}:${rows[0]?.remark}`); return { successCount: rows.length }; },
    exportCustomers: async (input) => { calls.push(`export:${input.selection.mode}`); return { rows: [] }; },
  },
}));

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server failed');
const base = `http://127.0.0.1:${address.port}/api/customer-data-exchange`;

try {
  const row = {
    rowNumber: 2, name: '张三', phone: '13800000000', previousOwnerName: '销售乙', firstOwnerName: '销售甲',
    leadInputByName: '录入乙', leadContributorName: '贡献丙', lastFollowUpRecord: '已确认报价', remark: '重点客户',
  };
  const precheck = await fetch(`${base}/import/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row], destination: 'public_pool' }) });
  assert.equal(precheck.status, 200);
  const confirm = await fetch(`${base}/import/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row], destination: 'public_pool', confirmationToken: 'token' }) });
  assert.equal(confirm.status, 201);
  const exported = await fetch(`${base}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selection: { mode: 'ids', customerIds: ['c1'] }, includeSensitive: false, reason: '备份' }) });
  assert.equal(exported.status, 200);
  assert.deepEqual(calls, [
    'precheck:public_pool:销售乙:销售甲:录入乙:贡献丙:已确认报价:重点客户',
    'confirm:public_pool:销售乙:销售甲:录入乙:贡献丙:已确认报价:重点客户',
    'export:ids',
  ]);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log('customer data exchange routes: ok');
