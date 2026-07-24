import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Popover, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { customerApi } from '../../api';
import { fetchCustomerTagCatalog } from '../../api/customerTagApi';
import type { CustomerFilters, CustomerTagFacet } from '../../types/customer';
import type { CustomerTagCatalog } from '../../types/tag';

type TagFilterValue = Pick<CustomerFilters, 'tagIds' | 'tagMatch' | 'withoutTags' | 'missingTagGroupId'>;
type Props = { value: TagFilterValue; scope: 'active' | 'public_pool'; onApply: (value: TagFilterValue) => void };
const emptyCatalog: CustomerTagCatalog = { groups: [], tags: [] };

export default function CustomerTagFilter({ value, scope, onApply }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [facets, setFacets] = useState<CustomerTagFacet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<TagFilterValue>(value);
  useEffect(() => setDraft(value), [value]);
  const loadFilterOptions = () => {
    setLoading(true);
    setError('');
    void Promise.all([
      fetchCustomerTagCatalog('customer', false),
      customerApi.fetchCustomerTagFacets(scope),
    ]).then(([catalogResponse, facetResponse]) => {
      if (catalogResponse.code !== 0) throw new Error(catalogResponse.message || '标签目录加载失败');
      if (facetResponse.code !== 0) throw new Error(facetResponse.message || '标签统计加载失败');
      setCatalog(catalogResponse.data);
      setFacets(facetResponse.data);
    }).catch((cause) => setError(cause instanceof Error ? cause.message : '标签目录加载失败')).finally(() => setLoading(false));
  };
  useEffect(() => { loadFilterOptions(); }, [scope]);
  const activeGroups = useMemo(() => catalog.groups.filter((group) => group.isActive && (group.scope === 'customer' || group.scope === 'both')).sort((a, b) => a.sortOrder - b.sortOrder), [catalog]);
  const facetCounts = useMemo(() => new Map(facets.map((facet) => [facet.tagId, facet.count])), [facets]);
  const activeTagsByGroup = useMemo(() => new Map(activeGroups.map((group) => [
    group.id,
    catalog.tags
      .filter((tag) => tag.isActive && tag.groupId === group.id)
      .filter((tag) => (facetCounts.get(tag.id) || 0) > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  ])), [activeGroups, catalog.tags, facetCounts]);
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
        <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">匹配规则</Typography>
          <Box role="radiogroup" aria-label="客户标签匹配规则" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
            {([
              ['grouped', '按分组匹配'],
              ['any', '包含任意标签'],
              ['all', '同时包含全部标签'],
            ] as const).map(([mode, label]) => {
              const isSelected = (draft.tagMatch || 'grouped') === mode;
              return <Chip key={mode} role="radio" aria-checked={isSelected} label={label} size="small" clickable color={isSelected ? 'primary' : 'default'} variant={isSelected ? 'filled' : 'outlined'} onClick={() => setDraft({ ...draft, tagMatch: mode })} />;
            })}
          </Box>
        </Box>
        {loading && <CircularProgress size={20} />}
        {error && <Alert severity="error" action={<Button color="inherit" size="small" onClick={loadFilterOptions}>重试</Button>}>{error}</Alert>}
        {!loading && !error && !activeGroups.some((group) => (activeTagsByGroup.get(group.id) || []).length) && <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>暂无可用客户标签</Typography>}
        {!loading && !error && activeGroups.map((group) => {
          const tags = activeTagsByGroup.get(group.id) || [];
          if (!tags.length) return null;
          return <Box key={group.id} sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">{group.name}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
              {tags.map((tag) => {
                const isSelected = Boolean(draft.tagIds?.includes(tag.id));
                return <Chip key={tag.id} aria-pressed={isSelected} label={`${tag.name}（${facetCounts.get(tag.id) || 0}）`} size="small" clickable color={isSelected ? 'primary' : 'default'} variant={isSelected ? 'filled' : 'outlined'} onClick={() => toggle(tag.id)} />;
              })}
            </Box>
          </Box>;
        })}
        {!loading && !error && <Box sx={{ mt: 1.5 }}>
          <Typography variant="caption" color="text.secondary">特殊筛选</Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
            <Chip
              label="无人工标签"
              aria-pressed={Boolean(draft.withoutTags)}
              size="small"
              clickable
              color={draft.withoutTags ? 'primary' : 'default'}
              variant={draft.withoutTags ? 'filled' : 'outlined'}
              onClick={() => setDraft({ tagIds: [], tagMatch: draft.tagMatch || 'grouped', withoutTags: draft.withoutTags ? undefined : true, missingTagGroupId: undefined })}
            />
            {activeGroups.map((group) => {
              const isSelected = draft.missingTagGroupId === group.id;
              return <Chip key={group.id} aria-pressed={isSelected} label={`未设置：${group.name}`} size="small" clickable color={isSelected ? 'primary' : 'default'} variant={isSelected ? 'filled' : 'outlined'} onClick={() => setDraft({ tagIds: [], tagMatch: draft.tagMatch || 'grouped', withoutTags: undefined, missingTagGroupId: isSelected ? undefined : group.id })} />;
            })}
          </Box>
        </Box>}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}><Button onClick={clear}>清除筛选</Button><Button disabled={loading || Boolean(error)} variant="contained" onClick={() => { onApply(draft); setAnchor(null); }}>应用</Button></Box>
      </Box>
    </Popover>
  </>;
}
