import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  LinearProgress,
  Paper,
  Stack,
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
import { dashboardApi } from '../../api';
import { formatCurrency } from '../../shared/utils/formatters';
import type {
  BusinessCockpitData,
  CockpitFunnelItem,
  CockpitKpi,
  CockpitRankingItem,
  CockpitRiskItem,
  DashboardDateRange,
  DashboardRangePreset,
  HomeTaskItem,
} from '../../types/dashboard';

const palette = {
  page: '#F7F9FC',
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
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function kpiById(kpis: CockpitKpi[], id: string): CockpitKpi | undefined {
  return kpis.find((item) => item.id === id);
}

function priorityRisk(risks: CockpitRiskItem[]): CockpitRiskItem {
  return risks
    .slice()
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const toneRank = { error: 4, warning: 3, info: 2, primary: 1, success: 0 };
      return toneRank[b.tone] - toneRank[a.tone];
    })[0];
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
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{
        minHeight: 76,
        px: 2,
        py: 1.5,
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

const SignalStrip: React.FC<{ funnel: CockpitFunnelItem[] }> = ({ funnel }) => (
  <SectionPanel title="经营信号条" eyebrow="业务链路">
    <Box sx={{ p: 2 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: `repeat(${Math.max(funnel.length, 1)}, minmax(0, 1fr))` },
          gap: { xs: 1, md: 0 },
          border: `1px solid ${palette.line}`,
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        {funnel.map((item, index) => {
          const active = index === funnel.length - 2;
          const final = index === funnel.length - 1;
          return (
            <Box
              key={item.id}
              sx={{
                position: 'relative',
                p: 1.5,
                minHeight: 104,
                bgcolor: active ? '#F2F7FF' : final ? '#F8FBF9' : palette.surface,
                borderRight: { xs: 0, md: index < funnel.length - 1 ? `1px solid ${palette.line}` : 0 },
              }}
            >
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>
                  {String(index + 1).padStart(2, '0')}
                </Typography>
                {index < funnel.length - 1 && (
                  <ArrowForwardIcon sx={{ color: '#A5B4C4', fontSize: 18 }} />
                )}
              </Stack>
              <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 900, mb: 0.75 }}>
                {item.label}
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  color: active ? palette.blue : final ? palette.green : palette.ink,
                  fontWeight: 900,
                  fontVariantNumeric: 'tabular-nums',
                  lineHeight: 1,
                }}
              >
                {item.amount !== undefined ? formatCurrency(item.amount) : item.count}
              </Typography>
              <Typography variant="caption" sx={{ color: palette.muted }}>
                {item.amount !== undefined ? `${item.count} 笔入库` : `${item.count} 条记录`}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  </SectionPanel>
);

const ExecutiveSummary: React.FC<{
  data: BusinessCockpitData;
  mainRisk: CockpitRiskItem;
}> = ({ data, mainRisk }) => {
  const amount = kpiById(data.kpis, 'amount')?.value || '¥0';
  const lead = kpiById(data.kpis, 'lead')?.value || '0';
  const refund = kpiById(data.kpis, 'refund')?.value || '¥0';
  const riskTone = toneColor[mainRisk.tone];
  return (
    <Paper
      elevation={0}
      sx={{
        border: `1px solid ${palette.line}`,
        borderRadius: 1,
        bgcolor: palette.surface,
        p: { xs: 2, md: 2.5 },
      }}
    >
      <Grid container spacing={2} alignItems="stretch">
        <Grid item xs={12} lg={5}>
          <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>
            经营结论
          </Typography>
          <Typography variant="h5" sx={{ color: palette.ink, fontWeight: 900, mt: 0.75, letterSpacing: 0 }}>
            {data.rangeLabel}成交 {amount}，当前阻塞：{mainRisk.count} 项{mainRisk.title}
          </Typography>
          <Typography variant="body2" sx={{ color: palette.muted, mt: 1 }}>
            {data.scopeLabel} · 新增线索 {lead} · 退款金额 {refund}
          </Typography>
        </Grid>
        <Grid item xs={12} sm={4} lg={2.3}>
          <Box sx={{ height: '100%', borderLeft: { lg: `1px solid ${palette.softLine}` }, pl: { lg: 2 } }}>
            <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>成交金额</Typography>
            <Typography variant="h4" sx={{ color: palette.blue, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              {amount}
            </Typography>
            <Typography variant="caption" sx={{ color: palette.muted }}>{kpiById(data.kpis, 'amount')?.subValue}</Typography>
          </Box>
        </Grid>
        <Grid item xs={12} sm={4} lg={2.3}>
          <Box sx={{ height: '100%', borderLeft: { lg: `1px solid ${palette.softLine}` }, pl: { lg: 2 } }}>
            <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>客户沉淀</Typography>
            <Typography variant="h4" sx={{ color: palette.green, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
              {lead}
            </Typography>
            <Typography variant="caption" sx={{ color: palette.muted }}>{kpiById(data.kpis, 'lead')?.subValue}</Typography>
          </Box>
        </Grid>
        <Grid item xs={12} sm={4} lg={2.4}>
          <Box
            sx={{
              height: '100%',
              border: `1px solid ${riskTone.border}`,
              bgcolor: riskTone.bg,
              borderRadius: 1,
              p: 1.25,
            }}
          >
            <Stack direction="row" spacing={1} alignItems="center">
              <PriorityHighIcon sx={{ color: riskTone.color }} fontSize="small" />
              <Typography variant="caption" sx={{ color: riskTone.color, fontWeight: 900 }}>
                当前阻塞
              </Typography>
            </Stack>
            <Typography variant="h6" sx={{ color: riskTone.color, fontWeight: 900, mt: 0.5 }}>
              {mainRisk.title} {mainRisk.count}
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Paper>
  );
};

const FunnelTrack: React.FC<{ funnel: CockpitFunnelItem[] }> = ({ funnel }) => {
  const maxFunnelCount = Math.max(...funnel.map((item) => item.count), 1);
  return (
    <SectionPanel title="经营链路漏斗" eyebrow="转化轨道">
      <Stack spacing={1.25} sx={{ p: 2, flex: 1, justifyContent: 'space-between' }}>
        {funnel.map((item, index) => {
          const value = Math.max(4, Math.round((item.count / maxFunnelCount) * 100));
          return (
            <Box key={item.id}>
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.65 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Box
                    sx={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      bgcolor: index === 0 ? palette.blue : '#EEF2F6',
                      color: index === 0 ? '#fff' : palette.muted,
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 800 }}>{item.label}</Typography>
                </Stack>
                <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                  {item.count}{item.amount !== undefined ? ` / ${formatCurrency(item.amount)}` : ''}
                </Typography>
              </Stack>
              <LinearProgress
                variant="determinate"
                value={value}
                sx={{
                  height: 8,
                  borderRadius: 1,
                  bgcolor: '#EAF0F6',
                  '& .MuiLinearProgress-bar': { bgcolor: index >= funnel.length - 2 ? palette.green : palette.blue },
                }}
              />
            </Box>
          );
        })}
      </Stack>
    </SectionPanel>
  );
};

const RiskWorkbench: React.FC<{ risks: CockpitRiskItem[] }> = ({ risks }) => {
  const navigate = useNavigate();
  const mainRisk = priorityRisk(risks);
  const mainTone = toneColor[mainRisk.tone];
  return (
    <SectionPanel title="当前阻塞" eyebrow="下一步动作">
      <Stack spacing={1.25} sx={{ p: 2, flex: 1 }}>
        <Box
          sx={{
            border: `1px solid ${mainTone.border}`,
            bgcolor: mainTone.bg,
            borderRadius: 1,
            p: 1.5,
          }}
        >
          <Stack direction="row" justifyContent="space-between" spacing={1}>
            <Box>
              <Typography variant="caption" sx={{ color: mainTone.color, fontWeight: 900 }}>最高优先级</Typography>
              <Typography variant="h6" sx={{ color: mainTone.color, fontWeight: 900 }}>{mainRisk.title}</Typography>
              <Typography variant="body2" sx={{ color: palette.muted }}>{mainRisk.count} 项等待处理</Typography>
            </Box>
            <Button
              variant="contained"
              endIcon={<ArrowForwardIcon />}
              onClick={() => navigate(mainRisk.path)}
              sx={{ alignSelf: 'center', bgcolor: mainTone.color, '&:hover': { bgcolor: mainTone.color } }}
            >
              去处理
            </Button>
          </Stack>
        </Box>
        {risks.map((task) => {
          const tone = toneColor[task.tone];
          const isMain = task.id === mainRisk.id;
          return (
            <Button
              key={task.id}
              variant="outlined"
              onClick={() => navigate(task.path)}
              sx={{
                justifyContent: 'space-between',
                minHeight: 42,
                borderRadius: 1,
                color: isMain ? tone.color : palette.ink,
                borderColor: isMain ? tone.border : palette.line,
                bgcolor: isMain ? '#FFFCF8' : '#fff',
              }}
              startIcon={task.count > 0 ? <WarningAmberIcon /> : <CheckCircleOutlineIcon />}
              endIcon={<ArrowForwardIcon />}
            >
              <span>{task.title}</span>
              <strong>{task.count}</strong>
            </Button>
          );
        })}
      </Stack>
    </SectionPanel>
  );
};

const RankingBlock: React.FC<{ title: string; rows: CockpitRankingItem[]; amountLabel?: string }> = ({ title, rows, amountLabel = '金额' }) => {
  const maxAmount = Math.max(...rows.map((item) => item.amount), 1);
  return (
    <SectionPanel title={title}>
      <Stack spacing={1.2} sx={{ p: 2 }}>
        {rows.map((row, index) => (
          <Box key={`${title}-${row.name}`}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.65 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: palette.muted, width: 20, fontWeight: 900 }}>
                  {index + 1}
                </Typography>
                <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {row.name}
                </Typography>
              </Stack>
              <Typography variant="caption" sx={{ color: palette.muted, whiteSpace: 'nowrap' }}>
                {row.count} 单 / {amountLabel} {formatCurrency(row.amount)}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={Math.max(4, Math.round((row.amount / maxAmount) * 100))}
              sx={{
                height: 5,
                borderRadius: 1,
                bgcolor: '#EDF1F5',
                '& .MuiLinearProgress-bar': { bgcolor: index === 0 ? palette.blue : '#93A4B7' },
              }}
            />
          </Box>
        ))}
        {!rows.length && (
          <Typography variant="body2" sx={{ color: '#94a3b8', py: 4, textAlign: 'center' }}>
            暂无数据
          </Typography>
        )}
      </Stack>
    </SectionPanel>
  );
};

const BusinessCockpit: React.FC = () => {
  const [range, setRange] = useState<DashboardDateRange>({ preset: 'month', startDate: monthStart(), endDate: todayString() });
  const [data, setData] = useState<BusinessCockpitData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async (nextRange = range) => {
    setLoading(true);
    try {
      const res = await dashboardApi.fetchBusinessCockpit(nextRange);
      if (res.code === 0) setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const updatePreset = (_: React.MouseEvent<HTMLElement>, preset: DashboardRangePreset | null) => {
    if (!preset) return;
    const nextRange = { ...range, preset };
    setRange(nextRange);
    fetchData(nextRange);
  };

  const applyCustomRange = () => {
    fetchData({ ...range, preset: 'custom' });
  };

  const mainRisk = useMemo(() => (data ? priorityRisk(data.riskTasks) : null), [data]);

  if (loading || !data || !mainRisk) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, md: 3 }, maxWidth: 1320, mx: 'auto', bgcolor: palette.page, minHeight: '100%' }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'flex-start' }} sx={{ mb: 2 }}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
            <AccountTreeIcon sx={{ color: palette.blue }} />
            <Typography variant="h5" sx={{ fontWeight: 900, color: palette.ink, letterSpacing: 0 }}>
              经营驾驶舱
            </Typography>
            <Chip size="small" label={data.scopeLabel} sx={{ bgcolor: '#EEF4FF', color: palette.blue, fontWeight: 800 }} />
          </Stack>
          <Typography variant="body2" sx={{ color: palette.muted }}>
            用一条经营链路看清成交、转化和阻塞点
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          <ToggleButtonGroup value={range.preset} exclusive size="small" onChange={updatePreset}>
            <ToggleButton value="today">今日</ToggleButton>
            <ToggleButton value="week">本周</ToggleButton>
            <ToggleButton value="month">本月</ToggleButton>
            <ToggleButton value="custom">自定义</ToggleButton>
          </ToggleButtonGroup>
          <TextField
            type="date"
            size="small"
            label="开始"
            value={range.startDate || ''}
            onChange={(event) => setRange((prev) => ({ ...prev, preset: 'custom', startDate: event.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ bgcolor: '#fff' }}
          />
          <TextField
            type="date"
            size="small"
            label="结束"
            value={range.endDate || ''}
            onChange={(event) => setRange((prev) => ({ ...prev, preset: 'custom', endDate: event.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={{ bgcolor: '#fff' }}
          />
          <Button variant="contained" onClick={applyCustomRange}>应用</Button>
        </Stack>
      </Stack>

      <Stack spacing={2}>
        <ExecutiveSummary data={data} mainRisk={mainRisk} />
        <SignalStrip funnel={data.funnel} />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 2fr) minmax(320px, 1fr)' },
            gap: 2,
            alignItems: 'stretch',
          }}
        >
          <Box sx={{ display: 'flex', minWidth: 0 }}>
            <FunnelTrack funnel={data.funnel} />
          </Box>
          <Box sx={{ display: 'flex', minWidth: 0 }}>
            <RiskWorkbench risks={data.riskTasks} />
          </Box>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            gap: 2,
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <RankingBlock title="销售业绩排行" rows={data.salesRanking} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <RankingBlock title="线索来源转化" rows={data.sourceConversion} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <RankingBlock title="线索贡献排行" rows={data.contributorRanking} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <RankingBlock title="产品收入结构" rows={data.productRevenue} />
          </Box>
        </Box>

        <Divider sx={{ borderColor: palette.line }} />
        <Stack direction="row" spacing={1} alignItems="center" sx={{ color: palette.muted }}>
          <TrendingUpIcon fontSize="small" />
          <Typography variant="caption">
            线索入库 → 客户沉淀 → 订单申请 → 财务入库 → 分账确认，按业务顺序持续校准经营动作。
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
};

export default BusinessCockpit;
