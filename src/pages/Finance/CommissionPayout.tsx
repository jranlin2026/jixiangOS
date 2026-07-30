import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { useNavigate } from 'react-router-dom';
import { commissionPayoutApi } from '../../api/commissionPayoutApi';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { formatCurrency, formatDateTime, formatPaginationRows } from '../../shared/utils/formatters';
import { ROUTES } from '../../shared/utils/constants';
import TablePagination from '../../shared/components/TablePagination';
import { moduleTablePaperSx, moduleTableSx } from '../../shared/components/ModuleShell';
import { subscribePageRefresh } from '../../shared/utils/pageRefresh';
import { isRecoveryCommission } from '../../shared/utils/commissionConfiguration';
import type {
  CommissionCorrectionHandlingMethod,
  CommissionCorrectionLeg,
  CommissionCorrectionPage,
  CommissionCorrectionRecord,
  CommissionPayoutEmployeeRow,
  CommissionPayoutRecord,
  CommissionPayoutWorkspace,
} from '../../types/commission';
import Commission from '../Commission';
import OperationFeedbackDialog, { type OperationFeedbackSeverity } from '../../shared/components/OperationFeedbackDialog';
import {
  buildPendingEmployeePresentation,
  filterPendingEmployeeCommissions,
  pendingCommissionStatusLabel,
  type PendingCommissionFilter,
} from './commissionPayoutPresentation';

type PayoutView = 'pending' | 'records' | 'corrections' | 'summary';
type CorrectionStatusFilter = '全部' | '无差额' | '待处理' | '已处理';
type RecoverHandlingMethod = Exclude<CommissionCorrectionHandlingMethod, '提成补发'>;

interface CorrectionHandlingTarget {
  recordId: string;
  correctionNo: string;
  sourceBusinessNo: string;
  leg: CommissionCorrectionLeg;
}

const todayInput = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const commissionMonth = (value: { paymentDate?: string; createdAt: string }) => (
  String(value.paymentDate || value.createdAt).slice(0, 7)
);

type PayoutCommission = CommissionPayoutEmployeeRow['commissions'][number];

const isAfterSalesRecoveryCorrectionSource = (commission: PayoutCommission) => (
  commission.sourceBusinessType === 'after_sales_recovery'
);

const supportsPostPayoutCorrection = (commission: PayoutCommission) => (
  isAfterSalesRecoveryCorrectionSource(commission)
  || (!isRecoveryCommission(commission) && Boolean(commission.orderId))
);

const commissionSourceId = (commission: PayoutCommission) => (
  isAfterSalesRecoveryCorrectionSource(commission)
    ? commission.sourceRecoveryOrderId || commission.orderId || ''
    : supportsPostPayoutCorrection(commission) ? commission.orderId || '' : ''
);

const commissionTypeLabel = (commission: PayoutCommission) => {
  if (isRecoveryCommission(commission)) return '售后挽回提成';
  if (commission.ruleCalculationType === 'tiered_percentage') return '月度阶梯提成';
  return '普通订单提成';
};

const commissionCalculationText = (commission: CommissionPayoutEmployeeRow['commissions'][number]) => (
  commission.formulaText || commission.calculationNote || commission.payoutPlanName || '-'
);

const correctionSourceLabel = (record: CommissionCorrectionRecord) => (
  record.sourceBusinessType === 'after_sales_recovery' ? '售后挽回' : '正式订单'
);

const correctionStatusColor = (status: CommissionCorrectionRecord['status']) => {
  if (status === '已处理') return 'success' as const;
  if (status === '待处理') return 'warning' as const;
  return 'default' as const;
};

const employeeMonthLabel = (row: CommissionPayoutEmployeeRow) => {
  const months = [...new Set(row.commissions.map(commissionMonth))].sort();
  if (!months.length) return '归属月份未知';
  if (months.length === 1) return `${months[0]} 归属`;
  return `${months[0]} 至 ${months[months.length - 1]} · ${months.length}个月`;
};

