import type { Row } from 'exceljs';
import excelJsBrowserUrl from 'exceljs/dist/exceljs.min.js?url';
import { backendRequest } from './backendClient';
import type { ApiResponse } from './types';
import {
  CUSTOMER_IMPORT_HEADERS,
  CUSTOMER_IMPORT_MAX_ROWS,
  type CustomerExportRequest,
  type CustomerExportResult,
  type CustomerImportConfirmResult,
  type CustomerImportPrecheckResult,
  type CustomerImportRow,
  type CustomerImportRowResult,
  type CustomerImportTemplateOptions,
} from '../types/customerDataExchange';

type ExcelJsNamespace = typeof import('exceljs');
type ExcelJsModule = ExcelJsNamespace & { default?: ExcelJsNamespace };
type WindowWithExcelJs = Window & { ExcelJS?: ExcelJsNamespace };

const ROOT = '/customer-data-exchange';
const TEMPLATE_SHEET = '客户导入模板';
const OPTIONS_SHEET = '字段选项';
const INSTRUCTIONS_SHEET = '填写说明';
let browserExcelJsPromise: Promise<ExcelJsNamespace> | null = null;

const cleanText = (value: unknown): string => {
  if (value && typeof value === 'object') {
    const cell = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> };
    if (cell.text !== undefined) return String(cell.text).trim();
    if (cell.result !== undefined) return String(cell.result).trim();
    if (Array.isArray(cell.richText)) return cell.richText.map((item) => item.text || '').join('').trim();
  }
  return String(value ?? '').trim();
};

function loadBrowserExcelJs(): Promise<ExcelJsNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.reject(new Error('Browser ExcelJS runtime is unavailable'));
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

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function applyValidation(sheet: import('exceljs').Worksheet, column: number, optionColumn: string, count: number): void {
  if (!count) return;
  const formula = `${quoteSheet(OPTIONS_SHEET)}!$${optionColumn}$2:$${optionColumn}$${count + 1}`;
  for (let row = 2; row <= CUSTOMER_IMPORT_MAX_ROWS + 1; row += 1) {
    sheet.getCell(row, column).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: '请选择有效选项',
      error: '请使用模板提供的下拉选项。',
    };
  }
}

export async function createCustomerImportTemplateWorkbook(options: CustomerImportTemplateOptions): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '极享OS';
  const sheet = workbook.addWorksheet(TEMPLATE_SHEET, { views: [{ state: 'frozen', ySplit: 1 }] });
  const instructions = workbook.addWorksheet(INSTRUCTIONS_SHEET);
  const optionSheet = workbook.addWorksheet(OPTIONS_SHEET);
  sheet.addRow([...CUSTOMER_IMPORT_HEADERS]);
  styleHeader(sheet.getRow(1));
  sheet.autoFilter = { from: 'A1', to: 'L1' };
  sheet.columns = [18, 18, 20, 24, 18, 18, 16, 26, 18, 18, 28, 36].map((width) => ({ width }));

  const optionColumns = [
    { title: '销售负责人', values: options.ownerNames },
    { title: '客户进度', values: options.lifecycleStatuses },
    { title: '客户等级', values: options.customerLevels },
    { title: '线索来源', values: options.leadSources },
    { title: '客户标签', values: options.tagNames },
  ];
  optionSheet.addRow(optionColumns.map((item) => item.title));
  const maxOptions = Math.max(1, ...optionColumns.map((item) => item.values.length));
  for (let index = 0; index < maxOptions; index += 1) optionSheet.addRow(optionColumns.map((item) => item.values[index] || ''));
  optionSheet.columns = optionColumns.map(() => ({ width: 28 }));
  optionSheet.state = 'hidden';
  applyValidation(sheet, 5, 'A', options.ownerNames.length);
  applyValidation(sheet, 6, 'B', options.lifecycleStatuses.length);
  applyValidation(sheet, 7, 'C', options.customerLevels.length);
  applyValidation(sheet, 8, 'D', options.leadSources.length);

  instructions.addRows([
    ['极享OS 客户批量导入说明'],
    ['必填字段', '客户姓名；手机号和微信至少填写一项。'],
    ['销售负责人', options.canOverrideAttribution ? '可从下拉列表选择数据范围内的销售负责人；留空默认导入人。' : '当前账号无导入覆盖归属权限，必须留空或填写本人。'],
    ['线索来源', '只填写“线索来源”一个字段，并从模板下拉选项选择。'],
    ['客户标签', '多个标签使用中文逗号、英文逗号或顿号分隔；标签必须已经存在。'],
    ['重复校验', '系统按手机号或微信检查系统存量和当前文件重复；重复行不会导入。'],
    ['导入流程', '上传文件后先预检。只有“可导入”的行会在确认后写入客户库，错误行可下载报告。'],
    ['文件限制', `仅支持 .xlsx；请勿修改表头；单次最多 ${CUSTOMER_IMPORT_MAX_ROWS} 条。`],
  ]);
  instructions.getColumn(1).width = 20;
  instructions.getColumn(2).width = 96;
  styleHeader(instructions.getRow(1));
  instructions.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.getCell(1).font = { bold: true };
      row.alignment = { vertical: 'middle', wrapText: true };
      row.height = 34;
    }
  });
  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}

