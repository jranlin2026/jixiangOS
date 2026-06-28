import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import HighlightOffIcon from '@mui/icons-material/HighlightOff';
import SearchIcon from '@mui/icons-material/Search';
import { recoveryOrderApi, settingsApi } from '../../api';
import { formatCurrency, formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import type { RecoveryOrder, RecoveryOrderFilters, RecoveryOrderInput, RecoveryOrderStatus, RecoveryOrderStats } from '../../types/recoveryOrder';
import type { User } from '../../types/settings';
import useAuthStore from '../../store/useAuthStore';

const shell = {
  ink: '#0f172a',
  muted: '#64748b',
  line: '#dbe4ee',
  soft: '#f8fafc',
  blue: '#2563eb',
  green: '#059669',
  amber: '#b45309',
  red: '#dc2626',
};

const emptyForm = {
  customerName: '',
  customerPhone: '',
  customerWechat: '',
  thirdPartyOrderNo: '',
  sourcePlatform: '',
  originalProduct: '',
  originalAmount: '',
  refundStatus: '退款中',
  recoveryAmount: '',
  paymentVoucher: '',
  chatEvidence: '',
  recoveryUserId: '',
  assistUserId: '',
  remark: '',
};

type RecoveryOrderForm = typeof emptyForm;

function getStatusSx(status: RecoveryOrderStatus) {
  if (status === '已生成提成' || status === '审核通过') return { bgcolor: '#ecfdf5', color: shell.green };
  if (status === '审核驳回') return { bgcolor: '#fff1f2', color: shell.red };
  return { bgcolor: '#fff7ed', color: shell.amber };
}

const RecoveryOrderTab: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const canCreate = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE);
  const canReview = hasPermission(currentUser, PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW);
  const [rows, setRows] = useState<RecoveryOrder[]>([]);
  const [stats, setStats] = useState<RecoveryOrderStats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<RecoveryOrderStatus | '全部'>('全部');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<RecoveryOrderForm>(emptyForm);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rejecting, setRejecting] = useState<RecoveryOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const visibleOwnerId = canReview ? undefined : currentUser?.id;
  const filters = useMemo<RecoveryOrderFilters>(() => ({
    search,
    status,
    ownerId: visibleOwnerId,
    page: page + 1,
    pageSize: rowsPerPage,
  }), [page, rowsPerPage, search, status, visibleOwnerId]);

  const load = useCallback(async () => {
    const [listRes, statsRes, usersRes] = await Promise.all([
      recoveryOrderApi.fetchRecoveryOrders(filters),
      recoveryOrderApi.fetchRecoveryOrderStats(visibleOwnerId),
      settingsApi.fetchUsers({ employmentStatus: 'active' }),
    ]);
    if (listRes.code === 0) {
      setRows(listRes.data.items);
      setTotal(listRes.data.pagination.total);
    }
    if (statsRes.code === 0) setStats(statsRes.data);
    if (usersRes.code === 0) setUsers(usersRes.data);
  }, [filters, visibleOwnerId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(0);
  }, [search, status]);

  const activeUsers = users.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active');

  const openCreate = () => {
    setMessage(null);
    const self = currentUser
      ? activeUsers.find((user) => user.id === currentUser.id)
      : undefined;
    setForm({ ...emptyForm, recoveryUserId: self?.id || currentUser?.id || '' });
    setOpen(true);
  };

  const handleCreate = async () => {
    if (!currentUser) return;
    const recoveryUser = activeUsers.find((user) => user.id === form.recoveryUserId);
    const assistUser = activeUsers.find((user) => user.id === form.assistUserId);
    const input: RecoveryOrderInput = {
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerWechat: form.customerWechat,
      thirdPartyOrderNo: form.thirdPartyOrderNo,
      sourcePlatform: form.sourcePlatform,
      originalProduct: form.originalProduct,
      originalAmount: Number(form.originalAmount) || 0,
      refundStatus: form.refundStatus,
      recoveryAmount: Number(form.recoveryAmount) || 0,
      paymentVoucher: form.paymentVoucher,
      chatEvidence: form.chatEvidence,
      recoveryUserId: recoveryUser?.id || currentUser.id,
      recoveryUserName: recoveryUser?.name || currentUser.name,
      assistUserId: assistUser?.id,
      assistUserName: assistUser?.name,
      remark: form.remark,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    };
    const res = await recoveryOrderApi.createRecoveryOrder(input);
    if (res.code !== 0) {
      setMessage({ type: 'error', text: res.message || '新建挽回单失败' });
      return;
    }
    setOpen(false);
    setMessage({ type: 'success', text: res.data.customerMatchStatus === '售后临时客户' ? '已创建挽回单，并自动生成售后临时客户档案' : '已创建挽回单，并绑定已有客户' });
    await load();
  };

  const handleApprove = async (row: RecoveryOrder) => {
    if (!currentUser) return;
    const res = await recoveryOrderApi.approveRecoveryOrder(row.id, currentUser.id, currentUser.name);
    if (res.code !== 0) {
      setMessage({ type: 'error', text: res.message || '审核失败' });
      return;
    }
    setMessage({ type: 'success', text: '已审核通过并生成提成记录' });
    await load();
  };

  const handleReject = async () => {
    if (!currentUser || !rejecting) return;
    const res = await recoveryOrderApi.rejectRecoveryOrder(rejecting.id, currentUser.id, currentUser.name, rejectReason);
    if (res.code !== 0) {
      setMessage({ type: 'error', text: res.message || '驳回失败' });
      return;
    }
    setRejecting(null);
    setRejectReason('');
    setMessage({ type: 'success', text: '已驳回挽回单' });
    await load();
  };

  const summaryCards = [
    { label: '挽回单', value: stats?.total || 0, color: shell.blue },
    { label: '待审核', value: stats?.pendingReview || 0, color: shell.amber },
    { label: '已通过', value: stats?.approved || 0, color: shell.green },
    { label: '已驳回', value: stats?.rejected || 0, color: shell.red },
    { label: '已生成提成', value: formatCurrency(stats?.generatedCommissionAmount || 0), color: shell.green },
  ];

  return (
    <Box sx={{ display: 'grid', gap: 1.5 }}>
      {message && (
        <Alert severity={message.type} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, p: 1.5 }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', lg: 'center' }} spacing={1.5}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 900, color: shell.ink }}>退款挽回单</Typography>
            <Typography variant="caption" sx={{ color: shell.muted }}>
              用于第三方平台订单的售后挽回提成核算，不进入正式订单中心。
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(110px, 1fr))' }, gap: 0.75, flex: 1, maxWidth: { lg: 760 } }}>
            {summaryCards.map((card) => (
              <Box key={card.label} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1, px: 1, py: 0.75, bgcolor: shell.soft }}>
                <Typography variant="caption" sx={{ color: shell.muted }}>{card.label}</Typography>
                <Typography variant="body2" sx={{ color: card.color, fontWeight: 900 }}>{card.value}</Typography>
              </Box>
            ))}
          </Box>
          {canCreate && (
            <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
              新建挽回单
            </Button>
          )}
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, p: 1.25 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ xs: 'stretch', md: 'center' }}>
          <TextField
            size="small"
            placeholder="搜索客户、手机号、微信、第三方订单号"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            InputProps={{ startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: shell.muted }} /> }}
            sx={{ minWidth: { md: 360 } }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>状态</InputLabel>
            <Select label="状态" value={status} onChange={(event) => setStatus(event.target.value as RecoveryOrderStatus | '全部')}>
              {['全部', '待审核', '已生成提成', '审核通过', '审核驳回'].map((item) => (
                <MenuItem key={item} value={item}>{item}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      <TableContainer component={Paper} elevation={0} sx={{ border: `1px solid ${shell.line}`, borderRadius: '6px 6px 0 0' }}>
        <Table sx={{ minWidth: 1120 }}>
          <TableHead>
            <TableRow>
              <TableCell>挽回单号</TableCell>
              <TableCell>客户</TableCell>
              <TableCell>第三方订单</TableCell>
              <TableCell>原产品</TableCell>
              <TableCell>原付款</TableCell>
              <TableCell>挽回金额</TableCell>
              <TableCell>挽回人员</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} hover>
                <TableCell sx={{ fontWeight: 900, color: shell.ink }}>{row.recoveryNo}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 800 }}>{row.customerName}</Typography>
                  <Typography variant="caption" sx={{ color: shell.muted }}>{row.customerPhone || row.customerWechat || '-'}</Typography>
                  <Chip size="small" label={row.customerMatchStatus} sx={{ ml: 0.75, height: 22, bgcolor: '#eef4fb', color: shell.blue, fontWeight: 800 }} />
                </TableCell>
                <TableCell>{row.thirdPartyOrderNo}</TableCell>
                <TableCell>{row.originalProduct}</TableCell>
                <TableCell>{formatCurrency(row.originalAmount)}</TableCell>
                <TableCell sx={{ fontWeight: 900, color: shell.green }}>{formatCurrency(row.recoveryAmount)}</TableCell>
                <TableCell>{row.recoveryUserName}{row.assistUserName ? ` / ${row.assistUserName}` : ''}</TableCell>
                <TableCell>
                  <Chip size="small" label={row.status} sx={{ ...getStatusSx(row.status), fontWeight: 900 }} />
                  {row.auditReason && <Typography variant="caption" sx={{ color: shell.red, display: 'block', mt: 0.5 }}>{row.auditReason}</Typography>}
                </TableCell>
                <TableCell>{formatDate(row.createdAt, 'yyyy-MM-dd HH:mm')}</TableCell>
                <TableCell align="center">
                  {canReview && row.status === '待审核' ? (
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Button size="small" variant="contained" color="success" startIcon={<CheckCircleOutlineIcon />} onClick={() => handleApprove(row)}>
                        通过
                      </Button>
                      <Button size="small" variant="outlined" color="error" startIcon={<HighlightOffIcon />} onClick={() => setRejecting(row)}>
                        驳回
                      </Button>
                    </Stack>
                  ) : (
                    <Typography variant="caption" sx={{ color: shell.muted }}>-</Typography>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={10} align="center" sx={{ py: 6, color: '#9ca3af' }}>
                  暂无退款挽回单
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
        sx={{ border: `1px solid ${shell.line}`, borderTop: 0, bgcolor: '#fff' }}
      />

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>新建退款挽回单</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2, pt: 1 }}>
            <TextField label="客户姓名" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
            <TextField label="客户手机号" value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} />
            <TextField label="客户微信" value={form.customerWechat} onChange={(event) => setForm({ ...form, customerWechat: event.target.value })} />
            <TextField label="第三方平台订单号" value={form.thirdPartyOrderNo} onChange={(event) => setForm({ ...form, thirdPartyOrderNo: event.target.value })} required />
            <TextField label="来源平台" value={form.sourcePlatform} onChange={(event) => setForm({ ...form, sourcePlatform: event.target.value })} placeholder="抖音/小红书/第三方小店等" />
            <TextField label="原购买产品" value={form.originalProduct} onChange={(event) => setForm({ ...form, originalProduct: event.target.value })} required />
            <TextField label="原付款金额" type="number" value={form.originalAmount} onChange={(event) => setForm({ ...form, originalAmount: event.target.value })} />
            <TextField label="挽回成交金额" type="number" value={form.recoveryAmount} onChange={(event) => setForm({ ...form, recoveryAmount: event.target.value })} required />
            <TextField label="退款状态" value={form.refundStatus} onChange={(event) => setForm({ ...form, refundStatus: event.target.value })} />
            <TextField select label="挽回人员" value={form.recoveryUserId} onChange={(event) => setForm({ ...form, recoveryUserId: event.target.value })} required>
              {activeUsers.map((user) => <MenuItem key={user.id} value={user.id}>{user.name} · {user.role}</MenuItem>)}
            </TextField>
            <TextField select label="协同人员" value={form.assistUserId} onChange={(event) => setForm({ ...form, assistUserId: event.target.value })}>
              <MenuItem value="">无</MenuItem>
              {activeUsers.map((user) => <MenuItem key={user.id} value={user.id}>{user.name} · {user.role}</MenuItem>)}
            </TextField>
            <TextField label="收款凭证" value={form.paymentVoucher} onChange={(event) => setForm({ ...form, paymentVoucher: event.target.value })} placeholder="填写凭证文件名或链接" />
            <TextField label="聊天记录截图" value={form.chatEvidence} onChange={(event) => setForm({ ...form, chatEvidence: event.target.value })} placeholder="填写截图文件名或链接" />
            <TextField label="备注" value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} multiline minRows={3} sx={{ gridColumn: { md: '1 / -1' } }} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleCreate}>提交审核</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(rejecting)} onClose={() => setRejecting(null)} maxWidth="xs" fullWidth>
        <DialogTitle>驳回挽回单</DialogTitle>
        <DialogContent dividers>
          <TextField label="驳回原因" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} multiline minRows={3} fullWidth required />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejecting(null)}>取消</Button>
          <Button color="error" variant="contained" onClick={handleReject}>确认驳回</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RecoveryOrderTab;
