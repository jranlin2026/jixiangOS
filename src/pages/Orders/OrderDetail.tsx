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
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { getProductLevelTagSx } from '../../shared/utils/constants';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { normalizeResourceOwnership } from '../../shared/utils/constants';
import type { Order } from '../../types/order';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import AttachmentPreviewLink from '../../shared/components/AttachmentPreview';
import BusinessAttachmentLinks from '../../shared/components/BusinessAttachmentLinks';

interface OrderDetailProps {
  order: Order;
  open: boolean;
  onClose: () => void;
}

const OrderDetail: React.FC<OrderDetailProps> = ({ order, open, onClose }) => {
  return (
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={onClose}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>{order.orderNo}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>{order.productName || order.productLevel}</Typography>
            <Chip label={order.productLevel} size="small" sx={getProductLevelTagSx(order.productLevel)} />
            <Chip label={order.orderType} size="small" variant="outlined" />
          </Box>
        </DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2 }}>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>客户名称</Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>{order.customerName}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>产品名称</Typography>
              <Typography variant="body1" sx={{ fontWeight: 500 }}>{order.productName || order.productLevel}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>产品等级</Typography>
              <Chip label={order.productLevel} size="small" sx={getProductLevelTagSx(order.productLevel)} />
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
              <Typography variant="body2" sx={{ color: '#6b7280' }}>第三方平台订单</Typography>
              <Typography variant="body1">{order.thirdPartyOrderNo || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>订单创建人</Typography>
              <Typography variant="body1">{order.createdByName || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>资源归属</Typography>
              <Typography variant="body1">{normalizeResourceOwnership(order.resourceOwnership || order.sourceType)}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>销售负责人</Typography>
              <Typography variant="body1">{order.owner}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>线索录入人</Typography>
              <Typography variant="body1">{order.leadInputBy || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>线索贡献人</Typography>
              <Typography variant="body1">{order.leadContributorName || '-'}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>创建时间</Typography>
              <Typography variant="body1">{formatDate(order.createdAt, 'yyyy-MM-dd HH:mm:ss')}</Typography>
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
                      <TableCell>成交路径截图</TableCell>
                      <TableCell>备注</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatCurrency(payment.amount)}</TableCell>
                        <TableCell>{formatDate(payment.paidAt, 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                        <TableCell>{payment.paymentOrderNo || '-'}</TableCell>
                        <TableCell>
                          {payment.attachments?.length
                            ? <BusinessAttachmentLinks attachments={payment.attachments} />
                            : <AttachmentPreviewLink title="付款截图" fileName={payment.voucherName} src={payment.voucherPreview} />}
                        </TableCell>
                        <TableCell>
                          {order.dealEvidenceAttachments?.length
                            ? <BusinessAttachmentLinks attachments={order.dealEvidenceAttachments} />
                            : <AttachmentPreviewLink title="成交路径截图" fileName={order.dealEvidenceName} src={order.dealEvidencePreview} />}
                        </TableCell>
                        <TableCell>{payment.remark || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
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
      </Dialog>
  );
};

export default OrderDetail;
