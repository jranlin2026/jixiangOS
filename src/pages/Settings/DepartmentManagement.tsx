import React, { useEffect, useState } from 'react';
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
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import useDepartmentStore from '../../store/useDepartmentStore';
import { settingsApi } from '../../api';
import type { Department } from '../../types/department';
import type { User } from '../../types/settings';
import { formatEmployeeNameWithPosition } from '../../shared/utils/formatters';

type DepartmentForm = {
  name: string;
  code: string;
  description: string;
  parentId: string;
  managerId: string;
  isActive: boolean;
};

const emptyForm: DepartmentForm = {
  name: '',
  code: '',
  description: '',
  parentId: '',
  managerId: '',
  isActive: true,
};

const DepartmentManagement: React.FC = () => {
  const { items: departments, fetchItems, create, update, delete: deleteDepartment } = useDepartmentStore();
  const [users, setUsers] = useState<User[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [form, setForm] = useState<DepartmentForm>(emptyForm);
  const [error, setError] = useState('');
  const { confirm, dialog } = useAppFeedback();

  const load = async () => {
    await fetchItems();
    const res = await settingsApi.fetchUsers();
    if (res.code === 0) setUsers(res.data);
  };

  useEffect(() => {
    load();
  }, [fetchItems]);

  const userName = (userId?: string) => users.find((user) => user.id === userId)?.name || '-';
  const parentName = (parentId?: string) => departments.find((department) => department.id === parentId)?.name || '-';
  const memberCount = (departmentId: string) => users.filter((user) => user.departmentId === departmentId).length;

  const openCreate = () => {
    setError('');
    setEditing(null);
    setForm({ ...emptyForm, code: `dept-${Date.now()}` });
    setFormOpen(true);
  };

  const openEdit = (department: Department) => {
    setError('');
    setEditing(department);
    setForm({
      name: department.name,
      code: department.code,
      description: department.description || '',
      parentId: department.parentId || '',
      managerId: department.managerId || '',
      isActive: department.isActive,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('部门名称不能为空');
      return;
    }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || `dept-${Date.now()}`,
      description: form.description.trim(),
      parentId: form.parentId || undefined,
      managerId: form.managerId || undefined,
      memberCount: editing ? memberCount(editing.id) : 0,
      isActive: form.isActive,
    };
    try {
      if (editing) {
        await update(editing.id, payload);
      } else {
        await create(payload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      return;
    }
    setFormOpen(false);
    await load();
  };

  const handleDelete = async (department: Department) => {
    setError('');
    const hasChildren = departments.some((item) => item.parentId === department.id);
    const hasUsers = users.some((user) => user.departmentId === department.id);
    if (hasChildren || hasUsers) {
      setError('请先移走该部门下的员工和子部门，再删除部门');
      return;
    }
    if (!await confirm(`确认删除部门 ${department.name} 吗？`, '删除部门')) return;
    try {
      await deleteDepartment(department.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
      return;
    }
    await load();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>部门管理</Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            部门用于组织归属、数据范围和业务负责人配置。
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>新增部门</Button>
      </Box>

      {error && <Typography variant="body2" sx={{ color: '#d32f2f', mb: 1 }}>{error}</Typography>}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #eef2f7' }}>
        <Table sx={{ minWidth: 900, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell>部门名称</TableCell>
              <TableCell>部门编码</TableCell>
              <TableCell>上级部门</TableCell>
              <TableCell>负责人</TableCell>
              <TableCell>人数</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>说明</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {departments.map((department) => (
              <TableRow key={department.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{department.name}</TableCell>
                <TableCell>{department.code}</TableCell>
                <TableCell>{parentName(department.parentId)}</TableCell>
                <TableCell>{userName(department.managerId)}</TableCell>
                <TableCell>{memberCount(department.id)}</TableCell>
                <TableCell>
                  <Chip label={department.isActive ? '启用' : '停用'} size="small" color={department.isActive ? 'success' : 'default'} />
                </TableCell>
                <TableCell>{department.description || '-'}</TableCell>
                <TableCell align="center">
                  <Tooltip title="编辑部门">
                    <IconButton size="small" onClick={() => openEdit(department)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除部门">
                    <IconButton size="small" color="error" onClick={() => handleDelete(department)}>
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
        <DialogCloseTitle onClose={() => setFormOpen(false)}>{editing ? '编辑部门' : '新增部门'}</DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="部门名称" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required fullWidth />
            <TextField label="部门编码" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} fullWidth />
            <TextField select label="上级部门" value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })} fullWidth>
              <MenuItem value="">无</MenuItem>
              {departments.filter((department) => department.id !== editing?.id).map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
            </TextField>
            <TextField select label="部门负责人" value={form.managerId} onChange={(event) => setForm({ ...form, managerId: event.target.value })} fullWidth>
              <MenuItem value="">未设置</MenuItem>
              {users.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
            </TextField>
            <TextField label="说明" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} fullWidth multiline minRows={2} sx={{ gridColumn: '1 / -1' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
              <Typography variant="body2">{form.isActive ? '启用' : '停用'}</Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleSave}>保存</Button>
        </DialogActions>
      </Dialog>
      {dialog}
    </Box>
  );
};

export default DepartmentManagement;
