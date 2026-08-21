import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HeadsetMicOutlinedIcon from '@mui/icons-material/HeadsetMicOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../api';
import { ROUTES } from '../../shared/utils/constants';
import { formatCurrency } from '../../shared/utils/formatters';
import useAuthStore from '../../store/useAuthStore';
import type { BusinessCockpitData, CockpitDepartmentStatus } from '../../types/dashboard';

const colors = {
  page: '#F7F6FB',
  surface: '#FFFFFF',
  ink: '#17142B',
  muted: '#777184',
  line: '#E7E1F1',
  purple: '#7C3AED',
  purpleSoft: '#F1EAFF',
  red: '#D92D20',
  amber: '#B76A00',
  green: '#16875D',
};

const departmentVisuals: Record<CockpitDepartmentStatus['id'], {
  icon: React.ElementType;
  accent: string;
}> = {
  sales: { icon: GroupsOutlinedIcon, accent: '#7C3AED' },
  'customer-success': { icon: SupportAgentOutlinedIcon, accent: '#2F80ED' },
  delivery: { icon: HeadsetMicOutlinedIcon, accent: '#12A6A0' },
  academy: { icon: SchoolOutlinedIcon, accent: '#F59E0B' },
  finance: { icon: PaymentsOutlinedIcon, accent: '#EC4899' },
  marketing: { icon: CampaignOutlinedIcon, accent: '#6D28D9' },
};

function monthLabel(): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'long',
  }).format(new Date());
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '更新时间未知';
  return `更新于 ${date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })}`;
}

