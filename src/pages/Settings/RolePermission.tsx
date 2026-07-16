import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  InputAdornment,
  MenuItem,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import useRoleStore from '../../store/useRoleStore';
import { settingsApi } from '../../api';
import type { DataScopeDomain, DataScopeLevel, Permission, Role, RoleDataScopes } from '../../types/role';
import type { User } from '../../types/settings';
import { CAPABILITY_KEYS, PERMISSION_KEYS, getRoleEditorPermissionActions } from '../../shared/utils/permissions';
import { normalizeUserRoleName } from '../../shared/utils/roles';

type RoleForm = {
  name: string;
  description: string;
  departmentId: string;
  isActive: boolean;
  permissions: Permission[];
  dataScopes: RoleDataScopes;
};

type PermissionNode = {
  label: string;
  key?: string;
  children?: PermissionNode[];
};

const PERMISSION_TREE: PermissionNode[] = [
  { label: '全部' },
  { label: '首页', key: PERMISSION_KEYS.HOME },
  { label: '驾驶舱', key: PERMISSION_KEYS.DASHBOARD },
  {
    label: '线索',
    children: [
      {
        label: '线索列表',
        children: [
          { label: '查看线索资料', key: PERMISSION_KEYS.LEADS_DETAIL },
          { label: '新建线索', key: PERMISSION_KEYS.LEADS_CREATE },
          { label: '开始跟进并加入客户', key: PERMISSION_KEYS.LEADS_FOLLOW },
          { label: '分配销售', key: PERMISSION_KEYS.LEADS_FLOW_CONFIG },
        ],
      },
      { label: '入库情况', key: PERMISSION_KEYS.LEADS_INTAKE_STATUS },
    ],
  },
  {
    label: '客户',
    children: [
      { label: '客户列表', key: PERMISSION_KEYS.CUSTOMER_LIST },
      { label: '查看客户资料', key: PERMISSION_KEYS.CUSTOMER_DETAIL },
      { label: '新建客户', key: PERMISSION_KEYS.CUSTOMER_CREATE },
      { label: '编辑客户', key: PERMISSION_KEYS.CUSTOMER_EDIT },
      { label: '分配客户', key: PERMISSION_KEYS.CUSTOMER_ASSIGN },
      { label: '领取公海客户', key: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM },
      { label: '新建客户订单', key: PERMISSION_KEYS.CUSTOMER_CREATE_ORDER },
      { label: '查看客户订单', key: PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS },
    ],
  },
  {
    label: '订单',
    children: [
      { label: '订单列表', key: PERMISSION_KEYS.ORDER_MANAGE },
      { label: '订单审核列表', key: PERMISSION_KEYS.ORDER_REVIEW_LIST },
      { label: '订单审核操作', key: PERMISSION_KEYS.ORDER_REVIEW },
      { label: '新增订单', key: PERMISSION_KEYS.ORDER_CREATE },
      { label: '编辑订单', key: PERMISSION_KEYS.ORDER_EDIT },
      { label: '删除订单', key: PERMISSION_KEYS.ORDER_DELETE },
      { label: '订单修改记录', key: PERMISSION_KEYS.ORDER_HISTORY },
      { label: '付款截图识别', key: PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT },
    ],
  },
  {
    label: '交付',
    children: [
      { label: '交付中心', key: PERMISSION_KEYS.DELIVERY_CENTER },
      { label: '移动交付卡片', key: PERMISSION_KEYS.DELIVERY_MOVE_CARD },
      { label: '交付阶段配置', key: PERMISSION_KEYS.DELIVERY_STAGE_CONFIG },
    ],
  },
  {
    label: '售后服务',
    children: [
      { label: '售后挽回订单列表', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY },
      { label: '售后挽回订单审核列表', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST },
      { label: '售后挽回订单审核操作', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW },
      { label: '新增售后挽回订单', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE },
      { label: '编辑售后挽回订单', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT },
      { label: '删除售后挽回订单', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE },
      { label: '售后挽回订单修改记录', key: PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY },
    ],
  },
  {
    label: '财务中心',
    children: [
      { label: '我的提成', key: PERMISSION_KEYS.FINANCE_MY_COMMISSION },
      { label: '订单分账', key: PERMISSION_KEYS.FINANCE_SETTLEMENT },
      { label: '售后挽回分账', key: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT },
      { label: '员工提成月报', key: PERMISSION_KEYS.FINANCE_PAYOUT },
      { label: '收支流水', key: PERMISSION_KEYS.FINANCE_FLOW },
      { label: '提成规则', key: PERMISSION_KEYS.FINANCE_RULES },
    ],
  },
  {
    label: '电商结算中心',
    children: [
      { label: '结算工作台', key: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_WORKBENCH },
      { label: '结算历史', key: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_HISTORY },
      { label: '异常核对', key: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_EXCEPTIONS },
      { label: '达人结算汇总', key: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_TALENTS },
      { label: '店铺与参数', key: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_SETTINGS },
      { label: '结算规则', key: PERMISSION_KEYS.ECOMMERCE_SETTLEMENT_RULES },
    ],
  },
  {
    label: '资产管理',
    children: [
      { label: '资产总览', key: PERMISSION_KEYS.ASSETS_OVERVIEW },
      { label: '设备资产', key: PERMISSION_KEYS.ASSETS_DEVICES },
      { label: '手机号资产', key: PERMISSION_KEYS.ASSETS_PHONES },
      { label: '互联网账号', key: PERMISSION_KEYS.ASSETS_ACCOUNTS },
      { label: '矩阵发布', key: PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH },
      { label: '风险提醒', key: PERMISSION_KEYS.ASSETS_RISKS },
      { label: '操作日志', key: PERMISSION_KEYS.ASSETS_LOGS },
      { label: '离职回收', key: PERMISSION_KEYS.ASSETS_OFFBOARDING },
      { label: '查看敏感字段', key: PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW },
      { label: '导入导出', key: PERMISSION_KEYS.ASSETS_IMPORT_EXPORT },
    ],
  },
  {
    label: 'GEO',
    children: [
      { label: 'GEO总览', key: PERMISSION_KEYS.GEO_OVERVIEW },
      { label: '内容矩阵', key: PERMISSION_KEYS.GEO_CONTENT },
      { label: '效果分析', key: PERMISSION_KEYS.GEO_ANALYTICS },
    ],
  },
  {
    label: 'AI助手',
    children: [
      { label: 'AI对话', key: PERMISSION_KEYS.AI_CHAT },
      { label: '运营建议', key: PERMISSION_KEYS.AI_SUGGESTIONS },
      { label: '数据分析', key: PERMISSION_KEYS.AI_ANALYTICS },
    ],
  },
  {
    label: '赋能中台',
    children: [
      { label: '企业知识', key: PERMISSION_KEYS.ENABLEMENT_KNOWLEDGE },
      { label: '知识审核', key: PERMISSION_KEYS.ENABLEMENT_REVIEW },
      { label: '发布管理', key: PERMISSION_KEYS.ENABLEMENT_PUBLISH },
      { label: '查看敏感知识', key: PERMISSION_KEYS.ENABLEMENT_SENSITIVE },
    ],
  },
  {
    label: '系统设置',
    children: [
      {
        label: '组织架构',
        children: [
          { label: '员工&部门', key: PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS },
          { label: '角色权限', key: PERMISSION_KEYS.SETTINGS_ROLES },
          { label: '账号回收站', key: PERMISSION_KEYS.SETTINGS_ACCOUNT_RECYCLE },
        ],
      },
      {
        label: '产品设置',
        children: [
          { label: '产品配置', key: PERMISSION_KEYS.SETTINGS_PRODUCTS },
          { label: '订单类型', key: PERMISSION_KEYS.SETTINGS_ORDER_TYPES },
        ],
      },
      {
        label: '客户设置',
        children: [
          { label: '客户等级', key: PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS },
          { label: '客户生命周期', key: PERMISSION_KEYS.SETTINGS_LIFECYCLE },
          { label: '线索来源', key: PERMISSION_KEYS.SETTINGS_LEAD_SOURCES },
          { label: '线索流转', key: PERMISSION_KEYS.SETTINGS_LEAD_FLOW },
        ],
      },
      {
        label: '交付设置',
        children: [
          { label: '客户成功分配', key: PERMISSION_KEYS.SETTINGS_DELIVERY_ASSIGNMENT },
        ],
      },
      {
        label: '售后设置',
        children: [
          { label: '来源平台与店铺', key: PERMISSION_KEYS.SETTINGS_AFTER_SALES_SOURCES },
        ],
      },
      {
        label: '系统维护',
        children: [
          { label: 'AI大脑', key: PERMISSION_KEYS.SETTINGS_AI_CONFIG },
          { label: '业务回收与CRM迁移', key: PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE },
        ],
      },
    ],
  },
];

