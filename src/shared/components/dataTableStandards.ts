export const DATA_TABLE_TOKENS = {
  brand: '#7C3AED',
  link: '#1E6BFF',
  linkHover: '#1554CC',
  ink: '#1F2937',
  muted: '#6B7280',
  line: '#E5E7EB',
  headBackground: '#FAF9FD',
  rowHover: '#F8FAFC',
  action: '#64748B',
  danger: '#D92D20',
} as const;

export const DATA_TABLE_METRICS = {
  headerHeight: 44,
  rowHeight: 52,
  footerHeight: 48,
  emptyMinHeight: 240,
  headerFontSize: 13,
  bodyFontSize: 14,
} as const;

export const DATA_TABLE_COLUMN_WIDTHS = {
  selection: 48,
  minimum: 96,
  maximum: 520,
  default: 140,
  amount: 120,
  phone: 140,
  name: 160,
  identifier: 180,
  dateTime: 168,
  action: 96,
  emptyMinimum: 640,
} as const;

export type DataTableColumnWidth = { width?: number };

export interface DataTableMinWidthOptions {
  selection?: boolean;
  actionWidth?: number;
}

const normalizeColumnWidth = (width?: number) => Math.min(
  DATA_TABLE_COLUMN_WIDTHS.maximum,
  Math.max(DATA_TABLE_COLUMN_WIDTHS.minimum, width ?? DATA_TABLE_COLUMN_WIDTHS.default),
);

/** Calculates the single source of truth for a desktop table's scroll width. */
export function getDataTableMinWidth(
  columns: readonly DataTableColumnWidth[],
  options: DataTableMinWidthOptions = {},
) {
  if (columns.length === 0) return DATA_TABLE_COLUMN_WIDTHS.emptyMinimum;

  return columns.reduce((total, column) => total + normalizeColumnWidth(column.width), 0)
    + (options.selection ? DATA_TABLE_COLUMN_WIDTHS.selection : 0)
    + (options.actionWidth ?? 0);
}
