import React, { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import TablePagination from '../../shared/components/TablePagination';
import type { ServiceTicket, ServiceTicketCategory, ServiceTicketStatus } from '../../types/serviceTicket';
import { serviceTicketApi } from '../../api';
import { formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

const categories: ServiceTicketCategory[] = ['咨询', '故障', '培训', '交付问题', '退款前风险'];
const statuses: ServiceTicketStatus[] = ['待处理', '处理中', '待客户反馈', '已解决', '已关闭'];

const ServiceTicketTab: React.FC = () => {
  const [items, setItems] = useState<ServiceTicket[]>([]);
  const [stats, setStats] = useState({ pending: 0, processing: 0, waitingCustomer: 0, resolved: 0, highPriority: 0 });
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<ServiceTicket | null>(null);
  const [logContent, setLogContent] = useState('');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');

  const fetchData = useCallback(async () => {
    const [ticketRes, statsRes] = await Promise.all([
      serviceTicketApi.getTickets({
        search,
        category: category as ServiceTicketCategory | undefined,
        status: status as ServiceTicketStatus | undefined,
        page: page + 1,
        pageSize: rowsPerPage,
      }),
      serviceTicketApi.getStats(),
    ]);
    setItems(ticketRes.data.items);
    setTotal(ticketRes.data.pagination.total);
    setStats(statsRes.data);
  }, [category, page, rowsPerPage, search, status]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setPage(0);
  }, [category, search, status]);

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
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(5, 1fr)' }, gap: 1 }}>
        {[
          ['待处理', stats.pending],
          ['处理中', stats.processing],
          ['待客户反馈', stats.waitingCustomer],
          ['已解决', stats.resolved],
          ['高优先级', stats.highPriority],
        ].map(([label, value]) => (
          <Paper key={label} elevation={0} sx={{ p: 1.5, border: '1px solid #dbe4ee', borderRadius: 1.5, bgcolor: '#fff' }}>
            <Typography variant="caption" sx={{ color: '#64748b' }}>{label}</Typography>
            <Typography variant="h6" sx={{ fontWeight: 900, color: label === '高优先级' ? '#dc2626' : '#0f172a', lineHeight: 1.25 }}>{value}</Typography>
          </Paper>
        ))}
      </Box>

      <Paper elevation={0} sx={{ p: 1.25, border: '1px solid #dbe4ee', borderRadius: 1.5, bgcolor: '#fff' }}>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <TextField size="small" placeholder="搜索工单号/客户/标题" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 260 }} />
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
      </Paper>

      <Box>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #dbe4ee', borderRadius: '6px 6px 0 0', overflowX: 'auto' }}>
        <Table sx={{ minWidth: 1080, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell sx={{ width: 140, fontWeight: 700 }}>工单号</TableCell>
              <TableCell sx={{ width: 120, fontWeight: 700 }}>客户</TableCell>
              <TableCell sx={{ width: 220, fontWeight: 700 }}>标题</TableCell>
              <TableCell sx={{ width: 110, fontWeight: 700 }}>类型</TableCell>
              <TableCell sx={{ width: 100, fontWeight: 700 }}>优先级</TableCell>
              <TableCell sx={{ width: 120, fontWeight: 700 }}>状态</TableCell>
              <TableCell sx={{ width: 130, fontWeight: 700 }}>负责人</TableCell>
              <TableCell sx={{ width: 100, fontWeight: 700 }}>来源</TableCell>
              <TableCell sx={{ width: 160, fontWeight: 700 }}>更新时间</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelected(item)}>
                <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{item.ticketNo}</TableCell>
                <TableCell>{item.customerName}</TableCell>
                <TableCell sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</TableCell>
                <TableCell><Chip label={item.category} size="small" /></TableCell>
                <TableCell><Chip label={item.priority} size="small" color={priorityColor(item.priority) as any} /></TableCell>
                <TableCell>
                  <Chip
                    label={item.status}
                    size="small"
                    sx={{
                      bgcolor: item.status === '已解决' || item.status === '已关闭' ? '#ecfdf5' : item.status === '待处理' ? '#fff7ed' : '#eff6ff',
                      color: item.status === '已解决' || item.status === '已关闭' ? '#059669' : item.status === '待处理' ? '#b45309' : '#2563eb',
                      fontWeight: 800,
                    }}
                  />
                </TableCell>
                <TableCell>{item.ownerName}</TableCell>
                <TableCell>{item.source}</TableCell>
                <TableCell>{formatDate(item.updatedAt)}</TableCell>
              </TableRow>
            ))}
            {!items.length && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                  暂无售后工单
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={Math.min(page, Math.max(Math.ceil(total / rowsPerPage) - 1, 0))}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[10, 20, 50]}
        onPageChange={(_, nextPage) => setPage(nextPage)}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(Number(event.target.value));
          setPage(0);
        }}
        labelRowsPerPage="每页条数"
        labelDisplayedRows={formatPaginationRows}
        sx={{ border: '1px solid #dbe4ee', borderTop: 0, bgcolor: '#fff' }}
      />
      </Box>

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

