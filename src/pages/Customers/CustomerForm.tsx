import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  MenuItem,
  TextField,
} from '@mui/material';
import useCustomerStore from '../../store/useCustomerStore';
import { leadFlowApi, settingsApi } from '../../api';
import { CUSTOMER_LEVELS, RESOURCE_OWNERSHIPS, normalizeResourceOwnership } from '../../shared/utils/constants';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import PhoneNumberInput from '../../shared/components/PhoneNumberInput';
import type { Customer } from '../../types/customer';
import type { LeadFlowConfig } from '../../types/lead';
import type { CustomerLevelConfig, LeadSourceConfig, User } from '../../types/settings';
import { applyCurrentLeadInputBy, getCurrentLeadInputName } from '../../shared/utils/leadInputAttribution';
import { getPhoneNumberError, normalizePhoneForStorage } from '../../shared/utils/phoneNumber';
import { completeCityFromPhone } from '../../shared/utils/mobileCityAttribution';
import { getScopedLeadAssignmentCandidates } from '../../shared/utils/leadAssignment';
import useAuthStore from '../../store/useAuthStore';
import { formatEmployeeNameWithPosition } from '../../shared/utils/formatters';

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

const CustomerForm: React.FC<CustomerFormProps> = ({ open, onClose, customer, onSuccess }) => {
  const { create, update } = useCustomerStore();
  const currentUser = useAuthStore((state) => state.currentUser);
  const isEdit = !!customer;
  const [users, setUsers] = useState<User[]>([]);
  const [leadFlowConfig, setLeadFlowConfig] = useState<LeadFlowConfig | null>(null);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [customerLevelConfigs, setCustomerLevelConfigs] = useState<CustomerLevelConfig[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [submitting, setSubmitting] = useState(false);

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

  const defaultOwner = useMemo(() => getCurrentLeadInputName(users[0]?.name || ''), [users]);
  const assignableUsers = useMemo(
    () => getScopedLeadAssignmentCandidates(users, leadFlowConfig, 'customers', currentUser),
    [currentUser, leadFlowConfig, users],
  );
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
    ownerId: '',
    customerLevel: 'L1' as Customer['customerLevel'],
    originalSalesTransferBy: '',
    manualTagIds: [] as string[],
    remark: '',
  });

  useEffect(() => {
    if (!open) return;

    settingsApi.fetchAssignableUsers({ isActive: true }).then((res) => {
      if (res.code === 0) setUsers(res.data.filter((user) => user.isActive));
    });
    leadFlowApi.fetchLeadFlowConfig().then((res) => {
      if (res.code === 0) setLeadFlowConfig(res.data);
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
    const fallbackOwner = customer?.owner || assignableUsers[0]?.name || '';
    const fallbackOwnerId = customer?.ownerId || assignableUsers.find((user) => user.name === fallbackOwner)?.id || '';
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
      ownerId: fallbackOwnerId,
      customerLevel: customer?.customerLevel || 'L1',
      originalSalesTransferBy: customer?.originalSalesTransferBy || '',
      manualTagIds: customer?.manualTagIds || [],
      remark: customer?.remark || '',
    });
  }, [open, customer, assignableUsers, defaultOwner, sourceOptions]);

  const selectedSourceKey = sourceOptions.find((option) => (
    option.parentName === form.leadSource && option.childName === (form.sourceName || '')
  ))?.key || '';

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [field]: e.target.value });
  };

  const handlePhoneChange = (value: string) => {
    setForm((current) => ({
      ...current,
      phone: value,
      city: completeCityFromPhone(current.city, value),
    }));
  };

  const handleContributorSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const user = users.find((item) => item.id === e.target.value);
    setForm({
      ...form,
      leadContributorId: user?.id || '',
      leadContributorName: user?.name || '',
    });
  };

  const handleOwnerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const user = assignableUsers.find((item) => item.id === e.target.value);
    setForm({ ...form, ownerId: user?.id || '', owner: user?.name || '' });
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
    const payload = {
      ...form,
      phone: normalizePhoneForStorage(form.phone),
      city: completeCityFromPhone(form.city, form.phone),
      manualTagIds: form.manualTagIds,
      sourceType: normalizeResourceOwnership(form.sourceType),
    };

    setSubmitting(true);
    setSubmitError('');
    try {
      const saved = isEdit && customer
        ? await update(customer.id, payload)
        : await create(applyCurrentLeadInputBy(payload, 'leadInputBy'));
      if (!saved) return;
      onSuccess?.();
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '客户资料保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  const userOptions = users.map((user) => (
    <MenuItem key={user.id} value={user.name}>
      {formatEmployeeNameWithPosition(user)}
    </MenuItem>
  ));
  const ownerOptions = assignableUsers.map((user) => (
    <MenuItem key={user.id} value={user.id}>
      {formatEmployeeNameWithPosition(user)}
    </MenuItem>
  ));
  const shouldShowCurrentOwnerOption = form.owner && !assignableUsers.some((user) => user.id === form.ownerId);
  const missingContact = !form.phone.trim() && !form.wechat.trim();
  const phoneError = getPhoneNumberError(form.phone);
  const missingContributor = normalizeResourceOwnership(form.sourceType) === '个人资源' && !form.leadContributorName;
  const showContactError = !!form.name.trim() && missingContact;
  const canSubmit = !!form.name.trim() && !missingContact && !phoneError && !missingContributor && !!form.ownerId && !!form.leadInputBy && !!form.leadSource;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseTitle onClose={onClose}>{isEdit ? '编辑客户资料' : '新增客户'}</DialogCloseTitle>
      <DialogContent>
        {submitError && <Alert severity="error" sx={{ mt: 1 }}>{submitError}</Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}>
          <TextField label="姓名" value={form.name} onChange={handleChange('name')} required fullWidth />
          <TextField label="公司" value={form.company} onChange={handleChange('company')} fullWidth />
          <PhoneNumberInput
            label="手机号"
            value={form.phone}
            onChange={handlePhoneChange}
            error={showContactError}
            helperText={showContactError ? '手机号或微信至少填写一项' : ''}
            fullWidth
            size="small"
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
          {isEdit && (
            <TextField select label="线索录入人" value={form.leadInputBy} onChange={handleChange('leadInputBy')} required fullWidth helperText="默认当前登录人员">
              {userOptions}
            </TextField>
          )}
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
                {formatEmployeeNameWithPosition(user)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="销售负责人"
            value={form.ownerId}
            onChange={handleOwnerSelect}
            required
            fullWidth
            helperText={assignableUsers.length ? '候选人来自线索流转参与成员，并按当前角色的数据范围过滤' : '暂无可选负责人，请检查线索流转参与成员或当前角色的数据范围'}
          >
            {shouldShowCurrentOwnerOption && (
              <MenuItem value={form.ownerId}>
                {form.owner}（历史负责人）
              </MenuItem>
            )}
            {assignableUsers.length === 0 && (
              <MenuItem value="" disabled>
                当前角色数据范围内暂无可选负责人，请检查数据范围或线索流转参与成员配置。
              </MenuItem>
            )}
            {ownerOptions}
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
          <TextField label="备注" value={form.remark} onChange={handleChange('remark')} fullWidth multiline minRows={3} sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {isEdit ? '保存' : '创建'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomerForm;
