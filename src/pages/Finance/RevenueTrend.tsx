import React, { useState } from 'react';
import { Box, Typography, Paper, ToggleButtonGroup, ToggleButton } from '@mui/material';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import useFinanceStore from '../../store/useFinanceStore';
import { formatCurrency } from '../../shared/utils/formatters';

const RevenueTrend: React.FC = () => {
  const { dailyRecords } = useFinanceStore();
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');

  const processChartData = () => {
    if (!dailyRecords.length) return [];

    if (granularity === 'day') {
      return dailyRecords.map((r) => ({
        date: r.date.slice(5),
        revenue: r.revenue,
        cost: r.cost,
        profit: r.profit,
      }));
    }

    if (granularity === 'week') {
      const weeks: Record<string, { revenue: number; cost: number; profit: number }> = {};
      dailyRecords.forEach((r, i) => {
        const weekKey = `第${Math.floor(i / 7) + 1}周`;
        if (!weeks[weekKey]) weeks[weekKey] = { revenue: 0, cost: 0, profit: 0 };
        weeks[weekKey].revenue += r.revenue;
        weeks[weekKey].cost += r.cost;
        weeks[weekKey].profit += r.profit;
      });
      return Object.entries(weeks).map(([date, data]) => ({ date, ...data }));
    }

    // month
    const monthTotal = dailyRecords.reduce(
      (acc, r) => {
        acc.revenue += r.revenue;
        acc.cost += r.cost;
        acc.profit += r.profit;
        return acc;
      },
      { revenue: 0, cost: 0, profit: 0 },
    );
    return [{ date: '本月', ...monthTotal }];
  };

  return (
    <Paper elevation={0} sx={{ border: '1px solid #dbe4ee', borderRadius: 1.5, p: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>收入趋势</Typography>
        <ToggleButtonGroup
          size="small"
          value={granularity}
          exclusive
          onChange={(_, v) => v && setGranularity(v)}
        >
          <ToggleButton value="day" sx={{ px: 1.5, fontSize: '0.75rem' }}>日</ToggleButton>
          <ToggleButton value="week" sx={{ px: 1.5, fontSize: '0.75rem' }}>周</ToggleButton>
          <ToggleButton value="month" sx={{ px: 1.5, fontSize: '0.75rem' }}>月</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={processChartData()}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} />
          <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}万`} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: '0.8125rem' }}
          />
          <Line type="monotone" dataKey="revenue" stroke="#2196F3" strokeWidth={2} dot={false} name="收入" />
          <Line type="monotone" dataKey="cost" stroke="#FF9800" strokeWidth={2} dot={false} name="成本" />
          <Line type="monotone" dataKey="profit" stroke="#4CAF50" strokeWidth={2} dot={false} name="利润" />
        </LineChart>
      </ResponsiveContainer>
    </Paper>
  );
};

export default RevenueTrend;
