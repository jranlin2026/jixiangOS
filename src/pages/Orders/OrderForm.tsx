import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Box, Typography,
} from '@mui/material';
import useOrderStore from '../../store/useOrderStore';
import {
  COMMISSION_SCENES,
  OFFICIAL_PAYMENT_CHANNELS,
  ORDER_STATUS,
  ORDER_TYPES,
  PAYMENT_METHODS,
  PROOF_STATUSES,
  RESOURCE_OWNERSHIPS,
} from '../../shared/utils/constants';
import { customerApi, productApi } from '../../api';
import type { ProductLevel } from '../../types/common';
import type { OrderType, PaymentMethod } from '../../types/common';
import type { CommissionRole, CommissionScene, OfficialPaymentChannel, ProofStatus, ResourceOwnership } from '../../types/commission';
import type { Customer } from '../../types/customer';
import type { Product, ProductLevelConfig } from '../../types/product';
import type { Order } from '../../types/order';

interface OrderFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  order?: Order | null;
}

function toDateInputValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function normalizeRecognizedDate(text: string): string | null {
  const dashed = text.match(/(20\d{2})[-_.年\/]?(\d{1,2})[-_.月\/]?(\d{1,2})/);
  if (dashed) {
    const [, year, month, day] = dashed;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const compact = text.match(/\b(20\d{2})(\d{2})(\d{2})\b/);
  if (compact) {
    const [, year, month, day] = compact;
    return `${year}-${month}-${day}`;
  }

  return null;
}

function recognizePaymentProof(rawText: string, fallbackAmount: number) {
  const text = decodeURIComponent(rawText).replace(/\.[^.]+$/, '');
  const paidDate = normalizeRecognizedDate(text) || toDateInputValue(new Date());
  const amountByLabel = text.match(/(?:金额|实付|付款|收款|支付|amount|amt|￥|¥)[^\d]*(\d{1,7}(?:\.\d{1,2})?)/i);
  const amountCandidates = Array.from(text.matchAll(/(?:^|[^\d])(\d{2,7}(?:\.\d{1,2})?)(?:元|rmb|RMB|[^\d]|$)/g))
    .map((match) => Number(match[1]))
    .filter((num) => Number.isFinite(num) && num > 0 && num !== 2026);
  const amount = Number(amountByLabel?.[1]) || amountCandidates[0] || fallbackAmount;
  const orderNoByLabel = text.match(/(?:流水号|交易号|订单号|支付单号|pay|trade|txn|no)[-_:：\s]*([A-Za-z0-9-]{6,40})/i);
  const orderNoByPrefix = text.match(/\b(?:PAY|TXN|TRADE|ORD)[-_]?[A-Za-z0-9-]{6,40}\b/i);
  const longNumber = text.match(/\b\d{10,32}\b/);

  return {
    paidDate,
    amount,
    paymentOrderNo: orderNoByLabel?.[1] || orderNoByPrefix?.[0] || longNumber?.[0] || `PAY-${Date.now()}`,
  };
}

const OrderForm: React.FC<OrderFormProps> = ({ open, onClose, onSuccess, order }) => {
  const { create, update } = useOrderStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [productLevelConfigs, setProductLevelConfigs] = useState<ProductLevelConfig[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [voucherName, setVoucherName] = useState('');
  const [voucherPreview, setVoucherPreview] = useState('');
  const [recognitionMessage, setRecognitionMessage] = useState('');
  const [recognizing, setRecognizing] = useState(false);

  const [form, setForm] = useState({
    customerName: '',
    productLevel: '899' as ProductLevel,
    orderType: '899成交' as OrderType,
    amount: 899,
    actualAmount: 899,
    paymentMethod: '银行转账' as PaymentMethod,
    officialPaymentChannel: '对公银行转账' as OfficialPaymentChannel,
    resourceOwnership: '公司资源' as ResourceOwnership,
    isExternalTalentOrder: false,
    dealScene: '899成交' as CommissionScene,
    proofStatus: '无需凭证' as ProofStatus,
    collaboratorName: '',
    collaboratorRole: '客户成功' as CommissionRole,
    collaboratorRatio: 0,
    originalOrderId: '',
    performanceBaseAmount: 0,
    sourceType: '自拓',
    owner: '张伟',
    notes: '',
    status: '待确认' as Order['status'],
    refundStatus: '无' as Order['refundStatus'],
    customerId: '',
    paymentDate: toDateInputValue(new Date()),
    paymentOrderNo: '',
  });

  useEffect(() => {
    if (!open) return;

    if (!order) {
      setVoucherName('');
      setVoucherPreview('');
      setRecognitionMessage('');
      return;
    }

    const primaryPayment = order.payments?.[0];
    setVoucherName(primaryPayment?.voucherName || '');
    setVoucherPreview(primaryPayment?.voucherPreview || '');
    setRecognitionMessage('');
    setForm((prev) => ({
      ...prev,
      customerName: order.customerName,
      customerId: order.customerId || '',
      productLevel: order.productLevel,
      orderType: order.orderType,
      amount: order.amount,
      actualAmount: order.actualAmount,
      paymentMethod: order.paymentMethod,
      officialPaymentChannel: order.officialPaymentChannel || prev.officialPaymentChannel,
      resourceOwnership: order.resourceOwnership || prev.resourceOwnership,
      isExternalTalentOrder: Boolean(order.isExternalTalentOrder),
      dealScene: order.dealScene || prev.dealScene,
      proofStatus: order.proofStatus || prev.proofStatus,
      collaboratorName: order.collaboratorName || '',
      collaboratorRole: order.collaboratorRole || prev.collaboratorRole,
      collaboratorRatio: order.collaboratorRatio || 0,
      originalOrderId: order.originalOrderId || '',
      performanceBaseAmount: order.performanceBaseAmount || order.actualAmount || order.amount,
      sourceType: order.sourceType || prev.sourceType,
      owner: order.owner,
      notes: order.notes || '',
      status: order.status,
      refundStatus: order.refundStatus,
      paymentDate: toDateInputValue(new Date(primaryPayment?.paidAt || order.createdAt)),
      paymentOrderNo: primaryPayment?.paymentOrderNo || '',
    }));
  }, [open, order]);

  useEffect(() => {
    if (!open) return;
    const loadProducts = async () => {
      const [productRes, levelRes, customerRes] = await Promise.all([
        productApi.getProducts(),
        productApi.getProductLevelConfigs(),
        customerApi.fetchCustomers({ pageSize: 1000 }),
      ]);
      const productItems = productRes.code === 0 ? productRes.data : [];
      const activeLevels = levelRes.code === 0 ? levelRes.data.filter((level) => level.isActive) : [];
      if (productRes.code === 0) setProducts(productItems);
      if (levelRes.code === 0) setProductLevelConfigs(activeLevels);
      if (customerRes.code === 0) setCustomers(customerRes.data.items);
      setForm((prev) => {
        const currentExists = activeLevels.some((level) => level.name === prev.productLevel);
        const nextLevel = currentExists ? prev.productLevel : activeLevels[0]?.name || productItems[0]?.level || prev.productLevel;
        const nextAmount = productItems.find((product) => product.level === nextLevel)?.price || prev.amount;
        return currentExists ? prev : {
          ...prev,
          productLevel: nextLevel as ProductLevel,
          amount: nextAmount,
          actualAmount: nextAmount,
          performanceBaseAmount: prev.performanceBaseAmount || nextAmount,
        };
      });
    };
    loadProducts();
  }, [open]);

  const amountMap = useMemo(
    () => Object.fromEntries(products.map((product) => [product.level, product.price])),
    [products],
  );

  const productLevels = useMemo(
    () => productLevelConfigs.length
      ? productLevelConfigs
      : Array.from(new Set(products.map((product) => product.level))).map((level, index) => ({
        id: level,
        name: level,
        color: '#2196F3',
        isActive: true,
        sortOrder: index + 1,
        createdAt: '',
        updatedAt: '',
      })),
    [productLevelConfigs, products],
  );

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (field === 'productLevel') {
      const amt = amountMap[val] || form.amount || 899;
      setForm({ ...form, productLevel: val as ProductLevel, amount: amt, actualAmount: amt });
    } else {
      setForm({ ...form, [field]: val });
    }
  };

  const handleNumberChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [field]: Number(e.target.value) });
  };

  const handleBooleanChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [field]: e.target.value === 'true' });
  };

  const handleCustomerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const customerId = e.target.value;
    const customer = customers.find((item) => item.id === customerId);
    setForm({
      ...form,
      customerId,
      customerName: customer ? customer.company || customer.name : '',
    });
  };

  const handleVoucherFile = (file?: File) => {
    if (!file) return;
    setVoucherName(file.name);
    setRecognitionMessage('');

    const reader = new FileReader();
    reader.onload = () => setVoucherPreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleRecognizePayment = async () => {
    if (!voucherName) {
      setRecognitionMessage('请先上传付款截图');
      return;
    }

    setRecognizing(true);
    setRecognitionMessage('正在识别付款截图...');
    try {
      let ocrText = '';
      if (voucherPreview) {
        try {
          const { recognize } = await import('tesseract.js');
          const ocrResult = await recognize(voucherPreview, 'eng');
          ocrText = ocrResult.data.text || '';
        } catch {
          ocrText = '';
        }
      }

      const result = recognizePaymentProof(`${ocrText}\n${voucherName}`, Number(form.actualAmount) || Number(form.amount));
      setForm({
        ...form,
        paymentDate: result.paidDate,
        actualAmount: result.amount,
        amount: form.amount || result.amount,
        performanceBaseAmount: form.performanceBaseAmount || result.amount,
        paymentOrderNo: result.paymentOrderNo,
        proofStatus: '已上传' as ProofStatus,
      });
      setRecognitionMessage(ocrText.trim()
        ? '已从付款截图识别并回填付款日期、实付金额和付款订单号，可继续手动修正。'
        : '图片文字未清晰识别，已按文件名信息回填，可继续手动修正。');
    } finally {
      setRecognizing(false);
    }
  };

  const handleSubmit = async () => {
    const payment = {
      id: order?.payments?.[0]?.id || `pay-${Date.now()}`,
      amount: Number(form.actualAmount),
      paymentMethod: form.paymentMethod,
      paidAt: form.paymentDate ? new Date(form.paymentDate).toISOString() : new Date().toISOString(),
      paymentOrderNo: form.paymentOrderNo || undefined,
      voucherName: voucherName || undefined,
      voucherPreview: voucherPreview || undefined,
    };

    const payload = {
      ...form,
      amount: Number(form.amount),
      actualAmount: Number(form.actualAmount),
      payments: [payment],
      performanceBaseAmount: Number(form.performanceBaseAmount) || Number(form.actualAmount),
      collaboratorRatio: Number(form.collaboratorRatio) || undefined,
      collaboratorName: form.collaboratorName || undefined,
      originalOrderId: form.originalOrderId || undefined,
    };

    if (order) {
      await update(order.id, payload);
    } else {
      await create(payload);
    }
    onSuccess?.();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{order ? '编辑订单' : '新增订单'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          <TextField select label="客户（客户中心）" value={form.customerId} onChange={handleCustomerSelect} required fullWidth>
            <MenuItem value="">请选择客户</MenuItem>
            {customers.map((customer) => (
              <MenuItem key={customer.id} value={customer.id}>
                {customer.company || customer.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="产品等级" value={form.productLevel} onChange={handleChange('productLevel')} fullWidth>
            {productLevels.map((level) => (
              <MenuItem key={level.name} value={level.name}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: level.color }} />
                  {level.name}
                </Box>
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="订单类型" value={form.orderType} onChange={handleChange('orderType')} fullWidth>
            {ORDER_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>
            ))}
          </TextField>
          <TextField select label="支付方式" value={form.paymentMethod} onChange={handleChange('paymentMethod')} fullWidth>
            {PAYMENT_METHODS.map((m) => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </TextField>
          <TextField select label="订单状态" value={form.status} onChange={handleChange('status')} fullWidth>
            {Object.values(ORDER_STATUS).map((status) => (
              <MenuItem key={status} value={status}>{status}</MenuItem>
            ))}
          </TextField>
          <TextField select label="官方收款渠道" value={form.officialPaymentChannel} onChange={handleChange('officialPaymentChannel')} fullWidth>
            {OFFICIAL_PAYMENT_CHANNELS.map((m) => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </TextField>
          <TextField select label="资源归属" value={form.resourceOwnership} onChange={handleChange('resourceOwnership')} fullWidth>
            {RESOURCE_OWNERSHIPS.map((m) => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </TextField>
          <TextField select label="成交场景" value={form.dealScene} onChange={handleChange('dealScene')} fullWidth>
            {COMMISSION_SCENES.map((m) => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </TextField>
          <TextField select label="凭证状态" value={form.proofStatus} onChange={handleChange('proofStatus')} fullWidth>
            {PROOF_STATUSES.map((m) => (
              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
            ))}
          </TextField>
          <TextField select label="外部达人成交" value={String(form.isExternalTalentOrder)} onChange={handleBooleanChange('isExternalTalentOrder')} fullWidth>
            <MenuItem value="false">否</MenuItem>
            <MenuItem value="true">是</MenuItem>
          </TextField>
          <TextField label="订单金额" type="number" value={form.amount} onChange={handleChange('amount')} fullWidth />
          <TextField label="实付金额" type="number" value={form.actualAmount} onChange={handleChange('actualAmount')} fullWidth />
          <TextField label="付款日期" type="date" value={form.paymentDate} onChange={handleChange('paymentDate')} fullWidth InputLabelProps={{ shrink: true }} />
          <TextField label="付款订单号" value={form.paymentOrderNo} onChange={handleChange('paymentOrderNo')} placeholder="上传截图识别后自动填写" fullWidth />
          <Box
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleVoucherFile(e.dataTransfer.files?.[0]);
            }}
            sx={{
              gridColumn: '1 / -1',
              border: '1px dashed #90caf9',
              bgcolor: '#f8fbff',
              borderRadius: 1,
              p: 2,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr auto' },
              gap: 2,
              alignItems: 'center',
            }}
          >
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>付款截图提交</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>
                拖拽截图到这里，或点击上传后确认识别，系统会回填付款日期、金额、付款订单号。
              </Typography>
              {voucherName && (
                <Typography variant="body2" sx={{ mt: 1, color: '#1e88e5' }}>{voucherName}</Typography>
              )}
              {recognitionMessage && (
                <Typography variant="body2" sx={{ mt: 1, color: recognitionMessage.startsWith('已') ? '#2e7d32' : '#d97706' }}>
                  {recognitionMessage}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {voucherPreview && (
                <Box
                  component="img"
                  src={voucherPreview}
                  alt="付款截图预览"
                  sx={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 1, border: '1px solid #e5e7eb' }}
                />
              )}
              <Button variant="outlined" component="label">
                上传截图
                <input hidden accept="image/*" type="file" onChange={(e) => handleVoucherFile(e.target.files?.[0])} />
              </Button>
              <Button variant="contained" onClick={handleRecognizePayment} disabled={!voucherName || recognizing}>
                {recognizing ? '识别中...' : '确认识别'}
              </Button>
            </Box>
          </Box>
          <TextField label="业绩核算基数" type="number" value={form.performanceBaseAmount} onChange={handleNumberChange('performanceBaseAmount')} placeholder="留空按实付金额" fullWidth />
          <TextField select label="来源类型" value={form.sourceType} onChange={handleChange('sourceType')} fullWidth>
            <MenuItem value="自拓">自拓</MenuItem>
            <MenuItem value="公司资源">公司资源</MenuItem>
            <MenuItem value="转介绍">转介绍</MenuItem>
            <MenuItem value="渠道转介绍价">渠道转介绍价</MenuItem>
            <MenuItem value="重新付款">重新付款</MenuItem>
            <MenuItem value="原价挽回">原价挽回</MenuItem>
            <MenuItem value="898-599挽回">898-599挽回</MenuItem>
            <MenuItem value="598-450挽回">598-450挽回</MenuItem>
          </TextField>
          <TextField select label="负责人" value={form.owner} onChange={handleChange('owner')} fullWidth>
            <MenuItem value="张伟">张伟</MenuItem>
            <MenuItem value="李娜">李娜</MenuItem>
            <MenuItem value="王磊">王磊</MenuItem>
            <MenuItem value="赵敏">赵敏</MenuItem>
          </TextField>
          <TextField label="协同人员" value={form.collaboratorName} onChange={handleChange('collaboratorName')} placeholder="如：电商客服/成功专员姓名" fullWidth />
          <TextField select label="协同角色" value={form.collaboratorRole} onChange={handleChange('collaboratorRole')} fullWidth>
            {['销售', '线索', '客户成功', '售后', '招商主管', '销售主管'].map((role) => (
              <MenuItem key={role} value={role}>{role}</MenuItem>
            ))}
          </TextField>
          <TextField label="协同分成比例（%）" type="number" value={form.collaboratorRatio} onChange={handleNumberChange('collaboratorRatio')} fullWidth />
          <TextField label="原899订单ID" value={form.originalOrderId} onChange={handleChange('originalOrderId')} placeholder="成交线索转代理时填写" fullWidth />
          <TextField label="备注" value={form.notes} onChange={handleChange('notes')} fullWidth sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!form.customerName}>
          {order ? '保存修改' : '创建订单'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OrderForm;
