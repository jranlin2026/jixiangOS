import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  LinearProgress,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import PriorityHighIcon from '@mui/icons-material/PriorityHigh';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { dashboardApi, marketingApi } from '../../api';
import { ROUTES } from '../../shared/utils/constants';
import { formatCurrency } from '../../shared/utils/formatters';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import useAuthStore from '../../store/useAuthStore';
import type { AuthenticatedUser } from '../../types/auth';
import type { EnterpriseCockpit } from '../../types/enterpriseBrain';
import type { MarketingPublishPlanStats } from '../../types/marketing';
import type {
  BusinessCockpitData,
  CockpitPerformanceRankingItem,
  CockpitRiskItem,
  DashboardDateRange,
  DashboardRangePreset,
  HomeTaskItem,
} from '../../types/dashboard';
import EnterpriseBrainPanel from './EnterpriseBrainPanel';
import BossCommandCenter, { CustomerBattleBoard } from './BossCommandCenter';
import { alignComparableTrend, buildCockpitDrilldownPath, rankCockpitRisks, resolveDashboardDateRange, toShanghaiDateString } from './businessCockpitModel';

const palette = {
  page: '#F6F8FB',
  surface: '#FFFFFF',
  ink: '#111827',
  muted: '#667085',
  line: '#DDE3EA',
  softLine: '#EEF2F6',
  blue: '#1E6BFF',
  red: '#D92D20',
  amber: '#B7791F',
  green: '#178A5A',
  teal: '#0E7C86',
};

const toneColor: Record<HomeTaskItem['tone'], { color: string; bg: string; border: string }> = {
  primary: { color: palette.blue, bg: '#EDF4FF', border: '#BBD3FF' },
  warning: { color: palette.amber, bg: '#FFF7E8', border: '#F2D49B' },
  error: { color: palette.red, bg: '#FFF0EE', border: '#F2BBB4' },
  success: { color: palette.green, bg: '#EBF8F2', border: '#B9DEC9' },
  info: { color: palette.teal, bg: '#E9F8FA', border: '#B4DDE2' },
};

function monthStart(): string {
  return `${todayString().slice(0, 7)}-01`;
}

function todayString(): string {
  return toShanghaiDateString(new Date());
}

function formatCompactCurrency(value: number): string {
  const amount = Number(value || 0);
  if (Math.abs(amount) >= 10000) {
    const precision = Math.abs(amount) >= 100000 ? 0 : 1;
    return `¥${(amount / 10000).toFixed(precision)}万`;
  }
  return `¥${Math.round(amount).toLocaleString('zh-CN')}`;
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

function validateCustomRange(range: DashboardDateRange): string {
  if (range.preset !== 'custom') return '';
  if (!range.startDate || !range.endDate) return '请选择完整的开始日期和结束日期';
  if (range.startDate > range.endDate) return '开始日期不能晚于结束日期';
  return '';
}

function canAccessCockpitPath(user: AuthenticatedUser | null, path: string): boolean {
  const [pathname, query = ''] = path.split('?');
  const tab = new URLSearchParams(query).get('tab');
  if (pathname === ROUTES.ORDER_REVIEW || (pathname === ROUTES.ORDERS && tab === 'review')) {
    return hasPermission(user, PERMISSION_KEYS.ORDER_REVIEW_LIST);
  }
  if (pathname.startsWith(ROUTES.ORDERS)) {
    return hasPermission(user, PERMISSION_KEYS.ORDER_MANAGE);
  }
  if (pathname.startsWith(ROUTES.REFUND_CENTER)) {
    return [PERMISSION_KEYS.AFTER_SALES_REFUND, PERMISSION_KEYS.FINANCE_REFUND]
      .some((permission) => hasPermission(user, permission));
  }
  if (pathname.startsWith(ROUTES.AFTER_SALES)) {
    return [
      PERMISSION_KEYS.AFTER_SALES,
      PERMISSION_KEYS.AFTER_SALES_RECOVERY,
      PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE,
      PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST,
    ].some((permission) => hasPermission(user, permission));
  }
  if (pathname.startsWith(ROUTES.CUSTOMERS)) {
    return hasPermission(user, PERMISSION_KEYS.CUSTOMERS);
  }
  if (pathname.startsWith(ROUTES.LEADS)) {
    return hasPermission(user, PERMISSION_KEYS.LEADS_LIST);
  }
  if (pathname.startsWith(ROUTES.FINANCE)) {
    if (tab === 'flow') return hasPermission(user, PERMISSION_KEYS.FINANCE_FLOW);
    if (tab === 'settlement') return hasPermission(user, PERMISSION_KEYS.FINANCE_SETTLEMENT);
    if (tab === 'recovery-settlement') return hasPermission(user, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT);
    if (tab === 'disbursement' || tab === 'payout') return hasPermission(user, PERMISSION_KEYS.FINANCE_PAYOUT);
    if (tab === 'rules') return hasPermission(user, PERMISSION_KEYS.FINANCE_RULES);
    if (tab === 'mine') return hasPermission(user, PERMISSION_KEYS.FINANCE_MY_COMMISSION);
    return [
      PERMISSION_KEYS.FINANCE,
      PERMISSION_KEYS.FINANCE_MY_COMMISSION,
      PERMISSION_KEYS.FINANCE_SETTLEMENT,
      PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT,
      PERMISSION_KEYS.FINANCE_PAYOUT,
      PERMISSION_KEYS.FINANCE_FLOW,
      PERMISSION_KEYS.FINANCE_RULES,
    ].some((permission) => hasPermission(user, permission));
  }
  return true;
}

function normalizePercent(value: number): number {
  const percentage = Number(value || 0);
  return Math.max(0, Math.min(100, percentage));
}

function priorityRisk(risks: CockpitRiskItem[]): CockpitRiskItem | undefined {
  return rankCockpitRisks(risks)[0];
}

const SectionPanel: React.FC<{
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}> = ({ title, eyebrow, children, action }) => (
  <Paper
    elevation={0}
    sx={{
      border: `1px solid ${palette.line}`,
      borderRadius: 1,
      bgcolor: palette.surface,
      overflow: 'hidden',
      height: '100%',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}
  >
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      spacing={1}
      sx={{
        minHeight: 68,
        px: 2,
        py: 1.25,
        borderBottom: `1px solid ${palette.softLine}`,
        flexShrink: 0,
      }}
    >
      <Box>
        {eyebrow && (
          <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 700 }}>
            {eyebrow}
          </Typography>
        )}
        <Typography variant="subtitle1" sx={{ fontWeight: 900, color: palette.ink, letterSpacing: 0 }}>
          {title}
        </Typography>
      </Box>
      {action}
    </Stack>
    {children}
  </Paper>
);

