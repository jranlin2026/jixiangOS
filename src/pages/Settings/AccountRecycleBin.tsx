import React, { useEffect, useState } from 'react';
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
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import RestoreIcon from '@mui/icons-material/Restore';
import { settingsApi } from '../../api';
import type { User } from '../../types/settings';
import useAppFeedback from '../../shared/hooks/useAppFeedback';

const AccountRecycleBin: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState('');
  const { confirm, dialog } = useAppFeedback();

  const load = async () => {
    const res = await settingsApi.fetchUsers({ isActive: false });
    if (res.code === 0) setUsers(res.data);
  };

  useEffect(() => {
    load();
  }, []);

  const restore = async (user: User) => {
    setError('');
    await settingsApi.updateUser(user.id, { isActive: true });
    await load();
  };

  const remove = async (user: User) => {
    setError('');
    if (user.account === 'admin') {
      setError('内置管理员账号不能删除');
      return;
    }
    if (!await confirm(`确认彻底删除账号 ${user.name} 吗？`, '删除账号')) return;
    await settingsApi.deleteUser(user.id);
    await load();
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>账号回收站</Typography>
        <Typography variant="body2" sx={{ color: '#64748b' }}>
          停用账号不会从历史业务数据中消失，可在这里恢复或删除。
        </Typography>
      </Box>

      {error && <Typography variant="body2" sx={{ color: '#d32f2f', mb: 1 }}>{error}</Typography>}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #eef2f7' }}>
        <Table sx={{ minWidth: 760, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell>姓名</TableCell>
              <TableCell>账号</TableCell>
              <TableCell>手机</TableCell>
              <TableCell>职位</TableCell>
              <TableCell>角色</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{user.name}</TableCell>
                <TableCell>{user.account || '-'}</TableCell>
                <TableCell>{user.phone || '-'}</TableCell>
                <TableCell>{user.positionName || '-'}</TableCell>
                <TableCell>{user.role || '-'}</TableCell>
                <TableCell><Chip label="停用" size="small" /></TableCell>
                <TableCell align="center">
                  <Tooltip title="恢复账号">
                    <IconButton size="small" color="primary" onClick={() => restore(user)}>
                      <RestoreIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除账号">
                    <IconButton size="small" color="error" onClick={() => remove(user)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {users.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                  暂无停用账号
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      {dialog}
    </Box>
  );
};

export default AccountRecycleBin;
