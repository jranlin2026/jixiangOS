import type { CustomerFilters } from '../../types/customer';
import type { CustomerBatchOperation } from '../../types/customerBatch';
import { CUSTOMER_BATCH_ACTION_PERMISSION_MAP, normalizePermissionKey } from './permissions';

export interface CustomerBatchSelectionState {
  mode: 'ids' | 'filter_snapshot';
  selectedIds: string[];
  filters: CustomerFilters | null;
}

const cleanIds = (ids: readonly string[]) => Array.from(new Set(
  ids.map((id) => String(id || '').trim()).filter(Boolean),
)).sort();

export function clearCustomerBatchSelection(): CustomerBatchSelectionState {
  return { mode: 'ids', selectedIds: [], filters: null };
}

export function selectPageCustomers(
  current: CustomerBatchSelectionState,
  customerIds: readonly string[],
): CustomerBatchSelectionState {
  const prior = current.mode === 'ids' ? current.selectedIds : [];
  return { mode: 'ids', selectedIds: cleanIds([...prior, ...customerIds]), filters: null };
}

export function deselectPageCustomers(
  current: CustomerBatchSelectionState,
  customerIds: readonly string[],
): CustomerBatchSelectionState {
  if (current.mode !== 'ids') return clearCustomerBatchSelection();
  const pageIds = new Set(cleanIds(customerIds));
  return { mode: 'ids', selectedIds: current.selectedIds.filter((id) => !pageIds.has(id)), filters: null };
}

export function toggleCustomerSelection(
  current: CustomerBatchSelectionState,
  customerId: string,
): CustomerBatchSelectionState {
  const id = String(customerId || '').trim();
  if (!id) return current;
  const selectedIds = current.mode === 'ids' ? current.selectedIds : [];
  return selectedIds.includes(id)
    ? { mode: 'ids', selectedIds: selectedIds.filter((candidate) => candidate !== id), filters: null }
    : { mode: 'ids', selectedIds: cleanIds([...selectedIds, id]), filters: null };
}

export function isCustomerSelected(current: CustomerBatchSelectionState, customerId: string): boolean {
  return current.mode === 'ids' && current.selectedIds.includes(customerId);
}

export function selectCurrentFilterResult(filters: CustomerFilters): CustomerBatchSelectionState {
  const { page: _page, pageSize: _pageSize, ...snapshot } = filters;
  return {
    mode: 'filter_snapshot',
    selectedIds: [],
    filters: structuredClone(snapshot),
  };
}

export function canOfferBatchAction(
  grantedPermissionKeys: readonly string[],
  operation: CustomerBatchOperation,
): boolean {
  const granted = new Set(grantedPermissionKeys.map(normalizePermissionKey));
  return CUSTOMER_BATCH_ACTION_PERMISSION_MAP[operation]
    .every((permissionKey) => granted.has(normalizePermissionKey(permissionKey)));
}

export function getExecutionPresentation(_input: {
  totalCount: number;
  selectionMode: CustomerBatchSelectionState['mode'];
}): 'background' {
  return 'background';
}
