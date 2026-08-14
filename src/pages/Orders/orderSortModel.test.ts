import assert from 'node:assert/strict';
import test from 'node:test';
import { ORDER_SORT_OPTIONS, orderSortFilters, resolveOrderSortOption } from './orderSortModel';

test('order list exposes five simple sort choices and defaults to newest created', () => {
  assert.deepEqual(ORDER_SORT_OPTIONS.map((option) => option.label), [
    '最新创建', '最新付款', '最早付款', '实付金额从高到低', '实付金额从低到高',
  ]);
  assert.equal(resolveOrderSortOption({}), 'created_desc');
  assert.deepEqual(orderSortFilters('payment_asc'), { sortBy: 'paymentDate', sortDirection: 'asc' });
  assert.deepEqual(orderSortFilters('amount_desc'), { sortBy: 'actualAmount', sortDirection: 'desc' });
});
