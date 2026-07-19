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
  Radio,
  RadioGroup,
  FormControlLabel,
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
import { useNavigate } from 'react-router-dom';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import {
  createCustomerImportErrorWorkbook,
  createCustomerImportTemplateWorkbook,
  customerDataExchangeApi,
  parseCustomerImportWorkbook,
} from '../../api/customerDataExchangeApi';
import type {
  CustomerImportConfirmResult,
  CustomerImportDestination,
  CustomerImportPrecheckResult,
  CustomerImportRow,
  CustomerImportTemplateOptions,
} from '../../types/customerDataExchange';
import { ROUTES } from '../../shared/utils/constants';

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
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [options, setOptions] = useState<CustomerImportTemplateOptions | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CustomerImportRow[]>([]);
  const [precheck, setPrecheck] = useState<CustomerImportPrecheckResult | null>(null);
  const [result, setResult] = useState<CustomerImportConfirmResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [destination, setDestination] = useState<CustomerImportDestination>('assigned');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setOptions(null);
    setFile(null);
    setRows([]);
    setPrecheck(null);
    setResult(null);
    setError('');
    setDestination('assigned');
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
      const fileName = destination === 'public_pool' ? '极享OS公海客户批量导入模板.xlsx' : '极享OS客户批量导入模板.xlsx';
      downloadBuffer(fileName, await createCustomerImportTemplateWorkbook(options, destination));
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
      const response = await customerDataExchangeApi.precheckImport(rows, destination);
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
      const response = await customerDataExchangeApi.confirmImport(rows, destination, precheck.confirmationToken);
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

  const handleDestinationChange = (next: CustomerImportDestination) => {
    if (next === 'public_pool' && !options?.canImportToPublicPool) return;
    setDestination(next);
    setPrecheck(null);
    setResult(null);
    setError('');
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogCloseTitle onClose={() => { if (!busy) onClose(); }}>批量导入客户</DialogCloseTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            先选择导入去向，再下载或上传极享OS标准模板。系统预检通过后会直接写入对应位置，不需要二次转移。
          </Alert>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>导入去向</Typography>
            <RadioGroup
              row
              value={destination}
              onChange={(event) => handleDestinationChange(event.target.value as CustomerImportDestination)}
            >
              <FormControlLabel value="assigned" control={<Radio />} label="导入客户列表" disabled={busy || Boolean(result)} />
              <FormControlLabel value="public_pool" control={<Radio />} label="直接导入公海池" disabled={busy || Boolean(result) || !options?.canImportToPublicPool} />
            </RadioGroup>
            <Typography variant="body2" color="text.secondary">
              {destination === 'public_pool'
                ? '销售负责人和客户进展必须留空，系统将直接建立无销售归属的公海客户。'
                : '销售负责人留空时默认归属当前导入人；指定其他销售需要导入覆盖归属权限。'}
            </Typography>
            {options && !options.canImportToPublicPool ? (
              <Typography variant="caption" color="warning.main">当前账号没有“释放至公海”权限，不能直接导入公海池。</Typography>
            ) : null}
          </Paper>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {result ? (
            <Alert severity={result.failureCount ? 'warning' : 'success'}>
              导入完成：成功 {result.successCount} 条，失败 {result.failureCount} 条；已写入{destination === 'public_pool' ? '公海池' : '客户列表'}。
            </Alert>
          ) : precheck ? (
            <Alert severity={precheck.blockedCount ? 'warning' : 'success'}>
              预检完成：可导入 {precheck.readyCount} 条，阻止 {precheck.blockedCount} 条。确认后将写入{destination === 'public_pool' ? '公海池' : '客户列表'}。
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
        {result && destination === 'public_pool' ? (
          <Button variant="contained" onClick={() => { onClose(); navigate(`${ROUTES.CUSTOMERS}?tab=public_pool`); }}>查看公海池</Button>
        ) : null}
        {!precheck ? <Button variant="contained" onClick={() => void handlePrecheck()} disabled={!rows.length || busy}>开始预检</Button> : null}
        {precheck && !result ? <Button variant="contained" onClick={() => void handleConfirm()} disabled={!precheck.readyCount || busy}>确认导入 {precheck.readyCount} 条</Button> : null}
      </DialogActions>
    </Dialog>
  );
}
