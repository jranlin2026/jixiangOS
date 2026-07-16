import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import DownloadIcon from '@mui/icons-material/Download';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import type { BusinessAttachment, BusinessAttachmentCategory } from '../../types/businessAttachment';
import { businessAttachmentApi } from '../../api/businessAttachmentApi';
import { clipboardImageFiles, selectAttachments } from '../utils/attachmentSelection';

export interface BusinessAttachmentPickerProps {
  title: string;
  description: string;
  value: BusinessAttachment[];
  onChange: (attachments: BusinessAttachment[]) => void;
  category: BusinessAttachmentCategory;
  draftKey: string;
  maxCount?: number;
  imagesOnly?: boolean;
  disabled?: boolean;
  rejectWholeBatchOnOverflow?: boolean;
}

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;
const DOCUMENT_MIME_TYPES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const BusinessAttachmentPicker: React.FC<BusinessAttachmentPickerProps> = ({
  title,
  description,
  value,
  onChange,
  category,
  draftKey,
  maxCount = Number.MAX_SAFE_INTEGER,
  imagesOnly = true,
  disabled = false,
  rejectWholeBatchOnOverflow = false,
}) => {
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(value);
  const previewUrlsRef = useRef(previewUrls);
  valueRef.current = value;
  previewUrlsRef.current = previewUrls;

  const accept = useMemo(() => (imagesOnly ? ['image/'] : DOCUMENT_MIME_TYPES), [imagesOnly]);
  const inputAccept = imagesOnly ? 'image/*' : 'image/*,.pdf,.doc,.docx,.xls,.xlsx';

  useEffect(() => {
    let cancelled = false;
    const missingImages = value.filter((item) => item.mimeType.startsWith('image/') && !previewUrls[item.id]);
    Promise.all(missingImages.map(async (attachment) => {
      try {
        const blob = await businessAttachmentApi.fetchBlob(attachment.id);
        const url = URL.createObjectURL(blob);
        if (cancelled) URL.revokeObjectURL(url);
        else setPreviewUrls((current) => ({ ...current, [attachment.id]: url }));
      } catch {
        // File names remain usable even when a preview request fails.
      }
    }));
    return () => {
      cancelled = true;
    };
    // Existing URLs intentionally prevent duplicate authenticated reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => () => {
    Object.values(previewUrlsRef.current).forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const addFiles = async (incoming: File[]) => {
    if (disabled || !incoming.length) return;
    const existing = new Set(valueRef.current.map((item) => `${item.name}:${item.size}`));
    const uniqueIncoming = incoming.filter((file) => !existing.has(`${file.name}:${file.size}`));
    const duplicateCount = incoming.length - uniqueIncoming.length;
    const remaining = Math.max(0, maxCount - valueRef.current.length);
    const selection = selectAttachments([], uniqueIncoming, {
      maxCount: remaining,
      maxBytes: imagesOnly ? IMAGE_MAX_BYTES : DOCUMENT_MAX_BYTES,
      accept,
      rejectWholeBatchOnOverflow,
    });
    if (rejectWholeBatchOnOverflow && uniqueIncoming.length > remaining) {
      setMessage(`最多上传 ${maxCount} 张，当前已有 ${valueRef.current.length} 张，本次未加入`);
      return;
    }
    setMessage([
      duplicateCount ? `${duplicateCount} 个重复文件已忽略` : '',
      selection.message,
    ].filter(Boolean).join('；'));
    if (!selection.accepted.length) return;

    setUploading(true);
    let next = [...valueRef.current];
    const failures: string[] = [];
    for (const file of selection.accepted) {
      const response = await businessAttachmentApi.upload(file, { draftKey, category });
      if (response.code === 0 && response.data) {
        next = [...next, response.data];
        if (file.type.startsWith('image/')) {
          setPreviewUrls((current) => ({ ...current, [response.data.id]: URL.createObjectURL(file) }));
        }
        onChange(next);
      } else {
        failures.push(`${file.name}：${response.message || '上传失败'}`);
      }
    }
    setUploading(false);
    if (failures.length) setMessage(failures.join('；'));
  };

  const removeAttachment = async (attachment: BusinessAttachment) => {
    if (disabled) return;
    const response = await businessAttachmentApi.remove(attachment.id);
    if (response.code !== 0) {
      setMessage(response.message || '附件删除失败');
      return;
    }
    const previewUrl = previewUrls[attachment.id];
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrls((current) => {
      const next = { ...current };
      delete next[attachment.id];
      return next;
    });
    onChange(valueRef.current.filter((item) => item.id !== attachment.id));
  };

  const downloadAttachment = async (attachment: BusinessAttachment) => {
    try {
      downloadBlob(await businessAttachmentApi.fetchBlob(attachment.id, true), attachment.name);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '附件下载失败');
    }
  };

  return (
    <Box
      tabIndex={disabled ? -1 : 0}
      onPaste={(event) => {
        const files = clipboardImageFiles(event.clipboardData);
        if (!files.length) return;
        event.preventDefault();
        void addFiles(files);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void addFiles(Array.from(event.dataTransfer.files || []));
      }}
      sx={{
        border: '1px dashed #93c5fd',
        bgcolor: '#f8fbff',
        borderRadius: 1.5,
        p: 1.5,
        outline: 'none',
        '&:focus': { borderColor: '#2563eb', boxShadow: '0 0 0 2px rgba(37,99,235,.12)' },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{title}</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.25 }}>
            {description} {Number.isFinite(maxCount) ? `最多 ${maxCount} 张。` : ''}
          </Typography>
          <Typography variant="caption" sx={{ color: '#2563eb', display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
            <ContentPasteIcon sx={{ fontSize: 15 }} /> 点击此区域后可直接粘贴截图
          </Typography>
        </Box>
        <Button
          variant="outlined"
          size="small"
          startIcon={uploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading || value.length >= maxCount}
        >
          {uploading ? '上传中' : '选择文件'}
        </Button>
        <input
          ref={inputRef}
          hidden
          type="file"
          accept={inputAccept}
          multiple={maxCount > 1}
          onChange={(event) => {
            void addFiles(Array.from(event.target.files || []));
            event.target.value = '';
          }}
        />
      </Box>

      {!!value.length && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
          {value.map((attachment) => (
            <Box key={attachment.id} sx={{ width: 112, border: '1px solid #dbeafe', borderRadius: 1, bgcolor: '#fff', p: 0.75 }}>
              {previewUrls[attachment.id] ? (
                <Box component="img" src={previewUrls[attachment.id]} alt={attachment.name} sx={{ width: '100%', height: 68, objectFit: 'cover', borderRadius: 0.75 }} />
              ) : (
                <Box sx={{ height: 68, display: 'grid', placeItems: 'center', bgcolor: '#eff6ff', borderRadius: 0.75, color: '#2563eb' }}>
                  <UploadFileIcon />
                </Box>
              )}
              <Tooltip title={attachment.name}>
                <Typography variant="caption" noWrap sx={{ display: 'block', mt: 0.5 }}>{attachment.name}</Typography>
              </Tooltip>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Tooltip title="下载"><IconButton size="small" onClick={() => void downloadAttachment(attachment)}><DownloadIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>
                {!disabled && <Tooltip title="删除"><IconButton size="small" color="error" onClick={() => void removeAttachment(attachment)}><CloseIcon sx={{ fontSize: 16 }} /></IconButton></Tooltip>}
              </Box>
            </Box>
          ))}
        </Box>
      )}
      {message && <Alert severity="warning" onClose={() => setMessage('')} sx={{ mt: 1.25 }}>{message}</Alert>}
    </Box>
  );
};

export default BusinessAttachmentPicker;
