import React from 'react';
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import type { CockpitSalesBattleProfile } from '../../../types/dashboard';
import { formatCurrency } from '../../../shared/utils/formatters';
import {
  DataTableDesktopScroller,
  DataTableEmptyState,
  DataTableMobileScroller,
  DataTableWorkspace,
  DataTableWorkspaceFooter,
  getDataTablePinnedColumnSx,
} from '../../../shared/components/DataTableWorkspace';
import TablePagination from '../../../shared/components/TablePagination';
import { formatPaginationRows } from '../../../shared/utils/formatters';
import { getSalespersonBattleStatus } from '../salesBattlefieldModel';

const statusTone = {
  normal: { color: '#16875D', bg: '#EAF8F1', dot: '#12A66A' },
  attention: { color: '#A35F00', bg: '#FFF4DE', dot: '#F59E0B' },
  intervene: { color: '#C4322B', bg: '#FFF0EE', dot: '#E23D35' },
} as const;

const metricTextSx = { color: '#101828', fontWeight: 800, fontVariantNumeric: 'tabular-nums' } as const;

function TargetProgress({ profile }: { profile: CockpitSalesBattleProfile }) {
  if (profile.targetCompletionRate === null) {
    return <Typography variant="body2" sx={{ color: '#8A8794', fontWeight: 700 }}>未配置</Typography>;
  }
  const progress = Math.max(0, Math.min(100, profile.targetCompletionRate));
  return (
    <Stack spacing={0.5} sx={{ minWidth: 92 }}>
      <Typography variant="body2" sx={metricTextSx}>{profile.targetCompletionRate.toFixed(1)}%</Typography>
      <LinearProgress
        variant="determinate"
        value={progress}
        aria-label={`${profile.name}月目标完成率 ${profile.targetCompletionRate.toFixed(1)}%`}
        sx={{ height: 5, borderRadius: 999, bgcolor: '#EEEAF7', '& .MuiLinearProgress-bar': { bgcolor: '#7C3AED', borderRadius: 999 } }}
      />
    </Stack>
  );
}

function StatusChip({ profile }: { profile: CockpitSalesBattleProfile }) {
  const status = getSalespersonBattleStatus(profile);
  const tone = statusTone[status.code];
  return (
    <Chip
      size="small"
      label={status.label}
      title={status.reason}
      icon={<Box component="span" sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: tone.dot }} />}
      sx={{ color: tone.color, bgcolor: tone.bg, fontWeight: 850, '& .MuiChip-icon': { ml: 1 } }}
    />
  );
}

export interface SalesBattleTableProps {
  rows: CockpitSalesBattleProfile[];
  total: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (rowsPerPage: number) => void;
  onViewCustomers: (profile: CockpitSalesBattleProfile) => void;
}

