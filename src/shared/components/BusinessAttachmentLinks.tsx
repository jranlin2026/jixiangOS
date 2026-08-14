import React, { useState } from 'react';
import { Alert, Box, Button, IconButton, Tooltip } from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import DownloadIcon from '@mui/icons-material/Download';
import type { BusinessAttachment } from '../../types/businessAttachment';
import { businessAttachmentApi } from '../../api/businessAttachmentApi';

const BusinessAttachmentLinks: React.FC<{
  attachments?: BusinessAttachment[];
  emptyText?: string;
  showDownload?: boolean;
}> = ({ attachments = [], emptyText = '-', showDownload = false }) => {
  const [error, setError] = useState('');
  if (!attachments.length) return <>{emptyText}</>;
  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
      {attachments.map((attachment) => (
        <Box key={attachment.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <Button
            size="small"
            variant="outlined"
            startIcon={<AttachFileIcon />}
            aria-label={`查看附件 ${attachment.name}`}
            onClick={async () => {
              const previewWindow = window.open('', '_blank');
              if (!previewWindow) {
                setError('浏览器阻止了附件预览窗口，请允许弹出窗口后重试');
                return;
              }
              previewWindow.opener = null;
              try {
                const blob = await businessAttachmentApi.fetchBlob(attachment.id);
                const url = URL.createObjectURL(blob);
                previewWindow.location.href = url;
                window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
              } catch (readError) {
                previewWindow.close();
                setError(readError instanceof Error ? readError.message : '附件读取失败');
              }
            }}
            sx={{ maxWidth: 180 }}
          >
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</Box>
          </Button>
          {showDownload && (
            <Tooltip title="下载附件">
              <IconButton
                size="small"
                aria-label={`下载附件 ${attachment.name}`}
                onClick={async () => {
                  try {
                    const blob = await businessAttachmentApi.fetchBlob(attachment.id, true);
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = attachment.name;
                    anchor.click();
                    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                  } catch (downloadError) {
                    setError(downloadError instanceof Error ? downloadError.message : '附件下载失败');
                  }
                }}
              >
                <DownloadIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      ))}
      {error && <Alert severity="error" onClose={() => setError('')} sx={{ width: '100%' }}>{error}</Alert>}
    </Box>
  );
};

export default BusinessAttachmentLinks;
