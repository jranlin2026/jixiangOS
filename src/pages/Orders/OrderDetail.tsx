import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import useOrderStore from '../../store/useOrderStore';
import RefundStatusBadge from '../../shared/components/RefundStatusBadge';
import { getProductLevelColor, REFUND_CATEGORIES } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import type { Order } from '../../types/order';

interface OrderDetailProps {
  order: Order;
  open: boolean;
  onClose: () => void;
}

const OrderDetail: React.FC<OrderDetailProps> = ({ order, open, onClose }) => {
  const levelColor = getProductLevelColor(order.productLevel);
  const { applyRefund } = useOrderStore();
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState(order.actualAmount);
  const [refundCategory, setRefundCategory] = useState('服务不满意');
  const [refundReason, setRefundReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setRefundAmount(order.actualAmount);
    setRefundCategory('服务不满意');
    setRefundReason('');
    setRefundOpen(false);
  }, [open, order.id, order.actualAmount]);

  const handleApplyRefund = async () => {
    await applyRefund(order.id, {
      refundAmount: Number(refundAmount),
      refundReason,
      refundCategory,
      applicantId: 'user-001',
      applicantName: order.owner,
    });
    setRefundOpen(false);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>{order.orderNo}</Typography>
            <Chip label={order.productLevel} size="small" sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }} />
            <Chip label={order.orderType} size="small" variant="outlined" />
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>客户名称</Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>{order.customerName}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>实付金额</Typography>
              <Typography variant="body1" sx={{ fontWeight: 700, color: '#1a1a2e' }}>{formatCurrency(order.actualAmount || order.amount)}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>官方收款渠道</Typography>
              <Typography variant="body1">{order.officialPaymentChannel || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>订单状态</Typography>
              <Chip label={order.status} size="small" color={order.status === '已完成' ? 'success' : 'default'} sx={{ mt: 0.5 }} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>退款状态</Typography>
              <RefundStatusBadge status={order.refundStatus} />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>销售顾问</Typography>
              <Typography variant="body1">{order.salesName || order.owner}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>成功经理</Typography>
              <Typography variant="body1">{order.successName || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>服务经理</Typography>
              <Typography variant="body1">{order.serviceName || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>来源类型</Typography>
              <Typography variant="body1">{order.sourceType || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>销售负责人</Typography>
              <Typography variant="body1">{order.owner}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>创建时间</Typography>
              <Typography variant="body1">{formatDate(order.createdAt, 'yyyy-MM-dd HH:mm')}</Typography>
            </Box>
          </Box>

          {order.payments && order.payments.length > 0 && (
            <>
              <Divider sx={{ my: 2 }} />
              <Typography variant="subtitle2" sx={{ mb: 1, color: '#6b7280' }}>付款记录</Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>金额</TableCell>
                      <TableCell>付款时间</TableCell>
                      <TableCell>付款订单号</TableCell>
                      <TableCell>付款截图</TableCell>
                      <TableCell>备注</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatCurrency(payment.amount)}</TableCell>
                        <TableCell>{formatDate(payment.paidAt, 'yyyy-MM-dd HH:mm')}</TableCell>
                        <TableCell>{payment.paymentOrderNo || '-'}</TableCell>
                        <TableCell>{payment.voucherName || '-'}</TableCell>
                        <TableCell>{payment.remark || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}

          {order.refundStatus !== '无' && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ color: '#F44336', mb: 1 }}>退款信息</Typography>
                <Typography variant="body2">退款金额: {formatCurrency(order.refundAmount || 0)}</Typography>
                <Typography variant="body2">退款原因: {order.refundReason || '-'}</Typography>
              </Box>
            </>
          )}

          {order.notes && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ color: '#6b7280', mb: 0.5 }}>备注</Typography>
                <Typography variant="body2">{order.notes}</Typography>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {order.refundStatus === '无' && order.actualAmount > 0 && (
            <Button color="warning" variant="outlined" onClick={() => setRefundOpen(true)}>发起退款申请</Button>
          )}
          <Button onClick={onClose}>关闭</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={refundOpen} onClose={() => setRefundOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>发起退款申请</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, mt: 1 }}>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>
              系统会自动带出订单、客户、产品和实付金额；提交后进入退款池并自动生成挽回任务。
            </Typography>
            <TextField label="可退金额" value={formatCurrency(order.actualAmount)} disabled fullWidth />
            <TextField
              label="退款金额"
              type="number"
              value={refundAmount}
              onChange={(e) => setRefundAmount(Number(e.target.value))}
              fullWidth
              required
              error={refundAmount <= 0 || refundAmount > order.actualAmount}
              helperText={refundAmount > order.actualAmount ? '退款金额不能大于订单实付金额' : ''}
            />
            <TextField select label="退款原因分类" value={refundCategory} onChange={(e) => setRefundCategory(e.target.value)} fullWidth>
              {REFUND_CATEGORIES.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
            <TextField label="退款说明" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} multiline rows={4} fullWidth required />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRefundOpen(false)}>取消</Button>
          <Button variant="contained" color="warning" onClick={handleApplyRefund} disabled={!refundReason || refundAmount <= 0 || refundAmount > order.actualAmount}>
            提交申请
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default OrderDetail;
