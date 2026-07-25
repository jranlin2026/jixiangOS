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
import { businessAttachmentApi } from '../../api/businessAttachmentApi';
import { businessImportAttachmentDraftId, uploadBusinessImportPackageImages } from '../../api/businessImportPackageUpload';
import { getBackendBaseUrl } from '../../api/backendClient';
import {
  BUSINESS_IMPORT_MAX_FILE_BYTES,
  BUSINESS_IMPORT_MAX_PACKAGE_BYTES,
  createBusinessImportErrorWorkbook,
  createBusinessImportTemplateWorkbook,
  downloadBusinessImportWorkbook,
  parseBusinessImportPackage,
  validateBusinessImportFile,
  type BusinessImportPackageImage,
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
import useAuthStore from '../../store/useAuthStore';
import {
  acceptQueuedBusinessImportJob,
  businessImportJobStorageKey,
  clearStoredBusinessImportJob,
  createBusinessImportSingleFlight,
  getBusinessImportConfirmDisabledReason,
  isTerminalBusinessImportJob,
  loadBusinessImportJobResult,
  readStoredBusinessImportJob,
  runBusinessImportJobPolling,
  type BusinessImportStorage,
  type StoredBusinessImportJob,
} from './businessImportDialogModel';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const PAGE_SIZE = 20;

export type BusinessImportDialogInitialState = {
  options?: BusinessImportTemplateOptions | null;
  file?: File | null;
  rows?: BusinessImportRow[];
  precheck?: BusinessImportPrecheckResult | null;
  job?: BusinessImportJobResult | null;
  error?: string;
  storageWarning?: string;
};

type Props = {
  open: boolean;
  type: BusinessImportType;
  onClose: () => void;
  onQueued?: (job: BusinessImportJobResult) => void;
  onCompleted?: (job: BusinessImportJobResult) => void;
  tenantId?: string;
  storage?: BusinessImportStorage;
  initialState?: BusinessImportDialogInitialState;
  disablePortal?: boolean;
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

function responseData<T>(response: { code: number; data: T; message: string }, fallback: string): T {
  if (response.code !== 0 || !response.data) throw new Error(response.message || fallback);
  return response.data;
}

export function isDefinitiveBusinessImportRejection(code: number): boolean {
  return code >= 400 && code < 500;
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

export default function BusinessImportDialog({
  open,
  type,
  onClose,
  onQueued,
  onCompleted,
  tenantId,
  storage,
  initialState,
  disablePortal = false,
}: Props) {
  const copy = moduleCopy[type];
  const currentUserId = useAuthStore((state) => state.currentUser?.id || '');
  const tenantScope = String(tenantId || (typeof window !== 'undefined' ? window.location.origin : getBackendBaseUrl())).trim();
  const storageKey = currentUserId && tenantScope
    ? businessImportJobStorageKey(type, { tenantId: tenantScope, userId: currentUserId })
    : '';
  let browserStorage: BusinessImportStorage | null = null;
  let browserStorageUnavailable = false;
  if (!storage && typeof window !== 'undefined') {
    try {
      browserStorage = window.localStorage;
    } catch {
      browserStorageUnavailable = true;
    }
  }
  const storageAdapter = storage || browserStorage;
  const storageDegradedWarning = browserStorageUnavailable
    ? '浏览器存储不可用；导入仍会在当前窗口继续，但关闭后无法恢复进度。'
    : '';
  const fileRef = useRef<HTMLInputElement | null>(null);
  const storedJobRef = useRef<StoredBusinessImportJob | null>(null);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  const onQueuedRef = useRef(onQueued);
  onQueuedRef.current = onQueued;
  const [options, setOptions] = useState<BusinessImportTemplateOptions | null>(initialState?.options || null);
  const [file, setFile] = useState<File | null>(initialState?.file || null);
  const [rows, setRows] = useState<BusinessImportRow[]>(initialState?.rows || []);
  const [packageImages, setPackageImages] = useState<BusinessImportPackageImage[]>([]);
  const [precheck, setPrecheck] = useState<BusinessImportPrecheckResult | null>(initialState?.precheck || null);
  const [job, setJob] = useState<BusinessImportJobResult | null>(initialState?.job || null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [prechecking, setPrechecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState(initialState?.error || '');
  const [storageWarning, setStorageWarning] = useState(initialState?.storageWarning || '');
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
    setPackageImages([]);
    setPrecheck(null);
    setError('');
    setStorageWarning('');
    setPage(0);
    const storedJob = storageAdapter && storageKey ? readStoredBusinessImportJob(storageAdapter, storageKey) : null;
    storedJobRef.current = storedJob;
    setJob(storedJob ? { id: storedJob.id, batchId: storedJob.batchId || '', type, status: 'queued', totalCount: 0 } : null);
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
  }, [open, type, copy.subject, storageAdapter, storageKey]);

  const jobId = job?.id || '';
  useEffect(() => {
    if (!open || !jobId) return;
    const controller = new AbortController();
    setPolling(true);
    void runBusinessImportJobPolling({
      load: (signal) => loadBusinessImportJobResult(
        (activeSignal) => businessImportApi.job(jobId, activeSignal),
        signal,
      ),
      signal: controller.signal,
      storage: storageAdapter || undefined,
      storageKey: storageKey || undefined,
      stored: storedJobRef.current,
      onUpdate: (next) => setJob(next),
      onCompleted: (terminal) => {
        storedJobRef.current = { id: terminal.id, batchId: terminal.batchId, completedNotified: true };
        onCompletedRef.current?.(terminal);
      },
      onUnavailable: () => {
        storedJobRef.current = null;
        setJob(null);
        setError('此前的导入任务已失效或无权访问，请重新选择文件导入。');
      },
    }).catch((caught) => {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : '读取导入任务进度失败');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setPolling(false);
    });
    return () => controller.abort();
  }, [open, jobId, storageAdapter, storageKey]);

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
        downloadBusinessImportWorkbook(copy.templateName, await createBusinessImportTemplateWorkbook(type, options!));
      } else {
        downloadBusinessImportWorkbook(
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
    let uploadedAttachmentIds: string[] = [];
    let confirmationMayHaveBeenAccepted = false;
    try {
      const draftId = await businessImportAttachmentDraftId(precheck.confirmationToken);
      const uploaded = await uploadBusinessImportPackageImages({
        type, rows, images: packageImages, draftId,
        upload: async (image, draftKey) => {
          const displayName = image.name.replace(/\\/gu, '/').split('/').pop() || image.name;
          const fileBytes = new Uint8Array(image.bytes.byteLength);
          fileBytes.set(image.bytes);
          const response = await businessAttachmentApi.upload(
            new File([fileBytes.buffer], displayName, { type: image.mimeType }),
            { draftKey, category: image.category },
          );
          return responseData(response, `图片 ${image.name} 上传失败`);
        },
        remove: (id) => businessAttachmentApi.remove(id),
      });
      uploadedAttachmentIds = uploaded.attachmentIds;
      confirmationMayHaveBeenAccepted = true;
      const confirmResponse = await businessImportApi.confirm(type, uploaded.rows, precheck.confirmationToken, file.name);
      if (confirmResponse.code !== 0 || !confirmResponse.data) {
        confirmationMayHaveBeenAccepted = !isDefinitiveBusinessImportRejection(confirmResponse.code);
        if (!confirmationMayHaveBeenAccepted) {
          await Promise.allSettled(uploadedAttachmentIds.map((id) => businessAttachmentApi.remove(id)));
          uploadedAttachmentIds = [];
        }
      }
      const queued = responseData(confirmResponse, `${copy.subject}导入任务提交失败`);
      setRows(uploaded.rows);
      if (!storageAdapter || !storageKey) {
        setJob(queued);
        setStorageWarning('任务已创建，但当前登录身份无法保存恢复标识；请保持当前窗口打开以查看进度。');
      } else {
        const warning = acceptQueuedBusinessImportJob({
          job: queued,
          storage: storageAdapter,
          storageKey,
          onJob: setJob,
        });
        storedJobRef.current = { id: queued.id, batchId: queued.batchId, completedNotified: false };
        setStorageWarning(warning);
      }
      onQueuedRef.current?.(queued);
      setPage(0);
    } catch (caught) {
      if (uploadedAttachmentIds.length && !confirmationMayHaveBeenAccepted) {
        await Promise.allSettled(uploadedAttachmentIds.map((id) => businessAttachmentApi.remove(id)));
      }
      const message = caught instanceof Error ? caught.message : `${copy.subject}导入任务提交失败`;
      setError(confirmationMayHaveBeenAccepted ? `${message}；服务器处理结果暂不确定，请勿重复提交并稍后刷新审核台确认` : message);
    } finally {
      setConfirming(false);
    }
  };

  const handleFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] || null;
    setFile(null);
    setRows([]);
    setPackageImages([]);
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
      const parsed = await parseBusinessImportPackage(type, selected.name, await selected.arrayBuffer());
      setFile(selected);
      setRows(parsed.rows);
      setPackageImages(parsed.images);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '读取 Excel 失败');
      event.target.value = '';
    } finally {
      setParsing(false);
    }
  };

  const resetCompletedJob = () => {
    if (storageAdapter && storageKey) clearStoredBusinessImportJob(storageAdapter, storageKey);
    storedJobRef.current = null;
    setJob(null);
    setFile(null);
    setRows([]);
    setPackageImages([]);
    setPrecheck(null);
    setError('');
    setStorageWarning('');
    setPage(0);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Dialog open={open} onClose={operationBusy ? undefined : onClose} maxWidth="lg" fullWidth disablePortal={disablePortal}>
      <DialogCloseTitle onClose={() => { if (!operationBusy) onClose(); }}>{copy.title}</DialogCloseTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            请使用极享OS标准模板。无图资料可直接上传 Excel；需导入图片时，请上传包含 Excel 和对应图片的 ZIP 导入包。
            {type === 'recovery_orders'
              ? '售后导入只在后台识别客户身份，不会返回客户库资料；未识别记录审核通过后会自动进入 CRM 待分配线索。'
              : null}
          </Alert>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {storageWarning || storageDegradedWarning
            ? <Alert severity="warning">{storageWarning || storageDegradedWarning}</Alert>
            : null}

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
                  accept={`.xlsx,.zip,${XLSX_MIME},application/zip,application/x-zip-compressed`}
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
                    ? `${file.name} · ${rows.length.toLocaleString('zh-CN')} 条${packageImages.length ? ` · ${packageImages.length.toLocaleString('zh-CN')} 张图片` : ''}`
                    : `支持 .xlsx（最大 ${BUSINESS_IMPORT_MAX_FILE_BYTES / 1024 / 1024} MB）或 .zip（最大 ${BUSINESS_IMPORT_MAX_PACKAGE_BYTES / 1024 / 1024} MB），最多 ${BUSINESS_IMPORT_MAX_ROWS.toLocaleString('zh-CN')} 条`}
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
                  {job.batchId ? (
                    <Typography variant="caption" color="text.secondary">导入批次：{job.batchId}</Typography>
                  ) : null}
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
