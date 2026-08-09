import React, { useEffect, useMemo, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowDownwardRoundedIcon from '@mui/icons-material/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@mui/icons-material/ArrowUpwardRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import StarBorderRoundedIcon from '@mui/icons-material/StarBorderRounded';
import StarRoundedIcon from '@mui/icons-material/StarRounded';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { browserAgentConfigApi } from '../../api/browserAgentConfigApi';
import type { BrowserScriptGroup, BrowserScriptLibrary, BrowserScriptTemplate } from '../../types/browserAgent';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { moduleRadius, moduleTokens } from '../../shared/components/ModuleShell';
import {
  byScriptOrder,
  moveScriptItem,
  normalizeScriptOrder,
  resolveRecommendedScriptId,
  setRecommendedScript,
} from './browserScriptLibraryModel';

const nextId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function newScript(sortOrder: number): BrowserScriptTemplate {
  return {
    id: nextId('script'),
    title: '新话术',
    content: '',
    enabled: true,
    sortOrder,
    priority: 0,
    match: { orderStatuses: [], productKeywords: [], contactState: 'ANY' },
  };
}

function newGroup(sortOrder: number): BrowserScriptGroup {
  return { id: nextId('group'), name: '新分组', enabled: true, sortOrder, scripts: [newScript(10)] };
}

const BrowserScriptLibraryConfigPage: React.FC = () => {
  const [library, setLibrary] = useState<BrowserScriptLibrary | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const { alert, confirm, dialog } = useAppFeedback();

  const load = async () => {
    setLoading(true);
    try {
      const response = await browserAgentConfigApi.getScriptLibrary();
      if (response.code !== 0 || !response.data) {
        await alert(response.message || '话术库加载失败', '加载失败');
        return;
      }
      const next = structuredClone(response.data.library);
      setLibrary(next);
      setSelectedGroupId((current) => next.groups.some((item) => item.id === current) ? current : next.groups[0]?.id || '');
      setDirty(false);
    } catch (error) {
      await alert(error instanceof Error ? error.message : '话术库加载失败', '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const selectedGroup = useMemo(
    () => library?.groups.find((group) => group.id === selectedGroupId) || library?.groups[0],
    [library, selectedGroupId],
  );

  const updateLibrary = (updater: (current: BrowserScriptLibrary) => BrowserScriptLibrary) => {
    setLibrary((current) => current ? updater(current) : current);
    setDirty(true);
  };

  const updateGroup = (patch: Partial<BrowserScriptGroup>) => {
    if (!selectedGroup) return;
    updateLibrary((current) => ({
      ...current,
      groups: current.groups.map((group) => group.id === selectedGroup.id ? { ...group, ...patch } : group),
    }));
  };

  const updateScript = (scriptId: string, patch: Partial<BrowserScriptTemplate>) => {
    if (!selectedGroup) return;
    updateGroup({ scripts: selectedGroup.scripts.map((script) => script.id === scriptId ? { ...script, ...patch } : script) });
  };

  const addGroup = () => {
    if (!library) return;
    const group = newGroup((Math.max(0, ...library.groups.map((item) => item.sortOrder)) || 0) + 10);
    updateLibrary((current) => ({ ...current, groups: [...current.groups, group] }));
    setSelectedGroupId(group.id);
  };

  const removeGroup = async () => {
    if (!library || !selectedGroup) return;
    if (!await confirm(`删除分组“${selectedGroup.name}”后，其中 ${selectedGroup.scripts.length} 条话术也会删除。`, '确认删除分组')) return;
    const groups = library.groups.filter((group) => group.id !== selectedGroup.id);
    updateLibrary((current) => ({ ...current, groups: normalizeScriptOrder(groups) }));
    setSelectedGroupId(groups[0]?.id || '');
  };

  const removeScript = async (script: BrowserScriptTemplate) => {
    if (!selectedGroup) return;
    if (!await confirm(`确定删除这条话术吗？`, '确认删除话术')) return;
    updateGroup({ scripts: normalizeScriptOrder(selectedGroup.scripts.filter((item) => item.id !== script.id)) });
  };

  const markRecommended = (scriptId: string) => {
    if (!selectedGroup) return;
    updateGroup({ scripts: setRecommendedScript(selectedGroup.scripts, scriptId) });
  };

  const save = async () => {
    if (!library) return;
    setSaving(true);
    try {
      const response = await browserAgentConfigApi.saveScriptLibrary(library);
      if (response.code !== 0 || !response.data) {
        await alert(response.message || '话术库保存失败', '保存失败');
        if (response.code === 409) await load();
        return;
      }
      setLibrary(structuredClone(response.data.library));
      setDirty(false);
      await alert('话术已发布，客服插件刷新后即可使用。', '保存成功');
    } catch (error) {
      await alert(error instanceof Error ? error.message : '话术库保存失败', '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  if (!library) return <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">话术库暂时不可用</Typography><Button sx={{ mt: 2 }} onClick={() => void load()}>重新加载</Button></Paper>;

  const orderedGroups = byScriptOrder(library.groups);
  const selectedGroupIndex = orderedGroups.findIndex((group) => group.id === selectedGroup?.id);
  const orderedScripts = selectedGroup ? byScriptOrder(selectedGroup.scripts) : [];
  const recommendedScriptId = resolveRecommendedScriptId(orderedScripts);

  return <Box>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
      <Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" fontWeight={800}>浏览器客服话术</Typography>
          <Chip size="small" label={`版本 ${library.revision}`} />
          {dirty && <Chip size="small" color="warning" label="有未保存修改" />}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>
          按分组维护客服话术。每组可选择一条推荐话术，插件中点击即可填入回复框。
        </Typography>
      </Box>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addGroup}>新增分组</Button>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />} disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? '正在保存' : '保存并发布'}
        </Button>
      </Stack>
    </Stack>

    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr)' }, gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: moduleRadius, borderColor: moduleTokens.line, alignSelf: 'start' }}>
        <Typography variant="subtitle2" fontWeight={800} sx={{ px: 1, py: .75 }}>话术分组</Typography>
        <Stack spacing={.75}>
          {orderedGroups.map((group) => <Button
            key={group.id}
            onClick={() => setSelectedGroupId(group.id)}
            variant={group.id === selectedGroup?.id ? 'contained' : 'text'}
            color={group.id === selectedGroup?.id ? 'primary' : 'inherit'}
            sx={{ justifyContent: 'space-between', px: 1.25, py: 1.1, textTransform: 'none' }}
          >
            <Box component="span" sx={{ minWidth: 0, textAlign: 'left' }}>
              <Box component="span" sx={{ display: 'block', fontWeight: 750, overflow: 'hidden', textOverflow: 'ellipsis' }}>{group.name}</Box>
              <Box component="span" sx={{ display: 'block', mt: .25, opacity: .72, fontSize: 12 }}>{group.scripts.length} 条 · {group.enabled ? '启用' : '停用'}</Box>
            </Box>
          </Button>)}
          {!library.groups.length && <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 3, textAlign: 'center' }}>暂无分组</Typography>}
        </Stack>
      </Paper>

      {selectedGroup ? <Paper variant="outlined" sx={{ borderRadius: moduleRadius, borderColor: moduleTokens.line, overflow: 'hidden' }}>
        <Box sx={{ p: 2, bgcolor: '#f8faff' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <TextField size="small" label="分组名称" value={selectedGroup.name} onChange={(event) => updateGroup({ name: event.target.value })} sx={{ flex: 1 }} />
            <Stack direction="row" spacing={.25}>
              <Tooltip title="上移分组"><span><IconButton aria-label="上移分组" disabled={selectedGroupIndex <= 0} onClick={() => updateLibrary((current) => ({ ...current, groups: moveScriptItem(current.groups, selectedGroup.id, -1) }))}><ArrowUpwardRoundedIcon /></IconButton></span></Tooltip>
              <Tooltip title="下移分组"><span><IconButton aria-label="下移分组" disabled={selectedGroupIndex < 0 || selectedGroupIndex >= orderedGroups.length - 1} onClick={() => updateLibrary((current) => ({ ...current, groups: moveScriptItem(current.groups, selectedGroup.id, 1) }))}><ArrowDownwardRoundedIcon /></IconButton></span></Tooltip>
              <Tooltip title="删除当前分组"><IconButton aria-label="删除当前分组" color="error" onClick={() => void removeGroup()}><DeleteOutlineRoundedIcon /></IconButton></Tooltip>
            </Stack>
            <FormControlLabel control={<Switch checked={selectedGroup.enabled} onChange={(event) => updateGroup({ enabled: event.target.checked })} />} label="启用" />
          </Stack>
        </Box>
        <Divider />
        <Box sx={{ p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box><Typography variant="subtitle1" fontWeight={800}>话术内容</Typography><Typography variant="caption" color="text.secondary">星标话术会显示为当前分组的推荐话术。</Typography></Box>
            <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => updateGroup({ scripts: [...selectedGroup.scripts, newScript((Math.max(0, ...selectedGroup.scripts.map((item) => item.sortOrder)) || 0) + 10)] })}>新增话术</Button>
          </Stack>
          <Stack spacing={1.25}>
            {orderedScripts.map((script, index) => {
              const isRecommended = script.id === recommendedScriptId;
              return <Paper key={script.id} variant="outlined" sx={{ p: 1.75, borderRadius: 2, borderColor: isRecommended ? 'primary.light' : moduleTokens.softLine, bgcolor: isRecommended ? '#f8faff' : 'background.paper' }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ sm: 'flex-start' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                      <Typography variant="subtitle2" fontWeight={800}>话术 {index + 1}</Typography>
                      {isRecommended && <Chip size="small" color="primary" icon={<StarRoundedIcon />} label="推荐" />}
                      {!script.enabled && <Chip size="small" label="已停用" />}
                    </Stack>
                    <TextField
                      fullWidth
                      multiline
                      minRows={3}
                      label="话术内容"
                      value={script.content}
                      onChange={(event) => updateScript(script.id, { content: event.target.value })}
                    />
                  </Box>
                  <Stack direction={{ xs: 'row', sm: 'column' }} spacing={.25} alignItems="center">
                    <Tooltip title={!script.enabled ? '启用后可设为推荐' : isRecommended ? '当前推荐话术' : '设为推荐'}><span><IconButton aria-label={isRecommended ? '当前推荐话术' : '设为推荐'} disabled={!script.enabled} color={isRecommended ? 'primary' : 'default'} onClick={() => markRecommended(script.id)}>{isRecommended ? <StarRoundedIcon /> : <StarBorderRoundedIcon />}</IconButton></span></Tooltip>
                    <Tooltip title="上移话术"><span><IconButton aria-label="上移话术" disabled={index === 0} onClick={() => updateGroup({ scripts: moveScriptItem(selectedGroup.scripts, script.id, -1) })}><ArrowUpwardRoundedIcon /></IconButton></span></Tooltip>
                    <Tooltip title="下移话术"><span><IconButton aria-label="下移话术" disabled={index === orderedScripts.length - 1} onClick={() => updateGroup({ scripts: moveScriptItem(selectedGroup.scripts, script.id, 1) })}><ArrowDownwardRoundedIcon /></IconButton></span></Tooltip>
                    <Tooltip title="删除话术"><IconButton aria-label="删除话术" color="error" onClick={() => void removeScript(script)}><DeleteOutlineRoundedIcon /></IconButton></Tooltip>
                    <FormControlLabel sx={{ m: 0, '& .MuiFormControlLabel-label': { fontSize: 12 } }} control={<Switch size="small" checked={script.enabled} onChange={(event) => updateScript(script.id, { enabled: event.target.checked, priority: event.target.checked ? script.priority : 0 })} />} label="启用" />
                  </Stack>
                </Stack>
              </Paper>;
            })}
            {!selectedGroup.scripts.length && <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}><Typography color="text.secondary">当前分组暂无话术</Typography></Paper>}
          </Stack>
        </Box>
      </Paper> : <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}><Typography color="text.secondary">新增或选择一个话术分组</Typography></Paper>}
    </Box>
    {dialog}
  </Box>;
};

export default BrowserScriptLibraryConfigPage;
