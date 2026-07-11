import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, List, ListItemButton, ListItemText, Paper, Stack,
  Tab, TextField, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SendIcon from '@mui/icons-material/Send';
import { ModuleHeader, ModulePage, ModuleTabs, moduleTokens } from '../../shared/components/ModuleShell';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { coCreationApi } from '../../api/coCreationApi';
import type { CoCreationRequestDto, CoCreationStatus } from '../../types/coCreation';

type TabKey = 'mine' | 'supervise' | 'decision' | 'validation';
const statusText: Record<CoCreationStatus, string> = {
  DRAFT: '草稿', INTERVIEWING: 'AI访谈中', EMPLOYEE_CONFIRMATION: '待员工确认',
  FACT_CONFIRMATION: '待主管确认', MANAGEMENT_REVIEW: '待管理初审',
  VALIDATION_APPROVED: '已批准进入验证', VALIDATING: '验证中', PROJECT_DECISION: '待立项决策',
  APPROVED: '已立项', DEFERRED: '暂缓', MERGED: '已合并', REJECTED: '不处理',
};

const lines = (value: string) => value.split('\n').map((item) => item.trim()).filter(Boolean);

const CoCreation: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [tab, setTab] = useState<TabKey>('mine');
  const [items, setItems] = useState<CoCreationRequestDto[]>([]);
  const [selected, setSelected] = useState<CoCreationRequestDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [interviewRequest, setInterviewRequest] = useState<CoCreationRequestDto | null>(null);
  const [title, setTitle] = useState('');
  const [answer, setAnswer] = useState('');
  const [comment, setComment] = useState('');
  const [validationText, setValidationText] = useState('');

  const tabs = useMemo(() => {
    const result: Array<{ value: TabKey; label: string }> = [];
    if (hasPermission(currentUser, PERMISSION_KEYS.CO_CREATION_SUBMIT)) result.push({ value: 'mine', label: '我的需求' });
    if (hasPermission(currentUser, PERMISSION_KEYS.CO_CREATION_SUPERVISE)) result.push({ value: 'supervise', label: '主管确认' });
    if (hasPermission(currentUser, PERMISSION_KEYS.CO_CREATION_DECIDE)) result.push({ value: 'decision', label: '管理决策' });
    if (hasPermission(currentUser, PERMISSION_KEYS.CO_CREATION_VALIDATE)) result.push({ value: 'validation', label: '需求验证' });
    return result;
  }, [currentUser]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await coCreationApi.list().catch((error) => ({ code: -1, data: [], message: String(error) }));
    setLoading(false);
    if (result.code !== 0) { setMessage({ type: 'error', text: result.message || '读取需求失败' }); return; }
    setItems(result.data || []);
    if (selected) {
      const detail = await coCreationApi.get(selected.id);
      if (detail.code === 0) setSelected(detail.data);
    }
  }, [selected?.id]);

  useEffect(() => { void refresh(); }, []);
  useEffect(() => { if (!tabs.some((item) => item.value === tab) && tabs[0]) setTab(tabs[0].value); }, [tab, tabs]);

  const visible = useMemo(() => items.filter((item) => {
    if (tab === 'mine') return item.requesterId === currentUser?.id;
    if (tab === 'supervise') return item.status === 'FACT_CONFIRMATION';
    if (tab === 'decision') return ['MANAGEMENT_REVIEW', 'PROJECT_DECISION'].includes(item.status);
    return ['VALIDATION_APPROVED', 'VALIDATING', 'PROJECT_DECISION'].includes(item.status);
  }), [items, tab, currentUser?.id]);

  const openDetail = async (item: CoCreationRequestDto) => {
    setBusy(true);
    const result = await coCreationApi.get(item.id);
    setBusy(false);
    if (result.code === 0) {
      setSelected(result.data);
      setValidationText((result.data.validation?.plan || []).join('\n'));
    } else setMessage({ type: 'error', text: result.message });
  };

  const run = async (action: () => Promise<{ code: number; message: string }>) => {
    setBusy(true); setMessage(null);
    const result = await action().catch((error) => ({ code: -1, message: String(error) }));
    setBusy(false);
    setMessage({ type: result.code === 0 ? 'success' : 'error', text: result.message });
    if (result.code === 0) { setComment(''); setAnswer(''); await refresh(); }
  };

  const create = () => run(async () => {
    const result = await coCreationApi.create(title);
    if (result.code === 0) {
      setTitle('');
      setInterviewRequest(result.data);
      setSelected(result.data);
    }
    return result;
  });

  const continueInDialog = async () => {
    if (!interviewRequest || !answer.trim()) return;
    setBusy(true); setMessage(null);
    const result = await coCreationApi.interview(interviewRequest.id, answer)
      .catch((error) => ({ code: -1, data: null, message: String(error) }));
    if (result.code === 0) {
      setAnswer('');
      const detail = await coCreationApi.get(interviewRequest.id);
      if (detail.code === 0) {
        setInterviewRequest(detail.data);
        setSelected(detail.data);
      }
      const listed = await coCreationApi.list();
      if (listed.code === 0) setItems(listed.data || []);
    }
    setBusy(false);
    setMessage({ type: result.code === 0 ? 'success' : 'error', text: result.message });
  };

  const closeInterviewDialog = () => {
    setCreateOpen(false);
    setInterviewRequest(null);
    setAnswer('');
  };

  const decide = (decision: 'APPROVE_VALIDATION' | 'DEFER' | 'MERGE' | 'REJECT') => run(
    () => coCreationApi.decideValidation(selected!.id, decision, comment),
  );

  return (
    <ModulePage sx={{ p: { xs: 2, md: 3 } }}>
      <ModuleHeader title="AI共创中心" description="从真实工作问题出发，让AI逐问逐答形成可验证的候选需求。" />
      {message && <Alert severity={message.type} sx={{ mb: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}
      <ModuleTabs value={tab} onChange={(_, value: TabKey) => { setTab(value); setSelected(null); }} variant="scrollable" allowScrollButtonsMobile>
        {tabs.map((item) => <Tab key={item.value} value={item.value} label={item.label} />)}
      </ModuleTabs>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '340px minmax(0, 1fr)' }, gap: 2, mt: 2 }}>
        <Paper sx={{ overflow: 'hidden' }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
            <Typography fontWeight={800}>{tabs.find((item) => item.value === tab)?.label}</Typography>
            {tab === 'mine' && <Button size="small" startIcon={<AddIcon />} onClick={() => { setInterviewRequest(null); setCreateOpen(true); }}>提需求</Button>}
          </Stack>
          <Divider />
          {loading ? <Box sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Box> : (
            <List disablePadding>
              {visible.map((item) => (
                <ListItemButton key={item.id} selected={selected?.id === item.id} onClick={() => void openDetail(item)} divider>
                  <ListItemText primary={item.title} secondary={`${item.requesterName} · ${statusText[item.status]}`} primaryTypographyProps={{ fontWeight: 700 }} />
                </ListItemButton>
              ))}
              {!visible.length && <Typography color={moduleTokens.muted} sx={{ p: 3, textAlign: 'center' }}>当前没有待处理需求</Typography>}
            </List>
          )}
        </Paper>

        <Paper sx={{ p: { xs: 2, md: 3 }, minHeight: 520 }}>
          {!selected ? (
            <Stack alignItems="center" justifyContent="center" sx={{ minHeight: 440 }} spacing={1}>
              <Typography variant="h6" fontWeight={800}>选择一条需求开始处理</Typography>
              <Typography color={moduleTokens.muted}>员工提交真实工作现场，AI负责追问，不要求员工先想清楚功能。</Typography>
            </Stack>
          ) : (
            <Stack spacing={2.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}>
                <Box><Typography variant="h5" fontWeight={850}>{selected.title}</Typography><Typography color={moduleTokens.muted}>{selected.requesterName}</Typography></Box>
                <Chip color="primary" label={statusText[selected.status]} />
              </Stack>

              {selected.messages?.length ? <Card variant="outlined"><CardContent><Typography fontWeight={800} sx={{ mb: 1 }}>AI访谈记录</Typography><Stack spacing={1}>{selected.messages.map((item) => <Box key={item.id} sx={{ alignSelf: item.role === 'USER' ? 'flex-end' : 'flex-start', maxWidth: '88%', bgcolor: item.role === 'USER' ? '#EAF2FF' : '#F3F5F8', borderRadius: 2, px: 1.5, py: 1 }}><Typography variant="body2">{item.content}</Typography></Box>)}</Stack></CardContent></Card> : null}

              {tab === 'mine' && ['DRAFT', 'INTERVIEWING'].includes(selected.status) && <Stack direction={{ xs: 'column', sm: 'row' }} gap={1}><TextField fullWidth multiline minRows={2} label="回答AI当前问题" value={answer} onChange={(event) => setAnswer(event.target.value)} helperText="一次回答一个真实场景即可，AI会继续追问。" /><Button variant="contained" endIcon={<SendIcon />} disabled={busy || !answer.trim()} onClick={() => run(() => coCreationApi.interview(selected.id, answer))}>发送</Button></Stack>}

              {selected.brief && <Card variant="outlined"><CardContent><Typography fontWeight={800}>候选需求简报</Typography><Typography variant="body2" sx={{ mt: 1 }}><b>真实问题：</b>{selected.brief.problemStatement}</Typography><Typography variant="body2" sx={{ mt: 1 }}><b>当前流程：</b>{selected.brief.currentWorkflow}</Typography><Typography variant="body2" sx={{ mt: 1 }}><b>期望结果：</b>{selected.brief.desiredOutcome}</Typography><Typography variant="body2" sx={{ mt: 1 }}><b>AI假设：</b>{selected.brief.aiHypotheses.join('；') || '暂无'}</Typography><Typography variant="caption" color={moduleTokens.muted}>完整度 {selected.brief.completeness}% · AI假设不是已确认事实</Typography></CardContent></Card>}

              {tab === 'mine' && ['INTERVIEWING', 'EMPLOYEE_CONFIRMATION'].includes(selected.status) && selected.brief && <Button variant="contained" disabled={busy} onClick={() => run(() => coCreationApi.confirmBrief(selected.id))}>确认内容准确，提交主管确认</Button>}

              {tab === 'supervise' && selected.status === 'FACT_CONFIRMATION' && <><TextField fullWidth multiline minRows={3} label="主管意见" value={comment} onChange={(event) => setComment(event.target.value)} /><Stack direction="row" gap={1}><Button variant="outlined" color="warning" disabled={busy || !comment.trim()} onClick={() => run(() => coCreationApi.confirmFacts(selected.id, false, comment))}>退回补充</Button><Button variant="contained" disabled={busy} onClick={() => run(() => coCreationApi.confirmFacts(selected.id, true, comment))}>确认场景真实</Button></Stack></>}

              {tab === 'decision' && selected.status === 'MANAGEMENT_REVIEW' && <><Alert severity="info">这里的批准仅代表批准进入需求验证，不代表立项或开发。</Alert><TextField fullWidth multiline minRows={3} required label="决策原因" value={comment} onChange={(event) => setComment(event.target.value)} /><Stack direction="row" flexWrap="wrap" gap={1}><Button variant="contained" disabled={busy || !comment.trim()} onClick={() => decide('APPROVE_VALIDATION')}>批准进入验证</Button><Button variant="outlined" disabled={busy || !comment.trim()} onClick={() => decide('DEFER')}>暂缓</Button><Button variant="outlined" disabled={busy || !comment.trim()} onClick={() => decide('MERGE')}>合并</Button><Button variant="outlined" color="error" disabled={busy || !comment.trim()} onClick={() => decide('REJECT')}>不处理</Button></Stack></>}

              {tab === 'validation' && ['VALIDATION_APPROVED', 'VALIDATING', 'PROJECT_DECISION'].includes(selected.status) && <><TextField fullWidth multiline minRows={6} label="验证计划（每行一项）" value={validationText} onChange={(event) => setValidationText(event.target.value)} /><TextField fullWidth multiline minRows={3} label="验证结论或建议" value={comment} onChange={(event) => setComment(event.target.value)} /><Stack direction="row" gap={1}><Button variant="outlined" disabled={busy} onClick={() => run(() => coCreationApi.saveValidation(selected.id, { plan: lines(validationText), conclusion: comment, complete: false }))}>保存进度</Button><Button variant="contained" disabled={busy || !comment.trim()} onClick={() => run(() => coCreationApi.saveValidation(selected.id, { plan: lines(validationText), conclusion: comment, complete: true }))}>完成验证，提交立项决策</Button></Stack></>}

              {busy && <CircularProgress size={24} />}
              <Alert severity="warning">AI访谈使用“系统设置 → AI大脑”中保存的DeepSeek配置；如果未配置、被停用或连接失败，请联系系统管理员。</Alert>
            </Stack>
          )}
        </Paper>
      </Box>

      <Dialog open={createOpen} onClose={closeInterviewDialog} fullWidth maxWidth="sm">
        <DialogTitle>{createOpen && interviewRequest ? 'AI需求追问官' : '提交一个真实工作问题'}</DialogTitle>
        <DialogContent>
          {!interviewRequest ? (
            <TextField autoFocus fullWidth sx={{ mt: 1 }} label="先用一句话描述，不需要想清楚解决方案" placeholder="例如：我每天要从三个表格重复整理销售日报" value={title} onChange={(event) => setTitle(event.target.value)} />
          ) : (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Alert severity="info">AI会一次只问一个问题。请描述真实工作现场，不需要先想好功能方案。</Alert>
              <Stack spacing={1} sx={{ maxHeight: 380, overflowY: 'auto' }}>
                {(interviewRequest.messages || []).map((item) => (
                  <Box key={item.id} sx={{ alignSelf: item.role === 'USER' ? 'flex-end' : 'flex-start', maxWidth: '90%', bgcolor: item.role === 'USER' ? '#EAF2FF' : '#F3F5F8', borderRadius: 2, px: 1.5, py: 1.25 }}>
                    <Typography variant="caption" color={moduleTokens.muted}>{item.role === 'USER' ? '我' : 'AI需求追问官'}</Typography>
                    <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{item.content}</Typography>
                  </Box>
                ))}
              </Stack>
              <TextField autoFocus fullWidth multiline minRows={3} label="继续回答" value={answer} onChange={(event) => setAnswer(event.target.value)} helperText="回答当前这一个问题即可，AI会继续追问。" />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeInterviewDialog}>{interviewRequest ? '稍后继续' : '取消'}</Button>
          {!interviewRequest ? (
            <Button variant="contained" disabled={!title.trim() || busy} onClick={() => void create()}>开始AI访谈</Button>
          ) : (
            <Button variant="contained" endIcon={<SendIcon />} disabled={!answer.trim() || busy} onClick={() => void continueInDialog()}>发送回答</Button>
          )}
        </DialogActions>
      </Dialog>
    </ModulePage>
  );
};

export default CoCreation;
