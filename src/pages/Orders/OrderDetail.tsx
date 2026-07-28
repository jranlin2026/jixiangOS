import React, { useMemo, useRef } from 'react';
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
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
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
import { BusinessDetailField, BusinessDetailSection } from '../../shared/components/BusinessDetailSection';

interface OrderDetailProps {
  order: Order;
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  onCorrect?: () => void;
  canEdit?: boolean;
  canCorrect?: boolean;
  canViewHistory?: boolean;
}

const changeActionLabels = {
  create: '创建订单',
  update: '编辑资料',
  correct: '订单更正',
  delete: '删除订单',
} as const;

const reviewActionLabels = {
  submit: '提交申请',
  resubmit: '重新提交',
  approve: '审核通过',
  return: '退回修改',
  reject: '审核驳回',
} as const;

const reviewActionSummaries = {
  submit: '提交订单申请',
  resubmit: '重新提交订单申请',
  approve: '财务审核通过',
  return: '财务退回订单申请',
  reject: '财务驳回订单申请',
} as const;

interface OrderOperationRecord {
  id: string;
  operator: string;
  changedAt: string;
  actionLabel: string;
  summary: string;
}

const OrderDetail: React.FC<OrderDetailProps> = ({
  order,
  open,
  onClose,
  onEdit,
  onCorrect,
  canEdit = false,
  canCorrect = false,
  canViewHistory = false,
}) => {
  const theme = useTheme();
  const mobileFullScreen = useMediaQuery(theme.breakpoints.down('sm'));
  const operationSectionRef = useRef<HTMLDivElement>(null);
  const productItems = order.items?.length ? order.items : [{
    id: 'legacy-primary',
    productName: order.productName || order.productLevel,
    productLevel: order.productLevel,
    unitPrice: order.amount,
    quantity: 1,
    subtotal: order.amount,
    isPrimary: true,
  }];
  const operationRecords = useMemo<OrderOperationRecord[]>(() => {
    if (!canViewHistory) return [];
    return [
      ...(order.reviewLogs || []).map((record) => ({
        id: `review-${record.id}`,
        operator: record.operatorName,
        changedAt: record.createdAt,
        actionLabel: reviewActionLabels[record.action],
        summary: record.reason
          ? `${reviewActionSummaries[record.action]}：${record.reason}`
          : reviewActionSummaries[record.action],
      })),
      ...(order.changeHistory || []).map((record) => ({
        id: `change-${record.id}`,
        operator: record.operator,
        changedAt: record.changedAt,
        actionLabel: changeActionLabels[record.action],
        summary: record.summary,
      })),
    ].sort((left, right) => new Date(right.changedAt).getTime() - new Date(left.changedAt).getTime());
  }, [canViewHistory, order.changeHistory, order.reviewLogs]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={mobileFullScreen}
      PaperProps={{ sx: { maxHeight: { xs: '100dvh', sm: '94vh' }, bgcolor: '#f8fafc' } }}
    >
      <DialogCloseTitle onClose={onClose} sx={{ pl: { xs: 2, sm: 3 }, pr: { xs: 6, sm: 7 }, py: 2, bgcolor: '#fff', alignItems: 'flex-start' }}>
        <Box sx={{ width: '100%', minWidth: 0, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 1.25 }}>
          <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 850 }}>订单详情</Typography>
          <Stack direction="row" spacing={1} useFlexGap sx={{ pr: { xs: 0, sm: 1 }, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {canViewHistory ? (
              <Button
                size="small"
                variant="text"
                startIcon={<HistoryIcon />}
                aria-label="修改记录"
                onClick={() => operationSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                sx={{ minWidth: { xs: 40, sm: 'auto' }, px: { xs: 1, sm: 1.25 }, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>修改记录</Box>
              </Button>
            ) : null}
            {canEdit && onEdit ? (
              <Button
                size="small"
                variant="outlined"
                startIcon={<EditOutlinedIcon />}
                aria-label="编辑资料"
                onClick={onEdit}
                sx={{ minWidth: { xs: 40, sm: 'auto' }, px: { xs: 1, sm: 1.25 }, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>编辑资料</Box>
              </Button>
            ) : null}
            {canCorrect && onCorrect ? (
              <Button
                size="small"
                color="warning"
                variant="outlined"
                startIcon={<PublishedWithChangesOutlinedIcon />}
                aria-label="订单更正"
                onClick={onCorrect}
                sx={{ minWidth: { xs: 40, sm: 'auto' }, px: { xs: 1, sm: 1.25 }, '& .MuiButton-startIcon': { mr: { xs: 0, sm: 1 } } }}
              >
                <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>订单更正</Box>
              </Button>
            ) : null}
          </Stack>
        </Box>
      </DialogCloseTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 3 }, py: 2.5, bgcolor: '#f8fafc' }}>
        <Box
          aria-label="订单摘要"
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr 1fr',
              md: 'minmax(260px, 1.5fr) 120px 130px minmax(210px, 1fr)',
            },
            mb: 2.5,
            border: '1px solid #bfdbfe',
            borderRadius: 2,
            bgcolor: '#f4f8ff',
            overflow: 'hidden',
          }}
        >
          {[
            { label: '订单编号', value: order.orderNo },
            { label: '分账状态', value: <SettlementStatusChip status={order.settlementStatus} /> },
            { label: '实付金额', value: formatCurrency(order.actualAmount ?? order.amount), strong: true },
            { label: '创建时间', value: formatDate(order.createdAt, 'yyyy-MM-dd HH:mm:ss') },
          ].map((item, index) => (
            <Box
              key={item.label}
              sx={{
                px: { xs: 1.5, sm: 2 },
                py: 1.35,
                minWidth: 0,
                borderLeft: { xs: index % 2 ? '1px solid #dbeafe' : 0, md: index ? '1px solid #dbeafe' : 0 },
                borderTop: { xs: index > 1 ? '1px solid #dbeafe' : 0, md: 0 },
              }}
            >
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>{item.label}</Typography>
              <Box sx={{ mt: 0.4, color: item.strong ? '#1d4ed8' : '#0f172a', fontWeight: item.strong ? 850 : 700, wordBreak: { xs: 'break-word', md: 'normal' }, whiteSpace: { md: 'nowrap' } }}>
                {item.value}
              </Box>
            </Box>
          ))}
        </Box>

        <BusinessDetailSection step={1} title="客户信息" summary={`${order.customerName} / ${order.owner || '未分配'}`} columns={2}>
          <BusinessDetailField label="客户名称">{order.customerName}</BusinessDetailField>
          <BusinessDetailField label="销售负责人">{order.owner || '-'}</BusinessDetailField>
          <BusinessDetailField label="资源归属">{normalizeResourceOwnership(order.resourceOwnership || order.sourceType)}</BusinessDetailField>
          <BusinessDetailField label="线索来源">{formatLeadSourceLabel(order.leadSource, order.sourceName)}</BusinessDetailField>
        </BusinessDetailSection>

        <BusinessDetailSection step={2} title="产品信息" summary={`${productItems.length} 项 / ${formatCurrency(order.standardTotalAmount || order.amount)}`} columns={1}>
          <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
            <TableContainer sx={{ display: { xs: 'none', sm: 'block' }, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
              <Table size="small" sx={{ minWidth: 620, tableLayout: 'fixed' }}>
                <TableHead><TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell sx={{ width: '32%' }}>产品名称</TableCell>
                  <TableCell sx={{ width: '18%' }}>产品等级</TableCell>
                  <TableCell align="right">产品价格</TableCell>
                  <TableCell align="right">数量</TableCell>
                  <TableCell align="right">小计</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {productItems.map((item) => <TableRow key={item.id}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 650 }}>{item.productName}</Typography>
                      {item.isPrimary ? <Chip label="主产品" size="small" color="primary" variant="outlined" sx={{ mt: 0.6, height: 20, fontSize: 11 }} /> : null}
                    </TableCell>
                    <TableCell><Chip label={item.productLevel} size="small" sx={getProductLevelTagSx(item.productLevel)} /></TableCell>
                    <TableCell align="right">{formatCurrency(item.unitPrice)}</TableCell>
                    <TableCell align="right">{item.quantity}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>{formatCurrency(item.subtotal)}</TableCell>
                  </TableRow>)}
                  <TableRow>
                    <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>产品合计（{productItems.length}项）</TableCell>
                    <TableCell align="right" sx={{ color: '#1d4ed8', fontWeight: 850 }}>{formatCurrency(order.standardTotalAmount || order.amount)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ display: { xs: 'grid', sm: 'none' }, gap: 1.25 }}>
              {productItems.map((item) => (
                <Box key={`mobile-${item.id}`} sx={{ p: 1.5, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 750, wordBreak: 'break-word' }}>{item.productName}</Typography>
                      <Stack direction="row" spacing={0.75} useFlexGap sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                        {item.isPrimary ? <Chip label="主产品" size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: 11 }} /> : null}
                        <Chip label={item.productLevel} size="small" sx={{ ...getProductLevelTagSx(item.productLevel), height: 20, fontSize: 11 }} />
                      </Stack>
                    </Box>
                    <Typography variant="subtitle2" sx={{ flexShrink: 0, color: '#1d4ed8', fontWeight: 850 }}>{formatCurrency(item.subtotal)}</Typography>
                  </Box>
                  <Box sx={{ mt: 1.25, pt: 1.25, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, borderTop: '1px solid #e2e8f0' }}>
                    <BusinessDetailField label="产品价格">{formatCurrency(item.unitPrice)}</BusinessDetailField>
                    <BusinessDetailField label="数量">{item.quantity}</BusinessDetailField>
                  </Box>
                </Box>
              ))}
              <Box sx={{ px: 1.5, py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, border: '1px solid #bfdbfe', borderRadius: 1.5, bgcolor: '#eff6ff' }}>
                <Typography variant="body2" sx={{ fontWeight: 750 }}>产品合计（{productItems.length}项）</Typography>
                <Typography variant="subtitle2" sx={{ color: '#1d4ed8', fontWeight: 850 }}>{formatCurrency(order.standardTotalAmount || order.amount)}</Typography>
              </Box>
            </Box>
          </Box>
        </BusinessDetailSection>

        <BusinessDetailSection step={3} title="订单信息" columns={2}>
          <BusinessDetailField label="订单类型">{order.orderType || '-'}</BusinessDetailField>
          <BusinessDetailField label="第三方平台订单">{order.thirdPartyOrderNo || '-'}</BusinessDetailField>
          <BusinessDetailField label="备注信息" wide>
            <Typography sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{order.notes || '-'}</Typography>
          </BusinessDetailField>
        </BusinessDetailSection>

        <BusinessDetailSection step={4} title="收款与凭证" summary={`共 ${order.payments?.length || 0} 笔 / 实付 ${formatCurrency(order.actualAmount ?? order.amount)}`} columns={1}>
          <Box sx={{ gridColumn: '1 / -1', display: 'grid', gap: 1.5 }}>
            {order.payments?.length ? order.payments.map((payment, index) => (
              <Box key={payment.id} sx={{ border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff', overflow: 'hidden' }}>
                <Box sx={{ px: 2, py: 1.25, display: 'flex', justifyContent: 'space-between', gap: 2, bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>第{index + 1}笔付款</Typography>
                  <Typography variant="subtitle2" sx={{ color: '#1d4ed8', fontWeight: 850 }}>{formatCurrency(payment.amount)}</Typography>
                </Box>
                <Box sx={{ p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                  <BusinessDetailField label="官方收款渠道">{order.officialPaymentChannel || payment.paymentMethod || '-'}</BusinessDetailField>
                  <BusinessDetailField label="付款时间">{formatDate(payment.paidAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
                  <BusinessDetailField label="付款订单号">{payment.paymentOrderNo || '-'}</BusinessDetailField>
                  <BusinessDetailField label="付款截图">
                    {payment.attachments?.length
                      ? <BusinessAttachmentLinks attachments={payment.attachments} />
                      : <AttachmentPreviewLink title="付款截图" fileName={payment.voucherName} src={payment.voucherPreview} />}
                  </BusinessDetailField>
                  <BusinessDetailField label="付款备注" wide>{payment.remark || '-'}</BusinessDetailField>
                </Box>
              </Box>
            )) : (
              <Box sx={{ py: 3, textAlign: 'center', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: 1.5, bgcolor: '#fff' }}>
                暂无付款记录
              </Box>
            )}
            <Box sx={{ p: 2, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
              <BusinessDetailField label="成交路径 / 聊天记录">
                {order.dealEvidenceAttachments?.length
                  ? <BusinessAttachmentLinks attachments={order.dealEvidenceAttachments} />
                  : <AttachmentPreviewLink title="成交路径 / 聊天记录" fileName={order.dealEvidenceName} src={order.dealEvidencePreview} />}
              </BusinessDetailField>
            </Box>
          </Box>
        </BusinessDetailSection>

        <Box ref={operationSectionRef} sx={{ scrollMarginTop: 16 }}>
          <BusinessDetailSection
            step={5}
            title="审核与系统记录"
            summary={canViewHistory ? `${operationRecords.length} 条记录` : '无查看权限'}
            columns={1}
          >
          <Box sx={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            <BusinessDetailField label="订单创建人">{order.createdByName || '-'}</BusinessDetailField>
            <BusinessDetailField label="创建时间">{formatDate(order.createdAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
            <BusinessDetailField label="更新时间">{formatDate(order.updatedAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
          </Box>
          <Box sx={{ gridColumn: '1 / -1', minWidth: 0 }}>
            <TableContainer sx={{ display: { xs: 'none', sm: 'block' }, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
              <Table size="small" sx={{ minWidth: 680 }}>
                <TableHead><TableRow sx={{ bgcolor: '#f8fafc' }}>
                  <TableCell>操作人</TableCell>
                  <TableCell>操作时间</TableCell>
                  <TableCell>操作类型</TableCell>
                  <TableCell>操作内容</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {!canViewHistory ? (
                    <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: '#94a3b8' }}>当前账号无权查看操作记录</TableCell></TableRow>
                  ) : operationRecords.length ? operationRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.operator || '-'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(record.changedAt, 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                      <TableCell><Chip label={record.actionLabel} size="small" variant="outlined" /></TableCell>
                      <TableCell sx={{ minWidth: 240, whiteSpace: 'normal', wordBreak: 'break-word' }}>{record.summary || '-'}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={4} align="center" sx={{ py: 3, color: '#94a3b8' }}>暂无操作记录</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <Box sx={{ display: { xs: 'grid', sm: 'none' }, gap: 1.25 }}>
              {!canViewHistory ? (
                <Box sx={{ py: 3, textAlign: 'center', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: 1.5, bgcolor: '#fff' }}>当前账号无权查看操作记录</Box>
              ) : operationRecords.length ? operationRecords.map((record) => (
                <Box key={`mobile-${record.id}`} sx={{ p: 1.5, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                    <Chip label={record.actionLabel} size="small" variant="outlined" />
                    <Typography variant="caption" sx={{ color: '#64748b' }}>{formatDate(record.changedAt, 'yyyy-MM-dd HH:mm:ss')}</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ mt: 1.25, fontWeight: 650, whiteSpace: 'normal', wordBreak: 'break-word' }}>{record.summary || '-'}</Typography>
                  <Typography variant="caption" sx={{ mt: 0.75, display: 'block', color: '#64748b' }}>操作人：{record.operator || '-'}</Typography>
                </Box>
              )) : (
                <Box sx={{ py: 3, textAlign: 'center', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: 1.5, bgcolor: '#fff' }}>暂无操作记录</Box>
              )}
            </Box>
          </Box>
          </BusinessDetailSection>
        </Box>
      </DialogContent>
    </Dialog>
  );
};

export default OrderDetail;
