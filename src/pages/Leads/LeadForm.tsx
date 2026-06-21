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
import useLeadStore from '../../store/useLeadStore';
import type { Lead } from '../../types/lead';
import type { LeadSourceConfig, User } from '../../types/settings';
import { roleApi, settingsApi } from '../../api';
import { RESOURCE_OWNERSHIPS, normalizeResourceOwnership } from '../../shared/utils/constants';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import { canReceiveLead } from '../../shared/utils/permissions';
import type { Role } from '../../types/role';
import { applyCurrentLeadInputBy, getCurrentLeadInputName } from '../../shared/utils/leadInputAttribution';

interface LeadFormProps {
  open: boolean;
  onClose: () => void;
  lead?: Lead | null;
  onSuccess?: () => void;
}

const LeadForm: React.FC<LeadFormProps> = ({ open, onClose, lead, onSuccess }) => {
  const { create, update } = useLeadStore();
  const isEdit = Boolean(lead);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [submitError, setSubmitError] = useState('');

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
    wechat: '',
    source: '',
    sourceName: '',
    owner: '待分配',
    inputBy: '',
    leadContributorId: '',
    leadContributorName: '',
    industry: '',
    city: '',
    sourceType: '公司资源',
    tags: '',
    remark: '',
  });

  useEffect(() => {
    settingsApi.fetchLeadSourceConfigs().then((res) => {
      if (res.code === 0) setSourceConfigs(res.data.filter((item) => item.isActive));
    });
    settingsApi.fetchUsers({ isActive: true }).then((res) => {
      if (res.code === 0) setUsers(res.data.filter((user) => user.isActive));
    });
    roleApi.getRoles({ isActive: true }).then((res) => {
      if (res.code === 0) setRoles(res.data);
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const defaultSourceOption = sourceOptions[0];
    const defaultSource = lead?.source || defaultSourceOption?.parentName || '';
    const defaultSourceName = lead?.sourceName || defaultSourceOption?.childName || '';
    const defaultInputBy = lead?.inputBy || getCurrentLeadInputName(users.find((user) => user.isActive)?.name || '');
    setSubmitError('');
    setForm({
      name: lead?.name || '',
      company: lead?.company || '',
      phone: lead?.phone || '',
      wechat: lead?.wechat || '',
      source: defaultSource,
      sourceName: defaultSourceName,
      owner: lead?.owner || '待分配',
      inputBy: defaultInputBy,
      leadContributorId: lead?.leadContributorId || '',
      leadContributorName: lead?.leadContributorName || '',
      industry: lead?.industry || '',
      city: lead?.city || '',
      sourceType: normalizeResourceOwnership(lead?.sourceType),
      tags: lead?.tags?.join(', ') || '',
      remark: lead?.remark || '',
    });
  }, [open, lead, sourceOptions, users]);

  const salesUsers = users.filter((user) => canReceiveLead(user, roles));
  const selectedSourceKey = sourceOptions.find((option) => (
    option.parentName === form.source && option.childName === (form.sourceName || '')
  ))?.key || '';

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
    const tags = form.tags ? form.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [];
    const payload = {
      ...form,
      sourceType: normalizeResourceOwnership(form.sourceType),
      status: lead?.status || '新线索',
      tags,
    };
    setSubmitError('');

    if (isEdit && lead) {
      await update(lead.id, payload);
      onSuccess?.();
      onClose();
      return;
    }

    const createPayload = applyCurrentLeadInputBy(payload, 'inputBy');
    const res = await create(createPayload);
    if (res.code !== 0) {
      setSubmitError(res.message || '入库失败');
      onSuccess?.();
      return;
    }
    onSuccess?.();
    onClose();
  };

  const missingContact = !form.phone.trim() && !form.wechat.trim();
  const missingContributor = normalizeResourceOwnership(form.sourceType) === '个人资源' && !form.leadContributorName;
  const showContactError = !isEdit && !!form.name.trim() && missingContact;
  const canSubmit = !!form.name.trim() && !missingContact && !missingContributor && !!form.source && !!form.inputBy;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogCloseTitle onClose={onClose}>{isEdit ? '编辑线索资料' : '新增线索入库'}</DialogCloseTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          {submitError && (
            <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>
              {submitError}
            </Alert>
          )}
          <TextField label="姓名" value={form.name} onChange={handleChange('name')} required fullWidth />
          <TextField label="公司" value={form.company} onChange={handleChange('company')} fullWidth />
          <TextField
            label="手机号"
            value={form.phone}
            onChange={handleChange('phone')}
            error={showContactError}
            fullWidth
            helperText={isEdit ? '唯一识别字段，入库后不可修改' : showContactError ? '手机号或微信至少填写一项' : ''}
            InputProps={{ readOnly: isEdit }}
          />
          <TextField
            label="微信"
            value={form.wechat}
            onChange={handleChange('wechat')}
            error={showContactError}
            fullWidth
            helperText={isEdit ? '唯一识别字段，入库后不可修改' : showContactError ? '手机号或微信至少填写一项' : '用于查重和客户同步'}
            InputProps={{ readOnly: isEdit }}
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
            <TextField select label="线索录入人" value={form.inputBy} onChange={handleChange('inputBy')} fullWidth helperText="默认当前登录人员">
              {users.map((user) => (
                <MenuItem key={user.id} value={user.name}>{user.name}</MenuItem>
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
              <MenuItem key={user.id} value={user.id}>{user.name}（{user.positionName || '未设置职位'}）</MenuItem>
            ))}
          </TextField>
          <TextField select label="分配销售" value={form.owner} onChange={handleChange('owner')} fullWidth helperText="开启自动分配时会按流转规则覆盖">
            <MenuItem value="待分配">待分配</MenuItem>
            {salesUsers.map((user) => (
              <MenuItem key={user.id} value={user.name}>{user.name}（{user.positionName || '未设置职位'}）</MenuItem>
            ))}
          </TextField>
          <TextField label="标签（逗号分隔）" value={form.tags} onChange={handleChange('tags')} fullWidth sx={{ gridColumn: '1 / -1' }} />
          <TextField label="备注" value={form.remark} onChange={handleChange('remark')} fullWidth multiline minRows={3} sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button variant="contained" onClick={handleSubmit} disabled={!canSubmit}>
          {isEdit ? '保存' : '入库'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LeadForm;
