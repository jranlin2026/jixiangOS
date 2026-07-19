import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress, Divider,
  Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  LinearProgress, Paper, Radio, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CompareArrowsRoundedIcon from '@mui/icons-material/CompareArrowsRounded';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import RestoreIcon from '@mui/icons-material/Restore';
import { customerApi, customerMergeApi } from '../../api';
import type { Customer } from '../../types/customer';
import type {
  CustomerMergeField,
  CustomerMergeFieldDecision,
  CustomerMergeLedgerView,
  CustomerMergePrecheckResult,
} from '../../types/customerMerge';
import type { CustomerDuplicateGroupView } from '../../api/customerMergeApi';
import { PERMISSION_KEYS, hasExplicitPermission } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';
import { ROUTES } from '../../shared/utils/constants';

const fields: Array<{ key: CustomerMergeField; label: string }> = [
  { key: 'name', label: '客户姓名' },
  { key: 'phone', label: '手机号' },
  { key: 'wechat', label: '微信' },
  { key: 'company', label: '公司' },
  { key: 'ownerId', label: '销售负责人' },
  { key: 'lifecycleStatusCode', label: '客户进度' },
];

const associationLabels: Record<string, string> = {
  orders: '订单',
  deliveries: '交付记录',
  recovery_orders: '售后挽回订单',
  customer_todos: '客户待办',
  lead_records: '线索记录',
  finance: '财务记录',
  commissions: '分账与提成',
};

const normalizedAssociationLabel = (key: string) => {
  const suffix = key.split('/').pop() || key;
  return associationLabels[suffix] || associationLabels[key] || key;
};

const fieldDisplayValue = (customer: Customer, field: CustomerMergeField) => {
  if (field === 'ownerId') return customer.owner || '未分配';
  const value = customer[field];
  return String(value || '').trim() || '未填写';
};

const same = (customers: Customer[], field: CustomerMergeField) => (
  new Set(customers.map((customer) => fieldDisplayValue(customer, field)).filter((value) => value !== '未填写')).size <= 1
);

const customerIdentity = (customer: Customer) => customer.phone || customer.wechat || customer.company || customer.id;

