import assert from 'node:assert/strict';
import { analyzeCrmMigrationTables, parseMigrationSource } from './crmMigrationApi';

const now = new Date().toISOString();

const existingSource = [
  { id: 'src-parent-1', name: '官网', isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
  { id: 'src-child-1', name: '表单', parentId: 'src-parent-1', isActive: true, sortOrder: 1, createdAt: now, updatedAt: now },
];

const parsedSource = parseMigrationSource('直播部-抖音01');
assert.deepEqual(parsedSource, {
  parentName: '直播部',
  childName: '抖音01',
  label: '直播部-抖音01',
});

const result = analyzeCrmMigrationTables({
  teamCustomers: [
    {
      客户全名: '客户A',
      手机: '13800000001',
      来源: '官网/表单',
      客户跟进人: '张伟',
      标签: '高意向,重点客户',
      客户进展: '跟进中',
    },
  ],
  publicPool: [
    {
      客户全名: '客户B',
      手机: '13800000002',
      来源: '直播部-抖音01',
      最后跟进人: '李娜',
      标签: '公海',
      客户进展: '公海',
    },
  ],
}, {
  users: [
    { id: 'u-zhang', name: '张伟', isActive: true, employmentStatus: 'active' },
  ],
  leadSourceConfigs: existingSource,
  tagGroups: [
    {
      id: 'g-customer', name: '客户标签', color: '#000000', selectionMode: 'multiple', scope: 'customer',
      isActive: true, sortOrder: 1, createdAt: now, updatedAt: now,
    },
  ],
  tags: [
    { id: 'tag-priority', groupId: 'g-customer', name: '重点客户', isActive: true },
  ],
});

assert.equal(result.customerStats.teamCustomers, 1);
assert.equal(result.customerStats.publicPoolCustomers, 1);
assert.deepEqual(result.employees.matched, ['张伟']);
assert.deepEqual(result.employees.missing, []);
assert.deepEqual(result.employees.system, []);
assert.deepEqual(result.tags.matched, ['重点客户']);
assert.deepEqual(result.tags.missing.sort(), ['公海', '高意向']);
assert.equal(result.sources.matched.some((source) => source.label === '官网-表单'), true);
assert.equal(result.sources.missing.some((source) => source.label === '直播部-抖音01'), true);

const unsafeNameResult = analyzeCrmMigrationTables({
  teamCustomers: [
    { 客户跟进人: '吕煜阳', 客户创建人: '历史操作员', 客户标签: '高意向,VIP' },
  ],
  publicPool: [{ 客户跟进人: '不存在的原负责人' }],
}, {
  users: [
    { id: 'u-1', name: '吕煜阳', isActive: true, employmentStatus: 'active' },
  ],
  leadSourceConfigs: [],
  tagGroups: [
    {
      id: 'g-1', name: '意向', color: '#000000', selectionMode: 'multiple', scope: 'customer',
      isActive: true, sortOrder: 1, createdAt: now, updatedAt: now,
    },
    {
      id: 'g-2', name: '价值', color: '#000000', selectionMode: 'multiple', scope: 'both',
      isActive: true, sortOrder: 2, createdAt: now, updatedAt: now,
    },
  ],
  tags: [
    { id: 'tag-1', groupId: 'g-1', name: '高意向', isActive: true },
    { id: 'tag-2', groupId: 'g-1', name: 'VIP', isActive: true },
    { id: 'tag-3', groupId: 'g-2', name: 'vip', isActive: true },
  ],
});
assert.deepEqual(unsafeNameResult.employees.matched, ['吕煜阳']);
assert.deepEqual(unsafeNameResult.employees.missing, []);
assert.deepEqual(unsafeNameResult.employees.ambiguous, []);
assert.deepEqual(unsafeNameResult.tags.ambiguous, ['VIP']);
