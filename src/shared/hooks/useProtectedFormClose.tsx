import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DialogProps } from '@mui/material';
import useAppFeedback from './useAppFeedback';
import { resolveProtectedFormClose, shouldMarkProtectedFormButtonClick } from '../utils/protectedFormClose';

interface UseProtectedFormCloseOptions {
  open: boolean;
  submitting?: boolean;
  resetKey?: string;
  markButtonClicksDirty?: boolean;
  onClose: () => void;
}

export function useProtectedFormClose({
  open,
  submitting = false,
  resetKey = '',
  markButtonClicksDirty = true,
  onClose,
}: UseProtectedFormCloseOptions) {
  const [dirty, setDirty] = useState(false);
  const { confirm, dialog } = useAppFeedback();

  useEffect(() => {
    if (open) setDirty(false);
  }, [open, resetKey]);

  const markDirty = useCallback(() => setDirty(true), []);

  const requestClose = useCallback(async () => {
    const action = resolveProtectedFormClose({ reason: 'explicit', dirty, submitting });
    if (action === 'ignore') return;
    if (action === 'confirm') {
      const discard = await confirm(
        '当前填写内容尚未提交，关闭后将丢失。',
        '确认放弃填写？',
        { confirmText: '放弃并关闭', cancelText: '继续填写' },
      );
      if (!discard) return;
    }
    onClose();
  }, [confirm, dirty, onClose, submitting]);

  const handleDialogClose = useCallback<NonNullable<DialogProps['onClose']>>((_event, reason) => {
    const action = resolveProtectedFormClose({ reason, dirty, submitting });
    if (action === 'close') onClose();
  }, [dirty, onClose, submitting]);

  const interactionProps = useMemo(() => ({
    onChangeCapture: markDirty,
    onInputCapture: markDirty,
    onPasteCapture: markDirty,
    onDropCapture: markDirty,
    onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
      const button = (event.target as Element | null)?.closest('button');
      if (shouldMarkProtectedFormButtonClick({
        markButtonClicksDirty,
        isButton: Boolean(button && button.getAttribute('aria-expanded') === null),
      })) markDirty();
    },
  }), [markButtonClicksDirty, markDirty]);

  return {
    dirty,
    markDirty,
    requestClose,
    handleDialogClose,
    interactionProps,
    dialog,
  };
}

export default useProtectedFormClose;