const CustomerDuplicateGovernance: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canUndo = hasExplicitPermission(currentUser, PERMISSION_KEYS.CUSTOMER_MERGE_UNDO, 'write');
  const [tab, setTab] = useState<'candidates' | 'history'>('candidates');
  const [step, setStep] = useState(0);
  const [candidates, setCandidates] = useState<CustomerDuplicateGroupView[]>([]);
  const [history, setHistory] = useState<CustomerMergeLedgerView[]>([]);
  const [historyMainNames, setHistoryMainNames] = useState<Record<string, string>>({});
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mainCustomerId, setMainCustomerId] = useState('');
  const [decisions, setDecisions] = useState<Partial<Record<CustomerMergeField, CustomerMergeFieldDecision>>>({});
  const [reason, setReason] = useState('');
  const [precheck, setPrecheck] = useState<CustomerMergePrecheckResult | null>(null);
  const [precheckToken, setPrecheckToken] = useState('');
  const [notice, setNotice] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingUndo, setPendingUndo] = useState<{ ledger: CustomerMergeLedgerView; token: string } | null>(null);

  const clearCheck = useCallback(() => {
    setPrecheck(null);
    setPrecheckToken('');
  }, []);

  const refresh = useCallback(async () => {
    const [candidateResponse, historyResponse] = await Promise.all([
      customerMergeApi.listCandidates(),
      customerMergeApi.listHistory(),
    ]);
    if (candidateResponse.code === 0) setCandidates(candidateResponse.data || []);
    if (historyResponse.code === 0) {
      const nextHistory = historyResponse.data || [];
      setHistory(nextHistory);
      const mainIds = Array.from(new Set(nextHistory.map((item) => item.mainCustomerId)));
      const responses = await Promise.all(mainIds.map((id) => customerApi.fetchCustomerById(id)));
      setHistoryMainNames(Object.fromEntries(responses.flatMap((response) => (
        response.code === 0 && response.data ? [[response.data.id, response.data.name] as const] : []
      ))));
    }
  }, []);

  const loadCustomers = useCallback(async (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean))).slice(0, 10);
    if (uniqueIds.length < 2) {
      setCustomers([]);
      return;
    }
    setBusy(true);
    try {
      const responses = await Promise.all(uniqueIds.map((id) => customerApi.fetchCustomerById(id)));
      const loaded = responses
        .filter((response) => response.code === 0 && response.data)
        .map((response) => response.data!);
      setCustomers(loaded);
      setMainCustomerId(loaded[0]?.id || '');
      setReason('');
      setStep(0);
      clearCheck();
      if (loaded.length !== uniqueIds.length) {
        setNotice({ type: 'error', text: '部分客户已不可用，请返回客户列表重新选择。' });
      }
    } finally {
      setBusy(false);
    }
  }, [clearCheck]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const ids = (searchParams.get('ids') || '').split(',').map((id) => id.trim()).filter(Boolean);
    if (ids.length >= 2) void loadCustomers(ids);
  }, [loadCustomers, searchParams]);

  useEffect(() => {
    if (!mainCustomerId || !customers.length) return;
    const next: Partial<Record<CustomerMergeField, CustomerMergeFieldDecision>> = {};
    for (const field of fields) if (!same(customers, field.key)) next[field.key] = { sourceCustomerId: mainCustomerId };
    setDecisions(next);
    clearCheck();
  }, [clearCheck, customers, mainCustomerId]);

  const mainCustomer = useMemo(
    () => customers.find((customer) => customer.id === mainCustomerId),
    [customers, mainCustomerId],
  );
  const conflictFields = useMemo(() => fields.filter((field) => !same(customers, field.key)), [customers]);
  const selectedTags = useMemo(
    () => Array.from(new Set(customers.flatMap((customer) => customer.manualTagIds || []))),
    [customers],
  );
  const mergeInput = useMemo(() => ({
    mainCustomerId,
    secondaryCustomerIds: customers.map((customer) => customer.id).filter((id) => id !== mainCustomerId),
    fieldDecisions: decisions,
    tagDecision: { selectedTagIds: selectedTags },
    reason: reason.trim(),
  }), [customers, decisions, mainCustomerId, reason, selectedTags]);

  const finalValue = (field: CustomerMergeField) => {
    const sourceId = decisions[field]?.sourceCustomerId || mainCustomerId;
    const source = customers.find((customer) => customer.id === sourceId) || mainCustomer;
    return source ? fieldDisplayValue(source, field) : '未填写';
  };

  const runPrecheck = async () => {
    if (!reason.trim()) {
      setNotice({ type: 'error', text: '请填写为什么要合并这几条客户资料。' });
      return;
    }
    setBusy(true);
    try {
      const response = await customerMergeApi.precheck(mergeInput);
      setPrecheck(response.data || null);
      if (response.code !== 0 || !response.data?.executable || !response.data.precheckToken) {
        const messages = response.data?.conflicts?.map((item) => item.message).join('；');
        setNotice({ type: 'error', text: messages || response.message || '当前资料不能合并，请按提示处理。' });
        setPrecheckToken('');
        return;
      }
      setPrecheckToken(response.data.precheckToken);
      setNotice({ type: 'info', text: '检查通过。请核对下方影响范围，再确认合并。' });
    } finally {
      setBusy(false);
    }
  };

  const executeMerge = async () => {
    if (!precheckToken) return;
    setBusy(true);
    try {
      const response = await customerMergeApi.execute({
        ...mergeInput,
        precheckToken,
        idempotencyKey: `merge-${crypto.randomUUID()}`,
      });
      if (response.code !== 0) {
        setNotice({ type: 'error', text: response.message || '合并失败，请重新检查合并影响。' });
        clearCheck();
        return;
      }
      setNotice({ type: 'success', text: '客户资料已合并。主客户继续使用，其他资料已归并并保留审计记录。' });
      setCustomers([]);
      clearCheck();
      await refresh();
      setTab('history');
    } finally {
      setBusy(false);
    }
  };

  const undoMerge = async (ledger: CustomerMergeLedgerView) => {
    setBusy(true);
    try {
      const checked = await customerMergeApi.undoPrecheck(ledger.id);
      if (checked.code !== 0 || !checked.data?.executable || !checked.data.precheckToken) {
        setNotice({
          type: 'error',
          text: checked.data?.conflicts?.map((item) => item.message).join('；') || checked.message || '当前合并不能撤销。',
        });
        return;
      }
      setPendingUndo({ ledger, token: checked.data.precheckToken });
    } finally {
      setBusy(false);
    }
  };

  const confirmUndoMerge = async () => {
    if (!pendingUndo) return;
    setBusy(true);
    try {
      const response = await customerMergeApi.undo(
        pendingUndo.ledger.id,
        pendingUndo.token,
        `undo-${crypto.randomUUID()}`,
      );
      if (response.code !== 0) {
        setNotice({ type: 'error', text: response.message || '撤销失败。' });
        return;
      }
      setPendingUndo(null);
      setNotice({ type: 'success', text: '客户合并已撤销。' });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const chooseMainCustomer = (id: string) => {
    setMainCustomerId(id);
    clearCheck();
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1440, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} gap={1} mb={2}>
        <Box>
          <Typography variant="h5" fontWeight={800}>合并重复客户</Typography>
          <Typography color="text.secondary">把同一个客户的多条资料整理成一份完整档案</Typography>
        </Box>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(ROUTES.CUSTOMERS)}>返回客户列表</Button>
      </Stack>

      {notice && <Alert severity={notice.type} sx={{ mb: 2 }} onClose={() => setNotice(null)}>{notice.text}</Alert>}
      <Paper sx={{ mb: 2 }}>
        <Tabs value={tab} onChange={(_, value) => setTab(value)}>
          <Tab value="candidates" label={`待处理重复资料 ${candidates.length}`} />
          <Tab value="history" label={`合并记录 ${history.length}`} />
        </Tabs>
      </Paper>

      {tab === 'candidates' && (
        <Stack spacing={2}>
          {!customers.length && (
            <Paper sx={{ p: 3 }}>
              <Typography fontWeight={800} mb={0.5}>选择要整理的重复资料</Typography>
              <Typography color="text.secondary" mb={2}>
                建议从客户列表勾选 2–10 条属于同一个人的资料，再点击“合并已选客户”。也可以从系统发现的候选组开始。
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {candidates.map((group) => (
                  <Button key={group.id} variant="outlined" onClick={() => void loadCustomers(group.customerIds)}>
                    查看 {group.customerIds.length} 条疑似重复资料
                  </Button>
                ))}
                {!candidates.length && <Chip label="暂无系统候选，请从客户列表勾选" />}
              </Stack>
            </Paper>
          )}

          {busy && !customers.length && <LinearProgress />}
          {customers.length >= 2 && (
            <>
              <Paper sx={{ p: 1.25, border: '1px solid', borderColor: 'divider' }}>
                <Stack direction={{ xs: 'column', md: 'row' }} gap={1}>
                  {['对比资料并选择主客户', '确定最终保留资料', '检查影响并确认'].map((label, index) => (
                    <Box
                      key={label}
                      sx={{
                        flex: 1,
                        px: 2,
                        py: 1.25,
                        borderRadius: 1.5,
                        bgcolor: step === index ? 'primary.main' : index < step ? 'primary.50' : 'transparent',
                        color: step === index ? 'primary.contrastText' : index < step ? 'primary.main' : 'text.secondary',
                        fontWeight: 700,
                      }}
                    >
                      {index + 1}. {label}
                    </Box>
                  ))}
                </Stack>
              </Paper>

              {step === 0 && (
                <Paper sx={{ p: { xs: 2, md: 3 } }}>
                  <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                    <CompareArrowsRoundedIcon color="primary" />
                    <Typography variant="h6" fontWeight={800}>选择主客户</Typography>
                  </Stack>
                  <Typography color="text.secondary" mb={2.5}>
                    主客户是合并后继续使用的档案。其他资料不会直接删除，而是归并到主客户并保留操作记录。
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: `repeat(${Math.min(customers.length, 3)}, minmax(0, 1fr))` }, gap: 2 }}>
                    {customers.map((customer) => {
                      const selected = customer.id === mainCustomerId;
                      return (
                        <Card
                          key={customer.id}
                          variant="outlined"
                          sx={{ borderWidth: selected ? 2 : 1, borderColor: selected ? 'primary.main' : 'divider', position: 'relative' }}
                        >
                          <CardActionArea onClick={() => chooseMainCustomer(customer.id)} sx={{ height: '100%', alignItems: 'stretch' }}>
                            <CardContent>
                              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={2}>
                                <Box>
                                  <Typography variant="h6" fontWeight={800}>{customer.name || '未填写姓名'}</Typography>
                                  <Typography variant="body2" color="text.secondary">{customerIdentity(customer)}</Typography>
                                </Box>
                                <Chip
                                  size="small"
                                  color={selected ? 'primary' : 'default'}
                                  icon={selected ? <CheckCircleRoundedIcon /> : undefined}
                                  label={selected ? '合并后保留' : '设为主客户'}
                                />
                              </Stack>
                              <Stack spacing={1.1}>
                                {fields.slice(1).map((field) => (
                                  <Stack key={field.key} direction="row" justifyContent="space-between" gap={2}>
                                    <Typography variant="body2" color="text.secondary">{field.label}</Typography>
                                    <Typography variant="body2" fontWeight={600} textAlign="right">{fieldDisplayValue(customer, field.key)}</Typography>
                                  </Stack>
                                ))}
                                <Divider />
                                <Stack direction="row" justifyContent="space-between">
                                  <Typography variant="body2" color="text.secondary">历史业务</Typography>
                                  <Typography variant="body2" fontWeight={700}>{customer.orderCount || 0} 笔订单 · ¥{Number(customer.totalSpent || 0).toLocaleString()}</Typography>
                                </Stack>
                              </Stack>
                            </CardContent>
                          </CardActionArea>
                        </Card>
                      );
                    })}
                  </Box>
                  <Stack direction="row" justifyContent="flex-end" mt={3}>
                    <Button variant="contained" onClick={() => setStep(1)}>下一步：确定保留资料</Button>
                  </Stack>
                </Paper>
              )}

              {step === 1 && (
                <Paper sx={{ p: { xs: 2, md: 3 } }}>
                  <Typography variant="h6" fontWeight={800}>确定最终保留资料</Typography>
                  <Typography color="text.secondary" mb={2.5}>
                    只需要处理内容不一致的字段。没有冲突的资料和所有客户标签会自动保留。
                  </Typography>
                  <Stack spacing={2}>
                    {conflictFields.map((field) => (
                      <Box key={field.key} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                        <Typography fontWeight={800} mb={1}>{field.label}</Typography>
                        <Stack direction={{ xs: 'column', md: 'row' }} gap={1}>
                          {customers.map((customer) => {
                            const selected = (decisions[field.key]?.sourceCustomerId || mainCustomerId) === customer.id;
                            return (
                              <Paper
                                key={customer.id}
                                variant="outlined"
                                onClick={() => {
                                  setDecisions((current) => ({ ...current, [field.key]: { sourceCustomerId: customer.id } }));
                                  clearCheck();
                                }}
                                sx={{
                                  flex: 1,
                                  p: 1.25,
                                  cursor: 'pointer',
                                  borderColor: selected ? 'primary.main' : 'divider',
                                  bgcolor: selected ? 'primary.50' : 'background.paper',
                                }}
                              >
                                <FormControlLabel
                                  control={<Radio checked={selected} />}
                                  label={<Box><Typography fontWeight={700}>{fieldDisplayValue(customer, field.key)}</Typography><Typography variant="caption" color="text.secondary">来自 {customer.name}</Typography></Box>}
                                />
                              </Paper>
                            );
                          })}
                        </Stack>
                      </Box>
                    ))}
                    {!conflictFields.length && <Alert severity="success">这些资料的核心字段一致，不需要逐项选择。</Alert>}
                    <Alert severity="info">客户动态、成长记录和标签会去重后集中到主客户，不会因为选择主客户而丢失。</Alert>
                  </Stack>
                  <Stack direction="row" justifyContent="space-between" mt={3}>
                    <Button onClick={() => setStep(0)}>上一步</Button>
                    <Button variant="contained" onClick={() => setStep(2)}>下一步：检查合并影响</Button>
                  </Stack>
                </Paper>
              )}

              {step === 2 && (
                <Paper sx={{ p: { xs: 2, md: 3 } }}>
                  <Stack direction="row" spacing={1} alignItems="center" mb={0.5}>
                    <MergeTypeIcon color="primary" />
                    <Typography variant="h6" fontWeight={800}>合并后将保留这份客户档案</Typography>
                  </Stack>
                  <Typography color="text.secondary" mb={2.5}>请最后核对客户资料和需要迁移的业务记录。</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.2fr) minmax(320px, .8fr)' }, gap: 2 }}>
                    <Paper variant="outlined" sx={{ p: 2.5 }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={2}>
                        <Box>
                          <Typography variant="h6" fontWeight={800}>{finalValue('name')}</Typography>
                          <Typography color="text.secondary">主客户：{mainCustomer?.name} · {mainCustomerId}</Typography>
                        </Box>
                        <Chip color="primary" label="最终档案" />
                      </Stack>
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
                        {fields.slice(1).map((field) => (
                          <Box key={field.key}>
                            <Typography variant="caption" color="text.secondary">{field.label}</Typography>
                            <Typography fontWeight={700}>{finalValue(field.key)}</Typography>
                          </Box>
                        ))}
                      </Box>
                    </Paper>
                    <Paper variant="outlined" sx={{ p: 2.5, bgcolor: 'grey.50' }}>
                      <Typography fontWeight={800} mb={1.5}>将发生什么</Typography>
                      <Stack spacing={1}>
                        <Typography variant="body2">• 保留 1 个主客户，归并 {customers.length - 1} 条重复资料</Typography>
                        <Typography variant="body2">• 订单、交付、售后、待办和财务记录转到主客户</Typography>
                        <Typography variant="body2">• 客户动态、成长记录和标签集中保留</Typography>
                        <Typography variant="body2">• 完整记录操作人、原因和合并前数据</Typography>
                        <Typography variant="body2">• 72 小时内满足条件可以撤销</Typography>
                      </Stack>
                    </Paper>
                  </Box>

                  <TextField
                    fullWidth
                    multiline
                    minRows={2}
                    label="合并原因"
                    placeholder="例如：手机号和微信确认属于同一位客户，清理重复录入资料"
                    value={reason}
                    onChange={(event) => { setReason(event.target.value); clearCheck(); }}
                    sx={{ mt: 2 }}
                  />

                  {busy && <LinearProgress sx={{ mt: 2 }} />}
                  {precheck?.executable && (
                    <Alert severity="success" sx={{ mt: 2 }}>
                      <Typography fontWeight={800} mb={0.5}>检查通过，可以安全合并</Typography>
                      {Object.entries(precheck.associationCounts).length ? (
                        <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
                          {Object.entries(precheck.associationCounts).map(([key, count]) => (
                            <Chip key={key} size="small" label={`${normalizedAssociationLabel(key)} ${count} 条`} />
                          ))}
                        </Stack>
                      ) : <Typography variant="body2">没有需要迁移的关联业务记录。</Typography>}
                    </Alert>
                  )}

                  <Stack direction={{ xs: 'column-reverse', sm: 'row' }} justifyContent="space-between" gap={1.5} mt={3}>
                    <Button onClick={() => setStep(1)} disabled={busy}>上一步</Button>
                    <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
                      <Button variant="outlined" disabled={busy} onClick={() => void runPrecheck()}>
                        {precheckToken ? '重新检查合并影响' : '检查合并影响'}
                      </Button>
                      <Button variant="contained" disabled={busy || !precheckToken} onClick={() => void executeMerge()}>
                        确认合并为“{finalValue('name')}”
                      </Button>
                    </Stack>
                  </Stack>
                </Paper>
              )}
            </>
          )}
        </Stack>
      )}

      {tab === 'history' && (
        <Stack spacing={2}>
          {history.map((ledger) => (
            <Card key={ledger.id} variant="outlined">
              <CardContent>
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'flex-start' }} gap={2}>
                  <Box>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography fontWeight={800}>{historyMainNames[ledger.mainCustomerId] || '主客户'}</Typography>
                      <Chip size="small" color={ledger.status === 'merged' ? 'primary' : 'default'} label={ledger.status === 'merged' ? '已合并' : '已撤销'} />
                    </Stack>
                    <Typography variant="body2" color="text.secondary" mt={0.5}>客户编号：{ledger.mainCustomerId}</Typography>
                    <Typography mt={1}>已归并 {ledger.secondaryCustomerIds.length} 条重复资料 · {new Date(ledger.mergedAt).toLocaleString()}</Typography>
                    <Typography mt={0.5}>合并原因：{ledger.reason}</Typography>
                    <Typography color="text.secondary">操作人：{ledger.actor.name} · 撤销截止：{new Date(ledger.undoDeadlineAt).toLocaleString()}</Typography>
                  </Box>
                  {canUndo && ledger.status === 'merged' && <Button startIcon={<RestoreIcon />} onClick={() => void undoMerge(ledger)}>撤销合并</Button>}
                </Stack>
              </CardContent>
            </Card>
          ))}
          {!history.length && <Paper sx={{ p: 4, textAlign: 'center' }}><Typography color="text.secondary">暂无合并记录</Typography></Paper>}
        </Stack>
      )}

      <Divider sx={{ mt: 3 }} />
      <Dialog open={Boolean(pendingUndo)} onClose={() => !busy && setPendingUndo(null)} maxWidth="sm" fullWidth>
        <DialogTitle>确认撤销客户合并</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1 }}>系统会恢复合并前的客户资料和业务关联。如果合并后已经产生新数据，为保护客户资产，系统会拒绝自动撤销。</Alert>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setPendingUndo(null)}>取消</Button>
          <Button variant="contained" color="warning" disabled={busy} onClick={() => void confirmUndoMerge()}>确认撤销</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomerDuplicateGovernance;
