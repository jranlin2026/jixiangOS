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
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import GroupAddOutlinedIcon from '@mui/icons-material/GroupAddOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ReplayCircleFilledOutlinedIcon from '@mui/icons-material/ReplayCircleFilledOutlined';
import { useNavigate } from 'react-router-dom';
import { customerTodoApi, dashboardApi, enterpriseBrainApi } from '../../api';
import { ROUTES } from '../../shared/utils/constants';
import { formatDate } from '../../shared/utils/formatters';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { summarizeWorkbenchTasks } from '../../shared/utils/workbenchTasks';
import useAuthStore from '../../store/useAuthStore';
import type { HomeTaskItem, HomeWorkbenchData } from '../../types/dashboard';
import type { EmployeeTask } from '../../types/enterpriseBrain';

const palette = {
  page: '#F8F7FC',
  surface: '#FFFFFF',
  ink: '#19152D',
  muted: '#706B86',
  line: '#E8E4F1',
  softLine: '#EEEAF5',
  violet: '#7447F5',
  cyan: '#087C8C',
  green: '#16845B',
  amber: '#B46A08',
  red: '#C4322B',
};

const toneColor: Record<HomeTaskItem['tone'], { color: string; bg: string; border: string; icon: React.ReactElement }> = {
  primary: { color: palette.violet, bg: '#F2EDFF', border: '#D8CAFF', icon: <TrendingUpIcon /> },
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
      borderRadius: 2,
      bgcolor: palette.surface,
      overflow: 'hidden',
      height: '100%',
      boxShadow: '0 10px 36px rgba(73, 50, 120, 0.04)',
    }}
  >
    <Stack
      direction="row"
      justifyContent="space-between"
      alignItems="center"
      sx={{ minHeight: 58, px: 2, py: 1.25, borderBottom: `1px solid ${palette.softLine}` }}
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

type TaskListLoader = typeof enterpriseBrainApi.listMyTasks;

const loadAllWorkbenchTasks = async (loader: TaskListLoader, date: string) => {
  const pageSize = 100;
  const first = await loader({ date, page: 1, pageSize });
  if (first.code !== 0) throw new Error(first.message || '任务加载失败');
  const pageCount = Math.ceil(first.data.total / pageSize);
  if (pageCount <= 1) return first.data.items;
  const remaining = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => loader({ date, page: index + 2, pageSize })),
  );
  const failed = remaining.find((response) => response.code !== 0);
  if (failed) throw new Error(failed.message || '任务加载失败');
  return [first, ...remaining].flatMap((response) => response.data.items);
};

