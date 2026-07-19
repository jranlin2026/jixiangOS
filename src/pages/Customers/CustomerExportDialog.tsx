import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import DialogCloseTitle from '../../shared/components/DialogCloseTitle';
import { createCustomerExportWorkbook, customerDataExchangeApi } from '../../api/customerDataExchangeApi';
import type { CustomerExportSelection } from '../../types/customerDataExchange';

type Props = {
  open: boolean;
  selectedSelection: CustomerExportSelection | null;
  filterSelection: CustomerExportSelection;
  canExportSensitive: boolean;
  onClose: () => void;
};

function downloadBuffer(fileName: string, buffer: ArrayBuffer): void {
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function CustomerExportDialog({ open, selectedSelection, filterSelection, canExportSensitive, onClose }: Props) {
  const [scope, setScope] = useState<'selected' | 'filtered'>('filtered');
  const [includeSensitive, setIncludeSensitive] = useState(false);
  const [reason, setReason] = useState('客户资料备份');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const selectedCount = selectedSelection?.mode === 'ids' ? selectedSelection.customerIds.length : -1;

  useEffect(() => {
    if (!open) return;
    setScope(selectedSelection ? 'selected' : 'filtered');
    setIncludeSensitive(false);
    setReason('客户资料备份');
    setError('');
  }, [open, selectedSelection?.mode, selectedCount]);

  const handleExport = async () => {
    setBusy(true);
    setError('');
    try {
      const selection: CustomerExportSelection = scope === 'selected'
        ? selectedSelection || filterSelection
        : filterSelection;
      const response = await customerDataExchangeApi.exportCustomers({ selection, includeSensitive, reason });
      if (response.code !== 0 || !response.data) throw new Error(response.message || '客户导出失败');
      downloadBuffer(response.data.fileName, await createCustomerExportWorkbook(response.data.rows));
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '客户导出失败');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogCloseTitle onClose={() => { if (!busy) onClose(); }}>批量导出客户</DialogCloseTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">导出范围始终受当前账号的数据范围控制，导出动作会写入客户审计记录。</Alert>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <RadioGroup value={scope} onChange={(event) => setScope(event.target.value as 'selected' | 'filtered')}>
            <FormControlLabel
              value="selected"
              disabled={!selectedSelection}
              control={<Radio />}
              label={selectedSelection?.mode === 'filter_snapshot'
                ? '已选择的筛选结果（数量以服务器为准）'
                : `已跨页选择的客户（${selectedSelection?.customerIds.length || 0} 条）`}
            />
            <FormControlLabel value="filtered" control={<Radio />} label="当前筛选结果全部客户" />
          </RadioGroup>
          <FormControlLabel
            control={<Checkbox checked={includeSensitive} onChange={(event) => setIncludeSensitive(event.target.checked)} disabled={!canExportSensitive} />}
            label="包含手机号和微信"
          />
          {!canExportSensitive ? <Typography variant="caption" color="text.secondary">当前角色没有“导出客户敏感字段”权限，文件不会包含手机号和微信。</Typography> : null}
          <TextField label="导出原因 *" value={reason} onChange={(event) => setReason(event.target.value)} multiline minRows={2} inputProps={{ maxLength: 500 }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>取消</Button>
        <Button variant="contained" onClick={() => void handleExport()} disabled={busy || !reason.trim() || (scope === 'selected' && !selectedSelection)}>
          {busy ? '正在生成…' : '生成导出文件'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
