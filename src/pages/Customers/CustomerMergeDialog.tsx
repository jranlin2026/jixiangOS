import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import MergeTypeRoundedIcon from '@mui/icons-material/MergeTypeRounded';
import { customerApi, customerMergeApi } from '../../api';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import {
  CUSTOMER_LEVELS,
  getLifecycleConfigByCode,
  normalizeLifecycleStatusCode,
  normalizeResourceOwnership,
} from '../../shared/utils/constants';
import type { Customer } from '../../types/customer';
import {
  type CustomerMergeField,
  type CustomerMergeFieldDecision,
  type CustomerMergePrecheckResult,
} from '../../types/customerMerge';
import {
  buildCustomerMergeInput,
  buildInitialMergeDecisions,
  isCustomerMergeSelectionReady,
  normalizeMergeCustomerIds,
} from './customerMergeDialogModel';

type CustomerMergeDialogProps = {
  open: boolean;
  customerIds: string[];
  onClose: () => void;
  onMerged: () => void | Promise<void>;
};

const FIELD_GROUPS: Array<{
  title: string;
  fields: Array<{ key: CustomerMergeField; label: string }>;
}> = [
  {
    title: '客户归属',
    fields: [
      { key: 'ownerId', label: '负责人' },
      { key: 'lifecycleStatusCode', label: '客户进度' },
      { key: 'customerLevel', label: '客户等级' },
    ],
  },
  {
    title: '基本信息',
    fields: [
      { key: 'name', label: '客户姓名' },
      { key: 'phone', label: '手机号' },
      { key: 'wechat', label: '微信' },
      { key: 'email', label: '邮箱' },
      { key: 'company', label: '公司' },
      { key: 'industry', label: '行业' },
      { key: 'city', label: '城市' },
    ],
  },
  {
    title: '来源与备注',
    fields: [
      { key: 'leadSource', label: '线索来源' },
      { key: 'sourceType', label: '资源归属' },
      { key: 'sourceName', label: '来源名称' },
      { key: 'sourceAccount', label: '来源账号' },
      { key: 'remark', label: '备注' },
    ],
  },
];

const ASSOCIATION_LABELS: Record<string, string> = {
  orders: '订单',
  deliveries: '交付记录',
  recovery_orders: '售后挽回订单',
  customer_todos: '客户待办',
  lead_records: '线索记录',
  finance: '财务记录',
  commissions: '分账与提成',
};

const associationLabel = (key: string) => {
  const suffix = key.split('/').pop() || key;
  return ASSOCIATION_LABELS[suffix] || ASSOCIATION_LABELS[key] || key;
};

const customerLabel = (customer: Customer) => (
  customer.name || customer.company || customer.phone || customer.wechat || customer.id
);

const fieldDisplayValue = (customer: Customer, field: CustomerMergeField) => {
  if (field === 'ownerId') return customer.owner || '未分配';
  if (field === 'lifecycleStatusCode') {
    return getLifecycleConfigByCode(normalizeLifecycleStatusCode(customer.lifecycleStatusCode)).name;
  }
  if (field === 'customerLevel') {
    return CUSTOMER_LEVELS.find((item) => item.value === customer.customerLevel)?.label || customer.customerLevel || '未填写';
  }
  if (field === 'sourceType') return normalizeResourceOwnership(customer.sourceType) || '未填写';
  const value = customer[field];
  return String(value || '').trim() || '未填写';
};

