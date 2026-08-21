import assert from 'node:assert/strict';
import type { Customer } from '../../types/customer';
import { getCustomerManagementCategory, getCustomerProfileCompleteness } from './customerManagementState';

const customer: Customer = {
  id: 'customer-1', name: '客户甲', company: '', phone: '', customerLevel: 'L1', owner: '销售甲', ownerId: 'sales-1',
  totalSpent: 0, orderCount: 0, growthPath: [], growthRecords: [], createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
  opportunityStageCode: 'needs_discovery', nextActionTitle: '确认需求', nextActionDueAt: '2026-08-22T10:00:00.000Z', leadSource: '官网',
};

const completeness = getCustomerProfileCompleteness(customer);
assert.equal(completeness.percentage, 57);
assert.deepEqual(completeness.missingFields, ['公司', '手机', '意向产品']);
assert.equal(getCustomerManagementCategory(customer, [], new Date('2026-08-21T01:00:00.000Z')).code, 'data_incomplete');
assert.equal(getCustomerManagementCategory({ ...customer, nextActionDueAt: '2026-08-20T01:00:00.000Z' }, [], new Date('2026-08-21T01:00:00.000Z')).code, 'execution_exception');
assert.equal(getCustomerManagementCategory({ ...customer, customerLevel: 'L4', activityRecords: [] }, [], new Date('2026-08-21T01:00:00.000Z')).code, 'business_risk');

console.log('customer management state tests passed');
