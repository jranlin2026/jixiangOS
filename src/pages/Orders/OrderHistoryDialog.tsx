import React from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogContent,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { formatDate } from '../../shared/utils/formatters';
import type { Order } from '../../types/order';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

interface OrderHistoryDialogProps {
  order: Order | null;
  open: boolean;
  onClose: () => void;
}

function formatLegacyPaymentJson(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[') && !trimmed.startsWith('{')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    const payments = Array.isArray(parsed) ? parsed : [parsed];
    if (!payments.some((payment) => payment && typeof payment === 'object' && 'paymentMethod' in payment)) {
      return null;
    }

    return payments.map((payment, index) => {
      const parts = [
        `第${index + 1}笔`,
        payment.amount !== undefined ? `金额:${payment.amount}` : '',
        payment.paymentMethod ? `方式:${payment.paymentMethod}` : '',
        payment.paidAt ? `日期:${String(payment.paidAt).slice(0, 10)}` : '',
        payment.paymentOrderNo ? `单号:${payment.paymentOrderNo}` : '',
        payment.voucherName ? `凭证:${payment.voucherName}` : '',
      ].filter(Boolean);
      return parts.join(' · ');
    }).join('；');
  } catch {
    return null;
  }
}

function displayValue(value: unknown, field?: string): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (field === 'payments' && typeof value === 'string') {
    return formatLegacyPaymentJson(value) || value;
  }
  return String(value);
}

const OrderHistoryDialog: React.FC<OrderHistoryDialogProps> = ({ order, open, onClose }) => {
  const history = order?.changeHistory || [];

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseTitle onClose={onClose}>订单修改记录</DialogCloseTitle>
      <DialogContent>
        <Box sx={{ mb: 2, color: '#6b7280' }}>
          <Typography variant="body2">
            {order?.orderNo} · {order?.customerName}
          </Typography>
        </Box>

        {history.length === 0 ? (
          <Box sx={{ py: 6, textAlign: 'center', color: '#9ca3af' }}>
            暂无修改记录
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 2 }}>
            {history.map((item) => (
              <Box key={item.id} sx={{ border: '1px solid #eef2f7', borderRadius: 1, overflow: 'hidden' }}>
                <Box sx={{ p: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      {item.summary}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#6b7280' }}>
                      {item.operator} · {formatDate(item.changedAt)}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    label={item.action === 'create' ? '创建' : item.action === 'delete' ? '删除' : '编辑'}
                    color={item.action === 'create' ? 'success' : item.action === 'delete' ? 'error' : 'primary'}
                    variant="outlined"
                  />
                </Box>
                {!!item.changes?.length && (
                  <>
                    <Divider />
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>字段</TableCell>
                          <TableCell>修改前</TableCell>
                          <TableCell>修改后</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {item.changes.map((change) => (
                          <TableRow key={`${item.id}-${change.field}`}>
                            <TableCell sx={{ width: 160 }}>{change.label}</TableCell>
                            <TableCell sx={{ maxWidth: 260, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                              {displayValue(change.oldValue, change.field)}
                            </TableCell>
                            <TableCell sx={{ color: '#1d4ed8', fontWeight: 600, maxWidth: 260, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                              {displayValue(change.newValue, change.field)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </>
                )}
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default OrderHistoryDialog;
