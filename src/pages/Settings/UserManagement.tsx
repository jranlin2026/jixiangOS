import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  MenuItem,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import KeyIcon from '@mui/icons-material/Key';
import { settingsApi } from '../../api';
import type { User, UserRole } from '../../types/settings';
import { formatDate } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import { DEFAULT_USER_PASSWORD } from '../../shared/utils/auth';
import { roleApi } from '../../api';
import type { Role } from '../../types/role';
import { DEFAULT_USER_ROLE, normalizeUserRoleName } from '../../shared/utils/roles';

type UserForm = {
  name: string;
  account: string;
  email: string;
  phone: string;
  role: UserRole;
  isActive: boolean;
  password: string;
};

const emptyForm: UserForm = {
  name: '',
  account: '',
  email: '',
  phone: '',
  role: DEFAULT_USER_ROLE,
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
};

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState(DEFAULT_USER_PASSWORD);
  const [error, setError] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);

  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)),
    [users],
  );

  useEffect(() => {
    loadUsers();
    loadRoles();
  }, []);

  const loadUsers = async () => {
    const res = await settingsApi.fetchUsers();
    if (res.code === 0) setUsers(res.data);
  };

  const loadRoles = async () => {
    const res = await roleApi.getRoles({ isActive: true });
    if (res.code === 0) setRoles(res.data.filter((role) => role.isActive));
  };

  const roleOptions = roles.length ? roles : [
    { id: 'fallback-sales', name: DEFAULT_USER_ROLE },
  ] as Role[];

  const resolveRoleId = (roleName: string) => roles.find((role) => role.name === roleName)?.id || '';

  const handleCreate = () => {
    setError('');
    setEditUser(null);
    setForm({ ...emptyForm, role: roleOptions[0]?.name || DEFAULT_USER_ROLE });
    setFormOpen(true);
  };

  const handleEdit = (user: User) => {
    setError('');
    setEditUser(user);
    setForm({
      name: user.name,
      account: user.account || '',
      email: user.email || '',
      phone: user.phone || '',
      role: normalizeUserRoleName(user.role),
      isActive: user.isActive,
      password: '',
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    setError('');
    if (!form.name.trim() || !form.account.trim()) {
      setError('姓名和账号不能为空');
      return;
    }
    if (!editUser && (!form.password || form.password.length < 6)) {
      setError('初始密码至少 6 位');
      return;
    }

    const payload = {
      name: form.name.trim(),
      account: form.account.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      role: form.role,
      roleId: resolveRoleId(form.role),
      isActive: form.isActive,
      password: form.password,
    };

    const res = editUser
      ? await settingsApi.updateUser(editUser.id, payload)
      : await settingsApi.createUser(payload);

    if (res.code !== 0) {
      setError(res.message || '保存失败');
      return;
    }

    setFormOpen(false);
    await loadUsers();
  };

  const handleDelete = async (user: User) => {
    if (user.account === 'admin') {
      setError('内置管理员账号不能删除');
      return;
    }
    const confirmed = window.confirm(`确认删除用户 ${user.name} 吗？`);
    if (!confirmed) return;
    await settingsApi.deleteUser(user.id);
    loadUsers();
  };

  const handleToggleActive = async (user: User) => {
    if (user.account === 'admin' && user.isActive) {
      setError('内置管理员账号不能停用');
      return;
    }
    await settingsApi.updateUser(user.id, { isActive: !user.isActive });
    loadUsers();
  };

  const handleOpenResetPassword = (user: User) => {
    setError('');
    setResetUser(user);
    setResetPassword(DEFAULT_USER_PASSWORD);
  };

  const handleResetPassword = async () => {
    if (!resetUser) return;
    if (!resetPassword || resetPassword.length < 6) {
      setError('新密码至少 6 位');
      return;
    }
    const res = await settingsApi.resetUserPassword(resetUser.id, resetPassword);
    if (res.code !== 0) {
      setError(res.message || '重置密码失败');
      return;
    }
    setResetUser(null);
    await loadUsers();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, gap: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>用户账号管理</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            管理登录账号、角色权限、启停状态和密码重置。
          </Typography>
        </Box>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleCreate}>
          新增用户
        </Button>
      </Box>

      {error && (
        <Typography variant="body2" sx={{ color: '#d32f2f', mb: 1 }}>
          {error}
        </Typography>
      )}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>姓名</TableCell>
              <TableCell>账号</TableCell>
              <TableCell>手机号</TableCell>
              <TableCell>邮箱</TableCell>
              <TableCell>角色</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>最后登录</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sortedUsers.map((user) => (
              <TableRow key={user.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{user.name}</TableCell>
                <TableCell>{user.account || '-'}</TableCell>
                <TableCell>{user.phone || '-'}</TableCell>
                <TableCell>{user.email || '-'}</TableCell>
                <TableCell><Chip label={normalizeUserRoleName(user.role)} size="small" variant="outlined" /></TableCell>
                <TableCell>
                  <Chip label={user.isActive ? '启用' : '停用'} size="small" color={user.isActive ? 'success' : 'default'} />
                </TableCell>
                <TableCell>{user.lastLoginAt ? formatDate(user.lastLoginAt, 'yyyy-MM-dd HH:mm') : '-'}</TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
                <TableCell align="center">
                  <Switch checked={user.isActive} size="small" onChange={() => handleToggleActive(user)} />
                  <Tooltip title="编辑资料">
                    <IconButton size="small" onClick={() => handleEdit(user)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="重置密码">
                    <IconButton size="small" color="info" onClick={() => handleOpenResetPassword(user)}>
                      <KeyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton size="small" color="error" onClick={() => handleDelete(user)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setFormOpen(false)}>{editUser ? '编辑用户' : '新增用户'}</DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="姓名" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required fullWidth />
            <TextField label="登录账号" value={form.account} onChange={(event) => setForm({ ...form, account: event.target.value })} required fullWidth />
            <TextField label="手机号" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} fullWidth />
            <TextField label="邮箱" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} fullWidth />
            <TextField select label="角色" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })} fullWidth>
              {roleOptions.map((role) => <MenuItem key={role.id} value={role.name}>{role.name}</MenuItem>)}
            </TextField>
            {!editUser && (
              <TextField
                label="初始密码"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                required
                fullWidth
              />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleSubmit}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(resetUser)} onClose={() => setResetUser(null)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setResetUser(null)}>重置密码</DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#6b7280', mb: 2 }}>
            将为 {resetUser?.name} 设置新的登录密码，原密码不会显示。
          </Typography>
          <TextField
            label="新密码"
            type="password"
            value={resetPassword}
            onChange={(event) => setResetPassword(event.target.value)}
            fullWidth
            required
          />
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleResetPassword}>确认重置</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default UserManagement;
