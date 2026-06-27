import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  IconButton,
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
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import RefreshIcon from '@mui/icons-material/Refresh';
import RestoreIcon from '@mui/icons-material/Restore';
import { businessRecycleBinApi } from '../../api';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import useAuthStore from '../../store/useAuthStore';
import { formatDate, formatPaginationRows } from '../../shared/utils/formatters';
import { isSuperAdminRoleName } from '../../shared/utils/roles';
import type { BusinessRecycleBinItem, BusinessRecycleBinType } from '../../types/businessRecycleBin';

const TYPE_OPTIONS: Array<{ value: BusinessRecycleBinType | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'lead', label: '线索' },
  { value: 'customer', label: '客户' },
  { value: 'order', label: '订单' },
];

const getTypeChipColor = (type: BusinessRecycleBinType) => {
  if (type === 'lead') return 'info';
  if (type === 'customer') return 'success';
  return 'warning';
};

const getTypeLabel = (type: BusinessRecycleBinType) => TYPE_OPTIONS.find((item) => item.value === type)?.label || type;

const BusinessRecycleBin: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const isSuperAdmin = isSuperAdminRoleName(currentUser?.role);
  const { alert, confirm, dialog } = useAppFeedback();
  const [type, setType] = useState<BusinessRecycleBinType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [rows, setRows] = useState<BusinessRecycleBinItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<BusinessRecycleBinItem | null>(null);
  const [purgeReason, setPurgeReason] = useState('');
  const [purging, setPurging] = useState(false);

  const load = async () => {
    if (!isSuperAdmin) return;
    setLoading(true);
    const res = await businessRecycleBinApi.fetchRecycleBinItems({
      type,
      search,
      page: page + 1,
      pageSize: rowsPerPage,
    });
    setLoading(false);
    if (res.code !== 0) {
      await alert(res.message || '读取业务回收站失败', '读取失败');
      return;
    }
    setRows(res.data.items);
    setTotal(res.data.pagination.total);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuperAdmin, type, page, rowsPerPage]);

  const currentTypeLabel = useMemo(() => (
    type === 'all' ? '全部业务' : getTypeLabel(type)
  ), [type]);

  const handleSearch = () => {
    setPage(0);
    load();
  };

  const handleRestore = async (item: BusinessRecycleBinItem) => {
    const ok = await confirm(`确认恢复 ${getTypeLabel(item.type)}「${item.title}」吗？恢复后会回到原业务列表。`, '恢复业务数据');
    if (!ok) return;
    const res = await businessRecycleBinApi.restoreRecycleBinItem(item.type, item.id);
    if (res.code !== 0) {
      await alert(res.message || '恢复失败', '恢复失败');
      return;
    }
    await load();
  };

  const openPurgeDialog = (item: BusinessRecycleBinItem) => {
    setPurgeTarget(item);
    setPurgeReason('');
  };

  const closePurgeDialog = () => {
    if (purging) return;
    setPurgeTarget(null);
    setPurgeReason('');
  };

  const confirmPurge = async () => {
    if (!purgeTarget || !purgeReason.trim()) return;
    setPurging(true);
    const res = await businessRecycleBinApi.permanentlyDeleteRecycleBinItem(
      purgeTarget.type,
      purgeTarget.id,
      purgeReason,
    );
    setPurging(false);
    if (res.code !== 0) {
      await alert(res.message || '永久删除失败', '删除失败');
      return;
    }
    closePurgeDialog();
    await load();
  };

  if (!isSuperAdmin) {
    return (
      <Alert severity="warning">
        业务回收站仅超级管理员可用。
      </Alert>
    );
  }

  return (
    <Box>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ xs: 'stretch', md: 'center' }} justifyContent="space-between" sx={{ mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>业务回收站</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            统一处理已删除的线索、客户和订单，恢复或永久删除都会留下明确操作边界。
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
          {loading ? '刷新中...' : '刷新'}
        </Button>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>类型</InputLabel>
          <Select
            label="类型"
            value={type}
            onChange={(event) => {
              setType(event.target.value as BusinessRecycleBinType | 'all');
              setPage(0);
            }}
          >
            {TYPE_OPTIONS.map((item) => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSearch();
          }}
          placeholder="搜索名称/编号/负责人"
          sx={{ minWidth: { xs: '100%', md: 320 } }}
        />
        <Button variant="contained" onClick={handleSearch}>搜索</Button>
      </Stack>

      <Alert severity="info" sx={{ mb: 2 }}>
        当前筛选：{currentTypeLabel}。普通业务列表、分配、统计、提成和交付入口默认不会读取回收站数据。
      </Alert>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '4px 4px 0 0', overflowX: 'auto' }}>
        <Table sx={{ minWidth: 980 }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell>类型</TableCell>
              <TableCell>名称/编号</TableCell>
              <TableCell>负责人</TableCell>
              <TableCell>删除人</TableCell>
              <TableCell>删除时间</TableCell>
              <TableCell>删除原因</TableCell>
              <TableCell>关联状态</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((item) => (
              <TableRow key={`${item.type}-${item.id}`} hover>
                <TableCell>
                  <Chip label={getTypeLabel(item.type)} size="small" color={getTypeChipColor(item.type)} />
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.title}</Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>{item.subtitle || '-'}</Typography>
                </TableCell>
                <TableCell>{item.owner || '-'}</TableCell>
                <TableCell>{item.deletedBy || '-'}</TableCell>
                <TableCell>{item.deletedAt ? formatDate(item.deletedAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</TableCell>
                <TableCell sx={{ maxWidth: 240, whiteSpace: 'normal' }}>{item.deleteReason || '-'}</TableCell>
                <TableCell>{item.relationStatus}</TableCell>
                <TableCell align="center">
                  <Tooltip title="恢复">
                    <IconButton size="small" color="primary" onClick={() => handleRestore(item)}>
                      <RestoreIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="永久删除">
                    <IconButton size="small" color="error" onClick={() => openPurgeDialog(item)}>
                      <DeleteForeverIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!rows.length && (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                  {loading ? '加载中...' : '暂无回收站数据'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[10, 20, 50, 100]}
        onPageChange={(_event, nextPage) => setPage(nextPage)}
        onRowsPerPageChange={(event) => {
          setRowsPerPage(Number(event.target.value));
          setPage(0);
        }}
        labelRowsPerPage="每页条数"
        labelDisplayedRows={formatPaginationRows}
        sx={{
          border: '1px solid #e5e7eb',
          borderTop: 0,
          borderRadius: '0 0 4px 4px',
          bgcolor: '#fff',
          '& .MuiTablePagination-toolbar': { minHeight: 48 },
        }}
      />

      <Dialog open={Boolean(purgeTarget)} onClose={closePurgeDialog} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={closePurgeDialog}>永久删除业务数据</DialogCloseTitle>
        <DialogContent dividers>
          {purgeTarget && (
            <Stack spacing={2}>
              <Alert severity="warning">
                将永久删除 {getTypeLabel(purgeTarget.type)}「{purgeTarget.title}」。该操作不可恢复，请确认不是误删。
              </Alert>
              <TextField
                label="永久删除原因"
                value={purgeReason}
                onChange={(event) => setPurgeReason(event.target.value)}
                required
                multiline
                minRows={2}
                fullWidth
                autoFocus
              />
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closePurgeDialog} disabled={purging}>取消</Button>
          <Button color="error" variant="contained" onClick={confirmPurge} disabled={purging || !purgeReason.trim()}>
            {purging ? '删除中...' : '确认永久删除'}
          </Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </Box>
  );
};

export default BusinessRecycleBin;
