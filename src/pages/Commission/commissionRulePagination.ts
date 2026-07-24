export function clampCommissionConfigPage(count: number, page: number, rowsPerPage: number): number {
  const totalPages = Math.max(1, Math.ceil(count / Math.max(rowsPerPage, 1)));
  return Math.min(Math.max(page, 0), totalPages - 1);
}

export function paginateCommissionConfigRows<T>(rows: T[], page: number, rowsPerPage: number): T[] {
  const safePage = clampCommissionConfigPage(rows.length, page, rowsPerPage);
  const start = safePage * rowsPerPage;
  return rows.slice(start, start + rowsPerPage);
}
