import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { leadFlowApi, settingsApi } from '../../api';
import type { LeadFlowConfig, LeadUniqueKeyMode } from '../../types/lead';
import type { User } from '../../types/settings';

const LeadFlowConfigTab: React.FC = () => {
  const [config, setConfig] = useState<LeadFlowConfig | null>(null);
  const [salesUsers, setSalesUsers] = useState<User[]>([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    leadFlowApi.fetchLeadFlowConfig().then((res) => {
      if (res.code === 0) setConfig(res.data);
    });
    settingsApi.fetchUsers({ isActive: true }).then((res) => {
      if (res.code === 0) {
        setSalesUsers(res.data.filter((user) => user.isActive && (user.role === '销售' || user.role === '销售经理')));
      }
    });
  }, []);

  const updateConfig = <K extends keyof LeadFlowConfig>(key: K, value: LeadFlowConfig[K]) => {
    setConfig((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  };

  const toggleUser = (userId: string) => {
    if (!config) return;
    updateConfig(
      'participantUserIds',
      config.participantUserIds.includes(userId)
        ? config.participantUserIds.filter((id) => id !== userId)
        : [...config.participantUserIds, userId],
    );
  };

  const handleSave = async () => {
    if (!config) return;
    const res = await leadFlowApi.updateLeadFlowConfig(config);
    if (res.code === 0) {
      setConfig(res.data);
      setSaved(true);
    }
  };

  if (!config) return null;

  return (
    <Paper elevation={0} sx={{ border: '1px solid #f0f0f0', p: 3 }}>
      {saved && <Alert severity="success" sx={{ mb: 2 }}>流转配置已保存并生效</Alert>}

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography sx={{ minWidth: 120, fontWeight: 600 }}>线索唯一标识</Typography>
        <RadioGroup
          row
          value={config.uniqueKeyMode}
          onChange={(event) => updateConfig('uniqueKeyMode', event.target.value as LeadUniqueKeyMode)}
        >
          <FormControlLabel value="phone" control={<Radio />} label="手机号" />
          <FormControlLabel value="wechat" control={<Radio />} label="微信" />
          <FormControlLabel value="phone_or_wechat" control={<Radio />} label="手机号和微信二选一" />
        </RadioGroup>
      </Box>
      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: 'grid', gap: 2 }}>
        <FormControlLabel
          control={<Switch checked={config.interceptionEnabled} onChange={(event) => updateConfig('interceptionEnabled', event.target.checked)} />}
          label="线索拦截：开启后，录入线索会按唯一标识进行查重，命中客户库或线索库时入库失败"
        />
        <FormControlLabel
          control={<Switch checked={config.exemptionEnabled} onChange={(event) => updateConfig('exemptionEnabled', event.target.checked)} />}
          label="线索免过滤：开启后，入库成功线索自动标记为有效商机并进入分配流程"
        />
        <FormControlLabel
          control={<Switch checked={config.orderMatchCustomerEnabled} onChange={(event) => updateConfig('orderMatchCustomerEnabled', event.target.checked)} />}
          label="订单匹配客户：开启后导入订单将自动与客户库匹配"
        />
        <FormControlLabel
          control={<Switch checked={config.autoAssignEnabled} onChange={(event) => updateConfig('autoAssignEnabled', event.target.checked)} />}
          label="商机自动分配：按照设置规则将线索自动分配给销售成员"
        />
      </Box>

      <Box sx={{ mt: 3, ml: 4 }}>
        <FormControl size="small" sx={{ minWidth: 180, mb: 2 }}>
          <InputLabel>分配规则</InputLabel>
          <Select value={config.assignmentMode} label="分配规则" onChange={() => updateConfig('assignmentMode', 'round_robin')}>
            <MenuItem value="round_robin">顺序平均分配</MenuItem>
          </Select>
        </FormControl>

        <Typography variant="body2" sx={{ mb: 1, color: '#6b7280' }}>参与分配的成员</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {salesUsers.map((user) => (
            <FormControlLabel
              key={user.id}
              control={<Checkbox checked={config.participantUserIds.includes(user.id)} onChange={() => toggleUser(user.id)} />}
              label={user.name}
              sx={{ border: '1px solid #e5e7eb', borderRadius: 1, px: 1, mr: 0 }}
            />
          ))}
          {salesUsers.length === 0 && <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无启用销售成员</Typography>}
        </Box>

        <Box sx={{ display: 'grid', gap: 1 }}>
          <FormControlLabel
            control={<Checkbox checked={config.dailyRestartEnabled} onChange={(event) => updateConfig('dailyRestartEnabled', event.target.checked)} />}
            label="每日重新开始循环"
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <FormControlLabel
              control={<Checkbox checked={config.dailyLimitEnabled} onChange={(event) => updateConfig('dailyLimitEnabled', event.target.checked)} />}
              label="每日分配的商机上限数"
            />
            <TextField
              size="small"
              type="number"
              value={config.dailyLimit}
              onChange={(event) => updateConfig('dailyLimit', Number(event.target.value) || 0)}
              sx={{ width: 110 }}
            />
          </Box>
          <FormControlLabel
            control={<Checkbox checked={config.failedInboundCompensationEnabled} onChange={(event) => updateConfig('failedInboundCompensationEnabled', event.target.checked)} />}
            label="每日入库失败补齐分配"
          />
          <FormControlLabel
            control={<Checkbox checked={config.inactiveMemberSkipEnabled} onChange={(event) => updateConfig('inactiveMemberSkipEnabled', event.target.checked)} />}
            label="不在线不参与自动分配"
          />
        </Box>
      </Box>

      <Button variant="contained" sx={{ mt: 3 }} onClick={handleSave}>
        保存并生效
      </Button>
    </Paper>
  );
};

export default LeadFlowConfigTab;
