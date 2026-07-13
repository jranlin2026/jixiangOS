import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  Divider, List, ListItemButton, Stack, TextField, Typography,
} from '@mui/material';
import { fetchCustomerTagCatalog } from '../../api/customerTagApi';
import type { CustomerTagCatalog } from '../../types/tag';
import { normalizeManualTagIds, validateManualTagSelection } from '../utils/customerTagPolicy';
import { withTimeout } from '../utils/promiseTimeout';
import DialogCloseTitle from './DialogCloseTitle';

const emptyCatalog: CustomerTagCatalog = { groups: [], tags: [] };
const CATALOG_LOAD_TIMEOUT_MS = 8000;

export interface CustomerTagDialogProps {
  open: boolean;
  initialIds?: string[];
  legacyNames?: string[];
  saving?: boolean;
  onClose: () => void;
  onConfirm: (ids: string[]) => Promise<void> | void;
}

const CustomerTagDialog: React.FC<CustomerTagDialogProps> = ({
  open, initialIds = [], legacyNames = [], saving = false, onClose, onConfirm,
}) => {
  const initialIdsKey = JSON.stringify(initialIds);
  const normalizedInitialIds = useMemo(() => normalizeManualTagIds(initialIds), [initialIdsKey]);
  const [catalog, setCatalog] = useState<CustomerTagCatalog>(emptyCatalog);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSelectedIds(normalizedInitialIds);
    setSearch('');
    setError('');
    setLoading(true);
    void withTimeout(fetchCustomerTagCatalog('customer', false), CATALOG_LOAD_TIMEOUT_MS, '标签目录加载超时，请重试').then((response) => {
      if (response.code !== 0 || !response.data) {
        setError(response.message || '标签目录加载失败');
        return;
      }
      const activeGroups = response.data.groups.filter((group) => group.isActive);
      setCatalog(response.data);
      setSelectedGroupId((current) => activeGroups.some((group) => group.id === current) ? current : activeGroups[0]?.id || '');
    }).catch((cause) => setError(cause instanceof Error ? cause.message : '标签目录加载失败')).finally(() => setLoading(false));
  }, [normalizedInitialIds, open]);

  const activeGroups = useMemo(
    () => catalog.groups.filter((group) => group.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [catalog.groups],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleGroups = useMemo(() => activeGroups.filter((group) => {
    if (!normalizedSearch) return true;
    return group.name.toLocaleLowerCase().includes(normalizedSearch)
      || catalog.tags.some((tag) => tag.groupId === group.id && tag.isActive && tag.name.toLocaleLowerCase().includes(normalizedSearch));
  }), [activeGroups, catalog.tags, normalizedSearch]);
  const currentGroup = activeGroups.find((group) => group.id === selectedGroupId) || visibleGroups[0] || null;
  const visibleTags = useMemo(() => currentGroup
    ? catalog.tags.filter((tag) => tag.groupId === currentGroup.id && tag.isActive && (!normalizedSearch || tag.name.toLocaleLowerCase().includes(normalizedSearch))).sort((a, b) => a.sortOrder - b.sortOrder)
    : [], [catalog.tags, currentGroup, normalizedSearch]);
  const activeTagIds = new Set(catalog.tags.filter((tag) => tag.isActive).map((tag) => tag.id));
  const unresolvedIds = selectedIds.filter((id) => !activeTagIds.has(id));

  const toggleTag = (tagId: string) => {
    if (!currentGroup) return;
    setSelectedIds((current) => {
      if (current.includes(tagId)) return current.filter((id) => id !== tagId);
      if (currentGroup.selectionMode === 'single') {
        const otherGroupTagIds = new Set(catalog.tags.filter((tag) => tag.groupId === currentGroup.id).map((tag) => tag.id));
        return normalizeManualTagIds([...current.filter((id) => !otherGroupTagIds.has(id)), tagId]);
      }
      return normalizeManualTagIds([...current, tagId]);
    });
  };

  const confirm = async () => {
    const activeSelection = selectedIds.filter((id) => activeTagIds.has(id));
    const validation = validateManualTagSelection(catalog, 'customer', activeSelection);
    if (!validation.ok) { setError(validation.message); return; }
    setError('');
    await onConfirm([...unresolvedIds, ...validation.tagIds]);
  };

  return (
    <Dialog open={open} onClose={() => !saving && onClose()} maxWidth="md" fullWidth>
      <DialogCloseTitle onClose={() => !saving && onClose()}>设置标签</DialogCloseTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <TextField value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索标签或分组" size="small" fullWidth sx={{ p: 2, pb: 1 }} />
        {error && <Alert severity="error" sx={{ mx: 2, mb: 1 }}>{error}</Alert>}
        {loading ? <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={28} /></Box> : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '180px minmax(0, 1fr)' }, minHeight: 320 }}>
            <Box sx={{ borderRight: { sm: '1px solid #e5e7eb' }, borderBottom: { xs: '1px solid #e5e7eb', sm: 0 }, bgcolor: '#f8fafc' }}>
              <List dense disablePadding>
                {visibleGroups.map((group) => {
                  const count = catalog.tags.filter((tag) => tag.groupId === group.id && tag.isActive).length;
                  return <ListItemButton key={group.id} selected={group.id === currentGroup?.id} onClick={() => setSelectedGroupId(group.id)}>
                    <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: group.color, mr: 1 }} />
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: group.id === currentGroup?.id ? 700 : 400 }}>{group.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#94a3b8' }}>{count}</Typography>
                  </ListItemButton>;
                })}
                {!visibleGroups.length && <Typography variant="body2" sx={{ p: 2, color: '#94a3b8' }}>没有匹配的标签</Typography>}
              </List>
            </Box>
            <Box sx={{ p: 2 }}>
              {currentGroup ? <>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography sx={{ fontWeight: 700 }}>{currentGroup.name}</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>{currentGroup.selectionMode === 'single' ? '单选' : '多选'}</Typography>
                </Stack>
                <Stack direction="row" flexWrap="wrap" gap={1}>
                  {visibleTags.map((tag) => <Chip key={tag.id} label={tag.name} clickable onClick={() => toggleTag(tag.id)} color={selectedIds.includes(tag.id) ? 'primary' : 'default'} variant={selectedIds.includes(tag.id) ? 'filled' : 'outlined'} sx={{ borderColor: tag.color || currentGroup.color, color: selectedIds.includes(tag.id) ? undefined : tag.color || currentGroup.color }} />)}
                  {!visibleTags.length && <Typography variant="body2" sx={{ color: '#94a3b8' }}>该分组暂无匹配标签</Typography>}
                </Stack>
              </> : <Typography variant="body2" sx={{ color: '#94a3b8' }}>暂无可用标签分组</Typography>}
              {unresolvedIds.length > 0 && <><Divider sx={{ my: 2 }} /><Typography variant="caption" sx={{ color: '#64748b' }}>历史标签</Typography><Stack direction="row" flexWrap="wrap" gap={0.5} sx={{ mt: 0.5 }}>{unresolvedIds.map((id, index) => <Chip key={id} size="small" label={`${legacyNames[index] || '已停用标签'} · 已停用`} onDelete={() => setSelectedIds((current) => current.filter((item) => item !== id))} />)}</Stack></>}
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions><Button onClick={onClose} disabled={saving}>取消</Button><Button variant="contained" disabled={loading || saving} onClick={() => void confirm()}>{saving ? '保存中…' : '确定'}</Button></DialogActions>
    </Dialog>
  );
};

export default CustomerTagDialog;
