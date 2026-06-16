import React from 'react';
import { Box, Card, CardContent, Typography, Grid } from '@mui/material';
import useCommissionStore from '../../store/useCommissionStore';
import { formatCurrency } from '../../shared/utils/formatters';
import type { CommissionRole } from '../../types/commission';

const ROLE_LABELS: Record<CommissionRole, string> = {
  '销售': '销售',
  '线索': '线索',
  '客户成功': '客户成功',
  '售后': '售后',
  '招商主管': '招商主管',
  '销售主管': '销售主管',
};

const ROLE_COLORS: Record<CommissionRole, string> = {
  '销售': '#2196F3',
  '线索': '#FF9800',
  '客户成功': '#4CAF50',
  '售后': '#9C27B0',
  '招商主管': '#F44336',
  '销售主管': '#00BCD4',
};

const CommissionStats: React.FC = () => {
  const { stats } = useCommissionStore();
  if (!stats) return null;

  const mainItems = [
    { label: '本月待审核', value: formatCurrency(stats.pendingReview || stats.monthPending), color: '#2196F3' },
    { label: '本月待发放', value: formatCurrency(stats.monthPending), color: '#FF9800' },
    { label: '本月已发放', value: formatCurrency(stats.monthPaid), color: '#4CAF50' },
    { label: '本月提成总额', value: formatCurrency(stats.monthTotal), color: '#1a1a2e' },
  ];

  // 按角色统计
  const roleEntries = stats.byRole ? Object.entries(stats.byRole) as [CommissionRole, number][] : [];

  return (
    <Box>
      {/* 主统计 */}
      <Grid container spacing={2}>
        {mainItems.map((item) => (
          <Grid item xs={3} key={item.label}>
            <Card elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
              <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                <Typography variant="body2" sx={{ color: '#6b7280', mb: 0.5 }}>{item.label}</Typography>
                <Typography variant="h5" sx={{ fontWeight: 700, color: item.color }}>{item.value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* 按角色统计 */}
      {roleEntries.length > 0 && (
        <>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 2, mb: 1, fontWeight: 600 }}>
            按角色统计
          </Typography>
          <Grid container spacing={2}>
            {roleEntries.map(([role, amount]) => (
              <Grid item xs={2} key={role}>
                <Card elevation={0} sx={{ border: '1px solid #f0f0f0', borderLeft: `3px solid ${ROLE_COLORS[role]}` }}>
                  <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Typography variant="caption" sx={{ color: ROLE_COLORS[role], fontWeight: 600 }}>
                      {ROLE_LABELS[role]}
                    </Typography>
                    <Typography variant="body1" sx={{ fontWeight: 700, color: '#1a1a2e', mt: 0.5 }}>
                      {formatCurrency(amount)}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </>
      )}

      {/* 提成占营收比例 */}
      {stats.revenueRatio > 0 && (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ color: '#6b7280' }}>提成占营收比例：</Typography>
          <Typography variant="body1" sx={{ fontWeight: 700, color: '#F44336' }}>
            {(stats.revenueRatio * 100).toFixed(1)}%
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default CommissionStats;
