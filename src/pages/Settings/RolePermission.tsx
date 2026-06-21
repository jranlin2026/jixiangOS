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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import useRoleStore from '../../store/useRoleStore';
import type { Permission, Role } from '../../types/role';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

type RoleForm = {
  name: string;
  description: string;
  departmentId: string;
  isActive: boolean;
  permissions: Permission[];
};

type PermissionNode = {
  label: string;
  key?: string;
  children?: PermissionNode[];
};

const PERMISSION_TREE: PermissionNode[] = [
  { label: '全部' },
  { label: '首页' },
  { label: '驾驶舱' },
  {
    label: '线索',
    children: [
      { label: '线索池' },
      { label: '线索分配' },
      { label: '接收/领取线索', key: 'leads.receive' },
      { label: '分配线索', key: 'leads.assign' },
      { label: '线索跟进' },
      { label: '线索转客户' },
    ],
  },
  {
    label: '客户',
    children: [
      { label: '客户管理' },
      { label: '客户详情' },
      { label: '客户画像' },
      { label: 'AI名片' },
      { label: '新建客户订单' },
      { label: '查看客户订单' },
    ],
  },
  {
    label: '订单',
    children: [
      { label: '订单管理' },
      { label: '订单审核台' },
      { label: '新增订单' },
      { label: '编辑订单' },
      { label: '删除订单' },
      { label: '订单修改记录' },
      { label: '付款截图识别' },
    ],
  },
  {
    label: '交付',
    children: [
      { label: '交付中心' },
      { label: '移动交付卡片' },
      { label: '交付阶段配置' },
    ],
  },
  {
    label: '提成',
    children: [
      { label: '提成中心' },
      { label: '提成规则配置' },
      { label: '提成计算' },
      { label: '提成审核' },
    ],
  },
  {
    label: '财务',
    children: [
      { label: '财务看板' },
      { label: '收款记录' },
      { label: '支出记录' },
    ],
  },
  {
    label: '退款中心',
    children: [
      { label: '退款列表' },
      { label: '退款详情' },
      { label: '分配挽回人' },
      { label: '挽回沟通' },
      { label: '退款审批' },
    ],
  },
  {
    label: '升单',
    children: [
      { label: '升单池' },
      { label: '升单分析' },
    ],
  },
  {
    label: 'AI助手',
    children: [
      { label: 'AI对话' },
      { label: '运营建议' },
      { label: '数据分析' },
    ],
  },
  {
    label: '系统设置',
    children: [
      {
        label: '组织权限',
        children: [
          { label: '员工账号' },
          { label: '部门管理' },
          { label: '职位管理' },
          { label: '角色权限' },
          { label: '账号回收站' },
        ],
      },
      {
        label: '业务配置',
        children: [
          { label: '产品配置' },
          { label: '订单类型配置' },
          { label: '生命周期状态' },
          { label: '线索来源' },
        ],
      },
    ],
  },
];

const defaultPermission: Permission = { module: '首页', actions: ['read'] };
const emptyForm: RoleForm = {
  name: '',
  description: '',
  departmentId: '',
  isActive: true,
  permissions: [defaultPermission],
};

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

  const employeeKey = '系统设置/组织权限/员工账号';
  const departmentKey = '系统设置/组织权限/部门管理';
  [
    '用户管理',
    '系统设置/组织权限/用户管理',
    '系统设置/组织权限/员工&部门',
  ].forEach((legacyKey) => aliases.set(legacyKey, [employeeKey, departmentKey]));

  return aliases;
};

const toPermissions = (keys: Set<string>): Permission[] => (
  Array.from(keys).sort().map((module) => ({ module, actions: ['read'] }))
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

const RolePermission: React.FC = () => {
  const { items, fetchItems, create, update, delete: deleteRole } = useRoleStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [form, setForm] = useState<RoleForm>(emptyForm);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleCreate = () => {
    setError('');
    setEditRole(null);
    setForm(emptyForm);
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
    });
    setFormOpen(true);
  };

  const handleSubmit = async () => {
    setError('');
    if (!form.name) return;
    const permissions = toPermissions(normalizePermissionKeys(form.permissions));
    if (!permissions.length) return;

    try {
      if (editRole) {
        await update(editRole.id, { ...form, permissions, code: editRole.code });
      } else {
        await create({
          ...form,
          permissions,
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
    setForm(emptyForm);
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
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>权限配置</Typography>
                <Typography variant="body2" sx={{ color: '#6b7280' }}>勾选后可见/可用，未勾选则隐藏</Typography>
              </Box>
              <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb', maxHeight: 420 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: 150, bgcolor: '#f8fafc', fontWeight: 600 }}>分类</TableCell>
                      <TableCell sx={{ width: 210, bgcolor: '#f8fafc', fontWeight: 600 }}>一级分类</TableCell>
                      <TableCell sx={{ bgcolor: '#f8fafc', fontWeight: 600 }}>二级分类（三级分类）</TableCell>
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
