import React from 'react';
import { Chip } from '@mui/material';
import type { CustomerLevel } from '../../types/common';
import { CUSTOMER_LEVEL_COLOR_MAP, CUSTOMER_LEVEL_LABELS } from '../../shared/utils/constants';

interface CustomerLevelBadgeProps {
  level: CustomerLevel;
  showLabel?: boolean;
  size?: 'small' | 'medium';
}

const CustomerLevelBadge: React.FC<CustomerLevelBadgeProps> = ({ level, showLabel = true, size = 'small' }) => {
  const color = CUSTOMER_LEVEL_COLOR_MAP[level] || '#9E9E9E';
  const label = showLabel ? `${level} ${CUSTOMER_LEVEL_LABELS[level] || ''}` : level;

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
