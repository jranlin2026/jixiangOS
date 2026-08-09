export type BusinessSourceDirectoryItem = {
  id?: unknown;
  name?: unknown;
  parentId?: unknown;
};

export function referencedBusinessShopDeletion(
  current: BusinessSourceDirectoryItem[],
  next: BusinessSourceDirectoryItem[],
  referencedShopIds: Set<string>,
) {
  const nextIds = new Set(next.map((item) => String(item.id || '')).filter(Boolean));
  return current.find((item) => {
    const id = String(item.id || '');
    return Boolean(item.parentId) && referencedShopIds.has(id) && !nextIds.has(id);
  }) || null;
}
