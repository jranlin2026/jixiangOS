import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import express from 'express';
import { createCustomerBatchRouter } from './customerBatchRoutes';

const serverSource = readFileSync(join(process.cwd(), 'server/index.ts'), 'utf8');
assert.match(serverSource, /app\.use\('\/api\/customer-batch-jobs'/, '批量任务路由必须挂载到正式 API 前缀');
assert.match(serverSource, /requireCustomerBatchManageAccess/, '预检和确认必须有批量管理网关');
assert.match(serverSource, /requireCustomerBatchReadAccess/, '查看任务必须有审计或管理网关');
assert.match(serverSource, /requireAuthenticated:\s*requireStorageAccess/, '取消任务必须先经过登录认证，随后由服务按创建者或当前范围判定');

const calls: Array<{ method: string; input?: unknown; context?: unknown; id?: string }> = [];
const gateCalls: string[] = [];

const access = {
  actorId: 'u-1',
  actorName: '批量管理员',
  readableUserIds: new Set(['u-1']),
  legacyReadableNames: new Set(['批量管理员']),
  manageableOwnerIds: new Set(['u-1']),
  canReadPublicPool: false,
  canReadCustomerList: true,
  grantedPermissions: new Set(['客户/批量管理']),
};

const service = {
  precheckCustomerBatch: async (input: unknown, context: unknown) => {
    calls.push({ method: 'precheck', input, context });
    return {
      confirmationToken: 'opaque-token',
      expiresAt: '2026-07-18T01:00:00.000Z',
      totalCount: 1,
      executionMode: 'background' as const,
      selectionHash: 'a'.repeat(64),
      inputHash: 'b'.repeat(64),
      itemResults: [{ customerId: 'customer-1', status: 'ready' as const, reason: '可执行' }],
    };
  },
  createCustomerBatchJob: async (input: unknown, context: unknown) => {
    calls.push({ method: 'create', input, context });
    return {
      id: 'job-1', handlerKey: 'customer_mutation', operation: 'transfer' as const,
      status: 'queued' as const, selectionMode: 'ids' as const, frozenCustomerCount: 1,
      totalCount: 1, successCount: 0, failedCount: 0, skippedCount: 0, cancelledCount: 0,
      createdAt: '2026-07-18T00:00:00.000Z',
    };
  },
  listCustomerBatchJobs: async (context: unknown) => {
    calls.push({ method: 'list', context });
    return [];
  },
  getCustomerBatchJob: async (id: string, context: unknown) => {
    calls.push({ method: 'get', id, context });
    return null;
  },
  listCustomerBatchJobItems: async (id: string, context: unknown) => {
    calls.push({ method: 'items', id, context });
    return [];
  },
  requestCustomerBatchCancellation: async (id: string, context: unknown) => {
    calls.push({ method: 'cancel', id, context });
    if (id === 'forbidden') throw Object.assign(new Error('当前无权取消其他人的批量任务'), { statusCode: 403 });
    return {
      id, handlerKey: 'customer_mutation', operation: 'transfer' as const,
      status: 'cancel_requested' as const, selectionMode: 'ids' as const, frozenCustomerCount: 1,
      totalCount: 1, successCount: 0, failedCount: 0, skippedCount: 0, cancelledCount: 0,
      createdAt: '2026-07-18T00:00:00.000Z',
    };
  },
};

const gate = (name: string): express.RequestHandler => (request, _response, next) => {
  gateCalls.push(name);
  (request as any).currentUser = { id: 'u-1', name: '会话中的旧用户名' };
  next();
};

const app = express();
app.use(express.json());
app.use('/api/customer-batch-jobs', createCustomerBatchRouter({
  service,
  loadCurrentAccess: async () => access,
  requireManage: gate('manage'),
  requireRead: gate('read'),
  requireAuthenticated: gate('authenticated'),
}));
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address() as AddressInfo;
const root = `http://127.0.0.1:${address.port}/api/customer-batch-jobs`;

const validPrecheck = {
  operation: 'transfer',
  selection: { mode: 'ids', customerIds: ['customer-1'] },
  input: { targetOwnerId: 'u-2' },
  reason: '团队调整',
};

try {
  const precheck = await fetch(`${root}/precheck`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validPrecheck),
  });
  assert.equal(precheck.status, 200);
  assert.equal((await precheck.json()).data.confirmationToken, 'opaque-token');
  assert.deepEqual(calls[0]?.input, { ...validPrecheck, handlerKey: 'customer_mutation' }, '路由必须注入固定处理器');
  assert.equal(calls[0]?.context, access, '每次请求必须使用服务器新加载的访问上下文');

  for (const forbiddenKey of ['handlerKey', 'totalCount', 'selectionHash', 'inputHash', 'versionManifest', 'guardManifest', 'frozenCustomerIds']) {
    const rejected = await fetch(`${root}/precheck`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validPrecheck, [forbiddenKey]: forbiddenKey === 'handlerKey' ? 'other_handler' : 'forged' }),
    });
    assert.equal(rejected.status, 400, `${forbiddenKey} 不能由浏览器提交`);
    assert.match(String((await rejected.json()).message), /批量预检请求/);
  }
  assert.equal(calls.filter((call) => call.method === 'precheck').length, 1, '拒绝的请求不能触发预检服务');

  const create = await fetch(root, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ precheckToken: 'opaque-token', idempotencyKey: 'click-1' }),
  });
  assert.equal(create.status, 201);
  assert.deepEqual(calls.find((call) => call.method === 'create')?.input, {
    precheckToken: 'opaque-token', idempotencyKey: 'click-1',
  });

  const forgedConfirm = await fetch(root, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ precheckToken: 'opaque-token', idempotencyKey: 'click-2', operation: 'soft_delete' }),
  });
  assert.equal(forgedConfirm.status, 400, '确认请求只能携带令牌和幂等键');
  assert.equal(calls.filter((call) => call.method === 'create').length, 1);

  for (const [path, expectedGate, expectedMethod] of [
    ['', 'read', 'list'],
    ['/job-1', 'read', 'get'],
    ['/job-1/items', 'read', 'items'],
  ] as const) {
    const response = await fetch(`${root}${path}`);
    assert.equal(response.status, path === '/job-1' ? 404 : 200, path || '/');
    assert.equal(calls[calls.length - 1]?.method, expectedMethod);
    assert.equal(gateCalls[gateCalls.length - 1], expectedGate);
  }

  const cancellation = await fetch(`${root}/job-1/cancel`, { method: 'POST' });
  assert.equal(cancellation.status, 200);
  assert.equal(calls[calls.length - 1]?.method, 'cancel');
  assert.equal(gateCalls[gateCalls.length - 1], 'authenticated');

  const forgedCancel = await fetch(`${root}/job-1/cancel`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ force: true }),
  });
  assert.equal(forgedCancel.status, 400, '取消请求不能携带伪造参数');

  const invalidId = await fetch(`${root}/bad%2Fid/cancel`, { method: 'POST' });
  assert.equal(invalidId.status, 400, '路由参数不能通过编码字符伪造任务 ID');

  const denied = await fetch(`${root}/forbidden/cancel`, { method: 'POST' });
  assert.equal(denied.status, 403, '动态取消权限拒绝必须返回 403，而不是预检冲突');
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

console.log('customer batch route tests passed');
