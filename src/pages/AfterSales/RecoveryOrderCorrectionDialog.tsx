import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
  useMediaQuery,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import { useNavigate } from 'react-router-dom';
import { productApi, recoveryOrderApi, settingsApi } from '../../api';
import type {
  CommissionCorrectionPreview,
  CommissionPayoutCorrectionContext,
} from '../../types/commission';
import type { Product } from '../../types/product';
import type {
  RecoveryOrder,
  RecoveryOrderCorrectionInput,
  RecoveryOrderCorrectionPrecheck,
  RecoveryOrderInput,
} from '../../types/recoveryOrder';
import type { AfterSalesSourceConfig, User } from '../../types/settings';
import type { BusinessAttachment } from '../../types/businessAttachment';
import useAuthStore from '../../store/useAuthStore';
import { getRecoveryEvidenceAttachments } from '../../shared/utils/recoveryEvidence';
import { formatEmployeeNameWithPosition } from '../../shared/utils/formatters';
import { getProductLevelColor, OFFICIAL_PAYMENT_CHANNELS } from '../../shared/utils/constants';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import BusinessAttachmentPicker from '../../shared/components/BusinessAttachmentPicker';
import BusinessFormSection from '../../shared/components/BusinessFormSection';
import CommissionCorrectionImpactDialog from '../../shared/components/CommissionCorrectionImpactDialog';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

const shell = {
  ink: '#0f172a',
  line: '#dbe4ee',
  soft: '#f8fafc',
};

