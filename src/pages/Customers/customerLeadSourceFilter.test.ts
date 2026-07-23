import assert from 'node:assert/strict';
import { buildCustomerLeadSourceOptions, normalizeCustomerToolbarFilters } from './customerLeadSourceFilterModel';

const configs = [
  { id: 'parent-live', name: '直播', isActive: true, sortOrder: 2 },
  { id: 'child-douyin', name: '抖音', parentId: 'parent-live', isActive: true, sortOrder: 1 },
  { id: 'child-video', name: '视频号', parentId: 'parent-live', isActive: true, sortOrder: 2 },
  { id: 'parent-referral', name: '转介绍', isActive: true, sortOrder: 1 },
  { id: 'parent-disabled', name: '已停用', isActive: false, sortOrder: 0 },
  { id: 'child-disabled', name: '旧平台', parentId: 'parent-live', isActive: false, sortOrder: 0 },
] as any[];

assert.deepEqual(buildCustomerLeadSourceOptions(configs), [
  { key: 'parent-referral', parentName: '转介绍', childName: '', label: '转介绍' },
  { key: 'parent-live', parentName: '直播', childName: '', label: '直播' },
  { key: 'parent-live:child-douyin', parentName: '直播', childName: '抖音', label: '直播 / 抖音' },
  { key: 'parent-live:child-video', parentName: '直播', childName: '视频号', label: '直播 / 视频号' },
]);

assert.deepEqual(normalizeCustomerToolbarFilters({
  search: '客户',
  followStatus: 'has_follow',
  sourceType: '公司资源',
  industry: '教育',
  city: '杭州',
  leadSource: '直播',
  sourceName: '抖音',
  tagIds: ['tag-1'],
}, 'active'), {
  search: '客户',
  leadSource: '直播',
  sourceName: '抖音',
  tagIds: ['tag-1'],
});

assert.equal(normalizeCustomerToolbarFilters({ lifecycleStatusCode: 'following' }, 'active').lifecycleStatusCode, 'following');
assert.equal(normalizeCustomerToolbarFilters({ lifecycleStatusCode: 'public_pool' }, 'active').lifecycleStatusCode, undefined);
assert.equal(normalizeCustomerToolbarFilters({}, 'public_pool').lifecycleStatusCode, 'public_pool');
