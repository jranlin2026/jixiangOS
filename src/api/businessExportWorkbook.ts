import excelJsBrowserUrl from 'exceljs/dist/exceljs.min.js?url';
import type { BusinessExportColumn, BusinessExportResult, BusinessExportRow } from '../types/businessExport';

type ExcelJsNamespace = typeof import('exceljs');
type ExcelJsModule = ExcelJsNamespace & { default?: ExcelJsNamespace };
type WindowWithExcelJs = Window & { ExcelJS?: ExcelJsNamespace };

const WORKBOOK_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DATE_FORMAT = 'yyyy-mm-dd hh:mm:ss';
const CURRENCY_FORMAT = '¥#,##0.00;[Red]-¥#,##0.00';
const FORMULA_PREFIX = /^\s*[=+\-@]/u;

let browserExcelJsPromise: Promise<ExcelJsNamespace> | null = null;

function loadBrowserExcelJs(): Promise<ExcelJsNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Browser ExcelJS runtime is unavailable'));
  }
  const existing = (window as WindowWithExcelJs).ExcelJS;
  if (existing?.Workbook) return Promise.resolve(existing);
  if (browserExcelJsPromise) return browserExcelJsPromise;
  browserExcelJsPromise = new Promise<ExcelJsNamespace>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = excelJsBrowserUrl;
    script.async = true;
    script.onload = () => {
      const loaded = (window as WindowWithExcelJs).ExcelJS;
      if (loaded?.Workbook) resolve(loaded);
      else reject(new Error('ExcelJS 加载失败，请刷新页面后重试'));
    };
    script.onerror = () => reject(new Error('ExcelJS 文件加载失败，请检查本地服务后重试'));
    document.head.appendChild(script);
  }).finally(() => { browserExcelJsPromise = null; });
  return browserExcelJsPromise;
}
async function loadExcelJs(): Promise<ExcelJsNamespace> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') return loadBrowserExcelJs();
  const importExcelJs = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<ExcelJsModule>;
  const imported = await importExcelJs('exceljs');
  return typeof imported.Workbook === 'function' ? imported : imported.default || imported;
}

function toArrayBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const source = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copy = new Uint8Array(source.byteLength);
  copy.set(source);
  return copy.buffer;
}

function safeText(value: unknown): string {
  const text = String(value ?? '');
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function normalizeDate(value: unknown): Date | string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? safeText(value) : date;
}

function normalizeNumber(value: unknown): number | string {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return safeText(value);
}

function normalizeCellValue(column: BusinessExportColumn, value: unknown): Date | string | number {
  if (column.type === 'date') return normalizeDate(value);
  if (column.type === 'currency' || column.type === 'number') return normalizeNumber(value);
  return safeText(value);
}

function styleHeader(row: import('exceljs').Row): void {
  row.height = 28;
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      left: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      bottom: { style: 'thin', color: { argb: 'FFBFDBFE' } },
      right: { style: 'thin', color: { argb: 'FFBFDBFE' } },
    };
  });
}

function columnWidth(column: BusinessExportColumn, rows: BusinessExportRow[]): number {
  let width = column.label.length + 4;
  for (const row of rows.slice(0, 500)) {
    width = Math.max(width, String(row[column.id] ?? '').length + 2);
  }
  return Math.min(42, Math.max(12, width));
}

function addSheet(
  workbook: import('exceljs').Workbook,
  name: string,
  columns: BusinessExportColumn[],
  rows: BusinessExportRow[],
): void {
  if (!columns.length) throw new Error(`${name}没有可导出字段`);
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.addRow(columns.map((column) => column.label));
  for (const row of rows) {
    sheet.addRow(columns.map((column) => normalizeCellValue(column, row[column.id])));
  }
  styleHeader(sheet.getRow(1));
  sheet.autoFilter = `A1:${sheet.getRow(1).getCell(columns.length).address.replace('1', String(Math.max(1, sheet.rowCount)))}`;
  sheet.columns = columns.map((column) => ({ width: columnWidth(column, rows) }));
  columns.forEach((column, index) => {
    const worksheetColumn = sheet.getColumn(index + 1);
    if (column.type === 'currency') worksheetColumn.numFmt = CURRENCY_FORMAT;
    else if (column.type === 'date') worksheetColumn.numFmt = DATE_FORMAT;
  });
}

export async function createBusinessExportWorkbook(result: BusinessExportResult): Promise<ArrayBuffer> {
  if (!result.summaryRows.length) throw new Error('没有可生成的业务数据');
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '极享OS';
  workbook.created = new Date();
  addSheet(workbook, result.sheetNames[0], result.summaryColumns, result.summaryRows);
  addSheet(workbook, result.sheetNames[1], result.detailColumns, result.detailRows);
  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}

export async function downloadBusinessExportWorkbook(result: BusinessExportResult): Promise<void> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') throw new Error('当前环境无法下载文件');
  const buffer = await createBusinessExportWorkbook(result);
  const url = URL.createObjectURL(new Blob([buffer], { type: WORKBOOK_MIME }));
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename.endsWith('.xlsx') ? result.filename : `${result.filename}.xlsx`;
    anchor.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
