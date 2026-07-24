export const BUSINESS_EXPORT_MAX_ROWS = 10_000;

type BusinessExportValidationInput = {
  expectedCount: number;
  reason: string;
  busy?: boolean;
};

export function getBusinessExportDisabledReason({
  expectedCount,
  reason,
  busy = false,
}: BusinessExportValidationInput): string {
  if (busy) return '导出文件正在生成';
  if (expectedCount <= 0) return '当前筛选条件下没有可导出数据';
  if (expectedCount > BUSINESS_EXPORT_MAX_ROWS) return '导出数量超过 10,000 条，请缩小筛选范围';
  if (!reason.trim()) return '请填写导出原因';
  return '';
}