const defaultPermission: Permission = { module: PERMISSION_KEYS.HOME, actions: ['read'] };
const defaultDataScopes: Record<DataScopeDomain, DataScopeLevel> = {
  leads: 'self',
  customers: 'self',
  orders: 'self',
  deliveries: 'self',
  orderApplications: 'self',
  recoveryOrders: 'self',
  recoveryOrderApplications: 'self',
  assets: 'self',
};
const emptyForm: RoleForm = {
  name: '',
  description: '',
  departmentId: '',
  isActive: true,
  permissions: [defaultPermission],
  dataScopes: defaultDataScopes,
};

const dataScopeOptions: Array<{ value: DataScopeLevel; label: string }> = [
  { value: 'self', label: '本人' },
  { value: 'department', label: '本部门' },
  { value: 'all', label: '全部' },
];

const dataScopeRows: Array<{ domain: DataScopeDomain; label: string; description: string; permissionKeys: string[] }> = [
  { domain: 'leads', label: '线索数据', description: '控制线索列表、入库情况和线索统计的数据范围', permissionKeys: [PERMISSION_KEYS.LEADS_LIST, PERMISSION_KEYS.LEADS_DETAIL, PERMISSION_KEYS.LEADS_CREATE, PERMISSION_KEYS.LEADS_FOLLOW, PERMISSION_KEYS.LEADS_FLOW_CONFIG, PERMISSION_KEYS.LEADS_INTAKE_STATUS] },
  { domain: 'customers', label: '客户数据', description: '控制客户列表、客户资料和客户统计的数据范围', permissionKeys: [PERMISSION_KEYS.CUSTOMER_LIST, PERMISSION_KEYS.CUSTOMER_DETAIL, PERMISSION_KEYS.CUSTOMER_CREATE, PERMISSION_KEYS.CUSTOMER_EDIT, PERMISSION_KEYS.CUSTOMER_ASSIGN, PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, PERMISSION_KEYS.CUSTOMER_CREATE_ORDER, PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS] },
  { domain: 'orders', label: '订单数据', description: '控制正式订单列表、订单筛选和订单统计的数据范围', permissionKeys: [PERMISSION_KEYS.ORDER_MANAGE, PERMISSION_KEYS.ORDER_CREATE, PERMISSION_KEYS.ORDER_EDIT, PERMISSION_KEYS.ORDER_DELETE, PERMISSION_KEYS.ORDER_HISTORY, PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT] },
  { domain: 'deliveries', label: '交付数据', description: '控制交付中心列表、详情、统计和可创建交付订单的数据范围', permissionKeys: [PERMISSION_KEYS.DELIVERY, PERMISSION_KEYS.DELIVERY_CENTER, PERMISSION_KEYS.DELIVERY_MOVE_CARD, PERMISSION_KEYS.DELIVERY_STAGE_CONFIG] },
  { domain: 'orderApplications', label: '订单审核台数据', description: '控制订单审核台能看到哪些订单申请；审核列表权限控制入口，审核操作权限控制通过、退回和驳回', permissionKeys: [PERMISSION_KEYS.ORDER_REVIEW_LIST] },
  { domain: 'recoveryOrders', label: '售后挽回订单数据', description: '控制售后挽回订单列表、筛选和统计的数据范围', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY, PERMISSION_KEYS.AFTER_SALES_RECOVERY_CREATE, PERMISSION_KEYS.AFTER_SALES_RECOVERY_EDIT, PERMISSION_KEYS.AFTER_SALES_RECOVERY_DELETE, PERMISSION_KEYS.AFTER_SALES_RECOVERY_HISTORY] },
  { domain: 'recoveryOrderApplications', label: '售后挽回订单审核台数据', description: '控制售后挽回审核台能看到哪些挽回订单；审核列表权限控制入口，审核操作权限控制通过、退回和驳回', permissionKeys: [PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW_LIST] },
  { domain: 'assets', label: '资产数据', description: '控制设备资产、手机号资产、互联网账号、矩阵发布、风险提醒和离职回收的数据范围', permissionKeys: [PERMISSION_KEYS.ASSETS, PERMISSION_KEYS.ASSETS_OVERVIEW, PERMISSION_KEYS.ASSETS_DEVICES, PERMISSION_KEYS.ASSETS_PHONES, PERMISSION_KEYS.ASSETS_ACCOUNTS, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, PERMISSION_KEYS.ASSETS_RISKS, PERMISSION_KEYS.ASSETS_LOGS, PERMISSION_KEYS.ASSETS_OFFBOARDING] },
];

