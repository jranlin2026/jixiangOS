import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, Dialog, TextField, MenuItem, Switch, IconButton,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { settingsApi } from '../../api';
import type { ChannelConfig } from '../../types/settings';

const ChannelConfigPage: React.FC = () => {
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editChannel, setEditChannel] = useState<ChannelConfig | null>(null);
  const [form, setForm] = useState({ name: '', type: '搜索引擎', budget: 0, isActive: true, description: '' });

  useEffect(() => {
    loadChannels();
  }, []);

  const loadChannels = async () => {
    const res = await settingsApi.fetchChannelConfigs();
    if (res.code === 0) setChannels(res.data);
  };

  const handleCreate = () => {
    setEditChannel(null);
    setForm({ name: '', type: '搜索引擎', budget: 0, isActive: true, description: '' });
    setFormOpen(true);
  };

  const handleEdit = (channel: ChannelConfig) => {
    setEditChannel(channel);
    setForm({ name: channel.name, type: channel.type, budget: channel.budget, isActive: channel.isActive, description: channel.description });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    if (editChannel) {
      await settingsApi.updateChannelConfig(editChannel.id, form);
    } else {
      await settingsApi.createChannelConfig(form);
    }
    setFormOpen(false);
    loadChannels();
  };

  const handleDelete = async (id: string) => {
    await settingsApi.deleteChannelConfig(id);
    loadChannels();
  };

  const handleToggleActive = async (channel: ChannelConfig) => {
    await settingsApi.updateChannelConfig(channel.id, { isActive: !channel.isActive });
    loadChannels();
  };

  const channelTypes = ['搜索引擎', '社交媒体', '展会', '转介绍', '直销'];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>渠道配置</Typography>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleCreate}>
          新增渠道
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>渠道名称</TableCell>
              <TableCell>类型</TableCell>
              <TableCell>预算</TableCell>
              <TableCell>状态</TableCell>
              <TableCell>描述</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {channels.map((ch) => (
              <TableRow key={ch.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{ch.name}</TableCell>
                <TableCell><Chip label={ch.type} size="small" variant="outlined" /></TableCell>
                <TableCell>¥{ch.budget.toLocaleString()}</TableCell>
                <TableCell>
                  <Chip label={ch.isActive ? '启用' : '停用'} size="small" color={ch.isActive ? 'success' : 'default'} />
                </TableCell>
                <TableCell>{ch.description}</TableCell>
                <TableCell align="center">
                  <Switch checked={ch.isActive} size="small" onChange={() => handleToggleActive(ch)} />
                  <IconButton size="small" onClick={() => handleEdit(ch)} title="编辑"><EditIcon fontSize="small" /></IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(ch.id)} title="删除"><DeleteIcon fontSize="small" /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <Box sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
            {editChannel ? '编辑渠道' : '新增渠道'}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
            <TextField label="渠道名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required fullWidth />
            <TextField select label="渠道类型" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} fullWidth>
              {channelTypes.map((t) => (
                <MenuItem key={t} value={t}>{t}</MenuItem>
              ))}
            </TextField>
            <TextField label="预算" type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: Number(e.target.value) })} fullWidth />
            <TextField label="描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            <Button onClick={() => setFormOpen(false)}>取消</Button>
            <Button variant="contained" onClick={handleSubmit} disabled={!form.name}>
              {editChannel ? '保存' : '创建'}
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
};

export default ChannelConfigPage;
