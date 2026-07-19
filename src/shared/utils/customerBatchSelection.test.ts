import assert from 'node:assert/strict';
import {
  canOfferBatchAction,
  clearCustomerBatchSelection,
  getExecutionPresentation,
  getCustomerMergeSelectionAvailability,
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
const selectedAcrossPages = selectPageCustomers(selectedPage, ['c-51']);
assert.deepEqual(selectedAcrossPages.selectedIds, ['c-1', 'c-2', 'c-51'], '翻页选择必须保留之前页面的客户');
assert.deepEqual(getCustomerMergeSelectionAvailability(selectedAcrossPages), { enabled: true, reason: '' });
assert.equal(getCustomerMergeSelectionAvailability(clearCustomerBatchSelection()).enabled, false);
assert.equal(getCustomerMergeSelectionAvailability({ mode: 'ids', selectedIds: ['c-1'], filters: null }).enabled, false);
assert.equal(getCustomerMergeSelectionAvailability({ mode: 'ids', selectedIds: Array.from({ length: 11 }, (_, index) => `c-${index}`), filters: null }).enabled, false);

const filterSnapshot = selectCurrentFilterResult({ search: '极享', page: 4, pageSize: 20 });
assert.deepEqual(filterSnapshot, {
  mode: 'filter_snapshot',
  selectedIds: [],
  filters: { search: '极享' },
});
assert.equal(isCustomerSelected(filterSnapshot, 'c-1'), false, '全筛选意图不能伪装成已知客户 ID 集合');
assert.match(getCustomerMergeSelectionAvailability(filterSnapshot).reason, /手动勾选/);

assert.equal(canOfferBatchAction(['客户/批量管理'], 'transfer'), false);
assert.equal(canOfferBatchAction(['客户/批量管理', '客户/转移客户'], 'transfer'), true);
assert.equal(canOfferBatchAction(['客户/批量管理', '客户/删除客户'], 'soft_delete'), true);
assert.equal(canOfferBatchAction(['全部'], 'soft_delete'), false, '父级或通配权限不得显示高风险动作');

assert.equal(getExecutionPresentation({ totalCount: 200, selectionMode: 'ids' }), 'background');
assert.equal(getExecutionPresentation({ totalCount: 201, selectionMode: 'filter_snapshot' }), 'background');

console.log('customer batch selection tests passed');
