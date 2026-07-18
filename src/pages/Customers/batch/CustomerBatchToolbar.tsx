import React, { useState } from 'react';
import { Box, Button, Menu, MenuItem, Paper, Stack, Typography } from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import PlaylistAddCheckIcon from '@mui/icons-material/PlaylistAddCheck';
import type { CustomerBatchOperation } from '../../../types/customerBatch';
import type { CustomerBatchSelectionState } from '../../../shared/utils/customerBatchSelection';
import { CUSTOMER_BATCH_ACTION_LABELS } from './CustomerBatchActionDialog';

type Props = {
  selection: CustomerBatchSelectionState;
  availableActions: CustomerBatchOperation[];
  onChooseAction: (operation: CustomerBatchOperation) => void;
  onClear: () => void;
  onSelectFilterResult: () => void;
};

const CustomerBatchToolbar: React.FC<Props> = ({
  selection,
  availableActions,
  onChooseAction,
  onClear,
  onSelectFilterResult,
}) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const selectionText = selection.mode === 'filter_snapshot'
    ? '已选择当前筛选结果（数量以服务器预检为准）'
    : `已选择 ${selection.selectedIds.length} 位客户`;

  return (
    <Paper
      elevation={0}
      sx={{
        px: 2,
        py: 1.25,
        mb: 1.5,
        border: '1px solid #bfdbfe',
        bgcolor: '#eff6ff',
      }}
    >
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} alignItems={{ xs: 'stretch', sm: 'center' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
          <PlaylistAddCheckIcon color="primary" fontSize="small" />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{selectionText}</Typography>
        </Stack>
        {selection.mode === 'ids' && (
          <Button size="small" onClick={onSelectFilterResult}>选择当前筛选结果全部客户</Button>
        )}
        <Button
          size="small"
          variant="contained"
          endIcon={<KeyboardArrowDownIcon />}
          disabled={!availableActions.length}
          onClick={(event) => setAnchor(event.currentTarget)}
        >
          批量操作
        </Button>
        <Button size="small" color="inherit" onClick={onClear}>取消选择</Button>
      </Stack>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {availableActions.map((operation) => (
          <MenuItem
            key={operation}
            onClick={() => {
              setAnchor(null);
              onChooseAction(operation);
            }}
            sx={operation === 'soft_delete' ? { color: 'error.main' } : undefined}
          >
            {CUSTOMER_BATCH_ACTION_LABELS[operation]}
          </MenuItem>
        ))}
      </Menu>
    </Paper>
  );
};

export default CustomerBatchToolbar;
