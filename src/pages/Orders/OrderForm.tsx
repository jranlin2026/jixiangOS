import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  FormLabel,
  IconButton,
  MenuItem,
  Radio,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import useOrderStore from '../../store/useOrderStore';
import {
  OFFICIAL_PAYMENT_CHANNELS,
  normalizeResourceOwnership,
} from '../../shared/utils/constants';
import { customerApi, orderApi, orderReviewApi, productApi, settingsApi } from '../../api';
import type { OrderType, PaymentMethod, ProductLevel } from '../../types/common';
import type {
  CommissionManualEntitlementDraft,
  CommissionCorrectionPreview,
  CommissionPayoutCorrectionContext,
  CommissionScene,
  OfficialPaymentChannel,
  PostPayoutEntitlementStrategy,
  ResourceOwnership,
} from '../../types/commission';
import type { Customer } from '../../types/customer';
import type { Order, OrderApplication, OrderCorrectionInput, OrderItemInput } from '../../types/order';
import type { Product } from '../../types/product';
import type { AfterSalesSourceConfig, OrderTypeConfig, User } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import BusinessAttachmentPicker from '../../shared/components/BusinessAttachmentPicker';
import { recognizePaymentProof as recognizePaymentProofFromOcr } from '../../shared/utils/paymentProofRecognition';
import { businessAttachmentApi } from '../../api/businessAttachmentApi';
import type { BusinessAttachment } from '../../types/businessAttachment';
import useAuthStore from '../../store/useAuthStore';
import { filterUsersByCurrentDataScope } from '../../shared/utils/dataVisibility';
import { formatEmployeeNameWithPosition } from '../../shared/utils/formatters';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { canonicalizeOrderItems } from '../../shared/utils/orderItems';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import BusinessFormSection from '../../shared/components/BusinessFormSection';
import CommissionCorrectionImpactDialog from '../../shared/components/CommissionCorrectionImpactDialog';
import BusinessSourceFields from '../../shared/components/BusinessSourceFields';
import {
  clearOrderPlatformSource,
  hasOrderPlatformSource,
  isOrderPlatformSourceComplete,
  isSelfOperatedStoreChannel,
} from '../../shared/utils/orderPlatformSource';

interface OrderFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (application?: OrderApplication) => void;
  order?: Order | null;
  application?: OrderApplication | null;
  customer?: Customer | null;
  initialMode?: 'edit' | 'correction';
  payoutContext?: CommissionPayoutCorrectionContext;
  entitlementStrategy?: PostPayoutEntitlementStrategy;
  manualEntitlements?: CommissionManualEntitlementDraft[];
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
    '转介绍成交',
    '智能体服务',
    '个人资源成交',
  ];
  return scenes.includes(orderType) ? orderType as CommissionScene : undefined;
}

function getCustomerDisplayName(customer?: Customer | null): string {
  return customer?.name || '';
}

function getCustomerOptionLabel(customer: Customer): string {
  return Array.from(new Set([
    customer.name,
    customer.company,
    customer.phone,
  ].filter(Boolean))).join(' · ');
}

