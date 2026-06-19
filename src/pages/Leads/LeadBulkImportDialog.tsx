import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  LinearProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { leadBulkImportApi, type LeadBulkImportResult } from '../../api';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

const LABEL = {
  title: '\u6279\u91cf\u5165\u5e93',
  chooseFile: '\u9009\u62e9Excel\u6587\u4ef6',
  replaceFile: '\u66f4\u6362\u6587\u4ef6',
  import: '\u5f00\u59cb\u5bfc\u5165',
  importing: '\u5bfc\u5165\u4e2d...',
  close: '\u5173\u95ed',
  helper: '\u4ec5\u652f\u6301 .xlsx \u6587\u4ef6\uff0c\u5bfc\u5165\u524d\u8bf7\u6309\u6a21\u677f\u586b\u5199\u5b57\u6bb5\u3002',
  noFile: '\u8bf7\u5148\u9009\u62e9 .xlsx \u6587\u4ef6',
  invalidFile: '\u8bf7\u4e0a\u4f20 .xlsx \u6587\u4ef6',
  failed: '\u5bfc\u5165\u5931\u8d25\uff0c\u8bf7\u68c0\u67e5\u6587\u4ef6\u5185\u5bb9',
  summaryPrefix: '\u5bfc\u5165\u5b8c\u6210\uff1a',
  success: '\u6210\u529f',
  failure: '\u5931\u8d25',
  row: '\u884c\u53f7',
  name: '\u5ba2\u6237\u59d3\u540d',
  reason: '\u5931\u8d25\u539f\u56e0',
  emptyName: '\u672a\u586b\u5199',
  fileReady: '\u5df2\u9009\u62e9',
} as const;

interface LeadBulkImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImported?: () => void;
}

const LeadBulkImportDialog: React.FC<LeadBulkImportDialogProps> = ({ open, onClose, onImported }) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<LeadBulkImportResult | null>(null);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setResult(null);
      setError('');
      setImporting(false);
    }
  }, [open]);

  const failedRows = result?.rows.filter((row) => row.status === 'failed') || [];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setResult(null);
    setError('');
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith('.xlsx')) {
      setFile(null);
      setError(LABEL.invalidFile);
      event.target.value = '';
      return;
    }
    setFile(selected);
  };

  const handleImport = async () => {
    if (!file) {
      setError(LABEL.noFile);
      return;
    }

    setImporting(true);
    setError('');
    try {
      const buffer = await file.arrayBuffer();
      const res = await leadBulkImportApi.importWorkbook(buffer);
      setResult(res.data);
      onImported?.();
    } catch {
      setError(LABEL.failed);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => { if (!importing) onClose(); }} maxWidth="md" fullWidth>
      <DialogCloseTitle onClose={() => { if (!importing) onClose(); }}>{LABEL.title}</DialogCloseTitle>
      <DialogContent dividers>
        <Box sx={{ display: 'grid', gap: 2 }}>
          <Alert severity="info">{LABEL.helper}</Alert>
          {error && <Alert severity="error">{error}</Alert>}
          {result && (
            <Alert severity={result.failureCount ? 'warning' : 'success'}>
              {LABEL.summaryPrefix}{LABEL.success} {result.successCount} \u6761\uff0c
              {LABEL.failure} {result.failureCount} \u6761
            </Alert>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <input
              ref={fileInputRef}
              hidden
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
            />
            <Button
              variant="outlined"
              startIcon={<UploadFileIcon />}
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
            >
              {file ? LABEL.replaceFile : LABEL.chooseFile}
            </Button>
            {file && (
              <Typography variant="body2" sx={{ color: '#4b5563', minWidth: 0, overflowWrap: 'anywhere' }}>
                {LABEL.fileReady}\uff1a{file.name}
              </Typography>
            )}
          </Box>
          {importing && <LinearProgress />}
          {failedRows.length > 0 && (
            <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0', maxHeight: 320 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 96 }}>{LABEL.row}</TableCell>
                    <TableCell sx={{ width: 180 }}>{LABEL.name}</TableCell>
                    <TableCell>{LABEL.reason}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {failedRows.map((row) => (
                    <TableRow key={`${row.rowNumber}-${row.name}`}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.name || LABEL.emptyName}</TableCell>
                      <TableCell>{row.reason || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={importing}>{LABEL.close}</Button>
        <Button variant="contained" onClick={handleImport} disabled={!file || importing}>
          {importing ? LABEL.importing : LABEL.import}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LeadBulkImportDialog;
