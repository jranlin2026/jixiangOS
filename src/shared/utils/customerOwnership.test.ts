import assert from 'node:assert/strict';
import { hydrateCustomerFirstSalesOwner, resolveFirstSalesOwner } from './customerOwnership';

const base = {
  originalSalesTransferBy: undefined,
  previousOwner: undefined,
  owner: '销售甲',
  ownerIdentityStatus: 'resolved' as const,
  lifecycleStatusCode: 'following' as const,
  activityRecords: [],
};

assert.equal(resolveFirstSalesOwner(base), '销售甲');
assert.equal(resolveFirstSalesOwner({
  ...base,
  owner: '公海',
  ownerIdentityStatus: 'public_pool',
  lifecycleStatusCode: 'public_pool',
  previousOwner: '销售乙',
}), '销售乙');
assert.equal(resolveFirstSalesOwner({
  ...base,
  owner: '公海',
  ownerIdentityStatus: 'public_pool',
  lifecycleStatusCode: 'public_pool',
}, '销售丙'), '销售丙');
assert.equal(resolveFirstSalesOwner({
  ...base,
  owner: '销售丙',
  previousOwner: '销售乙',
  activityRecords: [{
    id: 'a1', type: 'transfer' as const, title: '转让客户', operator: '主管', createdAt: '2026-01-01T00:00:00.000Z',
    changes: [{ field: 'owner', label: '销售负责人', oldValue: '销售甲', newValue: '销售乙' }],
  }],
}), '销售甲');
assert.equal(hydrateCustomerFirstSalesOwner(base as any).originalSalesTransferBy, '销售甲');
