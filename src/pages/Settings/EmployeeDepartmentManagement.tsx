import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  IconButton,
  InputAdornment,
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
import BusinessIcon from '@mui/icons-material/Business';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import FolderIcon from '@mui/icons-material/Folder';
import KeyIcon from '@mui/icons-material/Key';
import SearchIcon from '@mui/icons-material/Search';
import SubdirectoryArrowRightIcon from '@mui/icons-material/SubdirectoryArrowRight';
import useDepartmentStore from '../../store/useDepartmentStore';
import { settingsApi } from '../../api';
import { roleApi } from '../../api';
import type { Department } from '../../types/department';
import type { Role } from '../../types/role';
import type { User, UserRole } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { DEFAULT_USER_PASSWORD } from '../../shared/utils/auth';
import { DEFAULT_USER_ROLE, normalizeUserRoleName } from '../../shared/utils/roles';

type UserForm = {
  name: string;
  account: string;
  email: string;
  phone: string;
  role: UserRole;
  departmentId: string;
  isActive: boolean;
  password: string;
};

type DepartmentForm = {
  name: string;
  code: string;
  description: string;
  parentId: string;
  managerId: string;
  isActive: boolean;
};

const ALL_DEPARTMENTS = '__all__';

const emptyUserForm: UserForm = {
  name: '',
  account: '',
  email: '',
  phone: '',
  role: DEFAULT_USER_ROLE,
  departmentId: '',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
};

const emptyDepartmentForm: DepartmentForm = {
  name: '',
  code: '',
  description: '',
  parentId: '',
  managerId: '',
  isActive: true,
};

function buildDepartmentTree(departments: Department[]) {
  const byParent = new Map<string, Department[]>();
  departments.forEach((department) => {
    const key = department.parentId || '';
    byParent.set(key, [...(byParent.get(key) || []), department]);
  });
  byParent.forEach((items) => items.sort((a, b) => a.name.localeCompare(b.name)));
  return byParent;
}

function collectDepartmentIds(departments: Department[], departmentId: string): string[] {
  const children = departments.filter((department) => department.parentId === departmentId);
  return [departmentId, ...children.flatMap((child) => collectDepartmentIds(departments, child.id))];
}

