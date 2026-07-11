import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, login, loading, error, clearError } = useAuthStore();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  const from = (location.state as { from?: Location })?.from?.pathname || '/';

  useEffect(() => {
    clearError();
  }, [clearError]);

  if (currentUser) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await login({ account, password, remember });
    if (ok) navigate(from, { replace: true });
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(420px, 0.95fr) minmax(520px, 1.05fr)' },
        bgcolor: '#f6f8fb',
      }}
    >
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: { md: 5.5, lg: 7 },
          bgcolor: '#101828',
          color: '#fff',
          borderRight: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            component="img"
            src="/jixiang-os-logo.png"
            alt="极享OS"
            sx={{ width: 44, height: 44, borderRadius: 2, objectFit: 'contain' }}
          />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>极享OS</Typography>
            <Typography variant="body2" sx={{ color: '#cbd5e1', mt: 0.25 }}>AI企业运营系统</Typography>
          </Box>
        </Box>

        <Box sx={{ maxWidth: 500 }}>
          <Typography variant="overline" sx={{ color: '#93c5fd', fontWeight: 800, letterSpacing: 0 }}>
            ENTERPRISE OPERATIONS
          </Typography>
          <Typography variant="h3" sx={{ fontWeight: 800, mt: 1.5, mb: 2.5, letterSpacing: 0, lineHeight: 1.18 }}>
            把客户、订单与财务流程放在一个工作台里。
          </Typography>
          <Typography variant="body1" sx={{ color: '#cbd5e1', lineHeight: 1.9, maxWidth: 460 }}>
            面向销售、交付、财务和管理层的内部运营系统。数据按角色权限展示，日常工作从这里进入。
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.25} sx={{ flexWrap: 'wrap', gap: 1.25 }}>
          {['线索转化', '客户经营', '订单审核', '财务分账'].map((item) => (
            <Box
              key={item}
              sx={{
                px: 1.5,
                py: 0.75,
                border: '1px solid rgba(148,163,184,0.28)',
                borderRadius: 1,
                color: '#dbeafe',
                bgcolor: 'rgba(255,255,255,0.04)',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              {item}
            </Box>
          ))}
        </Stack>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, p: { xs: 2.25, md: 6 } }}>
        <Paper
          elevation={0}
          sx={{
            width: '100%',
            maxWidth: 440,
            p: { xs: 3, md: 4 },
            border: '1px solid #dbe3ef',
            borderRadius: 2,
            boxShadow: '0 24px 70px rgba(15, 23, 42, 0.08)',
            bgcolor: '#fff',
          }}
        >
          <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Box
              component="img"
              src="/jixiang-os-logo.png"
              alt="极享OS"
              sx={{ width: 42, height: 42, borderRadius: 2, objectFit: 'contain' }}
            />
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 800 }}>极享OS</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>AI企业运营系统</Typography>
            </Box>
          </Box>

          <Box sx={{ mb: 3 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#111827', mb: 0.75 }}>
              登录工作台
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', lineHeight: 1.7 }}>
              使用公司分配的账号进入系统。
            </Typography>
          </Box>

          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'grid', gap: 2 }}>
            <TextField
              label="账号"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              autoComplete="username"
              required
              fullWidth
            />
            <TextField
              label="密码"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton edge="end" onClick={() => setShowPassword((value) => !value)} aria-label="切换密码显示">
                      {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <FormControlLabel
              control={<Checkbox checked={remember} onChange={(event) => setRemember(event.target.checked)} />}
              label="记住登录状态"
              sx={{ color: '#475569', '& .MuiFormControlLabel-label': { fontSize: 14 } }}
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={loading || !account || !password}
              sx={{
                mt: 0.5,
                py: 1.35,
                fontWeight: 800,
                boxShadow: 'none',
                '&:hover': { boxShadow: 'none' },
              }}
            >
              {loading ? '登录中...' : '登录'}
            </Button>
          </Box>
        </Paper>
        <Box
          component="a"
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noreferrer"
          sx={{ color: '#64748b', fontSize: 13, textDecoration: 'none', '&:hover': { color: '#2563eb', textDecoration: 'underline' } }}
        >
          闽ICP备2026025630号-1
        </Box>
      </Box>
    </Box>
  );
};

export default Login;
