import React, { useCallback, useMemo, useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, Typography } from '@mui/material';
import DialogCloseTitle from '../components/DialogCloseTitle';

type FeedbackState =
  | {
      type: 'alert';
      title: string;
      message: React.ReactNode;
      resolve: () => void;
    }
  | {
      type: 'confirm';
      title: string;
      message: React.ReactNode;
      resolve: (confirmed: boolean) => void;
    };

export const useAppFeedback = () => {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const close = useCallback((confirmed = false) => {
    setFeedback((current) => {
      if (!current) return current;
      if (current.type === 'confirm') current.resolve(confirmed);
      if (current.type === 'alert') current.resolve();
      return null;
    });
  }, []);

  const alert = useCallback((message: React.ReactNode, title = '提示') => (
    new Promise<void>((resolve) => {
      setFeedback({ type: 'alert', title, message, resolve });
    })
  ), []);

  const confirm = useCallback((message: React.ReactNode, title = '确认操作') => (
    new Promise<boolean>((resolve) => {
      setFeedback({ type: 'confirm', title, message, resolve });
    })
  ), []);

  const dialog = useMemo(() => (
    <Dialog open={Boolean(feedback)} onClose={() => close(false)} maxWidth="xs" fullWidth>
      <DialogCloseTitle onClose={() => close(false)}>
        {feedback?.title || '提示'}
      </DialogCloseTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', color: '#374151' }}>
          {feedback?.message}
        </Typography>
      </DialogContent>
      <DialogActions>
        {feedback?.type === 'confirm' && (
          <Button onClick={() => close(false)}>取消</Button>
        )}
        <Button variant="contained" color={feedback?.type === 'confirm' ? 'error' : 'primary'} onClick={() => close(true)}>
          确定
        </Button>
      </DialogActions>
    </Dialog>
  ), [close, feedback]);

  return { alert, confirm, dialog };
};

export default useAppFeedback;
