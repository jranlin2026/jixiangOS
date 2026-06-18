import React, { useEffect, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent,
  FormControl, InputLabel, MenuItem, Paper, Select, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import type { ServiceTicket, ServiceTicketCategory, ServiceTicketStatus } from '../../types/serviceTicket';
import { serviceTicketApi } from '../../api';
import { formatDate } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

const categories: ServiceTicketCategory[] = ['咨询', '故障', '培训', '交付问题', '退款前风险'];
const statuses: ServiceTicketStatus[] = ['待处理', '处理中', '待客户反馈', '已解决', '已关闭'];

const ServiceTicketTab: React.FC = () => {
  const [items, setItems] = useState<ServiceTicket[]>([]);
  const [stats, setStats] = useState({ pending: 0, processing: 0, waitingCustomer: 0, resolved: 0, highPriority: 0 });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<ServiceTicket | null>(null);
  const [logContent, setLogContent] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');

  const fetchData = async () => {
    const [ticketRes, statsRes] = await Promise.all([
      serviceTicketApi.getTickets({ search, category: category as ServiceTicketCategory | undefined, status: status as ServiceTicketStatus | undefined }),
      serviceTicketApi.getStats(),
    ]);
    setItems(ticketRes.data.items);
    setStats(statsRes.data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStatus = async (nextStatus: ServiceTicketStatus) => {
    if (!selected) return;
    const res = await serviceTicketApi.updateStatus(selected.id, nextStatus);
    if (res.data) {
      setSelected(res.data);
      await fetchData();
    }
  };

  const handleLog = async () => {
    if (!selected || !logContent.trim()) return;
    const res = await serviceTicketApi.addLog(selected.id, {
      content: logContent.trim(),
      operatorName: '当前用户',
      nextFollowUpAt: nextFollowUpAt || undefined,
    });
    if (res.data) {
      setSelected(res.data);
      setLogContent('');
      setNextFollowUpAt('');
      await fetchData();
    }
  };

  const priorityColor = (priority: string) => priority === '高' ? 'error' : priority === '中' ? 'warning' : 'default';

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, mb: 3 }}>
        {[
          ['待处理', stats.pending],
          ['处理中', stats.processing],
          ['待客户反馈', stats.waitingCustomer],
          ['已解决', stats.resolved],
          ['高优先级', stats.highPriority],
        ].map(([label, value]) => (
          <Paper key={label} elevation={0} sx={{ p: 2, border: '1px solid #f0f0f0' }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>{label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{value}</Typography>
          </Paper>
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="搜索工单号/客户/标题" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 240 }} />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>问题类型</InputLabel>
          <Select value={category} label="问题类型" onChange={(e) => setCategory(e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {categories.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>状态</InputLabel>
          <Select value={status} label="状态" onChange={(e) => setStatus(e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {statuses.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </Select>
        </FormControl>
        <Button variant="outlined" onClick={fetchData}>筛选</Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>工单号</TableCell>
              <TableCell>客户</TableCell>
              <TableCell>标题</TableCell>
              <TableCell>类型</TableCell>
              <TableCell>优先级</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>负责人</TableCell>
              <TableCell>来源</TableCell>
              <TableCell>更新时间</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(item)}>
                <TableCell sx={{ fontWeight: 600 }}>{item.ticketNo}</TableCell>
                <TableCell>{item.customerName}</TableCell>
                <TableCell>{item.title}</TableCell>
                <TableCell><Chip label={item.category} size="small" /></TableCell>
                <TableCell><Chip label={item.priority} size="small" color={priorityColor(item.priority) as any} /></TableCell>
                <TableCell>{item.status}</TableCell>
                <TableCell>{item.ownerName}</TableCell>
                <TableCell>{item.source}</TableCell>
                <TableCell>{formatDate(item.updatedAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="md" fullWidth>
        {selected && (
          <>
            <DialogCloseTitle onClose={() => setSelected(null)}>{selected.ticketNo} · {selected.title}</DialogCloseTitle>
            <DialogContent dividers>
              <Typography variant="body2" sx={{ mb: 2 }}>{selected.description}</Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {statuses.map((item) => (
                  <Button key={item} size="small" variant={selected.status === item ? 'contained' : 'outlined'} onClick={() => handleStatus(item)}>
                    {item}
                  </Button>
                ))}
              </Box>
              {selected.logs.map((log) => (
                <Box key={log.id} sx={{ p: 1, mb: 1, bgcolor: '#f8fafc', borderRadius: 1 }}>
                  <Typography variant="body2">{log.content}</Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>
                    {log.operatorName} · {formatDate(log.createdAt, 'MM-dd HH:mm')}{log.nextFollowUpAt ? ` · 下次跟进 ${formatDate(log.nextFollowUpAt, 'MM-dd HH:mm')}` : ''}
                  </Typography>
                </Box>
              ))}
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 200px auto', gap: 1, mt: 2 }}>
                <TextField size="small" label="处理记录" value={logContent} onChange={(e) => setLogContent(e.target.value)} />
                <TextField size="small" label="下次跟进" type="datetime-local" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} InputLabelProps={{ shrink: true }} />
                <Button variant="contained" onClick={handleLog} disabled={!logContent.trim()}>添加</Button>
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default ServiceTicketTab;
