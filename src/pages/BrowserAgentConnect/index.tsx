import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { backendRequest } from '../../api/backendClient';

export default function BrowserAgentConnect() {
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);

  const authorize = async () => {
    setRunning(true);
    setError('');
    const params = new URLSearchParams(window.location.search);
    const state = params.get('state') || '';
    const codeChallenge = params.get('code_challenge') || '';
    const redirectUri = params.get('redirect_uri') || '';
    const deviceId = params.get('device_id') || '';
    if (!state || !codeChallenge || !redirectUri || !deviceId) {
      setError('插件授权参数不完整，请返回插件重新连接');
      setRunning(false);
      return;
    }
    try {
      const result = await backendRequest<string>('/browser-agent/auth/authorize', {
        method: 'POST',
        body: JSON.stringify({ codeChallenge, redirectUri, deviceId }),
      });
      if (result.code !== 0 || !result.data) {
        setError(result.code === 403
          ? '当前账号没有“线索-新建线索”权限，无法使用浏览器员工，请联系管理员授权'
          : result.message || '浏览器员工授权失败');
        setRunning(false);
        return;
      }
      const redirect = new URL(redirectUri);
      redirect.searchParams.set('code', result.data);
      redirect.searchParams.set('state', state);
      window.location.replace(redirect.toString());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法连接极享OS，请检查服务后重试');
      setRunning(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get('state') || !params.get('redirect_uri')) setError('插件授权参数不完整，请返回插件重新连接');
  }, []);

  return <Box sx={{ minHeight: '100vh', bgcolor: '#f5f7fb', display: 'grid', placeItems: 'center', p: 2 }}>
    <Paper variant="outlined" sx={{ width: '100%', maxWidth: 480, p: 4, borderRadius: 3 }}>
      <Stack spacing={2.5} alignItems="center" textAlign="center">
        <Box component="img" src="/jixiang-os-logo.png" alt="极享OS" sx={{ width: 56, height: 56 }} />
        <Typography variant="h5" fontWeight={800}>连接极享AI浏览器员工</Typography>
        {!running && !error ? <Alert severity="info" sx={{ width: '100%', textAlign: 'left' }}>
          授权后，插件可使用当前账号的新建线索权限完成线索入库。插件不会读取您的密码，也不能访问极享OS其他模块。
        </Alert> : null}
        {running ? <><CircularProgress size={34} /><Typography color="text.secondary">正在确认登录状态和线索权限…</Typography></> : null}
        {error ? <Alert severity="error" sx={{ width: '100%', textAlign: 'left' }}>{error}</Alert> : null}
        {!running ? <Button variant="contained" onClick={() => void authorize()}>{error ? '重新授权' : '确认连接'}</Button> : null}
      </Stack>
    </Paper>
  </Box>;
}
