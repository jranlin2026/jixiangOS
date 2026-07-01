import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItemButton,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import { leadFlowApi, roleApi, settingsApi } from '../../api';
import type { LeadFlowConfig } from '../../types/lead';
import type { Role } from '../../types/role';
import type { User } from '../../types/settings';
import { canReceiveLead } from '../../shared/utils/permissions';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

const LEAD_UNIQUE_KEY_MODE = 'phone_or_wechat' as const;

const LeadFlowConfigTab: React.FC = () => {
  const [config, setConfig] = useState<LeadFlowConfig | null>(null);
  const [salesUsers, setSalesUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [saved, setSaved] = useState(false);
  const [participantDialogOpen, setParticipantDialogOpen] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');

  useEffect(() => {
    leadFlowApi.fetchLeadFlowConfig().then((res) => {
      if (res.code === 0) setConfig(res.data);
    });
    Promise.all([
      settingsApi.fetchUsers({ isActive: true }),
      roleApi.getRoles({ isActive: true }),
    ]).then(([usersRes, rolesRes]) => {
      if (usersRes.code === 0 && rolesRes.code === 0) {
        const activeRoles = rolesRes.data.filter((role) => role.isActive);
        setRoles(activeRoles);
        setSalesUsers(usersRes.data.filter((user) => canReceiveLead(user, activeRoles)));
      }
    });
  }, []);

  const updateConfig = <K extends keyof LeadFlowConfig>(key: K, value: LeadFlowConfig[K]) => {
    setConfig((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  };

  const addParticipant = (userId: string) => {
    if (!config) return;
    if (config.participantUserIds.includes(userId)) return;
    updateConfig('participantUserIds', [...config.participantUserIds, userId]);
  };

  const removeParticipant = (userId: string) => {
    if (!config) return;
    updateConfig('participantUserIds', config.participantUserIds.filter((id) => id !== userId));
  };

  const handleSave = async () => {
    if (!config) return;
    const res = await leadFlowApi.updateLeadFlowConfig({ ...config, uniqueKeyMode: LEAD_UNIQUE_KEY_MODE });
    if (res.code === 0) {
      setConfig(res.data);
      setSaved(true);
    }
  };

  if (!config) return null;

  const getParticipantRoleLabel = (user: User) => (
    roles.find((role) => role.id === user.roleId)?.name
    || roles.find((role) => role.name === user.role)?.name
    || user.role
  );
  const getParticipantLabel = (user: User) => {
    const roleLabel = getParticipantRoleLabel(user);
    return roleLabel ? `${user.name}（${roleLabel}）` : user.name;
  };
  const selectedParticipants = salesUsers.filter((user) => config.participantUserIds.includes(user.id));
  const normalizedParticipantSearch = participantSearch.trim().toLowerCase();
  const availableParticipants = salesUsers.filter((user) => {
    if (config.participantUserIds.includes(user.id)) return false;
    if (!normalizedParticipantSearch) return true;
    return [user.name, getParticipantRoleLabel(user), getParticipantLabel(user), user.account, user.email, user.phone]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedParticipantSearch));
  });

  return (
    <Paper elevation={0} sx={{ border: '1px solid #f0f0f0', p: 3 }}>
      {saved && <Alert severity="success" sx={{ mb: 2 }}>流转配置已保存并生效</Alert>}

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography sx={{ minWidth: 120, fontWeight: 600 }}>线索唯一标识</Typography>
        <Typography variant="body2" sx={{ color: '#374151' }}>手机号和微信二选一</Typography>
      </Box>
      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: 'grid', gap: 2 }}>
        <FormControlLabel
          control={<Switch checked={config.interceptionEnabled} onChange={(event) => updateConfig('interceptionEnabled', event.target.checked)} />}
          label="线索拦截：开启后，录入线索会按唯一标识进行查重，命中客户库或线索库时入库失败"
        />
        <FormControlLabel
          control={<Switch checked={config.autoAssignEnabled} onChange={(event) => updateConfig('autoAssignEnabled', event.target.checked)} />}
          label="线索自动分配：按照设置规则将线索自动分配给销售成员"
        />
      </Box>

      <Box sx={{ mt: 3, ml: 4 }}>
        <FormControl size="small" sx={{ minWidth: 180, mb: 2 }}>
          <InputLabel>分配规则</InputLabel>
          <Select value={config.assignmentMode} label="分配规则" onChange={() => updateConfig('assignmentMode', 'round_robin')}>
            <MenuItem value="round_robin">顺序平均分配</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 1, color: '#6b7280' }}>
            参与分配的成员 / 企业：
            <Button
              size="small"
              variant="text"
              startIcon={<PersonAddAltIcon fontSize="small" />}
              onClick={() => setParticipantDialogOpen(true)}
              sx={{ ml: 0.5, minWidth: 0, px: 0.5 }}
            >
              添加成员
            </Button>
          </Typography>
          <Box
            sx={{
              minHeight: 72,
              border: '1px solid #e5e7eb',
              borderRadius: 1,
              px: 1.5,
              py: 1.25,
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              bgcolor: '#fff',
            }}
          >
            {selectedParticipants.map((user) => (
              <Chip
                key={user.id}
                label={getParticipantLabel(user)}
                size="small"
                variant="outlined"
                onDelete={() => removeParticipant(user.id)}
                sx={{
                  borderColor: '#dbeafe',
                  bgcolor: '#eff6ff',
                  color: '#1f2937',
                  '& .MuiChip-deleteIcon': { color: '#64748b' },
                }}
              />
            ))}
            {selectedParticipants.length === 0 && (
              <Typography variant="body2" sx={{ color: '#9ca3af', lineHeight: '24px' }}>
                未指定参与成员时，新线索将保持待分配，不会自动分给管理员或其他员工
              </Typography>
            )}
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <FormControlLabel
              control={<Checkbox checked={config.dailyLimitEnabled} onChange={(event) => updateConfig('dailyLimitEnabled', event.target.checked)} />}
              label="每日分配的线索上限数"
            />
            <TextField
              size="small"
              type="number"
              value={config.dailyLimit}
              onChange={(event) => updateConfig('dailyLimit', Number(event.target.value) || 0)}
              sx={{ width: 110 }}
            />
          </Box>
        </Box>
      </Box>

      <Button variant="contained" sx={{ mt: 3 }} onClick={handleSave}>
        保存并生效
      </Button>

      <Dialog open={participantDialogOpen} onClose={() => setParticipantDialogOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setParticipantDialogOpen(false)}>添加参与成员</DialogCloseTitle>
        <DialogContent dividers>
          <TextField
            size="small"
            fullWidth
            placeholder="搜索员工姓名、账号、手机号"
            value={participantSearch}
            onChange={(event) => setParticipantSearch(event.target.value)}
            sx={{ mb: 1.5 }}
          />
          <List dense disablePadding sx={{ maxHeight: 320, overflow: 'auto' }}>
            {availableParticipants.map((user) => (
              <ListItemButton key={user.id} onClick={() => addParticipant(user.id)} sx={{ borderRadius: 1 }}>
                <ListItemText
                  primary={getParticipantLabel(user)}
                  secondary={[user.account, user.phone].filter(Boolean).join(' / ') || user.email}
                  primaryTypographyProps={{ fontWeight: 600 }}
                />
              </ListItemButton>
            ))}
            {availableParticipants.length === 0 && (
              <Typography variant="body2" sx={{ color: '#9ca3af', py: 3, textAlign: 'center' }}>
                暂无可添加成员
              </Typography>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setParticipantDialogOpen(false)}>完成</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default LeadFlowConfigTab;
