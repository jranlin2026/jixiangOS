import React, { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box,
  Typography, Chip,
  TextField, Paper, Tabs, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Tooltip, MenuItem,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryIcon from '@mui/icons-material/History';
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ImageIcon from '@mui/icons-material/Image';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import TimelineIcon from '@mui/icons-material/Timeline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import useCustomerStore from '../../store/useCustomerStore';
import type { Customer, CustomerActivityAttachment, CustomerActivityAttachmentCategory, CustomerActivityRecord } from '../../types/customer';
import type { AIBusinessCard } from '../../types/aiCard';
import type { LeadFlowConfig } from '../../types/lead';
import type { Order } from '../../types/order';
import type { CustomerLevelConfig, LeadSourceConfig, User } from '../../types/settings';
import { aiCardApi, customerApi, leadFlowApi, orderApi, settingsApi } from '../../api';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { CUSTOMER_LEVELS, RESOURCE_OWNERSHIPS, getLifecycleConfigByCode, getLifecycleStatusTagSx, getProductLevelColor, getProductLevelRowSx, getProductLevelTagSx, normalizeLifecycleStatusCode, normalizeResourceOwnership } from '../../shared/utils/constants';
import CustomerLevelBadge from '../../shared/components/CustomerLevelBadge';
import AIBusinessCardPanel from '../../shared/components/AIBusinessCardPanel';
import useAuthStore from '../../store/useAuthStore';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import PhoneNumberInput from '../../shared/components/PhoneNumberInput';
import useAppFeedback from '../../shared/hooks/useAppFeedback';
import { canCompleteContactField, canCompletePhoneField } from '../../shared/utils/contactEditLock';
import { isSuperAdminRoleName } from '../../shared/utils/roles';
import { formatPhoneForDisplay, getPhoneNumberError, normalizePhoneForStorage } from '../../shared/utils/phoneNumber';
import { completeCityFromPhone } from '../../shared/utils/mobileCityAttribution';
import PermissionGate from '../../shared/auth/PermissionGate';
import { PERMISSION_KEYS } from '../../shared/utils/permissions';
import { getScopedLeadAssignmentCandidates } from '../../shared/utils/leadAssignment';

interface CustomerDetailProps {
  customer: Customer;
  open: boolean;
  onClose: () => void;
  onCreateOrder?: (customer: Customer) => void;
  onViewOrders?: (customer: Customer) => void;
  onUpdated?: (customer: Customer) => void;
  readOnly?: boolean;
}

interface ContractFile {
  id: string;
  name: string;
  size: number;
  type: string;
  dataUrl: string;
  uploadedAt: string;
}

type SourceOption = {
  key: string;
  label: string;
  parentName: string;
  childName: string;
  parentId: string;
};

const emptyText = (value?: string | number) => (value || value === 0 ? value : '未填写');
const formatCustomerSource = (customer: Customer) => [customer.leadSource, customer.sourceName].filter(Boolean).join('-') || '未填写';
const contractKey = (customerId: string) => `aaos_customer_contracts_${customerId}`;
const MAX_ACTIVITY_ATTACHMENTS = 6;
const MAX_ACTIVITY_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const normalizeCustomerTags = (tags?: string[]) => (tags || []).map((tag) => tag.trim()).filter(Boolean);
const parseCustomerTagsInput = (value: string) => value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);

const activityAttachmentAccept: Record<CustomerActivityAttachmentCategory, string> = {
  image: 'image/*',
  document: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv',
  audio: 'audio/*',
  other: '*/*',
};

const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
};

const readActivityAttachment = (
  file: File,
  category: CustomerActivityAttachmentCategory,
): Promise<CustomerActivityAttachment> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    resolve({
      id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      name: file.name,
      size: file.size,
      type: file.type || 'application/octet-stream',
      category,
      dataUrl: String(reader.result || ''),
      uploadedAt: new Date().toISOString(),
    });
  };
  reader.onerror = () => reject(reader.error || new Error('附件读取失败'));
  reader.readAsDataURL(file);
});

