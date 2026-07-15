import React, { useState } from 'react';
import { Box, Button, Dialog, DialogContent, Typography } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import DialogCloseTitle from './DialogCloseTitle';

export interface AttachmentPreviewDialogProps {
  open: boolean;
  title: string;
  fileName?: string;
  src?: string;
  onClose: () => void;
}

export const AttachmentPreviewDialog: React.FC<AttachmentPreviewDialogProps> = ({
  open,
  title,
  fileName,
  src,
  onClose,
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
    <DialogCloseTitle onClose={onClose}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>{title}</Typography>
        {fileName && (
          <Typography variant="body2" sx={{ color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {fileName}
          </Typography>
        )}
      </Box>
    </DialogCloseTitle>
    <DialogContent dividers sx={{ p: 2, bgcolor: '#f8fafc', display: 'flex', justifyContent: 'center' }}>
      {src && (
        <Box
          component="img"
          role="img"
          src={src}
          alt={title}
          sx={{
            display: 'block',
            width: '100%',
            maxHeight: 'calc(100vh - 180px)',
            objectFit: 'contain',
            borderRadius: 1,
            bgcolor: '#fff',
            border: '1px solid #dbe4ee',
          }}
        />
      )}
    </DialogContent>
  </Dialog>
);

export interface AttachmentPreviewLinkProps {
  title: string;
  fileName?: string;
  src?: string;
}

export const AttachmentPreviewLink: React.FC<AttachmentPreviewLinkProps> = ({ title, fileName, src }) => {
  const [open, setOpen] = useState(false);
  const label = fileName || (src ? '查看截图' : '-');

  if (!src) {
    return <Typography component="span" variant="body2">{label}</Typography>;
  }

  return (
    <>
      <Button
        size="small"
        variant="text"
        startIcon={<VisibilityOutlinedIcon fontSize="small" />}
        onClick={() => setOpen(true)}
        aria-label={`查看${title}：${label}`}
        sx={{ minWidth: 0, px: 0.5, textTransform: 'none', justifyContent: 'flex-start' }}
      >
        <Typography component="span" variant="body2" noWrap sx={{ maxWidth: 160 }}>
          {label}
        </Typography>
      </Button>
      <AttachmentPreviewDialog
        open={open}
        title={title}
        fileName={fileName}
        src={src}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

export default AttachmentPreviewLink;