const CustomerMergeDialog: React.FC<CustomerMergeDialogProps> = ({
  open,
  customerIds,
  onClose,
  onMerged,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [mainCustomerId, setMainCustomerId] = useState('');
  const [fieldDecisions, setFieldDecisions] = useState<Partial<Record<CustomerMergeField, CustomerMergeFieldDecision>>>({});
  const [reason, setReason] = useState('合并重复客户资料');
  const [precheck, setPrecheck] = useState<CustomerMergePrecheckResult | null>(null);
  const [precheckToken, setPrecheckToken] = useState('');
  const [notice, setNotice] = useState<{ severity: 'error' | 'info' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const clearPrecheck = useCallback(() => {
    setPrecheck(null);
    setPrecheckToken('');
  }, []);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const ids = normalizeMergeCustomerIds(customerIds);
    setCustomers([]);
    setNotice(null);
    clearPrecheck();
    setReason('合并重复客户资料');
    setBusy(true);
    void Promise.all(ids.map((id) => customerApi.fetchCustomerById(id)))
      .then((responses) => {
        if (!active) return;
        const loaded = responses.flatMap((response) => (
          response.code === 0 && response.data ? [response.data] : []
        ));
        const initialMainId = loaded[0]?.id || '';
        setCustomers(loaded);
        setMainCustomerId(initialMainId);
        setFieldDecisions(buildInitialMergeDecisions(initialMainId));
        if (loaded.length !== ids.length || loaded.length < 2) {
          setNotice({ severity: 'error', text: '部分客户已不可用，请关闭弹窗后重新选择。' });
        }
      })
      .catch(() => {
        if (active) setNotice({ severity: 'error', text: '客户资料加载失败，请稍后重试。' });
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => { active = false; };
  }, [clearPrecheck, customerIds, open]);

  const selectedTagNames = useMemo(
    () => Array.from(new Set(customers.flatMap((customer) => customer.tags || []))).filter(Boolean),
    [customers],
  );
  const selectedTagIds = useMemo(
    () => Array.from(new Set(customers.flatMap((customer) => customer.manualTagIds || []))),
    [customers],
  );
  const selectionReady = useMemo(
    () => isCustomerMergeSelectionReady(customerIds, customers),
    [customerIds, customers],
  );
  const mergeInput = useMemo(
    () => buildCustomerMergeInput(customers, mainCustomerId, fieldDecisions, reason),
    [customers, fieldDecisions, mainCustomerId, reason],
  );

  const chooseMainCustomer = (nextMainCustomerId: string) => {
    setMainCustomerId(nextMainCustomerId);
    setFieldDecisions(buildInitialMergeDecisions(nextMainCustomerId));
    setNotice(null);
    clearPrecheck();
  };

  const chooseFieldSource = (field: CustomerMergeField, sourceCustomerId: string) => {
    setFieldDecisions((current) => ({ ...current, [field]: { sourceCustomerId } }));
    setNotice(null);
    clearPrecheck();
  };

  const runPrecheck = async () => {
    if (!selectionReady || !mainCustomerId) {
      setNotice({ severity: 'error', text: '所选客户未全部加载成功，请关闭弹窗后重新选择。' });
      return;
    }
    if (!reason.trim()) {
      setNotice({ severity: 'error', text: '请填写合并原因。' });
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const response = await customerMergeApi.precheck(mergeInput);
      setPrecheck(response.data || null);
      if (response.code !== 0 || !response.data?.executable || !response.data.precheckToken) {
        setPrecheckToken('');
        setNotice({
          severity: 'error',
          text: response.data?.conflicts?.map((item) => item.message).join('；')
            || response.message
            || '当前资料不能合并，请按提示处理。',
        });
        return;
      }
      setPrecheckToken(response.data.precheckToken);
      setNotice({ severity: 'success', text: '检查通过，请核对合并影响后确认。' });
    } catch {
      clearPrecheck();
      setNotice({ severity: 'error', text: '合并影响检查失败，请检查网络后重试。' });
    } finally {
      setBusy(false);
    }
  };

  const executeMerge = async () => {
    if (!precheckToken) return;
    setBusy(true);
    try {
      const response = await customerMergeApi.execute({
        ...mergeInput,
        precheckToken,
        idempotencyKey: `merge-${crypto.randomUUID()}`,
      });
      if (response.code !== 0) {
        clearPrecheck();
        setNotice({ severity: 'error', text: response.message || '合并失败，请重新检查合并影响。' });
        return;
      }
      await onMerged();
    } catch {
      clearPrecheck();
      setNotice({ severity: 'error', text: '合并请求失败，请检查网络后重新检查合并影响。' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          height: { xs: '100%', md: '88vh' },
          maxHeight: { xs: '100%', md: 920 },
          borderRadius: { xs: 0, md: 2.5 },
        },
      }}
    >
      <DialogCloseTitle onClose={() => { if (!busy) onClose(); }}>
        <Stack direction="row" alignItems="center" gap={1.25}>
          <MergeTypeRoundedIcon color="primary" />
          <Box>
            <Typography variant="h6" fontWeight={800}>合并重复客户</Typography>
            <Typography variant="body2" color="text.secondary">
              已选择 {customers.length || customerIds.length} 位客户，合并后保留 1 位客户
            </Typography>
          </Box>
        </Stack>
      </DialogCloseTitle>

      <DialogContent dividers sx={{ p: 0, bgcolor: '#f8fafc' }}>
        {busy && customers.length === 0 ? (
          <Stack alignItems="center" justifyContent="center" minHeight={360} gap={2}>
            <CircularProgress size={32} />
            <Typography color="text.secondary">正在加载客户资料…</Typography>
          </Stack>
        ) : (
          <Box sx={{ p: { xs: 2, md: 3 } }}>
            {notice && <Alert severity={notice.severity} sx={{ mb: 2 }}>{notice.text}</Alert>}

            <Box sx={{ bgcolor: '#fff', border: '1px solid #dbe5f1', borderRadius: 2, p: 2.25, mb: 2.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }} justifyContent="space-between">
                <Box>
                  <Typography fontWeight={800}>先确定保留哪一条客户档案</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    主客户编号会继续使用；下方每个字段仍可单独选择其他客户的内容。
                  </Typography>
                </Box>
                <FormControl size="small" sx={{ minWidth: { xs: '100%', md: 360 } }}>
                  <InputLabel>保留为主客户档案</InputLabel>
                  <Select
                    value={mainCustomerId}
                    label="保留为主客户档案"
                    onChange={(event) => chooseMainCustomer(event.target.value)}
                  >
                    {customers.map((customer) => (
                      <MenuItem key={customer.id} value={customer.id}>
                        {customerLabel(customer)} · {customer.phone || customer.wechat || customer.company || customer.id}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Box>

            <Typography variant="h6" fontWeight={800} sx={{ mb: 0.5 }}>最终客户资料</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              每项数据只保留一份。请逐项选择合并后要使用的内容。
            </Typography>

            {FIELD_GROUPS.map((group) => (
              <Box key={group.title} sx={{ mb: 2.5 }}>
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
                  <Box sx={{ width: 4, height: 22, bgcolor: 'primary.main', borderRadius: 2 }} />
                  <Typography fontWeight={800}>{group.title}</Typography>
                </Stack>
                <Box sx={{ bgcolor: '#fff', border: '1px solid #dbe5f1', borderRadius: 2, overflow: 'hidden' }}>
                  {group.fields.map((field, index) => (
                    <React.Fragment key={field.key}>
                      {index > 0 && <Divider />}
                      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '180px minmax(0, 1fr)' }, alignItems: 'center' }}>
                        <Typography sx={{ px: 2, py: { xs: 1.25, md: 2 }, fontWeight: 700, color: '#475569', bgcolor: '#f8fafc' }}>
                          {field.label}
                        </Typography>
                        <FormControl size="small" sx={{ m: { xs: 1.5, md: 1.25 }, minWidth: 0 }}>
                          <Select
                            value={fieldDecisions[field.key]?.sourceCustomerId || mainCustomerId}
                            onChange={(event) => chooseFieldSource(field.key, event.target.value)}
                            aria-label={`选择${field.label}`}
                          >
                            {customers.map((customer) => (
                              <MenuItem key={customer.id} value={customer.id}>
                                <Box sx={{ display: 'flex', gap: 1, minWidth: 0, width: '100%', justifyContent: 'space-between' }}>
                                  <Typography noWrap>{fieldDisplayValue(customer, field.key)}</Typography>
                                  <Typography variant="caption" color="text.secondary" noWrap>
                                    来自 {customerLabel(customer)}
                                  </Typography>
                                </Box>
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Box>
                    </React.Fragment>
                  ))}
                </Box>
              </Box>
            ))}

            <Box sx={{ mb: 2.5 }}>
              <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1 }}>
                <Box sx={{ width: 4, height: 22, bgcolor: 'primary.main', borderRadius: 2 }} />
                <Typography fontWeight={800}>自动合并内容</Typography>
              </Stack>
              <Box sx={{ bgcolor: '#fff', border: '1px solid #dbe5f1', borderRadius: 2, p: 2 }}>
                <Stack direction="row" gap={1} alignItems="flex-start">
                  <InfoOutlinedIcon color="primary" fontSize="small" sx={{ mt: 0.25 }} />
                  <Box>
                    <Typography variant="body2" fontWeight={700}>
                      标签取并集，业务记录统一迁移到主客户，不会只保留一条。
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      包括跟进记录、成长轨迹、订单、交付、售后挽回、待办、财务与提成记录。
                    </Typography>
                  </Box>
                </Stack>
                <Stack direction="row" gap={0.75} flexWrap="wrap" useFlexGap sx={{ mt: 1.5 }}>
                  {selectedTagNames.slice(0, 12).map((tag) => <Chip key={tag} label={tag} size="small" color="primary" variant="outlined" />)}
                  {!selectedTagNames.length && selectedTagIds.length > 0 && <Chip label={`共合并 ${selectedTagIds.length} 个标签`} size="small" color="primary" variant="outlined" />}
                  {!selectedTagNames.length && selectedTagIds.length === 0 && <Typography variant="body2" color="text.secondary">所选客户暂无标签</Typography>}
                </Stack>
              </Box>
            </Box>

            {precheck && (
              <Box sx={{ bgcolor: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 2, p: 2, mb: 2.5 }}>
                <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.25 }}>
                  <CheckCircleRoundedIcon color="primary" />
                  <Typography fontWeight={800}>合并影响检查结果</Typography>
                </Stack>
                <Stack direction="row" gap={1} flexWrap="wrap" useFlexGap>
                  {Object.entries(precheck.associationCounts).map(([key, count]) => (
                    <Chip key={key} label={`${associationLabel(key)} ${count} 条`} size="small" sx={{ bgcolor: '#fff' }} />
                  ))}
                  {!Object.keys(precheck.associationCounts).length && <Typography variant="body2">未发现需要迁移的关联记录。</Typography>}
                </Stack>
              </Box>
            )}

            <TextField
              label="合并原因"
              required
              fullWidth
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                clearPrecheck();
              }}
              helperText="原因会写入客户审计记录，便于后续追溯。"
            />
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, md: 3 }, py: 2, borderTop: '1px solid #e2e8f0', bgcolor: '#fff' }}>
        <Button onClick={onClose} disabled={busy}>取消</Button>
        {!precheckToken ? (
          <Button variant="contained" onClick={runPrecheck} disabled={busy || !selectionReady}>
            {busy ? '正在检查…' : '检查合并影响'}
          </Button>
        ) : (
          <Button color="success" variant="contained" onClick={executeMerge} disabled={busy}>
            {busy ? '正在合并…' : '确认合并'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default CustomerMergeDialog;
