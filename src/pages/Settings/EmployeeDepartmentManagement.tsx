import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Menu,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
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
import ApartmentIcon from '@mui/icons-material/Apartment';
import BusinessIcon from '@mui/icons-material/Business';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import FolderIcon from '@mui/icons-material/Folder';
import KeyIcon from '@mui/icons-material/Key';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/Search';
import useDepartmentStore from '../../store/useDepartmentStore';
import { departmentApi, roleApi, settingsApi } from '../../api';
import type { Department } from '../../types/department';
import type { Role } from '../../types/role';
import type { OrganizationProfile, User, UserRole } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { DEFAULT_USER_PASSWORD } from '../../shared/utils/auth';
import {
  getDepartmentAncestorIds,
  getDepartmentDescendantIds,
  isDepartmentDescendantOf,
} from '../../shared/utils/organizationConfig';
import { DEFAULT_USER_ROLE, normalizeUserRoleName } from '../../shared/utils/roles';

type UserForm = {
  name: string;
  account: string;
  email: string;
  phone: string;
  role: UserRole;
  positionName: string;
  departmentId: string;
  isActive: boolean;
  password: string;
};

type DepartmentForm = {
  name: string;
  parentId: string;
};

const COMPANY_ROOT = '__company_root__';

const emptyUserForm: UserForm = {
  name: '',
  account: '',
  email: '',
  phone: '',
  role: DEFAULT_USER_ROLE,
  positionName: '',
  departmentId: '',
  isActive: true,
  password: DEFAULT_USER_PASSWORD,
};

const emptyDepartmentForm: DepartmentForm = {
  name: '',
  parentId: '',
};

function buildDepartmentTree(departments: Department[]) {
  const byParent = new Map<string, Department[]>();
  departments.forEach((department) => {
    const key = department.parentId || '';
    byParent.set(key, [...(byParent.get(key) || []), department]);
  });
  byParent.forEach((items) => items.sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name)));
  return byParent;
}

function makeDepartmentCode(name: string) {
  const suffix = Date.now().toString(36);
  const base = name.trim().replace(/\s+/g, '_').slice(0, 24) || 'department';
  return `${base}_${suffix}`;
}

