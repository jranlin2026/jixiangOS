import React, { useEffect, useMemo, useState } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  MenuItem,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import useOrderStore from '../../store/useOrderStore';
import {
  OFFICIAL_PAYMENT_CHANNELS,
  RESOURCE_OWNERSHIPS,
  getProductLevelColor,
  normalizeResourceOwnership,
} from '../../shared/utils/constants';
import { customerApi, orderReviewApi, productApi, settingsApi } from '../../api';
import type { OrderType, PaymentMethod, ProductLevel } from '../../types/common';
import type {
  CommissionScene,
  OfficialPaymentChannel,
  ResourceOwnership,
} from '../../types/commission';
import type { Customer } from '../../types/customer';
import type { Order, OrderApplication } from '../../types/order';
import type { Product } from '../../types/product';
import type { OrderTypeConfig, User } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import { recognizePaymentProof as recognizePaymentProofFromOcr } from '../../shared/utils/paymentProofRecognition';

interface OrderFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (application?: OrderApplication) => void;
  order?: Order | null;
  application?: OrderApplication | null;
  customer?: Customer | null;
}

function toDateTimeInputValue(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  const hours = String(value.getHours()).padStart(2, '0');
  const minutes = String(value.getMinutes()).padStart(2, '0');
  const seconds = String(value.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
}

function normalizeRecognizedText(rawText: string): string {
  return decodeURIComponent(rawText)
    .replace(/\.[A-Za-z0-9]{2,5}$/i, '')
    .replace(/[年月]/g, '-')
    .replace(/[日号]/g, ' ')
    .replace(/[：时点]/g, ':')
    .replace(/分/g, '')
    .replace(/[，,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRecognizedDate(text: string): string | null {
  const candidates = [
    /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})[\s_T-]+(\d{1,2})[:.-](\d{1,2})(?:[:.-](\d{1,2}))?/,
    /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\s+(\d{1,2})(\d{2})\b/,
    /(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})[\s_T-]+(\d{1,2})[:.-](\d{1,2})(?:[:.-](\d{1,2}))?/,
    /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/,
  ];

  for (const pattern of candidates) {
    const match = text.match(pattern);
    if (!match) continue;

    if (pattern === candidates[2]) {
      const [, month, day, year, hour = '00', minute = '00', second = '00'] = match;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
    }

    const [, year, month, day, hour = '00', minute = '00', second = '00'] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}`;
  }

  const compact = text.match(/\b(20\d{2})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?\b/);
  if (compact) {
    const [, year, month, day, hour = '00', minute = '00', second = '00'] = compact;
    return `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  }

  return null;
}

function recognizePaymentProof(rawText: string, fallbackAmount: number) {
  const text = normalizeRecognizedText(rawText);
  const paidDate = normalizeRecognizedDate(text) || toDateTimeInputValue(new Date());
  const amountByLabel = text.match(/(?:实付金额|付款金额|支付金额|收款金额|转账金额|订单金额|金额|实付|合计|amount|amt|￥|¥|RMB)[^\d]*(\d{1,9}(?:\.\d{1,2})?)/i);
  const amountCandidates = Array.from(text.matchAll(/(?:^|[^\d])(\d{2,9}(?:\.\d{1,2})?)(?:\s*(?:元|rmb|RMB|CNY|￥|¥)|[^\d]|$)/g))
    .map((match) => Number(match[1]))
    .filter((num) => Number.isFinite(num) && num > 0 && num !== 2026 && num < 10000000)
    .sort((a, b) => b - a);
  const amount = Number(amountByLabel?.[1]) || amountCandidates[0] || fallbackAmount;
  const orderNoByLabel = text.match(/(?:流水号|交易号|订单号|支付单号|商户单号|凭证号|交易单号|trade|txn|no|serial)[-_:：\s]*([A-Za-z0-9-]{6,50})/i);
  const orderNoByPrefix = text.match(/(?:^|[^A-Za-z0-9])((?:PAY|TXN|TRADE|ORD)[-_]?[A-Za-z0-9]{6,40})\b/);
  const longNumber = text.match(/\b\d{12,32}\b/);

  return {
    paidDate,
    amount,
    paymentOrderNo: orderNoByPrefix?.[1] || orderNoByLabel?.[1] || longNumber?.[0] || `PAY-${Date.now()}`,
  };
}

