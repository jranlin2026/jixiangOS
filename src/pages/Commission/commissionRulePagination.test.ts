import assert from 'node:assert/strict';
import test from 'node:test';
import { clampCommissionConfigPage, paginateCommissionConfigRows } from './commissionRulePagination';

test('提成配置表格按当前页和每页条数返回数据', () => {
  const rows = Array.from({ length: 23 }, (_, index) => index + 1);

  assert.deepEqual(paginateCommissionConfigRows(rows, 0, 10), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(paginateCommissionConfigRows(rows, 2, 10), [21, 22, 23]);
});

test('数据减少后把页码收敛到最后一个有效页', () => {
  assert.equal(clampCommissionConfigPage(25, 2, 10), 2);
  assert.equal(clampCommissionConfigPage(11, 2, 10), 1);
  assert.equal(clampCommissionConfigPage(0, 4, 10), 0);
});