const CustomerDetail: React.FC<CustomerDetailProps> = ({
  customer,
  open,
  onClose,
  onCreateOrder,
  onUpdated,
  readOnly = false,
}) => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const { alert, dialog: feedbackDialog } = useAppFeedback();
  const [currentCustomer, setCurrentCustomer] = useState<Customer>(customer);
  const [aiCard, setAiCard] = useState<AIBusinessCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [followNote, setFollowNote] = useState('');
  const [followAttachments, setFollowAttachments] = useState<CustomerActivityAttachment[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<Customer>>({});
  const [tagInput, setTagInput] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [contracts, setContracts] = useState<ContractFile[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [leadFlowConfig, setLeadFlowConfig] = useState<LeadFlowConfig | null>(null);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [customerLevelConfigs, setCustomerLevelConfigs] = useState<CustomerLevelConfig[]>([]);
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const { addFollowUp } = useCustomerStore();
  const lifecycleCode = normalizeLifecycleStatusCode(currentCustomer.lifecycleStatusCode);
  const lifecycleConfig = getLifecycleConfigByCode(lifecycleCode);
  const isPublicPoolCustomer = lifecycleCode === 'public_pool';
  const canCreateOrderForCurrentCustomer = !isPublicPoolCustomer;
  const canEditLockedContact = isSuperAdminRoleName(currentUser?.role);

  useEffect(() => {
    setCurrentCustomer(customer);
    setDraft(customer);
    setTagInput(normalizeCustomerTags(customer.tags).join(', '));
    setFollowNote('');
    setFollowAttachments([]);
    setEditing(false);
    setActiveTab(0);
    aiCardApi.getCard('customer', customer.id).then((res) => setAiCard(res.data));
    try {
      setContracts(JSON.parse(localStorage.getItem(contractKey(customer.id)) || '[]'));
    } catch {
      setContracts([]);
    }
  }, [customer]);

  useEffect(() => {
    if (readOnly) setEditing(false);
  }, [readOnly]);

  useEffect(() => {
    if (!open) return;
    settingsApi.fetchAssignableUsers({ isActive: true }).then((res) => {
      if (res.code === 0) {
        setUsers(res.data.filter((user) => user.isActive));
      }
    });
    leadFlowApi.fetchLeadFlowConfig().then((res) => {
      if (res.code === 0) setLeadFlowConfig(res.data);
    });
    settingsApi.fetchLeadSourceConfigs().then((res) => {
      if (res.code === 0) setSourceConfigs(res.data.filter((item) => item.isActive));
    });
    settingsApi.fetchCustomerLevelConfigs().then((res) => {
      if (res.code === 0) setCustomerLevelConfigs(res.data);
    });
    orderApi.fetchOrders({ customerId: currentCustomer.id, pageSize: 100 }).then((res) => {
      if (res.code !== 0) return;
      setOrders(res.data.items.filter((item) => (
        item.customerId === currentCustomer.id
        || item.customerName === currentCustomer.company
        || item.customerName === currentCustomer.name
      )));
    });
  }, [currentCustomer.id, currentCustomer.company, currentCustomer.name, open]);

  const activityRecords = useMemo(() => (
    (currentCustomer.activityRecords || []).slice().sort((a, b) => (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ))
  ), [currentCustomer.activityRecords]);

  const parentSources = useMemo(
    () => sourceConfigs.filter((item) => !item.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [sourceConfigs],
  );
  const childSources = useMemo(
    () => sourceConfigs.filter((item) => item.parentId).sort((a, b) => a.sortOrder - b.sortOrder),
    [sourceConfigs],
  );
  const sourceOptions = useMemo<SourceOption[]>(() => {
    const draftLeadSource = String(draft.leadSource || '');
    const draftSourceName = String(draft.sourceName || '');
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
    if (draftLeadSource && !options.some((option) => option.parentName === draftLeadSource && option.childName === draftSourceName)) {
      options.unshift({
        key: `current:${draftLeadSource}:${draftSourceName}`,
        label: [draftLeadSource, draftSourceName].filter(Boolean).join('-'),
        parentName: draftLeadSource,
        childName: draftSourceName,
        parentId: 'current',
      });
    }
    return options;
  }, [childSources, draft.leadSource, draft.sourceName, parentSources]);

  const selectedSourceKey = sourceOptions.find((option) => (
    option.parentName === String(draft.leadSource || '') && option.childName === String(draft.sourceName || '')
  ))?.key || '';
  const customerLevelOptions = useMemo(() => {
    const activeConfigs = customerLevelConfigs.filter((item) => item.isActive).sort((a, b) => a.sortOrder - b.sortOrder);
    const options = activeConfigs.length
      ? activeConfigs.map((item) => ({ value: item.value, label: item.label, color: item.color }))
      : CUSTOMER_LEVELS;
    if (currentCustomer.customerLevel && !options.some((item) => item.value === currentCustomer.customerLevel)) {
      return [{ value: currentCustomer.customerLevel, label: currentCustomer.customerLevel, color: '#9E9E9E' }, ...options];
    }
    return options;
  }, [currentCustomer.customerLevel, customerLevelConfigs]);
  const assignableUsers = useMemo(
    () => getScopedLeadAssignmentCandidates(users, leadFlowConfig, 'customers', currentUser),
    [currentUser, leadFlowConfig, users],
  );

  const handleSourceSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const option = sourceOptions.find((item) => item.key === event.target.value);
    if (!option) return;
    setDraft((prev) => ({ ...prev, leadSource: option.parentName, sourceName: option.childName }));
  };

  const handlePhoneChange = (value: string) => {
    setDraft((prev) => ({
      ...prev,
      phone: value,
      city: completeCityFromPhone(String(prev.city || ''), value),
    }));
  };

  const getActivityColor = (type: CustomerActivityRecord['type']) => {
    if (type === 'follow') return '#16a34a';
    if (type === 'order') return '#2563eb';
    if (type === 'refund') return '#dc2626';
    if (type === 'transfer') return '#7c3aed';
    if (type === 'ai') return '#0891b2';
    return '#64748b';
  };

  const handleSelectFollowAttachments = async (
    event: React.ChangeEvent<HTMLInputElement>,
    category: CustomerActivityAttachmentCategory,
  ) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    if (!selectedFiles.length) return;
    const remaining = MAX_ACTIVITY_ATTACHMENTS - followAttachments.length;
    if (remaining <= 0) {
      await alert(`单条动态最多添加 ${MAX_ACTIVITY_ATTACHMENTS} 个附件`);
      return;
    }
    const acceptedFiles = selectedFiles.slice(0, remaining);
    const oversizeFile = acceptedFiles.find((file) => file.size > MAX_ACTIVITY_ATTACHMENT_SIZE);
    if (oversizeFile) {
      await alert(`${oversizeFile.name} 超过 10MB，请压缩后再上传`);
      return;
    }
    try {
      const attachments = await Promise.all(acceptedFiles.map((file) => readActivityAttachment(file, category)));
      setFollowAttachments((prev) => [...prev, ...attachments]);
      if (selectedFiles.length > remaining) {
        await alert(`已添加前 ${remaining} 个附件，单条动态最多 ${MAX_ACTIVITY_ATTACHMENTS} 个附件`);
      }
    } catch {
      await alert('附件读取失败，请重新选择');
    }
  };

  const handleRemoveFollowAttachment = (id: string) => {
    setFollowAttachments((prev) => prev.filter((attachment) => attachment.id !== id));
  };

  const openActivityAttachment = (attachment: CustomerActivityAttachment) => {
    const anchor = document.createElement('a');
    anchor.href = attachment.dataUrl;
    anchor.download = attachment.name;
    anchor.target = '_blank';
    anchor.rel = 'noreferrer';
    anchor.click();
  };

  const saveContracts = (next: ContractFile[]) => {
    setContracts(next);
    localStorage.setItem(contractKey(currentCustomer.id), JSON.stringify(next));
  };

  const handleGenerateCard = async () => {
    setCardLoading(true);
    try {
      const res = await aiCardApi.generateCard({
        subjectType: 'customer',
        subjectId: currentCustomer.id,
        name: currentCustomer.name,
        company: currentCustomer.company,
        phone: currentCustomer.phone,
        wechat: currentCustomer.wechat,
        industry: currentCustomer.industry,
        city: currentCustomer.city,
        tags: currentCustomer.tags,
        notes: currentCustomer.remark || currentCustomer.aiPortrait?.aiSummary,
      });
      if (res.code === 0) setAiCard(res.data);
    } finally {
      setCardLoading(false);
    }
  };

  const handleAddFollowUp = async () => {
    if (readOnly) return;
    const content = followNote.trim();
    if (!content && !followAttachments.length) return;
    const updated = await addFollowUp(currentCustomer.id, content, undefined, followAttachments);
    if (updated) setCurrentCustomer(updated);
    setFollowNote('');
    setFollowAttachments([]);
  };

  const handleSaveProfile = async () => {
    if (readOnly || profileSaving) return;
    const nextPhone = canEditLockedContact || canCompletePhoneField(currentCustomer.phone)
      ? normalizePhoneForStorage(String(draft.phone || ''))
      : currentCustomer.phone;
    const nextCity = completeCityFromPhone(String(draft.city || ''), nextPhone);
    const phoneError = getPhoneNumberError(nextPhone);
    if (phoneError) {
      alert(phoneError);
      return;
    }
    const payload: Partial<Customer> = {
      name: draft.name,
      company: draft.company,
      phone: nextPhone,
      wechat: canEditLockedContact || canCompleteContactField(currentCustomer.wechat) ? String(draft.wechat || '').trim() : currentCustomer.wechat,
      leadSource: draft.leadSource,
      sourceName: draft.sourceName,
      sourceType: normalizeResourceOwnership(draft.sourceType as string | undefined),
      industry: draft.industry,
      city: nextCity,
      leadContributorId: draft.leadContributorId,
      leadContributorName: draft.leadContributorName,
      customerLevel: draft.customerLevel,
      tags: parseCustomerTagsInput(tagInput),
      originalSalesTransferBy: draft.originalSalesTransferBy,
      remark: draft.remark,
    };
    setProfileSaving(true);
    try {
      const res = await customerApi.updateCustomer(currentCustomer.id, payload);
      if (res.code !== 0 || !res.data) {
        await alert(res.message || '客户资料保存失败，请检查必填项后再试', '保存失败');
        return;
      }
      setCurrentCustomer(res.data);
      setDraft(res.data);
      setTagInput(normalizeCustomerTags(res.data.tags).join(', '));
      setEditing(false);
      onUpdated?.(res.data);
    } catch (error) {
      await alert(error instanceof Error ? error.message : '客户资料保存失败，请稍后重试', '保存失败');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleClaimCurrentCustomer = async () => {
    if (readOnly) return;
    const userName = currentUser?.name || currentUser?.account || '';
    if (!userName) {
      alert('当前登录用户无效，请重新登录后再领取客户');
      return;
    }
    const res = await customerApi.claimCustomerFromPublicPool(currentCustomer.id, userName);
    const updatedCustomer = res.data;
    if (res.code !== 0 || !updatedCustomer) {
      alert(res.message || '领取失败');
      return;
    }
    setCurrentCustomer(updatedCustomer);
    setDraft(updatedCustomer);
    setTagInput(normalizeCustomerTags(updatedCustomer.tags).join(', '));
    onUpdated?.(updatedCustomer);
  };

  const handleReleaseCurrentCustomer = () => {
    if (readOnly) return;
    setReleaseReason('');
    setReleaseDialogOpen(true);
  };

  const handleConfirmReleaseCurrentCustomer = async () => {
    if (readOnly) return;
    const res = await customerApi.releaseCustomerToPublicPool(currentCustomer.id, releaseReason.trim() || '销售放弃跟进');
    const releasedCustomer = res.data as Customer;
    if (res.code !== 0 || !releasedCustomer) {
      alert(res.message || '释放到公海失败');
      return;
    }
    setCurrentCustomer(releasedCustomer);
    setDraft(releasedCustomer);
    setTagInput(normalizeCustomerTags(releasedCustomer.tags).join(', '));
    setReleaseDialogOpen(false);
    setReleaseReason('');
    onUpdated?.(releasedCustomer);
  };

  const handleContractUpload = (file?: File) => {
    if (readOnly) return;
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const next = [{
        id: `contract-${Date.now()}`,
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: String(reader.result || ''),
        uploadedAt: new Date().toISOString(),
      }, ...contracts];
      saveContracts(next);
    };
    reader.readAsDataURL(file);
  };

  const renderInfoRow = (label: string, field: keyof Customer, editable = true) => {
    const isUserField = field === 'owner' || field === 'leadInputBy' || field === 'originalSalesTransferBy';
    const isContributorField = field === 'leadContributorName';
    const isResourceField = field === 'sourceType';
    const isCustomerLevelField = field === 'customerLevel';
    const currentValue = (draft[field] as string) || '';
    const userFieldOptions = field === 'owner' ? assignableUsers : users;
    const showCurrentUserOption = isUserField && currentValue && !userFieldOptions.some((user) => user.name === currentValue);
    const displayValue = field === 'createdAt' && currentCustomer.createdAt
      ? formatDate(currentCustomer.createdAt, 'yyyy-MM-dd HH:mm:ss')
      : field === 'phone'
        ? formatPhoneForDisplay(currentCustomer.phone)
      : emptyText(currentCustomer[field] as string | number);

    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', borderBottom: '1px solid #eef2f7', minHeight: 38 }}>
        <Box sx={{ bgcolor: '#f6f8fb', px: 1.25, py: 1, color: '#64748b', fontSize: 13 }}>{label}</Box>
        <Box sx={{ px: 1.5, py: editing && editable ? 0.5 : 1, fontSize: 13 }}>
          {editing && editable ? (
            isResourceField ? (
              <TextField
                select
                value={normalizeResourceOwnership(currentValue)}
                onChange={(event) => setDraft((prev) => ({ ...prev, [field]: event.target.value }))}
                size="small"
                fullWidth
              >
                {RESOURCE_OWNERSHIPS.map((item) => (
                  <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>
                ))}
              </TextField>
            ) : isContributorField ? (
              <TextField
                select
                value={(draft.leadContributorId as string) || ''}
                onChange={(event) => {
                  const user = users.find((item) => item.id === event.target.value);
                  setDraft((prev) => ({
                    ...prev,
                    leadContributorId: user?.id || '',
                    leadContributorName: user?.name || '',
                  }));
                }}
                size="small"
                fullWidth
              >
                <MenuItem value="">无</MenuItem>
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name}（{user.positionName || '未设置职位'}）
                  </MenuItem>
                ))}
              </TextField>
            ) : isUserField ? (
              <TextField
                select
                value={currentValue}
                onChange={(event) => setDraft((prev) => ({ ...prev, [field]: event.target.value }))}
                size="small"
                fullWidth
              >
                {field === 'originalSalesTransferBy' && <MenuItem value="">无</MenuItem>}
                {showCurrentUserOption && <MenuItem value={currentValue}>{currentValue}</MenuItem>}
                {field === 'owner' && userFieldOptions.length === 0 && (
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
            ) : isCustomerLevelField ? (
              <TextField
                select
                value={currentValue}
                onChange={(event) => setDraft((prev) => ({ ...prev, [field]: event.target.value }))}
                size="small"
                fullWidth
              >
                {customerLevelOptions.map((level) => (
                  <MenuItem key={level.value} value={level.value}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: level.color }} />
                      {level.label}
                    </Box>
                  </MenuItem>
                ))}
              </TextField>
            ) : field === 'phone' ? (
              <PhoneNumberInput
                value={currentValue}
                onChange={handlePhoneChange}
                size="small"
                fullWidth
              />
            ) : (
              <TextField
                value={currentValue}
                onChange={(event) => setDraft((prev) => ({ ...prev, [field]: event.target.value }))}
                size="small"
                fullWidth
              />
            )
          ) : isResourceField ? normalizeResourceOwnership(displayValue ? String(displayValue) : undefined) : isCustomerLevelField ? (
            <CustomerLevelBadge level={String(currentCustomer.customerLevel || '')} />
          ) : displayValue}
        </Box>
      </Box>
    );
  };

  const renderSourceRow = () => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', borderBottom: '1px solid #eef2f7', minHeight: 38 }}>
      <Box sx={{ bgcolor: '#f6f8fb', px: 1.25, py: 1, color: '#64748b', fontSize: 13 }}>来源</Box>
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
              <MenuItem value={selectedSourceKey}>{formatCustomerSource(currentCustomer)}</MenuItem>
            )}
          </TextField>
        ) : (
          emptyText(formatCustomerSource(currentCustomer))
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

  const renderTagsRow = () => {
    const tags = normalizeCustomerTags(currentCustomer.tags);

    return (
      <Box sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', borderBottom: '1px solid #eef2f7', minHeight: 38 }}>
        <Box sx={{ bgcolor: '#f6f8fb', px: 1.25, py: 1, color: '#64748b', fontSize: 13 }}>标签</Box>
        <Box sx={{ px: 1.5, py: editing ? 0.5 : 1, fontSize: 13 }}>
          {editing ? (
            <TextField
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="多个标签用逗号分隔"
              size="small"
              fullWidth
            />
          ) : tags.length ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
              {tags.map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant="outlined"
                  sx={{ height: 22, borderColor: '#bfdbfe', bgcolor: '#eff6ff', color: '#2563eb', fontWeight: 600 }}
                />
              ))}
            </Box>
          ) : (
            emptyText()
          )}
        </Box>
      </Box>
    );
  };

  const renderRemarkRow = () => (
    <Box sx={{ display: 'grid', gridTemplateColumns: '96px 1fr', minHeight: 72 }}>
      <Box sx={{ bgcolor: '#f6f8fb', px: 1.25, py: 1, color: '#64748b', fontSize: 13 }}>客户备注</Box>
      <Box sx={{ px: 1.5, py: editing ? 0.75 : 1, fontSize: 13 }}>
        {editing ? (
          <TextField
            value={draft.remark || ''}
            onChange={(event) => setDraft((prev) => ({ ...prev, remark: event.target.value }))}
            multiline
            minRows={2}
            fullWidth
          />
        ) : (
          <Typography variant="body2">{emptyText(currentCustomer.remark)}</Typography>
        )}
      </Box>
    </Box>
  );

  const renderAttachmentButton = (
    label: string,
    category: CustomerActivityAttachmentCategory,
    icon: React.ReactNode,
  ) => (
    <Button
      component="label"
      size="small"
      variant="outlined"
      startIcon={icon}
      disabled={followAttachments.length >= MAX_ACTIVITY_ATTACHMENTS}
      sx={{ borderColor: '#dbeafe', color: '#2563eb', bgcolor: '#eff6ff' }}
    >
      {label}
      <input
        hidden
        multiple
        type="file"
        accept={activityAttachmentAccept[category]}
        onChange={(event) => handleSelectFollowAttachments(event, category)}
      />
    </Button>
  );

  const renderActivityTab = () => (
    <Box>
      {!readOnly && (
        <Box sx={{ border: '1px solid #dbeafe', borderRadius: 1, bgcolor: '#fbfdff', mb: 2, overflow: 'hidden' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto' }, gap: 1, p: 1 }}>
            <TextField
              value={followNote}
              onChange={(event) => setFollowNote(event.target.value)}
              placeholder="添加跟进记录，1000字以内"
              multiline
              minRows={2}
              fullWidth
            />
            <Button
              variant="contained"
              onClick={handleAddFollowUp}
              disabled={!followNote.trim() && !followAttachments.length}
              sx={{ alignSelf: 'stretch', minWidth: 76 }}
            >
              发表
            </Button>
          </Box>
          <Box sx={{ px: 1, pb: 1, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            {renderAttachmentButton('图片', 'image', <ImageIcon fontSize="small" />)}
            {renderAttachmentButton('文档', 'document', <InsertDriveFileIcon fontSize="small" />)}
            {renderAttachmentButton('录音', 'audio', <GraphicEqIcon fontSize="small" />)}
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
              最多 {MAX_ACTIVITY_ATTACHMENTS} 个，单个 10MB
            </Typography>
          </Box>
          {followAttachments.length > 0 && (
            <Box sx={{ px: 1, pb: 1, display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
              {followAttachments.map((attachment) => (
                <Chip
                  key={attachment.id}
                  size="small"
                  icon={attachment.category === 'image' ? <ImageIcon /> : attachment.category === 'audio' ? <GraphicEqIcon /> : <InsertDriveFileIcon />}
                  label={`${attachment.name} · ${formatFileSize(attachment.size)}`}
                  onDelete={() => handleRemoveFollowAttachment(attachment.id)}
                  deleteIcon={<CloseIcon />}
                  sx={{ maxWidth: 260 }}
                />
              ))}
            </Box>
          )}
        </Box>
      )}
      {activityRecords.length > 0 ? (
        <Box sx={{ position: 'relative', pl: 3 }}>
          {activityRecords.map((record, idx) => (
            <Box key={record.id} sx={{ position: 'relative', pb: 2.25 }}>
              <Box sx={{ position: 'absolute', left: -21, top: 4, width: 10, height: 10, borderRadius: '50%', bgcolor: getActivityColor(record.type), border: '2px solid #fff', boxShadow: '0 0 0 2px #e5e7eb' }} />
              {idx < activityRecords.length - 1 && (
                <Box sx={{ position: 'absolute', left: -17, top: 14, width: 2, height: 'calc(100% - 4px)', bgcolor: '#e5e7eb' }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{record.operator}</Typography>
                <Typography variant="body2">{record.title}</Typography>
                <Typography variant="caption" sx={{ color: '#9ca3af', ml: 'auto' }}>{formatDate(record.createdAt, 'yyyy-MM-dd HH:mm')}</Typography>
              </Box>
              {record.content && (
                <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1, px: 1.5, py: 1, mb: 0.75 }}>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>{record.content}</Typography>
                </Box>
              )}
              {record.attachments && record.attachments.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 0.75 }}>
                  {record.attachments.map((attachment) => (
                    <Chip
                      key={attachment.id}
                      size="small"
                      icon={attachment.category === 'image' ? <ImageIcon /> : attachment.category === 'audio' ? <GraphicEqIcon /> : <InsertDriveFileIcon />}
                      label={`${attachment.name} · ${formatFileSize(attachment.size)}`}
                      onClick={() => openActivityAttachment(attachment)}
                      sx={{
                        maxWidth: 280,
                        bgcolor: '#eef6ff',
                        border: '1px solid #dbeafe',
                        cursor: 'pointer',
                        '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' },
                      }}
                    />
                  ))}
                </Box>
              )}
              {record.changes && record.changes.length > 0 && (
                <Box sx={{ bgcolor: '#f8fafc', borderRadius: 1, px: 1.5, py: 1 }}>
                  {record.changes.map((change) => (
                    <Typography key={`${record.id}-${change.field}`} variant="body2" sx={{ color: '#374151' }}>
                      {change.label}: {change.oldValue ?? '空'} → {change.newValue ?? '空'}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无动态记录。</Typography>
      )}
    </Box>
  );

  const renderOrdersTab = () => (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" sx={{ color: '#64748b' }}>共 {orders.length} 笔订单</Typography>
        {!readOnly && onCreateOrder && canCreateOrderForCurrentCustomer && (
          <PermissionGate permissionKey={PERMISSION_KEYS.CUSTOMER_CREATE_ORDER} action="write">
          <Button variant="contained" size="small" onClick={() => onCreateOrder(currentCustomer)}>提交订单申请</Button>
          </PermissionGate>
        )}
      </Box>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>订单号</TableCell>
              <TableCell>产品名称</TableCell>
              <TableCell>产品等级</TableCell>
              <TableCell>类型</TableCell>
              <TableCell>金额</TableCell>
              <TableCell>付款日期</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id} sx={getProductLevelRowSx(order.productLevel)}>
                <TableCell sx={{ fontWeight: 600 }}>{order.orderNo}</TableCell>
                <TableCell>{order.productName || order.productLevel || '-'}</TableCell>
                <TableCell>
                  <Chip label={order.productLevel} size="small" sx={getProductLevelTagSx(order.productLevel)} />
                </TableCell>
                <TableCell>{order.orderType}</TableCell>
                <TableCell>{formatCurrency(order.actualAmount || order.amount)}</TableCell>
                <TableCell>{formatDate(order.payments?.[0]?.paidAt || order.createdAt, 'yyyy-MM-dd HH:mm:ss')}</TableCell>
              </TableRow>
            ))}
            {orders.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4, color: '#9ca3af' }}>暂无订单</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  const renderGrowthTab = () => (
    <Box>
      {currentCustomer.growthPath.length > 0 ? (
        <Box sx={{ position: 'relative', pl: 3 }}>
          {currentCustomer.growthPath.map((milestone, idx) => (
            <Box key={milestone.id} sx={{ position: 'relative', pb: 2.5 }}>
              <Box sx={{ position: 'absolute', left: -21, top: 4, width: 10, height: 10, borderRadius: '50%', bgcolor: getProductLevelColor(milestone.productLevel, '#2196F3'), border: '2px solid #fff', boxShadow: '0 0 0 2px #e5e7eb' }} />
              {idx < currentCustomer.growthPath.length - 1 && (
                <Box sx={{ position: 'absolute', left: -17, top: 14, width: 2, height: 'calc(100% - 4px)', bgcolor: '#e5e7eb' }} />
              )}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                <Chip label={milestone.productLevel} size="small" sx={getProductLevelTagSx(milestone.productLevel)} />
                <Typography variant="caption" sx={{ color: '#9ca3af' }}>{milestone.date}</Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{milestone.title}</Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>{milestone.description}</Typography>
            </Box>
          ))}
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: '#9ca3af' }}>暂无成长记录，客户成交订单后会自动生成。</Typography>
      )}
    </Box>
  );

  const renderAITab = () => (
    <AIBusinessCardPanel card={aiCard} loading={cardLoading} onGenerate={readOnly ? undefined : handleGenerateCard} />
  );

  const renderContractsTab = () => (
    <Box>
      {!readOnly && (
        <Box
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            handleContractUpload(event.dataTransfer.files?.[0]);
          }}
          sx={{ border: '1px dashed #90caf9', bgcolor: '#f8fbff', borderRadius: 1, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2 }}
        >
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>上传电子合同</Typography>
            <Typography variant="body2" sx={{ color: '#64748b' }}>支持 PDF、Word、图片等文件，拖拽到这里或点击上传。</Typography>
          </Box>
          <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
            上传合同
            <input hidden type="file" accept=".pdf,.doc,.docx,image/*" onChange={(event) => handleContractUpload(event.target.files?.[0])} />
          </Button>
        </Box>
      )}
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>文件名</TableCell>
              <TableCell>大小</TableCell>
              <TableCell>上传时间</TableCell>
              <TableCell align="center">操作</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {contracts.map((file) => (
              <TableRow key={file.id}>
                <TableCell>
                  <Button href={file.dataUrl} target="_blank" rel="noreferrer" sx={{ p: 0, minWidth: 0, textTransform: 'none' }}>{file.name}</Button>
                </TableCell>
                <TableCell>{`${Math.max(1, Math.round(file.size / 1024))} KB`}</TableCell>
                <TableCell>{formatDate(file.uploadedAt, 'yyyy-MM-dd HH:mm')}</TableCell>
                <TableCell align="center">
                  <Tooltip title="删除">
                    <IconButton size="small" color="error" onClick={() => saveContracts(contracts.filter((item) => item.id !== file.id))}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {contracts.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center" sx={{ py: 4, color: '#9ca3af' }}>暂无电子合同</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );

  return (
    <>
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, pr: 6 }}>
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>{currentCustomer.name}</Typography>
            <CustomerLevelBadge level={currentCustomer.customerLevel} />
            <Chip label={lifecycleConfig.name} size="small" sx={getLifecycleStatusTagSx(`${lifecycleCode} ${lifecycleConfig.name}`)} />
          </Box>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            {currentCustomer.owner || '未分配'} 跟进 · {formatCustomerSource(currentCustomer)}
          </Typography>
        </Box>
        <IconButton
          aria-label="关闭"
          onClick={onClose}
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: '#f8fafc' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '0.82fr 1.18fr' }, gap: 2, minHeight: '72vh' }}>
          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', alignSelf: 'start' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid #eef2f7', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2" sx={{ color: '#2196F3', fontWeight: 700 }}>资料</Typography>
              {!readOnly && (
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {isPublicPoolCustomer ? (
                    <PermissionGate permissionKey={PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM} action="write">
                      <Button size="small" variant="contained" startIcon={<PersonAddAltIcon />} onClick={handleClaimCurrentCustomer}>
                        重新领取
                      </Button>
                    </PermissionGate>
                  ) : (
                    <Button size="small" color="warning" variant="outlined" startIcon={<ExitToAppIcon />} onClick={handleReleaseCurrentCustomer}>
                      放弃到公海
                    </Button>
                  )}
                  {editing ? (
                    <>
                      <Button
                        size="small"
                        disabled={profileSaving}
                        onClick={() => {
                          setDraft(currentCustomer);
                          setTagInput(normalizeCustomerTags(currentCustomer.tags).join(', '));
                          setEditing(false);
                        }}
                      >
                        取消
                      </Button>
                      <Button size="small" variant="contained" disabled={profileSaving} onClick={handleSaveProfile} sx={{ minWidth: 76 }}>
                        {profileSaving ? '保存中' : '保存'}
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        setTagInput(normalizeCustomerTags(currentCustomer.tags).join(', '));
                        setEditing(true);
                      }}
                    >
                      编辑资料
                    </Button>
                  )}
                </Box>
              )}
            </Box>
            <Box>
              {renderInfoRow('客户全名', 'name')}
              {renderInfoRow('公司', 'company')}
              {renderInfoRow('手机', 'phone', canEditLockedContact || canCompletePhoneField(currentCustomer.phone))}
              {renderInfoRow('微信', 'wechat', canEditLockedContact || canCompleteContactField(currentCustomer.wechat))}
              {renderStatusRow('生命周期', <Chip label={lifecycleConfig.name} size="small" sx={getLifecycleStatusTagSx(`${lifecycleCode} ${lifecycleConfig.name}`)} />)}
              {renderSourceRow()}
              {renderInfoRow('资源归属', 'sourceType')}
              {renderInfoRow('行业', 'industry')}
              {renderInfoRow('城市', 'city')}
              {renderInfoRow('销售负责人', 'owner', false)}
              {renderInfoRow('线索录入人', 'leadInputBy', false)}
              {renderInfoRow('线索贡献人', 'leadContributorName')}
              {renderInfoRow('客户等级', 'customerLevel')}
              {renderTagsRow()}
              {renderInfoRow('原销转人员', 'originalSalesTransferBy')}
              {renderInfoRow('累计消费', 'totalSpent', false)}
              {renderInfoRow('订单数', 'orderCount', false)}
              {renderInfoRow('创建时间', 'createdAt', false)}
              {renderRemarkRow()}
            </Box>
          </Paper>

          <Paper elevation={0} sx={{ border: '1px solid #e5e7eb', borderRadius: 1, overflow: 'hidden', minWidth: 0 }}>
            <Tabs value={activeTab} onChange={(_, value) => setActiveTab(value)} sx={{ px: 2, borderBottom: '1px solid #eef2f7' }}>
              <Tab icon={<HistoryIcon fontSize="small" />} iconPosition="start" label="动态" />
              <Tab icon={<ReceiptLongIcon fontSize="small" />} iconPosition="start" label="订单" />
              <Tab icon={<TimelineIcon fontSize="small" />} iconPosition="start" label="成长路径" />
              <Tab icon={<AutoAwesomeIcon fontSize="small" />} iconPosition="start" label="AI名片" />
              <Tab icon={<UploadFileIcon fontSize="small" />} iconPosition="start" label="电子合同" />
            </Tabs>
            <Box sx={{ p: 2, maxHeight: '68vh', overflowY: 'auto' }}>
              {activeTab === 0 && renderActivityTab()}
              {activeTab === 1 && renderOrdersTab()}
              {activeTab === 2 && renderGrowthTab()}
              {activeTab === 3 && renderAITab()}
              {activeTab === 4 && renderContractsTab()}
            </Box>
          </Paper>
        </Box>
      </DialogContent>
    </Dialog>
    <Dialog open={releaseDialogOpen} onClose={() => setReleaseDialogOpen(false)} maxWidth="xs" fullWidth>
      <DialogCloseTitle onClose={() => setReleaseDialogOpen(false)}>放弃到公海</DialogCloseTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
          客户将从默认客户列表移入公海池，释放销售归属，后续可在“公海池”重新领取。
        </Typography>
        <TextField
          label="放弃原因"
          value={releaseReason}
          onChange={(event) => setReleaseReason(event.target.value)}
          placeholder="例如：客户暂无意向、联系不上、预算不匹配"
          multiline
          minRows={3}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setReleaseDialogOpen(false)}>取消</Button>
        <Button color="warning" variant="contained" onClick={handleConfirmReleaseCurrentCustomer}>确认放弃</Button>
      </DialogActions>
    </Dialog>
    {feedbackDialog}
    </>
  );
};

export default CustomerDetail;
