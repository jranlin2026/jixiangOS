import React from 'react';
import {
  Box,
  Chip,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

export interface SettlementOperationChange {
  label: string;
  before?: React.ReactNode;
  after?: React.ReactNode;
  value?: React.ReactNode;
}

export interface SettlementOperationEvent {
  id: string;
  action: string;
  summary: string;
  operator?: string;
  operatedAt: string;
  roundLabel?: string;
  statusTransition?: string;
  reason?: string;
  changes?: SettlementOperationChange[];
}

const actionColor = (action: string) => {
  if (action.includes('确认') || action.includes('发放')) return '#16a34a';
  if (action.includes('撤回') || action.includes('清理')) return '#dc2626';
  if (action.includes('重置') || action.includes('重新')) return '#d97706';
  return '#2563eb';
};

export default function SettlementOperationTimeline({
  events,
  emptyText = '暂无分账处理记录',
  compact = false,
}: {
  events: SettlementOperationEvent[];
  emptyText?: string;
  compact?: boolean;
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid #e5e7eb',
        borderRadius: 1,
        overflow: 'hidden',
        bgcolor: '#fff',
        ...(compact
          ? {
            // Keep long histories inside their own scroll area on every viewport.
            // Otherwise the detail dialog grows by one full row for every operation.
            display: 'flex',
            flexDirection: 'column',
            flex: '0 1 auto',
            minHeight: 0,
            maxHeight: { xs: 420, lg: 520 },
          }
          : {}),
      }}
    >
      <Box sx={{ px: { xs: 1.5, sm: 2 }, py: 1.25, borderBottom: '1px solid #eef2f7' }}>
        <Typography variant="subtitle2" sx={{ color: '#0f172a', fontWeight: 900 }}>处理记录</Typography>
        <Typography variant="caption" sx={{ color: '#64748b' }}>按时间查看每次分账操作、所属轮次、状态变化和操作原因。</Typography>
      </Box>

      {!events.length ? (
        <Box sx={{ px: 2, py: 3, color: '#94a3b8', textAlign: 'center' }}>{emptyText}</Box>
      ) : (
        <Stack
          spacing={0}
          sx={{
            px: compact ? 1.25 : { xs: 1.5, sm: 2 },
            py: 0.75,
            ...(compact
              ? {
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                overscrollBehavior: 'contain',
              }
              : {}),
          }}
        >
          {events.map((event, index) => {
            const color = actionColor(event.action);
            const changes = event.changes || [];
            return (
              <Box
                key={event.id}
                data-testid="settlement-operation-event"
                sx={{
                  position: 'relative',
                  pl: { xs: 2.5, sm: 3 },
                  py: 0.75,
                  borderBottom: index === events.length - 1 ? 0 : '1px solid #eef2f7',
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    left: 4,
                    top: 16,
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    bgcolor: color,
                    boxShadow: '0 0 0 4px #f8fafc',
                  },
                  '&::after': index === events.length - 1 ? undefined : {
                    content: '""',
                    position: 'absolute',
                    left: 8,
                    top: 25,
                    bottom: -16,
                    width: '1px',
                    bgcolor: '#dbe3ef',
                  },
                }}
              >
                <Stack direction={compact ? 'column' : { xs: 'column', sm: 'row' }} spacing={compact ? 0.5 : 1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, minWidth: 0 }}>
                    <Chip label={event.action} size="small" sx={{ height: 22, bgcolor: `${color}14`, color, fontWeight: 900 }} />
                    <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 900, overflowWrap: 'anywhere' }}>{event.summary}</Typography>
                    <Chip
                      label={event.statusTransition || '-'}
                      size="small"
                      variant="outlined"
                      sx={{ height: 22, color: '#475569', borderColor: '#cbd5e1' }}
                    />
                  </Stack>
                  <Typography variant="caption" aria-label={`操作时间：${event.operatedAt}`} sx={{ color: '#64748b', flexShrink: 0 }}>
                    {event.operatedAt}
                  </Typography>
                </Stack>

                <Stack
                  direction="row"
                  spacing={1.5}
                  sx={{ mt: 0.5, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25, columnGap: compact ? 0.75 : 1.5, minWidth: 0 }}
                >
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    操作人：<Box component="span" sx={{ color: '#334155', fontWeight: 800 }}>{event.operator || '-'}</Box>
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    所属轮次：<Box component="span" sx={{ color: '#334155', fontWeight: 800 }}>{event.roundLabel || '历史记录'}</Box>
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', minWidth: 0, overflowWrap: 'anywhere' }}>
                    操作原因：<Box component="span" sx={{ color: '#334155', fontWeight: 800 }}>{event.reason || '-'}</Box>
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b', display: { xs: 'inline', sm: 'none' } }}>
                    状态变化：<Box component="span" sx={{ color: '#334155', fontWeight: 800 }}>{event.statusTransition || '-'}</Box>
                  </Typography>
                </Stack>

                {changes.length > 0 && (
                  <Box component="details" sx={{ mt: 0.5, '& summary': { cursor: 'pointer', color: '#2563eb', fontSize: 12, fontWeight: 800 } }}>
                    <Box component="summary">查看变更</Box>
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 0.75, mt: 0.75 }}>
                      {changes.map((change, changeIndex) => (
                        <Box key={`${event.id}-${change.label}-${changeIndex}`} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, bgcolor: '#f8fafc', px: 1, py: 0.75, minWidth: 0 }}>
                          <Typography variant="caption" sx={{ color: '#64748b', display: 'block', mb: 0.25 }}>{change.label}</Typography>
                          {change.value !== undefined ? (
                            <Typography variant="body2" sx={{ fontWeight: 750, overflowWrap: 'anywhere' }}>{change.value}</Typography>
                          ) : (
                            <Typography variant="body2" sx={{ fontWeight: 750, overflowWrap: 'anywhere' }}>
                              {change.before ?? '-'} → {change.after ?? '-'}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            );
          })}
        </Stack>
      )}
    </Paper>
  );
}
