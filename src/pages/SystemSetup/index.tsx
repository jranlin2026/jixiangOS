import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import BusinessRoundedIcon from '@mui/icons-material/BusinessRounded';
import type { SystemSetupStatus } from '../../api/systemSetupApi';
import { systemSetupApi } from '../../api/systemSetupApi';

interface SystemSetupProps {
  status: SystemSetupStatus;
  onComplete: (status: SystemSetupStatus) => void;
}

const steps = ['验证安装', '企业与管理员', '确认初始化'];

function clearClientRuntimeCache(): void {
  const keys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index));
  keys.forEach((key) => {
    if (key?.startsWith('aaos_')) localStorage.removeItem(key);
  });
}

const SystemSetup: React.FC<SystemSetupProps> = ({ status, onComplete }) => {
  const [liveStatus, setLiveStatus] = useState(status);
  const [activeStep, setActiveStep] = useState(0);
  const [setupToken, setSetupToken] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminAccount, setAdminAccount] = useState('admin');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [organizationTemplate, setOrganizationTemplate] = useState<'minimal' | 'recommended'>('recommended');
  const [includeDemoData, setIncludeDemoData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isMaintenance = liveStatus.state === 'INITIALIZING' || liveStatus.state === 'RESETTING';

  useEffect(() => {
    setLiveStatus(status);
  }, [status]);

  useEffect(() => {
    if (!isMaintenance) return undefined;

    let cancelled = false;
    const refreshStatus = async () => {
      try {
        const response = await systemSetupApi.getStatus();
        if (cancelled || response.code !== 0 || !response.data) return;
        if (response.data.state === 'ACTIVE') {
          clearClientRuntimeCache();
          onComplete(response.data);
          return;
        }
        setLiveStatus(response.data);
      } catch {
        // 短暂网络失败时保留维护态，下一轮自动重试。
      }
    };

    void refreshStatus();
    const timer = window.setInterval(refreshStatus, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isMaintenance, onComplete]);

  const stepError = useMemo(() => {
    if (activeStep === 0 && !setupToken.trim()) return '请输入部署时生成的一次性初始化码';
    if (activeStep === 1) {
      if (!companyName.trim()) return '请输入企业名称';
      if (!adminName.trim()) return '请输入管理员姓名';
      if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,99}$/.test(adminAccount.trim())) return '管理员账号至少3位，仅支持字母、数字、点、下划线和短横线';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail.trim())) return '请输入正确的管理员邮箱';
      if (adminPassword.length < 10 || !/[A-Za-z]/.test(adminPassword) || !/\d/.test(adminPassword)) return '管理员密码至少10位，且必须同时包含字母和数字';
      if (adminPassword !== adminPasswordConfirm) return '两次输入的管理员密码不一致';
    }
    return null;
  }, [activeStep, setupToken, companyName, adminName, adminAccount, adminEmail, adminPassword, adminPasswordConfirm]);

  const next = () => {
    setError(null);
    if (stepError) {
      setError(stepError);
      return;
    }
    setActiveStep((step) => Math.min(step + 1, steps.length - 1));
  };

  const initialize = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const response = await systemSetupApi.initialize({
        setupToken,
        companyName,
        adminName,
        adminAccount,
        adminEmail,
        adminPhone,
        adminPassword,
        organizationTemplate,
        includeDemoData,
      });
      if (response.code !== 0 || !response.data) {
        setError(response.message || '系统初始化失败');
        return;
      }
      clearClientRuntimeCache();
      onComplete(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '系统初始化失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (isMaintenance) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: '#f4f7fb', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2.5 }}>
        <Paper elevation={0} sx={{ width: '100%', maxWidth: 560, border: '1px solid #dbe3ef', borderRadius: 3, p: { xs: 4, md: 6 }, textAlign: 'center', boxShadow: '0 28px 80px rgba(15,23,42,0.10)' }}>
          <CircularProgress size={44} />
          <Typography variant="h5" sx={{ fontWeight: 800, mt: 3 }}>
            {liveStatus.state === 'INITIALIZING' ? '系统正在初始化' : '系统正在维护'}
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 1.5 }}>
            请不要关闭页面或重复提交。完成后将自动进入登录页。
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f4f7fb', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2.5 }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 760, border: '1px solid #dbe3ef', borderRadius: 3, overflow: 'hidden', boxShadow: '0 28px 80px rgba(15,23,42,0.10)' }}>
        <Box sx={{ bgcolor: '#101828', color: '#fff', px: { xs: 3, md: 5 }, py: 4 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Box sx={{ width: 48, height: 48, borderRadius: 2, bgcolor: '#2563eb', display: 'grid', placeItems: 'center' }}>
              <BusinessRoundedIcon />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>极享OS 系统初始化</Typography>
              <Typography variant="body2" sx={{ color: '#cbd5e1', mt: 0.5 }}>创建企业和首位超级管理员后，系统才能正式使用。</Typography>
            </Box>
          </Stack>
        </Box>

        <Box sx={{ p: { xs: 3, md: 5 } }}>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
          </Stepper>

          {!liveStatus.setupAvailable && (
            <Alert severity="warning" sx={{ mb: 3 }}>服务器尚未配置初始化码，请联系部署人员完成配置后重启服务。</Alert>
          )}
          {liveStatus.state === 'FAILED' && (
            <Alert severity="warning" sx={{ mb: 3 }}>上次初始化没有完成，请核对信息后重新提交。</Alert>
          )}
          {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

          {activeStep === 0 && (
            <Stack spacing={2.5}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 800, mb: 0.75 }}>验证部署授权</Typography>
                <Typography variant="body2" color="text.secondary">初始化码由部署工具生成，只能用于当前服务器的首次初始化。</Typography>
              </Box>
              <TextField label="一次性初始化码" value={setupToken} onChange={(event) => setSetupToken(event.target.value)} type="password" autoComplete="off" required fullWidth />
            </Stack>
          )}

          {activeStep === 1 && (
            <Stack spacing={2.25}>
              <TextField label="企业名称" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required fullWidth />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="管理员姓名" value={adminName} onChange={(event) => setAdminName(event.target.value)} required fullWidth />
                <TextField label="管理员账号" value={adminAccount} onChange={(event) => setAdminAccount(event.target.value)} required fullWidth />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="管理员邮箱" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} type="email" required fullWidth />
                <TextField label="管理员手机号（可选）" value={adminPhone} onChange={(event) => setAdminPhone(event.target.value)} fullWidth />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField label="管理员密码" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} type="password" autoComplete="new-password" required fullWidth />
                <TextField label="确认管理员密码" value={adminPasswordConfirm} onChange={(event) => setAdminPasswordConfirm(event.target.value)} type="password" autoComplete="new-password" required fullWidth />
              </Stack>
              <FormControl fullWidth>
                <InputLabel id="organization-template-label">组织架构模板</InputLabel>
                <Select labelId="organization-template-label" label="组织架构模板" value={organizationTemplate} onChange={(event) => setOrganizationTemplate(event.target.value as 'minimal' | 'recommended')}>
                  <MenuItem value="recommended">推荐部门与岗位模板</MenuItem>
                  <MenuItem value="minimal">空白组织架构</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel control={<Checkbox checked={includeDemoData} onChange={(event) => setIncludeDemoData(event.target.checked)} />} label="安装演示业务数据（默认不安装）" />
            </Stack>
          )}

          {activeStep === 2 && (
            <Stack spacing={2.25}>
              <Typography variant="h6" sx={{ fontWeight: 800 }}>确认初始化信息</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px 1fr' }, gap: 1.5, p: 2.5, bgcolor: '#f8fafc', borderRadius: 2, border: '1px solid #e2e8f0' }}>
                <Typography color="text.secondary">企业名称</Typography><Typography fontWeight={700}>{companyName}</Typography>
                <Typography color="text.secondary">超级管理员</Typography><Typography fontWeight={700}>{adminName}（{adminAccount}）</Typography>
                <Typography color="text.secondary">组织架构</Typography><Typography fontWeight={700}>{organizationTemplate === 'recommended' ? '推荐模板' : '空白组织'}</Typography>
                <Typography color="text.secondary">演示数据</Typography><Typography fontWeight={700}>{includeDemoData ? '安装' : '不安装'}</Typography>
              </Box>
              <Alert severity="info">初始化提交后，当前初始化码会立即失效。管理员可使用刚设置的账号密码登录。</Alert>
            </Stack>
          )}

          <Stack direction="row" justifyContent="space-between" sx={{ mt: 4 }}>
            <Button disabled={activeStep === 0 || submitting} onClick={() => { setError(null); setActiveStep((step) => step - 1); }}>上一步</Button>
            {activeStep < steps.length - 1 ? (
              <Button variant="contained" disabled={!liveStatus.setupAvailable} onClick={next}>下一步</Button>
            ) : (
              <Button variant="contained" disabled={submitting || !liveStatus.setupAvailable} onClick={initialize} startIcon={submitting ? <CircularProgress size={18} color="inherit" /> : undefined}>
                {submitting ? '正在初始化' : '确认初始化'}
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
};

export default SystemSetup;
