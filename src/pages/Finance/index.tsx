import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Grid, Card, CardContent, Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, Paper, Chip } from '@mui/material';
import useFinanceStore from '../../store/useFinanceStore';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import { getProductLevelColor } from '../../shared/utils/constants';
import RevenueTrend from './RevenueTrend';
import ChannelROIChart from './ChannelROI';
import type { FinanceIncome, FinanceExpense } from '../../types/finance';

interface TabPanelProps {
  children?: React.ReactNode;
  value: number;
  index: number;
}

const TabPanel: React.FC<TabPanelProps> = ({ children, value, index }) => (
  <Box sx={{ display: value === index ? 'block' : 'none', mt: 2 }}>
    {children}
  </Box>
);

const Finance: React.FC = () => {
  const { stats, fetchStats, fetchDailyRecords, fetchChannelROI } = useFinanceStore();
  const [tabValue, setTabValue] = useState(0);
  const [incomes, setIncomes] = useState<FinanceIncome[]>([]);
  const [expenses, setExpenses] = useState<FinanceExpense[]>([]);
  const [incomePage, setIncomePage] = useState(0);
  const [incomeRowsPerPage, setIncomeRowsPerPage] = useState(10);
  const [expensePage, setExpensePage] = useState(0);
  const [expenseRowsPerPage, setExpenseRowsPerPage] = useState(10);

  useEffect(() => {
    fetchStats();
    fetchDailyRecords();
    fetchChannelROI();
  }, [fetchStats, fetchDailyRecords, fetchChannelROI]);

  // 懒加载收入/支出明细
  useEffect(() => {
    if (tabValue === 1) {
      import('../../api').then(({ financeApi }) => {
        financeApi.fetchIncomes().then((res) => {
          if (res.code === 0 && res.data) {
            setIncomes(res.data);
            setIncomePage(0);
          }
        });
      });
    }
    if (tabValue === 2) {
      import('../../api').then(({ financeApi }) => {
        financeApi.fetchExpenses().then((res) => {
          if (res.code === 0 && res.data) {
            setExpenses(res.data);
            setExpensePage(0);
          }
        });
      });
    }
  }, [tabValue]);

  const pagedIncomes = useMemo(
    () => incomes.slice(incomePage * incomeRowsPerPage, incomePage * incomeRowsPerPage + incomeRowsPerPage),
    [incomePage, incomeRowsPerPage, incomes],
  );
  const pagedExpenses = useMemo(
    () => expenses.slice(expensePage * expenseRowsPerPage, expensePage * expenseRowsPerPage + expenseRowsPerPage),
    [expensePage, expenseRowsPerPage, expenses],
  );

  const statCards = stats ? [
    { label: '总收入', value: formatCurrency(stats.totalRevenue), color: '#2196F3' },
    { label: '总成本', value: formatCurrency(stats.totalCost), color: '#FF9800' },
    { label: '净利润', value: formatCurrency(stats.totalProfit), color: '#4CAF50' },
    { label: '退款金额', value: formatCurrency(stats.totalRefund), color: '#F44336' },
    { label: '订单数', value: String(stats.totalOrders), color: '#9C27B0' },
    { label: '客单价', value: formatCurrency(stats.avgOrderValue), color: '#00BCD4' },
  ] : [];

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        财务中心
      </Typography>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {statCards.map((card) => (
          <Grid item xs={2} key={card.label}>
            <Card elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5, fontSize: '0.75rem' }}>{card.label}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: card.color, fontSize: '1.125rem' }}>{card.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={{ borderBottom: '1px solid #e5e7eb' }}>
        <Tab label="趋势分析" />
        <Tab label="收入明细" />
        <Tab label="支出明细" />
      </Tabs>

      <TabPanel value={tabValue} index={0}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
          <RevenueTrend />
          <ChannelROIChart />
        </Box>
      </TabPanel>

      <TabPanel value={tabValue} index={1}>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
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
                    <TableCell sx={{ fontWeight: 500 }}>{income.orderNo}</TableCell>
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
          sx={{
            border: '1px solid #f0f0f0',
            borderTop: 0,
            bgcolor: '#fff',
            '& .MuiTablePagination-toolbar': { minHeight: 48 },
          }}
        />
      </TabPanel>

      <TabPanel value={tabValue} index={2}>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
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
                  <TableCell>
                    <Chip label={expense.category} size="small" variant="outlined" />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#F44336' }}>{formatCurrency(expense.amount)}</TableCell>
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
          sx={{
            border: '1px solid #f0f0f0',
            borderTop: 0,
            bgcolor: '#fff',
            '& .MuiTablePagination-toolbar': { minHeight: 48 },
          }}
        />
      </TabPanel>
    </Box>
  );
};

export default Finance;
