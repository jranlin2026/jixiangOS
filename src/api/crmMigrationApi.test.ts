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
  assignedLeads: [
    {
      联系人姓名: '商机A',
      联系方式: '+86 13800000001',
      来源: '官网/表单',
      当前商机接收人: '张伟',
    },
    {
      联系人姓名: '商机C',
      联系方式: '13800000003',
      来源: '转介绍',
      当前商机接收人: '王强',
    },
  ],
  failedLeads: [
    {
      联系人姓名: '失败A',
      联系方式: '13800000003',
      来源: '转介绍',
      分配人: '系统',
      失败原因: '重复',
    },
  ],
}, {
  users: [
    { name: '张伟', isActive: true, employmentStatus: 'active' },
  ],
  leadSourceConfigs: existingSource,
  tags: [
    { name: '重点客户', isActive: true },
  ],
});

assert.equal(result.customerStats.teamCustomers, 1);
assert.equal(result.customerStats.publicPoolCustomers, 1);
assert.equal(result.leadStats.assignedOverlapTeam, 1);
assert.equal(result.leadStats.assignedMissingInCustomers, 1);
assert.equal(result.leadStats.failedOverlapAssigned, 1);
assert.deepEqual(result.employees.matched, ['张伟']);
assert.deepEqual(result.employees.missing.sort(), ['李娜', '王强']);
assert.deepEqual(result.employees.system, ['系统']);
assert.deepEqual(result.tags.matched, ['重点客户']);
assert.deepEqual(result.tags.missing.sort(), ['公海', '高意向']);
assert.equal(result.sources.matched.some((source) => source.label === '官网-表单'), true);
assert.equal(result.sources.missing.some((source) => source.label === '直播部-抖音01'), true);
assert.equal(result.sources.missing.some((source) => source.label === '历史导入-转介绍'), true);