const MarketingPublishPanel: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canRead = [PERMISSION_KEYS.DASHBOARD, PERMISSION_KEYS.BRAIN_DASHBOARD, PERMISSION_KEYS.MARKETING_PUBLISH]
    .some((permissionKey) => hasPermission(currentUser, permissionKey));
  const canOpenPlans = hasPermission(currentUser, PERMISSION_KEYS.MARKETING_PUBLISH);
  const [stats, setStats] = useState<MarketingPublishPlanStats | null>(null);
  const [error, setError] = useState('');

  const loadStats = useCallback(async () => {
    if (!canRead) return;
    setError('');
    const result = await marketingApi.fetchPublishPlanStats();
    if (result.code === 0) setStats(result.data);
    else setError(result.message);
  }, [canRead]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  if (!canRead) return null;
  return (
    <SectionPanel
      title="内容发布执行"
      eyebrow="当前发布计划"
      action={canOpenPlans ? <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate('/marketing?tab=plans')}>查看计划</Button> : undefined}
    >
      {error ? (
        <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ color: palette.red }}>{error}</Typography>
          <Button size="small" color="error" onClick={() => void loadStats()}>重试</Button>
        </Stack>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 1, p: 1.5 }}>
          {[
            ['目标账号', stats?.totalTargets || 0],
            ['待确认', stats?.awaitingConfirmationTargets || 0],
            ['已确认', stats?.confirmedTargets || 0],
            ['已逾期', stats?.overdueTargets || 0],
            ['提交率', `${stats?.completionRate || 0}%`],
          ].map(([label, value]) => (
            <Paper key={label} variant="outlined" sx={{ p: 1.25 }}>
              <Typography variant="caption" sx={{ color: palette.muted }}>{label}</Typography>
              <Typography variant="h6" sx={{ fontWeight: 900, color: label === '已逾期' && Number(value) > 0 ? palette.red : palette.ink }}>{value}</Typography>
            </Paper>
          ))}
        </Box>
      )}
    </SectionPanel>
  );
};

