import type { BrowserScriptTemplate } from '../../types/browserAgent';

export const byScriptOrder = <T extends { id: string; sortOrder: number }>(items: T[]) => [...items]
  .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));

export const normalizeScriptOrder = <T extends { sortOrder: number }>(items: T[]) => items
  .map((item, index) => ({ ...item, sortOrder: (index + 1) * 10 }));

export const moveScriptItem = <T extends { id: string; sortOrder: number }>(items: T[], id: string, offset: -1 | 1) => {
  const ordered = byScriptOrder(items);
  const from = ordered.findIndex((item) => item.id === id);
  const to = from + offset;
  if (from < 0 || to < 0 || to >= ordered.length) return items;
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return normalizeScriptOrder(ordered);
};

export const setRecommendedScript = (scripts: BrowserScriptTemplate[], scriptId: string) => scripts.map((script) => ({
  ...script,
  priority: script.id === scriptId && script.enabled ? 1 : 0,
}));

export const resolveRecommendedScriptId = (scripts: BrowserScriptTemplate[]) => [...scripts]
  .filter((script) => script.enabled)
  .sort((left, right) => right.priority - left.priority || left.sortOrder - right.sortOrder)[0]?.id;
