import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Box,
} from '@mui/material';
import useCustomerStore from '../../store/useCustomerStore';
import { PRODUCT_LEVELS } from '../../shared/utils/constants';
import type { ProductLevel } from '../../types/common';
import type { Customer } from '../../types/customer';

const INDUSTRIES = ['互联网', '教育', '金融', '制造', '零售', '医疗', '科技', '其他'];
const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '其他'];

interface CustomerFormProps {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSuccess?: () => void;
}

const CustomerForm: React.FC<CustomerFormProps> = ({ open, onClose, customer, onSuccess }) => {
  const { create, update } = useCustomerStore();
  const isEdit = !!customer;

  const [form, setForm] = useState({
    name: customer?.name || '',
    company: customer?.company || '',
    phone: customer?.phone || '',
    email: customer?.email || '',
    productLevel: customer?.productLevel || '899',
    owner: customer?.owner || '张伟',
    wechat: customer?.wechat || '',
    industry: customer?.industry || '',
    city: customer?.city || '',
    tags: customer?.tags?.join(', ') || '',
  });

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [field]: e.target.value });
  };

  const handleSubmit = async () => {
    const tags = form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    if (isEdit && customer) {
      await update(customer.id, { ...form, tags });
    } else {
      await create({ ...form, tags });
    }
    onSuccess?.();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? '编辑客户' : '新增客户'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          <TextField label="姓名" value={form.name} onChange={handleChange('name')} required fullWidth />
          <TextField label="公司" value={form.company} onChange={handleChange('company')} required fullWidth />
          <TextField label="电话" value={form.phone} onChange={handleChange('phone')} required fullWidth />
          <TextField label="邮箱" value={form.email} onChange={handleChange('email')} fullWidth />
          <TextField label="微信" value={form.wechat} onChange={handleChange('wechat')} fullWidth />
          <TextField select label="产品等级" value={form.productLevel} onChange={handleChange('productLevel')} fullWidth>
            {Object.values(PRODUCT_LEVELS).map((l) => (
              <MenuItem key={l} value={l}>{l}</MenuItem>
            ))}
          </TextField>
          <TextField select label="行业" value={form.industry} onChange={handleChange('industry')} fullWidth>
            <MenuItem value="">请选择</MenuItem>
            {INDUSTRIES.map((i) => (
              <MenuItem key={i} value={i}>{i}</MenuItem>
            ))}
          </TextField>
          <TextField select label="城市" value={form.city} onChange={handleChange('city')} fullWidth>
            <MenuItem value="">请选择</MenuItem>
            {CITIES.map((c) => (
              <MenuItem key={c} value={c}>{c}</MenuItem>
            ))}
          </TextField>
          <TextField select label="负责人" value={form.owner} onChange={handleChange('owner')} fullWidth>
            <MenuItem value="张伟">张伟</MenuItem>
            <MenuItem value="李娜">李娜</MenuItem>
            <MenuItem value="王磊">王磊</MenuItem>
            <MenuItem value="赵敏">赵敏</MenuItem>
          </TextField>
          <TextField label="标签（逗号分隔）" value={form.tags} onChange={handleChange('tags')} fullWidth sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!form.name || !form.company || !form.phone}>
          {isEdit ? '保存' : '创建'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomerForm;
