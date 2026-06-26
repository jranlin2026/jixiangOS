import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/Restore';
import { departmentApi, settingsApi } from '../../api';
import type { Department } from '../../types/department';
import type { User } from '../../types/settings';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { formatDate } from '../../shared/utils/formatters';

const AccountRecycleBin: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { alert, confirm, dialog } = useAppFeedback();

  const load = async () => {
    const res = await settingsApi.fetchUsers({ employmentStatus: 'left' });
    if (res.code === 0) setUsers(res.data);
  };

  useEffect(() => {
    load();
    departmentApi.getDepartments().then((res) => {
      if (res.code === 0) setDepartments(res.data);
    });
  }, []);

  useEffect(() => {
    const maxPage = Math.max(Math.ceil(users.length / rowsPerPage) - 1, 0);
    if (page > maxPage) setPage(maxPage);
  }, [page, rowsPerPage, users.length]);

  const paginatedUsers = useMemo(() => (
    users.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
  ), [page, rowsPerPage, users]);

  const getDepartmentName = (departmentId?: string) => departments.find((department) => department.id === departmentId)?.name || '-';

  const handlePageChange = (_event: unknown, nextPage: number) => {
    setPage(nextPage);
  };

  const handleRowsPerPageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(Number(event.target.value));
    setPage(0);
  };

  const restore = async (user: User) => {
    setError('');
    const res = await settingsApi.restoreUser(user.id);
    if (res.code !== 0) {
      await alert(res.message || '恢复账号失败', '恢复失败');
      return;
    }
    await load();
  };

  const remove = async (user: User) => {
    setError('');
    if (user.account === 'admin') {
      setError('内置管理员账号不能删除');
      return;
    }
    if (!await confirm(`确认永久删除账号 ${user.name} 吗？该操作不可恢复，但不会清除历史线索、客户、订单等业务记录。`, '永久删除账号')) return;
    const res = await settingsApi.deleteUser(user.id);
    if (res.code !== 0) {
      await alert(res.message || '永久删除账号失败', '删除失败');
      return;
    }
    await load();
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>账号回收站</Typography>
        <Typography variant="body2" sx={{ color: '#64748b' }}>
          离职账号不会从历史业务数据中消失，可在这里恢复或永久删除。
        </Typography>
      </Box>

      {error && <Typography variant="body2" sx={{ color: '#d32f2f', mb: 1 }}>{error}</Typography>}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: '4px 4px 0 0', overflowX: 'auto' }}>
        <Table sx={{ minWidth: 980, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f5f8fc' }}>
              <TableCell>姓名</TableCell>
              <TableCell>账号</TableCell>
              <TableCell>手机</TableCell>
              <TableCell>部门</TableCell>
              <TableCell>职位</TableCell>
              <TableCell>角色</TableCell>
              <TableCell>离职时间</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedUsers.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{user.name}</TableCell>
                <TableCell>{user.account || '-'}</TableCell>
                <TableCell>{user.phone || '-'}</TableCell>
                <TableCell>{getDepartmentName(user.departmentId)}</TableCell>
                <TableCell>{user.positionName || '-'}</TableCell>
                <TableCell>{user.role || '-'}</TableCell>
                <TableCell>{user.leftAt ? formatDate(user.leftAt) : '-'}</TableCell>
                <TableCell><Chip label="离职" size="small" /></TableCell>
                <TableCell align="center">
                  <Tooltip title="恢复账号">
                    <IconButton size="small" color="primary" onClick={() => restore(user)}>
                      <RestoreIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="永久删除账号">
                    <IconButton size="small" color="error" onClick={() => remove(user)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                  暂无离职账号
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component="div"
        count={users.length}
        page={page}
        rowsPerPage={rowsPerPage}
        rowsPerPageOptions={[10, 20, 50, 100]}
        onPageChange={handlePageChange}
        onRowsPerPageChange={handleRowsPerPageChange}
        labelRowsPerPage="每页条数"
        labelDisplayedRows={({ from, to, count }) => (count === 0 ? `0 / 共 ${count} 条` : `${from}-${to} / 共 ${count} 条`)}
        sx={{
          border: '1px solid #e5e7eb',
          borderTop: 0,
          borderRadius: '0 0 4px 4px',
          bgcolor: '#fff',
          '& .MuiTablePagination-toolbar': { minHeight: 48 },
        }}
      />
      {dialog}
    </Box>
  );
};

export default AccountRecycleBin;