const getNodeKey = (path: string[]) => path.join('/');

const collectLeafKeys = (node: PermissionNode, path: string[] = []): string[] => {
  const currentPath = [...path, node.label];
  if (!node.children?.length) return [node.key || getNodeKey(currentPath)];
  return node.children.flatMap((child) => collectLeafKeys(child, currentPath));
};

const getAllSelectablePermissionKeys = () => (
  PERMISSION_TREE
    .filter((category) => category.label !== '全部')
    .flatMap((category) => collectLeafKeys(category, []))
);

const getSelectableNodeKeys = (node: PermissionNode, path: string[] = []): string[] => {
  if (node.label === '全部') return getAllSelectablePermissionKeys();
  return collectLeafKeys(node, path);
};

const getPermissionAliasMap = () => {
  const aliases = new Map<string, string[]>();
  aliases.set('全部', getAllSelectablePermissionKeys());

  const walk = (node: PermissionNode, path: string[] = []) => {
    const currentPath = [...path, node.label];
    const selectableKeys = getSelectableNodeKeys(node, path);
    aliases.set(getNodeKey(currentPath), selectableKeys);
    aliases.set(node.label, selectableKeys);
    if (node.key) aliases.set(node.key, [node.key]);
    node.children?.forEach((child) => walk(child, currentPath));
  };

  PERMISSION_TREE
    .filter((category) => category.label !== '全部')
    .forEach((category) => walk(category, []));

  [
    '用户管理',
    '系统设置/组织权限/用户管理',
    '系统设置/组织权限/员工&部门',
    '系统设置/组织架构/员工账号',
    '系统设置/组织架构/部门管理',
  ].forEach((legacyKey) => aliases.set(legacyKey, [PERMISSION_KEYS.SETTINGS_EMPLOYEES_DEPARTMENTS]));

  [
    '线索/新建线索',
  ].forEach((legacyKey) => aliases.set(legacyKey, [PERMISSION_KEYS.LEADS_CREATE]));
  [
    '线索/分配线索',
    '线索/分配线索能力',
    CAPABILITY_KEYS.LEADS_ASSIGN,
  ].forEach((legacyKey) => aliases.set(legacyKey, [PERMISSION_KEYS.LEADS_FLOW_CONFIG]));
  [
    '线索/接收/领取线索',
    '线索/线索跟进',
    '线索/线索转客户',
    CAPABILITY_KEYS.LEADS_RECEIVE,
    PERMISSION_KEYS.LEADS_CONVERT,
  ].forEach((legacyKey) => aliases.set(legacyKey, [PERMISSION_KEYS.LEADS_FOLLOW]));

  return aliases;
};

