import type { BrowserBusinessExportRequest } from '../../api/businessExportApi';
import type { ApiResponse } from '../../api/types';
import type { BusinessExportFilters, BusinessExportResult } from '../../types/businessExport';
import type { BusinessExportDialogRequest } from '../components/BusinessExportDialog';

type ExportDialogSelection = BusinessExportDialogRequest & { columnIds: string[] };

export function buildBusinessExportBrowserRequest<TFilters extends BusinessExportFilters>(
  filters: TFilters,
  selection: ExportDialogSelection,
): BrowserBusinessExportRequest {
  const { page: _page, pageSize: _pageSize, ...allPageFilters } = filters;
  const request: BrowserBusinessExportRequest = {
    filters: allPageFilters as BusinessExportFilters,
    columnMode: selection.columnMode,
    reason: selection.reason,
  };
  if (selection.columnMode === 'current_view') request.columnIds = selection.columnIds;
  return request;
}

export function unwrapBusinessExportResponse(response: ApiResponse<BusinessExportResult>): BusinessExportResult {
  if (response.code !== 0 || !response.data) throw new Error(response.message || '业务数据导出失败');
  return response.data;
}
