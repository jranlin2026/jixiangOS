import React from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import BlockIcon from '@mui/icons-material/Block';
import { useNavigate } from 'react-router-dom';

const NoPermission: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Box sx={{ p: 3, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 460, p: 4, textAlign: 'center', border: '1px solid #e5e7eb', borderRadius: 2 }}>
        <Box sx={{ width: 56, height: 56, mx: 'auto', mb: 2, borderRadius: 2, bgcolor: '#FEF2F2', color: '#DC2626', display: 'grid', placeItems: 'center' }}>
          <BlockIcon />
        </Box>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>无权限访问</Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', mb: 3 }}>
          当前账号没有访问该模块的权限，请联系管理员调整角色权限。
        </Typography>
        <Button variant="contained" onClick={() => navigate('/')}>返回首页</Button>
      </Paper>
    </Box>
  );
};

export default NoPermission;
