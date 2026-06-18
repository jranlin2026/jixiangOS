import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogActions, Button,
  TextField, MenuItem, Box, Typography,
} from '@mui/material';
import { PAYMENT_METHODS, RECOVERY_ACTION_TYPES, RECOVERY_SOLUTIONS } from '../../shared/utils/constants';
import type { RecoveryRole, Refund } from '../../types/refund';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

interface RefundProcessDialogProps {
  open: boolean;
  action: 'assign' | 'log' | 'success' | 'failed' | 'approve' | 'reject' | 'complete';
  refund?: Refund;
  onClose: () => void;
  onSubmit: (data: any) => void;
}

const RefundProcessDialog: React.FC<RefundProcessDialogProps> = ({ open, action, refund, onClose, onSubmit }) => {
  const [userName, setUserName] = useState('张伟');
  const [role, setRole] = useState<RecoveryRole>('销售');
  const [assignReason, setAssignReason] = useState('');
  const [actionType, setActionType] = useState('电话沟通');
  const [content, setContent] = useState('');
  const [logResult, setLogResult] = useState('跟进中');
  const [nextFollowUpAt, setNextFollowUpAt] = useState('');
  const [successMethod, setSuccessMethod] = useState('服务升级');
  const [retainedAmount, setRetainedAmount] = useState('');
  const [failedReason, setFailedReason] = useState('客户坚持退款');
  const [rejectReason, setRejectReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('银行转账');
  const [refundVoucher, setRefundVoucher] = useState('');
  const [refundSerialNo, setRefundSerialNo] = useState('');
  const [refundedAt, setRefundedAt] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!open) return;
    const task = refund?.recoveryTask;
    setUserName(task?.assignedToName || refund?.applicantName || '张伟');
    setRole(task?.assignedToRole || '销售');
    setAssignReason('');
    setActionType('电话沟通');
    setContent('');
    setLogResult('跟进中');
    setNextFollowUpAt('');
    setSuccessMethod(task?.recoverySolution || '服务升级');
    setRetainedAmount(String(refund?.orderAmount || refund?.refundAmount || ''));
    setFailedReason('客户坚持退款');
    setRejectReason('');
    setRefundMethod('银行转账');
    setRefundVoucher('');
    setRefundSerialNo('');
    setRefundedAt(new Date().toISOString().slice(0, 10));
  }, [open, action, refund]);

  const titles: Record<string, string> = {
    assign: '分配挽回任务',
    log: '记录沟通',
    success: '标记挽回成功',
    failed: '标记挽回失败',
    approve: '批准退款',
    reject: '驳回退款',
    complete: '完成退款',
  };

  const handleSubmit = () => {
    const data: any = {};
    if (action === 'assign') {
      data.userId = `user-${userName}`;
      data.userName = userName;
      data.role = role;
      data.reason = assignReason;
    } else if (action === 'log') {
      data.operatorId = `user-${userName}`;
      data.operatorName = userName;
      data.operatorRole = role;
      data.actionType = actionType;
      data.content = content;
      data.result = logResult;
      data.nextFollowUpAt = nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : undefined;
    } else if (action === 'success') {
      data.operatorId = `user-${userName}`;
      data.operatorName = userName;
      data.successMethod = successMethod;
      data.retainedAmount = Number(retainedAmount);
      data.note = content;
    } else if (action === 'failed') {
      data.operatorId = `user-${userName}`;
      data.operatorName = userName;
      data.failedReason = failedReason;
      data.note = content;
    } else if (action === 'reject') {
      data.rejectReason = rejectReason;
    } else if (action === 'complete') {
      data.refundMethod = refundMethod;
      data.refundVoucher = refundVoucher;
      data.refundSerialNo = refundSerialNo;
      data.refundedAt = refundedAt;
    }
    onSubmit(data);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogCloseTitle onClose={onClose}>{titles[action]}</DialogCloseTitle>
      <DialogContent>
        {action === 'assign' && (
          <Box sx={{ mt: 1, display: 'grid', gap: 2 }}>
            <TextField label="分配给" value={userName} onChange={(e) => setUserName(e.target.value)} fullWidth />
            <TextField select label="角色" value={role} onChange={(e) => setRole(e.target.value as RecoveryRole)} fullWidth>
              {['销售', '客户成功', '售后'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </TextField>
            <TextField label="分配/改派原因" value={assignReason} onChange={(e) => setAssignReason(e.target.value)} multiline rows={3} fullWidth />
          </Box>
        )}

        {action === 'log' && (
          <Box sx={{ mt: 1, display: 'grid', gap: 2 }}>
            <TextField label="操作人" value={userName} onChange={(e) => setUserName(e.target.value)} fullWidth />
            <TextField select label="角色" value={role} onChange={(e) => setRole(e.target.value as RecoveryRole)} fullWidth>
              {['销售', '客户成功', '售后'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </TextField>
            <TextField select label="动作类型" value={actionType} onChange={(e) => setActionType(e.target.value)} fullWidth>
              {RECOVERY_ACTION_TYPES.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
            <TextField label="沟通内容" value={content} onChange={(e) => setContent(e.target.value)} multiline rows={4} fullWidth required />
            <TextField select label="结果" value={logResult} onChange={(e) => setLogResult(e.target.value)} fullWidth>
              {['跟进中', '挽回失败'].map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </TextField>
            <TextField label="下次跟进时间" type="datetime-local" value={nextFollowUpAt} onChange={(e) => setNextFollowUpAt(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Box>
        )}

        {action === 'success' && (
          <Box sx={{ mt: 1, display: 'grid', gap: 2 }}>
            <TextField label="成功挽回人" value={userName} onChange={(e) => setUserName(e.target.value)} fullWidth />
            <TextField select label="成功方式" value={successMethod} onChange={(e) => setSuccessMethod(e.target.value)} fullWidth>
              {RECOVERY_SOLUTIONS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
            <TextField label="保留金额" type="number" value={retainedAmount} onChange={(e) => setRetainedAmount(e.target.value)} fullWidth required />
            <TextField label="关键沟通记录" value={content} onChange={(e) => setContent(e.target.value)} multiline rows={4} fullWidth required />
          </Box>
        )}

        {action === 'failed' && (
          <Box sx={{ mt: 1, display: 'grid', gap: 2 }}>
            <TextField label="操作人" value={userName} onChange={(e) => setUserName(e.target.value)} fullWidth />
            <TextField label="失败原因" value={failedReason} onChange={(e) => setFailedReason(e.target.value)} fullWidth required />
            <TextField label="失败说明" value={content} onChange={(e) => setContent(e.target.value)} multiline rows={4} fullWidth required />
          </Box>
        )}

        {action === 'approve' && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>确认批准该退款申请？批准后不可撤销。</Typography>
          </Box>
        )}

        {action === 'reject' && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="body1" sx={{ mb: 2 }}>请填写驳回原因：</Typography>
            <TextField
              label="驳回原因"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              multiline
              rows={3}
              fullWidth
              required
            />
          </Box>
        )}

        {action === 'complete' && (
          <Box sx={{ mt: 1, display: 'grid', gap: 2 }}>
            <Typography variant="body1" sx={{ mb: 1 }}>确认退款已完成？请填写退款信息：</Typography>
            <TextField
              select
              label="退款方式"
              value={refundMethod}
              onChange={(e) => setRefundMethod(e.target.value)}
              fullWidth
            >
              {PAYMENT_METHODS.map((m) => (
                <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="退款流水号"
              value={refundSerialNo}
              onChange={(e) => setRefundSerialNo(e.target.value)}
              fullWidth
              required
              placeholder="财务退款流水号"
            />
            <TextField
              label="退款时间"
              type="date"
              value={refundedAt}
              onChange={(e) => setRefundedAt(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="退款凭证"
              value={refundVoucher}
              onChange={(e) => setRefundVoucher(e.target.value)}
              fullWidth
              required
              placeholder="凭证编号或文件名"
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          variant="contained"
          color={action === 'reject' ? 'error' : action === 'complete' ? 'success' : 'primary'}
          onClick={handleSubmit}
          disabled={(action === 'reject' && !rejectReason)
            || (action === 'log' && !content)
            || (action === 'success' && (!retainedAmount || !content))
            || (action === 'failed' && (!failedReason || !content))
            || (action === 'complete' && (!refundSerialNo || !refundVoucher))}
        >
          确认{titles[action]}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RefundProcessDialog;
