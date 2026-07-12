import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, Chip, CircularProgress, TextField, Typography } from '@mui/material';
import { fetchCustomerTagCatalog } from '../../api/customerTagApi';
import type { CustomerTag, CustomerTagCatalog, CustomerTagGroup } from '../../types/tag';
import { normalizeManualTagIds, validateManualTagSelection } from '../utils/customerTagPolicy';

type AssignmentScope = 'lead' | 'customer';

export interface ManualTagSelectorProps {
  scope: 'lead' | 'customer';
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  includeInactiveSelected?: boolean;
  legacyNames?: string[];
}

type TagOption = CustomerTag & { group: CustomerTagGroup };

const appliesTo = (group: CustomerTagGroup, scope: AssignmentScope) => group.scope === 'both' || group.scope === scope;
const tagColor = (option: TagOption) => option.color || option.group.color || '#64748b';

export const ManualTagSelector: React.FC<ManualTagSelectorProps> = ({
  scope, value, onChange, disabled = false, includeInactiveSelected = true, legacyNames = [],
}) => {
  const [catalog, setCatalog] = useState<CustomerTagCatalog>({ groups: [], tags: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    fetchCustomerTagCatalog(scope, includeInactiveSelected).then((response) => {
      if (!alive) return;
      if (response.code !== 0) throw new Error(response.message || '标签目录加载失败');
      setCatalog(response.data);
    }).catch((reason) => {
      if (alive) setError(reason instanceof Error ? reason.message : '标签目录加载失败');
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [includeInactiveSelected, scope]);

  const options = useMemo<TagOption[]>(() => {
    const groups = new Map(catalog.groups.map((group) => [group.id, group]));
    return catalog.tags.flatMap((tag) => {
      const group = groups.get(tag.groupId);
      if (!group || !appliesTo(group, scope)) return [];
      const selected = value.includes(tag.id);
      if ((!group.isActive || !tag.isActive) && !(includeInactiveSelected && selected)) return [];
      return [{ ...tag, group }];
    }).sort((a, b) => a.group.sortOrder - b.group.sortOrder || a.sortOrder - b.sortOrder);
  }, [catalog, includeInactiveSelected, scope, value]);
  const selected = options.filter((option) => value.includes(option.id));
  const knownNames = new Set(selected.map((option) => option.name));
  const historicalNames = legacyNames.map((name) => name.trim()).filter((name) => name && !knownNames.has(name));

  const updateSelection = (nextOptions: TagOption[]) => {
    let nextIds = normalizeManualTagIds(nextOptions.map((option) => option.id));
    const added = nextOptions.find((option) => !value.includes(option.id));
    if (added?.group.selectionMode === 'single') {
      nextIds = nextIds.filter((id) => id === added.id || catalog.tags.find((tag) => tag.id === id)?.groupId !== added.groupId);
    }
    if (nextIds.length > 20) {
      setError('每条记录最多选择 20 个标签');
      return;
    }
    const groupById = new Map(catalog.groups.map((group) => [group.id, group]));
    const retainedInactiveIds = nextIds.filter((id) => {
      if (!value.includes(id)) return false;
      const tag = catalog.tags.find((item) => item.id === id);
      const group = tag && groupById.get(tag.groupId);
      return !tag || !group || !tag.isActive || !group.isActive;
    });
    const activeIds = nextIds.filter((id) => !retainedInactiveIds.includes(id));
    const validation = validateManualTagSelection(catalog, scope, activeIds);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }
    setError('');
    onChange(nextIds);
  };

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <Autocomplete
        multiple
        disableCloseOnSelect
        options={options}
        value={selected}
        loading={loading}
        disabled={disabled || loading}
        isOptionEqualToValue={(option, item) => option.id === item.id}
        getOptionDisabled={(option) => !option.isActive || !option.group.isActive}
        getOptionLabel={(option) => `${option.name}${!option.isActive || !option.group.isActive ? ' (已停用)' : ''}`}
        groupBy={(option) => option.group.name}
        onChange={(_, next) => updateSelection(next)}
        renderGroup={(params) => (
          <li key={params.key}>
            <Box sx={{ px: 1.5, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f8fafc' }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: options.find((item) => item.group.name === params.group)?.group.color }} />
              <Typography variant="caption" fontWeight={700}>{params.group}</Typography>
            </Box>
            <ul style={{ padding: 0 }}>{params.children}</ul>
          </li>
        )}
        renderOption={(props, option) => <li {...props} key={option.id}><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: tagColor(option), mr: 1 }} />{option.name}{(!option.isActive || !option.group.isActive) && ' (已停用)'}</li>}
        renderTags={(items, getTagProps) => items.map((option, index) => <Chip {...getTagProps({ index })} key={option.id} size="small" label={`${option.name}${!option.isActive || !option.group.isActive ? ' · 已停用' : ''}`} sx={{ borderColor: tagColor(option), color: tagColor(option), maxWidth: '100%' }} variant="outlined" />)}
        renderInput={(params) => <TextField {...params} label="预设标签" placeholder={selected.length ? '' : '从标签目录中选择'} error={Boolean(error)} helperText={error || '最多选择 20 个标签'} InputProps={{ ...params.InputProps, endAdornment: <>{loading ? <CircularProgress size={18} /> : null}{params.InputProps.endAdornment}</> }} />}
      />
      {historicalNames.length > 0 && <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.75 }}>{historicalNames.map((name) => <Chip key={name} size="small" label={`${name} · 历史未归类`} sx={{ color: '#64748b', bgcolor: '#f1f5f9' }} />)}</Box>}
      {!loading && error && catalog.groups.length === 0 && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
};

export interface ManualTagDisplayProps { scope: AssignmentScope; ids?: string[]; legacyNames?: string[] }

export const ManualTagDisplay: React.FC<ManualTagDisplayProps> = ({ scope, ids = [], legacyNames = [] }) => {
  const [catalog, setCatalog] = useState<CustomerTagCatalog>({ groups: [], tags: [] });
  useEffect(() => { fetchCustomerTagCatalog(scope, true).then((res) => { if (res.code === 0) setCatalog(res.data); }).catch(() => undefined); }, [scope]);
  const groupById = new Map(catalog.groups.map((group) => [group.id, group]));
  const resolved = ids.flatMap((id) => { const tag = catalog.tags.find((item) => item.id === id); const group = tag && groupById.get(tag.groupId); return tag && group ? [{ ...tag, group }] : []; });
  const resolvedNames = new Set(resolved.map((tag) => tag.name));
  const historical = legacyNames.map((name) => name.trim()).filter((name) => name && !resolvedNames.has(name));
  if (!resolved.length && !historical.length) return <>-</>;
  return <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{resolved.map((tag) => <Chip key={tag.id} label={`${tag.name}${!tag.isActive || !tag.group.isActive ? ' · 已停用' : ''}`} size="small" variant="outlined" sx={{ height: 22, borderColor: tagColor(tag), color: tagColor(tag) }} />)}{historical.map((name) => <Chip key={name} label={`${name} · 历史未归类`} size="small" sx={{ height: 22, color: '#64748b', bgcolor: '#f1f5f9' }} />)}</Box>;
};

export default ManualTagSelector;
