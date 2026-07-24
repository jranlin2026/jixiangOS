import assert from 'node:assert/strict';
import express from 'express';
import { createBusinessImportRouter } from './businessImportRoutes';
import { BusinessImportError } from '../services/businessImportService';

const calls: string[] = [];
const app = express();
app.use(express.json());
app.use('/api/business-imports', createBusinessImportRouter({
  requireAuthenticated: (request: any, _response, next) => { request.currentUser = { id: 'u1', name: '导入员', isActive: true, permissions: [] }; next(); },
  requireOrderImport: (request: any, _response, next) => { request.currentUser = { id: 'u1', name: '导入员', isActive: true, permissions: [] }; next(); },
  requireRecoveryImport: (request: any, _response, next) => { request.currentUser = { id: 'u1', name: '导入员', isActive: true, permissions: [] }; next(); },
  service: {
    templateOptions: async (type: string) => { calls.push(`template:${type}`); return { products: [] }; },
    precheck: async (input: any) => { calls.push(`precheck:${input.type}:${input.rows[0]?.customerPhone}`); return { readyCount: input.rows.length }; },
    confirm: async (input: any) => {
      if (input.confirmationToken === 'invalid') throw new BusinessImportError('导入预检凭证无效或已过期', 409);
      calls.push(`confirm:${input.type}:${input.confirmationToken}`); return { id: 'job-1', batchId: 'batch-1', status: 'queued' };
    },
  },
  readService: {
    getJob: async (id) => id === 'job-1' ? { id, type: 'orders', status: 'succeeded' } : null,
    getBatch: async (id) => id === 'batch-1' ? { id, type: 'recovery_orders', status: 'partial_failed' } : null,
  },
  reviewService: {
    review: async (input) => { calls.push(`review:${input.module}:${input.action}`); return { totalCount: 2, successCount: 1, failedCount: 1, results: [] }; },
  },
}));

const server = app.listen(0);
const address = server.address();
if (!address || typeof address === 'string') throw new Error('server failed');
const base = `http://127.0.0.1:${address.port}/api/business-imports`;

try {
  assert.equal((await fetch(`${base}/orders/template-options`)).status, 200);
  const row = { rowNumber: 2, customerPhone: '13800000000', customerWechat: '', productName: '训练营', orderType: '新购', paymentChannel: '企业微信转账', paymentAmount: '1999', paidAt: '2026-07-23', salesUserName: '销售甲', thirdPartyOrderNo: 'TP-1', remark: '' };
  const recoveryRow = { rowNumber: 2, customerName: '客户甲', customerPhone: '13800000000', customerWechat: '', originalProduct: '训练营', sourcePlatform: '抖音', sourceShop: '旗舰店', paymentChannel: '对公银行转账', originalAmount: '1999', recoveryAmount: '299', recoveryAt: '2026-07-23', paymentOrderNo: '', paymentAt: '', recoveryUserName: '销售甲', assistUserName: '', creatorName: '', thirdPartyOrderNo: 'RCV-1', remark: '' };
  assert.equal((await fetch(`${base}/orders/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row] }) })).status, 200);
  const confirmedResponse = await fetch(`${base}/orders/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row], confirmationToken: 'one-time', fileName: 'orders.xlsx' }) });
  assert.equal(confirmedResponse.status, 201);
  assert.equal((await confirmedResponse.json() as any).data.batchId, 'batch-1');
  assert.equal((await fetch(`${base}/recovery-orders/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [recoveryRow] }) })).status, 200);
  assert.equal((await fetch(`${base}/orders/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [{ ...row, sourcePlatform: '跨模块' }] }) })).status, 400, 'order rows reject recovery-only fields');
  assert.equal((await fetch(`${base}/recovery-orders/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [{ ...recoveryRow, productName: '跨模块' }] }) })).status, 400, 'recovery rows reject order-only fields');
  assert.equal((await fetch(`${base}/orders/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [{ ...row, unexpected: 'secret' }] }) })).status, 400, 'unknown row fields are rejected rather than dropped');
  const invalidConfirm = await fetch(`${base}/orders/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row], confirmationToken: 'invalid', fileName: 'orders.xlsx' }) });
  assert.equal(invalidConfirm.status, 409, 'precheck conflicts are returned as JSON conflicts rather than generic 500 errors');
  const bad = await fetch(`${base}/orders/precheck`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ rows: [row], type: 'recovery_orders' }) });
  assert.equal(bad.status, 400, 'the public route owns the module discriminator');
  assert.equal((await fetch(`${base}/jobs/job-1`)).status, 200);
  assert.equal((await fetch(`${base}/jobs/missing`)).status, 404);
  assert.equal((await fetch(`${base}/batches/batch-1`)).status, 200);
  const review = await fetch(`${base}/reviews`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ module: 'orders', action: 'approve', importBatchId: 'batch-1' }) });
  assert.equal(review.status, 200);
  const reviewBody = await review.json() as any;
  assert.equal(reviewBody.data.failedCount, 1);
  assert.deepEqual(calls, ['template:orders', 'precheck:orders:13800000000', 'confirm:orders:one-time', 'precheck:recovery_orders:13800000000', 'review:orders:approve']);
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

console.log('business import routes: ok');
