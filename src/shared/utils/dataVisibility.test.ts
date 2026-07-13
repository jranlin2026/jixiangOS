import assert from 'node:assert/strict';
import { canViewCustomer, type DataVisibilityScope } from './dataVisibility';

const scope: DataVisibilityScope = {
  unrestricted: false,
  dataScopeLevel: 'self',
  visibleUserIds: ['employee-a'],
  visibleUserNames: ['同名销售'],
  canViewPublicPool: false,
};

assert.equal(canViewCustomer({ owner: '同名销售', ownerId: 'employee-a' }, scope), true);
assert.equal(canViewCustomer({ owner: '同名销售', ownerId: 'employee-b' }, scope), false);
assert.equal(canViewCustomer({ owner: '同名销售', ownerIdentityStatus: 'ambiguous' }, scope), false);
assert.equal(canViewCustomer({ owner: '同名销售' }, scope), true, 'untouched legacy rows keep a one-release fallback');
