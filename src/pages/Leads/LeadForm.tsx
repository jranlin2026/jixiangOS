import React, { useEffect, useMemo, useState } from 'react';
import {
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
import useLeadStore from '../../store/useLeadStore';
import type { Lead } from '../../types/lead';
import type { Product } from '../../types/product';
import type { AfterSalesSourceConfig, LeadSourceConfig, User } from '../../types/settings';
import { leadFlowApi, productApi, settingsApi } from '../../api';
import { RESOURCE_OWNERSHIPS, normalizeResourceOwnership } from '../../shared/utils/constants';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import ContactPhoneFields from '../../shared/components/ContactPhoneFields';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { applyCurrentLeadInputBy, getCurrentLeadInputName } from '../../shared/utils/leadInputAttribution';
import {
  alternateContactPhone,
  contactPhonesFromValues,
  getContactPhoneValuesError,
} from '../../shared/utils/contactPhones';
import useAuthStore from '../../store/useAuthStore';
import type { LeadFlowConfig } from '../../types/lead';
import { getScopedLeadAssignmentCandidates } from '../../shared/utils/leadAssignment';
import { formatEmployeeNameWithPosition } from '../../shared/utils/formatters';
import BusinessFormSection from '../../shared/components/BusinessFormSection';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import useProtectedFormClose from '../../shared/hooks/useProtectedFormClose';
import BusinessSourceFields from '../../shared/components/BusinessSourceFields';
import { normalizeOptionalSocialProfileFields } from '../../shared/utils/socialProfile';

interface LeadFormProps {
  open: boolean;
  onClose: () => void;
  lead?: Lead | null;
  onSuccess?: () => void;
}

const LeadForm: React.FC<LeadFormProps> = ({ open, onClose, lead, onSuccess }) => {
  const { create, update } = useLeadStore();
  const currentUser = useAuthStore((state) => state.currentUser);
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const mobileFullScreen = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
  const isEdit = Boolean(lead);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [businessSourceConfigs, setBusinessSourceConfigs] = useState<AfterSalesSourceConfig[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [leadFlowConfig, setLeadFlowConfig] = useState<LeadFlowConfig | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const parentSources = useMemo(
    () => sourceConfigs.filter((item) => !item.parentId && item.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [sourceConfigs],
  );
  const childSources = useMemo(
    () => sourceConfigs.filter((item) => item.parentId && item.isActive).sort((a, b) => a.sortOrder - b.sortOrder),
    [sourceConfigs],
  );
  const sourceOptions = useMemo(() => {
    return parentSources.flatMap((parent) => {
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
    });
  }, [parentSources, childSources]);

  const [form, setForm] = useState({
    name: '',
    company: '',
    phone: '',
    alternatePhone: '',
    wechat: '',
    wechatNickname: '',
    douyinId: '',
    douyinNickname: '',
    source: '',
    sourceName: '',
    owner: '待分配',
    inputBy: '',
    leadContributorId: '',
    leadContributorName: '',
    industry: '',
    city: '',
    sourceType: '公司资源',
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

    settingsApi.fetchLeadSourceConfigs().then((res) => {
      if (res.code === 0) {
        setSourceConfigs(res.data.filter((item) => item.isActive));
        return;
      }
      setSourceConfigs([]);
      void alert(res.message || '线索来源读取失败，请联系系统管理员。', '线索来源读取失败');
    });
    settingsApi.fetchAfterSalesSourceConfigs().then((res) => {
      setBusinessSourceConfigs(res.code === 0 ? res.data : []);
    });
    productApi.getProducts().then((res) => {
      setProducts(res.code === 0 ? res.data : []);
    });
    settingsApi.fetchAssignableUsers({ isActive: true }).then((res) => {
      if (res.code === 0) setUsers(res.data.filter((user) => user.isActive));
    });
    leadFlowApi.fetchLeadFlowConfig().then((res) => {
      if (res.code === 0) setLeadFlowConfig(res.data);
    });
  }, [alert, open]);

  useEffect(() => {
    if (!open) return;
    const defaultSourceOption = sourceOptions[0];
    const defaultSource = lead?.source || defaultSourceOption?.parentName || '';
    const defaultSourceName = lead?.sourceName || defaultSourceOption?.childName || '';
    const defaultInputBy = lead?.inputBy || getCurrentLeadInputName(users.find((user) => user.isActive)?.name || '');
    setForm({
      name: lead?.name || '',
      company: lead?.company || '',
      phone: lead?.phone || '',
      alternatePhone: alternateContactPhone(lead?.phone, lead?.phones),
      wechat: lead?.wechat || '',
      wechatNickname: lead?.wechatNickname || '',
      douyinId: lead?.douyinId || '',
      douyinNickname: lead?.douyinNickname || '',
      source: defaultSource,
      sourceName: defaultSourceName,
      owner: lead?.owner || '待分配',
      inputBy: defaultInputBy,
      leadContributorId: lead?.leadContributorId || '',
      leadContributorName: lead?.leadContributorName || '',
      industry: lead?.industry || '',
      city: lead?.city || '',
      sourceType: normalizeResourceOwnership(lead?.sourceType),
      remark: lead?.remark || '',
      sourcePlatformId: lead?.sourcePlatformId || '',
      sourcePlatformName: lead?.sourcePlatformName || '',
      sourceShopId: lead?.sourceShopId || '',
      sourceShopName: lead?.sourceShopName || '',
      platformOrderNo: lead?.platformOrderNo || '',
      sourceProductId: lead?.sourceProductId || '',
      sourceProductName: lead?.sourceProductName || '',
      sourcePaymentAmount: lead?.sourcePaymentAmount == null ? '' : String(lead.sourcePaymentAmount),
      sourcePaymentAt: lead?.sourcePaymentAt || '',
    });
  }, [open, lead, sourceOptions, users]);

  const canAssignLeads = hasPermission(currentUser, PERMISSION_KEYS.LEADS_FLOW_CONFIG);
  const assignableUsers = getScopedLeadAssignmentCandidates(users, leadFlowConfig, 'leads', currentUser);
  const selectedSourceKey = sourceOptions.find((option) => (
    option.parentName === form.source && option.childName === (form.sourceName || '')
  ))?.key || '';
  const assignmentHelpText = !canAssignLeads
    ? isEdit ? '当前角色无分配权限，保存时不会修改分配销售' : '当前角色无分配权限，入库后等待分配'
    : assignableUsers.length
      ? '候选人来自线索流转参与成员，并按当前角色的数据范围过滤'
      : '暂无可分配成员，请检查线索流转参与成员或当前角色的数据范围';

  const handleChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [field]: event.target.value });
  };

  const handleContributorSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const user = users.find((item) => item.id === event.target.value);
    setForm({
      ...form,
      leadContributorId: user?.id || '',
      leadContributorName: user?.name || '',
    });
  };

  const handleSourceSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const option = sourceOptions.find((item) => item.key === event.target.value);
    if (!option) {
      setForm({ ...form, source: '', sourceName: '' });
      return;
    }
    setForm({ ...form, source: option.parentName, sourceName: option.childName });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const phones = contactPhonesFromValues(form.phone, form.alternatePhone);
      const effectiveOwner = canAssignLeads
        ? form.owner
        : isEdit
          ? (lead?.assignedTo || lead?.owner || '待分配')
          : '待分配';
      const payload = normalizeOptionalSocialProfileFields({
        ...form,
        alternatePhone: undefined,
        owner: effectiveOwner,
        assignedTo: effectiveOwner === '待分配' ? undefined : effectiveOwner,
        phone: phones[0]?.number || '',
        phones,
        sourcePaymentAmount: form.sourcePaymentAmount === '' ? (isEdit ? null : undefined) : Number(form.sourcePaymentAmount),
        sourcePaymentAt: form.sourcePaymentAt ? new Date(form.sourcePaymentAt).toISOString() : (isEdit ? null : undefined),
        sourceType: normalizeResourceOwnership(form.sourceType),
        status: lead?.status || '新线索',
      });
      if (isEdit && lead) {
        await update(lead.id, payload);
        onSuccess?.();
        onClose();
        return;
      }

      const createPayload = applyCurrentLeadInputBy(payload, 'inputBy');
      const res = await create(createPayload);
      if (res.code !== 0) {
        await alert(res.message || '线索入库失败', '无法新增线索');
        return;
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      await alert(
        error instanceof Error ? error.message : '线索资料保存失败',
        isEdit ? '无法保存线索资料' : '无法新增线索',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const missingContact = !form.phone.trim() && !form.alternatePhone.trim() && !form.wechat.trim();
  const phoneError = getContactPhoneValuesError(form.phone, form.alternatePhone);
  const missingContributor = normalizeResourceOwnership(form.sourceType) === '个人资源' && !form.leadContributorName;
  const sourcePaymentAmountError = form.sourcePaymentAmount !== ''
    && (!Number.isFinite(Number(form.sourcePaymentAmount)) || Number(form.sourcePaymentAmount) < 0);
  const showContactError = !isEdit && !!form.name.trim() && missingContact;
  const canSubmit = !!form.name.trim() && !missingContact && !phoneError && !missingContributor
    && !sourcePaymentAmountError && !!form.source && !!form.inputBy;
  const protectedClose = useProtectedFormClose({
    open,
    submitting,
    resetKey: lead?.id || 'new-lead',
    onClose,
  });

  return (
    <>
      <Dialog
        open={open}
        onClose={protectedClose.handleDialogClose}
        disableEscapeKeyDown
        maxWidth="md"
        fullWidth
        fullScreen={mobileFullScreen}
        PaperProps={{ sx: { maxHeight: { xs: '100dvh', sm: '94vh' }, bgcolor: isEdit ? '#fff' : '#f8fafc' } }}
      >
      <DialogCloseTitle onClose={() => void protectedClose.requestClose()} closeDisabled={submitting} sx={!isEdit ? { px: { xs: 2, sm: 3 }, py: 2.25, bgcolor: '#fff' } : undefined}>
        {!isEdit ? (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h6" sx={{ color: '#0f172a', fontWeight: 850 }}>新增线索入库</Typography>
            <Typography variant="body2" sx={{ mt: 0.35, color: '#64748b' }}>录入客户信息、来源与分配信息，入库后进入线索管理。</Typography>
          </Box>
        ) : '编辑线索资料'}
      </DialogCloseTitle>
      <DialogContent {...protectedClose.interactionProps} sx={!isEdit ? { px: { xs: 1.5, sm: 3 }, py: 2.5, bgcolor: '#f8fafc' } : undefined}>
        {!isEdit ? (
          <Box sx={{ pt: 1 }}>
            <BusinessFormSection
              step={1}
              solidStep
              title="客户信息"
              summary={[form.name || '待填写姓名', form.company, form.city].filter(Boolean).join(' / ')}
            >
              <TextField label="姓名" value={form.name} onChange={handleChange('name')} required fullWidth />
              <TextField label="公司" value={form.company} onChange={handleChange('company')} fullWidth />
              <ContactPhoneFields
                primaryPhone={form.phone}
                alternatePhone={form.alternatePhone}
                onPrimaryChange={(value) => setForm((current) => ({ ...current, phone: value }))}
                onAlternateChange={(value) => setForm((current) => ({ ...current, alternatePhone: value }))}
                error={Boolean(showContactError || phoneError)}
                helperText={phoneError || (showContactError ? '手机号或微信至少填写一项' : '')}
                size="small"
              />
              <Typography variant="overline" sx={{ gridColumn: '1 / -1', color: '#64748b', fontWeight: 800 }}>社交账号</Typography>
              <TextField label="微信号" value={form.wechat} onChange={handleChange('wechat')} error={showContactError} helperText={showContactError ? '手机号或微信至少填写一项' : '用于查重和客户同步'} fullWidth />
              <TextField label="微信昵称" value={form.wechatNickname} onChange={handleChange('wechatNickname')} inputProps={{ maxLength: 100 }} fullWidth />
              <TextField label="抖音号" value={form.douyinId} onChange={handleChange('douyinId')} inputProps={{ maxLength: 100 }} fullWidth />
              <TextField label="抖音昵称" value={form.douyinNickname} onChange={handleChange('douyinNickname')} inputProps={{ maxLength: 100 }} fullWidth />
              <TextField label="行业" value={form.industry} onChange={handleChange('industry')} fullWidth />
              <TextField label="城市" value={form.city} onChange={handleChange('city')} fullWidth />
            </BusinessFormSection>

            <BusinessFormSection
              step={2}
              solidStep
              title="来源与分配"
              summary={[normalizeResourceOwnership(form.sourceType), form.source, form.owner || '待分配'].filter(Boolean).join(' / ')}
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
                {users.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
              </TextField>
              {canAssignLeads ? (
                <TextField select label="分配销售" value={form.owner} onChange={handleChange('owner')} fullWidth helperText={assignmentHelpText}>
                  <MenuItem value="待分配">待分配</MenuItem>
                  {assignableUsers.map((user) => <MenuItem key={user.id} value={user.name}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
                </TextField>
              ) : (
                <TextField label="分配销售" value="待分配" fullWidth InputProps={{ readOnly: true }} helperText={assignmentHelpText} />
              )}
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
          <ContactPhoneFields
            primaryPhone={form.phone}
            alternatePhone={form.alternatePhone}
            onPrimaryChange={(value) => setForm((current) => ({ ...current, phone: value }))}
            onAlternateChange={(value) => setForm((current) => ({ ...current, alternatePhone: value }))}
            error={Boolean(showContactError || phoneError)}
            size="small"
            helperText={phoneError || (isEdit ? '唯一识别字段，入库后不可修改' : showContactError ? '手机号或微信至少填写一项' : '')}
            readOnly={isEdit}
          />
          <Typography variant="overline" sx={{ gridColumn: '1 / -1', color: '#64748b', fontWeight: 800 }}>社交账号</Typography>
          <TextField
            label="微信号"
            value={form.wechat}
            onChange={handleChange('wechat')}
            error={showContactError}
            fullWidth
            helperText={isEdit ? '唯一识别字段，入库后不可修改' : showContactError ? '手机号或微信至少填写一项' : '用于查重和客户同步'}
            InputProps={{ readOnly: isEdit }}
          />
          <TextField label="微信昵称" value={form.wechatNickname} onChange={handleChange('wechatNickname')} inputProps={{ maxLength: 100 }} fullWidth />
          <TextField label="抖音号" value={form.douyinId} onChange={handleChange('douyinId')} inputProps={{ maxLength: 100 }} fullWidth />
          <TextField label="抖音昵称" value={form.douyinNickname} onChange={handleChange('douyinNickname')} inputProps={{ maxLength: 100 }} fullWidth />
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
            <TextField select label="线索录入人" value={form.inputBy} onChange={handleChange('inputBy')} fullWidth helperText="默认当前登录人员">
              {users.map((user) => (
                <MenuItem key={user.id} value={user.name}>{formatEmployeeNameWithPosition(user)}</MenuItem>
              ))}
            </TextField>
          )}
          <TextField
            select
            label="线索贡献人"
            value={form.leadContributorId}
            onChange={handleContributorSelect}
            fullWidth
            required={normalizeResourceOwnership(form.sourceType) === '个人资源'}
            helperText={missingContributor ? '个人资源必须填写线索贡献人' : '用于线索分成归属，可与录入人不同'}
            error={missingContributor}
          >
            <MenuItem value="">无</MenuItem>
            {users.map((user) => (
              <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>
            ))}
          </TextField>
          {canAssignLeads ? (
            <TextField
              select
              label="分配销售"
              value={form.owner}
              onChange={handleChange('owner')}
              fullWidth
              helperText={assignmentHelpText}
            >
              <MenuItem value="待分配">待分配</MenuItem>
              {assignableUsers.map((user) => (
                <MenuItem key={user.id} value={user.name}>{formatEmployeeNameWithPosition(user)}</MenuItem>
              ))}
            </TextField>
          ) : (
            <TextField
              label="分配销售"
              value={isEdit ? (lead?.assignedTo || lead?.owner || '待分配') : '待分配'}
              fullWidth
              InputProps={{ readOnly: true }}
              helperText={assignmentHelpText}
            />
          )}
          <TextField label="备注" value={form.remark} onChange={handleChange('remark')} fullWidth multiline minRows={3} sx={{ gridColumn: '1 / -1' }} />
        </Box>
        )}
      </DialogContent>
      <DialogActions sx={!isEdit ? { px: { xs: 2, sm: 3 }, py: 2, bgcolor: '#fff', borderTop: '1px solid #e2e8f0' } : undefined}>
        {!isEdit ? <Button onClick={() => void protectedClose.requestClose()} disabled={submitting}>取消</Button> : null}
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit || submitting}>
          {isEdit ? '保存' : '确认入库'}
        </Button>
      </DialogActions>
      </Dialog>
      {feedbackDialog}
      {protectedClose.dialog}
    </>
  );
};

export default LeadForm;
