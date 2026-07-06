import assert from 'node:assert/strict';
import { createRequireAuth } from './auth';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';

let nextCalled = false;
const next = () => {
  nextCalled = true;
};

function createResponse() {
  return {
    statusCode: 200,
    body: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

const activeUser = {
  id: 'user-admin',
  name: 'Admin',
  account: 'admin',
  email: 'admin@company.com',
  phone: '',
  role: 'Super Admin' as any,
  permissions: [{ module: '全部', actions: ['admin'] }],
  isActive: true,
};

let middleware = createRequireAuth({
  getCurrentUser: async () => ({ code: 0, data: null, message: 'success' }),
});
let response = createResponse();
nextCalled = false;
await middleware({ headers: {} } as any, response as any, next as any);
assert.equal(response.statusCode, 401);
assert.equal(nextCalled, false);

middleware = createRequireAuth({
  getCurrentUser: async () => ({ code: 0, data: { ...activeUser, permissions: [] }, message: 'success' }),
}, PERMISSION_KEYS.SETTINGS_ROLES);
response = createResponse();
nextCalled = false;
await middleware({ headers: { authorization: 'Bearer token' } } as any, response as any, next as any);
assert.equal(response.statusCode, 403);
assert.equal(nextCalled, false);

middleware = createRequireAuth({
  getCurrentUser: async () => ({ code: 0, data: activeUser, message: 'success' }),
}, PERMISSION_KEYS.SETTINGS_ROLES);
response = createResponse();
const request = { headers: { authorization: 'Bearer token' } } as any;
nextCalled = false;
await middleware(request, response as any, next as any);
assert.equal(response.statusCode, 200);
assert.equal(request.currentUser.account, 'admin');
assert.equal(nextCalled, true);