function toDateTimeInputValue(value: Date | string = new Date()): string {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return new Date(safeDate.getTime() - safeDate.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const emptyForm = {
  customerName: '',
  customerPhone: '',
  customerWechat: '',
  thirdPartyOrderNo: '',
  sourcePlatform: '',
  sourcePlatformId: '',
  sourcePlatformName: '',
  sourceShopId: '',
  sourceShopName: '',
  originalProduct: '',
  originalProductId: '',
  originalProductLevel: '',
  originalAmount: '',
  originalPaymentAt: '',
  recoveryAmount: '',
  recoveryAt: toDateTimeInputValue(),
  officialPaymentChannel: '',
  paymentOrderNo: '',
  recoveryAttachments: [] as BusinessAttachment[],
  recoveryUserId: '',
  assistUserId: '',
  remark: '',
};

type RecoveryCorrectionForm = typeof emptyForm;

export interface RecoveryOrderCorrectionSuccessMeta {
  requiredImpactPreview: boolean;
}

export interface RecoveryOrderCorrectionDialogProps {
  open: boolean;
  orderId: string | null;
  payoutContext?: CommissionPayoutCorrectionContext;
  onClose: () => void;
  onSuccess?: (
    order: RecoveryOrder,
    meta: RecoveryOrderCorrectionSuccessMeta,
  ) => void | Promise<void>;
}

type CorrectionBlocker = {
  order: RecoveryOrder;
  precheck: RecoveryOrderCorrectionPrecheck;
};

type ErrorDialogState = {
  title: string;
  text: string;
  closeEditor?: boolean;
};

const RecoveryOrderCorrectionDialog: React.FC<RecoveryOrderCorrectionDialogProps> = ({
  open,
  orderId,
  payoutContext,
  onClose,
  onSuccess,
}) => {
  const navigate = useNavigate();
  const mobileFullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const currentUser = useAuthStore((state) => state.currentUser);
  const [editingOrder, setEditingOrder] = useState<RecoveryOrder | null>(null);
  const [form, setForm] = useState<RecoveryCorrectionForm>(emptyForm);
  const [users, setUsers] = useState<User[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<AfterSalesSourceConfig[]>([]);
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionRequiresImpactPreview, setCorrectionRequiresImpactPreview] = useState(false);
  const [correctionPreview, setCorrectionPreview] = useState<CommissionCorrectionPreview | null>(null);
  const [pendingCorrectionInput, setPendingCorrectionInput] = useState<RecoveryOrderCorrectionInput | null>(null);
  const [correctionSubmitting, setCorrectionSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [correctionBlocker, setCorrectionBlocker] = useState<CorrectionBlocker | null>(null);
  const [errorDialog, setErrorDialog] = useState<ErrorDialogState | null>(null);

  const activeUsers = useMemo(
    () => users.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active'),
    [users],
  );
  const productOptions = useMemo(
    () => [...products].sort((left, right) => left.sortOrder - right.sortOrder),
    [products],
  );
  const platformOptions = useMemo(() => sourceConfigs
    .filter((item) => !item.parentId && (item.isActive || item.id === form.sourcePlatformId))
    .sort((left, right) => left.sortOrder - right.sortOrder), [form.sourcePlatformId, sourceConfigs]);
  const shopOptions = useMemo(() => sourceConfigs
    .filter((item) => item.parentId === form.sourcePlatformId && (item.isActive || item.id === form.sourceShopId))
    .sort((left, right) => left.sortOrder - right.sortOrder), [form.sourcePlatformId, form.sourceShopId, sourceConfigs]);

  const resetTransientState = () => {
    setCorrectionReason('');
    setCorrectionPreview(null);
    setPendingCorrectionInput(null);
    setSubmitAttempted(false);
    setCorrectionBlocker(null);
    setErrorDialog(null);
  };

  const showErrorDialog = (text: string, title = '操作失败', closeEditor = false) => {
    setErrorDialog({ title, text, closeEditor });
  };

  useEffect(() => {
    if (!open || !orderId) {
      setEditingOrder(null);
      setLoading(false);
      resetTransientState();
      return undefined;
    }
    let active = true;
    setLoading(true);
    setEditingOrder(null);
    resetTransientState();

    void (async () => {
      try {
        const [precheck, detail, usersResponse, productsResponse, sourcesResponse] = await Promise.all([
          recoveryOrderApi.precheckRecoveryOrderCorrection(orderId, payoutContext),
          recoveryOrderApi.fetchRecoveryOrderById(orderId, 'recoveryOrders'),
          settingsApi.fetchAssignableUsers(),
          productApi.getProducts(),
          settingsApi.fetchAfterSalesSourceConfigs(),
        ]);
        if (!active) return;
        if (detail.code !== 0 || !detail.data) {
          showErrorDialog(detail.message || '售后挽回订单详情加载失败', '无法打开更正', true);
          return;
        }
        if (precheck.code !== 0 || !precheck.data) {
          showErrorDialog(precheck.message || '售后挽回订单更正预检失败', '无法打开更正', true);
          return;
        }
        if (!precheck.data.allowed) {
          setCorrectionBlocker({ order: detail.data, precheck: precheck.data });
          return;
        }
        if (usersResponse.code !== 0 || productsResponse.code !== 0 || sourcesResponse.code !== 0) {
          showErrorDialog(
            usersResponse.message || productsResponse.message || sourcesResponse.message || '更正表单配置加载失败',
            '无法打开更正',
            true,
          );
          return;
        }
        const order = detail.data;
        setUsers(usersResponse.data);
        setProducts([...productsResponse.data].sort((left, right) => left.sortOrder - right.sortOrder));
        setSourceConfigs(sourcesResponse.data);
        setEditingOrder(order);
        setCorrectionRequiresImpactPreview(precheck.data.requiresImpactPreview);
        setForm({
          customerName: order.customerName || '',
          customerPhone: order.customerPhone || '',
          customerWechat: order.customerWechat || '',
          thirdPartyOrderNo: order.thirdPartyOrderNo || '',
          sourcePlatform: order.sourcePlatform || '',
          sourcePlatformId: order.sourcePlatformId || '',
          sourcePlatformName: order.sourcePlatformName || order.sourcePlatform || '',
          sourceShopId: order.sourceShopId || '',
          sourceShopName: order.sourceShopName || '',
          originalProduct: order.originalProduct || '',
          originalProductId: order.originalProductId || '',
          originalProductLevel: order.originalProductLevel || '',
          originalAmount: String(order.originalAmount || ''),
          originalPaymentAt: order.originalPaymentAt ? toDateTimeInputValue(order.originalPaymentAt) : '',
          recoveryAmount: String(order.recoveryAmount || ''),
          recoveryAt: toDateTimeInputValue(order.recoveryAt || order.createdAt),
          officialPaymentChannel: order.officialPaymentChannel || '',
          paymentOrderNo: order.paymentOrderNo || '',
          recoveryAttachments: getRecoveryEvidenceAttachments(order),
          recoveryUserId: order.recoveryUserId || '',
          assistUserId: order.assistUserId || '',
          remark: order.remark || '',
        });
      } catch (error) {
        if (!active) return;
        showErrorDialog(error instanceof Error ? error.message : '售后挽回订单更正加载失败', '无法打开更正', true);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [open, orderId, payoutContext?.commissionId, payoutContext?.payoutRecordId]);

  const handleProductChange = (productName: string) => {
    const product = productOptions.find((item) => item.name === productName);
    setForm((current) => ({
      ...current,
      originalProduct: product?.name || productName,
      originalProductId: product?.id || '',
      originalProductLevel: product?.level || '',
      originalAmount: product && !current.originalAmount ? String(product.price || '') : current.originalAmount,
    }));
  };

  const buildCorrectionInput = (): RecoveryOrderCorrectionInput | null => {
    if (!currentUser) {
      showErrorDialog('当前登录状态已失效，请重新登录', '无法提交');
      return null;
    }
    setSubmitAttempted(true);
    if (!correctionReason.trim()) {
      showErrorDialog('请填写更正原因', '无法提交');
      return null;
    }
    const missingContact = !form.customerPhone.trim() && !form.customerWechat.trim();
    if (
      !form.customerName.trim()
      || missingContact
      || !form.thirdPartyOrderNo.trim()
      || !form.originalProduct.trim()
      || Number(form.originalAmount) <= 0
      || Number(form.recoveryAmount) <= 0
      || !form.recoveryAt
      || !form.recoveryUserId
    ) {
      showErrorDialog('请完整填写客户联系方式、原订单信息和挽回信息', '无法提交');
      return null;
    }
    const recoveryUser = activeUsers.find((user) => user.id === form.recoveryUserId);
    if (!recoveryUser) {
      showErrorDialog('挽回人员不存在或已停用', '无法提交');
      return null;
    }
    const data: RecoveryOrderInput = {
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerWechat: form.customerWechat,
      thirdPartyOrderNo: form.thirdPartyOrderNo,
      sourcePlatform: form.sourcePlatform,
      sourcePlatformId: form.sourcePlatformId,
      sourcePlatformName: form.sourcePlatformName,
      sourceShopId: form.sourceShopId,
      sourceShopName: form.sourceShopName,
      originalProduct: form.originalProduct,
      originalProductId: form.originalProductId,
      originalProductLevel: form.originalProductLevel,
      originalAmount: Number(form.originalAmount) || 0,
      originalPaymentAt: form.originalPaymentAt ? new Date(form.originalPaymentAt).toISOString() : undefined,
      recoveryAmount: Number(form.recoveryAmount) || 0,
      recoveryAt: new Date(form.recoveryAt).toISOString(),
      officialPaymentChannel: form.officialPaymentChannel as RecoveryOrderInput['officialPaymentChannel'],
      paymentOrderNo: form.paymentOrderNo,
      paymentAt: editingOrder?.paymentAt || new Date(form.recoveryAt).toISOString(),
      recoveryAttachments: form.recoveryAttachments,
      recoveryUserId: recoveryUser.id,
      recoveryUserName: recoveryUser.name,
      assistUserId: form.assistUserId || undefined,
      remark: form.remark,
      createdBy: currentUser.id,
      createdByName: currentUser.name,
    };
    return { reason: correctionReason.trim(), data, payoutContext };
  };

  const completeCorrection = async (order: RecoveryOrder, requiredImpactPreview: boolean) => {
    await onSuccess?.(order, { requiredImpactPreview });
    onClose();
  };

  const handleSubmit = async () => {
    if (!editingOrder) return;
    const correctionInput = buildCorrectionInput();
    if (!correctionInput) return;
    setCorrectionSubmitting(true);
    try {
      const precheck = await recoveryOrderApi.precheckRecoveryOrderCorrection(editingOrder.id, payoutContext);
      if (precheck.code !== 0 || !precheck.data) {
        showErrorDialog(precheck.message || '售后挽回订单更正预检失败');
        return;
      }
      if (!precheck.data.allowed) {
        setCorrectionBlocker({ order: editingOrder, precheck: precheck.data });
        return;
      }
      setCorrectionRequiresImpactPreview(precheck.data.requiresImpactPreview);
      if (precheck.data.requiresImpactPreview) {
        const preview = await recoveryOrderApi.previewRecoveryOrderCorrection(editingOrder.id, correctionInput);
        if (preview.code !== 0 || !preview.data) {
          showErrorDialog(preview.message || '售后挽回订单更正影响预览生成失败');
          return;
        }
        setPendingCorrectionInput(correctionInput);
        setCorrectionPreview(preview.data);
        return;
      }
      const response = await recoveryOrderApi.correctRecoveryOrder(editingOrder.id, correctionInput);
      if (response.code !== 0 || !response.data) {
        showErrorDialog(response.message || '售后挽回订单更正失败');
        return;
      }
      await completeCorrection(response.data, false);
    } catch (error) {
      showErrorDialog(error instanceof Error ? error.message : '售后挽回订单更正失败');
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const handleConfirmImpact = async () => {
    if (!editingOrder || !pendingCorrectionInput || !correctionPreview) return;
    setCorrectionSubmitting(true);
    try {
      const response = await recoveryOrderApi.correctRecoveryOrder(editingOrder.id, {
        ...pendingCorrectionInput,
        expectedImpactHash: correctionPreview.impactHash,
      });
      if (response.code !== 0 || !response.data) {
        setCorrectionPreview(null);
        setPendingCorrectionInput(null);
        showErrorDialog(response.message || '售后挽回订单更正失败');
        return;
      }
      setCorrectionPreview(null);
      setPendingCorrectionInput(null);
      await completeCorrection(response.data, true);
    } catch (error) {
      setCorrectionPreview(null);
      setPendingCorrectionInput(null);
      showErrorDialog(error instanceof Error ? error.message : '售后挽回订单更正失败');
    } finally {
      setCorrectionSubmitting(false);
    }
  };

  const validateFullForm = submitAttempted;
  const customerErrorCount = validateFullForm
    ? Number(!form.customerName.trim()) + Number(!form.customerPhone.trim() && !form.customerWechat.trim())
    : 0;
  const originalOrderErrorCount = validateFullForm
    ? Number(!form.thirdPartyOrderNo.trim()) + Number(!form.originalProduct.trim()) + Number(Number(form.originalAmount) <= 0)
    : 0;
  const recoveryErrorCount = validateFullForm
    ? Number(Number(form.recoveryAmount) <= 0) + Number(!form.recoveryAt) + Number(!form.recoveryUserId)
    : 0;
  const recoveryFormTitle = correctionRequiresImpactPreview
    ? '售后挽回订单更正（影响预览）'
    : '售后挽回订单更正';
  const recoveryFormAction = correctionRequiresImpactPreview ? '查看更正影响' : '确认更正并回退分账';
  const closeErrorDialog = () => {
    const closeEditor = Boolean(errorDialog?.closeEditor);
    setErrorDialog(null);
    if (closeEditor) onClose();
  };
  const closeBlocker = () => {
    setCorrectionBlocker(null);
    onClose();
  };

  return (
    <>
      <Dialog open={open && loading} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>正在准备更正</DialogTitle>
        <DialogContent dividers>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <CircularProgress size={24} />
            <Typography variant="body2">正在加载最新售后挽回订单和更正规则…</Typography>
          </Stack>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open && Boolean(editingOrder) && !loading}
        onClose={correctionSubmitting ? undefined : onClose}
        maxWidth="md"
        fullWidth
        fullScreen={mobileFullScreen}
        PaperProps={{ sx: { maxHeight: { xs: '100dvh', sm: '94vh' }, bgcolor: '#f8fafc' } }}
      >
        <DialogCloseTitle onClose={onClose} closeDisabled={correctionSubmitting} sx={{ px: { xs: 2, sm: 3 }, py: 2.25, bgcolor: '#fff' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 850 }}>{recoveryFormTitle}</Typography>
            <Typography variant="body2" sx={{ mt: 0.35, color: '#64748b' }}>
              修正售后挽回资料并保留完整操作记录。
            </Typography>
          </Box>
        </DialogCloseTitle>
        <DialogContent sx={{ px: { xs: 1.5, sm: 3 }, py: 2.5, bgcolor: '#f8fafc' }}>
          <Box sx={{ pt: 1 }}>
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              {correctionRequiresImpactPreview ? (
                <Alert severity="warning">
                  本次为超级管理员更正。提交后会先预览本单及同月阶梯联动影响；已有发放单、提成人员、提成金额及实际发放时间永久保留。
                </Alert>
              ) : (
                <Alert severity="warning">更正会撤回未发放分账，并将该挽回单回退到财务“待处理”。</Alert>
              )}
              <TextField
                label="更正原因"
                value={correctionReason}
                onChange={(event) => setCorrectionReason(event.target.value)}
                required
                multiline
                minRows={2}
                placeholder="请说明录入错误、更正依据和需要调整的内容"
              />
            </Stack>

            <BusinessFormSection
              step={1}
              solidStep
              title="客户信息"
              summary={`${form.customerName || '待填写客户'} / ${form.customerPhone || form.customerWechat || '待填写联系方式'}`}
              errorCount={customerErrorCount}
            >
              <Alert severity="info" sx={{ gridColumn: '1 / -1' }}>
                请仅填写已掌握的客户信息。系统只在后台按手机号和微信进行身份识别。
              </Alert>
              <TextField label="客户姓名" value={form.customerName} onChange={(event) => setForm({ ...form, customerName: event.target.value })} required />
              <TextField label="客户手机号" value={form.customerPhone} onChange={(event) => setForm({ ...form, customerPhone: event.target.value })} />
              <TextField label="客户微信" value={form.customerWechat} onChange={(event) => setForm({ ...form, customerWechat: event.target.value })} />
            </BusinessFormSection>

            <BusinessFormSection
              step={2}
              solidStep
              title="原订单信息"
              summary={[form.sourcePlatformName || form.sourcePlatform, form.sourceShopName, form.originalProduct, form.thirdPartyOrderNo].filter(Boolean).join(' / ') || '待填写原订单'}
              errorCount={originalOrderErrorCount}
            >
              <TextField label="平台订单号" value={form.thirdPartyOrderNo} onChange={(event) => setForm({ ...form, thirdPartyOrderNo: event.target.value })} required />
              <TextField select label="来源平台" value={form.sourcePlatformId} onChange={(event) => {
                const platform = sourceConfigs.find((item) => item.id === event.target.value);
                setForm({ ...form, sourcePlatformId: platform?.id || '', sourcePlatformName: platform?.name || '', sourcePlatform: platform?.name || '', sourceShopId: '', sourceShopName: '' });
              }}>
                <MenuItem value="">未选择</MenuItem>
                {platformOptions.map((platform) => <MenuItem key={platform.id} value={platform.id}>{platform.name}{platform.isActive ? '' : '（已停用）'}</MenuItem>)}
              </TextField>
              <TextField select label="来源店铺" value={form.sourceShopId} onChange={(event) => {
                const shop = sourceConfigs.find((item) => item.id === event.target.value);
                setForm({ ...form, sourceShopId: shop?.id || '', sourceShopName: shop?.name || '' });
              }} disabled={!form.sourcePlatformId}>
                <MenuItem value="">未选择</MenuItem>
                {shopOptions.map((shop) => <MenuItem key={shop.id} value={shop.id}>{shop.name}{shop.isActive ? '' : '（已停用）'}</MenuItem>)}
              </TextField>
              <TextField select label="原购买产品" value={form.originalProduct} onChange={(event) => handleProductChange(event.target.value)} required>
                {productOptions.map((product) => (
                  <MenuItem key={product.id} value={product.name}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: getProductLevelColor(product.level) }} />
                      {product.name}
                    </Box>
                  </MenuItem>
                ))}
                {form.originalProduct && !productOptions.some((product) => product.name === form.originalProduct) ? (
                  <MenuItem value={form.originalProduct}>{form.originalProduct}</MenuItem>
                ) : null}
              </TextField>
              <TextField label="原付款金额" type="number" value={form.originalAmount} onChange={(event) => setForm({ ...form, originalAmount: event.target.value })} required inputProps={{ min: 0.01, step: 0.01 }} />
              <TextField label="原订单付款时间" type="datetime-local" value={form.originalPaymentAt} onChange={(event) => setForm({ ...form, originalPaymentAt: event.target.value })} InputLabelProps={{ shrink: true }} inputProps={{ step: 1, max: toDateTimeInputValue() }} />
            </BusinessFormSection>

            <BusinessFormSection
              step={3}
              solidStep
              title="挽回成交信息"
              summary={Number(form.recoveryAmount) > 0 ? `挽回 ¥${Number(form.recoveryAmount).toLocaleString('zh-CN')} / ${activeUsers.find((user) => user.id === form.recoveryUserId)?.name || '待选择人员'}` : '待填写挽回信息'}
              errorCount={recoveryErrorCount}
            >
              <TextField select label="官方收款渠道" value={form.officialPaymentChannel} onChange={(event) => setForm({ ...form, officialPaymentChannel: event.target.value })}>
                <MenuItem value="">未选择</MenuItem>
                {OFFICIAL_PAYMENT_CHANNELS.map((channel) => <MenuItem key={channel.value} value={channel.value}>{channel.label}</MenuItem>)}
              </TextField>
              <TextField label="挽回成交金额" type="number" value={form.recoveryAmount} onChange={(event) => setForm({ ...form, recoveryAmount: event.target.value })} required />
              <TextField label="挽回成交时间" type="datetime-local" value={form.recoveryAt} onChange={(event) => setForm({ ...form, recoveryAt: event.target.value })} required InputLabelProps={{ shrink: true }} inputProps={{ step: 1, max: toDateTimeInputValue() }} />
              <TextField label="挽回付款订单号" value={form.paymentOrderNo} onChange={(event) => setForm({ ...form, paymentOrderNo: event.target.value })} />
              <TextField select label="挽回人员" value={form.recoveryUserId} onChange={(event) => setForm({ ...form, recoveryUserId: event.target.value })} required>
                {activeUsers.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
              </TextField>
              <TextField select label="协助人员（选填）" value={form.assistUserId} onChange={(event) => setForm({ ...form, assistUserId: event.target.value })}>
                <MenuItem value="">无</MenuItem>
                {activeUsers.filter((user) => user.id !== form.recoveryUserId).map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
              </TextField>
              <Box sx={{ gridColumn: { md: '1 / -1' } }}>
                <BusinessAttachmentPicker
                  title="挽回凭证"
                  description="用于留存付款事实、成交确认和沟通过程，可多选、拖拽或直接粘贴。最多 8 张。"
                  value={form.recoveryAttachments}
                  onChange={(recoveryAttachments) => setForm((current) => ({ ...current, recoveryAttachments }))}
                  category="recovery-payment-proof"
                  draftKey={editingOrder?.id || `recovery-correction-${currentUser?.id || 'unknown'}`}
                  maxCount={8}
                />
              </Box>
              <TextField label="备注" value={form.remark} onChange={(event) => setForm({ ...form, remark: event.target.value })} multiline minRows={3} sx={{ gridColumn: { md: '1 / -1' } }} />
            </BusinessFormSection>
          </Box>
        </DialogContent>
        <DialogActions sx={{ position: 'sticky', bottom: 0, zIndex: 2, gap: { xs: 1, sm: 1.5 }, px: { xs: 2, sm: 3 }, py: 1.5, bgcolor: 'rgba(255, 255, 255, 0.98)', borderTop: '1px solid #dbe3ef', boxShadow: '0 -8px 24px rgba(15, 23, 42, 0.06)' }}>
          <Box sx={{ mr: 'auto', display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 3 }, minWidth: 0 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>原付款金额</Typography>
              <Typography sx={{ color: '#2563eb', fontSize: { xs: 17, sm: 22 }, lineHeight: 1.25, fontWeight: 850, whiteSpace: 'nowrap' }}>
                ¥{Number(form.originalAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </Typography>
            </Box>
            <Box sx={{ pl: { xs: 1.5, sm: 3 }, borderLeft: '1px solid #dbe3ef', minWidth: 0 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>挽回金额</Typography>
              <Typography sx={{ color: '#0f172a', fontSize: { xs: 15, sm: 16 }, lineHeight: 1.35, fontWeight: 750, whiteSpace: 'nowrap' }}>
                ¥{Number(form.recoveryAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
              </Typography>
            </Box>
          </Box>
          <Button onClick={onClose} disabled={correctionSubmitting}>取消</Button>
          <Button variant="contained" size="large" onClick={() => void handleSubmit()} disabled={correctionSubmitting || !correctionReason.trim()} sx={{ minWidth: { xs: 104, sm: 132 }, fontWeight: 800 }}>
            {recoveryFormAction}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(correctionBlocker)} onClose={closeBlocker} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={closeBlocker}>暂不能更正售后挽回订单</DialogCloseTitle>
        <DialogContent dividers>
          {correctionBlocker ? (
            <Stack spacing={1.5}>
              <Alert severity="warning">{correctionBlocker.precheck.message}</Alert>
              <Box sx={{ border: `1px solid ${shell.line}`, borderRadius: 1.5, p: 1.5, bgcolor: shell.soft }}>
                <Typography variant="body2">挽回订单：{correctionBlocker.order.recoveryNo}</Typography>
                <Typography variant="body2">当前分账状态：{correctionBlocker.precheck.settlementStatus}</Typography>
                <Typography variant="body2">关联提成：{correctionBlocker.precheck.commissionCount} 条</Typography>
                {correctionBlocker.precheck.commissionStatuses.length ? (
                  <Typography variant="body2">提成状态：{correctionBlocker.precheck.commissionStatuses.join('、')}</Typography>
                ) : null}
              </Box>
              {['payout_started', 'settlement_processing', 'unsupported_settlement_status'].includes(correctionBlocker.precheck.reasonCode || '') ? (
                <Alert severity="info">请先由财务人员处理或撤回相关分账，再返回售后挽回订单执行更正。</Alert>
              ) : null}
            </Stack>
          ) : null}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeBlocker}>关闭</Button>
          {correctionBlocker && hasPermission(currentUser, PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, 'write') ? (
            <Button
              variant="contained"
              onClick={() => {
                const recoveryNo = correctionBlocker.order.recoveryNo;
                setCorrectionBlocker(null);
                onClose();
                navigate(`/finance?tab=recovery-settlement&search=${encodeURIComponent(recoveryNo)}`);
              }}
            >
              前往财务处理
            </Button>
          ) : null}
        </DialogActions>
      </Dialog>

      <CommissionCorrectionImpactDialog
        open={Boolean(correctionPreview)}
        preview={correctionPreview}
        confirming={correctionSubmitting}
        onClose={() => {
          setCorrectionPreview(null);
          setPendingCorrectionInput(null);
        }}
        onConfirm={() => void handleConfirmImpact()}
      />

      <Dialog open={Boolean(errorDialog)} onClose={closeErrorDialog} maxWidth="xs" fullWidth>
        <DialogTitle>{errorDialog?.title || '操作失败'}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: shell.ink }}>{errorDialog?.text}</Typography>
        </DialogContent>
        <DialogActions><Button variant="contained" onClick={closeErrorDialog}>确定</Button></DialogActions>
      </Dialog>
    </>
  );
};

export default RecoveryOrderCorrectionDialog;
