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
import TimelineIcon from '@mui/icons-material/Timeline';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PersonAddAltIcon from '@mui/icons-material/PersonAddAlt';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import useCustomerStore from '../../store/useCustomerStore';
import type { Customer, CustomerActivityRecord } from '../../types/customer';
import type { AIBusinessCard } from '../../types/aiCard';
import type { Order } from '../../types/order';
import type { CustomerLevelConfig, LeadSourceConfig, User } from '../../types/settings';
import { aiCardApi, customerApi, orderApi, settingsApi } from '../../api';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import { CUSTOMER_LEVELS, RESOURCE_OWNERSHIPS, getLifecycleConfigByCode, getProductLevelColor, normalizeLifecycleStatusCode, normalizeResourceOwnership } from '../../shared/utils/constants';
import CustomerLevelBadge from '../../shared/components/CustomerLevelBadge';
import AIBusinessCardPanel from '../../shared/components/AIBusinessCardPanel';
import RefundStatusBadge from '../../shared/components/RefundStatusBadge';
import useAuthStore from '../../store/useAuthStore';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

interface CustomerDetailProps {
  customer: Customer;
  open: boolean;
  onClose: () => void;
  onCreateOrder?: (customer: Customer) => void;
  onViewOrders?: (customer: Customer) => void;
  onUpdated?: (customer: Customer) => void;
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

const CustomerDetail: React.FC<CustomerDetailProps> = ({
  customer,
  open,
  onClose,
  onCreateOrder,
  onUpdated,
}) => {
  const currentUser = useAuthStore((state) => state.currentUser);
  const [currentCustomer, setCurrentCustomer] = useState<Customer>(customer);
  const [aiCard, setAiCard] = useState<AIBusinessCard | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [followNote, setFollowNote] = useState('');
  const [activeTab, setActiveTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Customer>>({});
  const [orders, setOrders] = useState<Order[]>([]);
  const [contracts, setContracts] = useState<ContractFile[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sourceConfigs, setSourceConfigs] = useState<LeadSourceConfig[]>([]);
  const [customerLevelConfigs, setCustomerLevelConfigs] = useState<CustomerLevelConfig[]>([]);
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [releaseReason, setReleaseReason] = useState('');
  const { addFollowUp } = useCustomerStore();
  const lifecycleCode = normalizeLifecycleStatusCode(currentCustomer.lifecycleStatusCode);
  const lifecycleConfig = getLifecycleConfigByCode(lifecycleCode);
  const isPublicPoolCustomer = lifecycleCode === 'public_pool';

  useEffect(() => {
    setCurrentCustomer(customer);
    setDraft(customer);
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
    if (!open) return;
    settingsApi.fetchUsers({ isActive: true }).then((res) => {
      if (res.code === 0) {
        setUsers(res.data.filter((user) => user.isActive));
      }
    });
    settingsApi.fetchLeadSourceConfigs().then((res) => {
      if (res.code === 0) setSourceConfigs(res.data.filter((item) => item.isActive));
    });
    settingsApi.fetchCustomerLevelConfigs().then((res) => {
      if (res.code === 0) setCustomerLevelConfigs(res.data);
    });
    orderApi.fetchOrders({ pageSize: 1000 }).then((res) => {
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

  const handleSourceSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const option = sourceOptions.find((item) => item.key === event.target.value);
    if (!option) return;
    setDraft((prev) => ({ ...prev, leadSource: option.parentName, sourceName: option.childName }));
  };

  const getActivityColor = (type: CustomerActivityRecord['type']) => {
    if (type === 'follow') return '#16a34a';
    if (type === 'order') return '#2563eb';
    if (type === 'refund') return '#dc2626';
    if (type === 'transfer') return '#7c3aed';
    if (type === 'ai') return '#0891b2';
    return '#64748b';
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
    const content = followNote.trim();
    if (!content) return;
    const updated = await addFollowUp(currentCustomer.id, content);
    if (updated) setCurrentCustomer(updated);
    setFollowNote('');
  };

  const handleSaveProfile = async () => {
    const payload: Partial<Customer> = {
      name: draft.name,
      company: draft.company,
      leadSource: draft.leadSource,
      sourceName: draft.sourceName,
      sourceType: normalizeResourceOwnership(draft.sourceType as string | undefined),
      industry: draft.industry,
      city: draft.city,
      owner: draft.owner,
      leadInputBy: draft.leadInputBy,
      leadContributorId: draft.leadContributorId,
      leadContributorName: draft.leadContributorName,
      customerLevel: draft.customerLevel,
      originalSalesTransferBy: draft.originalSalesTransferBy,
      remark: draft.remark,
    };
    const res = await customerApi.updateCustomer(currentCustomer.id, payload);
    if (res.code === 0 && res.data) {
      setCurrentCustomer(res.data);
      setDraft(res.data);
      setEditing(false);
      onUpdated?.(res.data);
    }
  };

  const handleClaimCurrentCustomer = async () => {
    const userName = currentUser?.name || currentUser?.account || '';
    if (!userName) {
      window.alert('当前登录用户无效，请重新登录后再领取客户');
      return;
    }
    const res = await customerApi.claimCustomerFromPublicPool(currentCustomer.id, userName);
    const updatedCustomer = res.data;
    if (res.code !== 0 || !updatedCustomer) {
      window.alert(res.message || '领取失败');
      return;
    }
    setCurrentCustomer(updatedCustomer);
    setDraft(updatedCustomer);
    onUpdated?.(updatedCustomer);
  };

  const handleReleaseCurrentCustomer = () => {
    setReleaseReason('');
    setReleaseDialogOpen(true);
  };

  const handleConfirmReleaseCurrentCustomer = async () => {
    const res = await customerApi.releaseCustomerToPublicPool(currentCustomer.id, releaseReason.trim() || '销售放弃跟进');
    const releasedCustomer = res.data as Customer;
    if (res.code !== 0 || !releasedCustomer) {
      window.alert(res.message || '释放到公海失败');
      return;
    }
    setCurrentCustomer(releasedCustomer);
    setDraft(releasedCustomer);
    setReleaseDialogOpen(false);
    setReleaseReason('');
    onUpdated?.(releasedCustomer);
  };

  const handleContractUpload = (file?: File) => {
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
    const showCurrentUserOption = isUserField && currentValue && !users.some((user) => user.name === currentValue);
    const displayValue = field === 'createdAt' && currentCustomer.createdAt
      ? formatDate(currentCustomer.createdAt, 'yyyy-MM-dd HH:mm')
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
                    {user.name}（{user.role}）
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
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.name}>
                    {user.name}（{user.role}）
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

  const renderActivityTab = () => (
    <Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto' }, gap: 1, mb: 2 }}>
        <TextField
          value={followNote}
          onChange={(event) => setFollowNote(event.target.value)}
          placeholder="添加跟进记录，1000字以内"
          multiline
          minRows={2}
          fullWidth
        />
        <Button variant="contained" onClick={handleAddFollowUp} disabled={!followNote.trim()} sx={{ alignSelf: 'stretch' }}>
          发表
        </Button>
      </Box>
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
        <Button variant="contained" size="small" onClick={() => onCreateOrder?.(currentCustomer)}>提交订单申请</Button>
      </Box>
      <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e5e7eb' }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>订单号</TableCell>
              <TableCell>产品</TableCell>
              <TableCell>类型</TableCell>
              <TableCell>金额</TableCell>
              <TableCell>付款日期</TableCell>
              <TableCell>退款状态</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell sx={{ fontWeight: 600 }}>{order.orderNo}</TableCell>
                <TableCell>
                  <Chip label={order.productLevel} size="small" sx={{ bgcolor: `${getProductLevelColor(order.productLevel)}18`, color: getProductLevelColor(order.productLevel), fontWeight: 600 }} />
                </TableCell>
                <TableCell>{order.orderType}</TableCell>
                <TableCell>{formatCurrency(order.actualAmount || order.amount)}</TableCell>
                <TableCell>{formatDate(order.payments?.[0]?.paidAt || order.createdAt, 'yyyy-MM-dd HH:mm')}</TableCell>
                <TableCell><RefundStatusBadge status={order.refundStatus} /></TableCell>
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
                <Chip label={milestone.productLevel} size="small" sx={{ fontSize: '0.6875rem', bgcolor: `${getProductLevelColor(milestone.productLevel)}18`, color: getProductLevelColor(milestone.productLevel) }} />
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
    <AIBusinessCardPanel card={aiCard} loading={cardLoading} onGenerate={handleGenerateCard} />
  );

  const renderContractsTab = () => (
    <Box>
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
            <Chip label={lifecycleConfig.name} size="small" sx={{ bgcolor: `${lifecycleConfig.color}18`, color: lifecycleConfig.color, fontWeight: 600 }} />
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
              <Box sx={{ display: 'flex', gap: 1 }}>
                {isPublicPoolCustomer ? (
                  <Button size="small" variant="contained" startIcon={<PersonAddAltIcon />} onClick={handleClaimCurrentCustomer}>
                    重新领取
                  </Button>
                ) : (
                  <Button size="small" color="warning" variant="outlined" startIcon={<ExitToAppIcon />} onClick={handleReleaseCurrentCustomer}>
                    放弃到公海
                  </Button>
                )}
                {editing ? (
                  <>
                    <Button size="small" onClick={() => { setDraft(currentCustomer); setEditing(false); }}>取消</Button>
                    <Button size="small" variant="contained" onClick={handleSaveProfile}>保存</Button>
                  </>
                ) : (
                  <Button size="small" variant="outlined" onClick={() => setEditing(true)}>编辑资料</Button>
                )}
              </Box>
            </Box>
            <Box>
              {renderInfoRow('客户全名', 'name')}
              {renderInfoRow('公司', 'company')}
              {renderInfoRow('手机', 'phone', false)}
              {renderInfoRow('微信', 'wechat', false)}
              {renderStatusRow('生命周期', <Chip label={lifecycleConfig.name} size="small" sx={{ bgcolor: `${lifecycleConfig.color}18`, color: lifecycleConfig.color, fontWeight: 600 }} />)}
              {renderSourceRow()}
              {renderInfoRow('资源归属', 'sourceType')}
              {renderInfoRow('行业', 'industry')}
              {renderInfoRow('城市', 'city')}
              {renderInfoRow('销售负责人', 'owner')}
              {renderInfoRow('线索录入人', 'leadInputBy')}
              {renderInfoRow('线索贡献人', 'leadContributorName')}
              {renderInfoRow('客户等级', 'customerLevel')}
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
    </>
  );
};

export default CustomerDetail;
