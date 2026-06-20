import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import SendIcon from '@mui/icons-material/Send';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../api';
import { ROUTES } from '../../shared/utils/constants';
import { formatDate } from '../../shared/utils/formatters';
import useAuthStore from '../../store/useAuthStore';
import type { HomeQuickAction, HomeTaskItem, HomeWorkbenchData } from '../../types/dashboard';

const toneColor: Record<HomeTaskItem['tone'], { color: string; bg: string }> = {
  primary: { color: '#1976D2', bg: '#E3F2FD' },
  warning: { color: '#F59E0B', bg: '#FFF7E6' },
  error: { color: '#D32F2F', bg: '#FFEBEE' },
  success: { color: '#2E7D32', bg: '#E8F5E9' },
  info: { color: '#00838F', bg: '#E0F7FA' },
};

const actionIcons: Record<HomeQuickAction['icon'], React.ReactElement> = {
  lead: <PersonAddIcon />,
  customer: <GroupAddIcon />,
  order: <ReceiptLongIcon />,
  review: <FactCheckIcon />,
  commission: <AccountBalanceWalletIcon />,
  refund: <AssignmentReturnIcon />,
  delivery: <LocalShippingIcon />,
  ai: <SmartToyIcon />,
};

const HomeWorkbench: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [data, setData] = useState<HomeWorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiQuery, setAiQuery] = useState('');

  const taskTotal = useMemo(() => data?.tasks.reduce((sum, item) => sum + item.count, 0) || 0, [data]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await dashboardApi.fetchHomeWorkbench();
      if (res.code === 0) setData(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const submitAiQuery = () => {
    if (!aiQuery.trim()) return;
    navigate(ROUTES.AI_ASSISTANT, { state: { query: aiQuery.trim() } });
    setAiQuery('');
  };

  if (loading || !data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, maxWidth: 1280, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} sx={{ mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 0.75 }}>
            {currentUser?.name || '你好'}，今天还有 {taskTotal} 项需要关注
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            {data.todayLabel} / {currentUser?.role || '系统用户'} / {data.scopeLabel}
          </Typography>
        </Box>
        <Paper elevation={0} sx={{ width: { xs: '100%', md: 420 }, border: '1px solid #dbeafe', borderRadius: 1, p: 0.5 }}>
          <Stack direction="row" alignItems="center">
            <SmartToyIcon sx={{ color: '#2196F3', mx: 1 }} fontSize="small" />
            <TextField
              value={aiQuery}
              onChange={(event) => setAiQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitAiQuery();
                }
              }}
              placeholder="问 AI：今天先处理哪些客户？"
              variant="standard"
              fullWidth
              sx={{ '& .MuiInput-underline:before, & .MuiInput-underline:after': { display: 'none' } }}
            />
            <Tooltip title="发送">
              <span>
                <IconButton size="small" disabled={!aiQuery.trim()} onClick={submitAiQuery}>
                  <SendIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </Paper>
      </Stack>

      <Grid container spacing={2} sx={{ mb: 3 }}>
        {data.personalMetrics.map((metric) => {
          const tone = toneColor[metric.tone];
          return (
            <Grid item xs={6} md={3} key={metric.label}>
              <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 2 }}>
                <Typography variant="body2" sx={{ color: '#64748b', mb: 1 }}>{metric.label}</Typography>
                <Typography variant="h5" sx={{ color: tone.color, fontWeight: 800 }}>{metric.value}</Typography>
              </Paper>
            </Grid>
          );
        })}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} lg={8}>
          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1.75, borderBottom: '1px solid #eef2f7' }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>我的待办</Typography>
                <Typography variant="caption" sx={{ color: '#64748b' }}>按当前账号可见范围聚合</Typography>
              </Box>
              <Button size="small" onClick={fetchData}>刷新</Button>
            </Stack>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 1.5, p: 2 }}>
              {data.tasks.map((task) => {
                const tone = toneColor[task.tone];
                return (
                  <Card
                    key={task.id}
                    elevation={0}
                    sx={{ border: '1px solid #eef2f7', borderRadius: 1, cursor: 'pointer', '&:hover': { borderColor: tone.color, bgcolor: '#fafcff' } }}
                    onClick={() => navigate(task.path)}
                  >
                    <CardContent sx={{ p: 1.75, '&:last-child': { pb: 1.75 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                        <Box>
                          <Typography variant="body2" sx={{ color: '#64748b', mb: 0.5 }}>{task.title}</Typography>
                          <Typography variant="caption" sx={{ color: '#94a3b8' }}>{task.description}</Typography>
                        </Box>
                        <Box sx={{ minWidth: 44, height: 32, px: 1, borderRadius: 1, bgcolor: tone.bg, color: tone.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                          {task.count}
                        </Box>
                      </Stack>
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} lg={4}>
          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 2, py: 1.75, borderBottom: '1px solid #eef2f7' }}>
              快捷入口
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1, p: 2 }}>
              {data.quickActions.map((action) => (
                <Button
                  key={action.id}
                  variant="outlined"
                  startIcon={actionIcons[action.icon]}
                  onClick={() => navigate(action.path)}
                  sx={{ justifyContent: 'flex-start', minHeight: 42, borderRadius: 1 }}
                >
                  {action.label}
                </Button>
              ))}
            </Box>
          </Paper>

          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, px: 2, py: 1.75, borderBottom: '1px solid #eef2f7' }}>
              最近动态
            </Typography>
            <Stack spacing={0} sx={{ maxHeight: 390, overflowY: 'auto' }}>
              {data.activities.map((activity) => (
                <Stack
                  key={activity.id}
                  direction="row"
                  alignItems="center"
                  spacing={1}
                  sx={{ px: 2, py: 1.25, borderBottom: '1px solid #f1f5f9', cursor: 'pointer', '&:hover': { bgcolor: '#f8fafc' } }}
                  onClick={() => navigate(activity.path)}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {activity.title}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      {activity.module} / {formatDate(activity.createdAt, 'MM-dd HH:mm')}
                    </Typography>
                  </Box>
                  <Tooltip title={activity.content}>
                    <ArrowForwardIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                  </Tooltip>
                </Stack>
              ))}
              {!data.activities.length && (
                <Typography variant="body2" sx={{ color: '#94a3b8', px: 2, py: 4, textAlign: 'center' }}>
                  暂无最近动态
                </Typography>
              )}
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default HomeWorkbench;
