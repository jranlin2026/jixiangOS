import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
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
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import SearchIcon from '@mui/icons-material/Search';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { commissionApi, financeApi, orderReviewApi, ORDER_APPLICATION_STATUSES, refundApi } from '../../api';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import RevenueTrend from './RevenueTrend';
import Commission from '../Commission';
import RefundCenter from '../RefundCenter';
import type { FinanceTransaction, FinanceTransactionDirection, FinanceTransactionFilters } from '../../types/finance';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';

type FinanceTab = 'overview' | 'mine' | 'settlement' | 'payout' | 'refund' | 'flow' | 'rules';

interface FinanceOverview {
  pendingOrderApplications: number;
  pendingSplitOrders: number;
  pendingPayoutOrders: number;
  chargebackSplitOrders: number;
  waitingRefunds: number;
  frozenCommissionAmount: number;
}

const shell = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#dbe4ee',
  soft: '#f8fafc',
  paper: '#ffffff',
  wash: '#eef4fb',
  blue: '#2563eb',
  green: '#059669',
  amber: '#f59e0b',
  red: '#dc2626',
};

const FINANCE_TABS: Array<{ value: FinanceTab; label: string; permissionKey: string }> = [
  { value: 'overview', label: '财务总览', permissionKey: PERMISSION_KEYS.FINANCE_OVERVIEW },
  { value: 'mine', label: '我的提成', permissionKey: PERMISSION_KEYS.FINANCE_MY_COMMISSION },
  { value: 'settlement', label: '订单分账', permissionKey: PERMISSION_KEYS.FINANCE_SETTLEMENT },
  { value: 'payout', label: '员工提成月报', permissionKey: PERMISSION_KEYS.FINANCE_PAYOUT },
  { value: 'refund', label: '退款冲销', permissionKey: PERMISSION_KEYS.FINANCE_REFUND },
  { value: 'flow', label: '收支流水', permissionKey: PERMISSION_KEYS.FINANCE_FLOW },
  { value: 'rules', label: '提成规则', permissionKey: PERMISSION_KEYS.FINANCE_RULES },
];

const VALID_TABS = new Set(FINANCE_TABS.map((item) => item.value));

function getTabFromSearch(value: string | null): FinanceTab {
  return value && VALID_TABS.has(value as FinanceTab) ? (value as FinanceTab) : 'overview';
}

