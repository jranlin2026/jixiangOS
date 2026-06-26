import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import BoltIcon from '@mui/icons-material/Bolt';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import GroupAddIcon from '@mui/icons-material/GroupAdd';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../api';
import { ROUTES } from '../../shared/utils/constants';
import { formatDate } from '../../shared/utils/formatters';
import useAuthStore from '../../store/useAuthStore';
import type { HomeQuickAction, HomeTaskItem, HomeWorkbenchData } from '../../types/dashboard';

const palette = {
  page: '#F6F8FB',
  surface: '#FFFFFF',
  ink: '#101828',
  muted: '#667085',
  line: '#DDE4EC',
  softLine: '#EEF2F6',
  blue: '#1E6BFF',
  cyan: '#087C8C',
  green: '#16845B',
  amber: '#B46A08',
  red: '#C4322B',
};

const toneColor: Record<HomeTaskItem['tone'], { color: string; bg: string; border: string; icon: React.ReactElement }> = {
  primary: { color: palette.blue, bg: '#EFF5FF', border: '#BDD4FF', icon: <TrendingUpIcon /> },
  warning: { color: palette.amber, bg: '#FFF7E8', border: '#EDCC8B', icon: <ScheduleIcon /> },
  error: { color: palette.red, bg: '#FFF1F0', border: '#F0B8B2', icon: <WarningAmberIcon /> },
  success: { color: palette.green, bg: '#EBF8F1', border: '#B8DDC7', icon: <CheckCircleOutlineIcon /> },
  info: { color: palette.cyan, bg: '#EAF8FA', border: '#B4DDE3', icon: <BoltIcon /> },
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

const actionGroups: Array<{ title: string; helper: string; ids: HomeQuickAction['id'][] }> = [
  { title: '获客', helper: '线索与客户', ids: ['lead', 'customer'] },
  { title: '成交', helper: '订单申请', ids: ['order', 'review'] },
  { title: '财务', helper: '分账与退款', ids: ['commission', 'refund'] },
  { title: '履约', helper: '交付与 AI', ids: ['delivery', 'ai'] },
];

const Panel: React.FC<{
  title: string;
  eyebrow?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, eyebrow, action, children }) => (
  <Paper
    elevation={0}
    sx={{
      border: `1px solid ${palette.line}`,
      borderRadius: 1,
      bgcolor: palette.surface,
      overflow: 'hidden',
      height: '100%',
    }}
  >
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{ minHeight: 68, px: 2, py: 1.25, borderBottom: `1px solid ${palette.softLine}` }}
    >
      <Box>
        {eyebrow && (
          <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>
            {eyebrow}
          </Typography>
        )}
        <Typography variant="subtitle1" sx={{ color: palette.ink, fontWeight: 900, letterSpacing: 0 }}>
          {title}
        </Typography>
      </Box>
      {action}
    </Stack>
    {children}
  </Paper>
);

