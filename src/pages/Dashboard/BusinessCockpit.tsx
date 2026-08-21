import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Box, Button, ButtonBase, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, Divider, LinearProgress, MenuItem, Paper, Stack, TextField, Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HeadsetMicOutlinedIcon from '@mui/icons-material/HeadsetMicOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { useNavigate } from 'react-router-dom';
import { dashboardApi } from '../../api';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import { ROUTES } from '../../shared/utils/constants';
import { formatCurrency } from '../../shared/utils/formatters';
import useAuthStore from '../../store/useAuthStore';
import type { BusinessCockpitData, CockpitDepartmentStatus, ManagementTargetConfig } from '../../types/dashboard';

const C = { page: '#F7F6FB', ink: '#17142B', muted: '#777184', line: '#E7E1F1', purple: '#7C3AED', red: '#D92D20', amber: '#C56B00', green: '#16875D' };

const departmentVisuals: Record<CockpitDepartmentStatus['id'], { icon: React.ElementType; accent: string }> = {
  sales: { icon: GroupsOutlinedIcon, accent: '#7C3AED' },
  'customer-success': { icon: SupportAgentOutlinedIcon, accent: '#2F80ED' },
  delivery: { icon: HeadsetMicOutlinedIcon, accent: '#12A6A0' },
  academy: { icon: SchoolOutlinedIcon, accent: '#F59E0B' },
  finance: { icon: PaymentsOutlinedIcon, accent: '#EC4899' },
  marketing: { icon: CampaignOutlinedIcon, accent: '#6D28D9' },
};

const shanghaiToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
const dateLabel = (date: string) => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).format(new Date(`${date}T12:00:00+08:00`));

const DepartmentCard: React.FC<{ department: CockpitDepartmentStatus; onClick?: () => void }> = ({ department, onClick }) => {
  const visual = departmentVisuals[department.id];
  const Icon = visual.icon;
  const status = department.state === 'attention'
    ? { label: `${department.attentionCount} 人需关注`, color: C.red, bg: '#FFF0EE' }
    : department.state === 'normal'
      ? { label: 'READY', color: C.green, bg: '#EAF8F1' }
      : { label: '待接入', color: C.muted, bg: '#F2F1F5' };
  return <Paper elevation={0} sx={{ border: `1px solid ${C.line}`, borderRadius: 2.5, overflow: 'hidden' }}>
    <ButtonBase disabled={!onClick} onClick={onClick} sx={{ width: '100%', minHeight: 94, p: 2, textAlign: 'left', borderLeft: `5px solid ${visual.accent}` }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ width: '100%' }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Box sx={{ width: 44, height: 44, borderRadius: '50%', display: 'grid', placeItems: 'center', color: visual.accent, bgcolor: `${visual.accent}12` }}><Icon /></Box>
          <Box><Typography fontWeight={900}>{department.name}</Typography><Typography variant="body2" color="text.secondary">{department.memberCount} 人</Typography></Box>
        </Stack>
        <Chip size="small" label={status.label} sx={{ color: status.color, bgcolor: status.bg, fontWeight: 850 }} />
      </Stack>
    </ButtonBase>
  </Paper>;
};

const TargetDialog: React.FC<{ open: boolean; month: string; onClose: () => void; onSaved: () => void }> = ({ open, month, onClose, onSaved }) => {
  const [config, setConfig] = useState<ManagementTargetConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true); setError('');
    void dashboardApi.fetchManagementTargets(month).then((response) => {
      if (response.code !== 0 || !response.data) throw new Error(response.message || '目标配置加载失败');
      setConfig(response.data);
    }).catch((value: unknown) => setError(value instanceof Error ? value.message : '目标配置加载失败')).finally(() => setLoading(false));
  }, [month, open]);

  const save = async () => {
    if (!config) return;
    setSaving(true); setError('');
    try {
      const response = await dashboardApi.saveManagementTargets(month, config);
      if (response.code !== 0) throw new Error(response.message || '目标保存失败');
      onSaved(); onClose();
    } catch (value) { setError(value instanceof Error ? value.message : '目标保存失败'); }
    finally { setSaving(false); }
  };

  return <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogCloseTitle onClose={onClose}>{month} 经营目标配置</DialogCloseTitle>
    <DialogContent dividers>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {loading || !config ? <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}><CircularProgress size={28} /></Box> : <Stack spacing={2.5}>
        <TextField label="公司月销售目标" type="number" value={config.companyTargetAmount ?? ''} onChange={(event) => setConfig({ ...config, companyTargetAmount: event.target.value === '' ? null : Number(event.target.value) })} helperText="口径：正式订单实收，不含售后回收" />
        <Box><Typography fontWeight={900} sx={{ mb: 1 }}>部门目标</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.25 }}>{config.departmentTargets.map((item, index) => <TextField key={item.departmentId} size="small" label={item.departmentName} type="number" value={item.amount} onChange={(event) => { const rows = [...config.departmentTargets]; rows[index] = { ...item, amount: Number(event.target.value) }; setConfig({ ...config, departmentTargets: rows }); }} />)}</Box></Box>
        <Divider />
        <Box><Typography fontWeight={900} sx={{ mb: 1 }}>销售个人目标</Typography><Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.25, maxHeight: 340, overflowY: 'auto', pr: 0.5 }}>{config.salesTargets.map((item, index) => <TextField key={item.userId} size="small" label={`${item.userName}${item.departmentName ? ` · ${item.departmentName}` : ''}`} type="number" value={item.amount} onChange={(event) => { const rows = [...config.salesTargets]; rows[index] = { ...item, amount: Number(event.target.value) }; setConfig({ ...config, salesTargets: rows }); }} />)}</Box></Box>
      </Stack>}
    </DialogContent>
    <DialogActions><Button onClick={onClose}>取消</Button><Button variant="contained" disabled={!config || saving} onClick={() => void save()}>{saving ? '保存中…' : '保存并生效'}</Button></DialogActions>
  </Dialog>;
};

