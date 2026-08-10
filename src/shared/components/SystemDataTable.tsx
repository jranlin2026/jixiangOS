import React from 'react';
import Table, { type TableProps } from '@mui/material/Table';
import { useLocation } from 'react-router-dom';
import { enhanceTable } from './GlobalTableColumnResizer';

const systemDataTableSx = {
  '& .MuiTableCell-root': {
    borderColor: '#E8EDF4',
    py: 1.1,
    px: 1.5,
    fontSize: 13,
    color: '#17233D',
    whiteSpace: 'nowrap',
  },
  '& .MuiTableHead-root .MuiTableCell-root': {
    bgcolor: '#F8FAFD',
    color: '#5C6A82',
    fontWeight: 800,
  },
};

type SystemDataTableProps = TableProps & {
  tableId: string;
};

/**
 * Shared JixiangOS data-table surface.
 *
 * `tableId` gives the global column resizer a stable identity so each table
 * keeps its own user-adjusted widths even when sibling tables mount/unmount.
 */
const SystemDataTable: React.FC<SystemDataTableProps> = ({
  tableId,
  size = 'small',
  sx,
  ...props
}) => {
  const location = useLocation();
  const tableRef = React.useRef<HTMLTableElement | null>(null);

  React.useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return undefined;

    const enhance = () => enhanceTable(table, location.pathname, 0);
    enhance();

    // Async rows and pagination may replace tbody cells after the initial
    // render. Reapply the saved widths within this table without depending on
    // the page-wide observer's timing.
    const observer = new MutationObserver(enhance);
    observer.observe(table, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [location.pathname, tableId]);

  return (
    <Table
      {...props}
      ref={tableRef}
      data-system-table-id={tableId}
      size={size}
      sx={[
        systemDataTableSx,
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
};

export default SystemDataTable;
