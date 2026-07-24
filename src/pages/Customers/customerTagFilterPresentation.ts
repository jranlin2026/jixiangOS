import type { CustomerFilters } from '../../types/customer';
import type { CustomerTagCatalog } from '../../types/tag';

type TagFilterValue = Pick<CustomerFilters, 'tagIds' | 'tagMatch' | 'withoutTags' | 'missingTagGroupId'>;

const genericHints = {
  grouped: '同一分组内满足任一标签，不同分组之间需同时满足',
  any: '只要满足任意一个已选标签即可',
  all: '必须同时满足所有已选标签',
} as const;

export function buildCustomerTagFilterHint(value: TagFilterValue, catalog: CustomerTagCatalog): string {
  if (value.withoutTags) return '筛选没有人工标签的客户';
  if (value.missingTagGroupId) {
    const groupName = catalog.groups.find((group) => group.id === value.missingTagGroupId)?.name;
    return groupName ? `筛选未设置“${groupName}”标签的客户` : '筛选未设置指定分组标签的客户';
  }

  const selectedTags = (value.tagIds || []).flatMap((tagId) => {
    const tag = catalog.tags.find((item) => item.id === tagId);
    return tag ? [tag] : [];
  });
  const mode = value.tagMatch || 'grouped';
  if (!selectedTags.length) return genericHints[mode];
  if (mode === 'any') return selectedTags.map((tag) => tag.name).join(' 或 ');
  if (mode === 'all') return selectedTags.map((tag) => tag.name).join(' 并且 ');

  const grouped = new Map<string, string[]>();
  selectedTags.forEach((tag) => grouped.set(tag.groupId, [...(grouped.get(tag.groupId) || []), tag.name]));
  return Array.from(grouped.values())
    .map((names) => names.length > 1 ? `（${names.join(' 或 ')}）` : names[0])
    .join(' 并且 ');
}
