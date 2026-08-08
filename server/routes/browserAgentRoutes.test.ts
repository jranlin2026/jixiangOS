import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import express from 'express';
import { createBrowserAgentRouter } from './browserAgentRoutes';

assert.match(readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8'), /app\.use\('\/api\/browser-agent'/);

const calls: any[] = [];
const service = {
  async intake(input: any, actor: any) {
    calls.push({ method: 'intake', input, actor });
    return {
      code: 0,
      data: {
        syncId: 'sync-1', outcome: 'CREATED', orderRemarkStatus: 'NOT_ATTEMPTED',
        lead: { id: 'lead-1', name: input.contactName, assignedTo: '销售小王' },
      },
      message: 'success',
    };
  },
  async reportOrderRemark(syncId: string, input: any, actor: any) {
    calls.push({ method: 'remark', syncId, input, actor });
    return { code: 0, data: { syncId, orderRemarkStatus: input.status }, message: 'success' };
  },
} as any;
const scriptLibrary = {
  async get(actor: any) {
    calls.push({ method: 'script-library:get', actor });
    return {
      code: 0,
      data: { library: { schemaVersion: 1, revision: 1, groups: [] }, canManage: false },
      message: 'success',
    };
  },
  async update(input: any, actor: any) {
    calls.push({ method: 'script-library:update', input, actor });
    return {
      code: 0,
      data: { library: { ...input, revision: input.revision + 1 }, canManage: true },
      message: 'success',
    };
  },
} as any;

const authenticate: express.RequestHandler = (req: any, _res, next) => {
  req.currentUser = { id: 'user-1', name: '客服小李' };
  next();
};
const requireLeadCreate: express.RequestHandler = (req: any, res, next) => {
  authenticate(req, res, () => {
    if (req.headers['x-test-no-lead-create']) {
      res.status(403).json({ code: 403, data: null, message: 'Forbidden' });
      return;
    }
    next();
  });
};
const app = express();
app.use(express.json());
app.use('/api/browser-agent', createBrowserAgentRouter({
  service, scriptLibrary, requireAuthenticated: authenticate, requireLeadCreate,
}));
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address() as AddressInfo;

try {
  const intake = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/lead-intakes`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      platform: 'DOUYIN', shopKey: 'shop-1', platformOrderNo: 'order-1',
      contactName: '张先生', contactPhone: '13800138000', contactSource: 'CHAT',
    }),
  });
  assert.equal(intake.status, 201);
  assert.equal((await intake.json()).data.lead.id, 'lead-1');

  const remark = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/lead-intakes/sync-1/order-remark`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status: 'SUCCEEDED' }),
  });
  assert.equal(remark.status, 200);
  assert.equal((await remark.json()).data.orderRemarkStatus, 'SUCCEEDED');

  const library = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/script-library`);
  assert.equal(library.status, 200);
  assert.equal((await library.json()).data.library.revision, 1);

  const updateLibrary = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/script-library`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, revision: 1, groups: [] }),
  });
  assert.equal(updateLibrary.status, 200);
  assert.equal((await updateLibrary.json()).data.library.revision, 2);

  const customerServiceLibrary = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/script-library`, {
    headers: { 'x-test-no-lead-create': '1' },
  });
  assert.equal(customerServiceLibrary.status, 200, '已登录客服不应因没有线索录入权限而无法读取话术');

  const deniedIntake = await fetch(`http://127.0.0.1:${address.port}/api/browser-agent/lead-intakes`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-test-no-lead-create': '1' },
    body: JSON.stringify({}),
  });
  assert.equal(deniedIntake.status, 403, '线索入库仍必须校验线索录入权限');
  assert.deepEqual(calls.map((call) => call.method), [
    'intake', 'remark', 'script-library:get', 'script-library:update', 'script-library:get',
  ]);
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

console.log('browser agent routes: ok');
