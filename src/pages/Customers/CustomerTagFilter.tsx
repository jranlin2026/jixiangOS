import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, FormControl, FormControlLabel, InputLabel, MenuItem, Popover, Radio, RadioGroup, Select, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { fetchCustomerTagCatalog } from '../../api/customerTagApi';
import type { CustomerFilters } from '../../types/customer';
import type { CustomerTagCatalog } from '../../types/tag';

type TagFilterValue = Pick<CustomerFilters, 'tagIds' | 'tagMatch' | 'withoutTags' | 'missingTagGroupId'>;
type Props = { value: TagFilterValue; onApply: (value: TagFilterValue) => void };
const emptyCatalog: CustomerTagCatalog = { groups: [], tags: [] };

export default function CustomerTagFilter({ value, onApply }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<TagFilterValue>(value);
  useEffect(() => setDraft(value), [value]);
  const loadCatalog = () => {
    setLoading(true);
    setError('');
    void fetchCustomerTagCatalog('customer', false).then((response) => {
      if (response.code !== 0) throw new Error(response.message || '标签目录加载失败');
      setCatalog(response.data);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : '标签目录加载失败')).finally(() => setLoading(false));
  };
  useEffect(() => { loadCatalog(); }, []);
  const activeGroups = useMemo(() => catalog.groups.filter((group) => group.isActive && (group.scope === 'customer' || group.scope === 'both')).sort((a, b) => a.sortOrder - b.sortOrder), [catalog]);
  const selectedCount = (value.tagIds?.length || 0) + (value.withoutTags ? 1 : 0) + (value.missingTagGroupId ? 1 : 0);
  const toggle = (id: string) => setDraft((current) => ({ ...current, withoutTags: undefined, missingTagGroupId: undefined, tagIds: current.tagIds?.includes(id) ? current.tagIds.filter((item) => item !== id) : [...(current.tagIds || []), id] }));
  const clear = () => { const next = { tagIds: [], tagMatch: 'grouped' as const, withoutTags: undefined, missingTagGroupId: undefined }; setDraft(next); onApply(next); setAnchor(null); };
  return <>
    <Button variant="outlined" size="small" startIcon={<FilterListIcon />} onClick={(event) => { setDraft(value); setAnchor(event.currentTarget); }} sx={{ minHeight: 40, bgcolor: '#fff', color: '#334155', borderColor: '#cbd5e1' }}>
      客户标签{selectedCount ? ` (${selectedCount})` : ''}
    </Button>
    <Popover open={Boolean(anchor)} anchorEl={anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
      <Box sx={{ width: { xs: 'calc(100vw - 32px)', sm: 420 }, maxHeight: '70vh', overflowY: 'auto', p: 2 }}>
        <Typography fontWeight={700} sx={{ mb: 1 }}>客户标签筛选</Typography>
        <RadioGroup row value={draft.tagMatch || 'grouped'} onChange={(event) => setDraft({ ...draft, tagMatch: event.target.value as any })} sx={{ flexDirection: { xs: 'column', sm: 'row' }, flexWrap: 'wrap' }}>
          <FormControlLabel value="grouped" control={<Radio size="small" />} label="按分组匹配" />
          <FormControlLabel value="any" control={<Radio size="small" />} label="包含任意标签" />
          <FormControlLabel value="all" control={<Radio size="small" />} label="同时包含全部标签" />
        </RadioGroup>
        {loading && <CircularProgress size={20} />}
        {error && <Alert severity="error" action={<Button color="inherit" size="small" onClick={loadCatalog}>重试</Button>}>{error}</Alert>}
        {!loading && !error && activeGroups.map((group) => <Box key={group.id} sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">{group.name}</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
            {catalog.tags.filter((tag) => tag.isActive && tag.groupId === group.id).map((tag) => <Chip key={tag.id} label={tag.name} size="small" clickable color={draft.tagIds?.includes(tag.id) ? 'primary' : 'default'} variant={draft.tagIds?.includes(tag.id) ? 'filled' : 'outlined'} onClick={() => toggle(tag.id)} />)}
          </Box>
        </Box>)}
        <FormControlLabel sx={{ mt: 1 }} control={<Checkbox disabled={loading || Boolean(error)} checked={Boolean(draft.withoutTags)} onChange={(event) => setDraft({ tagIds: [], tagMatch: draft.tagMatch || 'grouped', withoutTags: event.target.checked || undefined, missingTagGroupId: undefined })} />} label="无人工标签" />
        <FormControl disabled={loading || Boolean(error)} fullWidth size="small" sx={{ mt: 1 }}><InputLabel>未设置某分组</InputLabel><Select label="未设置某分组" value={draft.missingTagGroupId || ''} onChange={(event) => setDraft({ tagIds: [], tagMatch: draft.tagMatch || 'grouped', withoutTags: undefined, missingTagGroupId: event.target.value || undefined })}><MenuItem value="">不限</MenuItem>{activeGroups.map((group) => <MenuItem key={group.id} value={group.id}>{group.name}</MenuItem>)}</Select></FormControl>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}><Button onClick={clear}>清除筛选</Button><Button disabled={loading || Boolean(error)} variant="contained" onClick={() => { onApply(draft); setAnchor(null); }}>应用</Button></Box>
      </Box>
    </Popover>
  </>;
}
