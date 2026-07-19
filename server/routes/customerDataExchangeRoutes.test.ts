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
    precheckImport: async (rows) => { calls.push(`precheck:${rows.length}`); return { readyCount: rows.length }; },
    confirmImport: async ({ rows }) => { calls.push(`confirm:${rows.length}`); return { successCount: rows.length }; },
    exportCustomers: async (input) => { calls.push(`export:${input.selection.mode}`); return { rows: [] }; },
  },
}));

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server failed');
const base = `http://127.0.0.1:${address.port}/api/customer-data-exchange`;

try {
  const row = { rowNumber: 2, name: '张三', phone: '13800000000' };
  const precheck = await fetch(`${base}/import/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row] }) });
  assert.equal(precheck.status, 200);
  const confirm = await fetch(`${base}/import/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row], confirmationToken: 'token' }) });
  assert.equal(confirm.status, 201);
  const exported = await fetch(`${base}/export`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ selection: { mode: 'ids', customerIds: ['c1'] }, includeSensitive: false, reason: '备份' }) });
  assert.equal(exported.status, 200);
  assert.deepEqual(calls, ['precheck:1', 'confirm:1', 'export:ids']);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log('customer data exchange routes: ok');
