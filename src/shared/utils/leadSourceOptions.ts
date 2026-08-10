import type { LeadSourceConfig } from '../../types/settings';

export type LeadSourceOption = {
  key: string;
  label: string;
  leadSource: string;
  sourceName: string;
  parentId: string;
};

export function buildLeadSourceOptions(configs: LeadSourceConfig[]): LeadSourceOption[] {
  const active = configs.filter((item) => item.isActive);
  const parents = active
    .filter((item) => !item.parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));
  const children = active
    .filter((item) => item.parentId)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));

  return parents.flatMap((parent) => {
    const nested = children.filter((child) => child.parentId === parent.id);
    if (!nested.length) {
      return [{
        key: parent.id,
        label: parent.name,
        leadSource: parent.name,
        sourceName: '',
        parentId: parent.id,
      }];
    }
    return nested.map((child) => ({
      key: `${parent.id}:${child.id}`,
      label: `${parent.name}-${child.name}`,
      leadSource: parent.name,
      sourceName: child.name,
      parentId: parent.id,
    }));
  });
}

export function resolveLeadSourceOption(
  options: LeadSourceOption[],
  key: string,
): { leadSource: string; sourceName: string } | null {
  const option = options.find((item) => item.key === key);
  return option ? { leadSource: option.leadSource, sourceName: option.sourceName } : null;
}
