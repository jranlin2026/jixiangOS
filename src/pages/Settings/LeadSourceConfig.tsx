import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import type { LeadSourceConfig } from '../../types/settings';

const emptyForm = { name: '', parentId: '', isActive: true, sortOrder: 1, description: '' };

const LeadSourceConfigPage: React.FC = () => {
  const [items, setItems] = useState<LeadSourceConfig[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LeadSourceConfig | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const parentSources = useMemo(() => items.filter((item) => !item.parentId).sort((a, b) => a.sortOrder - b.sortOrder), [items]);
  const childrenByParent = useMemo(() => {
    const grouped = new Map<string, LeadSourceConfig[]>();
    items.filter((item) => item.parentId).forEach((item) => {
      grouped.set(item.parentId!, [...(grouped.get(item.parentId!) || []), item]);
    });
    grouped.forEach((children, parentId) => grouped.set(parentId, children.sort((a, b) => a.sortOrder - b.sortOrder)));
    return grouped;
  }, [items]);

  const loadData = async () => {
    const res = await settingsApi.fetchLeadSourceConfigs();
    if (res.code === 0) setItems(res.data);
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreate = (parentId = '') => {
    setEditing(null);
    setError('');
    setForm({ ...emptyForm, parentId, sortOrder: parentId ? (childrenByParent.get(parentId)?.length || 0) + 1 : parentSources.length + 1 });
    setFormOpen(true);
  };

  const openEdit = (item: LeadSourceConfig) => {
    setEditing(item);
    setError('');
    setForm({
      name: item.name,
      parentId: item.parentId || '',
      isActive: item.isActive,
      sortOrder: item.sortOrder,
      description: item.description || '',
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    const payload = { ...form, parentId: form.parentId || undefined, sortOrder: Number(form.sortOrder) || 1 };
    const res = editing
      ? await settingsApi.updateLeadSourceConfig(editing.id, payload)
      : await settingsApi.createLeadSourceConfig(payload);
    if (res.code !== 0) {
      setError(res.message);
      return;
    }
    setFormOpen(false);
    loadData();
  };

  const handleDelete = async (id: string) => {
    const res = await settingsApi.deleteLeadSourceConfig(id);
    if (res.code !== 0) {
      setError(res.message);
      return;
    }
    loadData();
  };

  const toggleActive = async (item: LeadSourceConfig) => {
    await settingsApi.updateLeadSourceConfig(item.id, { isActive: !item.isActive });
    loadData();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2, gap: 2 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>线索来源配置</Typography>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>维护一级来源和二级来源，例如抖音下配置直播、视频。</Typography>
        </Box>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => openCreate()}>
          新增一级来源
        </Button>
      </Box>

      {error && <Typography sx={{ color: '#d32f2f', mb: 1 }}>{error}</Typography>}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>一级来源</TableCell>
              <TableCell>二级来源</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>排序</TableCell>
              <TableCell>说明</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {parentSources.map((parent) => {
              const children = childrenByParent.get(parent.id) || [];
              return (
                <TableRow key={parent.id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{parent.name}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      {children.map((child) => (
                        <Chip key={child.id} label={child.name} size="small" variant={child.isActive ? 'filled' : 'outlined'} onDelete={() => handleDelete(child.id)} onClick={() => openEdit(child)} />
                      ))}
                      <Button size="small" onClick={() => openCreate(parent.id)}>添加二级</Button>
                    </Box>
                  </TableCell>
                  <TableCell><Chip label={parent.isActive ? '启用' : '停用'} size="small" color={parent.isActive ? 'success' : 'default'} /></TableCell>
                  <TableCell>{parent.sortOrder}</TableCell>
                  <TableCell>{parent.description || '-'}</TableCell>
                  <TableCell align="center">
                    <Switch checked={parent.isActive} size="small" onChange={() => toggleActive(parent)} />
                    <IconButton size="small" onClick={() => openEdit(parent)}><EditIcon fontSize="small" /></IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDelete(parent.id)}><DeleteIcon fontSize="small" /></IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? '编辑线索来源' : '新增线索来源'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
            <TextField label="来源名称" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required fullWidth />
            <FormControl fullWidth>
              <InputLabel>上级来源</InputLabel>
              <Select value={form.parentId} label="上级来源" onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
                <MenuItem value="">一级来源</MenuItem>
                {parentSources.filter((item) => item.id !== editing?.id).map((item) => (
                  <MenuItem key={item.id} value={item.id}>{item.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="排序" type="number" value={form.sortOrder} onChange={(event) => setForm({ ...form, sortOrder: Number(event.target.value) })} fullWidth />
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Switch checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
              <Typography>{form.isActive ? '启用' : '停用'}</Typography>
            </Box>
            <TextField label="说明" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} fullWidth sx={{ gridColumn: '1 / -1' }} />
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

export default LeadSourceConfigPage;
