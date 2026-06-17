import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
} from '@mui/material';
import useLeadStore from '../../store/useLeadStore';
import type { Lead } from '../../types/lead';
import type { LeadSourceConfig, LifecycleStatusConfig, User } from '../../types/settings';
import { settingsApi } from '../../api';

const INDUSTRIES = ['互联网', '教育', '金融', '制造', '零售', '医疗', '科技', '其他'];
const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '其他'];
const CURRENT_USER_STORAGE_KEY = 'aaos_current_user';

interface LeadFormProps {
  open: boolean;
  onClose: () => void;
  lead?: Lead | null;
  onSuccess?: () => void;
}

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

const LeadForm: React.FC<LeadFormProps> = ({ open, onClose, lead, onSuccess }) => {
  const { create, update } = useLeadStore();
  const isEdit = Boolean(lead);
  const [lifecycleConfigs, setLifecycleConfigs] = useState<LifecycleStatusConfig[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
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
    email: '',
    wechat: '',
    source: '',
    sourceName: '',
    lifecycleStatus: '未转商机',
    owner: '待分配',
    inputBy: '',
    estimatedAmount: 899,
    industry: '',
    city: '',
    sourceType: '公司资源',
    tags: '',
    remark: '',
  });

  useEffect(() => {
    settingsApi.fetchLifecycleStatusConfigs().then((res) => {
      if (res.code === 0) setLifecycleConfigs(res.data.filter((item) => item.isActive));
    });
    settingsApi.fetchLeadSourceConfigs().then((res) => {
      if (res.code === 0) setSourceConfigs(res.data.filter((item) => item.isActive));
    });
    settingsApi.fetchUsers({ isActive: true }).then((res) => {
      if (res.code === 0) setUsers(res.data.filter((user) => user.isActive));
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const defaultSourceOption = sourceOptions[0];
    const defaultSource = lead?.source || defaultSourceOption?.parentName || '';
    const defaultSourceName = lead?.sourceName || defaultSourceOption?.childName || '';
    const defaultInputBy = lead?.inputBy || getCurrentUserName(users);
    setSubmitError('');
    setForm({
      name: lead?.name || '',
      company: lead?.company || '',
      phone: lead?.phone || '',
      email: lead?.email || '',
      wechat: lead?.wechat || '',
      source: defaultSource,
      sourceName: defaultSourceName,
      lifecycleStatus: lead?.lifecycleStatus || '未转商机',
      owner: lead?.owner || '待分配',
      inputBy: defaultInputBy,
      estimatedAmount: lead?.estimatedAmount || 899,
      industry: lead?.industry || '',
      city: lead?.city || '',
      sourceType: lead?.sourceType || '公司资源',
      tags: lead?.tags?.join(', ') || '',
      remark: lead?.remark || '',
    });
  }, [open, lead, sourceOptions, users]);

  const salesUsers = users.filter((user) => user.role === '销售' || user.role === '销售经理');
  const selectedSourceKey = sourceOptions.find((option) => (
    option.parentName === form.source && option.childName === (form.sourceName || '')
  ))?.key || '';

  const handleChange = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [field]: event.target.value });
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
      status: lead?.status || '新线索',
      estimatedAmount: Number(form.estimatedAmount),
      tags,
    };
    setSubmitError('');

    if (isEdit && lead) {
      await update(lead.id, payload);
      onSuccess?.();
      onClose();
      return;
    }

    const res = await create(payload);
    if (res.code !== 0) {
      setSubmitError(res.message || '入库失败');
      onSuccess?.();
      return;
    }
    onSuccess?.();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? '编辑线索资料' : '新增线索入库'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          {submitError && (
            <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>
              {submitError}
            </Alert>
          )}
          <TextField label="姓名" value={form.name} onChange={handleChange('name')} required fullWidth />
          <TextField label="公司" value={form.company} onChange={handleChange('company')} fullWidth />
          <TextField label="手机号" value={form.phone} onChange={handleChange('phone')} fullWidth helperText="手机号或微信至少填写一项" />
          <TextField label="微信" value={form.wechat} onChange={handleChange('wechat')} fullWidth helperText="用于查重和客户同步" />
          <TextField label="邮箱" value={form.email} onChange={handleChange('email')} fullWidth />
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
          <TextField select label="生命周期状态" value={form.lifecycleStatus} onChange={handleChange('lifecycleStatus')} fullWidth helperText="录入初始状态；后续由销售流程自动更新">
            {lifecycleConfigs.map((status) => (
              <MenuItem key={status.id} value={status.name}>{status.name}</MenuItem>
            ))}
          </TextField>
          <TextField select label="行业" value={form.industry} onChange={handleChange('industry')} fullWidth>
            <MenuItem value="">请选择</MenuItem>
            {INDUSTRIES.map((industry) => (
              <MenuItem key={industry} value={industry}>{industry}</MenuItem>
            ))}
          </TextField>
          <TextField select label="城市" value={form.city} onChange={handleChange('city')} fullWidth>
            <MenuItem value="">请选择</MenuItem>
            {CITIES.map((city) => (
              <MenuItem key={city} value={city}>{city}</MenuItem>
            ))}
          </TextField>
          <TextField select label="资源类型" value={form.sourceType} onChange={handleChange('sourceType')} fullWidth>
            <MenuItem value="公司资源">公司资源</MenuItem>
            <MenuItem value="自拓">自拓</MenuItem>
            <MenuItem value="转介绍">转介绍</MenuItem>
          </TextField>
          <TextField select label="录入人" value={form.inputBy} onChange={handleChange('inputBy')} fullWidth helperText="默认当前登录人员">
            {users.map((user) => (
              <MenuItem key={user.id} value={user.name}>{user.name}</MenuItem>
            ))}
          </TextField>
          <TextField select label="分配销售" value={form.owner} onChange={handleChange('owner')} fullWidth helperText="开启自动分配时会按流转规则覆盖">
            <MenuItem value="待分配">待分配</MenuItem>
            {salesUsers.map((user) => (
              <MenuItem key={user.id} value={user.name}>{user.name}</MenuItem>
            ))}
          </TextField>
          <TextField label="预计金额" type="number" value={form.estimatedAmount} onChange={handleChange('estimatedAmount')} fullWidth />
          <TextField label="标签（逗号分隔）" value={form.tags} onChange={handleChange('tags')} fullWidth sx={{ gridColumn: '1 / -1' }} />
          <TextField label="备注" value={form.remark} onChange={handleChange('remark')} fullWidth multiline minRows={3} sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!form.name || (!form.phone && !form.wechat)}>
          {isEdit ? '保存' : '入库'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LeadForm;
