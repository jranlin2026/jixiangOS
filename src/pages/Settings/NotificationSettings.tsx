import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Divider, FormControlLabel, Paper, Stack, Switch,
  TextField, Typography,
} from '@mui/material';
import { notificationApi } from '../../api/notificationApi';
import type { NotificationChannelStatus, NotificationRuleView } from '../../types/notification';
import TablePagination from '../../shared/components/TablePagination';
import type { NotificationDeliveryLog } from '../../types/notification';

const configLabels: Record<string, { label: string; suffix?: string }> = {
  ackReminderMinutes: { label: '未确认再次提醒', suffix: '分钟' },
  firstFollowUpReminderMinutes: { label: '未首次跟进提醒', suffix: '分钟' },
  firstFollowUpEscalationMinutes: { label: '未首次跟进升级主管', suffix: '分钟' },
  dueSoonMinutes: { label: '到期前提醒', suffix: '分钟' },
  overdueReminderMinutes: { label: '逾期后再次提醒', suffix: '分钟' },
  escalateNextWorkday: { label: '下一工作日仍未完成时升级主管' },
  checkInReminderMinutes: { label: '周检视提前提醒', suffix: '分钟' },
  riskEscalationMinutes: { label: '风险升级主管', suffix: '分钟' },
  schedulerFailureThreshold: { label: '调度连续失败阈值', suffix: '次' },
};

export default function NotificationSettings() {
  const [rules, setRules] = useState<NotificationRuleView[]>([]);
  const [channel, setChannel] = useState<NotificationChannelStatus | null>(null);
  const [logs, setLogs] = useState<NotificationDeliveryLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const [rulesResponse, channelResponse, logResponse] = await Promise.all([
      notificationApi.listRules(), notificationApi.channelStatus(), notificationApi.listDeliveries(page + 1, pageSize),
    ]);
    if (rulesResponse.code === 0) setRules(rulesResponse.data); else setMessage(rulesResponse.message);
    if (channelResponse.code === 0) setChannel(channelResponse.data);
    if (logResponse.code === 0) { setLogs(logResponse.data.items); setTotal(logResponse.data.pagination.total); }
  }, [page, pageSize]);
  useEffect(() => { void load(); }, [load]);

  const updateRule = (eventType: string, patch: Partial<NotificationRuleView>) => setRules((current) => current.map((rule) => rule.eventType === eventType ? { ...rule, ...patch } : rule));
  const save = async (rule: NotificationRuleView) => {
    const response = await notificationApi.updateRule(rule.eventType, rule);
    setMessage(response.code === 0 ? `${rule.label}已保存` : response.message);
    if (response.code === 0) updateRule(rule.eventType, response.data);
  };

  return <Stack spacing={2.5}>
    {message && <Alert severity={message.endsWith('已保存') ? 'success' : 'error'} onClose={() => setMessage('')}>{message}</Alert>}
    <Paper variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
        <Box><Typography variant="h6" fontWeight={800}>飞书应用消息</Typography><Typography variant="body2" color="text.secondary">个人提醒通过飞书应用私信发送；站内消息始终保留为唯一事实记录。</Typography></Box>
        <Stack direction="row" spacing={1} alignItems="center"><Chip color={channel?.configured ? 'success' : 'warning'} label={channel?.configured ? '服务已配置' : '服务未配置'} /><Chip color={channel?.bound ? 'success' : 'default'} label={channel?.bound ? '当前账号已绑定' : '当前账号待自动绑定'} /></Stack>
      </Stack>
      {channel?.lastError && <Alert severity="warning" sx={{ mt: 2 }}>{channel.lastError}</Alert>}
    </Paper>
    {rules.map((rule) => <Paper key={rule.eventType} variant="outlined" sx={{ p: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={2}>
        <Box><Typography variant="h6" fontWeight={800}>{rule.label}</Typography><Typography variant="body2" color="text.secondary">{rule.description}</Typography></Box>
        <Stack direction="row" spacing={2} alignItems="center"><FormControlLabel control={<Switch checked={rule.enabled} onChange={(_, enabled) => updateRule(rule.eventType, { enabled })} />} label="启用规则" />{rule.eventType === 'WORKBENCH_WORKFLOW' && <Chip size="small" label="仅站内消息" />}{rule.eventType !== 'WORKBENCH_WORKFLOW' && <FormControlLabel control={<Switch checked={rule.channels.includes('FEISHU')} onChange={(_, enabled) => updateRule(rule.eventType, { channels: enabled ? ['FEISHU'] : [] })} />} label="飞书私信" />}</Stack>
      </Stack>
      <Divider sx={{ my: 2 }} />
      <Stack direction="row" flexWrap="wrap" gap={2}>{Object.entries(rule.config).map(([key, value]) => typeof value === 'boolean' ? <FormControlLabel key={key} control={<Switch checked={value} onChange={(_, checked) => updateRule(rule.eventType, { config: { ...rule.config, [key]: checked } })} />} label={configLabels[key]?.label || key} /> : <TextField key={key} size="small" type="number" label={configLabels[key]?.label || key} value={value} onChange={(event) => updateRule(rule.eventType, { config: { ...rule.config, [key]: Math.max(0, Number(event.target.value)) } })} InputProps={{ endAdornment: configLabels[key]?.suffix }} sx={{ width: 210 }} />)}</Stack>
      <Box sx={{ mt: 2, textAlign: 'right' }}><Button variant="contained" onClick={() => void save(rule)}>保存规则</Button></Box>
    </Paper>)}
    <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
      <Box sx={{ p: 2.5 }}><Typography variant="h6" fontWeight={800}>渠道投递日志</Typography><Typography variant="body2" color="text.secondary">用于检查飞书消息是否发送成功；投递成功不代表业务已经处理。</Typography></Box><Divider />
      {logs.map((log) => <Stack key={log.id} direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" gap={1} sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid #EEF2F6' }}><Box><Typography variant="body2" fontWeight={700}>{log.title}</Typography><Typography variant="caption" color="text.secondary">{log.recipientName} · {new Date(log.createdAt).toLocaleString('zh-CN', { hour12: false })}</Typography></Box><Stack direction="row" spacing={1} alignItems="center"><Chip size="small" label={log.channel} /><Chip size="small" color={log.status === 'SENT' ? 'success' : log.status === 'FAILED' ? 'error' : 'default'} label={log.status} />{log.lastError && <Typography variant="caption" color="error">{log.lastError}</Typography>}</Stack></Stack>)}
      <TablePagination count={total} page={page} rowsPerPage={pageSize} onPageChange={(_, next) => setPage(next)} onRowsPerPageChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }} />
    </Paper>
  </Stack>;
}
