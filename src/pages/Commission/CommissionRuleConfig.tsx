import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import { commissionRuleApi, settingsApi } from '../../api';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import type {
  CommissionRole,
  CommissionRoleConfig,
  CommissionRoleConfigInput,
  ResourceOwnership,
  SimpleCommissionRuleGroup,
  SimpleCommissionRuleGroupInput,
  SimpleCommissionRulePayout,
} from '../../types/commission';
import type { OrderTypeConfig } from '../../types/settings';

const RESOURCE_OPTIONS: Array<{ value: ResourceOwnership; label: string }> = [
  { value: '公司资源', label: '公司资源' },
  { value: '个人资源', label: '个人资源' },
];

const PERSON_SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'sales_owner', label: '销售负责人' },
  { value: 'lead_contributor', label: '线索贡献人' },
  { value: 'customer_success', label: '客户成功' },
  { value: 'after_sales', label: '售后人员' },
  { value: 'manual', label: '手动指定' },
];

const emptyPayout: SimpleCommissionRulePayout = {
  role: '销售',
  commissionType: 'percentage',
  commissionValue: 0,
};

const emptyRuleForm: SimpleCommissionRuleGroupInput = {
  name: '',
  orderType: '',
  resourceOwnership: '公司资源',
  isActive: true,
  payouts: [emptyPayout],
};

const emptyRoleForm: CommissionRoleConfigInput = {
  name: '',
  code: '',
  personSource: 'manual',
  isActive: true,
  sortOrder: 100,
  description: '',
};

function formatPayout(payout: SimpleCommissionRulePayout): string {
  return payout.commissionType === 'percentage'
    ? `${payout.role} ${payout.commissionValue}%`
    : `${payout.role} ¥${payout.commissionValue}`;
}

function cloneRuleForm(form: SimpleCommissionRuleGroupInput): SimpleCommissionRuleGroupInput {
  return {
    ...form,
    payouts: form.payouts.map((payout) => ({ ...payout })),
  };
}

function getPersonSourceLabel(value: string): string {
  return PERSON_SOURCE_OPTIONS.find((item) => item.value === value)?.label || value;
}

