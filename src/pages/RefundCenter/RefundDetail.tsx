import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box,
  Typography, Chip, Divider, Stepper, Step, StepLabel,
} from '@mui/material';
import type { Refund } from '../../types/refund';
import type { ProductLevel } from '../../types/common';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { PRODUCT_LEVEL_COLOR_MAP } from '../../shared/utils/constants';
import useRefundStore from '../../store/useRefundStore';
import RefundProcessDialog from './RefundProcessDialog';

interface RefundDetailProps {
  refund: Refund;
  open: boolean;
  onClose: () => void;
}

const statusSteps = ['退款申请中', '退款已批准', '退款已完成'];

const getActiveStep = (status: string): number => {
  if (status === '退款已拒绝') return -1;
  return statusSteps.indexOf(status);
};

const RefundDetail: React.FC<RefundDetailProps> = ({ refund, open, onClose }) => {
  const [processOpen, setProcessOpen] = useState(false);
  const [processAction, setProcessAction] = useState<'approve' | 'reject' | 'complete'>('approve');
  const { approve, reject, complete, fetchItems } = useRefundStore();

  const activeStep = getActiveStep(refund.status);
  const levelColor = PRODUCT_LEVEL_COLOR_MAP[refund.productLevel as ProductLevel] || '#9ca3af';

  const handleAction = (action: 'approve' | 'reject' | 'complete') => {
    setProcessAction(action);
    setProcessOpen(true);
  };

  const handleProcessSubmit = async (data: any) => {
    if (processAction === 'approve') {
      await approve(refund.id, 'user-005', '刘强');
    } else if (processAction === 'reject') {
      await reject(refund.id, 'user-005', '刘强', data.rejectReason || '');
    } else if (processAction === 'complete') {
      await complete(refund.id, data.refundMethod || '银行转账', data.refundVoucher);
    }
    setProcessOpen(false);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>{refund.refundNo}</Typography>
            <Chip label={refund.productLevel} size="small" sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }} />
          </Box>
          <Chip label={refund.status} size="small" color={refund.status === '退款已完成' ? 'success' : refund.status === '退款已拒绝' ? 'error' : refund.status === '退款已批准' ? 'info' : 'warning'} />
        </DialogTitle>
        <DialogContent dividers>
          {/* 退款流程时间轴 */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 2, color: '#6b7280' }}>退款处理流程</Typography>
            {refund.status === '退款已拒绝' ? (
              <Box sx={{ p: 2, bgcolor: '#FFEBEE', borderRadius: 2, border: '1px solid #FFCDD2' }}>
                <Typography variant="body2" sx={{ color: '#C62828', fontWeight: 600 }}>退款已拒绝</Typography>
                {refund.rejectReason && <Typography variant="body2" sx={{ color: '#C62828', mt: 0.5 }}>拒绝原因: {refund.rejectReason}</Typography>}
              </Box>
            ) : (
              <Stepper activeStep={activeStep} alternativeLabel>
                {statusSteps.map((label) => (
                  <Step key={label}>
                    <StepLabel>{label}</StepLabel>
                  </Step>
                ))}
              </Stepper>
            )}
          </Box>

          <Divider sx={{ my: 2 }} />

          {/* 基本信息 */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>退款信息</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Box>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>订单号</Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>{refund.orderNo}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>客户名称</Typography>
                <Typography variant="body1">{refund.customerName}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>订单金额</Typography>
                <Typography variant="body1">{formatCurrency(refund.orderAmount)}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>退款金额</Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#F44336' }}>{formatCurrency(refund.refundAmount)}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>退款分类</Typography>
                <Typography variant="body1">{refund.refundCategory}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>退款原因</Typography>
                <Typography variant="body1">{refund.refundReason}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>申请人</Typography>
                <Typography variant="body1">{refund.applicantName}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>创建时间</Typography>
                <Typography variant="body1">{formatDate(refund.createdAt, 'yyyy-MM-dd HH:mm')}</Typography>
              </Box>
            </Box>
          </Box>

          {refund.approverName && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1, color: '#6b7280' }}>审批信息</Typography>
                <Typography variant="body2">审批人: {refund.approverName}</Typography>
                <Typography variant="body2">审批时间: {refund.approvedAt ? formatDate(refund.approvedAt, 'yyyy-MM-dd HH:mm') : '-'}</Typography>
                {refund.refundMethod && <Typography variant="body2">退款方式: {refund.refundMethod}</Typography>}
                {refund.completedAt && <Typography variant="body2">完成时间: {formatDate(refund.completedAt, 'yyyy-MM-dd HH:mm')}</Typography>}
              </Box>
            </>
          )}

          {refund.remark && (
            <>
              <Divider sx={{ my: 2 }} />
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 0.5, color: '#6b7280' }}>备注</Typography>
                <Typography variant="body2">{refund.remark}</Typography>
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          {refund.status === '退款申请中' && (
            <>
              <Button color="error" variant="outlined" onClick={() => handleAction('reject')}>驳回</Button>
              <Button color="primary" variant="contained" onClick={() => handleAction('approve')}>批准</Button>
            </>
          )}
          {refund.status === '退款已批准' && (
            <Button color="success" variant="contained" onClick={() => handleAction('complete')}>完成退款</Button>
          )}
          <Button onClick={onClose}>关闭</Button>
        </DialogActions>
      </Dialog>

      <RefundProcessDialog
        open={processOpen}
        action={processAction}
        onClose={() => setProcessOpen(false)}
        onSubmit={handleProcessSubmit}
      />
    </>
  );
};

export default RefundDetail;
