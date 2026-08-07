import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert, Box, Button, Chip, CircularProgress, MenuItem, Paper, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
  useMediaQuery, useTheme,
} from '@mui/material';
import DoneAllIcon from '@mui/icons-material/DoneAll';
import { notificationApi } from '../../api/notificationApi';
import type { NotificationItem, NotificationListStatus } from '../../types/notification';
import { ModuleHeader, ModulePage, StatusSegmentBar, moduleTokens } from '../../shared/components/ModuleShell';
import TablePagination from '../../shared/components/TablePagination';

const eventLabels: Record<string, string> = {
  LEAD_ASSIGNED: '线索分配', LEAD_ACK_REMINDER: '线索待确认', LEAD_ACK_ESCALATION: '线索确认升级',
  LEAD_FIRST_FOLLOW_UP_DUE: '首次跟进', LEAD_FIRST_FOLLOW_UP_ESCALATION: '首次跟进升级',
  TODO_ASSIGNED: '客户待办', TODO_DUE_SOON: '待办临期', TODO_DUE: '待办到期',
  TODO_OVERDUE: '待办逾期', TODO_MANAGER_ESCALATION: '待办升级',
};
const severityColors: Record<string, 'error' | 'warning' | 'info' | 'default'> = { S0: 'error', S1: 'warning', S2: 'info', S3: 'default' };

function formatTime(value: string) {
  return new Date(value).toLocaleString('zh-CN', { hour12: false });
}

export default function NotificationsPage() {
  const navigate = useNavigate();
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [status, setStatus] = useState<NotificationListStatus>('pending');
  const [severity, setSeverity] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    const response = await notificationApi.list({ page: page + 1, pageSize, status, severity });
    if (response.code !== 0) setError(response.message || '消息加载失败');
    else {
      setItems(response.data.items);
      setTotal(response.data.pagination.total);
    }
    setLoading(false);
  }, [page, pageSize, severity, status]);

  useEffect(() => { void load(); }, [load]);

  const handleOpen = async (item: NotificationItem) => {
    if (!item.readAt) await notificationApi.markRead(item.id);
    navigate(item.actionUrl);
  };
  const handleAck = async (item: NotificationItem) => {
    const response = await notificationApi.acknowledge(item.id);
    if (response.code !== 0) setError(response.message);
    await load();
  };
  const actions = (item: NotificationItem) => (
    <Stack direction="row" spacing={1} justifyContent="flex-end">
      {item.requiresAck && !item.ackAt && !item.resolvedAt && <Button size="small" variant="outlined" onClick={() => void handleAck(item)}>确认接收</Button>}
      <Button size="small" onClick={() => void handleOpen(item)}>{item.resolvedAt ? '查看业务' : '去处理'}</Button>
    </Stack>
  );

  return <ModulePage maxWidth={1480} sx={{ px: { xs: 1.5, md: 3 } }}>
    <ModuleHeader title="消息中心" description="统一查看需要确认、需要处理和已经结束的业务提醒。已读不等于已完成，业务处理完成后消息才会自动关闭。" actions={
      <Button startIcon={<DoneAllIcon />} variant="outlined" onClick={async () => { await notificationApi.markAllRead(); await load(); }}>全部已读</Button>
    } />
    <Paper variant="outlined" sx={{ p: 2, mb: 2, borderColor: moduleTokens.line }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1.5}>
        <StatusSegmentBar value={status} onChange={(next) => { setStatus(next); setPage(0); }} sx={{ mb: 0 }} items={[
          { value: 'pending', label: '待处理' }, { value: 'unread', label: '未读' },
          { value: 'resolved', label: '已结束' }, { value: 'all', label: '全部' },
        ]} />
        <Select size="small" value={severity} displayEmpty onChange={(event) => { setSeverity(event.target.value); setPage(0); }} sx={{ minWidth: 140 }}>
          <MenuItem value="">全部等级</MenuItem><MenuItem value="S0">S0 紧急</MenuItem><MenuItem value="S1">S1 重要</MenuItem><MenuItem value="S2">S2 提醒</MenuItem><MenuItem value="S3">S3 信息</MenuItem>
        </Select>
      </Stack>
    </Paper>
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    {loading ? <Box sx={{ py: 10, textAlign: 'center' }}><CircularProgress /></Box> : mobile ? (
      <Stack spacing={1.25}>{items.map((item) => <Paper key={item.id} variant="outlined" sx={{ p: 2, borderLeft: `4px solid ${item.readAt ? '#DDE4EC' : '#1E6BFF'}` }}>
        <Stack direction="row" justifyContent="space-between" gap={1}><Typography fontWeight={800}>{item.title}</Typography><Chip size="small" color={severityColors[item.severity]} label={item.severity} /></Stack>
        {item.content && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{item.content}</Typography>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>{eventLabels[item.eventType] || item.eventType} · {formatTime(item.createdAt)}</Typography>
        <Box sx={{ mt: 1 }}>{actions(item)}</Box>
      </Paper>)}</Stack>
    ) : (
      <TableContainer component={Paper} variant="outlined"><Table sx={{ minWidth: 900 }}>
        <TableHead><TableRow><TableCell>消息</TableCell><TableCell>业务类型</TableCell><TableCell>等级</TableCell><TableCell>时间</TableCell><TableCell>状态</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
        <TableBody>{items.map((item) => <TableRow key={item.id} sx={{ bgcolor: item.readAt ? 'inherit' : '#F5F9FF' }}>
          <TableCell><Typography fontWeight={item.readAt ? 600 : 900}>{item.title}</Typography>{item.content && <Typography variant="body2" color="text.secondary">{item.content}</Typography>}</TableCell>
          <TableCell>{eventLabels[item.eventType] || item.eventType}</TableCell><TableCell><Chip size="small" color={severityColors[item.severity]} label={item.severity} /></TableCell>
          <TableCell>{formatTime(item.createdAt)}</TableCell><TableCell>{item.resolvedAt ? '已结束' : item.ackAt ? '已确认待处理' : item.readAt ? '已读' : '未读'}</TableCell><TableCell align="right">{actions(item)}</TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
    )}
    {!loading && items.length === 0 && <Paper variant="outlined" sx={{ py: 8, textAlign: 'center', color: 'text.secondary' }}>当前没有消息</Paper>}
    <TablePagination count={total} page={page} rowsPerPage={pageSize} onPageChange={(_, next) => setPage(next)} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} sx={{ mt: 1 }} />
  </ModulePage>;
}