const ExecutiveOverview: React.FC<{
  data: BusinessCockpitData;
  mainRisk?: CockpitRiskItem;
  range: DashboardDateRange;
}> = ({ data, mainRisk, range }) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const summary = data.summary;
  const previous = data.comparison.summary;
  const mainTone = mainRisk ? toneColor[mainRisk.tone] : toneColor.success;
  const comparisonText = (current: number, prior: number) => {
    if (current === prior) return '与上期同期持平';
    if (!prior) return current ? '上期同期为 0' : '暂无上期数据';
    const change = Math.round(Math.abs((current - prior) / prior) * 1000) / 10;
    return `${current > prior ? '↑' : '↓'} ${change}% 较上期同期`;
  };
  const conversionRate = summary.newLeadCount ? summary.newCustomerCount / summary.newLeadCount * 100 : 0;
  const previousConversionRate = previous.newLeadCount ? previous.newCustomerCount / previous.newLeadCount * 100 : 0;
  const navigateIfAllowed = (path: string) => canAccessCockpitPath(currentUser, path) ? () => navigate(path) : undefined;
  const darkCard = (onClick?: () => void) => ({
    minWidth: 0,
    border: '1px solid rgba(255,255,255,0.12)',
    bgcolor: 'rgba(255,255,255,0.055)',
    borderRadius: 1.25,
    p: 1.6,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'background-color 160ms ease, border-color 160ms ease',
    '&:hover': onClick ? { bgcolor: 'rgba(255,255,255,0.09)', borderColor: 'rgba(255,255,255,0.26)' } : undefined,
    '&:focus-visible': { outline: '2px solid #8CB4FF', outlineOffset: 2 },
  });
  const MiniResult = ({ label, value, helper, compare, path }: { label: string; value: string; helper: string; compare: string; path?: string }) => {
    const onClick = path ? navigateIfAllowed(path) : undefined;
    return (
      <Box role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick}
        onKeyDown={(event) => { if (onClick && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick(); } }}
        sx={darkCard(onClick)}>
        <Typography variant="caption" sx={{ color: '#AEBED4', fontWeight: 700 }}>{label}</Typography>
        <Typography variant="h6" sx={{ color: '#FFFFFF', fontWeight: 900, mt: 0.6, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
        <Typography variant="caption" sx={{ color: '#B9C7D9', display: 'block', mt: 0.55 }}>{helper}</Typography>
        <Typography variant="caption" sx={{ color: '#8CB4FF', display: 'block', mt: 0.35, fontWeight: 800 }}>{compare}</Typography>
      </Box>
    );
  };
  return (
    <Paper elevation={0} sx={{ bgcolor: '#13243B', color: '#fff', borderRadius: 1.5, overflow: 'hidden', border: '1px solid #203754' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={1.5} sx={{ px: { xs: 2, md: 2.5 }, pt: 2.25 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="overline" sx={{ color: '#8CB4FF', fontWeight: 900, letterSpacing: '0.12em' }}>期间经营结果</Typography>
            <Chip size="small" label={data.rangeLabel} sx={{ height: 22, bgcolor: 'rgba(140,180,255,0.14)', color: '#CFE0FF', fontWeight: 800 }} />
          </Stack>
          <Typography variant="body2" sx={{ color: '#AEBED4', mt: 0.25 }}>按业务发生时间统计 · 对比上期同期</Typography>
        </Box>
        <Box sx={{ border: `1px solid ${mainTone.border}`, bgcolor: mainTone.bg, borderRadius: 1, px: 1.5, py: 0.9, maxWidth: { xs: '100%', md: 360 } }}>
          <Stack direction="row" spacing={1} alignItems="center">
            {mainRisk ? <PriorityHighIcon sx={{ color: mainTone.color }} fontSize="small" /> : <CheckCircleOutlineIcon sx={{ color: mainTone.color }} fontSize="small" />}
            <Typography variant="body2" sx={{ color: mainTone.color, fontWeight: 900 }} noWrap>
              {mainRisk ? `老板今日重点：${mainRisk.title} ${mainRisk.count}` : '老板今日重点：暂无经营阻塞'}
            </Typography>
          </Stack>
        </Box>
      </Stack>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' },
          gap: 1.25,
          p: { xs: 2, md: 2.5 },
        }}
      >
        <MiniResult label="正式订单净实收" value={formatCurrency(data.financeHealth.formalNetReceiptAmount)} helper={`原实收 ${formatCurrency(summary.formalReceiptAmount)}`} compare={comparisonText(data.financeHealth.formalNetReceiptAmount, data.comparison.formalNetReceiptAmount)} path={buildCockpitDrilldownPath(ROUTES.ORDERS, range, 'payment')} />
        <MiniResult label="售后挽回成交" value={formatCurrency(summary.recoveryAmount)} helper={`${summary.recoveryOrderCount} 笔挽回订单`} compare={comparisonText(summary.recoveryAmount, previous.recoveryAmount)} path={buildCockpitDrilldownPath(ROUTES.AFTER_SALES, range, 'recovery')} />
        <MiniResult label="成交订单" value={`${summary.formalOrderCount} 笔`} helper="正式订单" compare={comparisonText(summary.formalOrderCount, previous.formalOrderCount)} path={buildCockpitDrilldownPath(ROUTES.ORDERS, range, 'payment')} />
        <MiniResult label="新增线索" value={`${summary.newLeadCount}`} helper={`${data.customerHealth.followedLeadCount} 条已跟进`} compare={comparisonText(summary.newLeadCount, previous.newLeadCount)} path={buildCockpitDrilldownPath(ROUTES.LEADS, range, 'created')} />
        <MiniResult label="线索转客率" value={`${conversionRate.toFixed(1)}%`} helper={`${summary.newCustomerCount} 位新增客户`} compare={comparisonText(conversionRate, previousConversionRate)} path={buildCockpitDrilldownPath(ROUTES.LEADS, range, 'created')} />
        <MiniResult label="退款金额 / 实收比" value={formatCurrency(data.orderHealth.refundAmount)} helper={`${data.orderHealth.refundedOrderCount} 笔 · 占实收 ${summary.formalReceiptAmount ? (data.orderHealth.refundAmount / summary.formalReceiptAmount * 100).toFixed(1) : '0.0'}%`} compare={comparisonText(data.orderHealth.refundAmount, data.comparison.refundAmount)} path={buildCockpitDrilldownPath(`${ROUTES.REFUND_CENTER}?status=${encodeURIComponent('退款已完成')}`, range, 'created')} />
      </Box>
    </Paper>
  );
};

const TrendLegend: React.FC = () => (
  <Stack direction="row" spacing={1.5} alignItems="center">
    <Stack direction="row" spacing={0.6} alignItems="center">
      <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: palette.blue }} />
      <Typography variant="caption" sx={{ color: palette.muted }}>正式订单实收</Typography>
    </Stack>
    <Stack direction="row" spacing={0.6} alignItems="center">
      <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: palette.green }} />
      <Typography variant="caption" sx={{ color: palette.muted }}>售后挽回成交</Typography>
    </Stack>
    <Stack direction="row" spacing={0.6} alignItems="center">
      <Box sx={{ width: 13, borderTop: `2px dashed ${palette.muted}` }} />
      <Typography variant="caption" sx={{ color: palette.muted }}>上期同期实收</Typography>
    </Stack>
  </Stack>
);

