import assert from 'node:assert/strict';
import type { Customer } from '../../types/customer';
import { buildCustomerColumns } from './index';

const customer = {
  owner: '公海',
  previousOwner: '销售甲',
  originalSalesTransferBy: '销转乙',
  activityRecords: [
    { id: 'release', type: 'transfer', title: '释放到公海', operator: '管理员', createdAt: '2026-07-22T12:00:00.000Z' },
    { id: 'follow', type: 'follow', title: '发表了跟进记录', operator: '销售丙', createdAt: '2026-07-22T11:00:00.000Z' },
  ],
} as Customer;

const columns = buildCustomerColumns([], 'public_pool');
const byId = (id: string) => columns.find((column) => column.id === id)!;

assert.equal(byId('originalSalesTransferBy').label, '首个销售负责人');
assert.equal(byId('previousOwner').label, '上一个销售负责人');
assert.equal(byId('previousOwner').render(customer), '销售甲');
assert.equal(byId('owner').label, '最后跟进人');
assert.equal(byId('owner').render(customer), '销售丙');

console.log('customer list columns: ok');
