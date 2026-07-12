import assert from 'node:assert/strict';
import express from 'express';
import { createCustomerTagRouter } from './services/customerTagService';

const app = express();
app.use(express.json());
const user = { id: 'admin', name: '管理员' };
const requirePermission = (permission: 'customer' | 'lead' | 'settings'): express.RequestHandler => (req, res, next) => {
  if (req.header('x-permission') !== permission) { res.status(403).json({ code: 403 }); return; }
  (req as any).currentUser = user;
  next();
};
const requireManage: express.RequestHandler = (req, res, next) => {
  (req as any).currentUser = req.header('x-user') === 'sales' ? { id: 'sales', name: '销售' } : user;
  next();
};
const service = {
  loadCatalog: async () => ({ groups: [{ id: 'g1', scope: 'both', isActive: true, sortOrder: 0 }, { id: 'g-lead', scope: 'lead', isActive: true, sortOrder: 1 }], tags: [{ id: 't1', groupId: 'g1', isActive: true, sortOrder: 0 }, { id: 't-lead', groupId: 'g-lead', isActive: true, sortOrder: 0 }] }),
  createGroup: async (body: any, currentUser: any) => currentUser.id === 'sales'
    ? { code: 403, data: null, message: 'forbidden' }
    : body.name === 'duplicate' ? { code: 409, data: null, message: 'duplicate' }
      : body.name === 'busy' ? { code: 503, data: null, message: 'busy' }
        : { code: 0, data: { id: 'g2' }, message: 'success' },
  updateGroup: async (id: string) => id === 'missing' ? { code: 404, data: null, message: 'missing' } : { code: 0, data: { id }, message: 'success' },
  createTag: async () => ({ code: 0, data: { id: 't2' }, message: 'success' }),
  updateTag: async (id: string) => id === 'duplicate' ? { code: 409, data: null, message: 'duplicate' } : { code: 0, data: { id }, message: 'success' },
  mergeTag: async () => ({ code: 0, data: {}, message: 'success' }),
  reorderTags: async () => ({ code: 0, data: {}, message: 'success' }),
};
app.use('/api/customer-tags', createCustomerTagRouter({
  service: service as any,
  requireCustomerRead: requirePermission('customer'),
  requireLeadRead: requirePermission('lead'),
  requireSettingsRead: requirePermission('settings'),
  requireManage,
}));

const server = app.listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
const address = server.address();
assert.ok(address && typeof address === 'object');
const base = `http://127.0.0.1:${address.port}/api/customer-tags`;
const request = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, {
  ...init,
  headers: { 'content-type': 'application/json', ...(init.headers || {}) },
});

try {
  assert.equal((await request('/catalog')).status, 403);
  const customerCatalog = await request('/catalog?scope=customer', { headers: { 'x-permission': 'customer' } });
  assert.equal(customerCatalog.status, 200);
  assert.equal((await customerCatalog.json()).data.groups.some((group: any) => group.scope === 'lead'), false, 'customer scope 不得泄露 lead-only 分组');
  assert.equal((await request('/catalog?scope=lead', { headers: { 'x-permission': 'lead' } })).status, 200);
  assert.equal((await request('/catalog?scope=all', { headers: { 'x-permission': 'customer' } })).status, 403);
  assert.equal((await request('/catalog?scope=all', { headers: { 'x-permission': 'lead' } })).status, 403);
  assert.equal((await request('/catalog?scope=customer&includeInactive=true', { headers: { 'x-permission': 'customer' } })).status, 403);
  assert.equal((await request('/catalog?scope=lead&includeInactive=true', { headers: { 'x-permission': 'lead' } })).status, 403);
  const allCatalog = await request('/catalog?scope=all&includeInactive=true', { headers: { 'x-permission': 'settings' } });
  assert.equal(allCatalog.status, 200);
  assert.equal((await allCatalog.json()).data.groups.some((group: any) => group.scope === 'lead'), true, '管理目录必须包含 lead-only 分组');
  assert.equal((await request('/groups', { method: 'POST', headers: { 'x-user': 'sales' }, body: JSON.stringify({ name: 'x' }) })).status, 403);
  assert.equal((await request('/groups', { method: 'POST', body: JSON.stringify({ name: 'new' }) })).status, 201);
  assert.equal((await request('/groups', { method: 'POST', body: JSON.stringify({ name: 'duplicate' }) })).status, 409);
  assert.equal((await request('/groups', { method: 'POST', body: JSON.stringify({ name: 'busy' }) })).status, 503);
  assert.equal((await request('/groups/missing', { method: 'PUT', body: '{}' })).status, 404);
  assert.equal((await request('/duplicate', { method: 'PUT', body: '{}' })).status, 409);
  assert.equal((await request('/source/merge', { method: 'POST', body: JSON.stringify({ targetId: 'target' }) })).status, 200);
  assert.equal((await request('/groups/g1/reorder', { method: 'POST', body: JSON.stringify({ tagIds: ['t1'] }) })).status, 200);
} finally {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
