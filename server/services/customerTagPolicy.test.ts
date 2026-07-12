import assert from 'node:assert/strict';
import type { CustomerTagCatalog } from '../../src/types/tag';
import {
  groupTagIdsForFilter,
  inheritableCustomerTagIds,
  normalizeManualTagIds,
  resolveManualTagNames,
  validateManualTagSelection,
  validateManualTagUpdateSelection,
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
assert.deepEqual(validateManualTagUpdateSelection(inactiveCatalog, 'customer', ['t-inactive'], ['t-inactive']), { ok: true, tagIds: ['t-inactive'] });
assert.equal(validateManualTagUpdateSelection(inactiveCatalog, 'customer', ['t-inactive'], []).ok, false);
assert.equal(validateManualTagUpdateSelection(inactiveCatalog, 'customer', ['missing'], ['missing']).ok, false);
assert.deepEqual(validateManualTagUpdateSelection(inactiveCatalog, 'customer', ['t-active'], ['t-inactive']), { ok: true, tagIds: ['t-active'] });

const nameResolutionCatalog: CustomerTagCatalog = {
  groups: [
    { id: 'lead-a', name: '线索 A', color: '#1677ff', selectionMode: 'multiple', scope: 'lead', isActive: true, sortOrder: 1, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 'lead-b', name: '线索 B', color: '#1677ff', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 2, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 'customer', name: '客户', color: '#1677ff', selectionMode: 'multiple', scope: 'customer', isActive: true, sortOrder: 3, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 'inactive', name: '停用', color: '#1677ff', selectionMode: 'multiple', scope: 'lead', isActive: false, sortOrder: 4, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
  ],
  tags: [
    { id: 'eligible', groupId: 'lead-a', name: '同名唯一', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 'customer-shadow', groupId: 'customer', name: '同名唯一', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 'inactive-shadow', groupId: 'inactive', name: '同名唯一', isActive: true, sortOrder: 1, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 'ambiguous-a', groupId: 'lead-a', name: '重复有效', isActive: true, sortOrder: 2, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
    { id: 'ambiguous-b', groupId: 'lead-b', name: '重复有效', isActive: true, sortOrder: 2, usageCount: 0, createdAt: '2026-07-12', updatedAt: '2026-07-12' },
  ],
};
assert.deepEqual(resolveManualTagNames(nameResolutionCatalog, 'lead', ['同名唯一']), { ok: true, tagIds: ['eligible'] });
assert.deepEqual(
  resolveManualTagNames({ ...nameResolutionCatalog, tags: [...nameResolutionCatalog.tags].reverse() }, 'lead', ['同名唯一']),
  { ok: true, tagIds: ['eligible'] },
);
assert.deepEqual(resolveManualTagNames(nameResolutionCatalog, 'lead', ['重复有效']), {
  ok: false,
  message: '标签“重复有效”名称存在歧义，请使用唯一预设名称',
});
