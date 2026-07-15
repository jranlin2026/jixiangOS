import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import BoltIcon from '@mui/icons-material/Bolt';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ScheduleIcon from '@mui/icons-material/Schedule';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useNavigate } from 'react-router-dom';
import { customerTodoApi, dashboardApi } from '../../api';
import { ROUTES } from '../../shared/utils/constants';
import { formatDate } from '../../shared/utils/formatters';
import useAuthStore from '../../store/useAuthStore';
import type { HomeTaskItem, HomeWorkbenchData } from '../../types/dashboard';

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
  const [completingTodoId, setCompletingTodoId] = useState('');
  const [todoError, setTodoError] = useState('');

  const taskTotal = useMemo(() => data?.tasks.reduce((sum, item) => sum + item.count, 0) || 0, [data]);
  const activeTasks = useMemo(
    () => [...(data?.tasks || [])].sort((a, b) => b.count - a.count),
    [data],
  );
  const actionableTasks = activeTasks.filter((task) => task.count > 0);
  const mainTask = actionableTasks[0] || activeTasks[0];

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

  const completeCustomerTodo = async (customerId: string, todoId: string) => {
    setCompletingTodoId(todoId);
    setTodoError('');
    try {
      const response = await customerTodoApi.complete(customerId, todoId);
      if (response.code === 0) await fetchData();
      else setTodoError(response.message || '待办完成失败');
    } catch {
      setTodoError('待办完成失败，请稍后重试');
    } finally {
      setCompletingTodoId('');
    }
  };

  if (loading || !data) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  const mainTone = mainTask ? toneColor[mainTask.tone] : toneColor.primary;
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

        <Panel title="我的客户待办" eyebrow={`未完成 ${data.customerTodos.length} 项`}>
          {todoError && <Alert severity="error" sx={{ m: 1.25 }}>{todoError}</Alert>}
          <Stack divider={<Box sx={{ borderBottom: `1px solid ${palette.softLine}` }} />} sx={{ maxHeight: 380, overflowY: 'auto' }}>
            {data.customerTodos.slice(0, 10).map((todo) => {
              const overdue = new Date(todo.dueAt).getTime() < Date.now();
              const detailPath = `${ROUTES.CUSTOMERS}?customerId=${encodeURIComponent(todo.customerId)}&detailTab=todo`;
              return (
                <Stack key={todo.id} direction="row" alignItems="center" spacing={1} sx={{ px: 1.25, py: 0.75 }}>
                  <Checkbox
                    size="small"
                    disabled={completingTodoId === todo.id}
                    onChange={() => void completeCustomerTodo(todo.customerId, todo.id)}
                    inputProps={{ 'aria-label': `完成待办：${todo.title}` }}
                  />
                  <Button
                    onClick={() => navigate(detailPath)}
                    sx={{ flex: 1, minWidth: 0, display: 'block', textAlign: 'left', color: palette.ink, px: 0.5, py: 0.75 }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {todo.title}
                      </Typography>
                      {overdue && <Chip size="small" color="error" label="已逾期" sx={{ height: 22 }} />}
                    </Stack>
                    <Typography variant="caption" sx={{ color: palette.muted }}>
                      {todo.customerName} · {formatDate(todo.dueAt, 'MM-dd HH:mm')}
                    </Typography>
                    {todo.content && (
                      <Typography variant="caption" sx={{ color: '#475467', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {todo.content}
                      </Typography>
                    )}
                  </Button>
                </Stack>
              );
            })}
            {!data.customerTodos.length && (
              <Typography variant="body2" sx={{ color: '#94a3b8', px: 2, py: 4, textAlign: 'center' }}>
                当前没有分配给你的客户待办
              </Typography>
            )}
          </Stack>
          {data.customerTodos.length > 10 && (
            <Box sx={{ px: 2, py: 1, borderTop: `1px solid ${palette.softLine}` }}>
              <Typography variant="caption" sx={{ color: palette.muted }}>首页显示前 10 项，其余待办请进入客户详情查看。</Typography>
            </Box>
          )}
        </Panel>

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