function paymentMethodFromOfficialChannel(channel: OfficialPaymentChannel): PaymentMethod {
  if (channel === '企业微信转账') return '微信支付';
  if (channel === '企业支付宝转账') return '支付宝';
  if (channel === '对公银行转账') return '对公转账';
  if (channel === '公司自营小店') return '微信支付';
  return '银行转账';
}

function sourceTypeFromCustomer(customer?: Customer | null, fallback = ''): string {
  return customer?.leadSource || fallback;
}

function resourceOwnershipFromCustomer(customer?: Customer | null, fallback: ResourceOwnership = '公司资源'): ResourceOwnership {
  return normalizeResourceOwnership(customer?.sourceType || fallback);
}

function dealSceneFromOrderType(orderType: OrderType): CommissionScene | undefined {
  const scenes = [
    '899成交',
    '新代理',
    '成交线索转代理',
    '成交线索转新代理',
    '代理升单',
    '代理复购',
    '退款挽回',
    '转介绍成交',
    '智能体服务',
    '个人资源成交',
  ];
  return scenes.includes(orderType) ? orderType as CommissionScene : undefined;
}

function renderUserOptionLabel(user: User): string {
  return `${user.name}（${user.positionName || '未设置职位'}）`;
}

function getCustomerDisplayName(customer?: Customer | null): string {
  return customer?.name || '';
}

function getCustomerOptionLabel(customer: Customer): string {
  return [
    customer.name,
    customer.company,
    customer.phone,
  ].filter(Boolean).join(' · ');
}

