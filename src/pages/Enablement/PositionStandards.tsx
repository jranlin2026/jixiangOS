import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, FormControlLabel, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import PublishIcon from '@mui/icons-material/Publish';
import { enablementApi, enterpriseBrainApi, settingsApi } from '../../api';
import type { Position } from '../../types/position';
import type { KnowledgeDocumentDto } from '../../types/enablement';
import type { PositionStandardDetail } from '../../types/enterpriseBrain';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';

type FormState = { positionId: string; title: string; mission: string; goals: string; dailyActions: string; kpis: string; workflow: string; speechTemplates: string; faq: string; knowledgeVersionIds: string[] };
const emptyForm: FormState = { positionId: '', title: '', mission: '', goals: '', dailyActions: '', kpis: '', workflow: '', speechTemplates: '', faq: '', knowledgeVersionIds: [] };
const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);

const PositionStandards: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const canPublish = hasPermission(currentUser, PERMISSION_KEYS.STANDARD_PUBLISH, 'write');
  const [standards, setStandards] = useState<PositionStandardDetail[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [knowledge, setKnowledge] = useState<KnowledgeDocumentDto[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const currentKnowledge = useMemo(() => knowledge.filter((item) => item.currentVersionId), [knowledge]);

  const load = async () => {
    const [standardRes, positionRes, knowledgeRes] = await Promise.all([
      enterpriseBrainApi.listStandards(), settingsApi.fetchPositions({ isActive: true }), enablementApi.listKnowledge(),
    ]);
    if (standardRes.code === 0) setStandards(standardRes.data);
    if (positionRes.code === 0) setPositions(positionRes.data);
    if (knowledgeRes.code === 0) setKnowledge(knowledgeRes.data);
  };
  useEffect(() => { void load(); }, []);

  const edit = (standard?: PositionStandardDetail) => {
    if (!standard) { setForm(emptyForm); setOpen(true); return; }
    setForm({ positionId: standard.positionId, title: standard.title, mission: standard.version.mission, goals: standard.version.goals.join('\n'), dailyActions: standard.version.dailyActions.join('\n'), kpis: standard.version.kpis.join('\n'), workflow: standard.version.workflow.join('\n'), speechTemplates: standard.version.speechTemplates.join('\n'), faq: standard.version.faq.join('\n'), knowledgeVersionIds: standard.resources.map((item) => item.knowledgeVersionId) });
    setOpen(true);
  };
  const save = async () => {
    setBusy(true);
    const response = await enterpriseBrainApi.saveStandardDraft({ ...form, goals: lines(form.goals), dailyActions: lines(form.dailyActions), kpis: lines(form.kpis), workflow: lines(form.workflow), speechTemplates: lines(form.speechTemplates), faq: lines(form.faq) });
    setBusy(false);
    if (response.code !== 0) return setMessage({ tone: 'error', text: response.message });
    setMessage({ tone: 'success', text: '岗位标准草稿已保存，发布前不会影响员工当前标准。' });
    setOpen(false); await load();
  };
  const publish = async (versionId: string) => {
    setBusy(true); const response = await enterpriseBrainApi.publishStandard(versionId); setBusy(false);
    setMessage({ tone: response.code === 0 ? 'success' : 'error', text: response.code === 0 ? '新版本已发布并生效。' : response.message });
    if (response.code === 0) await load();
  };

  return <Stack spacing={2}>
    {message && <Alert severity={message.tone} onClose={() => setMessage(null)}>{message.text}</Alert>}
    <Stack direction="row" justifyContent="space-between" alignItems="center">
      <Typography variant="body2" color="text.secondary">一个岗位只保留一个当前生效版本；编辑会创建新草稿。</Typography>
      <Button variant="contained" startIcon={<AddIcon />} onClick={() => edit()}>新建岗位标准</Button>
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, 1fr)' }, gap: 2 }}>
      {standards.map((standard) => <Paper key={standard.id} variant="outlined" sx={{ p: 2, borderRadius: 1.5 }}>
        <Stack direction="row" justifyContent="space-between" spacing={1}>
          <Box><Typography sx={{ fontWeight: 900 }}>{standard.title}</Typography><Typography variant="body2" color="text.secondary">{standard.positionName}</Typography></Box>
          <Chip size="small" color={standard.version.status === 'CURRENT' ? 'success' : 'warning'} label={`${standard.version.status === 'CURRENT' ? '生效' : '草稿'} V${standard.version.versionNumber}`} />
        </Stack>
        <Typography variant="body2" sx={{ mt: 1.5, minHeight: 44 }}>{standard.version.mission}</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
          <Button size="small" variant="outlined" onClick={() => edit(standard)}>创建新草稿</Button>
          {canPublish && standard.version.status === 'DRAFT' && <Button size="small" startIcon={<PublishIcon />} onClick={() => void publish(standard.version.id)} disabled={busy}>发布</Button>}
        </Stack>
      </Paper>)}
      {!standards.length && <Alert severity="info">尚无岗位标准。先为销售顾问等正式岗位创建试运行标准。</Alert>}
    </Box>
    <Dialog open={open} onClose={() => !busy && setOpen(false)} fullWidth maxWidth="md">
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 900 }}>岗位标准草稿</Typography>
        <TextField select label="适用岗位" value={form.positionId} onChange={(e) => setForm({ ...form, positionId: e.target.value })}>{positions.map((position) => <MenuItem key={position.id} value={position.id}>{position.name}</MenuItem>)}</TextField>
        <TextField label="标准名称" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <TextField label="岗位使命" multiline minRows={2} value={form.mission} onChange={(e) => setForm({ ...form, mission: e.target.value })} />
        {(['goals', 'dailyActions', 'kpis', 'workflow', 'speechTemplates', 'faq'] as const).map((key) => <TextField key={key} label={({ goals: '岗位目标', dailyActions: '每日动作', kpis: '关键指标', workflow: '工作流程', speechTemplates: '标准话术', faq: '常见问题' } as const)[key] + '（每行一条）'} multiline minRows={2} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}
        {!!currentKnowledge.length && <Box><Typography variant="subtitle2" sx={{ mb: 0.5 }}>关联当前有效知识</Typography>{currentKnowledge.map((item) => <FormControlLabel key={item.id} control={<Checkbox checked={form.knowledgeVersionIds.includes(item.currentVersionId!)} onChange={(e) => setForm({ ...form, knowledgeVersionIds: e.target.checked ? [...form.knowledgeVersionIds, item.currentVersionId!] : form.knowledgeVersionIds.filter((id) => id !== item.currentVersionId) })} />} label={item.title} />)}</Box>}
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setOpen(false)}>取消</Button><Button variant="contained" disabled={busy} onClick={() => void save()}>保存草稿</Button></DialogActions>
    </Dialog>
  </Stack>;
};

export default PositionStandards;
