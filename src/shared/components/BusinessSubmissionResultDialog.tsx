import React from 'react';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { Box, Button, Dialog, DialogActions, DialogContent, Stack, Typography } from '@mui/material';
import DialogCloseTitle from './DialogCloseTitle';

export interface BusinessSubmissionResultField {
  label: string;
  value: React.ReactNode;
}

interface BusinessSubmissionResultDialogProps {
  open: boolean;
  title: string;
  description: string;
  fields: BusinessSubmissionResultField[];
  onClose: () => void;
  onViewReview?: () => void;
  reviewActionLabel?: string;
}

const BusinessSubmissionResultDialog: React.FC<BusinessSubmissionResultDialogProps> = ({
  open,
  title,
  description,
  fields,
  onClose,
  onViewReview,
  reviewActionLabel = '查看审核进度',
}) => (
  <Dialog
    open={open}
    onClose={onClose}
    maxWidth="xs"
    fullWidth
    aria-labelledby="business-submission-result-title"
  >
    <DialogCloseTitle id="business-submission-result-title" onClose={onClose}>
      <Stack direction="row" spacing={1} alignItems="center">
        <CheckCircleOutlineIcon sx={{ color: '#059669' }} />
        <Typography component="span" variant="h6" sx={{ fontWeight: 900 }}>
          {title}
        </Typography>
      </Stack>
    </DialogCloseTitle>
    <DialogContent dividers>
      <Typography variant="body2" sx={{ color: '#374151', mb: 2 }}>
        {description}
      </Typography>
      <Box sx={{ display: 'grid', gap: 1, bgcolor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 1, p: 1.5 }}>
        {fields.map((field) => (
          <Box
            key={field.label}
            sx={{
              display: 'grid',
              gridTemplateColumns: '88px minmax(0, 1fr)',
              gap: 1,
              alignItems: 'start',
            }}
          >
            <Typography variant="body2" sx={{ color: '#64748b' }}>{field.label}</Typography>
            <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700, overflowWrap: 'anywhere' }}>
              {field.value ?? '-'}
            </Typography>
          </Box>
        ))}
      </Box>
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}>
      <Button onClick={onClose}>{onViewReview ? '留在当前页面' : '完成'}</Button>
      {onViewReview && (
        <Button variant="contained" onClick={onViewReview}>
          {reviewActionLabel}
        </Button>
      )}
    </DialogActions>
  </Dialog>
);

export default BusinessSubmissionResultDialog;
