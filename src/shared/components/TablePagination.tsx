import { Box, ButtonBase, IconButton, MenuItem, Select, TextField, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { MouseEvent, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import type { SxProps, Theme } from '@mui/material/styles';

type RowsPerPageOption = number | { label: ReactNode; value: number };

type TablePaginationProps = {
  component?: React.ElementType;
  count: number;
  page: number;
  rowsPerPage: number;
  rowsPerPageOptions?: RowsPerPageOption[];
  onPageChange: (event: MouseEvent<HTMLButtonElement> | null, page: number) => void;
  onRowsPerPageChange?: (event: any) => void;
  sx?: SxProps<Theme>;
  labelRowsPerPage?: ReactNode;
  labelDisplayedRows?: (paginationInfo: { from: number; to: number; count: number; page: number }) => ReactNode;
};

const getPageItems = (page: number, totalPages: number): Array<number | 'ellipsis'> => {
  if (totalPages <= 0) return [];
  if (totalPages <= 8) {
    return Array.from({ length: totalPages }, (_, index) => index);
  }

  const lastPage = totalPages - 1;
  if (page <= 4) {
    return [0, 1, 2, 3, 4, 'ellipsis', lastPage];
  }

  if (page >= lastPage - 3) {
    return [0, 'ellipsis', lastPage - 4, lastPage - 3, lastPage - 2, lastPage - 1, lastPage];
  }

  return [0, 'ellipsis', page - 1, page, page + 1, 'ellipsis', lastPage];
};

const normalizeOption = (option: RowsPerPageOption) =>
  typeof option === 'number' ? { value: option, label: `${option} 条/页` } : option;

export default function TablePagination({
  component = 'div',
  count,
  page,
  rowsPerPage,
  rowsPerPageOptions = [10, 20, 50, 100],
  onPageChange,
  onRowsPerPageChange,
  sx,
  labelDisplayedRows,
}: TablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(count / Math.max(rowsPerPage, 1)));
  const currentPage = Math.min(Math.max(page, 0), totalPages - 1);
  const pageItems = count > 0 ? getPageItems(currentPage, totalPages) : [];
  const options = rowsPerPageOptions.map(normalizeOption);
  const [jumpPage, setJumpPage] = useState('');

  useEffect(() => {
    setJumpPage('');
  }, [currentPage, rowsPerPage, count]);

  const handleJump = () => {
    const nextPage = Number(jumpPage);
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage > totalPages) {
      setJumpPage('');
      return;
    }
    onPageChange(null, nextPage - 1);
  };

  const from = count === 0 ? 0 : currentPage * rowsPerPage + 1;
  const to = Math.min(count, (currentPage + 1) * rowsPerPage);

  return (
    <Box className="JxTablePagination" component={component} sx={sx}>
      <Typography className="JxPaginationTotal" component="span">
        {labelDisplayedRows ? labelDisplayedRows({ from, to, count, page: currentPage }) : `共${count}条数据`}
      </Typography>

      <Box className="JxPaginationPages">
        <IconButton
          className="JxPaginationArrow"
          size="small"
          disabled={currentPage <= 0 || count === 0}
          onClick={(event) => onPageChange(event, currentPage - 1)}
          aria-label="上一页"
        >
          <ChevronLeftIcon fontSize="small" />
        </IconButton>

        {pageItems.map((item, index) => {
          if (item === 'ellipsis') {
            return (
              <Typography className="JxPaginationEllipsis" key={`ellipsis-${index}`} component="span">
                ...
              </Typography>
            );
          }

          const selected = item === currentPage;
          return (
            <ButtonBase
              key={item}
              className={selected ? 'JxPaginationPage is-active' : 'JxPaginationPage'}
              onClick={(event) => onPageChange(event, item)}
              aria-label={`第 ${item + 1} 页`}
              aria-current={selected ? 'page' : undefined}
            >
              {item + 1}
            </ButtonBase>
          );
        })}

        <IconButton
          className="JxPaginationArrow"
          size="small"
          disabled={currentPage >= totalPages - 1 || count === 0}
          onClick={(event) => onPageChange(event, currentPage + 1)}
          aria-label="下一页"
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Box>

      <Select
        className="JxPaginationRowsSelect"
        size="small"
        value={String(rowsPerPage)}
        onChange={(event) => onRowsPerPageChange?.({ target: { value: String(event.target.value) } })}
        renderValue={(value) => `${value} 条/页`}
        MenuProps={{
          variant: 'menu',
          anchorOrigin: { vertical: 'top', horizontal: 'right' },
          transformOrigin: { vertical: 'bottom', horizontal: 'right' },
          marginThreshold: 0,
          MenuListProps: {
            sx: {
              py: 0,
            },
          },
          PaperProps: {
            sx: {
              width: 92,
              minWidth: '92px !important',
              mb: 0.5,
              border: '1px solid #d7e0ea',
              borderRadius: '6px',
              boxShadow: '0 12px 28px rgba(16, 24, 40, 0.16)',
              overflow: 'hidden',
              '& .MuiMenuItem-root': {
                minHeight: 32,
                px: 1.25,
                fontSize: 12,
                fontWeight: 500,
                color: '#344054',
              },
              '& .MuiMenuItem-root.Mui-selected': {
                backgroundColor: '#eaf2ff',
              },
              '& .MuiMenuItem-root.Mui-selected:hover': {
                backgroundColor: '#e3efff',
              },
            },
          },
        }}
      >
        {options.map((option) => (
          <MenuItem key={option.value} value={String(option.value)}>
            {option.label}
          </MenuItem>
        ))}
      </Select>

      <Box className="JxPaginationJump">
        <Typography component="span">跳至</Typography>
        <TextField
          className="JxPaginationJumpInput"
          size="small"
          value={jumpPage}
          onChange={(event) => setJumpPage(event.target.value.replace(/\D/g, '').slice(0, 4))}
          onBlur={handleJump}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleJump();
            }
          }}
          inputProps={{ inputMode: 'numeric', 'aria-label': '跳转页码' }}
        />
        <Typography component="span">页</Typography>
      </Box>
    </Box>
  );
}
