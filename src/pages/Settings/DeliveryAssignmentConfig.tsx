import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, FormControlLabel, IconButton, MenuItem, Paper, Select, Stack, Switch, Typography } from '@mui/material';
import { ArrowDownward, ArrowUpward, DeleteOutline, DragIndicator } from '@mui/icons-material';
import { deliveryAssignmentApi } from '../../api/deliveryAssignmentApi';
import { settingsApi } from '../../api/settingsApi';
import type { User } from '../../types/settings';
import type { DeliveryAssignmentConfig, DeliveryAssignmentParticipant } from '../../types/deliveryAssignment';

const DeliveryAssignmentConfigPage: React.FC = () => {
  const [config, setConfig] = useState<DeliveryAssignmentConfig>({ enabled: false, participants: [] });
  const [users, setUsers] = useState<User[]>([]);
  const [addUserId, setAddUserId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([deliveryAssignmentApi.getConfig(), settingsApi.fetchAssignableUsers({ isActive: true })]).then(([configRes, usersRes]) => {
      if (configRes.code === 0) setConfig(configRes.data);
      if (usersRes.code === 0) setUsers(usersRes.data.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active'));
    });
  }, []);

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const nextIndex = config.participants.length
    ? ((config.lastAssignedUserId ? config.participants.findIndex((item) => item.userId === config.lastAssignedUserId) : -1) + 1) % config.participants.length
    : -1;
  const nextUser = nextIndex >= 0 ? userMap.get(config.participants[nextIndex]?.userId) : undefined;

  const moveParticipant = (from: number, to: number) => {
    if (to < 0 || to >= config.participants.length || from === to) return;
    const participants = [...config.participants];
    const [item] = participants.splice(from, 1);
    participants.splice(to, 0, item);
    setConfig((current) => ({ ...current, participants }));
  };
  const updateParticipant = (index: number, patch: Partial<DeliveryAssignmentParticipant>) => setConfig((current) => ({
    ...current,
    participants: current.participants.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item),
  }));
  const addParticipant = () => {
    if (!addUserId || config.participants.some((item) => item.userId === addUserId)) return;
    setConfig((current) => ({ ...current, participants: [...current.participants, { userId: addUserId, paused: false }] }));
    setAddUserId('');
  };
  const save = async () => {
    setMessage(''); setError('');
    const res = await deliveryAssignmentApi.saveConfig(config);
    if (res.code === 0) { setConfig(res.data); setMessage('客户成功分配规则已保存并生效'); }
    else setError(res.message || '保存失败');
  };

  return <Box>
    <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.5 }}>客户成功分配</Typography>
    <Typography color="text.secondary" sx={{ mb: 2 }}>所有产品共用一个人员池，按照下方人员顺序循环分配。</Typography>
    {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
    <FormControlLabel control={<Switch checked={config.enabled} onChange={(event) => setConfig((current) => ({ ...current, enabled: event.target.checked }))} />} label="启用自动分配" />
    <Alert severity="info" sx={{ my: 2 }}>下一位预计分配人员：{nextUser?.name || '暂无可分配人员'}</Alert>
    <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
      <Select size="small" displayEmpty value={addUserId} onChange={(event) => setAddUserId(event.target.value)} sx={{ minWidth: 240 }}>
        <MenuItem value="">选择参与人员</MenuItem>
        {users.filter((user) => !config.participants.some((item) => item.userId === user.id)).map((user) => <MenuItem key={user.id} value={user.id}>{user.name}</MenuItem>)}
      </Select>
      <Button variant="outlined" onClick={addParticipant}>添加成员</Button>
    </Stack>
    <Stack spacing={1}>
      {config.participants.map((participant, index) => <Paper key={participant.userId} draggable onDragStart={() => setDragIndex(index)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragIndex !== null) moveParticipant(dragIndex, index); setDragIndex(null); }} variant="outlined" sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <DragIndicator color="disabled" /><Typography sx={{ width: 28 }}>{index + 1}</Typography><Typography sx={{ flex: 1 }}>{userMap.get(participant.userId)?.name || participant.userId}</Typography>
        <FormControlLabel control={<Switch size="small" checked={participant.paused} onChange={(event) => updateParticipant(index, { paused: event.target.checked })} />} label="暂停接单" />
        <IconButton onClick={() => moveParticipant(index, index - 1)} disabled={index === 0}><ArrowUpward /></IconButton>
        <IconButton onClick={() => moveParticipant(index, index + 1)} disabled={index === config.participants.length - 1}><ArrowDownward /></IconButton>
        <IconButton color="error" onClick={() => setConfig((current) => ({ ...current, participants: current.participants.filter((item) => item.userId !== participant.userId) }))}><DeleteOutline /></IconButton>
      </Paper>)}
    </Stack>
    <Button variant="contained" sx={{ mt: 3 }} onClick={save}>保存配置</Button>
  </Box>;
};

export default DeliveryAssignmentConfigPage;