const CommissionRuleConfig: React.FC = () => {
  const [view, setView] = useState<'rules' | 'roles'>('rules');
  const [groups, setGroups] = useState<SimpleCommissionRuleGroup[]>([]);
  const [roleConfigs, setRoleConfigs] = useState<CommissionRoleConfig[]>([]);
  const [orderTypeConfigs, setOrderTypeConfigs] = useState<OrderTypeConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');

  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<SimpleCommissionRuleGroup | null>(null);
  const [ruleForm, setRuleForm] = useState<SimpleCommissionRuleGroupInput>(emptyRuleForm);
  const [ruleFormError, setRuleFormError] = useState('');
  const [showRuleValidation, setShowRuleValidation] = useState(false);

  const [roleFormOpen, setRoleFormOpen] = useState(false);
  const [editingRoleConfig, setEditingRoleConfig] = useState<CommissionRoleConfig | null>(null);
  const [roleForm, setRoleForm] = useState<CommissionRoleConfigInput>(emptyRoleForm);
  const [roleFormError, setRoleFormError] = useState('');
  const [showRoleValidation, setShowRoleValidation] = useState(false);

  const activeRoleConfigs = useMemo(
    () => roleConfigs.filter((item) => item.isActive),
    [roleConfigs],
  );

  const orderTypeOptions = useMemo(() => {
    const activeItems = orderTypeConfigs.filter((item) => item.isActive);
    if (ruleForm.orderType && !activeItems.some((item) => item.name === ruleForm.orderType)) {
      const current = orderTypeConfigs.find((item) => item.name === ruleForm.orderType) || {
        id: ruleForm.orderType,
        name: ruleForm.orderType,
        description: '',
        isActive: true,
        sortOrder: 0,
        createdAt: '',
        updatedAt: '',
      };
      return [current, ...activeItems];
    }
    return activeItems;
  }, [orderTypeConfigs, ruleForm.orderType]);

  const duplicateRuleRoles = useMemo(() => {
    const roles = ruleForm.payouts.map((payout) => payout.role);
    return roles.length !== new Set(roles).size;
  }, [ruleForm.payouts]);

  const duplicatedCondition = useMemo(() => groups.some((group) => (
    group.id !== editingGroup?.id
    && group.orderType === ruleForm.orderType
    && group.resourceOwnership === ruleForm.resourceOwnership
  )), [editingGroup?.id, groups, ruleForm.orderType, ruleForm.resourceOwnership]);

  const ruleValidationMessage = useMemo(() => {
    if (!ruleForm.name.trim()) return '请填写规则名称';
    if (!ruleForm.orderType) return '请选择订单类型';
    if (!ruleForm.resourceOwnership) return '请选择资源来源';
    if (!ruleForm.payouts.length) return '至少添加一条分润角色';
    if (duplicateRuleRoles) return '同一规则内不能重复配置提成角色';
    if (ruleForm.payouts.some((payout) => Number(payout.commissionValue) < 0)) return '分润数值不能小于 0';
    if (duplicatedCondition) return '相同订单类型和资源来源的规则已存在';
    return '';
  }, [duplicateRuleRoles, duplicatedCondition, ruleForm]);

  const roleValidationMessage = useMemo(() => {
    if (!roleForm.name.trim()) return '请填写角色名称';
    if (!roleForm.code.trim()) return '请填写角色编码';
    if (Number(roleForm.sortOrder) < 0) return '排序不能小于 0';
    const duplicateName = roleConfigs.some((item) => item.id !== editingRoleConfig?.id && item.name === roleForm.name.trim());
    if (duplicateName) return '角色名称已存在';
    const duplicateCode = roleConfigs.some((item) => item.id !== editingRoleConfig?.id && item.code === roleForm.code.trim());
    if (duplicateCode) return '角色编码已存在';
    return '';
  }, [editingRoleConfig?.id, roleConfigs, roleForm.code, roleForm.name, roleForm.sortOrder]);

  const fetchAll = async () => {
    setLoading(true);
    setPageError('');
    try {
      const [groupsRes, orderTypeRes, roleRes] = await Promise.all([
        commissionRuleApi.getSimpleCommissionRuleGroups(),
        settingsApi.fetchOrderTypeConfigs(),
        commissionRuleApi.getCommissionRoleConfigs(),
      ]);
      if (groupsRes.code === 0) setGroups(groupsRes.data);
      if (orderTypeRes.code === 0) setOrderTypeConfigs(orderTypeRes.data);
      if (roleRes.code === 0) setRoleConfigs(roleRes.data);
    } catch {
      setPageError('配置加载失败，请稍后再试');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const roleOptionsForPayout = (currentRole: CommissionRole) => {
    const selectedRoles = new Set(ruleForm.payouts.map((payout) => payout.role));
    const options = roleConfigs.filter((item) => item.isActive || item.name === currentRole);
    if (currentRole && !options.some((item) => item.name === currentRole)) {
      return [
        { id: currentRole, name: currentRole, code: currentRole, isActive: false, personSource: 'manual' as const, sortOrder: 999, createdAt: '', updatedAt: '' },
        ...options,
      ];
    }
    return options.filter((item) => !selectedRoles.has(item.name) || item.name === currentRole);
  };

  const handleOpenRuleForm = (group?: SimpleCommissionRuleGroup) => {
    setRuleFormError('');
    setShowRuleValidation(false);
    if (group) {
      setEditingGroup(group);
      setRuleForm({
        name: group.name,
        orderType: group.orderType,
        resourceOwnership: group.resourceOwnership,
        isActive: group.isActive,
        payouts: group.payouts.map((payout) => ({ ...payout })),
      });
    } else {
      setEditingGroup(null);
      setRuleForm(cloneRuleForm({
        ...emptyRuleForm,
        payouts: [{ ...emptyPayout, role: activeRoleConfigs[0]?.name || '销售' }],
      }));
    }
    setRuleFormOpen(true);
  };

  const updatePayout = <K extends keyof SimpleCommissionRulePayout>(
    index: number,
    key: K,
    value: SimpleCommissionRulePayout[K],
  ) => {
    setRuleForm((prev) => ({
      ...prev,
      payouts: prev.payouts.map((payout, payoutIndex) => (
        payoutIndex === index ? { ...payout, [key]: value } : payout
      )),
    }));
  };

  const handleAddPayout = () => {
    const usedRoles = new Set(ruleForm.payouts.map((payout) => payout.role));
    const nextRole = activeRoleConfigs.find((item) => !usedRoles.has(item.name))?.name;
    if (!nextRole) return;
    setRuleForm((prev) => ({
      ...prev,
      payouts: [...prev.payouts, { ...emptyPayout, role: nextRole }],
    }));
  };

  const handleRemovePayout = (index: number) => {
    setRuleForm((prev) => ({
      ...prev,
      payouts: prev.payouts.filter((_, payoutIndex) => payoutIndex !== index),
    }));
  };

  const handleSubmitRule = async () => {
    setRuleFormError('');
    if (ruleValidationMessage) {
      setShowRuleValidation(true);
      return;
    }

    const payload = cloneRuleForm({
      ...ruleForm,
      name: ruleForm.name.trim(),
      payouts: ruleForm.payouts.map((payout) => ({
        ...payout,
        commissionValue: Number(payout.commissionValue) || 0,
      })),
    });
    const res = editingGroup
      ? await commissionRuleApi.updateSimpleCommissionRuleGroup(editingGroup.id, payload)
      : await commissionRuleApi.createSimpleCommissionRuleGroup(payload);

    if (res.code !== 0) {
      setRuleFormError(res.message || '保存失败，请检查规则配置');
      return;
    }

    setRuleFormOpen(false);
    fetchAll();
  };

  const handleToggleRuleActive = async (group: SimpleCommissionRuleGroup) => {
    await commissionRuleApi.updateSimpleCommissionRuleGroup(group.id, {
      name: group.name,
      orderType: group.orderType,
      resourceOwnership: group.resourceOwnership,
      isActive: !group.isActive,
      payouts: group.payouts,
    });
    fetchAll();
  };

  const handleDeleteRule = async (group: SimpleCommissionRuleGroup) => {
    await commissionRuleApi.deleteSimpleCommissionRuleGroup(group.id);
    fetchAll();
  };

  const handleOpenRoleForm = (config?: CommissionRoleConfig) => {
    setRoleFormError('');
    setShowRoleValidation(false);
    if (config) {
      setEditingRoleConfig(config);
      setRoleForm({
        name: config.name,
        code: config.code,
        personSource: config.personSource,
        isActive: config.isActive,
        sortOrder: config.sortOrder,
        description: config.description || '',
      });
    } else {
      setEditingRoleConfig(null);
      setRoleForm({ ...emptyRoleForm });
    }
    setRoleFormOpen(true);
  };

  const handleSubmitRole = async () => {
    setRoleFormError('');
    if (roleValidationMessage) {
      setShowRoleValidation(true);
      return;
    }
    const payload: CommissionRoleConfigInput = {
      ...roleForm,
      name: roleForm.name.trim(),
      code: roleForm.code.trim(),
      sortOrder: Number(roleForm.sortOrder) || 0,
      description: roleForm.description?.trim(),
    };
    const res = editingRoleConfig
      ? await commissionRuleApi.updateCommissionRoleConfig(editingRoleConfig.id, payload)
      : await commissionRuleApi.createCommissionRoleConfig(payload);
    if (res.code !== 0) {
      setRoleFormError(res.message || '保存失败，请检查提成角色配置');
      return;
    }
    setRoleFormOpen(false);
    fetchAll();
  };

  const handleToggleRoleActive = async (config: CommissionRoleConfig) => {
    await commissionRuleApi.updateCommissionRoleConfig(config.id, { isActive: !config.isActive });
    fetchAll();
  };

  const handleDeleteRole = async (config: CommissionRoleConfig) => {
    const res = await commissionRuleApi.deleteCommissionRoleConfig(config.id);
    if (res.code !== 0) {
      setPageError(res.message || '删除失败');
      return;
    }
    fetchAll();
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, color: '#1a1a2e' }}>
            提成规则配置
          </Typography>
          <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.5 }}>
            提成角色仅用于分账口径和订单人员归属，不影响系统登录角色和页面权限。
          </Typography>
        </Box>
        {view === 'rules' ? (
          <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => handleOpenRuleForm()}>
            新增规则
          </Button>
        ) : (
          <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => handleOpenRoleForm()}>
            新增角色
          </Button>
        )}
      </Box>

      <Tabs value={view} onChange={(_event, value) => setView(value)} sx={{ mb: 2 }}>
        <Tab value="rules" label="分账规则" />
        <Tab value="roles" label="提成角色" />
      </Tabs>

      {pageError && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setPageError('')}>{pageError}</Alert>}

      {view === 'rules' && (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#fafafa' }}>
                <TableCell sx={{ fontWeight: 600 }}>规则名称</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>IF 条件</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>DO 分润</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>状态</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id} hover>
                  <TableCell sx={{ fontWeight: 500, minWidth: 180 }}>{group.name}</TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      <Chip label={`订单类型 = ${group.orderType}`} size="small" variant="outlined" />
                      <Chip label={`资源来源 = ${group.resourceOwnership}`} size="small" variant="outlined" />
                    </Box>
                  </TableCell>
                  <TableCell sx={{ minWidth: 280 }}>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      {group.payouts.map((payout) => (
                        <Chip
                          key={`${group.id}-${payout.role}`}
                          label={formatPayout(payout)}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      ))}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={group.isActive ? '启用' : '停用'}
                      size="small"
                      color={group.isActive ? 'success' : 'default'}
                      variant={group.isActive ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={group.isActive} size="small" onChange={() => handleToggleRuleActive(group)} />
                    <IconButton size="small" onClick={() => handleOpenRuleForm(group)} title="编辑">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeleteRule(group)} title="删除">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {!groups.length && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6, color: '#6b7280' }}>
                    暂无提成规则，点击“新增规则”配置第一条 IF / DO 规则
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {view === 'roles' && (
        <>
        <Alert severity="info" sx={{ mb: 2 }}>
          系统会按内置订单字段自动匹配分润人员，匹配不到时进入待分配；此处角色仅用于分账，不影响系统登录权限。
        </Alert>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#fafafa' }}>
                <TableCell sx={{ fontWeight: 600 }}>角色名称</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>角色编码</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>排序</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>状态</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {roleConfigs.map((config) => (
                <TableRow key={config.id} hover>
                  <TableCell sx={{ fontWeight: 500 }}>
                    {config.name}
                    {config.description && (
                      <Typography variant="caption" sx={{ display: 'block', color: '#6b7280', mt: 0.25 }}>
                        {config.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{config.code}</TableCell>
                  <TableCell>{config.sortOrder}</TableCell>
                  <TableCell>
                    <Chip
                      label={config.isActive ? '启用' : '停用'}
                      size="small"
                      color={config.isActive ? 'success' : 'default'}
                      variant={config.isActive ? 'filled' : 'outlined'}
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Switch checked={config.isActive} size="small" onChange={() => handleToggleRoleActive(config)} />
                    <IconButton size="small" onClick={() => handleOpenRoleForm(config)} title="编辑">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeleteRole(config)} title="删除">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {!roleConfigs.length && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6, color: '#6b7280' }}>
                    暂无提成角色配置
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        </>
      )}

      <Dialog open={ruleFormOpen} onClose={() => setRuleFormOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setRuleFormOpen(false)}>
          {editingGroup ? '编辑提成规则' : '新增提成规则'}
        </DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, pt: 0.5 }}>
            <TextField
              label="规则名称"
              value={ruleForm.name}
              onChange={(event) => setRuleForm((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
              required
            />
            <FormControl fullWidth required>
              <InputLabel>订单类型</InputLabel>
              <Select
                label="订单类型"
                value={ruleForm.orderType}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, orderType: event.target.value }))}
              >
                {orderTypeOptions.map((item) => (
                  <MenuItem key={item.id} value={item.name}>{item.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth required>
              <InputLabel>资源来源</InputLabel>
              <Select
                label="资源来源"
                value={ruleForm.resourceOwnership}
                onChange={(event) => setRuleForm((prev) => ({
                  ...prev,
                  resourceOwnership: event.target.value as ResourceOwnership,
                }))}
              >
                {RESOURCE_OPTIONS.map((item) => (
                  <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 56 }}>
              <Switch
                checked={ruleForm.isActive}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              <Typography variant="body2">{ruleForm.isActive ? '启用规则' : '停用规则'}</Typography>
            </Box>
          </Box>

          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                DO 分润角色
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon />}
                onClick={handleAddPayout}
                disabled={ruleForm.payouts.length >= activeRoleConfigs.length}
              >
                添加角色
              </Button>
            </Box>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#fafafa' }}>
                    <TableCell sx={{ fontWeight: 600 }}>提成角色</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>计算方式</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>数值</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ruleForm.payouts.map((payout, index) => (
                    <TableRow key={`${payout.role}-${index}`}>
                      <TableCell sx={{ width: '32%' }}>
                        <FormControl fullWidth size="small">
                          <Select
                            value={payout.role}
                            onChange={(event) => updatePayout(index, 'role', event.target.value as CommissionRole)}
                          >
                            {roleOptionsForPayout(payout.role).map((item) => (
                              <MenuItem key={item.id} value={item.name}>
                                {item.name}{item.isActive ? '' : '（已停用）'}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell sx={{ width: '32%' }}>
                        <FormControl fullWidth size="small">
                          <Select
                            value={payout.commissionType}
                            onChange={(event) => updatePayout(
                              index,
                              'commissionType',
                              event.target.value as SimpleCommissionRulePayout['commissionType'],
                            )}
                          >
                            <MenuItem value="percentage">按实付金额百分比</MenuItem>
                            <MenuItem value="fixed">固定金额</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell sx={{ width: '24%' }}>
                        <TextField
                          size="small"
                          type="number"
                          value={payout.commissionValue}
                          onChange={(event) => updatePayout(index, 'commissionValue', Number(event.target.value))}
                          inputProps={{ min: 0, step: payout.commissionType === 'percentage' ? 0.1 : 1 }}
                          InputProps={{
                            startAdornment: payout.commissionType === 'fixed' ? '¥' : undefined,
                            endAdornment: payout.commissionType === 'percentage' ? '%' : undefined,
                          }}
                          fullWidth
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemovePayout(index)}
                          disabled={ruleForm.payouts.length <= 1}
                          title="删除角色"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {(ruleFormError || (showRuleValidation && ruleValidationMessage)) && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {ruleFormError || ruleValidationMessage}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRuleFormOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSubmitRule} disabled={loading}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={roleFormOpen} onClose={() => setRoleFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => setRoleFormOpen(false)}>
          {editingRoleConfig ? '编辑提成角色' : '新增提成角色'}
        </DialogCloseTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, pt: 0.5 }}>
            <TextField
              label="角色名称"
              value={roleForm.name}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="角色编码"
              value={roleForm.code}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, code: event.target.value }))}
              fullWidth
              required
              disabled={Boolean(editingRoleConfig)}
            />
            <TextField
              label="排序"
              type="number"
              value={roleForm.sortOrder}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, sortOrder: Number(event.target.value) }))}
              fullWidth
              inputProps={{ min: 0 }}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 56 }}>
              <Switch
                checked={roleForm.isActive}
                onChange={(event) => setRoleForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              <Typography variant="body2">{roleForm.isActive ? '启用角色' : '停用角色'}</Typography>
            </Box>
            <TextField
              label="说明"
              value={roleForm.description}
              onChange={(event) => setRoleForm((prev) => ({ ...prev, description: event.target.value }))}
              fullWidth
              multiline
              minRows={2}
              sx={{ gridColumn: '1 / -1' }}
            />
          </Box>
          {(roleFormError || (showRoleValidation && roleValidationMessage)) && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {roleFormError || roleValidationMessage}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRoleFormOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSubmitRole} disabled={loading}>
            保存
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CommissionRuleConfig;