const toPermissions = (keys: Set<string>): Permission[] => (
  Array.from(keys).sort().map((module) => ({ module, actions: getRoleEditorPermissionActions(module) }))
);

const normalizePermissionKeys = (permissions: Permission[]) => {
  const selectableKeys = new Set(getAllSelectablePermissionKeys());
  const aliases = getPermissionAliasMap();
  const normalized = new Set<string>();

  permissions.forEach((permission) => {
    const module = permission.module.trim();
    if (selectableKeys.has(module)) {
      normalized.add(module);
      return;
    }

    aliases.get(module)?.forEach((key) => normalized.add(key));
  });

  return normalized;
};

const isNodeChecked = (permissions: Permission[], node: PermissionNode, path: string[] = []) => {
  const permissionSet = normalizePermissionKeys(permissions);
  const keys = getSelectableNodeKeys(node, path);
  return keys.length > 0 && keys.every((key) => permissionSet.has(key));
};

const isNodeIndeterminate = (permissions: Permission[], node: PermissionNode, path: string[] = []) => {
  const permissionSet = normalizePermissionKeys(permissions);
  const keys = getSelectableNodeKeys(node, path);
  const checkedCount = keys.filter((key) => permissionSet.has(key)).length;
  return checkedCount > 0 && checkedCount < keys.length;
};

const getLeafPermissionLabels = (permissions: Permission[]) => {
  const selected = normalizePermissionKeys(permissions);
  const leafKeys = getAllSelectablePermissionKeys();
  return Array.from(selected).filter((key) => leafKeys.includes(key));
};

const normalizeDataScopes = (value?: RoleDataScopes, code?: string): RoleDataScopes => {
  if (code === 'super_admin') {
    return {
      leads: 'all',
      customers: 'all',
      orders: 'all',
      deliveries: 'all',
      orderApplications: 'all',
      recoveryOrders: 'all',
      recoveryOrderApplications: 'all',
      assets: 'all',
    };
  }
  return { ...defaultDataScopes, ...(value || {}) };
};

const hasAnyPermissionKey = (permissions: Permission[], keys: string[]) => {
  const selected = normalizePermissionKeys(permissions);
  return keys.some((key) => selected.has(key));
};

const roleToForm = (role: Role): RoleForm => ({
  name: role.name,
  description: role.description || '',
  departmentId: role.departmentId || '',
  isActive: role.isActive,
  permissions: role.permissions.length ? role.permissions : [defaultPermission],
  dataScopes: normalizeDataScopes(role.dataScopes, role.code),
});

const userMatchesRole = (user: User, role: Role): boolean => (
  user.roleId === role.id || normalizeUserRoleName(user.role) === role.name
);

