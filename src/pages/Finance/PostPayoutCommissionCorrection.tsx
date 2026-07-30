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
  FormControlLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type {
  CommissionManualEntitlementDraft,
  CommissionPayoutCorrectionContext,
  PostPayoutEntitlementStrategy,
} from '../../types/commission';
import type { Order, OrderCorrectionPrecheck } from '../../types/order';
import type { RecoveryOrder } from '../../types/recoveryOrder';
import type { User } from '../../types/settings';
import { orderApi, recoveryOrderApi, settingsApi } from '../../api';
import { formatCurrency, formatEmployeeNameWithPosition } from '../../shared/utils/formatters';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import { moduleTablePaperSx, moduleTableSx } from '../../shared/components/ModuleShell';
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
  const [formalPrecheck, setFormalPrecheck] = useState<OrderCorrectionPrecheck | null>(null);
  const [entitlementStrategy, setEntitlementStrategy] = useState<PostPayoutEntitlementStrategy | null>(null);
  const [manualEntitlements, setManualEntitlements] = useState<CommissionManualEntitlementDraft[]>([]);
  const [users, setUsers] = useState<User[]>([]);
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
    setFormalPrecheck(null);
    setEntitlementStrategy(null);
    setManualEntitlements([]);
    setUsers([]);
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
          const [detail, precheck, usersResponse] = await Promise.all([
            orderApi.fetchOrderById(context.sourceId),
            orderApi.precheckOrderCorrection(context.sourceId, payoutContext),
            settingsApi.fetchAssignableUsers(),
          ]);
          if (!active) return;
          if (detail.code !== 0 || !detail.data) throw new Error(detail.message || '源订单资料加载失败');
          if (precheck.code !== 0 || !precheck.data) throw new Error(precheck.message || '发放后更正预检失败');
          setFormalOrder(detail.data);
          setFormalPrecheck(precheck.data);
          const currentManualEntitlements = precheck.data.manualCommissions || [];
          setManualEntitlements(currentManualEntitlements);
          setEntitlementStrategy(currentManualEntitlements.length ? null : 'recalculate_rules');
          if (usersResponse.code === 0) setUsers(usersResponse.data || []);
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

  const updateManualEntitlement = (
    sourceCommissionId: string,
    patch: Partial<CommissionManualEntitlementDraft>,
  ) => {
    setManualEntitlements((current) => current.map((item) => (
      item.sourceCommissionId === sourceCommissionId ? { ...item, ...patch } : item
    )));
  };

  const changeManualOwner = (sourceCommissionId: string, ownerId: string) => {
    const selected = users.find((user) => user.id === ownerId);
    updateManualEntitlement(sourceCommissionId, {
      ownerId,
      owner: selected?.name || '',
      departmentId: selected?.departmentId,
    });
  };

  const hasManualCommissions = Boolean(formalPrecheck?.manualCommissions?.length);
  const manualDraftValid = manualEntitlements.every((item) => (
    Boolean(item.role.trim() && item.ownerId)
    && Number.isFinite(Number(item.performanceAmount))
    && Number(item.performanceAmount) >= 0
    && Number.isFinite(Number(item.commissionAmount))
    && Number(item.commissionAmount) >= 0
  ));
  const strategyReady = !hasManualCommissions || Boolean(entitlementStrategy)
    && (entitlementStrategy !== 'manual_correct' || manualDraftValid);

  return (
    <>
      <Dialog open={!editorOpen} onClose={loading ? undefined : onClose} maxWidth="lg" fullWidth>
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

            {context.sourceType === 'formal_order' && hasManualCommissions && !loading && !error ? (
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 850, mb: 1 }}>人工分账处理方式</Typography>
                <Alert severity="warning" sx={{ mb: 1.5 }}>
                  该提成包含人工调整，请选择本次更正如何处理原人工分账。
                </Alert>
                <RadioGroup
                  value={entitlementStrategy || ''}
                  onChange={(event) => setEntitlementStrategy(event.target.value as PostPayoutEntitlementStrategy)}
                >
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
                    {[
                      ['preserve_manual', '保留原提成结果', '只更正业务资料，原发人员、业绩口径和金额不变'],
                      ['recalculate_rules', '按系统规则重算', '取消原人工口径，按更正后资料和当前规则重算'],
                      ['manual_correct', '人工修正应得', '由超级管理员填写正确人员、业绩及应得金额'],
                    ].map(([value, label, description]) => (
                      <Paper key={value} variant="outlined" sx={{ p: 1.25, borderColor: entitlementStrategy === value ? 'primary.main' : 'divider' }}>
                        <FormControlLabel value={value} control={<Radio />} label={<Box><Typography fontWeight={800}>{label}</Typography><Typography variant="caption" color="text.secondary">{description}</Typography></Box>} />
                      </Paper>
                    ))}
                  </Box>
                </RadioGroup>

                {entitlementStrategy === 'manual_correct' ? (
                  <Box sx={{ mt: 1.5 }}>
                    <TableContainer component={Paper} elevation={0} sx={[moduleTablePaperSx, { display: { xs: 'none', md: 'block' }, overflowX: 'auto' }]}>
                      <Table size="small" sx={[moduleTableSx, { minWidth: 920 }]}>
                        <TableHead><TableRow><TableCell>角色</TableCell><TableCell>员工</TableCell><TableCell align="right">业绩金额</TableCell><TableCell align="right">更正后应得</TableCell><TableCell>说明</TableCell></TableRow></TableHead>
                        <TableBody>{manualEntitlements.map((item) => (
                          <TableRow key={item.sourceCommissionId}>
                            <TableCell><TextField size="small" value={item.role} onChange={(event) => updateManualEntitlement(item.sourceCommissionId, { role: event.target.value })} /></TableCell>
                            <TableCell><TextField select size="small" value={item.ownerId} onChange={(event) => changeManualOwner(item.sourceCommissionId, event.target.value)} sx={{ minWidth: 180 }}>
                              {!users.some((user) => user.id === item.ownerId) ? <MenuItem value={item.ownerId}>{item.owner}（历史员工）</MenuItem> : null}
                              {users.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
                            </TextField></TableCell>
                            <TableCell><TextField size="small" type="number" value={item.performanceAmount} onChange={(event) => updateManualEntitlement(item.sourceCommissionId, { performanceAmount: Number(event.target.value) })} inputProps={{ min: 0, step: 0.01 }} /></TableCell>
                            <TableCell><TextField size="small" type="number" value={item.commissionAmount} onChange={(event) => updateManualEntitlement(item.sourceCommissionId, { commissionAmount: Number(event.target.value) })} inputProps={{ min: 0, step: 0.01 }} /></TableCell>
                            <TableCell><TextField size="small" value={item.calculationNote || ''} onChange={(event) => updateManualEntitlement(item.sourceCommissionId, { calculationNote: event.target.value })} /></TableCell>
                          </TableRow>
                        ))}</TableBody>
                      </Table>
                    </TableContainer>
                    <Stack spacing={1} sx={{ display: { xs: 'flex', md: 'none' } }}>
                      {manualEntitlements.map((item) => (
                        <Paper key={item.sourceCommissionId} variant="outlined" sx={{ p: 1.5 }}>
                          <Stack spacing={1}>
                            <TextField label="角色" size="small" value={item.role} onChange={(event) => updateManualEntitlement(item.sourceCommissionId, { role: event.target.value })} />
                            <TextField select label="员工" size="small" value={item.ownerId} onChange={(event) => changeManualOwner(item.sourceCommissionId, event.target.value)}>
                              {!users.some((user) => user.id === item.ownerId) ? <MenuItem value={item.ownerId}>{item.owner}（历史员工）</MenuItem> : null}
                              {users.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
                            </TextField>
                            <TextField label="业绩金额" size="small" type="number" value={item.performanceAmount} onChange={(event) => updateManualEntitlement(item.sourceCommissionId, { performanceAmount: Number(event.target.value) })} />
                            <TextField label="更正后应得" size="small" type="number" value={item.commissionAmount} onChange={(event) => updateManualEntitlement(item.sourceCommissionId, { commissionAmount: Number(event.target.value) })} />
                            <TextField label="说明" size="small" value={item.calculationNote || ''} onChange={(event) => updateManualEntitlement(item.sourceCommissionId, { calculationNote: event.target.value })} />
                          </Stack>
                        </Paper>
                      ))}
                    </Stack>
                  </Box>
                ) : null}
              </Box>
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={loading}>取消</Button>
          <Button
            variant="contained"
            onClick={() => setEditorOpen(true)}
            disabled={loading || Boolean(error) || !precheckAllowed || !sourceSummary || !strategyReady || (context.sourceType === 'formal_order' && !formalOrder)}
          >
            开始更正
          </Button>
        </DialogActions>
      </Dialog>

      {context.sourceType === 'formal_order' && formalOrder ? (
        <OrderForm
          open={editorOpen}
          order={formalOrder}
          initialMode="correction"
          payoutContext={payoutContext}
          entitlementStrategy={entitlementStrategy || 'recalculate_rules'}
          manualEntitlements={manualEntitlements}
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
