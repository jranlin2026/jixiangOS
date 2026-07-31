import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { useNavigate } from 'react-router-dom';
import { enterpriseBrainApi } from '../../api';
import type { PositionStandardDetail } from '../../types/enterpriseBrain';
import { ROUTES } from '../../shared/utils/constants';
import { moduleTokens } from '../../shared/components/ModuleShell';

const StandardSection: React.FC<{ title: string; items: string[] }> = ({ title, items }) => (
  <Paper variant="outlined" sx={{ p: 2, borderColor: moduleTokens.line, borderRadius: 1.5 }}>
    <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>{title}</Typography>
    {items.length ? <Stack spacing={0.75}>{items.map((item, index) => (
      <Box key={`${title}-${index}`} sx={{ display: 'flex', gap: 1 }}>
        <Typography color="primary" sx={{ fontWeight: 900 }}>{index + 1}.</Typography>
        <Typography variant="body2" sx={{ lineHeight: 1.7 }}>{item}</Typography>
      </Box>
    ))}</Stack> : <Typography variant="body2" color="text.secondary">暂未配置</Typography>}
  </Paper>
);

const MyStandard: React.FC = () => {
  const navigate = useNavigate();
  const [standard, setStandard] = useState<PositionStandardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    enterpriseBrainApi.getMyStandard().then((response) => {
      if (response.code === 0) setStandard(response.data);
      else setError(response.message || '当前岗位尚未发布标准');
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress /></Box>;
  if (!standard) return <Alert severity="info">{error}。请联系负责人在“标准管理”中创建并发布。</Alert>;
  const version = standard.version;
  return <Stack spacing={2}>
    <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, borderColor: '#C7DAFF', bgcolor: '#F8FBFF', borderRadius: 1.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
        <Box>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Typography variant="h6" sx={{ fontWeight: 900 }}>{standard.title}</Typography>
            <Chip size="small" color="success" label={`当前生效 V${version.versionNumber}`} />
            <Chip size="small" variant="outlined" label={standard.positionName} />
          </Stack>
          <Typography variant="body1" sx={{ mt: 1.5, lineHeight: 1.8 }}>{version.mission}</Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Button variant="contained" startIcon={<TaskAltIcon />} onClick={() => navigate(ROUTES.TASKS)}>去执行任务</Button>
          <Button variant="outlined" startIcon={<SmartToyIcon />} onClick={() => navigate(ROUTES.AI_ASSISTANT)}>问AI助手</Button>
        </Stack>
      </Stack>
    </Paper>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
      <StandardSection title="岗位目标" items={version.goals} />
      <StandardSection title="关键指标" items={version.kpis} />
      <StandardSection title="每日动作" items={version.dailyActions} />
      <StandardSection title="工作流程" items={version.workflow} />
      <StandardSection title="标准话术" items={version.speechTemplates} />
      <StandardSection title="常见问题" items={version.faq} />
    </Box>
    <Paper variant="outlined" sx={{ p: 2, borderColor: moduleTokens.line, borderRadius: 1.5 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>关联知识依据</Typography>
      <Stack direction="row" gap={1} flexWrap="wrap">
        {standard.resources.length ? standard.resources.map((item) => <Chip key={item.knowledgeVersionId} label={item.title} variant="outlined" />) : <Typography variant="body2" color="text.secondary">当前标准未关联知识文档</Typography>}
      </Stack>
    </Paper>
  </Stack>;
};

export default MyStandard;
