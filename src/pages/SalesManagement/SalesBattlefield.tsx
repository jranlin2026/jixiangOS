import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../api';
import { ROUTES } from '../../shared/utils/constants';
import type { BusinessCockpitData, CockpitSalesBattleProfile } from '../../types/dashboard';
import SalesBattleTable from './components/SalesBattleTable';
import {
  getSalespersonBattleStatus,
  isSalesDepartmentProfile,
  paginateSalesProfiles,
} from './salesBattlefieldModel';

function currentMonthLabel(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
  }).format(new Date());
}

const SalesBattlefield: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<BusinessCockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const latestRequestId = useRef(0);

  const load = useCallback(async () => {
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    setLoading(true);
    setLoadError('');
    try {
      const response = await dashboardApi.fetchBusinessCockpit({ preset: 'month' });
      if (requestId !== latestRequestId.current) return;
      if (response.code === 0) setData(response.data);
      else setLoadError(response.message || '销售战情加载失败');
    } catch (error) {
      if (requestId !== latestRequestId.current) return;
      setLoadError(error instanceof Error ? error.message : '销售战情加载失败');
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { latestRequestId.current += 1; };
  }, [load]);

  const profiles = useMemo(() => (data?.salesBattleProfiles || [])
    .filter((profile) => profile.identityStatus === 'resolved' && isSalesDepartmentProfile(profile))
    .sort((left, right) => {
      const statusRank = { intervene: 3, attention: 2, normal: 1 } as const;
      const statusDifference = statusRank[getSalespersonBattleStatus(right).code]
        - statusRank[getSalespersonBattleStatus(left).code];
      return statusDifference
        || right.overdueCustomerCount - left.overdueCustomerCount
        || right.riskCustomerCount - left.riskCustomerCount
        || right.revenueAmount - left.revenueAmount;
    }), [data]);

  const pageRows = useMemo(
    () => paginateSalesProfiles(profiles, page, rowsPerPage),
    [page, profiles, rowsPerPage],
  );
  const noFollowUpNames = profiles
    .filter((profile) => profile.customerCount > 0 && profile.todayFollowUpCount === 0)
    .map((profile) => profile.name);
  const interveneProfiles = profiles.filter((profile) => getSalespersonBattleStatus(profile).code === 'intervene');

  const openCustomers = (profile: CockpitSalesBattleProfile) => {
    const query = new URLSearchParams({ ownerId: profile.userId, owner: profile.name });
    navigate(`${ROUTES.CUSTOMERS}?${query.toString()}`);
  };

  if (loading && !data) {
    return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 420 }}><CircularProgress size={32} /></Box>;
  }

  return (
    <Box sx={{ minHeight: '100%', bgcolor: '#F7F6FB', px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
      <Box sx={{ maxWidth: 1480, mx: 'auto' }}>
        <Breadcrumbs separator="/" sx={{ mb: 1.25, color: '#8A8794' }}>
          <Button color="inherit" size="small" onClick={() => navigate(ROUTES.DASHBOARD)} sx={{ minWidth: 0, px: 0 }}>经营驾驶舱</Button>
          <Typography variant="body2" sx={{ color: '#5F576F', fontWeight: 800 }}>销售部经营战情</Typography>
        </Breadcrumbs>

        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2 }}>
          <Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <GroupsOutlinedIcon sx={{ color: '#7C3AED' }} />
              <Typography variant="h5" sx={{ color: '#17142B', fontWeight: 950 }}>销售部经营战情</Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: '#777184', mt: 0.5 }}>查看销售人员客户动作、风险客户和本月目标完成情况</Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip icon={<CalendarMonthOutlinedIcon />} label={currentMonthLabel()} sx={{ bgcolor: '#fff', border: '1px solid #E5E0EF', fontWeight: 800 }} />
            <Chip label={data?.scopeLabel || '当前范围'} sx={{ color: '#6D28D9', bgcolor: '#F0EAFE', fontWeight: 850 }} />
            <Button aria-label="刷新销售战情" variant="outlined" onClick={() => void load()} disabled={loading} sx={{ minWidth: 44, px: 1.25 }}>
              <RefreshOutlinedIcon fontSize="small" />
            </Button>
          </Stack>
        </Stack>

        {loadError && (
          <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void load()}>重试</Button>} sx={{ mb: 2 }}>
            {loadError}
          </Alert>
        )}

        <Paper elevation={0} sx={{ mb: 2, px: { xs: 2, md: 2.5 }, py: 1.75, borderRadius: 2, border: '1px solid #E7E1F1', bgcolor: '#FFFDFE' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 0.75, md: 2.5 }}>
            <Typography variant="body2" sx={{ color: noFollowUpNames.length ? '#C4322B' : '#16875D', fontWeight: 800 }}>
              {noFollowUpNames.length
                ? `今日暂无客户跟进记录：${noFollowUpNames.slice(0, 8).join('、')}${noFollowUpNames.length > 8 ? ` 等${noFollowUpNames.length}人` : ''}`
                : '今日销售均已有客户跟进记录'}
            </Typography>
            <Typography variant="body2" sx={{ color: interveneProfiles.length ? '#A35F00' : '#777184', fontWeight: 800 }}>
              {interveneProfiles.length
                ? `重点关注：${interveneProfiles.length} 名销售存在逾期客户动作`
                : '当前没有需要老板介入的逾期客户动作'}
            </Typography>
          </Stack>
        </Paper>

        <SalesBattleTable
          rows={pageRows}
          total={profiles.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={setPage}
          onRowsPerPageChange={(nextRowsPerPage) => { setRowsPerPage(nextRowsPerPage); setPage(0); }}
          onViewCustomers={openCustomers}
        />
      </Box>
    </Box>
  );
};

export default SalesBattlefield;
