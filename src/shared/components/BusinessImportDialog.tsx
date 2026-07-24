import { useEffect, useMemo, useRef, useState } from 'react';
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
  Step,
  StepLabel,
  Stepper,
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
import { businessImportApi } from '../../api/businessImportApi';
import {
  BUSINESS_IMPORT_MAX_FILE_BYTES,
  createBusinessImportErrorWorkbook,
  createBusinessImportTemplateWorkbook,
  parseBusinessImportWorkbook,
  validateBusinessImportFile,
} from '../../api/businessImportWorkbook';
import {
  BUSINESS_IMPORT_MAX_ROWS,
  type BusinessImportJobResult,
  type BusinessImportJobRow,
  type BusinessImportPrecheckResult,
  type BusinessImportRow,
  type BusinessImportRowResult,
  type BusinessImportTemplateOptions,
  type BusinessImportType,
} from '../../types/businessImport';
import DialogCloseTitle from './DialogCloseTitle';
import TablePagination from './TablePagination';
import {
  createBusinessImportSingleFlight,
  getBusinessImportConfirmDisabledReason,
  isTerminalBusinessImportJob,
  pollBusinessImportJob,
} from './businessImportDialogModel';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PAGE_SIZE = 20;

type Props = {
  open: boolean;
  type: BusinessImportType;
  onClose: () => void;
  onCompleted?: (job: BusinessImportJobResult) => void;
};

const moduleCopy = {
  orders: {
    title: '批量导入订单',
    subject: '订单',
    templateName: '极享OS订单批量导入模板.xlsx',
  },
  recovery_orders: {
    title: '批量导入售后挽回订单',
    subject: '售后挽回订单',
    templateName: '极享OS售后挽回订单批量导入模板.xlsx',
  },
} as const;

function jobStorageKey(type: BusinessImportType): string {
  return `jixiangos_business_import_job_${type}`;
}

