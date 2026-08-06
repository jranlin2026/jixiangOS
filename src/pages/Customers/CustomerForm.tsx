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
  Typography,
  useMediaQuery,
} from '@mui/material';
import type { Theme } from '@mui/material/styles';
import useCustomerStore from '../../store/useCustomerStore';
import { customerApi, productApi, settingsApi } from '../../api';
import { CUSTOMER_LEVELS, RESOURCE_OWNERSHIPS, normalizeResourceOwnership } from '../../shared/utils/constants';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import PhoneNumberInput from '../../shared/components/PhoneNumberInput';
import type { Customer, CustomerManageableUser } from '../../types/customer';
import type { Product } from '../../types/product';
import type { AfterSalesSourceConfig, CustomerLevelConfig, LeadSourceConfig } from '../../types/settings';
import { applyCurrentLeadInputBy, getCurrentLeadInputName } from '../../shared/utils/leadInputAttribution';
import { getPhoneNumberError, normalizePhoneForStorage } from '../../shared/utils/phoneNumber';
import { completeCityFromPhone } from '../../shared/utils/mobileCityAttribution';
import { formatEmployeeNameWithPosition } from '../../shared/utils/formatters';
import BusinessFormSection from '../../shared/components/BusinessFormSection';
import useAuthStore from '../../store/useAuthStore';
import BusinessSourceFields from '../../shared/components/BusinessSourceFields';

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
  const mobileFullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const isEdit = !!customer;
  const [users, setUsers] = useState<CustomerManageableUser[]>([]);
  const [contributorUsers, setContributorUsers] = useState<CustomerManageableUser[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [businessSourceConfigs, setBusinessSourceConfigs] = useState<AfterSalesSourceConfig[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
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

  const currentOwnerUser = users.find((user) => user.id === currentUser?.id);
  const defaultOwner = useMemo(
    () => getCurrentLeadInputName(currentUser?.name || currentOwnerUser?.name || ''),
    [currentOwnerUser?.name, currentUser?.name],
  );
  const assignableUsers = users;
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
    sourcePlatformId: '',
    sourcePlatformName: '',
    sourceShopId: '',
    sourceShopName: '',
    platformOrderNo: '',
    sourceProductId: '',
    sourceProductName: '',
    sourcePaymentAmount: '',
    sourcePaymentAt: '',
  });

  useEffect(() => {
    if (!open) return;

    customerApi.fetchManageableUsers().then((res) => {
      setUsers(res.code === 0 ? res.data : []);
    });
    customerApi.fetchContributorUsers().then((res) => {
      setContributorUsers(res.code === 0 ? res.data : []);
    });
    settingsApi.fetchLeadSourceConfigs().then((res) => {
      if (res.code === 0) setSourceConfigs(res.data.filter((item) => item.isActive));
    });
    settingsApi.fetchAfterSalesSourceConfigs().then((res) => {
      setBusinessSourceConfigs(res.code === 0 ? res.data : []);
    });
    productApi.getProducts().then((res) => {
      setProducts(res.code === 0 ? res.data : []);
    });
    settingsApi.fetchCustomerLevelConfigs().then((res) => {
      if (res.code === 0) setCustomerLevelConfigs(res.data);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const defaultSourceOption = sourceOptions[0];
    const fallbackOwner = customer?.owner || currentOwnerUser?.name || currentUser?.name || '';
    const fallbackOwnerId = customer?.ownerId || currentOwnerUser?.id || currentUser?.id || '';
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
      sourcePlatformId: customer?.sourcePlatformId || '',
      sourcePlatformName: customer?.sourcePlatformName || '',
      sourceShopId: customer?.sourceShopId || '',
      sourceShopName: customer?.sourceShopName || '',
      platformOrderNo: customer?.platformOrderNo || '',
      sourceProductId: customer?.sourceProductId || '',
      sourceProductName: customer?.sourceProductName || '',
      sourcePaymentAmount: customer?.sourcePaymentAmount == null ? '' : String(customer.sourcePaymentAmount),
      sourcePaymentAt: customer?.sourcePaymentAt || '',
    });
  }, [open, customer, currentOwnerUser?.id, currentOwnerUser?.name, currentUser?.id, currentUser?.name, defaultOwner, sourceOptions]);

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
    const user = contributorUsers.find((item) => item.id === e.target.value);
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
      sourcePaymentAmount: form.sourcePaymentAmount === '' ? (isEdit ? null : undefined) : Number(form.sourcePaymentAmount),
      sourcePaymentAt: form.sourcePaymentAt ? new Date(form.sourcePaymentAt).toISOString() : (isEdit ? null : undefined),
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

  const userOptions = contributorUsers.map((user) => (
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
  const sourcePaymentAmountError = form.sourcePaymentAmount !== ''
    && (!Number.isFinite(Number(form.sourcePaymentAmount)) || Number(form.sourcePaymentAmount) < 0);
  const showContactError = !!form.name.trim() && missingContact;
  const canSubmit = !!form.name.trim() && !missingContact && !phoneError && !missingContributor
    && !sourcePaymentAmountError && !!form.ownerId && !!form.leadInputBy && !!form.leadSource;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={mobileFullScreen}
      PaperProps={{ sx: { maxHeight: { xs: '100dvh', sm: '94vh' }, bgcolor: isEdit ? '#fff' : '#f8fafc' } }}
    >
      <DialogCloseTitle onClose={onClose} sx={!isEdit ? { px: { xs: 2, sm: 3 }, py: 2.25, bgcolor: '#fff' } : undefined}>
        {!isEdit ? (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 850 }}>新增客户</Typography>
            <Typography variant="body2" sx={{ mt: 0.35, color: '#64748b' }}>录入客户联系方式、来源归属和销售负责人，创建后进入客户管理。</Typography>
          </Box>
        ) : '编辑客户资料'}
      </DialogCloseTitle>
      <DialogContent sx={!isEdit ? { px: { xs: 1.5, sm: 3 }, py: 2.5, bgcolor: '#f8fafc' } : undefined}>
        {submitError && <Alert severity="error" sx={{ mt: 1 }}>{submitError}</Alert>}
        {!isEdit ? (
          <Box sx={{ pt: 1 }}>
            <BusinessFormSection
              step={1}
              solidStep
              title="客户信息"
              summary={[form.name || '待填写姓名', form.customerLevel, form.city].filter(Boolean).join(' / ')}
            >
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
              <TextField label="行业" value={form.industry} onChange={handleChange('industry')} fullWidth />
              <TextField label="城市" value={form.city} onChange={handleChange('city')} fullWidth />
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
              <TextField select label="首个销售负责人" value={form.originalSalesTransferBy} onChange={handleChange('originalSalesTransferBy')} helperText="记录客户最初的销售负责人" fullWidth>
                <MenuItem value="">无</MenuItem>
                {userOptions}
              </TextField>
            </BusinessFormSection>

            <BusinessFormSection
              step={2}
              solidStep
              title="来源与分配"
              summary={[normalizeResourceOwnership(form.sourceType), form.leadSource, form.owner || '待选择销售负责人'].filter(Boolean).join(' / ')}
            >
              <TextField select label="资源归属" value={form.sourceType} onChange={handleChange('sourceType')} fullWidth>
                {RESOURCE_OWNERSHIPS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
              </TextField>
              <TextField select label="线索来源" value={selectedSourceKey} onChange={handleSourceSelect} required fullWidth>
                <MenuItem value="" disabled>请选择线索来源</MenuItem>
                {parentSources.flatMap((parent) => {
                  const options = sourceOptions.filter((option) => option.parentId === parent.id);
                  return [
                    <MenuItem key={`${parent.id}-group`} disabled sx={{ fontWeight: 700, color: 'text.primary' }}>{parent.name}</MenuItem>,
                    ...options.map((option) => <MenuItem key={option.key} value={option.key} sx={{ pl: 4 }}>{option.label}</MenuItem>),
                  ];
                })}
              </TextField>
              <TextField
                select
                label="线索贡献人"
                value={form.leadContributorId}
                onChange={handleContributorSelect}
                required={normalizeResourceOwnership(form.sourceType) === '个人资源'}
                helperText={missingContributor ? '个人资源必须填写线索贡献人' : '用于线索分成归属，可与录入人不同'}
                error={missingContributor}
                fullWidth
              >
                <MenuItem value="">无</MenuItem>
                {contributorUsers.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
              </TextField>
              <TextField
                select
                label="销售负责人"
                value={form.ownerId}
                onChange={handleOwnerSelect}
                required
                fullWidth
                helperText={assignableUsers.length ? '候选人已按当前角色的客户数据范围过滤' : '当前客户数据范围内暂无可选负责人'}
              >
                {assignableUsers.length === 0 && <MenuItem value="" disabled>当前角色数据范围内暂无可选负责人</MenuItem>}
                {ownerOptions}
              </TextField>
            </BusinessFormSection>

            <BusinessFormSection step={3} solidStep title="补充信息" summary={[form.sourcePlatformName, form.sourceShopName, form.sourceProductName, form.sourcePaymentAmount ? `¥${form.sourcePaymentAmount}` : '', form.remark ? '已填写备注' : ''].filter(Boolean).join(' / ') || '无补充信息'}>
              <BusinessSourceFields
                configs={businessSourceConfigs}
                products={products}
                value={form}
                includePaymentTime
                includePurchaseSnapshot
                onChange={(value) => setForm((current) => ({ ...current, ...value }))}
              />
              <TextField label="备注" value={form.remark} onChange={handleChange('remark')} fullWidth multiline minRows={3} sx={{ gridColumn: '1 / -1' }} />
            </BusinessFormSection>
          </Box>
        ) : (
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
          <BusinessSourceFields
            configs={businessSourceConfigs}
            products={products}
            value={form}
            includePaymentTime
            includePurchaseSnapshot
            onChange={(value) => setForm((current) => ({ ...current, ...value }))}
          />
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
            {contributorUsers.map((user) => (
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
            helperText={assignableUsers.length ? '候选人已按当前角色的客户数据范围过滤' : '当前客户数据范围内暂无可选负责人'}
          >
            {shouldShowCurrentOwnerOption && (
              <MenuItem value={form.ownerId}>
                {form.owner}（历史负责人）
              </MenuItem>
            )}
            {assignableUsers.length === 0 && (
              <MenuItem value="" disabled>
                当前客户数据范围内暂无可选负责人。
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
          <TextField
            select
            label="首个销售负责人"
            value={form.originalSalesTransferBy}
            onChange={handleChange('originalSalesTransferBy')}
            helperText="记录客户最初的销售负责人，不随后续转让或进入公海自动变更"
            fullWidth
          >
            <MenuItem value="">无</MenuItem>
            {userOptions}
          </TextField>
          <TextField label="备注" value={form.remark} onChange={handleChange('remark')} fullWidth multiline minRows={3} sx={{ gridColumn: '1 / -1' }} />
        </Box>
        )}
      </DialogContent>
      <DialogActions sx={!isEdit ? { px: { xs: 2, sm: 3 }, py: 2, bgcolor: '#fff', borderTop: '1px solid #e2e8f0' } : undefined}>
        {!isEdit ? <Button onClick={onClose}>取消</Button> : null}
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {isEdit ? '保存' : '创建客户'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomerForm;
