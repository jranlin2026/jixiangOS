import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  Divider, FormControl, FormControlLabel, InputLabel, List, ListItemButton, ListItemText,
  MenuItem, Paper, Select, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import EditIcon from '@mui/icons-material/Edit';
import GroupIcon from '@mui/icons-material/Group';
import MergeIcon from '@mui/icons-material/Merge';
import PersonIcon from '@mui/icons-material/Person';
import SyncIcon from '@mui/icons-material/Sync';
import {
  applyCustomerTagMigration, createCustomerTag, createCustomerTagGroup,
  fetchCustomerTagCatalog, mergeCustomerTag, previewCustomerTagMigration,
  reorderCustomerTags, updateCustomerTag, updateCustomerTagGroup,
} from '../../api/customerTagApi';
import type { CustomerTag, CustomerTagCatalog, CustomerTagGroup, CustomerTagMigrationPreview, ManualTagScope } from '../../types/tag';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import useAuthStore from '../../store/useAuthStore';
import { isSuperAdminRoleName } from '../../shared/utils/roles';
import { formatCustomerTagDialogError, staleMigrationMessage } from './customerTagSettingsState';

const scopeLabel: Record<ManualTagScope, string> = { lead: '线索', customer: '客户', both: '线索与客户' };
const emptyCatalog: CustomerTagCatalog = { groups: [], tags: [] };
type GroupDraft = Pick<CustomerTagGroup, 'name' | 'color' | 'selectionMode' | 'scope' | 'isActive' | 'sortOrder'>;
type TagDraft = Pick<CustomerTag, 'name' | 'color' | 'isActive' | 'sortOrder'>;
const emptyGroup: GroupDraft = { name: '', color: '#1677ff', selectionMode: 'multiple', scope: 'both', isActive: true, sortOrder: 100 };
const emptyTag: TagDraft = { name: '', color: '#1677ff', isActive: true, sortOrder: 100 };

