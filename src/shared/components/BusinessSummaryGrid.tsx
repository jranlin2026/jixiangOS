import React from 'react';
import { Box, Typography } from '@mui/material';

export interface BusinessSummaryItem {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}

interface BusinessSummaryGridProps {
  ariaLabel: string;
  items: BusinessSummaryItem[];
  desktopColumns?: string;
  sx?: object;
}

/** 业务申请和详情共用的信息摘要条；手机两列，桌面按业务内容分配宽度。 */
const BusinessSummaryGrid: React.FC<BusinessSummaryGridProps> = ({
  ariaLabel,
  items,
  desktopColumns = 'repeat(4, minmax(0, 1fr))',
  sx,
}) => (
  <Box
    aria-label={ariaLabel}
    sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr 1fr', md: desktopColumns },
      border: '1px solid #bfdbfe',
      borderRadius: 2,
      bgcolor: '#f4f8ff',
      overflow: 'hidden',
      ...sx,
    }}
  >
    {items.map((item, index) => (
      <Box
        key={item.label}
        sx={{
          px: { xs: 1.5, sm: 2 },
          py: 1.35,
          minWidth: 0,
          borderLeft: { xs: index % 2 ? '1px solid #dbeafe' : 0, md: index ? '1px solid #dbeafe' : 0 },
          borderTop: { xs: index > 1 ? '1px solid #dbeafe' : 0, md: 0 },
        }}
      >
        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>{item.label}</Typography>
        <Box
          sx={{
            mt: 0.35,
            minWidth: 0,
            color: item.strong ? '#1d4ed8' : '#0f172a',
            fontWeight: item.strong ? 850 : 700,
            wordBreak: { xs: 'break-word', md: 'normal' },
            whiteSpace: { md: 'nowrap' },
            overflow: { md: 'hidden' },
            textOverflow: { md: 'ellipsis' },
          }}
        >
          {item.value}
        </Box>
      </Box>
    ))}
  </Box>
);

export default BusinessSummaryGrid;
