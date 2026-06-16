import React from 'react';
import { Box, CircularProgress, Typography, Backdrop } from '@mui/material';

interface LoadingOverlayProps {
  loading: boolean;
  message?: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ loading, message = '加载中...' }) => {
  if (!loading) return null;

  return (
    <Backdrop
      sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1, position: 'absolute' }}
      open={loading}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={40} />
        <Typography variant="body2">{message}</Typography>
      </Box>
    </Backdrop>
  );
};

export default LoadingOverlay;