const OrderForm: React.FC<OrderFormProps> = ({ open, onClose, onSuccess, order, application, customer }) => {
  const { update } = useOrderStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [orderTypeConfigs, setOrderTypeConfigs] = useState<OrderTypeConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [voucherName, setVoucherName] = useState('');
  const [voucherPreview, setVoucherPreview] = useState('');
  const [dealEvidenceName, setDealEvidenceName] = useState('');
  const [dealEvidencePreview, setDealEvidencePreview] = useState('');
  const [recognitionMessage, setRecognitionMessage] = useState('');
  const [recognizing, setRecognizing] = useState(false);

  const [form, setForm] = useState({
    customerName: '',
    productId: '',
    productName: '',
    productLevel: '' as ProductLevel,
    orderType: '' as OrderType,
    actualAmount: 0,
    officialPaymentChannel: '对公银行转账' as OfficialPaymentChannel,
    resourceOwnership: '公司资源' as ResourceOwnership,
    originalOrderId: '',
    sourceType: '',
    leadInputBy: '',
    leadContributorId: '',
    leadContributorName: '',
    owner: '张伟',
    notes: '',
    refundStatus: '无' as Order['refundStatus'],
    customerId: '',
    paymentDate: toDateTimeInputValue(new Date()),
    paymentOrderNo: '',
  });

  useEffect(() => {
    if (!open) return;

    if (!order && !application) {
      setVoucherName('');
      setVoucherPreview('');
      setDealEvidenceName('');
      setDealEvidencePreview('');
      setRecognitionMessage('');
      setCustomers([]);
      setCustomerSearch('');
      setSelectedCustomer(customer || null);
      setForm((prev) => ({
        ...prev,
        customerId: customer?.id || '',
        customerName: getCustomerDisplayName(customer),
        owner: customer?.owner || prev.owner,
        productId: '',
        productName: '',
        productLevel: customer?.productLevel || prev.productLevel,
        sourceType: sourceTypeFromCustomer(customer, prev.sourceType),
        leadInputBy: customer?.leadInputBy || prev.leadInputBy,
        leadContributorId: customer?.leadContributorId || prev.leadContributorId,
        leadContributorName: customer?.leadContributorName || prev.leadContributorName,
        resourceOwnership: resourceOwnershipFromCustomer(customer, prev.resourceOwnership),
        paymentDate: toDateTimeInputValue(new Date()),
      }));
      return;
    }

    const sourceOrder = order || application?.orderData;
    if (!sourceOrder) return;
    const primaryPayment = sourceOrder.payments?.[0];
    const lockedCustomer: Customer = {
      id: sourceOrder.customerId,
      name: sourceOrder.customerName,
      company: sourceOrder.customerName,
      phone: '',
      customerLevel: 'L1',
      owner: sourceOrder.owner,
      sourceType: sourceOrder.sourceType,
      totalSpent: sourceOrder.actualAmount,
      orderCount: 1,
      growthPath: [],
      growthRecords: [],
      createdAt: order?.createdAt || application?.createdAt || '',
      updatedAt: order?.updatedAt || application?.updatedAt || '',
    };
    setSelectedCustomer(lockedCustomer);
    setVoucherName(primaryPayment?.voucherName || '');
    setVoucherPreview(primaryPayment?.voucherPreview || '');
    setDealEvidenceName(sourceOrder.dealEvidenceName || '');
    setDealEvidencePreview(sourceOrder.dealEvidencePreview || '');
    setRecognitionMessage('');
    setCustomers([]);
    setCustomerSearch('');
    setForm((prev) => ({
      ...prev,
      customerName: sourceOrder.customerName,
      customerId: sourceOrder.customerId || '',
      productId: sourceOrder.productId || prev.productId,
      productName: sourceOrder.productName || prev.productName,
      productLevel: sourceOrder.productLevel,
      orderType: sourceOrder.orderType,
      actualAmount: sourceOrder.actualAmount || sourceOrder.amount,
      officialPaymentChannel: sourceOrder.officialPaymentChannel || prev.officialPaymentChannel,
      resourceOwnership: normalizeResourceOwnership(sourceOrder.resourceOwnership || sourceOrder.sourceType || prev.resourceOwnership),
      originalOrderId: sourceOrder.originalOrderId || '',
      sourceType: sourceOrder.sourceType || prev.sourceType,
      leadInputBy: sourceOrder.leadInputBy || prev.leadInputBy,
      leadContributorId: sourceOrder.leadContributorId || prev.leadContributorId,
      leadContributorName: sourceOrder.leadContributorName || prev.leadContributorName,
      owner: sourceOrder.owner,
      notes: sourceOrder.notes || '',
      refundStatus: sourceOrder.refundStatus,
      paymentDate: toDateTimeInputValue(new Date(primaryPayment?.paidAt || order?.createdAt || application?.createdAt || new Date())),
      paymentOrderNo: primaryPayment?.paymentOrderNo || '',
    }));
  }, [open, order, application, customer]);

  useEffect(() => {
    if (!open) return;
    const loadProducts = async () => {
      const productRes = await productApi.getProducts();
      const productItems = productRes.code === 0 ? productRes.data : [];
      if (productRes.code === 0) setProducts(productItems);
      setForm((prev) => {
        const selectedById = prev.productId ? productItems.find((product) => product.id === prev.productId) : undefined;
        if (selectedById) {
          return {
            ...prev,
            productName: selectedById.name,
            productLevel: selectedById.level as ProductLevel,
          };
        }
        const selectedByLevel = prev.productLevel ? productItems.find((product) => product.level === prev.productLevel) : undefined;
        const selectedProduct = selectedByLevel || productItems[0];
        return selectedProduct ? {
          ...prev,
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          productLevel: selectedProduct.level as ProductLevel,
          actualAmount: prev.actualAmount || selectedProduct.price,
        } : prev;
      });
    };
    loadProducts();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      settingsApi.fetchUsers({ isActive: true }),
      settingsApi.fetchOrderTypeConfigs(),
    ]).then(([userRes, orderTypeRes]) => {
      if (userRes.code === 0) setUsers(userRes.data.filter((user) => user.isActive));
      if (orderTypeRes.code === 0) {
        const configs = orderTypeRes.data;
        const activeTypes = configs.filter((item) => item.isActive);
        setOrderTypeConfigs(configs);
        if (!order) {
          setForm((prev) => {
            const currentExists = activeTypes.some((item) => item.name === prev.orderType);
            if (currentExists) return prev;
            return { ...prev, orderType: (activeTypes[0]?.name || '') as OrderType };
          });
        }
      }
    });
  }, [open, order]);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const productOptions = useMemo(() => (
    [...products].sort((a, b) => a.sortOrder - b.sortOrder)
  ), [products]);

  const orderTypeOptions = useMemo(() => {
    const activeItems = orderTypeConfigs.filter((item) => item.isActive);
    if (order && form.orderType && !activeItems.some((item) => item.name === form.orderType)) {
      const current = orderTypeConfigs.find((item) => item.name === form.orderType) || {
        id: form.orderType,
        name: form.orderType,
        description: '',
        isActive: true,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      };
      return [current, ...activeItems];
    }
    return activeItems;
  }, [form.orderType, order, orderTypeConfigs]);

  useEffect(() => {
    if (!open || order || application || customer) return;
    const keyword = customerSearch.trim();
    if (keyword.length < 1) {
      setCustomers(selectedCustomer ? [selectedCustomer] : []);
      return;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setCustomerLoading(true);
      try {
        const res = await customerApi.fetchCustomers({ search: keyword, pageSize: 20 });
        if (active && res.code === 0) {
          const nextItems = selectedCustomer && !res.data.items.some((item) => item.id === selectedCustomer.id)
            ? [selectedCustomer, ...res.data.items]
            : res.data.items;
          setCustomers(nextItems);
        }
      } finally {
        if (active) setCustomerLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [open, order, application, customer, customerSearch, selectedCustomer]);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (field === 'productId') {
      const selectedProduct = productById.get(val);
      setForm({
        ...form,
        productId: selectedProduct?.id || '',
        productName: selectedProduct?.name || '',
        productLevel: (selectedProduct?.level || form.productLevel) as ProductLevel,
        actualAmount: selectedProduct?.price || form.actualAmount || 0,
      });
    } else {
      setForm({ ...form, [field]: val });
    }
  };

  const handleOwnerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, owner: e.target.value });
  };

  const handleCustomerSelect = (_event: React.SyntheticEvent, selected: Customer | null) => {
    const matchedProduct = selected?.productLevel
      ? products.find((product) => product.level === selected.productLevel)
      : undefined;
    setSelectedCustomer(selected);
    setForm({
      ...form,
      customerId: selected?.id || '',
      customerName: getCustomerDisplayName(selected),
      owner: selected?.owner || form.owner,
      productId: matchedProduct?.id || form.productId,
      productName: matchedProduct?.name || form.productName,
      productLevel: (matchedProduct?.level || selected?.productLevel || form.productLevel) as ProductLevel,
      sourceType: sourceTypeFromCustomer(selected, form.sourceType),
      leadInputBy: selected?.leadInputBy || '',
      leadContributorId: selected?.leadContributorId || '',
      leadContributorName: selected?.leadContributorName || '',
      resourceOwnership: resourceOwnershipFromCustomer(selected, form.resourceOwnership),
    });
    if (selected) {
      setCustomerSearch(getCustomerOptionLabel(selected));
    }
  };

  const handleVoucherFile = (file?: File) => {
    if (!file) return;
    setVoucherName(file.name);
    setRecognitionMessage('');

    const reader = new FileReader();
    reader.onload = () => setVoucherPreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleDealEvidenceFile = (file?: File) => {
    if (!file) return;
    setDealEvidenceName(file.name);

    const reader = new FileReader();
    reader.onload = () => setDealEvidencePreview(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const clearVoucherFile = () => {
    setVoucherName('');
    setVoucherPreview('');
    setRecognitionMessage('');
  };

  const clearDealEvidenceFile = () => {
    setDealEvidenceName('');
    setDealEvidencePreview('');
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
          const ocrResult = await recognize(voucherPreview, 'chi_sim+eng');
          const englishOcrResult = await recognize(voucherPreview, 'eng').catch(() => null);
          ocrText = [
            ocrResult.data.text || '',
            englishOcrResult?.data.text || '',
          ].filter(Boolean).join('\n');
        } catch {
          ocrText = '';
        }
      }

      const result = recognizePaymentProofFromOcr(`${ocrText}\n${voucherName}`, Number(form.actualAmount));
      setForm({
        ...form,
        paymentDate: result.paidDate,
        actualAmount: result.amount,
        paymentOrderNo: result.paymentOrderNo,
      });
      setRecognitionMessage(ocrText.trim()
        ? '已从付款截图识别并回填付款时间、实付金额和付款订单号，可继续手动修正。'
        : '图片文字未清晰识别，已按文件名信息回填，可继续手动修正。');
    } finally {
      setRecognizing(false);
    }
  };

  const handleSubmit = async () => {
    const actualAmount = Number(form.actualAmount) || 0;
    const paymentMethod = paymentMethodFromOfficialChannel(form.officialPaymentChannel);
    const payment = {
      id: order?.payments?.[0]?.id || `pay-${Date.now()}`,
      amount: actualAmount,
      paymentMethod,
      paidAt: form.paymentDate ? new Date(form.paymentDate).toISOString() : new Date().toISOString(),
      paymentOrderNo: form.paymentOrderNo || undefined,
      voucherName: voucherName || undefined,
      voucherPreview: voucherPreview || undefined,
      remark: order?.payments?.[0]?.remark,
    };
    const payments = order?.payments?.length ? [payment, ...order.payments.slice(1)] : [payment];

    const payload = {
      ...form,
      amount: actualAmount,
      actualAmount,
      resourceOwnership: normalizeResourceOwnership(form.resourceOwnership),
      paymentMethod,
      status: order?.status || '已确认' as Order['status'],
      dealScene: dealSceneFromOrderType(form.orderType),
      proofStatus: voucherName || voucherPreview ? '已上传' as const : order?.proofStatus || '待补充' as const,
      payments,
      isExternalTalentOrder: order?.isExternalTalentOrder || false,
      performanceBaseAmount: order?.performanceBaseAmount ?? actualAmount,
      leadInputBy: form.leadInputBy || undefined,
      leadContributorId: form.leadContributorId || undefined,
      leadContributorName: form.leadContributorName || undefined,
      originalOrderId: form.originalOrderId || undefined,
      dealEvidenceName: dealEvidenceName || undefined,
      dealEvidencePreview: dealEvidencePreview || undefined,
    };

    let submittedApplication: OrderApplication | undefined;
    if (order) {
      await update(order.id, payload);
    } else if (application) {
      const res = await orderReviewApi.updateReturnedOrderApplication(application.id, payload);
      submittedApplication = res.data || undefined;
    } else {
      const res = await orderReviewApi.submitOrderApplication(payload);
      submittedApplication = res.data;
    }
    onSuccess?.(submittedApplication);
    onClose();
  };

  const customerLocked = Boolean(order || application || customer);
  const canSubmit = Boolean(form.customerId && form.customerName && form.productId && form.actualAmount > 0);
  const formTitle = order ? '编辑订单' : application ? '修改订单申请' : '提交订单申请';
  const actionText = order ? '保存修改' : application ? '重新提交审核' : '提交审核';

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseTitle onClose={onClose}>{formTitle}</DialogCloseTitle>
      <DialogContent>
        {!order && (
          <Typography variant="body2" sx={{ mb: 2, color: '#1d4ed8', bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 1, px: 1.5, py: 1 }}>
            {application
              ? '修改后会重新进入财务审核，审核通过后才生成正式订单、提成和交付记录。'
              : '提交后会进入订单审核台，财务审核通过后才生成正式订单、提成和交付记录。'}
          </Typography>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          {customerLocked ? (
            <TextField
              label="客户"
              value={form.customerName}
              required
              fullWidth
              InputProps={{ readOnly: true }}
              helperText={customer ? '从客户中心创建订单，客户已自动带入' : '编辑订单时客户关系保持不变'}
            />
          ) : (
            <Autocomplete
              options={selectedCustomer && !customers.some((item) => item.id === selectedCustomer.id) ? [selectedCustomer, ...customers] : customers}
              value={selectedCustomer}
              inputValue={customerSearch}
              onInputChange={(_event, value, reason) => {
                if (reason === 'input' || reason === 'clear') setCustomerSearch(value);
              }}
              onChange={handleCustomerSelect}
              loading={customerLoading}
              filterOptions={(options) => options}
              getOptionLabel={getCustomerOptionLabel}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              noOptionsText={customerSearch.trim() ? '未找到客户' : '输入客户姓名、公司、电话或微信搜索'}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="客户（搜索选择）"
                  required
                  placeholder="输入客户名/公司/电话/微信"
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {customerLoading ? <CircularProgress color="inherit" size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          )}
          <TextField select label="产品名称" value={form.productId} onChange={handleChange('productId')} fullWidth>
            {productOptions.map((product) => (
              <MenuItem key={product.id} value={product.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: getProductLevelColor(product.level) }} />
                  {product.name}
                </Box>
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="订单类型" value={form.orderType} onChange={handleChange('orderType')} fullWidth>
            {orderTypeOptions.map((item) => (
              <MenuItem key={item.id} value={item.name}>{item.name}</MenuItem>
            ))}
          </TextField>
          <TextField select label="官方收款渠道" value={form.officialPaymentChannel} onChange={handleChange('officialPaymentChannel')} fullWidth>
            {OFFICIAL_PAYMENT_CHANNELS.map((item) => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </TextField>
          <TextField select label="资源归属" value={form.resourceOwnership} onChange={handleChange('resourceOwnership')} fullWidth disabled={!!form.customerId}>
            {RESOURCE_OWNERSHIPS.map((item) => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </TextField>
          <TextField label="线索录入人" value={form.leadInputBy || '-'} fullWidth InputProps={{ readOnly: true }} />
          <TextField label="线索贡献人" value={form.leadContributorName || '-'} fullWidth InputProps={{ readOnly: true }} />
          <TextField label="实付金额" type="number" value={form.actualAmount} onChange={handleChange('actualAmount')} fullWidth />
          <TextField label="付款时间" type="datetime-local" value={form.paymentDate} onChange={handleChange('paymentDate')} fullWidth InputLabelProps={{ shrink: true }} inputProps={{ step: 1 }} />
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
                拖拽截图到这里，或点击上传后确认识别，系统会回填付款时间、实付金额、付款订单号。
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
                <Box sx={{ position: 'relative', width: 72, height: 56 }}>
                  <Box
                    component="img"
                    src={voucherPreview}
                    alt="付款截图预览"
                    sx={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 1, border: '1px solid #e5e7eb' }}
                  />
                  <Tooltip title="删除截图">
                    <IconButton
                      size="small"
                      onClick={clearVoucherFile}
                      sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        width: 22,
                        height: 22,
                        bgcolor: '#fff',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 1px 4px rgba(15, 23, 42, 0.18)',
                        '&:hover': { bgcolor: '#fee2e2', color: '#dc2626' },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
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
          <Box
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleDealEvidenceFile(e.dataTransfer.files?.[0]);
            }}
            sx={{
              gridColumn: '1 / -1',
              border: '1px dashed #a5b4fc',
              bgcolor: '#fafbff',
              borderRadius: 1,
              p: 2,
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: '1fr auto' },
              gap: 2,
              alignItems: 'center',
            }}
          >
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>成交路径截图</Typography>
              <Typography variant="body2" sx={{ color: '#6b7280' }}>
                拖拽聊天记录、成交确认或沟通过程截图到这里，用于留存销售成交依据。
              </Typography>
              {dealEvidenceName && (
                <Typography variant="body2" sx={{ mt: 1, color: '#4f46e5' }}>{dealEvidenceName}</Typography>
              )}
            </Box>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {dealEvidencePreview && (
                <Box sx={{ position: 'relative', width: 72, height: 56 }}>
                  <Box
                    component="img"
                    src={dealEvidencePreview}
                    alt="成交路径截图预览"
                    sx={{ width: 72, height: 56, objectFit: 'cover', borderRadius: 1, border: '1px solid #e5e7eb' }}
                  />
                  <Tooltip title="删除截图">
                    <IconButton
                      size="small"
                      onClick={clearDealEvidenceFile}
                      sx={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        width: 22,
                        height: 22,
                        bgcolor: '#fff',
                        border: '1px solid #e5e7eb',
                        boxShadow: '0 1px 4px rgba(15, 23, 42, 0.18)',
                        '&:hover': { bgcolor: '#fee2e2', color: '#dc2626' },
                      }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              )}
              <Button variant="outlined" component="label">
                上传截图
                <input hidden accept="image/*" type="file" onChange={(e) => handleDealEvidenceFile(e.target.files?.[0])} />
              </Button>
            </Box>
          </Box>
          <TextField select label="销售负责人" value={form.owner} onChange={handleOwnerChange} fullWidth>
            {form.owner && !users.some((user) => user.name === form.owner) && (
              <MenuItem value={form.owner}>{form.owner}</MenuItem>
            )}
            {users.map((user) => (
              <MenuItem key={user.id} value={user.name}>{renderUserOptionLabel(user)}</MenuItem>
            ))}
          </TextField>
          <TextField label="原899订单ID" value={form.originalOrderId} onChange={handleChange('originalOrderId')} placeholder="成交线索转代理时填写" fullWidth />
          <TextField label="备注" value={form.notes} onChange={handleChange('notes')} fullWidth sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit}>
          {actionText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OrderForm;
