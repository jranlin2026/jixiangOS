import React, { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import DialogCloseTitle from './DialogCloseTitle';

export type TableViewColumnConfig = {
  id: string;
  label: string;
};

type TableViewSettingsDialogProps = {
  open: boolean;
  title: string;
  description: string;
  columns: TableViewColumnConfig[];
  visibleColumnIds: string[];
  columnOrder: string[];
  frozenColumnCount: number;
  maxFrozenColumnCount: number;
  onClose: () => void;
  onToggleColumn: (columnId: string) => void;
  onReorderColumn: (sourceColumnId: string, targetColumnId: string) => void;
  onFrozenColumnCountChange: (value: number) => void;
  onReset: () => void;
};

const TableViewSettingsDialog: React.FC<TableViewSettingsDialogProps> = ({
  open,
  title,
  description,
  columns,
  visibleColumnIds,
  columnOrder,
  frozenColumnCount,
  maxFrozenColumnCount,
  onClose,
  onToggleColumn,
  onReorderColumn,
  onFrozenColumnCountChange,
  onReset,
}) => {
  const [draggedColumnId, setDraggedColumnId] = useState<string | null>(null);
  const [dragOverColumnId, setDragOverColumnId] = useState<string | null>(null);

  const orderedColumns = useMemo(() => {
    const columnMap = new Map(columns.map((column) => [column.id, column]));
    const ordered = columnOrder
      .map((columnId) => columnMap.get(columnId))
      .filter((column): column is TableViewColumnConfig => Boolean(column));
    const missing = columns.filter((column) => !columnOrder.includes(column.id));
    return [...ordered, ...missing];
  }, [columns, columnOrder]);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, columnId: string) => {
    setDraggedColumnId(columnId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', columnId);

    const row = event.currentTarget.closest('[data-table-view-column-row="true"]');
    if (!row) return;

    const preview = row.cloneNode(true) as HTMLElement;
    const rect = (row as HTMLElement).getBoundingClientRect();
    preview.style.position = 'fixed';
    preview.style.top = '-1000px';
    preview.style.left = '-1000px';
    preview.style.width = `${rect.width}px`;
    preview.style.height = `${rect.height}px`;
    preview.style.pointerEvents = 'none';
    preview.style.boxShadow = '0 16px 36px rgba(15, 23, 42, 0.18)';
    preview.style.borderRadius = '10px';
    preview.style.background = '#fff';
    preview.style.opacity = '0.96';
    document.body.appendChild(preview);
    event.dataTransfer.setDragImage(preview, 28, rect.height / 2);
    window.setTimeout(() => preview.remove(), 0);
  };

  const handleDragEnd = () => {
    setDraggedColumnId(null);
    setDragOverColumnId(null);
  };

  const maxFrozen = Math.max(0, maxFrozenColumnCount);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogCloseTitle onClose={onClose}>{title}</DialogCloseTitle>
      <DialogContent dividers sx={{ px: 3, py: 2.5 }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {description}
        </Typography>
        <TextField
          label="固定前 N 列"
          type="number"
          value={frozenColumnCount}
          onChange={(event) => {
            const rawValue = Number(event.target.value);
            const nextValue = Number.isFinite(rawValue) ? rawValue : 0;
            onFrozenColumnCountChange(Math.max(0, Math.min(maxFrozen, nextValue)));
          }}
          inputProps={{ min: 0, max: maxFrozen }}
          helperText="横向滚动时，前 N 个已显示字段会固定在左侧。"
          fullWidth
          sx={{ mb: 2 }}
        />
        <Box sx={{ border: '1px solid #e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
          {orderedColumns.map((column) => {
            const checked = visibleColumnIds.includes(column.id);
            const onlyVisible = checked && visibleColumnIds.length <= 1;
            const isDragged = draggedColumnId === column.id;
            const isDragTarget = dragOverColumnId === column.id && draggedColumnId !== column.id;

            return (
              <Box
                key={column.id}
                data-table-view-column-row="true"
                onDragOver={(event) => {
                  if (!draggedColumnId || draggedColumnId === column.id) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDragOverColumnId(column.id);
                }}
                onDragLeave={() => {
                  if (dragOverColumnId === column.id) setDragOverColumnId(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceColumnId = event.dataTransfer.getData('text/plain') || draggedColumnId;
                  if (sourceColumnId && sourceColumnId !== column.id) {
                    onReorderColumn(sourceColumnId, column.id);
                  }
                  handleDragEnd();
                }}
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '36px 44px 1fr',
                  alignItems: 'center',
                  minHeight: 56,
                  borderBottom: '1px solid #edf0f5',
                  bgcolor: isDragTarget ? '#eff6ff' : '#fff',
                  outline: isDragTarget ? '1px solid #2d8cf0' : 'none',
                  opacity: isDragged ? 0.42 : 1,
                  transition: 'background-color 0.16s ease, opacity 0.16s ease, outline-color 0.16s ease',
                  '&:last-of-type': { borderBottom: 0 },
                }}
              >
                <Tooltip title="按住拖动排序">
                  <Box
                    draggable
                    onDragStart={(event) => handleDragStart(event, column.id)}
                    onDragEnd={handleDragEnd}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: '100%',
                      color: '#cbd5e1',
                      cursor: 'grab',
                      '&:active': { cursor: 'grabbing' },
                      '&:hover': { color: '#64748b' },
                    }}
                  >
                    <DragIndicatorIcon fontSize="small" />
                  </Box>
                </Tooltip>
                <Checkbox checked={checked} disabled={onlyVisible} onChange={() => onToggleColumn(column.id)} />
                <Typography variant="body1" sx={{ color: '#172033' }}>
                  {column.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onReset}>恢复默认</Button>
      </DialogActions>
    </Dialog>
  );
};

export default TableViewSettingsDialog;