const BusinessCockpit: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [data, setData] = useState<BusinessCockpitData | null>(null);
  const [anchorDate, setAnchorDate] = useState(shanghaiToday);
  const [departmentId, setDepartmentId] = useState('');
  const [targetOpen, setTargetOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true); setError('');
    try {
      const response = await dashboardApi.fetchBusinessCockpit({ preset: 'month', anchorDate, departmentId: departmentId || undefined });
      if (requestId !== requestRef.current) return;
      if (response.code !== 0 || !response.data) throw new Error(response.message || '驾驶舱数据加载失败');
      setData(response.data);
    } catch (value) { if (requestId === requestRef.current) setError(value instanceof Error ? value.message : '驾驶舱数据加载失败'); }
    finally { if (requestId === requestRef.current) setLoading(false); }
  }, [anchorDate, departmentId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (departmentId && data && !data.availableScopes.some((scope) => scope.id === departmentId)) {
      setDepartmentId('');
    }
  }, [data, departmentId]);

  const salesProfiles = useMemo(() => (data?.salesBattleProfiles || []).filter((item) => item.identityStatus === 'resolved'), [data]);
  const followed = salesProfiles.reduce((sum, item) => sum + item.todayFollowUpCount, 0);
  const intervention = salesProfiles.reduce((sum, item) => sum + (item.needsManagerInterventionCount || 0), 0);
  const executionException = salesProfiles.reduce((sum, item) => sum + item.overdueCustomerCount, 0);
  const businessRisk = Math.max(0, intervention - executionException);
  const performance = data?.managementPerformance;
  const progress = performance?.completionRate == null ? 0 : Math.min(100, Math.max(0, performance.completionRate));

  if (loading && !data) return <Box sx={{ minHeight: 480, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  if (!data) return <Box sx={{ p: 3 }}><Alert severity="error" action={<Button onClick={() => void load()}>重试</Button>}>{error || '暂无驾驶舱数据'}</Alert></Box>;

  return <Box sx={{ minHeight: '100%', bgcolor: C.page, px: { xs: 2, md: 3 }, py: 3 }}>
    <Box sx={{ maxWidth: 1480, mx: 'auto' }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ lg: 'center' }} spacing={2} sx={{ mb: 2 }}>
        <Box><Typography variant="h5" fontWeight={950}>早上好，{currentUser?.name || '管理者'}</Typography><Typography variant="body2" color="text.secondary" sx={{ mt: 0.4 }}>专注当下，掌控全局，推动业务高效增长。</Typography></Box>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <TextField size="small" type="date" value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} inputProps={{ max: shanghaiToday(), 'aria-label': '经营日期' }} title={dateLabel(anchorDate)} sx={{ minWidth: 168, bgcolor: '#fff' }} />
          <TextField
            size="small"
            select
            value={departmentId}
            onChange={(event) => setDepartmentId(event.target.value)}
            SelectProps={{
              displayEmpty: true,
              inputProps: { 'aria-label': '部门范围' },
              renderValue: (value) => data.availableScopes.find((scope) => scope.id === String(value))?.name || data.scopeLabel,
            }}
            sx={{ minWidth: 150, bgcolor: '#fff' }}
          >
            {data.availableScopes.map((scope) => <MenuItem key={scope.id || 'all'} value={scope.id}>{scope.name}</MenuItem>)}
          </TextField>
          <Button variant="outlined" startIcon={<SettingsOutlinedIcon />} onClick={() => setTargetOpen(true)}>配置销售目标</Button>
        </Stack>
      </Stack>
      {error && <Alert severity="warning" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper elevation={0} sx={{ position: 'relative', minHeight: 250, overflow: 'hidden', border: '1px solid #DED4F0', borderRadius: 3, px: { xs: 2.25, md: 3.5 }, py: 3, mb: 2, background: 'linear-gradient(110deg,#FFFFFF 0%,#FCFAFF 68%,#F1E7FF 100%)' }}>
        <Box sx={{ position: 'relative', zIndex: 2, maxWidth: { xs: '100%', md: '72%' } }}>
          <Stack direction="row" spacing={1} alignItems="center"><AutoAwesomeOutlinedIcon sx={{ color: C.purple }} /><Typography fontWeight={900}>星眸智控 · AI晨报</Typography><Typography variant="caption" color="text.secondary">{data.rangeLabel}</Typography></Stack>
          <Typography sx={{ fontSize: { xs: 25, md: 36 }, lineHeight: 1.42, fontWeight: 950, mt: 2.25 }}>
            今日跟进 <Box component="span" sx={{ color: C.purple }}>{followed}</Box> 个客户，月度完成 <Box component="span" sx={{ color: C.purple }}>{performance?.completionRate == null ? '待配置' : `${performance.completionRate.toFixed(1)}%`}</Box>，<br />
            <Box component="span" sx={{ color: intervention ? C.red : C.green }}>{intervention} 个客户需要老板介入</Box>。
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>执行异常 {executionException} 个 · 业务风险 {businessRisk} 个 · 数据均可穿透到责任人与客户</Typography>
        </Box>
        <Box component="img" src="/assets/cockpit/rmb-orbit-v1.png" alt="经营目标" sx={{ display: { xs: 'none', md: 'block' }, position: 'absolute', right: 10, top: -72, width: 350, opacity: 0.94 }} />
      </Paper>

      <Typography fontWeight={950} sx={{ mb: 1.25 }}>组织 · 部门矩阵</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(3,1fr)' }, gap: 1.5, mb: 2 }}>
        {data.departmentStatuses.map((item) => <DepartmentCard key={item.id} department={item} onClick={item.available ? () => navigate(ROUTES.SALES_MANAGEMENT) : undefined} />)}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0,2.2fr) minmax(280px,.8fr)' }, gap: 2 }}>
        <Paper elevation={0} sx={{ border: `1px solid ${C.line}`, borderRadius: 3, overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,1fr)' } }}>{[
            ['本月完成', formatCurrency(performance?.completedAmount || 0), C.purple],
            ['月目标', performance?.targetAmount == null ? '未配置' : formatCurrency(performance.targetAmount), '#1E6BFF'],
            ['目标差额', performance?.gapAmount == null ? '—' : formatCurrency(performance.gapAmount), C.amber],
          ].map(([label, value, color], index) => <Box key={label} sx={{ p: 2.5, borderRight: { sm: index < 2 ? '1px solid #EEEAF4' : 0 }, borderBottom: { xs: index < 2 ? '1px solid #EEEAF4' : 0, sm: 0 } }}><Typography variant="body2" color="text.secondary">{label}</Typography><Typography variant="h5" sx={{ mt: 0.6, color, fontWeight: 950 }}>{value}</Typography></Box>)}</Box>
          <Box sx={{ px: 2.5, pb: 2.25 }}><Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}><Typography variant="caption" color="text.secondary">正式订单实收口径</Typography><Typography variant="caption" fontWeight={900} color={C.purple}>{performance?.completionRate == null ? '配置后显示' : `${performance.completionRate.toFixed(1)}%`}</Typography></Stack><LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 99, bgcolor: '#EEEAF7', '& .MuiLinearProgress-bar': { bgcolor: C.purple, borderRadius: 99 } }} /></Box>
        </Paper>
        <Paper elevation={0} sx={{ border: '1px solid #E3D8F8', borderRadius: 3, p: 2.5, bgcolor: '#F7F1FF' }}>
          <Stack direction="row" spacing={1.25} alignItems="center"><Box sx={{ width: 42, height: 42, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: '#E6D7FF', color: C.purple }}><WarningAmberRoundedIcon /></Box><Box><Typography variant="h5" color={C.purple} fontWeight={950}>{intervention} 个客户需要介入</Typography><Typography variant="body2" color="text.secondary">先看责任人，再穿透客户与动作</Typography></Box></Stack>
          <Button fullWidth endIcon={<ArrowForwardIcon />} onClick={() => navigate(ROUTES.SALES_MANAGEMENT)} sx={{ mt: 2 }}>进入销售部战情</Button>
        </Paper>
      </Box>
    </Box>
    <TargetDialog open={targetOpen} month={anchorDate.slice(0, 7)} onClose={() => setTargetOpen(false)} onSaved={() => void load()} />
  </Box>;
};

export default BusinessCockpit;
