import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
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
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import SourceOutlinedIcon from '@mui/icons-material/SourceOutlined';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import {
  createCustomerImportErrorWorkbook,
  createCustomerImportTemplateWorkbook,
  customerDataExchangeApi,
  parseCustomerImportWorkbook,
} from '../../api/customerDataExchangeApi';
import { CUSTOMER_IMPORT_MAX_ROWS } from '../../types/customerDataExchange';
import type {
  CustomerImportDestination,
  CustomerImportPrecheckResult,
  CustomerImportRow,
  CustomerImportTemplateOptions,
} from '../../types/customerDataExchange';
import type { CustomerBatchJobSummary } from '../../types/customerBatch';
import ProtectedFormDialog from '../../shared/components/ProtectedFormDialog';

type Props = {
  open: boolean;
  onClose: () => void;
  onQueued: (job: CustomerBatchJobSummary) => void;
};

function downloadBuffer(fileName: string, buffer: ArrayBuffer): void {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function CustomerImportDialog({ open, onClose, onQueued }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [options, setOptions] = useState<CustomerImportTemplateOptions | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<CustomerImportRow[]>([]);
  const [precheck, setPrecheck] = useState<CustomerImportPrecheckResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [syncMessage, setSyncMessage] = useState('');
  const [destination, setDestination] = useState<CustomerImportDestination>('assigned');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setOptions(null);
    setFile(null);
    setRows([]);
    setPrecheck(null);
    setError('');
    setSyncMessage('');
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

  const visibleRows = precheck?.rows || [];
  const suspectedDuplicateCount = precheck?.rows.filter((row) => row.status === 'ready' && row.reason.includes('客户名称')).length || 0;
  const handleDownloadTemplate = async () => {
    if (!options) return;
    setBusy(true);
    setError('');
    setSyncMessage('');
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
      onQueued(response.data);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '客户导入失败');
    } finally { setBusy(false); }
  };

  const handleSyncConfigs = async (kind: 'lead_sources' | 'tags') => {
    if (!precheck) return;
    setBusy(true);
    setError('');
    setSyncMessage('');
    try {
      const response = await customerDataExchangeApi.syncImportConfigs(rows, destination, precheck.confirmationToken, kind);
      if (response.code !== 0 || !response.data) throw new Error(response.message || '同步导入配置失败');
      const [optionResponse, precheckResponse] = await Promise.all([
        customerDataExchangeApi.templateOptions(),
        customerDataExchangeApi.precheckImport(rows, destination),
      ]);
      if (optionResponse.code === 0 && optionResponse.data) setOptions(optionResponse.data);
      if (precheckResponse.code !== 0 || !precheckResponse.data) throw new Error(precheckResponse.message || '同步后重新预检失败');
      setPrecheck(precheckResponse.data);
      const changed = response.data.createdCount + response.data.updatedCount;
      setSyncMessage(`${kind === 'lead_sources' ? '线索来源' : '客户标签'}同步完成：处理 ${changed} 项，已自动重新预检。`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '同步导入配置失败');
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
    setError('');
    setSyncMessage('');
  };

  const missingLeadSources = precheck?.missingLeadSources || [];
  const missingTagNames = precheck?.missingTagNames || [];

  return (
    <ProtectedFormDialog open={open} onClose={onClose} submitting={busy} resetKey={String(open)} maxWidth="lg" fullWidth>
      {({ requestClose }) => <>
      <DialogCloseTitle onClose={() => void requestClose()} closeDisabled={busy}>批量导入客户</DialogCloseTitle>
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
              <FormControlLabel value="assigned" control={<Radio />} label="导入客户列表" disabled={busy} />
              <FormControlLabel value="public_pool" control={<Radio />} label="直接导入公海池" disabled={busy || !options?.canImportToPublicPool} />
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
          {syncMessage ? <Alert severity="success">{syncMessage}</Alert> : null}
          {precheck ? (
            <Alert severity={precheck.blockedCount ? 'warning' : 'success'}>
              预检完成：可导入 {precheck.readyCount} 条，阻止 {precheck.blockedCount} 条
              {suspectedDuplicateCount ? `，其中 ${suspectedDuplicateCount} 条客户名称疑似重复（仅提醒）` : ''}。
              确认后将进入后台任务并写入{destination === 'public_pool' ? '公海池' : '客户列表'}。
            </Alert>
          ) : null}
          {precheck && (missingLeadSources.length || missingTagNames.length) ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>基础资料预同步</Typography>
                  <Typography variant="body2" color="text.secondary">
                    仅同步本次 Excel 中系统尚未配置的来源和标签；同步后系统会自动重新预检。
                  </Typography>
                </Box>
                {missingLeadSources.length ? (
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} justifyContent="space-between">
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      <Typography variant="body2" sx={{ fontWeight: 700, alignSelf: 'center' }}>缺失来源：</Typography>
                      {missingLeadSources.slice(0, 20).map((item) => <Chip key={item.label} size="small" label={item.label} color="warning" variant="outlined" />)}
                      {missingLeadSources.length > 20 ? <Chip size="small" label={`另有 ${missingLeadSources.length - 20} 项`} /> : null}
                    </Stack>
                    <Button
                      variant="outlined"
                      startIcon={<SourceOutlinedIcon />}
                      disabled={busy || !precheck.canSyncLeadSources}
                      onClick={() => void handleSyncConfigs('lead_sources')}
                    >
                      同步缺失来源
                    </Button>
                  </Stack>
                ) : null}
                {missingTagNames.length ? (
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} alignItems={{ md: 'center' }} justifyContent="space-between">
                    <Stack direction="row" spacing={0.75} useFlexGap flexWrap="wrap">
                      <Typography variant="body2" sx={{ fontWeight: 700, alignSelf: 'center' }}>缺失标签：</Typography>
                      {missingTagNames.slice(0, 20).map((name) => <Chip key={name} size="small" label={name} color="warning" variant="outlined" />)}
                      {missingTagNames.length > 20 ? <Chip size="small" label={`另有 ${missingTagNames.length - 20} 项`} /> : null}
                    </Stack>
                    <Button
                      variant="outlined"
                      startIcon={<LabelOutlinedIcon />}
                      disabled={busy || !precheck.canSyncTags}
                      onClick={() => void handleSyncConfigs('tags')}
                    >
                      同步缺失标签
                    </Button>
                  </Stack>
                ) : null}
                {(((missingLeadSources.length && !precheck.canSyncLeadSources)
                  || (missingTagNames.length && !precheck.canSyncTags))) ? (
                  <Alert severity="warning">当前账号缺少对应的系统设置权限，请联系系统管理员同步后重新预检。</Alert>
                ) : null}
              </Stack>
            </Paper>
          ) : null}
          <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8fafc' }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
              <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => void handleDownloadTemplate()} disabled={!options || busy}>
                下载标准模板
              </Button>
              <input ref={fileRef} hidden type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => void handleFile(event)} />
              <Button variant="outlined" startIcon={<UploadFileOutlinedIcon />} onClick={() => fileRef.current?.click()} disabled={busy}>
                {file ? '更换文件' : '选择文件'}
              </Button>
              <Typography variant="body2" color="text.secondary">
                {file ? `${file.name} · ${rows.length} 条客户` : `仅支持 .xlsx，单次最多 ${CUSTOMER_IMPORT_MAX_ROWS.toLocaleString('zh-CN')} 条`}
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
                        <Chip size="small" color={row.status === 'ready' ? (row.reason === '可导入' ? 'success' : 'warning') : 'error'} label={row.status === 'ready' ? (row.reason === '可导入' ? '可导入' : '疑似重复') : '已阻止'} />
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
        <Button onClick={() => void requestClose()} disabled={busy}>取消</Button>
        {!precheck ? <Button variant="contained" onClick={() => void handlePrecheck()} disabled={!rows.length || busy}>开始预检</Button> : null}
        {precheck ? <Button variant="contained" onClick={() => void handleConfirm()} disabled={!precheck.readyCount || busy}>确认并后台导入 {precheck.readyCount} 条</Button> : null}
      </DialogActions>
      </>}
    </ProtectedFormDialog>
  );
}
