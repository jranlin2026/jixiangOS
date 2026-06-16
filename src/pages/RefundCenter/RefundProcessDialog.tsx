import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Box, Typography,
} from '@mui/material';
import { PAYMENT_METHODS } from '../../shared/utils/constants';

interface RefundProcessDialogProps {
  open: boolean;
  action: 'approve' | 'reject' | 'complete';
  onClose: () => void;
  onSubmit: (data: any) => void;
}

const RefundProcessDialog: React.FC<RefundProcessDialogProps> = ({ open, action, onClose, onSubmit }) => {
  const [rejectReason, setRejectReason] = useState('');
  const [refundMethod, setRefundMethod] = useState('银行转账');
  const [refundVoucher, setRefundVoucher] = useState('');

  const titles: Record<string, string> = {
    approve: '批准退款',
    reject: '驳回退款',
    complete: '完成退款',
  };

  const handleSubmit = () => {
    const data: any = {};
    if (action === 'reject') {
      data.rejectReason = rejectReason;
    } else if (action === 'complete') {
      data.refundMethod = refundMethod;
      data.refundVoucher = refundVoucher;
    }
    onSubmit(data);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{titles[action]}</DialogTitle>
      <DialogContent>
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
              label="退款凭证（选填）"
              value={refundVoucher}
              onChange={(e) => setRefundVoucher(e.target.value)}
              fullWidth
              placeholder="凭证编号或文件名"
            />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button
          variant="contained"
          color={action === 'reject' ? 'error' : action === 'complete' ? 'success' : 'primary'}
          onClick={handleSubmit}
          disabled={action === 'reject' && !rejectReason}
        >
          确认{titles[action]}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RefundProcessDialog;
