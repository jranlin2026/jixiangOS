import React, { useMemo, useState } from 'react';
import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, MenuItem, Paper, Stack,
  TextField, Typography,
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import type { Customer, CustomerOpportunityStageCode } from '../../types/customer';
import type { CustomerTodo } from '../../types/customerTodo';
import { formatCurrency, formatDate } from '../../shared/utils/formatters';
import {
  buildCustomerBattleSnapshot,
  CUSTOMER_OPPORTUNITY_STAGES,
} from '../../shared/utils/customerBattleState';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';

type Props = {
  customer: Customer;
  todos: CustomerTodo[];
  canSetProgress: boolean;
  canSetTodos: boolean;
  saving?: boolean;
  onSave: (stage: CustomerOpportunityStageCode, amount: number | null) => boolean | Promise<boolean>;
  onOpenTodos: () => void;
};

const riskColor = { low: 'success', medium: 'warning', high: 'error' } as const;

const CustomerBattleDecisionBar: React.FC<Props> = ({
  customer, todos, canSetProgress, canSetTodos, saving = false, onSave, onOpenTodos,
}) => {
  const snapshot = useMemo(() => buildCustomerBattleSnapshot(customer, todos), [customer, todos]);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<CustomerOpportunityStageCode>(snapshot.stage.code);
  const [amount, setAmount] = useState(snapshot.opportunityAmount == null ? '' : String(snapshot.opportunityAmount));

  const openEditor = () => {
    setStage(snapshot.stage.code);
    setAmount(snapshot.opportunityAmount == null ? '' : String(snapshot.opportunityAmount));
    setOpen(true);
  };

  const submit = async () => {
    const saved = await onSave(stage, amount.trim() === '' ? null : Number(amount));
    if (saved) setOpen(false);
  };

  const items = [
    { label: '销售阶段', value: snapshot.stage.label },
    { label: '预计金额', value: snapshot.opportunityAmount == null ? '待评估' : formatCurrency(snapshot.opportunityAmount) },
    {
      label: '最近有效联系',
      value: snapshot.lastEffectiveContact
        ? `${formatDate(snapshot.lastEffectiveContact.createdAt, 'MM-dd HH:mm')} · ${snapshot.contactGapDays}天前`
        : '暂无记录',
    },
    {
      label: '下一步动作',
      value: snapshot.nextAction
        ? `${snapshot.nextAction.title} · ${formatDate(snapshot.nextAction.dueAt, 'MM-dd HH:mm')}`
        : '尚未设置',
    },
    { label: '销售负责人', value: customer.owner || '未分配' },
  ];

  return (
    <>
      <Paper elevation={0} sx={{ mb: 2, p: 1.75, border: '1px solid #dbe7f5', borderRadius: 2, bgcolor: '#f8fbff' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
          <Box sx={{ minWidth: 145 }}>
            <Typography variant="overline" sx={{ color: '#64748b', fontWeight: 800 }}>客户作战状态</Typography>
            <Stack direction="row" spacing={0.75} alignItems="center">
              <Chip size="small" color={riskColor[snapshot.risk.level]} label={snapshot.risk.level === 'high' ? '高风险' : snapshot.risk.level === 'medium' ? '需关注' : '正常'} />
              <Typography variant="caption" sx={{ color: '#475569' }}>{snapshot.risk.reason}</Typography>
            </Stack>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, minmax(110px, 1fr))' }, gap: 1, flex: 1 }}>
            {items.map((item) => (
              <Box key={item.label} sx={{ minWidth: 0 }}>
                <Typography variant="caption" sx={{ color: '#94a3b8', display: 'block' }}>{item.label}</Typography>
                <Typography variant="body2" title={String(item.value)} sx={{ color: '#1e293b', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</Typography>
              </Box>
            ))}
          </Box>
          <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
            {canSetProgress && <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={openEditor}>设置状态</Button>}
            {canSetTodos && <Button size="small" variant="contained" startIcon={<TaskAltOutlinedIcon />} onClick={onOpenTodos}>推进任务</Button>}
          </Stack>
        </Stack>
      </Paper>

      <Dialog open={open} onClose={() => !saving && setOpen(false)} maxWidth="xs" fullWidth>
        <DialogCloseTitle onClose={() => !saving && setOpen(false)}>设置客户作战状态</DialogCloseTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField select label="销售阶段" value={stage} onChange={(event) => setStage(event.target.value as CustomerOpportunityStageCode)}>
              {CUSTOMER_OPPORTUNITY_STAGES.map((item) => <MenuItem key={item.code} value={item.code}>{item.label}</MenuItem>)}
            </TextField>
            <TextField label="预计成交金额" type="number" value={amount} inputProps={{ min: 0, step: 100 }} onChange={(event) => setAmount(event.target.value)} helperText="填写本轮机会的预计成交金额，不绑定固定产品价格" />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={saving} onClick={() => setOpen(false)}>取消</Button>
          <Button disabled={saving || (amount !== '' && (!Number.isFinite(Number(amount)) || Number(amount) < 0))} variant="contained" onClick={() => void submit()}>{saving ? '保存中…' : '保存'}</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default CustomerBattleDecisionBar;
