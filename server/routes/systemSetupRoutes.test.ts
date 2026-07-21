import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createSystemSetupRouter } from './systemSetupRoutes';

const serverSource = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
assert.match(serverSource, /app\.use\('\/api\/system\/setup'/, '初始化路由必须挂载到正式服务');

const calls: any[] = [];
let active = false;
const service = {
  status: async () => ({
    code: 0,
    data: {
      state: active ? 'ACTIVE' : 'UNINITIALIZED',
      initialized: active,
      setupAvailable: !active,
      setupVersion: 1,
      companyName: active ? '新企业' : null,
    },
    message: 'success',
  }),
  initialize: async (input: any) => {
    calls.push(input);
    if (input.setupToken !== 'correct') return { code: 401, data: null, message: '初始化码不正确' };
    active = true;
    return {
      code: 0,
      data: { state: 'ACTIVE', initialized: true, setupAvailable: false, setupVersion: 1, companyName: input.companyName },
      message: 'success',
    };
  },
} as any;

const app = express();
app.use(express.json());
app.use('/api/system/setup', createSystemSetupRouter({ service }));
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address() as AddressInfo;
const root = `http://127.0.0.1:${address.port}/api/system/setup`;

try {
  const status = await fetch(`${root}/status`);
  assert.equal(status.status, 200);
  assert.equal((await status.json()).data.state, 'UNINITIALIZED');

  const denied = await fetch(`${root}/initialize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setupToken: 'wrong' }),
  });
  assert.equal(denied.status, 401);

  const invalidDemoFlag = await fetch(`${root}/initialize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ setupToken: 'correct', includeDemoData: 'false' }),
  });
  assert.equal(invalidDemoFlag.status, 400);
  assert.equal((await invalidDemoFlag.json()).message, '演示数据开关必须是布尔值');
  assert.equal(calls.length, 1, '非法演示数据开关不能进入初始化服务');

  const initialized = await fetch(`${root}/initialize`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      setupToken: 'correct', companyName: '新企业', adminName: '管理员', adminAccount: 'admin',
      adminEmail: 'admin@example.com', adminPhone: '', adminPassword: 'Strong-password-2026',
      organizationTemplate: 'minimal', includeDemoData: false,
    }),
  });
  assert.equal(initialized.status, 200);
  assert.equal((await initialized.json()).data.state, 'ACTIVE');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], {
    setupToken: 'correct', companyName: '新企业', adminName: '管理员', adminAccount: 'admin',
    adminEmail: 'admin@example.com', adminPhone: '', adminPassword: 'Strong-password-2026',
    organizationTemplate: 'minimal', includeDemoData: false,
  });
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

console.log('system setup route tests passed');
