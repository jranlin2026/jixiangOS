import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Box,
} from '@mui/material';
import useOrderStore from '../../store/useOrderStore';
import {
  COMMISSION_SCENES,
  OFFICIAL_PAYMENT_CHANNELS,
  ORDER_TYPES,
  PAYMENT_METHODS,
  PROOF_STATUSES,
  RESOURCE_OWNERSHIPS,
} from '../../shared/utils/constants';
import { productApi } from '../../api';
import type { ProductLevel } from '../../types/common';
import type { OrderType, PaymentMethod } from '../../types/common';
import type { CommissionRole, CommissionScene, OfficialPaymentChannel, ProofStatus, ResourceOwnership } from '../../types/commission';
import type { Product } from '../../types/product';

interface OrderFormProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const OrderForm: React.FC<OrderFormProps> = ({ open, onClose, onSuccess }) => {
  const { create } = useOrderStore();
  const [products, setProducts] = useState<Product[]>([]);

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
    status: '待确认' as const,
    refundStatus: '无' as const,
    customerId: '',
  });

  useEffect(() => {
    if (!open) return;
    const loadProducts = async () => {
      const res = await productApi.getProducts();
      if (res.code === 0) setProducts(res.data);
    };
    loadProducts();
  }, [open]);

  const amountMap = useMemo(
    () => Object.fromEntries(products.map((product) => [product.level, product.price])),
    [products],
  );

  const productLevels = useMemo(
    () => Array.from(new Set(products.map((product) => product.level))),
    [products],
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

  const handleSubmit = async () => {
    await create({
      ...form,
      amount: Number(form.amount),
      actualAmount: Number(form.actualAmount),
      payments: [{
        id: `pay-${Date.now()}`,
        amount: Number(form.actualAmount),
        paymentMethod: form.paymentMethod,
        paidAt: new Date().toISOString(),
      }],
      performanceBaseAmount: Number(form.performanceBaseAmount) || Number(form.actualAmount),
      collaboratorRatio: Number(form.collaboratorRatio) || undefined,
      collaboratorName: form.collaboratorName || undefined,
      originalOrderId: form.originalOrderId || undefined,
    });
    onSuccess?.();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>新增订单</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          <TextField label="客户名称" value={form.customerName} onChange={handleChange('customerName')} required fullWidth />
          <TextField select label="产品等级" value={form.productLevel} onChange={handleChange('productLevel')} fullWidth>
            {(productLevels.length ? productLevels : ['899', '课程', '代理', '贴牌', '合伙人']).map((l) => (
              <MenuItem key={l} value={l}>{l}</MenuItem>
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
          创建订单
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default OrderForm;
