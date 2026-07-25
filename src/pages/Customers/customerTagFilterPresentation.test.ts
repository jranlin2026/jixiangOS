import assert from 'node:assert/strict';
import { buildCustomerTagFilterHint } from './customerTagFilterPresentation';

const catalog = {
  groups: [
    { id: 'intent', name: '客户意向' },
    { id: 'service', name: '服务状态' },
  ],
  tags: [
    { id: 'high', groupId: 'intent', name: '高意向' },
    { id: 'low', groupId: 'intent', name: '低意向' },
    { id: 'joined', groupId: 'service', name: '已加入服务群' },
  ],
} as any;

assert.equal(buildCustomerTagFilterHint({ tagIds: ['high', 'low', 'joined'], tagMatch: 'grouped' }, catalog), '（高意向 或 低意向） 并且 已加入服务群');
assert.equal(buildCustomerTagFilterHint({ tagIds: ['high', 'low'], tagMatch: 'any' }, catalog), '高意向 或 低意向');
assert.equal(buildCustomerTagFilterHint({ tagIds: ['high', 'joined'], tagMatch: 'all' }, catalog), '高意向 并且 已加入服务群');
assert.equal(buildCustomerTagFilterHint({ withoutTags: true }, catalog), '筛选没有人工标签的客户');
assert.equal(buildCustomerTagFilterHint({ missingTagGroupId: 'service' }, catalog), '筛选未设置“服务状态”标签的客户');
assert.equal(buildCustomerTagFilterHint({ tagIds: [], tagMatch: 'grouped' }, catalog), '同一分组内满足任一标签，不同分组之间需同时满足');
