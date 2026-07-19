import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  LinearProgress,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshIcon from '@mui/icons-material/Refresh';
import { customerBatchApi } from '../../../api/customerBatchApi';
import type { CustomerBatchJobResultView, CustomerBatchJobStatus, CustomerBatchJobSummary } from '../../../types/customerBatch';
import { getCustomerBatchOperationLabel } from './CustomerBatchActionDialog';

const terminalStatuses = new Set<CustomerBatchJobStatus>(['cancelled', 'succeeded', 'partial_failed', 'failed']);
export const isTerminalCustomerBatchJobStatus = (status?: CustomerBatchJobStatus) => Boolean(status && terminalStatuses.has(status));

const statusLabel: Record<CustomerBatchJobStatus, string> = {
  queued: '排队中',
  running: '执行中',
  cancel_requested: '正在取消',
  cancelled: '已取消',
  succeeded: '已完成',
  partial_failed: '部分失败',
  failed: '执行失败',
};

const statusColor = (status: CustomerBatchJobStatus): 'default' | 'primary' | 'success' | 'warning' | 'error' => {
  if (status === 'succeeded') return 'success';
  if (status === 'partial_failed' || status === 'cancel_requested') return 'warning';
  if (status === 'failed') return 'error';
  if (status === 'running') return 'primary';
  return 'default';
};

type Props = {
  open: boolean;
  jobId: string | null;
  jobs: CustomerBatchJobSummary[];
  currentUserId?: string;
  canCancelAny: boolean;
  onSelectJob: (jobId: string) => void;
  onClose: () => void;
  onJobChanged?: () => void;
};

const CustomerBatchTaskDrawer: React.FC<Props> = ({
  open,
  jobId,
  jobs,
  currentUserId,
  canCancelAny,
  onSelectJob,
  onClose,
  onJobChanged,
}) => {
  const [result, setResult] = useState<CustomerBatchJobResultView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const resultRef = useRef<CustomerBatchJobResultView | null>(null);
  const activeJobIdRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!jobId) return;
    const requestedJobId = jobId;
    setLoading((current) => current || !resultRef.current);
    const response = await customerBatchApi.getResult(requestedJobId);
    if (activeJobIdRef.current !== requestedJobId) return;
    if (response.code === 0 && response.data) {
      const wasTerminal = isTerminalCustomerBatchJobStatus(resultRef.current?.job.status);
      resultRef.current = response.data;
      setResult(response.data);
      setError('');
      if (!wasTerminal && isTerminalCustomerBatchJobStatus(response.data.job.status)) onJobChanged?.();
    } else {
      setError(response.message || '任务加载失败');
    }
    setLoading(false);
  }, [jobId, onJobChanged]);

  useEffect(() => {
    if (!open || !jobId) return;
    activeJobIdRef.current = jobId;
    resultRef.current = null;
    setResult(null);
    setError('');
    void refresh();
  }, [open, jobId]);

  useEffect(() => {
    if (open) return;
    activeJobIdRef.current = null;
  }, [open]);

  useEffect(() => {
    if (!open || !jobId || isTerminalCustomerBatchJobStatus(result?.job.status)) return;
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [open, jobId, refresh, result?.job.status]);

  const progress = useMemo(() => {
    if (!result?.job.totalCount) return 0;
    const completed = result.job.successCount + result.job.failedCount + result.job.skippedCount + result.job.cancelledCount;
    return Math.min(100, Math.round((completed / result.job.totalCount) * 100));
  }, [result]);
  const canCancel = Boolean(result && !isTerminalCustomerBatchJobStatus(result.job.status)
    && result.job.status !== 'cancel_requested'
    && (result.job.actorId === currentUserId || canCancelAny));

  const cancel = async () => {
    if (!jobId || !canCancel) return;
    setLoading(true);
    const response = await customerBatchApi.cancel(jobId);
    if (response.code !== 0) setError(response.message || '取消任务失败');
    await refresh();
    setLoading(false);
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose} PaperProps={{ sx: { width: { xs: '100%', sm: 520 } } }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ px: 2.5, py: 2, borderBottom: '1px solid #e5e7eb' }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h6" sx={{ fontWeight: 800 }}>批量任务详情</Typography>
          {jobId && <Typography variant="caption" sx={{ color: '#64748b' }}>{jobId}</Typography>}
        </Box>
        <IconButton onClick={() => void refresh()} disabled={loading || !jobId} aria-label="刷新任务"><RefreshIcon /></IconButton>
        <IconButton onClick={onClose} aria-label="关闭任务抽屉"><CloseIcon /></IconButton>
      </Stack>
      <Box sx={{ p: 2.5, overflowY: 'auto' }}>
        {loading && !result && <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress size={28} /></Stack>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {result && (
          <Stack spacing={2}>
            {jobs.length > 1 && jobId && (
              <TextField
                select
                size="small"
                label="切换批量任务"
                value={jobId}
                onChange={(event) => onSelectJob(event.target.value)}
              >
                {jobs.map((job) => (
                  <MenuItem key={job.id} value={job.id}>
                    {getCustomerBatchOperationLabel(job.operation)} · {statusLabel[job.status]} · {new Date(job.createdAt).toLocaleString('zh-CN')}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{getCustomerBatchOperationLabel(result.job.operation)}</Typography>
              <Chip size="small" color={statusColor(result.job.status)} label={statusLabel[result.job.status]} />
            </Stack>
            <Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.75 }}>
                <Typography variant="body2" color="text.secondary">执行进度</Typography>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>{progress}%</Typography>
              </Stack>
              <LinearProgress variant="determinate" value={progress} sx={{ height: 8, borderRadius: 4 }} />
            </Box>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              <Chip label={`总数 ${result.job.totalCount}`} />
              <Chip color="success" variant="outlined" label={`成功 ${result.job.successCount}`} />
              <Chip color="error" variant="outlined" label={`失败 ${result.job.failedCount}`} />
              <Chip variant="outlined" label={`跳过 ${result.job.skippedCount}`} />
              <Chip variant="outlined" label={`取消 ${result.job.cancelledCount}`} />
            </Stack>
            {canCancel && <Button color="error" variant="outlined" onClick={() => void cancel()} disabled={loading}>取消未开始的客户操作</Button>}
            <Divider />
            <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>执行明细</Typography>
            {result.items.length === 0 ? (
              <Typography variant="body2" color="text.secondary">当前权限范围内暂无可查看明细。</Typography>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {result.items.map((item) => (
                  <Box key={item.id} sx={{ py: 1.25 }}>
                    <Stack direction="row" justifyContent="space-between" spacing={1}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>{item.targetKey.replace(/^customer:/, '客户 ')}</Typography>
                      <Chip size="small" variant="outlined" label={item.status} />
                    </Stack>
                    {item.errorMessage && <Typography variant="caption" color="error" display="block" sx={{ mt: 0.5 }}>{item.errorMessage}</Typography>}
                    {item.attemptCount > 1 && <Typography variant="caption" color="text.secondary">已尝试 {item.attemptCount} 次</Typography>}
                  </Box>
                ))}
              </Stack>
            )}
          </Stack>
        )}
      </Box>
    </Drawer>
  );
};

export default CustomerBatchTaskDrawer;
