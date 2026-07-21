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
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DialogCloseTitle from '../../../shared/components/DialogCloseTitle';
import { customerBatchApi } from '../../../api/customerBatchApi';
import { fetchCustomerTagCatalog } from '../../../api/customerTagApi';
import type { CustomerManageableUser } from '../../../types/customer';
import type {
  CustomerBatchJobSummary,
  CustomerBatchOperation,
  CustomerBatchOperationInput,
  CustomerBatchPrecheckResult,
  CustomerBatchSelection,
} from '../../../types/customerBatch';
import type { LifecycleStatusConfig } from '../../../types/settings';
import type { CustomerTag } from '../../../types/tag';
import type { CustomerBatchSelectionState } from '../../../shared/utils/customerBatchSelection';
import { formatEmployeeNameWithPosition } from '../../../shared/utils/formatters';

export const CUSTOMER_BATCH_ACTION_LABELS: Record<CustomerBatchOperation, string> = {
  transfer: '转让客户',
  release_to_pool: '释放到公海',
  set_progress: '设置客户进展',
  update_tags: '设置客户标签',
  add_todo: '添加客户待办',
  soft_delete: '删除客户',
};

export const getCustomerBatchOperationLabel = (operation: string) => (
  operation === 'export' ? '导出客户'
    : operation === 'import' ? '导入客户'
      : CUSTOMER_BATCH_ACTION_LABELS[operation as CustomerBatchOperation] || operation
);

export interface CustomerBatchDialogState {
  operation: CustomerBatchOperation | null;
  reason: string;
  precheck: CustomerBatchPrecheckResult | null;
  deleteConfirmation: string;
}

export function initialCustomerBatchDialogState(): CustomerBatchDialogState {
  return { operation: null, reason: '', precheck: null, deleteConfirmation: '' };
}

export function getBatchDialogPresentation(precheck: CustomerBatchPrecheckResult | null) {
  const executableCount = precheck?.itemResults.filter((item) => item.status === 'ready').length || 0;
  const blockedCount = precheck?.itemResults.filter((item) => item.status === 'blocked').length || 0;
  return {
    executableCount,
    blockedCount,
    totalCount: precheck?.totalCount || 0,
    executionMode: precheck?.executionMode || 'background' as const,
  };
}

export function canSubmitBatchDialog(state: CustomerBatchDialogState): boolean {
  if (!state.operation || !state.reason.trim() || !state.precheck?.confirmationToken) return false;
  if (state.operation === 'soft_delete' && state.deleteConfirmation.trim() !== '删除客户') return false;
  return getBatchDialogPresentation(state.precheck).executableCount > 0;
}

type Props = {
  open: boolean;
  operation: CustomerBatchOperation | null;
  selection: CustomerBatchSelectionState;
  manageableUsers: CustomerManageableUser[];
  lifecycleConfigs: LifecycleStatusConfig[];
  onClose: () => void;
  onCreated: (job: CustomerBatchJobSummary) => void;
};

type ActionForm = {
  targetOwnerId: string;
  lifecycleStatusCode: string;
  tagMode: 'add' | 'remove';
  tagIds: string[];
  todoTitle: string;
  todoContent: string;
  todoDueAt: string;
  todoExecutionMethod: string;
};

const defaultDueAt = () => {
  const value = new Date();
  value.setHours(value.getHours() + 1, 0, 0, 0);
  const offset = value.getTimezoneOffset() * 60_000;
  return new Date(value.getTime() - offset).toISOString().slice(0, 16);
};

const initialForm = (): ActionForm => ({
  targetOwnerId: '',
  lifecycleStatusCode: '',
  tagMode: 'add',
  tagIds: [],
  todoTitle: '',
  todoContent: '',
  todoDueAt: defaultDueAt(),
  todoExecutionMethod: 'none',
});

const executionMethods = [
  ['none', '不限'], ['phone', '电话'], ['visit', '拜访'], ['wechat', '微信'], ['sms', '短信'], ['email', '邮件'],
] as const;

function toApiSelection(selection: CustomerBatchSelectionState): CustomerBatchSelection {
  if (selection.mode === 'filter_snapshot' && selection.filters) {
    return { mode: 'filter_snapshot', filters: selection.filters };
  }
  return { mode: 'ids', customerIds: selection.selectedIds };
}

