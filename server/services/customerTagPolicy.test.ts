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
assert.deepEqual(validateManualTagSelection(catalog, 'customer', ['t-agent', 't-private']), {
  ok: true,
  tagIds: ['t-agent', 't-private'],
});
assert.equal(validateManualTagSelection(catalog, 'customer', ['t-no-phone']).ok, false);
assert.equal(validateManualTagSelection(catalog, 'lead', ['t-no-phone', 't-no-wechat']).ok, false);
assert.deepEqual(validateManualTagSelection(catalog, 'customer', ['t-unknown']), {
  ok: false,
  message: '标签不存在或已停用',
});
assert.deepEqual(inheritableCustomerTagIds(catalog, ['t-agent', 't-no-phone']), ['t-agent']);
assert.deepEqual(groupTagIdsForFilter(catalog, ['t-agent', 't-private']), [['t-agent', 't-private']]);

const inheritedTagIds = Array.from({ length: 21 }, (_, index) => `t-inherited-${index + 1}`);
const inheritanceCatalog: CustomerTagCatalog = {
  groups: [
    { id: 'g-inherited', name: '可继承', color: '#2563eb', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 1, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
  ],
  tags: inheritedTagIds.map((id, index) => ({
    id,
    groupId: 'g-inherited',
    name: `可继承标签 ${index + 1}`,
    isActive: true,
    sortOrder: index + 1,
    usageCount: 0,
    createdAt: '2026-07-12',
    updatedAt: '2026-07-12',
  })),
};

assert.deepEqual(
  inheritableCustomerTagIds(inheritanceCatalog, inheritedTagIds),
  inheritedTagIds.slice(0, 20),
);
assert.equal(validateManualTagSelection(inheritanceCatalog, 'customer', inheritedTagIds.slice(0, 20)).ok, true);
assert.deepEqual(validateManualTagSelection(inheritanceCatalog, 'customer', inheritedTagIds), {
  ok: false,
  message: '每条记录最多选择 20 个标签',
});

const inactiveCatalog: CustomerTagCatalog = {
  groups: [
    { id: 'g-active', name: '启用分组', color: '#16a34a', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 1, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 'g-inactive', name: '停用分组', color: '#64748b', selectionMode: 'multiple', scope: 'both', isActive: false, sortOrder: 2, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
  ],
  tags: [
    { id: 't-active', groupId: 'g-active', name: '启用标签', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 't-inactive', groupId: 'g-active', name: '停用标签', isActive: false, sortOrder: 2, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 't-inactive-group', groupId: 'g-inactive', name: '停用分组中的标签', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
  ],
};

assert.deepEqual(
  inheritableCustomerTagIds(inactiveCatalog, ['t-inactive', 't-active', 't-inactive-group']),
  ['t-active'],
);
