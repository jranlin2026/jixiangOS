import React from 'react';
import { Box, Typography } from '@mui/material';
import InboxIcon from '@mui/icons-material/Inbox';

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactElement;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  title = '暂无数据',
  description = '当前没有可显示的内容',
  icon,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        py: 6,
        px: 2,
      }}
    >
      <Box sx={{ mb: 2, color: '#d1d5db' }}>
        {icon || <InboxIcon sx={{ fontSize: 48 }} />}
      </Box>
      <Typography variant="h6" sx={{ color: '#9ca3af', fontWeight: 500, mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: '#9ca3af' }}>
        {description}
      </Typography>
    </Box>
  );
};

export default EmptyState;
