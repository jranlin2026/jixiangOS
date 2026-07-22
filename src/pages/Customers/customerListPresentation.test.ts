import assert from 'node:assert/strict';
import type { Customer } from '../../types/customer';
import { buildLastFollowUpFilterUsers, getLastFollowUpOperator, getPreviousOwnerLabel } from './customerListPresentation';

const customer = {
  activityRecords: [
    { id: 'release', type: 'transfer', title: '释放到公海', operator: '管理员', createdAt: '2026-07-22T12:00:00.000Z' },
    { id: 'follow-latest', type: 'follow', title: '发表了跟进记录', operator: '销售乙', createdAt: '2026-07-22T11:00:00.000Z' },
    { id: 'follow-old', type: 'follow', title: '发表了跟进记录', operator: '销售甲', createdAt: '2026-07-21T11:00:00.000Z' },
  ],
} as Customer;

assert.equal(getLastFollowUpOperator(customer), '销售乙');
assert.equal(getLastFollowUpOperator({ activityRecords: [] }), '暂无跟进');
assert.equal(getLastFollowUpOperator({ activityRecords: [], previousOwner: '销售甲' }), '销售甲');
assert.equal(getPreviousOwnerLabel({ previousOwner: '销售甲' }), '销售甲');
assert.deepEqual(
  buildLastFollowUpFilterUsers([
    customer,
    { activityRecords: [], previousOwner: '销售甲' },
    { activityRecords: [] },
  ], '已离职销售').map((user) => user.name),
  ['销售乙', '销售甲', '暂无跟进', '已离职销售'],
);

console.log('customer list presentation: ok');
