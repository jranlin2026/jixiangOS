import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Popover, Typography } from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import { settingsApi } from '../../api';
import type { CustomerFilters } from '../../types/customer';
import type { LeadSourceConfig } from '../../types/settings';
import { buildCustomerLeadSourceOptions } from './customerLeadSourceFilterModel';

type LeadSourceFilterValue = Pick<CustomerFilters, 'leadSource' | 'sourceName'>;
type Props = { value: LeadSourceFilterValue; onApply: (value: LeadSourceFilterValue) => void };

export default function CustomerLeadSourceFilter({ value, onApply }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [configs, setConfigs] = useState<LeadSourceConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<LeadSourceFilterValue>(value);
  const options = useMemo(() => buildCustomerLeadSourceOptions(configs), [configs]);
  const groups = useMemo(() => Array.from(new Set(options.map((option) => option.parentName))), [options]);
  const selected = options.find((option) => (
    option.parentName === value.leadSource && option.childName === (value.sourceName || '')
  ));

  useEffect(() => setDraft(value), [value]);

  const loadConfigs = () => {
    setLoading(true);
    setError('');
    void settingsApi.fetchLeadSourceConfigs()
      .then((response) => {
        if (response.code !== 0) throw new Error(response.message || '线索来源加载失败');
        setConfigs(response.data);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : '线索来源加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadConfigs(); }, []);

  const clear = () => {
    const next = { leadSource: undefined, sourceName: undefined };
    setDraft(next);
    onApply(next);
    setAnchor(null);
  };

  return <>
    <Button
      variant="outlined"
      size="small"
      startIcon={<FilterListIcon />}
      onClick={(event) => { setDraft(value); setAnchor(event.currentTarget); }}
      sx={{ minHeight: 40, bgcolor: '#fff', color: '#334155', borderColor: '#cbd5e1' }}
    >
      {selected ? `线索来源：${selected.label}` : '线索来源'}
    </Button>
    <Popover
      open={Boolean(anchor)}
      anchorEl={anchor}
      onClose={() => setAnchor(null)}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
    >
      <Box sx={{ width: { xs: 'calc(100vw - 32px)', sm: 420 }, maxHeight: '70vh', overflowY: 'auto', p: 2 }}>
        <Typography fontWeight={700} sx={{ mb: 1 }}>线索来源筛选</Typography>
        {loading && <CircularProgress size={20} />}
        {error && <Alert severity="error" action={<Button color="inherit" size="small" onClick={loadConfigs}>重试</Button>}>{error}</Alert>}
        {!loading && !error && !options.length && <Typography variant="body2" color="text.secondary">暂无可用线索来源</Typography>}
        {!loading && !error && groups.map((group) => (
          <Box key={group} sx={{ mt: 1.5 }}>
            <Typography variant="caption" color="text.secondary">{group}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 0.5 }}>
              {options.filter((option) => option.parentName === group).map((option) => {
                const isSelected = draft.leadSource === option.parentName && (draft.sourceName || '') === option.childName;
                return (
                  <Chip
                    key={option.key}
                    label={option.childName || option.parentName}
                    size="small"
                    clickable
                    color={isSelected ? 'primary' : 'default'}
                    variant={isSelected ? 'filled' : 'outlined'}
                    onClick={() => setDraft({ leadSource: option.parentName, sourceName: option.childName || undefined })}
                  />
                );
              })}
            </Box>
          </Box>
        ))}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 2 }}>
          <Button onClick={clear}>清除筛选</Button>
          <Button
            disabled={loading || Boolean(error) || !draft.leadSource}
            variant="contained"
            onClick={() => { onApply(draft); setAnchor(null); }}
          >
            应用
          </Button>
        </Box>
      </Box>
    </Popover>
  </>;
}
