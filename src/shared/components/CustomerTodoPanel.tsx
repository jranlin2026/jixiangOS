import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  Divider, IconButton, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import AssignmentTurnedInOutlinedIcon from '@mui/icons-material/AssignmentTurnedInOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import DialogCloseTitle from './DialogCloseTitle';
import { customerTodoApi } from '../../api/customerTodoApi';
import type { CustomerManageableUser } from '../../types/customer';
import type { CustomerTodo, CustomerTodoExecutionMethod, CustomerTodoInput } from '../../types/customerTodo';
import { canRunCustomerTodoAction } from '../../pages/Customers/customerDetailPolicy';
import { formatEmployeeNameWithPosition } from '../utils/formatters';

interface CustomerTodoPanelProps {
  customerId: string;
  customerName: string;
  ownerId?: string;
  users: CustomerManageableUser[];
  currentUserId?: string;
  canManageTodos?: boolean;
  readOnly?: boolean;
  onActivityChanged?: () => void | Promise<void>;
}

const methodOptions: Array<{ value: CustomerTodoExecutionMethod; label: string }> = [
  { value: 'none', label: '不限' },
  { value: 'phone', label: '电话' },
  { value: 'visit', label: '拜访' },
  { value: 'wechat', label: '微信' },
  { value: 'sms', label: '短信' },
  { value: 'email', label: '邮件' },
];

const methodLabel = (method: CustomerTodoExecutionMethod) => methodOptions.find((item) => item.value === method)?.label || '不限';
const dateTimeLocal = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const defaultDueAt = () => {
  const value = new Date();
  value.setHours(value.getHours() + 1, 0, 0, 0);
  return dateTimeLocal(value);
};
const displayTime = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));

