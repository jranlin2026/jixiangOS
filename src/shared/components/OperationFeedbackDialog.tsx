import React from 'react';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberOutlinedIcon from '@mui/icons-material/WarningAmberOutlined';
import { Box, Button, Dialog, DialogActions, DialogContent, Typography } from '@mui/material';
import DialogCloseTitle from './DialogCloseTitle';

export type OperationFeedbackSeverity = 'success' | 'error' | 'warning' | 'info';

interface OperationFeedbackDialogProps {
  open: boolean;
  severity?: OperationFeedbackSeverity;
  title?: string;
  message: React.ReactNode;
  onClose: () => void;
  confirmText?: string;
}

const presentation = {
  success: { title: '操作完成', color: '#059669', bg: '#ecfdf5', icon: CheckCircleOutlineIcon },
  error: { title: '操作失败', color: '#dc2626', bg: '#fef2f2', icon: ErrorOutlineIcon },
  warning: { title: '请注意', color: '#d97706', bg: '#fffbeb', icon: WarningAmberOutlinedIcon },
  info: { title: '提示', color: '#0284c7', bg: '#f0f9ff', icon: InfoOutlinedIcon },
} as const;

const OperationFeedbackDialog: React.FC<OperationFeedbackDialogProps> = ({
  open,
  severity = 'info',
  title,
  message,
  onClose,
  confirmText = '知道了',
}) => {
  const style = presentation[severity];
  const Icon = style.icon;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="operation-feedback-title"
      // Operation feedback can be triggered while a business-detail dialog remains open.
      // Keep it one layer above that dialog so the result is visible immediately.
      sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
    >
      <DialogCloseTitle id="operation-feedback-title" onClose={onClose} sx={{ fontWeight: 800 }}>
        {title || style.title}
      </DialogCloseTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, p: 2, bgcolor: style.bg, borderRadius: 1.5 }}>
          <Icon sx={{ color: style.color, mt: 0.125, flexShrink: 0 }} />
          <Typography variant="body2" sx={{ color: '#374151', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {message}
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button variant="contained" onClick={onClose}>{confirmText}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default OperationFeedbackDialog;