const RolePermission: React.FC = () => {
  const { items, fetchItems, create, update, delete: deleteRole } = useRoleStore();
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [mode, setMode] = useState<'edit' | 'create'>('edit');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [error, setError] = useState('');
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchItems();
    settingsApi.fetchUsers().then((res) => {
      if (res.code === 0) setUsers(res.data);
    });
  }, [fetchItems]);

  useEffect(() => {
    if (!items.length || mode === 'create') return;
    const nextRole = items.find((role) => role.id === selectedRoleId) || items[0];
    setSelectedRoleId(nextRole.id);
    setEditRole(nextRole);
    setForm(roleToForm(nextRole));
  }, [items, mode, selectedRoleId]);

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((role) => {
      const matchedSearch = !q
        || role.name.toLowerCase().includes(q)
        || role.code.toLowerCase().includes(q)
        || (role.description || '').toLowerCase().includes(q);
      const matchedStatus = statusFilter === 'all'
        || (statusFilter === 'enabled' ? role.isActive : !role.isActive);
      return matchedSearch && matchedStatus;
    });
  }, [items, search, statusFilter]);

  const selectedPermissionCount = normalizePermissionKeys(form.permissions).size;
  const roleMemberCount = (role: Role) => users.filter((user) => userMatchesRole(user, role)).length;
  const boundUsers = editRole ? users.filter((user) => userMatchesRole(user, editRole)) : [];
  const activeBoundUsers = boundUsers.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active');

  const handleSelectRole = (role: Role) => {
    setError('');
    setSaveMessage(null);
    setMode('edit');
    setSelectedRoleId(role.id);
    setEditRole(role);
    setForm(roleToForm(role));
  };

  const handleCreate = () => {
    setError('');
    setSaveMessage(null);
    setMode('create');
    setSelectedRoleId('');
    setEditRole(null);
    setForm({ ...emptyForm, dataScopes: defaultDataScopes });
  };

  const handleSubmit = async () => {
    setError('');
    setSaveMessage(null);
    if (!form.name.trim()) {
      setSaveMessage({ type: 'error', text: '请先填写角色名称' });
      return;
    }
    const permissions = toPermissions(normalizePermissionKeys(form.permissions));
    const dataScopes = normalizeDataScopes(form.dataScopes, editRole?.code);
    if (!permissions.length) {
      setSaveMessage({ type: 'error', text: '请至少选择一个菜单权限' });
      return;
    }

    setSaving(true);
    try {
      if (editRole) {
        await update(editRole.id, { ...form, name: form.name.trim(), permissions, dataScopes, code: editRole.code });
      } else {
        await create({
          ...form,
          name: form.name.trim(),
          permissions,
          dataScopes,
          code: `role-${Date.now()}`,
          memberCount: 0,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : '保存失败' });
      setSaving(false);
      return;
    }
    setMode('edit');
    await fetchItems();
    setSaveMessage({ type: 'success', text: editRole ? '角色权限已保存' : '角色已创建' });
    setSaving(false);
  };

  const handlePermissionToggle = (node: PermissionNode, path: string[] = []) => {
    setForm((prev) => {
      const nextKeys = normalizePermissionKeys(prev.permissions);
      const nodeKeys = getSelectableNodeKeys(node, path);
      const checked = nodeKeys.every((key) => nextKeys.has(key));
      nodeKeys.forEach((key) => {
        if (checked) {
          nextKeys.delete(key);
        } else {
          nextKeys.add(key);
        }
      });
      return { ...prev, permissions: toPermissions(nextKeys) };
    });
  };

  const handleDataScopeChange = (domain: DataScopeDomain, value: DataScopeLevel | null) => {
    if (!value) return;
    setForm((prev) => ({
      ...prev,
      dataScopes: {
        ...prev.dataScopes,
        [domain]: value,
      },
    }));
  };

  const handleDelete = async (role: Role) => {
    setError('');
    try {
      await deleteRole(role.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    }
    fetchItems();
  };

  return (
    <Box sx={{ border: '1px solid #dfe7f1', borderRadius: 1.5, overflow: 'hidden', minHeight: 700, bgcolor: '#fff' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '300px minmax(0, 1fr)' }, minHeight: 700 }}>
        <Box sx={{ borderRight: { lg: '1px solid #dfe7f1' }, bgcolor: '#f7faff', p: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#132238' }}>角色列表</Typography>
              <Typography variant="caption" sx={{ color: '#7890ad' }}>共 {items.length} 个角色</Typography>
            </Box>
            <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleCreate}>
              新增
            </Button>
          </Box>

          <TextField
            size="small"
            placeholder="搜索角色名称/标识"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            fullWidth
            sx={{ mb: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            }}
          />
          <TextField
            select
            size="small"
            label="状态"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as 'all' | 'enabled' | 'disabled')}
            fullWidth
            sx={{ mb: 1.5 }}
          >
            <MenuItem value="all">全部状态</MenuItem>
            <MenuItem value="enabled">启用</MenuItem>
            <MenuItem value="disabled">停用</MenuItem>
          </TextField>

          <Box sx={{ display: 'grid', gap: 0.75 }}>
            {mode === 'create' && (
              <Box
                sx={{
                  border: '1px solid #b7d7ff',
                  bgcolor: '#e8f2ff',
                  borderRadius: 1,
                  p: 1.25,
                  color: '#0f5fca',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 800 }}>新建角色</Typography>
                <Typography variant="caption">配置后保存到角色列表</Typography>
              </Box>
            )}
            {filteredRoles.map((role) => {
              const selected = mode === 'edit' && selectedRoleId === role.id;
              const permissionCount = getLeafPermissionLabels(role.permissions).length;
              const memberCount = roleMemberCount(role);
              return (
                <Box
                  key={role.id}
                  onClick={() => handleSelectRole(role)}
                  sx={{
                    border: '1px solid',
                    borderColor: selected ? '#b7d7ff' : '#e4edf7',
                    bgcolor: selected ? '#e8f2ff' : '#fff',
                    borderRadius: 1,
                    p: 1.25,
                    cursor: 'pointer',
                    boxShadow: selected ? '0 8px 18px rgba(25, 118, 210, 0.08)' : 'none',
                    '&:hover': { borderColor: '#b7d7ff' },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: selected ? '#1976d2' : '#eef4fb', color: selected ? '#fff' : '#52677f', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>
                      {role.name.slice(0, 1)}
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 800, color: '#132238', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {role.name}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#7890ad' }}>
                        {permissionCount} 项权限 · {memberCount} 人
                      </Typography>
                    </Box>
                    <Chip
                      label={role.isActive ? '启用' : '停用'}
                      size="small"
                      sx={{
                        height: 22,
                        bgcolor: role.isActive ? '#e7f7ef' : '#fff4e5',
                        color: role.isActive ? '#16815c' : '#b45309',
                        fontWeight: 700,
                      }}
                    />
                  </Box>
                </Box>
              );
            })}
            {!filteredRoles.length && (
              <Box sx={{ py: 5, textAlign: 'center', color: '#94a3b8' }}>没有匹配的角色</Box>
            )}
          </Box>
        </Box>

        <Box sx={{ minWidth: 0, bgcolor: '#fbfcfe' }}>
          <Box sx={{ p: { xs: 2, md: 3 }, display: 'grid', gap: 2 }}>
            {error && <Typography variant="body2" sx={{ color: '#d32f2f' }}>{error}</Typography>}

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.12fr) minmax(360px, 0.88fr)' }, gap: 2 }}>
              <Box sx={{ bgcolor: '#fff', border: '1px solid #dfe7f1', borderRadius: 1.25, overflow: 'hidden' }}>
                <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #edf2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#132238' }}>角色资料</Typography>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>
                      {mode === 'create' ? '正在新建角色' : `${boundUsers.length} 名成员绑定该角色`}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    {editRole && (
                      <>
                        <Switch checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} disabled={editRole.code === 'super_admin'} />
                        <Typography variant="body2" sx={{ color: '#52677f', mr: 1 }}>{form.isActive ? '启用' : '停用'}</Typography>
                      </>
                    )}
                    <Button variant="outlined" size="small" onClick={handleCreate} startIcon={<AddIcon />}>新增角色</Button>
                    {editRole && (
                      <Button
                        variant="text"
                        size="small"
                        color="error"
                        onClick={() => handleDelete(editRole)}
                        disabled={editRole.code === 'super_admin'}
                        startIcon={<DeleteIcon />}
                      >
                        删除角色
                      </Button>
                    )}
                  </Box>
                </Box>
                <Box sx={{ p: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.1fr' }, gap: 2, alignItems: 'start' }}>
                  <TextField label="角色名称" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required fullWidth />
                  <TextField label="角色说明" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} fullWidth />
                </Box>
                <Box sx={{ mx: 2.5, mb: 2.5, p: 1.75, borderRadius: 1, bgcolor: '#f4f8fd', border: '1px solid #dfeaf7', display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.25 }}>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>已选权限</Typography>
                    <Typography variant="h6" sx={{ color: '#1976d2', fontWeight: 800 }}>{selectedPermissionCount}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>绑定成员</Typography>
                    <Typography variant="h6" sx={{ color: '#132238', fontWeight: 800 }}>{boundUsers.length}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>在职成员</Typography>
                    <Typography variant="h6" sx={{ color: '#16815c', fontWeight: 800 }}>{activeBoundUsers.length}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>数据范围</Typography>
                    <Typography variant="body2" sx={{ mt: 0.75, color: '#52677f', fontWeight: 800 }}>{editRole?.code === 'super_admin' ? '全部数据' : '按域配置'}</Typography>
                  </Box>
                </Box>
              </Box>

              <Box sx={{ bgcolor: '#fff', border: '1px solid #dfe7f1', borderRadius: 1.25, overflow: 'hidden' }}>
                <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #edf2f7', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Box>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#132238' }}>已绑定成员</Typography>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>员工账号中使用该角色的人</Typography>
                  </Box>
                  <Chip label={`${boundUsers.length} 人`} size="small" sx={{ bgcolor: '#eef4fb', color: '#31506f', fontWeight: 700 }} />
                </Box>
                <Box sx={{ p: 1.5 }}>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))', gap: 0.75, maxHeight: 142, overflowY: 'auto', pr: 0.5 }}>
                    {boundUsers.map((user) => (
                      <Box
                        key={user.id}
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 0.75,
                          minWidth: 0,
                          minHeight: 34,
                          px: 0.75,
                          py: 0.5,
                          border: '1px solid #edf2f7',
                          borderRadius: 1,
                          bgcolor: '#fbfcfe',
                        }}
                      >
                        <Box sx={{ width: 22, height: 22, flex: '0 0 22px', borderRadius: '50%', bgcolor: '#e8f2ff', color: '#1976d2', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>
                          {user.name.slice(0, 1)}
                        </Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: '#132238', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{user.name}</Typography>
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: user.isActive ? '#16a34a' : '#f59e0b', flex: '0 0 6px' }} />
                          </Box>
                          <Typography variant="caption" sx={{ color: '#7890ad', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>{user.positionName || user.account || '-'}</Typography>
                        </Box>
                      </Box>
                    ))}
                  </Box>
                  {!boundUsers.length && (
                    <Box sx={{ py: 4, textAlign: 'center', color: '#94a3b8', border: '1px dashed #d8e3ef', borderRadius: 1 }}>
                      暂无员工绑定该角色
                    </Box>
                  )}
                </Box>
              </Box>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.25fr) minmax(340px, 0.75fr)' }, gap: 2, alignItems: 'stretch' }}>
              <Box sx={{ bgcolor: '#fff', border: '1px solid #dfe7f1', borderRadius: 1.25, overflow: 'hidden' }}>
                <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #edf2f7' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#132238' }}>菜单权限</Typography>
                  <Typography variant="caption" sx={{ color: '#7890ad' }}>勾选后可见/可用，未勾选则隐藏</Typography>
                </Box>
                <Box sx={{ maxHeight: 520, overflowY: 'auto', p: 1.25 }}>
                  {PERMISSION_TREE.map((category) => {
                    const categoryPath: string[] = [];
                    const firstLevelNodes = category.children || [];
                    const directLeafOnly = firstLevelNodes.length > 0 && firstLevelNodes.every((node) => !node.children?.length);
                    const rows = directLeafOnly
                      ? [{
                        label: `${category.label}权限`,
                        node: category,
                        path: categoryPath,
                        children: firstLevelNodes,
                        childPath: [category.label],
                      }]
                      : (firstLevelNodes.length ? firstLevelNodes : [category]).map((node) => ({
                        label: node.label,
                        node,
                        path: firstLevelNodes.length ? [category.label] : categoryPath,
                        children: node.children || [],
                        childPath: firstLevelNodes.length ? [category.label, node.label] : categoryPath,
                      }));

                    return (
                      <Box
                        key={category.label}
                        component="table"
                        sx={{
                          width: '100%',
                          tableLayout: 'fixed',
                          borderCollapse: 'separate',
                          borderSpacing: 0,
                          border: '1px solid #edf2f7',
                          borderRadius: 1,
                          bgcolor: '#fff',
                          overflow: 'hidden',
                          mb: 1,
                          '&:last-of-type': { mb: 0 },
                        }}
                      >
                        <Box component="tbody">
                          {rows.map((row, rowIndex) => (
                            <Box component="tr" key={`${category.label}-${row.label}`}>
                              {rowIndex === 0 && (
                                <Box
                                  component="td"
                                  rowSpan={rows.length}
                                  sx={{
                                    width: 116,
                                    p: 1,
                                    verticalAlign: 'middle',
                                    bgcolor: '#fbfdff',
                                    borderRight: '1px solid #edf2f7',
                                    borderBottom: rowIndex < rows.length - 1 ? '1px solid #edf2f7' : 'none',
                                  }}
                                >
                                  <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', minWidth: 0 }}>
                                    <Checkbox
                                      size="small"
                                      checked={isNodeChecked(form.permissions, category, categoryPath)}
                                      indeterminate={isNodeIndeterminate(form.permissions, category, categoryPath)}
                                      onChange={() => handlePermissionToggle(category, categoryPath)}
                                      sx={{ p: 0.25 }}
                                    />
                                    <Typography variant="body2" sx={{ fontWeight: 800, color: '#132238', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {category.label}
                                    </Typography>
                                  </Box>
                                </Box>
                              )}
                              <Box
                                component="td"
                                sx={{
                                  width: 150,
                                  p: 1,
                                  verticalAlign: 'top',
                                  bgcolor: '#fff',
                                  borderRight: '1px solid #edf2f7',
                                  borderTop: rowIndex > 0 ? '1px solid #edf2f7' : 'none',
                                }}
                              >
                                <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer', minWidth: 0 }}>
                                  <Checkbox
                                    size="small"
                                    checked={isNodeChecked(form.permissions, row.node, row.path)}
                                    indeterminate={isNodeIndeterminate(form.permissions, row.node, row.path)}
                                    onChange={() => handlePermissionToggle(row.node, row.path)}
                                    sx={{ p: 0.25 }}
                                  />
                                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#243b53', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {row.label}
                                  </Typography>
                                </Box>
                              </Box>
                              <Box
                                component="td"
                                sx={{
                                  p: 1,
                                  verticalAlign: 'top',
                                  borderTop: rowIndex > 0 ? '1px solid #edf2f7' : 'none',
                                }}
                              >
                                {row.children.length ? (
                                  <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.25, minHeight: 30 }}>
                                    {row.children.map((child) => (
                                      <Box
                                        key={child.label}
                                        component="label"
                                        sx={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: 0.45,
                                          minWidth: 118,
                                          cursor: 'pointer',
                                        }}
                                      >
                                        <Checkbox
                                          size="small"
                                          checked={isNodeChecked(form.permissions, child, row.childPath)}
                                          indeterminate={isNodeIndeterminate(form.permissions, child, row.childPath)}
                                          onChange={() => handlePermissionToggle(child, row.childPath)}
                                          sx={{ p: 0.25 }}
                                        />
                                        <Typography variant="body2" sx={{ color: '#34495e', fontWeight: 600, lineHeight: 1.2 }}>
                                          {child.label}
                                        </Typography>
                                      </Box>
                                    ))}
                                  </Box>
                                ) : (
                                  <Typography variant="caption" sx={{ color: '#94a3b8' }}>勾选左侧分组即可开启</Typography>
                                )}
                              </Box>
                            </Box>
                          ))}
                        </Box>
                      </Box>
                    );
                  })}
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gap: 2, alignContent: 'start' }}>
                <Box sx={{ bgcolor: '#fff', border: '1px solid #dfe7f1', borderRadius: 1.25, overflow: 'hidden' }}>
                  <Box sx={{ px: 2.5, py: 2, borderBottom: '1px solid #edf2f7' }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#132238' }}>数据权限配置</Typography>
                    <Typography variant="caption" sx={{ color: '#7890ad' }}>控制各类业务数据可见范围</Typography>
                  </Box>
                  <Box sx={{ p: 2, display: 'grid', gap: 1 }}>
                    {dataScopeRows.map((row) => {
                      const disabled = editRole?.code === 'super_admin' || !hasAnyPermissionKey(form.permissions, row.permissionKeys);
                      const value = editRole?.code === 'super_admin' ? 'all' : (form.dataScopes[row.domain] || defaultDataScopes[row.domain]);
                      return (
                        <Box
                          key={row.domain}
                          sx={{
                            p: 1.2,
                            border: '1px solid #e4edf7',
                            borderRadius: 1,
                            bgcolor: disabled ? '#f8fafc' : '#fff',
                            display: 'grid',
                            gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) auto' },
                            gap: 1,
                            alignItems: 'center',
                          }}
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: '#132238' }}>{row.label}</Typography>
                            <Typography variant="caption" sx={{ color: '#7890ad', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {disabled && editRole?.code !== 'super_admin' ? '需先勾选对应功能权限' : row.description}
                            </Typography>
                          </Box>
                          <ToggleButtonGroup
                            exclusive
                            size="small"
                            value={value}
                            disabled={disabled}
                            onChange={(_event, nextValue) => handleDataScopeChange(row.domain, nextValue)}
                          >
                            {dataScopeOptions.map((option) => (
                              <ToggleButton key={option.value} value={option.value} sx={{ px: 1.5 }}>
                                {option.label}
                              </ToggleButton>
                            ))}
                          </ToggleButtonGroup>
                        </Box>
                      );
                    })}
                  </Box>
                </Box>

              </Box>
            </Box>

            <Box sx={{ bgcolor: '#fff', border: '1px solid #dfe7f1', borderRadius: 1.25, p: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#132238' }}>保存配置</Typography>
                <Typography variant="caption" sx={{ color: '#7890ad' }}>
                  {mode === 'create' ? '创建新角色后即可分配给员工' : '保存后立即影响该角色成员权限'}
                </Typography>
              </Box>
              <Button
                variant="contained"
                onClick={handleSubmit}
                disabled={saving || !form.name.trim() || !normalizePermissionKeys(form.permissions).size}
              >
                {editRole ? '保存权限' : '创建角色'}
              </Button>
              {saveMessage && (
                <Alert severity={saveMessage.type} sx={{ width: '100%' }} onClose={() => setSaveMessage(null)}>
                  {saveMessage.text}
                </Alert>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default RolePermission;