const RevenueTrend: React.FC<{ data: BusinessCockpitData['trend']; comparison: BusinessCockpitData['comparison']; currentStartDate: string }> = ({ data, comparison, currentStartDate }) => {
  const chartData = alignComparableTrend(data, comparison.trend, currentStartDate, comparison.startDate);
  return (
  <SectionPanel title="经营成交趋势" eyebrow="正式订单与售后挽回双轨" action={<TrendLegend />}>
    <Box sx={{ px: { xs: 0.5, sm: 1.5 }, pt: 2, pb: 1 }}>
      {chartData.length ? (
        <>
        <Box role="img" aria-label="经营成交趋势图：正式订单实收与售后挽回成交">
        <ResponsiveContainer width="100%" height={270}>
          <AreaChart accessibilityLayer data={chartData} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="formalReceiptGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={palette.blue} stopOpacity={0.18} />
                <stop offset="95%" stopColor={palette.blue} stopOpacity={0} />
              </linearGradient>
              <linearGradient id="recoveryAmountGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={palette.green} stopOpacity={0.16} />
                <stop offset="95%" stopColor={palette.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E8EDF3" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: palette.muted }} axisLine={false} tickLine={false} minTickGap={24} />
            <YAxis
              tick={{ fontSize: 11, fill: palette.muted }}
              tickFormatter={(value: number) => formatCompactCurrency(value)}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatCurrency(Number(value)), name]}
              labelFormatter={(label: string) => `日期：${label}`}
              contentStyle={{ borderRadius: 6, border: `1px solid ${palette.line}`, fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="formalReceiptAmount"
              name="正式订单实收"
              stroke={palette.blue}
              strokeWidth={2.5}
              fill="url(#formalReceiptGradient)"
              activeDot={{ r: 4 }}
            />
            <Area
              type="monotone"
              dataKey="previousFormalReceiptAmount"
              name="上期同期正式订单实收"
              stroke={palette.muted}
              strokeDasharray="5 4"
              strokeWidth={1.8}
              fill="transparent"
              activeDot={{ r: 3 }}
            />
            <Area
              type="monotone"
              dataKey="recoveryAmount"
              name="售后挽回成交"
              stroke={palette.green}
              strokeWidth={2.5}
              fill="url(#recoveryAmountGradient)"
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
        </Box>
        <Box
          component="p"
          sx={{ position: 'absolute', width: '1px', height: '1px', p: 0, m: '-1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }}
        >
          {`趋势数据：${data.map((point) => `${point.label}，正式订单实收 ${formatCurrency(point.formalReceiptAmount)}，售后挽回成交 ${formatCurrency(point.recoveryAmount)}`).join('；')}`}
        </Box>
        </>
      ) : (
        <Box sx={{ height: 270, display: 'grid', placeItems: 'center' }}>
          <Typography variant="body2" sx={{ color: palette.muted }}>当前统计周期暂无成交趋势</Typography>
        </Box>
      )}
    </Box>
  </SectionPanel>
  );
};

const identityLabel: Record<NonNullable<CockpitPerformanceRankingItem['identityStatus']>, string> = {
  resolved: '已匹配',
  legacy: '历史归属',
  unresolved: '归属待确认',
};

const PerformanceRanking: React.FC<{
  title: string;
  eyebrow: string;
  rows: CockpitPerformanceRankingItem[];
  accent: string;
  showAssist?: boolean;
}> = ({ title, eyebrow, rows, accent, showAssist = false }) => {
  const maxAmount = Math.max(...rows.map((item) => item.amount), 1);
  return (
    <SectionPanel title={title} eyebrow={eyebrow}>
      <Stack spacing={0} sx={{ px: 2, py: 1 }}>
        {rows.map((row, index) => {
          const identityStatus = row.identityStatus || 'resolved';
          const progress = row.amount > 0 ? Math.max(4, Math.round((row.amount / maxAmount) * 100)) : 0;
          return (
            <Box
              key={row.userId || `${title}-${row.name}-${index}`}
              sx={{
                py: 1.25,
                borderBottom: index < rows.length - 1 ? `1px solid ${palette.softLine}` : 0,
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
                <Stack direction="row" spacing={1.1} alignItems="center" sx={{ minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 26,
                      height: 26,
                      borderRadius: '50%',
                      bgcolor: index < 3 ? `${accent}14` : '#F1F5F9',
                      color: index < 3 ? accent : palette.muted,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 12,
                      fontWeight: 900,
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 900 }} noWrap>
                        {row.name}
                      </Typography>
                      {identityStatus !== 'resolved' && (
                        <Chip
                          size="small"
                          label={identityLabel[identityStatus]}
                          sx={{ height: 20, fontSize: 10, bgcolor: '#FFF7E8', color: palette.amber, fontWeight: 800 }}
                        />
                      )}
                    </Stack>
                    <Typography variant="caption" sx={{ color: palette.muted }}>
                      {row.department || '部门未标注'}
                    </Typography>
                  </Box>
                </Stack>
                <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                  <Typography variant="body2" sx={{ color: accent, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                    {formatCurrency(row.amount)}
                  </Typography>
                  <Typography variant="caption" sx={{ color: palette.muted }}>
                    {row.count} 单 · 均单 {formatCurrency(row.averageAmount)}
                    {showAssist && row.assistCount ? ` · 协助 ${row.assistCount} 单` : ''}
                  </Typography>
                </Box>
              </Stack>
              <LinearProgress
                aria-label={`${title}：${row.name}，${formatCurrency(row.amount)}`}
                variant="determinate"
                value={progress}
                sx={{
                  mt: 1,
                  height: 5,
                  borderRadius: 1,
                  bgcolor: '#EDF1F5',
                  '& .MuiLinearProgress-bar': { bgcolor: accent, borderRadius: 1 },
                }}
              />
            </Box>
          );
        })}
        {!rows.length && (
          <Box sx={{ minHeight: 210, display: 'grid', placeItems: 'center' }}>
            <Typography variant="body2" sx={{ color: palette.muted }}>当前统计周期暂无排行数据</Typography>
          </Box>
        )}
      </Stack>
    </SectionPanel>
  );
};

const HealthMetric: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: string;
}> = ({ label, value, tone = palette.ink }) => (
  <Box sx={{ border: `1px solid ${palette.softLine}`, borderRadius: 1, bgcolor: '#FAFCFE', p: 1.25 }}>
    <Typography variant="caption" sx={{ color: palette.muted }}>{label}</Typography>
    <Typography variant="h6" sx={{ color: tone, fontWeight: 900, mt: 0.2, fontVariantNumeric: 'tabular-nums' }}>
      {value}
    </Typography>
  </Box>
);

const CustomerHealthPanel: React.FC<{
  health: BusinessCockpitData['customerHealth'];
  sources: BusinessCockpitData['leadSources'];
  summary: BusinessCockpitData['summary'];
  finance: BusinessCockpitData['financeHealth'];
}> = ({ health, sources, summary, finance }) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canViewCustomers = canAccessCockpitPath(currentUser, ROUTES.CUSTOMERS);
  const followRate = normalizePercent(health.leadFollowRate);
  const followRateColor = followRate >= 80 ? palette.green : followRate >= 50 ? palette.amber : palette.red;
  return (
    <SectionPanel
      title="客户增长漏斗"
      eyebrow="期间转化 + 截至当前跟进"
      action={(
        <Stack direction="row" spacing={0.75} alignItems="center">
          <Chip size="small" label={`线索跟进率 ${followRate.toFixed(1)}%`} sx={{ bgcolor: `${followRateColor}12`, color: followRateColor, fontWeight: 900 }} />
          {canViewCustomers && (
            <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(ROUTES.CUSTOMERS)}>查看客户</Button>
          )}
        </Stack>
      )}
    >
      <Box sx={{ p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
          <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 800 }}>新增线索跟进完成度</Typography>
          <Typography variant="body2" sx={{ color: followRateColor, fontWeight: 900 }}>
            {health.followedLeadCount} / {health.newLeadCount}
          </Typography>
        </Stack>
        <LinearProgress
          aria-label={`新增线索跟进完成度 ${followRate.toFixed(1)}%`}
          variant="determinate"
          value={followRate}
          sx={{
            height: 8,
            borderRadius: 1,
            bgcolor: '#EAF0F6',
            '& .MuiLinearProgress-bar': { bgcolor: followRateColor, borderRadius: 1 },
          }}
        />
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' },
            gap: 1,
            mt: 2,
          }}
        >
          <HealthMetric label="新增线索" value={health.newLeadCount} tone={palette.blue} />
          <HealthMetric label="已跟进线索" value={health.followedLeadCount} tone={palette.teal} />
          <HealthMetric label="线索转客" value={health.newCustomerCount} tone={palette.green} />
          <HealthMetric label="成交订单" value={summary.formalOrderCount} tone={palette.blue} />
          <HealthMetric label="正式订单净实收" value={formatCompactCurrency(finance.formalNetReceiptAmount)} tone={palette.blue} />
        </Box>
        <Box sx={{ borderTop: `1px solid ${palette.softLine}`, mt: 2, pt: 1.5 }}>
          <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 900, mb: 1 }}>本期线索来源效果</Typography>
          {sources.length ? (
            <Stack spacing={1}>
              {sources.slice(0, 5).map((source) => (
                <Stack key={source.source} direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                  <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 700 }} noWrap>{source.source}</Typography>
                  <Typography variant="caption" sx={{ color: palette.muted, flexShrink: 0 }}>{source.leadCount} 条 · 转客 {source.convertedCustomerCount} · 实收 {formatCompactCurrency(source.receiptAmount)} · 跟进率 {source.followRate.toFixed(1)}%</Typography>
                </Stack>
              ))}
            </Stack>
          ) : <Typography variant="caption" sx={{ color: palette.muted }}>本期暂无新增线索来源数据</Typography>}
        </Box>
      </Box>
    </SectionPanel>
  );
};

