import React, { useEffect, useMemo, useState } from 'react';
import { Box, Button, Chip, IconButton, Paper, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import { settingsApi } from '../../api';
import type { AfterSalesSourceConfig } from '../../types/settings';

const AfterSalesSourceConfigPage: React.FC = () => {
  const [items, setItems] = useState<AfterSalesSourceConfig[]>([]);
  const [newPlatform, setNewPlatform] = useState('');
  const [shopDrafts, setShopDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const platforms = useMemo(() => items.filter((item) => !item.parentId).sort((a, b) => a.sortOrder - b.sortOrder), [items]);
  const load = async () => {
    const response = await settingsApi.fetchAfterSalesSourceConfigs();
    if (response.code === 0) setItems(response.data);
  };
  useEffect(() => { void load(); }, []);

  const add = async (name: string, parentId?: string) => {
    const siblings = items.filter((item) => (item.parentId || '') === (parentId || ''));
    const response = await settingsApi.createAfterSalesSourceConfig({ name, parentId, isActive: true, sortOrder: siblings.length + 1 });
    setMessage(response.code === 0 ? '已保存' : response.message);
    if (response.code === 0) {
      if (parentId) setShopDrafts((current) => ({ ...current, [parentId]: '' }));
      else setNewPlatform('');
      await load();
    }
  };
  const toggle = async (item: AfterSalesSourceConfig) => {
    await settingsApi.updateAfterSalesSourceConfig(item.id, { isActive: !item.isActive });
    await load();
  };
  const remove = async (id: string) => {
    const response = await settingsApi.deleteAfterSalesSourceConfig(id);
    setMessage(response.code === 0 ? '已删除' : response.message);
    if (response.code === 0) await load();
  };

  return <Box>
    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>来源平台与店铺</Typography>
    <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>先维护平台，再为平台添加店铺。停用项不会出现在新建挽回订单中，历史订单仍保留原名称。</Typography>
    <Box sx={{ display: 'flex', gap: 1, mb: 2, maxWidth: 520 }}>
      <TextField size="small" label="新增平台" value={newPlatform} onChange={(event) => setNewPlatform(event.target.value)} fullWidth />
      <Button variant="contained" startIcon={<AddIcon />} disabled={!newPlatform.trim()} onClick={() => void add(newPlatform.trim())}>添加</Button>
    </Box>
    {message && <Typography variant="body2" sx={{ mb: 1, color: message === '已保存' || message === '已删除' ? '#059669' : '#dc2626' }}>{message}</Typography>}
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0' }}>
      <Table>
        <TableHead><TableRow><TableCell>平台</TableCell><TableCell>店铺</TableCell><TableCell>状态</TableCell><TableCell align="right">操作</TableCell></TableRow></TableHead>
        <TableBody>{platforms.map((platform) => {
          const shops = items.filter((item) => item.parentId === platform.id).sort((a, b) => a.sortOrder - b.sortOrder);
          return <TableRow key={platform.id}>
            <TableCell sx={{ fontWeight: 700 }}>{platform.name}</TableCell>
            <TableCell>
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
                {shops.map((shop) => <Chip key={shop.id} label={`${shop.name}${shop.isActive ? '' : '（停用）'}`} variant={shop.isActive ? 'filled' : 'outlined'} onClick={() => void toggle(shop)} onDelete={() => void remove(shop.id)} />)}
                <TextField size="small" placeholder="店铺名称" value={shopDrafts[platform.id] || ''} onChange={(event) => setShopDrafts((current) => ({ ...current, [platform.id]: event.target.value }))} sx={{ width: 160 }} />
                <Button size="small" disabled={!shopDrafts[platform.id]?.trim()} onClick={() => void add(shopDrafts[platform.id].trim(), platform.id)}>添加店铺</Button>
              </Box>
            </TableCell>
            <TableCell><Switch checked={platform.isActive} onChange={() => void toggle(platform)} /><Chip size="small" label={platform.isActive ? '启用' : '停用'} /></TableCell>
            <TableCell align="right"><IconButton color="error" onClick={() => void remove(platform.id)}><DeleteIcon /></IconButton></TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
    </TableContainer>
  </Box>;
};

export default AfterSalesSourceConfigPage;
