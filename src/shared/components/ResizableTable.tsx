import React from 'react';
import { Box, TableCell, type SxProps, type TableCellProps, type Theme } from '@mui/material';

export type ColumnWidthMap = Record<string, number>;

const MIN_COLUMN_WIDTH = 96;
const MAX_COLUMN_WIDTH = 520;
const AUTO_TABLE_WIDTH_STORAGE_PREFIX = 'aaos_auto_table_column_widths_v1';

export const clampColumnWidth = (width: number, min = MIN_COLUMN_WIDTH, max = MAX_COLUMN_WIDTH) => (
  Math.min(Math.max(Math.round(width), min), max)
);

export const readColumnWidths = (storageKey: string, defaultWidths: ColumnWidthMap): ColumnWidthMap => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { ...defaultWidths };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...defaultWidths };

    return Object.fromEntries(
      Object.entries(defaultWidths).map(([id, defaultWidth]) => {
        const storedWidth = parsed[id];
        return [
          id,
          typeof storedWidth === 'number'
            ? clampColumnWidth(storedWidth)
            : clampColumnWidth(defaultWidth),
        ];
      }),
    );
  } catch {
    return { ...defaultWidths };
  }
};

export const writeColumnWidths = (storageKey: string, widths: ColumnWidthMap) => {
  localStorage.setItem(storageKey, JSON.stringify(widths));
};

export const resizeColumnWidths = (widths: ColumnWidthMap, columnId: string, delta: number): ColumnWidthMap => ({
  ...widths,
  [columnId]: clampColumnWidth((widths[columnId] ?? MIN_COLUMN_WIDTH) + delta),
});

export const resetColumnWidths = (defaultWidths: ColumnWidthMap): ColumnWidthMap => ({ ...defaultWidths });

export const createAutoTableStorageKey = (pathname: string, tableIndex: number) => (
  `${AUTO_TABLE_WIDTH_STORAGE_PREFIX}:${pathname || '/'}:${tableIndex}`
);

export const getAutoColumnId = (headerText: string, columnIndex: number) => {
  const cleaned = headerText.replace(/\s*列宽调整\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ');
  if (parts.length === 2 && parts[0] === parts[1]) return parts[0];
  return cleaned || `column-${columnIndex}`;
};

export const getResizableCellSx = (width?: number): SxProps<Theme> => ({
  width,
  minWidth: width,
  maxWidth: width,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

type ResizableHeaderCellProps = TableCellProps & {
  columnId: string;
  width: number;
  onResize: (columnId: string, delta: number) => void;
  children: React.ReactNode;
};

const ResizableHeaderCell: React.FC<ResizableHeaderCellProps> = ({
  columnId,
  width,
  onResize,
  children,
  sx,
  ...props
}) => {
  const startXRef = React.useRef(0);
  const lastDeltaRef = React.useRef(0);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    startXRef.current = event.clientX;
    lastDeltaRef.current = 0;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const totalDelta = moveEvent.clientX - startXRef.current;
      const delta = totalDelta - lastDeltaRef.current;
      lastDeltaRef.current = totalDelta;
      if (delta !== 0) {
        onResize(columnId, delta);
      }
    };

    const handleMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      lastDeltaRef.current = 0;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <TableCell
      {...props}
      sx={[
        getResizableCellSx(width),
        {
          position: 'relative',
          pr: 2.5,
          userSelect: 'none',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      <Box component="span" sx={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {children}
      </Box>
      <Box
        aria-label={`${typeof children === 'string' ? children : columnId}列宽调整`}
        role="separator"
        onMouseDown={handleMouseDown}
        sx={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 8,
          height: '100%',
          cursor: 'col-resize',
          touchAction: 'none',
          '&::after': {
            content: '""',
            position: 'absolute',
            top: 8,
            bottom: 8,
            left: '50%',
            borderLeft: '1px solid #d8dee8',
            transform: 'translateX(-50%)',
          },
          '&:hover::after': {
            borderLeft: '2px solid #1976d2',
          },
        }}
      />
    </TableCell>
  );
};

export default ResizableHeaderCell;