const DepartmentCard: React.FC<{
  department: CockpitDepartmentStatus;
  onClick?: () => void;
}> = ({ department, onClick }) => {
  const visual = departmentVisuals[department.id];
  const Icon = visual.icon;
  const status = department.state === 'attention'
    ? { label: `${department.attentionCount}人需关注`, color: colors.red, bg: '#FFF0EE' }
    : department.state === 'normal'
      ? { label: '正常', color: colors.green, bg: '#EAF8F1' }
      : { label: '待接入', color: colors.muted, bg: '#F2F1F5' };
  return (
    <Paper elevation={0} sx={{ border: `1px solid ${colors.line}`, borderRadius: 2, overflow: 'hidden', bgcolor: colors.surface }}>
      <ButtonBase
        disabled={!onClick}
        onClick={onClick}
        aria-label={onClick ? `进入${department.name}经营战情` : `${department.name}暂未接入`}
        sx={{ width: '100%', minHeight: 96, px: 2, py: 1.5, justifyContent: 'stretch', textAlign: 'left', borderLeft: `4px solid ${visual.accent}` }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1.5} sx={{ width: '100%' }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box sx={{ width: 42, height: 42, display: 'grid', placeItems: 'center', borderRadius: '50%', color: visual.accent, bgcolor: `${visual.accent}12` }}>
              <Icon fontSize="small" />
            </Box>
            <Box>
              <Typography sx={{ color: colors.ink, fontWeight: 900 }}>{department.name}</Typography>
              <Typography variant="body2" sx={{ color: colors.muted, mt: 0.15 }}>{department.memberCount} 人</Typography>
            </Box>
          </Stack>
          <Stack alignItems="flex-end" spacing={0.75}>
            <Chip size="small" label={status.label} sx={{ height: 26, color: status.color, bgcolor: status.bg, fontWeight: 850 }} />
            {onClick && <ArrowForwardIcon sx={{ color: colors.purple, fontSize: 18 }} />}
          </Stack>
        </Stack>
      </ButtonBase>
    </Paper>
  );
};

const BusinessCockpit: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [data, setData] = useState<BusinessCockpitData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
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
      else setLoadError(response.message || '驾驶舱数据加载失败');
    } catch (error) {
      if (requestId !== latestRequestId.current) return;
      setLoadError(error instanceof Error ? error.message : '驾驶舱数据加载失败');
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { latestRequestId.current += 1; };
  }, [load]);

  const salesProfiles = useMemo(() => (data?.salesBattleProfiles || [])
    .filter((profile) => profile.identityStatus === 'resolved' && profile.department?.includes('销售')), [data]);
  const todayCompletedActions = salesProfiles.reduce((sum, profile) => sum + profile.todayCompletedTodoCount, 0);
  const atRiskSalesCount = salesProfiles.filter((profile) => profile.overdueCustomerCount > 0 || profile.riskCustomerCount > 0).length;
  const overdueCustomerCount = salesProfiles.reduce((sum, profile) => sum + profile.overdueCustomerCount, 0);
  const performance = data?.managementPerformance || {
    completedAmount: 0,
    targetAmount: null,
    gapAmount: null,
    completionRate: null,
    targetSource: 'unconfigured' as const,
  };
  const progress = performance.completionRate === null
    ? 0 : Math.max(0, Math.min(100, performance.completionRate));

  if (loading && !data) {
    return <Box sx={{ minHeight: 440, display: 'grid', placeItems: 'center' }}><CircularProgress size={32} /></Box>;
  }

  if (!data || loadError) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1180, mx: 'auto' }}>
        <Paper elevation={0} sx={{ p: 4, textAlign: 'center', border: `1px solid ${colors.line}`, borderRadius: 2 }}>
          <Typography variant="h6" sx={{ color: colors.ink, fontWeight: 900 }}>驾驶舱数据暂时无法加载</Typography>
          <Typography variant="body2" sx={{ color: colors.muted, mt: 0.5 }}>{loadError || '请稍后重试'}</Typography>
          <Button variant="contained" onClick={() => void load()} sx={{ mt: 2 }}>重新加载</Button>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100%', bgcolor: colors.page, px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 } }}>
      <Box sx={{ maxWidth: 1480, mx: 'auto' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={2} sx={{ mb: 2 }}>
          <Box>
            <Typography variant="h5" sx={{ color: colors.ink, fontWeight: 950 }}>早上好，{currentUser?.name || '老板'}</Typography>
            <Typography variant="body2" sx={{ color: colors.muted, mt: 0.4 }}>专注当下，掌控全局，推动业务高效增长。</Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Chip icon={<CalendarMonthOutlinedIcon />} label={monthLabel()} sx={{ bgcolor: '#fff', border: `1px solid ${colors.line}`, fontWeight: 800 }} />
            <Chip label={data.scopeLabel} sx={{ color: colors.purple, bgcolor: colors.purpleSoft, fontWeight: 850 }} />
          </Stack>
        </Stack>

        <Paper elevation={0} sx={{ position: 'relative', overflow: 'hidden', border: '1px solid #DED4F0', borderRadius: 2.5, bgcolor: '#FEFCFF', px: { xs: 2.25, md: 3.5 }, py: { xs: 2.5, md: 3.25 }, mb: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <AutoAwesomeOutlinedIcon sx={{ color: colors.purple }} />
            <Typography variant="subtitle2" sx={{ color: colors.ink, fontWeight: 900 }}>极享智控 · AI晨报</Typography>
            <Typography variant="caption" sx={{ color: colors.muted }}>{formatUpdatedAt(String(data.updatedAt))}</Typography>
          </Stack>
          <Typography sx={{ color: colors.ink, fontSize: { xs: 24, md: 34 }, lineHeight: 1.45, fontWeight: 950, mt: 2, maxWidth: 1060 }}>
            今日已完成 <Box component="span" sx={{ color: colors.purple }}>{todayCompletedActions}</Box> 项客户动作，
            本月正式订单净实收 <Box component="span" sx={{ color: colors.purple }}>{formatCurrency(performance.completedAmount)}</Box>，
            <Box component="span" sx={{ color: atRiskSalesCount ? colors.red : colors.green }}>{atRiskSalesCount} 名销售存在风险，其中 {overdueCustomerCount} 个客户动作已逾期</Box>。
          </Typography>
          <Typography variant="body2" sx={{ color: colors.muted, mt: 1.5 }}>基于当前权限范围内的订单、客户动作和风险规则自动生成</Typography>
        </Paper>

        <Box component="section" aria-labelledby="department-matrix-title" sx={{ mb: 2 }}>
          <Typography id="department-matrix-title" variant="subtitle1" sx={{ color: colors.ink, fontWeight: 950, mb: 1.25 }}>组织 · 部门矩阵</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
            {data.departmentStatuses.map((department) => (
              <DepartmentCard
                key={department.id}
                department={department}
                onClick={department.available ? () => navigate(ROUTES.SALES_MANAGEMENT) : undefined}
              />
            ))}
          </Box>
        </Box>

        <Paper component="section" aria-labelledby="performance-title" elevation={0} sx={{ border: `1px solid ${colors.line}`, borderRadius: 2.5, bgcolor: colors.surface, overflow: 'hidden' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={1} sx={{ px: { xs: 2, md: 2.5 }, py: 1.75, borderBottom: '1px solid #EEEAF4' }}>
            <Box>
              <Typography id="performance-title" variant="subtitle1" sx={{ color: colors.ink, fontWeight: 950 }}>公司业绩目标</Typography>
              <Typography variant="caption" sx={{ color: colors.muted }}>正式订单净实收，不含售后回收</Typography>
            </Box>
            <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(ROUTES.ORDERS)}>查看业绩明细</Button>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
            {[
              ['本月完成', formatCurrency(performance.completedAmount), colors.purple],
              ['月目标', performance.targetAmount === null ? '未配置' : formatCurrency(performance.targetAmount), '#1E6BFF'],
              ['目标差额', performance.gapAmount === null ? '—' : formatCurrency(performance.gapAmount), performance.gapAmount ? colors.amber : colors.green],
            ].map(([label, value, color], index) => (
              <Box key={label} sx={{ px: { xs: 2, md: 2.5 }, py: 2.25, borderRight: { md: index < 2 ? '1px solid #EEEAF4' : 0 }, borderBottom: { xs: index < 2 ? '1px solid #EEEAF4' : 0, md: 0 } }}>
                <Typography variant="body2" sx={{ color: colors.muted, fontWeight: 700 }}>{label}</Typography>
                <Typography variant="h5" sx={{ color, fontWeight: 950, mt: 0.6, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
              </Box>
            ))}
          </Box>
          <Box sx={{ px: { xs: 2, md: 2.5 }, pb: 2.25 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} sx={{ mb: 0.75 }}>
              <Typography variant="caption" sx={{ color: colors.muted }}>
                {performance.targetSource === 'okr' ? '目标来源：已发布的OKR经营指标' : '月目标尚未绑定已发布的OKR经营指标'}
              </Typography>
              <Typography variant="caption" sx={{ color: performance.completionRate === null ? colors.muted : colors.purple, fontWeight: 900 }}>
                {performance.completionRate === null ? '配置后显示完成率' : `${performance.completionRate.toFixed(1)}%`}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={progress}
              aria-label={performance.completionRate === null ? '公司月目标未配置' : `公司月目标完成率 ${performance.completionRate.toFixed(1)}%`}
              sx={{ height: 8, borderRadius: 999, bgcolor: '#EEEAF7', '& .MuiLinearProgress-bar': { bgcolor: colors.purple, borderRadius: 999 } }}
            />
            {performance.targetSource === 'unconfigured' && (
              <Alert severity="info" icon={false} sx={{ mt: 1.5, py: 0.25, bgcolor: '#F7F4FE', color: '#5F576F' }}>
                当前只展示真实实收；目标未配置前不计算完成率和差额。
              </Alert>
            )}
          </Box>
        </Paper>
      </Box>
    </Box>
  );
};

export default BusinessCockpit;
