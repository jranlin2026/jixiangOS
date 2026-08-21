import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, MenuItem,
  Paper, Stack, TextField, Typography,
} from '@mui/material';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined';
import PersonSearchOutlinedIcon from '@mui/icons-material/PersonSearchOutlined';
import type { AuthenticatedUser } from '../../../types/auth';
import type { Customer, CustomerActivityRecord, CustomerCommunicationNodeType, CustomerOpportunityStageCode } from '../../../types/customer';
import type { CustomerTodo } from '../../../types/customerTodo';
import type { CustomerInterventionOutcome, EmployeeTask } from '../../../types/enterpriseBrain';
import { enterpriseBrainApi } from '../../../api/enterpriseBrainApi';
import { buildCustomerBattleSnapshot, CUSTOMER_OPPORTUNITY_STAGES } from '../../../shared/utils/customerBattleState';
import { formatCurrency, formatDate } from '../../../shared/utils/formatters';
import { hasExplicitPermission, PERMISSION_KEYS } from '../../../shared/utils/permissions';
import DialogCloseTitle from '../../../shared/components/DialogCloseTitle';

type InterventionMode = 'REMIND_SALES' | 'SUPERVISOR_ASSIST' | 'BOSS_FOLLOW_UP';

const modeConfig: Record<InterventionMode, { label: string; taskTitle: string; description: string }> = {
  REMIND_SALES: { label: '提醒销售', taskTitle: '尽快推进客户下一步动作', description: '由客户负责人执行并提交处理结果' },
  SUPERVISOR_ASSIST: { label: '主管协同', taskTitle: '主管协同制定客户推进方案', description: '主管直接参与，形成可执行的下一步方案' },
  BOSS_FOLLOW_UP: { label: '老板亲跟', taskTitle: '老板直接跟进重点客户', description: '由当前管理者直接跟进并记录结果' },
};

const statusLabel: Record<EmployeeTask['status'], string> = {
  PENDING: '待执行', IN_PROGRESS: '执行中', COMPLETED: '待验收', CONFIRMED: '已验收', RETURNED: '已退回', CANCELED: '已取消',
};

function customerOutcomeOf(task: EmployeeTask | undefined): CustomerInterventionOutcome | null {
  const content = task?.evidence.find((item) => item.type === 'CUSTOMER_OUTCOME')?.content;
  if (!content) return null;
  try { return JSON.parse(content) as CustomerInterventionOutcome; } catch { return null; }
}

const communicationNodeLabel: Record<CustomerCommunicationNodeType, string> = {
  LEAD_CREATED: '初次建联', WECHAT_ADDED: '添加微信', PHONE_CALL: '销售通话',
  WECHAT_CHAT: '微信沟通', CHAT_SUMMARY: '沟通纪要', NEED_DISCOVERY: '需求挖掘',
  DEMO: '方案演示', PROPOSAL: '方案报价', OBJECTION: '异议处理',
  PAYMENT_PENDING: '待付款', ORDER_CREATED: '订单成交', MANAGER_INTERVENE: '管理介入',
  FOLLOW_UP: '客户跟进',
};

function shanghaiDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