function actionInput(operation: CustomerBatchOperation, form: ActionForm): CustomerBatchOperationInput | null {
  if (operation === 'transfer') return form.targetOwnerId ? { targetOwnerId: form.targetOwnerId } : null;
  if (operation === 'release_to_pool') return {};
  if (operation === 'set_progress') return form.lifecycleStatusCode ? { lifecycleStatusCode: form.lifecycleStatusCode } : null;
  if (operation === 'update_tags') return form.tagIds.length ? { mode: form.tagMode, tagIds: form.tagIds } : null;
  if (operation === 'add_todo') {
    if (!form.todoTitle.trim() || !form.todoDueAt || !form.todoExecutionMethod) return null;
    const dueAt = new Date(form.todoDueAt);
    if (Number.isNaN(dueAt.getTime())) return null;
    return {
      title: form.todoTitle.trim(),
      content: form.todoContent.trim(),
      dueAt: dueAt.toISOString(),
      executionMethod: form.todoExecutionMethod,
    };
  }
  return { confirmed: true };
}

const createIdempotencyKey = () => (
  globalThis.crypto?.randomUUID?.() || `batch-${Date.now()}-${Math.random().toString(16).slice(2)}`
);

const CustomerBatchActionDialog: React.FC<Props> = ({
  open,
  operation,
  selection,
  manageableUsers,
  lifecycleConfigs,
  onClose,
  onCreated,
}) => {
  const [state, setState] = useState<CustomerBatchDialogState>(initialCustomerBatchDialogState());
  const [form, setForm] = useState<ActionForm>(initialForm());
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const revisionRef = useRef(0);

  useEffect(() => {
    if (!open || !operation) return;
    setState({ ...initialCustomerBatchDialogState(), operation });
    setForm(initialForm());
    setError('');
    revisionRef.current += 1;
  }, [open, operation]);

  useEffect(() => {
    if (!open || operation !== 'update_tags') return;
    void fetchCustomerTagCatalog('customer', false).then((response) => {
      if (response.code === 0) setTags(response.data.tags.filter((tag) => tag.isActive));
    });
  }, [open, operation]);

  const presentation = useMemo(() => getBatchDialogPresentation(state.precheck), [state.precheck]);
  const updateState = (patch: Partial<CustomerBatchDialogState>) => {
    revisionRef.current += 1;
    setState((current) => ({ ...current, ...patch, precheck: patch.precheck === undefined ? null : patch.precheck }));
  };
  const updateForm = (patch: Partial<ActionForm>) => {
    revisionRef.current += 1;
    setForm((current) => ({ ...current, ...patch }));
    setState((current) => ({ ...current, precheck: null }));
  };

  const runPrecheck = async () => {
    if (!operation || !state.reason.trim()) {
      setError('请先填写操作原因');
      return;
    }
    if (operation === 'soft_delete' && state.deleteConfirmation.trim() !== '删除客户') {
      setError('请输入“删除客户”确认高风险操作');
      return;
    }
    const input = actionInput(operation, form);
    if (!input) {
      setError('请完整填写本次批量操作参数');
      return;
    }
    setLoading(true);
    setError('');
    const revision = revisionRef.current;
    try {
      const response = await customerBatchApi.precheck({
        operation,
        selection: toApiSelection(selection),
        input,
        reason: state.reason.trim(),
      });
      if (response.code !== 0 || !response.data) {
        setError(response.message || '批量预检失败');
        return;
      }
      if (revision !== revisionRef.current) {
        setError('操作参数已变化，请重新预检');
        return;
      }
      setState((current) => ({ ...current, precheck: response.data }));
    } finally {
      setLoading(false);
    }
  };

  const createJob = async () => {
    if (!canSubmitBatchDialog(state)) return;
    setLoading(true);
    setError('');
    try {
      const response = await customerBatchApi.createJob({
        precheckToken: state.precheck!.confirmationToken,
        idempotencyKey: createIdempotencyKey(),
      });
      if (response.code !== 0 || !response.data) {
        setError(response.message || '批量任务创建失败');
        return;
      }
      onCreated(response.data);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  if (!operation) return null;

  return (
    <Dialog open={open} onClose={() => !loading && onClose()} maxWidth="sm" fullWidth>
      <DialogCloseTitle onClose={() => !loading && onClose()}>{CUSTOMER_BATCH_ACTION_LABELS[operation]}</DialogCloseTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            {selection.mode === 'filter_snapshot'
              ? '将由服务器按当前筛选条件重新核验并冻结可操作客户。'
              : `已选择 ${selection.selectedIds.length} 位客户，将逐条核验权限和当前状态。`}
          </Alert>
          {operation === 'transfer' && (
            <TextField select required label="转让给" value={form.targetOwnerId} onChange={(event) => updateForm({ targetOwnerId: event.target.value })}>
              {manageableUsers.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
            </TextField>
          )}
          {operation === 'set_progress' && (
            <TextField select required label="客户进展" value={form.lifecycleStatusCode} onChange={(event) => updateForm({ lifecycleStatusCode: event.target.value })}>
              {lifecycleConfigs.filter((config) => config.isActive && config.code !== 'public_pool').map((config) => (
                <MenuItem key={config.code} value={config.code}>{config.name}</MenuItem>
              ))}
            </TextField>
          )}
          {operation === 'update_tags' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <FormControl sx={{ minWidth: 120 }}>
                <InputLabel>操作方式</InputLabel>
                <Select label="操作方式" value={form.tagMode} onChange={(event) => updateForm({ tagMode: event.target.value as 'add' | 'remove' })}>
                  <MenuItem value="add">添加标签</MenuItem>
                  <MenuItem value="remove">移除标签</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>客户标签</InputLabel>
                <Select
                  multiple
                  label="客户标签"
                  value={form.tagIds}
                  onChange={(event) => updateForm({ tagIds: typeof event.target.value === 'string' ? event.target.value.split(',') : event.target.value })}
                  renderValue={(ids) => <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{ids.map((id) => <Chip key={id} size="small" label={tags.find((tag) => tag.id === id)?.name || id} />)}</Box>}
                >
                  {tags.map((tag) => <MenuItem key={tag.id} value={tag.id}>{tag.name}</MenuItem>)}
                </Select>
              </FormControl>
            </Stack>
          )}
          {operation === 'add_todo' && (
            <Stack spacing={1.5}>
              <TextField required label="待办标题" value={form.todoTitle} inputProps={{ maxLength: 120 }} onChange={(event) => updateForm({ todoTitle: event.target.value })} />
              <TextField label="待办内容" multiline minRows={2} value={form.todoContent} inputProps={{ maxLength: 2000 }} onChange={(event) => updateForm({ todoContent: event.target.value })} />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField required fullWidth type="datetime-local" label="提醒时间" InputLabelProps={{ shrink: true }} value={form.todoDueAt} onChange={(event) => updateForm({ todoDueAt: event.target.value })} />
                <TextField select fullWidth label="执行方式" value={form.todoExecutionMethod} onChange={(event) => updateForm({ todoExecutionMethod: event.target.value })}>
                  {executionMethods.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </TextField>
              </Stack>
            </Stack>
          )}
          {operation === 'soft_delete' && (
            <Alert severity="warning" icon={false}>
              删除后客户及其关联来源线索会一起进入业务回收站；存在订单、交付、售后等关联的客户会被阻止。请在下方输入“删除客户”。
            </Alert>
          )}
          <TextField
            required
            label="操作原因"
            multiline
            minRows={2}
            value={state.reason}
            inputProps={{ maxLength: 500 }}
            onChange={(event) => updateState({ reason: event.target.value })}
          />
          {operation === 'soft_delete' && (
            <TextField
              required
              label="高风险确认"
              placeholder="请输入：删除客户"
              value={state.deleteConfirmation}
              onChange={(event) => updateState({ deleteConfirmation: event.target.value })}
            />
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {state.precheck && (
            <Alert severity={presentation.blockedCount ? 'warning' : 'success'}>
              预检完成：可执行 {presentation.executableCount} 位，阻止 {presentation.blockedCount} 位，共核验 {presentation.totalCount} 位。任务将在后台执行。
            </Alert>
          )}
          {state.precheck && presentation.blockedCount > 0 && (
            <Box sx={{ maxHeight: 160, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 1, p: 1.25 }}>
              {state.precheck.itemResults.filter((item) => item.status === 'blocked').map((item) => (
                <Typography key={item.customerId} variant="caption" display="block" sx={{ color: '#b45309', py: 0.25 }}>
                  客户 {item.customerId}：{item.reason}
                </Typography>
              ))}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>取消</Button>
        <Button variant="outlined" onClick={() => void runPrecheck()} disabled={loading}>{loading ? '处理中…' : state.precheck ? '重新预检' : '开始预检'}</Button>
        <Button color={operation === 'soft_delete' ? 'error' : 'primary'} variant="contained" onClick={() => void createJob()} disabled={loading || !canSubmitBatchDialog(state)}>
          确认创建任务
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CustomerBatchActionDialog;
