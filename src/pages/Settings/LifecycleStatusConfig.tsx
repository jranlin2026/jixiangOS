import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { settingsApi } from '../../api';
import type { LifecycleStatusConfig } from '../../types/settings';

type LifecycleForm = Omit<LifecycleStatusConfig, 'id' | 'createdAt' | 'updatedAt'>;

const emptyForm: LifecycleForm = {
  name: '',
  description: '',
  color: '#2196F3',
  isActive: true,
  sortOrder: 100,
  isSystem: false,
};

const LifecycleStatusConfigPage: React.FC = () => {
  const [items, setItems] = useState<LifecycleStatusConfig[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LifecycleStatusConfig | null>(null);
  const [form, setForm] = useState<LifecycleForm>(emptyForm);

  const loadData = async () => {
    const res = await settingsApi.fetchLifecycleStatusConfigs();
    if (res.code === 0) setItems(res.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openForm = (item?: LifecycleStatusConfig) => {
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name,
        description: item.description || '',
        color: item.color,
        isActive: item.isActive,
        sortOrder: item.sortOrder,
        isSystem: item.isSystem,
      });
    } else {
      setEditingItem(null);
      setForm(emptyForm);
    }
    setFormOpen(true);
  };

  const updateForm = <K extends keyof LifecycleForm>(key: K, value: LifecycleForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    const payload = { ...form, name: form.name.trim(), sortOrder: Number(form.sortOrder) };
    const res = editingItem
      ? await settingsApi.updateLifecycleStatusConfig(editingItem.id, payload)
      : await settingsApi.createLifecycleStatusConfig(payload);
    if (res.code !== 0) {
      window.alert(res.message);
      return;
    }
    setFormOpen(false);
    loadData();
  };

  const handleToggleActive = async (item: LifecycleStatusConfig) => {
    await settingsApi.updateLifecycleStatusConfig(item.id, { isActive: !item.isActive });
    loadData();
  };

  const handleDelete = async (item: LifecycleStatusConfig) => {
    if (!window.confirm(`确定删除状态“${item.name}”吗？`)) return;
    const res = await settingsApi.deleteLifecycleStatusConfig(item.id);
    if (res.code !== 0) {
      window.alert(res.message);
      return;
    }
    loadData();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>生命周期状态配置</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            维护线索人员可查看的用户流转状态；销售推进商机、订单和退款时会自动更新。
          </Typography>
        </Box>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => openForm()}>
          新增状态
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>状态</TableCell>
              <TableCell>说明</TableCell>
              <TableCell>颜色</TableCell>
              <TableCell>启用</TableCell>
              <TableCell>排序</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell><Chip label={item.name} size="small" sx={{ bgcolor: `${item.color}18`, color: item.color, fontWeight: 600 }} /></TableCell>
                <TableCell>{item.description || '-'}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: item.color, border: '1px solid #e5e7eb' }} />
                    <Typography variant="body2">{item.color}</Typography>
                  </Box>
                </TableCell>
                <TableCell><Switch checked={item.isActive} size="small" onChange={() => handleToggleActive(item)} /></TableCell>
                <TableCell>{item.sortOrder}</TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => openForm(item)}><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(item)} disabled={item.isSystem}><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>{editingItem ? '编辑生命周期状态' : '新增生命周期状态'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField label="状态名称" value={form.name} onChange={(e) => updateForm('name', e.target.value)} required fullWidth />
            <TextField label="说明" value={form.description} onChange={(e) => updateForm('description', e.target.value)} multiline minRows={2} fullWidth />
            <TextField label="颜色" type="color" value={form.color} onChange={(e) => updateForm('color', e.target.value)} fullWidth />
            <TextField label="排序" type="number" value={form.sortOrder} onChange={(e) => updateForm('sortOrder', Number(e.target.value))} fullWidth />
            <FormControlLabel control={<Switch checked={form.isActive} onChange={(e) => updateForm('isActive', e.target.checked)} />} label={form.isActive ? '启用' : '停用'} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={!form.name.trim()}>保存</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default LifecycleStatusConfigPage;
