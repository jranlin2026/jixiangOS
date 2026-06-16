import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import FunnelChart from './FunnelChart';

const UpgradeAnalysis: React.FC = () => {
  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
        升单分析
      </Typography>

      <Paper elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: 2, p: 3 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, fontSize: '0.9375rem' }}>
          客户升级漏斗
        </Typography>
        <FunnelChart />
      </Paper>

      <Box sx={{ mt: 3, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 2 }}>
        {[
          { label: '线索→899', rate: '37.5%', color: '#2196F3' },
          { label: '899→课程', rate: '28.0%', color: '#00BCD4' },
          { label: '课程→代理', rate: '35.0%', color: '#4CAF50' },
          { label: '代理→贴牌', rate: '44.4%', color: '#9C27B0' },
          { label: '贴牌→合伙人', rate: '37.5%', color: '#FF9800' },
        ].map((item) => (
          <Paper key={item.label} elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: 2, p: 2 }}>
            <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>{item.label}</Typography>
            <Typography variant="h5" sx={{ fontWeight: 700, color: item.color }}>{item.rate}</Typography>
          </Paper>
        ))}
      </Box>
    </Box>
  );
};

export default UpgradeAnalysis;