const CustomerTagConfig: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const canManage = isSuperAdminRoleName(currentUser?.role);
  const [catalog, setCatalog] = useState<CustomerTagCatalog>(emptyCatalog);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [groupDialog, setGroupDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<CustomerTagGroup | null>(null);
  const [groupDraft, setGroupDraft] = useState<GroupDraft>(emptyGroup);
  const [tagDialog, setTagDialog] = useState(false);
  const [editingTag, setEditingTag] = useState<CustomerTag | null>(null);
  const [tagDraft, setTagDraft] = useState<TagDraft>(emptyTag);
  const [mergeSource, setMergeSource] = useState<CustomerTag | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState('');
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [preview, setPreview] = useState<CustomerTagMigrationPreview | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [migrationError, setMigrationError] = useState('');

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchCustomerTagCatalog('all', true);
      if (response.code !== 0) throw new Error(response.message || '客户标签加载失败');
      setCatalog(response.data);
      setSelectedGroupId((current) => response.data.groups.some((group) => group.id === current) ? current : response.data.groups[0]?.id || '');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '客户标签加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);

  const groups = useMemo(() => [...catalog.groups].sort((a, b) => a.sortOrder - b.sortOrder), [catalog.groups]);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const tags = useMemo(() => catalog.tags.filter((tag) => tag.groupId === selectedGroupId).sort((a, b) => a.sortOrder - b.sortOrder), [catalog.tags, selectedGroupId]);
  const compatibleTargets = useMemo(() => catalog.tags.filter((tag) => tag.groupId === mergeSource?.groupId && tag.id !== mergeSource.id && tag.isActive), [catalog.tags, mergeSource]);

  const runMutation = async (operation: () => Promise<{ code: number; message: string }>, close?: () => void, setLocalError?: (message: string) => void) => {
    setSaving(true);
    setError('');
    setLocalError?.('');
    try {
      const response = await operation();
      if (response.code !== 0) {
        const message = formatCustomerTagDialogError(response.code, response.message);
        if (setLocalError) setLocalError(message); else setError(message);
        return false;
      }
      close?.();
      await loadCatalog();
      return true;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '操作失败';
      if (setLocalError) setLocalError(message); else setError(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const openGroup = (group?: CustomerTagGroup) => {
    setDialogError('');
    setEditingGroup(group || null);
    setGroupDraft(group ? { name: group.name, color: group.color, selectionMode: group.selectionMode, scope: group.scope, isActive: group.isActive, sortOrder: group.sortOrder } : { ...emptyGroup, sortOrder: groups.length + 1 });
    setGroupDialog(true);
  };
  const saveGroup = () => runMutation(
    () => editingGroup ? updateCustomerTagGroup(editingGroup.id, groupDraft) : createCustomerTagGroup(groupDraft),
    () => setGroupDialog(false),
    setDialogError,
  );
  const openTag = (tag?: CustomerTag) => {
    setDialogError('');
    setEditingTag(tag || null);
    setTagDraft(tag ? { name: tag.name, color: tag.color || selectedGroup?.color || '#1677ff', isActive: tag.isActive, sortOrder: tag.sortOrder } : { ...emptyTag, color: selectedGroup?.color || '#1677ff', sortOrder: tags.length + 1 });
    setTagDialog(true);
  };
  const saveTag = () => selectedGroup && runMutation(
    () => editingTag ? updateCustomerTag(editingTag.id, tagDraft) : createCustomerTag({ ...tagDraft, groupId: selectedGroup.id }),
    () => setTagDialog(false),
    setDialogError,
  );
  const moveTag = (tag: CustomerTag, direction: -1 | 1) => {
    const index = tags.findIndex((item) => item.id === tag.id);
    if (!tags[index + direction] || !selectedGroup) return;
    const nextIds = tags.map((item) => item.id);
    [nextIds[index], nextIds[index + direction]] = [nextIds[index + direction], nextIds[index]];
    void (async () => {
      const succeeded = await runMutation(() => reorderCustomerTags(selectedGroup.id, nextIds));
      if (!succeeded) await loadCatalog();
    })();
  };
  const openMigration = async () => {
    setMigrationOpen(true); setPreview(null); setConfirmation(''); setSaving(true); setMigrationError('');
    try {
      const response = await previewCustomerTagMigration();
      if (response.code !== 0) setMigrationError(formatCustomerTagDialogError(response.code, response.message || '迁移预览失败'));
      else setPreview(response.data);
    } catch (cause) { setMigrationError(cause instanceof Error ? cause.message : '迁移预览失败'); }
    finally { setSaving(false); }
  };
  const applyMigration = async () => {
    if (!preview) return;
    setSaving(true); setMigrationError('');
    try {
      const response = await applyCustomerTagMigration(preview.checksum);
      if (response.code !== 0) {
        setMigrationError(response.code === 409 ? staleMigrationMessage(response.message) : formatCustomerTagDialogError(response.code, response.message));
        if (response.code === 409) { setPreview(null); setConfirmation(''); }
        return;
      }
      setMigrationOpen(false);
      await loadCatalog();
    } catch (cause) { setMigrationError(cause instanceof Error ? cause.message : '整理历史标签失败'); }
    finally { setSaving(false); }
  };

  if (loading) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={28} /><Typography variant="body2" sx={{ mt: 1, color: '#64748b' }}>正在加载人工标签…</Typography></Box>;

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>人工标签</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>按分组维护标签；客户生命周期请在现有“客户生命周期”页配置，不重复作为人工标签。</Typography>
        </Box>
        <Button startIcon={<SyncIcon />} variant="outlined" disabled={!canManage} onClick={() => void openMigration()}>整理历史标签</Button>
      </Stack>
      {!canManage && <Alert severity="info" sx={{ mb: 2 }}>当前账号可查看标签目录；仅超级管理员可以新增、编辑、启停、合并或整理历史标签。</Alert>}
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '280px minmax(0, 1fr)' }, gap: 2 }}>
        <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
            <Typography sx={{ fontWeight: 700 }}>标签分组</Typography>
            <Button size="small" startIcon={<AddIcon />} disabled={!canManage} onClick={() => openGroup()}>添加分组</Button>
          </Stack>
          <Divider />
          {groups.length === 0 ? <Typography variant="body2" sx={{ p: 3, textAlign: 'center', color: '#94a3b8' }}>暂无标签分组</Typography> : (
            <List disablePadding>{groups.map((group) => (
              <ListItemButton key={group.id} selected={group.id === selectedGroupId} onClick={() => setSelectedGroupId(group.id)} sx={{ gap: 1, borderBottom: '1px solid #f1f5f9' }}>
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: group.color, flex: '0 0 auto' }} />
                {group.scope === 'customer' ? <PersonIcon fontSize="small" color="action" /> : <GroupIcon fontSize="small" color="action" />}
                <ListItemText primary={group.name} secondary={`${scopeLabel[group.scope]} · ${group.selectionMode === 'single' ? '单选' : '多选'}${group.isActive ? '' : ' · 已停用'}`} primaryTypographyProps={{ fontWeight: 600 }} />
                {canManage && <Tooltip title="编辑分组"><Button size="small" onClick={(event) => { event.stopPropagation(); openGroup(group); }}><EditIcon fontSize="small" /></Button></Tooltip>}
              </ListItemButton>
            ))}</List>
          )}
        </Paper>

        <Paper variant="outlined" sx={{ minHeight: 420, p: 2 }}>
          {!selectedGroup ? <Box sx={{ py: 8, textAlign: 'center', color: '#94a3b8' }}>选择或添加一个标签分组</Box> : <>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
              <Box>
                <Stack direction="row" alignItems="center" spacing={1}><Typography variant="h6" sx={{ fontWeight: 700 }}>{selectedGroup.name}</Typography><Chip size="small" label={selectedGroup.isActive ? '启用' : '停用'} color={selectedGroup.isActive ? 'success' : 'default'} /></Stack>
                <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>选择模式：{selectedGroup.selectionMode === 'single' ? '单选' : '多选'}　适用范围：{scopeLabel[selectedGroup.scope]}</Typography>
              </Box>
              <Button variant="contained" size="small" startIcon={<AddIcon />} disabled={!canManage || !selectedGroup.isActive} onClick={() => openTag()}>添加标签</Button>
            </Stack>
            <Divider />
            {tags.length === 0 ? <Typography variant="body2" sx={{ py: 7, textAlign: 'center', color: '#94a3b8' }}>该分组暂无标签</Typography> : tags.map((tag, index) => (
              <Stack key={tag.id} direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1} sx={{ py: 1.25, borderBottom: '1px solid #f1f5f9', opacity: tag.isActive ? 1 : 0.58 }}>
                <Chip label={tag.name} size="small" sx={{ bgcolor: `${tag.color || selectedGroup.color}18`, color: tag.color || selectedGroup.color, border: `1px solid ${tag.color || selectedGroup.color}55`, alignSelf: { xs: 'flex-start', sm: 'center' } }} />
                <Typography variant="caption" sx={{ color: '#64748b', flex: 1 }}>使用 {tag.usageCount} 次 · 排序 {tag.sortOrder}</Typography>
                <Button size="small" disabled={!canManage || index === 0 || saving} onClick={() => moveTag(tag, -1)}><ArrowUpwardIcon fontSize="small" /></Button>
                <Button size="small" disabled={!canManage || index === tags.length - 1 || saving} onClick={() => moveTag(tag, 1)}><ArrowDownwardIcon fontSize="small" /></Button>
                <Button size="small" disabled={!canManage} onClick={() => openTag(tag)}>编辑</Button>
                <Button size="small" disabled={!canManage || !tag.isActive || !catalog.tags.some((target) => target.groupId === tag.groupId && target.id !== tag.id && target.isActive)} startIcon={<MergeIcon />} onClick={() => { setDialogError(''); setMergeSource(tag); setMergeTargetId(''); }}>合并标签</Button>
                <Button size="small" color={tag.isActive ? 'warning' : 'success'} disabled={!canManage || saving} onClick={() => void runMutation(() => updateCustomerTag(tag.id, { isActive: !tag.isActive }))}>{tag.isActive ? '停用' : '启用'}</Button>
              </Stack>
            ))}
            <Typography variant="caption" sx={{ display: 'block', mt: 2, color: '#94a3b8' }}>标签保留使用次数，不提供硬删除；不再使用时请停用，重复标签请合并。</Typography>
          </>}
        </Paper>
      </Box>

      <Dialog open={groupDialog} onClose={() => !saving && setGroupDialog(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setGroupDialog(false)}>{editingGroup ? '编辑标签分组' : '添加分组'}</DialogCloseTitle>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>
          {dialogError && <Alert severity="error">{dialogError}</Alert>}
          <TextField label="分组名称" required value={groupDraft.name} onChange={(e) => setGroupDraft({ ...groupDraft, name: e.target.value })} />
          <TextField label="分组颜色" type="color" value={groupDraft.color} onChange={(e) => setGroupDraft({ ...groupDraft, color: e.target.value })} />
          <FormControl><InputLabel>选择模式</InputLabel><Select label="选择模式" value={groupDraft.selectionMode} onChange={(e) => setGroupDraft({ ...groupDraft, selectionMode: e.target.value as GroupDraft['selectionMode'] })}><MenuItem value="single">单选</MenuItem><MenuItem value="multiple">多选</MenuItem></Select></FormControl>
          <FormControl><InputLabel>适用范围</InputLabel><Select label="适用范围" value={groupDraft.scope} onChange={(e) => setGroupDraft({ ...groupDraft, scope: e.target.value as ManualTagScope })}><MenuItem value="lead">线索</MenuItem><MenuItem value="customer">客户</MenuItem><MenuItem value="both">线索与客户</MenuItem></Select></FormControl>
          <TextField label="排序" type="number" value={groupDraft.sortOrder} onChange={(e) => setGroupDraft({ ...groupDraft, sortOrder: Number(e.target.value) })} />
          <FormControlLabel control={<Switch checked={groupDraft.isActive} onChange={(e) => setGroupDraft({ ...groupDraft, isActive: e.target.checked })} />} label={groupDraft.isActive ? '启用' : '停用'} />
        </Stack></DialogContent>
        <DialogActions><Button onClick={() => setGroupDialog(false)}>取消</Button><Button variant="contained" disabled={saving || !groupDraft.name.trim()} onClick={() => void saveGroup()}>{saving ? '保存中…' : '保存'}</Button></DialogActions>
      </Dialog>

      <Dialog open={tagDialog} onClose={() => !saving && setTagDialog(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setTagDialog(false)}>{editingTag ? '编辑标签' : '添加标签'}</DialogCloseTitle>
        <DialogContent><Stack spacing={2} sx={{ mt: 1 }}>{dialogError && <Alert severity="error">{dialogError}</Alert>}<TextField label="标签名称" required value={tagDraft.name} onChange={(e) => setTagDraft({ ...tagDraft, name: e.target.value })} /><TextField label="标签颜色" type="color" value={tagDraft.color} onChange={(e) => setTagDraft({ ...tagDraft, color: e.target.value })} /><TextField label="排序" type="number" value={tagDraft.sortOrder} onChange={(e) => setTagDraft({ ...tagDraft, sortOrder: Number(e.target.value) })} /><FormControlLabel control={<Switch checked={tagDraft.isActive} onChange={(e) => setTagDraft({ ...tagDraft, isActive: e.target.checked })} />} label={tagDraft.isActive ? '启用' : '停用'} /></Stack></DialogContent>
        <DialogActions><Button onClick={() => setTagDialog(false)}>取消</Button><Button variant="contained" disabled={saving || !tagDraft.name.trim()} onClick={() => void saveTag()}>{saving ? '保存中…' : '保存'}</Button></DialogActions>
      </Dialog>

      <Dialog open={Boolean(mergeSource)} onClose={() => !saving && setMergeSource(null)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setMergeSource(null)}>合并标签</DialogCloseTitle><DialogContent>{dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}<Alert severity="warning" sx={{ mb: 2 }}>“{mergeSource?.name}”的引用将迁移至目标标签，源标签随后停用。</Alert><FormControl fullWidth><InputLabel>目标标签</InputLabel><Select label="目标标签" value={mergeTargetId} onChange={(e) => setMergeTargetId(e.target.value)}>{compatibleTargets.map((tag) => <MenuItem key={tag.id} value={tag.id}>{tag.name}</MenuItem>)}</Select></FormControl></DialogContent><DialogActions><Button onClick={() => setMergeSource(null)}>取消</Button><Button variant="contained" disabled={!mergeSource || !mergeTargetId || saving} onClick={() => mergeSource && void runMutation(() => mergeCustomerTag(mergeSource.id, mergeTargetId), () => setMergeSource(null), setDialogError)}>确认合并</Button></DialogActions>
      </Dialog>

      <Dialog open={migrationOpen} onClose={() => !saving && setMigrationOpen(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setMigrationOpen(false)}>整理历史标签</DialogCloseTitle><DialogContent><Stack spacing={2}>{migrationError && <Alert severity="error">{migrationError}</Alert>}{saving && !preview ? <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={28} /></Box> : preview ? <><Alert severity="info">预览：客户 {preview.customerCount} 条、线索 {preview.leadCount} 条、标签引用 {preview.assignmentCount} 条。</Alert><Box><Typography variant="body2" sx={{ fontWeight: 700, mb: 1 }}>待创建标签名称</Typography>{preview.missingNames.length ? <Stack direction="row" flexWrap="wrap" gap={1}>{preview.missingNames.map((name) => <Chip key={name} label={name} size="small" />)}</Stack> : <Typography variant="body2" color="text.secondary">没有缺失名称</Typography>}</Box><TextField label="输入“整理历史标签”确认" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} fullWidth /></> : !saving && <Button variant="outlined" startIcon={<SyncIcon />} onClick={() => void openMigration()}>重新预览</Button>}</Stack></DialogContent><DialogActions><Button onClick={() => setMigrationOpen(false)}>取消</Button><Button variant="contained" color="warning" disabled={!preview || confirmation !== '整理历史标签' || saving} onClick={() => void applyMigration()}>确认整理</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomerTagConfig;
