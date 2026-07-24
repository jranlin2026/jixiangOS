import assert from 'node:assert/strict';
import express from 'express';
import { createBusinessImportRouter } from './businessImportRoutes';

const calls: string[] = [];
const app = express();
app.use(express.json());
app.use('/api/business-imports', createBusinessImportRouter({
  requireOrderImport: (request: any, _response, next) => { request.currentUser = { id: 'u1', name: '导入员', isActive: true, permissions: [] }; next(); },
  requireRecoveryImport: (request: any, _response, next) => { request.currentUser = { id: 'u1', name: '导入员', isActive: true, permissions: [] }; next(); },
  service: {
    templateOptions: async (type: string) => { calls.push(`template:${type}`); return { products: [] }; },
    precheck: async (input: any) => { calls.push(`precheck:${input.type}:${input.rows[0]?.customerPhone}`); return { readyCount: input.rows.length }; },
    confirm: async (input: any) => { calls.push(`confirm:${input.type}:${input.confirmationToken}`); return { id: 'job-1', status: 'queued' }; },
  },
}));

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server failed');
const base = `http://127.0.0.1:${address.port}/api/business-imports`;

try {
  assert.equal((await fetch(`${base}/orders/template-options`)).status, 200);
  const row = { rowNumber: 2, customerPhone: '13800000000', customerWechat: '', productName: '训练营', orderType: '新购', paymentChannel: '企业微信转账', paymentAmount: '1999', paidAt: '2026-07-23', salesUserName: '销售甲', thirdPartyOrderNo: 'TP-1', remark: '' };
  assert.equal((await fetch(`${base}/orders/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row] }) })).status, 200);
  assert.equal((await fetch(`${base}/orders/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row], confirmationToken: 'one-time', fileName: 'orders.xlsx' }) })).status, 201);
  assert.equal((await fetch(`${base}/recovery-orders/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row] }) })).status, 200);
  const bad = await fetch(`${base}/orders/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row], type: 'recovery_orders' }) });
  assert.equal(bad.status, 400, 'the public route owns the module discriminator');
  assert.deepEqual(calls, ['template:orders', 'precheck:orders:13800000000', 'confirm:orders:one-time', 'precheck:recovery_orders:13800000000']);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log('business import routes: ok');
