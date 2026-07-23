import type { LeadSourceConfig } from '../../types/settings';
import type { CustomerFilters } from '../../types/customer';

export type CustomerLeadSourceOption = {
  key: string;
  parentName: string;
  childName: string;
  label: string;
};

const bySortOrder = (left: LeadSourceConfig, right: LeadSourceConfig) => left.sortOrder - right.sortOrder;

export function buildCustomerLeadSourceOptions(configs: LeadSourceConfig[]): CustomerLeadSourceOption[] {
  const activeConfigs = configs.filter((config) => config.isActive);
  const parents = activeConfigs.filter((config) => !config.parentId).sort(bySortOrder);
  const children = activeConfigs.filter((config) => config.parentId).sort(bySortOrder);

  return parents.flatMap((parent) => {
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
