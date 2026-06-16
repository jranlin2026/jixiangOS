import React, { useEffect, useMemo, useState } from 'react';
import {
  Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Paper, Chip, Button, Switch, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, FormControl, InputLabel, Select,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CalculateIcon from '@mui/icons-material/Calculate';
import { commissionRuleApi, productApi } from '../../api';
import {
  COMMISSION_SCENES,
  OFFICIAL_PAYMENT_CHANNELS,
  ORDER_TYPES,
  RESOURCE_OWNERSHIPS,
} from '../../shared/utils/constants';
import type {
  CommissionRole,
  CommissionRule,
  CommissionScene,
  OfficialPaymentChannel,
  ResourceOwnership,
} from '../../types/commission';
import type { ProductLevel } from '../../types/common';

const ROLES: CommissionRole[] = ['销售', '线索', '客户成功', '售后', '招商主管', '销售主管'];
const ROLE_LABELS: Record<CommissionRole, string> = {
  销售: '销售',
  线索: '线索',
  客户成功: '客户成功',
  售后: '售后',
  招商主管: '招商主管',
  销售主管: '销售主管',
};

type RuleForm = Omit<CommissionRule, 'id'>;

const emptyForm: RuleForm = {
  name: '',
  productLevel: '',
  orderType: '',
  sourceType: '',
  scene: '',
  resourceOwnership: '',
  paymentChannels: ['企业微信转账', '企业支付宝转账', '对公银行转账', '公司自营小店'],
  excludeExternalTalent: true,
  role: '销售',
  commissionType: 'fixed',
  commissionValue: 0,
  performanceRate: 100,
  splitRatio: 100,
  collaboratorRole: '',
  requiresProof: false,
  clawbackBaseCommission: false,
  description: '',
  isActive: true,
  priority: 100,
};

const CommissionRuleConfig: React.FC = () => {
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm);
  const [previewAmount, setPreviewAmount] = useState(9800);
  const [productLevels, setProductLevels] = useState<string[]>([]);

  const preview = useMemo(() => {
    const performanceAmount = Math.round(previewAmount * ((form.performanceRate || 100) / 100) * 100) / 100;
    const total = form.commissionType === 'fixed'
      ? form.commissionValue
      : Math.round(performanceAmount * (form.commissionValue / 100) * 100) / 100;
    const primary = Math.round(total * ((form.splitRatio || 100) / 100) * 100) / 100;
    const collaborator = Math.round((total - primary) * 100) / 100;
    return { performanceAmount, total, primary, collaborator };
  }, [form.commissionType, form.commissionValue, form.performanceRate, form.splitRatio, previewAmount]);

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await commissionRuleApi.getCommissionRules();
      if (res.code === 0) setRules(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchRules();
    const loadProductLevels = async () => {
      const res = await productApi.getAllProducts();
      if (res.code === 0) {
        setProductLevels(Array.from(new Set(res.data.map((product) => product.level))));
      }
    };
    loadProductLevels();
  }, []);

  const handleOpenForm = (rule?: CommissionRule) => {
    if (rule) {
      setEditingRule(rule);
      setForm({
        ...emptyForm,
        ...rule,
        paymentChannels: rule.paymentChannels || [],
      });
    } else {
      setEditingRule(null);
      setForm(emptyForm);
    }
    setFormOpen(true);
  };

  const updateForm = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (editingRule) {
      await commissionRuleApi.updateCommissionRule(editingRule.id, form);
    } else {
      await commissionRuleApi.createCommissionRule(form);
    }
    setFormOpen(false);
    fetchRules();
  };

  const handleToggleActive = async (rule: CommissionRule) => {
    await commissionRuleApi.updateCommissionRule(rule.id, { isActive: !rule.isActive });
    fetchRules();
  };

  const handleDelete = async (id: string) => {
    await commissionRuleApi.deleteCommissionRule(id);
    fetchRules();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
            提成规则配置
          </Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            按 6 月制度维护规则，订单创建后自动检查收款渠道、资源归属、凭证和外部达人限制。
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => handleOpenForm()}>
          新增规则
        </Button>
      </Box>

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: '#fafafa' }}>
              <TableCell sx={{ fontWeight: 600 }}>规则名称</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>场景</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>产品/订单</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>资源/来源</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>角色</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>算法</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>约束</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>优先级</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>状态</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rules.sort((a, b) => a.priority - b.priority).map((rule) => (
              <TableRow key={rule.id} hover>
                <TableCell sx={{ fontWeight: 500, minWidth: 180 }}>
                  {rule.name}
                  {rule.description && (
                    <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mt: 0.5 }}>
                      {rule.description}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>{rule.scene || '通用'}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    <Chip label={rule.productLevel || '通用产品'} size="small" variant="outlined" />
                    <Chip label={rule.orderType || '通用订单'} size="small" variant="outlined" />
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{rule.resourceOwnership || '通用资源'}</Typography>
                  <Typography variant="caption" sx={{ color: '#6b7280' }}>{rule.sourceType || '不限来源'}</Typography>
                </TableCell>
                <TableCell>
                  <Chip label={ROLE_LABELS[rule.role]} size="small" color="primary" />
                  {rule.collaboratorRole && (
                    <Chip label={`协同:${ROLE_LABELS[rule.collaboratorRole]}`} size="small" sx={{ ml: 0.5 }} />
                  )}
                </TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {rule.commissionType === 'fixed' ? `¥${rule.commissionValue}` : `${rule.commissionValue}%`}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#6b7280' }}>
                    业绩{rule.performanceRate || 100}% / 主分{rule.splitRatio || 100}%
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                    {rule.requiresProof && <Chip label="需凭证" size="small" color="warning" />}
                    {rule.excludeExternalTalent && <Chip label="排除外部达人" size="small" />}
                    {rule.clawbackBaseCommission && <Chip label="冲销基础提成" size="small" color="error" />}
                  </Box>
                </TableCell>
                <TableCell>{rule.priority}</TableCell>
                <TableCell>
                  <Switch checked={rule.isActive} size="small" onChange={() => handleToggleActive(rule)} />
                </TableCell>
                <TableCell align="center">
                  <IconButton size="small" onClick={() => handleOpenForm(rule)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(rule.id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{editingRule ? '编辑提成规则' : '新增提成规则'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 2, mt: 1 }}>
            <TextField
              label="规则名称"
              value={form.name}
              onChange={(e) => updateForm('name', e.target.value)}
              fullWidth
              sx={{ gridColumn: '1 / -1' }}
            />
            <FormControl fullWidth>
              <InputLabel>制度场景</InputLabel>
              <Select
                value={form.scene || ''}
                label="制度场景"
                onChange={(e) => updateForm('scene', e.target.value as CommissionScene | '')}
              >
                <MenuItem value="">通用</MenuItem>
                {COMMISSION_SCENES.map((scene) => <MenuItem key={scene.value} value={scene.value}>{scene.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              label="产品等级/分类"
              value={form.productLevel}
              onChange={(e) => updateForm('productLevel', e.target.value as ProductLevel | '')}
              placeholder="留空=通用"
              helperText={productLevels.length ? `当前：${productLevels.join('、')}` : '留空表示不限产品'}
              fullWidth
            />
            <FormControl fullWidth>
              <InputLabel>订单类型</InputLabel>
              <Select
                value={form.orderType}
                label="订单类型"
                onChange={(e) => updateForm('orderType', e.target.value)}
              >
                <MenuItem value="">通用</MenuItem>
                {ORDER_TYPES.map((type) => <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>资源归属</InputLabel>
              <Select
                value={form.resourceOwnership || ''}
                label="资源归属"
                onChange={(e) => updateForm('resourceOwnership', e.target.value as ResourceOwnership | '')}
              >
                <MenuItem value="">通用</MenuItem>
                {RESOURCE_OWNERSHIPS.map((item) => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="来源类型" value={form.sourceType} onChange={(e) => updateForm('sourceType', e.target.value)} placeholder="如：渠道转介绍价、原价挽回" fullWidth />
            <FormControl fullWidth>
              <InputLabel>提成角色</InputLabel>
              <Select value={form.role} label="提成角色" onChange={(e) => updateForm('role', e.target.value as CommissionRole)}>
                {ROLES.map((role) => <MenuItem key={role} value={role}>{ROLE_LABELS[role]}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>计算方式</InputLabel>
              <Select value={form.commissionType} label="计算方式" onChange={(e) => updateForm('commissionType', e.target.value as 'fixed' | 'percentage')}>
                <MenuItem value="fixed">固定金额</MenuItem>
                <MenuItem value="percentage">百分比</MenuItem>
              </Select>
            </FormControl>
            <TextField label={form.commissionType === 'fixed' ? '金额（元）' : '百分比（%）'} type="number" value={form.commissionValue} onChange={(e) => updateForm('commissionValue', Number(e.target.value))} fullWidth />
            <TextField label="业绩核算比例（%）" type="number" value={form.performanceRate || 100} onChange={(e) => updateForm('performanceRate', Number(e.target.value))} fullWidth />
            <TextField label="主角色分成（%）" type="number" value={form.splitRatio || 100} onChange={(e) => updateForm('splitRatio', Number(e.target.value))} fullWidth />
            <FormControl fullWidth>
              <InputLabel>协同角色</InputLabel>
              <Select value={form.collaboratorRole || ''} label="协同角色" onChange={(e) => updateForm('collaboratorRole', e.target.value as CommissionRole | '')}>
                <MenuItem value="">无</MenuItem>
                {ROLES.map((role) => <MenuItem key={role} value={role}>{ROLE_LABELS[role]}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>收款渠道</InputLabel>
              <Select
                multiple
                value={form.paymentChannels || []}
                label="收款渠道"
                onChange={(e) => updateForm('paymentChannels', e.target.value as OfficialPaymentChannel[])}
                renderValue={(selected) => (selected as string[]).join('、') || '不限'}
              >
                {OFFICIAL_PAYMENT_CHANNELS.map((channel) => (
                  <MenuItem key={channel.value} value={channel.value}>{channel.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="优先级" type="number" value={form.priority} onChange={(e) => updateForm('priority', Number(e.target.value))} fullWidth />
            <FormControl fullWidth>
              <InputLabel>需要凭证</InputLabel>
              <Select value={String(Boolean(form.requiresProof))} label="需要凭证" onChange={(e) => updateForm('requiresProof', e.target.value === 'true')}>
                <MenuItem value="false">否</MenuItem>
                <MenuItem value="true">是</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>排除外部达人</InputLabel>
              <Select value={String(Boolean(form.excludeExternalTalent))} label="排除外部达人" onChange={(e) => updateForm('excludeExternalTalent', e.target.value === 'true')}>
                <MenuItem value="true">是</MenuItem>
                <MenuItem value="false">否</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>冲销基础提成</InputLabel>
              <Select value={String(Boolean(form.clawbackBaseCommission))} label="冲销基础提成" onChange={(e) => updateForm('clawbackBaseCommission', e.target.value === 'true')}>
                <MenuItem value="false">否</MenuItem>
                <MenuItem value="true">是</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label="规则说明"
              value={form.description}
              onChange={(e) => updateForm('description', e.target.value)}
              fullWidth
              multiline
              minRows={2}
              sx={{ gridColumn: '1 / -1' }}
            />
            <Box sx={{ gridColumn: '1 / -1', p: 2, bgcolor: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <CalculateIcon fontSize="small" />
                <Typography variant="subtitle2">规则试算</Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '160px repeat(4, 1fr)', gap: 1.5, alignItems: 'center' }}>
                <TextField size="small" label="试算实付金额" type="number" value={previewAmount} onChange={(e) => setPreviewAmount(Number(e.target.value))} />
                <Typography variant="body2">业绩基数：¥{preview.performanceAmount}</Typography>
                <Typography variant="body2">总提成：¥{preview.total}</Typography>
                <Typography variant="body2">主角色：¥{preview.primary}</Typography>
                <Typography variant="body2">协同：¥{preview.collaborator}</Typography>
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFormOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={!form.name || loading}>
            {editingRule ? '保存' : '创建'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CommissionRuleConfig;
