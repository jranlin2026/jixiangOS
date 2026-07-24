import type { LeadSourceConfig } from '../../types/settings';
import type { CustomerFilters, CustomerLeadSourceFacet } from '../../types/customer';

export type CustomerLeadSourceOption = {
  key: string;
  parentName: string;
  childName: string;
  label: string;
  count?: number;
};

const bySortOrder = (left: LeadSourceConfig, right: LeadSourceConfig) => left.sortOrder - right.sortOrder;

export function buildCustomerLeadSourceOptions(
  configs: LeadSourceConfig[],
  facets?: CustomerLeadSourceFacet[],
): CustomerLeadSourceOption[] {
  const activeConfigs = configs.filter((config) => config.isActive);
  const parents = activeConfigs.filter((config) => !config.parentId).sort(bySortOrder);
  const children = activeConfigs.filter((config) => config.parentId).sort(bySortOrder);

  const options = parents.flatMap((parent) => {
    const childOptions = children.filter((child) => child.parentId === parent.id);
    const parentOption = {
      key: parent.id,
      parentName: parent.name,
      childName: '',
      label: parent.name,
    };
    return [parentOption, ...childOptions.map((child) => ({
      key: `${parent.id}:${child.id}`,
      parentName: parent.name,
      childName: child.name,
      label: `${parent.name} / ${child.name}`,
    }))];
  });

  if (!facets) return options;
  const facetCounts = new Map<string, number>();
  const parentCounts = new Map<string, number>();
  facets.forEach((facet) => {
    const leadSource = facet.leadSource.trim();
    const sourceName = facet.sourceName.trim();
    const count = Math.max(0, Number(facet.count) || 0);
    if (!leadSource || !count) return;
    parentCounts.set(leadSource, (parentCounts.get(leadSource) || 0) + count);
    facetCounts.set(`${leadSource}\u0000${sourceName}`, (facetCounts.get(`${leadSource}\u0000${sourceName}`) || 0) + count);
  });
  return options.flatMap((option) => {
    const count = option.childName
      ? facetCounts.get(`${option.parentName}\u0000${option.childName}`) || 0
      : parentCounts.get(option.parentName) || 0;
    return count > 0 ? [{ ...option, count }] : [];
  });
}

export function normalizeCustomerToolbarFilters(
  filters: CustomerFilters,
  scope: 'active' | 'public_pool',
): CustomerFilters {
  const normalized = { ...filters };
  delete normalized.productLevel;
  delete normalized.followStatus;
  delete normalized.sourceType;
  delete normalized.industry;
  delete normalized.city;
  if (scope === 'public_pool') normalized.lifecycleStatusCode = 'public_pool';
  else if (normalized.lifecycleStatusCode === 'public_pool') normalized.lifecycleStatusCode = undefined;
  return normalized;
}
