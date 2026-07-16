import React, { useState } from 'react';
import { Alert, Box, Button } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import type { BusinessAttachment } from '../../types/businessAttachment';
import { businessAttachmentApi } from '../../api/businessAttachmentApi';

const BusinessAttachmentLinks: React.FC<{
  attachments?: BusinessAttachment[];
  emptyText?: string;
}> = ({ attachments = [], emptyText = '-' }) => {
  const [error, setError] = useState('');
  if (!attachments.length) return <>{emptyText}</>;
  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
      {attachments.map((attachment) => (
        <Button
          key={attachment.id}
          size="small"
          variant="outlined"
          startIcon={<AttachFileIcon />}
          onClick={async () => {
            try {
              const blob = await businessAttachmentApi.fetchBlob(attachment.id);
              const url = URL.createObjectURL(blob);
              window.open(url, '_blank', 'noopener,noreferrer');
              window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
            } catch (readError) {
              setError(readError instanceof Error ? readError.message : '附件读取失败');
            }
          }}
          sx={{ maxWidth: 180 }}
        >
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</Box>
        </Button>
      ))}
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ width: '100%' }}>{error}</Alert>}
    </Box>
  );
};

export default BusinessAttachmentLinks;
