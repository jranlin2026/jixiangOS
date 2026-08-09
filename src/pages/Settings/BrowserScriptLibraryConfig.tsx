import React, { useEffect, useMemo, useState } from 'react';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { browserAgentConfigApi } from '../../api/browserAgentConfigApi';
import type {
  BrowserScriptContactState,
  BrowserScriptGroup,
  BrowserScriptLibrary,
  BrowserScriptTemplate,
} from '../../types/browserAgent';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { moduleRadius, moduleTokens } from '../../shared/components/ModuleShell';

const contactStateLabels: Record<BrowserScriptContactState, string> = {
  ANY: '不限',
  MISSING: '尚未获取联系方式',
  PRESENT: '已获取联系方式',
};

const nextId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const parseList = (value: string) => [...new Set(value.split(/[，,\n]/).map((item) => item.trim()).filter(Boolean))];
const joinList = (value: string[]) => value.join('\n');

const ListTextField: React.FC<{
  label: string;
  value: string[];
  onCommit: (value: string[]) => void;
}> = ({ label, value, onCommit }) => {
  const normalized = joinList(value);
  const [draft, setDraft] = useState(normalized);
  useEffect(() => setDraft(normalized), [normalized]);
  return <TextField
    multiline
    minRows={2}
    label={label}
    helperText="逗号或换行分隔"
    value={draft}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => onCommit(parseList(draft))}
  />;
};

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
    updateGroup({
      scripts: selectedGroup.scripts.map((script) => script.id === scriptId ? { ...script, ...patch } : script),
    });
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
    updateLibrary((current) => ({ ...current, groups }));
    setSelectedGroupId(groups[0]?.id || '');
  };

  const removeScript = async (script: BrowserScriptTemplate) => {
    if (!selectedGroup) return;
    if (!await confirm(`确定删除话术“${script.title}”吗？`, '确认删除话术')) return;
    updateGroup({ scripts: selectedGroup.scripts.filter((item) => item.id !== script.id) });
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
      await alert('话术库已发布，客服插件重新加载后即可使用新版本。', '保存成功');
    } catch (error) {
      await alert(error instanceof Error ? error.message : '话术库保存失败', '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box>;
  if (!library) return <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">话术库暂时不可用</Typography><Button sx={{ mt: 2 }} onClick={() => void load()}>重新加载</Button></Paper>;

  return <Box>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2.5 }}>
      <Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography variant="h6" fontWeight={800}>浏览器客服话术</Typography>
          <Chip size="small" label={`版本 ${library.revision}`} />
          {dirty && <Chip size="small" color="warning" label="有未保存修改" />}
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>
          统一配置客服可用话术和推荐规则。插件只负责推荐与填入，不在插件内重复维护。
        </Typography>
      </Box>
      <Stack direction="row" spacing={1}>
        <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={addGroup}>新增分组</Button>
        <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveRoundedIcon />} disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? '正在保存' : '保存并发布'}
        </Button>
      </Stack>
    </Stack>

    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '280px minmax(0, 1fr)' }, gap: 2 }}>
      <Paper variant="outlined" sx={{ p: 1.25, borderRadius: moduleRadius, borderColor: moduleTokens.line, alignSelf: 'start' }}>
        <Typography variant="subtitle2" fontWeight={800} sx={{ px: 1, py: .75 }}>话术分组</Typography>
        <Stack spacing={.75}>
          {[...library.groups].sort((a, b) => a.sortOrder - b.sortOrder).map((group) => (
            <Button
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
            </Button>
          ))}
          {!library.groups.length && <Typography variant="body2" color="text.secondary" sx={{ px: 1, py: 3, textAlign: 'center' }}>暂无分组</Typography>}
        </Stack>
      </Paper>

      {selectedGroup ? <Paper variant="outlined" sx={{ borderRadius: moduleRadius, borderColor: moduleTokens.line, overflow: 'hidden' }}>
        <Box sx={{ p: 2.25, bgcolor: '#f8faff' }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
            <TextField size="small" label="分组名称" value={selectedGroup.name} onChange={(event) => updateGroup({ name: event.target.value })} sx={{ flex: 1 }} />
            <TextField size="small" type="number" label="分组排序" value={selectedGroup.sortOrder} onChange={(event) => updateGroup({ sortOrder: Number(event.target.value) })} sx={{ width: { xs: '100%', sm: 120 } }} />
            <FormControlLabel control={<Switch checked={selectedGroup.enabled} onChange={(event) => updateGroup({ enabled: event.target.checked })} />} label="启用分组" />
            <Tooltip title="删除当前分组"><Button color="error" variant="text" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => void removeGroup()}>删除</Button></Tooltip>
          </Stack>
        </Box>
        <Divider />
        <Box sx={{ p: 2.25 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
            <Box><Typography variant="subtitle1" fontWeight={800}>话术内容</Typography><Typography variant="caption" color="text.secondary">优先级越高，满足条件时越优先推荐。</Typography></Box>
            <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => updateGroup({ scripts: [...selectedGroup.scripts, newScript((Math.max(0, ...selectedGroup.scripts.map((item) => item.sortOrder)) || 0) + 10)] })}>新增话术</Button>
          </Stack>
          <Stack spacing={1.5}>
            {[...selectedGroup.scripts].sort((a, b) => a.sortOrder - b.sortOrder).map((script, index) => <Paper key={script.id} variant="outlined" sx={{ p: 2, borderRadius: 2, borderColor: moduleTokens.softLine }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Stack direction="row" alignItems="center" spacing={1}><Typography variant="subtitle2" fontWeight={800}>话术 {index + 1}</Typography><Chip size="small" color={script.enabled ? 'success' : 'default'} label={script.enabled ? '启用' : '停用'} /></Stack>
                <Tooltip title="删除话术"><Button size="small" color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => void removeScript(script)}>删除</Button></Tooltip>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(220px, 1.2fr) 110px 110px' }, gap: 1.5 }}>
                <TextField label="话术标题" value={script.title} onChange={(event) => updateScript(script.id, { title: event.target.value })} />
                <TextField type="number" label="排序" value={script.sortOrder} onChange={(event) => updateScript(script.id, { sortOrder: Number(event.target.value) })} />
                <TextField type="number" label="优先级" value={script.priority} onChange={(event) => updateScript(script.id, { priority: Number(event.target.value) })} />
              </Box>
              <TextField fullWidth multiline minRows={3} label="话术内容" value={script.content} onChange={(event) => updateScript(script.id, { content: event.target.value })} sx={{ mt: 1.5 }} />
              <Typography variant="overline" color="text.secondary" sx={{ display: 'block', mt: 2, mb: .75, fontWeight: 800 }}>推荐条件（不填即不限）</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 220px' }, gap: 1.5 }}>
                <ListTextField label="订单状态" value={script.match.orderStatuses} onCommit={(orderStatuses) => updateScript(script.id, { match: { ...script.match, orderStatuses } })} />
                <ListTextField label="商品关键词" value={script.match.productKeywords} onCommit={(productKeywords) => updateScript(script.id, { match: { ...script.match, productKeywords } })} />
                <Stack spacing={1}>
                  <FormControl fullWidth><InputLabel>联系方式状态</InputLabel><Select label="联系方式状态" value={script.match.contactState} onChange={(event) => updateScript(script.id, { match: { ...script.match, contactState: event.target.value as BrowserScriptContactState } })}>{Object.entries(contactStateLabels).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}</Select></FormControl>
                  <FormControlLabel control={<Switch checked={script.enabled} onChange={(event) => updateScript(script.id, { enabled: event.target.checked })} />} label="启用话术" />
                </Stack>
              </Box>
            </Paper>)}
            {!selectedGroup.scripts.length && <Paper variant="outlined" sx={{ p: 4, textAlign: 'center', borderStyle: 'dashed' }}><Typography color="text.secondary">当前分组暂无话术</Typography></Paper>}
          </Stack>
        </Box>
      </Paper> : <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}><Typography color="text.secondary">新增或选择一个话术分组</Typography></Paper>}
    </Box>
    {dialog}
  </Box>;
};

export default BrowserScriptLibraryConfigPage;