const OrderFinanceHealthPanel: React.FC<{
  order: BusinessCockpitData['orderHealth'];
  finance: BusinessCockpitData['financeHealth'];
}> = ({ order, finance }) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const canViewFinance = canAccessCockpitPath(currentUser, ROUTES.FINANCE);
  return (
    <SectionPanel
      title="资金与订单健康"
      eyebrow="期间资金结果 + 截至当前风险"
      action={canViewFinance ? <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(ROUTES.FINANCE)}>查看财务</Button> : undefined}
    >
      <Stack spacing={1.5} sx={{ p: 2 }}>
      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
          <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 900 }}>订单风险 · 截至当前</Typography>
          <Typography variant="caption" sx={{ color: palette.muted }}>
            正式 {order.formalOrderCount} 笔 · 挽回 {order.recoveryOrderCount} 笔
          </Typography>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1 }}>
          <HealthMetric label="待审核" value={order.pendingReviewCount} tone={order.pendingReviewCount ? palette.amber : palette.green} />
          <HealthMetric label="退回修改" value={order.returnedApplicationCount} tone={order.returnedApplicationCount ? palette.red : palette.green} />
          <HealthMetric label="退款处理中" value={order.refundingOrderCount} tone={order.refundingOrderCount ? palette.amber : palette.green} />
          <HealthMetric label="已退款订单" value={order.refundedOrderCount} tone={order.refundedOrderCount ? palette.red : palette.muted} />
          <Box sx={{ gridColumn: 'span 2' }}>
            <HealthMetric label="本期退款金额" value={formatCurrency(order.refundAmount)} tone={order.refundAmount ? palette.red : palette.green} />
          </Box>
        </Box>
      </Box>

      <Box sx={{ borderTop: `1px solid ${palette.softLine}`, pt: 1.5 }}>
        <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 900, mb: 1 }}>财务概览</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
          <HealthMetric label="正式订单原实收" value={formatCurrency(finance.formalGrossReceiptAmount)} />
          <HealthMetric label="订单更正调整" value={formatCurrency(finance.formalAdjustmentAmount)} tone={finance.formalAdjustmentAmount < 0 ? palette.red : palette.teal} />
          <HealthMetric label="正式订单净实收" value={formatCurrency(finance.formalNetReceiptAmount)} tone={palette.blue} />
          <HealthMetric
            label="实付与流水差异"
            value={finance.reconciliationDetailsRestricted
              ? `${finance.reconciliationIssueCount} 笔 · 明细受限`
              : `${finance.reconciliationIssueCount} 笔 · ${formatCurrency(finance.reconciliationDifferenceAmount)}`}
            tone={finance.reconciliationIssueCount ? palette.red : palette.green}
          />
          <HealthMetric label="本期待处理提成" value={`${finance.pendingHandlingCommissionCount} 笔`} tone={finance.pendingHandlingCommissionCount ? palette.red : palette.green} />
          <HealthMetric label="待确认提成" value={formatCurrency(finance.pendingConfirmCommissionAmount)} tone={palette.teal} />
          <HealthMetric label="待发放提成" value={formatCurrency(finance.pendingPayCommissionAmount)} tone={palette.amber} />
          <HealthMetric label="已发放提成" value={formatCurrency(finance.paidCommissionAmount)} tone={palette.green} />
        </Box>
      </Box>
      </Stack>
    </SectionPanel>
  );
};

