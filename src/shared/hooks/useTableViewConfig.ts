import { useEffect, useMemo, useState } from 'react';
import type { TableViewColumnConfig } from '../components/TableViewSettingsDialog';

export type TableViewConfig = {
  visibleColumnIds: string[];
  columnOrder: string[];
  frozenColumnCount: number;
};

const getDefaultConfig = (columns: TableViewColumnConfig[], defaultVisibleColumnIds: string[]): TableViewConfig => ({
  visibleColumnIds: defaultVisibleColumnIds.filter((id) => columns.some((column) => column.id === id)),
  columnOrder: columns.map((column) => column.id),
  frozenColumnCount: 0,
});

const normalizeConfig = (
  value: unknown,
  columns: TableViewColumnConfig[],
  defaultVisibleColumnIds: string[],
): TableViewConfig => {
  const validIds = new Set(columns.map((column) => column.id));
  const defaultConfig = getDefaultConfig(columns, defaultVisibleColumnIds);

  if (Array.isArray(value)) {
    const visibleColumnIds = value.filter((id): id is string => typeof id === 'string' && validIds.has(id));
    return { ...defaultConfig, visibleColumnIds: visibleColumnIds.length ? visibleColumnIds : defaultConfig.visibleColumnIds };
  }

  if (!value || typeof value !== 'object') return defaultConfig;

  const config = value as Partial<TableViewConfig>;
  const visibleColumnIds = Array.isArray(config.visibleColumnIds)
    ? config.visibleColumnIds.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : defaultConfig.visibleColumnIds;
  const configuredOrder = Array.isArray(config.columnOrder)
    ? config.columnOrder.filter((id): id is string => typeof id === 'string' && validIds.has(id))
    : [];
  const configuredOrderSet = new Set(configuredOrder);
  const defaultVisibleMissingIds = defaultVisibleColumnIds.filter((id) => (
    validIds.has(id) && !visibleColumnIds.includes(id) && !configuredOrderSet.has(id)
  ));
  const visibleColumnIdsWithNewDefaults = [...visibleColumnIds, ...defaultVisibleMissingIds];
  const missingOrderIds = columns.map((column) => column.id).filter((id) => !configuredOrder.includes(id));
  const normalizedVisibleColumnIds = visibleColumnIdsWithNewDefaults.length ? visibleColumnIdsWithNewDefaults : defaultConfig.visibleColumnIds;
  const frozenColumnCount = Number.isFinite(config.frozenColumnCount)
    ? Math.max(0, Math.min(Number(config.frozenColumnCount), normalizedVisibleColumnIds.length))
    : defaultConfig.frozenColumnCount;

  return {
    visibleColumnIds: normalizedVisibleColumnIds,
    columnOrder: [...configuredOrder, ...missingOrderIds],
    frozenColumnCount,
  };
};

const readConfig = (
  storageKey: string,
  columns: TableViewColumnConfig[],
  defaultVisibleColumnIds: string[],
) => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return getDefaultConfig(columns, defaultVisibleColumnIds);
    return normalizeConfig(JSON.parse(raw), columns, defaultVisibleColumnIds);
  } catch {
    return getDefaultConfig(columns, defaultVisibleColumnIds);
  }
};

const orderColumns = <TColumn extends TableViewColumnConfig>(columns: TColumn[], columnOrder: string[]) => {
  const columnMap = new Map(columns.map((column) => [column.id, column]));
  const ordered = columnOrder
    .map((columnId) => columnMap.get(columnId))
    .filter((column): column is TColumn => Boolean(column));
  const orderedIds = new Set(ordered.map((column) => column.id));
  const next = [...ordered];
  const missing = columns.filter((column) => !orderedIds.has(column.id));

  missing.forEach((column) => {
    const naturalIndex = columns.findIndex((item) => item.id === column.id);
    const previousNaturalIds = columns.slice(0, naturalIndex).map((item) => item.id).reverse();
    const previousIndex = previousNaturalIds
      .map((id) => next.findIndex((item) => item.id === id))
      .find((index) => index >= 0);
    if (previousIndex !== undefined) {
      next.splice(previousIndex + 1, 0, column);
      return;
    }
    const nextNaturalIds = columns.slice(naturalIndex + 1).map((item) => item.id);
    const nextIndex = nextNaturalIds
      .map((id) => next.findIndex((item) => item.id === id))
      .find((index) => index >= 0);
    if (nextIndex !== undefined) next.splice(nextIndex, 0, column);
    else next.push(column);
  });

  return next;
};

export const useTableViewConfig = <TColumn extends TableViewColumnConfig>(
  storageKey: string,
  columns: TColumn[],
  defaultVisibleColumnIds: string[],
) => {
  const [viewConfig, setViewConfig] = useState<TableViewConfig>(() => readConfig(storageKey, columns, defaultVisibleColumnIds));

  useEffect(() => {
    setViewConfig((current) => normalizeConfig(current, columns, defaultVisibleColumnIds));
  }, [columns, defaultVisibleColumnIds]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(viewConfig));
  }, [storageKey, viewConfig]);

  const orderedColumns = useMemo(
    () => orderColumns(columns, viewConfig.columnOrder),
    [columns, viewConfig.columnOrder],
  );
  const visibleColumnIds = viewConfig.visibleColumnIds;
  const visibleColumns = useMemo(
    () => orderedColumns.filter((column) => visibleColumnIds.includes(column.id)),
    [orderedColumns, visibleColumnIds],
  );
  const frozenColumnCount = Math.min(viewConfig.frozenColumnCount, visibleColumns.length);

  const toggleColumn = (columnId: string) => {
    setViewConfig((current) => {
      const nextVisibleColumnIds = current.visibleColumnIds.includes(columnId)
        ? current.visibleColumnIds.filter((id) => id !== columnId)
        : [...current.visibleColumnIds, columnId];
      if (!nextVisibleColumnIds.length) return current;
      return {
        ...current,
        visibleColumnIds: nextVisibleColumnIds,
        frozenColumnCount: Math.min(current.frozenColumnCount, nextVisibleColumnIds.length),
      };
    });
  };

  const reorderColumn = (sourceColumnId: string, targetColumnId: string) => {
    setViewConfig((current) => {
      const columnOrder = current.columnOrder.length ? current.columnOrder : columns.map((column) => column.id);
      const sourceIndex = columnOrder.indexOf(sourceColumnId);
      const targetIndex = columnOrder.indexOf(targetColumnId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return current;
      const nextOrder = [...columnOrder];
      const [movedColumnId] = nextOrder.splice(sourceIndex, 1);
      nextOrder.splice(targetIndex, 0, movedColumnId);
      return { ...current, columnOrder: nextOrder };
    });
  };

  const setFrozenColumnCount = (value: number) => {
    setViewConfig((current) => ({
      ...current,
      frozenColumnCount: Math.max(0, Math.min(value, current.visibleColumnIds.length)),
    }));
  };

  const resetViewConfig = () => {
    setViewConfig(getDefaultConfig(columns, defaultVisibleColumnIds));
  };

  return {
    viewConfig,
    visibleColumnIds,
    visibleColumns,
    frozenColumnCount,
    toggleColumn,
    reorderColumn,
    setFrozenColumnCount,
    resetViewConfig,
  };
};
