import React, { useEffect, useState } from 'react';
import { Alert, Box, CircularProgress, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import PsychologyIcon from '@mui/icons-material/Psychology';
import { enterpriseBrainApi } from '../../api';
import type { EnterpriseCockpit } from '../../types/enterpriseBrain';
import { formatCurrency } from '../../shared/utils/formatters';

const Metric: React.FC<{ label: string; value: string; helper: string; progress?: number }> = ({ label, value, helper, progress }) => <Paper variant="outlined" sx={{ p: 2, borderRadius: 1.5 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{ fontWeight: 900, mt: 0.5 }}>{value}</Typography>{progress !== undefined && <LinearProgress variant="determinate" value={Math.min(100, progress)} sx={{ my: 1, height: 6, borderRadius: 3 }} />}<Typography variant="caption" color="text.secondary">{helper}</Typography></Paper>;

const EnterpriseBrainPanel: React.FC<{ dateFrom: string; dateTo: string; refreshKey: string }> = ({ dateFrom, dateTo, refreshKey }) => {
  const [data, setData] = useState<EnterpriseCockpit | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    setLoading(true); setError('');
    enterpriseBrainApi.getCockpit({ dateFrom, dateTo }).then((response) => { if (response.code === 0) setData(response.data); else setError(response.message); }).finally(() => setLoading(false));
  }, [dateFrom, dateTo, refreshKey]);
  if (loading) return <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}><CircularProgress size={28} /></Paper>;
  if (!data) return <Alert severity="info">{error || '企业AI大脑执行数据暂不可用'}</Alert>;
  return <Paper variant="outlined" sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 1.5, bgcolor: '#FBFDFF', borderColor: '#C7DAFF' }}>
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}><PsychologyIcon color="primary" /><Box><Typography variant="h6" sx={{ fontWeight: 900 }}>企业AI大脑执行看板</Typography><Typography variant="caption" color="text.secondary">{data.scope.rolloutLabel} · {data.scope.employeeCount} 名在职员工 · 标准 → 任务 → 复盘 → 经营结果</Typography></Box></Stack>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.5 }}><Metric label="岗位标准覆盖率" value={`${data.execution.standardCoverageRate}%`} progress={data.execution.standardCoverageRate} helper={`${data.scope.employeeCount} 名在职员工`} /><Metric label="任务完成率" value={`${data.execution.taskCompletionRate}%`} progress={data.execution.taskCompletionRate} helper={`${data.execution.completedTaskCount}/${data.execution.taskCount} 项已完成`} /><Metric label="逾期任务" value={`${data.execution.overdueCount}`} helper="待负责人跟进" /><Metric label="复盘提交率" value={`${data.execution.reviewRate}%`} progress={data.execution.reviewRate} helper={`${data.execution.reviewCount} 份复盘`} /></Box>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', lg: 'repeat(5, 1fr)' }, gap: 1, mt: 1.5 }}>{[['新增线索', data.business.leadCount], ['成交订单', data.business.orderCount], ['成交金额', formatCurrency(data.business.orderAmount)], ['升级客户', data.business.upgradeCount], ['退款数量', data.business.refundCount]].map(([label, value]) => <Box key={String(label)} sx={{ p: 1.5, bgcolor: '#fff', border: '1px solid #E5E7EB', borderRadius: 1 }}><Typography variant="caption" color="text.secondary">{label}</Typography><Typography variant="h6" sx={{ fontWeight: 900 }}>{value}</Typography></Box>)}</Box>
    <Stack spacing={0.75} sx={{ mt: 2 }}>{data.insights.map((insight, index) => <Alert key={index} severity={index === 0 && data.execution.overdueCount ? 'warning' : 'info'}>{insight}</Alert>)}</Stack>
  </Paper>;
};

export default EnterpriseBrainPanel;
