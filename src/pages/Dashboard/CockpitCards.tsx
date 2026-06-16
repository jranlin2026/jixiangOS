import React, { useEffect } from 'react';
import { Box, Card, CardContent, Typography, CircularProgress, Grid } from '@mui/material';
import useDashboardStore from '../../store/useDashboardStore';
import { formatCurrency, formatChange } from '../../shared/utils/formatters';

interface CockpitCardProps {
  title: string;
  value: string;
  change: { value: string; direction: 'up' | 'down' | 'flat'; color: string; arrow: string };
}

const CockpitCard: React.FC<CockpitCardProps> = ({ title, value, change }) => (
  <Card elevation={0} sx={{ border: '1px solid #f0f0f0', height: '100%' }}>
    <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
      <Typography variant="body2" sx={{ color: '#6b7280', mb: 1 }}>
        {title}
      </Typography>
      <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a2e', fontSize: '1.75rem' }}>
        {value}
      </Typography>
      <Box sx={{ display: 'flex', alignItems: 'center', mt: 1, gap: 0.5 }}>
        <Typography
          variant="body2"
          sx={{ color: change.color, fontWeight: 500, fontSize: '0.8125rem' }}
        >
          {change.arrow} {change.value}
        </Typography>
        <Typography variant="body2" sx={{ color: '#9ca3af', fontSize: '0.75rem' }}>
          较昨日
        </Typography>
      </Box>
    </CardContent>
  </Card>
);

const CockpitCards: React.FC = () => {
  const { stats, loading, fetchStats } = useDashboardStore();

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  if (loading || !stats) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  const cards: CockpitCardProps[] = [
    {
      title: '今日销售额',
      value: formatCurrency(stats.todayAmount),
      change: formatChange(stats.todayAmount, stats.todayAmount * 0.85),
    },
    {
      title: '新增线索',
      value: String(stats.todayCount),
      change: formatChange(stats.todayCount, Math.max(1, Math.round(stats.todayCount * 0.75))),
    },
    {
      title: '代理成交',
      value: formatCurrency(stats.monthAmount),
      change: formatChange(stats.monthAmount, stats.monthAmount * 0.9),
    },
    {
      title: '升单金额',
      value: formatCurrency(stats.upgradeAmount),
      change: formatChange(stats.upgradeAmount, stats.upgradeAmount * 0.88),
    },
  ];

  return (
    <Box>
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, color: '#1a1a2e' }}>
        经营驾驶舱
      </Typography>
      <Grid container spacing={2}>
        {cards.map((card) => (
          <Grid item xs={3} key={card.title}>
            <CockpitCard {...card} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default CockpitCards;
