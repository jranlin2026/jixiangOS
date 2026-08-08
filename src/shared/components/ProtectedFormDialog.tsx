import React from 'react';
import { Dialog } from '@mui/material';
import type { DialogProps } from '@mui/material';
import useProtectedFormClose from '../hooks/useProtectedFormClose';

export interface ProtectedFormDialogControls {
  dirty: boolean;
  markDirty: () => void;
  requestClose: () => Promise<void>;
}

interface ProtectedFormDialogProps extends Omit<DialogProps, 'children' | 'onClose'> {
  children: React.ReactNode | ((controls: ProtectedFormDialogControls) => React.ReactNode);
  onClose: () => void;
  submitting?: boolean;
  resetKey?: string;
  markButtonClicksDirty?: boolean;
}

/**
 * 业务写入型弹窗的统一关闭边界：遮罩与 Esc 不关闭，显式关闭在有改动时二次确认，
 * 提交过程中锁定关闭。只读详情和普通确认弹窗不应使用本组件。
 */
const ProtectedFormDialog: React.FC<ProtectedFormDialogProps> = ({
  children,
  onClose,
  open,
  submitting = false,
  resetKey = '',
  markButtonClicksDirty = true,
  ...dialogProps
}) => {
  const {
    dirty,
    markDirty,
    requestClose,
    handleDialogClose,
    interactionProps,
    dialog,
  } = useProtectedFormClose({ open, submitting, resetKey, markButtonClicksDirty, onClose });

  const content = typeof children === 'function'
    ? children({ dirty, markDirty, requestClose })
    : children;

  return (
    <>
      <Dialog
        {...dialogProps}
        {...interactionProps}
        open={open}
        onClose={handleDialogClose}
        disableEscapeKeyDown
      >
        {content}
      </Dialog>
      {dialog}
    </>
  );
};

export default ProtectedFormDialog;
