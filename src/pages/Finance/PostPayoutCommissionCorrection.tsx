import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import type { CommissionPayoutCorrectionContext } from '../../types/commission';
import type { Order } from '../../types/order';
import type { RecoveryOrder } from '../../types/recoveryOrder';
import { orderApi, recoveryOrderApi } from '../../api';
import { formatCurrency } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import OrderForm from '../Orders/OrderForm';
import RecoveryOrderCorrectionDialog from '../AfterSales/RecoveryOrderCorrectionDialog';
import type { PostPayoutProcessingContext } from './postPayoutProcessing';

interface PostPayoutCommissionCorrectionProps {
  context: PostPayoutProcessingContext | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}

type SourceSummary = {
  customer: string;
  businessNo: string;
  businessStatus: string;
  settlementStatus: string;
};

const sourceTypeLabel = (context: PostPayoutProcessingContext) => (
  context.sourceType === 'after_sales_recovery' ? '售后挽回订单' : '正式订单'
);

const PostPayoutCommissionCorrection: React.FC<PostPayoutCommissionCorrectionProps> = ({
  context,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [precheckAllowed, setPrecheckAllowed] = useState(false);
  const [precheckMessage, setPrecheckMessage] = useState('');
  const [sourceSummary, setSourceSummary] = useState<SourceSummary | null>(null);
  const [formalOrder, setFormalOrder] = useState<Order | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const payoutContext = useMemo<CommissionPayoutCorrectionContext | undefined>(() => (
    context ? {
      payoutRecordId: context.payoutRecordId,
      commissionId: context.commissionId,
    } : undefined
  ), [context]);

  useEffect(() => {
    setEditorOpen(false);
    setFormalOrder(null);
    setSourceSummary(null);
    setPrecheckAllowed(false);
    setPrecheckMessage('');
    setError('');
    if (!context || !payoutContext) return undefined;

    let active = true;
    setLoading(true);
    void (async () => {
      try {
        if (context.sourceType === 'formal_order') {
          const [detail, precheck] = await Promise.all([
            orderApi.fetchOrderById(context.sourceId),
            orderApi.precheckOrderCorrection(context.sourceId, payoutContext),
          ]);
          if (!active) return;
          if (detail.code !== 0 || !detail.data) throw new Error(detail.message || '源订单资料加载失败');
          if (precheck.code !== 0 || !precheck.data) throw new Error(precheck.message || '发放后更正预检失败');
          setFormalOrder(detail.data);
          setSourceSummary({
            customer: detail.data.customerName,
            businessNo: detail.data.orderNo,
            businessStatus: detail.data.status,
            settlementStatus: precheck.data.commissionStatuses.join('、') || '无分账',
          });
          setPrecheckAllowed(precheck.data.allowed);
          setPrecheckMessage(precheck.data.message);
          return;
        }

        const [detail, precheck] = await Promise.all([
          recoveryOrderApi.fetchRecoveryOrderById(context.sourceId, 'recoveryOrders'),
          recoveryOrderApi.precheckRecoveryOrderCorrection(context.sourceId, payoutContext),
        ]);
        if (!active) return;
        if (detail.code !== 0 || !detail.data) throw new Error(detail.message || '源售后挽回订单加载失败');
        if (precheck.code !== 0 || !precheck.data) throw new Error(precheck.message || '发放后更正预检失败');
        const recovery = detail.data as RecoveryOrder;
        setSourceSummary({
          customer: recovery.customerName,
          businessNo: recovery.recoveryNo,
          businessStatus: recovery.status,
          settlementStatus: precheck.data.commissionStatuses.join('、') || precheck.data.settlementStatus,
        });
        setPrecheckAllowed(precheck.data.allowed);
        setPrecheckMessage(precheck.data.message);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : '发放后更正准备失败');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [context, payoutContext]);

  if (!context) return null;

  const handleSuccess = async () => {
    setEditorOpen(false);
    await onSuccess();
  };

  return (
    <>
      <Dialog open={!editorOpen} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={onClose} closeDisabled={loading}>发放后更正</DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="warning">
              本次操作不会改写原发放单、原发金额、原发人员和发放时间。业务资料更正后，系统只记录新的应得结果及补发、追回差额。
            </Alert>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 850, mb: 1.5 }}>所选历史发放提成</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                <Box><Typography variant="caption" color="text.secondary">发放单</Typography><Typography>{context.payoutNo}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">源业务单</Typography><Typography sx={{ overflowWrap: 'anywhere' }}>{context.sourceBusinessNo}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">员工 / 角色</Typography><Typography>{context.employee} / {context.role}</Typography></Box>
                <Box><Typography variant="caption" color="text.secondary">原发金额 / 归属</Typography><Typography sx={{ fontWeight: 800 }}>{formatCurrency(context.originalPaidAmount)} / {context.attributedPeriod}</Typography></Box>
              </Box>
            </Paper>

            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 850, mb: 1 }}>当前源业务状态</Typography>
              {loading ? (
                <Stack direction="row" spacing={1.25} alignItems="center" sx={{ py: 2 }}>
                  <CircularProgress size={20} />
                  <Typography color="text.secondary">正在核验历史发放与当前业务资料…</Typography>
                </Stack>
              ) : error ? (
                <Alert severity="error">{error}</Alert>
              ) : sourceSummary ? (
                <Stack spacing={1.25}>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                    <Chip size="small" color="primary" variant="outlined" label={sourceTypeLabel(context)} />
                    <Chip size="small" label={`业务：${sourceSummary.businessStatus}`} />
                    <Chip size="small" label={`当前分账：${sourceSummary.settlementStatus}`} />
                  </Stack>
                  <Typography>{sourceSummary.customer} · {sourceSummary.businessNo}</Typography>
                  {precheckMessage ? <Alert severity={precheckAllowed ? 'info' : 'warning'}>{precheckMessage}</Alert> : null}
                </Stack>
              ) : null}
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>取消</Button>
          <Button
            variant="contained"
            onClick={() => setEditorOpen(true)}
            disabled={loading || Boolean(error) || !precheckAllowed || !sourceSummary || (context.sourceType === 'formal_order' && !formalOrder)}
          >
            开始更正业务资料
          </Button>
        </DialogActions>
      </Dialog>

      {context.sourceType === 'formal_order' && formalOrder ? (
        <OrderForm
          open={editorOpen}
          order={formalOrder}
          initialMode="correction"
          payoutContext={payoutContext}
          onClose={() => setEditorOpen(false)}
          onSuccess={() => void handleSuccess()}
        />
      ) : null}

      {context.sourceType === 'after_sales_recovery' ? (
        <RecoveryOrderCorrectionDialog
          open={editorOpen}
          orderId={context.sourceId}
          payoutContext={payoutContext}
          onClose={() => setEditorOpen(false)}
          onSuccess={() => void handleSuccess()}
        />
      ) : null}
    </>
  );
};

export default PostPayoutCommissionCorrection;