const EmployeeDepartmentManagement: React.FC = () => {
  const { items: departments, fetchItems, create, update, delete: deleteDepartment } = useDepartmentStore();
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(ALL_DEPARTMENTS);
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [departmentFormOpen, setDepartmentFormOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentForm, setDepartmentForm] = useState<DepartmentForm>(emptyDepartmentForm);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDepartmentId, setMoveDepartmentId] = useState('');
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState(DEFAULT_USER_PASSWORD);
  const [error, setError] = useState('');
  const { confirm, dialog: feedbackDialog } = useAppFeedback();

  useEffect(() => {
    fetchItems();
    loadUsers();
    loadRoles();
  }, [fetchItems]);

  const loadUsers = async () => {
    const res = await settingsApi.fetchUsers();
    if (res.code === 0) setUsers(res.data);
  };

  const loadRoles = async () => {
    const res = await roleApi.getRoles({ isActive: true });
    if (res.code === 0) setRoles(res.data.filter((role) => role.isActive));
  };

  const activeDepartments = useMemo(() => departments.filter((department) => department.isActive), [departments]);
  const departmentByParent = useMemo(() => buildDepartmentTree(activeDepartments), [activeDepartments]);
  const selectedDepartment = activeDepartments.find((department) => department.id === selectedDepartmentId) || null;
  const roleOptions = roles.length ? roles : [{ id: 'fallback-sales', name: DEFAULT_USER_ROLE }] as Role[];

  const departmentIdsInScope = useMemo(() => (
    selectedDepartment ? collectDepartmentIds(activeDepartments, selectedDepartment.id) : activeDepartments.map((department) => department.id)
  ), [activeDepartments, selectedDepartment]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((user) => (
        selectedDepartmentId === ALL_DEPARTMENTS
        || (user.departmentId && departmentIdsInScope.includes(user.departmentId))
      ))
      .filter((user) => {
        if (!q) return true;
        const department = activeDepartments.find((item) => item.id === user.departmentId);
        return user.name.toLowerCase().includes(q)
          || (user.account || '').toLowerCase().includes(q)
          || (user.phone || '').includes(q)
          || normalizeUserRoleName(user.role).toLowerCase().includes(q)
          || (department?.name || '').toLowerCase().includes(q);
      })
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  }, [activeDepartments, departmentIdsInScope, search, selectedDepartmentId, users]);

  const selectedUsers = users.filter((user) => selectedUserIds.includes(user.id));
  const selectedDepartmentUserCount = filteredUsers.length;

  const resolveRoleId = (roleName: string) => roles.find((role) => role.name === roleName)?.id || '';
  const getDepartmentName = (departmentId?: string) => activeDepartments.find((department) => department.id === departmentId)?.name || '-';

  const clearSelection = () => setSelectedUserIds([]);

  const openCreateUser = () => {
    setError('');
    setEditingUser(null);
    setUserForm({
      ...emptyUserForm,
      role: roleOptions[0]?.name || DEFAULT_USER_ROLE,
      departmentId: selectedDepartment?.id || activeDepartments[0]?.id || '',
    });
    setUserFormOpen(true);
  };

  const openEditUser = (user: User) => {
    setError('');
    setEditingUser(user);
    setUserForm({
      name: user.name,
      account: user.account || '',
      email: user.email || '',
      phone: user.phone || '',
      role: normalizeUserRoleName(user.role),
      departmentId: user.departmentId || '',
      isActive: user.isActive,
      password: '',
    });
    setUserFormOpen(true);
  };

  const handleSaveUser = async () => {
    setError('');
    if (!userForm.name.trim() || !userForm.account.trim()) {
      setError('姓名和账号不能为空');
      return;
    }
    if (!editingUser && (!userForm.password || userForm.password.length < 6)) {
      setError('初始密码至少 6 位');
      return;
    }
    const payload = {
      name: userForm.name.trim(),
      account: userForm.account.trim(),
      email: userForm.email.trim(),
      phone: userForm.phone.trim(),
      role: userForm.role,
      roleId: resolveRoleId(userForm.role),
      departmentId: userForm.departmentId || undefined,
      isActive: userForm.isActive,
      password: userForm.password,
    };
    const res = editingUser
      ? await settingsApi.updateUser(editingUser.id, payload)
      : await settingsApi.createUser(payload);
    if (res.code !== 0) {
      setError(res.message || '保存失败');
      return;
    }
    setUserFormOpen(false);
    await loadUsers();
    await fetchItems();
  };

  const handleToggleUserActive = async (user: User) => {
    if (user.account === 'admin' && user.isActive) {
      setError('内置管理员账号不能停用');
      return;
    }
    await settingsApi.updateUser(user.id, { isActive: !user.isActive });
    await loadUsers();
  };

  const handleDeleteUser = async (user: User) => {
    if (user.account === 'admin') {
      setError('内置管理员账号不能删除');
      return;
    }
    if (!await confirm(`确认删除员工 ${user.name} 吗？`, '删除员工')) return;
    await settingsApi.deleteUser(user.id);
    clearSelection();
    await loadUsers();
  };

  const openResetPassword = (user: User) => {
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
  };

  const openCreateDepartment = (parentId = selectedDepartment?.id || '') => {
    setError('');
    setEditingDepartment(null);
    setDepartmentForm({
      ...emptyDepartmentForm,
      parentId,
      code: `dept-${Date.now()}`,
    });
    setDepartmentFormOpen(true);
  };

  const openEditDepartment = () => {
    if (!selectedDepartment) return;
    setError('');
    setEditingDepartment(selectedDepartment);
    setDepartmentForm({
      name: selectedDepartment.name,
      code: selectedDepartment.code,
      description: selectedDepartment.description || '',
      parentId: selectedDepartment.parentId || '',
      managerId: selectedDepartment.managerId || '',
      isActive: selectedDepartment.isActive,
    });
    setDepartmentFormOpen(true);
  };

  const handleSaveDepartment = async () => {
    setError('');
    if (!departmentForm.name.trim()) {
      setError('部门名称不能为空');
      return;
    }
    const payload = {
      name: departmentForm.name.trim(),
      code: departmentForm.code.trim() || `dept-${Date.now()}`,
      description: departmentForm.description.trim(),
      parentId: departmentForm.parentId || undefined,
      managerId: departmentForm.managerId || undefined,
      memberCount: users.filter((user) => user.departmentId === editingDepartment?.id).length,
      isActive: departmentForm.isActive,
    };
    if (editingDepartment) {
      await update(editingDepartment.id, payload);
    } else {
      await create(payload);
    }
    setDepartmentFormOpen(false);
    await fetchItems();
  };

  const handleDeleteDepartment = async () => {
    if (!selectedDepartment) return;
    const hasChildren = activeDepartments.some((department) => department.parentId === selectedDepartment.id);
    const hasUsers = users.some((user) => user.departmentId === selectedDepartment.id);
    if (hasChildren || hasUsers) {
      setError('请先移走该部门下的员工和子部门，再删除部门');
      return;
    }
    if (!await confirm(`确认删除部门 ${selectedDepartment.name} 吗？`, '删除部门')) return;
    await deleteDepartment(selectedDepartment.id);
    setSelectedDepartmentId(ALL_DEPARTMENTS);
    await fetchItems();
  };

  const handleBatchActive = async (isActive: boolean) => {
    const targets = selectedUsers.filter((user) => !(user.account === 'admin' && !isActive));
    await Promise.all(targets.map((user) => settingsApi.updateUser(user.id, { isActive })));
    clearSelection();
    await loadUsers();
  };

  const handleOpenMove = () => {
    setMoveDepartmentId(selectedDepartment?.id || activeDepartments[0]?.id || '');
    setMoveOpen(true);
  };

  const handleMoveUsers = async () => {
    if (!moveDepartmentId) return;
    await Promise.all(selectedUsers.map((user) => settingsApi.updateUser(user.id, { departmentId: moveDepartmentId })));
    setMoveOpen(false);
    clearSelection();
    await loadUsers();
    await fetchItems();
  };

  const toggleUserSelected = (id: string) => {
    setSelectedUserIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  };

  const setAllFilteredSelected = (checked: boolean) => {
    setSelectedUserIds(checked ? filteredUsers.map((user) => user.id) : []);
  };

  const renderDepartmentRows = (parentId = '', depth = 0): React.ReactNode => (
    (departmentByParent.get(parentId) || []).map((department) => (
      <React.Fragment key={department.id}>
        <Box
          onClick={() => {
            setSelectedDepartmentId(department.id);
            clearSelection();
          }}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            minHeight: 36,
            pl: 1 + depth * 2,
            pr: 1,
            cursor: 'pointer',
            bgcolor: selectedDepartmentId === department.id ? '#eef2ff' : 'transparent',
            color: selectedDepartmentId === department.id ? '#1d4ed8' : '#111827',
            borderRadius: 0.75,
            '&:hover': { bgcolor: selectedDepartmentId === department.id ? '#eef2ff' : '#f8fafc' },
          }}
        >
          <FolderIcon sx={{ fontSize: 20, color: '#7394c4' }} />
          <Typography variant="body2" sx={{ flex: 1, fontWeight: selectedDepartmentId === department.id ? 600 : 400 }}>
            {department.name}
          </Typography>
          <Typography variant="caption" sx={{ color: '#94a3b8' }}>
            {users.filter((user) => user.departmentId === department.id).length}
          </Typography>
        </Box>
        {renderDepartmentRows(department.id, depth + 1)}
      </React.Fragment>
    ))
  );

  return (
    <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', minHeight: 620, bgcolor: '#fff' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px minmax(0, 1fr)' }, minHeight: 620 }}>
        <Box sx={{ borderRight: { md: '1px solid #e5e7eb' }, bgcolor: '#fbfcfe', p: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              size="small"
              placeholder="搜索员工、部门"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
              }}
            />
            <Tooltip title="新增部门">
              <IconButton sx={{ border: '1px solid #e5e7eb', borderRadius: 1 }} onClick={() => openCreateDepartment('')}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <Box
            onClick={() => {
              setSelectedDepartmentId(ALL_DEPARTMENTS);
              clearSelection();
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              minHeight: 38,
              px: 1,
              mb: 0.5,
              borderRadius: 0.75,
              cursor: 'pointer',
              bgcolor: selectedDepartmentId === ALL_DEPARTMENTS ? '#eef2ff' : 'transparent',
              color: selectedDepartmentId === ALL_DEPARTMENTS ? '#1d4ed8' : '#111827',
              '&:hover': { bgcolor: selectedDepartmentId === ALL_DEPARTMENTS ? '#eef2ff' : '#f8fafc' },
            }}
          >
            <BusinessIcon sx={{ fontSize: 20, color: '#7394c4' }} />
            <Typography variant="body2" sx={{ flex: 1, fontWeight: selectedDepartmentId === ALL_DEPARTMENTS ? 700 : 600 }}>
              全部部门
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>{users.length}</Typography>
          </Box>
          {renderDepartmentRows()}
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ px: 3, py: 2, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>
              {selectedDepartment?.name || '全部部门'}({selectedDepartmentUserCount}人)
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button size="small" onClick={() => openCreateDepartment(selectedDepartment?.id || '')} startIcon={<SubdirectoryArrowRightIcon />}>
                添加子部门
              </Button>
              <Button size="small" onClick={openEditDepartment} disabled={!selectedDepartment} startIcon={<EditIcon />}>
                编辑部门
              </Button>
              <Button size="small" color="error" onClick={handleDeleteDepartment} disabled={!selectedDepartment} startIcon={<DeleteIcon />}>
                删除部门
              </Button>
            </Box>
          </Box>

          <Box sx={{ p: 3 }}>
            {error && (
              <Typography variant="body2" sx={{ color: '#d32f2f', mb: 1 }}>
                {error}
              </Typography>
            )}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
              <Button variant="outlined" onClick={openCreateUser} startIcon={<AddIcon />}>创建员工</Button>
              <Button variant="outlined" onClick={handleOpenMove} disabled={!selectedUserIds.length}>移动</Button>
              <Button variant="outlined" onClick={() => handleBatchActive(false)} disabled={!selectedUserIds.length}>禁用</Button>
              <Button variant="outlined" onClick={() => handleBatchActive(true)} disabled={!selectedUserIds.length}>解禁</Button>
            </Box>

            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #eef2f7' }}>
              <Table sx={{ tableLayout: 'fixed', minWidth: 860 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                        indeterminate={selectedUserIds.length > 0 && selectedUserIds.length < filteredUsers.length}
                        onChange={(event) => setAllFilteredSelected(event.target.checked)}
                      />
                    </TableCell>
                    <TableCell>姓名</TableCell>
                    <TableCell>职务</TableCell>
                    <TableCell>部门</TableCell>
                    <TableCell>账号</TableCell>
                    <TableCell>手机号</TableCell>
                    <TableCell>状态</TableCell>
                    <TableCell align="center">操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.id} hover selected={selectedUserIds.includes(user.id)}>
                      <TableCell padding="checkbox">
                        <Checkbox checked={selectedUserIds.includes(user.id)} onChange={() => toggleUserSelected(user.id)} />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 500 }}>{user.name}</TableCell>
                      <TableCell>{normalizeUserRoleName(user.role)}</TableCell>
                      <TableCell>{getDepartmentName(user.departmentId)}</TableCell>
                      <TableCell>{user.account || '-'}</TableCell>
                      <TableCell>{user.phone || '-'}</TableCell>
                      <TableCell>
                        <Chip label={user.isActive ? '启用' : '禁用'} size="small" color={user.isActive ? 'success' : 'default'} />
                      </TableCell>
                      <TableCell align="center">
                        <Switch checked={user.isActive} size="small" onChange={() => handleToggleUserActive(user)} />
                        <Tooltip title="编辑资料">
                          <IconButton size="small" onClick={() => openEditUser(user)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="重置密码">
                          <IconButton size="small" color="info" onClick={() => openResetPassword(user)}>
                            <KeyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除">
                          <IconButton size="small" color="error" onClick={() => handleDeleteUser(user)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredUsers.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 6, color: '#94a3b8' }}>
                        暂无员工数据
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      </Box>

      <Dialog open={userFormOpen} onClose={() => setUserFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setUserFormOpen(false)}>{editingUser ? '编辑员工' : '创建员工'}</DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="姓名" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} required fullWidth />
            <TextField label="登录账号" value={userForm.account} onChange={(event) => setUserForm({ ...userForm, account: event.target.value })} required fullWidth />
            <TextField label="手机号" value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} fullWidth />
            <TextField label="邮箱" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} fullWidth />
            <TextField select label="部门" value={userForm.departmentId} onChange={(event) => setUserForm({ ...userForm, departmentId: event.target.value })} fullWidth>
              <MenuItem value="">未分配</MenuItem>
              {activeDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
            </TextField>
            <TextField select label="职务" value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value as UserRole })} fullWidth>
              {roleOptions.map((role) => <MenuItem key={role.id} value={role.name}>{role.name}</MenuItem>)}
            </TextField>
            {!editingUser && (
              <TextField
                label="初始密码"
                type="password"
                value={userForm.password}
                onChange={(event) => setUserForm({ ...userForm, password: event.target.value })}
                required
                fullWidth
              />
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch checked={userForm.isActive} onChange={(event) => setUserForm({ ...userForm, isActive: event.target.checked })} />
              <Typography variant="body2">{userForm.isActive ? '启用' : '禁用'}</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleSaveUser}>保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={departmentFormOpen} onClose={() => setDepartmentFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setDepartmentFormOpen(false)}>{editingDepartment ? '编辑部门' : '新增部门'}</DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="部门名称" value={departmentForm.name} onChange={(event) => setDepartmentForm({ ...departmentForm, name: event.target.value })} required fullWidth />
            <TextField label="部门编码" value={departmentForm.code} onChange={(event) => setDepartmentForm({ ...departmentForm, code: event.target.value })} fullWidth />
            <TextField select label="上级部门" value={departmentForm.parentId} onChange={(event) => setDepartmentForm({ ...departmentForm, parentId: event.target.value })} fullWidth>
              <MenuItem value="">无</MenuItem>
              {activeDepartments
                .filter((department) => department.id !== editingDepartment?.id)
                .map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
            </TextField>
            <TextField select label="部门负责人" value={departmentForm.managerId} onChange={(event) => setDepartmentForm({ ...departmentForm, managerId: event.target.value })} fullWidth>
              <MenuItem value="">未设置</MenuItem>
              {users.map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}
            </TextField>
            <TextField label="说明" value={departmentForm.description} onChange={(event) => setDepartmentForm({ ...departmentForm, description: event.target.value })} fullWidth multiline minRows={2} sx={{ gridColumn: '1 / -1' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch checked={departmentForm.isActive} onChange={(event) => setDepartmentForm({ ...departmentForm, isActive: event.target.checked })} />
              <Typography variant="body2">{departmentForm.isActive ? '启用' : '停用'}</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleSaveDepartment}>保存</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={moveOpen} onClose={() => setMoveOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setMoveOpen(false)}>移动员工</DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            已选择 {selectedUserIds.length} 名员工，选择目标部门后会统一更新所属部门。
          </Typography>
          <TextField select label="目标部门" value={moveDepartmentId} onChange={(event) => setMoveDepartmentId(event.target.value)} fullWidth>
            {activeDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleMoveUsers} disabled={!moveDepartmentId}>确认移动</Button>
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
      <Divider />
      {feedbackDialog}
    </Box>
  );
};

export default EmployeeDepartmentManagement;
