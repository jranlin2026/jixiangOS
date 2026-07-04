import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import HistoryIcon from '@mui/icons-material/History';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import type { Lead, LeadFlowConfig } from '../../types/lead';
import type { LeadSourceConfig, User } from '../../types/settings';
import { leadApi, leadFlowApi, settingsApi } from '../../api';
import { formatDate } from '../../shared/utils/formatters';
import { RESOURCE_OWNERSHIPS, getLifecycleConfigByCode, getLifecycleStatusTagSx, normalizeLifecycleStatusCode, normalizeResourceOwnership } from '../../shared/utils/constants';
import useAuthStore from '../../store/useAuthStore';
import { canEditLeadProfile } from './leadDetailRules';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../shared/utils/permissions';
import { canCompleteContactField } from '../../shared/utils/contactEditLock';
import PhoneNumberInput from '../../shared/components/PhoneNumberInput';
import { formatPhoneForDisplay, getPhoneNumberError, normalizePhoneForStorage } from '../../shared/utils/phoneNumber';
import { getScopedLeadAssignmentCandidates } from '../../shared/utils/leadAssignment';

interface LeadDetailProps {
  lead: Lead;
  open: boolean;
  onClose: () => void;
  onUpdated?: (lead: Lead) => void;
}

type LeadDraft = {
  name: string;
  company: string;
  phone: string;
  wechat: string;
  source: string;
  sourceName: string;
  sourceType: string;
  industry: string;
  city: string;
  inputBy: string;
  leadContributorId: string;
  leadContributorName: string;
  assignedTo: string;
  remark: string;
  tagsText: string;
};

type SourceOption = {
  key: string;
  label: string;
  parentName: string;
  childName: string;
  parentId: string;
};

type HistoryEntry = {
  title: string;
  operator: string;
  time?: string;
  content: string;
};

const emptyText = (value?: string | number) => (value || value === 0 ? value : '未填写');

const formatSource = (lead: Lead) => [lead.source, lead.sourceName].filter(Boolean).join('-') || '未填写';

const formatHistoryValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '未填写';
  return String(value);
};

const toDraft = (lead: Lead): LeadDraft => ({
  name: lead.name || '',
  company: lead.company || '',
  phone: lead.phone || '',
  wechat: lead.wechat || '',
  source: lead.source || '',
  sourceName: lead.sourceName || '',
  sourceType: normalizeResourceOwnership(lead.sourceType),
  industry: lead.industry || '',
  city: lead.city || '',
  inputBy: lead.inputBy || '',
  leadContributorId: lead.leadContributorId || '',
  leadContributorName: lead.leadContributorName || '',
  assignedTo: lead.assignedTo || lead.owner || '',
  remark: lead.remark || '',
  tagsText: lead.tags?.join(', ') || '',
});

