import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Stack,
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
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import HistoryIcon from '@mui/icons-material/History';
import { commissionRuleApi, settingsApi } from '../../api';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import TablePagination from '../../shared/components/TablePagination';
import type {
  CommissionRole,
  CommissionAssigneeSource,
  CommissionBusinessSource,
  CommissionPayoutPlan,
  CommissionPayoutPlanInput,
  CommissionPayoutPlanRevision,
  CommissionRoleConfig,
  CommissionRoleConfigInput,
  CommissionTier,
  ResourceOwnership,
  SimpleCommissionRuleGroup,
  SimpleCommissionRuleGroupInput,
  SimpleCommissionRulePayout,
} from '../../types/commission';
import type { OrderTypeConfig } from '../../types/settings';
import useAuthStore from '../../store/useAuthStore';
import { hasPermission, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { subscribeCommissionRuleAutoRefresh } from './commissionRuleAutoRefresh';
import { clampCommissionConfigPage, paginateCommissionConfigRows } from './commissionRulePagination';
import { createLatestCommissionRuleRequestGate } from './commissionRuleRequestGate';

type CommissionConfigView = 'rules' | 'plans' | 'roles';
type CommissionConfigPagination = Record<CommissionConfigView, { page: number; rowsPerPage: number }>;
type CommissionPlanFormState = Omit<CommissionPayoutPlanInput, 'commissionValue'> & {
  commissionValue: number | '';
};

const DEFAULT_CONFIG_PAGINATION: CommissionConfigPagination = {
  rules: { page: 0, rowsPerPage: 10 },
  plans: { page: 0, rowsPerPage: 10 },
  roles: { page: 0, rowsPerPage: 10 },
};

const configPaginationSx = {
  border: '1px solid #f0f0f0',
  borderTop: 0,
  bgcolor: '#fff',
};

const RESOURCE_OPTIONS: Array<{ value: ResourceOwnership; label: string }> = [
  { value: '公司资源', label: '公司资源' },
  { value: '个人资源', label: '个人资源' },
];

const BUSINESS_SOURCE_OPTIONS: Array<{ value: CommissionBusinessSource; label: string }> = [
  { value: 'formal_order', label: '正式订单' },
  { value: 'after_sales_recovery', label: '售后挽回' },
];

const ASSIGNEE_SOURCE_OPTIONS: Array<{ value: CommissionAssigneeSource; label: string }> = [
  { value: 'sales_owner', label: '销售负责人' },
  { value: 'lead_contributor', label: '线索贡献人' },
  { value: 'customer_success', label: '客户成功人员' },
  { value: 'after_sales', label: '售后人员' },
  { value: 'recovery_owner', label: '挽回人员' },
  { value: 'recovery_assistant', label: '挽回协作人' },
  { value: 'business_creator', label: '业务提交人' },
  { value: 'department_manager', label: '部门负责人' },
  { value: 'manual', label: '财务手动指定' },
];

const emptyPayout: SimpleCommissionRulePayout = {
  role: '销售',
  assigneeSource: 'sales_owner',
  commissionType: 'percentage',
  commissionValue: 0,
};

const emptyRuleForm: SimpleCommissionRuleGroupInput = {
  name: '',
  businessSource: 'formal_order',
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

const emptyPlanForm: CommissionPlanFormState = {
  name: '',
  commissionType: 'percentage',
  commissionValue: '',
  tiers: undefined,
  isActive: true,
  description: '',
};

const DEFAULT_TIER_CONFIG_ROWS: CommissionTier[] = [
  { minAmount: 0, maxAmount: 30000, rate: 8 },
  { minAmount: 30000, maxAmount: 50000, rate: 10 },
  { minAmount: 50000, rate: 15 },
];

function normalizeTierRowsForEditor(tiers?: CommissionTier[]): CommissionTier[] {
  return (tiers?.length ? tiers : DEFAULT_TIER_CONFIG_ROWS)
    .map((tier) => {
      const maxAmount = tier.maxAmount === undefined || tier.maxAmount === null || Number(tier.maxAmount) <= 0
        ? undefined
        : Number(tier.maxAmount);
      return {
        minAmount: Number(tier.minAmount) || 0,
        ...(maxAmount === undefined ? {} : { maxAmount }),
        rate: Number(tier.rate) || 0,
      };
    })
    .sort((a, b) => a.minAmount - b.minAmount);
}

function validateTierRows(tiers: CommissionTier[]): string {
  const rows = normalizeTierRowsForEditor(tiers);
  if (!rows.length) return '至少需要配置一个阶梯档位';
  if (rows[0].minAmount !== 0) return '第一档下限必须为 0';
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const next = rows[index + 1];
    if (row.minAmount < 0) return '阶梯下限不能小于 0';
    if (row.rate < 0) return '提成比例不能小于 0';
    if (row.maxAmount !== undefined && row.maxAmount <= row.minAmount) return '阶梯上限必须大于下限';
    if (next && row.maxAmount !== next.minAmount) return '阶梯区间必须连续';
    if (!next && row.maxAmount !== undefined) return '最后一档不设置上限';
  }
  return '';
}

function formatPayout(payout: SimpleCommissionRulePayout): string {
  if (payout.payoutPlanName) return `${payout.role} · ${payout.payoutPlanName}`;
  if (payout.commissionType === 'tiered_percentage') return `${payout.role} 月度累计阶梯`;
  return payout.commissionType === 'percentage'
    ? `${payout.role} ${payout.commissionValue}%`
    : `${payout.role} ¥${payout.commissionValue}`;
}

function formatPlanMethod(type: CommissionPayoutPlan['commissionType']): string {
  if (type === 'tiered_percentage') return '月度累计阶梯';
  if (type === 'percentage') return '固定比例';
  return '固定金额';
}

function formatPlanValue(plan: Pick<CommissionPayoutPlan, 'commissionType' | 'commissionValue' | 'tiers'>): string {
  if (plan.commissionType === 'tiered_percentage') {
    return `月度阶梯 · ${normalizeTierRowsForEditor(plan.tiers).length} 档`;
  }
  return plan.commissionType === 'percentage'
    ? `${plan.commissionValue}%`
    : `¥${plan.commissionValue}`;
}

function formatVersionTime(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function getPayoutPlanHistory(plan: CommissionPayoutPlan): CommissionPayoutPlanRevision[] {
  const current: CommissionPayoutPlanRevision = {
    id: plan.id,
    name: plan.name,
    version: Math.max(1, Number(plan.version) || 1),
    commissionType: plan.commissionType,
    commissionValue: plan.commissionValue,
    tiers: plan.tiers,
    description: plan.description,
    effectiveFrom: plan.effectiveFrom || plan.createdAt,
  };
  return [current, ...(plan.revisions || [])]
    .sort((left, right) => right.version - left.version);
}

function describePlanVersionChange(
  revision: CommissionPayoutPlanRevision,
  previous?: CommissionPayoutPlanRevision,
): string {
  if (!previous) return '初始版本';
  const changes: string[] = [];
  if (revision.name !== previous.name) changes.push(`名称：${previous.name} → ${revision.name}`);
  if (revision.commissionType !== previous.commissionType) {
    changes.push(`计算方式：${formatPlanMethod(previous.commissionType)} → ${formatPlanMethod(revision.commissionType)}`);
  }
  if (
    revision.commissionType !== 'tiered_percentage'
    && Number(revision.commissionValue) !== Number(previous.commissionValue)
  ) {
    changes.push(`方案数值：${formatPlanValue(previous)} → ${formatPlanValue(revision)}`);
  }
  if (JSON.stringify(revision.tiers || []) !== JSON.stringify(previous.tiers || [])) {
    changes.push('阶梯档位已调整');
  }
  return changes.join('；') || '方案信息更新';
}

function cloneRuleForm(form: SimpleCommissionRuleGroupInput): SimpleCommissionRuleGroupInput {
  return {
    ...form,
    payouts: form.payouts.map((payout) => ({
      ...payout,
      tiers: undefined,
    })),
  };
}

function defaultAssigneeSourceForRole(role: CommissionRole, businessSource: CommissionBusinessSource): CommissionAssigneeSource {
  if (businessSource === 'after_sales_recovery') {
    if (role === '挽回人员') return 'recovery_owner';
    return role === '销售' ? 'sales_owner' : 'manual';
  }
  if (role === '销售') return 'sales_owner';
  if (role === '线索') return 'lead_contributor';
  if (role === '客户成功') return 'customer_success';
  if (role === '售后') return 'after_sales';
  return 'manual';
}

const CommissionRuleConfig: React.FC = () => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const canManageRules = hasPermission(currentUser, PERMISSION_KEYS.FINANCE_RULES, 'write');
  const [view, setView] = useState<CommissionConfigView>('rules');
  const [groups, setGroups] = useState<SimpleCommissionRuleGroup[]>([]);
  const [payoutPlans, setPayoutPlans] = useState<CommissionPayoutPlan[]>([]);
  const [roleConfigs, setRoleConfigs] = useState<CommissionRoleConfig[]>([]);
  const [orderTypeConfigs, setOrderTypeConfigs] = useState<OrderTypeConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState('');
  const [tablePagination, setTablePagination] = useState<CommissionConfigPagination>(DEFAULT_CONFIG_PAGINATION);
  const requestGateRef = useRef(createLatestCommissionRuleRequestGate());

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

  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<CommissionPayoutPlan | null>(null);
  const [planForm, setPlanForm] = useState<CommissionPlanFormState>(emptyPlanForm);
  const [planFormError, setPlanFormError] = useState('');
  const [showPlanValidation, setShowPlanValidation] = useState(false);
  const [historyPlan, setHistoryPlan] = useState<CommissionPayoutPlan | null>(null);
  const [tierConfigOpen, setTierConfigOpen] = useState(false);
  const [tierConfigPlanId, setTierConfigPlanId] = useState('');
  const [tierConfigRows, setTierConfigRows] = useState<CommissionTier[]>(DEFAULT_TIER_CONFIG_ROWS);
  const [tierConfigError, setTierConfigError] = useState('');
  const [tierConfigSaving, setTierConfigSaving] = useState(false);

  const activeRoleConfigs = useMemo(
    () => roleConfigs.filter((item) => item.isActive),
    [roleConfigs],
  );
  const activePayoutPlans = useMemo(
    () => payoutPlans.filter((item) => item.isActive),
    [payoutPlans],
  );
  const tieredPayoutPlans = useMemo(
    () => payoutPlans.filter((item) => item.commissionType === 'tiered_percentage'),
    [payoutPlans],
  );
  const pagedGroups = useMemo(
    () => paginateCommissionConfigRows(groups, tablePagination.rules.page, tablePagination.rules.rowsPerPage),
    [groups, tablePagination.rules],
  );
  const pagedPayoutPlans = useMemo(
    () => paginateCommissionConfigRows(payoutPlans, tablePagination.plans.page, tablePagination.plans.rowsPerPage),
    [payoutPlans, tablePagination.plans],
  );
  const pagedRoleConfigs = useMemo(
    () => paginateCommissionConfigRows(roleConfigs, tablePagination.roles.page, tablePagination.roles.rowsPerPage),
    [roleConfigs, tablePagination.roles],
  );

  const updateTablePage = (targetView: CommissionConfigView, page: number) => {
    setTablePagination((prev) => ({
      ...prev,
      [targetView]: { ...prev[targetView], page },
    }));
  };

  const updateRowsPerPage = (targetView: CommissionConfigView, value: string) => {
    setTablePagination((prev) => ({
      ...prev,
      [targetView]: { page: 0, rowsPerPage: Number(value) || 10 },
    }));
  };

  const applyPlanToPayout = (payout: SimpleCommissionRulePayout, planId?: string, useDefault = false): SimpleCommissionRulePayout => {
    const legacyMatch = !planId
      ? payoutPlans.find((item) => (
        item.isActive
        && item.commissionType === payout.commissionType
        && (item.commissionType === 'tiered_percentage' || Number(item.commissionValue) === Number(payout.commissionValue))
      ))
      : undefined;
    const plan = payoutPlans.find((item) => item.id === planId)
      || legacyMatch
      || (useDefault ? activePayoutPlans[0] : undefined);
    if (!plan) return payout;
    return {
      ...payout,
      payoutPlanId: plan.id,
      payoutPlanName: plan.name,
      commissionType: plan.commissionType,
      commissionValue: plan.commissionType === 'tiered_percentage' ? 0 : plan.commissionValue,
      tiers: undefined,
    };
  };

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
    && (group.businessSource || 'formal_order') === (ruleForm.businessSource || 'formal_order')
    && group.orderType === ruleForm.orderType
    && group.resourceOwnership === ruleForm.resourceOwnership
  )), [editingGroup?.id, groups, ruleForm.businessSource, ruleForm.orderType, ruleForm.resourceOwnership]);

  const ruleValidationMessage = useMemo(() => {
    if (!ruleForm.name.trim()) return '请填写规则名称';
    if (!ruleForm.businessSource) return '请选择业务来源';
    if (!ruleForm.orderType) return '请选择订单类型';
    if (ruleForm.businessSource === 'formal_order' && !ruleForm.resourceOwnership) return '请选择资源来源';
    if (!ruleForm.payouts.length) return '至少添加一条分润角色';
    if (duplicateRuleRoles) return '同一规则内不能重复配置提成角色';
    for (const payout of ruleForm.payouts) {
      const plan = payoutPlans.find((item) => item.id === payout.payoutPlanId);
      if (!plan) return '请选择提成方案';
      if (!payout.assigneeSource) return `请为「${payout.role}」选择人员来源`;
    }
    if (duplicatedCondition) return '相同业务来源、订单类型和资源来源的规则已存在';
    return '';
  }, [duplicateRuleRoles, duplicatedCondition, payoutPlans, ruleForm]);

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

  const planValidationMessage = useMemo(() => {
    if (!planForm.name.trim()) return '请填写方案名称';
    const duplicateName = payoutPlans.some((item) => item.id !== editingPlan?.id && item.name === planForm.name.trim());
    if (duplicateName) return '方案名称已存在';
    if (planForm.commissionType !== 'tiered_percentage' && planForm.commissionValue === '') {
      return planForm.commissionType === 'percentage' ? '请填写固定比例' : '请填写固定金额';
    }
    if (planForm.commissionType !== 'tiered_percentage' && Number(planForm.commissionValue) < 0) return '方案数值不能小于 0';
    if (planForm.commissionType === 'tiered_percentage') return validateTierRows(planForm.tiers || DEFAULT_TIER_CONFIG_ROWS);
    return '';
  }, [editingPlan?.id, payoutPlans, planForm]);

  const fetchAll = async ({ silent = false }: { silent?: boolean } = {}) => {
    const requestId = requestGateRef.current.begin({ silent });
    if (requestId === null) return;
    if (!silent) {
      setLoading(true);
      setPageError('');
    }
    try {
      const [groupsRes, orderTypeRes, roleRes, planRes] = await Promise.all([
        commissionRuleApi.getSimpleCommissionRuleGroups(),
        settingsApi.fetchOrderTypeConfigs(),
        commissionRuleApi.getCommissionRoleConfigs(),
        commissionRuleApi.getCommissionPayoutPlans(),
      ]);
      if (!requestGateRef.current.isLatest(requestId)) return;
      if (groupsRes.code === 0) setGroups(groupsRes.data);
      if (orderTypeRes.code === 0) setOrderTypeConfigs(orderTypeRes.data);
      if (roleRes.code === 0) setRoleConfigs(roleRes.data);
      if (planRes.code === 0) setPayoutPlans(planRes.data);
    } catch {
      if (requestGateRef.current.isLatest(requestId) && !silent) setPageError('配置加载失败，请稍后再试');
    } finally {
      if (requestGateRef.current.isLatest(requestId)) setLoading(false);
      requestGateRef.current.finish();
    }
  };

  useEffect(() => {
    void fetchAll();
    return subscribeCommissionRuleAutoRefresh(() => {
      void fetchAll({ silent: true });
    });
  }, []);

  useEffect(() => {
    setTablePagination((prev) => {
      const next = {
        rules: {
          ...prev.rules,
          page: clampCommissionConfigPage(groups.length, prev.rules.page, prev.rules.rowsPerPage),
        },
        plans: {
          ...prev.plans,
          page: clampCommissionConfigPage(payoutPlans.length, prev.plans.page, prev.plans.rowsPerPage),
        },
        roles: {
          ...prev.roles,
          page: clampCommissionConfigPage(roleConfigs.length, prev.roles.page, prev.roles.rowsPerPage),
        },
      };
      const unchanged = (Object.keys(next) as CommissionConfigView[]).every((key) => next[key].page === prev[key].page);
      return unchanged ? prev : next;
    });
  }, [groups.length, payoutPlans.length, roleConfigs.length]);

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

  const planOptionsForPayout = (currentPlanId?: string) => {
    const options = [...activePayoutPlans];
    const current = currentPlanId ? payoutPlans.find((item) => item.id === currentPlanId) : undefined;
    if (current && !options.some((item) => item.id === current.id)) return [current, ...options];
    return options;
  };

  const openTierConfig = () => {
    setTierConfigError('');
    const tieredPlan = tieredPayoutPlans[0];
    if (tieredPlan) {
      setTierConfigPlanId(tieredPlan.id);
      setTierConfigRows(normalizeTierRowsForEditor(tieredPlan.tiers));
    } else {
      setTierConfigPlanId('');
      setTierConfigRows(DEFAULT_TIER_CONFIG_ROWS);
    }
    setTierConfigOpen(true);
  };

  const updateTierConfigRow = <K extends keyof CommissionTier>(
    index: number,
    key: K,
    value: CommissionTier[K],
  ) => {
    setTierConfigRows((prev) => normalizeTierRowsForEditor(prev).map((tier, currentIndex) => (
      currentIndex === index ? { ...tier, [key]: value } : tier
    )));
  };

  const addTierConfigRow = () => {
    setTierConfigRows((prev) => {
      const rows = normalizeTierRowsForEditor(prev);
      const last = rows[rows.length - 1] || { minAmount: 0, rate: 8 };
      const nextMin = last.maxAmount ?? last.minAmount + 10000;
      return [
        ...rows.slice(0, -1),
        { ...last, maxAmount: nextMin },
        { minAmount: nextMin, rate: last.rate },
      ];
    });
  };

  const removeTierConfigRow = (index: number) => {
    setTierConfigRows((prev) => normalizeTierRowsForEditor(prev).filter((_, currentIndex) => currentIndex !== index));
  };

  const updatePlanFormTierRow = <K extends keyof CommissionTier>(
    index: number,
    key: K,
    value: CommissionTier[K],
  ) => {
    setPlanForm((prev) => ({
      ...prev,
      tiers: normalizeTierRowsForEditor(prev.tiers || DEFAULT_TIER_CONFIG_ROWS).map((tier, currentIndex) => (
        currentIndex === index ? { ...tier, [key]: value } : tier
      )),
    }));
  };

  const addPlanFormTierRow = () => {
    setPlanForm((prev) => {
      const rows = normalizeTierRowsForEditor(prev.tiers || DEFAULT_TIER_CONFIG_ROWS);
      const last = rows[rows.length - 1] || { minAmount: 0, rate: 8 };
      const nextMin = last.maxAmount ?? last.minAmount + 10000;
      return {
        ...prev,
        tiers: [
          ...rows.slice(0, -1),
          { ...last, maxAmount: nextMin },
          { minAmount: nextMin, rate: last.rate },
        ],
      };
    });
  };

  const removePlanFormTierRow = (index: number) => {
    setPlanForm((prev) => ({
      ...prev,
      tiers: normalizeTierRowsForEditor(prev.tiers || DEFAULT_TIER_CONFIG_ROWS)
        .filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const saveTierConfig = async () => {
    if (!canManageRules) return;
    const rows = normalizeTierRowsForEditor(tierConfigRows);
    const validation = validateTierRows(rows);
    if (validation) {
      setTierConfigError(validation);
      return;
    }
    setTierConfigSaving(true);
    const currentPlan = tierConfigPlanId ? payoutPlans.find((item) => item.id === tierConfigPlanId) : undefined;
    const payload: CommissionPayoutPlanInput = {
      name: currentPlan?.name || '月度累计阶梯提成',
      commissionType: 'tiered_percentage',
      commissionValue: 0,
      tiers: rows,
      isActive: currentPlan?.isActive ?? true,
      description: currentPlan?.description || '按提成角色与方案版本汇总月度业绩后自动结算',
    };
    const res = currentPlan
      ? await commissionRuleApi.updateCommissionPayoutPlan(currentPlan.id, payload)
      : await commissionRuleApi.createCommissionPayoutPlan(payload);
    setTierConfigSaving(false);
    if (res.code !== 0) {
      setTierConfigError(res.message || '保存阶梯配置失败');
      return;
    }
    setTierConfigOpen(false);
    fetchAll();
  };

  const handleOpenRuleForm = (group?: SimpleCommissionRuleGroup) => {
    setRuleFormError('');
    setShowRuleValidation(false);
    if (group) {
      setEditingGroup(group);
      setRuleForm({
        name: group.name,
        businessSource: group.businessSource || 'formal_order',
        orderType: group.orderType,
        resourceOwnership: group.resourceOwnership,
        isActive: group.isActive,
        payouts: group.payouts.map((payout) => applyPlanToPayout({
          ...payout,
          assigneeSource: payout.assigneeSource || defaultAssigneeSourceForRole(payout.role, group.businessSource || 'formal_order'),
        }, payout.payoutPlanId)),
      });
    } else {
      setEditingGroup(null);
      setRuleForm(cloneRuleForm({
        ...emptyRuleForm,
        payouts: [applyPlanToPayout({ ...emptyPayout, role: activeRoleConfigs[0]?.name || '销售' }, undefined, true)],
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
        payoutIndex === index
          ? (key === 'payoutPlanId'
            ? applyPlanToPayout({ ...payout, payoutPlanId: value as string }, value as string)
            : key === 'role'
              ? {
                ...payout,
                role: value as CommissionRole,
                assigneeSource: defaultAssigneeSourceForRole(value as CommissionRole, prev.businessSource || 'formal_order'),
              }
              : { ...payout, [key]: value })
          : payout
      )),
    }));
  };

  const handleAddPayout = () => {
    const usedRoles = new Set(ruleForm.payouts.map((payout) => payout.role));
    const nextRole = activeRoleConfigs.find((item) => !usedRoles.has(item.name))?.name;
    if (!nextRole) return;
    setRuleForm((prev) => ({
      ...prev,
      payouts: [...prev.payouts, applyPlanToPayout({
        ...emptyPayout,
        role: nextRole,
        assigneeSource: defaultAssigneeSourceForRole(nextRole, prev.businessSource || 'formal_order'),
      }, undefined, true)],
    }));
  };

  const handleRemovePayout = (index: number) => {
    setRuleForm((prev) => ({
      ...prev,
      payouts: prev.payouts.filter((_, payoutIndex) => payoutIndex !== index),
    }));
  };

  const handleOpenPlanForm = (plan?: CommissionPayoutPlan) => {
    setPlanFormError('');
    setShowPlanValidation(false);
    if (plan) {
      setEditingPlan(plan);
      setPlanForm({
        name: plan.name,
        commissionType: plan.commissionType,
        commissionValue: plan.commissionValue,
        tiers: plan.commissionType === 'tiered_percentage' ? normalizeTierRowsForEditor(plan.tiers) : undefined,
        isActive: plan.isActive,
        description: plan.description || '',
      });
    } else {
      setEditingPlan(null);
      setPlanForm({ ...emptyPlanForm });
    }
    setPlanFormOpen(true);
  };

  const handleSubmitPlan = async () => {
    if (!canManageRules) return;
    setPlanFormError('');
    if (planValidationMessage) {
      setShowPlanValidation(true);
      return;
    }
    const payload: CommissionPayoutPlanInput = {
      ...planForm,
      name: planForm.name.trim(),
      commissionValue: planForm.commissionType === 'tiered_percentage' ? 0 : Number(planForm.commissionValue) || 0,
      tiers: planForm.commissionType === 'tiered_percentage'
        ? normalizeTierRowsForEditor(planForm.tiers || DEFAULT_TIER_CONFIG_ROWS)
        : undefined,
      description: planForm.description?.trim(),
    };
    const res = editingPlan
      ? await commissionRuleApi.updateCommissionPayoutPlan(editingPlan.id, payload)
      : await commissionRuleApi.createCommissionPayoutPlan(payload);
    if (res.code !== 0) {
      setPlanFormError(res.message || '保存失败，请检查提成方案配置');
      return;
    }
    setPlanFormOpen(false);
    fetchAll();
  };

  const handleTogglePlanActive = async (plan: CommissionPayoutPlan) => {
    if (!canManageRules) return;
    await commissionRuleApi.updateCommissionPayoutPlan(plan.id, {
      name: plan.name,
      commissionType: plan.commissionType,
      commissionValue: plan.commissionValue,
      tiers: plan.commissionType === 'tiered_percentage' ? normalizeTierRowsForEditor(plan.tiers) : undefined,
      isActive: !plan.isActive,
      description: plan.description,
    });
    fetchAll();
  };

  const handleDeletePlan = async (plan: CommissionPayoutPlan) => {
    if (!canManageRules) return;
    const res = await commissionRuleApi.deleteCommissionPayoutPlan(plan.id);
    if (res.code !== 0) {
      setPageError(res.message || '删除失败');
      return;
    }
    fetchAll();
  };

  const handleSubmitRule = async () => {
    if (!canManageRules) return;
    setRuleFormError('');
    if (ruleValidationMessage) {
      setShowRuleValidation(true);
      return;
    }

    const payload = cloneRuleForm({
      ...ruleForm,
      name: ruleForm.name.trim(),
      payouts: ruleForm.payouts.map((payout) => applyPlanToPayout(payout, payout.payoutPlanId)),
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
    if (!canManageRules) return;
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
    if (!canManageRules) return;
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
    if (!canManageRules) return;
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
    if (!canManageRules) return;
    await commissionRuleApi.updateCommissionRoleConfig(config.id, { isActive: !config.isActive });
    fetchAll();
  };

  const handleDeleteRole = async (config: CommissionRoleConfig) => {
    if (!canManageRules) return;
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
            分账规则决定业务来源、人员来源和提成方案；提成角色仅表示业务身份，不影响系统登录权限。
          </Typography>
        </Box>
        {canManageRules && (view === 'rules' ? (
          <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => handleOpenRuleForm()}>
            新增规则
          </Button>
        ) : view === 'plans' ? (
          <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => handleOpenPlanForm()}>
            新增方案
          </Button>
        ) : (
          <Button variant="contained" startIcon={<AddIcon />} size="small" onClick={() => handleOpenRoleForm()}>
            新增角色
          </Button>
        ))}
      </Box>

      <Tabs value={view} onChange={(_event, value) => setView(value)} sx={{ mb: 2 }}>
        <Tab value="rules" label="分账规则" />
        <Tab value="plans" label="提成方案" />
        <Tab value="roles" label="提成角色" />
      </Tabs>

      {pageError && <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setPageError('')}>{pageError}</Alert>}

      {view === 'rules' && (
        <>
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
              {pagedGroups.map((group) => (
                <TableRow key={group.id} hover>
                  <TableCell sx={{ fontWeight: 500, minWidth: 180 }}>{group.name}</TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                      <Chip
                        label={`业务来源 = ${group.businessSource === 'after_sales_recovery' ? '售后挽回' : '正式订单'}`}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                      <Chip label={`订单类型 = ${group.orderType}`} size="small" variant="outlined" />
                      {(group.businessSource || 'formal_order') === 'formal_order' && (
                        <Chip label={`资源来源 = ${group.resourceOwnership}`} size="small" variant="outlined" />
                      )}
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
                    {canManageRules && (
                      <>
                    <Switch checked={group.isActive} size="small" onChange={() => handleToggleRuleActive(group)} />
                    <IconButton size="small" onClick={() => handleOpenRuleForm(group)} title="编辑">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeleteRule(group)} title="删除">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                      </>
                    )}
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
        <TablePagination
          count={groups.length}
          page={tablePagination.rules.page}
          rowsPerPage={tablePagination.rules.rowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
          onPageChange={(_event, page) => updateTablePage('rules', page)}
          onRowsPerPageChange={(event) => updateRowsPerPage('rules', event.target.value)}
          sx={configPaginationSx}
        />
        </>
      )}

      {view === 'plans' && (
        <>
          <Alert severity="info" sx={{ mb: 2 }}>
            提成方案只定义固定金额、固定比例和月度累计阶梯算法，不限制用于哪类业务或哪种提成角色。
          </Alert>
          <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafafa' }}>
                  <TableCell sx={{ fontWeight: 600 }}>方案名称</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>计算方式</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>方案数值</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>说明</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>状态</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pagedPayoutPlans.map((plan) => (
                  <TableRow key={plan.id} hover>
                    <TableCell sx={{ fontWeight: 500, minWidth: 180 }}>
                      {plan.name}
                    </TableCell>
                    <TableCell sx={{ minWidth: 140 }}>{formatPlanMethod(plan.commissionType)}</TableCell>
                    <TableCell sx={{ minWidth: 260, color: '#374151' }}>{formatPlanValue(plan)}</TableCell>
                    <TableCell sx={{ minWidth: 220, color: plan.description ? '#4b5563' : '#9ca3af' }}>
                      {plan.description || '-'}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={plan.isActive ? '启用' : '停用'}
                        size="small"
                        color={plan.isActive ? 'success' : 'default'}
                        variant={plan.isActive ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="查看历史版本">
                        <IconButton
                          size="small"
                          color="primary"
                          aria-label={`查看${plan.name}历史版本`}
                          onClick={() => setHistoryPlan(plan)}
                        >
                          <HistoryIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {canManageRules && (
                        <>
                      <Switch checked={plan.isActive} size="small" onChange={() => handleTogglePlanActive(plan)} />
                      <IconButton size="small" onClick={() => handleOpenPlanForm(plan)} title="编辑">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDeletePlan(plan)} title="删除">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {!payoutPlans.length && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6, color: '#6b7280' }}>
                      暂无提成方案，点击“新增方案”先配置算法模板
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            count={payoutPlans.length}
            page={tablePagination.plans.page}
            rowsPerPage={tablePagination.plans.rowsPerPage}
            rowsPerPageOptions={[10, 20, 50, 100]}
            onPageChange={(_event, page) => updateTablePage('plans', page)}
            onRowsPerPageChange={(event) => updateRowsPerPage('plans', event.target.value)}
            sx={configPaginationSx}
          />
        </>
      )}

      {view === 'roles' && (
        <>
        <Alert severity="info" sx={{ mb: 2 }}>
          提成角色只表示“以什么业务身份获得提成”，不绑定算法、人员或系统权限；实际人员来源和提成方案均在分账规则中选择。
        </Alert>
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#fafafa' }}>
                <TableCell sx={{ fontWeight: 600 }}>角色名称</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>角色说明</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>排序</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>状态</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>操作</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedRoleConfigs.map((config) => (
                <TableRow key={config.id} hover>
                  <TableCell sx={{ fontWeight: 500, minWidth: 140 }}>
                    {config.name}
                  </TableCell>
                  <TableCell sx={{ color: config.description ? '#4b5563' : '#9ca3af', minWidth: 260 }}>
                    {config.description || '-'}
                  </TableCell>
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
                    {canManageRules && (
                      <>
                    <Switch checked={config.isActive} size="small" onChange={() => handleToggleRoleActive(config)} />
                    <IconButton size="small" onClick={() => handleOpenRoleForm(config)} title="编辑">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" color="error" onClick={() => handleDeleteRole(config)} title="删除">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                      </>
                    )}
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
        <TablePagination
          count={roleConfigs.length}
          page={tablePagination.roles.page}
          rowsPerPage={tablePagination.roles.rowsPerPage}
          rowsPerPageOptions={[10, 20, 50, 100]}
          onPageChange={(_event, page) => updateTablePage('roles', page)}
          onRowsPerPageChange={(event) => updateRowsPerPage('roles', event.target.value)}
          sx={configPaginationSx}
        />
        </>
      )}

      <Dialog open={ruleFormOpen} onClose={() => setRuleFormOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setRuleFormOpen(false)}>
          {editingGroup ? '编辑提成规则' : '新增提成规则'}
        </DialogCloseTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            规则负责决定“什么业务、由谁、使用什么方案”；提成角色是业务身份，人员来源决定实际拿提成的人。
          </Alert>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 240px' }, gap: 2, pt: 0.5 }}>
            <TextField
              label="规则名称"
              value={ruleForm.name}
              onChange={(event) => setRuleForm((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
              required
            />
            <FormControl fullWidth required>
              <InputLabel>业务来源</InputLabel>
              <Select
                label="业务来源"
                value={ruleForm.businessSource || 'formal_order'}
                onChange={(event) => {
                  const businessSource = event.target.value as CommissionBusinessSource;
                  setRuleForm((prev) => ({
                    ...prev,
                    businessSource,
                    orderType: businessSource === 'after_sales_recovery' ? '售后挽回' : '',
                    resourceOwnership: businessSource === 'after_sales_recovery' ? '公司资源' : prev.resourceOwnership,
                    payouts: prev.payouts.map((payout) => ({
                      ...payout,
                      assigneeSource: defaultAssigneeSourceForRole(payout.role, businessSource),
                    })),
                  }));
                }}
              >
                {BUSINESS_SOURCE_OPTIONS.map((item) => (
                  <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth required sx={{ maxWidth: { md: 240 }, justifySelf: { md: 'end' } }}>
              <InputLabel>订单类型</InputLabel>
              <Select
                label="订单类型"
                value={ruleForm.orderType}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, orderType: event.target.value }))}
              >
                {ruleForm.businessSource === 'after_sales_recovery'
                  ? <MenuItem value="售后挽回">售后挽回</MenuItem>
                  : orderTypeOptions.map((item) => (
                    <MenuItem key={item.id} value={item.name}>{item.name}</MenuItem>
                  ))}
              </Select>
            </FormControl>
            {ruleForm.businessSource !== 'after_sales_recovery' && <FormControl fullWidth required>
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
            </FormControl>}
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
                    <TableCell sx={{ fontWeight: 600 }}>人员来源</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>提成方案</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>方案摘要</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>操作</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ruleForm.payouts.map((payout, index) => (
                    <TableRow key={`${payout.role}-${index}`}>
                      <TableCell sx={{ width: '28%' }}>
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
                      <TableCell sx={{ width: '24%' }}>
                        <FormControl fullWidth size="small">
                          <Select
                            value={payout.assigneeSource || 'manual'}
                            onChange={(event) => updatePayout(index, 'assigneeSource', event.target.value as CommissionAssigneeSource)}
                          >
                            {ASSIGNEE_SOURCE_OPTIONS.map((item) => (
                              <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell sx={{ width: '34%' }}>
                        <FormControl fullWidth size="small">
                          <Select
                            value={payout.payoutPlanId || ''}
                            displayEmpty
                            onChange={(event) => updatePayout(index, 'payoutPlanId', event.target.value as SimpleCommissionRulePayout['payoutPlanId'])}
                          >
                            {!planOptionsForPayout(payout.payoutPlanId).length && (
                              <MenuItem value="">请先新增提成方案</MenuItem>
                            )}
                            {planOptionsForPayout(payout.payoutPlanId).map((plan) => (
                              <MenuItem key={plan.id} value={plan.id}>
                                {plan.name}{plan.isActive ? '' : '（已停用）'}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell sx={{ width: '26%', color: '#4b5563' }}>
                        {payout.payoutPlanId ? formatPlanValue({
                          commissionType: payout.commissionType,
                          commissionValue: payout.commissionValue,
                          tiers: payout.tiers,
                        }) : '-'}
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

      <Dialog open={tierConfigOpen} onClose={() => !tierConfigSaving && setTierConfigOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => !tierConfigSaving && setTierConfigOpen(false)}>
          阶梯配置
        </DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Alert severity="info">
              这里配置月度累计阶梯方案的档位。任意提成角色引用后，都会按“人员 + 角色 + 方案版本”分别汇总月度业绩。
            </Alert>
            <Stack spacing={1}>
              {normalizeTierRowsForEditor(tierConfigRows).map((tier, index) => (
                <Box
                  key={`${tier.minAmount}-${index}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 42px' },
                    gap: 1,
                    alignItems: 'center',
                  }}
                >
                  <TextField
                    size="small"
                    type="number"
                    label="月累计下限"
                    value={tier.minAmount}
                    onChange={(event) => updateTierConfigRow(index, 'minAmount', Number(event.target.value))}
                    inputProps={{ min: 0, step: 1000 }}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="月累计上限"
                    value={tier.maxAmount ?? ''}
                    placeholder="最后一档留空"
                    onChange={(event) => updateTierConfigRow(
                      index,
                      'maxAmount',
                      event.target.value === '' ? undefined : Number(event.target.value),
                    )}
                    inputProps={{ min: 0, step: 1000 }}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label="提成比例"
                    value={tier.rate}
                    onChange={(event) => updateTierConfigRow(index, 'rate', Number(event.target.value))}
                    inputProps={{ min: 0, step: 0.1 }}
                    InputProps={{ endAdornment: '%' }}
                  />
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => removeTierConfigRow(index)}
                    disabled={normalizeTierRowsForEditor(tierConfigRows).length <= 1}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={addTierConfigRow} sx={{ alignSelf: 'flex-start' }}>
              添加档位
            </Button>
            {tierConfigError && <Alert severity="warning">{tierConfigError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTierConfigOpen(false)} disabled={tierConfigSaving}>取消</Button>
          <Button variant="contained" onClick={saveTierConfig} disabled={tierConfigSaving}>
            {tierConfigSaving ? '保存中...' : '保存'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={planFormOpen} onClose={() => setPlanFormOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setPlanFormOpen(false)}>
          {editingPlan ? '编辑提成方案' : '新增提成方案'}
        </DialogCloseTitle>
        <DialogContent dividers>
          {editingPlan && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              保存算法变更会生成新版本，并重新核算引用该方案的未发放提成；已发放记录继续保留原版本和原金额。
            </Alert>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, pt: 0.5 }}>
            <TextField
              label="方案名称"
              value={planForm.name}
              onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))}
              fullWidth
              required
            />
            <FormControl fullWidth required>
              <InputLabel>计算方式</InputLabel>
              <Select
                label="计算方式"
                value={planForm.commissionType}
                onChange={(event) => {
                  const commissionType = event.target.value as CommissionPayoutPlan['commissionType'];
                  setPlanForm((prev) => ({
                    ...prev,
                    commissionType,
                    commissionValue: commissionType === 'tiered_percentage'
                      ? 0
                      : prev.commissionType === 'tiered_percentage'
                        ? ''
                        : prev.commissionValue,
                    tiers: commissionType === 'tiered_percentage'
                      ? normalizeTierRowsForEditor(prev.tiers || DEFAULT_TIER_CONFIG_ROWS)
                      : undefined,
                  }));
                }}
              >
                <MenuItem value="percentage">固定比例</MenuItem>
                <MenuItem value="fixed">固定金额</MenuItem>
                <MenuItem value="tiered_percentage">月度累计阶梯</MenuItem>
              </Select>
            </FormControl>
            {planForm.commissionType !== 'tiered_percentage' && (
              <TextField
                label={planForm.commissionType === 'percentage' ? '固定比例' : '固定金额'}
                type="number"
                value={planForm.commissionValue}
                onChange={(event) => {
                  const inputValue = event.target.value;
                  setPlanForm((prev) => ({
                    ...prev,
                    commissionValue: inputValue === '' ? '' : Number(inputValue),
                  }));
                }}
                placeholder={planForm.commissionType === 'percentage' ? '请输入比例' : '请输入金额'}
                inputProps={{ min: 0, step: planForm.commissionType === 'percentage' ? 0.1 : 1 }}
                InputProps={{
                  startAdornment: planForm.commissionType === 'fixed' ? '¥' : undefined,
                  endAdornment: planForm.commissionType === 'percentage' ? '%' : undefined,
                }}
                fullWidth
                required
                sx={{ maxWidth: { md: 240 } }}
              />
            )}
            {planForm.commissionType === 'tiered_percentage' && (
              <Alert severity="info" sx={{ gridColumn: '1 / -1' }}>
                月度累计阶梯的档位和比例在提成方案中维护，分账规则只负责选择业务角色、人员来源和方案。
              </Alert>
            )}
            {planForm.commissionType === 'tiered_percentage' && (
              <Box sx={{ gridColumn: '1 / -1', border: '1px solid #e5e7eb', borderRadius: 1, p: 1.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
                  <Box>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>月度阶梯档位</Typography>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      按提成角色与方案版本汇总月度业绩并命中档位，最后一档上限留空。
                    </Typography>
                  </Box>
                  <Button size="small" startIcon={<AddIcon />} onClick={addPlanFormTierRow}>
                    添加档位
                  </Button>
                </Stack>
                <Stack spacing={1}>
                  {normalizeTierRowsForEditor(planForm.tiers || DEFAULT_TIER_CONFIG_ROWS).map((tier, index) => (
                    <Box
                      key={`${tier.minAmount}-${index}`}
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 40px' },
                        gap: 1,
                        alignItems: 'center',
                      }}
                    >
                      <TextField
                        size="small"
                        label="月累计下限"
                        type="number"
                        value={tier.minAmount}
                        onChange={(event) => updatePlanFormTierRow(index, 'minAmount', Number(event.target.value))}
                        inputProps={{ min: 0, step: 1000 }}
                      />
                      <TextField
                        size="small"
                        label="月累计上限"
                        type="number"
                        value={tier.maxAmount ?? ''}
                        placeholder="最后一档留空"
                        onChange={(event) => updatePlanFormTierRow(
                          index,
                          'maxAmount',
                          event.target.value === '' ? undefined : Number(event.target.value),
                        )}
                        inputProps={{ min: 0, step: 1000 }}
                      />
                      <TextField
                        size="small"
                        label="提成比例"
                        type="number"
                        value={tier.rate}
                        onChange={(event) => updatePlanFormTierRow(index, 'rate', Number(event.target.value))}
                        inputProps={{ min: 0, step: 0.1 }}
                        InputProps={{ endAdornment: '%' }}
                      />
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => removePlanFormTierRow(index)}
                        disabled={normalizeTierRowsForEditor(planForm.tiers || DEFAULT_TIER_CONFIG_ROWS).length <= 1}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ))}
                </Stack>
              </Box>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 56 }}>
              <Switch
                checked={planForm.isActive}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              <Typography variant="body2">{planForm.isActive ? '启用方案' : '停用方案'}</Typography>
            </Box>
            <TextField
              label="说明"
              value={planForm.description}
              onChange={(event) => setPlanForm((prev) => ({ ...prev, description: event.target.value }))}
              fullWidth
              multiline
              minRows={2}
              sx={{ gridColumn: '1 / -1' }}
            />
          </Box>

          {(planFormError || (showPlanValidation && planValidationMessage)) && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              {planFormError || planValidationMessage}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPlanFormOpen(false)}>取消</Button>
          <Button variant="contained" onClick={handleSubmitPlan} disabled={loading}>
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(historyPlan)} onClose={() => setHistoryPlan(null)} maxWidth="lg" fullWidth>
        <DialogCloseTitle onClose={() => setHistoryPlan(null)}>
          {historyPlan ? `${historyPlan.name} · 历史版本` : '提成方案历史版本'}
        </DialogCloseTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
          {historyPlan && (() => {
            const history = getPayoutPlanHistory(historyPlan);
            const ascendingHistory = history.slice().sort((left, right) => left.version - right.version);
            return (
              <Stack spacing={1.5}>
                <Alert severity="info">
                  当前版本用于新核算和未发放提成；已发放记录继续保留其实际使用的方案快照。
                </Alert>
                <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #dbe3ef' }}>
                  <Table size="small" sx={{ minWidth: 980 }}>
                    <TableHead>
                      <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                        <TableCell sx={{ fontWeight: 800 }}>版本</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>计算方式</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>方案数值</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>生效时间</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>结束时间</TableCell>
                        <TableCell sx={{ fontWeight: 800 }}>变更内容</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {history.map((revision, index) => {
                        const previous = ascendingHistory.find((item) => item.version === revision.version - 1);
                        return (
                          <TableRow key={`${revision.id}-v${revision.version}`} hover>
                            <TableCell>
                              <Stack direction="row" spacing={0.75} alignItems="center">
                                <Typography variant="body2" fontWeight={900}>v{revision.version}</Typography>
                                {index === 0 && <Chip label="当前生效" size="small" color="success" />}
                              </Stack>
                            </TableCell>
                            <TableCell>{formatPlanMethod(revision.commissionType)}</TableCell>
                            <TableCell>{formatPlanValue(revision)}</TableCell>
                            <TableCell>{formatVersionTime(revision.effectiveFrom)}</TableCell>
                            <TableCell>{revision.effectiveTo ? formatVersionTime(revision.effectiveTo) : '当前生效'}</TableCell>
                            <TableCell sx={{ minWidth: 260 }}>{describePlanVersionChange(revision, previous)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
                {history.length === 1 && (
                  <Typography variant="body2" color="text.secondary">
                    当前只有初始版本；修改方案算法后，旧版本会自动保留在这里。
                  </Typography>
                )}
              </Stack>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryPlan(null)}>关闭</Button>
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
