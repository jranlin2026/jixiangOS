import React from 'react';
import { Chip } from '@mui/material';

interface StatusBadgeProps {
  label: string;
  color?: 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';
  variant?: 'filled' | 'outlined';
  size?: 'small' | 'medium';
}

const StatusBadge: React.FC<StatusBadgeProps> = ({
  label,
  color = 'default',
  variant = 'filled',
  size = 'small',
}) => {
  return <Chip label={label} color={color} variant={variant} size={size} />;
};

export default StatusBadge;
