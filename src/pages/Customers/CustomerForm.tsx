import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  MenuItem,
  TextField,
} from '@mui/material';
import useCustomerStore from '../../store/useCustomerStore';
import { settingsApi } from '../../api';
import { CUSTOMER_LEVELS, LEAD_SOURCES, RESOURCE_OWNERSHIPS, normalizeResourceOwnership } from '../../shared/utils/constants';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import type { Customer } from '../../types/customer';
import type { User } from '../../types/settings';

interface CustomerFormProps {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSuccess?: () => void;
}

const CustomerForm: React.FC<CustomerFormProps> = ({ open, onClose, customer, onSuccess }) => {
  const { create, update } = useCustomerStore();
  const isEdit = !!customer;
  const [users, setUsers] = useState<User[]>([]);

  const defaultOwner = useMemo(() => users[0]?.name || '张伟', [users]);

  const [form, setForm] = useState({
    name: '',
    company: '',
    phone: '',
    email: '',
    customerLevel: 'L1' as Customer['customerLevel'],
    owner: '张伟',
    leadInputBy: '张伟',
    originalSalesTransferBy: '',
    leadSource: '',
    wechat: '',
    industry: '',
    city: '',
    sourceType: '公司资源',
    tags: '',
    remark: '',
  });

  useEffect(() => {
    if (!open) return;

    settingsApi.fetchUsers({ isActive: true }).then((res) => {
      if (res.code === 0) {
        setUsers(res.data.filter((user) => user.isActive));
      }
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const fallbackOwner = customer?.owner || defaultOwner;
    setForm({
      name: customer?.name || '',
      company: customer?.company || '',
      phone: customer?.phone || '',
      email: customer?.email || '',
      customerLevel: customer?.customerLevel || 'L1',
      owner: fallbackOwner,
      leadInputBy: customer?.leadInputBy || fallbackOwner,
      originalSalesTransferBy: customer?.originalSalesTransferBy || '',
      leadSource: customer?.leadSource || '',
      wechat: customer?.wechat || '',
      industry: customer?.industry || '',
      city: customer?.city || '',
      sourceType: normalizeResourceOwnership(customer?.sourceType),
      tags: customer?.tags?.join(', ') || '',
      remark: customer?.remark || '',
    });
  }, [open, customer, defaultOwner]);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [field]: e.target.value });
  };

  const handleSubmit = async () => {
    const tags = form.tags ? form.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
    const payload = {
      ...form,
      tags,
      sourceType: normalizeResourceOwnership(form.sourceType),
    };

    if (isEdit && customer) {
      await update(customer.id, payload);
    } else {
      await create(payload);
    }
    onSuccess?.();
    onClose();
  };

  const userOptions = users.map((user) => (
    <MenuItem key={user.id} value={user.name}>
      {user.name}（{user.role}）
    </MenuItem>
  ));
  const missingContact = !form.phone.trim() && !form.wechat.trim();
  const showContactError = !!form.name.trim() && missingContact;
  const canSubmit = !!form.name.trim() && !missingContact && !!form.owner;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseTitle onClose={onClose}>{isEdit ? '编辑客户' : '新增客户'}</DialogCloseTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          <TextField label="姓名" value={form.name} onChange={handleChange('name')} required fullWidth />
          <TextField label="公司" value={form.company} onChange={handleChange('company')} fullWidth />
          <TextField
            label="电话"
            value={form.phone}
            onChange={handleChange('phone')}
            error={showContactError}
            helperText={showContactError ? '电话和微信至少填写一个' : ''}
            fullWidth
          />
          <TextField label="邮箱" value={form.email} onChange={handleChange('email')} fullWidth />
          <TextField
            label="微信"
            value={form.wechat}
            onChange={handleChange('wechat')}
            error={showContactError}
            helperText={showContactError ? '电话和微信至少填写一个' : ''}
            fullWidth
          />
          <TextField select label="客户等级" value={form.customerLevel} onChange={handleChange('customerLevel')} fullWidth>
            {CUSTOMER_LEVELS.map((level) => (
              <MenuItem key={level.value} value={level.value}>{level.label}</MenuItem>
            ))}
          </TextField>
          <TextField select label="销售负责人" value={form.owner} onChange={handleChange('owner')} required fullWidth>
            {userOptions}
          </TextField>
          <TextField select label="线索录入人" value={form.leadInputBy} onChange={handleChange('leadInputBy')} fullWidth>
            {userOptions}
          </TextField>
          <TextField select label="原销转人员" value={form.originalSalesTransferBy} onChange={handleChange('originalSalesTransferBy')} fullWidth>
            <MenuItem value="">无</MenuItem>
            {userOptions}
          </TextField>
          <TextField select label="线索来源" value={form.leadSource} onChange={handleChange('leadSource')} fullWidth>
            <MenuItem value="">请选择</MenuItem>
            {Object.values(LEAD_SOURCES).map((source) => (
              <MenuItem key={source} value={source}>{source}</MenuItem>
            ))}
          </TextField>
          <TextField select label="资源归属" value={form.sourceType} onChange={handleChange('sourceType')} fullWidth>
            {RESOURCE_OWNERSHIPS.map((item) => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </TextField>
          <TextField label="行业" value={form.industry} onChange={handleChange('industry')} fullWidth />
          <TextField label="城市" value={form.city} onChange={handleChange('city')} fullWidth />
          <TextField label="标签（逗号分隔）" value={form.tags} onChange={handleChange('tags')} fullWidth sx={{ gridColumn: '1 / -1' }} />
          <TextField label="备注" value={form.remark} onChange={handleChange('remark')} fullWidth multiline minRows={3} sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit}>
          {isEdit ? '保存' : '创建'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomerForm;
