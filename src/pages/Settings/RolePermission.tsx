import React, { useEffect, useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Chip, Button, Dialog, TextField } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import useRoleStore from '../../store/useRoleStore';
import type { Role } from '../../types/role';

const RolePermission: React.FC = () => {
  const { items, fetchItems, create } = useRoleStore();
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', departmentId: '' });

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSubmit = async () => {
    if (!form.name || !form.code) return;
    await create({
      ...form,
      permissions: [{ module: '基础', actions: ['read'] }],
      memberCount: 0,
      isActive: true,
    });
    setFormOpen(false);
    setForm({ name: '', code: '', departmentId: '' });
    fetchItems();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>角色权限配置</Typography>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setFormOpen(true)}>
          新增角色
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>角色名称</TableCell>
              <TableCell>编码</TableCell>
              <TableCell>权限列表</TableCell>
              <TableCell>用户数</TableCell>
              <TableCell>状态</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((role: Role) => (
              <TableRow key={role.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{role.name}</TableCell>
                <TableCell>{role.code}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {role.permissions.map((p, i) => (
                      <Chip key={i} label={`${p.module}: ${p.actions.join(',')}`} size="small" variant="outlined" />
                    ))}
                  </Box>
                </TableCell>
                <TableCell>{role.memberCount}</TableCell>
                <TableCell>
                  <Chip label={role.isActive ? '启用' : '停用'} size="small" color={role.isActive ? 'success' : 'default'} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>新增角色</Typography>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField label="角色名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required fullWidth />
            <TextField label="角色编码" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required fullWidth />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            <Button onClick={() => setFormOpen(false)}>取消</Button>
            <Button variant="contained" onClick={handleSubmit} disabled={!form.name || !form.code}>创建</Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
};

export default RolePermission;