function defaultDueAt(): string {
  const due = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return new Date(due.getTime() - due.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function communicationNodeType(record: CustomerActivityRecord): CustomerCommunicationNodeType | null {
  const title = String(record.title || '');
  if (record.type === 'manager_intervene') return 'MANAGER_INTERVENE';
  if (record.type === 'create') return 'LEAD_CREATED';
  if (record.type === 'order') return 'ORDER_CREATED';
  if (record.type !== 'follow') return null;
  if (/(添加企微|添加微信|加微信)/.test(title)) return 'WECHAT_ADDED';
  if (/(电话|通话)/.test(title)) return 'PHONE_CALL';
  if (/(聊天摘要|沟通纪要|沟通摘要)/.test(title)) return 'CHAT_SUMMARY';
  if (/(微信|聊天)/.test(title)) return 'WECHAT_CHAT';
  if (/(需求|挖掘)/.test(title)) return 'NEED_DISCOVERY';
  if (/演示/.test(title)) return 'DEMO';
  if (/(方案|报价)/.test(title)) return 'PROPOSAL';
  if (/异议/.test(title)) return 'OBJECTION';
  if (/(待付款|付款|催款)/.test(title)) return 'PAYMENT_PENDING';
  return 'FOLLOW_UP';
}

const CustomerManagementCommandLayer: React.FC<{
  customer: Customer;
  todos: CustomerTodo[];
  currentUser: AuthenticatedUser | null;
  onRefreshCustomer: () => Promise<void> | void;
  canSetProgress: boolean;
  progressSaving?: boolean;
  onSaveProgress: (stage: CustomerOpportunityStageCode, amount: number | null) => boolean | Promise<boolean>;
  onOpenTodos: () => void;
}> = ({ customer, todos, currentUser, onRefreshCustomer, canSetProgress, progressSaving = false, onSaveProgress, onOpenTodos }) => {
  const [tasks, setTasks] = useState<EmployeeTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [message, setMessage] = useState<{ severity: 'success' | 'error'; text: string } | null>(null);
  const [interventionOpen, setInterventionOpen] = useState(false);
  const [mode, setMode] = useState<InterventionMode>('REMIND_SALES');
  const [note, setNote] = useState('');
  const [dueAt, setDueAt] = useState(defaultDueAt);
  const [resultTask, setResultTask] = useState<EmployeeTask | null>(null);
  const [result, setResult] = useState('');
  const [resultNextAction, setResultNextAction] = useState('');
  const [resultNextDueAt, setResultNextDueAt] = useState(defaultDueAt);
  const [resultStage, setResultStage] = useState<CustomerOpportunityStageCode>(customer.opportunityStageCode || 'not_set');
  const [resultAmount, setResultAmount] = useState(customer.opportunityAmount == null ? '' : String(customer.opportunityAmount));
  const [returnTask, setReturnTask] = useState<EmployeeTask | null>(null);
  const [returnReason, setReturnReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [assistAssigneeId, setAssistAssigneeId] = useState('');
  const [supervisorCandidates, setSupervisorCandidates] = useState<Array<{ id: string; name: string; positionName?: string }>>([]);
  const [progressOpen, setProgressOpen] = useState(false);
  const [progressStage, setProgressStage] = useState<CustomerOpportunityStageCode>(customer.opportunityStageCode || 'not_set');
  const [progressAmount, setProgressAmount] = useState(customer.opportunityAmount == null ? '' : String(customer.opportunityAmount));

  const canAssign = hasExplicitPermission(currentUser, PERMISSION_KEYS.TASK_ASSIGN, 'write');
  const canConfirm = hasExplicitPermission(currentUser, PERMISSION_KEYS.TASK_CONFIRM, 'write');
  const snapshot = useMemo(() => buildCustomerBattleSnapshot(customer, todos), [customer, todos]);

  const loadTasks = useCallback(async () => {
    if (!currentUser) return;
    setLoadingTasks(true);
    try {
      const response = await enterpriseBrainApi.listLinkedTasks({
        sourceType: 'COCKPIT_INTERVENTION', sourceId: customer.id, page: 1, pageSize: 20,
      });
      if (response.code !== 0) throw new Error(response.message || '介入任务加载失败');
      setTasks(response.data?.items || []);
    } catch (error) {
      setMessage({ severity: 'error', text: error instanceof Error ? error.message : '介入任务加载失败' });
    } finally {
      setLoadingTasks(false);
    }
  }, [currentUser, customer.id]);

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  useEffect(() => {
    if (!canAssign) return setSupervisorCandidates([]);
    let active = true;
    void enterpriseBrainApi.listInterventionSupervisors(customer.id).then((response) => {
      if (!active) return;
      if (response.code === 0) setSupervisorCandidates(response.data || []);
      else setSupervisorCandidates([]);
    });
    return () => { active = false; };
  }, [canAssign, customer.id]);

  const latestTask = tasks[0];
  const latestOutcome = customerOutcomeOf(latestTask);
  const activityNodes = useMemo(() => (customer.activityRecords || [])
    .map((record) => ({ record, nodeType: communicationNodeType(record) }))
    .filter((item): item is { record: CustomerActivityRecord; nodeType: CustomerCommunicationNodeType } => item.nodeType !== null)
    .sort((left, right) => new Date(left.record.createdAt).getTime() - new Date(right.record.createdAt).getTime()), [customer.activityRecords]);
  const recommendation = snapshot.risk.level === 'high'
    ? '建议今日由主管介入，先处理逾期动作并重新约定时间。'
    : snapshot.risk.level === 'medium'
      ? '建议补齐下一步动作、执行人和截止时间。'
      : '建议按当前动作继续推进，沟通后及时记录结果。';
  const reloadAll = async () => {
    await Promise.all([loadTasks(), Promise.resolve(onRefreshCustomer())]);
  };

  const assign = async () => {
    if (!currentUser) return;
    const assigneeId = mode === 'REMIND_SALES'
      ? customer.ownerId
      : mode === 'SUPERVISOR_ASSIST' ? assistAssigneeId : currentUser.id;
    if (!assigneeId) {
      setMessage({ severity: 'error', text: mode === 'SUPERVISOR_ASSIST' ? '请选择协同负责人。' : '该客户未绑定销售负责人，无法发起提醒。' });
      return;
    }
    if (!note.trim()) {
      setMessage({ severity: 'error', text: '请填写介入要求和验收口径。' });
      return;
    }
    const dueDate = new Date(dueAt);
    if (!dueAt || Number.isNaN(dueDate.getTime())) {
      setMessage({ severity: 'error', text: '请选择有效的截止时间。' });
      return;
    }
    setSubmitting(true);
    try {
      const config = modeConfig[mode];
      const response = await enterpriseBrainApi.assignTask({
        employeeId: assigneeId,
        workDate: shanghaiDate(),
        dueAt: dueDate.toISOString(),
        title: `${config.taskTitle}：${customer.name}`,
        description: note.trim(),
        taskType: 'FOLLOW_UP',
        priority: mode === 'BOSS_FOLLOW_UP' ? 'URGENT' : 'HIGH',
        businessModule: 'CUSTOMER_MANAGEMENT',
        sourceRoute: `/customers/${encodeURIComponent(customer.id)}?view=management`,
        sourceLabel: `${config.label}·${customer.name}`,
        sourceType: 'COCKPIT_INTERVENTION',
        sourceId: customer.id,
        sourceItemId: mode,
        evidenceRequired: false,
      });
      if (response.code !== 0) throw new Error(response.message || '介入任务下达失败');
      setInterventionOpen(false);
      setNote('');
      setMessage({ severity: 'success', text: '介入任务已下达，同步记入客户沟通节点。' });
      await reloadAll();
    } catch (error) {
      setMessage({ severity: 'error', text: error instanceof Error ? error.message : '介入任务下达失败' });
    } finally {
      setSubmitting(false);
    }
  };

  const complete = async () => {
    if (!resultTask || !result.trim() || !resultNextAction.trim() || !resultNextDueAt) return;
    const amount = resultAmount.trim() === '' ? null : Number(resultAmount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return;
    setSubmitting(true);
    const response = await enterpriseBrainApi.completeTask(resultTask.id, {
      result: result.trim(), evidence: [],
      customerOutcome: {
        followUpSummary: result.trim(), nextActionTitle: resultNextAction.trim(),
        nextActionDueAt: new Date(resultNextDueAt).toISOString(),
        opportunityStageCode: resultStage, opportunityAmount: amount,
      },
    });
    setSubmitting(false);
    if (response.code !== 0) return setMessage({ severity: 'error', text: response.message || '结果提交失败' });
    setResultTask(null); setResult(''); setResultNextAction(''); setMessage({ severity: 'success', text: '处理结果已提交，等待管理者验收。' });
    await reloadAll();
  };

  const confirm = async (task: EmployeeTask) => {
    setSubmitting(true);
    const response = await enterpriseBrainApi.confirmTask(task.id, { action: 'CONFIRM', comment: '客户介入结果已验收' });
    setSubmitting(false);
    if (response.code !== 0) return setMessage({ severity: 'error', text: response.message || '任务验收失败' });
    setMessage({ severity: 'success', text: '介入任务已验收闭环。' });
    await reloadAll();
  };

  const returnForRevision = async () => {
    if (!returnTask || !returnReason.trim()) return;
    setSubmitting(true);
    const response = await enterpriseBrainApi.confirmTask(returnTask.id, { action: 'RETURN', reason: returnReason.trim() });
    setSubmitting(false);
    if (response.code !== 0) return setMessage({ severity: 'error', text: response.message || '任务退回失败' });
    setReturnTask(null); setReturnReason(''); setMessage({ severity: 'success', text: '任务已退回重新处理。' });
    await loadTasks();
  };

  const saveProgress = async () => {
    const amount = progressAmount.trim() === '' ? null : Number(progressAmount);
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) return;
    if (await onSaveProgress(progressStage, amount)) setProgressOpen(false);
  };

  return <Stack spacing={1.5} sx={{ mb: 2 }}>
    {message && <Alert severity={message.severity} onClose={() => setMessage(null)}>{message.text}</Alert>}

    <Typography variant="caption" sx={{ color: '#8A8794', fontWeight: 750 }}>经营驾驶舱 / 销售部经营战情 / {customer.owner || '未分配'}个人经营 / {customer.name}</Typography>

    <Paper elevation={0} sx={{ p: { xs: 1.75, md: 2.25 }, border: '1px solid #E7E1F1', borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.75 }}><AccountTreeOutlinedIcon sx={{ color: '#7C3AED' }} /><Typography variant="subtitle1" sx={{ fontWeight: 900 }}>客户沟通节点</Typography><Typography variant="caption" color="text.secondary">{activityNodes.length} NODES</Typography></Stack>
      <Box sx={{ display: 'flex', gap: 1.25, overflowX: 'auto', pb: 0.75 }}>
        {activityNodes.map(({ record, nodeType }, index) => <Box key={record.id} sx={{ position: 'relative', minWidth: 132 }}>
          {index < activityNodes.length - 1 && <Box sx={{ display: { xs: 'none', md: 'block' }, position: 'absolute', top: 16, left: '58%', right: '-42%', borderTop: '1px solid #C9B7F7' }} />}
          <Box sx={{ width: 34, height: 34, borderRadius: '50%', border: '1.5px solid #8B5CF6', bgcolor: '#fff', color: '#7C3AED', display: 'grid', placeItems: 'center', position: 'relative', zIndex: 1 }}>
            {record.type === 'manager_intervene' ? <PersonSearchOutlinedIcon fontSize="small" /> : <ForumOutlinedIcon fontSize="small" />}
          </Box>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: '#7C3AED', fontWeight: 850 }}>{communicationNodeLabel[nodeType]}</Typography>
          <Typography variant="body2" noWrap title={record.title} sx={{ fontWeight: 850 }}>{record.title || '客户动态'}</Typography>
          <Typography variant="caption" color="text.secondary">{formatDate(record.createdAt, 'MM-dd HH:mm')}</Typography>
        </Box>)}
        {snapshot.contactGapDays !== null && snapshot.contactGapDays >= 1 && <Box sx={{ minWidth: 150, p: 1.25, border: '1px solid #F6AAA5', borderRadius: 1.5, bgcolor: '#FFF4F2', alignSelf: 'flex-start' }}><Typography variant="caption" sx={{ color: '#C4322B', fontWeight: 900 }}>无沟通</Typography><Typography variant="body2" sx={{ color: '#C4322B', fontWeight: 900 }}>沟通空窗 {snapshot.contactGapDays} 天</Typography></Box>}
        {!activityNodes.length && <Typography variant="body2" color="text.secondary">暂无可展示的真实沟通节点</Typography>}
      </Box>
    </Paper>

    <Paper elevation={0} sx={{ p: { xs: 1.75, md: 2.25 }, border: '1px solid #E7E1F1', borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center"><AssignmentTurnedInOutlinedIcon sx={{ color: '#7C3AED' }} /><Typography variant="subtitle1" sx={{ fontWeight: 900 }}>经营决策摘要</Typography><Chip size="small" label={snapshot.risk.reason} color={snapshot.risk.level === 'high' ? 'error' : snapshot.risk.level === 'medium' ? 'warning' : 'success'} /></Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1.25, mt: 1.25 }}>
            {[
              ['负责人', customer.owner || '未分配'], ['客户等级', customer.customerLevel || '未设置'],
              ['意向产品', customer.intendedProduct || customer.productLevel || '待确认'], ['预计金额', snapshot.opportunityAmount == null ? '待评估' : formatCurrency(snapshot.opportunityAmount)],
              ['销售阶段', snapshot.stage.label],
            ].map(([label, value]) => <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="body2" sx={{ mt: 0.25, fontWeight: 850 }}>{value}</Typography></Box>)}
          </Box>
          <Typography variant="body2" sx={{ mt: 1.25, color: '#5F576F' }}>风险原因：{snapshot.risk.reason}。下一步：{snapshot.nextAction?.title || '未设置'}{snapshot.nextAction?.dueAt ? `，截止 ${formatDate(snapshot.nextAction.dueAt, 'MM-dd HH:mm')}` : ''}。</Typography>
          <Typography variant="body2" sx={{ mt: 0.75, color: '#6D28D9', fontWeight: 800 }}>{recommendation}</Typography>
          {latestTask && <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.25, flexWrap: 'wrap' }}><Chip size="small" label={`介入任务：${statusLabel[latestTask.status]}`} color={latestTask.status === 'COMPLETED' ? 'warning' : latestTask.status === 'CONFIRMED' ? 'success' : latestTask.status === 'RETURNED' ? 'error' : 'primary'} /><Typography variant="caption" color="text.secondary">{latestTask.employeeName} · {latestTask.title}</Typography></Stack>}
          {latestTask?.result && <Typography variant="body2" sx={{ mt: 1, p: 1, bgcolor: '#F7F5FB', borderRadius: 1 }}>处理结果：{latestTask.result}</Typography>}
          {latestTask?.status === 'COMPLETED' && latestOutcome && <Box sx={{ mt: 1, p: 1.25, borderRadius: 1.5, bgcolor: '#F4FAFF', border: '1px solid #D6EAFF' }}><Typography variant="caption" sx={{ color: '#2463A5', fontWeight: 900 }}>待验收写入内容</Typography><Typography variant="body2" sx={{ mt: 0.5 }}>下一步：{latestOutcome.nextActionTitle} · {formatDate(latestOutcome.nextActionDueAt, 'MM-dd HH:mm')}</Typography><Typography variant="body2">销售阶段：{CUSTOMER_OPPORTUNITY_STAGES.find((item) => item.code === latestOutcome.opportunityStageCode)?.label || '保持不变'}{latestOutcome.opportunityAmount === undefined ? '' : ` · 预计金额 ${formatCurrency(latestOutcome.opportunityAmount || 0)}`}</Typography></Box>}
        </Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ flexShrink: 0, alignSelf: { md: 'center' } }}>
          {latestTask && currentUser?.id === latestTask.employeeId && ['PENDING', 'IN_PROGRESS', 'RETURNED'].includes(latestTask.status) && <Button variant="outlined" onClick={() => { setResultTask(latestTask); setResultNextDueAt(defaultDueAt()); setResultStage(customer.opportunityStageCode || 'not_set'); setResultAmount(customer.opportunityAmount == null ? '' : String(customer.opportunityAmount)); }}>提交处理结果</Button>}
          {latestTask?.status === 'COMPLETED' && canConfirm && <><Button variant="outlined" color="error" onClick={() => setReturnTask(latestTask)}>退回</Button><Button variant="contained" color="success" onClick={() => void confirm(latestTask)}>验收通过</Button></>}
          <Button variant="outlined" onClick={onOpenTodos}>下一步动作</Button>
          {canSetProgress && <Button variant="outlined" onClick={() => { setProgressStage(customer.opportunityStageCode || 'not_set'); setProgressAmount(customer.opportunityAmount == null ? '' : String(customer.opportunityAmount)); setProgressOpen(true); }}>更新阶段</Button>}
          {canAssign && <Button variant="contained" endIcon={<ArrowForwardIcon />} onClick={() => setInterventionOpen(true)}>发起管理介入</Button>}
        </Stack>
      </Stack>
      {loadingTasks && <Typography variant="caption" color="text.secondary">正在刷新介入任务…</Typography>}
    </Paper>

    <Dialog open={interventionOpen} onClose={() => setInterventionOpen(false)} maxWidth="sm" fullWidth>
      <DialogCloseTitle onClose={() => setInterventionOpen(false)}>发起管理介入</DialogCloseTitle>
      <DialogContent dividers><Stack spacing={2}>
        <Alert severity="info">任务将进入员工任务中心，处理结果需由管理者验收。</Alert>
        <TextField select label="介入方式" value={mode} onChange={(event) => setMode(event.target.value as InterventionMode)}>{Object.entries(modeConfig).map(([key, config]) => <MenuItem key={key} value={key}>{config.label} · {config.description}</MenuItem>)}</TextField>
        {mode === 'SUPERVISOR_ASSIST' && <TextField select label="协同主管" value={assistAssigneeId} onChange={(event) => setAssistAssigneeId(event.target.value)} helperText={supervisorCandidates.length ? '仅展示组织架构中该销售所在部门及上级部门的负责人' : '组织架构中未配置可选主管'}>{supervisorCandidates.map((user) => <MenuItem key={user.id} value={user.id}>{user.name}{user.positionName ? ` · ${user.positionName}` : ''}</MenuItem>)}</TextField>}
        <TextField label="介入要求与验收口径" value={note} onChange={(event) => setNote(event.target.value)} multiline minRows={3} placeholder="例如：今日18:00前联系客户，确认决策人和下次会议时间，提交沟通结果。" />
        <TextField label="截止时间" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} InputLabelProps={{ shrink: true }} />
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setInterventionOpen(false)}>取消</Button><Button variant="contained" disabled={submitting} onClick={() => void assign()}>下达任务</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(resultTask)} onClose={() => setResultTask(null)} maxWidth="sm" fullWidth><DialogCloseTitle onClose={() => setResultTask(null)}>提交客户处理结果</DialogCloseTitle><DialogContent dividers><Stack spacing={2}><Alert severity="info">老板验收后，本次跟进会写入客户动态，并生成新的下一步待办。</Alert><TextField autoFocus fullWidth multiline minRows={3} label="本次跟进结果" value={result} onChange={(event) => setResult(event.target.value)} /><TextField fullWidth label="下一步动作" value={resultNextAction} onChange={(event) => setResultNextAction(event.target.value)} placeholder="例如：发送正式报价单" /><TextField fullWidth type="datetime-local" label="下一步截止时间" value={resultNextDueAt} onChange={(event) => setResultNextDueAt(event.target.value)} InputLabelProps={{ shrink: true }} /><TextField select label="销售阶段" value={resultStage} onChange={(event) => setResultStage(event.target.value as CustomerOpportunityStageCode)}>{CUSTOMER_OPPORTUNITY_STAGES.map((item) => <MenuItem key={item.code} value={item.code}>{item.label}</MenuItem>)}</TextField><TextField label="预计成交金额" type="number" value={resultAmount} onChange={(event) => setResultAmount(event.target.value)} inputProps={{ min: 0, step: 100 }} /></Stack></DialogContent><DialogActions><Button onClick={() => setResultTask(null)}>取消</Button><Button variant="contained" disabled={submitting || !result.trim() || !resultNextAction.trim() || !resultNextDueAt} onClick={() => void complete()}>提交验收</Button></DialogActions></Dialog>
    <Dialog open={Boolean(returnTask)} onClose={() => setReturnTask(null)} maxWidth="sm" fullWidth><DialogCloseTitle onClose={() => setReturnTask(null)}>退回重新处理</DialogCloseTitle><DialogContent dividers><TextField autoFocus fullWidth multiline minRows={3} label="退回原因" value={returnReason} onChange={(event) => setReturnReason(event.target.value)} /></DialogContent><DialogActions><Button onClick={() => setReturnTask(null)}>取消</Button><Button color="error" variant="contained" disabled={submitting || !returnReason.trim()} onClick={() => void returnForRevision()}>确认退回</Button></DialogActions></Dialog>
    <Dialog open={progressOpen} onClose={() => !progressSaving && setProgressOpen(false)} maxWidth="xs" fullWidth><DialogCloseTitle onClose={() => !progressSaving && setProgressOpen(false)}>更新销售阶段</DialogCloseTitle><DialogContent dividers><Stack spacing={2}><TextField select label="销售阶段" value={progressStage} onChange={(event) => setProgressStage(event.target.value as CustomerOpportunityStageCode)}>{CUSTOMER_OPPORTUNITY_STAGES.map((item) => <MenuItem key={item.code} value={item.code}>{item.label}</MenuItem>)}</TextField><TextField label="预计成交金额" type="number" value={progressAmount} onChange={(event) => setProgressAmount(event.target.value)} inputProps={{ min: 0, step: 100 }} /></Stack></DialogContent><DialogActions><Button onClick={() => setProgressOpen(false)}>取消</Button><Button variant="contained" disabled={progressSaving} onClick={() => void saveProgress()}>{progressSaving ? '保存中…' : '保存'}</Button></DialogActions></Dialog>
  </Stack>;
};

export default CustomerManagementCommandLayer;
