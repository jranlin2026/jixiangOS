import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import { createRequireAnyPermission } from '../middleware/auth';
import {
  CUSTOMER_MANAGEABLE_USERS_PERMISSION_REQUIREMENTS,
  createCustomerManageableUsersHandler,
} from './customerManageableUsersRoutes';

assert.deepEqual(CUSTOMER_MANAGEABLE_USERS_PERMISSION_REQUIREMENTS, [
  { permissionKey: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_SET_TAGS, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_SET_TODOS, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_TRANSFER, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, action: 'write' },
  { permissionKey: PERMISSION_KEYS.CUSTOMER_DELETE, action: 'delete' },
]);

const app = express();
const auth = createRequireAnyPermission({
  getCurrentUser: async (token) => ({
    code: 0,
    data: {
      id: 'user-actor',
      name: '当前用户',
      account: 'actor',
      email: '',
      phone: '',
      role: '客户角色' as any,
      permissions: token === 'profile'
        ? [{ module: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, actions: ['write'] }]
        : [{ module: PERMISSION_KEYS.CUSTOMER_LIST, actions: ['read'] }],
      isActive: true,
    },
    message: 'success',
  }),
}, CUSTOMER_MANAGEABLE_USERS_PERMISSION_REQUIREMENTS);
app.get('/api/customers/manageable-users', auth, createCustomerManageableUsersHandler({
  list: async () => ({
    code: 0,
    data: [{ id: 'user-actor', name: '当前用户', positionName: '销售' }],
    message: 'success',
  }),
}));

const listener = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => listener.once('listening', resolve));
const address = listener.address() as AddressInfo;

try {
  const forbidden = await fetch(`http://127.0.0.1:${address.port}/api/customers/manageable-users`, {
    headers: { authorization: 'Bearer readonly' },
  });
  assert.equal(forbidden.status, 403, '没有任何客户 manage 叶子时专用目录必须拒绝');

  const allowed = await fetch(`http://127.0.0.1:${address.port}/api/customers/manageable-users`, {
    headers: { authorization: 'Bearer profile' },
  });
  assert.equal(allowed.status, 200, 'profile-only 写叶子必须可以打开客户专用目录');
  assert.deepEqual(await allowed.json(), {
    code: 0,
    data: [{ id: 'user-actor', name: '当前用户', positionName: '销售' }],
    message: 'success',
  });
} finally {
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
}

console.log('customer manageable users route tests passed');
