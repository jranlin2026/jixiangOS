import React from 'react';
import { Chip, type ChipProps } from '@mui/material';
import type { SettlementStatus } from '../../types/commission';
import { getSettlementStatusColor, normalizeSettlementStatus } from '../utils/settlementStatus';

interface SettlementStatusChipProps extends Omit<ChipProps, 'label' | 'color' | 'variant'> {
  status?: string | null;
  fallback?: SettlementStatus;
}

export default function SettlementStatusChip({
  status,
  fallback = '待处理',
  sx,
  ...props
}: SettlementStatusChipProps) {
  const normalizedStatus = normalizeSettlementStatus(status, fallback);
  return (
    <Chip
      {...props}
      label={normalizedStatus}
      color={getSettlementStatusColor(normalizedStatus)}
      variant="filled"
      size={props.size || 'small'}
      sx={[
        {
          height: 28,
          borderRadius: 1.25,
          fontWeight: 800,
          '& .MuiChip-label': { px: 1.1 },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  );
}
