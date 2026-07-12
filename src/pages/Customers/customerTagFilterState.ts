import type { CustomerFilters } from '../../types/customer';

export type CustomerTagFilterState = Pick<CustomerFilters, 'tagIds' | 'tagMatch' | 'withoutTags' | 'missingTagGroupId'>;
export const readCustomerTagFilterParams = (params: URLSearchParams): CustomerTagFilterState => {
  const tagIds = Array.from(new Set(params.getAll('tagId').map((id) => id.trim()).filter(Boolean))).slice(0, 20);
  const mode = params.get('tagMatch');
  return {
    tagIds,
    tagMatch: tagIds.length && (mode === 'any' || mode === 'all' || mode === 'grouped') ? mode : 'grouped',
    withoutTags: params.get('withoutTags') === 'true' || undefined,
    missingTagGroupId: params.get('missingTagGroupId')?.trim() || undefined,
  };
};
export const writeCustomerTagFilterParams = (current: URLSearchParams, state: CustomerTagFilterState) => {
  const next = new URLSearchParams(current);
  ['tagId', 'tagMatch', 'withoutTags', 'missingTagGroupId'].forEach((key) => next.delete(key));
  state.tagIds?.forEach((id) => next.append('tagId', id));
  if (state.tagIds?.length) next.set('tagMatch', state.tagMatch || 'grouped');
  if (state.withoutTags) next.set('withoutTags', 'true');
  if (state.missingTagGroupId) next.set('missingTagGroupId', state.missingTagGroupId);
  return next;
};
export const customerTagRequestSource = (current: URLSearchParams, next: URLSearchParams): 'url-effect' | 'direct' => current.toString() === next.toString() ? 'direct' : 'url-effect';
