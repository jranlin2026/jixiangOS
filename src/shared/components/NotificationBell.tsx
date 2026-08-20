import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import { Badge, Box, Button, Divider, Drawer, IconButton, Stack, Typography } from '@mui/material';
import { notificationApi } from '../../api/notificationApi';
import type { NotificationItem } from '../../types/notification';
import { ROUTES } from '../utils/constants';
import { buildNotificationPreviews } from '../utils/notificationPresentation';

const severityLabels: Record<string, string> = { S0: '紧急', S1: '重要', S2: '提醒', S3: '信息' };

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const loadCount = useCallback(async () => {
    const response = await notificationApi.unreadCount();
    if (response.code === 0) setCount(response.data.count);
  }, []);
  useEffect(() => {
    void loadCount();
    const timer = window.setInterval(() => void loadCount(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadCount]);
  const show = async () => {
    setOpen(true);
    const response = await notificationApi.list({ page: 1, pageSize: 100, status: 'pending' });
    if (response.code === 0) setItems(response.data.items);
  };
  const go = async (item: NotificationItem) => {
    if (!item.readAt) await notificationApi.markRead(item.id);
    setOpen(false); void loadCount(); navigate(item.actionUrl);
  };
  const previews = buildNotificationPreviews(items).slice(0, 10);
  return <>
    <IconButton aria-label={`消息中心，${count}条未读`} onClick={() => void show()} sx={{ color: '#667085' }}>
      <Badge badgeContent={count} color="error" max={99}><NotificationsNoneIcon fontSize="small" /></Badge>
    </IconButton>
    <Drawer anchor="right" open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { width: { xs: '100%', sm: 400 } } }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2.5, py: 2 }}><Box><Typography variant="h6" fontWeight={900}>业务提醒</Typography><Typography variant="caption" color="text.secondary">已读不代表业务已处理</Typography></Box><Button onClick={() => { setOpen(false); navigate(ROUTES.NOTIFICATIONS); }}>全部消息</Button></Stack>
      <Divider />
      {previews.length === 0 ? <Box sx={{ py: 10, textAlign: 'center', color: 'text.secondary' }}>暂无待处理提醒</Box> : previews.map((preview) => <Box key={preview.id} onClick={() => preview.item ? void go(preview.item) : (setOpen(false), navigate(preview.actionUrl))} sx={{ p: 2, borderBottom: '1px solid #EEF2F6', cursor: 'pointer', bgcolor: preview.item?.readAt ? '#fff' : '#F5F9FF', '&:hover': { bgcolor: '#EEF5FF' } }}>
        <Stack direction="row" justifyContent="space-between" gap={1}><Typography variant="body2" fontWeight={800}>{preview.title}</Typography><Typography variant="caption" color={preview.severity === 'S0' ? 'error.main' : preview.severity === 'S1' ? 'warning.main' : 'text.secondary'}>{severityLabels[preview.severity]}</Typography></Stack>
        {preview.content && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{preview.content}</Typography>}
        <Typography variant="caption" color="text.secondary">{new Date(preview.createdAt).toLocaleString('zh-CN', { hour12: false })}</Typography>
      </Box>)}
    </Drawer>
  </>;
}
