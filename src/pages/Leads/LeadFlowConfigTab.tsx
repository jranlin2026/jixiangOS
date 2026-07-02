import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import BusinessIcon from '@mui/icons-material/Business';
import CloseIcon from '@mui/icons-material/Close';
import FolderIcon from '@mui/icons-material/Folder';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import PersonIcon from '@mui/icons-material/Person';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import { departmentApi, leadFlowApi, roleApi, settingsApi } from '../../api';
import type { LeadFlowConfig } from '../../types/lead';
import type { Department } from '../../types/department';
import type { Role } from '../../types/role';
import type { User } from '../../types/settings';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import { isActiveLeadAssignableUser, NO_LEAD_FLOW_PARTICIPANTS_MARKER } from '../../shared/utils/leadAssignment';

const LEAD_UNIQUE_KEY_MODE = 'phone_or_wechat' as const;
const MAX_PARTICIPANTS = 500;

function sortUsers(users: User[]): User[] {
  return [...users].sort((a, b) => (a.name || a.account || '').localeCompare(b.name || b.account || '', 'zh-Hans-CN'));
}

const LeadFlowConfigTab: React.FC = () => {
  const [config, setConfig] = useState<LeadFlowConfig | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [saved, setSaved] = useState(false);
  const [participantDialogOpen, setParticipantDialogOpen] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const [expandedDepartmentIds, setExpandedDepartmentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    leadFlowApi.fetchLeadFlowConfig().then((res) => {
      if (res.code === 0) setConfig(res.data);
    });
    Promise.all([
      settingsApi.fetchUsers({ isActive: true }),
      roleApi.getRoles({ isActive: true }),
      departmentApi.getDepartments({ isActive: true }),
    ]).then(([usersRes, rolesRes, departmentsRes]) => {
      if (usersRes.code === 0) setUsers(sortUsers(usersRes.data.filter(isActiveLeadAssignableUser)));
      if (rolesRes.code === 0) setRoles(rolesRes.data.filter((role) => role.isActive));
      if (departmentsRes.code === 0) {
        const sortedDepartments = [...departmentsRes.data].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        setDepartments(sortedDepartments);
        setExpandedDepartmentIds(new Set(sortedDepartments.filter((department) => !department.parentId).map((department) => department.id)));
      }
    });
  }, []);

  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const departmentsByParentId = useMemo(() => {
    const map = new Map<string, Department[]>();
    departments.forEach((department) => {
      const parentId = department.parentId || '';
      map.set(parentId, [...(map.get(parentId) || []), department]);
    });
    return map;
  }, [departments]);

  const departmentDescendantIds = useMemo(() => {
    const collect = (departmentId: string): string[] => {
      const children = departmentsByParentId.get(departmentId) || [];
      return [departmentId, ...children.flatMap((child) => collect(child.id))];
    };
    return new Map(departments.map((department) => [department.id, collect(department.id)]));
  }, [departments, departmentsByParentId]);

  const updateConfig = <K extends keyof LeadFlowConfig>(key: K, value: LeadFlowConfig[K]) => {
    setConfig((current) => (current ? { ...current, [key]: value } : current));
    setSaved(false);
  };

  const getParticipantRoleLabel = (user: User) => (
    roles.find((role) => role.id === user.roleId)?.name
    || roles.find((role) => role.name === user.role)?.name
    || user.role
    || user.positionName
    || ''
  );

  const getParticipantLabel = (user: User) => {
    const roleLabel = getParticipantRoleLabel(user);
    return roleLabel ? `${user.name}（${roleLabel}）` : user.name;
  };

  const getDepartmentUsers = (departmentId: string) => {
    const scopedIds = new Set(departmentDescendantIds.get(departmentId) || [departmentId]);
    return users.filter((user) => user.departmentId && scopedIds.has(user.departmentId));
  };

  const effectiveSelectedIds = useMemo(() => {
    if (!config) return [];
    if (config.participantUserIds.includes(NO_LEAD_FLOW_PARTICIPANTS_MARKER)) return [];
    return config.participantUserIds.length
      ? config.participantUserIds.filter((id) => usersById.has(id))
      : users.map((user) => user.id);
  }, [config, users, usersById]);

  const selectedIdSet = useMemo(() => new Set(effectiveSelectedIds), [effectiveSelectedIds]);
  const selectedParticipants = useMemo(
    () => sortUsers(effectiveSelectedIds.map((id) => usersById.get(id)).filter((user): user is User => Boolean(user))),
    [effectiveSelectedIds, usersById],
  );

  const writeParticipantIds = (nextIds: string[]) => {
    if (!config) return;
    const uniqueIds = Array.from(new Set(nextIds)).filter((id) => usersById.has(id));
    if (!uniqueIds.length) {
      updateConfig('participantUserIds', [NO_LEAD_FLOW_PARTICIPANTS_MARKER]);
      return;
    }
    const allActiveUserIds = users.map((user) => user.id);
    const shouldUseDefaultAll = uniqueIds.length === allActiveUserIds.length
      && allActiveUserIds.every((id) => uniqueIds.includes(id));
    updateConfig('participantUserIds', shouldUseDefaultAll ? [] : uniqueIds);
  };

  const setUserSelected = (userId: string, checked: boolean) => {
    const nextIds = new Set(effectiveSelectedIds);
    if (checked) nextIds.add(userId);
    if (!checked) nextIds.delete(userId);
    writeParticipantIds(Array.from(nextIds));
  };

  const setDepartmentSelected = (departmentId: string, checked: boolean) => {
    const departmentUserIds = getDepartmentUsers(departmentId).map((user) => user.id);
    const nextIds = new Set(effectiveSelectedIds);
    departmentUserIds.forEach((id) => {
      if (checked) nextIds.add(id);
      if (!checked) nextIds.delete(id);
    });
    writeParticipantIds(Array.from(nextIds));
  };

  const setCompanySelected = (checked: boolean) => {
    writeParticipantIds(checked ? users.map((user) => user.id) : []);
  };

  const handleSave = async () => {
    if (!config) return;
    const res = await leadFlowApi.updateLeadFlowConfig({ ...config, uniqueKeyMode: LEAD_UNIQUE_KEY_MODE });
    if (res.code === 0) {
      setConfig(res.data);
      setSaved(true);
    }
  };

  const toggleDepartment = (departmentId: string) => {
    setExpandedDepartmentIds((current) => {
      const next = new Set(current);
      if (next.has(departmentId)) next.delete(departmentId);
      else next.add(departmentId);
      return next;
    });
  };

  const renderUserRow = (user: User, level = 0) => {
    const checked = selectedIdSet.has(user.id);
    const canAddMore = checked || selectedIdSet.size < MAX_PARTICIPANTS;
    return (
      <Box
        key={user.id}
        sx={{
          display: 'grid',
          gridTemplateColumns: '20px 1fr 32px',
          alignItems: 'center',
          gap: 1,
          py: 0.75,
          pl: `${level * 18 + 6}px`,
          pr: 0.5,
          borderRadius: 1,
          '&:hover': { bgcolor: '#f8fafc' },
        }}
      >
        <PersonIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.3 }} noWrap>
            {user.name}
          </Typography>
          <Typography variant="caption" sx={{ color: '#64748b' }} noWrap>
            {[getParticipantRoleLabel(user), user.account, user.phone].filter(Boolean).join(' / ') || '-'}
          </Typography>
        </Box>
        <Checkbox
          size="small"
          checked={checked}
          disabled={!canAddMore}
          onChange={(event) => setUserSelected(user.id, event.target.checked)}
        />
      </Box>
    );
  };

  const renderDepartmentTree = (department: Department, level = 0): React.ReactNode => {
    const children = departmentsByParentId.get(department.id) || [];
    const directUsers = users.filter((user) => user.departmentId === department.id);
    const departmentUsers = getDepartmentUsers(department.id);
    const departmentUserIds = departmentUsers.map((user) => user.id);
    const checkedCount = departmentUserIds.filter((id) => selectedIdSet.has(id)).length;
    const checked = departmentUserIds.length > 0 && checkedCount === departmentUserIds.length;
    const indeterminate = checkedCount > 0 && checkedCount < departmentUserIds.length;
    const expanded = expandedDepartmentIds.has(department.id);

    return (
      <Box key={department.id}>
        <Box
          onClick={() => toggleDepartment(department.id)}
          sx={{
            display: 'grid',
            gridTemplateColumns: '18px 18px 1fr 32px',
            alignItems: 'center',
            gap: 0.75,
            py: 0.8,
            pl: `${level * 18}px`,
            cursor: 'pointer',
            borderRadius: 1,
            '&:hover': { bgcolor: '#f8fafc' },
          }}
        >
          {children.length || directUsers.length ? (
            expanded ? <KeyboardArrowDownIcon sx={{ fontSize: 16, color: '#94a3b8' }} /> : <KeyboardArrowRightIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
          ) : <Box />}
          <FolderIcon sx={{ fontSize: 17, color: '#64748b' }} />
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{department.name}</Typography>
          <Checkbox
            size="small"
            checked={checked}
            indeterminate={indeterminate}
            disabled={!departmentUsers.length}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => setDepartmentSelected(department.id, event.target.checked)}
          />
        </Box>
        {expanded && (
          <Box>
            {children.map((child) => renderDepartmentTree(child, level + 1))}
            {directUsers.map((user) => renderUserRow(user, level + 1))}
          </Box>
        )}
      </Box>
    );
  };

  if (!config) return null;

  const normalizedParticipantSearch = participantSearch.trim().toLowerCase();
  const filteredUsers = users.filter((user) => {
    if (!normalizedParticipantSearch) return true;
    return [user.name, getParticipantRoleLabel(user), user.account, user.email, user.phone]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedParticipantSearch));
  });
  const rootDepartments = departmentsByParentId.get('') || [];
  const knownDepartmentIds = new Set(departments.map((department) => department.id));
  const ungroupedUsers = users.filter((user) => !user.departmentId || !knownDepartmentIds.has(user.departmentId));
  const companyChecked = users.length > 0 && selectedParticipants.length === users.length;
  const companyIndeterminate = selectedParticipants.length > 0 && selectedParticipants.length < users.length;
  const isDefaultAll = config.participantUserIds.length === 0;

  return (
    <Paper elevation={0} sx={{ border: '1px solid #f0f0f0', p: 3 }}>
      {saved && <Alert severity="success" sx={{ mb: 2 }}>流转配置已保存并生效</Alert>}

      <Box sx={{ display: 'flex', gap: 3, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
        <Typography sx={{ minWidth: 120, fontWeight: 600 }}>线索唯一标识</Typography>
        <Typography variant="body2" sx={{ color: '#374151' }}>手机号和微信二选一</Typography>
      </Box>
      <Divider sx={{ my: 2 }} />

      <Box sx={{ display: 'grid', gap: 2 }}>
        <FormControlLabel
          control={<Switch checked={config.interceptionEnabled} onChange={(event) => updateConfig('interceptionEnabled', event.target.checked)} />}
          label="线索拦截：开启后，录入线索会按唯一标识查重，命中客户库或线索库时入库失败"
        />
        <FormControlLabel
          control={<Switch checked={config.autoAssignEnabled} onChange={(event) => updateConfig('autoAssignEnabled', event.target.checked)} />}
          label="线索自动分配：按照设置规则将线索自动分配给参与成员"
        />
        <FormControlLabel
          control={
            <Switch
              checked={config.autoClaimAfterAssignmentEnabled}
              disabled={!config.autoAssignEnabled}
              onChange={(event) => updateConfig('autoClaimAfterAssignmentEnabled', event.target.checked)}
            />
          }
          label="线索自动领取：开启后，线索分配到销售时同步进入该销售客户库，无需销售手动领取"
        />
      </Box>

      <Box sx={{ mt: 3, ml: 4 }}>
        <FormControl size="small" sx={{ minWidth: 180, mb: 2 }}>
          <InputLabel>分配规则</InputLabel>
          <Select value={config.assignmentMode} label="分配规则" onChange={() => updateConfig('assignmentMode', 'round_robin')}>
            <MenuItem value="round_robin">顺序平均分配</MenuItem>
          </Select>
        </FormControl>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" sx={{ mb: 1, color: '#6b7280' }}>
            参与分配的成员：
            <Button
              size="small"
              variant="text"
              startIcon={<PersonAddAltIcon fontSize="small" />}
              onClick={() => setParticipantDialogOpen(true)}
              sx={{ ml: 0.5, minWidth: 0, px: 0.5 }}
            >
              添加成员
            </Button>
          </Typography>
          <Box
            sx={{
              minHeight: 72,
              border: '1px solid #e5e7eb',
              borderRadius: 1,
              px: 1.5,
              py: 1.25,
              display: 'flex',
              gap: 1,
              flexWrap: 'wrap',
              alignItems: 'flex-start',
              bgcolor: '#fff',
            }}
          >
            {isDefaultAll ? (
              <Chip label={`默认全体在职员工（${users.length}人）`} size="small" color="primary" variant="outlined" />
            ) : selectedParticipants.map((user) => (
              <Chip
                key={user.id}
                label={getParticipantLabel(user)}
                size="small"
                variant="outlined"
                onDelete={() => setUserSelected(user.id, false)}
                sx={{
                  borderColor: '#dbeafe',
                  bgcolor: '#eff6ff',
                  color: '#1f2937',
                  '& .MuiChip-deleteIcon': { color: '#64748b' },
                }}
              />
            ))}
            {!isDefaultAll && selectedParticipants.length === 0 && (
              <Typography variant="body2" sx={{ color: '#9ca3af', lineHeight: '24px' }}>
                暂无参与成员，请添加成员后保存
              </Typography>
            )}
          </Box>
          <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: '#64748b' }}>
            不单独配置时，默认全公司在职员工都可以参与分配；管理员可按组织架构勾选指定范围。
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <FormControlLabel
              control={<Checkbox checked={config.dailyLimitEnabled} onChange={(event) => updateConfig('dailyLimitEnabled', event.target.checked)} />}
              label="每日分配的线索上限数"
            />
            <TextField
              size="small"
              type="number"
              value={config.dailyLimit}
              onChange={(event) => updateConfig('dailyLimit', Number(event.target.value) || 0)}
              sx={{ width: 110 }}
            />
          </Box>
        </Box>
      </Box>

      <Button variant="contained" sx={{ mt: 3 }} onClick={handleSave}>
        保存并生效
      </Button>

      <Dialog open={participantDialogOpen} onClose={() => setParticipantDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogCloseTitle onClose={() => setParticipantDialogOpen(false)}>选择成员</DialogCloseTitle>
        <DialogContent dividers sx={{ p: 0 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 440 }}>
            <Box sx={{ borderRight: '1px solid #eef2f7', p: 2 }}>
              <TextField
                size="small"
                fullWidth
                placeholder="搜索成员"
                value={participantSearch}
                onChange={(event) => setParticipantSearch(event.target.value)}
                sx={{ mb: 1.5 }}
              />
              <Box sx={{ maxHeight: 360, overflow: 'auto', pr: 0.5 }}>
                {normalizedParticipantSearch ? (
                  filteredUsers.length ? filteredUsers.map((user) => renderUserRow(user)) : (
                    <Typography variant="body2" sx={{ color: '#9ca3af', py: 3, textAlign: 'center' }}>暂无匹配成员</Typography>
                  )
                ) : (
                  <>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: '18px 18px 1fr 32px',
                        alignItems: 'center',
                        gap: 0.75,
                        py: 0.8,
                        borderRadius: 1,
                      }}
                    >
                      <KeyboardArrowDownIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                      <BusinessIcon sx={{ fontSize: 17, color: '#64748b' }} />
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>全公司</Typography>
                      <Checkbox
                        size="small"
                        checked={companyChecked}
                        indeterminate={companyIndeterminate}
                        disabled={!users.length}
                        onChange={(event) => setCompanySelected(event.target.checked)}
                      />
                    </Box>
                    {rootDepartments.length
                      ? rootDepartments.map((department) => renderDepartmentTree(department, 1))
                      : users.map((user) => renderUserRow(user, 1))}
                    {rootDepartments.length > 0 && ungroupedUsers.map((user) => renderUserRow(user, 1))}
                  </>
                )}
              </Box>
            </Box>
            <Box sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>已选择成员：</Typography>
                <Typography variant="body2" sx={{ color: '#94a3b8' }}>{selectedParticipants.length}/{MAX_PARTICIPANTS}</Typography>
              </Box>
              <Box sx={{ maxHeight: 370, overflow: 'auto', pr: 0.5 }}>
                {selectedParticipants.map((user) => (
                  <Box
                    key={user.id}
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: '28px 1fr 28px',
                      gap: 1,
                      alignItems: 'center',
                      py: 0.75,
                    }}
                  >
                    <Box
                      sx={{
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        bgcolor: '#eff6ff',
                        color: '#2563eb',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {(user.name || user.account || '?').slice(0, 1)}
                    </Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>{user.name}</Typography>
                      <Typography variant="caption" sx={{ color: '#94a3b8' }} noWrap>
                        {[getParticipantRoleLabel(user), user.account].filter(Boolean).join(' / ') || '-'}
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => setUserSelected(user.id, false)}>
                      <CloseIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Box>
                ))}
                {selectedParticipants.length === 0 && (
                  <Typography variant="body2" sx={{ color: '#9ca3af', py: 3, textAlign: 'center' }}>
                    尚未选择成员
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setParticipantDialogOpen(false)}>完成</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default LeadFlowConfigTab;
