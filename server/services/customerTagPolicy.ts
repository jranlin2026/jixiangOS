import type { CustomerTagCatalog, ManualTagScope } from '../../src/types/tag';

const MAX_TAGS_PER_SUBJECT = 20;

export function normalizeManualTagIds(ids: string[] = []): string[] {
  return Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean))).slice(0, MAX_TAGS_PER_SUBJECT + 1);
}

export function validateManualTagSelection(catalog: CustomerTagCatalog, scope: Exclude<ManualTagScope, 'both'>, ids: string[]) {
  const normalized = normalizeManualTagIds(ids);
  if (normalized.length > MAX_TAGS_PER_SUBJECT) return { ok: false as const, message: `每条记录最多选择 ${MAX_TAGS_PER_SUBJECT} 个标签` };
  const groups = new Map(catalog.groups.map((group) => [group.id, group]));
  const tags = new Map(catalog.tags.map((tag) => [tag.id, tag]));
  const counts = new Map<string, number>();
  for (const id of normalized) {
    const tag = tags.get(id);
    const group = tag ? groups.get(tag.groupId) : undefined;
    if (!tag || !group || !tag.isActive || !group.isActive) return { ok: false as const, message: '标签不存在或已停用' };
    if (group.scope !== 'both' && group.scope !== scope) return { ok: false as const, message: '标签不适用于当前记录类型' };
    counts.set(group.id, (counts.get(group.id) || 0) + 1);
    if (group.selectionMode === 'single' && (counts.get(group.id) || 0) > 1) return { ok: false as const, message: `标签分组“${group.name}”只能选择一项` };
  }
  return { ok: true as const, tagIds: normalized };
}

export function inheritableCustomerTagIds(catalog: CustomerTagCatalog, ids: string[]): string[] {
  const groupById = new Map(catalog.groups.map((group) => [group.id, group]));
  return normalizeManualTagIds(ids).filter((id) => {
    const tag = catalog.tags.find((item) => item.id === id && item.isActive);
    return tag && groupById.get(tag.groupId)?.isActive && groupById.get(tag.groupId)?.scope === 'both';
  });
}

export function groupTagIdsForFilter(catalog: CustomerTagCatalog, ids: string[]): string[][] {
  const tagById = new Map(catalog.tags.map((tag) => [tag.id, tag]));
  const grouped = new Map<string, string[]>();
  normalizeManualTagIds(ids).forEach((id) => {
    const tag = tagById.get(id);
    if (tag) grouped.set(tag.groupId, [...(grouped.get(tag.groupId) || []), id]);
  });
  return Array.from(grouped.values());
}