const SalesBattleTable: React.FC<SalesBattleTableProps> = ({
  rows,
  total,
  page,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
  onViewCustomers,
}) => (
  <DataTableWorkspace sx={{ minHeight: { md: 520 } }}>
    <Box sx={{ px: { xs: 2, md: 2.5 }, py: 2, borderBottom: '1px solid #EEEAF4' }}>
      <Typography variant="subtitle1" sx={{ color: '#17142B', fontWeight: 900 }}>作战序列</Typography>
      <Typography variant="body2" sx={{ color: '#777184', mt: 0.25 }}>按需要介入、风险客户和本月实收排序</Typography>
    </Box>

    {total === 0 ? (
      <DataTableEmptyState label="当前权限范围内暂无销售人员" />
    ) : (
      <>
        <DataTableDesktopScroller>
          <Table stickyHeader size="small" aria-label="销售部经营战情表" sx={{ minWidth: 1180 }}>
            <TableHead>
              <TableRow>
                <TableCell>状态</TableCell>
                <TableCell>销售</TableCell>
                <TableCell align="right">今日跟进客户</TableCell>
                <TableCell align="right">风险客户</TableCell>
                <TableCell align="right">需要介入</TableCell>
                <TableCell align="right">月目标</TableCell>
                <TableCell align="right">已完成</TableCell>
                <TableCell>完成率</TableCell>
                <TableCell align="right">名下客户</TableCell>
                <TableCell align="center" sx={getDataTablePinnedColumnSx('right', true)}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((profile) => (
                <TableRow hover key={profile.userId}>
                  <TableCell><StatusChip profile={profile} /></TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={metricTextSx}>{profile.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#8A8794' }}>{profile.department || '部门未配置'}</Typography>
                  </TableCell>
                  <TableCell align="right" sx={metricTextSx}>{profile.todayFollowUpCount}</TableCell>
                  <TableCell align="right" sx={{ ...metricTextSx, color: profile.riskCustomerCount ? '#A35F00' : '#101828' }}>{profile.riskCustomerCount}</TableCell>
                  <TableCell align="right" sx={{ ...metricTextSx, color: profile.overdueCustomerCount ? '#C4322B' : '#101828' }}>{profile.overdueCustomerCount}</TableCell>
                  <TableCell align="right" sx={metricTextSx}>
                    {profile.monthlyTargetAmount === null ? '未配置' : formatCurrency(profile.monthlyTargetAmount)}
                  </TableCell>
                  <TableCell align="right" sx={metricTextSx}>{formatCurrency(profile.revenueAmount)}</TableCell>
                  <TableCell><TargetProgress profile={profile} /></TableCell>
                  <TableCell align="right" sx={metricTextSx}>{profile.customerCount}</TableCell>
                  <TableCell align="center" sx={getDataTablePinnedColumnSx('right')}>
                    <Button size="small" endIcon={<ArrowForwardIcon />} onClick={() => onViewCustomers(profile)}>查看详情</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DataTableDesktopScroller>

        <DataTableMobileScroller>
          {rows.map((profile) => {
            const status = getSalespersonBattleStatus(profile);
            return (
              <Paper key={profile.userId} variant="outlined" sx={{ p: 1.75, borderRadius: 2, borderColor: '#E5E0EF' }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                  <Box>
                    <Typography sx={{ color: '#17142B', fontWeight: 900 }}>{profile.name}</Typography>
                    <Typography variant="caption" sx={{ color: '#8A8794' }}>{profile.department || '部门未配置'}</Typography>
                  </Box>
                  <StatusChip profile={profile} />
                </Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1.25, mt: 1.5 }}>
                  {[
                    ['本月完成', formatCurrency(profile.revenueAmount)],
                    ['月目标', profile.monthlyTargetAmount === null ? '未配置' : formatCurrency(profile.monthlyTargetAmount)],
                    ['今日跟进客户', `${profile.todayFollowUpCount}`],
                    ['风险 / 介入', `${profile.riskCustomerCount} / ${profile.overdueCustomerCount}`],
                  ].map(([label, value]) => (
                    <Box key={label}>
                      <Typography variant="caption" sx={{ color: '#8A8794' }}>{label}</Typography>
                      <Typography variant="body2" sx={{ ...metricTextSx, mt: 0.2 }}>{value}</Typography>
                    </Box>
                  ))}
                </Box>
                <Typography variant="caption" sx={{ display: 'block', color: statusTone[status.code].color, mt: 1.25 }}>{status.reason}</Typography>
                <Button fullWidth size="small" endIcon={<ArrowForwardIcon />} onClick={() => onViewCustomers(profile)} sx={{ mt: 1.25, minHeight: 44 }}>
                  查看个人经营
                </Button>
              </Paper>
            );
          })}
        </DataTableMobileScroller>
      </>
    )}

    <DataTableWorkspaceFooter>
      <TablePagination
        count={total}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(_, nextPage) => onPageChange(nextPage)}
        onRowsPerPageChange={(event) => onRowsPerPageChange(Number(event.target.value))}
        labelDisplayedRows={formatPaginationRows}
      />
    </DataTableWorkspaceFooter>
  </DataTableWorkspace>
);

export default SalesBattleTable;
