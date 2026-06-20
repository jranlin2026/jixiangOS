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
import { CUSTOMER_LEVELS, RESOURCE_OWNERSHIPS, normalizeResourceOwnership } from '../../shared/utils/constants';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import type { Customer } from '../../types/customer';
import type { CustomerLevelConfig, LeadSourceConfig, User } from '../../types/settings';

const CURRENT_USER_STORAGE_KEY = 'aaos_current_user';

interface CustomerFormProps {
  open: boolean;
  onClose: () => void;
  customer?: Customer | null;
  onSuccess?: () => void;
}

type SourceOption = {
  key: string;
  label: string;
  parentName: string;
  childName: string;
  parentId: string;
};

function getCurrentUserName(users: User[]): string {
  try {
    const raw = localStorage.getItem(CURRENT_USER_STORAGE_KEY);
    if (raw) {
      const current = JSON.parse(raw) as Partial<User>;
      if (current.name) return current.name;
    }
  } catch {
    // fallback below
  }
  return users.find((user) => user.isActive)?.name || '';
}

const CustomerForm: React.FC<CustomerFormProps> = ({ open, onClose, customer, onSuccess }) => {
  const { create, update } = useCustomerStore();
  const isEdit = !!customer;
  const [users, setUsers] = useState<User[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [customerLevelConfigs, setCustomerLevelConfigs] = useState<CustomerLevelConfig[]>([]);

  const parentSources = useMemo(
    () => sourceConfigs.filter((item) => !item.parentId && item.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [sourceConfigs],
  );
  const childSources = useMemo(
    () => sourceConfigs.filter((item) => item.parentId && item.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [sourceConfigs],
  );
  const sourceOptions = useMemo<SourceOption[]>(() => parentSources.flatMap((parent) => {
    const children = childSources.filter((child) => child.parentId === parent.id);
    if (!children.length) {
      return [{
        key: parent.id,
        label: parent.name,
        parentName: parent.name,
        childName: '',
        parentId: parent.id,
      }];
    }
    return children.map((child) => ({
      key: `${parent.id}:${child.id}`,
      label: `${parent.name}-${child.name}`,
      parentName: parent.name,
      childName: child.name,
      parentId: parent.id,
    }));
  }), [childSources, parentSources]);

  const defaultOwner = useMemo(() => getCurrentUserName(users) || users[0]?.name || '', [users]);
  const customerLevelOptions = useMemo(() => {
    const activeConfigs = customerLevelConfigs.filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    const options = activeConfigs.length
      ? activeConfigs.map((item) => ({ value: item.value, label: item.label, color: item.color }))
      : CUSTOMER_LEVELS;
    if (customer?.customerLevel && !options.some((item) => item.value === customer.customerLevel)) {
      return [{ value: customer.customerLevel, label: customer.customerLevel, color: '#9E9E9E' }, ...options];
    }
    return options;
  }, [customer?.customerLevel, customerLevelConfigs]);

  const [form, setForm] = useState({
    name: '',
    company: '',
    phone: '',
    wechat: '',
    sourceType: '公司资源',
    leadSource: '',
    sourceName: '',
    industry: '',
    city: '',
    leadInputBy: '',
    leadContributorId: '',
    leadContributorName: '',
    owner: '',
    customerLevel: 'L1' as Customer['customerLevel'],
    originalSalesTransferBy: '',
    tags: '',
    remark: '',
  });

  useEffect(() => {
    if (!open) return;

    settingsApi.fetchUsers({ isActive: true }).then((res) => {
      if (res.code === 0) setUsers(res.data.filter((user) => user.isActive));
    });
    settingsApi.fetchLeadSourceConfigs().then((res) => {
      if (res.code === 0) setSourceConfigs(res.data.filter((item) => item.isActive));
    });
    settingsApi.fetchCustomerLevelConfigs().then((res) => {
      if (res.code === 0) setCustomerLevelConfigs(res.data);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const defaultSourceOption = sourceOptions[0];
    const fallbackOwner = customer?.owner || defaultOwner;
    setForm({
      name: customer?.name || '',
      company: customer?.company || '',
      phone: customer?.phone || '',
      wechat: customer?.wechat || '',
      sourceType: normalizeResourceOwnership(customer?.sourceType),
      leadSource: customer?.leadSource || defaultSourceOption?.parentName || '',
      sourceName: customer?.sourceName || defaultSourceOption?.childName || '',
      industry: customer?.industry || '',
      city: customer?.city || '',
      leadInputBy: customer?.leadInputBy || defaultOwner,
      leadContributorId: customer?.leadContributorId || '',
      leadContributorName: customer?.leadContributorName || '',
      owner: fallbackOwner,
      customerLevel: customer?.customerLevel || 'L1',
      originalSalesTransferBy: customer?.originalSalesTransferBy || '',
      tags: customer?.tags?.join(', ') || '',
      remark: customer?.remark || '',
    });
  }, [open, customer, defaultOwner, sourceOptions]);

  const selectedSourceKey = sourceOptions.find((option) => (
    option.parentName === form.leadSource && option.childName === (form.sourceName || '')
  ))?.key || '';

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [field]: e.target.value });
  };

  const handleContributorSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const user = users.find((item) => item.id === e.target.value);
    setForm({
      ...form,
      leadContributorId: user?.id || '',
      leadContributorName: user?.name || '',
    });
  };

  const handleSourceSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const option = sourceOptions.find((item) => item.key === event.target.value);
    setForm({
      ...form,
      leadSource: option?.parentName || '',
      sourceName: option?.childName || '',
    });
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
  const missingContributor = normalizeResourceOwnership(form.sourceType) === '个人资源' && !form.leadContributorName;
  const showContactError = !!form.name.trim() && missingContact;
  const canSubmit = !!form.name.trim() && !missingContact && !missingContributor && !!form.owner && !!form.leadInputBy && !!form.leadSource;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseTitle onClose={onClose}>{isEdit ? '编辑客户资料' : '新增客户'}</DialogCloseTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          <TextField label="姓名" value={form.name} onChange={handleChange('name')} required fullWidth />
          <TextField label="公司" value={form.company} onChange={handleChange('company')} fullWidth />
          <TextField
            label="手机号"
            value={form.phone}
            onChange={handleChange('phone')}
            error={showContactError}
            helperText={showContactError ? '手机号或微信至少填写一项' : ''}
            fullWidth
          />
          <TextField
            label="微信"
            value={form.wechat}
            onChange={handleChange('wechat')}
            error={showContactError}
            helperText={showContactError ? '手机号或微信至少填写一项' : '用于查重和线索同步'}
            fullWidth
          />
          <TextField select label="资源归属" value={form.sourceType} onChange={handleChange('sourceType')} fullWidth>
            {RESOURCE_OWNERSHIPS.map((item) => (
              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
            ))}
          </TextField>
          <TextField select label="线索来源" value={selectedSourceKey} onChange={handleSourceSelect} required fullWidth>
            <MenuItem value="" disabled>请选择线索来源</MenuItem>
            {parentSources.flatMap((parent) => {
              const options = sourceOptions.filter((option) => option.parentId === parent.id);
              return [
                <MenuItem key={`${parent.id}-group`} disabled sx={{ fontWeight: 700, color: 'text.primary' }}>
                  {parent.name}
                </MenuItem>,
                ...options.map((option) => (
                  <MenuItem key={option.key} value={option.key} sx={{ pl: 4 }}>
                    {option.label}
                  </MenuItem>
                )),
              ];
            })}
          </TextField>
          <TextField label="行业" value={form.industry} onChange={handleChange('industry')} fullWidth />
          <TextField label="城市" value={form.city} onChange={handleChange('city')} fullWidth />
          <TextField select label="线索录入人" value={form.leadInputBy} onChange={handleChange('leadInputBy')} required fullWidth helperText="默认当前登录人员">
            {userOptions}
          </TextField>
          <TextField
            select
            label="线索贡献人"
            value={form.leadContributorId}
            onChange={handleContributorSelect}
            required={normalizeResourceOwnership(form.sourceType) === '个人资源'}
            fullWidth
            helperText={missingContributor ? '个人资源必须填写线索贡献人' : '用于线索分成归属，可与录入人不同'}
            error={missingContributor}
          >
            <MenuItem value="">无</MenuItem>
            {users.map((user) => (
              <MenuItem key={user.id} value={user.id}>
                {user.name}（{user.role}）
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="分配销售" value={form.owner} onChange={handleChange('owner')} required fullWidth>
            {userOptions}
          </TextField>
          <TextField select label="客户等级" value={form.customerLevel} onChange={handleChange('customerLevel')} fullWidth>
            {customerLevelOptions.map((level) => (
              <MenuItem key={level.value} value={level.value}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: level.color }} />
                  {level.label}
                </Box>
              </MenuItem>
            ))}
          </TextField>
          <TextField select label="原销转人员" value={form.originalSalesTransferBy} onChange={handleChange('originalSalesTransferBy')} fullWidth>
            <MenuItem value="">无</MenuItem>
            {userOptions}
          </TextField>
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
