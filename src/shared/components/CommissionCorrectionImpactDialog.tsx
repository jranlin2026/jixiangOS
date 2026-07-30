import React from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { CommissionCorrectionImpact, CommissionCorrectionPreview } from '../../types/commission';
import { formatCurrency } from '../utils/formatters';
import DialogCloseTitle from './DialogCloseTitle';

interface CommissionCorrectionImpactDialogProps {
  open: boolean;
  preview: CommissionCorrectionPreview | null;
  confirming?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

function employeeText(impact: CommissionCorrectionImpact): string {
  if (impact.originalOwner === impact.correctedOwner) return impact.originalOwner || '-';
  return `${impact.originalOwner || '-'} → ${impact.correctedOwner || '-'}`;
}

function periodText(impact: CommissionCorrectionImpact): string {
  if (impact.originalPeriod === impact.correctedPeriod) return impact.originalPeriod || '-';
  return `${impact.originalPeriod || '-'} → ${impact.correctedPeriod || '-'}`;
}

function actionColor(action: CommissionCorrectionImpact['action']): 'default' | 'success' | 'warning' | 'error' {
  if (action === '补发') return 'success';
  if (action === '追回' || action === '人员调整') return 'warning';
  return 'default';
}

const SummaryItem: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color = '#0f172a' }) => (
  <Box sx={{ p: 1.5, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#f8fafc' }}>
    <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>{label}</Typography>
    <Typography sx={{ mt: 0.35, color, fontSize: 18, fontWeight: 850 }}>{value}</Typography>
  </Box>
);

const CommissionCorrectionImpactDialog: React.FC<CommissionCorrectionImpactDialogProps> = ({
  open,
  preview,
  confirming = false,
  onClose,
  onConfirm,
}) => (
  <Dialog open={open} onClose={confirming ? undefined : onClose} fullWidth maxWidth="lg">
    <DialogCloseTitle onClose={onClose} closeDisabled={confirming}>更正影响预览</DialogCloseTitle>
    <DialogContent dividers>
      {preview ? (
        <Stack spacing={2}>
          <Alert severity="warning">
            原发放事实永久保留。确认后会更新业务资料和归属月份，金额或人员变化将生成补发/追回差额，不会覆盖原已发记录。
          </Alert>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(6, minmax(0, 1fr))' }, gap: 1 }}>
            <SummaryItem label="受影响员工" value={`${preview.affectedEmployeeCount} 人`} />
            <SummaryItem label="受影响月份" value={preview.affectedPeriods.join('、') || '-'} />
            <SummaryItem label="原已发" value={formatCurrency(preview.originalPaidAmount)} />
            <SummaryItem label="新应得" value={formatCurrency(preview.correctedEntitlementAmount)} />
            <SummaryItem label="需补发" value={formatCurrency(preview.supplementAmount)} color="#15803d" />
            <SummaryItem label="需追回" value={formatCurrency(preview.recoverAmount)} color="#b45309" />
          </Box>

          <Box>
            <Typography variant="subtitle1" fontWeight={850} sx={{ mb: 1 }}>
              受影响提成（{preview.affectedCommissionCount} 笔）
            </Typography>
            <TableContainer sx={{ border: '1px solid #dbe3ef', borderRadius: 1.5, maxHeight: 360 }}>
              <Table stickyHeader size="small" sx={{ minWidth: 900 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>角色</TableCell>
                    <TableCell>员工</TableCell>
                    <TableCell>归属月份</TableCell>
                    <TableCell align="right">原已发</TableCell>
                    <TableCell align="right">新应得</TableCell>
                    <TableCell align="right">差额</TableCell>
                    <TableCell>处理</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {preview.impacts.map((impact) => (
                    <TableRow key={impact.id} hover>
                      <TableCell>{impact.role}</TableCell>
                      <TableCell>{employeeText(impact)}</TableCell>
                      <TableCell>{periodText(impact)}</TableCell>
                      <TableCell align="right">{formatCurrency(impact.originalPaidAmount)}</TableCell>
                      <TableCell align="right">{formatCurrency(impact.correctedEntitlementAmount)}</TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={800} color={impact.deltaAmount > 0 ? 'success.main' : impact.deltaAmount < 0 ? 'warning.main' : 'text.primary'}>
                          {impact.deltaAmount > 0 ? '+' : ''}{formatCurrency(impact.deltaAmount)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={impact.action} color={actionColor(impact.action)} variant={impact.action === '无需差额' ? 'outlined' : 'filled'} />
                        {impact.tierAffected ? <Chip size="small" label="阶梯联动" variant="outlined" sx={{ ml: 0.75 }} /> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!preview.impacts.length ? (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>本次更正不产生提成差额</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Stack>
      ) : null}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={confirming}>返回修改</Button>
      <Button variant="contained" onClick={onConfirm} disabled={!preview || confirming}>
        {confirming ? '正在确认…' : preview?.legs.length ? '确认更正并生成差额' : '确认更正'}
      </Button>
    </DialogActions>
  </Dialog>
);

export default CommissionCorrectionImpactDialog;
