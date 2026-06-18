import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, Dialog, TextField, MenuItem,
  IconButton, Switch,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { settingsApi } from '../../api';
import type { User, UserRole } from '../../types/settings';
import { formatDate } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: '销售' as UserRole, isActive: true, departmentId: '', roleId: '' });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const res = await settingsApi.fetchUsers();
    if (res.code === 0) setUsers(res.data);
  };

  const handleCreate = () => {
    setEditUser(null);
    setForm({ name: '', email: '', phone: '', role: '销售', isActive: true, departmentId: '', roleId: '' });
    setFormOpen(true);
  };

  const handleEdit = (user: User) => {
    setEditUser(user);
    setForm({ name: user.name, email: user.email, phone: user.phone, role: user.role, isActive: user.isActive, departmentId: user.departmentId || '', roleId: user.roleId || '' });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (editUser) {
      await settingsApi.updateUser(editUser.id, form);
    } else {
      await settingsApi.createUser(form);
    }
    setFormOpen(false);
    loadUsers();
  };

  const handleDelete = async (id: string) => {
    await settingsApi.deleteUser(id);
    loadUsers();
  };

  const handleToggleActive = async (user: User) => {
    await settingsApi.updateUser(user.id, { isActive: !user.isActive });
    loadUsers();
  };

  const roles: UserRole[] = ['超级管理员', '管理员', '销售经理', '销售', '运营', '财务'];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>用户列表</Typography>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleCreate}>
          新增用户
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>姓名</TableCell>
              <TableCell>邮箱</TableCell>
              <TableCell>电话</TableCell>
              <TableCell>角色</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{user.name}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell>{user.phone}</TableCell>
                <TableCell>
                  <Chip label={user.role} size="small" variant="outlined" />
                </TableCell>
                <TableCell>
                  <Chip label={user.isActive ? '启用' : '停用'} size="small" color={user.isActive ? 'success' : 'default'} />
                </TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
                <TableCell align="center">
                  <Switch checked={user.isActive} size="small" onChange={() => handleToggleActive(user)} />
                  <IconButton size="small" onClick={() => handleEdit(user)} title="编辑">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(user.id)} title="删除">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setFormOpen(false)}>{editUser ? '编辑用户' : '新增用户'}</DialogCloseTitle>
        <Box sx={{ p: 3, pt: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="姓名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required fullWidth />
            <TextField label="邮箱" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required fullWidth />
            <TextField label="电话" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required fullWidth />
            <TextField select label="角色" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} fullWidth>
              {roles.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </TextField>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            <Button variant="contained" onClick={handleSubmit} disabled={!form.name || !form.email}>
              {editUser ? '保存' : '创建'}
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
};

export default UserManagement;
