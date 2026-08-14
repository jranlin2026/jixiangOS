import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Chip, CircularProgress, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { enterpriseBrainApi } from '../../api';
import type { EnterpriseCockpit } from '../../types/enterpriseBrain';

const Metric: React.FC<{ label: string; value: string; helper: string; progress?: number }> = ({ label, value, helper, progress }) => <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{ fontWeight: 900, mt: 0.5 }}>{value}</Typography>{progress !== undefined && <LinearProgress variant="determinate" value={Math.min(100, progress)} sx={{ my: 1, height: 6, borderRadius: 3 }} />}<Typography variant="caption" color="text.secondary">{helper}</Typography></Paper>;

const EnterpriseBrainPanel: React.FC<{ dateFrom: string; dateTo: string; refreshKey: string; onData?: (data: EnterpriseCockpit | null) => void }> = ({ dateFrom, dateTo, refreshKey, onData }) => {
  const [data, setData] = useState<EnterpriseCockpit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestRequestId = useRef(0);
  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    const requestId = latestRequestId.current + 1;
    latestRequestId.current = requestId;
    setLoading(true);
    setData(null);
    onData?.(null);
    setError('');
    enterpriseBrainApi.getCockpit({ dateFrom, dateTo })
      .then((response) => {
        if (requestId !== latestRequestId.current) return;
        if (response.code === 0) { setData(response.data); onData?.(response.data); }
        else setError(response.message || '组织执行数据加载失败');
      })
      .catch((reason) => {
        if (requestId !== latestRequestId.current) return;
        setError(reason instanceof Error ? reason.message : '组织执行数据加载失败');
      })
      .finally(() => { if (requestId === latestRequestId.current) setLoading(false); });
    return () => { if (requestId === latestRequestId.current) latestRequestId.current += 1; };
  }, [dateFrom, dateTo, refreshKey, onData]);
  if (loading) return <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Paper>;
  if (!data) return <Alert severity="info">{error || '企业AI大脑执行数据暂不可用'}</Alert>;
  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 1.5, bgcolor: '#FBFDFF', borderColor: '#D7E0EB' }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
      <Stack direction="row" spacing={1} alignItems="center"><PsychologyIcon color="primary" /><Box><Typography variant="h6" sx={{ fontWeight: 900 }}>组织执行</Typography><Typography variant="caption" color="text.secondary">{data.scope.rolloutLabel} · {data.scope.employeeCount} 名在职员工</Typography></Box></Stack>
      <Typography variant="caption" sx={{ color: 'text.secondary', alignSelf: { sm: 'center' } }}>任务与复盘：{data.range.dateFrom} 至 {data.range.dateTo}</Typography>
    </Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}><Metric label="岗位标准覆盖率 · 截至当前" value={`${data.execution.standardCoverageRate}%`} progress={data.execution.standardCoverageRate} helper={`${data.scope.employeeCount} 名在职员工`} /><Metric label="本期任务完成率" value={`${data.execution.taskCompletionRate}%`} progress={data.execution.taskCompletionRate} helper={`${data.execution.completedTaskCount}/${data.execution.taskCount} 项已完成`} /><Metric label="本期逾期任务" value={`${data.execution.overdueCount}`} helper="待负责人跟进" /><Metric label="本期复盘提交率" value={`${data.execution.reviewRate}%`} progress={data.execution.reviewRate} helper={`${data.execution.reviewCount} 份复盘`} /></Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mt: 1.5 }}>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5 }}>
        <Typography variant="caption" color="text.secondary">当前活动OKR · {data.organization.okr.activeCycleCount} 个周期</Typography>
        <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mt: 0.5 }}>
          <Typography variant="h5" sx={{ fontWeight: 900 }}>{data.organization.okr.averageProgress}%</Typography>
          <Typography variant="caption" color="text.secondary">平均进度</Typography>
        </Stack>
        <LinearProgress variant="determinate" value={Math.min(100, data.organization.okr.averageProgress)} sx={{ my: 1, height: 6, borderRadius: 3 }} />
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap"><Chip size="small" label={`${data.organization.okr.objectiveCount} 个目标`} /><Chip size="small" color={data.organization.okr.riskObjectiveCount ? 'warning' : 'default'} label={`${data.organization.okr.riskObjectiveCount} 个风险目标`} /><Chip size="small" color={data.organization.okr.objectivesWithoutKeyResults ? 'warning' : 'default'} label={`${data.organization.okr.objectivesWithoutKeyResults} 个目标未设KR`} /></Stack>
      </Paper>
      <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5 }}>
        <Typography variant="caption" color="text.secondary">交付健康 · 截至当前</Typography>
        <Typography variant="h5" sx={{ fontWeight: 900, mt: 0.5 }}>{data.organization.delivery.activeCount}</Typography>
        <Typography variant="caption" color="text.secondary">项正在交付</Typography>
        <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}><Chip size="small" color={data.organization.delivery.overdueCount ? 'error' : 'default'} label={`${data.organization.delivery.overdueCount} 项超期`} /><Chip size="small" color={data.organization.delivery.blockedCount ? 'warning' : 'default'} label={`${data.organization.delivery.blockedCount} 项阻塞`} /><Chip size="small" label={`${data.organization.delivery.completedCount} 项已完成`} /></Stack>
      </Paper>
    </Box>
    <Stack spacing={0.75} sx={{ mt: 2 }}>{data.insights.map((insight, index) => <Alert key={index} severity={index === 0 && data.execution.overdueCount ? 'warning' : 'info'}>{insight}</Alert>)}</Stack>
  </Paper>;
};

export default EnterpriseBrainPanel;