const Finance: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = getTabFromSearch(searchParams.get('tab'));
  const currentUser = useAuthStore((state) => state.currentUser);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof financeApi.fetchFinanceStats>>['data'] | null>(null);
  const [overview, setOverview] = useState<FinanceOverview>({
    pendingOrderApplications: 0,
    pendingSplitOrders: 0,
    pendingPayoutOrders: 0,
    chargebackSplitOrders: 0,
    waitingRefunds: 0,
    frozenCommissionAmount: 0,
  });
  const [flowPage, setFlowPage] = useState(0);
  const [flowRowsPerPage, setFlowRowsPerPage] = useState(10);
  const [flowSearch, setFlowSearch] = useState('');
  const [flowTypeFilter, setFlowTypeFilter] = useState('');
  const [flowDirectionFilter, setFlowDirectionFilter] = useState('');
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [selectedFlow, setSelectedFlow] = useState<FinanceTransaction | null>(null);
  const [flowRows, setFlowRows] = useState<FinanceTransaction[]>([]);
  const [flowTotal, setFlowTotal] = useState(0);
  const [flowExporting, setFlowExporting] = useState(false);
  const [settlementViewSettingsTrigger, setSettlementViewSettingsTrigger] = useState(0);
  const [settlementCreateSplitTrigger, setSettlementCreateSplitTrigger] = useState(0);
  const [refundViewSettingsTrigger, setRefundViewSettingsTrigger] = useState(0);

  const visibleFinanceTabs = useMemo(
    () => FINANCE_TABS.filter((tab) => {
      if (tab.value !== 'mine') return hasPermission(currentUser, tab.permissionKey);
      return hasPermission(currentUser, PERMISSION_KEYS.FINANCE_MY_COMMISSION)
        || hasPermission(currentUser, PERMISSION_KEYS.FINANCE_PAYOUT)
        || hasPermission(currentUser, PERMISSION_KEYS.FINANCE_SETTLEMENT)
        || hasPermission(currentUser, PERMISSION_KEYS.FINANCE_OVERVIEW);
    }),
    [currentUser],
  );
  const activeTab = visibleFinanceTabs.some((tab) => tab.value === requestedTab)
    ? requestedTab
    : (visibleFinanceTabs[0]?.value || 'overview');

  useEffect(() => {
    let mounted = true;
    Promise.all([
      financeApi.fetchFinanceStats(),
      orderReviewApi.fetchOrderApplications({ status: ORDER_APPLICATION_STATUSES.PENDING_REVIEW, pageSize: 1 }),
      commissionApi.fetchCommissionOrderSummaryStatusCounts({ status: '全部', pageSize: 1 }),
      refundApi.getRefundStats(),
    ]).then(([statsRes, applicationsRes, splitCountsRes, refundStatsRes]) => {
      if (!mounted) return;
      if (statsRes.code === 0 && statsRes.data) setStats(statsRes.data);
      setOverview({
        pendingOrderApplications: applicationsRes.data?.pagination.total || 0,
        pendingSplitOrders: splitCountsRes.data?.待确认 || 0,
        pendingPayoutOrders: splitCountsRes.data?.待发放 || 0,
        chargebackSplitOrders: splitCountsRes.data?.待冲销 || 0,
        waitingRefunds: refundStatsRes.data?.waitingFinance || 0,
        frozenCommissionAmount: refundStatsRes.data?.frozenCommissionAmount || 0,
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  const flowQueryFilters = useMemo<FinanceTransactionFilters>(() => ({
    search: flowSearch,
    type: flowTypeFilter,
    direction: flowDirectionFilter as FinanceTransactionDirection | '',
    page: flowPage + 1,
    pageSize: flowRowsPerPage,
  }), [flowDirectionFilter, flowPage, flowRowsPerPage, flowSearch, flowTypeFilter]);

  const flowExportFilters = useMemo<FinanceTransactionFilters>(() => ({
    search: flowSearch,
    type: flowTypeFilter,
    direction: flowDirectionFilter as FinanceTransactionDirection | '',
  }), [flowDirectionFilter, flowSearch, flowTypeFilter]);

  const flowTypeOptions = ['订单收款', '其他收入', '业务支出', '退款冲减', '提成发放'];

  useEffect(() => {
    if (activeTab !== 'flow' && activeTab !== 'overview') return;
    let mounted = true;
    financeApi.fetchFinanceTransactions(flowQueryFilters).then((res) => {
      if (!mounted || res.code !== 0) return;
      setFlowRows(res.data.items);
      setFlowTotal(res.data.pagination.total);
      const nextSelectedId = res.data.items.some((row) => row.id === selectedFlowId)
        ? selectedFlowId
        : (res.data.items[0]?.id || '');
      setSelectedFlowId(nextSelectedId);
      if (!nextSelectedId) setSelectedFlow(null);
    });
    return () => {
      mounted = false;
    };
  }, [activeTab, flowQueryFilters, selectedFlowId]);

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
  }, [flowSearch, flowTypeFilter, flowDirectionFilter]);

  const flowSummary = useMemo(() => {
    const incomeTotal = flowRows
      .filter((row) => row.direction === 'income')
      .reduce((sum, row) => sum + row.amount, 0);
    const expenseTotal = flowRows
      .filter((row) => row.direction === 'expense')
      .reduce((sum, row) => sum + row.amount, 0);
    const pendingCount = flowRows.filter((row) => row.status !== '已确认').length;
    return {
      incomeTotal,
      expenseTotal,
      netAmount: incomeTotal - expenseTotal,
      pendingCount,
    };
  }, [flowRows]);

  const exportCurrentFlowRows = async () => {
    setFlowExporting(true);
    try {
      const res = await financeApi.exportFinanceTransactionsCsv(flowExportFilters);
      if (res.code !== 0 || !res.data) return;
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

  const statCards = stats ? [
    { label: '实收金额', value: formatCurrency(stats.totalRevenue), color: shell.blue },
    { label: '净收入', value: formatCurrency(stats.totalRevenue - stats.totalRefund), color: shell.green },
    { label: '退款金额', value: formatCurrency(stats.totalRefund), color: shell.red },
    { label: '订单数', value: String(stats.totalOrders), color: '#7c3aed' },
    { label: '客单价', value: formatCurrency(stats.avgOrderValue), color: '#0891b2' },
  ] : [];

  const priorityTasks = [
    { label: '待确认分账', value: overview.pendingSplitOrders, tone: '#ea580c', target: 'settlement' as FinanceTab },
    { label: '待审核订单', value: overview.pendingOrderApplications, tone: shell.blue, target: 'overview' as FinanceTab },
    { label: '待发放提成', value: overview.pendingPayoutOrders, tone: shell.green, target: 'payout' as FinanceTab },
    { label: '待退款处理', value: overview.waitingRefunds, tone: '#be123c', target: 'refund' as FinanceTab },
    { label: '待冲销', value: overview.chargebackSplitOrders, tone: shell.red, target: 'refund' as FinanceTab },
  ];

  const riskRows = [
    { label: '待财务退款', value: overview.waitingRefunds, helper: '需要确认退款动作', tone: '#be123c', target: 'refund' as FinanceTab },
    { label: '待冲销分账', value: overview.chargebackSplitOrders, helper: '退款后需处理提成', tone: shell.red, target: 'refund' as FinanceTab },
    { label: '冻结提成', value: formatCurrency(overview.frozenCommissionAmount), helper: '暂不进入发放', tone: shell.muted, target: 'refund' as FinanceTab },
  ];

  const settlementRows = [
    { label: '订单分账', value: overview.pendingSplitOrders, helper: '待确认', target: 'settlement' as FinanceTab },
    { label: '员工月报', value: overview.pendingPayoutOrders, helper: '待发放', target: 'payout' as FinanceTab },
    { label: '退款冲销', value: overview.chargebackSplitOrders + overview.waitingRefunds, helper: '待处理', target: 'refund' as FinanceTab },
  ];

  const recentFinanceEvents = useMemo(() => ([
    ...flowRows.map((row) => ({
      id: row.id,
      type: row.direction === 'income' ? '回款' : row.type,
      title: `${row.customerName || row.type} ${formatCurrency(row.amount)}`,
      meta: `${row.relatedBusiness || row.sourceModule} · ${row.productName || row.sourceModule}`,
      time: row.occurredAt,
      tone: row.direction === 'income' ? shell.green : row.direction === 'reversal' ? shell.amber : shell.red,
    })),
  ].filter((event) => event.time)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    .slice(0, 5)), [flowRows]);

  const canOpenTab = (tab: FinanceTab) => visibleFinanceTabs.some((item) => item.value === tab);

  const handleTabChange = (_: React.SyntheticEvent, value: FinanceTab) => {
    setSearchParams(value === 'overview' ? {} : { tab: value });
  };

  const openTab = (value: FinanceTab) => {
    if (!canOpenTab(value)) return;
    setSearchParams(value === 'overview' ? {} : { tab: value });
  };

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

  const renderOverview = () => (
    <>
      <Paper
        elevation={0}
        sx={{
          border: `1px solid ${shell.line}`,
          borderRadius: 1.5,
          bgcolor: shell.paper,
          overflow: 'hidden',
          mb: 1.5,
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: '5px 1fr' }}>
          <Box sx={{ background: 'linear-gradient(180deg, #2563eb 0%, #ea580c 55%, #dc2626 100%)' }} />
          <Box sx={{ p: 1.5 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 900, color: shell.ink }}>
                财务待处理
              </Typography>
              <Chip
                size="small"
                label={`${priorityTasks.reduce((sum, item) => sum + Number(item.value || 0), 0)} 项待处理`}
                sx={{ height: 22, bgcolor: shell.wash, color: shell.ink, fontWeight: 800 }}
              />
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 0.75 }}>
              {priorityTasks.map((item) => {
                const disabled = !canOpenTab(item.target);
                return (
                  <Box
                    key={item.label}
                    onClick={() => openTab(item.target)}
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 1,
                      border: `1px solid ${shell.line}`,
                      borderLeft: `3px solid ${item.tone}`,
                      borderRadius: 1,
                      px: 1,
                      py: 0.75,
                      bgcolor: Number(item.value) > 0 ? '#fff' : shell.soft,
                      cursor: disabled ? 'default' : 'pointer',
                      opacity: disabled ? 0.5 : 1,
                      '&:hover': disabled ? undefined : { borderColor: item.tone, bgcolor: '#fbfdff' },
                    }}
                  >
                    <Typography variant="caption" sx={{ color: shell.ink, fontWeight: 800 }}>
                      {item.label}
                    </Typography>
                    <Typography variant="subtitle1" sx={{ fontWeight: 900, color: item.tone, lineHeight: 1 }}>
                      {item.value}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, bgcolor: shell.paper, p: 1.5, mb: 1.5 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={1.5}>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: shell.ink }}>
              本月收款
            </Typography>
            <Typography variant="caption" sx={{ color: shell.muted }}>
              实收、退款、净收入和订单效率
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(110px, 1fr))' }, gap: 0.75, flex: 1 }}>
            {statCards.map((card) => (
              <Box key={card.label} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, px: 1, py: 0.75, bgcolor: shell.soft }}>
                <Typography variant="caption" sx={{ color: shell.muted }}>{card.label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 900, color: card.color, mt: 0.25, lineHeight: 1.2 }}>
                  {card.value}
                </Typography>
              </Box>
            ))}
          </Box>
          <Button size="small" variant="outlined" onClick={() => openTab('flow')} sx={{ alignSelf: { xs: 'flex-start', md: 'center' } }}>
            流水
          </Button>
        </Stack>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.9fr 1.1fr' }, gap: 1.5, mb: 1.5 }}>
        <Paper
          elevation={0}
          sx={{
            border: `1px solid ${shell.line}`,
            borderRadius: 1.5,
            bgcolor: shell.paper,
            p: 1.5,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: shell.ink }}>
              提成结算概览
            </Typography>
            <Button size="small" variant="text" onClick={() => openTab('payout')}>
              月报
            </Button>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 0.75 }}>
            {settlementRows.map((item) => (
              <Box
                key={item.label}
                onClick={() => openTab(item.target)}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 1,
                  border: `1px solid ${shell.line}`,
                  borderRadius: 1,
                  px: 1,
                  py: 0.85,
                  cursor: canOpenTab(item.target) ? 'pointer' : 'default',
                  bgcolor: shell.soft,
                }}
              >
                <Box>
                  <Typography variant="caption" sx={{ color: shell.ink, fontWeight: 800 }}>{item.label}</Typography>
                  <Typography variant="caption" sx={{ color: shell.muted, display: 'block' }}>{item.helper}</Typography>
                </Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: Number(item.value) > 0 ? shell.blue : shell.muted }}>
                  {item.value}
                </Typography>
              </Box>
            ))}
          </Box>
        </Paper>

        <Paper
          elevation={0}
          sx={{
            border: `1px solid ${shell.line}`,
            borderRadius: 1.5,
            bgcolor: shell.paper,
            p: 1.5,
          }}
        >
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 0.75 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 900, color: shell.ink }}>
              退款与冲销风险
            </Typography>
            <Button size="small" variant="text" onClick={() => openTab('refund')}>
              处理
            </Button>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 0.75 }}>
            {riskRows.map((item) => (
              <Box
                key={item.label}
                onClick={() => openTab(item.target)}
                sx={{
                  border: `1px solid ${shell.line}`,
                  borderTop: `3px solid ${item.tone}`,
                  borderRadius: 1,
                  px: 1,
                  py: 0.85,
                  cursor: canOpenTab(item.target) ? 'pointer' : 'default',
                  bgcolor: shell.soft,
                }}
              >
                <Typography variant="caption" sx={{ color: shell.muted }}>{item.label}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 900, color: item.tone, my: 0.25 }}>{item.value}</Typography>
                <Typography variant="caption" sx={{ color: shell.muted }}>{item.helper}</Typography>
              </Box>
            ))}
          </Box>
        </Paper>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.9fr 1.1fr' }, gap: 1.5 }}>
        <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, bgcolor: shell.paper, p: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mb: 1 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 900, color: shell.ink }}>
                最近财务动态
              </Typography>
            </Box>
            <Button size="small" variant="text" onClick={() => openTab('flow')}>
              查看流水
            </Button>
          </Stack>
          <Stack spacing={0.5}>
            {recentFinanceEvents.map((event) => (
              <Box
                key={event.id}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto',
                  gap: 1,
                  alignItems: 'center',
                  borderBottom: `1px solid ${shell.line}`,
                  py: 0.75,
                  '&:last-child': { borderBottom: 0 },
                }}
              >
                <Chip
                  size="small"
                  label={event.type}
                  sx={{ bgcolor: `${event.tone}14`, color: event.tone, fontWeight: 800, minWidth: 48 }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800, color: shell.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {event.title}
                  </Typography>
                  <Typography variant="caption" sx={{ color: shell.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                    {event.meta}
                  </Typography>
                </Box>
                <Typography variant="caption" sx={{ color: shell.muted, whiteSpace: 'nowrap' }}>
                  {formatDate(event.time, 'MM-dd HH:mm')}
                </Typography>
              </Box>
            ))}
            {!recentFinanceEvents.length && (
              <Box sx={{ border: `1px dashed ${shell.line}`, borderRadius: 1, py: 4, textAlign: 'center', color: shell.muted }}>
                暂无财务动态
              </Box>
            )}
          </Stack>
        </Paper>
        <RevenueTrend />
      </Box>
    </>
  );

  const renderFlow = () => {
    const directionMeta: Record<FinanceTransactionDirection, { label: string; color: string; mark: string }> = {
      income: { label: '收入', color: shell.green, mark: '+' },
      expense: { label: '支出', color: shell.red, mark: '-' },
      reversal: { label: '冲减', color: shell.amber, mark: '-' },
      freeze: { label: '冻结', color: shell.muted, mark: '' },
    };
    const summaryCards = [
      { label: '收入合计', value: formatCurrency(flowSummary.incomeTotal), color: shell.green },
      { label: '支出合计', value: formatCurrency(flowSummary.expenseTotal), color: shell.red },
      { label: '净流入', value: formatCurrency(flowSummary.netAmount), color: flowSummary.netAmount >= 0 ? shell.blue : shell.red },
      { label: '待确认', value: `${flowSummary.pendingCount} 笔`, color: flowSummary.pendingCount ? shell.amber : shell.muted },
    ];

    return (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, bgcolor: '#fff', overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '6px 1fr' }}>
            <Box sx={{ bgcolor: shell.ink }} />
            <Box sx={{ p: 1.5 }}>
              <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} spacing={1.5}>
                <Box>
                  <Typography variant="h6" sx={{ fontWeight: 900, color: shell.ink, lineHeight: 1.2 }}>
                    业务核账流水
                  </Typography>
                  <Typography variant="caption" sx={{ color: shell.muted }}>
                    订单收款、业务支出、退款冲减和提成发放会在这里形成同一条核账线。
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
        </Paper>

        <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, bgcolor: '#fff', p: 1.25 }}>
          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1} alignItems={{ xs: 'stretch', lg: 'center' }}>
            <TextField
              size="small"
              placeholder="搜索流水号、订单号、客户、产品或经办人"
              value={flowSearch}
              onChange={(event) => setFlowSearch(event.target.value)}
              InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: shell.muted }} /> }}
              sx={{ minWidth: { xs: '100%', lg: 360 } }}
            />
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel>流水类型</InputLabel>
              <Select label="流水类型" value={flowTypeFilter} onChange={(event) => setFlowTypeFilter(event.target.value)}>
                <MenuItem value="">全部</MenuItem>
                {flowTypeOptions.map((type) => (
                  <MenuItem key={type} value={type}>{type}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>方向</InputLabel>
              <Select label="方向" value={flowDirectionFilter} onChange={(event) => setFlowDirectionFilter(event.target.value)}>
                <MenuItem value="">全部</MenuItem>
                <MenuItem value="income">收入</MenuItem>
                <MenuItem value="expense">支出</MenuItem>
                <MenuItem value="reversal">冲减</MenuItem>
                <MenuItem value="freeze">冻结</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="outlined"
              startIcon={<FileDownloadIcon />}
              disabled={flowExporting || flowTotal === 0}
              onClick={exportCurrentFlowRows}
              sx={{ height: 40, alignSelf: { xs: 'stretch', lg: 'center' } }}
            >
              导出流水
            </Button>
          </Stack>
        </Paper>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 330px' }, gap: 1.5, alignItems: 'start' }}>
          <Box>
            <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: '6px 6px 0 0', overflowX: 'auto' }}>
              <Table sx={{ minWidth: 1040 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>流水编号</TableCell>
                    <TableCell>类型</TableCell>
                    <TableCell>方向</TableCell>
                    <TableCell>金额</TableCell>
                    <TableCell>关联业务</TableCell>
                    <TableCell>客户/对象</TableCell>
                    <TableCell>经办人</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell>发生时间</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {flowRows.map((row) => {
                    const meta = directionMeta[row.direction];
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
                            label={row.status}
                            variant={row.status === '已确认' ? 'filled' : 'outlined'}
                            sx={{
                              bgcolor: row.status === '已确认' ? '#ecfdf5' : '#fff7ed',
                              color: row.status === '已确认' ? shell.green : shell.amber,
                              fontWeight: 800,
                            }}
                          />
                        </TableCell>
                        <TableCell>{row.occurredAt ? formatDate(row.occurredAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!flowRows.length && (
                    <TableRow>
                      <TableCell colSpan={9} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                        暂无收支流水
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
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
              sx={{ border: `1px solid ${shell.line}`, borderTop: 0, bgcolor: '#fff' }}
            />
          </Box>

          <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, bgcolor: '#fff', overflow: 'hidden' }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '5px 1fr' }}>
              <Box sx={{ bgcolor: selectedFlow ? directionMeta[selectedFlow.direction].color : shell.line }} />
              <Box sx={{ p: 1.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 900, color: shell.ink, mb: 1 }}>
                  流水详情
                </Typography>
                {selectedFlow ? (
                  <Stack spacing={1}>
                    {[
                      ['流水编号', selectedFlow.transactionNo],
                      ['流水类型', selectedFlow.type],
                      ['方向', directionMeta[selectedFlow.direction].label],
                      ['金额', `${directionMeta[selectedFlow.direction].mark}${formatCurrency(selectedFlow.amount)}`],
                      ['关联业务', selectedFlow.relatedBusiness || '-'],
                      ['客户/对象', selectedFlow.customerName || '-'],
                      ['产品名称', selectedFlow.productName || '-'],
                      ['来源模块', selectedFlow.sourceModule],
                      ['经办人', selectedFlow.operatorName || '-'],
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
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ p: 3, bgcolor: '#f5f7fb', minHeight: '100%' }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'flex-start' }} spacing={2} sx={{ mb: 1.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: shell.ink }}>
            财务中心
          </Typography>
          <Typography variant="body2" sx={{ color: shell.muted, mt: 0.5, maxWidth: 760 }}>
            先处理阻塞项，再查看收入、退款和提成结算。
          </Typography>
        </Box>
        {(activeTab === 'settlement' || activeTab === 'refund') && (
          <Stack direction="row" spacing={1} justifyContent="flex-end" flexWrap="wrap" useFlexGap>
            <Button
              variant="outlined"
              startIcon={<ViewColumnIcon />}
              onClick={() => (
                activeTab === 'settlement'
                  ? setSettlementViewSettingsTrigger((value) => value + 1)
                  : setRefundViewSettingsTrigger((value) => value + 1)
              )}
            >
              视图设置
            </Button>
            {activeTab === 'settlement' && (
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
      </Stack>

      <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, bgcolor: '#fff', mb: 2, overflow: 'hidden' }}>
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            minHeight: 48,
            '& .MuiTab-root': { minHeight: 48, fontWeight: 700 },
          }}
        >
          {visibleFinanceTabs.map((tab) => (
            <Tab key={tab.value} value={tab.value} label={tab.label} />
          ))}
        </Tabs>
      </Paper>

      {activeTab === 'overview' && renderOverview()}
      {activeTab === 'mine' && (
        <Commission
          key="finance-my-commission"
          embedded
          initialTab={1}
          payoutScope="mine"
          payoutMode="mine"
          hidePayoutFinanceActions
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
        />
      )}
      {activeTab === 'payout' && <Commission key="finance-payout" embedded initialTab={1} payoutMode="finance" />}
      {activeTab === 'refund' && <RefundCenter embedded refundViewSettingsTrigger={refundViewSettingsTrigger} />}
      {activeTab === 'flow' && renderFlow()}
      {activeTab === 'rules' && <Commission key="finance-rules" embedded initialTab={2} />}
    </Box>
  );
};

export default Finance;
