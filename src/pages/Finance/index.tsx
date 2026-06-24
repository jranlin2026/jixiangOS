import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Paper,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';
import { commissionApi, financeApi, orderReviewApi, ORDER_APPLICATION_STATUSES, refundApi } from '../../api';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import { getProductLevelColor } from '../../shared/utils/constants';
import RevenueTrend from './RevenueTrend';
import ChannelROIChart from './ChannelROI';
import Commission from '../Commission';
import RefundCenter from '../RefundCenter';
import type { FinanceExpense, FinanceIncome } from '../../types/finance';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';

type FinanceTab = 'overview' | 'settlement' | 'payout' | 'refund' | 'flow' | 'rules';

interface FinanceOverview {
  pendingOrderApplications: number;
  pendingSplitOrders: number;
  pendingPayoutOrders: number;
  chargebackSplitOrders: number;
  waitingRefunds: number;
  frozenCommissionAmount: number;
}

const FINANCE_TABS: Array<{ value: FinanceTab; label: string; permissionKey: string }> = [
  { value: 'overview', label: '财务总览', permissionKey: PERMISSION_KEYS.FINANCE_OVERVIEW },
  { value: 'settlement', label: '订单分账', permissionKey: PERMISSION_KEYS.FINANCE_SETTLEMENT },
  { value: 'payout', label: '员工提成月报', permissionKey: PERMISSION_KEYS.FINANCE_PAYOUT },
  { value: 'refund', label: '退款付款', permissionKey: PERMISSION_KEYS.FINANCE_REFUND },
  { value: 'flow', label: '收支流水', permissionKey: PERMISSION_KEYS.FINANCE_FLOW },
  { value: 'rules', label: '规则配置', permissionKey: PERMISSION_KEYS.FINANCE_RULES },
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
  const [incomes, setIncomes] = useState<FinanceIncome[]>([]);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [incomePage, setIncomePage] = useState(0);
  const [incomeRowsPerPage, setIncomeRowsPerPage] = useState(10);
  const [expensePage, setExpensePage] = useState(0);
  const [expenseRowsPerPage, setExpenseRowsPerPage] = useState(10);
  const [settlementViewSettingsTrigger, setSettlementViewSettingsTrigger] = useState(0);
  const [settlementCreateSplitTrigger, setSettlementCreateSplitTrigger] = useState(0);
  const [refundViewSettingsTrigger, setRefundViewSettingsTrigger] = useState(0);

  const visibleFinanceTabs = useMemo(
    () => FINANCE_TABS.filter((tab) => hasPermission(currentUser, tab.permissionKey)),
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

  useEffect(() => {
    if (activeTab !== 'flow') return;
    let mounted = true;
    Promise.all([financeApi.fetchIncomes(), financeApi.fetchExpenses()]).then(([incomeRes, expenseRes]) => {
      if (!mounted) return;
      if (incomeRes.code === 0 && incomeRes.data) {
        setIncomes(incomeRes.data);
        setIncomePage(0);
      }
      if (expenseRes.code === 0 && expenseRes.data) {
        setExpenses(expenseRes.data);
        setExpensePage(0);
      }
    });
    return () => {
      mounted = false;
    };
  }, [activeTab]);

  const pagedIncomes = useMemo(
    () => incomes.slice(incomePage * incomeRowsPerPage, incomePage * incomeRowsPerPage + incomeRowsPerPage),
    [incomePage, incomeRowsPerPage, incomes],
  );
  const pagedExpenses = useMemo(
    () => expenses.slice(expensePage * expenseRowsPerPage, expensePage * expenseRowsPerPage + expenseRowsPerPage),
    [expensePage, expenseRowsPerPage, expenses],
  );

  const statCards = stats ? [
    { label: '总收入', value: formatCurrency(stats.totalRevenue), color: '#2563eb' },
    { label: '总成本', value: formatCurrency(stats.totalCost), color: '#f59e0b' },
    { label: '净利润', value: formatCurrency(stats.totalProfit), color: '#16a34a' },
    { label: '退款金额', value: formatCurrency(stats.totalRefund), color: '#ef4444' },
    { label: '订单数', value: String(stats.totalOrders), color: '#7c3aed' },
    { label: '客单价', value: formatCurrency(stats.avgOrderValue), color: '#0891b2' },
  ] : [];

  const taskCards = [
    { label: '待审核订单', value: overview.pendingOrderApplications, tone: '#2563eb' },
    { label: '待确认分账', value: overview.pendingSplitOrders, tone: '#f97316' },
    { label: '待发放订单', value: overview.pendingPayoutOrders, tone: '#16a34a' },
    { label: '待冲销分账', value: overview.chargebackSplitOrders, tone: '#dc2626' },
    { label: '待财务退款', value: overview.waitingRefunds, tone: '#be123c' },
    { label: '冻结提成', value: formatCurrency(overview.frozenCommissionAmount), tone: '#6b7280' },
  ];

  const handleTabChange = (_: React.SyntheticEvent, value: FinanceTab) => {
    setSearchParams(value === 'overview' ? {} : { tab: value });
  };

  if (!visibleFinanceTabs.length) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827', mb: 2 }}>
          财务中心
        </Typography>
        <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', p: 4, textAlign: 'center', color: '#6b7280' }}>
          当前账号没有财务中心权限
        </Paper>
      </Box>
    );
  }

  const renderOverview = () => (
    <>
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((card) => (
          <Grid item xs={12} sm={6} md={4} lg={2} key={card.label}>
            <Card elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2 }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>{card.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: card.color }}>{card.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {taskCards.map((card) => (
          <Grid item xs={12} sm={6} md={4} lg={2} key={card.label}>
            <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 2, p: 2 }}>
              <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>{card.label}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 700, color: card.tone }}>{card.value}</Typography>
            </Paper>
          </Grid>
        ))}
      </Grid>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 3 }}>
        <RevenueTrend />
        <ChannelROIChart />
      </Box>
    </>
  );

  const renderFlow = () => (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '1fr 1fr' }, gap: 3 }}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>收入明细</Typography>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>订单号</TableCell>
                <TableCell>客户</TableCell>
                <TableCell>产品等级</TableCell>
                <TableCell>金额</TableCell>
                <TableCell>支付方式</TableCell>
                <TableCell>到账时间</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedIncomes.map((income) => {
                const levelColor = getProductLevelColor(income.productLevel);
                return (
                  <TableRow key={income.id} hover>
                    <TableCell sx={{ fontWeight: 600 }}>{income.orderNo}</TableCell>
                    <TableCell>{income.customerName}</TableCell>
                    <TableCell>
                      <Chip label={income.productLevel} size="small" sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }} />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>{formatCurrency(income.amount)}</TableCell>
                    <TableCell>{income.paymentMethod}</TableCell>
                    <TableCell>{formatDate(income.receivedAt, 'yyyy-MM-dd')}</TableCell>
                  </TableRow>
                );
              })}
              {incomes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#9ca3af' }}>暂无收入记录</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={incomes.length}
          page={incomePage}
          rowsPerPage={incomeRowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
          onPageChange={(_, page) => setIncomePage(page)}
          onRowsPerPageChange={(event) => {
            setIncomeRowsPerPage(Number(event.target.value));
            setIncomePage(0);
          }}
          labelRowsPerPage="每页条数"
          labelDisplayedRows={formatPaginationRows}
          sx={{ border: '1px solid #e5e7eb', borderTop: 0, bgcolor: '#fff' }}
        />
      </Box>

      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>支出明细</Typography>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>分类</TableCell>
                <TableCell>金额</TableCell>
                <TableCell>描述</TableCell>
                <TableCell>审批人</TableCell>
                <TableCell>支付时间</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedExpenses.map((expense) => (
                <TableRow key={expense.id} hover>
                  <TableCell><Chip label={expense.category} size="small" variant="outlined" /></TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#ef4444' }}>{formatCurrency(expense.amount)}</TableCell>
                  <TableCell>{expense.description}</TableCell>
                  <TableCell>{expense.approvedBy || '-'}</TableCell>
                  <TableCell>{expense.paidAt ? formatDate(expense.paidAt, 'yyyy-MM-dd') : '-'}</TableCell>
                </TableRow>
              ))}
              {expenses.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: '#9ca3af' }}>暂无支出记录</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={expenses.length}
          page={expensePage}
          rowsPerPage={expenseRowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
          onPageChange={(_, page) => setExpensePage(page)}
          onRowsPerPageChange={(event) => {
            setExpenseRowsPerPage(Number(event.target.value));
            setExpensePage(0);
          }}
          labelRowsPerPage="每页条数"
          labelDisplayedRows={formatPaginationRows}
          sx={{ border: '1px solid #e5e7eb', borderTop: 0, bgcolor: '#fff' }}
        />
      </Box>
    </Box>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, color: '#111827' }}>
            财务中心
          </Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.75 }}>
            汇总财务总览、订单分账、退款付款和收支流水，财务相关工作统一在这里处理。
          </Typography>
        </Box>
        {(activeTab === 'settlement' || activeTab === 'refund') && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
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
          </Box>
        )}
      </Box>

      <Tabs value={activeTab} onChange={handleTabChange} sx={{ borderBottom: '1px solid #e5e7eb', mb: activeTab === 'settlement' ? 2.5 : 3 }}>
        {visibleFinanceTabs.map((tab) => (
          <Tab key={tab.value} value={tab.value} label={tab.label} />
        ))}
      </Tabs>

      {activeTab === 'overview' && renderOverview()}
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
      {activeTab === 'payout' && <Commission key="finance-payout" embedded initialTab={1} />}
      {activeTab === 'refund' && <RefundCenter embedded refundViewSettingsTrigger={refundViewSettingsTrigger} />}
      {activeTab === 'flow' && renderFlow()}
      {activeTab === 'rules' && <Commission key="finance-rules" embedded initialTab={2} />}
    </Box>
  );
};

export default Finance;