const RiskWorkbench: React.FC<{ risks: CockpitRiskItem[] }> = ({ risks }) => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const mainRisk = priorityRisk(risks);
  if (!mainRisk) {
    return (
      <SectionPanel title="老板今日重点" eyebrow="截至当前 · 待处理事项">
        <Box sx={{ minHeight: 230, display: 'grid', placeItems: 'center', p: 2 }}>
          <Stack spacing={1} alignItems="center">
            <CheckCircleOutlineIcon sx={{ color: palette.green, fontSize: 32 }} />
            <Typography variant="body2" sx={{ color: palette.green, fontWeight: 900 }}>当前暂无待处理风险</Typography>
          </Stack>
        </Box>
      </SectionPanel>
    );
  }

  const mainTone = toneColor[mainRisk.tone];
  const secondaryRisks = rankCockpitRisks(risks).filter((risk) => risk.id !== mainRisk.id).slice(0, 4);
  const canOpenMainRisk = canAccessCockpitPath(currentUser, mainRisk.path);
  return (
    <SectionPanel title="老板今日重点" eyebrow="截至当前 · 按经营影响排序">
      <Stack spacing={1} sx={{ p: 2 }}>
        <Box sx={{ border: `1px solid ${mainTone.border}`, bgcolor: mainTone.bg, borderRadius: 1, p: 1.5 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ color: mainTone.color, fontWeight: 900 }}>最高优先级</Typography>
              <Typography variant="subtitle1" sx={{ color: mainTone.color, fontWeight: 900 }} noWrap>{mainRisk.title}</Typography>
              <Typography variant="caption" sx={{ color: palette.muted }}>
                {mainRisk.description || `${mainRisk.count} 项等待处理`}
                {mainRisk.amount !== undefined ? ` · ${formatCurrency(mainRisk.amount)}` : ''}
              </Typography>
            </Box>
            <Button
              size="small"
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              disabled={!canOpenMainRisk}
              onClick={() => canOpenMainRisk && navigate(mainRisk.path)}
              sx={{ bgcolor: mainTone.color, flexShrink: 0, '&:hover': { bgcolor: mainTone.color } }}
            >
              {canOpenMainRisk ? '去处理' : '无目标页权限'}
            </Button>
          </Stack>
        </Box>
        {secondaryRisks.map((task) => {
          const tone = toneColor[task.tone];
          const canOpenTask = canAccessCockpitPath(currentUser, task.path);
          return (
            <Button
              key={task.id}
              variant="outlined"
              disabled={!canOpenTask}
              onClick={() => canOpenTask && navigate(task.path)}
              sx={{
                justifyContent: 'space-between',
                minHeight: 44,
                borderRadius: 1,
                color: palette.ink,
                borderColor: palette.line,
                px: 1.25,
              }}
              startIcon={task.count > 0 ? <WarningAmberIcon sx={{ color: tone.color }} /> : <CheckCircleOutlineIcon sx={{ color: palette.green }} />}
              endIcon={<ArrowForwardIcon sx={{ color: palette.muted }} />}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ width: '100%', minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 800 }} noWrap>{task.title}</Typography>
                <Typography variant="body2" sx={{ color: tone.color, fontWeight: 900, ml: 1 }}>
                  {task.count}{task.amount !== undefined ? ` / ${formatCompactCurrency(task.amount)}` : ''}
                </Typography>
              </Stack>
            </Button>
          );
        })}
      </Stack>
    </SectionPanel>
  );
};

