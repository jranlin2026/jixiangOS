import React from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Chip, Divider, Table, TableBody, TableCell, TableContainer, TableRow,
} from '@mui/material';
import type { Order } from '../../types/order';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { PRODUCT_LEVEL_COLOR_MAP } from '../../shared/utils/constants';
import RefundStatusBadge from '../../shared/components/RefundStatusBadge';

interface OrderDetailProps {
  order: Order;
  open: boolean;
  onClose: () => void;
}

const OrderDetail: React.FC<OrderDetailProps> = ({ order, open, onClose }) => {
  const levelColor = PRODUCT_LEVEL_COLOR_MAP[order.productLevel] || '#9ca3af';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>{order.orderNo}</Typography>
          <Chip label={order.productLevel} size="small" sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }} />
          <Chip label={order.orderType} size="small" variant="outlined" />
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {/* 基本信息 */}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
          <Box>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>客户名称</Typography>
            <Typography variant="body1" sx={{ fontWeight: 500 }}>{order.customerName}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>订单金额</Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: '#1a1a2e' }}>{formatCurrency(order.amount)}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>实付金额</Typography>
            <Typography variant="body1" sx={{ fontWeight: 700, color: '#1a1a2e' }}>{formatCurrency(order.actualAmount)}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>支付方式</Typography>
            <Typography variant="body1">{order.paymentMethod || '-'}</Typography>
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
            <Typography variant="body2" sx={{ color: '#6b7280' }}>负责人</Typography>
            <Typography variant="body1">{order.owner}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" sx={{ color: '#6b7280' }}>创建时间</Typography>
            <Typography variant="body1">{formatDate(order.createdAt, 'yyyy-MM-dd HH:mm')}</Typography>
          </Box>
        </Box>

        {/* 支付记录 */}
        {order.payments && order.payments.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle2" sx={{ mb: 1, color: '#6b7280' }}>支付记录</Typography>
            <TableContainer>
              <Table size="small">
                <TableBody>
                  {order.payments.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{formatCurrency(p.amount)}</TableCell>
                      <TableCell>{p.paymentMethod}</TableCell>
                      <TableCell>{formatDate(p.paidAt, 'yyyy-MM-dd')}</TableCell>
                      <TableCell>{p.remark || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </>
        )}

        {/* 退款信息 */}
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
        <Button onClick={onClose}>关闭</Button>
      </DialogActions>
    </Dialog>
  );
};

export default OrderDetail;
