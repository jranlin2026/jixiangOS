import assert from 'node:assert/strict';
import {
  canOfferBatchAction,
  clearCustomerBatchSelection,
  getExecutionPresentation,
  isCustomerSelected,
  selectCurrentFilterResult,
  selectPageCustomers,
  toggleCustomerSelection,
} from './customerBatchSelection';

const selectedPage = selectPageCustomers(clearCustomerBatchSelection(), ['c-2', 'c-1', 'c-2']);
assert.deepEqual(selectedPage, { mode: 'ids', selectedIds: ['c-1', 'c-2'], filters: null });
assert.equal(isCustomerSelected(selectedPage, 'c-1'), true);
assert.deepEqual(toggleCustomerSelection(selectedPage, 'c-1').selectedIds, ['c-2']);
assert.deepEqual(toggleCustomerSelection(selectedPage, 'c-3').selectedIds, ['c-1', 'c-2', 'c-3']);

const filterSnapshot = selectCurrentFilterResult({ search: '极享', page: 4, pageSize: 20 });
assert.deepEqual(filterSnapshot, {
  mode: 'filter_snapshot',
  selectedIds: [],
  filters: { search: '极享' },
});
assert.equal(isCustomerSelected(filterSnapshot, 'c-1'), false, '全筛选意图不能伪装成已知客户 ID 集合');

assert.equal(canOfferBatchAction(['客户/批量管理'], 'transfer'), false);
assert.equal(canOfferBatchAction(['客户/批量管理', '客户/转移客户'], 'transfer'), true);
assert.equal(canOfferBatchAction(['客户/批量管理', '客户/删除客户'], 'soft_delete'), true);
assert.equal(canOfferBatchAction(['全部'], 'soft_delete'), false, '父级或通配权限不得显示高风险动作');

assert.equal(getExecutionPresentation({ totalCount: 200, selectionMode: 'ids' }), 'background');
assert.equal(getExecutionPresentation({ totalCount: 201, selectionMode: 'filter_snapshot' }), 'background');

console.log('customer batch selection tests passed');
