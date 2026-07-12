import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Button, Chip, CircularProgress, TextField, Typography } from '@mui/material';
import { fetchCustomerTagCatalog } from '../../api/customerTagApi';
import type { CustomerTag, CustomerTagCatalog, CustomerTagGroup } from '../../types/tag';
import { normalizeManualTagIds, validateManualTagSelection } from '../utils/customerTagPolicy';
import { createManualTagCatalogCache, type ManualTagCatalogScope } from '../utils/manualTagCatalogCache';

type AssignmentScope = ManualTagCatalogScope;
type TagOption = CustomerTag & { group: CustomerTagGroup };
const emptyCatalog: CustomerTagCatalog = { groups: [], tags: [] };
const catalogCache = createManualTagCatalogCache((scope) => fetchCustomerTagCatalog(scope, false));

export function invalidateManualTagCatalogCache(scope?: AssignmentScope): void {
  catalogCache.invalidate(scope);
}

function useActiveManualTagCatalog(scope: AssignmentScope) {
  const [version, setVersion] = useState(() => catalogCache.getGeneration(scope));
  const [, render] = useState(0);
  useEffect(() => {
    setVersion(catalogCache.getGeneration(scope));
    return catalogCache.subscribe(scope, () => {
      setVersion(catalogCache.getGeneration(scope));
      render((value) => value + 1);
    });
  }, [scope]);
  useEffect(() => { void catalogCache.load(scope); }, [scope, version]);
  const state = catalogCache.getState(scope);
  return { ...state, catalog: state.catalog || emptyCatalog, retry: () => catalogCache.load(scope, true) };
}

export interface ManualTagSelectorProps {
  scope: 'lead' | 'customer';
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  includeInactiveSelected?: boolean;
  legacyNames?: string[];
}

const tagColor = (option: TagOption) => option.color || option.group.color || '#64748b';

export const ManualTagSelector: React.FC<ManualTagSelectorProps> = ({
  scope, value, onChange, disabled = false, includeInactiveSelected = true, legacyNames = [],
}) => {
  const { catalog, loading, error, retry } = useActiveManualTagCatalog(scope);
  const [selectionError, setSelectionError] = useState('');
  const options = useMemo<TagOption[]>(() => {
    const groups = new Map(catalog.groups.map((group) => [group.id, group]));
    return catalog.tags.flatMap((tag) => {
      const group = groups.get(tag.groupId);
      return group ? [{ ...tag, group }] : [];
    }).sort((a, b) => a.group.sortOrder - b.group.sortOrder || a.sortOrder - b.sortOrder);
  }, [catalog]);
  const selected = options.filter((option) => value.includes(option.id));
  const activeIds = new Set(options.map((option) => option.id));
  const unresolvedIds = includeInactiveSelected ? value.filter((id) => !activeIds.has(id)) : [];
  const snapshotById = new Map(value.map((id, index) => [id, legacyNames[index]]));
  const activeNames = new Set(selected.map((option) => option.name));
  const historicalNames = legacyNames.map((name) => name.trim()).filter((name) => name && !activeNames.has(name) && !unresolvedIds.some((id) => snapshotById.get(id) === name));

  const updateSelection = (nextOptions: TagOption[]) => {
    let nextActiveIds = normalizeManualTagIds(nextOptions.map((option) => option.id));
    const added = nextOptions.find((option) => !value.includes(option.id));
    if (added?.group.selectionMode === 'single') {
      nextActiveIds = nextActiveIds.filter((id) => id === added.id || catalog.tags.find((tag) => tag.id === id)?.groupId !== added.groupId);
    }
    const nextIds = [...unresolvedIds, ...nextActiveIds];
    if (nextIds.length > 20) { setSelectionError('每条记录最多选择 20 个标签'); return; }
    const validation = validateManualTagSelection(catalog, scope, nextActiveIds);
    if (!validation.ok) { setSelectionError(validation.message); return; }
    setSelectionError('');
    onChange(nextIds);
  };

  if (error && !catalog.groups.length) return <Alert severity="error" action={<Button size="small" onClick={() => void retry()}>重试</Button>}>标签目录加载失败：{error}</Alert>;
  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Autocomplete
        multiple disableCloseOnSelect options={options} value={selected} loading={loading} disabled={disabled || loading}
        isOptionEqualToValue={(option, item) => option.id === item.id}
        getOptionLabel={(option) => option.name}
        groupBy={(option) => option.group.name}
        onChange={(_, next) => updateSelection(next)}
        renderGroup={(params) => <li key={params.key}><Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f8fafc' }}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: options.find((item) => item.group.name === params.group)?.group.color }} /><Typography variant="caption" fontWeight={700}>{params.group}</Typography></Box><ul style={{ padding: 0 }}>{params.children}</ul></li>}
        renderOption={(props, option) => <li {...props} key={option.id}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tagColor(option), mr: 1 }} />{option.name}</li>}
        renderTags={(items, getTagProps) => items.map((option, index) => <Chip {...getTagProps({ index })} key={option.id} size="small" label={option.name} sx={{ borderColor: tagColor(option), color: tagColor(option), maxWidth: '100%' }} variant="outlined" />)}
        renderInput={(params) => <TextField {...params} label="预设标签" placeholder={selected.length ? '' : '从标签目录中选择'} error={Boolean(selectionError)} helperText={selectionError || '最多选择 20 个标签'} InputProps={{ ...params.InputProps, endAdornment: <>{loading ? <CircularProgress size={18} /> : null}{params.InputProps.endAdornment}</> }} />}
      />
      {unresolvedIds.length > 0 && <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>{unresolvedIds.map((id) => <Chip key={id} size="small" label={`${snapshotById.get(id) || '历史标签'} · 已停用`} onDelete={disabled ? undefined : () => onChange(value.filter((item) => item !== id))} sx={{ color: '#64748b', bgcolor: '#f1f5f9' }} />)}</Box>}
      {historicalNames.length > 0 && <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>{historicalNames.map((name) => <Chip key={name} size="small" label={`${name} · 历史未归类`} sx={{ color: '#64748b', bgcolor: '#f1f5f9' }} />)}</Box>}
    </Box>
  );
};

