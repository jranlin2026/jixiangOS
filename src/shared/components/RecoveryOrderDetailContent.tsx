import React from 'react';
import {
  Box,
  Chip,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import type { RecoveryOrder } from '../../types/recoveryOrder';
import { formatCurrency, formatDate } from '../utils/formatters';
import { getProductLevelTagSx } from '../utils/constants';
import { getRecoveryEvidenceAttachments } from '../utils/recoveryEvidence';
import { getRecoveryOrderUnifiedReviewStatus } from '../utils/reviewQueue';
import { normalizeSettlementStatus } from '../utils/settlementStatus';
import AttachmentPreviewLink from './AttachmentPreview';
import BusinessAttachmentLinks from './BusinessAttachmentLinks';
import { BusinessDetailField, BusinessDetailSection } from './BusinessDetailSection';
import BusinessStatusChip from './BusinessStatusChip';
import BusinessSummaryGrid from './BusinessSummaryGrid';
import SettlementStatusChip from './SettlementStatusChip';

const recoveryChangeActionLabels = {
  create: '创建挽回单',
  edit: '编辑资料',
  correct: '挽回单更正',
  review: '审核处理',
  settlement: '分账处理',
  delete: '删除挽回单',
} as const;

interface RecoveryOrderDetailContentProps {
  order: RecoveryOrder;
  mode?: 'list' | 'review';
  canViewHistory: boolean;
  fallbackProductLevel?: string;
  operationSectionRef?: React.RefObject<HTMLDivElement | null>;
}

const RecoveryOrderDetailContent: React.FC<RecoveryOrderDetailContentProps> = ({
  order,
  mode = 'list',
  canViewHistory,
  fallbackProductLevel,
  operationSectionRef,
}) => {
  const attachments = getRecoveryEvidenceAttachments(order);
  const productLevel = order.originalProductLevel || fallbackProductLevel;

  return (
    <>
      <BusinessSummaryGrid
        ariaLabel="售后挽回订单摘要"
        items={[
          { label: mode === 'review' ? '内部单据编号' : '挽回单号', value: order.recoveryNo },
          {
            label: mode === 'review' ? '审核状态' : '分账状态',
            value: mode === 'review'
              ? <BusinessStatusChip status={getRecoveryOrderUnifiedReviewStatus(order.status, Boolean(order.deletedAt))} />
              : <SettlementStatusChip status={normalizeSettlementStatus(order.settlementStatus, '待处理')} />,
          },
          { label: '挽回金额', value: formatCurrency(order.recoveryAmount), strong: true },
          { label: '创建时间', value: formatDate(order.createdAt, 'yyyy-MM-dd HH:mm:ss') },
        ]}
        desktopColumns="minmax(260px, 1.5fr) 120px 130px minmax(210px, 1fr)"
        sx={{ mb: 2.5 }}
      />

      <BusinessDetailSection step={1} title="客户信息" columns={2} summary={order.submittedCustomerName || order.customerName}>
        <BusinessDetailField label="售后填报客户名称">{order.submittedCustomerName || order.customerName}</BusinessDetailField>
        <BusinessDetailField label="客户手机号">{order.customerPhone || '-'}</BusinessDetailField>
        <BusinessDetailField label="客户微信">{order.customerWechat || '-'}</BusinessDetailField>
        <BusinessDetailField label="CRM识别状态">{order.crmIdentityStatus || order.customerMatchStatus || '-'}</BusinessDetailField>
      </BusinessDetailSection>

      <BusinessDetailSection
        step={2}
        title="原订单与来源"
        columns={2}
        summary={[order.sourcePlatformName || order.sourcePlatform, order.sourceShopName, order.originalProduct].filter(Boolean).join(' / ')}
      >
        <BusinessDetailField label="第三方平台订单号">{order.thirdPartyOrderNo || '-'}</BusinessDetailField>
        <BusinessDetailField label="来源平台">{order.sourcePlatformName || order.sourcePlatform || '-'}</BusinessDetailField>
        <BusinessDetailField label="来源店铺">{order.sourceShopName || '-'}</BusinessDetailField>
        <BusinessDetailField label="原产品">{order.originalProduct || '-'}</BusinessDetailField>
        <BusinessDetailField label="原产品等级">
          {productLevel ? <Chip label={productLevel} size="small" sx={getProductLevelTagSx(productLevel)} /> : '-'}
        </BusinessDetailField>
        <BusinessDetailField label="原付款金额" strong>{formatCurrency(order.originalAmount)}</BusinessDetailField>
      </BusinessDetailSection>

      <BusinessDetailSection step={3} title="挽回成交信息" columns={2} summary={`${formatCurrency(order.recoveryAmount)} / ${order.recoveryUserName || '未分配'}`}>
        <BusinessDetailField label="挽回成交金额" strong>
          <Typography sx={{ fontWeight: 700, color: '#059669' }}>{formatCurrency(order.recoveryAmount)}</Typography>
        </BusinessDetailField>
        <BusinessDetailField label="挽回成交时间">{formatDate(order.recoveryAt || order.createdAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
        <BusinessDetailField label="挽回人员">{order.recoveryUserName || '-'}</BusinessDetailField>
        <BusinessDetailField label="协助人员">{order.assistUserName || '-'}</BusinessDetailField>
        <BusinessDetailField label="备注" wide><Typography sx={{ whiteSpace: 'pre-wrap' }}>{order.remark || '-'}</Typography></BusinessDetailField>
      </BusinessDetailSection>

      <BusinessDetailSection
        step={4}
        title="收款与凭证"
        columns={2}
        summary={[order.officialPaymentChannel, order.paymentOrderNo, attachments.length ? `${attachments.length} 个凭证` : ''].filter(Boolean).join(' / ') || '暂无收款资料'}
      >
        <BusinessDetailField label="官方收款渠道">{order.officialPaymentChannel || '-'}</BusinessDetailField>
        <BusinessDetailField label="付款订单号">{order.paymentOrderNo || '-'}</BusinessDetailField>
        <BusinessDetailField label="付款时间">{order.paymentAt ? formatDate(order.paymentAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</BusinessDetailField>
        <BusinessDetailField label="挽回凭证" wide>
          {attachments.length ? (
            <BusinessAttachmentLinks attachments={attachments} />
          ) : order.paymentVoucherPreview || order.chatEvidencePreview ? (
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              {order.paymentVoucherPreview ? (
                <AttachmentPreviewLink title="挽回凭证" fileName={order.paymentVoucherName || order.paymentVoucher} src={order.paymentVoucherPreview} />
              ) : null}
              {order.chatEvidencePreview ? (
                <AttachmentPreviewLink title="挽回凭证" fileName={order.chatEvidenceName || order.chatEvidence} src={order.chatEvidencePreview} />
              ) : null}
            </Stack>
          ) : '-'}
        </BusinessDetailField>
      </BusinessDetailSection>

      <Box ref={operationSectionRef} sx={{ scrollMarginTop: 16 }}>
        <BusinessDetailSection
          step={5}
          title="审核与系统记录"
          summary={canViewHistory ? `${order.changeHistory?.length || 0} 条记录` : '无查看权限'}
          columns={1}
        >
          <Box sx={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            <BusinessDetailField label="内部单据编号">{order.recoveryNo}</BusinessDetailField>
            <BusinessDetailField label="订单创建人">{order.createdByName || '-'}</BusinessDetailField>
            <BusinessDetailField label="审核状态">{getRecoveryOrderUnifiedReviewStatus(order.status, Boolean(order.deletedAt))}</BusinessDetailField>
            <BusinessDetailField label="审核人">{order.auditorName || '-'}</BusinessDetailField>
            <BusinessDetailField label="创建时间">{formatDate(order.createdAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
            <BusinessDetailField label="更新时间">{formatDate(order.updatedAt, 'yyyy-MM-dd HH:mm:ss')}</BusinessDetailField>
            <BusinessDetailField label="审核时间">{order.auditedAt ? formatDate(order.auditedAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</BusinessDetailField>
            <BusinessDetailField label="退回 / 驳回原因" wide>{order.auditReason || '-'}</BusinessDetailField>
          </Box>

          {order.importBatchId ? (
            <Box sx={{ gridColumn: '1 / -1', p: 2, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
              <BusinessDetailField label="导入批次">{order.importBatchId}</BusinessDetailField>
              <BusinessDetailField label="Excel 行号">{order.importRowNumber || '-'}</BusinessDetailField>
              <BusinessDetailField label="导入人">{order.importedByName || '-'}</BusinessDetailField>
              <BusinessDetailField label="导入时间">{order.importedAt ? formatDate(order.importedAt, 'yyyy-MM-dd HH:mm:ss') : '-'}</BusinessDetailField>
              <BusinessDetailField label="目标订单创建人">{order.targetCreatorName || '-'}</BusinessDetailField>
              <BusinessDetailField label="凭证状态">{attachments.length ? '已上传凭证' : '凭证缺失'}</BusinessDetailField>
              <BusinessDetailField label="预检警告" wide>{order.importWarnings?.length ? order.importWarnings.join('；') : '无'}</BusinessDetailField>
            </Box>
          ) : null}

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
                  ) : order.changeHistory?.length ? order.changeHistory.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>{record.operator || '-'}</TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(record.changedAt, 'yyyy-MM-dd HH:mm:ss')}</TableCell>
                      <TableCell><Chip label={recoveryChangeActionLabels[record.action]} size="small" variant="outlined" /></TableCell>
                      <TableCell sx={{ minWidth: 240, whiteSpace: 'normal', wordBreak: 'break-word' }}>{record.summary || record.reason || '-'}</TableCell>
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
              ) : order.changeHistory?.length ? order.changeHistory.map((record) => (
                <Box key={`mobile-${record.id}`} sx={{ p: 1.5, border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                    <Chip label={recoveryChangeActionLabels[record.action]} size="small" variant="outlined" />
                    <Typography variant="caption" color="text.secondary">{formatDate(record.changedAt, 'yyyy-MM-dd HH:mm:ss')}</Typography>
                  </Box>
                  <Typography variant="body2" sx={{ mt: 1, fontWeight: 650 }}>{record.summary || record.reason || '-'}</Typography>
                  <Typography variant="caption" color="text.secondary">操作人：{record.operator || '-'}</Typography>
                </Box>
              )) : (
                <Box sx={{ py: 3, textAlign: 'center', color: '#94a3b8', border: '1px dashed #cbd5e1', borderRadius: 1.5, bgcolor: '#fff' }}>暂无操作记录</Box>
              )}
            </Box>
          </Box>
        </BusinessDetailSection>
      </Box>
    </>
  );
};

export default RecoveryOrderDetailContent;