export async function parseCustomerImportWorkbook(buffer: ArrayBuffer | ArrayBufferView): Promise<CustomerImportRow[]> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toArrayBuffer(buffer));
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Excel 文件中没有工作表');
  const headerIndexes = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, column) => headerIndexes.set(cleanText(cell.value), column));
  const missing = CUSTOMER_IMPORT_HEADERS.filter((header) => !headerIndexes.has(header));
  if (missing.length) throw new Error(`导入模板缺少字段：${missing.join('、')}`);

  const cell = (row: Row, header: (typeof CUSTOMER_IMPORT_HEADERS)[number]) => cleanText(row.getCell(headerIndexes.get(header)!).value);
  const rows: CustomerImportRow[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = CUSTOMER_IMPORT_HEADERS.map((header) => cell(row, header));
    if (!values.some(Boolean)) return;
    rows.push({
      rowNumber,
      name: cell(row, '客户姓名*'),
      phone: cell(row, '手机号'),
      wechat: cell(row, '微信'),
      company: cell(row, '公司名称'),
      ownerName: cell(row, '销售负责人'),
      lifecycleStatus: cell(row, '客户进度'),
      customerLevel: cell(row, '客户等级'),
      leadSource: cell(row, '线索来源'),
      industry: cell(row, '行业'),
      city: cell(row, '城市'),
      tagNames: cell(row, '客户标签'),
      remark: cell(row, '备注'),
    });
  });
  if (!rows.length) throw new Error('导入文件没有客户数据');
  if (rows.length > CUSTOMER_IMPORT_MAX_ROWS) throw new Error(`单次最多导入 ${CUSTOMER_IMPORT_MAX_ROWS} 条客户`);
  return rows;
}

export async function createCustomerExportWorkbook(rows: Array<Record<string, string | number>>): Promise<ArrayBuffer> {
  if (!rows.length) throw new Error('没有可生成的客户数据');
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '极享OS';
  const sheet = workbook.addWorksheet('客户资料', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = Object.keys(rows[0]);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(headers.map((header) => row[header] ?? '')));
  styleHeader(sheet.getRow(1));
  sheet.autoFilter = { from: 'A1', to: sheet.getRow(1).getCell(headers.length).address };
  sheet.columns = headers.map((header) => ({ width: Math.min(42, Math.max(14, header.length + 8)) }));
  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}

export async function createCustomerImportErrorWorkbook(
  results: CustomerImportRowResult[],
  sourceRows: CustomerImportRow[],
): Promise<ArrayBuffer> {
  const sourceByRow = new Map(sourceRows.map((row) => [row.rowNumber, row]));
  return createCustomerExportWorkbook(results.map((result) => {
    const row = sourceByRow.get(result.rowNumber);
    return {
      '客户姓名*': row?.name || result.name,
      手机号: row?.phone || '',
      微信: row?.wechat || '',
      公司名称: row?.company || '',
      销售负责人: row?.ownerName || '',
      客户进度: row?.lifecycleStatus || '',
      客户等级: row?.customerLevel || '',
      线索来源: row?.leadSource || '',
      行业: row?.industry || '',
      城市: row?.city || '',
      客户标签: row?.tagNames || '',
      备注: row?.remark || '',
      错误原因: result.reason,
    };
  }));
}

export const customerDataExchangeApi = {
  templateOptions(): Promise<ApiResponse<CustomerImportTemplateOptions>> {
    return backendRequest(`${ROOT}/template-options`);
  },
  precheckImport(rows: CustomerImportRow[]): Promise<ApiResponse<CustomerImportPrecheckResult>> {
    return backendRequest(`${ROOT}/import/precheck`, { method: 'POST', body: JSON.stringify({ rows }) });
  },
  confirmImport(rows: CustomerImportRow[], confirmationToken: string): Promise<ApiResponse<CustomerImportConfirmResult>> {
    return backendRequest(`${ROOT}/import/confirm`, { method: 'POST', body: JSON.stringify({ rows, confirmationToken }) });
  },
  exportCustomers(input: CustomerExportRequest): Promise<ApiResponse<CustomerExportResult>> {
    return backendRequest(`${ROOT}/export`, { method: 'POST', body: JSON.stringify(input) });
  },
};
