import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogActions, Button, Box,
  Typography, Chip, Divider, Stepper, Step, StepLabel, List, ListItem, ListItemText,
} from '@mui/material';
import type { Refund } from '../../types/refund';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { getProductLevelColor } from '../../shared/utils/constants';
import useRefundStore from '../../store/useRefundStore';
import RefundProcessDialog from './RefundProcessDialog';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

interface RefundDetailProps {
  refund: Refund;
  open: boolean;
  onClose: () => void;
}

const statusSteps = ['待分配', '挽回中', '挽回成功', '待财务退款', '退款已批准', '退款已完成'];

const getActiveStep = (status: string): number => {
  if (status === '退款已拒绝') return -1;
  if (status === '退款申请中') return 0;
  return statusSteps.indexOf(status);
};

const getStatusColor = (status: string): 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning' => {
  const map: Record<string, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
    待分配: 'warning',
    挽回中: 'primary',
    挽回成功: 'success',
    待财务退款: 'secondary',
    退款申请中: 'warning',
    退款已批准: 'info',
    退款已完成: 'success',
    退款已拒绝: 'error',
  };
  return map[status] || 'default';
};

const RefundDetail: React.FC<RefundDetailProps> = ({ refund, open, onClose }) => {
  const [processOpen, setProcessOpen] = useState(false);
  const [processAction, setProcessAction] = useState<'assign' | 'log' | 'success' | 'failed' | 'approve' | 'reject' | 'complete'>('assign');
  const { assign, addLog, markSuccess, markFailed, approve, reject, complete } = useRefundStore();

  const activeStep = getActiveStep(refund.status);
  const levelColor = getProductLevelColor(refund.productLevel);

  const handleAction = (action: typeof processAction) => {
    setProcessAction(action);
    setProcessOpen(true);
  };

  const handleProcessSubmit = async (data: any) => {
    if (processAction === 'assign') {
      await assign(refund.id, data);
    } else if (processAction === 'log') {
      await addLog(refund.id, data);
    } else if (processAction === 'success') {
      await markSuccess(refund.id, { ...data, retainedAmount: Number(data.retainedAmount) || refund.orderAmount });
    } else if (processAction === 'failed') {
      await markFailed(refund.id, data);
    } else if (processAction === 'approve') {
      await approve(refund.id, 'user-005', '刘强');
    } else if (processAction === 'reject') {
      await reject(refund.id, 'user-005', '刘强', data.rejectReason || '');
    } else if (processAction === 'complete') {
      await complete(refund.id, data.refundMethod || '银行转账', data.refundVoucher, data.refundSerialNo, data.refundedAt);
    }
    setProcessOpen(false);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={onClose}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>{refund.refundNo}</Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>{refund.productName || refund.productLevel}</Typography>
            <Chip label={refund.productLevel} size="small" sx={{ bgcolor: `${levelColor}18`, color: levelColor, fontWeight: 600 }} />
          </Box>
          <Chip label={refund.status} size="small" color={getStatusColor(refund.status)} />
        </DialogCloseTitle>
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
                <Typography variant="body2" sx={{ color: '#6b7280' }}>产品名称</Typography>
                <Typography variant="body1">{refund.productName || refund.productLevel || '-'}</Typography>
              </Box>
              <Box>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>产品等级</Typography>
                <Typography variant="body1">{refund.productLevel || '-'}</Typography>
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

          <Divider sx={{ my: 2 }} />

          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>挽回任务</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5 }}>
              <Typography variant="body2">负责人: {refund.recoveryTask?.assignedToName || '-'}</Typography>
              <Typography variant="body2">角色: {refund.recoveryTask?.assignedToRole || '-'}</Typography>
              <Typography variant="body2">优先级: {refund.recoveryTask?.priority || '-'}</Typography>
              <Typography variant="body2">任务状态: {refund.recoveryTask?.status || '-'}</Typography>
              <Typography variant="body2">挽回次数: {refund.recoveryTask?.attemptCount || 0}/{refund.recoveryTask?.maxAttempts || 3}</Typography>
              <Typography variant="body2">锁定到期: {refund.recoveryTask?.lockUntil ? formatDate(refund.recoveryTask.lockUntil, 'yyyy-MM-dd HH:mm') : '-'}</Typography>
              <Typography variant="body2">下次跟进: {refund.recoveryTask?.nextFollowUpAt ? formatDate(refund.recoveryTask.nextFollowUpAt, 'yyyy-MM-dd HH:mm') : '-'}</Typography>
              <Typography variant="body2">成功方式: {refund.recoveryTask?.successMethod || '-'}</Typography>
              <Typography variant="body2">失败原因: {refund.recoveryTask?.failedReason || '-'}</Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>提成与财务联动</Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5 }}>
              <Typography variant="body2">冻结提成: {formatCurrency(refund.frozenCommissionAmount || 0)}</Typography>
              <Typography variant="body2">预计损失: {formatCurrency(refund.estimatedLossAmount || 0)}</Typography>
              <Typography variant="body2">挽回提成: {formatCurrency(refund.recoveryCommissionAmount || 0)}</Typography>
              <Typography variant="body2">挽回比例: {Math.round((refund.recoveryRate || 0.03) * 100)}%</Typography>
              <Typography variant="body2">保留金额: {formatCurrency(refund.retainedAmount || 0)}</Typography>
              <Typography variant="body2">最终退款: {refund.status === '退款已完成' ? formatCurrency(refund.refundAmount) : '-'}</Typography>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" sx={{ mb: 1.5, color: '#6b7280' }}>挽回记录时间线</Typography>
            {refund.recoveryLogs?.length ? (
              <List dense sx={{ bgcolor: '#f8fafc', borderRadius: 1 }}>
                {refund.recoveryLogs.map((log) => (
                  <ListItem key={log.id} divider>
                    <ListItemText
                      primary={`${formatDate(log.createdAt, 'yyyy-MM-dd HH:mm')}  ${log.operatorName} · ${log.actionType} · ${log.result}`}
                      secondary={log.content}
                    />
                  </ListItem>
                ))}
              </List>
            ) : (
              <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无挽回记录</Typography>
            )}
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
          {['待分配', '退款申请中'].includes(refund.status) && (
            <Button variant="outlined" onClick={() => handleAction('assign')}>分配任务</Button>
          )}
          {['待分配', '挽回中'].includes(refund.status) && (
            <>
              <Button variant="outlined" onClick={() => handleAction('log')}>记录沟通</Button>
              <Button color="success" variant="contained" onClick={() => handleAction('success')}>挽回成功</Button>
              <Button color="warning" variant="outlined" onClick={() => handleAction('failed')}>挽回失败</Button>
            </>
          )}
          {['待财务退款', '退款申请中'].includes(refund.status) && (
            <>
              <Button color="error" variant="outlined" onClick={() => handleAction('reject')}>驳回</Button>
              <Button color="primary" variant="contained" onClick={() => handleAction('approve')}>批准</Button>
            </>
          )}
          {refund.status === '退款已批准' && (
            <Button color="success" variant="contained" onClick={() => handleAction('complete')}>完成退款</Button>
          )}
        </DialogActions>
      </Dialog>

      <RefundProcessDialog
        open={processOpen}
        action={processAction}
        refund={refund}
        onClose={() => setProcessOpen(false)}
        onSubmit={handleProcessSubmit}
      />
    </>
  );
};

export default RefundDetail;
