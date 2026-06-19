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
  TextField,
  Typography,
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';

const Login: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser, login, loading, error, clearError } = useAuthStore();
  const [account, setAccount] = useState('admin');
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
        gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' },
        bgcolor: '#f7f9fc',
      }}
    >
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          justifyContent: 'space-between',
          p: 6,
          bgcolor: '#0f172a',
          color: '#fff',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: '#2196F3', display: 'grid', placeItems: 'center', fontWeight: 800 }}>
            AI
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>AI智能体运营</Typography>
        </Box>

        <Box sx={{ maxWidth: 520 }}>
          <Typography variant="h3" sx={{ fontWeight: 700, mb: 2, letterSpacing: 0 }}>
            内部运营管理系统
          </Typography>
          <Typography variant="body1" sx={{ color: '#cbd5e1', lineHeight: 1.9 }}>
            线索、客户、订单、交付、财务和系统配置统一管理。登录后将根据角色权限展示对应模块和操作。
          </Typography>
        </Box>

        <Typography variant="body2" sx={{ color: '#94a3b8' }}>
          默认管理员账号：admin，默认密码：Admin@123456
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: { xs: 2, md: 6 } }}>
        <Paper elevation={0} sx={{ width: '100%', maxWidth: 430, p: { xs: 3, md: 4 }, border: '1px solid #e5e7eb', borderRadius: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
            <Box sx={{ width: 38, height: 38, borderRadius: 2, bgcolor: '#E3F2FD', color: '#1976D2', display: 'grid', placeItems: 'center' }}>
              <LockOutlinedIcon fontSize="small" />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>账号登录</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>请输入账号和密码进入系统</Typography>
            </Box>
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
            />
            <Button type="submit" variant="contained" size="large" disabled={loading || !account || !password}>
              {loading ? '登录中...' : '登录'}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Box>
  );
};

export default Login;
