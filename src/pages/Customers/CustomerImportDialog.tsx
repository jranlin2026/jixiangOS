import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  LinearProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import {
  createCustomerImportErrorWorkbook,
  createCustomerImportTemplateWorkbook,
  customerDataExchangeApi,
  parseCustomerImportWorkbook,
} from '../../api/customerDataExchangeApi';
import type {
  CustomerImportConfirmResult,
  CustomerImportPrecheckResult,
  CustomerImportRow,
  CustomerImportTemplateOptions,
} from '../../types/customerDataExchange';

type Props = {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
};

function downloadBuffer(fileName: string, buffer: ArrayBuffer): void {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function CustomerImportDialog({ open, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [options, setOptions] = useState<CustomerImportTemplateOptions | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CustomerImportRow[]>([]);
  const [precheck, setPrecheck] = useState<CustomerImportPrecheckResult | null>(null);
  const [result, setResult] = useState<CustomerImportConfirmResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setOptions(null);
    setFile(null);
    setRows([]);
    setPrecheck(null);
    setResult(null);
    setError('');
    customerDataExchangeApi.templateOptions().then((response) => {
      if (!active) return;
      if (response.code === 0 && response.data) setOptions(response.data);
      else setError(response.message || '读取客户导入模板配置失败');
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : '读取客户导入模板配置失败');
    });
    return () => { active = false; };
  }, [open]);

  const visibleRows = result?.rows || precheck?.rows || [];
  const handleDownloadTemplate = async () => {
    if (!options) return;
    setBusy(true);
    setError('');
    try {
      downloadBuffer('极享OS客户批量导入模板.xlsx', await createCustomerImportTemplateWorkbook(options));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '模板下载失败');
    } finally { setBusy(false); }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setFile(null);
    setRows([]);
    setPrecheck(null);
    setResult(null);
    setError('');
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.xlsx')) {
      setError('仅支持 .xlsx 文件');
      event.target.value = '';
      return;
    }
    setBusy(true);
    try {
      const parsed = await parseCustomerImportWorkbook(await selected.arrayBuffer());
      setFile(selected);
      setRows(parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '读取 Excel 失败');
      event.target.value = '';
    } finally { setBusy(false); }
  };

  const handlePrecheck = async () => {
    setBusy(true);
    setError('');
    try {
      const response = await customerDataExchangeApi.precheckImport(rows);
      if (response.code !== 0 || !response.data) throw new Error(response.message || '客户导入预检失败');
      setPrecheck(response.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '客户导入预检失败');
    } finally { setBusy(false); }
  };

  const handleConfirm = async () => {
    if (!precheck) return;
    setBusy(true);
    setError('');
    try {
      const response = await customerDataExchangeApi.confirmImport(rows, precheck.confirmationToken);
      if (response.code !== 0 || !response.data) throw new Error(response.message || '客户导入失败');
      setResult(response.data);
      onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '客户导入失败');
    } finally { setBusy(false); }
  };

  const downloadErrors = async () => {
    const failed = visibleRows.filter((row) => row.status === 'blocked' || row.status === 'failed');
    if (!failed.length) return;
    downloadBuffer(`客户导入错误报告-${new Date().toISOString().slice(0, 10)}.xlsx`, await createCustomerImportErrorWorkbook(failed, rows));
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogCloseTitle onClose={() => { if (!busy) onClose(); }}>批量导入客户</DialogCloseTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            请先下载极享OS标准模板。系统会校验手机号/微信重复、负责人范围、客户进度、等级、来源和标签，预检通过后才会写入客户库。
          </Alert>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {result ? (
            <Alert severity={result.failureCount ? 'warning' : 'success'}>
              导入完成：成功 {result.successCount} 条，失败 {result.failureCount} 条。
            </Alert>
          ) : precheck ? (
            <Alert severity={precheck.blockedCount ? 'warning' : 'success'}>
              预检完成：可导入 {precheck.readyCount} 条，阻止 {precheck.blockedCount} 条。确认后只写入可导入数据。
            </Alert>
          ) : null}
          <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8fafc' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
              <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => void handleDownloadTemplate()} disabled={!options || busy}>
                下载标准模板
              </Button>
              <input ref={fileRef} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void handleFile(event)} />
              <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => fileRef.current?.click()} disabled={busy || Boolean(result)}>
                {file ? '更换文件' : '选择文件'}
              </Button>
              <Typography variant="body2" color="text.secondary">
                {file ? `${file.name} · ${rows.length} 条客户` : '仅支持 .xlsx，单次最多 2,000 条'}
              </Typography>
            </Stack>
          </Paper>
          {busy ? <LinearProgress /> : null}
          {visibleRows.length ? (
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 380 }}>
              <Table stickyHeader size="small">
                <TableHead><TableRow><TableCell width={90}>Excel行</TableCell><TableCell width={180}>客户姓名</TableCell><TableCell width={110}>状态</TableCell><TableCell>结果说明</TableCell></TableRow></TableHead>
                <TableBody>
                  {visibleRows.map((row) => (
                    <TableRow key={`${row.rowNumber}-${row.name}`}>
                      <TableCell>{row.rowNumber}</TableCell>
                      <TableCell>{row.name || '未填写'}</TableCell>
                      <TableCell>
                        <Chip size="small" color={row.status === 'ready' || row.status === 'imported' ? 'success' : 'error'} label={row.status === 'ready' ? '可导入' : row.status === 'imported' ? '已导入' : '已阻止'} />
                      </TableCell>
                      <TableCell>{row.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        {visibleRows.some((row) => row.status === 'blocked' || row.status === 'failed') ? <Button onClick={() => void downloadErrors()}>下载错误报告</Button> : null}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={busy}>{result ? '完成' : '取消'}</Button>
        {!precheck ? <Button variant="contained" onClick={() => void handlePrecheck()} disabled={!rows.length || busy}>开始预检</Button> : null}
        {precheck && !result ? <Button variant="contained" onClick={() => void handleConfirm()} disabled={!precheck.readyCount || busy}>确认导入 {precheck.readyCount} 条</Button> : null}
      </DialogActions>
    </Dialog>
  );
}
