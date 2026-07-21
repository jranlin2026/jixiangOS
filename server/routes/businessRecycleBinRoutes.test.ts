import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { createRequireAuth } from '../middleware/auth';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { createBusinessRecycleBinRouter } from './businessRecycleBinRoutes';

const source = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
assert.match(source, /app\.use\('\/api\/business-recycle-bin', createBusinessRecycleBinRouter/);

let receivedUserId = '';
const service = {
  list: async (_filters: unknown, currentUser: any) => {
    receivedUserId = currentUser?.id || '';
    return {
      code: 0,
      data: { items: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
      message: 'success',
    };
  },
};
const auth = createRequireAuth({
  getCurrentUser: async (token) => ({
    code: 0,
    data: token ? {
      id: token, name: token, account: token, role: token === 'admin' ? '超级管理员' : '销售顾问',
      permissions: token === 'admin'
        ? [{ module: PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE, actions: ['read'] }]
        : [],
      isActive: true,
    } as any : null,
    message: 'success',
  }),
}, PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE, 'read');

const app = express();
app.use('/api/business-recycle-bin', createBusinessRecycleBinRouter({ service, requireRead: auth }));
const listener = app.listen(0, '127.0.0.1');
await once(listener, 'listening');
const address = listener.address() as AddressInfo;
const url = `http://127.0.0.1:${address.port}/api/business-recycle-bin`;

try {
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { authorization: 'Bearer sales' } })).status, 403);
  const allowed = await fetch(url, { headers: { authorization: 'Bearer admin' } });
  assert.equal(allowed.status, 200);
  assert.equal(receivedUserId, 'admin', '服务器当前会话用户必须传给回收站服务');
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

console.log('business recycle bin route tests passed');
