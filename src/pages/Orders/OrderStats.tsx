import React from 'react';
import { Box, Card, CardContent, Typography, Grid } from '@mui/material';
import useOrderStore from '../../store/useOrderStore';
import { formatCurrency } from '../../shared/utils/formatters';

const OrderStats: React.FC = () => {
  const { stats } = useOrderStore();

  if (!stats) return null;

  const statItems = [
    { label: '今日销售额', value: formatCurrency(stats.todayAmount), sub: `${stats.todayCount} 笔订单` },
    { label: '本月销售额', value: formatCurrency(stats.monthAmount), sub: `${stats.monthCount} 笔订单` },
    { label: '退款金额', value: formatCurrency(stats.refundAmount), sub: `${stats.refundCount} 笔退款` },
    { label: '升单金额', value: formatCurrency(stats.upgradeAmount), sub: `${stats.upgradeCount} 笔升单` },
  ];

  return (
    <Grid container spacing={2}>
      {statItems.map((item) => (
        <Grid item xs={3} key={item.label}>
          <Card elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
            <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
              <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>{item.label}</Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1a1a2e' }}>{item.value}</Typography>
              <Typography variant="caption" sx={{ color: '#9ca3af' }}>{item.sub}</Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default OrderStats;
