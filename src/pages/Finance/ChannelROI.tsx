import React from 'react';
import { Box, Typography, Paper } from '@mui/material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import useFinanceStore from '../../store/useFinanceStore';
import { formatCurrency } from '../../shared/utils/formatters';

const ChannelROIChart: React.FC = () => {
  const { channelROI } = useFinanceStore();

  const chartData = channelROI.map((c) => ({
    channel: c.channel,
    roi: Number(c.roi.toFixed(1)),
    investment: c.investment,
    revenue: c.revenue,
    costPerLead: Math.round(c.costPerLead),
  }));

  return (
    <Paper elevation={0} sx={{ border: '1px solid #f0f0f0', borderRadius: 2, p: 2.5 }}>
      <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '0.9375rem', mb: 2 }}>
        渠道 ROI 分析
      </Typography>
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="channel" tick={{ fontSize: 11, fill: '#9ca3af' }} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
          <Tooltip
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8125rem' }}
            formatter={(value: number, name: string) => {
              if (name === 'ROI') return `${value}x`;
              return formatCurrency(value);
            }}
          />
          <Bar dataKey="roi" fill="#2196F3" radius={[4, 4, 0, 0]} name="ROI" />
        </BarChart>
      </ResponsiveContainer>
      <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        {channelROI.map((c) => (
          <Box key={c.channel} sx={{ display: 'flex', justifyContent: 'space-between', py: 0.5 }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>{c.channel}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#2196F3' }}>
              {c.roi.toFixed(1)}x
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
};

export default ChannelROIChart;
