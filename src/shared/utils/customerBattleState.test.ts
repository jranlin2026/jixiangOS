import assert from 'node:assert/strict';
import type { Customer } from '../../types/customer';
import type { CustomerTodo } from '../../types/customerTodo';
import { buildCustomerBattleSnapshot, getOpportunityStage } from './customerBattleState';

const customer = {
  id: 'customer-1',
  name: '测试客户',
  company: '测试公司',
  phone: '13800000000',
  customerLevel: 'L1',
  owner: '销售甲',
  totalSpent: 0,
  orderCount: 0,
  growthPath: [],
  growthRecords: [],
  opportunityStageCode: 'proposal',
  opportunityAmount: 68000,
  activityRecords: [
    { id: 'old', type: 'follow', title: '电话沟通', operator: '销售甲', createdAt: '2026-08-10T02:00:00.000Z' },
    { id: 'new', type: 'follow', title: '确认方案', operator: '销售甲', createdAt: '2026-08-18T02:00:00.000Z' },
    { id: 'note', type: 'note', title: '内部备注', operator: '销售甲', createdAt: '2026-08-20T02:00:00.000Z' },
  ],
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-18T02:00:00.000Z',
} as Customer;

const todos = [
  { id: 'later', customerId: customer.id, customerName: customer.name, title: '二次报价', status: 'pending', dueAt: '2026-08-23T02:00:00.000Z' },
  { id: 'first', customerId: customer.id, customerName: customer.name, title: '确认决策人', status: 'pending', dueAt: '2026-08-20T02:00:00.000Z' },
  { id: 'done', customerId: customer.id, customerName: customer.name, title: '已完成', status: 'completed', dueAt: '2026-08-19T02:00:00.000Z' },
] as CustomerTodo[];

const snapshot = buildCustomerBattleSnapshot(customer, todos, new Date('2026-08-21T02:00:00.000Z'));
assert.equal(snapshot.stage.code, 'proposal');
assert.equal(snapshot.stage.label, '方案报价');
assert.equal(snapshot.opportunityAmount, 68000);
assert.equal(snapshot.lastEffectiveContact?.id, 'new');
assert.equal(snapshot.contactGapDays, 3);
assert.equal(snapshot.nextAction?.id, 'first');
assert.equal(snapshot.nextActionOverdue, true);
assert.equal(snapshot.risk.level, 'high');
assert.match(snapshot.risk.reason, /逾期/);

const noAction = buildCustomerBattleSnapshot({ ...customer, activityRecords: [] }, [], new Date('2026-08-21T02:00:00.000Z'));
assert.equal(noAction.lastEffectiveContact, null);
assert.equal(noAction.contactGapDays, null);
assert.equal(noAction.nextAction, null);
assert.equal(noAction.risk.level, 'medium');
assert.match(noAction.risk.reason, /下一步动作/);

const closed = buildCustomerBattleSnapshot({ ...customer, opportunityStageCode: 'won' }, [], new Date('2026-08-21T02:00:00.000Z'));
assert.equal(closed.risk.level, 'low');
assert.match(closed.risk.reason, /已成交/);

assert.equal(getOpportunityStage('unknown').code, 'not_set');

console.log('customer battle state: ok');
