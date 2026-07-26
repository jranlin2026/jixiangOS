import React from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';

export function SettlementCompactDetailItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '96px minmax(0, 1fr)', sm: '112px minmax(0, 1fr)' }, gap: 1, py: 0.55, minWidth: 0 }}>
      <Typography variant="caption" sx={{ color: '#64748b', lineHeight: 1.6 }}>{label}</Typography>
      <Box sx={{ color: '#0f172a', fontSize: 14, fontWeight: 700, lineHeight: 1.6, minWidth: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Box>
    </Box>
  );
}

export function SettlementDetailCard({
  title,
  action,
  children,
  testId,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <Paper
      data-testid={testId}
      elevation={0}
      sx={{ border: '1px solid #e5e7eb', borderRadius: 1, p: 1.5, bgcolor: '#fff', minWidth: 0 }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ color: '#0f172a', fontWeight: 900 }}>{title}</Typography>
        {action}
      </Stack>
      {children}
    </Paper>
  );
}
