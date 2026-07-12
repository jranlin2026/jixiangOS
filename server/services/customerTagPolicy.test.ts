import assert from 'node:assert/strict';
import type { CustomerTagCatalog } from '../../src/types/tag';
import {
  groupTagIdsForFilter,
  inheritableCustomerTagIds,
  normalizeManualTagIds,
  validateManualTagSelection,
} from './customerTagPolicy';

const catalog: CustomerTagCatalog = {
  groups: [
    { id: 'g-intent', name: '意向', color: '#16a34a', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 1, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 'g-contact', name: '联系状态', color: '#ef4444', selectionMode: 'single', scope: 'lead', isActive: true, sortOrder: 2, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
  ],
  tags: [
    { id: 't-agent', groupId: 'g-intent', name: '代理意向', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 't-private', groupId: 'g-intent', name: '贴牌意向', isActive: true, sortOrder: 2, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 't-no-phone', groupId: 'g-contact', name: '无法接通', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 't-no-wechat', groupId: 'g-contact', name: '微信搜不到', isActive: true, sortOrder: 2, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
  ],
};

assert.deepEqual(normalizeManualTagIds([' t-agent ', 't-agent', 't-private']), ['t-agent', 't-private']);
assert.equal(validateManualTagSelection(catalog, 'customer', ['t-agent']).ok, true);
assert.equal(validateManualTagSelection(catalog, 'customer', ['t-no-phone']).ok, false);
assert.equal(validateManualTagSelection(catalog, 'lead', ['t-no-phone', 't-no-wechat']).ok, false);
assert.deepEqual(inheritableCustomerTagIds(catalog, ['t-agent', 't-no-phone']), ['t-agent']);
assert.deepEqual(groupTagIdsForFilter(catalog, ['t-agent', 't-private']), [['t-agent', 't-private']]);
