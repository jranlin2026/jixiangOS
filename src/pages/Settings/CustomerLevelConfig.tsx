import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
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
import type { CustomerLevelConfig } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

type CustomerLevelForm = Omit<CustomerLevelConfig, 'id' | 'createdAt' | 'updatedAt'>;

const emptyForm: CustomerLevelForm = {
  value: '',
  label: '',
  color: '#2196F3',
  description: '',
  isActive: true,
  sortOrder: 100,
};

const CustomerLevelConfigPage: React.FC = () => {
  const [items, setItems] = useState<CustomerLevelConfig[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CustomerLevelConfig | null>(null);
  const [form, setForm] = useState<CustomerLevelForm>(emptyForm);

  const loadData = async () => {
    const res = await settingsApi.fetchCustomerLevelConfigs();
    if (res.code === 0) setItems(res.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openForm = (item?: CustomerLevelConfig) => {
    setEditingItem(item || null);
    setForm(item ? {
      value: item.value,
      label: item.label,
      color: item.color,
      description: item.description || '',
      isActive: item.isActive,
      sortOrder: item.sortOrder,
    } : emptyForm);
    setFormOpen(true);
  };

  const updateForm = <K extends keyof CustomerLevelForm>(key: K, value: CustomerLevelForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    const payload = {
      ...form,
      value: form.value.trim(),
      label: form.label.trim(),
      sortOrder: Number(form.sortOrder),
    };
    const res = editingItem
      ? await settingsApi.updateCustomerLevelConfig(editingItem.id, payload)
      : await settingsApi.createCustomerLevelConfig(payload);
    if (res.code !== 0) {
      window.alert(res.message);
      return;
    }
    setFormOpen(false);
    loadData();
  };

  const handleToggleActive = async (item: CustomerLevelConfig) => {
    await settingsApi.updateCustomerLevelConfig(item.id, { isActive: !item.isActive });
    loadData();
  };

  const handleDelete = async (item: CustomerLevelConfig) => {
    if (!window.confirm(`确定删除客户等级“${item.label}”吗？`)) return;
    const res = await settingsApi.deleteCustomerLevelConfig(item.id);
    if (res.code !== 0) {
      window.alert(res.message);
      return;
    }
    loadData();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>客户等级配置</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            维护客户等级名称、颜色、排序和启停状态，客户列表、筛选、新增客户和客户详情会同步读取。
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => openForm()} sx={{ minWidth: 112, whiteSpace: 'nowrap' }}>
          新增等级
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>等级编码</TableCell>
              <TableCell>显示名称</TableCell>
              <TableCell>说明</TableCell>
              <TableCell>颜色</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>排序</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell sx={{ color: '#6b7280' }}>{item.value}</TableCell>
                <TableCell>
                  <Chip label={item.label} size="small" sx={{ bgcolor: `${item.color}18`, color: item.color, fontWeight: 600 }} />
                </TableCell>
                <TableCell>{item.description || '-'}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: item.color, border: '1px solid #e5e7eb' }} />
                    <Typography variant="body2">{item.color}</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip label={item.isActive ? '启用' : '停用'} size="small" color={item.isActive ? 'success' : 'default'} />
                </TableCell>
                <TableCell>{item.sortOrder}</TableCell>
                <TableCell align="center">
                  <Switch checked={item.isActive} size="small" onChange={() => handleToggleActive(item)} />
                  <IconButton size="small" onClick={() => openForm(item)} aria-label="编辑客户等级">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(item)} aria-label="删除客户等级">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 4, color: '#9ca3af' }}>暂无客户等级</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setFormOpen(false)}>{editingItem ? '编辑客户等级' : '新增客户等级'}</DialogCloseTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField label="等级编码" value={form.value} onChange={(e) => updateForm('value', e.target.value)} required fullWidth />
            <TextField label="显示名称" value={form.label} onChange={(e) => updateForm('label', e.target.value)} required fullWidth />
            <TextField label="说明" value={form.description} onChange={(e) => updateForm('description', e.target.value)} multiline minRows={2} fullWidth />
            <TextField label="颜色" type="color" value={form.color} onChange={(e) => updateForm('color', e.target.value)} fullWidth />
            <TextField label="排序" type="number" value={form.sortOrder} onChange={(e) => updateForm('sortOrder', Number(e.target.value))} fullWidth />
            <FormControlLabel control={<Switch checked={form.isActive} onChange={(e) => updateForm('isActive', e.target.checked)} />} label={form.isActive ? '启用' : '停用'} />
            {form.label && (
              <Chip label={form.label} size="small" sx={{ justifySelf: 'start', bgcolor: `${form.color}18`, color: form.color, fontWeight: 600 }} />
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleSubmit} disabled={!form.value.trim() || !form.label.trim()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomerLevelConfigPage;
