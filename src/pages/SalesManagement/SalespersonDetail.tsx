import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Breadcrumbs, Button, Chip, CircularProgress, LinearProgress, Paper,
  Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { useNavigate, useParams } from 'react-router-dom';
import { customerApi, dashboardApi } from '../../api';
import type { Customer, CustomerManagementFilter } from '../../types/customer';
import type { CockpitSalesBattleProfile } from '../../types/dashboard';
import { ROUTES } from '../../shared/utils/constants';
import { formatCurrency } from '../../shared/utils/formatters';
import {
  DataTableDesktopScroller, DataTableEmptyState, DataTableMobileScroller,
  DataTableWorkspace, DataTableWorkspaceFooter,
} from '../../shared/components/DataTableWorkspace';
import TablePagination from '../../shared/components/TablePagination';
import { buildCustomerBattleSnapshot, getOpportunityStage } from '../../shared/utils/customerBattleState';

const PAGE_SIZE_OPTIONS = [10, 20, 50];

function shanghaiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
}

const SalespersonDetail: React.FC = () => {
  const { salespersonId = '' } = useParams();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<CockpitSalesBattleProfile | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [managementFilter, setManagementFilter] = useState<CustomerManagementFilter | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [cockpit, customerPage] = await Promise.all([
        dashboardApi.fetchBusinessCockpit({ preset: 'month' }),
        customerApi.fetchCustomers({ ownerId: salespersonId, managementFilter: managementFilter || undefined, page: page + 1, pageSize }),
      ]);
      const found = cockpit.data?.salesBattleProfiles?.find((item) => item.userId === salespersonId && item.identityStatus === 'resolved') || null;
      if (cockpit.code !== 0 || !found) throw new Error(cockpit.message || '无权查看该销售的经营档案');
      if (customerPage.code !== 0) throw new Error(customerPage.message || '客户列表加载失败');
      setProfile(found);
      setCustomers(customerPage.data?.items || []);
      setTotal(customerPage.data?.pagination?.total || 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '页面加载失败');
    } finally {
      setLoading(false);
    }
  }, [managementFilter, page, pageSize, salespersonId]);

  useEffect(() => { void load(); }, [load]);

  const stageRows = useMemo(() => {
    return (profile?.stageDistribution || []).map((item) => [item.stageCode, item.customerCount] as const);
  }, [profile]);

  if (loading && !profile) return <Box sx={{ minHeight: 460, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (!profile) return <Alert severity="error" action={<Button onClick={() => navigate(ROUTES.SALES_MANAGEMENT)}>返回销售战情</Button>}>{error || '销售档案不存在'}</Alert>;

  const interventionCount = profile.needsManagerInterventionCount ?? profile.overdueCustomerCount;
  const summary = `今日跟进 ${profile.todayFollowUpCount} 个客户，名下 ${profile.customerCount} 个客户，风险 ${profile.riskCustomerCount} 个，需要介入 ${interventionCount} 个。`;
  const targetProgress = Math.max(0, Math.min(100, profile.targetCompletionRate || 0));

  return (
    <Box sx={{ minHeight: '100%', bgcolor: '#F7F6FB', px: { xs: 2, md: 3 }, py: 3 }}>
      <Box sx={{ maxWidth: 1480, mx: 'auto' }}>
        <Breadcrumbs separator="/" sx={{ mb: 1.5, color: '#8A8794' }}>
          <Button color="inherit" size="small" onClick={() => navigate(ROUTES.DASHBOARD)} sx={{ minWidth: 0, px: 0 }}>经营驾驶舱</Button>
          <Button color="inherit" size="small" onClick={() => navigate(ROUTES.SALES_MANAGEMENT)} sx={{ minWidth: 0, px: 0 }}>销售部经营战情</Button>
          <Typography variant="body2" sx={{ color: '#6D28D9', fontWeight: 800 }}>{profile.name}</Typography>
        </Breadcrumbs>

        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2.25 }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="h4" sx={{ color: '#17142B', fontWeight: 950 }}>{profile.name}</Typography>
              <Chip size="small" label={profile.department || '部门未配置'} sx={{ color: '#6D28D9', bgcolor: '#F0EAFE', fontWeight: 800 }} />
            </Stack>
            <Typography variant="h6" sx={{ mt: 1.25, color: '#17142B', fontWeight: 850 }}>{summary}</Typography>
          </Box>
          <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={() => void load()} disabled={loading} sx={{ alignSelf: { md: 'flex-start' } }}>刷新</Button>
        </Stack>

        {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>
          {[
            ['名下客户', profile.customerCount, '#6D28D9'],
            ['今日跟进客户', profile.todayFollowUpCount, '#2563EB'],
            ['风险客户', profile.riskCustomerCount, '#A35F00'],
            ['需要介入', interventionCount, '#C4322B'],
          ].map(([label, value, color]) => (
            <Paper key={String(label)} elevation={0} sx={{ p: 2.25, border: '1px solid #E7E1F1', borderRadius: 2.5 }}>
              <Typography variant="body2" sx={{ color: '#777184', fontWeight: 700 }}>{label}</Typography>
              <Typography variant="h4" sx={{ mt: 0.5, color, fontWeight: 950 }}>{value}</Typography>
            </Paper>
          ))}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.2fr 0.8fr' }, gap: 2, mb: 2 }}>
          <Paper elevation={0} sx={{ p: 2.5, border: '1px solid #E7E1F1', borderRadius: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>个人业绩汇总</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5, mt: 2 }}>
              {[
                ['月目标', profile.monthlyTargetAmount === null ? '未配置' : formatCurrency(profile.monthlyTargetAmount)],
                ['已完成', formatCurrency(profile.revenueAmount)],
                ['完成率', profile.targetCompletionRate === null ? '-' : `${profile.targetCompletionRate.toFixed(1)}%`],
                ['目标差额', profile.targetGapAmount === null ? '-' : formatCurrency(profile.targetGapAmount)],
              ].map(([label, value]) => <Box key={label}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography sx={{ mt: 0.5, fontWeight: 900 }}>{value}</Typography></Box>)}
            </Box>
            <LinearProgress variant="determinate" value={targetProgress} sx={{ mt: 2.25, height: 8, borderRadius: 99, bgcolor: '#EEEAF7', '& .MuiLinearProgress-bar': { bgcolor: '#7C3AED', borderRadius: 99 } }} />
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', mt: 2, border: '1px solid #EEEAF4', borderRadius: 1.5, overflow: 'hidden' }}>
              {(profile.weeklyRevenueAmounts || [0, 0, 0, 0]).map((amount, index) => <Box key={index} sx={{ p: 1.25, borderLeft: index ? '1px solid #EEEAF4' : 0 }}><Typography variant="caption" color="text.secondary">第{index + 1}周</Typography><Typography variant="body2" sx={{ mt: 0.25, fontWeight: 850 }}>{formatCurrency(amount)}</Typography></Box>)}
            </Box>
          </Paper>

          <Paper elevation={0} sx={{ p: 2.5, border: '1px solid #E7E1F1', borderRadius: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>销售阶段分布</Typography>
            <Stack spacing={1.25} sx={{ mt: 1.75 }}>
              {stageRows.length ? stageRows.map(([stage, count]) => (
                <Box key={stage}>
                  <Stack direction="row" justifyContent="space-between"><Typography variant="body2">{getOpportunityStage(stage).label}</Typography><Typography variant="body2" fontWeight={850}>{count}</Typography></Stack>
                  <LinearProgress variant="determinate" value={Math.min(100, count / Math.max(1, profile.customerCount) * 100)} sx={{ mt: 0.5, height: 6, borderRadius: 99, bgcolor: '#F0ECF7', '& .MuiLinearProgress-bar': { bgcolor: '#8B5CF6' } }} />
                </Box>
              )) : <Typography variant="body2" color="text.secondary">当前暂无阶段数据</Typography>}
            </Stack>
          </Paper>
        </Box>

        <DataTableWorkspace>
          <Box sx={{ p: 2.25, borderBottom: '1px solid #EEEAF4' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>当前名下客户</Typography>
            <Stack direction="row" spacing={0.75} sx={{ mt: 1.5, overflowX: 'auto', pb: 0.25 }}>
              {[
                ['', '全部'], ['key_customer', 'L4/L5高等级'], ['risk', '风险客户'], ['stale_24h', '超24小时未跟进'], ['intervention', '需要介入'], ['payment_pending', '待付款'],
              ].map(([value, label]) => <Chip key={value || 'all'} clickable label={label} color={managementFilter === value ? 'primary' : 'default'} variant={managementFilter === value ? 'filled' : 'outlined'} onClick={() => { setManagementFilter(value as CustomerManagementFilter | ''); setPage(0); }} />)}
            </Stack>
          </Box>
          {!customers.length ? <DataTableEmptyState label="当前页暂无客户" /> : <>
            <DataTableDesktopScroller>
              <Table size="small" sx={{ minWidth: 1320 }}>
                <TableHead><TableRow><TableCell>客户</TableCell><TableCell>等级 / 意向产品</TableCell><TableCell>销售阶段</TableCell><TableCell align="right">预计金额</TableCell><TableCell>最后跟进</TableCell><TableCell>距今</TableCell><TableCell>下一步动作</TableCell><TableCell>风险</TableCell><TableCell align="center">操作</TableCell></TableRow></TableHead>
                <TableBody>{customers.map((customer) => {
                  const snapshot = buildCustomerBattleSnapshot(customer, []);
                  return <TableRow hover key={customer.id}>
                    <TableCell><Typography variant="body2" fontWeight={850}>{customer.name}</Typography><Typography variant="caption" color="text.secondary">{customer.company}</Typography></TableCell>
                    <TableCell><Typography variant="body2">{customer.customerLevel}</Typography><Typography variant="caption" color="text.secondary">{customer.productLevel || '待确认'}</Typography></TableCell>
                    <TableCell>{getOpportunityStage(customer.opportunityStageCode).label}</TableCell>
                    <TableCell align="right">{customer.opportunityAmount == null ? '-' : formatCurrency(customer.opportunityAmount)}</TableCell>
                    <TableCell>{snapshot.lastEffectiveContact ? new Date(snapshot.lastEffectiveContact.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '暂无'}</TableCell>
                    <TableCell>{snapshot.contactGapDays === null ? '-' : `${snapshot.contactGapDays} 天`}</TableCell>
                    <TableCell>{customer.nextActionTitle || '未设置'}</TableCell>
                    <TableCell><Chip size="small" label={snapshot.risk.reason} color={snapshot.risk.level === 'high' ? 'error' : snapshot.risk.level === 'medium' ? 'warning' : 'success'} /></TableCell>
                    <TableCell align="center"><Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(`${ROUTES.CUSTOMERS}?customerId=${encodeURIComponent(customer.id)}`)}>查看客户</Button></TableCell>
                  </TableRow>;
                })}</TableBody>
              </Table>
            </DataTableDesktopScroller>
            <DataTableMobileScroller>{customers.map((customer) => <Paper key={customer.id} variant="outlined" sx={{ p: 1.75, borderRadius: 2 }}><Typography fontWeight={900}>{customer.name}</Typography><Typography variant="body2" color="text.secondary">{customer.company}</Typography><Typography variant="body2" sx={{ mt: 1 }}>阶段：{getOpportunityStage(customer.opportunityStageCode).label}</Typography><Button fullWidth onClick={() => navigate(`${ROUTES.CUSTOMERS}?customerId=${encodeURIComponent(customer.id)}`)} sx={{ mt: 1 }}>查看客户</Button></Paper>)}</DataTableMobileScroller>
          </>}
          <DataTableWorkspaceFooter>
            <TablePagination count={total} page={page} rowsPerPage={pageSize} rowsPerPageOptions={PAGE_SIZE_OPTIONS} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} />
          </DataTableWorkspaceFooter>
        </DataTableWorkspace>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>数据更新：{shanghaiToday()} · 按当前账号可见范围统计</Typography>
      </Box>
    </Box>
  );
};

export default SalespersonDetail;
