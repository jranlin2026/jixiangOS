import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
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
import type { BusinessExportColumnMode, BusinessExportResult } from '../../types/businessExport';
import { downloadBusinessExportWorkbook } from '../../api/businessExportWorkbook';
import DialogCloseTitle from './DialogCloseTitle';
import { BUSINESS_EXPORT_MAX_ROWS, getBusinessExportDisabledReason } from './businessExportDialogModel';

export type BusinessExportDialogRequest = {
  columnMode: BusinessExportColumnMode;
  reason: string;
};

type Props = {
  open: boolean;
  title: string;
  expectedCount: number;
  currentColumnCount?: number;
  enableStandardMode?: boolean;
  onClose: () => void;
  onRequestExport: (request: BusinessExportDialogRequest) => Promise<BusinessExportResult>;
};

export default function BusinessExportDialog({
  open,
  title,
  expectedCount,
  currentColumnCount,
  enableStandardMode = false,
  onClose,
  onRequestExport,
}: Props) {
  const [columnMode, setColumnMode] = useState<BusinessExportColumnMode>(enableStandardMode ? 'standard' : 'current_view');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setColumnMode(enableStandardMode ? 'standard' : 'current_view');
    setReason('');
    setBusy(false);
    setError('');
  }, [enableStandardMode, open]);

  const disabledReason = getBusinessExportDisabledReason({ expectedCount, reason, busy });
  const countOutOfRange = expectedCount <= 0 || expectedCount > BUSINESS_EXPORT_MAX_ROWS;

  const handleExport = async () => {
    if (busy) return;
    const validationMessage = getBusinessExportDisabledReason({ expectedCount, reason });
    if (validationMessage) {
      setError(validationMessage);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await onRequestExport({ columnMode, reason: reason.trim() });
      await downloadBusinessExportWorkbook(result);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '业务数据导出失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogCloseTitle onClose={() => { if (!busy) onClose(); }}>{title}</DialogCloseTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info">
            将导出当前筛选条件下的全部跨页结果，并严格受当前账号数据范围控制。导出动作会写入审计记录。
          </Alert>
          {error ? <Alert severity="error">{error}</Alert> : null}
          {countOutOfRange ? <Alert severity="warning">{getBusinessExportDisabledReason({ expectedCount, reason: '已填写' })}</Alert> : null}

          <Stack direction="row" justifyContent="space-between" alignItems="baseline">
            <Typography fontWeight={600}>导出数量</Typography>
            <Typography color={countOutOfRange ? 'warning.main' : 'text.primary'}>
              预计导出 {expectedCount.toLocaleString('zh-CN')} 条
            </Typography>
          </Stack>

          <RadioGroup
            value={columnMode}
            onChange={(event) => setColumnMode(event.target.value as BusinessExportColumnMode)}
          >
            {enableStandardMode ? (
              <FormControlLabel value="standard" control={<Radio />} label="标准业务字段（推荐）" />
            ) : null}
            <FormControlLabel
              value="current_view"
              control={<Radio />}
              label={`当前视图字段及顺序${currentColumnCount === undefined ? '' : `（${currentColumnCount} 个字段）`}`}
            />
            <FormControlLabel value="all" control={<Radio />} label="全部可导出字段" />
          </RadioGroup>

          <Typography variant="caption" color="text.secondary">
            汇总表按上述字段模式生成；付款或人员分账明细表始终保留完整核账字段。
          </Typography>

          <TextField
            label="导出原因 *"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            multiline
            minRows={2}
            inputProps={{ maxLength: 500 }}
            helperText={`${reason.length}/500`}
            required
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>取消</Button>
        <Button
          variant="contained"
          onClick={() => void handleExport()}
          disabled={Boolean(disabledReason)}
        >
          {busy ? '正在生成…' : '生成并下载 Excel'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