const OrderForm: React.FC<OrderFormProps> = ({
  open,
  onClose,
  onSuccess,
  order,
  application,
  customer,
  initialMode = 'edit',
  payoutContext,
  entitlementStrategy,
  manualEntitlements,
}) => {
  const { update } = useOrderStore();
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const currentUser = useAuthStore((state) => state.currentUser);
  const [products, setProducts] = useState<Product[]>([]);
  const [orderTypeConfigs, setOrderTypeConfigs] = useState<OrderTypeConfig[]>([]);
  const [businessSourceConfigs, setBusinessSourceConfigs] = useState<AfterSalesSourceConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [applicantDepartmentName, setApplicantDepartmentName] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [voucherName, setVoucherName] = useState('');
  const [voucherPreview, setVoucherPreview] = useState('');
  const [dealEvidenceName, setDealEvidenceName] = useState('');
  const [dealEvidencePreview, setDealEvidencePreview] = useState('');
  const [paymentAttachments, setPaymentAttachments] = useState<BusinessAttachment[]>([]);
  const [dealEvidenceAttachments, setDealEvidenceAttachments] = useState<BusinessAttachment[]>([]);
  const [attachmentDraftKey] = useState(() => `order-${crypto.randomUUID()}`);
  const [recognitionMessage, setRecognitionMessage] = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [correctionMode, setCorrectionMode] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [correctionPreview, setCorrectionPreview] = useState<CommissionCorrectionPreview | null>(null);
  const [pendingCorrectionInput, setPendingCorrectionInput] = useState<OrderCorrectionInput | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItemInput[]>([]);
  const [productItemsEdited, setProductItemsEdited] = useState(false);
  const canCorrectFormalOrder = Boolean(order && hasPermission(currentUser, PERMISSION_KEYS.ORDER_CORRECT, 'write'));

  const showFormIssue = async (message: string) => {
    await alert(message, correctionMode ? '订单更正无法提交' : '订单申请无法提交');
  };

  const [form, setForm] = useState({
    customerName: '',
    productId: '',
    productName: '',
    productLevel: '' as ProductLevel,
    orderType: '' as OrderType,
    actualAmount: 0,
    officialPaymentChannel: '对公银行转账' as OfficialPaymentChannel,
    resourceOwnership: '公司资源' as ResourceOwnership,
    sourceType: '',
    leadInputBy: '',
    leadContributorId: '',
    leadContributorName: '',
    salesId: '',
    owner: '',
    thirdPartyOrderNo: '',
    sourcePlatformId: '',
    sourcePlatformName: '',
    sourceShopId: '',
    sourceShopName: '',
    notes: '',
    refundStatus: '无' as Order['refundStatus'],
    customerId: '',
    paymentDate: toDateTimeInputValue(new Date()),
    paymentOrderNo: '',
  });
  const showPlatformSourceFields = isSelfOperatedStoreChannel(form.officialPaymentChannel)
    || (Boolean(order || application) && hasOrderPlatformSource(form));

  useEffect(() => {
    if (!open) return;
    setCorrectionMode(Boolean(order && initialMode === 'correction' && canCorrectFormalOrder));
    setCorrectionReason('');
    setCorrectionPreview(null);
    setPendingCorrectionInput(null);
    setSubmitAttempted(false);
    setProductItemsEdited(false);

    if (!order && !application) {
      setVoucherName('');
      setVoucherPreview('');
      setDealEvidenceName('');
      setDealEvidencePreview('');
      setPaymentAttachments([]);
      setDealEvidenceAttachments([]);
      setRecognitionMessage('');
      setOrderItems([]);
      setCustomers([]);
      setCustomerSearch('');
      setSelectedCustomer(customer || null);
      setForm({
        customerId: customer?.id || '',
        customerName: getCustomerDisplayName(customer),
        salesId: customer?.ownerId || '',
        owner: customer?.owner || '',
        productId: '',
        productName: '',
        productLevel: (customer?.productLevel || '') as ProductLevel,
        orderType: '' as OrderType,
        actualAmount: 0,
        officialPaymentChannel: '对公银行转账',
        resourceOwnership: resourceOwnershipFromCustomer(customer, '公司资源'),
        sourceType: sourceTypeFromCustomer(customer),
        leadInputBy: customer?.leadInputBy || '',
        leadContributorId: customer?.leadContributorId || '',
        leadContributorName: customer?.leadContributorName || '',
        thirdPartyOrderNo: '',
        sourcePlatformId: '',
        sourcePlatformName: '',
        sourceShopId: '',
        sourceShopName: '',
        notes: '',
        refundStatus: '无',
        paymentDate: toDateTimeInputValue(new Date()),
        paymentOrderNo: '',
      });
      return;
    }

    const sourceOrder = order || application?.orderData;
    if (!sourceOrder) return;
    const primaryPayment = sourceOrder.payments?.[0];
    setOrderItems(sourceOrder.items?.length
      ? sourceOrder.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        isPrimary: item.isPrimary,
      }))
      : sourceOrder.productId
        ? [{ productId: sourceOrder.productId, quantity: 1, isPrimary: true }]
        : []);
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
    setCustomers([lockedCustomer]);
    setCustomerSearch(getCustomerOptionLabel(lockedCustomer));
    setVoucherName(primaryPayment?.voucherName || '');
    setVoucherPreview(primaryPayment?.voucherPreview || '');
    setDealEvidenceName(sourceOrder.dealEvidenceName || '');
    setDealEvidencePreview(sourceOrder.dealEvidencePreview || '');
    setPaymentAttachments(primaryPayment?.attachments || []);
    setDealEvidenceAttachments(sourceOrder.dealEvidenceAttachments || []);
    setRecognitionMessage('');
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
      sourceType: sourceOrder.sourceType || prev.sourceType,
      leadInputBy: sourceOrder.leadInputBy || prev.leadInputBy,
      leadContributorId: sourceOrder.leadContributorId || prev.leadContributorId,
      leadContributorName: sourceOrder.leadContributorName || prev.leadContributorName,
      salesId: sourceOrder.salesId || '',
      owner: sourceOrder.owner,
      thirdPartyOrderNo: sourceOrder.thirdPartyOrderNo || '',
      sourcePlatformId: sourceOrder.sourcePlatformId || '',
      sourcePlatformName: sourceOrder.sourcePlatformName || '',
      sourceShopId: sourceOrder.sourceShopId || '',
      sourceShopName: sourceOrder.sourceShopName || '',
      notes: sourceOrder.notes || '',
      refundStatus: sourceOrder.refundStatus,
      paymentDate: toDateTimeInputValue(new Date(primaryPayment?.paidAt || order?.createdAt || application?.createdAt || new Date())),
      paymentOrderNo: primaryPayment?.paymentOrderNo || '',
    }));
  }, [open, order, application, customer, initialMode, canCorrectFormalOrder]);

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
        return prev;
      });
    };
    loadProducts();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    Promise.all([
      orderApi.fetchOwnerCandidates(),
      settingsApi.fetchOrderTypeConfigs(),
      settingsApi.fetchAssignableDirectory(),
      settingsApi.fetchAfterSalesSourceConfigs(),
    ]).then(([userRes, orderTypeRes, directoryRes, businessSourceRes]) => {
      if (userRes.code === 0) {
        const visibleUsers = filterUsersByCurrentDataScope(userRes.data, 'orders', currentUser || undefined);
        setUsers(visibleUsers);
        setForm((prev) => {
          if (prev.salesId) return prev;
          const matches = visibleUsers.filter((user) => user.name === prev.owner);
          return matches.length === 1 ? { ...prev, salesId: matches[0].id } : prev;
        });
      }
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
      if (directoryRes.code === 0 && currentUser?.departmentId) {
        setApplicantDepartmentName(directoryRes.data.departments.find((item) => item.id === currentUser.departmentId)?.name || '');
      } else {
        setApplicantDepartmentName('');
      }
      setBusinessSourceConfigs(businessSourceRes.code === 0 ? businessSourceRes.data : []);
    });
  }, [currentUser, open, order]);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const productOptions = useMemo(() => (
    [...products].filter((product) => product.isActive).sort((a, b) => a.sortOrder - b.sortOrder)
  ), [products]);

  const productSummary = useMemo(() => {
    if (order && !productItemsEdited) {
      const storedItems = order.items?.length ? order.items : order.productId ? [{
        id: 'legacy-primary',
        productId: order.productId,
        productName: order.productName || order.productLevel,
        productLevel: order.productLevel,
        unitPrice: Number(order.amount || 0),
        quantity: 1,
        subtotal: Number(order.amount || 0),
        allocatedActualAmount: Number(order.actualAmount || order.amount || 0),
        isPrimary: true,
        sortOrder: 1,
      }] : [];
      return {
        items: storedItems,
        standardTotalAmount: Number(order.standardTotalAmount ?? order.amount ?? 0),
      };
    }
    try {
      return canonicalizeOrderItems(orderItems, products);
    } catch {
      return { items: [], standardTotalAmount: 0 };
    }
  }, [order, orderItems, productItemsEdited, products]);

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
    if (!open || application || customer || (order && !correctionMode)) return;
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
  }, [open, order, application, customer, correctionMode, customerSearch, selectedCustomer]);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setForm({ ...form, [field]: val });
  };

  const handleOfficialPaymentChannelChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const officialPaymentChannel = event.target.value as OfficialPaymentChannel;
    setForm((current) => isSelfOperatedStoreChannel(officialPaymentChannel)
      ? { ...current, officialPaymentChannel }
      : clearOrderPlatformSource({ ...current, officialPaymentChannel }));
  };

  const handleOwnerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedOwner = users.find((user) => user.id === e.target.value);
    setForm({
      ...form,
      salesId: selectedOwner?.id || '',
      owner: selectedOwner?.name || '',
    });
  };

  const handleCustomerSelect = (_event: React.SyntheticEvent, selected: Customer | null) => {
    setSelectedCustomer(selected);
    setForm((current) => {
      const platformSource = isSelfOperatedStoreChannel(current.officialPaymentChannel)
        ? {
            sourcePlatformId: selected?.sourcePlatformId || '',
            sourcePlatformName: selected?.sourcePlatformName || '',
            sourceShopId: selected?.sourceShopId || '',
            sourceShopName: selected?.sourceShopName || '',
            thirdPartyOrderNo: selected?.platformOrderNo || '',
          }
        : {
            sourcePlatformId: '',
            sourcePlatformName: '',
            sourceShopId: '',
            sourceShopName: '',
            thirdPartyOrderNo: '',
          };
      return {
        ...current,
        customerId: selected?.id || '',
        customerName: getCustomerDisplayName(selected),
        salesId: selected?.ownerId || '',
        owner: selected?.owner || current.owner,
        sourceType: sourceTypeFromCustomer(selected, current.sourceType),
        leadInputBy: selected?.leadInputBy || '',
        leadContributorId: selected?.leadContributorId || '',
        leadContributorName: selected?.leadContributorName || '',
        resourceOwnership: resourceOwnershipFromCustomer(selected, current.resourceOwnership),
        ...platformSource,
      };
    });
    if (selected) {
      setCustomerSearch(getCustomerOptionLabel(selected));
    }
  };

  const addProductItem = () => {
    const available = productOptions.find((product) => !orderItems.some((item) => item.productId === product.id));
    if (!available) {
      void showFormIssue(productOptions.length ? '所有启用产品都已添加' : '暂无可用产品，请先到系统设置启用产品');
      return;
    }
    setProductItemsEdited(true);
    setOrderItems((items) => [...items, {
      productId: available.id,
      quantity: 1,
      isPrimary: items.length === 0,
    }]);
  };

  const changeProductItem = (index: number, patch: Partial<OrderItemInput>) => {
    setProductItemsEdited(true);
    setOrderItems((items) => items.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...patch } : item
    )));
  };

  const setPrimaryProductItem = (index: number) => {
    setProductItemsEdited(true);
    setOrderItems((items) => items.map((item, itemIndex) => ({ ...item, isPrimary: itemIndex === index })));
  };

  const removeProductItem = (index: number) => {
    setProductItemsEdited(true);
    setOrderItems((items) => {
      const next = items.filter((_item, itemIndex) => itemIndex !== index);
      if (next.length && !next.some((item) => item.isPrimary)) next[0] = { ...next[0], isPrimary: true };
      return next;
    });
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
    if (!voucherName && !paymentAttachments.length) {
      setRecognitionMessage('请先上传付款截图');
      return;
    }

    setRecognizing(true);
    setRecognitionMessage('正在识别付款截图...');
    try {
      let ocrText = '';
      let proofSource = voucherPreview;
      let temporaryUrl = '';
      if (paymentAttachments[0]) {
        try {
          temporaryUrl = URL.createObjectURL(await businessAttachmentApi.fetchBlob(paymentAttachments[0].id));
          proofSource = temporaryUrl;
        } catch {
          proofSource = '';
        }
      }
      if (proofSource) {
        try {
          const { recognize } = await import('tesseract.js');
          const ocrResult = await recognize(proofSource, 'chi_sim+eng');
          const englishOcrResult = await recognize(proofSource, 'eng').catch(() => null);
          ocrText = [
            ocrResult.data.text || '',
            englishOcrResult?.data.text || '',
          ].filter(Boolean).join('\n');
        } catch {
          ocrText = '';
        }
      }

      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
      const proofName = paymentAttachments[0]?.name || voucherName;
      const result = recognizePaymentProofFromOcr(`${ocrText}\n${proofName}`, Number(form.actualAmount));
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
    setSubmitAttempted(true);
    if (correctionMode && !correctionReason.trim()) {
      await showFormIssue('请先填写更正原因');
      return;
    }
    let canonicalProducts;
    try {
      canonicalProducts = order && !productItemsEdited
        ? productSummary
        : canonicalizeOrderItems(orderItems, products);
    } catch (error) {
      await showFormIssue(error instanceof Error ? error.message : '请完整填写产品信息');
      return;
    }
    const primaryItem = canonicalProducts.items.find((item) => item.isPrimary) || canonicalProducts.items[0];
    if (!form.customerId || !form.customerName || !primaryItem || !form.salesId || !form.orderType || !form.officialPaymentChannel || !form.paymentDate || Number(form.actualAmount) <= 0) {
      await showFormIssue('请完整填写客户、产品、销售负责人、订单类型和付款信息');
      return;
    }
    if (isSelfOperatedStoreChannel(form.officialPaymentChannel) && !isOrderPlatformSourceComplete(form)) {
      await showFormIssue('公司自营小店订单必须完整填写来源平台、来源店铺和平台订单号');
      return;
    }
    const actualAmount = Number(form.actualAmount) || 0;
    const paymentMethod = paymentMethodFromOfficialChannel(form.officialPaymentChannel);
    const remainingPayments = order?.payments?.slice(1) || [];
    const remainingPaymentTotal = remainingPayments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const primaryPaymentAmount = correctionMode
      ? Math.round((actualAmount - remainingPaymentTotal) * 100) / 100
      : actualAmount;
    if (correctionMode && primaryPaymentAmount <= 0) {
      await showFormIssue('实付金额必须大于其余分笔付款合计');
      return;
    }
    const existingPrimaryPayment = order?.payments?.[0];
    const payment = {
      id: existingPrimaryPayment?.id || `pay-${Date.now()}`,
      amount: order && !correctionMode ? existingPrimaryPayment?.amount ?? primaryPaymentAmount : primaryPaymentAmount,
      paymentMethod: order && !correctionMode ? existingPrimaryPayment?.paymentMethod ?? paymentMethod : paymentMethod,
      paidAt: order && !correctionMode
        ? existingPrimaryPayment?.paidAt || order.createdAt
        : form.paymentDate ? new Date(form.paymentDate).toISOString() : new Date().toISOString(),
      paymentOrderNo: form.paymentOrderNo || undefined,
      voucherName: voucherName || undefined,
      voucherPreview: voucherPreview || undefined,
      attachments: paymentAttachments,
      remark: existingPrimaryPayment?.remark,
    };
    const payments = order?.payments?.length ? [payment, ...remainingPayments] : [payment];

    const payload = {
      ...form,
      productId: primaryItem.productId,
      productName: primaryItem.productName,
      productLevel: primaryItem.productLevel,
      items: canonicalProducts.items,
      standardTotalAmount: canonicalProducts.standardTotalAmount,
      amount: canonicalProducts.standardTotalAmount,
      actualAmount,
      resourceOwnership: normalizeResourceOwnership(form.resourceOwnership),
      paymentMethod,
      status: order?.status || '已确认' as Order['status'],
      dealScene: dealSceneFromOrderType(form.orderType),
      proofStatus: paymentAttachments.length || voucherName || voucherPreview ? '已上传' as const : order?.proofStatus || '待补充' as const,
      payments,
      isExternalTalentOrder: order?.isExternalTalentOrder || false,
      performanceBaseAmount: order?.performanceBaseAmount ?? actualAmount,
      leadInputBy: form.leadInputBy || undefined,
      leadContributorId: form.leadContributorId || undefined,
      leadContributorName: form.leadContributorName || undefined,
      dealEvidenceName: dealEvidenceName || undefined,
      dealEvidencePreview: dealEvidencePreview || undefined,
      dealEvidenceAttachments,
    };

    setSubmitting(true);
    try {
      let submittedApplication: OrderApplication | undefined;
      if (order && correctionMode) {
        const correctionInput: OrderCorrectionInput = {
          reason: correctionReason.trim(),
          payoutContext,
          entitlementStrategy,
          manualEntitlements: entitlementStrategy === 'manual_correct' ? manualEntitlements : undefined,
          data: {
            customerId: form.customerId,
            ...(productItemsEdited ? {
              productId: primaryItem.productId,
              items: canonicalProducts.items,
              standardTotalAmount: canonicalProducts.standardTotalAmount,
            } : {}),
            salesId: form.salesId,
            orderType: form.orderType,
            actualAmount,
            officialPaymentChannel: form.officialPaymentChannel,
            resourceOwnership: normalizeResourceOwnership(form.resourceOwnership),
            payments,
            thirdPartyOrderNo: form.thirdPartyOrderNo.trim() || undefined,
            sourcePlatformId: form.sourcePlatformId || undefined,
            sourcePlatformName: form.sourcePlatformName || undefined,
            sourceShopId: form.sourceShopId || undefined,
            sourceShopName: form.sourceShopName || undefined,
            notes: form.notes || undefined,
            dealEvidenceName: dealEvidenceName || undefined,
            dealEvidencePreview: dealEvidencePreview || undefined,
            dealEvidenceAttachments,
          },
        };
        const precheck = await orderApi.precheckOrderCorrection(order.id, payoutContext);
        if (precheck.code !== 0 || !precheck.data) {
          throw new Error(precheck.message || '订单更正预检失败');
        }
        if (!precheck.data.allowed) throw new Error(precheck.data.message || '当前订单暂不能更正');
        if (precheck.data.requiresImpactPreview) {
          const previewRes = await orderApi.previewOrderCorrection(order.id, correctionInput);
          if (previewRes.code !== 0 || !previewRes.data) {
            throw new Error(previewRes.message || '订单更正影响预览生成失败');
          }
          setPendingCorrectionInput(correctionInput);
          setCorrectionPreview(previewRes.data);
          return;
        }
        const res = await orderApi.correctOrder(order.id, correctionInput);
        if (res.code !== 0 || !res.data) throw new Error(res.message || '订单更正失败');
      } else if (order) {
        await update(order.id, {
          thirdPartyOrderNo: form.thirdPartyOrderNo.trim() || undefined,
          sourcePlatformId: form.sourcePlatformId || undefined,
          sourcePlatformName: form.sourcePlatformName || undefined,
          sourceShopId: form.sourceShopId || undefined,
          sourceShopName: form.sourceShopName || undefined,
          notes: form.notes || undefined,
          payments,
          dealEvidenceName: dealEvidenceName || undefined,
          dealEvidencePreview: dealEvidencePreview || undefined,
          dealEvidenceAttachments,
        });
      } else if (application) {
        const res = await orderReviewApi.updateReturnedOrderApplication(application.id, payload);
        if (res.code !== 0) throw new Error(res.message || '订单申请修改失败');
        submittedApplication = res.data || undefined;
      } else {
        const res = await orderReviewApi.submitOrderApplication(payload);
        if (res.code !== 0) throw new Error(res.message || '订单申请提交失败');
        submittedApplication = res.data;
      }
      onSuccess?.(submittedApplication);
      onClose();
    } catch (error) {
      await showFormIssue(error instanceof Error ? error.message : '订单保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmCorrectionImpact = async () => {
    if (!order || !pendingCorrectionInput || !correctionPreview) return;
    setSubmitting(true);
    try {
      const res = await orderApi.correctOrder(order.id, {
        ...pendingCorrectionInput,
        expectedImpactHash: correctionPreview.impactHash,
      });
      if (res.code !== 0 || !res.data) {
        setCorrectionPreview(null);
        setPendingCorrectionInput(null);
        throw new Error(res.message || '订单更正失败');
      }
      setCorrectionPreview(null);
      setPendingCorrectionInput(null);
      onSuccess?.();
      onClose();
    } catch (error) {
      await showFormIssue(error instanceof Error ? error.message : '订单更正失败');
    } finally {
      setSubmitting(false);
    }
  };

  const formalFieldLocked = Boolean(order && !correctionMode);
  const customerLocked = Boolean(application || customer || formalFieldLocked);
  const customerErrorCount = submitAttempted ? Number(!form.customerId || !form.customerName) + Number(!form.salesId) : 0;
  const productErrorCount = submitAttempted ? Number(!orderItems.length) : 0;
  const orderErrorCount = submitAttempted
    ? Number(!form.orderType)
      + Number(!form.officialPaymentChannel)
      + (isSelfOperatedStoreChannel(form.officialPaymentChannel)
        ? Number(!form.sourcePlatformId) + Number(!form.sourceShopId) + Number(!form.thirdPartyOrderNo.trim())
        : 0)
    : 0;
  const paymentErrorCount = submitAttempted
    ? Number(!form.paymentDate) + Number(Number(form.actualAmount) <= 0)
    : 0;
  const formTitle = correctionMode ? '订单更正' : order ? '编辑订单资料' : application ? '修改订单申请' : '提交订单申请';
  const actionText = correctionMode ? '确认更正并重算' : order ? '保存资料' : application ? '重新提交审核' : '提交审核';
  const applicationDate = toDateTimeInputValue(new Date(application?.createdAt || order?.createdAt || Date.now())).slice(0, 10);
  const dialogSubtitle = correctionMode
    ? '提交时将按最新分账状态处理，并完整保留修改和影响记录。'
    : order
      ? '补充和更新订单资料，不改变已生成的订单业务结果。'
      : '提交后进入订单审核台，财务审核通过后生成正式订单、提成和交付记录。';

  return (
    <>
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { maxHeight: '94vh', bgcolor: '#f8fafc' } }}
    >
      <DialogCloseTitle onClose={onClose} closeDisabled={submitting} sx={{ px: { xs: 2, sm: 3 }, py: 2.25, bgcolor: '#fff' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 850 }}>{formTitle}</Typography>
          <Typography variant="body2" sx={{ mt: 0.35, color: '#64748b' }}>{dialogSubtitle}</Typography>
        </Box>
      </DialogCloseTitle>
      <DialogContent sx={{ px: { xs: 1.5, sm: 3 }, py: 2.5, bgcolor: '#f8fafc' }}>
        {!order && (
          <Box
            aria-label="订单申请人信息"
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' },
              gap: 0,
              mb: 2.5,
              border: '1px solid #bfdbfe',
              borderRadius: 2,
              bgcolor: '#f4f8ff',
              overflow: 'hidden',
            }}
          >
            {[
              ['申请人', currentUser?.name || '未知用户'],
              ['部门', applicantDepartmentName || '未归属部门'],
              ['角色', currentUser?.role || '-'],
              ['申请日期', applicationDate],
            ].map(([label, value], index) => (
              <Box
                key={label}
                sx={{
                  px: { xs: 1.5, sm: 2 },
                  py: 1.35,
                  borderLeft: { xs: index % 2 ? '1px solid #dbeafe' : 0, sm: index ? '1px solid #dbeafe' : 0 },
                  borderTop: { xs: index > 1 ? '1px solid #dbeafe' : 0, sm: 0 },
                }}
              >
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>{label}</Typography>
                <Typography variant="body2" noWrap sx={{ mt: 0.25, color: '#0f172a', fontWeight: 700 }}>{value}</Typography>
              </Box>
            ))}
          </Box>
        )}
        {order && !correctionMode && (
          <Alert severity="info" sx={{ mb: 2 }}>
            资料编辑可修改来源平台、来源店铺、平台订单号、付款订单号、付款凭证、成交路径和备注，不会重算提成或交付。金额、产品、客户、销售负责人、收款渠道等请使用“订单更正”。
          </Alert>
        )}
        {order && correctionMode && (
          <Alert severity="info" sx={{ mb: 2 }}>
            提交时会再次检查最新分账状态。未发放分账按新订单重算；如已有提成发放，系统会先展示受影响员工、月份和补发/追回差额，确认后保留原发放事实。
          </Alert>
        )}
        {correctionMode && (
          <TextField
            label="更正原因"
            value={correctionReason}
            onChange={(event) => setCorrectionReason(event.target.value)}
            required
            fullWidth
            multiline
            minRows={2}
            placeholder="请说明录入错误和更正依据，保存后将进入订单修改记录"
            sx={{ mb: 2 }}
          />
        )}
        <Box sx={{ mt: 1 }}>
        <BusinessFormSection step={1} solidStep title="客户信息" summary={form.customerName ? `${form.customerName} / ${form.owner || '待选择负责人'}` : '待选择客户'} errorCount={customerErrorCount}>
          <FormControl fullWidth>
            <FormLabel htmlFor="order-customer-field" required sx={{ mb: 0.75, color: '#334155', fontSize: 13, fontWeight: 700 }}>
              {customerLocked ? '客户' : '客户（搜索选择）'}
            </FormLabel>
            {customerLocked ? (
              <TextField
                id="order-customer-field"
                value={form.customerName}
                required
                fullWidth
                inputProps={{ 'aria-label': '客户' }}
                InputProps={{ readOnly: true }}
                helperText={customer ? '从客户中心创建订单，客户已自动带入' : '编辑订单时客户关系保持不变'}
              />
            ) : (
              <Autocomplete
                id="order-customer-field"
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
                    required
                    placeholder="输入客户名/公司/电话/微信"
                    inputProps={{ ...params.inputProps, 'aria-label': '客户（搜索选择）' }}
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
          </FormControl>
          <FormControl fullWidth>
            <FormLabel htmlFor="order-sales-owner-field" sx={{ mb: 0.75, color: '#334155', fontSize: 13, fontWeight: 700 }}>销售负责人</FormLabel>
            <TextField
              id="order-sales-owner-field"
              select
              value={form.salesId}
              onChange={handleOwnerChange}
              fullWidth
              disabled={formalFieldLocked}
              SelectProps={{ inputProps: { 'aria-label': '销售负责人' } }}
            >
              {form.owner && !users.some((user) => user.id === form.salesId) && (
                <MenuItem value={form.salesId}>{form.owner}（历史负责人）</MenuItem>
              )}
              {users.map((user) => (
                <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>
              ))}
            </TextField>
          </FormControl>
        </BusinessFormSection>

        <BusinessFormSection
          step={2}
          solidStep
          title="产品信息"
          summary={orderItems.length ? `${orderItems.length} 项 / 产品总计 ¥${productSummary.standardTotalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : '待添加产品'}
          errorCount={productErrorCount}
        >
          <Box sx={{ gridColumn: '1 / -1' }}>
            <Button startIcon={<AddIcon />} variant="outlined" onClick={addProductItem} disabled={formalFieldLocked} sx={{ mb: 1.5 }}>
              添加产品
            </Button>
            <TableContainer sx={{ border: '1px solid #dbe3ef', borderRadius: 1.5, bgcolor: '#fff' }}>
              <Table size="small" sx={{ width: '100%', tableLayout: 'fixed', '& .MuiTableCell-root': { px: 1.25 } }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ width: '32%' }}>产品名称 *</TableCell>
                    <TableCell sx={{ width: '13%' }}>产品等级</TableCell>
                    <TableCell align="right" sx={{ width: '15%' }}>产品价格</TableCell>
                    <TableCell align="center" sx={{ width: '18%' }}>数量 *</TableCell>
                    <TableCell align="right" sx={{ width: '14%' }}>小计</TableCell>
                    <TableCell align="center" sx={{ width: '8%' }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!orderItems.length && (
                    <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>点击“添加产品”关联订单产品</TableCell></TableRow>
                  )}
                  {orderItems.map((item, index) => {
                    const selectedProduct = productById.get(item.productId);
                    const storedItem = order && !productItemsEdited
                      ? productSummary.items.find((candidate) => candidate.id === item.id || candidate.productId === item.productId)
                      : undefined;
                    const displayProductName = storedItem?.productName || selectedProduct?.name || '历史产品';
                    const displayProductLevel = storedItem?.productLevel || selectedProduct?.level || '-';
                    const displayUnitPrice = Number(storedItem?.unitPrice ?? selectedProduct?.price ?? 0);
                    const subtotal = Number(storedItem?.subtotal ?? (displayUnitPrice * Number(item.quantity || 0)));
                    return (
                      <TableRow key={item.id || `${item.productId}-${index}`}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 0.5 }}>
                            <Radio size="small" checked={Boolean(item.isPrimary)} onChange={() => setPrimaryProductItem(index)} disabled={formalFieldLocked} inputProps={{ 'aria-label': `设为第 ${index + 1} 项主产品` }} sx={{ mt: 0.5, flexShrink: 0 }} />
                            <Box
                              data-testid="order-product-name-stack"
                              sx={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}
                            >
                              <TextField
                                select size="small" value={item.productId}
                                onChange={(event) => {
                                  const productId = event.target.value;
                                  if (orderItems.some((other, otherIndex) => otherIndex !== index && other.productId === productId)) {
                                    void showFormIssue('同一产品不能重复添加，请直接修改数量');
                                    return;
                                  }
                                  changeProductItem(index, { productId });
                                }}
                                fullWidth disabled={formalFieldLocked} sx={{ display: 'block' }}
                              >
                                {!productOptions.some((product) => product.id === item.productId) && (
                                  <MenuItem value={item.productId}>{displayProductName}（历史产品）</MenuItem>
                                )}
                                {productOptions.map((product) => <MenuItem key={product.id} value={product.id}>{product.name}</MenuItem>)}
                              </TextField>
                              {item.isPrimary && <Chip label="主产品" size="small" color="primary" variant="outlined" sx={{ mt: 0.75, height: 20, fontSize: 11, alignSelf: 'flex-start' }} />}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>{displayProductLevel}</TableCell>
                        <TableCell align="right">¥{displayUnitPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #dbe3ef', borderRadius: 1.25, overflow: 'hidden', bgcolor: '#fff' }}>
                            <IconButton size="small" aria-label="减少数量" disabled={formalFieldLocked || Number(item.quantity) <= 1} onClick={() => changeProductItem(index, { quantity: Math.max(1, Number(item.quantity) - 1) })} sx={{ borderRadius: 0 }}>-</IconButton>
                            <Typography sx={{ minWidth: 34, textAlign: 'center', fontWeight: 700 }}>{item.quantity}</Typography>
                            <IconButton size="small" aria-label="增加数量" disabled={formalFieldLocked || Number(item.quantity) >= 999} onClick={() => changeProductItem(index, { quantity: Math.min(999, Number(item.quantity) + 1) })} sx={{ borderRadius: 0 }}>+</IconButton>
                          </Box>
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 700 }}>¥{subtotal.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell align="center">
                          <IconButton color="error" onClick={() => removeProductItem(index)} disabled={formalFieldLocked} aria-label="删除产品"><DeleteOutlineIcon /></IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {!!orderItems.length && (
                    <TableRow>
                      <TableCell colSpan={4} align="right" sx={{ fontWeight: 700 }}>产品合计（{orderItems.length}项）</TableCell>
                      <TableCell align="right" sx={{ fontSize: 17, fontWeight: 800, color: 'primary.main' }}>
                        ¥{productSummary.standardTotalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            {orderItems.length > 1 && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>主产品用于订单列表展示及现有提成规则匹配，其他产品同样保留在订单明细中。</Typography>}
          </Box>
        </BusinessFormSection>

        <BusinessFormSection step={3} solidStep title="订单与成交渠道" summary={[form.orderType, form.officialPaymentChannel, form.sourcePlatformName, form.sourceShopName, form.thirdPartyOrderNo].filter(Boolean).join(' / ') || '待填写'} errorCount={orderErrorCount}>
          <TextField select label="订单类型" value={form.orderType} onChange={handleChange('orderType')} fullWidth disabled={formalFieldLocked} required>
            {orderTypeOptions.map((item) => (
              <MenuItem key={item.id} value={item.name}>{item.name}</MenuItem>
            ))}
          </TextField>
          <TextField select label="官方收款渠道" value={form.officialPaymentChannel} onChange={handleOfficialPaymentChannelChange} fullWidth disabled={formalFieldLocked} required>
            {OFFICIAL_PAYMENT_CHANNELS.map((item) => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </TextField>
          {showPlatformSourceFields ? (
            <BusinessSourceFields
              configs={businessSourceConfigs}
              value={{
                sourcePlatformId: form.sourcePlatformId,
                sourcePlatformName: form.sourcePlatformName,
                sourceShopId: form.sourceShopId,
                sourceShopName: form.sourceShopName,
                platformOrderNo: form.thirdPartyOrderNo,
              }}
              platformOrderLabel="平台订单号"
              onChange={(value) => setForm((current) => ({
                ...current,
                sourcePlatformId: value.sourcePlatformId,
                sourcePlatformName: value.sourcePlatformName,
                sourceShopId: value.sourceShopId,
                sourceShopName: value.sourceShopName,
                thirdPartyOrderNo: value.platformOrderNo,
              }))}
              required={isSelfOperatedStoreChannel(form.officialPaymentChannel)}
            />
          ) : null}
          <TextField label="备注信息" value={form.notes} onChange={handleChange('notes')} placeholder="请输入订单补充说明（选填）" fullWidth multiline minRows={2} sx={{ gridColumn: '1 / -1' }} />
        </BusinessFormSection>

        <BusinessFormSection step={4} solidStep title="付款与凭证" summary={form.actualAmount > 0 ? `实付 ¥${Number(form.actualAmount).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}` : '待填写付款'} errorCount={paymentErrorCount}>
          <TextField label="实付金额" type="number" value={form.actualAmount} onChange={handleChange('actualAmount')} fullWidth disabled={formalFieldLocked} required />
          <TextField label="付款时间" type="datetime-local" value={form.paymentDate} onChange={handleChange('paymentDate')} fullWidth InputLabelProps={{ shrink: true }} inputProps={{ step: 1 }} disabled={formalFieldLocked} required />
          <TextField label="付款订单号" value={form.paymentOrderNo} onChange={handleChange('paymentOrderNo')} placeholder="填写付款流水号或付款订单号" fullWidth />
          <Box sx={{ gridColumn: '1 / -1' }}>
            <BusinessAttachmentPicker
              title="付款截图"
              description="支持选择、拖拽或粘贴一张截图，上传后可执行付款信息识别。"
              value={paymentAttachments}
              onChange={(attachments) => {
                setPaymentAttachments(attachments);
                if (attachments.length) clearVoucherFile();
              }}
              category="order-payment-proof"
              draftKey={attachmentDraftKey}
              maxCount={1}
              disabled={false}
              rejectWholeBatchOnOverflow
              headerAction={(
                <Button
                  variant="contained"
                  size="small"
                  onClick={handleRecognizePayment}
                  disabled={Boolean(order && !correctionMode) || (!paymentAttachments.length && !voucherName) || recognizing}
                >
                  {recognizing ? '识别中...' : '确认识别付款截图'}
                </Button>
              )}
            />
            {!!voucherName && !paymentAttachments.length && (
              <Alert severity="info" sx={{ mt: 1 }} onClose={order ? undefined : clearVoucherFile}>
                历史付款截图：{voucherName}。重新上传后将使用新的安全附件。
              </Alert>
            )}
            {recognitionMessage && (
              <Typography variant="body2" sx={{ mt: 1, color: recognitionMessage.startsWith('已') ? '#2e7d32' : '#d97706' }}>
                {recognitionMessage}
              </Typography>
            )}
          </Box>
          <Box sx={{ gridColumn: '1 / -1' }}>
            <BusinessAttachmentPicker
              title="成交路径 / 聊天记录"
              description="用于留存聊天记录、成交确认或沟通过程截图。"
              value={dealEvidenceAttachments}
              onChange={(attachments) => {
                setDealEvidenceAttachments(attachments);
                if (attachments.length) clearDealEvidenceFile();
              }}
              category="order-deal-evidence"
              draftKey={attachmentDraftKey}
              maxCount={8}
              disabled={false}
            />
            {!!dealEvidenceName && !dealEvidenceAttachments.length && (
              <Alert severity="info" sx={{ mt: 1 }} onClose={order ? undefined : clearDealEvidenceFile}>
                历史成交截图：{dealEvidenceName}。重新上传后将使用新的安全附件。
              </Alert>
            )}
          </Box>
        </BusinessFormSection>

        </Box>
      </DialogContent>
      <DialogActions
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 2,
          gap: 1.5,
          px: { xs: 2, sm: 3 },
          py: 1.5,
          bgcolor: 'rgba(255, 255, 255, 0.98)',
          borderTop: '1px solid #dbe3ef',
          boxShadow: '0 -8px 24px rgba(15, 23, 42, 0.06)',
        }}
      >
        <Box sx={{ mr: 'auto', display: 'flex', alignItems: 'center', gap: { xs: 1.5, sm: 3 } }}>
          <Box>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>产品合计（{orderItems.length}项）</Typography>
            <Typography sx={{ color: '#2563eb', fontSize: { xs: 18, sm: 22 }, lineHeight: 1.25, fontWeight: 850 }}>
              ¥{productSummary.standardTotalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}
            </Typography>
          </Box>
          <Box sx={{ display: { xs: 'none', sm: 'block' }, pl: 3, borderLeft: '1px solid #dbe3ef' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>实付金额</Typography>
            <Typography sx={{ color: '#0f172a', fontWeight: 750 }}>¥{Number(form.actualAmount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</Typography>
          </Box>
        </Box>
        {correctionMode && <Button onClick={onClose} disabled={submitting}>取消更正</Button>}
        <Button variant="contained" size="large" onClick={handleSubmit} disabled={submitting} sx={{ minWidth: { xs: 112, sm: 148 }, fontWeight: 800 }}>
          {actionText}
        </Button>
      </DialogActions>
    </Dialog>
    <CommissionCorrectionImpactDialog
      open={Boolean(correctionPreview)}
      preview={correctionPreview}
      confirming={submitting}
      onClose={() => {
        setCorrectionPreview(null);
        setPendingCorrectionInput(null);
      }}
      onConfirm={() => void handleConfirmCorrectionImpact()}
    />
    {feedbackDialog}
    </>
  );
};

export default OrderForm;