const EmployeeDepartmentManagement: React.FC = () => {
  const { items: departments, fetchItems } = useDepartmentStore();
  const [organizationProfile, setOrganizationProfile] = useState<OrganizationProfile>({ companyName: '福建极享信息科技有限公司' });
  const [companyExpanded, setCompanyExpanded] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState(COMPANY_ROOT);
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userFormOpen, setUserFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [departmentFormOpen, setDepartmentFormOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentForm, setDepartmentForm] = useState<DepartmentForm>(emptyDepartmentForm);
  const [companyDialogOpen, setCompanyDialogOpen] = useState(false);
  const [companyNameDraft, setCompanyNameDraft] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveDepartmentId, setMoveDepartmentId] = useState('');
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveTargets, setLeaveTargets] = useState<User[]>([]);
  const [leaveOwnedCustomerCount, setLeaveOwnedCustomerCount] = useState(0);
  const [leaveAction, setLeaveAction] = useState<'transfer' | 'public_pool'>('transfer');
  const [leaveReceiverId, setLeaveReceiverId] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [resetUser, setResetUser] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState(DEFAULT_USER_PASSWORD);
  const [error, setError] = useState('');
  const [menuDepartment, setMenuDepartment] = useState<Department | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { alert, confirm, dialog: feedbackDialog } = useAppFeedback();

  useEffect(() => {
    fetchItems();
    loadUsers();
    loadRoles();
    loadOrganizationProfile();
  }, [fetchItems]);

  const loadUsers = async () => {
    const res = await settingsApi.fetchUsers();
    if (res.code === 0) setUsers(res.data);
  };

  const loadRoles = async () => {
    const res = await roleApi.getRoles({ isActive: true });
    if (res.code === 0) setRoles(res.data.filter((role) => role.isActive));
  };

  const loadOrganizationProfile = async () => {
    const res = await settingsApi.fetchOrganizationProfile();
    if (res.code === 0) {
      setOrganizationProfile(res.data);
      setCompanyNameDraft(res.data.companyName);
    }
  };

  const activeDepartments = useMemo(() => departments.filter((department) => department.isActive), [departments]);
  const departmentByParent = useMemo(() => buildDepartmentTree(activeDepartments), [activeDepartments]);
  const selectedDepartment = activeDepartments.find((department) => department.id === selectedNodeId) || null;
  const roleOptions = roles.length ? roles : [{ id: 'fallback-role', name: DEFAULT_USER_ROLE }] as Role[];
  const selectedScopeIds = useMemo(() => (
    selectedDepartment
      ? [selectedDepartment.id, ...getDepartmentDescendantIds(activeDepartments, selectedDepartment.id)]
      : activeDepartments.map((department) => department.id)
  ), [activeDepartments, selectedDepartment]);

  const filteredTreeDepartments = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return activeDepartments;
    const matchedIds = new Set<string>();
    activeDepartments.forEach((department) => {
      const matched = department.name.toLowerCase().includes(q)
        || users.some((user) => user.departmentId === department.id && user.name.toLowerCase().includes(q));
      if (!matched) return;
      matchedIds.add(department.id);
      getDepartmentAncestorIds(activeDepartments, department.id).forEach((id) => matchedIds.add(id));
      getDepartmentDescendantIds(activeDepartments, department.id).forEach((id) => matchedIds.add(id));
    });
    return activeDepartments.filter((department) => matchedIds.has(department.id));
  }, [activeDepartments, search, users]);

  const treeByParent = useMemo(() => buildDepartmentTree(filteredTreeDepartments), [filteredTreeDepartments]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((user) => (
        selectedNodeId === COMPANY_ROOT
        || (user.departmentId && selectedScopeIds.includes(user.departmentId))
      ))
      .filter((user) => {
        if (!q) return true;
        const department = activeDepartments.find((item) => item.id === user.departmentId);
        return user.name.toLowerCase().includes(q)
          || (user.account || '').toLowerCase().includes(q)
          || (user.phone || '').includes(q)
          || (user.positionName || '').toLowerCase().includes(q)
          || normalizeUserRoleName(user.role).toLowerCase().includes(q)
          || (department?.name || '').toLowerCase().includes(q);
      })
      .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name));
  }, [activeDepartments, search, selectedNodeId, selectedScopeIds, users]);

  const selectedUsers = users.filter((user) => selectedUserIds.includes(user.id));
  const selectedTitle = selectedDepartment?.name || organizationProfile.companyName;
  const selectedDepartmentUserCount = filteredUsers.length;
  const activeUserCount = users.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active').length;
  const inactiveUserCount = users.length - activeUserCount;
  const selectedDepartmentDirectUserCount = selectedDepartment
    ? users.filter((user) => user.departmentId === selectedDepartment.id).length
    : users.length;
  const selectedDepartmentChildCount = selectedDepartment
    ? activeDepartments.filter((department) => department.parentId === selectedDepartment.id).length
    : activeDepartments.length;
  const selectedDepartmentParentName = selectedDepartment
    ? activeDepartments.find((department) => department.id === selectedDepartment.parentId)?.name || organizationProfile.companyName
    : '-';
  const leaveTargetIds = leaveTargets.map((user) => user.id);
  const leaveReceiverOptions = users.filter((user) => (
    user.isActive && !leaveTargetIds.includes(user.id) && user.account !== 'admin'
  ));

  const resolveRoleId = (roleName: string) => roles.find((role) => role.name === roleName)?.id || '';
  const getPositionName = (user: User) => user.positionName || '-';
  const getDepartmentName = (departmentId?: string) => activeDepartments.find((department) => department.id === departmentId)?.name || '-';
  const clearSelection = () => setSelectedUserIds([]);

  const countOwnedCustomers = async (targets: User[]) => {
    const res = await settingsApi.countLeaveOwnedCustomers(targets.map((user) => user.id));
    if (res.code !== 0) {
      await alert(res.message || '客户归属检查失败，请刷新后重试', '客户归属检查失败');
      return null;
    }
    return res.data || 0;
  };

  const openLeaveHandoffDialog = (targets: User[], ownedCustomerCount: number) => {
    setLeaveTargets(targets);
    setLeaveOwnedCustomerCount(ownedCustomerCount);
    setLeaveAction('transfer');
    setLeaveReceiverId(users.find((user) => user.isActive && !targets.some((target) => target.id === user.id) && user.account !== 'admin')?.id || '');
    setLeaveReason(targets.length === 1 ? `${targets[0].name}离职客户交接` : '批量离职客户交接');
    setLeaveDialogOpen(true);
  };

  const closeLeaveHandoffDialog = () => {
    setLeaveDialogOpen(false);
    setLeaveTargets([]);
    setLeaveOwnedCustomerCount(0);
  };

  const openCreateUser = () => {
    setError('');
    setEditingUser(null);
    const departmentId = selectedDepartment?.id || activeDepartments[0]?.id || '';
    setUserForm({
      ...emptyUserForm,
      role: roleOptions[0]?.name || DEFAULT_USER_ROLE,
      departmentId,
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
      positionName: user.positionName || '',
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
      positionName: userForm.positionName.trim() || undefined,
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
      await alert('内置管理员账号不能停用', '提示');
      return;
    }
    await settingsApi.updateUser(user.id, { isActive: !user.isActive });
    await loadUsers();
  };

  const handleLeaveUser = async (user: User) => {
    if (user.account === 'admin') {
      await alert('内置管理员账号不能办理离职', '提示');
      return;
    }
    const ownedCustomerCount = await countOwnedCustomers([user]);
    if (ownedCustomerCount === null) return;
    if (ownedCustomerCount > 0) {
      openLeaveHandoffDialog([user], ownedCustomerCount);
      return;
    }
    if (!await confirm(`确认为员工 ${user.name} 办理离职吗？离职后账号不能登录，会移入账号回收站，历史业务数据会保留。`, '办理离职')) return;
    const res = await settingsApi.leaveUser(user.id);
    if (res.code !== 0) {
      if ((res.message || '').includes('客户')) {
        openLeaveHandoffDialog([user], Math.max(1, ownedCustomerCount));
        return;
      }
      await alert(res.message || '办理离职失败', '办理离职失败');
      return;
    }
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

  const openCreateDepartment = (parentId = selectedDepartment?.id || COMPANY_ROOT) => {
    setError('');
    setEditingDepartment(null);
    setDepartmentForm({ ...emptyDepartmentForm, parentId });
    setDepartmentFormOpen(true);
  };

  const openEditDepartment = (department = selectedDepartment) => {
    if (!department) return;
    setError('');
    setEditingDepartment(department);
    setDepartmentForm({
      name: department.name,
      parentId: department.parentId || COMPANY_ROOT,
    });
    setDepartmentFormOpen(true);
  };

  const handleSaveDepartment = async () => {
    setError('');
    const name = departmentForm.name.trim();
    if (!name) {
      setError('部门名称不能为空');
      return;
    }
    const payload = {
      name,
      code: editingDepartment?.code || makeDepartmentCode(name),
      parentId: departmentForm.parentId && departmentForm.parentId !== COMPANY_ROOT ? departmentForm.parentId : undefined,
      memberCount: users.filter((user) => user.departmentId === editingDepartment?.id).length,
      isActive: editingDepartment?.isActive ?? true,
    };
    const res = editingDepartment
      ? await departmentApi.updateDepartment(editingDepartment.id, payload)
      : await departmentApi.createDepartment(payload);
    if (res.code !== 0) {
      setError(res.message || '保存部门失败');
      return;
    }
    setDepartmentFormOpen(false);
    await fetchItems();
    if (!editingDepartment && res.data?.id) setSelectedNodeId(res.data.id);
  };

  const handleDeleteDepartment = async (department = selectedDepartment) => {
    if (!department) return;
    if (!await confirm(`确认删除部门 ${department.name} 吗？`, '删除部门')) return;
    const res = await departmentApi.deleteDepartment(department.id);
    if (res.code !== 0) {
      await alert(res.message || '部门存在员工或子部门引用，不能删除', '删除失败');
      return;
    }
    setSelectedNodeId(COMPANY_ROOT);
    await fetchItems();
  };

  const handleBatchActive = async (isActive: boolean) => {
    const targets = selectedUsers.filter((user) => !(user.account === 'admin' && !isActive));
    await Promise.all(targets.map((user) => settingsApi.updateUser(user.id, { isActive })));
    clearSelection();
    await loadUsers();
  };

  const handleBatchLeave = async () => {
    const targets = selectedUsers.filter((user) => user.account !== 'admin');
    const skippedAdminCount = selectedUsers.length - targets.length;
    if (!targets.length) {
      await alert('内置管理员账号不能办理离职', '提示');
      return;
    }
    const ownedCustomerCount = await countOwnedCustomers(targets);
    if (ownedCustomerCount === null) return;
    if (ownedCustomerCount > 0) {
      openLeaveHandoffDialog(targets, ownedCustomerCount);
      return;
    }
    const skipText = skippedAdminCount ? `，已自动跳过 ${skippedAdminCount} 个内置管理员账号` : '';
    if (!await confirm(`确认为选中的 ${targets.length} 名员工办理离职吗？离职后账号不能登录，会移入账号回收站，历史业务数据会保留${skipText}。`, '批量办理离职')) return;

    const results = await Promise.all(targets.map((user) => settingsApi.leaveUser(user.id)));
    const failed = results.filter((res) => res.code !== 0);
    clearSelection();
    await loadUsers();
    if (failed.length > 0) {
      await alert(`有 ${failed.length} 名员工办理离职失败，请刷新后重试。`, '批量办理离职失败');
    }
  };

  const handleConfirmLeaveHandoff = async () => {
    if (!leaveTargets.length) return;
    if (leaveAction === 'transfer' && !leaveReceiverId) {
      await alert('请选择客户接收人', '客户交接');
      return;
    }
    const results = await Promise.all(leaveTargets.map((user) => settingsApi.leaveUser(user.id, {
      customerAction: leaveAction,
      targetUserId: leaveAction === 'transfer' ? leaveReceiverId : undefined,
      reason: leaveReason.trim() || undefined,
    })));
    const failed = results.filter((res) => res.code !== 0);
    if (failed.length > 0) {
      await alert(failed[0].message || `有 ${failed.length} 名员工办理离职失败`, '办理离职失败');
      return;
    }
    closeLeaveHandoffDialog();
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

  const handleDepartmentChange = (departmentId: string) => {
    setUserForm({
      ...userForm,
      departmentId,
    });
  };

  const handleSaveCompanyName = async () => {
    const res = await settingsApi.updateOrganizationProfile({ companyName: companyNameDraft });
    if (res.code !== 0) {
      setError(res.message || '保存公司名称失败');
      return;
    }
    setOrganizationProfile(res.data!);
    setCompanyDialogOpen(false);
  };

  const toggleUserSelected = (id: string) => {
    setSelectedUserIds((current) => (
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    ));
  };

  const setAllFilteredSelected = (checked: boolean) => {
    setSelectedUserIds(checked ? filteredUsers.map((user) => user.id) : []);
  };

  const openNodeMenu = (event: React.MouseEvent<HTMLElement>, department: Department) => {
    event.stopPropagation();
    setMenuDepartment(department);
    setMenuAnchor(event.currentTarget);
  };

  const closeNodeMenu = () => {
    setMenuAnchor(null);
    setMenuDepartment(null);
  };

  const selectNode = (id: string) => {
    setSelectedNodeId(id);
    clearSelection();
  };

  const getSiblings = (department: Department) => activeDepartments
    .filter((item) => (item.parentId || '') === (department.parentId || ''))
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0) || a.name.localeCompare(b.name));

  const getSiblingIndex = (department: Department | null) => {
    if (!department) return -1;
    return getSiblings(department).findIndex((item) => item.id === department.id);
  };

  const canMoveDepartment = (department: Department | null, direction: 'up' | 'down') => {
    if (!department) return false;
    const siblings = getSiblings(department);
    const index = siblings.findIndex((item) => item.id === department.id);
    return direction === 'up' ? index > 0 : index >= 0 && index < siblings.length - 1;
  };

  const handleMoveDepartment = async (department: Department, direction: 'up' | 'down') => {
    const siblings = getSiblings(department);
    const index = siblings.findIndex((item) => item.id === department.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const target = siblings[targetIndex];
    if (!target) return;
    const currentOrder = Number(department.sortOrder || index + 1);
    const targetOrder = Number(target.sortOrder || targetIndex + 1);
    await Promise.all([
      departmentApi.updateDepartment(department.id, { sortOrder: targetOrder }),
      departmentApi.updateDepartment(target.id, { sortOrder: currentOrder }),
    ]);
    await fetchItems();
  };

  const renderDepartmentRows = (parentId = '', depth = 0): React.ReactNode => (
    (treeByParent.get(parentId) || []).map((department) => {
      const directCount = users.filter((user) => user.departmentId === department.id).length;
      const scopeCount = users.filter((user) => (
        user.departmentId === department.id
        || getDepartmentDescendantIds(activeDepartments, department.id).includes(user.departmentId || '')
      )).length;
      const selected = selectedNodeId === department.id;
      return (
        <React.Fragment key={department.id}>
          <Box
            onClick={() => selectNode(department.id)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              minHeight: 36,
              pl: 1 + depth * 2.25,
              pr: 0.5,
              cursor: 'pointer',
              bgcolor: selected ? '#eaf3ff' : 'transparent',
              color: selected ? '#0f5fca' : '#243044',
              borderRadius: 1,
              border: '1px solid',
              borderColor: selected ? '#b7d7ff' : 'transparent',
              '&:hover': { bgcolor: selected ? '#eaf3ff' : '#f7faff', borderColor: selected ? '#b7d7ff' : '#e6eef8' },
            }}
          >
            <FolderIcon sx={{ fontSize: 18, color: selected ? '#1976d2' : '#8aa1bd' }} />
            <Typography variant="body2" sx={{ flex: 1, fontWeight: selected ? 700 : 500 }}>
              {department.name}
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
              {scopeCount === directCount ? directCount : `${directCount}/${scopeCount}`}
            </Typography>
            <IconButton size="small" onClick={(event) => openNodeMenu(event, department)}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
          </Box>
          {renderDepartmentRows(department.id, depth + 1)}
        </React.Fragment>
      );
    })
  );

  const departmentParentOptions = activeDepartments.filter((department) => {
    if (!editingDepartment) return true;
    if (department.id === editingDepartment.id) return false;
    return !isDepartmentDescendantOf(activeDepartments, department.id, editingDepartment.id);
  });

  return (
    <Box sx={{ border: '1px solid #dfe7f1', borderRadius: 1.5, overflow: 'hidden', minHeight: 700, bgcolor: '#fff' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '300px minmax(0, 1fr)' }, minHeight: 700 }}>
        <Box sx={{ borderRight: { lg: '1px solid #dfe7f1' }, bgcolor: '#f7faff', p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#132238' }}>
              组织架构
            </Typography>
            <Tooltip title="在公司下添加部门">
              <IconButton
                size="small"
                onClick={() => openCreateDepartment(COMPANY_ROOT)}
                sx={{ width: 32, height: 32, border: '1px solid #c9d8ea', borderRadius: 1, bgcolor: '#fff' }}
              >
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          <TextField
            size="small"
            placeholder="搜索组织或员工"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />

          <Box
            onClick={() => selectNode(COMPANY_ROOT)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              minHeight: 42,
              px: 1,
              mb: 0.75,
              borderRadius: 1,
              cursor: 'pointer',
              bgcolor: selectedNodeId === COMPANY_ROOT ? '#e8f2ff' : '#fff',
              color: selectedNodeId === COMPANY_ROOT ? '#0f5fca' : '#182235',
              border: '1px solid',
              borderColor: selectedNodeId === COMPANY_ROOT ? '#b7d7ff' : '#e4edf7',
              boxShadow: selectedNodeId === COMPANY_ROOT ? '0 8px 18px rgba(25, 118, 210, 0.08)' : 'none',
              '&:hover': { borderColor: '#b7d7ff' },
            }}
          >
            <BusinessIcon sx={{ fontSize: 20, color: selectedNodeId === COMPANY_ROOT ? '#1976d2' : '#7890ad' }} />
            <Typography variant="body2" sx={{ flex: 1, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {organizationProfile.companyName}
            </Typography>
            <Chip label={users.length} size="small" sx={{ height: 20, bgcolor: '#eef4fb', color: '#52677f', fontSize: 11 }} />
            <Tooltip title={companyExpanded ? '收起组织树' : '展开组织树'}>
              <IconButton
                size="small"
                onClick={(event) => {
                  event.stopPropagation();
                  setCompanyExpanded((current) => !current);
                }}
              >
                {companyExpanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
          <Box sx={{ display: 'grid', gap: 0.5 }}>
            {companyExpanded && renderDepartmentRows()}
          </Box>
        </Box>

        <Box sx={{ minWidth: 0, bgcolor: '#fbfcfe' }}>
          <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
            {error && (
              <Typography variant="body2" sx={{ color: '#d32f2f' }}>
                {error}
              </Typography>
            )}

            <Box sx={{ bgcolor: '#fff', border: '1px solid #dfe7f1', borderRadius: 1.25, overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #edf2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <ApartmentIcon sx={{ color: '#59708d' }} />
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#132238' }}>
                      组织信息
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>
                      {selectedDepartment ? '当前部门资料' : '公司组织总览'}
                    </Typography>
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Button variant="outlined" size="small" onClick={() => openCreateDepartment(selectedDepartment?.id || COMPANY_ROOT)} startIcon={<AddIcon />}>
                    {selectedDepartment ? '添加子部门' : '添加部门'}
                  </Button>
                  {selectedDepartment ? (
                    <>
                      <Button variant="text" size="small" onClick={() => openEditDepartment()}>编辑部门</Button>
                      <Button variant="text" size="small" color="error" onClick={() => handleDeleteDepartment()}>删除部门</Button>
                    </>
                  ) : (
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => {
                        setCompanyNameDraft(organizationProfile.companyName);
                        setCompanyDialogOpen(true);
                      }}
                    >
                      编辑公司
                    </Button>
                  )}
                </Box>
              </Box>

              <Box sx={{ p: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 1fr) minmax(460px, 1.35fr)' }, gap: 2.5, alignItems: 'stretch' }}>
                <Box sx={{ display: 'grid', gap: 0.75 }}>
                  <Typography variant="caption" sx={{ color: '#7890ad' }}>组织名称</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 800, color: '#132238', lineHeight: 1.25 }}>
                    {selectedTitle}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#52677f' }}>
                    {selectedDepartment
                      ? `${selectedDepartment.name} 当前范围 ${selectedDepartmentUserCount} 人，直属 ${selectedDepartmentDirectUserCount} 人`
                      : `${organizationProfile.companyName} 当前共有 ${activeDepartments.length} 个部门，${users.length} 名员工`}
                  </Typography>
                </Box>

                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' }, gap: 1.25 }}>
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#f7faff', border: '1px solid #e4edf7', minWidth: 0 }}>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>上级组织</Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 800, color: '#132238', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedDepartmentParentName}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#f7faff', border: '1px solid #e4edf7' }}>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>子部门</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#132238' }}>{selectedDepartmentChildCount}</Typography>
                  </Box>
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#f7faff', border: '1px solid #e4edf7' }}>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>在职</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#16815c' }}>{selectedDepartment ? filteredUsers.filter((user) => user.isActive).length : activeUserCount}</Typography>
                  </Box>
                  <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: '#f7faff', border: '1px solid #e4edf7' }}>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>停用/离职</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 800, color: '#b45309' }}>
                      {selectedDepartment ? filteredUsers.filter((user) => !user.isActive || (user.employmentStatus || 'active') !== 'active').length : inactiveUserCount}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Box>

            <Box sx={{ bgcolor: '#fff', border: '1px solid #dfe7f1', borderRadius: 1.25, overflow: 'hidden' }}>
              <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #edf2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#132238' }}>
                    成员管理
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#7890ad' }}>
                    成员列表（{selectedDepartmentUserCount}人）
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Button variant="contained" size="small" onClick={openCreateUser} startIcon={<AddIcon />}>添加成员</Button>
                  <Button variant="outlined" size="small" onClick={handleOpenMove} disabled={!selectedUserIds.length}>移动</Button>
                  <Button variant="outlined" size="small" onClick={() => handleBatchActive(false)} disabled={!selectedUserIds.length}>禁用</Button>
                  <Button variant="outlined" size="small" onClick={() => handleBatchActive(true)} disabled={!selectedUserIds.length}>解禁</Button>
                  <Button variant="outlined" size="small" color="warning" startIcon={<ExitToAppIcon />} onClick={handleBatchLeave} disabled={!selectedUserIds.length}>办理离职</Button>
                </Box>
              </Box>

              <TableContainer component={Paper} elevation={0} sx={{ border: 0 }}>
                <Table sx={{ tableLayout: 'fixed', minWidth: 940 }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f8fc' }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={filteredUsers.length > 0 && selectedUserIds.length === filteredUsers.length}
                          indeterminate={selectedUserIds.length > 0 && selectedUserIds.length < filteredUsers.length}
                          onChange={(event) => setAllFilteredSelected(event.target.checked)}
                        />
                      </TableCell>
                      <TableCell>姓名</TableCell>
                      <TableCell>账号</TableCell>
                      <TableCell>角色</TableCell>
                      <TableCell>职务</TableCell>
                      <TableCell>部门</TableCell>
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
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#e8f2ff', color: '#1976d2', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>
                              {user.name.slice(0, 1)}
                            </Box>
                            <Typography variant="body2" sx={{ fontWeight: 700 }}>{user.name}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell>{user.account || '-'}</TableCell>
                        <TableCell>
                          <Chip label={normalizeUserRoleName(user.role)} size="small" sx={{ bgcolor: '#eef4fb', color: '#31506f', fontWeight: 700 }} />
                        </TableCell>
                        <TableCell>{getPositionName(user)}</TableCell>
                        <TableCell>{getDepartmentName(user.departmentId)}</TableCell>
                        <TableCell>
                          <Chip
                            label={user.isActive ? '在职' : '禁用'}
                            size="small"
                            sx={{
                              bgcolor: user.isActive ? '#e7f7ef' : '#fff4e5',
                              color: user.isActive ? '#16815c' : '#b45309',
                              fontWeight: 700,
                            }}
                          />
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
                          <Tooltip title="办理离职">
                            <IconButton size="small" color="warning" onClick={() => handleLeaveUser(user)}>
                              <ExitToAppIcon fontSize="small" />
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
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeNodeMenu}>
        <MenuItem onClick={() => { if (menuDepartment) openEditDepartment(menuDepartment); closeNodeMenu(); }}>编辑部门</MenuItem>
        <MenuItem onClick={() => { if (menuDepartment) openCreateDepartment(menuDepartment.id); closeNodeMenu(); }}>添加子部门</MenuItem>
        <MenuItem sx={{ color: '#d32f2f' }} onClick={() => { const department = menuDepartment; closeNodeMenu(); if (department) handleDeleteDepartment(department); }}>删除部门</MenuItem>
        <MenuItem
          disabled={!canMoveDepartment(menuDepartment, 'up')}
          onClick={() => {
            const department = menuDepartment;
            closeNodeMenu();
            if (department) handleMoveDepartment(department, 'up');
          }}
        >
          上移
        </MenuItem>
        <MenuItem
          disabled={!canMoveDepartment(menuDepartment, 'down')}
          onClick={() => {
            const department = menuDepartment;
            closeNodeMenu();
            if (department) handleMoveDepartment(department, 'down');
          }}
        >
          下移
        </MenuItem>
      </Menu>

      <Dialog open={userFormOpen} onClose={() => setUserFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setUserFormOpen(false)}>{editingUser ? '编辑员工' : '创建员工'}</DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="姓名" value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} required fullWidth />
            <TextField label="登录账号" value={userForm.account} onChange={(event) => setUserForm({ ...userForm, account: event.target.value })} required fullWidth />
            <TextField label="手机号" value={userForm.phone} onChange={(event) => setUserForm({ ...userForm, phone: event.target.value })} fullWidth />
            <TextField label="邮箱" value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} fullWidth />
            <TextField select label="部门" value={userForm.departmentId} onChange={(event) => handleDepartmentChange(event.target.value)} fullWidth>
              <MenuItem value="">未分配</MenuItem>
              {activeDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
            </TextField>
            <TextField label="职位" value={userForm.positionName} onChange={(event) => setUserForm({ ...userForm, positionName: event.target.value })} fullWidth />
            <TextField select label="角色权限" value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value as UserRole })} fullWidth>
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

      <Dialog open={departmentFormOpen} onClose={() => setDepartmentFormOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setDepartmentFormOpen(false)}>{editingDepartment ? '编辑部门' : '新增部门'}</DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField label="部门名称" value={departmentForm.name} onChange={(event) => setDepartmentForm({ ...departmentForm, name: event.target.value })} required fullWidth />
            <TextField select label="所属部门" value={departmentForm.parentId} onChange={(event) => setDepartmentForm({ ...departmentForm, parentId: event.target.value })} fullWidth>
              <MenuItem value={COMPANY_ROOT}>{organizationProfile.companyName}</MenuItem>
              {departmentParentOptions.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
            </TextField>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setDepartmentFormOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSaveDepartment}>确定</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={companyDialogOpen} onClose={() => setCompanyDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setCompanyDialogOpen(false)}>编辑公司名称</DialogCloseTitle>
        <DialogContent dividers>
          <TextField label="公司名称" value={companyNameDraft} onChange={(event) => setCompanyNameDraft(event.target.value)} required fullWidth />
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={() => setCompanyDialogOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSaveCompanyName}>确定</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={moveOpen} onClose={() => setMoveOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setMoveOpen(false)}>移动员工</DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
            已选择 {selectedUserIds.length} 名员工，选择目标部门后会统一更新所属部门。职位是员工资料中的文本字段，不会随部门自动变更。
          </Typography>
          <TextField select label="目标部门" value={moveDepartmentId} onChange={(event) => setMoveDepartmentId(event.target.value)} fullWidth>
            {activeDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleMoveUsers} disabled={!moveDepartmentId}>确认移动</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={leaveDialogOpen} onClose={closeLeaveHandoffDialog} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={closeLeaveHandoffDialog}>离职客户交接</DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Typography variant="body2" sx={{ color: '#475569' }}>
              {leaveTargets.map((user) => user.name).join('、')} 名下还有 {leaveOwnedCustomerCount} 个客户。办理离职前必须处理客户归属，避免客户挂在离职人员名下无人跟进。
            </Typography>
            <RadioGroup value={leaveAction} onChange={(event) => setLeaveAction(event.target.value as 'transfer' | 'public_pool')}>
              <FormControlLabel value="transfer" control={<Radio />} label="转交给其他在职员工" />
              <FormControlLabel value="public_pool" control={<Radio />} label="释放到公海，等待重新领取" />
            </RadioGroup>
            {leaveAction === 'transfer' && (
              <TextField
                select
                label="客户接收人"
                value={leaveReceiverId}
                onChange={(event) => setLeaveReceiverId(event.target.value)}
                fullWidth
                helperText="客户、关联线索负责人会同步更新为该员工"
              >
                {leaveReceiverOptions.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name}（{user.positionName || user.role || '员工'}）
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label="交接说明"
              value={leaveReason}
              onChange={(event) => setLeaveReason(event.target.value)}
              fullWidth
              multiline
              minRows={2}
              helperText="会写入客户动态，方便后续追溯"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="outlined" onClick={closeLeaveHandoffDialog}>取消</Button>
          <Button variant="contained" color="warning" onClick={handleConfirmLeaveHandoff}>
            确认交接并办理离职
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
      {feedbackDialog}
    </Box>
  );
};

export default EmployeeDepartmentManagement;
