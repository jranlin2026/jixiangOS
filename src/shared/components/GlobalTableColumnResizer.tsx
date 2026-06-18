import React from 'react';
import { useLocation } from 'react-router-dom';
import { clampColumnWidth, createAutoTableStorageKey, getAutoColumnId } from './ResizableTable';

type WidthStore = Record<string, number>;

const HANDLE_CLASS = 'aaos-auto-column-resize-handle';

const readWidths = (storageKey: string): WidthStore => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => typeof value === 'number'),
    ) as WidthStore;
  } catch {
    return {};
  }
};

const writeWidths = (storageKey: string, widths: WidthStore) => {
  localStorage.setItem(storageKey, JSON.stringify(widths));
};

const getTableCellsAtIndex = (table: HTMLTableElement, columnIndex: number) => (
  Array.from(table.querySelectorAll('tr'))
    .map((row) => row.children.item(columnIndex))
    .filter((cell): cell is HTMLTableCellElement => cell instanceof HTMLTableCellElement)
);

const applyColumnWidth = (table: HTMLTableElement, columnIndex: number, width: number) => {
  getTableCellsAtIndex(table, columnIndex).forEach((cell) => {
    cell.style.width = `${width}px`;
    cell.style.minWidth = `${width}px`;
    cell.style.maxWidth = `${width}px`;
    cell.style.overflow = 'hidden';
    cell.style.textOverflow = 'ellipsis';
    cell.style.whiteSpace = 'nowrap';
  });
};

const updateTableMinWidth = (table: HTMLTableElement) => {
  const headers = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[];
  const width = headers.reduce((sum, header) => sum + Math.round(header.getBoundingClientRect().width), 0);
  if (width > 0) table.style.minWidth = `${width}px`;
};

const enhanceTable = (table: HTMLTableElement, pathname: string, tableIndex: number) => {
  const headers = Array.from(table.querySelectorAll('thead th')) as HTMLTableCellElement[];
  if (!headers.length) return;
  const separators = headers.flatMap((header) => Array.from(header.querySelectorAll('[role="separator"]')));
  const hasManualResizableHeader = separators.some((separator) => !separator.classList.contains(HANDLE_CLASS));
  if (hasManualResizableHeader) return;

  const storageKey = createAutoTableStorageKey(pathname, tableIndex);
  const widths = readWidths(storageKey);

  table.style.tableLayout = 'fixed';
  const container = table.closest('.MuiTableContainer-root') as HTMLElement | null;
  if (container) container.style.overflowX = 'auto';

  headers.forEach((header, columnIndex) => {
    if (header.querySelector('[role="separator"]')) return;
    if (header.colSpan > 1) return;

    const columnId = getAutoColumnId(header.textContent || '', columnIndex);
    if (columnId === '操作' || columnId === `column-${columnIndex}`) return;
    const currentWidth = Math.round(header.getBoundingClientRect().width);
    const width = clampColumnWidth(widths[columnId] ?? (currentWidth || 140));
    widths[columnId] = width;
    applyColumnWidth(table, columnIndex, width);

    header.style.position = 'relative';
    header.style.paddingRight = '20px';
    header.style.userSelect = 'none';

    const handle = document.createElement('span');
    handle.className = HANDLE_CLASS;
    handle.setAttribute('role', 'separator');
    handle.setAttribute('aria-label', `${columnId}列宽调整`);
    Object.assign(handle.style, {
      position: 'absolute',
      top: '0',
      right: '0',
      width: '8px',
      height: '100%',
      cursor: 'col-resize',
      touchAction: 'none',
    });

    const line = document.createElement('span');
    Object.assign(line.style, {
      position: 'absolute',
      top: '8px',
      bottom: '8px',
      left: '50%',
      borderLeft: '1px solid #d8dee8',
      transform: 'translateX(-50%)',
      pointerEvents: 'none',
    });
    handle.appendChild(line);

    handle.addEventListener('mouseenter', () => {
      line.style.borderLeft = '2px solid #1976d2';
    });
    handle.addEventListener('mouseleave', () => {
      line.style.borderLeft = '1px solid #d8dee8';
    });
    handle.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const startX = event.clientX;
      const startWidth = Math.round(header.getBoundingClientRect().width);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextWidth = clampColumnWidth(startWidth + moveEvent.clientX - startX);
        widths[columnId] = nextWidth;
        applyColumnWidth(table, columnIndex, nextWidth);
        updateTableMinWidth(table);
      };

      const handleMouseUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        writeWidths(storageKey, widths);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    });

    header.appendChild(handle);
  });

  updateTableMinWidth(table);
  writeWidths(storageKey, widths);
};

const GlobalTableColumnResizer: React.FC = () => {
  const location = useLocation();

  React.useEffect(() => {
    let frame = 0;

    const enhance = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        Array.from(document.querySelectorAll('table')).forEach((table, index) => {
          if (table instanceof HTMLTableElement) {
            enhanceTable(table, location.pathname, index);
          }
        });
      });
    };

    enhance();
    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [location.pathname]);

  return null;
};

export default GlobalTableColumnResizer;
