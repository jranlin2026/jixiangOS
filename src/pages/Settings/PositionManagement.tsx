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
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import useDepartmentStore from '../../store/useDepartmentStore';
import usePositionStore from '../../store/usePositionStore';
import type { Position } from '../../types/position';

type PositionForm = {
  name: string;
  code: string;
  departmentId: string;
  description: string;
  sortOrder: number;
  isActive: boolean;
};

const emptyForm: PositionForm = {
  name: '',
  code: '',
  departmentId: '',
  description: '',
  sortOrder: 1,
  isActive: true,
};

const PositionManagement: React.FC = () => {
  const { items: positions, fetchItems, create, update, delete: deletePosition } = usePositionStore();
  const { items: departments, fetchItems: fetchDepartments } = useDepartmentStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [form, setForm] = useState<PositionForm>(emptyForm);
  const [error, setError] = useState('');
  const { confirm, dialog } = useAppFeedback();

  useEffect(() => {
    fetchItems();
    fetchDepartments();
  }, [fetchDepartments, fetchItems]);

  const activeDepartments = useMemo(() => departments.filter((item) => item.isActive), [departments]);
  const departmentName = (departmentId?: string) => departments.find((item) => item.id === departmentId)?.name || '-';

  const openCreate = () => {
    setError('');
    setEditing(null);
    setForm({
      ...emptyForm,
      departmentId: activeDepartments[0]?.id || '',
      sortOrder: positions.length + 1,
    });
    setFormOpen(true);
  };

  const openEdit = (position: Position) => {
    setError('');
    setEditing(position);
    setForm({
      name: position.name,
      code: position.code,
      departmentId: position.departmentId || '',
      description: position.description || '',
      sortOrder: position.sortOrder,
      isActive: position.isActive,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    setError('');
    if (!form.name.trim()) {
      setError('职位名称不能为空');
      return;
    }
    if (!form.code.trim()) {
      setError('职位编码不能为空');
      return;
    }
    const payload = {
      name: form.name.trim(),
      code: form.code.trim(),
      departmentId: form.departmentId || undefined,
      description: form.description.trim(),
      sortOrder: Number(form.sortOrder || positions.length + 1),
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
  };

  const handleDelete = async (position: Position) => {
    setError('');
    if (!await confirm(`确认删除职位 ${position.name} 吗？已有员工使用时会被系统拦截。`, '删除职位')) return;
    try {
      await deletePosition(position.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>职位管理</Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            职位只表达岗位职责，权限请在角色权限中配置。
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>新增职位</Button>
      </Box>

      {error && <Typography variant="body2" sx={{ color: '#d32f2f', mb: 1 }}>{error}</Typography>}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #eef2f7' }}>
        <Table sx={{ minWidth: 880, tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#f8fafc' }}>
              <TableCell>职位名称</TableCell>
              <TableCell>职位编码</TableCell>
              <TableCell>所属部门</TableCell>
              <TableCell>排序</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>说明</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id} hover>
                <TableCell sx={{ fontWeight: 600 }}>{position.name}</TableCell>
                <TableCell>{position.code}</TableCell>
                <TableCell>{departmentName(position.departmentId)}</TableCell>
                <TableCell>{position.sortOrder}</TableCell>
                <TableCell>
                  <Chip label={position.isActive ? '启用' : '停用'} size="small" color={position.isActive ? 'success' : 'default'} />
                </TableCell>
                <TableCell>{position.description || '-'}</TableCell>
                <TableCell align="center">
                  <Tooltip title="编辑职位">
                    <IconButton size="small" onClick={() => openEdit(position)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除职位">
                    <IconButton size="small" color="error" onClick={() => handleDelete(position)}>
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
        <DialogCloseTitle onClose={() => setFormOpen(false)}>{editing ? '编辑职位' : '新增职位'}</DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="职位名称" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required fullWidth />
            <TextField label="职位编码" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required fullWidth />
            <TextField select label="所属部门" value={form.departmentId} onChange={(event) => setForm({ ...form, departmentId: event.target.value })} fullWidth>
              <MenuItem value="">未分配</MenuItem>
              {activeDepartments.map((department) => <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>)}
            </TextField>
            <TextField label="排序" type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} fullWidth />
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

export default PositionManagement;
