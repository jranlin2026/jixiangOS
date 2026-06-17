import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button,
  TextField, MenuItem, Box,
} from '@mui/material';
import useLeadStore from '../../store/useLeadStore';
import { LEAD_SOURCES, LEAD_STATUS } from '../../shared/utils/constants';
import type { Lead } from '../../types/lead';
import type { LifecycleStatusConfig } from '../../types/settings';
import { settingsApi } from '../../api';

const INDUSTRIES = ['互联网', '教育', '金融', '制造', '零售', '医疗', '科技', '其他'];
const CITIES = ['北京', '上海', '广州', '深圳', '杭州', '成都', '南京', '武汉', '其他'];

interface LeadFormProps {
  open: boolean;
  onClose: () => void;
  lead?: Lead | null;
  onSuccess?: () => void;
}

const LeadForm: React.FC<LeadFormProps> = ({ open, onClose, lead, onSuccess }) => {
  const { create, update } = useLeadStore();
  const isEdit = !!lead;
  const [lifecycleConfigs, setLifecycleConfigs] = useState<LifecycleStatusConfig[]>([]);

  const [form, setForm] = useState({
    name: lead?.name || '',
    company: lead?.company || '',
    phone: lead?.phone || '',
    email: lead?.email || '',
    source: lead?.source || '官网',
    status: lead?.status || '新线索',
    lifecycleStatus: lead?.lifecycleStatus || '未转商机',
    owner: lead?.owner || '张伟',
    estimatedAmount: lead?.estimatedAmount || 899,
    wechat: lead?.wechat || '',
    industry: lead?.industry || '',
    city: lead?.city || '',
    sourceType: lead?.sourceType || '自拓',
    tags: lead?.tags?.join(', ') || '',
  });

  useEffect(() => {
    settingsApi.fetchLifecycleStatusConfigs().then((res) => {
      if (res.code === 0) setLifecycleConfigs(res.data.filter((item) => item.isActive));
    });
  }, []);

  const handleChange = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [field]: e.target.value });
  };

  const handleSubmit = async () => {
    const tags = form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
    if (isEdit && lead) {
      await update(lead.id, {
        ...form,
        estimatedAmount: Number(form.estimatedAmount),
        tags,
      });
    } else {
      await create({
        ...form,
        estimatedAmount: Number(form.estimatedAmount),
        tags,
      });
    }
    onSuccess?.();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{isEdit ? '编辑线索' : '新增线索'}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
          <TextField label="姓名" value={form.name} onChange={handleChange('name')} required fullWidth />
          <TextField label="公司" value={form.company} onChange={handleChange('company')} fullWidth />
          <TextField label="电话" value={form.phone} onChange={handleChange('phone')} required fullWidth />
          <TextField label="邮箱" value={form.email} onChange={handleChange('email')} fullWidth />
          <TextField label="微信" value={form.wechat} onChange={handleChange('wechat')} fullWidth />
          <TextField select label="来源" value={form.source} onChange={handleChange('source')} fullWidth>
            {Object.values(LEAD_SOURCES).map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </TextField>
          <TextField select label="状态" value={form.status} onChange={handleChange('status')} fullWidth>
            {Object.values(LEAD_STATUS).map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </TextField>
          <TextField select label="生命周期状态" value={form.lifecycleStatus} onChange={handleChange('lifecycleStatus')} fullWidth helperText="录入初始状态；转商机后由销售流程自动更新">
            {lifecycleConfigs.map((s) => (
              <MenuItem key={s.id} value={s.name}>{s.name}</MenuItem>
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
          <TextField select label="来源类型" value={form.sourceType} onChange={handleChange('sourceType')} fullWidth>
            <MenuItem value="自拓">自拓</MenuItem>
            <MenuItem value="公司资源">公司资源</MenuItem>
            <MenuItem value="转介绍">转介绍</MenuItem>
          </TextField>
          <TextField select label="负责人" value={form.owner} onChange={handleChange('owner')} fullWidth>
            <MenuItem value="张伟">张伟</MenuItem>
            <MenuItem value="李娜">李娜</MenuItem>
            <MenuItem value="王磊">王磊</MenuItem>
            <MenuItem value="赵敏">赵敏</MenuItem>
          </TextField>
          <TextField label="预估金额" type="number" value={form.estimatedAmount} onChange={handleChange('estimatedAmount')} fullWidth />
          <TextField label="标签（逗号分隔）" value={form.tags} onChange={handleChange('tags')} fullWidth sx={{ gridColumn: '1 / -1' }} />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>取消</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={!form.name || !form.phone}>
          {isEdit ? '保存' : '创建'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default LeadForm;
