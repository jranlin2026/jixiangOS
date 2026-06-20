import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Grid,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../api';
import { formatCurrency } from '../../shared/utils/formatters';
import type {
  BusinessCockpitData,
  CockpitRankingItem,
  DashboardDateRange,
  DashboardRangePreset,
  HomeTaskItem,
} from '../../types/dashboard';

const toneColor: Record<HomeTaskItem['tone'], { color: string; bg: string }> = {
  primary: { color: '#1976D2', bg: '#E3F2FD' },
  warning: { color: '#F59E0B', bg: '#FFF7E6' },
  error: { color: '#D32F2F', bg: '#FFEBEE' },
  success: { color: '#2E7D32', bg: '#E8F5E9' },
  info: { color: '#00838F', bg: '#E0F7FA' },
};

function monthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

const RankingBlock: React.FC<{ title: string; rows: CockpitRankingItem[]; amountLabel?: string }> = ({ title, rows, amountLabel = '金额' }) => {
  const maxAmount = Math.max(...rows.map((item) => item.amount), 1);
  return (
    <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, height: '100%' }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 2, py: 1.75, borderBottom: '1px solid #eef2f7' }}>
        {title}
      </Typography>
      <Stack spacing={1.25} sx={{ p: 2 }}>
        {rows.map((row, index) => (
          <Box key={`${title}-${row.name}`}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {index + 1}. {row.name}
              </Typography>
              <Typography variant="caption" sx={{ color: '#64748b' }}>
                {row.count} 单 / {amountLabel} {formatCurrency(row.amount)}
              </Typography>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={Math.max(4, Math.round((row.amount / maxAmount) * 100))}
              sx={{ height: 6, borderRadius: 1, bgcolor: '#eef2f7' }}
            />
          </Box>
        ))}
        {!rows.length && (
          <Typography variant="body2" sx={{ color: '#94a3b8', py: 4, textAlign: 'center' }}>
            暂无数据
          </Typography>
        )}
      </Stack>
    </Paper>
  );
};

const BusinessCockpit: React.FC = () => {
  const navigate = useNavigate();
  const [range, setRange] = useState<DashboardDateRange>({ preset: 'month', startDate: monthStart(), endDate: todayString() });
  const [data, setData] = useState<BusinessCockpitData | null>(null);
  const [loading, setLoading] = useState(true);

  const maxFunnelCount = useMemo(() => Math.max(...(data?.funnel.map((item) => item.count) || [1]), 1), [data]);

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

  if (loading || !data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1320, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.75 }}>
            经营驾驶舱
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            {data.rangeLabel} / {data.scopeLabel}
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
          />
          <TextField
            type="date"
            size="small"
            label="结束"
            value={range.endDate || ''}
            onChange={(event) => setRange((prev) => ({ ...prev, preset: 'custom', endDate: event.target.value }))}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" onClick={applyCustomRange}>应用</Button>
        </Stack>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {data.kpis.map((kpi) => {
          const tone = toneColor[kpi.tone];
          return (
            <Grid item xs={12} sm={6} lg={2.4} key={kpi.id}>
              <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 2, height: '100%' }}>
                <Typography variant="body2" sx={{ color: '#64748b', mb: 1 }}>{kpi.label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 800, color: tone.color, mb: 0.5 }}>{kpi.value}</Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>{kpi.subValue}</Typography>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} lg={8}>
          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 2, py: 1.75, borderBottom: '1px solid #eef2f7' }}>
              经营链路漏斗
            </Typography>
            <Stack spacing={1.5} sx={{ p: 2 }}>
              {data.funnel.map((item) => (
                <Stack key={item.id} direction="row" spacing={2} alignItems="center">
                  <Typography variant="body2" sx={{ width: 90, color: '#334155', fontWeight: 700 }}>{item.label}</Typography>
                  <Box sx={{ flex: 1 }}>
                    <LinearProgress
                      variant="determinate"
                      value={Math.max(4, Math.round((item.count / maxFunnelCount) * 100))}
                      sx={{ height: 12, borderRadius: 1, bgcolor: '#eef2f7' }}
                    />
                  </Box>
                  <Typography variant="body2" sx={{ width: 140, textAlign: 'right', fontWeight: 700 }}>
                    {item.count} {item.amount !== undefined ? `/ ${formatCurrency(item.amount)}` : ''}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Grid>
        <Grid item xs={12} lg={4}>
          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, height: '100%' }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 2, py: 1.75, borderBottom: '1px solid #eef2f7' }}>
              风险任务
            </Typography>
            <Stack spacing={1} sx={{ p: 2 }}>
              {data.riskTasks.map((task) => {
                const tone = toneColor[task.tone];
                return (
                  <Button
                    key={task.id}
                    variant="outlined"
                    onClick={() => navigate(task.path)}
                    sx={{ justifyContent: 'space-between', borderRadius: 1, color: tone.color, borderColor: `${tone.color}55`, bgcolor: task.count ? tone.bg : '#fff' }}
                    startIcon={<WarningAmberIcon />}
                    endIcon={<ArrowForwardIcon />}
                  >
                    <span>{task.title}</span>
                    <strong>{task.count}</strong>
                  </Button>
                );
              })}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <RankingBlock title="销售业绩排行" rows={data.salesRanking} />
        </Grid>
        <Grid item xs={12} md={6}>
          <RankingBlock title="线索贡献排行" rows={data.contributorRanking} />
        </Grid>
        <Grid item xs={12} md={6}>
          <RankingBlock title="线索来源转化" rows={data.sourceConversion} />
        </Grid>
        <Grid item xs={12} md={6}>
          <RankingBlock title="产品收入结构" rows={data.productRevenue} />
        </Grid>
      </Grid>
    </Box>
  );
};

export default BusinessCockpit;
