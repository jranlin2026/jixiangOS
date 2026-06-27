import React from 'react';
import { Chip } from '@mui/material';
import { getCustomerLevelConfig, getCustomerLevelTagSx } from '../../shared/utils/constants';

interface CustomerLevelBadgeProps {
  level: string;
  showLabel?: boolean;
  size?: 'small' | 'medium';
}

const CustomerLevelBadge: React.FC<CustomerLevelBadgeProps> = ({ level, showLabel = true, size = 'small' }) => {
  const config = getCustomerLevelConfig(level);
  const label = showLabel ? (config?.label || level) : level;

  return (
    <Chip
      label={label}
      size={size}
      sx={{
        ...getCustomerLevelTagSx(`${level} ${label}`),
        fontSize: size === 'small' ? '0.75rem' : '0.8125rem',
        height: size === 'small' ? 24 : 28,
      }}
    />
  );
};

export default CustomerLevelBadge;
