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
import EditIcon from '@mui/icons-material/Edit';
import { settingsApi } from '../../api';
import type { LifecycleStatusConfig } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { getLifecycleStatusTagSx } from '../../shared/utils/constants';

type LifecycleForm = Omit<LifecycleStatusConfig, 'id' | 'createdAt' | 'updatedAt'>;

const emptyForm: LifecycleForm = {
  code: 'pending_followup',
  name: '',
  description: '',
  color: '#2196F3',
  isActive: true,
  sortOrder: 100,
  isSystem: true,
};

const LifecycleStatusConfigPage: React.FC = () => {
  const [items, setItems] = useState<LifecycleStatusConfig[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<LifecycleStatusConfig | null>(null);
  const [form, setForm] = useState<LifecycleForm>(emptyForm);
  const { alert, dialog: feedbackDialog } = useAppFeedback();

  const loadData = async () => {
    const res = await settingsApi.fetchLifecycleStatusConfigs();
    if (res.code === 0) setItems(res.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openForm = (item: LifecycleStatusConfig) => {
    setEditingItem(item);
    setForm({
      code: item.code,
      name: item.name,
      description: item.description || '',
      color: item.color,
      isActive: item.isActive,
      sortOrder: item.sortOrder,
      isSystem: true,
    });
    setFormOpen(true);
  };

  const updateForm = <K extends keyof LifecycleForm>(key: K, value: LifecycleForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (!editingItem) return;
    const payload = { ...form, name: form.name.trim(), sortOrder: Number(form.sortOrder), isSystem: true };
    const res = await settingsApi.updateLifecycleStatusConfig(editingItem.id, payload);
    if (res.code !== 0) {
      alert(res.message);
      return;
    }
    setFormOpen(false);
    loadData();
  };

  const handleToggleActive = async (item: LifecycleStatusConfig) => {
    await settingsApi.updateLifecycleStatusConfig(item.id, { isActive: !item.isActive });
    loadData();
  };

  return (
    <Box>
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          生命周期状态配置
        </Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
          生命周期是线索、客户、订单、退款共用的主状态。系统固定 5 个状态，只允许维护显示名称、颜色和排序。
        </Typography>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>状态码</TableCell>
              <TableCell>状态名称</TableCell>
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
                <TableCell sx={{ color: '#6b7280' }}>{item.code}</TableCell>
                <TableCell>
                  <Chip label={item.name} size="small" sx={getLifecycleStatusTagSx(`${item.code} ${item.name}`)} />
                </TableCell>
                <TableCell>{item.description || '-'}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 18, height: 18, borderRadius: '50%', bgcolor: item.color, border: '1px solid #e5e7eb' }} />
                    <Typography variant="body2">{item.color}</Typography>
                  </Box>
                </TableCell>
                <TableCell>
                  <Switch checked={item.isActive} size="small" onChange={() => handleToggleActive(item)} />
                </TableCell>
                <TableCell>{item.sortOrder}</TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => openForm(item)} aria-label="编辑生命周期状态">
                    <EditIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setFormOpen(false)}>编辑生命周期状态</DialogCloseTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField label="状态码" value={form.code} disabled fullWidth />
            <TextField label="状态名称" value={form.name} onChange={(e) => updateForm('name', e.target.value)} required fullWidth />
            <TextField label="说明" value={form.description} onChange={(e) => updateForm('description', e.target.value)} multiline minRows={2} fullWidth />
            <TextField label="颜色" type="color" value={form.color} onChange={(e) => updateForm('color', e.target.value)} fullWidth />
            <TextField label="排序" type="number" value={form.sortOrder} onChange={(e) => updateForm('sortOrder', Number(e.target.value))} fullWidth />
            <FormControlLabel control={<Switch checked={form.isActive} onChange={(e) => updateForm('isActive', e.target.checked)} />} label={form.isActive ? '启用' : '停用'} />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleSubmit} disabled={!form.name.trim()}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
      {feedbackDialog}
    </Box>
  );
};

export default LifecycleStatusConfigPage;
