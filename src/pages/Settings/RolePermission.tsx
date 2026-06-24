import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  IconButton,
  Paper,
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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import useRoleStore from '../../store/useRoleStore';
import type { DataScopeDomain, DataScopeLevel, Permission, Role, RoleDataScopes } from '../../types/role';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import { CAPABILITY_KEYS, PERMISSION_KEYS, getDefaultPermissionActions } from '../../shared/utils/permissions';

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
      { label: '新建客户', key: PERMISSION_KEYS.CUSTOMER_CREATE },
      { label: '客户详情', key: PERMISSION_KEYS.CUSTOMER_DETAIL },
      { label: '客户画像', key: PERMISSION_KEYS.CUSTOMER_PROFILE },
      { label: 'AI名片', key: PERMISSION_KEYS.CUSTOMER_AI_CARD },
      { label: '新建客户订单', key: PERMISSION_KEYS.CUSTOMER_CREATE_ORDER },
      { label: '查看客户订单', key: PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS },
    ],
  },
  {
    label: '订单',
    children: [
      { label: '订单列表', key: PERMISSION_KEYS.ORDER_MANAGE },
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
    label: '财务中心',
    children: [
      { label: '财务总览', key: PERMISSION_KEYS.FINANCE_OVERVIEW },
      { label: '订单分账', key: PERMISSION_KEYS.FINANCE_SETTLEMENT },
      { label: '月度发放', key: PERMISSION_KEYS.FINANCE_PAYOUT },
      { label: '退款付款', key: PERMISSION_KEYS.FINANCE_REFUND },
      { label: '收支流水', key: PERMISSION_KEYS.FINANCE_FLOW },
      { label: '规则配置', key: PERMISSION_KEYS.FINANCE_RULES },
    ],
  },
  {
    label: '升单中心',
    children: [
      { label: '机会池', key: PERMISSION_KEYS.UPGRADE_POOL },
      { label: '客户成功', key: PERMISSION_KEYS.UPGRADE_CUSTOMER_SUCCESS },
      { label: '升单分析', key: PERMISSION_KEYS.UPGRADE_ANALYSIS },
      { label: '行动任务', key: PERMISSION_KEYS.UPGRADE_TASKS },
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
        label: '客户管理',
        children: [
          { label: '客户等级', key: PERMISSION_KEYS.SETTINGS_CUSTOMER_LEVELS },
          { label: '客户生命周期', key: PERMISSION_KEYS.SETTINGS_LIFECYCLE },
          { label: '线索来源', key: PERMISSION_KEYS.SETTINGS_LEAD_SOURCES },
          { label: '线索流转', key: PERMISSION_KEYS.SETTINGS_LEAD_FLOW },
        ],
      },
      {
        label: '系统维护',
        children: [
          { label: 'AI大脑', key: PERMISSION_KEYS.SETTINGS_AI_CONFIG },
          { label: '数据维护', key: PERMISSION_KEYS.SETTINGS_DATA_MAINTENANCE },
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
  orderApplications: 'self',
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
  { domain: 'customers', label: '客户数据', description: '控制客户列表、客户详情和客户统计的数据范围', permissionKeys: [PERMISSION_KEYS.CUSTOMER_CREATE, PERMISSION_KEYS.CUSTOMER_DETAIL, PERMISSION_KEYS.CUSTOMER_PROFILE, PERMISSION_KEYS.CUSTOMER_AI_CARD, PERMISSION_KEYS.CUSTOMER_CREATE_ORDER, PERMISSION_KEYS.CUSTOMER_VIEW_ORDERS] },
  { domain: 'orders', label: '订单数据', description: '控制正式订单列表、订单筛选和订单统计的数据范围', permissionKeys: [PERMISSION_KEYS.ORDER_MANAGE, PERMISSION_KEYS.ORDER_CREATE, PERMISSION_KEYS.ORDER_EDIT, PERMISSION_KEYS.ORDER_DELETE, PERMISSION_KEYS.ORDER_HISTORY, PERMISSION_KEYS.ORDER_PAYMENT_SCREENSHOT] },
  { domain: 'orderApplications', label: '订单审核台数据', description: '控制订单审核台能看到哪些订单申请；审核操作仍由订单审核操作权限控制', permissionKeys: [PERMISSION_KEYS.ORDER_REVIEW, PERMISSION_KEYS.ORDER_MANAGE, PERMISSION_KEYS.ORDER_CREATE] },
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
  Array.from(keys).sort().map((module) => ({ module, actions: getDefaultPermissionActions(module) }))
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

const getRowSpan = (node: PermissionNode) => Math.max(1, node.children?.length || 0);

const getLeafPermissionLabels = (permissions: Permission[]) => {
  const selected = normalizePermissionKeys(permissions);
  const leafKeys = getAllSelectablePermissionKeys();
  return Array.from(selected).filter((key) => leafKeys.includes(key));
};

const normalizeDataScopes = (value?: RoleDataScopes, code?: string): RoleDataScopes => {
  if (code === 'super_admin') {
    return { leads: 'all', customers: 'all', orders: 'all', orderApplications: 'all' };
  }
  return { ...defaultDataScopes, ...(value || {}) };
};

const hasAnyPermissionKey = (permissions: Permission[], keys: string[]) => {
  const selected = normalizePermissionKeys(permissions);
  return keys.some((key) => selected.has(key));
};

const RolePermission: React.FC = () => {
  const { items, fetchItems, create, update, delete: deleteRole } = useRoleStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [formTab, setFormTab] = useState<'permissions' | 'dataScopes'>('permissions');
  const [error, setError] = useState('');

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCreate = () => {
    setError('');
    setEditRole(null);
    setForm({ ...emptyForm, dataScopes: defaultDataScopes });
    setFormTab('permissions');
    setFormOpen(true);
  };

  const handleEdit = (role: Role) => {
    setError('');
    setEditRole(role);
    setForm({
      name: role.name,
      description: role.description || '',
      departmentId: role.departmentId || '',
      isActive: role.isActive,
      permissions: role.permissions.length ? role.permissions : [defaultPermission],
      dataScopes: normalizeDataScopes(role.dataScopes, role.code),
    });
    setFormTab('permissions');
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    setError('');
    if (!form.name) return;
    const permissions = toPermissions(normalizePermissionKeys(form.permissions));
    const dataScopes = normalizeDataScopes(form.dataScopes, editRole?.code);
    if (!permissions.length) return;

    try {
      if (editRole) {
        await update(editRole.id, { ...form, permissions, dataScopes, code: editRole.code });
      } else {
        await create({
          ...form,
          permissions,
          dataScopes,
          code: `role-${Date.now()}`,
          memberCount: 0,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
      return;
    }
    setFormOpen(false);
    setEditRole(null);
    setForm({ ...emptyForm, dataScopes: defaultDataScopes });
    fetchItems();
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

  const handleToggleActive = async (role: Role) => {
    setError('');
    try {
      await update(role.id, { isActive: !role.isActive });
    } catch (err) {
      setError(err instanceof Error ? err.message : '状态修改失败');
    }
    fetchItems();
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
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>角色权限配置</Typography>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={handleCreate}>
          新增角色
        </Button>
      </Box>
      {error && <Typography variant="body2" sx={{ color: '#d32f2f', mb: 1 }}>{error}</Typography>}

      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #f0f0f0' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>角色名称</TableCell>
              <TableCell>说明</TableCell>
              <TableCell>权限列表</TableCell>
              <TableCell>用户数</TableCell>
              <TableCell>状态</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((role: Role) => (
              <TableRow key={role.id} hover>
                <TableCell sx={{ fontWeight: 500 }}>{role.name}</TableCell>
                <TableCell>{role.description || '-'}</TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {getLeafPermissionLabels(role.permissions).slice(0, 8).map((module) => (
                      <Chip key={module} label={module.split('/').slice(-1)[0]} size="small" variant="outlined" />
                    ))}
                    {getLeafPermissionLabels(role.permissions).length > 8 && (
                      <Chip label={`+${getLeafPermissionLabels(role.permissions).length - 8}`} size="small" />
                    )}
                  </Box>
                </TableCell>
                <TableCell>{role.memberCount}</TableCell>
                <TableCell>
                  <Chip label={role.isActive ? '启用' : '停用'} size="small" color={role.isActive ? 'success' : 'default'} />
                </TableCell>
                <TableCell align="center">
                  <Switch checked={role.isActive} size="small" onChange={() => handleToggleActive(role)} disabled={role.code === 'super_admin'} />
                  <IconButton size="small" onClick={() => handleEdit(role)} title="编辑">
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleDelete(role)} title="删除" disabled={role.code === 'super_admin'}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setFormOpen(false)}>{editRole ? '编辑角色' : '新增角色'}</DialogCloseTitle>
        <Box sx={{ p: 3, pt: 1 }}>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <TextField label="角色名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required fullWidth />
            <TextField label="说明" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} fullWidth multiline minRows={2} />
            <Tabs value={formTab} onChange={(_event, value) => setFormTab(value)} sx={{ minHeight: 36, borderBottom: '1px solid #e5e7eb' }}>
              <Tab value="permissions" label="功能权限" sx={{ minHeight: 36 }} />
              <Tab value="dataScopes" label="数据范围" sx={{ minHeight: 36 }} />
            </Tabs>
            {formTab === 'permissions' && (
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>权限配置</Typography>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>勾选后可见/可用，未勾选则隐藏</Typography>
              </Box>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', maxHeight: 420 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 150, bgcolor: '#f8fafc', fontWeight: 600 }}>模块</TableCell>
                      <TableCell sx={{ width: 210, bgcolor: '#f8fafc', fontWeight: 600 }}>分组</TableCell>
                      <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 600 }}>功能权限</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {PERMISSION_TREE.flatMap((category) => {
                      const firstLevelNodes = category.children?.length ? category.children : [null];
                      return firstLevelNodes.map((firstLevel, index) => {
                        const categoryPath: string[] = [];
                        const firstLevelPath = [category.label];
                        return (
                          <TableRow key={`${category.label}-${firstLevel?.label || 'root'}`} hover>
                            {index === 0 && (
                              <TableCell rowSpan={getRowSpan(category)} sx={{ verticalAlign: 'top' }}>
                                <Box component="label" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}>
                                  <Checkbox
                                    size="small"
                                    checked={isNodeChecked(form.permissions, category, categoryPath)}
                                    indeterminate={isNodeIndeterminate(form.permissions, category, categoryPath)}
                                    onChange={() => handlePermissionToggle(category, categoryPath)}
                                  />
                                  <Typography variant="body2">{category.label}</Typography>
                                </Box>
                              </TableCell>
                            )}
                            <TableCell>
                              {firstLevel && (
                                <Box component="label" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}>
                                  <Checkbox
                                    size="small"
                                    checked={isNodeChecked(form.permissions, firstLevel, firstLevelPath)}
                                    indeterminate={isNodeIndeterminate(form.permissions, firstLevel, firstLevelPath)}
                                    onChange={() => handlePermissionToggle(firstLevel, firstLevelPath)}
                                  />
                                  <Typography variant="body2">{firstLevel.label}</Typography>
                                </Box>
                              )}
                            </TableCell>
                            <TableCell>
                              {firstLevel?.children?.length ? (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, rowGap: 0.75 }}>
                                  {firstLevel.children.map((child) => (
                                    <Box
                                      key={child.label}
                                      component="label"
                                      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, minWidth: 130, cursor: 'pointer' }}
                                    >
                                      <Checkbox
                                        size="small"
                                        checked={isNodeChecked(form.permissions, child, [...firstLevelPath, firstLevel.label])}
                                        indeterminate={isNodeIndeterminate(form.permissions, child, [...firstLevelPath, firstLevel.label])}
                                        onChange={() => handlePermissionToggle(child, [...firstLevelPath, firstLevel.label])}
                                      />
                                      <Typography variant="body2">{child.label}</Typography>
                                    </Box>
                                  ))}
                                </Box>
                              ) : (
                                <Typography variant="body2" sx={{ color: '#9ca3af' }}>-</Typography>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      });
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
            )}
            {formTab === 'dataScopes' && (
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 180, bgcolor: '#f8fafc', fontWeight: 600 }}>数据类型</TableCell>
                      <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 600 }}>说明</TableCell>
                      <TableCell sx={{ width: 260, bgcolor: '#f8fafc', fontWeight: 600 }}>数据范围</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {dataScopeRows.map((row) => {
                      const disabled = editRole?.code === 'super_admin' || !hasAnyPermissionKey(form.permissions, row.permissionKeys);
                      const value = editRole?.code === 'super_admin' ? 'all' : (form.dataScopes[row.domain] || defaultDataScopes[row.domain]);
                      return (
                        <TableRow key={row.domain} hover>
                          <TableCell sx={{ fontWeight: 500 }}>{row.label}</TableCell>
                          <TableCell>
                            <Typography variant="body2">{row.description}</Typography>
                            {disabled && editRole?.code !== 'super_admin' && (
                              <Typography variant="caption" sx={{ color: '#9ca3af' }}>需先勾选对应功能权限</Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <ToggleButtonGroup
                              exclusive
                              size="small"
                              value={value}
                              disabled={disabled}
                              onChange={(_event, nextValue) => handleDataScopeChange(row.domain, nextValue)}
                            >
                              {dataScopeOptions.map((option) => (
                                <ToggleButton key={option.value} value={option.value} sx={{ px: 2 }}>
                                  {option.label}
                                </ToggleButton>
                              ))}
                            </ToggleButtonGroup>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              <Typography variant="body2">{form.isActive ? '启用' : '停用'}</Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 3 }}>
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!form.name || !form.permissions.length}
            >
              {editRole ? '保存' : '创建'}
            </Button>
          </Box>
        </Box>
      </Dialog>
    </Box>
  );
};

export default RolePermission;
