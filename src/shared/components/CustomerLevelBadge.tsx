import React from 'react';
import { Chip } from '@mui/material';
import { getCustomerLevelConfig } from '../../shared/utils/constants';

interface CustomerLevelBadgeProps {
  level: string;
  showLabel?: boolean;
  size?: 'small' | 'medium';
}

const CustomerLevelBadge: React.FC<CustomerLevelBadgeProps> = ({ level, showLabel = true, size = 'small' }) => {
  const config = getCustomerLevelConfig(level);
  const color = config?.color || '#9E9E9E';
  const label = showLabel ? (config?.label || level) : level;

  return (
    <Chip
      label={label}
      size={size}
      sx={{
        bgcolor: `${color}18`,
        color,
        fontWeight: 600,
        fontSize: size === 'small' ? '0.6875rem' : '0.8125rem',
      }}
    />
  );
};

export default CustomerLevelBadge;
