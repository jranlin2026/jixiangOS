import assert from 'node:assert/strict';
import { buildLeadSourceOptions, resolveLeadSourceOption } from './leadSourceOptions';

const configs = [
  { id: 'douyin', name: '抖音电商', isActive: true, sortOrder: 2, createdAt: '', updatedAt: '' },
  { id: 'wechat', name: '微信', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
  { id: 'feige', name: '飞鸽客服', parentId: 'douyin', isActive: true, sortOrder: 1, createdAt: '', updatedAt: '' },
  { id: 'live', name: '直播间01', parentId: 'douyin', isActive: false, sortOrder: 2, createdAt: '', updatedAt: '' },
];

const options = buildLeadSourceOptions(configs);
assert.deepEqual(options.map((item) => item.label), ['微信', '抖音电商-飞鸽客服']);
assert.deepEqual(resolveLeadSourceOption(options, 'douyin:feige'), {
  leadSource: '抖音电商',
  sourceName: '飞鸽客服',
});
assert.equal(resolveLeadSourceOption(options, 'missing'), null);

console.log('lead source option tests passed');
