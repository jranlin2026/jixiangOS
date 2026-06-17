import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, Dialog, TextField,
  IconButton, Switch,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import useDepartmentStore from '../../store/useDepartmentStore';
import { formatDate } from '../../shared/utils/formatters';

const DepartmentManagement: React.FC = () => {
  const { items, loading, fetchItems, create, update, delete: deleteDept } = useDepartmentStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editDept, setEditDept] = useState<any>(null);
  const [form, setForm] = useState({ name: '', description: '', managerId: '', memberCount: 0, isActive: true });

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCreate = () => {
    setEditDept(null);
    setForm({ name: '', description: '', managerId: '', memberCount: 0, isActive: true });
    setFormOpen(true);
  };

  const handleEdit = (dept: any) => {
    setEditDept(dept);
    setForm({ name: dept.name, description: dept.description || '', managerId: dept.managerId || '', memberCount: dept.memberCount, isActive: dept.isActive });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (editDept) {
      await update(editDept.id, { ...form, code: editDept.code });
    } else {
      await create({ ...form, code: `dept-${Date.now()}` });
    }
    setFormOpen(false);
    fetchItems();
  };

  const handleDelete = async (id: string) => {
    await deleteDept(id);
    fetchItems();
  };

  const handleToggleActive = async (dept: any) => {
    await update(dept.id, { isActive: !dept.isActive });
    fetchItems();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>部门管理</Typography>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleCreate}>
          新增部门
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>部门名称</TableCell>
              <TableCell>说明</TableCell>
              <TableCell>人数</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>创建时间</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((dept: any) => (
              <TableRow key={dept.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{dept.name}</TableCell>
                <TableCell>{dept.description || '-'}</TableCell>
                <TableCell>{dept.memberCount}</TableCell>
                <TableCell>
                  <Chip label={dept.isActive ? '启用' : '停用'} size="small" color={dept.isActive ? 'success' : 'default'} />
                </TableCell>
                <TableCell>{formatDate(dept.createdAt)}</TableCell>
                <TableCell align="center">
                  <Switch checked={dept.isActive} size="small" onChange={() => handleToggleActive(dept)} />
                  <IconButton size="small" onClick={() => handleEdit(dept)} title="编辑">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(dept.id)} title="删除">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            {editDept ? '编辑部门' : '新增部门'}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="部门名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required fullWidth />
            <TextField label="人数" type="number" value={form.memberCount} onChange={(e) => setForm({ ...form, memberCount: Number(e.target.value) })} fullWidth />
            <TextField label="说明" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth multiline minRows={2} sx={{ gridColumn: '1 / -1' }} />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              <Typography variant="body2">{form.isActive ? '启用' : '停用'}</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            <Button onClick={() => setFormOpen(false)}>取消</Button>
            <Button variant="contained" onClick={handleSubmit} disabled={!form.name}>
              {editDept ? '保存' : '创建'}
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
};

export default DepartmentManagement;
