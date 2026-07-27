import type { CommissionOrderSummaryFilters } from './commission';
import type { OrderFilters } from './order';
import type { RecoveryOrderFilters } from './recoveryOrder';

export const BUSINESS_EXPORT_MODULES = ['orders', 'order_settlements', 'recovery_orders', 'recovery_settlements'] as const;
export type BusinessExportModule = typeof BUSINESS_EXPORT_MODULES[number];
export type BusinessExportColumnMode = 'standard' | 'current_view' | 'all';

export type BusinessExportFilters = OrderFilters | CommissionOrderSummaryFilters | RecoveryOrderFilters;
export type BusinessExportRow = Record<string, string | number | boolean | null | undefined>;

export interface BusinessExportRequest {
  module: BusinessExportModule;
  reason: string;
  filters: BusinessExportFilters;
  columnMode: BusinessExportColumnMode;
  /** Current-view column ids, in the exact order selected in the browser. */
  columnIds?: string[];
}

export interface BusinessExportColumn {
  id: string;
  label: string;
  type: 'text' | 'currency' | 'number' | 'date';
}

export interface BusinessExportResult {
  filename: string;
  sheetNames: [string, string];
  summaryColumns: BusinessExportColumn[];
  detailColumns: BusinessExportColumn[];
  summaryRows: BusinessExportRow[];
  detailRows: BusinessExportRow[];
  audit: {
    module: BusinessExportModule;
    reason: string;
    summaryRowCount: number;
    detailRowCount: number;
    createdAt: string;
  };
}