const HistoryList: React.FC<{ items: HistoryEntry[] }> = ({ items }) => (
  <Box sx={{ position: 'relative', pl: 3 }}>
    {items.map((item, index) => (
      <Box key={`${item.title}-${item.time || index}`} sx={{ position: 'relative', pb: index === items.length - 1 ? 0 : 2.25 }}>
        <Box sx={{ position: 'absolute', left: -21, top: 4, width: 10, height: 10, borderRadius: '50%', bgcolor: index === 0 ? '#2196F3' : '#cbd5e1', border: '2px solid #fff', boxShadow: '0 0 0 2px #e5e7eb' }} />
        {index < items.length - 1 && (
          <Box sx={{ position: 'absolute', left: -17, top: 14, width: 2, height: 'calc(100% - 4px)', bgcolor: '#e5e7eb' }} />
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>{item.operator}</Typography>
          <Typography variant="body2">{item.title}</Typography>
          <Typography variant="caption" sx={{ color: '#9ca3af', ml: 'auto' }}>
            {item.time ? formatDate(item.time, 'yyyy-MM-dd HH:mm') : ''}
          </Typography>
        </Box>
        <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1, px: 1.5, py: 1 }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{item.content}</Typography>
        </Box>
      </Box>
    ))}
  </Box>
);

const LeadDetail: React.FC<LeadDetailProps> = ({
  lead,
  open,
  onClose,
  onUpdated,
}) => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const [currentLead, setCurrentLead] = useState<Lead>(lead);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LeadDraft>(() => toDraft(lead));
  const [activeTab, setActiveTab] = useState(0);
  const [users, setUsers] = useState<User[]>([]);
  const [leadFlowConfig, setLeadFlowConfig] = useState<LeadFlowConfig | null>(null);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignSalesName, setAssignSalesName] = useState('');

  useEffect(() => {
    setCurrentLead(lead);
    setDraft(toDraft(lead));
    setEditing(false);
    setActiveTab(0);
  }, [lead]);

  useEffect(() => {
    if (!open) return;
    settingsApi.fetchAssignableUsers({ isActive: true }).then((res) => {
      if (res.code === 0) setUsers(res.data.filter((user) => user.isActive));
    });
    leadFlowApi.fetchLeadFlowConfig().then((res) => {
      if (res.code === 0) setLeadFlowConfig(res.data);
    });
    settingsApi.fetchLeadSourceConfigs().then((res) => {
      if (res.code === 0) setSourceConfigs(res.data.filter((item) => item.isActive));
    });
  }, [open]);

  const parentSources = useMemo(
    () => sourceConfigs.filter((item) => !item.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [sourceConfigs],
  );
  const childSources = useMemo(
    () => sourceConfigs.filter((item) => item.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [sourceConfigs],
  );
  const sourceOptions = useMemo<SourceOption[]>(() => {
    const options = parentSources.flatMap((parent) => {
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
    if (draft.source && !options.some((option) => option.parentName === draft.source && option.childName === draft.sourceName)) {
      options.unshift({
        key: `current:${draft.source}:${draft.sourceName}`,
        label: [draft.source, draft.sourceName].filter(Boolean).join('-'),
        parentName: draft.source,
        childName: draft.sourceName,
        parentId: 'current',
      });
    }
    return options;
  }, [childSources, draft.source, draft.sourceName, parentSources]);

  const selectedSourceKey = sourceOptions.find((option) => (
    option.parentName === draft.source && option.childName === (draft.sourceName || '')
  ))?.key || '';

  const followerName = currentLead.assignedTo || currentLead.owner || '待分配';
  const lifecycleCode = normalizeLifecycleStatusCode(currentLead.lifecycleStatusCode || currentLead.lifecycleStatus || currentLead.status);
  const lifecycleConfig = getLifecycleConfigByCode(lifecycleCode);
  const canClaimLead = !currentLead.customerId && hasPermission(currentUser, PERMISSION_KEYS.LEADS_FOLLOW);
  const canEditProfile = canEditLeadProfile(currentLead);
  const canAssignLead = !currentLead.customerId && hasPermission(currentUser, PERMISSION_KEYS.LEADS_FLOW_CONFIG);
  const assignableUsers = getScopedLeadAssignmentCandidates(users, leadFlowConfig, 'leads', currentUser);
  const canEditLockedContact = isSuperAdmin(currentUser);

  const handleDraftChange = (field: keyof LeadDraft) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setDraft((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSourceSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const option = sourceOptions.find((item) => item.key === event.target.value);
    if (!option) return;
    setDraft((prev) => ({ ...prev, source: option.parentName, sourceName: option.childName }));
  };

  const handleContributorSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const user = users.find((item) => item.id === event.target.value);
    setDraft((prev) => ({
      ...prev,
      leadContributorId: user?.id || '',
      leadContributorName: user?.name || '',
    }));
  };

  const handleSaveProfile = async () => {
    if (!canEditProfile) {
      setEditing(false);
      return;
    }
    const tags = draft.tagsText.split(',').map((tag) => tag.trim()).filter(Boolean);
    const nextPhone = canEditLockedContact || canCompleteContactField(currentLead.phone)
      ? normalizePhoneForStorage(draft.phone)
      : currentLead.phone;
    const phoneError = getPhoneNumberError(nextPhone);
    if (phoneError) {
      alert(phoneError);
      return;
    }
    const payload: Partial<Lead> = {
      name: draft.name,
      company: draft.company,
      phone: nextPhone,
      wechat: canEditLockedContact || canCompleteContactField(currentLead.wechat) ? draft.wechat.trim() : currentLead.wechat,
      source: draft.source,
      sourceName: draft.sourceName,
      sourceType: normalizeResourceOwnership(draft.sourceType),
      industry: draft.industry,
      city: draft.city,
      inputBy: draft.inputBy,
      leadContributorId: draft.leadContributorId,
      leadContributorName: draft.leadContributorName,
      assignedTo: draft.assignedTo,
      owner: draft.assignedTo || currentLead.owner,
      remark: draft.remark,
      tags,
    };
    const res = await leadApi.updateLead(currentLead.id, payload);
    if (res.code === 0 && res.data) {
      setCurrentLead(res.data);
      setDraft(toDraft(res.data));
      setEditing(false);
      onUpdated?.(res.data);
    }
  };

  const handleClaimCurrentLead = async () => {
    const userName = currentUser?.name || currentUser?.account || '';
    if (!userName) {
      alert('当前登录用户无效，请重新登录后再领取线索');
      return;
    }
    const res = await leadFlowApi.claimLeadAsCustomer(currentLead.id, userName);
    if (res.code !== 0 || !res.data) {
      alert(res.message || '领取失败');
      return;
    }
    setCurrentLead(res.data);
    setDraft(toDraft(res.data));
    onUpdated?.(res.data);
  };

  const handleOpenAssign = () => {
    const currentAssignee = currentLead.assignedTo || currentLead.owner || '';
    setAssignSalesName(currentAssignee === '待分配' ? '' : currentAssignee);
    setAssignOpen(true);
  };

  const handleAssignLead = async () => {
    if (!assignSalesName) {
      alert('请选择要分配的销售');
      return;
    }
    const res = await leadFlowApi.manualAssignLead(currentLead.id, assignSalesName);
    if (res.code !== 0 || !res.data) {
      alert(res.message || '分配失败');
      return;
    }
    setCurrentLead(res.data);
    setDraft(toDraft(res.data));
    setAssignOpen(false);
    onUpdated?.(res.data);
  };

  const historyItems = useMemo<HistoryEntry[]>(() => {
    const createdBy = currentLead.inputBy || currentLead.owner || '未填写';
    const changeHistoryEntries: HistoryEntry[] = (currentLead.changeHistory || []).map((item) => ({
      title: item.summary,
      operator: item.operator,
      time: item.changedAt,
      content: item.changes?.length
        ? item.changes.map((change) => `${change.label}：${formatHistoryValue(change.oldValue)} → ${formatHistoryValue(change.newValue)}`).join('\n')
        : item.summary,
    }));
    const entries: HistoryEntry[] = [
      {
        title: '创建线索资料',
        operator: createdBy,
        time: currentLead.createdAt,
        content: `录入线索，来源：${formatSource(currentLead)}`,
      },
    ];

    if (currentLead.assignedTo || currentLead.owner) {
      entries.unshift({
        title: '分配销售跟进',
        operator: '系统',
        time: currentLead.assignedAt || currentLead.updatedAt,
        content: `${followerName} 跟进`,
      });
    }

    if (currentLead.updatedAt && currentLead.updatedAt !== currentLead.createdAt && changeHistoryEntries.length === 0) {
      entries.unshift({
        title: '更新线索资料',
        operator: '系统',
        time: currentLead.updatedAt,
        content: '线索资料发生更新',
      });
    }

    if (currentLead.lifecycleStatus) {
      entries.unshift({
        title: '生命周期变更',
        operator: '系统',
        time: currentLead.lifecycleStatusUpdatedAt || currentLead.updatedAt,
        content: `当前状态：${lifecycleConfig.name}`,
      });
    }

    return [...changeHistoryEntries, ...entries];
  }, [currentLead, followerName, lifecycleConfig.name]);

  const renderReadOnlyRow = (label: string, value?: string | number) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', borderBottom: '1px solid #eef2f7', minHeight: 38 }}>
      <Box sx={{ bgcolor: '#f6f8fb', px: 1.25, py: 1, color: '#64748b', fontSize: 13 }}>{label}</Box>
      <Box sx={{ px: 1.5, py: 1, fontSize: 13 }}>{emptyText(value)}</Box>
    </Box>
  );

  const renderInfoRow = (label: string, field: keyof LeadDraft, editable = true) => {
    const isResourceField = field === 'sourceType';
    const isContributorField = field === 'leadContributorName';
    const isUserField = field === 'inputBy' || field === 'assignedTo';
    const currentValue = draft[field] || '';
    const userFieldOptions = field === 'assignedTo' ? assignableUsers : users;
    const showCurrentUserOption = isUserField
      && currentValue
      && currentValue !== '待分配'
      && !userFieldOptions.some((user) => user.name === currentValue);
    const displayValue = field === 'sourceType'
      ? normalizeResourceOwnership(currentLead.sourceType)
      : field === 'tagsText'
        ? currentLead.tags?.join('、')
        : field === 'assignedTo'
          ? followerName
          : field === 'phone'
            ? formatPhoneForDisplay(currentLead.phone)
          : (currentLead[field as keyof Lead] as string | undefined);

    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', borderBottom: '1px solid #eef2f7', minHeight: 38 }}>
        <Box sx={{ bgcolor: '#f6f8fb', px: 1.25, py: 1, color: '#64748b', fontSize: 13 }}>{label}</Box>
        <Box sx={{ px: 1.5, py: editing && editable ? 0.5 : 1, fontSize: 13 }}>
          {editing && editable ? (
            isResourceField ? (
              <TextField select value={normalizeResourceOwnership(currentValue)} onChange={handleDraftChange(field)} size="small" fullWidth>
                {RESOURCE_OWNERSHIPS.map((item) => (
                  <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                ))}
              </TextField>
            ) : isContributorField ? (
              <TextField select value={draft.leadContributorId} onChange={handleContributorSelect} size="small" fullWidth>
                <MenuItem value="">无</MenuItem>
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name}（{user.positionName || '未设置职位'}）
                  </MenuItem>
                ))}
              </TextField>
            ) : isUserField ? (
              <TextField select value={currentValue} onChange={handleDraftChange(field)} size="small" fullWidth>
                {showCurrentUserOption && <MenuItem value={currentValue}>{currentValue}</MenuItem>}
                {field === 'assignedTo' && <MenuItem value="待分配">待分配</MenuItem>}
                {field === 'assignedTo' && userFieldOptions.length === 0 && (
                  <MenuItem value="" disabled>
                    当前角色数据范围内暂无可分配成员，请检查数据范围或线索流转参与成员配置。
                  </MenuItem>
                )}
                {userFieldOptions.map((user) => (
                  <MenuItem key={user.id} value={user.name}>
                    {user.name}（{user.positionName || '未设置职位'}）
                  </MenuItem>
                ))}
              </TextField>
            ) : field === 'phone' ? (
              <PhoneNumberInput
                value={currentValue}
                onChange={(value) => setDraft((prev) => ({ ...prev, [field]: value }))}
                size="small"
                fullWidth
              />
            ) : (
              <TextField value={currentValue} onChange={handleDraftChange(field)} size="small" fullWidth />
            )
          ) : emptyText(displayValue as string)}
        </Box>
      </Box>
    );
  };

  const renderSourceRow = () => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', borderBottom: '1px solid #eef2f7', minHeight: 38 }}>
      <Box sx={{ bgcolor: '#f6f8fb', px: 1.25, py: 1, color: '#64748b', fontSize: 13 }}>线索来源</Box>
      <Box sx={{ px: 1.5, py: editing ? 0.5 : 1, fontSize: 13 }}>
        {editing ? (
          <TextField select value={selectedSourceKey} onChange={handleSourceSelect} size="small" fullWidth>
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
            {sourceOptions.some((option) => option.parentId === 'current') && (
              <MenuItem value={selectedSourceKey}>{formatSource(currentLead)}</MenuItem>
            )}
          </TextField>
        ) : (
          emptyText(formatSource(currentLead))
        )}
      </Box>
    </Box>
  );

  const renderStatusRow = (label: string, value: React.ReactNode) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', borderBottom: '1px solid #eef2f7', minHeight: 38 }}>
      <Box sx={{ bgcolor: '#f6f8fb', px: 1.25, py: 1, color: '#64748b', fontSize: 13 }}>{label}</Box>
      <Box sx={{ px: 1.5, py: 1, fontSize: 13 }}>{value}</Box>
    </Box>
  );

  const renderRemarkRow = () => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', minHeight: 72 }}>
      <Box sx={{ bgcolor: '#f6f8fb', px: 1.25, py: 1, color: '#64748b', fontSize: 13 }}>备注</Box>
      <Box sx={{ px: 1.5, py: editing ? 0.75 : 1, fontSize: 13 }}>
        {editing ? (
          <TextField value={draft.remark} onChange={handleDraftChange('remark')} multiline minRows={2} fullWidth />
        ) : (
          <Typography variant="body2">{emptyText(currentLead.remark)}</Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <>
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, pr: 6 }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{currentLead.name}</Typography>
            <Chip label={lifecycleConfig.name} size="small" sx={getLifecycleStatusTagSx(`${lifecycleCode} ${lifecycleConfig.name}`)} />
          </Box>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            {followerName} 跟进 · {formatSource(currentLead)}
          </Typography>
        </Box>
        <IconButton aria-label="关闭" onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.82fr 1.18fr' }, gap: 2, minHeight: '72vh' }}>
          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', alignSelf: 'start' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2" sx={{ color: '#2196F3', fontWeight: 700 }}>资料</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                {canClaimLead && (
                  <Button size="small" variant="contained" startIcon={<PersonAddAltIcon />} onClick={handleClaimCurrentLead}>
                    开始跟进
                  </Button>
                )}
                {canAssignLead && (
                  <Button size="small" variant="outlined" onClick={handleOpenAssign}>
                    分配销售
                  </Button>
                )}
                {editing && canEditProfile ? (
                  <>
                    <Button size="small" onClick={() => { setDraft(toDraft(currentLead)); setEditing(false); }}>取消</Button>
                    <Button size="small" variant="contained" onClick={handleSaveProfile}>保存</Button>
                  </>
                ) : canEditProfile ? (
                  <Button size="small" variant="outlined" onClick={() => setEditing(true)}>编辑资料</Button>
                ) : null}
              </Box>
            </Box>
            <Box>
              {renderInfoRow('姓名', 'name')}
              {renderInfoRow('公司', 'company')}
              {renderInfoRow('手机号', 'phone', canEditLockedContact || canCompleteContactField(currentLead.phone))}
              {renderInfoRow('微信', 'wechat', canEditLockedContact || canCompleteContactField(currentLead.wechat))}
              {renderInfoRow('资源归属', 'sourceType')}
              {renderSourceRow()}
              {renderInfoRow('行业', 'industry')}
              {renderInfoRow('城市', 'city')}
              {renderInfoRow('线索录入人', 'inputBy')}
              {renderInfoRow('线索贡献人', 'leadContributorName')}
              {renderInfoRow('分配销售', 'assignedTo')}
              {renderInfoRow('标签', 'tagsText')}
              {renderStatusRow('入库状态', (
                <Chip
                  label={currentLead.intakeStatus || '入库成功'}
                  size="small"
                  color={currentLead.intakeStatus === '待分配' ? 'warning' : currentLead.intakeStatus === '入库失败' ? 'error' : 'success'}
                />
              ))}
              {renderStatusRow('生命周期', <Chip label={lifecycleConfig.name} size="small" sx={getLifecycleStatusTagSx(`${lifecycleCode} ${lifecycleConfig.name}`)} />)}
              {renderStatusRow('创建时间', formatDate(currentLead.createdAt, 'yyyy-MM-dd HH:mm'))}
              {renderStatusRow('更新时间', formatDate(currentLead.updatedAt, 'yyyy-MM-dd HH:mm'))}
              {renderRemarkRow()}
            </Box>
          </Paper>

          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
            <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ px: 2, borderBottom: '1px solid #eef2f7' }}>
              <Tab icon={<HistoryIcon fontSize="small" />} iconPosition="start" label="历史修改记录" />
            </Tabs>
            <Box sx={{ p: 2, maxHeight: '68vh', overflowY: 'auto' }}>
              {activeTab === 0 && <HistoryList items={historyItems} />}
            </Box>
          </Paper>
        </Box>
      </DialogContent>
    </Dialog>
    <Dialog open={assignOpen} onClose={() => setAssignOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pr: 6 }}>
        分配销售
        <IconButton aria-label="关闭" onClick={() => setAssignOpen(false)} sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <TextField
          select
          label="分配销售"
          value={assignSalesName}
          onChange={(event) => setAssignSalesName(event.target.value)}
          fullWidth
        >
          {assignableUsers.length === 0 && (
            <MenuItem value="" disabled>
              暂无可分配成员，请检查线索流转参与成员或当前角色的数据范围
            </MenuItem>
          )}
          {assignableUsers.map((user) => (
            <MenuItem key={user.id} value={user.name}>
              {user.name}（{user.positionName || '未设置职位'}）
            </MenuItem>
          ))}
        </TextField>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button variant="contained" onClick={handleAssignLead}>保存</Button>
        </Box>
      </DialogContent>
    </Dialog>
    {feedbackDialog}
    </>
  );
};

export default LeadDetail;