const metricCard = (label: string, value: string, hint: string, color = '#0f172a') => (
  <Paper variant="outlined" sx={{ p: 2, minWidth: 0 }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="h5" sx={{ mt: 0.5, fontWeight: 800, color }}>{value}</Typography>
    <Typography variant="caption" color="text.secondary">{hint}</Typography>
  </Paper>
);

const CommissionPayout: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canManage = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_PAYOUT, 'write');
  const canProcessPaidCommission = isSuperAdmin(currentUser);
  const [view, setView] = useState<PayoutView>('pending');
  const [workspace, setWorkspace] = useState<CommissionPayoutWorkspace | null>(null);
  const [correctionData, setCorrectionData] = useState<CommissionCorrectionPage | null>(null);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState<{ severity: OperationFeedbackSeverity; message: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [detailEmployee, setDetailEmployee] = useState<CommissionPayoutEmployeeRow | null>(null);
  const [detailRecord, setDetailRecord] = useState<CommissionPayoutRecord | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueAt, setIssueAt] = useState(todayInput);
  const [paymentMethod, setPaymentMethod] = useState('银行转账');
  const [paymentReference, setPaymentReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pendingPage, setPendingPage] = useState(0);
  const [pendingRowsPerPage, setPendingRowsPerPage] = useState(10);
  const [recordPage, setRecordPage] = useState(0);
  const [recordRowsPerPage, setRecordRowsPerPage] = useState(10);
  const [employeeDetailPage, setEmployeeDetailPage] = useState(0);
  const [employeeDetailRowsPerPage, setEmployeeDetailRowsPerPage] = useState(10);
  const [employeeDetailFilter, setEmployeeDetailFilter] = useState<PendingCommissionFilter>('全部');
  const [recordOwnerPage, setRecordOwnerPage] = useState(0);
  const [recordOwnerRowsPerPage, setRecordOwnerRowsPerPage] = useState(10);
  const [recordCommissionPage, setRecordCommissionPage] = useState(0);
  const [recordCommissionRowsPerPage, setRecordCommissionRowsPerPage] = useState(10);
  const [correctionPage, setCorrectionPage] = useState(0);
  const [correctionRowsPerPage, setCorrectionRowsPerPage] = useState(10);
  const [correctionSearchInput, setCorrectionSearchInput] = useState('');
  const [correctionSearch, setCorrectionSearch] = useState('');
  const [correctionStatus, setCorrectionStatus] = useState<CorrectionStatusFilter>('全部');
  const [correctionHandlingTarget, setCorrectionHandlingTarget] = useState<CorrectionHandlingTarget | null>(null);
  const [correctionHandlingMethod, setCorrectionHandlingMethod] = useState<RecoverHandlingMethod>('线下追回');
  const [correctionHandlingAmount, setCorrectionHandlingAmount] = useState('');
  const [correctionHandlingNote, setCorrectionHandlingNote] = useState('');
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (view === 'summary') return;
    setLoadError('');
    if (view === 'corrections') {
      const response = await commissionPayoutApi.fetchCorrections({
        search: correctionSearch,
        status: correctionStatus,
        page: correctionPage + 1,
        pageSize: correctionRowsPerPage,
      });
      if (response.code === 0 && response.data) {
        setCorrectionData(response.data);
        const resolvedPage = Math.max(0, response.data.pagination.page - 1);
        if (resolvedPage !== correctionPage) setCorrectionPage(resolvedPage);
      } else {
        setLoadError(response.message || '更正与差额数据加载失败');
      }
      return;
    }
    const response = view === 'pending'
      ? await commissionPayoutApi.fetchPendingWorkspace()
      : await commissionPayoutApi.fetchRecordsWorkspace();
    if (response.code === 0 && response.data) setWorkspace(response.data);
    else setLoadError(response.message || '提成发放数据加载失败');
  }, [correctionPage, correctionRowsPerPage, correctionSearch, correctionStatus, view]);

  useEffect(() => {
    void load();
    if (view === 'summary') return undefined;
    const unsubscribe = subscribePageRefresh(() => { void load(); });
    const timer = window.setInterval(() => { void load(); }, 30_000);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
    };
  }, [load, view]);
  useEffect(() => {
    setSelectedIds([]);
    setPendingPage(0);
    setRecordPage(0);
  }, [view]);
  useEffect(() => {
    setEmployeeDetailPage(0);
    setEmployeeDetailFilter('全部');
  }, [detailEmployee?.ownerId]);
  useEffect(() => {
    setEmployeeDetailPage(0);
  }, [employeeDetailFilter]);
  useEffect(() => {
    setRecordOwnerPage(0);
    setRecordCommissionPage(0);
  }, [detailRecord?.id]);

  const selectable = useMemo(
    () => workspace?.employees.filter((item) => item.pendingPayAmount > 0) || [],
    [workspace],
  );
  const selectedRows = useMemo(
    () => selectable.filter((item) => selectedIds.includes(item.ownerId)),
    [selectable, selectedIds],
  );
  const selectedAmount = selectedRows.reduce((sum, item) => sum + item.pendingPayAmount, 0);
  const selectedCount = selectedRows.reduce((sum, item) => sum + item.commissions.filter((row) => row.status === '待发放').length, 0);
  const allSelected = selectable.length > 0 && selectable.every((item) => selectedIds.includes(item.ownerId));
  const pendingRows = workspace?.employees || [];
  const recordRows = workspace?.records || [];
  const pendingTotalPages = Math.max(1, Math.ceil(pendingRows.length / pendingRowsPerPage));
  const currentPendingPage = Math.min(pendingPage, pendingTotalPages - 1);
  const recordTotalPages = Math.max(1, Math.ceil(recordRows.length / recordRowsPerPage));
  const currentRecordPage = Math.min(recordPage, recordTotalPages - 1);
  const visiblePendingRows = pendingRows.slice(
    currentPendingPage * pendingRowsPerPage,
    (currentPendingPage + 1) * pendingRowsPerPage,
  );
  const visibleRecordRows = recordRows.slice(
    currentRecordPage * recordRowsPerPage,
    (currentRecordPage + 1) * recordRowsPerPage,
  );
  const employeeDetailRows = filterPendingEmployeeCommissions(
    detailEmployee?.commissions || [],
    employeeDetailFilter,
  );
  const detailEmployeePresentation = detailEmployee
    ? buildPendingEmployeePresentation(detailEmployee)
    : null;
  const employeeDetailTotalPages = Math.max(1, Math.ceil(employeeDetailRows.length / employeeDetailRowsPerPage));
  const currentEmployeeDetailPage = Math.min(employeeDetailPage, employeeDetailTotalPages - 1);
  const visibleEmployeeDetailRows = employeeDetailRows.slice(
    currentEmployeeDetailPage * employeeDetailRowsPerPage,
    (currentEmployeeDetailPage + 1) * employeeDetailRowsPerPage,
  );
  const recordOwnerRows = detailRecord?.byOwner || [];
  const recordOwnerTotalPages = Math.max(1, Math.ceil(recordOwnerRows.length / recordOwnerRowsPerPage));
  const currentRecordOwnerPage = Math.min(recordOwnerPage, recordOwnerTotalPages - 1);
  const visibleRecordOwnerRows = recordOwnerRows.slice(
    currentRecordOwnerPage * recordOwnerRowsPerPage,
    (currentRecordOwnerPage + 1) * recordOwnerRowsPerPage,
  );
  const recordCommissionRows = detailRecord?.commissionSnapshots || [];
  const canProcessCurrentPayout = canProcessPaidCommission && detailRecord?.status === '已发放';
  const recordCommissionTotalPages = Math.max(1, Math.ceil(recordCommissionRows.length / recordCommissionRowsPerPage));
  const currentRecordCommissionPage = Math.min(recordCommissionPage, recordCommissionTotalPages - 1);
  const visibleRecordCommissionRows = recordCommissionRows.slice(
    currentRecordCommissionPage * recordCommissionRowsPerPage,
    (currentRecordCommissionPage + 1) * recordCommissionRowsPerPage,
  );
  const visibleCorrectionRows = correctionData?.items || [];

  const toggleAll = () => setSelectedIds(allSelected ? [] : selectable.map((item) => item.ownerId));
  const toggleOne = (ownerId: string) => setSelectedIds((current) => (
    current.includes(ownerId) ? current.filter((id) => id !== ownerId) : [...current, ownerId]
  ));

  const submitIssue = async () => {
    setSubmitting(true);
    const response = await commissionPayoutApi.issue({
      ownerIds: selectedIds,
      issuedAt: new Date(issueAt).toISOString(),
      paymentMethod,
      paymentReference: paymentReference.trim() || undefined,
      note: note.trim() || undefined,
    });
    setSubmitting(false);
    if (response.code !== 0) {
      setFeedback({ severity: 'error', message: response.message || '发放失败' });
      return;
    }
    setIssueOpen(false);
    setSelectedIds([]);
    setPaymentReference('');
    setNote('');
    await load();
    setFeedback({ severity: 'success', message: '提成发放成功，发放记录和资金流水已生成' });
  };

  const exportRecord = (record: CommissionPayoutRecord) => {
    const lines = [
      ['发放单号', '月份', '员工', '部门', '提成笔数', '发放金额', '发放时间', '方式', '流水号'],
      ...record.byOwner.map((owner) => [
        record.payoutNo, record.period, owner.owner, owner.department || '', String(owner.count),
        String(owner.amount), record.issuedAt, record.paymentMethod || '', record.paymentReference || '',
      ]),
    ];
    const csv = `\uFEFF${lines.map((line) => line.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${record.payoutNo}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const openPostPayoutProcessing = (commission: NonNullable<CommissionPayoutRecord['commissionSnapshots']>[number]) => {
    const sourceId = commissionSourceId(commission);
    if (!sourceId) return;
    setDetailRecord(null);
    navigate(isAfterSalesRecoveryCorrectionSource(commission)
      ? `${ROUTES.AFTER_SALES}?tab=recovery-list&correctRecoveryId=${encodeURIComponent(sourceId)}`
      : `${ROUTES.ORDERS}?tab=list&correctOrderId=${encodeURIComponent(sourceId)}`);
  };

  const applyCorrectionSearch = () => {
    setCorrectionPage(0);
    setCorrectionSearch(correctionSearchInput.trim());
  };

  const openRecoverHandling = (record: CommissionCorrectionRecord, leg: CommissionCorrectionLeg) => {
    if (!canProcessPaidCommission || leg.kind !== '追回' || leg.status !== '待处理') return;
    setCorrectionHandlingTarget({
      recordId: record.id,
      correctionNo: record.correctionNo,
      sourceBusinessNo: record.sourceBusinessNo,
      leg,
    });
    setCorrectionHandlingMethod('线下追回');
    setCorrectionHandlingAmount(String(leg.amount));
    setCorrectionHandlingNote('');
  };

  const changeRecoverHandlingMethod = (method: RecoverHandlingMethod) => {
    setCorrectionHandlingMethod(method);
    setCorrectionHandlingAmount(method === '财务确认无需追回'
      ? '0'
      : String(correctionHandlingTarget?.leg.amount || ''));
  };

  const completeRecoverHandling = async () => {
    if (!canProcessPaidCommission || !correctionHandlingTarget) return;
    const amount = correctionHandlingMethod === '财务确认无需追回'
      ? 0
      : Number(correctionHandlingAmount);
    const expectedAmount = correctionHandlingMethod === '财务确认无需追回'
      ? 0
      : correctionHandlingTarget.leg.amount;
    if (!Number.isFinite(amount) || Math.abs(amount - expectedAmount) >= 0.01) {
      setFeedback({ severity: 'error', message: '线下追回和下月抵扣必须全额处理；确认无需追回时金额为0' });
      return;
    }
    if (!correctionHandlingNote.trim()) {
      setFeedback({ severity: 'error', message: '请填写差额处理说明' });
      return;
    }
    setCorrectionSubmitting(true);
    const response = await commissionPayoutApi.completeCorrectionLeg(
      correctionHandlingTarget.recordId,
      correctionHandlingTarget.leg.id,
      { method: correctionHandlingMethod, amount, note: correctionHandlingNote.trim() },
    );
    setCorrectionSubmitting(false);
    if (response.code !== 0) {
      setFeedback({ severity: 'error', message: response.message || '追回差额处理失败' });
      return;
    }
    setCorrectionHandlingTarget(null);
    await load();
    setFeedback({ severity: 'success', message: '差额处理已记录，原发放事实保持不变' });
  };

  const renderCorrectionOutcome = (record: CommissionCorrectionRecord) => {
    const supplementLegs = record.legs.filter((leg) => leg.kind === '补发');
    const recoverLegs = record.legs.filter((leg) => leg.kind === '追回');
    if (!supplementLegs.length && !recoverLegs.length) {
      return <Typography variant="body2" color="text.secondary">无金额差额</Typography>;
    }
    return <Stack spacing={1} alignItems="flex-start">
      {supplementLegs.map((leg) => (
        <Box key={leg.id}>
          <Chip
            size="small"
            color={leg.status === '已处理' ? 'success' : leg.status === '已取消' ? 'default' : 'info'}
            label={`补发提成·${leg.status}`}
          />
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
            {leg.owner || '未指定员工'} · {formatCurrency(leg.amount)}
          </Typography>
        </Box>
      ))}
      {recoverLegs.map((leg) => (
        <Box key={leg.id}>
          <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              color={leg.status === '已处理' ? 'success' : leg.status === '待处理' ? 'warning' : 'default'}
              label={`追回差额·${leg.status}`}
            />
            {leg.status === '待处理' && canProcessPaidCommission && (
              <Button size="small" variant="outlined" onClick={() => openRecoverHandling(record, leg)}>处理追回</Button>
            )}
          </Stack>
          <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25 }}>
            {leg.owner || '未指定员工'} · {formatCurrency(leg.amount)}
            {leg.handlingMethod ? ` · ${leg.handlingMethod}` : ''}
          </Typography>
        </Box>
      ))}
    </Stack>;
  };

  const renderPending = () => (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 1.5 }}>
        {metricCard('待发放员工', `${workspace?.summary.pendingEmployeeCount || 0} 人`, '全部月份中有提成尚未发放')}
        {metricCard('待处理', `${workspace?.summary.pendingHandlingCount || 0} 笔`, '需补齐人员、规则或依据', '#64748b')}
        {metricCard('待确认', formatCurrency(workspace?.summary.pendingConfirmAmount || 0), `${workspace?.summary.pendingConfirmCount || 0} 笔 · 确认后进入待发放`)}
        {metricCard('待发放', formatCurrency(workspace?.summary.pendingPayAmount || 0), `${workspace?.summary.pendingPayCount || 0} 笔 · 全部可执行发放`, '#d97706')}
      </Box>
      <Paper variant="outlined">
        <Box sx={{ p: 2, display: 'flex', gap: 1.5, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" fontWeight={800}>全部员工提成待办清单</Typography>
            <Typography variant="body2" color="text.secondary">跨月汇总待处理、待确认和待发放提成；只有待发放金额可执行发放。</Typography>
          </Box>
          {canManage && (
            <Button
              variant="contained"
              startIcon={<PaymentsOutlinedIcon />}
              disabled={!selectedIds.length}
              onClick={() => { setIssueAt(todayInput()); setIssueOpen(true); }}
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              发放选中员工（{selectedIds.length}）
            </Button>
          )}
        </Box>
        <Divider />
        <Box sx={{ display: { xs: 'block', md: 'none' } }}>
          {visiblePendingRows.map((row) => {
            const presentation = buildPendingEmployeePresentation(row);
            return <Box key={row.ownerId} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" alignItems="center" spacing={1.25}>
                {canManage && (
                  <Checkbox
                    disabled={!presentation.canIssue}
                    checked={selectedIds.includes(row.ownerId)}
                    onChange={() => toggleOne(row.ownerId)}
                    sx={{ p: 0.5 }}
                  />
                )}
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography fontWeight={800}>{row.owner}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {row.department || '-'} · {employeeMonthLabel(row)}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={0.5}>
                  {presentation.pendingHandling.count > 0 && <Chip size="small" color="default" label={`待处理 ${presentation.pendingHandling.count}笔`} />}
                  {presentation.canIssue && <Chip size="small" color="warning" label="待发放" />}
                </Stack>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, mt: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">业务单数</Typography>
                  <Typography fontWeight={800}>{presentation.business.total} 单</Typography>
                  <Typography variant="caption" color="text.secondary">正式{presentation.business.formal} · 挽回{presentation.business.recovery}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">待确认</Typography>
                  <Typography fontWeight={700}>{formatCurrency(presentation.pendingConfirm.amount)}</Typography>
                  <Typography variant="caption" color="text.secondary">{presentation.pendingConfirm.count} 笔</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">待发放</Typography>
                  <Typography fontWeight={900} color="warning.main">{formatCurrency(presentation.pendingPay.amount)}</Typography>
                  <Typography variant="caption" color="text.secondary">{presentation.pendingPay.count} 笔</Typography>
                </Box>
              </Box>
              <Button fullWidth size="small" variant="outlined" startIcon={<VisibilityOutlinedIcon />} sx={{ mt: 2 }} onClick={() => setDetailEmployee(row)}>
                查看提成明细
              </Button>
            </Box>;
          })}
          {!pendingRows.length && <Box sx={{ py: 7, textAlign: 'center', color: 'text.secondary' }}>暂无待处理、待确认或待发放提成</Box>}
        </Box>
        <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
          <Table size="small" sx={[moduleTableSx, { minWidth: 1040 }]}>
            <TableHead><TableRow>
              <TableCell sx={{ minWidth: 150 }}>
                <Stack direction="row" alignItems="center" spacing={1}>
                  {canManage && <Checkbox size="small" checked={allSelected} indeterminate={selectedIds.length > 0 && !allSelected} onChange={toggleAll} sx={{ p: 0 }} />}
                  <Typography component="span" variant="body2" fontWeight={700}>员工</Typography>
                </Stack>
              </TableCell><TableCell sx={{ minWidth: 120 }}>部门</TableCell><TableCell sx={{ minWidth: 150 }}>业务单数</TableCell><TableCell align="right" sx={{ minWidth: 100 }}>待处理</TableCell>
              <TableCell align="right" sx={{ minWidth: 130 }}>待确认</TableCell><TableCell align="right" sx={{ minWidth: 130 }}>待发放</TableCell><TableCell align="center" sx={{ minWidth: 120 }}>操作</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {visiblePendingRows.map((row) => {
                const presentation = buildPendingEmployeePresentation(row);
                return <TableRow key={row.ownerId} hover>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      {canManage && <Checkbox size="small" disabled={!presentation.canIssue} checked={selectedIds.includes(row.ownerId)} onChange={() => toggleOne(row.ownerId)} sx={{ p: 0 }} />}
                      <Typography fontWeight={700}>{row.owner}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{row.department || '-'}</TableCell>
                  <TableCell>
                    <Typography fontWeight={800}>{presentation.business.total} 单</Typography>
                    <Typography variant="caption" color="text.secondary">正式 {presentation.business.formal} · 挽回 {presentation.business.recovery}</Typography>
                  </TableCell>
                  <TableCell align="right">{presentation.pendingHandling.count > 0 ? `${presentation.pendingHandling.count} 笔` : '—'}</TableCell>
                  <TableCell align="right">
                    <Typography>{formatCurrency(presentation.pendingConfirm.amount)}</Typography>
                    <Typography variant="caption" color="text.secondary">{presentation.pendingConfirm.count} 笔</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight={800} color="warning.main">{formatCurrency(presentation.pendingPay.amount)}</Typography>
                    <Typography variant="caption" color="text.secondary">{presentation.pendingPay.count} 笔</Typography>
                  </TableCell>
                  <TableCell align="center"><Button size="small" startIcon={<VisibilityOutlinedIcon />} sx={{ whiteSpace: 'nowrap' }} onClick={() => setDetailEmployee(row)}>查看明细</Button></TableCell>
                </TableRow>;
              })}
              {!pendingRows.length && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 7, color: 'text.secondary' }}>暂无待处理、待确认或待发放提成</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          count={pendingRows.length}
          page={currentPendingPage}
          rowsPerPage={pendingRowsPerPage}
          rowsPerPageOptions={[10, 20, 50]}
          onPageChange={(_, nextPage) => setPendingPage(nextPage)}
          onRowsPerPageChange={(event) => { setPendingRowsPerPage(Number(event.target.value)); setPendingPage(0); }}
          labelRowsPerPage="每页条数"
          labelDisplayedRows={formatPaginationRows}
          sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: '#fff' }}
        />
      </Paper>
    </Stack>
  );

  const renderRecords = () => (
    <Paper variant="outlined">
      <Box sx={{ p: 2 }}>
        <Typography variant="h6" fontWeight={800}>发放记录</Typography>
        <Typography variant="body2" color="text.secondary">每次确认发放自动生成记录；原发放事实永久保留，超级管理员可对逐笔提成发起留痕的发放后处理。</Typography>
      </Box>
      <Divider />
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        {visibleRecordRows.map((record) => (
          <Box key={record.id} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
              <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={800} sx={{ wordBreak: 'break-all' }}>{record.payoutNo}</Typography>
                <Typography variant="caption" color="text.secondary">{formatDateTime(record.issuedAt)} · {record.issuedByName || '-'}</Typography>
              </Box>
              <Chip size="small" label={record.status} color={record.status === '已发放' ? 'success' : 'default'} />
            </Stack>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-end" sx={{ mt: 2 }}>
              <Box>
                <Typography variant="caption" color="text.secondary">{record.byOwner.length} 名员工 · {record.totalCount} 笔提成</Typography>
                <Typography variant="h6" fontWeight={900}>{formatCurrency(record.totalAmount)}</Typography>
              </Box>
              <Typography variant="body2" color="text.secondary">{record.paymentMethod || '-'}</Typography>
            </Stack>
            <Stack direction="row" spacing={0.5} justifyContent="flex-end" sx={{ mt: 1.5 }}>
              <Tooltip title="查看详情"><IconButton size="small" color="primary" aria-label="查看发放详情" onClick={() => setDetailRecord(record)}><VisibilityOutlinedIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="导出发放单"><IconButton size="small" color="primary" aria-label="导出发放单" onClick={() => exportRecord(record)}><FileDownloadOutlinedIcon fontSize="small" /></IconButton></Tooltip>
            </Stack>
          </Box>
        ))}
        {!recordRows.length && <Box sx={{ py: 7, textAlign: 'center', color: 'text.secondary' }}>暂无发放记录</Box>}
      </Box>
      <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}><Table size="small" sx={moduleTableSx}>
        <TableHead><TableRow>
          <TableCell sx={{ minWidth: 180 }}>发放单号</TableCell><TableCell sx={{ minWidth: 145 }}>发放时间</TableCell><TableCell align="center" sx={{ minWidth: 100 }}>员工 / 提成</TableCell>
          <TableCell align="right" sx={{ minWidth: 110 }}>发放金额</TableCell><TableCell sx={{ minWidth: 140 }}>发放信息</TableCell><TableCell sx={{ minWidth: 90 }}>状态</TableCell><TableCell align="center" sx={{ width: 132, minWidth: 132 }}>操作</TableCell>
        </TableRow></TableHead>
        <TableBody>
          {visibleRecordRows.map((record) => <TableRow key={record.id} hover>
            <TableCell><Typography fontWeight={700}>{record.payoutNo}</Typography></TableCell>
            <TableCell>{formatDateTime(record.issuedAt)}</TableCell>
            <TableCell align="center">{record.byOwner.length} 人 / {record.totalCount} 笔</TableCell>
            <TableCell align="right"><Typography fontWeight={800}>{formatCurrency(record.totalAmount)}</Typography></TableCell>
            <TableCell><Typography variant="body2">{record.issuedByName || '-'}</Typography><Typography variant="caption" color="text.secondary">{record.paymentMethod || '-'}</Typography></TableCell>
            <TableCell><Chip size="small" label={record.status} color={record.status === '已发放' ? 'success' : 'default'} /></TableCell>
            <TableCell align="center"><Stack direction="row" spacing={0.5} justifyContent="center">
              <Tooltip title="查看详情"><IconButton size="small" color="primary" aria-label="查看发放详情" onClick={() => setDetailRecord(record)}><VisibilityOutlinedIcon fontSize="small" /></IconButton></Tooltip>
              <Tooltip title="导出发放单"><IconButton size="small" color="primary" aria-label="导出发放单" onClick={() => exportRecord(record)}><FileDownloadOutlinedIcon fontSize="small" /></IconButton></Tooltip>
            </Stack></TableCell>
          </TableRow>)}
          {!recordRows.length && <TableRow><TableCell colSpan={7} align="center" sx={{ py: 7, color: 'text.secondary' }}>暂无发放记录</TableCell></TableRow>}
        </TableBody>
      </Table></TableContainer>
      <TablePagination
        count={recordRows.length}
        page={currentRecordPage}
        rowsPerPage={recordRowsPerPage}
        rowsPerPageOptions={[10, 20, 50]}
        onPageChange={(_, nextPage) => setRecordPage(nextPage)}
        onRowsPerPageChange={(event) => { setRecordRowsPerPage(Number(event.target.value)); setRecordPage(0); }}
        labelRowsPerPage="每页条数"
        labelDisplayedRows={formatPaginationRows}
        sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: '#fff' }}
      />
    </Paper>
  );

  const renderCorrections = () => (
    <Stack spacing={2}>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 1.5 }}>
        {metricCard('更正记录', `${correctionData?.summary.correctionCount || 0} 单`, '发放后业务更正全部留痕')}
        {metricCard('待补发', formatCurrency(correctionData?.summary.pendingSupplementAmount || 0), '已生成补发提成，按原流程确认与发放', '#2563eb')}
        {metricCard('待追回', formatCurrency(correctionData?.summary.pendingRecoverAmount || 0), '需超级管理员记录线下处理结果', '#d97706')}
        {metricCard('已处理差额', formatCurrency(correctionData?.summary.handledAmount || 0), '包含已补发与已确认追回金额', '#15803d')}
      </Box>

      <Paper variant="outlined">
        <Box sx={{ p: 2, display: 'flex', gap: 1.5, justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, flexDirection: { xs: 'column', md: 'row' } }}>
          <Box>
            <Typography variant="h6" fontWeight={800}>更正与差额</Typography>
            <Typography variant="body2" color="text.secondary">原发放记录永久保留；业务更正产生的补发或追回作为独立差额处理。</Typography>
          </Box>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ minWidth: { md: 520 } }}>
            <TextField
              size="small"
              label="搜索更正单/源单/原因"
              value={correctionSearchInput}
              onChange={(event) => setCorrectionSearchInput(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') applyCorrectionSearch(); }}
              sx={{ flex: 1 }}
            />
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>状态</InputLabel>
              <Select
                label="状态"
                value={correctionStatus}
                onChange={(event) => { setCorrectionStatus(event.target.value as CorrectionStatusFilter); setCorrectionPage(0); }}
              >
                <MenuItem value="全部">全部</MenuItem>
                <MenuItem value="待处理">待处理</MenuItem>
                <MenuItem value="已处理">已处理</MenuItem>
                <MenuItem value="无差额">无差额</MenuItem>
              </Select>
            </FormControl>
            <Button variant="outlined" onClick={applyCorrectionSearch}>查询</Button>
          </Stack>
        </Box>
        <Divider />

        <Box sx={{ display: { xs: 'block', md: 'none' } }}>
          {visibleCorrectionRows.map((record) => (
            <Box key={record.id} sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Stack direction="row" justifyContent="space-between" spacing={1} alignItems="flex-start">
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={800} sx={{ overflowWrap: 'anywhere' }}>{record.correctionNo}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {correctionSourceLabel(record)} · {formatDateTime(record.createdAt)}
                  </Typography>
                </Box>
                <Chip size="small" color={correctionStatusColor(record.status)} label={record.status} />
              </Stack>
              <Typography variant="body2" fontWeight={700} sx={{ mt: 1.5, overflowWrap: 'anywhere' }}>源单号：{record.sourceBusinessNo}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>更正原因：{record.reason || '-'}</Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.5 }}>受影响月份：{record.affectedPeriods.join('、') || '-'}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, mt: 1.5 }}>
                <Box><Typography variant="caption" color="text.secondary">原已发</Typography><Typography fontWeight={800}>{formatCurrency(record.originalPaidAmount)}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">更正后应得</Typography><Typography fontWeight={800}>{formatCurrency(record.correctedEntitlementAmount)}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">补发</Typography><Typography fontWeight={800} color="primary.main">{formatCurrency(record.supplementAmount)}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">追回</Typography><Typography fontWeight={800} color="warning.main">{formatCurrency(record.recoverAmount)}</Typography></Box>
              </Box>
              <Box sx={{ mt: 1.5 }}>{renderCorrectionOutcome(record)}</Box>
            </Box>
          ))}
          {!visibleCorrectionRows.length && <Box sx={{ py: 7, textAlign: 'center', color: 'text.secondary' }}>暂无更正与差额记录</Box>}
        </Box>

        <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
          <Table size="small" sx={[moduleTableSx, { minWidth: 1560 }]}>
            <TableHead><TableRow>
              <TableCell sx={{ minWidth: 180 }}>更正单号</TableCell>
              <TableCell sx={{ minWidth: 110 }}>业务来源</TableCell>
              <TableCell sx={{ minWidth: 210 }}>源单号</TableCell>
              <TableCell sx={{ minWidth: 220 }}>更正原因</TableCell>
              <TableCell sx={{ minWidth: 150 }}>受影响月份</TableCell>
              <TableCell align="right" sx={{ minWidth: 110 }}>原已发</TableCell>
              <TableCell align="right" sx={{ minWidth: 130 }}>更正后应得</TableCell>
              <TableCell align="right" sx={{ minWidth: 100 }}>补发</TableCell>
              <TableCell align="right" sx={{ minWidth: 100 }}>追回</TableCell>
              <TableCell sx={{ minWidth: 105 }}>状态</TableCell>
              <TableCell sx={{ minWidth: 220 }}>差额进度</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {visibleCorrectionRows.map((record) => (
                <TableRow key={record.id} hover>
                  <TableCell>
                    <Typography fontWeight={700}>{record.correctionNo}</Typography>
                    <Typography variant="caption" color="text.secondary">{formatDateTime(record.createdAt)}</Typography>
                  </TableCell>
                  <TableCell>{correctionSourceLabel(record)}</TableCell>
                  <TableCell><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{record.sourceBusinessNo}</Typography></TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{record.reason || '-'}</Typography>
                    <Typography variant="caption" color="text.secondary">{record.createdByName || '-'}</Typography>
                  </TableCell>
                  <TableCell>{record.affectedPeriods.join('、') || '-'}</TableCell>
                  <TableCell align="right">{formatCurrency(record.originalPaidAmount)}</TableCell>
                  <TableCell align="right"><Typography fontWeight={800}>{formatCurrency(record.correctedEntitlementAmount)}</Typography></TableCell>
                  <TableCell align="right"><Typography fontWeight={800} color="primary.main">{formatCurrency(record.supplementAmount)}</Typography></TableCell>
                  <TableCell align="right"><Typography fontWeight={800} color="warning.main">{formatCurrency(record.recoverAmount)}</Typography></TableCell>
                  <TableCell><Chip size="small" color={correctionStatusColor(record.status)} label={record.status} /></TableCell>
                  <TableCell>{renderCorrectionOutcome(record)}</TableCell>
                </TableRow>
              ))}
              {!visibleCorrectionRows.length && <TableRow><TableCell colSpan={11} align="center" sx={{ py: 7, color: 'text.secondary' }}>暂无更正与差额记录</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          count={correctionData?.pagination.total || 0}
          page={correctionPage}
          rowsPerPage={correctionRowsPerPage}
          rowsPerPageOptions={[10, 20, 50]}
          onPageChange={(_, nextPage) => setCorrectionPage(nextPage)}
          onRowsPerPageChange={(event) => { setCorrectionRowsPerPage(Number(event.target.value)); setCorrectionPage(0); }}
          labelRowsPerPage="每页条数"
          labelDisplayedRows={formatPaginationRows}
          sx={{ borderTop: '1px solid', borderColor: 'divider', bgcolor: '#fff' }}
        />
      </Paper>
    </Stack>
  );

  return <Stack spacing={2}>
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Box>
        <Typography variant="h5" fontWeight={900}>提成发放</Typography>
        <Typography variant="body2" color="text.secondary">核对员工应发提成、执行发放，并保留完整发放记录。发放后业务资料更正不会覆盖原发放事实。</Typography>
      </Box>
      <Tabs value={view} onChange={(_: React.SyntheticEvent, value: PayoutView) => setView(value)} sx={{ mt: 1.5 }}>
        <Tab value="pending" label="待发放" /><Tab value="records" label="发放记录" /><Tab value="corrections" label="更正与差额" /><Tab value="summary" label="月度报告" />
      </Tabs>
    </Paper>
    {loadError && <Alert severity="error" onClose={() => setLoadError('')}>{loadError}</Alert>}
    {view === 'pending' && renderPending()}
    {view === 'records' && renderRecords()}
    {view === 'corrections' && renderCorrections()}
    {view === 'summary' && <Commission key="payout-summary" embedded initialTab={1} payoutMode="finance" />}

    <Dialog open={issueOpen} onClose={() => !submitting && setIssueOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>确认发放提成</DialogTitle>
      <DialogContent dividers><Stack spacing={2}>
        <Alert severity="info">本次将向 {selectedIds.length} 名员工发放其全部月份中处于待发放状态的 {selectedCount} 笔提成，共 {formatCurrency(selectedAmount)}。确认后系统会自动生成发放记录。</Alert>
        <TextField label="发放时间" type="datetime-local" value={issueAt} onChange={(event) => setIssueAt(event.target.value)} fullWidth slotProps={{ inputLabel: { shrink: true } }} />
        <FormControl fullWidth><InputLabel>发放方式</InputLabel><Select label="发放方式" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
          <MenuItem value="银行转账">银行转账</MenuItem><MenuItem value="企业支付宝">企业支付宝</MenuItem><MenuItem value="现金">现金</MenuItem><MenuItem value="其他">其他</MenuItem>
        </Select></FormControl>
        <TextField label="付款流水号（选填）" value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
        <TextField label="备注（选填）" value={note} onChange={(event) => setNote(event.target.value)} multiline minRows={2} />
      </Stack></DialogContent>
      <DialogActions><Button onClick={() => setIssueOpen(false)} disabled={submitting}>取消</Button><Button variant="contained" onClick={() => void submitIssue()} disabled={submitting || !issueAt || !paymentMethod}>确认发放</Button></DialogActions>
    </Dialog>

    <Dialog
      open={Boolean(correctionHandlingTarget)}
      onClose={() => !correctionSubmitting && setCorrectionHandlingTarget(null)}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>处理追回差额</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            此操作只记录差额的线下处理结果，不会修改或删除原发放记录。
          </Alert>
          <Paper variant="outlined" sx={{ p: 1.5 }}>
            <Typography variant="body2">更正单号：{correctionHandlingTarget?.correctionNo || '-'}</Typography>
            <Typography variant="body2">源单号：{correctionHandlingTarget?.sourceBusinessNo || '-'}</Typography>
            <Typography variant="body2">待追回员工：{correctionHandlingTarget?.leg.owner || '-'}</Typography>
            <Typography variant="body2">待追回金额：{formatCurrency(correctionHandlingTarget?.leg.amount || 0)}</Typography>
          </Paper>
          <FormControl fullWidth>
            <InputLabel>处理方式</InputLabel>
            <Select
              label="处理方式"
              value={correctionHandlingMethod}
              onChange={(event) => changeRecoverHandlingMethod(event.target.value as RecoverHandlingMethod)}
            >
              <MenuItem value="线下追回">线下追回</MenuItem>
              <MenuItem value="下月提成抵扣">下月提成抵扣</MenuItem>
              <MenuItem value="财务确认无需追回">财务确认无需追回</MenuItem>
            </Select>
          </FormControl>
          <TextField
            fullWidth
            type="number"
            label="已处理金额"
            value={correctionHandlingAmount}
            disabled
            onChange={(event) => setCorrectionHandlingAmount(event.target.value)}
            slotProps={{ htmlInput: { min: 0, max: correctionHandlingTarget?.leg.amount || 0, step: 0.01 } }}
            helperText={correctionHandlingMethod === '财务确认无需追回'
              ? '无需追回时处理金额记为0元'
              : '当前按全额追回或全额抵扣留痕'}
          />
          <TextField
            fullWidth
            required
            multiline
            minRows={3}
            label="差额处理说明"
            value={correctionHandlingNote}
            onChange={(event) => setCorrectionHandlingNote(event.target.value)}
            placeholder="请说明实际追回、下月抵扣依据，或无需追回的审批原因"
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setCorrectionHandlingTarget(null)} disabled={correctionSubmitting}>取消</Button>
        <Button
          variant="contained"
          onClick={() => void completeRecoverHandling()}
          disabled={correctionSubmitting || !correctionHandlingNote.trim()}
        >确认留痕</Button>
      </DialogActions>
    </Dialog>

    <Dialog open={Boolean(detailEmployee)} onClose={() => setDetailEmployee(null)} fullWidth maxWidth="lg">
      <DialogTitle>{detailEmployee?.owner} · 全部待办提成明细</DialogTitle>
      <DialogContent dividers>
        <Tabs
          value={employeeDetailFilter}
          onChange={(_event, value: PendingCommissionFilter) => setEmployeeDetailFilter(value)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 1.5, minHeight: 40 }}
        >
          <Tab value="全部" label={`全部 ${detailEmployee?.commissionCount || 0}`} />
          <Tab value="待处理" label={`待处理 ${detailEmployeePresentation?.pendingHandling.count || 0}`} />
          <Tab value="待确认" label={`待确认 ${detailEmployeePresentation?.pendingConfirm.count || 0}`} />
          <Tab value="待发放" label={`待发放 ${detailEmployeePresentation?.pendingPay.count || 0}`} />
        </Tabs>
        <Stack divider={<Divider flexItem />} sx={{ display: { xs: 'flex', md: 'none' } }}>
          {visibleEmployeeDetailRows.map((row) => (
            <Box key={row.id} sx={{ py: 1.5 }}>
              <Stack direction="row" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="caption" color="text.secondary">{commissionTypeLabel(row)} · {row.role}</Typography>
                  <Typography fontWeight={800}>{row.customerName || '未命名客户'}</Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ wordBreak: 'break-all' }}>{row.orderNo}</Typography>
                </Box>
                <Chip size="small" label={pendingCommissionStatusLabel(row)} />
              </Stack>
              <Typography sx={{ mt: 1 }} variant="h6" fontWeight={900}>{formatCurrency(row.commissionAmount)}</Typography>
              <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <Box><Typography variant="caption" color="text.secondary">业绩金额</Typography><Typography variant="body2" fontWeight={800}>{formatCurrency(Number(row.performanceAmount || row.orderAmount || 0))}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">归属月份</Typography><Typography variant="body2" fontWeight={800}>{commissionMonth(row)}</Typography></Box>
              </Box>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{commissionCalculationText(row)}</Typography>
            </Box>
          ))}
          {!employeeDetailRows.length && <Box sx={{ py: 6, textAlign: 'center', color: 'text.secondary' }}>当前筛选下暂无提成明细</Box>}
        </Stack>
        <TableContainer component={Paper} elevation={0} sx={[moduleTablePaperSx, { display: { xs: 'none', md: 'block' }, borderRadius: '6px 6px 0 0', overflowX: 'auto' }]}>
          <Table size="small" sx={[moduleTableSx, { minWidth: 1180 }]}>
            <TableHead><TableRow><TableCell>提成类型</TableCell><TableCell>客户</TableCell><TableCell>订单号</TableCell><TableCell>角色</TableCell><TableCell align="right">业绩金额</TableCell><TableCell>计算方案</TableCell><TableCell align="right">提成金额</TableCell><TableCell>归属月份 / 时间</TableCell><TableCell>状态</TableCell></TableRow></TableHead>
            <TableBody>
              {visibleEmployeeDetailRows.map((row) => <TableRow key={row.id} hover><TableCell>{commissionTypeLabel(row)}</TableCell><TableCell>{row.customerName || '未命名客户'}</TableCell><TableCell><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.orderNo}</Typography></TableCell><TableCell>{row.role}</TableCell><TableCell align="right">{formatCurrency(Number(row.performanceAmount || row.orderAmount || 0))}</TableCell><TableCell sx={{ maxWidth: 260 }}><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{commissionCalculationText(row)}</Typography></TableCell><TableCell align="right"><Typography fontWeight={900}>{formatCurrency(row.commissionAmount)}</Typography></TableCell><TableCell>{commissionMonth(row)} · {formatDateTime(row.paymentDate || row.createdAt)}</TableCell><TableCell><Chip size="small" label={pendingCommissionStatusLabel(row)} /></TableCell></TableRow>)}
              {!employeeDetailRows.length && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>当前筛选下暂无提成明细</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          count={employeeDetailRows.length}
          page={currentEmployeeDetailPage}
          rowsPerPage={employeeDetailRowsPerPage}
          rowsPerPageOptions={[10, 20, 50]}
          onPageChange={(_, nextPage) => setEmployeeDetailPage(nextPage)}
          onRowsPerPageChange={(event) => { setEmployeeDetailRowsPerPage(Number(event.target.value)); setEmployeeDetailPage(0); }}
          labelRowsPerPage="每页条数"
          labelDisplayedRows={formatPaginationRows}
          sx={{ border: '1px solid', borderColor: 'divider', borderTop: 0, bgcolor: '#fff' }}
        />
      </DialogContent><DialogActions><Button onClick={() => setDetailEmployee(null)}>关闭</Button></DialogActions>
    </Dialog>

    <Dialog open={Boolean(detailRecord)} onClose={() => setDetailRecord(null)} fullWidth maxWidth="lg">
      <DialogTitle>发放记录详情</DialogTitle><DialogContent dividers><Stack spacing={1.5}>
        <Typography>发放单号：{detailRecord?.payoutNo}</Typography><Typography>发放月份：{detailRecord?.period}</Typography><Typography>发放时间：{detailRecord ? formatDateTime(detailRecord.issuedAt) : '-'}</Typography>
        <Typography>发放金额：{formatCurrency(detailRecord?.totalAmount || 0)}</Typography><Typography>发放方式：{detailRecord?.paymentMethod || '-'}</Typography><Typography>付款流水号：{detailRecord?.paymentReference || '-'}</Typography>
        <Divider />
        <Typography variant="subtitle1" fontWeight={800}>员工发放汇总</Typography>
        <TableContainer component={Paper} elevation={0} sx={[moduleTablePaperSx, { borderRadius: '6px 6px 0 0' }]}>
          <Table size="small" sx={moduleTableSx}>
            <TableHead><TableRow><TableCell>员工</TableCell><TableCell>部门</TableCell><TableCell align="right">提成笔数</TableCell><TableCell align="right">发放金额</TableCell></TableRow></TableHead>
            <TableBody>
              {visibleRecordOwnerRows.map((owner) => <TableRow key={owner.ownerId || owner.owner} hover><TableCell>{owner.owner}</TableCell><TableCell>{owner.department || '-'}</TableCell><TableCell align="right">{owner.count}</TableCell><TableCell align="right"><Typography fontWeight={800}>{formatCurrency(owner.amount)}</Typography></TableCell></TableRow>)}
              {!recordOwnerRows.length && <TableRow><TableCell colSpan={4} align="center" sx={{ py: 5, color: 'text.secondary' }}>暂无员工发放汇总</TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          count={recordOwnerRows.length}
          page={currentRecordOwnerPage}
          rowsPerPage={recordOwnerRowsPerPage}
          rowsPerPageOptions={[10, 20, 50]}
          onPageChange={(_, nextPage) => setRecordOwnerPage(nextPage)}
          onRowsPerPageChange={(event) => { setRecordOwnerRowsPerPage(Number(event.target.value)); setRecordOwnerPage(0); }}
          labelRowsPerPage="每页条数"
          labelDisplayedRows={formatPaginationRows}
          sx={{ border: '1px solid', borderColor: 'divider', borderTop: 0, bgcolor: '#fff' }}
        />
        {detailRecord?.commissionSnapshots?.length ? (
          <Box>
            <Typography variant="subtitle1" fontWeight={800} sx={{ mb: 1.5 }}>逐笔提成明细</Typography>
            <TableContainer component={Paper} elevation={0} sx={[moduleTablePaperSx, { borderRadius: '6px 6px 0 0', overflowX: 'auto' }]}><Table size="small" sx={[moduleTableSx, { minWidth: canProcessCurrentPayout ? 1120 : 980 }]}>
              <TableHead><TableRow><TableCell>提成类型</TableCell><TableCell>员工</TableCell><TableCell>客户</TableCell><TableCell>订单号</TableCell><TableCell>角色</TableCell><TableCell align="right">业绩金额</TableCell><TableCell align="right">发放金额</TableCell><TableCell>归属月份</TableCell>{canProcessCurrentPayout && <TableCell align="center">操作</TableCell>}</TableRow></TableHead>
              <TableBody>{visibleRecordCommissionRows.map((row) => {
                const sourceId = commissionSourceId(row);
                return (
                  <TableRow key={row.id} hover>
                    <TableCell>{commissionTypeLabel(row)}</TableCell><TableCell>{row.owner}</TableCell><TableCell>{row.customerName || '未命名客户'}</TableCell><TableCell><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.orderNo}</Typography></TableCell><TableCell>{row.role}</TableCell><TableCell align="right">{formatCurrency(Number(row.performanceAmount || row.orderAmount || 0))}</TableCell><TableCell align="right"><Typography fontWeight={900}>{formatCurrency(row.commissionAmount)}</Typography></TableCell><TableCell>{commissionMonth(row)}</TableCell>
                    {canProcessCurrentPayout && <TableCell align="center">{sourceId ? <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => openPostPayoutProcessing(row)}>发放后处理</Button> : <Typography variant="caption" color="text.secondary">源单不可用</Typography>}</TableCell>}
                  </TableRow>
                );
              })}</TableBody>
            </Table></TableContainer>
            <TablePagination
              count={recordCommissionRows.length}
              page={currentRecordCommissionPage}
              rowsPerPage={recordCommissionRowsPerPage}
              rowsPerPageOptions={[10, 20, 50]}
              onPageChange={(_, nextPage) => setRecordCommissionPage(nextPage)}
              onRowsPerPageChange={(event) => { setRecordCommissionRowsPerPage(Number(event.target.value)); setRecordCommissionPage(0); }}
              labelRowsPerPage="每页条数"
              labelDisplayedRows={formatPaginationRows}
              sx={{ border: '1px solid', borderColor: 'divider', borderTop: 0, bgcolor: '#fff' }}
            />
          </Box>
        ) : detailRecord ? (
          <Alert severity="info">该历史发放记录创建时尚未保存逐笔提成快照，当前仅能核对员工汇总和提成ID。</Alert>
        ) : null}
      </Stack></DialogContent><DialogActions><Button onClick={() => setDetailRecord(null)}>关闭</Button></DialogActions>
    </Dialog>

    <OperationFeedbackDialog open={Boolean(feedback)} severity={feedback?.severity} message={feedback?.message || ''} onClose={() => setFeedback(null)} />

  </Stack>;
};

export default CommissionPayout;
