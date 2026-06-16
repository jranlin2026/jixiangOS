import React from 'react';
import { Box, Typography } from '@mui/material';

interface MetricCardProps {
  title: string;
  value: string;
  change?: {
    value: string;
    direction: 'up' | 'down' | 'flat';
    color: string;
    arrow: string;
  };
  subtitle?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, change, subtitle }) => {
  return (
    <Box
      sx={{
        p: 2.5,
        bgcolor: '#fff',
        border: '1px solid #f0f0f0',
        borderRadius: 2,
      }}
    >
      <Typography variant="body2" sx={{ color: '#6b7280', mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a2e', fontSize: '1.75rem' }}>
        {value}
      </Typography>
      {change && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 1 }}>
          <Typography
            variant="body2"
            sx={{ color: change.color, fontWeight: 500, fontSize: '0.8125rem' }}
          >
            {change.arrow} {change.value}
          </Typography>
          {subtitle && (
            <Typography variant="body2" sx={{ color: '#9ca3af', fontSize: '0.75rem' }}>
              {subtitle}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
};

export default MetricCard;