const HomeWorkbench: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [data, setData] = useState<HomeWorkbenchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [completingTodoId, setCompletingTodoId] = useState('');
  const [todoError, setTodoError] = useState('');
  const [employeeTasks, setEmployeeTasks] = useState<EmployeeTask[]>([]);
  const [teamTasks, setTeamTasks] = useState<EmployeeTask[]>([]);
  const [employeeTasksLoading, setEmployeeTasksLoading] = useState(false);
  const [employeeTasksError, setEmployeeTasksError] = useState('');
  const [teamTasksError, setTeamTasksError] = useState('');

  const canViewOwnTasks = hasPermission(currentUser, PERMISSION_KEYS.TASK_SELF);
  const canViewTeamTasks = hasPermission(currentUser, PERMISSION_KEYS.TASK_TEAM);
  const employeeTaskSummary = useMemo(() => summarizeWorkbenchTasks(employeeTasks), [employeeTasks]);
  const teamTaskSummary = useMemo(() => summarizeWorkbenchTasks(teamTasks), [teamTasks]);
  const teamAbnormalTasks = useMemo(() => teamTasks
    .map((task, index) => ({ task, page: Math.floor(index / 10) + 1 }))
    .filter(({ task }) => task.status === 'RETURNED' || (task.status === 'PENDING' && Boolean(task.dueAt) && new Date(task.dueAt || '').getTime() < Date.now()))
    .slice(0, 5), [teamTasks]);
  const workDate = useMemo(
    () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' }),
    [],
  );

  const dashboardTaskTotal = useMemo(() => data?.tasks.reduce((sum, item) => sum + item.count, 0) || 0, [data]);
  const activeTasks = useMemo(
    () => [...(data?.tasks || [])].sort((a, b) => b.count - a.count),
    [data],
  );
  const actionableTasks = activeTasks.filter((task) => task.count > 0);
  const mainTask = actionableTasks[0] || activeTasks[0];
  const actionableEmployeeTasks = useMemo(() => employeeTasks.filter((task) => task.status === 'PENDING' || task.status === 'RETURNED'), [employeeTasks]);
  const employeePriorityTask = useMemo(() => [...actionableEmployeeTasks].sort((a, b) => {
    const urgency = (task: EmployeeTask) => task.status === 'RETURNED' ? 3 : task.dueAt && new Date(task.dueAt).getTime() < Date.now() ? 2 : 1;
    return urgency(b) - urgency(a);
  })[0], [actionableEmployeeTasks]);
  const employeePriorityPage = employeePriorityTask
    ? Math.floor(employeeTasks.findIndex((task) => task.id === employeePriorityTask.id) / 10) + 1
    : 1;
  const showEmployeePriority = Boolean(employeePriorityTask) && (
    employeePriorityTask?.status === 'RETURNED'
    || Boolean(employeePriorityTask?.dueAt && new Date(employeePriorityTask.dueAt).getTime() < Date.now())
    || !mainTask?.count
  );
  const taskTotal = dashboardTaskTotal + actionableEmployeeTasks.length;

  const fetchData = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await dashboardApi.fetchHomeWorkbench();
      if (res.code === 0) setData(res.data);
      else setLoadError(res.message || '首页待办加载失败');
    } catch {
      setLoadError('首页待办加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchEmployeeTasks = async () => {
    if (!canViewOwnTasks && !canViewTeamTasks) return;
    setEmployeeTasksLoading(true);
    setEmployeeTasksError('');
    setTeamTasksError('');
    try {
      const [mineResult, teamResult] = await Promise.allSettled([
        canViewOwnTasks ? loadAllWorkbenchTasks(enterpriseBrainApi.listMyTasks, workDate) : Promise.resolve([]),
        canViewTeamTasks ? loadAllWorkbenchTasks(enterpriseBrainApi.listTeamTasks, workDate) : Promise.resolve([]),
      ]);
      if (mineResult.status === 'fulfilled') setEmployeeTasks(mineResult.value);
      else if (canViewOwnTasks) setEmployeeTasksError(mineResult.reason instanceof Error ? mineResult.reason.message : '工作事项加载失败');
      if (teamResult.status === 'fulfilled') setTeamTasks(teamResult.value);
      else if (canViewTeamTasks) setTeamTasksError(teamResult.reason instanceof Error ? teamResult.reason.message : '团队执行情况加载失败');
    } catch {
      if (canViewOwnTasks) setEmployeeTasksError('工作事项加载失败，请稍后重试');
      if (canViewTeamTasks) setTeamTasksError('团队执行情况加载失败，请稍后重试');
    } finally {
      setEmployeeTasksLoading(false);
    }
  };

  useEffect(() => {
    void fetchEmployeeTasks();
  }, [canViewOwnTasks, canViewTeamTasks, workDate]);

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

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (!data) {
    return (
      <Alert
        severity="error"
        action={<Button color="inherit" size="small" onClick={() => void fetchData()}>重试</Button>}
        sx={{ m: 2 }}
      >
        {loadError || '首页数据加载失败'}
      </Alert>
    );
  }

  const mainTone = showEmployeePriority
    ? (employeePriorityTask?.status === 'RETURNED' ? toneColor.error : toneColor.warning)
    : mainTask ? toneColor[mainTask.tone] : toneColor.primary;
  const headline = taskTotal > 0
    ? `${currentUser?.name || '你好'}，先处理 ${showEmployeePriority ? employeePriorityTask?.title : mainTask?.title || '待办'}`
    : `${currentUser?.name || '你好'}，今天没有阻塞事项`;
  const quickActionIcons: Record<string, React.ReactElement> = {
    lead: <PersonAddAltOutlinedIcon />,
    customer: <GroupAddOutlinedIcon />,
    order: <ReceiptLongOutlinedIcon />,
    review: <FactCheckOutlinedIcon />,
    commission: <AccountBalanceWalletOutlinedIcon />,
    refund: <ReplayCircleFilledOutlinedIcon />,
    delivery: <LocalShippingOutlinedIcon />,
    ai: <AutoAwesomeOutlinedIcon />,
  };

  return (
    <Box
      sx={{
        p: { xs: 2, md: 3 },
        maxWidth: 1500,
        mx: 'auto',
        minHeight: '100%',
        bgcolor: palette.page,
        fontFamily: '"Inter", "Noto Sans SC", sans-serif',
      }}
    >
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: 'minmax(0, 1fr) 330px' }, gap: 2.25, alignItems: 'start' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1} sx={{ gridColumn: '1 / -1' }}>
          <Box>
            <Typography variant="h4" sx={{ color: palette.ink, fontWeight: 900 }}>
              早上好，{currentUser?.name || '系统用户'}
            </Typography>
            <Typography variant="body2" sx={{ color: palette.muted, mt: 0.25 }}>
              专注当下，掌控全局，推动业务高效增长。
            </Typography>
          </Box>
          <Chip label={`${data.todayLabel} · ${data.scopeLabel}`} sx={{ bgcolor: '#F0E9FF', color: palette.violet, fontWeight: 900 }} />
        </Stack>

        <Paper elevation={0} sx={{ gridColumn: { xs: '1', xl: '1' }, border: `1px solid ${palette.line}`, borderRadius: 2, bgcolor: '#F6F1FF', overflow: 'hidden', boxShadow: '0 16px 46px rgba(88, 55, 160, 0.08)' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(430px, 1.25fr) minmax(240px, 0.6fr)' },
              minHeight: 226,
            }}
          >
            <Box sx={{ p: { xs: 2.5, md: 3 }, borderRight: { lg: `1px solid ${palette.softLine}` }, position: 'relative', overflow: 'hidden', minHeight: 226 }}>
              <Box component="img" src="/assets/dashboard/settlement-hero.png" alt="" sx={{ display: { xs: 'none', sm: 'block' }, position: 'absolute', width: { sm: 280, xl: 340 }, right: -10, bottom: -20, objectFit: 'contain', pointerEvents: 'none' }} />
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1.25, flexWrap: 'wrap', rowGap: 1 }}>
                <Chip size="small" label={data.todayLabel} sx={{ bgcolor: '#E8DDFF', color: palette.violet, fontWeight: 900 }} />
                <Chip size="small" label={data.scopeLabel} sx={{ bgcolor: '#FFFFFF', color: palette.ink, fontWeight: 800 }} />
                <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>
                  {currentUser?.role || '系统用户'}
                </Typography>
              </Stack>
              <Typography variant="h4" sx={{ color: palette.ink, fontWeight: 900, mt: 1.5, mb: 0.75, lineHeight: 1.3, letterSpacing: 0, maxWidth: { sm: '58%' } }}>
                {showEmployeePriority ? employeePriorityTask?.title : mainTask?.title || headline}·优先处理
              </Typography>
              <Typography variant="body2" sx={{ color: palette.muted, maxWidth: { sm: '58%' } }}>
                先推进卡住流转的事项，再补齐获客、成交、财务和履约动作。
              </Typography>
              <Button
                variant="contained"
                endIcon={<ArrowForwardIcon />}
                disabled={!mainTask && !employeePriorityTask}
                onClick={() => {
                  if (showEmployeePriority && employeePriorityTask) navigate(`${ROUTES.TASKS}?tab=mine&date=${workDate}&page=${employeePriorityPage}&taskId=${encodeURIComponent(employeePriorityTask.id)}`);
                  else if (mainTask) navigate(mainTask.path);
                }}
                sx={{ mt: 2, px: 2.25 }}
              >
                进入处理中心
              </Button>
            </Box>

            <Box sx={{ p: { xs: 2.5, md: 3 }, bgcolor: '#FBF9FF', borderRight: { lg: `1px solid ${mainTone.border}` } }}>
              <Typography variant="caption" sx={{ color: mainTone.color, fontWeight: 900 }}>
                当前优先
              </Typography>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ mt: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h6" sx={{ color: mainTone.color, fontWeight: 900 }}>
                    {showEmployeePriority ? employeePriorityTask?.title : mainTask?.title || '暂无待办'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: palette.muted, mt: 0.5 }}>
                    {showEmployeePriority
                      ? employeePriorityTask?.description || (employeePriorityTask?.status === 'RETURNED' ? '任务被退回，请补充结果后重新提交' : '今日岗位任务待处理')
                      : mainTask?.description || '当前没有需要处理的事项'}
                  </Typography>
                </Box>
                <Typography sx={{ color: palette.violet, fontSize: 44, lineHeight: 1, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                  {showEmployeePriority ? actionableEmployeeTasks.length : mainTask?.count || 0}
                </Typography>
              </Stack>
              <Button
                variant="contained"
                disabled={!mainTask && !employeePriorityTask}
                onClick={() => {
                  if (showEmployeePriority && employeePriorityTask) {
                    navigate(`${ROUTES.TASKS}?tab=mine&date=${workDate}&page=${employeePriorityPage}&taskId=${encodeURIComponent(employeePriorityTask.id)}`);
                  } else if (mainTask) navigate(mainTask.path);
                }}
                sx={{ mt: 2, bgcolor: palette.violet, '&:hover': { bgcolor: '#6035D5' } }}
              >
                进入处理
              </Button>
            </Box>

          </Box>
        </Paper>

        <Stack spacing={2} sx={{ gridColumn: { xs: '1', xl: '2' }, gridRow: { xl: '2 / span 4' }, alignSelf: 'start' }}>
          <Panel title="今日摘要">
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, p: 1.5 }}>
              {data.personalMetrics.slice(0, 4).map((metric) => {
                const tone = toneColor[metric.tone];
                return (
                  <Box key={metric.label} sx={{ border: `1px solid ${palette.softLine}`, borderRadius: 1.5, p: 1.25, bgcolor: '#FCFBFE' }}>
                    <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>{metric.label}</Typography>
                    <Typography variant="h6" sx={{ color: tone.color, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{metric.value}</Typography>
                  </Box>
                );
              })}
            </Box>
          </Panel>

          {data.quickActions.length > 0 && (
            <Panel title="快捷操作">
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, p: 1.5 }}>
                {data.quickActions.slice(0, 4).map((action) => (
                  <Button key={action.id} onClick={() => navigate(action.path)} sx={{ minHeight: 70, display: 'flex', flexDirection: 'column', gap: 0.6, color: palette.ink, border: `1px solid ${palette.softLine}`, bgcolor: '#FCFBFE', boxShadow: 'none', '&:hover': { bgcolor: '#F4EFFF', borderColor: '#D9CBFF', color: palette.violet, boxShadow: 'none' } }}>
                    <Box sx={{ color: palette.violet, lineHeight: 0 }}>{quickActionIcons[action.icon]}</Box>
                    <Typography variant="caption" sx={{ fontWeight: 900 }}>{action.label}</Typography>
                  </Button>
                ))}
              </Box>
              {data.quickActions.find((action) => action.id === 'customer') && (
                <Box sx={{ px: 1.5, pb: 1.5 }}>
                  <Button fullWidth variant="contained" startIcon={<GroupAddOutlinedIcon />} onClick={() => navigate(data.quickActions.find((action) => action.id === 'customer')!.path)}>新增客户</Button>
                </Box>
              )}
            </Panel>
          )}

          <Panel title="范围指标" eyebrow={data.scopeLabel}>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, p: 1.5 }}>
              {data.personalMetrics.map((metric) => {
                const tone = toneColor[metric.tone];
                return (
                  <Box key={metric.label} sx={{ border: `1px solid ${palette.softLine}`, borderRadius: 1.5, p: 1.15, bgcolor: '#FCFBFE' }}>
                    <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>{metric.label}</Typography>
                    <Typography variant="h6" sx={{ color: tone.color, fontWeight: 900 }}>{metric.value}</Typography>
                  </Box>
                );
              })}
            </Box>
          </Panel>
        </Stack>

        {(canViewOwnTasks || canViewTeamTasks) && (
          <Box sx={{ gridColumn: '1', display: 'grid', gridTemplateColumns: { xs: '1fr', lg: canViewTeamTasks ? 'minmax(0, 1.35fr) minmax(280px, 0.65fr)' : '1fr' }, gap: 2 }}>
            {canViewOwnTasks && (
              <Panel
                title="我的工作事项"
                eyebrow={`${workDate} · 待处理 ${employeeTaskSummary.pending + employeeTaskSummary.returned} 项`}
                action={<Button size="small" onClick={() => navigate(`${ROUTES.TASKS}?tab=mine&date=${workDate}`)}>查看全部</Button>}
              >
                <Stack direction="row" spacing={1} sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${palette.softLine}`, flexWrap: 'wrap', rowGap: 1 }}>
                  <Chip size="small" label={`待处理 ${employeeTaskSummary.pending}`} sx={{ bgcolor: '#FFF7E8', color: palette.amber, fontWeight: 900 }} />
                  <Chip size="small" label={`被退回 ${employeeTaskSummary.returned}`} sx={{ bgcolor: '#FFF1F0', color: palette.red, fontWeight: 900 }} />
                  <Chip size="small" label={`待确认 ${employeeTaskSummary.awaitingConfirmation}`} sx={{ bgcolor: '#F0E9FF', color: palette.violet, fontWeight: 900 }} />
                  {employeeTaskSummary.overdue > 0 && <Chip size="small" color="error" label={`已逾期 ${employeeTaskSummary.overdue}`} />}
                </Stack>
                {employeeTasksError && (
                  <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void fetchEmployeeTasks()}>重试</Button>} sx={{ m: 1.25 }}>
                    {employeeTasksError}
                  </Alert>
                )}
                {employeeTasksLoading ? (
                  <Box sx={{ display: 'grid', placeItems: 'center', py: 4 }}><CircularProgress size={26} /></Box>
                ) : (
                  <Stack divider={<Box sx={{ borderBottom: `1px solid ${palette.softLine}` }} />} sx={{ maxHeight: 330, overflowY: 'auto' }}>
                    {employeeTasks.slice(0, 8).map((task) => {
                      const overdue = task.status === 'PENDING' && Boolean(task.dueAt) && new Date(task.dueAt || '').getTime() < Date.now();
                      const statusLabel = task.status === 'RETURNED' ? '被退回' : task.status === 'COMPLETED' ? '待确认' : task.status === 'CONFIRMED' ? '已确认' : overdue ? '已逾期' : '待处理';
                      const statusColor = task.status === 'CONFIRMED' ? palette.green : task.status === 'COMPLETED' ? palette.violet : task.status === 'RETURNED' || overdue ? palette.red : palette.amber;
                      return (
                        <Button key={task.id} onClick={() => navigate(`${ROUTES.TASKS}?tab=mine&date=${workDate}&taskId=${encodeURIComponent(task.id)}`)} sx={{ display: 'block', textAlign: 'left', borderRadius: 0, px: 2, py: 1.15, color: palette.ink, '&:hover': { bgcolor: '#F8FAFC' } }}>
                          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography variant="body2" sx={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</Typography>
                              <Typography variant="caption" sx={{ color: palette.muted }}>{task.dueAt ? `截止 ${formatDate(task.dueAt, 'MM-dd HH:mm')}` : '今日工作事项'}</Typography>
                            </Box>
                            <Chip size="small" label={statusLabel} sx={{ flexShrink: 0, color: statusColor, bgcolor: `${statusColor}12`, fontWeight: 900 }} />
                          </Stack>
                        </Button>
                      );
                    })}
                    {!employeeTasks.length && !employeeTasksError && <Typography variant="body2" sx={{ color: '#94a3b8', px: 2, py: 4, textAlign: 'center' }}>今天没有岗位任务</Typography>}
                  </Stack>
                )}
              </Panel>
            )}

            {canViewTeamTasks && (
              <Panel
                title="团队执行情况"
                eyebrow={`今日共 ${teamTaskSummary.total} 项`}
                action={<Button size="small" onClick={() => navigate(`${ROUTES.TASKS}?tab=team&date=${workDate}`)}>进入团队台账</Button>}
              >
                {teamTasksError && (
                  <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void fetchEmployeeTasks()}>重试</Button>} sx={{ m: 1.25 }}>
                    {teamTasksError}
                  </Alert>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25, p: 2 }}>
                  {[
                    ['待处理', teamTaskSummary.pending, palette.amber],
                    ['被退回', teamTaskSummary.returned, palette.red],
                    ['待确认', teamTaskSummary.awaitingConfirmation, palette.violet],
                    ['已确认', teamTaskSummary.confirmed, palette.green],
                  ].map(([label, value, color]) => (
                    <Box key={String(label)} sx={{ border: `1px solid ${palette.softLine}`, borderRadius: 1.5, p: 1.25, bgcolor: '#FCFBFE' }}>
                      <Typography variant="caption" sx={{ color: palette.muted, fontWeight: 800 }}>{label}</Typography>
                      <Typography variant="h5" sx={{ color, fontWeight: 900 }}>{value}</Typography>
                    </Box>
                  ))}
                </Box>
                {teamTaskSummary.overdue > 0 && <Alert severity="warning" sx={{ mx: 2, mb: 2 }}>团队有 {teamTaskSummary.overdue} 项任务已逾期，请及时协调。</Alert>}
                {teamAbnormalTasks.length > 0 && (
                  <Stack divider={<Box sx={{ borderBottom: `1px solid ${palette.softLine}` }} />} sx={{ borderTop: `1px solid ${palette.softLine}` }}>
                    {teamAbnormalTasks.map(({ task, page }) => (
                      <Button
                        key={task.id}
                        onClick={() => navigate(`${ROUTES.TASKS}?tab=team&date=${workDate}&page=${page}&taskId=${encodeURIComponent(task.id)}`)}
                        sx={{ display: 'block', textAlign: 'left', borderRadius: 0, px: 2, py: 1, color: palette.ink, '&:hover': { bgcolor: '#F8FAFC' } }}
                      >
                        <Typography variant="body2" sx={{ fontWeight: 900 }}>{task.employeeName} · {task.title}</Typography>
                        <Typography variant="caption" sx={{ color: palette.red }}>{task.status === 'RETURNED' ? `被退回：${task.returnedReason || '待补充'}` : `已逾期 · ${task.positionNameSnapshot || '未绑定岗位'}`}</Typography>
                      </Button>
                    ))}
                  </Stack>
                )}
              </Panel>
            )}
          </Box>
        )}

        <Box sx={{ gridColumn: '1' }}>
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
              <Stack alignItems="center" spacing={0.75} sx={{ px: 2, py: 2.5, textAlign: 'center' }}>
                <Box component="img" src="/assets/dashboard/customer-todo-empty.png" alt="" sx={{ width: 118, height: 118, objectFit: 'contain' }} />
                <Typography variant="body2" sx={{ color: palette.muted }}>当前没有分配给你的客户待办</Typography>
                <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => navigate(ROUTES.CUSTOMERS)}>去客户列表看看</Button>
              </Stack>
            )}
          </Stack>
          {data.customerTodos.length > 10 && (
            <Box sx={{ px: 2, py: 1, borderTop: `1px solid ${palette.softLine}` }}>
              <Typography variant="caption" sx={{ color: palette.muted }}>首页显示前 10 项，其余待办请进入客户详情查看。</Typography>
            </Box>
          )}
        </Panel>
        </Box>

        <Box
          sx={{
            gridColumn: '1',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr)',
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
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: palette.violet }} />
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

        </Box>
      </Box>
    </Box>
  );
};

export default HomeWorkbench;