function downloadXlsx(fileName: string, buffer: ArrayBuffer): void {
  const url = URL.createObjectURL(new Blob([buffer], { type: XLSX_MIME }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function responseData<T>(response: { code: number; data: T; message: string }, fallback: string): T {
  if (response.code !== 0 || !response.data) throw new Error(response.message || fallback);
  return response.data;
}

function jobStatusLabel(status: BusinessImportJobResult['status']): string {
  return ({ queued: '排队中', running: '执行中', succeeded: '导入完成', partial_failed: '部分失败', failed: '导入失败' } as const)[status];
}

function resultStatus(result: BusinessImportRowResult | BusinessImportJobRow): {
  label: string;
  color: 'success' | 'warning' | 'error' | 'default';
  reason: string;
} {
  if ('executionStatus' in result && result.executionStatus === 'failed') {
    return { label: '失败', color: 'error', reason: result.errorMessage || result.reason || '导入执行失败' };
  }
  if ('executionStatus' in result && result.executionStatus === 'succeeded') {
    return { label: '已导入', color: 'success', reason: result.reason || '导入成功' };
  }
  if (result.status === 'blocked') return { label: '已阻止', color: 'error', reason: result.reason };
  if (result.status === 'warning') return { label: '警告', color: 'warning', reason: result.reason };
  return { label: '可导入', color: 'success', reason: result.reason };
}

export default function BusinessImportDialog({ open, type, onClose, onCompleted }: Props) {
  const copy = moduleCopy[type];
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [options, setOptions] = useState<BusinessImportTemplateOptions | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<BusinessImportRow[]>([]);
  const [precheck, setPrecheck] = useState<BusinessImportPrecheckResult | null>(null);
  const [job, setJob] = useState<BusinessImportJobResult | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [prechecking, setPrechecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);

  const precheckTaskRef = useRef<() => Promise<void>>(async () => undefined);
  const confirmTaskRef = useRef<() => Promise<void>>(async () => undefined);
  const downloadTaskRef = useRef<(kind: 'template' | 'errors') => Promise<void>>(async () => undefined);
  const precheckOnceRef = useRef(createBusinessImportSingleFlight(() => precheckTaskRef.current()));
  const confirmOnceRef = useRef(createBusinessImportSingleFlight(() => confirmTaskRef.current()));
  const downloadOnceRef = useRef(createBusinessImportSingleFlight((kind: 'template' | 'errors') => downloadTaskRef.current(kind)));

  useEffect(() => {
    if (!open) return;
    let active = true;
    setOptions(null);
    setFile(null);
    setRows([]);
    setPrecheck(null);
    setError('');
    setPage(0);
    const storedJobId = localStorage.getItem(jobStorageKey(type));
    setJob(storedJobId ? { id: storedJobId, type, status: 'queued', totalCount: 0 } : null);
    setLoadingOptions(true);
    businessImportApi.templateOptions(type).then((response) => {
      if (!active) return;
      setOptions(responseData(response, `读取${copy.subject}导入模板配置失败`));
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : `读取${copy.subject}导入模板配置失败`);
    }).finally(() => {
      if (active) setLoadingOptions(false);
    });
    return () => { active = false; };
  }, [open, type, copy.subject]);

  const jobId = job?.id || '';
  useEffect(() => {
    if (!open || !jobId) return;
    const controller = new AbortController();
    setPolling(true);
    void pollBusinessImportJob(async () => {
      const response = await businessImportApi.job(jobId);
      return responseData(response, '读取导入任务进度失败');
    }, {
      signal: controller.signal,
      onUpdate: (next) => setJob(next),
    }).then((terminal) => {
      setJob(terminal);
      onCompleted?.(terminal);
    }).catch((caught) => {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : '读取导入任务进度失败');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setPolling(false);
    });
    return () => controller.abort();
  }, [open, jobId, onCompleted]);

  const sourceByRow = useMemo(() => new Map(rows.map((row) => [row.rowNumber, row])), [rows]);
  const resultRows: Array<BusinessImportRowResult | BusinessImportJobRow> = job?.rows?.length ? job.rows : precheck?.rows || [];
  const visibleRows = resultRows.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const reportRows = resultRows.filter((result) => (
    result.status !== 'ready'
    || ('executionStatus' in result && result.executionStatus === 'failed')
    || ('errorMessage' in result && Boolean(result.errorMessage))
  ));
  const operationBusy = loadingOptions || parsing || prechecking || confirming || downloading;
  const confirmDisabledReason = getBusinessImportConfirmDisabledReason(precheck, confirming);
  const activeStep = job ? 4 : precheck ? 3 : rows.length ? 2 : 0;
  const completedCount = (job?.successCount || 0) + (job?.failedCount || 0);
  const progress = job?.totalCount ? Math.min(100, Math.round((completedCount / job.totalCount) * 100)) : 0;

  const rowCustomerName = (result: BusinessImportRowResult | BusinessImportJobRow): string => {
    const normalized = 'normalized' in result ? result.normalized : sourceByRow.get(result.rowNumber);
    return normalized?.customerName || '未填写';
  };

  downloadTaskRef.current = async (kind) => {
    if (kind === 'template' && !options) return;
    if (kind === 'errors' && !reportRows.length) return;
    setDownloading(true);
    setError('');
    try {
      if (kind === 'template') {
        downloadXlsx(copy.templateName, await createBusinessImportTemplateWorkbook(type, options!));
      } else {
        downloadXlsx(
          `${copy.subject}导入错误报告-${new Date().toISOString().slice(0, 10)}.xlsx`,
          await createBusinessImportErrorWorkbook(type, reportRows, rows),
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${kind === 'template' ? '模板' : '错误报告'}下载失败`);
    } finally {
      setDownloading(false);
    }
  };

  precheckTaskRef.current = async () => {
    if (!rows.length || precheck || job) return;
    setPrechecking(true);
    setError('');
    try {
      const next = responseData(await businessImportApi.precheck(type, rows), `${copy.subject}导入预检失败`);
      setPrecheck(next);
      setPage(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${copy.subject}导入预检失败`);
    } finally {
      setPrechecking(false);
    }
  };

  confirmTaskRef.current = async () => {
    const disabledReason = getBusinessImportConfirmDisabledReason(precheck);
    if (disabledReason || !precheck || !file || job) {
      if (disabledReason) setError(disabledReason);
      return;
    }
    setConfirming(true);
    setError('');
    try {
      const queued = responseData(
        await businessImportApi.confirm(type, rows, precheck.confirmationToken, file.name),
        `${copy.subject}导入任务提交失败`,
      );
      localStorage.setItem(jobStorageKey(type), queued.id);
      setJob(queued);
      setPage(0);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : `${copy.subject}导入任务提交失败`);
    } finally {
      setConfirming(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setFile(null);
    setRows([]);
    setPrecheck(null);
    setError('');
    setPage(0);
    if (!selected) return;
    try {
      validateBusinessImportFile(selected);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '文件不符合导入要求');
      event.target.value = '';
      return;
    }
    setParsing(true);
    try {
      const parsed = await parseBusinessImportWorkbook(type, await selected.arrayBuffer());
      setFile(selected);
      setRows(parsed);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '读取 Excel 失败');
      event.target.value = '';
    } finally {
      setParsing(false);
    }
  };

  const resetCompletedJob = () => {
    localStorage.removeItem(jobStorageKey(type));
    setJob(null);
    setFile(null);
    setRows([]);
    setPrecheck(null);
    setError('');
    setPage(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Dialog open={open} onClose={operationBusy ? undefined : onClose} maxWidth="lg" fullWidth>
      <DialogCloseTitle onClose={() => { if (!operationBusy) onClose(); }}>{copy.title}</DialogCloseTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            请使用极享OS标准模板。系统会先在本地严格校验，再进行服务端预检；警告行可导入，被阻止行必须修正。
          </Alert>
          {error ? <Alert severity="error">{error}</Alert> : null}

          <Stepper activeStep={activeStep} alternativeLabel>
            {['下载模板', '上传文件', '本地校验', '服务端预检', '后台导入'].map((label) => (
              <Step key={label}><StepLabel>{label}</StepLabel></Step>
            ))}
          </Stepper>

          {!job ? (
            <Paper variant="outlined" sx={{ p: 2, bgcolor: '#f8fafc' }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <Button
                  variant="outlined"
                  startIcon={<DownloadOutlinedIcon />}
                  onClick={() => void downloadOnceRef.current('template')}
                  disabled={!options || operationBusy}
                >
                  {downloading ? '正在生成…' : '下载标准模板'}
                </Button>
                <input
                  ref={fileRef}
                  hidden
                  type="file"
                  accept={`.xlsx,${XLSX_MIME}`}
                  onChange={(event) => void handleFile(event)}
                />
                <Button
                  variant="outlined"
                  startIcon={<UploadFileOutlinedIcon />}
                  onClick={() => fileRef.current?.click()}
                  disabled={operationBusy}
                >
                  {file ? '更换文件' : '选择文件'}
                </Button>
                <Typography variant="body2" color="text.secondary">
                  {file
                    ? `${file.name} · ${rows.length.toLocaleString('zh-CN')} 条`
                    : `仅支持 .xlsx，不超过 ${BUSINESS_IMPORT_MAX_FILE_BYTES / 1024 / 1024} MB，最多 ${BUSINESS_IMPORT_MAX_ROWS.toLocaleString('zh-CN')} 条`}
                </Typography>
              </Stack>
            </Paper>
          ) : null}

          {operationBusy || polling ? <LinearProgress /> : null}

          {precheck && !job ? (
            <Alert severity={precheck.blockedCount ? 'warning' : 'success'}>
              预检完成：可导入 {Math.max(0, precheck.readyCount - precheck.warningCount)} 条，
              警告 {precheck.warningCount} 条，被阻止 {precheck.blockedCount} 条。
              {precheck.blockedCount ? '请修正文件后重新上传预检。' : '确认后将创建持久后台任务。'}
            </Alert>
          ) : null}

          {job ? (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1.25}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Typography fontWeight={700}>后台导入任务</Typography>
                  <Chip
                    size="small"
                    color={job.status === 'succeeded' ? 'success' : job.status === 'partial_failed' ? 'warning' : job.status === 'failed' ? 'error' : 'primary'}
                    label={jobStatusLabel(job.status)}
                  />
                  <Typography variant="caption" color="text.secondary">{job.id}</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={isTerminalBusinessImportJob(job.status) ? 100 : progress} />
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Chip variant="outlined" label={`总数 ${job.totalCount}`} />
                  <Chip color="success" variant="outlined" label={`成功 ${job.successCount || 0}`} />
                  <Chip color="error" variant="outlined" label={`失败 ${job.failedCount || 0}`} />
                </Stack>
                {job.status === 'partial_failed' ? <Alert severity="warning">部分行导入失败，可下载错误报告修正后重新导入。</Alert> : null}
                {job.status === 'failed' ? <Alert severity="error">任务执行失败，请下载错误报告或稍后重试。</Alert> : null}
              </Stack>
            </Paper>
          ) : null}

          {resultRows.length ? (
            <Paper variant="outlined" sx={{ overflow: 'hidden' }}>
              <TableContainer sx={{ maxHeight: 360 }}>
                <Table stickyHeader size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell width={90}>Excel行</TableCell>
                      <TableCell width={180}>客户姓名</TableCell>
                      <TableCell width={110}>状态</TableCell>
                      <TableCell>结果说明</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleRows.map((result) => {
                      const status = resultStatus(result);
                      return (
                        <TableRow key={`${result.rowNumber}-${status.label}`}>
                          <TableCell>{result.rowNumber}</TableCell>
                          <TableCell>{rowCustomerName(result)}</TableCell>
                          <TableCell><Chip size="small" color={status.color} label={status.label} /></TableCell>
                          <TableCell>{status.reason}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              <TablePagination
                count={resultRows.length}
                page={page}
                rowsPerPage={PAGE_SIZE}
                rowsPerPageOptions={[PAGE_SIZE]}
                onPageChange={(_event, nextPage) => setPage(nextPage)}
                sx={{ borderTop: '1px solid #e5e7eb' }}
              />
            </Paper>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        {reportRows.length ? (
          <Button onClick={() => void downloadOnceRef.current('errors')} disabled={downloading}>
            {downloading ? '正在生成…' : '下载错误报告'}
          </Button>
        ) : null}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose} disabled={operationBusy}>关闭</Button>
        {!job && !precheck ? (
          <Button
            variant="contained"
            onClick={() => void precheckOnceRef.current()}
            disabled={!rows.length || operationBusy}
          >
            {prechecking ? '预检中…' : '开始预检'}
          </Button>
        ) : null}
        {!job && precheck ? (
          <Button
            variant="contained"
            onClick={() => void confirmOnceRef.current()}
            disabled={Boolean(confirmDisabledReason) || operationBusy}
          >
            {confirming ? '提交中…' : `确认并后台导入 ${precheck.readyCount} 条`}
          </Button>
        ) : null}
        {job && isTerminalBusinessImportJob(job.status) ? (
          <Button variant="contained" onClick={resetCompletedJob}>导入另一份文件</Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
