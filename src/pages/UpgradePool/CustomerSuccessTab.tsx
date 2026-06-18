import React, { useEffect, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogContent,
  FormControl, InputLabel, MenuItem, Paper, Select, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import type { CustomerSuccessTask, CustomerSuccessTaskStatus, CustomerSuccessTaskType } from '../../types/customerSuccess';
import { customerSuccessApi } from '../../api';
import { formatDate } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

const taskTypes: CustomerSuccessTaskType[] = ['续费', '升单', '风险', '回访', '服务'];
const statuses: CustomerSuccessTaskStatus[] = ['待处理', '跟进中', '已完成', '已关闭'];

const CustomerSuccessTab: React.FC = () => {
  const [items, setItems] = useState<CustomerSuccessTask[]>([]);
  const [stats, setStats] = useState({ pending: 0, overdue: 0, highRisk: 0, renewal: 0, upgrade: 0 });
  const [taskType, setTaskType] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<CustomerSuccessTask | null>(null);
  const [followUp, setFollowUp] = useState('');

  const fetchData = async () => {
    const [taskRes, statsRes] = await Promise.all([
      customerSuccessApi.getTasks({ search, taskType: taskType as CustomerSuccessTaskType | undefined, status: status as CustomerSuccessTaskStatus | undefined }),
      customerSuccessApi.getStats(),
    ]);
    setItems(taskRes.data.items);
    setStats(statsRes.data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleStatus = async (nextStatus: CustomerSuccessTaskStatus) => {
    if (!selected) return;
    const res = await customerSuccessApi.updateStatus(selected.id, nextStatus);
    if (res.data) {
      setSelected(res.data);
      await fetchData();
    }
  };

  const handleFollowUp = async () => {
    if (!selected || !followUp.trim()) return;
    const res = await customerSuccessApi.addFollowUp(selected.id, followUp.trim());
    if (res.data) {
      setSelected(res.data);
      setFollowUp('');
      await fetchData();
    }
  };

  const priorityColor = (priority: string) => priority === '高' ? 'error' : priority === '中' ? 'warning' : 'default';

  return (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 2, mb: 3 }}>
        {[
          ['待处理', stats.pending],
          ['逾期', stats.overdue],
          ['风险客户', stats.highRisk],
          ['续费任务', stats.renewal],
          ['升单建议', stats.upgrade],
        ].map(([label, value]) => (
          <Paper key={label} elevation={0} sx={{ p: 2, border: '1px solid #f0f0f0' }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>{label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700 }}>{value}</Typography>
          </Paper>
        ))}
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="搜索客户/任务" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 220 }} />
        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>任务类型</InputLabel>
          <Select value={taskType} label="任务类型" onChange={(e) => setTaskType(e.target.value)}>
            <MenuItem value="">全部</MenuItem>
            {taskTypes.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 120 }}>
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
              <TableCell>客户</TableCell>
              <TableCell>任务</TableCell>
              <TableCell>类型</TableCell>
              <TableCell>优先级</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>负责人</TableCell>
              <TableCell>到期日</TableCell>
              <TableCell>来源</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(item)}>
                <TableCell sx={{ fontWeight: 600 }}>{item.customerName}</TableCell>
                <TableCell>{item.title}</TableCell>
                <TableCell><Chip label={item.taskType} size="small" /></TableCell>
                <TableCell><Chip label={item.priority} size="small" color={priorityColor(item.priority) as any} /></TableCell>
                <TableCell>{item.status}</TableCell>
                <TableCell>{item.ownerName}</TableCell>
                <TableCell>{item.dueDate}</TableCell>
                <TableCell>{item.source}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} maxWidth="sm" fullWidth>
        {selected && (
          <>
            <DialogCloseTitle onClose={() => setSelected(null)}>{selected.title}</DialogCloseTitle>
            <DialogContent dividers>
              <Typography variant="body2" sx={{ mb: 2 }}>{selected.description}</Typography>
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {statuses.map((item) => (
                  <Button key={item} size="small" variant={selected.status === item ? 'contained' : 'outlined'} onClick={() => handleStatus(item)}>
                    {item}
                  </Button>
                ))}
              </Box>
              {selected.followUps.map((record) => (
                <Box key={record.id} sx={{ p: 1, mb: 1, bgcolor: '#f8fafc', borderRadius: 1 }}>
                  <Typography variant="body2">{record.content}</Typography>
                  <Typography variant="caption" sx={{ color: '#9ca3af' }}>{record.createdBy} · {formatDate(record.createdAt, 'MM-dd HH:mm')}</Typography>
                </Box>
              ))}
              <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
                <TextField size="small" label="跟进记录" value={followUp} onChange={(e) => setFollowUp(e.target.value)} fullWidth />
                <Button variant="contained" onClick={handleFollowUp} disabled={!followUp.trim()}>添加</Button>
              </Box>
            </DialogContent>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default CustomerSuccessTab;
