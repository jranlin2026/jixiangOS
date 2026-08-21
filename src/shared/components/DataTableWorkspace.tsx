import React from 'react';
import {
  Box,
  ButtonBase,
  Paper,
  TableContainer,
  Typography,
  type BoxProps,
  type PaperProps,
  type TableContainerProps,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import { moduleRadius, moduleTokens } from './ModuleShell';
import {
  DATA_TABLE_METRICS,
  DATA_TABLE_TOKENS,
} from './dataTableStandards';

/**
 * Shared density contract for desktop business tables.
 *
 * Keep text rows and rows containing selection controls at the same height so
 * sibling list tabs do not appear to use different table systems.
 */
export const dataTableStandardSx = {
  '& .MuiTable-root': {
    width: '100%',
  },
  '& .MuiTableCell-root': {
    boxSizing: 'border-box',
    height: DATA_TABLE_METRICS.rowHeight,
    py: '8px',
    px: '14px',
    color: DATA_TABLE_TOKENS.ink,
    fontSize: DATA_TABLE_METRICS.bodyFontSize,
    lineHeight: 1.5,
  },
  '& .MuiTableHead-root .MuiTableCell-root': {
    height: DATA_TABLE_METRICS.headerHeight,
    py: '6px',
    bgcolor: DATA_TABLE_TOKENS.headBackground,
    color: DATA_TABLE_TOKENS.muted,
    fontSize: DATA_TABLE_METRICS.headerFontSize,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  '& .MuiTableBody-root .MuiTableRow-root': {
    height: DATA_TABLE_METRICS.rowHeight,
  },
  '& .MuiTableRow-hover:hover': {
    bgcolor: DATA_TABLE_TOKENS.rowHover,
  },
  '& .MuiTableBody-root .MuiButton-text': {
    color: DATA_TABLE_TOKENS.link,
    fontSize: DATA_TABLE_METRICS.bodyFontSize,
    fontWeight: 700,
    '&:hover': {
      color: DATA_TABLE_TOKENS.linkHover,
      bgcolor: 'transparent',
      textDecoration: 'underline',
    },
  },
  '& .MuiTableBody-root .MuiIconButton-colorPrimary': {
    color: DATA_TABLE_TOKENS.action,
    '&:hover': {
      color: DATA_TABLE_TOKENS.link,
      bgcolor: '#EFF6FF',
    },
  },
  '& .MuiCheckbox-root': {
    p: 0,
  },
  '& .MuiCheckbox-root .MuiSvgIcon-root': {
    fontSize: 20,
  },
} satisfies SxProps<Theme>;

export interface DataTableLinkProps {
  children: React.ReactNode;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  title?: string;
}

/** Business-data link. Purple remains reserved for brand and primary actions. */
export const DataTableLink: React.FC<DataTableLinkProps> = ({ children, onClick, title }) => (
  <ButtonBase
    onClick={onClick}
    title={title}
    disableRipple
    sx={{
      minWidth: 0,
      maxWidth: '100%',
      justifyContent: 'flex-start',
      color: DATA_TABLE_TOKENS.link,
      fontSize: DATA_TABLE_METRICS.bodyFontSize,
      fontWeight: 700,
      lineHeight: 1.5,
      textAlign: 'left',
      '&:hover': { color: DATA_TABLE_TOKENS.linkHover, textDecoration: 'underline' },
      '&:focus-visible': { outline: `2px solid ${DATA_TABLE_TOKENS.link}`, outlineOffset: 2 },
    }}
  >
    {children}
  </ButtonBase>
);

export interface DataTableEmptyStateProps {
  label: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Keeps empty result pages the same width and visual weight as populated tables. */
export const DataTableEmptyState: React.FC<DataTableEmptyStateProps> = ({ label, actionLabel, onAction }) => (
  <Box
    data-table-empty-state="true"
    sx={{
      minHeight: DATA_TABLE_METRICS.emptyMinHeight,
      width: '100%',
      display: 'grid',
      placeContent: 'center',
      justifyItems: 'center',
      gap: 1.25,
      px: 3,
      color: DATA_TABLE_TOKENS.muted,
      textAlign: 'center',
    }}
  >
    <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{label}</Typography>
    {actionLabel && onAction && (
      <ButtonBase
        onClick={onAction}
        sx={{ color: DATA_TABLE_TOKENS.link, fontSize: 13, fontWeight: 800, '&:hover': { color: DATA_TABLE_TOKENS.linkHover } }}
      >
        {actionLabel}
      </ButtonBase>
    )}
  </Box>
);

/** Shared frozen-cell contract for selection/key/action columns. */
export const getDataTablePinnedColumnSx = (
  side: 'left' | 'right',
  header = false,
  offset = 0,
): SxProps<Theme> => ({
  position: 'sticky',
  [side]: offset,
  zIndex: header ? 7 : 4,
  bgcolor: header ? DATA_TABLE_TOKENS.headBackground : moduleTokens.surface,
  boxShadow: side === 'left' ? `1px 0 0 ${moduleTokens.line}` : `-1px 0 0 ${moduleTokens.line}`,
});

/**
 * Standard shell for growing business lists.
 *
 * The shell owns the available height. Only the desktop table or mobile card
 * area scrolls; filters stay above it and pagination remains visible below it.
 */
export const DataTableWorkspace: React.FC<PaperProps> = ({ children, sx, ...props }) => (
  <Paper
    data-table-workspace="true"
    elevation={0}
    sx={{
      flex: { xs: '0 0 auto', md: 1 },
      minWidth: 0,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      overflow: { xs: 'visible', md: 'hidden' },
      bgcolor: moduleTokens.surface,
      border: `1px solid ${moduleTokens.line}`,
      borderRadius: moduleRadius,
      boxShadow: '0 14px 40px rgba(73, 50, 120, 0.05)',
      ...sx,
    }}
    {...props}
  >
    {children}
  </Paper>
);

export const DataTableDesktopScroller: React.FC<TableContainerProps> = ({ children, sx, onScroll, ...props }) => {
  const scrollAreaRef = React.useRef<HTMLDivElement | null>(null);
  const [hasMoreBelow, setHasMoreBelow] = React.useState(false);

  const updateScrollHint = React.useCallback(() => {
    const element = scrollAreaRef.current;
    if (!element) return;
    setHasMoreBelow(element.scrollTop + element.clientHeight < element.scrollHeight - 2);
  }, []);

  React.useEffect(() => {
    const element = scrollAreaRef.current;
    if (!element) return undefined;
    const frame = window.requestAnimationFrame(updateScrollHint);
    const observer = new ResizeObserver(updateScrollHint);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [children, updateScrollHint]);

  return (
    <Box
      sx={{
        position: 'relative',
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: { xs: 'none', md: 'block' },
      }}
    >
      <TableContainer
        ref={scrollAreaRef}
        data-table-scroll-area="desktop"
        tabIndex={0}
        aria-label="数据表格，可上下左右滚动"
        onScroll={(event) => {
          updateScrollHint();
          onScroll?.(event);
        }}
        sx={{
          width: '100%',
          height: '100%',
          minWidth: 0,
          minHeight: 0,
          scrollbarGutter: 'stable',
          scrollbarWidth: 'thin',
          scrollbarColor: '#8B6FE8 #F1EDF9',
          '&::-webkit-scrollbar': {
            width: 8,
            height: 8,
          },
          '&::-webkit-scrollbar-track': {
            bgcolor: '#F1EDF9',
          },
          '&::-webkit-scrollbar-thumb': {
            bgcolor: '#8B6FE8',
            borderRadius: 999,
            border: '2px solid #F1EDF9',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            bgcolor: moduleTokens.blue,
          },
          '@media (forced-colors: active)': {
            scrollbarColor: 'auto',
            '&::-webkit-scrollbar-track, &::-webkit-scrollbar-thumb': {
              forcedColorAdjust: 'auto',
            },
          },
          '&:focus-visible': {
            outline: `2px solid ${moduleTokens.blue}`,
            outlineOffset: -2,
          },
          borderRadius: 0,
          ...dataTableStandardSx,
          ...sx,
          // Scrolling and responsive visibility are workspace invariants. Page
          // styles may decorate the surface but cannot disable data access.
          overflow: 'auto',
          display: { xs: 'none', md: 'block' },
        }}
        {...props}
      >
        {children}
      </TableContainer>
      {hasMoreBelow && (
        <Box
          data-table-scroll-hint="true"
          aria-hidden="true"
          sx={{
            position: 'absolute',
            left: '50%',
            bottom: 10,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
            px: 1.25,
            py: 0.5,
            border: '1px solid #DDD3F7',
            borderRadius: 999,
            bgcolor: 'rgba(255,255,255,0.94)',
            color: '#695A8D',
            boxShadow: '0 6px 18px rgba(73, 50, 120, 0.12)',
            fontSize: 12,
            fontWeight: 700,
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
          }}
        >
          向下滚动查看本页剩余数据
        </Box>
      )}
    </Box>
  );
};

export const DataTableMobileScroller: React.FC<BoxProps> = ({ children, sx, ...props }) => (
  <Box
    data-table-scroll-area="mobile"
    sx={{
      flex: '0 0 auto',
      minHeight: 0,
      overflowY: 'visible',
      alignContent: 'start',
      gap: 1.25,
      p: 1.5,
      bgcolor: '#FAF9FD',
      ...sx,
      display: { xs: 'grid', md: 'none' },
    }}
    {...props}
  >
    {children}
  </Box>
);

export const DataTableWorkspaceFooter: React.FC<BoxProps> = ({ children, sx, ...props }) => (
  <Box
    data-table-workspace-footer="true"
    sx={{
      flexShrink: 0,
      minWidth: 0,
      bgcolor: moduleTokens.surface,
      borderTop: `1px solid ${moduleTokens.line}`,
      ...sx,
    }}
    {...props}
  >
    {children}
  </Box>
);

export default DataTableWorkspace;
