import React, { useEffect, useMemo, useState } from 'react';
import {
  Navigate,
  useNavigate,
  useSearchParams } from 'react-router-dom';
import {
  Box,
  Alert,
  Button,
  Chip,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import TablePagination from '../../shared/components/TablePagination';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SearchIcon from '@mui/icons-material/Search';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { dashboardApi, financeApi } from '../../api';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import { ROUTES } from '../../shared/utils/constants';
import Commission from '../Commission';
import RecoverySettlement from './RecoverySettlement';
import CommissionPayout from './CommissionPayout';
import { ModuleHeader, ModulePage, ModuleTabs } from '../../shared/components/ModuleShell';
import {
  DataTableEmptyState,
  DataTableDesktopScroller,
  DataTableMobileScroller,
  DataTableWorkspace,
  DataTableWorkspaceFooter,
} from '../../shared/components/DataTableWorkspace';
import type { FinancePaymentEvidenceIssueCode, FinanceTransaction, FinanceTransactionDirection, FinanceTransactionFilterCoverage, FinanceTransactionFilters, FinanceTransactionSummary } from '../../types/finance';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../shared/utils/permissions';

type FinanceTab = 'mine' | 'settlement' | 'recovery-settlement' | 'disbursement' | 'flow' | 'rules';

const shell = {
  ink: '#19142C',
  muted: '#7B7690',
  line: '#E8E4F1',
  soft: '#FAF9FD',
  paper: '#ffffff',
  wash: '#F4F0FF',
  blue: '#7447F5',
  green: '#059669',
  amber: '#f59e0b',
  red: '#dc2626',
};

const paymentEvidenceIssueLabels: Record<FinancePaymentEvidenceIssueCode, string> = {
  invalid_payment: '订单付款记录无效',
  missing_original: '缺少原实收流水',
  duplicate_original: '原实收流水重复占用',
  invalid_original: '原实收归属、状态、方向或金额无效',
  invalid_adjustment: '冲正归属、状态或金额无效',
  amount_mismatch: '付款金额与流水净额不一致',
  business_time_mismatch: '付款时间与流水业务时间不一致',
};

const FINANCE_TABS: Array<{ value: FinanceTab; label: string; permissionKey: string }> = [
  { value: 'mine', label: '我的提成', permissionKey: PERMISSION_KEYS.FINANCE_MY_COMMISSION },
  { value: 'settlement', label: '订单分账', permissionKey: PERMISSION_KEYS.FINANCE_SETTLEMENT },
  { value: 'recovery-settlement', label: '售后挽回分账', permissionKey: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT },
  { value: 'disbursement', label: '提成发放', permissionKey: PERMISSION_KEYS.FINANCE_PAYOUT },
  { value: 'flow', label: '收支流水', permissionKey: PERMISSION_KEYS.FINANCE_FLOW },
  { value: 'rules', label: '提成规则', permissionKey: PERMISSION_KEYS.FINANCE_RULES },
];

const VALID_TABS = new Set(FINANCE_TABS.map((item) => item.value));

function getTabFromSearch(value: string | null): FinanceTab {
  if (value === 'payout') return 'disbursement';
  return value && VALID_TABS.has(value as FinanceTab) ? (value as FinanceTab) : 'mine';
}

const Finance: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const rawTab = searchParams.get('tab');
  const requestedTab = getTabFromSearch(rawTab);
  const reconciliationOrderIdsParam = searchParams.get('orderIds') || '';
  const fallbackReconciliationOrderIds = useMemo(() => [...new Set(
    reconciliationOrderIdsParam.split(',').map((value) => value.trim()).filter(Boolean),
  )], [reconciliationOrderIdsParam]);
  const reconciliationStartDate = searchParams.get('reconciliationStartDate') || '';
  const reconciliationEndDate = searchParams.get('reconciliationEndDate') || '';
  const [reconciliationOrderIds, setReconciliationOrderIds] = useState(fallbackReconciliationOrderIds);
  const [reconciliationBatch, setReconciliationBatch] = useState(0);
  const [reconciliationLoadError, setReconciliationLoadError] = useState('');
  const [reconciliationResolvedTotal, setReconciliationResolvedTotal] = useState<number>();
  const [reconciliationListLoading, setReconciliationListLoading] = useState(Boolean(reconciliationStartDate && reconciliationEndDate));
  const reconciliationBatchSize = 100;
  const isReconciliationView = fallbackReconciliationOrderIds.length > 0;
  const activeReconciliationOrderIds = useMemo(() => reconciliationOrderIds.slice(
    reconciliationBatch * reconciliationBatchSize,
    (reconciliationBatch + 1) * reconciliationBatchSize,
  ), [reconciliationBatch, reconciliationOrderIds]);
  const reconciliationTotalParam = Number(searchParams.get('reconciliationTotal'));
  const reconciliationFallbackTotal = Number.isFinite(reconciliationTotalParam)
    ? Math.max(fallbackReconciliationOrderIds.length, Math.floor(reconciliationTotalParam))
    : fallbackReconciliationOrderIds.length;
  const reconciliationTotal = reconciliationResolvedTotal ?? reconciliationFallbackTotal;
  const reconciliationBatchStart = reconciliationOrderIds.length
    ? reconciliationBatch * reconciliationBatchSize + 1
    : 0;
  const reconciliationBatchEnd = Math.min(
    (reconciliationBatch + 1) * reconciliationBatchSize,
    reconciliationOrderIds.length,
  );
  const currentUser = useAuthStore((state) => state.currentUser);
  const canManageSettlement = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_SETTLEMENT, 'write');
  const canManageRecoverySettlement = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write');
  const canExportOrderSettlements = hasPermission(currentUser, PERMISSION_KEYS.ORDER_SETTLEMENT_EXPORT);
  const canExportRecoverySettlements = hasPermission(currentUser, PERMISSION_KEYS.RECOVERY_SETTLEMENT_EXPORT);
  const canExportFinanceFlow = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_FLOW_EXPORT);
  const canViewMissingOrderDetails = isSuperAdmin(currentUser);
  const [flowPage, setFlowPage] = useState(0);
  const [flowRowsPerPage, setFlowRowsPerPage] = useState(10);
  const [evidencePage, setEvidencePage] = useState(0);
  const [evidenceRowsPerPage, setEvidenceRowsPerPage] = useState(10);
  const [flowSearch, setFlowSearch] = useState(() => searchParams.get('search') || '');
  const [flowTypeFilter, setFlowTypeFilter] = useState(() => searchParams.get('type') || '');
  const [flowDirectionFilter, setFlowDirectionFilter] = useState('');
  const [flowStartDate, setFlowStartDate] = useState(() => searchParams.get('startDate') || '');
  const [flowEndDate, setFlowEndDate] = useState(() => searchParams.get('endDate') || '');
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [selectedFlow, setSelectedFlow] = useState<FinanceTransaction | null>(null);
  const [flowRows, setFlowRows] = useState<FinanceTransaction[]>([]);
  const [flowLoading, setFlowLoading] = useState(false);
  const [flowError, setFlowError] = useState('');
  const [flowTotal, setFlowTotal] = useState(0);
  const [flowExporting, setFlowExporting] = useState(false);
  const [flowSummary, setFlowSummary] = useState<FinanceTransactionSummary>({ incomeAmount: 0, expenseAmount: 0, netAmount: 0, transactionCount: 0 });
  const [flowCoverage, setFlowCoverage] = useState<FinanceTransactionFilterCoverage>();
  const [settlementViewSettingsTrigger, setSettlementViewSettingsTrigger] = useState(0);
  const [settlementCreateSplitTrigger, setSettlementCreateSplitTrigger] = useState(0);
  const [settlementExportTrigger, setSettlementExportTrigger] = useState(0);
  const [recoverySettlementViewSettingsTrigger, setRecoverySettlementViewSettingsTrigger] = useState(0);
  const [recoverySettlementCreateTrigger, setRecoverySettlementCreateTrigger] = useState(0);
  const [recoverySettlementExportTrigger, setRecoverySettlementExportTrigger] = useState(0);

  const visibleFinanceTabs = useMemo(
    () => FINANCE_TABS.filter((tab) => hasPermission(currentUser, tab.permissionKey)),
    [currentUser],
  );
  const activeTab = visibleFinanceTabs.some((tab) => tab.value === requestedTab)
    ? requestedTab
    : (visibleFinanceTabs[0]?.value || 'mine');

  useEffect(() => {
    setReconciliationOrderIds(fallbackReconciliationOrderIds);
    setReconciliationBatch(0);
    setReconciliationLoadError('');
    setReconciliationResolvedTotal(undefined);
    if (!isReconciliationView || !reconciliationStartDate || !reconciliationEndDate) {
      setReconciliationListLoading(false);
      return;
    }
    setReconciliationListLoading(true);
    let mounted = true;
    dashboardApi.fetchBusinessCockpit({
      preset: 'custom', startDate: reconciliationStartDate, endDate: reconciliationEndDate,
    }).then((response) => {
      if (!mounted) return;
      if (response.code !== 0) {
        setReconciliationLoadError(response.message || '完整异常清单加载失败');
        setReconciliationListLoading(false);
        return;
      }
      const resolvedOrderIds = response.data.financeHealth.reconciliationOrderIds || [];
      setReconciliationOrderIds(resolvedOrderIds);
      setReconciliationResolvedTotal(response.data.financeHealth.reconciliationIssueCount);
      setReconciliationListLoading(false);
    }).catch((error) => {
      if (mounted) {
        setReconciliationLoadError(error instanceof Error ? error.message : '完整异常清单加载失败');
        setReconciliationListLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [fallbackReconciliationOrderIds, isReconciliationView, reconciliationEndDate, reconciliationStartDate]);

  const flowQueryFilters = useMemo<FinanceTransactionFilters>(() => ({
    ...(isReconciliationView
      ? { orderIds: activeReconciliationOrderIds }
      : {
          search: flowSearch,
          type: flowTypeFilter,
          direction: flowDirectionFilter as FinanceTransactionDirection | '',
          startDate: flowStartDate,
          endDate: flowEndDate,
        }),
    page: flowPage + 1,
    pageSize: flowRowsPerPage,
  }), [activeReconciliationOrderIds, flowDirectionFilter, flowEndDate, flowPage, flowRowsPerPage, flowSearch, flowStartDate, flowTypeFilter, isReconciliationView]);

  const flowExportFilters = useMemo<FinanceTransactionFilters>(() => (
    isReconciliationView
      ? { orderIds: activeReconciliationOrderIds }
      : {
          search: flowSearch,
          type: flowTypeFilter,
          direction: flowDirectionFilter as FinanceTransactionDirection | '',
          startDate: flowStartDate,
          endDate: flowEndDate,
        }
  ), [activeReconciliationOrderIds, flowDirectionFilter, flowEndDate, flowSearch, flowStartDate, flowTypeFilter, isReconciliationView]);

  const flowTypeOptions = ['订单实收', '订单实收冲正', '提成发放'];

  useEffect(() => {
    if (activeTab !== 'flow') return;
    if (isReconciliationView && reconciliationListLoading) return;
    if (isReconciliationView && !activeReconciliationOrderIds.length) {
      setFlowRows([]);
      setFlowTotal(0);
      setFlowSummary({ incomeAmount: 0, expenseAmount: 0, netAmount: 0, transactionCount: 0 });
      setFlowCoverage(undefined);
      setSelectedFlowId('');
      setSelectedFlow(null);
      return;
    }
    let mounted = true;
    setFlowLoading(true);
    setFlowError('');
    setFlowCoverage(undefined);
    financeApi.fetchFinanceTransactions(flowQueryFilters).then((res) => {
      if (!mounted) return;
      if (res.code !== 0) {
        setFlowError(res.message || '收支流水加载失败');
        setFlowRows([]);
        setFlowTotal(0);
        setFlowSummary({ incomeAmount: 0, expenseAmount: 0, netAmount: 0, transactionCount: 0 });
        setFlowCoverage(undefined);
        setSelectedFlowId('');
        setSelectedFlow(null);
        return;
      }
      setFlowRows(res.data.items);
      setFlowTotal(res.data.pagination.total);
      setFlowSummary(res.data.summary);
      setFlowCoverage(res.data.filterCoverage);
      setSelectedFlowId((currentId) => (
        res.data.items.some((row) => row.id === currentId) ? currentId : (res.data.items[0]?.id || '')
      ));
      if (!res.data.items.length) setSelectedFlow(null);
    }).finally(() => {
      if (mounted) setFlowLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [activeReconciliationOrderIds.length, activeTab, flowQueryFilters, isReconciliationView, reconciliationListLoading]);

  useEffect(() => {
    if (activeTab !== 'flow' || !selectedFlowId) return;
    let mounted = true;
    financeApi.fetchFinanceTransactionById(selectedFlowId).then((res) => {
      if (!mounted) return;
      setSelectedFlow(res.code === 0 ? res.data : null);
    });
    return () => {
      mounted = false;
    };
  }, [activeTab, selectedFlowId]);

  useEffect(() => {
    setFlowPage(0);
  }, [flowSearch, flowTypeFilter, flowDirectionFilter, flowStartDate, flowEndDate, reconciliationOrderIdsParam, reconciliationBatch]);

  useEffect(() => {
    setEvidencePage(0);
  }, [flowCoverage?.evidenceIssueOrderCount, reconciliationBatch]);

  const exportCurrentFlowRows = async () => {
    setFlowExporting(true);
    try {
      const res = await financeApi.exportFinanceTransactionsCsv(flowExportFilters);
      if (res.code !== 0 || !res.data) {
        setFlowError(res.message || '收支流水导出失败');
        return;
      }
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `业务核账流水-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } finally {
      setFlowExporting(false);
    }
  };

  const handleTabChange = (_: React.SyntheticEvent, value: FinanceTab) => {
    setSearchParams({ tab: value });
  };

  if (rawTab === 'refund') return <Navigate to={ROUTES.AFTER_SALES} replace />;
  if (rawTab === 'overview') return <Navigate to={`${ROUTES.FINANCE}?tab=mine`} replace />;

  if (!visibleFinanceTabs.length) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: shell.ink, mb: 2 }}>
          财务中心
        </Typography>
        <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, p: 4, textAlign: 'center', color: shell.muted }}>
          当前账号没有财务中心权限
        </Paper>
      </Box>
    );
  }

  const renderFlow = () => {
    const directionMeta: Record<FinanceTransactionDirection, { label: string; color: string; mark: string }> = {
      income: { label: '收入', color: shell.green, mark: '+' },
      expense: { label: '支出', color: shell.red, mark: '-' },
    };
    const summaryCards = [
      { label: '收入合计', value: formatCurrency(flowSummary.incomeAmount), color: shell.green },
      { label: '支出合计', value: formatCurrency(flowSummary.expenseAmount), color: shell.red },
      { label: '净流入', value: formatCurrency(flowSummary.netAmount), color: flowSummary.netAmount >= 0 ? shell.blue : shell.red },
      { label: '流水笔数', value: `${flowSummary.transactionCount} 笔`, color: shell.blue },
    ];
    const showFlowWorkspace = !isReconciliationView
      || (!reconciliationListLoading && reconciliationTotal > 0);
    const selectedDirectionMeta = selectedFlow
      ? directionMeta[selectedFlow.direction] || { label: '异常', color: shell.red, mark: '' }
      : null;
    const evidenceIssueOrders = flowCoverage?.evidenceIssueOrders || [];
    const safeEvidencePage = Math.min(
      evidencePage,
      Math.max(Math.ceil(evidenceIssueOrders.length / evidenceRowsPerPage) - 1, 0),
    );
    const visibleEvidenceIssueOrders = evidenceIssueOrders.slice(
      safeEvidencePage * evidenceRowsPerPage,
      (safeEvidencePage + 1) * evidenceRowsPerPage,
    );

    return (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <Alert severity="info" variant="outlined">当前流水包含订单实收和提成实际发放；退款及其他经营支出暂未纳入。</Alert>
        {isReconciliationView && reconciliationListLoading && (
          <Alert severity="info" variant="outlined">正在更新对账异常清单…</Alert>
        )}
        {isReconciliationView && !reconciliationListLoading && reconciliationTotal === 0 && (
          <Alert
            severity="success"
            variant="outlined"
            action={<Button color="inherit" size="small" onClick={() => setSearchParams({ tab: 'flow' })}>返回全部流水</Button>}
          >
            该统计周期的对账异常已全部处理，当前没有需要核对的订单。
          </Alert>
        )}
        {isReconciliationView && !reconciliationListLoading && reconciliationTotal > 0 && (
          <Alert
            severity="warning"
            action={(
              <Stack direction="row" spacing={0.5}>
                <Button
                  color="inherit"
                  size="small"
                  disabled={reconciliationBatch === 0}
                  onClick={() => setReconciliationBatch((value) => Math.max(0, value - 1))}
                >上一批</Button>
                <Button
                  color="inherit"
                  size="small"
                  disabled={reconciliationBatchEnd >= reconciliationOrderIds.length}
                  onClick={() => setReconciliationBatch((value) => value + 1)}
                >下一批</Button>
                <Button color="inherit" size="small" onClick={() => setSearchParams({ tab: 'flow' })}>退出异常视图</Button>
              </Stack>
            )}
          >
            正在展示第 {reconciliationBatchStart}-{reconciliationBatchEnd} / 共 {reconciliationTotal} 个对账异常订单的完整资金链（含原实收与冲正），不受当前统计月份限制。没有对应流水的异常订单会单独列出，请结合订单付款记录核对。
          </Alert>
        )}
        {isReconciliationView && reconciliationLoadError && (
          <Alert severity="error" variant="outlined">
            {reconciliationLoadError}；当前仅能展示链接中已携带的异常订单。
          </Alert>
        )}
        {showFlowWorkspace && isReconciliationView && Boolean(flowCoverage?.evidenceIssueOrders.length) && (
          <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, bgcolor: '#fff', p: 1.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={0.5} sx={{ mb: 1.25 }}>
              <Box>
                <Typography variant="subtitle2" sx={{ color: shell.ink, fontWeight: 900 }}>
                  付款证据需核对的异常订单（{flowCoverage?.evidenceIssueOrderCount}）
                </Typography>
                <Typography variant="caption" sx={{ color: shell.muted }}>
                  已按每笔付款核对原实收、冲正净额和业务时间；点击订单查看源资料并处理。
                </Typography>
              </Box>
              {!canViewMissingOrderDetails && <Typography variant="caption" color="warning.main">仅超级管理员可处理</Typography>}
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1 }}>
              {visibleEvidenceIssueOrders.map((order) => {
                return (
                  <Button
                    key={order.orderId}
                    variant="outlined"
                    disabled={!canViewMissingOrderDetails}
                    onClick={() => navigate(`${ROUTES.ORDERS}?tab=list&orderId=${encodeURIComponent(order.orderId)}`)}
                    sx={{ justifyContent: 'flex-start', textAlign: 'left', px: 1.25, py: 1, borderColor: shell.line, whiteSpace: 'normal' }}
                  >
                    <Box sx={{ minWidth: 0, width: '100%' }}>
                      <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 900 }} noWrap>{order.orderNo}</Typography>
                      <Typography variant="caption" sx={{ color: shell.muted, display: 'block' }} noWrap>{order.customerName}</Typography>
                      <Typography variant="caption" sx={{ color: shell.ink, display: 'block', mt: 0.5 }}>
                        {order.paymentCount} 笔付款 · 应收 {formatCurrency(order.expectedPaymentAmount)} · 流水净额 {formatCurrency(order.ledgerNetAmount)}
                      </Typography>
                      {order.orderIssues.map((line) => (
                        <Typography key={line} variant="caption" sx={{ color: shell.red, fontWeight: 800, display: 'block' }}>
                          {line}
                        </Typography>
                      ))}
                      {order.paymentEvidence.map((payment, paymentIndex) => (
                        <Typography
                          key={`${payment.paymentId}:${payment.paidAt}:${paymentIndex}`}
                          variant="caption"
                          sx={{ color: payment.issues.length ? shell.red : shell.green, fontWeight: 800, display: 'block' }}
                        >
                          付款 {payment.paymentReference || payment.paymentId}（{formatDate(payment.paidAt, 'yyyy-MM-dd HH:mm:ss')}）：应收 {formatCurrency(payment.expectedAmount)} / 流水净额 {formatCurrency(payment.ledgerAmount)} / 差额 {formatCurrency(payment.differenceAmount)}；{payment.issues.length ? payment.issues.map((issue) => paymentEvidenceIssueLabels[issue]).join('、') : '证据一致'}
                        </Typography>
                      ))}
                      <Typography variant="caption" sx={{ color: shell.blue, fontWeight: 800, display: 'block', mt: 0.5 }}>
                        差额 {formatCurrency(order.differenceAmount)} · 查看订单
                      </Typography>
                    </Box>
                  </Button>
                );
              })}
            </Box>
            <TablePagination
              component="div"
              count={evidenceIssueOrders.length}
              page={safeEvidencePage}
              rowsPerPage={evidenceRowsPerPage}
              rowsPerPageOptions={[10, 20, 50, 100]}
              onPageChange={(_, page) => setEvidencePage(page)}
              onRowsPerPageChange={(event) => {
                setEvidenceRowsPerPage(Number(event.target.value));
                setEvidencePage(0);
              }}
              labelRowsPerPage="每页条数"
              labelDisplayedRows={formatPaginationRows}
              sx={{ mt: 1, borderTop: `1px solid ${shell.line}`, pt: 1 }}
            />
          </Paper>
        )}
        {showFlowWorkspace && isReconciliationView && flowCoverage?.evidenceDetailsRestricted && (
          <Alert severity="warning" variant="outlined">
            当前批次有 {flowCoverage.evidenceIssueOrderCount} 个订单的付款证据需要核对。为保护客户和付款数据，仅超级管理员可查看具体差额和订单入口。
          </Alert>
        )}
        {showFlowWorkspace && flowError && <Alert severity="error" variant="outlined">{flowError}</Alert>}
        {showFlowWorkspace && <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, bgcolor: '#fff', overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '6px 1fr' }}>
            <Box sx={{ bgcolor: shell.ink }} />
            <Box sx={{ p: 1.5 }}>
              <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} spacing={1.5}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: shell.ink, lineHeight: 1.2 }}>
                    业务核账流水
                  </Typography>
                  <Typography variant="caption" sx={{ color: shell.muted }}>
                    仅记录已经真实发生的订单收款和提成发放，不展示预计金额。
                  </Typography>
                </Box>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, minmax(118px, 1fr))' }, gap: 0.75, minWidth: { lg: 560 } }}>
                  {summaryCards.map((card) => (
                    <Box key={card.label} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, px: 1, py: 0.75, bgcolor: shell.soft }}>
                      <Typography variant="caption" sx={{ color: shell.muted }}>{card.label}</Typography>
                      <Typography variant="body2" sx={{ mt: 0.25, fontWeight: 900, color: card.color }}>{card.value}</Typography>
                    </Box>
                  ))}
                </Box>
              </Stack>
            </Box>
          </Box>
        </Paper>}

        {showFlowWorkspace && <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 2, bgcolor: '#fff', p: { xs: 1.5, md: 2 }, boxShadow: '0 14px 40px rgba(73, 50, 120, 0.05)' }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ xs: 'stretch', lg: 'center' }}>
            <TextField
              size="small"
              placeholder="搜索流水号、订单号、客户、产品或经办人"
              value={flowSearch}
              disabled={isReconciliationView}
              onChange={(event) => setFlowSearch(event.target.value)}
              InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: shell.muted }} /> }}
              sx={{ minWidth: { xs: '100%', lg: 360 } }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>流水类型</InputLabel>
              <Select disabled={isReconciliationView} label="流水类型" value={flowTypeFilter} onChange={(event) => setFlowTypeFilter(event.target.value)}>
                <MenuItem value="">全部</MenuItem>
                {flowTypeOptions.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>方向</InputLabel>
              <Select disabled={isReconciliationView} label="方向" value={flowDirectionFilter} onChange={(event) => setFlowDirectionFilter(event.target.value)}>
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="income">收入</MenuItem>
                <MenuItem value="expense">支出</MenuItem>
              </Select>
            </FormControl>
            <TextField disabled={isReconciliationView} size="small" label="开始日期" type="date" value={flowStartDate} onChange={(event) => setFlowStartDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField disabled={isReconciliationView} size="small" label="结束日期" type="date" value={flowEndDate} onChange={(event) => setFlowEndDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            {canExportFinanceFlow && (
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                disabled={flowExporting || flowTotal === 0}
                onClick={exportCurrentFlowRows}
                sx={{ height: 40, alignSelf: { xs: 'stretch', lg: 'center' } }}
              >
                导出流水
              </Button>
            )}
          </Stack>
        </Paper>}

        {showFlowWorkspace && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 330px' }, gap: 1.5, alignItems: 'start' }}>
          <DataTableWorkspace>
            <DataTableDesktopScroller>
              <Table stickyHeader sx={{ minWidth: 1140 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>流水编号</TableCell>
                    <TableCell>类型</TableCell>
                    <TableCell>方向</TableCell>
                    <TableCell>金额</TableCell>
                    <TableCell>关联业务</TableCell>
                    <TableCell>客户/对象</TableCell>
                    <TableCell>经办人</TableCell>
                    <TableCell>流水状态</TableCell>
                    <TableCell>来源状态</TableCell>
                    <TableCell>发生时间</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {flowRows.map((row) => {
                    const meta = directionMeta[row.direction] || { label: '异常', color: shell.red, mark: '' };
                    const selected = selectedFlow?.id === row.id;
                    return (
                      <TableRow
                        key={row.id}
                        hover
                        selected={selected}
                        onClick={() => setSelectedFlowId(row.id)}
                        sx={{
                          cursor: 'pointer',
                          '& td:first-of-type': { borderLeft: `4px solid ${meta.color}` },
                        }}
                      >
                        <TableCell sx={{ fontWeight: 900, color: shell.ink }}>{row.transactionNo}</TableCell>
                        <TableCell>{row.type}</TableCell>
                        <TableCell>
                          <Chip size="small" label={meta.label} sx={{ bgcolor: `${meta.color}14`, color: meta.color, fontWeight: 800 }} />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 900, color: meta.color }}>
                          {meta.mark}{formatCurrency(row.amount)}
                        </TableCell>
                        <TableCell>{row.relatedBusiness || '-'}</TableCell>
                        <TableCell>{row.customerName || '-'}</TableCell>
                        <TableCell>{row.operatorName || '-'}</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={row.status || '异常'}
                            variant={row.status === '已确认' ? 'filled' : 'outlined'}
                            sx={{
                              bgcolor: row.status === '已确认' ? '#ecfdf5' : '#fff7ed',
                              color: row.status === '已确认' ? shell.green : shell.amber,
                              fontWeight: 800,
                            }}
                          />
                        </TableCell>
                        <TableCell>{row.sourceStatus || '-'}</TableCell>
                        <TableCell>{row.occurredAt ? formatDate(row.occurredAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {!flowRows.length && (
                <DataTableEmptyState label={flowLoading ? '加载中...' : isReconciliationView ? '未找到这些异常订单的资金流水，请返回订单核对付款记录' : '暂无收支流水'} />
              )}
            </DataTableDesktopScroller>
            <DataTableMobileScroller>
              {flowRows.map((row) => {
                const meta = directionMeta[row.direction] || { label: '异常', color: shell.red, mark: '' };
                const selected = selectedFlow?.id === row.id;
                return (
                  <Paper
                    key={row.id}
                    elevation={0}
                    onClick={() => setSelectedFlowId(row.id)}
                    sx={{
                      border: `1px solid ${selected ? '#C9B9FF' : shell.line}`,
                      borderLeft: `4px solid ${meta.color}`,
                      borderRadius: 2,
                      p: 1.5,
                      bgcolor: selected ? '#F7F4FF' : '#fff',
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" noWrap sx={{ color: shell.ink, fontWeight: 900 }}>{row.transactionNo}</Typography>
                        <Typography variant="caption" sx={{ color: shell.muted }}>{row.type} · {row.relatedBusiness || '暂无关联业务'}</Typography>
                      </Box>
                      <Typography variant="subtitle1" sx={{ color: meta.color, fontWeight: 900, whiteSpace: 'nowrap' }}>
                        {meta.mark}{formatCurrency(row.amount)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1 }}>
                      <Chip size="small" label={meta.label} sx={{ bgcolor: `${meta.color}14`, color: meta.color, fontWeight: 800 }} />
                      <Chip size="small" label={row.status || '异常'} sx={{ bgcolor: row.status === '已确认' ? '#ECFDF5' : '#FFF7ED', color: row.status === '已确认' ? shell.green : shell.amber, fontWeight: 800 }} />
                    </Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mt: 1.25, pt: 1.25, borderTop: `1px solid ${shell.line}` }}>
                      <Box>
                        <Typography variant="caption" sx={{ color: shell.muted }}>客户/对象</Typography>
                        <Typography variant="body2" noWrap sx={{ color: shell.ink, fontWeight: 800 }}>{row.customerName || '-'}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="caption" sx={{ color: shell.muted }}>经办人</Typography>
                        <Typography variant="body2" noWrap sx={{ color: shell.ink, fontWeight: 800 }}>{row.operatorName || '-'}</Typography>
                      </Box>
                      <Box sx={{ gridColumn: '1 / -1' }}>
                        <Typography variant="caption" sx={{ color: shell.muted }}>发生时间</Typography>
                        <Typography variant="body2" sx={{ color: shell.ink }}>{row.occurredAt ? formatDate(row.occurredAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</Typography>
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
              {!flowRows.length && (
                <Typography variant="body2" sx={{ py: 6, textAlign: 'center', color: shell.muted }}>
                  {flowLoading ? '加载中...' : isReconciliationView ? '未找到这些异常订单的资金流水' : '暂无收支流水'}
                </Typography>
              )}
            </DataTableMobileScroller>
            <DataTableWorkspaceFooter>
              <TablePagination
              component="div"
              count={flowTotal}
              page={Math.min(flowPage, Math.max(Math.ceil(flowTotal / flowRowsPerPage) - 1, 0))}
              rowsPerPage={flowRowsPerPage}
              rowsPerPageOptions={[10, 20, 50, 100]}
              onPageChange={(_, page) => setFlowPage(page)}
              onRowsPerPageChange={(event) => {
                setFlowRowsPerPage(Number(event.target.value));
                setFlowPage(0);
              }}
              labelRowsPerPage="每页条数"
              labelDisplayedRows={formatPaginationRows}
                sx={{ bgcolor: '#fff' }}
              />
            </DataTableWorkspaceFooter>
          </DataTableWorkspace>

          <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 2, bgcolor: '#fff', overflow: 'hidden', boxShadow: '0 14px 40px rgba(73, 50, 120, 0.05)' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '5px 1fr' }}>
              <Box sx={{ bgcolor: selectedDirectionMeta?.color || shell.line }} />
              <Box sx={{ p: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: shell.ink, mb: 1 }}>
                  流水详情
                </Typography>
                {selectedFlow ? (
                  <Stack spacing={1}>
                    {[
                      ['流水编号', selectedFlow.transactionNo],
                      ['流水类型', selectedFlow.type],
                      ['方向', selectedDirectionMeta?.label || '异常'],
                      ['金额', `${selectedDirectionMeta?.mark || ''}${formatCurrency(selectedFlow.amount)}`],
                      ['关联业务', selectedFlow.relatedBusiness || '-'],
                      ['订单号', selectedFlow.orderNo || '-'],
                      ['客户/对象', selectedFlow.customerName || '-'],
                      ['产品名称', selectedFlow.productName || '-'],
                      ['来源模块', selectedFlow.sourceModule],
                      ['经办人', selectedFlow.operatorName || '-'],
                      ['付款方式', selectedFlow.paymentMethod || '-'],
                      ['付款流水号', selectedFlow.paymentReference || '-'],
                      ['流水状态', selectedFlow.status || '异常'],
                      ['来源状态', selectedFlow.sourceStatus || '-'],
                      ['发生时间', selectedFlow.occurredAt ? formatDate(selectedFlow.occurredAt, 'yyyy-MM-dd HH:mm:ss') : '-'],
                      ['原因', selectedFlow.reason || '-'],
                    ].map(([label, value]) => (
                      <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '82px 1fr', gap: 1, borderBottom: `1px solid ${shell.line}`, pb: 0.75 }}>
                        <Typography variant="caption" sx={{ color: shell.muted }}>{label}</Typography>
                        <Typography variant="body2" sx={{ color: shell.ink, fontWeight: 700, minWidth: 0, wordBreak: 'break-word' }}>
                          {value}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                ) : (
                  <Box sx={{ border: `1px dashed ${shell.line}`, borderRadius: 1, py: 5, textAlign: 'center', color: shell.muted }}>
                    暂无流水详情
                  </Box>
                )}
              </Box>
            </Box>
          </Paper>
        </Box>}
      </Box>
    );
  };

  return (
    <ModulePage workspace={activeTab === 'settlement' || activeTab === 'recovery-settlement' || activeTab === 'disbursement' || activeTab === 'flow'}>
      <ModuleHeader
        title="财务中心"
        description="聚焦提成核算、员工发放、月度对账、收支流水和规则配置。"
        actions={(
          <>
        {activeTab === 'settlement' && (
          <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              startIcon={<ViewColumnIcon />}
              onClick={() => setSettlementViewSettingsTrigger((value) => value + 1)}
            >
              视图设置
            </Button>
            {canExportOrderSettlements && (
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={() => setSettlementExportTrigger((value) => value + 1)}
              >
                导出订单分账
              </Button>
            )}
            {canManageSettlement && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setSettlementCreateSplitTrigger((value) => value + 1)}
              >
                新建订单分账
              </Button>
            )}
          </Stack>
        )}
        {activeTab === 'recovery-settlement' && (
          <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              startIcon={<ViewColumnIcon />}
              onClick={() => setRecoverySettlementViewSettingsTrigger((value) => value + 1)}
            >
              视图设置
            </Button>
            {canExportRecoverySettlements && (
              <Button
                variant="outlined"
                startIcon={<FileDownloadIcon />}
                onClick={() => setRecoverySettlementExportTrigger((value) => value + 1)}
              >
                导出售后挽回分账
              </Button>
            )}
            {canManageRecoverySettlement && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setRecoverySettlementCreateTrigger((value) => value + 1)}
              >
                新建售后挽回分账
              </Button>
            )}
          </Stack>
        )}
          </>
        )}
      />

      <ModuleTabs
        value={activeTab}
        onChange={handleTabChange}
        variant="scrollable"
        scrollButtons="auto"
      >
        {visibleFinanceTabs.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} />
        ))}
      </ModuleTabs>

      {activeTab === 'mine' && (
        <Commission
          key="finance-my-commission"
          embedded
          initialTab={1}
          payoutScope="mine"
          payoutMode="mine"
        />
      )}
      {activeTab === 'settlement' && (
        <Commission
          key="finance-settlement"
          embedded
          initialTab={0}
          hideEmbeddedOrderSplitViewButton
          orderSplitViewTrigger={settlementViewSettingsTrigger}
          orderSplitCreateTrigger={settlementCreateSplitTrigger}
          orderSplitExportTrigger={settlementExportTrigger}
          orderSplitInitialSearch={searchParams.get('search') || ''}
        />
      )}
      {activeTab === 'recovery-settlement' && (
        <RecoverySettlement
          viewSettingsTrigger={recoverySettlementViewSettingsTrigger}
          createSettlementTrigger={recoverySettlementCreateTrigger}
          exportTrigger={recoverySettlementExportTrigger}
          initialSearch={searchParams.get('search') || ''}
        />
      )}
      {activeTab === 'disbursement' && <CommissionPayout />}
      {activeTab === 'flow' && renderFlow()}
      {activeTab === 'rules' && <Commission key="finance-rules" embedded initialTab={2} />}
    </ModulePage>
  );
};

export default Finance;
