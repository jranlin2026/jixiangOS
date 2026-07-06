import { Box, ButtonBase, IconButton, TextField, Typography } from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import type { MouseEvent } from 'react';
import { useEffect, useState } from 'react';

type TablePaginationActionsProps = {
  count: number;
  page: number;
  rowsPerPage: number;
  onPageChange: (event: MouseEvent<HTMLButtonElement> | null, page: number) => void;
};

const getPageItems = (page: number, totalPages: number): Array<number | 'ellipsis'> => {
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

export default function TablePaginationActions({
  count,
  page,
  rowsPerPage,
  onPageChange,
}: TablePaginationActionsProps) {
  const totalPages = Math.max(1, Math.ceil(count / rowsPerPage));
  const pageItems = getPageItems(page, totalPages);
  const [jumpPage, setJumpPage] = useState('');

  useEffect(() => {
    setJumpPage('');
  }, [page, rowsPerPage, count]);

  const handleJump = () => {
    const nextPage = Number(jumpPage);
    if (!Number.isInteger(nextPage) || nextPage < 1 || nextPage > totalPages) {
      setJumpPage('');
      return;
    }
    onPageChange(null, nextPage - 1);
  };

  return (
    <Box className="JxPaginationActions">
      <Typography className="JxPaginationTotal" component="span">
        共{count}条数据
      </Typography>

      <Box className="JxPaginationPages">
        <IconButton
          className="JxPaginationArrow"
          size="small"
          disabled={page <= 0}
          onClick={(event) => onPageChange(event, page - 1)}
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

          const selected = item === page;
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
          disabled={page >= totalPages - 1}
          onClick={(event) => onPageChange(event, page + 1)}
          aria-label="下一页"
        >
          <ChevronRightIcon fontSize="small" />
        </IconButton>
      </Box>

      <Box className="JxPaginationRowsSlot" aria-hidden="true" />

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
