import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Divider,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Paper, Select, Stack, Tab, Tabs,
  TextField, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import RestoreIcon from '@mui/icons-material/Restore';
import { customerApi, customerMergeApi } from '../../api';
import type { Customer } from '../../types/customer';
import type { CustomerMergeField, CustomerMergeFieldDecision, CustomerMergeLedgerView } from '../../types/customerMerge';
import type { CustomerDuplicateGroupView } from '../../api/customerMergeApi';
import { PERMISSION_KEYS, hasExplicitPermission } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';
import { ROUTES } from '../../shared/utils/constants';

const fields: Array<{ key: CustomerMergeField; label: string }> = [
  { key: 'name', label: '客户姓名' }, { key: 'phone', label: '手机号' },
  { key: 'wechat', label: '微信' }, { key: 'email', label: '邮箱' },
  { key: 'company', label: '公司' }, { key: 'ownerId', label: '负责人' },
  { key: 'lifecycleStatusCode', label: '客户进度' },
];

const same = (customers: Customer[], field: CustomerMergeField) => (
  new Set(customers.map((customer) => String(customer[field] || '').trim()).filter(Boolean)).size <= 1
);

const CustomerDuplicateGovernance: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canUndo = hasExplicitPermission(currentUser, PERMISSION_KEYS.CUSTOMER_MERGE_UNDO, 'write');
  const [tab, setTab] = useState<'candidates' | 'history'>('candidates');
  const [candidates, setCandidates] = useState<CustomerDuplicateGroupView[]>([]);
  const [history, setHistory] = useState<CustomerMergeLedgerView[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mainCustomerId, setMainCustomerId] = useState('');
  const [decisions, setDecisions] = useState<Partial<Record<CustomerMergeField, CustomerMergeFieldDecision>>>({});
  const [reason, setReason] = useState('');
  const [precheckToken, setPrecheckToken] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<{ ledger: CustomerMergeLedgerView; token: string } | null>(null);

  const refresh = useCallback(async () => {
    const [candidateResponse, historyResponse] = await Promise.all([
      customerMergeApi.listCandidates(), customerMergeApi.listHistory(),
    ]);
    if (candidateResponse.code === 0) setCandidates(candidateResponse.data || []);
    if (historyResponse.code === 0) setHistory(historyResponse.data || []);
  }, []);

  const loadCustomers = useCallback(async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean))).slice(0, 10);
    if (uniqueIds.length < 2) { setCustomers([]); return; }
    setBusy(true);
    try {
      const responses = await Promise.all(uniqueIds.map((id) => customerApi.fetchCustomerById(id)));
      const loaded = responses.filter((response) => response.code === 0 && response.data).map((response) => response.data!);
      setCustomers(loaded);
      setMainCustomerId(loaded[0]?.id || '');
      setPrecheckToken('');
      setReason('');
    } finally { setBusy(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const ids = (searchParams.get('ids') || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (ids.length >= 2) loadCustomers(ids);
  }, [loadCustomers, searchParams]);

  useEffect(() => {
    if (!mainCustomerId || !customers.length) return;
    const next: Partial<Record<CustomerMergeField, CustomerMergeFieldDecision>> = {};
    for (const field of fields) if (!same(customers, field.key)) next[field.key] = { sourceCustomerId: mainCustomerId };
    setDecisions(next);
    setPrecheckToken('');
  }, [customers, mainCustomerId]);

  const selectedTags = useMemo(() => Array.from(new Set(customers.flatMap((customer) => customer.manualTagIds || []))), [customers]);
  const mergeInput = useMemo(() => ({
    mainCustomerId,
    secondaryCustomerIds: customers.map((customer) => customer.id).filter((id) => id !== mainCustomerId),
    fieldDecisions: decisions,
    tagDecision: { selectedTagIds: selectedTags },
    reason: reason.trim(),
  }), [customers, decisions, mainCustomerId, reason, selectedTags]);

  const runPrecheck = async () => {
    if (!reason.trim()) { setNotice({ type: 'error', text: '请填写合并原因' }); return; }
    setBusy(true);
    try {
      const response = await customerMergeApi.precheck(mergeInput);
      if (response.code !== 0 || !response.data?.executable || !response.data.precheckToken) {
        const messages = response.data?.conflicts?.map((item) => item.message).join('；');
        setNotice({ type: 'error', text: messages || response.message || '预检未通过' });
        setPrecheckToken('');
        return;
      }
      setPrecheckToken(response.data.precheckToken);
      setNotice({ type: 'info', text: '预检通过。请核对后确认合并；确认令牌 10 分钟内有效。' });
    } finally { setBusy(false); }
  };

  const executeMerge = async () => {
    if (!precheckToken) return;
    setBusy(true);
    try {
      const response = await customerMergeApi.execute({ ...mergeInput, precheckToken, idempotencyKey: `merge-${crypto.randomUUID()}` });
      if (response.code !== 0) { setNotice({ type: 'error', text: response.message || '合并失败' }); return; }
      setNotice({ type: 'success', text: '客户已原子合并，72 小时内在合并记录中可执行条件撤销。' });
      setCustomers([]); setPrecheckToken(''); await refresh(); setTab('history');
    } finally { setBusy(false); }
  };

  const undoMerge = async (ledger: CustomerMergeLedgerView) => {
    setBusy(true);
    try {
      const checked = await customerMergeApi.undoPrecheck(ledger.id);
      if (checked.code !== 0 || !checked.data?.executable || !checked.data.precheckToken) {
        setNotice({ type: 'error', text: checked.data?.conflicts?.map((item) => item.message).join('；') || checked.message || '撤销预检未通过' });
        return;
      }
      setPendingUndo({ ledger, token: checked.data.precheckToken });
    } finally { setBusy(false); }
  };

  const confirmUndoMerge = async () => {
    if (!pendingUndo) return;
    setBusy(true);
    try {
      const response = await customerMergeApi.undo(pendingUndo.ledger.id, pendingUndo.token, `undo-${crypto.randomUUID()}`);
      if (response.code !== 0) { setNotice({ type: 'error', text: response.message || '撤销失败' }); return; }
      setPendingUndo(null);
      setNotice({ type: 'success', text: '客户合并已撤销。' });
      await refresh();
    } finally { setBusy(false); }
  };

  return (
    <Box sx={{ p: 3, maxWidth: 1440, mx: 'auto' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
        <Box><Typography variant="h5" fontWeight={800}>重复客户治理</Typography><Typography color="text.secondary">候选发现、人工确认、原子合并与受控撤销</Typography></Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(ROUTES.CUSTOMERS)}>返回客户列表</Button>
      </Stack>
      {notice && <Alert severity={notice.type} sx={{ mb: 2 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      <Paper sx={{ mb: 2 }}><Tabs value={tab} onChange={(_, value) => setTab(value)}><Tab value="candidates" label={`重复候选 ${candidates.length}`} /><Tab value="history" label={`合并记录 ${history.length}`} /></Tabs></Paper>

      {tab === 'candidates' && <Stack spacing={2}>
        <Paper sx={{ p: 2 }}>
          <Typography fontWeight={700} mb={1}>候选客户</Typography>
          <Typography color="text.secondary" mb={2}>可从客户列表勾选 2–10 位客户后点击“合并客户”，也可以从系统发现的候选组开始。</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {candidates.map((group) => <Button key={group.id} variant="outlined" onClick={() => loadCustomers(group.customerIds)}>候选组 · {group.customerIds.length} 位客户</Button>)}
            {!candidates.length && <Chip label="暂无自动候选，可从客户列表人工选择" />}
          </Stack>
        </Paper>

        {busy && !customers.length && <CircularProgress />}
        {customers.length >= 2 && <Paper sx={{ p: 3 }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={2}><MergeTypeIcon color="primary" /><Typography variant="h6" fontWeight={800}>合并客户</Typography></Stack>
          <Typography fontWeight={700} mb={1}>1. 选择主客户</Typography>
          <FormControl fullWidth sx={{ mb: 3 }}><InputLabel>主客户</InputLabel><Select value={mainCustomerId} label="主客户" onChange={(event) => setMainCustomerId(event.target.value)}>{customers.map((customer) => <MenuItem key={customer.id} value={customer.id}>{customer.name} · {customer.phone || customer.wechat || customer.id}</MenuItem>)}</Select></FormControl>
          <Typography fontWeight={700} mb={1}>2. 字段保留规则</Typography>
          <Stack spacing={1.5} mb={3}>{fields.filter((field) => !same(customers, field.key)).map((field) => <FormControl key={field.key} fullWidth><InputLabel>{field.label}</InputLabel><Select label={field.label} value={decisions[field.key]?.sourceCustomerId || mainCustomerId} onChange={(event) => { setDecisions((current) => ({ ...current, [field.key]: { sourceCustomerId: event.target.value } })); setPrecheckToken(''); }}>{customers.map((customer) => <MenuItem key={customer.id} value={customer.id}>{customer.name}：{String(customer[field.key] || '空值')}</MenuItem>)}</Select></FormControl>)}</Stack>
          <Typography fontWeight={700} mb={1}>3. 最终确认</Typography>
          <Alert severity="warning" sx={{ mb: 2 }}>合并会迁移订单、交付、售后、待办、财务和联系方式关联。操作原子执行，并提供 72 小时条件撤销窗口。</Alert>
          <TextField fullWidth multiline minRows={2} label="合并原因" value={reason} onChange={(event) => { setReason(event.target.value); setPrecheckToken(''); }} />
          <Stack direction="row" justifyContent="flex-end" spacing={1.5} mt={2}><Button variant="outlined" disabled={busy} onClick={runPrecheck}>执行预检</Button><Button variant="contained" disabled={busy || !precheckToken} onClick={executeMerge}>确认合并</Button></Stack>
        </Paper>}
      </Stack>}

      {tab === 'history' && <Stack spacing={2}>{history.map((ledger) => <Card key={ledger.id} variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Box><Stack direction="row" spacing={1} alignItems="center"><Typography fontWeight={800}>{ledger.mainCustomerId}</Typography><Chip size="small" color={ledger.status === 'merged' ? 'primary' : 'default'} label={ledger.status === 'merged' ? '已合并' : '已撤销'} /></Stack><Typography color="text.secondary" mt={1}>合并 {ledger.secondaryCustomerIds.length} 位次客户 · {new Date(ledger.mergedAt).toLocaleString()}</Typography><Typography mt={1}>原因：{ledger.reason}</Typography><Typography color="text.secondary">操作人：{ledger.actor.name} · 撤销截止：{new Date(ledger.undoDeadlineAt).toLocaleString()}</Typography></Box>{canUndo && ledger.status === 'merged' && <Button startIcon={<RestoreIcon />} onClick={() => undoMerge(ledger)}>撤销合并</Button>}</Stack></CardContent></Card>)}{!history.length && <Paper sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">暂无合并记录</Typography></Paper>}</Stack>}
      <Divider sx={{ mt: 3 }} />
      <Dialog open={Boolean(pendingUndo)} onClose={() => !busy && setPendingUndo(null)} maxWidth="sm" fullWidth>
        <DialogTitle>确认撤销客户合并</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1 }}>系统会恢复本次合并前的客户资料、联系方式和业务关联。若合并后数据已经变化，服务端会拒绝撤销。</Alert>
        </DialogContent>
        <DialogActions><Button disabled={busy} onClick={() => setPendingUndo(null)}>取消</Button><Button variant="contained" color="warning" disabled={busy} onClick={confirmUndoMerge}>确认撤销</Button></DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomerDuplicateGovernance;
