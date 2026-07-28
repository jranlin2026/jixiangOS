import React, { useEffect, useMemo, useState } from 'react';
import {
  Navigate,
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
import { financeApi } from '../../api';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import { ROUTES } from '../../shared/utils/constants';
import Commission from '../Commission';
import RecoverySettlement from './RecoverySettlement';
import CommissionPayout from './CommissionPayout';
import { ModuleHeader, ModulePage, ModuleTabs } from '../../shared/components/ModuleShell';
import type { FinanceTransaction, FinanceTransactionDirection, FinanceTransactionFilters, FinanceTransactionSummary } from '../../types/finance';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';

type FinanceTab = 'mine' | 'settlement' | 'recovery-settlement' | 'disbursement' | 'flow' | 'rules';

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
  const rawTab = searchParams.get('tab');
  const requestedTab = getTabFromSearch(rawTab);
  const currentUser = useAuthStore((state) => state.currentUser);
  const canManageSettlement = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_SETTLEMENT, 'write');
  const canManageRecoverySettlement = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write');
  const canExportOrderSettlements = hasPermission(currentUser, PERMISSION_KEYS.ORDER_SETTLEMENT_EXPORT);
  const canExportRecoverySettlements = hasPermission(currentUser, PERMISSION_KEYS.RECOVERY_SETTLEMENT_EXPORT);
  const canExportFinanceFlow = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_FLOW_EXPORT);
  const [flowPage, setFlowPage] = useState(0);
  const [flowRowsPerPage, setFlowRowsPerPage] = useState(10);
  const [flowSearch, setFlowSearch] = useState('');
  const [flowTypeFilter, setFlowTypeFilter] = useState('');
  const [flowDirectionFilter, setFlowDirectionFilter] = useState('');
  const [flowStartDate, setFlowStartDate] = useState('');
  const [flowEndDate, setFlowEndDate] = useState('');
  const [selectedFlowId, setSelectedFlowId] = useState('');
  const [selectedFlow, setSelectedFlow] = useState<FinanceTransaction | null>(null);
  const [flowRows, setFlowRows] = useState<FinanceTransaction[]>([]);
  const [flowLoading, setFlowLoading] = useState(false);
  const [flowError, setFlowError] = useState('');
  const [flowTotal, setFlowTotal] = useState(0);
  const [flowExporting, setFlowExporting] = useState(false);
  const [flowSummary, setFlowSummary] = useState<FinanceTransactionSummary>({ incomeAmount: 0, expenseAmount: 0, netAmount: 0, transactionCount: 0 });
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

  const flowQueryFilters = useMemo<FinanceTransactionFilters>(() => ({
    search: flowSearch,
    type: flowTypeFilter,
    direction: flowDirectionFilter as FinanceTransactionDirection | '',
    startDate: flowStartDate,
    endDate: flowEndDate,
    page: flowPage + 1,
    pageSize: flowRowsPerPage,
  }), [flowDirectionFilter, flowEndDate, flowPage, flowRowsPerPage, flowSearch, flowStartDate, flowTypeFilter]);

  const flowExportFilters = useMemo<FinanceTransactionFilters>(() => ({
    search: flowSearch,
    type: flowTypeFilter,
    direction: flowDirectionFilter as FinanceTransactionDirection | '',
    startDate: flowStartDate,
    endDate: flowEndDate,
  }), [flowDirectionFilter, flowEndDate, flowSearch, flowStartDate, flowTypeFilter]);

  const flowTypeOptions = ['订单实收', '提成发放'];

  useEffect(() => {
    if (activeTab !== 'flow') return;
    let mounted = true;
    setFlowLoading(true);
    setFlowError('');
    financeApi.fetchFinanceTransactions(flowQueryFilters).then((res) => {
      if (!mounted) return;
      if (res.code !== 0) {
        setFlowError(res.message || '收支流水加载失败');
        setFlowRows([]);
        setFlowTotal(0);
        setFlowSummary({ incomeAmount: 0, expenseAmount: 0, netAmount: 0, transactionCount: 0 });
        setSelectedFlowId('');
        setSelectedFlow(null);
        return;
      }
      setFlowRows(res.data.items);
      setFlowTotal(res.data.pagination.total);
      setFlowSummary(res.data.summary);
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
  }, [activeTab, flowQueryFilters]);

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
  }, [flowSearch, flowTypeFilter, flowDirectionFilter, flowStartDate, flowEndDate]);

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

    return (
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        <Alert severity="info" variant="outlined">当前流水包含订单实收和提成实际发放；退款及其他经营支出暂未纳入。</Alert>
        {flowError && <Alert severity="error" variant="outlined">{flowError}</Alert>}
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
              </Select>
            </FormControl>
            <TextField size="small" label="开始日期" type="date" value={flowStartDate} onChange={(event) => setFlowStartDate(event.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField size="small" label="结束日期" type="date" value={flowEndDate} onChange={(event) => setFlowEndDate(event.target.value)} InputLabelProps={{ shrink: true }} />
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
                            label={row.sourceStatus || row.status}
                            variant={(row.sourceStatus || row.status) === '已确认' ? 'filled' : 'outlined'}
                            sx={{
                              bgcolor: (row.sourceStatus || row.status) === '已确认' ? '#ecfdf5' : '#fff7ed',
                              color: (row.sourceStatus || row.status) === '已确认' ? shell.green : shell.amber,
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
                        {flowLoading ? '加载中...' : '暂无收支流水'}
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
                      ['订单号', selectedFlow.orderNo || '-'],
                      ['客户/对象', selectedFlow.customerName || '-'],
                      ['产品名称', selectedFlow.productName || '-'],
                      ['来源模块', selectedFlow.sourceModule],
                      ['经办人', selectedFlow.operatorName || '-'],
                      ['付款方式', selectedFlow.paymentMethod || '-'],
                      ['付款流水号', selectedFlow.paymentReference || '-'],
                      ['来源状态', selectedFlow.sourceStatus || selectedFlow.status],
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
    <ModulePage>
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
        sx={{ mb: 1.5 }}
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
