import { useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { businessImportApi } from '../../api/businessImportApi';
import type {
  BusinessImportReviewAction,
  BusinessImportReviewResult,
  BusinessImportType,
} from '../../types/businessImport';
import {
  buildBusinessImportReviewRequest,
  createBusinessImportReviewSingleFlight,
  failedBusinessImportReviewSelection,
  selectAllImportedReviewBatch,
  type BusinessImportReviewSelection,
} from '../utils/businessImportReviewModel';
import DialogCloseTitle from './DialogCloseTitle';

type Props = {
  module: BusinessImportType;
  importBatchId: string;
  selection: BusinessImportReviewSelection;
  canReview: boolean;
  onSelectionChange: (selection: BusinessImportReviewSelection) => void;
  onRefresh: () => Promise<void> | void;
};

const actionCopy: Record<BusinessImportReviewAction, { button: string; title: string; reason: string }> = {
  approve: { button: '批量通过', title: '批量审核通过', reason: '' },
  return: { button: '批量退回', title: '批量退回修改', reason: '退回原因' },
  reject: { button: '批量驳回', title: '批量驳回终止', reason: '驳回原因' },
};

export default function BusinessImportReviewControls({
  module,
  importBatchId,
  selection,
  canReview,
  onSelectionChange,
  onRefresh,
}: Props) {
  const [action, setAction] = useState<BusinessImportReviewAction | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BusinessImportReviewResult | null>(null);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const submitTaskRef = useRef<() => Promise<void>>(async () => undefined);
  const submitOnceRef = useRef(createBusinessImportReviewSingleFlight(() => submitTaskRef.current()));
  const hasSelection = selection.mode === 'batch' ? Boolean(selection.importBatchId) : selection.ids.length > 0;
  const selectionLabel = selection.mode === 'batch'
    ? `已选择批次 ${selection.importBatchId} 的全部待审记录`
    : `已选择 ${selection.ids.length} 条导入记录`;

  const closeDialog = () => {
    if (submittingRef.current) return;
    setAction(null);
    setReason('');
    setError('');
  };

  submitTaskRef.current = async () => {
    if (!action || submittingRef.current) return;
    let request;
    try {
      request = buildBusinessImportReviewRequest(module, action, selection, reason);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '批量审核参数无效');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    try {
      const response = await businessImportApi.review(request);
      if (response.code !== 0 || !response.data) {
        setError(response.message || '批量审核失败');
        return;
      }
      setResult(response.data);
      onSelectionChange(failedBusinessImportReviewSelection(response.data));
      setAction(null);
      setReason('');
      await onRefresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '批量审核失败');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      <Stack spacing={1.25} sx={{ width: '100%' }}>
        {result ? (
          <Alert
            severity={result.failedCount ? 'warning' : 'success'}
            onClose={() => setResult(null)}
          >
            批量审核完成：成功 {result.successCount} 条，失败 {result.failedCount} 条。
            {result.results.filter((item) => !item.success).map((item) => (
              <Typography key={item.id} component="div" variant="caption">
                {item.id}：{item.message}
              </Typography>
            ))}
          </Alert>
        ) : null}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2" color="text.secondary">{selectionLabel}</Typography>
          <Button
            size="small"
            variant="text"
            disabled={!importBatchId || !canReview || submitting}
            onClick={() => onSelectionChange(selectAllImportedReviewBatch(importBatchId))}
          >
            选择当前导入批次全部待审记录
          </Button>
          <Button
            size="small"
            variant="text"
            disabled={!hasSelection || submitting}
            onClick={() => onSelectionChange({ mode: 'ids', ids: [] })}
          >
            清空选择
          </Button>
          {(['approve', 'return', 'reject'] as const).map((nextAction) => (
            <Button
              key={nextAction}
              size="small"
              variant={nextAction === 'approve' ? 'contained' : 'outlined'}
              color={nextAction === 'reject' ? 'error' : nextAction === 'return' ? 'warning' : 'primary'}
              disabled={!canReview || !hasSelection || submitting}
              onClick={() => {
                setAction(nextAction);
                setReason('');
                setError('');
              }}
            >
              {actionCopy[nextAction].button}
            </Button>
          ))}
        </Box>
      </Stack>

      <Dialog open={Boolean(action)} onClose={closeDialog} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={closeDialog}>{action ? actionCopy[action].title : ''}</DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity={action === 'approve' ? 'info' : action === 'return' ? 'warning' : 'error'}>
              {selectionLabel}。系统会逐条复用现有审核命令，失败记录会保留为可重试选择。
            </Alert>
            {action && action !== 'approve' ? (
              <TextField
                label={actionCopy[action].reason}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                multiline
                minRows={3}
                required
                error={Boolean(error && !reason.trim())}
                helperText={error && !reason.trim() ? error : ' '}
              />
            ) : null}
            {error && (action === 'approve' || reason.trim()) ? <Alert severity="error">{error}</Alert> : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDialog} disabled={submitting}>取消</Button>
          <Button
            variant="contained"
            color={action === 'reject' ? 'error' : action === 'return' ? 'warning' : 'primary'}
            disabled={submitting || !action || (action !== 'approve' && !reason.trim())}
            onClick={() => void submitOnceRef.current()}
          >
            {submitting ? '处理中…' : '确认提交'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