const HomeWorkbench: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [data, setData] = useState<HomeWorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiQuery, setAiQuery] = useState('');

  const taskTotal = useMemo(() => data?.tasks.reduce((sum, item) => sum + item.count, 0) || 0, [data]);
  const activeTasks = useMemo(
    () => [...(data?.tasks || [])].sort((a, b) => b.count - a.count),
    [data],
  );
  const actionableTasks = activeTasks.filter((task) => task.count > 0);
  const watchTasks = activeTasks.filter((task) => task.count === 0);
  const mainTask = actionableTasks[0] || activeTasks[0];
  const maxTaskCount = Math.max(...actionableTasks.map((task) => task.count), 1);

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

  const mainTone = mainTask ? toneColor[mainTask.tone] : toneColor.primary;
  const actionById = new Map(data.quickActions.map((action) => [action.id, action]));
  const headline = taskTotal > 0
    ? `${currentUser?.name || '你好'}，先处理 ${mainTask?.title || '待办'}`
    : `${currentUser?.name || '你好'}，今天没有阻塞事项`;

  return (
    <Box
      sx={{
        p: { xs: 2, md: 3 },
        maxWidth: 1320,
        mx: 'auto',
        minHeight: '100%',
        bgcolor: palette.page,
        fontFamily: '"Inter", "Noto Sans SC", sans-serif',
      }}
    >
      <Stack spacing={2}>
        <Paper elevation={0} sx={{ border: `1px solid ${palette.line}`, borderRadius: 1, bgcolor: palette.surface, overflow: 'hidden' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.05fr) minmax(300px, 0.75fr) minmax(300px, 0.75fr)' },
              minHeight: 156,
            }}
          >
            <Box sx={{ p: { xs: 2, md: 2.25 }, borderRight: { lg: `1px solid ${palette.softLine}` } }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25, flexWrap: 'wrap', rowGap: 1 }}>
                <Chip size="small" label={data.todayLabel} sx={{ bgcolor: '#EEF4FF', color: palette.blue, fontWeight: 900 }} />
                <Chip size="small" label={data.scopeLabel} sx={{ bgcolor: '#F2F4F7', color: palette.ink, fontWeight: 800 }} />
                <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>
                  {currentUser?.role || '系统用户'}
                </Typography>
              </Stack>
              <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 900 }}>
                开工指挥条
              </Typography>
              <Typography variant="h5" sx={{ color: palette.ink, fontWeight: 900, mt: 0.75, mb: 0.75, lineHeight: 1.25, letterSpacing: 0 }}>
                {headline}
              </Typography>
              <Typography variant="body2" sx={{ color: palette.muted, maxWidth: 560 }}>
                先推进卡住流转的事项，再补齐获客、成交、财务和履约动作。
              </Typography>
            </Box>

            <Box sx={{ p: { xs: 2, md: 2.25 }, bgcolor: mainTone.bg, borderRight: { lg: `1px solid ${mainTone.border}` } }}>
              <Typography variant="caption" sx={{ color: mainTone.color, fontWeight: 900 }}>
                当前优先
              </Typography>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mt: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" sx={{ color: mainTone.color, fontWeight: 900 }}>
                    {mainTask?.title || '暂无待办'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: palette.muted, mt: 0.5 }}>
                    {mainTask?.description || '当前没有需要处理的事项'}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    minWidth: 68,
                    height: 68,
                    border: `1px solid ${mainTone.border}`,
                    borderRadius: 1,
                    bgcolor: '#fff',
                    color: mainTone.color,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 28,
                    fontWeight: 900,
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {mainTask?.count || 0}
                </Box>
              </Stack>
              <Button
                variant="contained"
                disabled={!mainTask}
                onClick={() => mainTask && navigate(mainTask.path)}
                sx={{ mt: 1.5, bgcolor: mainTone.color, '&:hover': { bgcolor: mainTone.color } }}
              >
                进入处理
              </Button>
            </Box>

            <Box sx={{ p: { xs: 2, md: 2.25 } }}>
              <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 900 }}>
                今日摘要
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, mt: 1 }}>
                {data.personalMetrics.slice(0, 4).map((metric) => {
                  const tone = toneColor[metric.tone];
                  return (
                    <Box key={metric.label} sx={{ border: `1px solid ${palette.softLine}`, borderRadius: 1, p: 1, bgcolor: '#FBFCFE' }}>
                      <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>
                        {metric.label}
                      </Typography>
                      <Typography variant="h6" sx={{ color: tone.color, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                        {metric.value}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          </Box>
        </Paper>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.55fr) minmax(360px, 0.85fr)' },
            gap: 2,
            alignItems: 'start',
          }}
        >
          <Panel
            title="现在处理"
            eyebrow={actionableTasks.length ? `${actionableTasks.length} 类事项需要推进` : '没有阻塞事项'}
            action={(
              <Tooltip title="刷新">
                <IconButton size="small" onClick={fetchData}>
                  <RefreshIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          >
            <Stack spacing={1.25} sx={{ p: 2 }}>
              {actionableTasks.map((task) => {
                const tone = toneColor[task.tone];
                const percent = Math.max(12, Math.round((task.count / maxTaskCount) * 100));
                return (
                  <Button
                    key={task.id}
                    onClick={() => navigate(task.path)}
                    sx={{
                      display: 'block',
                      textAlign: 'left',
                      p: 0,
                      color: palette.ink,
                      border: `1px solid ${tone.border}`,
                      borderRadius: 1,
                      bgcolor: '#fff',
                      '&:hover': { borderColor: tone.color, bgcolor: '#FCFDFF' },
                    }}
                  >
                    <Box sx={{ p: 1.5 }}>
                      <Stack direction="row" spacing={1.25} alignItems="center">
                        <Box
                          sx={{
                            width: 34,
                            height: 34,
                            borderRadius: 1,
                            bgcolor: tone.bg,
                            color: tone.color,
                            display: 'grid',
                            placeItems: 'center',
                            '& svg': { fontSize: 18 },
                          }}
                        >
                          {tone.icon}
                        </Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                            <Typography variant="body2" sx={{ fontWeight: 900, color: palette.ink }}>
                              {task.title}
                            </Typography>
                            <Typography variant="body2" sx={{ color: tone.color, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                              {task.count}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" sx={{ color: palette.muted }}>
                            {task.description}
                          </Typography>
                          <LinearProgress
                            variant="determinate"
                            value={percent}
                            sx={{
                              height: 5,
                              borderRadius: 1,
                              mt: 1,
                              bgcolor: '#EDF1F5',
                              '& .MuiLinearProgress-bar': { bgcolor: tone.color },
                            }}
                          />
                        </Box>
                      </Stack>
                    </Box>
                  </Button>
                );
              })}

              {!actionableTasks.length && (
                <Box sx={{ p: 3, textAlign: 'center', color: palette.muted }}>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>今天没有需要立即处理的事项</Typography>
                </Box>
              )}

              {!!watchTasks.length && (
                <Box sx={{ borderTop: `1px solid ${palette.softLine}`, pt: 1.5, mt: 0.5 }}>
                  <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 900 }}>
                    保持观察
                  </Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1, mt: 1 }}>
                    {watchTasks.map((task) => {
                      const tone = toneColor[task.tone];
                      return (
                        <Button
                          key={task.id}
                          variant="outlined"
                          onClick={() => navigate(task.path)}
                          sx={{
                            justifyContent: 'space-between',
                            minHeight: 40,
                            color: palette.muted,
                            borderColor: palette.softLine,
                            bgcolor: '#FAFBFC',
                          }}
                          startIcon={React.cloneElement(tone.icon, { fontSize: 'small' })}
                        >
                          <span>{task.title}</span>
                          <strong>0</strong>
                        </Button>
                      );
                    })}
                  </Box>
                </Box>
              )}
            </Stack>
          </Panel>

          <Stack spacing={2}>
            <Paper elevation={0} sx={{ border: `1px solid #BDD4FF`, borderRadius: 1, bgcolor: '#F5F8FF', p: 1 }}>
              <Typography variant="caption" sx={{ color: palette.blue, fontWeight: 900, px: 1 }}>
                AI 调度助手
              </Typography>
              <Stack direction="row" alignItems="center" sx={{ mt: 0.75, bgcolor: '#fff', border: `1px solid ${palette.line}`, borderRadius: 1, px: 1 }}>
                <SmartToyIcon sx={{ color: palette.blue, mr: 1 }} fontSize="small" />
                <TextField
                  value={aiQuery}
                  onChange={(event) => setAiQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      submitAiQuery();
                    }
                  }}
                  placeholder="问 AI：今天怎么排优先级？"
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

            <Panel title="动作台" eyebrow="按业务动作分组">
              <Stack spacing={1.25} sx={{ p: 2 }}>
                {actionGroups.map((group) => {
                  const actions = group.ids.map((id) => actionById.get(id)).filter(Boolean) as HomeQuickAction[];
                  if (!actions.length) return null;
                  return (
                    <Box key={group.title}>
                      <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 0.75 }}>
                        <Typography variant="body2" sx={{ color: palette.ink, fontWeight: 900 }}>
                          {group.title}
                        </Typography>
                        <Typography variant="caption" sx={{ color: palette.muted }}>
                          {group.helper}
                        </Typography>
                      </Stack>
                      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
                        {actions.map((action) => (
                          <Button
                            key={action.id}
                            variant="outlined"
                            startIcon={actionIcons[action.icon]}
                            onClick={() => navigate(action.path)}
                            sx={{
                              justifyContent: 'flex-start',
                              minHeight: 42,
                              borderRadius: 1,
                              color: palette.ink,
                              borderColor: palette.line,
                              bgcolor: '#fff',
                            }}
                          >
                            {action.label}
                          </Button>
                        ))}
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            </Panel>
          </Stack>
        </Box>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.45fr) minmax(320px, 0.75fr)' },
            gap: 2,
            alignItems: 'stretch',
          }}
        >
          <Panel title="最近流转时间线" eyebrow="刚发生的动作">
            <Stack spacing={0} sx={{ maxHeight: 360, overflowY: 'auto' }}>
              {data.activities.map((activity, index) => (
                <Button
                  key={activity.id}
                  onClick={() => navigate(activity.path)}
                  sx={{
                    display: 'block',
                    textAlign: 'left',
                    borderRadius: 0,
                    px: 2,
                    py: 1.2,
                    borderBottom: `1px solid ${palette.softLine}`,
                    color: palette.ink,
                    '&:hover': { bgcolor: '#F8FAFC' },
                  }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="stretch">
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.65, flexShrink: 0 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: palette.blue }} />
                      {index < data.activities.length - 1 && (
                        <Box sx={{ width: 1, flex: 1, minHeight: 36, bgcolor: palette.softLine, mt: 0.5 }} />
                      )}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                        <Chip size="small" label={activity.module} sx={{ height: 22, fontWeight: 800 }} />
                        <Typography variant="caption" sx={{ color: palette.muted, whiteSpace: 'nowrap' }}>
                          {formatDate(activity.createdAt, 'MM-dd HH:mm')}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 900, mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {activity.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: palette.muted }}>
                        {activity.content}
                      </Typography>
                    </Box>
                  </Stack>
                </Button>
              ))}
              {!data.activities.length && (
                <Typography variant="body2" sx={{ color: '#94a3b8', px: 2, py: 4, textAlign: 'center' }}>
                  暂无最近动态
                </Typography>
              )}
            </Stack>
          </Panel>

          <Panel title="范围指标" eyebrow={data.scopeLabel}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25, p: 2 }}>
              {data.personalMetrics.map((metric) => {
                const tone = toneColor[metric.tone];
                return (
                  <Box
                    key={metric.label}
                    sx={{
                      border: `1px solid ${palette.softLine}`,
                      borderRadius: 1,
                      p: 1.25,
                      bgcolor: '#FBFCFE',
                      minHeight: 86,
                    }}
                  >
                    <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>
                      {metric.label}
                    </Typography>
                    <Typography variant="h4" sx={{ color: tone.color, fontWeight: 900, fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>
                      {metric.value}
                    </Typography>
                  </Box>
                );
              })}
            </Box>
          </Panel>
        </Box>
      </Stack>
    </Box>
  );
};

export default HomeWorkbench;