export interface ManualTagDisplayProps { scope: AssignmentScope; ids?: string[]; legacyNames?: string[] }

export const ManualTagDisplay: React.FC<ManualTagDisplayProps> = ({ scope, ids = [], legacyNames = [] }) => {
  const { catalog, loading, error, retry } = useActiveManualTagCatalog(scope);
  if (loading && !catalog.groups.length) return <CircularProgress size={16} />;
  if (error && !catalog.groups.length) return <Alert severity="error" action={<Button size="small" onClick={() => void retry()}>重试</Button>} sx={{ py: 0 }}>标签加载失败</Alert>;
  const groupById = new Map(catalog.groups.map((group) => [group.id, group]));
  const resolved = ids.flatMap((id) => { const tag = catalog.tags.find((item) => item.id === id); const group = tag && groupById.get(tag.groupId); return tag && group ? [{ ...tag, group }] : []; });
  const resolvedIds = new Set(resolved.map((tag) => tag.id));
  const snapshotById = new Map(ids.map((id, index) => [id, legacyNames[index]]));
  const unresolved = ids.filter((id) => !resolvedIds.has(id));
  const usedNames = new Set([...resolved.map((tag) => tag.name), ...unresolved.map((id) => snapshotById.get(id)).filter(Boolean)]);
  const historical = legacyNames.map((name) => name.trim()).filter((name) => name && !usedNames.has(name));
  if (!resolved.length && !unresolved.length && !historical.length) return <>-</>;
  return <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{resolved.map((tag) => <Chip key={tag.id} label={tag.name} size="small" variant="outlined" sx={{ height: 22, borderColor: tagColor(tag), color: tagColor(tag) }} />)}{unresolved.map((id) => <Chip key={id} label={`${snapshotById.get(id) || '历史标签'} · 已停用`} size="small" sx={{ height: 22, color: '#64748b', bgcolor: '#f1f5f9' }} />)}{historical.map((name) => <Chip key={name} label={`${name} · 历史未归类`} size="small" sx={{ height: 22, color: '#64748b', bgcolor: '#f1f5f9' }} />)}</Box>;
};

export default ManualTagSelector;
