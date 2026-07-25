import React from 'react';
import { Chip, type ChipProps, type SxProps, type Theme } from '@mui/material';

export type BusinessStatusTone = 'neutral' | 'amber' | 'blue' | 'green' | 'red' | 'gray';

const STATUS_TONES: Record<string, BusinessStatusTone> = {
  待审核: 'amber',
  待处理: 'amber',
  待分账: 'amber',
  退回修改: 'blue',
  处理中: 'blue',
  待确认: 'blue',
  待发放: 'blue',
  已通过: 'green',
  已完成: 'green',
  已分账: 'green',
  已发放: 'green',
  已驳回: 'red',
  审核驳回: 'red',
  退款中: 'red',
  已退款: 'red',
  已撤回: 'gray',
  已取消: 'gray',
  '已删除（留痕）': 'gray',
  已删除: 'gray',
};

const TONE_STYLES: Record<BusinessStatusTone, { color: string; borderColor: string; bgcolor: string }> = {
  neutral: { color: '#334155', borderColor: '#94a3b8', bgcolor: '#ffffff' },
  amber: { color: '#9a6700', borderColor: '#d59b20', bgcolor: '#fffbeb' },
  blue: { color: '#1d4ed8', borderColor: '#60a5fa', bgcolor: '#eff6ff' },
  green: { color: '#047857', borderColor: '#34d399', bgcolor: '#ecfdf5' },
  red: { color: '#b91c1c', borderColor: '#f87171', bgcolor: '#fff1f2' },
  gray: { color: '#64748b', borderColor: '#cbd5e1', bgcolor: '#f8fafc' },
};

export function getBusinessStatusTone(status?: string): BusinessStatusTone {
  return STATUS_TONES[String(status || '').trim()] || 'neutral';
}

interface BusinessStatusChipProps extends Omit<ChipProps, 'label' | 'variant' | 'color'> {
  status?: string;
  label?: React.ReactNode;
  tone?: BusinessStatusTone;
  sx?: SxProps<Theme>;
}

export default function BusinessStatusChip({ status, label, tone, sx, ...props }: BusinessStatusChipProps) {
  const resolvedTone = tone || getBusinessStatusTone(status);
  return (
    <Chip
      {...props}
      label={label ?? status ?? '-'}
      size={props.size || 'small'}
      variant="outlined"
      sx={[
        {
          height: 28,
          borderRadius: 1.25,
          fontWeight: 800,
          ...TONE_STYLES[resolvedTone],
          '& .MuiChip-label': { px: 1.1 },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  );
}
