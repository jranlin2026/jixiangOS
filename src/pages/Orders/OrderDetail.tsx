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
  Typography,
} from '@mui/material';
import { getProductLevelTagSx } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatLeadSourceLabel } from '../../shared/utils/formatters';
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

function DetailField({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <Box sx={wide ? { gridColumn: { md: '1 / -1' } } : undefined}>
      <Typography variant="body2" sx={{ color: '#6b7280' }}>{label}</Typography>
      <Box sx={{ mt: 0.25, fontWeight: 500 }}>{children}</Box>
    </Box>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Box component="section">
      <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>{title}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
        {children}
      </Box>
    </Box>
  );
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
            <Chip label={order.status} size="small" variant="outlined" />
          </Box>
        </DialogCloseTitle>
        <DialogContent dividers>
          <DetailSection title="客户资料">
            <DetailField label="客户名称">{order.customerName}</DetailField>
            <DetailField label="资源归属">{normalizeResourceOwnership(order.resourceOwnership || order.sourceType)}</DetailField>
            <DetailField label="线索来源">{formatLeadSourceLabel(order.leadSource, order.sourceName)}</DetailField>
            <DetailField label="销售负责人">{order.owner || '-'}</DetailField>
            <DetailField label="线索录入人">{order.leadInputBy || '-'}</DetailField>
            <DetailField label="线索贡献人">{order.leadContributorName || '-'}</DetailField>
          </DetailSection>

          <Divider sx={{ my: 2 }} />
          <DetailSection title="订单资料">
            <DetailField label="产品名称">{order.productName || order.productLevel}</DetailField>
            <DetailField label="产品等级"><Chip label={order.productLevel} size="small" sx={getProductLevelTagSx(order.productLevel)} /></DetailField>
            <DetailField label="订单类型">{order.orderType || '-'}</DetailField>
            <DetailField label="订单状态">{order.status || '-'}</DetailField>
            <DetailField label="第三方平台订单">{order.thirdPartyOrderNo || '-'}</DetailField>
          </DetailSection>

          <Divider sx={{ my: 2 }} />
          <DetailSection title="付款资料">
            <DetailField label="实付金额"><Typography sx={{ fontWeight: 700, color: '#1a1a2e' }}>{formatCurrency(order.actualAmount || order.amount)}</Typography></DetailField>
            <DetailField label="官方收款渠道">{order.officialPaymentChannel || '-'}</DetailField>
            <Box sx={{ gridColumn: { md: '1 / -1' } }}>
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
                    {order.payments?.length ? order.payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatCurrency(payment.amount)}</TableCell>
                        <TableCell>{formatDate(payment.paidAt, 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                        <TableCell>{payment.paymentOrderNo || '-'}</TableCell>
                        <TableCell>
                          {payment.attachments?.length
                            ? <BusinessAttachmentLinks attachments={payment.attachments} />
                            : <AttachmentPreviewLink title="付款截图" fileName={payment.voucherName} src={payment.voucherPreview} />}
                        </TableCell>
                        <TableCell>{payment.remark || '-'}</TableCell>
                      </TableRow>
                    )) : (
                      <TableRow>
                        <TableCell colSpan={5} align="center" sx={{ color: '#9ca3af', py: 3 }}>暂无付款记录</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          </DetailSection>

          <Divider sx={{ my: 2 }} />
          <DetailSection title="成交资料">
            <DetailField label="成交路径 / 聊天记录" wide>
              {order.dealEvidenceAttachments?.length
                ? <BusinessAttachmentLinks attachments={order.dealEvidenceAttachments} />
                : <AttachmentPreviewLink title="成交路径 / 聊天记录" fileName={order.dealEvidenceName} src={order.dealEvidencePreview} />}
            </DetailField>
          </DetailSection>

          <Divider sx={{ my: 2 }} />
          <DetailSection title="记录资料">
            <DetailField label="订单创建人">{order.createdByName || '-'}</DetailField>
            <DetailField label="创建时间">{formatDate(order.createdAt, 'yyyy-MM-dd HH:mm:ss')}</DetailField>
            <DetailField label="备注" wide><Typography sx={{ whiteSpace: 'pre-wrap' }}>{order.notes || '-'}</Typography></DetailField>
          </DetailSection>
        </DialogContent>
      </Dialog>
  );
};

export default OrderDetail;
