import React from 'react';
import { Box } from '@mui/material';

interface FunnelStep {
  label: string;
  count: number;
  color: string;
  rate: string;
}

const funnelData: FunnelStep[] = [
  { label: '线索', count: 120, color: '#90CAF9', rate: '' },
  { label: '899客户', count: 45, color: '#2196F3', rate: '37.5%' },
  { label: '课程用户', count: 12, color: '#00BCD4', rate: '26.7%' },
  { label: '代理客户', count: 18, color: '#4CAF50', rate: '40.0%' },
  { label: '贴牌客户', count: 8, color: '#9C27B0', rate: '44.4%' },
  { label: '合伙人', count: 3, color: '#FF9800', rate: '37.5%' },
];

const FunnelChart: React.FC = () => {
  const maxCount = funnelData[0].count;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, py: 2 }}>
      {funnelData.map((step, idx) => {
        const widthPercent = Math.max(20, (step.count / maxCount) * 100);
        return (
          <Box key={step.label} sx={{ display: 'flex', alignItems: 'center', gap: 2, width: '100%' }}>
            <Box sx={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
              <Box
                sx={{
                  width: `${widthPercent}%`,
                  minWidth: 120,
                  height: 48,
                  bgcolor: step.color,
                  borderRadius: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  clipPath: idx < funnelData.length - 1
                    ? 'polygon(2% 0%, 98% 0%, 96% 100%, 4% 100%)'
                    : 'none',
                  transition: 'width 0.3s',
                }}
              >
                {step.label} ({step.count})
              </Box>
            </Box>
            <Box sx={{ width: 60, textAlign: 'center' }}>
              {step.rate && (
                <Box
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: '#2196F3',
                    bgcolor: '#E3F2FD',
                    borderRadius: 1,
                    px: 1,
                    py: 0.25,
                  }}
                >
                  ↓ {step.rate}
                </Box>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
};

export default FunnelChart;