const LegacyBusinessCockpit: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [range, setRange] = useState<DashboardDateRange>(() => resolveDashboardDateRange('month'));
  const [draftRange, setDraftRange] = useState<DashboardDateRange>(() => resolveDashboardDateRange('month'));
  const [data, setData] = useState<BusinessCockpitData | null>(null);
  const [organizationData, setOrganizationData] = useState<EnterpriseCockpit | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [cockpitTab, setCockpitTab] = useState<'command' | 'customers' | 'team' | 'overview' | 'organization'>('command');
  const latestRequestId = useRef(0);

  const fetchData = async (nextRange = range) => {
    const nextRangeError = validateCustomRange(nextRange);
    if (nextRangeError) {
      setRangeError(nextRangeError);
      return;
    }
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    setRangeError('');
    setLoading(true);
    setLoadError('');
    try {
      const res = await dashboardApi.fetchBusinessCockpit(nextRange);
      if (requestId !== latestRequestId.current) return;
      if (res.code === 0) {
        setData(res.data);
      } else {
        setLoadError(res.message || '驾驶舱数据加载失败');
      }
    } catch (error) {
      if (requestId !== latestRequestId.current) return;
      setLoadError(error instanceof Error ? error.message : '驾驶舱数据加载失败');
    } finally {
      if (requestId === latestRequestId.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    return () => {
      latestRequestId.current += 1;
    };
  }, []);

  const updatePreset = (_: React.MouseEvent<HTMLElement>, preset: DashboardRangePreset | null) => {
    if (!preset) return;
    setRangeError('');
    if (preset === 'custom') {
      setDraftRange((current) => ({ ...current, preset }));
      return;
    }
    const nextRange = resolveDashboardDateRange(preset);
    setDraftRange(nextRange);
    setRange(nextRange);
    fetchData(nextRange);
  };

  const applyCustomRange = () => {
    const nextRange = { ...draftRange, preset: 'custom' as const };
    const nextRangeError = validateCustomRange(nextRange);
    if (nextRangeError) {
      setRangeError(nextRangeError);
      return;
    }
    setDraftRange(nextRange);
    setRange(nextRange);
    fetchData(nextRange);
  };

  const riskTasks = useMemo(() => {
    if (!data) return [];
    const organizationRisks: CockpitRiskItem[] = organizationData ? [
      { id: 'delivery-overdue', title: '交付超期', count: organizationData.organization.delivery.overdueCount, path: ROUTES.DELIVERY, tone: 'error' },
      { id: 'delivery-blocked', title: '交付阻塞', count: organizationData.organization.delivery.blockedCount, path: ROUTES.DELIVERY, tone: 'warning' },
      { id: 'okr-risk', title: 'OKR风险目标', count: organizationData.organization.okr.riskObjectiveCount, path: ROUTES.OKR, tone: 'warning' },
    ] : [];
    return [...data.riskTasks, ...organizationRisks].filter((item) => item.count > 0 || Number(item.amount || 0) > 0);
  }, [data, organizationData]);
  const mainRisk = useMemo(() => priorityRisk(riskTasks), [riskTasks]);
  const canViewCockpitCustomers = canAccessCockpitPath(currentUser, ROUTES.CUSTOMERS);
  const canManageCockpitTasks = hasPermission(currentUser, PERMISSION_KEYS.TASK_TEAM)
    || hasPermission(currentUser, PERMISSION_KEYS.TASK_ASSIGN, 'write');

  if (loading && !data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (!data || loadError) {
    return (
      <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1480, mx: 'auto' }}>
        <Paper elevation={0} sx={{ border: `1px solid ${palette.line}`, borderRadius: 1, p: 4, textAlign: 'center' }}>
          <WarningAmberIcon sx={{ color: palette.amber, fontSize: 36 }} />
          <Typography variant="h6" sx={{ color: palette.ink, fontWeight: 900, mt: 1 }}>驾驶舱数据暂时无法加载</Typography>
          <Typography variant="body2" sx={{ color: palette.muted, mt: 0.5 }}>{loadError || '请稍后重试'}</Typography>
          <Button variant="contained" onClick={() => fetchData()} sx={{ mt: 2 }}>重新加载</Button>
        </Paper>
        <Box sx={{ mt: 2 }}><MarketingPublishPanel /></Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1480, mx: 'auto', bgcolor: palette.page, minHeight: '100%' }}>
      <Stack
        direction={{ xs: 'column', lg: 'row' }}
        spacing={2}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', lg: 'flex-start' }}
        sx={{ mb: 2 }}
      >
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <AccountTreeIcon sx={{ color: palette.blue }} />
            <Typography variant="h5" sx={{ fontWeight: 900, color: palette.ink, letterSpacing: 0 }}>
              老板驾驶舱
            </Typography>
            <Chip size="small" label={data.scopeLabel} sx={{ bgcolor: '#EEF4FF', color: palette.blue, fontWeight: 800 }} />
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
            <Typography variant="body2" sx={{ color: palette.muted }}>
              先看经营结果，再处理风险，最后检查组织执行
            </Typography>
            <Typography variant="caption" sx={{ color: palette.muted }}>· {formatUpdatedAt(String(data.updatedAt))}</Typography>
          </Stack>
        </Box>
        <Stack spacing={0.5} alignItems={{ xs: 'stretch', lg: 'flex-end' }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
            <ToggleButtonGroup value={draftRange.preset} exclusive size="small" onChange={updatePreset}>
              <ToggleButton value="today">今日</ToggleButton>
              <ToggleButton value="week">本周</ToggleButton>
              <ToggleButton value="month">本月</ToggleButton>
              <ToggleButton value="custom">自定义</ToggleButton>
            </ToggleButtonGroup>
            <TextField
              type="date"
              size="small"
              label="开始"
              value={draftRange.startDate || ''}
              error={Boolean(rangeError)}
              onChange={(event) => {
                setRangeError('');
                setDraftRange((prev) => ({ ...prev, preset: 'custom', startDate: event.target.value }));
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ bgcolor: '#fff' }}
            />
            <TextField
              type="date"
              size="small"
              label="结束"
              value={draftRange.endDate || ''}
              error={Boolean(rangeError)}
              onChange={(event) => {
                setRangeError('');
                setDraftRange((prev) => ({ ...prev, preset: 'custom', endDate: event.target.value }));
              }}
              InputLabelProps={{ shrink: true }}
              sx={{ bgcolor: '#fff' }}
            />
            <Button variant="contained" onClick={applyCustomRange} disabled={loading}>应用</Button>
          </Stack>
          {rangeError && (
            <Typography variant="caption" color="error" role="alert" aria-live="polite">
              {rangeError}
            </Typography>
          )}
        </Stack>
      </Stack>

      {loading && (
        <LinearProgress
          aria-label="经营数据更新中"
          sx={{ mb: 2, borderRadius: 1, bgcolor: '#DCE7F8' }}
        />
      )}

      <Paper elevation={0} sx={{ border: `1px solid ${palette.line}`, borderRadius: 1.5, mb: 2, overflow: 'hidden' }}>
        <Tabs value={cockpitTab} onChange={(_, value) => setCockpitTab(value)} variant="scrollable" scrollButtons="auto" sx={{ px: 1, minHeight: 50, '& .MuiTab-root': { minHeight: 50, fontWeight: 850 } }}>
          <Tab value="command" label="今日指挥" />
          <Tab value="customers" label={`客户作战 ${data.customerBattleStages.reduce((sum, item) => sum + item.customerCount, 0)}`} />
          <Tab value="team" label="销售团队" />
          <Tab value="overview" label="经营总览" />
          <Tab value="organization" label="组织执行" />
        </Tabs>
      </Paper>

      {cockpitTab === 'command' && (
        <Stack spacing={2}>
          <BossCommandCenter data={data} risks={riskTasks} organizationData={organizationData} canViewCustomers={canViewCockpitCustomers} canManageTasks={canManageCockpitTasks} canOpenPath={(path) => canAccessCockpitPath(currentUser, path)} />
          <EnterpriseBrainPanel dateFrom={range.startDate || monthStart()} dateTo={range.endDate || todayString()} refreshKey={`${data.rangeLabel}-${range.preset}`} onData={setOrganizationData} />
        </Stack>
      )}

      {cockpitTab === 'customers' && <CustomerBattleBoard data={data} canViewCustomers={canViewCockpitCustomers} />}

      {cockpitTab === 'team' && (
        <Stack spacing={2}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
            <PerformanceRanking title="销售业绩排行" eyebrow="期间正式订单实收" rows={data.salesRanking} accent={palette.blue} />
            <PerformanceRanking title="挽回业绩排行" eyebrow="期间售后挽回成交" rows={data.recoveryRanking} accent={palette.green} showAssist />
          </Box>
          <CustomerHealthPanel health={data.customerHealth} sources={data.leadSources} summary={data.summary} finance={data.financeHealth} />
        </Stack>
      )}

      {cockpitTab === 'overview' && (
        <Stack spacing={2}>
          <ExecutiveOverview data={data} mainRisk={mainRisk} range={range} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 2fr) minmax(320px, .9fr)' }, gap: 2 }}>
            <RevenueTrend data={data.trend} comparison={data.comparison} currentStartDate={range.startDate || todayString()} />
            <RiskWorkbench risks={riskTasks} />
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, .9fr) minmax(0, 1.1fr)' }, gap: 2 }}>
            <CustomerHealthPanel health={data.customerHealth} sources={data.leadSources} summary={data.summary} finance={data.financeHealth} />
            <OrderFinanceHealthPanel order={data.orderHealth} finance={data.financeHealth} />
          </Box>
          <MarketingPublishPanel />
        </Stack>
      )}

      {cockpitTab === 'organization' && (
        <Stack spacing={2}>
          <EnterpriseBrainPanel dateFrom={range.startDate || monthStart()} dateTo={range.endDate || todayString()} refreshKey={`${data.rangeLabel}-${range.preset}`} onData={setOrganizationData} />
          <MarketingPublishPanel />
        </Stack>
      )}

      <Stack direction="row" spacing={1} alignItems="center" sx={{ color: palette.muted, px: .5, mt: 2 }}>
        <TrendingUpIcon fontSize="small" />
        <Typography variant="caption">经营指挥链：异常识别 → 明确责任人 → 锁定客户或业务对象 → 下达动作 → 结果验收。</Typography>
      </Stack>
    </Box>
  );
};

