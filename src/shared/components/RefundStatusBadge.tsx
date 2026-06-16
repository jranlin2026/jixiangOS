import React from 'react';
import { Chip } from '@mui/material';
import type { RefundStatus } from '../../types/common';

interface RefundStatusBadgeProps {
  status: RefundStatus;
  size?: 'small' | 'medium';
}

const statusColorMap: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  '无': 'default',
  '退款申请中': 'warning',
  '退款已批准': 'info',
  '退款已完成': 'success',
  '退款已拒绝': 'error',
};

const RefundStatusBadge: React.FC<RefundStatusBadgeProps> = ({ status, size = 'small' }) => {
  const color = statusColorMap[status] || 'default';

  return (
    <Chip
      label={status}
      size={size}
      color={color}
      sx={{ fontWeight: 500 }}
    />
  );
};

export default RefundStatusBadge;
