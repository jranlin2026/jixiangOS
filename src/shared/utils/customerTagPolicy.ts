import type { CustomerTagCatalog, ManualTagScope } from '../../types/tag';

const MAX_TAGS_PER_SUBJECT = 20;
type AssignmentScope = Exclude<ManualTagScope, 'both'>;

export function normalizeManualTagIds(ids: string[] = []): string[] {
  return Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean))).slice(0, MAX_TAGS_PER_SUBJECT + 1);
}

export function validateManualTagSelection(catalog: CustomerTagCatalog, scope: AssignmentScope, ids: string[]) {
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

export function validateManualTagUpdateSelection(
  catalog: CustomerTagCatalog,
  scope: AssignmentScope,
  requestedIds: string[],
  previousIds: string[] = [],
) {
  const requested = normalizeManualTagIds(requestedIds);
  if (requested.length > MAX_TAGS_PER_SUBJECT) return { ok: false as const, message: `每条记录最多选择 ${MAX_TAGS_PER_SUBJECT} 个标签` };
  const previous = new Set(normalizeManualTagIds(previousIds));
  const groups = new Map(catalog.groups.map((group) => [group.id, group]));
  const tags = new Map(catalog.tags.map((tag) => [tag.id, tag]));
  const activeIds: string[] = [];
  for (const id of requested) {
    const tag = tags.get(id);
    const group = tag ? groups.get(tag.groupId) : undefined;
    if (!tag || !group) return { ok: false as const, message: '标签不存在或已停用' };
    if (!tag.isActive || !group.isActive) {
      if (!previous.has(id)) return { ok: false as const, message: '标签不存在或已停用' };
      continue;
    }
    activeIds.push(id);
  }
  const activeValidation = validateManualTagSelection(catalog, scope, activeIds);
  return activeValidation.ok ? { ok: true as const, tagIds: requested } : activeValidation;
}

export function resolveManualTagNames(catalog: CustomerTagCatalog, scope: AssignmentScope, labels: string[]) {
  const groupById = new Map(catalog.groups.map((group) => [group.id, group]));
  const tagIds: string[] = [];
  for (const rawLabel of labels) {
    const label = String(rawLabel).trim();
    const key = label.toLocaleLowerCase();
    const matches = catalog.tags.filter((tag) => tag.name.trim().toLocaleLowerCase() === key);
    const eligible = matches.filter((tag) => {
      const group = groupById.get(tag.groupId);
      return tag.isActive && group?.isActive && (group.scope === 'both' || group.scope === scope);
    });
    if (eligible.length > 1) return { ok: false as const, message: `标签“${label}”名称存在歧义，请使用唯一预设名称` };
    if (eligible.length === 1) {
      tagIds.push(eligible[0].id);
      continue;
    }
    if (!matches.length) return { ok: false as const, message: `标签“${label}”未在系统设置中预设` };
    const hasActiveDefinition = matches.some((tag) => tag.isActive && groupById.get(tag.groupId)?.isActive);
    return hasActiveDefinition
      ? { ok: false as const, message: `标签“${label}”不适用于${scope === 'lead' ? '线索' : '客户'}` }
      : { ok: false as const, message: `标签“${label}”不存在或已停用` };
  }
  const validation = validateManualTagSelection(catalog, scope, tagIds);
  return validation;
}

export function inheritableCustomerTagIds(catalog: CustomerTagCatalog, ids: string[]): string[] {
  const groupById = new Map(catalog.groups.map((group) => [group.id, group]));
  return normalizeManualTagIds(ids).filter((id) => {
    const tag = catalog.tags.find((item) => item.id === id && item.isActive);
    return tag && groupById.get(tag.groupId)?.isActive && groupById.get(tag.groupId)?.scope === 'both';
  }).slice(0, MAX_TAGS_PER_SUBJECT);
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

export function validateCustomerTagFilters(catalog: CustomerTagCatalog, input: { tagIds?: string[]; missingTagGroupId?: string }) {
  const groups = new Map(catalog.groups.map((group) => [group.id, group]));
  const tags = new Map(catalog.tags.map((tag) => [tag.id, tag]));
  for (const id of normalizeManualTagIds(input.tagIds || [])) {
    const tag = tags.get(id);
    const group = tag ? groups.get(tag.groupId) : undefined;
    if (!tag?.isActive || !group?.isActive || (group.scope !== 'customer' && group.scope !== 'both')) {
      return { ok: false as const, message: '标签不存在、已停用或不适用于客户' };
    }
  }
  if (input.missingTagGroupId) {
    const group = groups.get(input.missingTagGroupId);
    if (!group?.isActive || (group.scope !== 'customer' && group.scope !== 'both')) return { ok: false as const, message: '标签分组不存在或已停用' };
  }
  return { ok: true as const };
}