const CustomerTodoPanel: React.FC<CustomerTodoPanelProps> = ({
  customerId, customerName, ownerId, users, currentUserId, canManageTodos = false, readOnly = false, onActivityChanged,
}) => {
  const [todos, setTodos] = useState<CustomerTodo[]>([]);
  const [statusTab, setStatusTab] = useState<'pending' | 'completed'>('pending');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<CustomerTodo | null>(null);
  const [cancelingTodo, setCancelingTodo] = useState<CustomerTodo | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [form, setForm] = useState<CustomerTodoInput>({
    title: '', content: '', dueAt: defaultDueAt(), executionMethod: 'none', assigneeId: '',
  });

  const loadTodos = useCallback(async () => {
    setLoading(true);
    const response = await customerTodoApi.list(customerId);
    if (response.code === 0) {
      setTodos(response.data || []);
      setError('');
    } else {
      setError(response.message || '待办加载失败');
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => { void loadTodos(); }, [loadTodos]);

  const pending = useMemo(() => todos.filter((item) => item.status === 'pending'), [todos]);
  const completed = useMemo(() => todos.filter((item) => item.status === 'completed'), [todos]);
  const visibleTodos = statusTab === 'pending' ? pending : completed;

  const openCreate = () => {
    if (readOnly || !canManageTodos) return;
    const defaultAssignee = users.find((user) => user.id === ownerId)?.id
      || users.find((user) => user.id === currentUserId)?.id
      || users[0]?.id || '';
    setEditingTodo(null);
    setForm({ title: '', content: '', dueAt: defaultDueAt(), executionMethod: 'none', assigneeId: defaultAssignee });
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (todo: CustomerTodo) => {
    if (!canRunCustomerTodoAction('edit', todo, currentUserId, canManageTodos, readOnly)) return;
    setEditingTodo(todo);
    setForm({
      title: todo.title, content: todo.content || '', dueAt: dateTimeLocal(new Date(todo.dueAt)),
      executionMethod: todo.executionMethod, assigneeId: todo.assigneeId,
    });
    setError('');
    setDialogOpen(true);
  };

  const refreshAfterMutation = async () => {
    await loadTodos();
    await onActivityChanged?.();
  };

  const handleSave = async () => {
    if (readOnly || !canManageTodos) return;
    if (!form.title.trim()) { setError('请输入待办标题'); return; }
    if (!form.assigneeId) { setError('请选择执行人'); return; }
    if (!form.dueAt || Number.isNaN(new Date(form.dueAt).getTime())) { setError('请选择有效的提醒时间'); return; }
    setSaving(true);
    const payload = { ...form, title: form.title.trim(), content: form.content?.trim(), dueAt: new Date(form.dueAt).toISOString() };
    const response = editingTodo
      ? await customerTodoApi.update(customerId, editingTodo.id, payload)
      : await customerTodoApi.create(customerId, payload);
    setSaving(false);
    if (response.code !== 0) { setError(response.message || '待办保存失败'); return; }
    setDialogOpen(false);
    await refreshAfterMutation();
  };

  const runAction = async (action: 'complete' | 'reopen' | 'cancel', todo: CustomerTodo, reason = '') => {
    if (!canRunCustomerTodoAction(action, todo, currentUserId, canManageTodos, readOnly)) return;
    setError('');
    const response = action === 'complete'
      ? await customerTodoApi.complete(customerId, todo.id)
      : action === 'reopen'
        ? await customerTodoApi.reopen(customerId, todo.id)
        : await customerTodoApi.cancel(customerId, todo.id, reason);
    if (response.code !== 0) { setError(response.message || '待办操作失败'); return; }
    if (action === 'cancel') {
      setCancelingTodo(null);
      setCancelReason('');
    }
    await refreshAfterMutation();
  };

  return (
    <Box sx={{ minHeight: 360 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
        <Tabs value={statusTab} onChange={(_, value) => setStatusTab(value)} sx={{ minHeight: 36 }}>
          <Tab value="pending" label={`未完成(${pending.length})`} sx={{ minHeight: 36, py: 0 }} />
          <Tab value="completed" label={`已完成(${completed.length})`} sx={{ minHeight: 36, py: 0 }} />
        </Tabs>
        {!readOnly && canManageTodos && (
          <Tooltip title="新建待办"><IconButton color="primary" onClick={openCreate} aria-label="新建待办"><AddIcon /></IconButton></Tooltip>
        )}
      </Stack>
      {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
      {loading ? (
        <Box sx={{ py: 8, textAlign: 'center' }}><CircularProgress size={28} /></Box>
      ) : visibleTodos.length === 0 ? (
        <Stack alignItems="center" spacing={1} sx={{ py: 8, color: '#94a3b8' }}>
          <AssignmentTurnedInOutlinedIcon sx={{ fontSize: 48 }} />
          <Typography variant="body2">暂无{statusTab === 'pending' ? '未完成' : '已完成'}待办</Typography>
        </Stack>
      ) : (
        <Stack divider={<Divider flexItem />}>
          {visibleTodos.map((todo) => {
            const overdue = todo.status === 'pending' && new Date(todo.dueAt).getTime() < Date.now();
            const canComplete = canRunCustomerTodoAction('complete', todo, currentUserId, canManageTodos, readOnly);
            const canReopen = canRunCustomerTodoAction('reopen', todo, currentUserId, canManageTodos, readOnly);
            const canEdit = canRunCustomerTodoAction('edit', todo, currentUserId, canManageTodos, readOnly);
            const canCancel = canRunCustomerTodoAction('cancel', todo, currentUserId, canManageTodos, readOnly);
            return (
              <Stack key={todo.id} direction="row" spacing={1} alignItems="flex-start" sx={{ py: 1.5 }}>
                <Checkbox
                  size="small" checked={todo.status === 'completed'} disabled={todo.status === 'completed' ? !canReopen : !canComplete}
                  onChange={() => void runAction(todo.status === 'completed' ? 'reopen' : 'complete', todo)}
                  inputProps={{ 'aria-label': todo.status === 'completed' ? '重新打开待办' : '完成待办' }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                    <Typography sx={{ fontWeight: 600, textDecoration: todo.status === 'completed' ? 'line-through' : 'none' }}>{todo.title}</Typography>
                    <Chip size="small" variant="outlined" label={methodLabel(todo.executionMethod)} />
                    {overdue && <Chip size="small" color="error" label="已逾期" />}
                  </Stack>
                  {todo.content && <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5, whiteSpace: 'pre-wrap' }}>{todo.content}</Typography>}
                  <Stack direction="row" spacing={2} sx={{ mt: 0.75, color: '#64748b' }}>
                    <Typography variant="caption">执行人：{todo.assigneeName}</Typography>
                    <Typography variant="caption" color={overdue ? 'error' : 'inherit'}>提醒时间：{displayTime(todo.dueAt)}</Typography>
                  </Stack>
                </Box>
                {(canEdit || canCancel) && todo.status === 'pending' && (
                  <Stack direction="row">
                    {canEdit && <Tooltip title="编辑"><IconButton size="small" onClick={() => openEdit(todo)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
                    {canCancel && <Tooltip title="取消待办"><IconButton size="small" color="error" onClick={() => { setCancelingTodo(todo); setCancelReason(''); }}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>}
                  </Stack>
                )}
                {canReopen && todo.status === 'completed' && (
                  <Tooltip title="重新打开"><IconButton size="small" onClick={() => void runAction('reopen', todo)}><ReplayIcon fontSize="small" /></IconButton></Tooltip>
                )}
              </Stack>
            );
          })}
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={() => !saving && setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogCloseTitle onClose={() => !saving && setDialogOpen(false)}>{editingTodo ? '编辑待办' : '新建待办'}</DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="待办标题" required value={form.title} inputProps={{ maxLength: 120 }} onChange={(event) => setForm({ ...form, title: event.target.value })} autoFocus />
            <TextField label="待办内容" multiline minRows={3} value={form.content || ''} inputProps={{ maxLength: 2000 }} onChange={(event) => setForm({ ...form, content: event.target.value })} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="提醒时间" type="datetime-local" required fullWidth value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} InputLabelProps={{ shrink: true }} />
              <TextField select label="执行方式" fullWidth value={form.executionMethod} onChange={(event) => setForm({ ...form, executionMethod: event.target.value as CustomerTodoExecutionMethod })}>
                {methodOptions.map((option) => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
              </TextField>
            </Stack>
            <TextField select label="执行人" required value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
              {users.map((user) => <MenuItem key={user.id} value={user.id}>{formatEmployeeNameWithPosition(user)}</MenuItem>)}
            </TextField>
            <TextField label="关联客户" value={customerName} disabled />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>取消</Button>
          <Button variant="contained" onClick={() => void handleSave()} disabled={saving}>{saving ? '保存中…' : editingTodo ? '保存' : '创建'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(cancelingTodo)} onClose={() => setCancelingTodo(null)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => setCancelingTodo(null)}>取消待办</DialogCloseTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 2 }}>取消后将从待办列表隐藏，并在客户动态中保留记录。</Typography>
          <TextField label="取消原因（选填）" fullWidth multiline minRows={2} value={cancelReason} inputProps={{ maxLength: 500 }} onChange={(event) => setCancelReason(event.target.value)} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelingTodo(null)}>返回</Button>
          <Button color="error" variant="contained" onClick={() => cancelingTodo && void runAction('cancel', cancelingTodo, cancelReason)}>确认取消</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CustomerTodoPanel;