const EnterpriseOnlyCockpit: React.FC = () => {
  const [dateFrom, setDateFrom] = useState(monthStart());
  const [dateTo, setDateTo] = useState(todayString());
  const [refreshKey, setRefreshKey] = useState('initial');
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1320, mx: 'auto', bgcolor: palette.page, minHeight: '100%' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2} sx={{ mb: 2 }}>
        <Box><Typography variant="h5" sx={{ fontWeight: 900 }}>老板驾驶舱</Typography><Typography variant="body2" color="text.secondary">查看销售体系标准、任务、复盘和经营结果</Typography></Box>
        <Stack direction="row" spacing={1}><TextField type="date" size="small" label="开始" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} InputLabelProps={{ shrink: true }} /><TextField type="date" size="small" label="结束" value={dateTo} onChange={(event) => setDateTo(event.target.value)} InputLabelProps={{ shrink: true }} /><Button variant="contained" onClick={() => setRefreshKey(`${dateFrom}-${dateTo}-${Date.now()}`)}>应用</Button></Stack>
      </Stack>
      <Box sx={{ mt: 2 }}><MarketingPublishPanel /></Box>
      <EnterpriseBrainPanel dateFrom={dateFrom} dateTo={dateTo} refreshKey={refreshKey} />
    </Box>
  );
};

const BusinessCockpit: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  return hasPermission(currentUser, PERMISSION_KEYS.DASHBOARD) ? <LegacyBusinessCockpit /> : <EnterpriseOnlyCockpit />;
};

export default BusinessCockpit;
