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
import type { OrderTypeConfig } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import useAppFeedback from '../../shared/hooks/useAppFeedback';

type OrderTypeForm = Omit<OrderTypeConfig, 'id' | 'createdAt' | 'updatedAt'>;

const emptyForm: OrderTypeForm = {
  name: '',
  description: '',
  isActive: true,
  sortOrder: 100,
};

const OrderTypeConfigPage: React.FC = () => {
  const [items, setItems] = useState<OrderTypeConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrderTypeConfig | null>(null);
  const [form, setForm] = useState<OrderTypeForm>(emptyForm);
  const { alert, confirm, dialog: feedbackDialog } = useAppFeedback();

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await settingsApi.fetchOrderTypeConfigs();
      if (res.code === 0) setItems(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openForm = (item?: OrderTypeConfig) => {
    if (item) {
      setEditingItem(item);
      setForm({
        name: item.name,
        description: item.description || '',
        isActive: item.isActive,
        sortOrder: item.sortOrder,
      });
    } else {
      setEditingItem(null);
      setForm(emptyForm);
    }
    setFormOpen(true);
  };

  const updateForm = <K extends keyof OrderTypeForm>(key: K, value: OrderTypeForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    const payload = {
      ...form,
      name: form.name.trim(),
      sortOrder: Number(form.sortOrder),
    };
    const res = editingItem
      ? await settingsApi.updateOrderTypeConfig(editingItem.id, payload)
      : await settingsApi.createOrderTypeConfig(payload);
    if (res.code !== 0) {
      alert(res.message);
      return;
    }
    setFormOpen(false);
    loadData();
  };

  const handleToggleActive = async (item: OrderTypeConfig) => {
    await settingsApi.updateOrderTypeConfig(item.id, { isActive: !item.isActive });
    loadData();
  };

  const handleDelete = async (item: OrderTypeConfig) => {
    if (!await confirm(`确定删除订单类型“${item.name}”吗？`, '删除订单类型')) return;
    const res = await settingsApi.deleteOrderTypeConfig(item.id);
    if (res.code !== 0) {
      alert(res.message);
      return;
    }
    loadData();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>订单类型配置</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            维护订单新增、订单筛选和提成规则中使用的订单类型。改名会同步历史订单和提成规则，已有数据使用中的类型不能删除。
          </Typography>
        </Box>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => openForm()}>
          新增订单类型
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>订单类型</TableCell>
              <TableCell>说明</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>排序</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{item.name}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ maxWidth: 420 }}>{item.description || '-'}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={item.isActive ? '启用' : '停用'} size="small" color={item.isActive ? 'success' : 'default'} />
                </TableCell>
                <TableCell>{item.sortOrder}</TableCell>
                <TableCell align="center">
                  <Switch checked={item.isActive} size="small" onChange={() => handleToggleActive(item)} />
                  <IconButton size="small" onClick={() => openForm(item)} title="编辑">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(item)} title="删除">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center" sx={{ py: 5, color: '#9ca3af' }}>
                  {loading ? '加载中...' : '暂无订单类型'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setFormOpen(false)}>{editingItem ? '编辑订单类型' : '新增订单类型'}</DialogCloseTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <TextField
              label="订单类型名称"
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="说明"
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
            <TextField
              label="排序"
              type="number"
              value={form.sortOrder}
              onChange={(e) => updateForm('sortOrder', Number(e.target.value))}
              fullWidth
            />
            <FormControlLabel
              control={<Switch checked={form.isActive} onChange={(e) => updateForm('isActive', e.target.checked)} />}
              label={form.isActive ? '启用' : '停用'}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button variant="contained" onClick={handleSubmit} disabled={!form.name.trim()}>
            {editingItem ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
      {feedbackDialog}
    </Box>
  );
};

export default OrderTypeConfigPage;
