import React from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { Box, DialogTitle, IconButton, type DialogTitleProps } from '@mui/material';

interface DialogCloseTitleProps extends DialogTitleProps {
  onClose: () => void;
  closeLabel?: string;
}

const DialogCloseTitle: React.FC<DialogCloseTitleProps> = ({
  children,
  onClose,
  closeLabel = '关闭',
  sx,
  ...props
}) => (
  <DialogTitle
    sx={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 2,
      pr: 6,
      ...sx,
    }}
    {...props}
  >
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flex: 1, minWidth: 0 }}>
      {children}
    </Box>
    <IconButton
      aria-label={closeLabel}
      size="small"
      onClick={onClose}
      sx={{ position: 'absolute', top: 12, right: 12 }}
    >
      <CloseIcon fontSize="small" />
    </IconButton>
  </DialogTitle>
);

export default DialogCloseTitle;
