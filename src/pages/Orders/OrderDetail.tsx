import React from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
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
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PublishedWithChangesOutlinedIcon from '@mui/icons-material/PublishedWithChangesOutlined';
import HistoryIcon from '@mui/icons-material/History';
import { getProductLevelTagSx, normalizeResourceOwnership } from '../../shared/utils/constants';
import { formatCurrency, formatDate, formatLeadSourceLabel } from '../../shared/utils/formatters';
import type { Order } from '../../types/order';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import AttachmentPreviewLink from '../../shared/components/AttachmentPreview';
import BusinessAttachmentLinks from '../../shared/components/BusinessAttachmentLinks';
import SettlementStatusChip from '../../shared/components/SettlementStatusChip';
import RefundStatusBadge from '../../shared/components/RefundStatusBadge';
import { BusinessDetailField, BusinessDetailSection } from '../../shared/components/BusinessDetailSection';

interface OrderDetailProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onCorrect?: () => void;
  onHistory?: () => void;
  canEdit?: boolean;
  canCorrect?: boolean;
  canViewHistory?: boolean;
}

const OrderDetail: React.FC<OrderDetailProps> = ({
  order,
  open,
  onClose,
  onEdit,
  onCorrect,
  onHistory,
  canEdit = false,
  canCorrect = false,
  canViewHistory = false,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
    <DialogCloseTitle onClose={onClose}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{order.orderNo}</Typography>
        <Typography variant="body2" sx={{ fontWeight: 600, color: '#374151' }}>{order.productName || order.productLevel}</Typography>
        <Chip label={order.productLevel} size="small" sx={getProductLevelTagSx(order.productLevel)} />
        <Chip label={order.orderType} size="small" variant="outlined" />
        <SettlementStatusChip status={order.settlementStatus} />
      </Box>
      <Stack direction="row" spacing={1} sx={{ pr: 1, flexShrink: 0 }}>
        {canViewHistory && onHistory ? (
          <Button size="small" variant="text" startIcon={<HistoryIcon />} onClick={onHistory}>修改记录</Button>
        ) : null}
        {canEdit && onEdit ? (
          <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={onEdit}>编辑资料</Button>
        ) : null}
        {canCorrect && onCorrect ? (
          <Button size="small" color="warning" variant="outlined" startIcon={<PublishedWithChangesOutlinedIcon />} onClick={onCorrect}>订单更正</Button>
        ) : null}
      </Stack>
    </DialogCloseTitle>
    <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
      <BusinessDetailSection title="客户信息" summary={`${order.customerName} / ${order.owner || '未分配'}`} columns={2}>
        <BusinessDetailField label="客户">{order.customerName}</BusinessDetailField>
        <BusinessDetailField label="销售负责人">{order.owner || '-'}</BusinessDetailField>
      </BusinessDetailSection>

      <BusinessDetailSection title="客户归因快照" summary="订单提交时的客户归因" defaultExpanded={false}>
        <BusinessDetailField label="资源归属">{normalizeResourceOwnership(order.resourceOwnership || order.sourceType)}</BusinessDetailField>
        <BusinessDetailField label="线索来源">{formatLeadSourceLabel(order.leadSource, order.sourceName)}</BusinessDetailField>
        <BusinessDetailField label="线索录入人">{order.leadInputBy || '-'}</BusinessDetailField>
        <BusinessDetailField label="线索贡献人">{order.leadContributorName || '-'}</BusinessDetailField>
      </BusinessDetailSection>

      <BusinessDetailSection title="产品信息" summary={`${order.items?.length || 1} 项 / ${formatCurrency(order.standardTotalAmount || order.amount)}`}>
        <Box sx={{ gridColumn: { md: '1 / -1' } }}>
          <TableContainer sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5, bgcolor: 'white' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>产品名称</TableCell><TableCell>产品等级</TableCell><TableCell align="right">产品价格</TableCell><TableCell align="right">数量</TableCell><TableCell align="right">小计</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {(order.items?.length ? order.items : [{
                  id: 'legacy-primary', productName: order.productName || order.productLevel, productLevel: order.productLevel,
                  unitPrice: order.amount, quantity: 1, subtotal: order.amount, isPrimary: true,
                }]).map((item) => <TableRow key={item.id}>
                  <TableCell>{item.productName}{item.isPrimary ? ' · 主产品' : ''}</TableCell>
                  <TableCell><Chip label={item.productLevel} size="small" sx={getProductLevelTagSx(item.productLevel)} /></TableCell>
                  <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                  <TableCell align="right">{item.quantity}</TableCell>
                  <TableCell align="right">{formatCurrency(item.subtotal)}</TableCell>
                </TableRow>)}
                <TableRow><TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>产品总计</TableCell><TableCell align="right" sx={{ fontWeight: 800 }}>{formatCurrency(order.standardTotalAmount || order.amount)}</TableCell></TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </BusinessDetailSection>

      <BusinessDetailSection title="订单信息">
        <BusinessDetailField label="订单类型">{order.orderType || '-'}</BusinessDetailField>
        <BusinessDetailField label="第三方平台订单">{order.thirdPartyOrderNo || '-'}</BusinessDetailField>
        <BusinessDetailField label="订单状态"><Chip label={order.status} size="small" variant="outlined" /></BusinessDetailField>
        <BusinessDetailField label="退款状态"><RefundStatusBadge status={order.refundStatus} /></BusinessDetailField>
        <BusinessDetailField label="分账状态"><SettlementStatusChip status={order.settlementStatus} /></BusinessDetailField>
      </BusinessDetailSection>

      <BusinessDetailSection title="付款信息" summary={`实付 ${formatCurrency(order.actualAmount || order.amount)}`}>
        <BusinessDetailField label="实付金额" strong>{formatCurrency(order.actualAmount || order.amount)}</BusinessDetailField>
        <BusinessDetailField label="官方收款渠道">{order.officialPaymentChannel || '-'}</BusinessDetailField>
        <Box sx={{ gridColumn: { md: '1 / -1' } }}>
          <TableContainer sx={{ bgcolor: 'white' }}>
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>金额</TableCell><TableCell>付款时间</TableCell><TableCell>付款订单号</TableCell><TableCell>付款截图</TableCell><TableCell>成交路径 / 聊天记录</TableCell><TableCell>备注</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {order.payments?.length ? order.payments.map((payment, index) => (
                  <TableRow key={payment.id}>
                    <TableCell>{formatCurrency(payment.amount)}</TableCell>
                    <TableCell>{formatDate(payment.paidAt, 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                    <TableCell>{payment.paymentOrderNo || '-'}</TableCell>
                    <TableCell>{payment.attachments?.length ? <BusinessAttachmentLinks attachments={payment.attachments} /> : <AttachmentPreviewLink title="付款截图" fileName={payment.voucherName} src={payment.voucherPreview} />}</TableCell>
                    {index === 0 ? <TableCell rowSpan={order.payments.length}>{order.dealEvidenceAttachments?.length ? <BusinessAttachmentLinks attachments={order.dealEvidenceAttachments} /> : <AttachmentPreviewLink title="成交路径 / 聊天记录" fileName={order.dealEvidenceName} src={order.dealEvidencePreview} />}</TableCell> : null}
                    <TableCell>{payment.remark || '-'}</TableCell>
                  </TableRow>
                )) : <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ color: '#9ca3af', py: 3 }}>暂无付款记录</TableCell>
                  <TableCell>
                    {order.dealEvidenceAttachments?.length
                      ? <BusinessAttachmentLinks attachments={order.dealEvidenceAttachments} />
                      : <AttachmentPreviewLink title="成交路径 / 聊天记录" fileName={order.dealEvidenceName} src={order.dealEvidencePreview} />}
                  </TableCell>
                  <TableCell>-</TableCell>
                </TableRow>}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      </BusinessDetailSection>

      <BusinessDetailSection title="补充信息" columns={1}>
        <BusinessDetailField label="备注" wide><Typography sx={{ whiteSpace: 'pre-wrap' }}>{order.notes || '-'}</Typography></BusinessDetailField>
      </BusinessDetailSection>

      <BusinessDetailSection title="审核与系统信息" defaultExpanded={false}>
        <BusinessDetailField label="订单创建人">{order.createdByName || '-'}</BusinessDetailField>
        <BusinessDetailField label="创建时间">{formatDate(order.createdAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
        <BusinessDetailField label="更新时间">{formatDate(order.updatedAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
      </BusinessDetailSection>
    </DialogContent>
  </Dialog>
);

export default OrderDetail;
