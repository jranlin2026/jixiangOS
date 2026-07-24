import excelJsBrowserUrl from 'exceljs/dist/exceljs.min.js?url';
import type { Cell, Row, Worksheet } from 'exceljs';
import {
  BUSINESS_IMPORT_MAX_ROWS,
  type BusinessImportJobRow,
  type BusinessImportRow,
  type BusinessImportRowResult,
  type BusinessImportTemplateOptions,
  type BusinessImportType,
} from '../types/businessImport';

type ExcelJsNamespace = typeof import('exceljs');
type ExcelJsModule = ExcelJsNamespace & { default?: ExcelJsNamespace };
type WindowWithExcelJs = Window & { ExcelJS?: ExcelJsNamespace };

export const ORDER_IMPORT_HEADERS = [
  '客户姓名', '手机号', '微信', '产品名称', '订单类型', '实付金额', '官方收款渠道',
  '付款时间', '销售负责人', '付款订单号', '第三方平台订单号', '订单创建人', '备注',
] as const;

export const RECOVERY_IMPORT_HEADERS = [
  '客户姓名', '手机号', '微信', '第三方平台订单号', '原产品', '挽回成交金额', '挽回时间',
  '挽回人员', '来源平台', '来源店铺', '原付款金额', '官方收款渠道', '付款订单号',
  '付款时间', '协助人员', '订单创建人', '备注',
] as const;

const OPTIONS_SHEET = '字段选项';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FORMULA_PREFIX = /^\s*[=+\-@]/u;
export const BUSINESS_IMPORT_MAX_FILE_BYTES = 20 * 1024 * 1024;
let browserExcelJsPromise: Promise<ExcelJsNamespace> | null = null;

export function validateBusinessImportFile(file: Pick<File, 'name' | 'size' | 'type'>): void {
  if (!String(file.name || '').toLocaleLowerCase('en-US').endsWith('.xlsx')) {
    throw new Error('仅支持 .xlsx 文件');
  }
  const mime = String(file.type || '').toLocaleLowerCase('en-US');
  if (mime && mime !== XLSX_MIME && mime !== 'application/octet-stream') {
    throw new Error('文件类型与 .xlsx 不匹配，请重新选择标准模板');
  }
  if (file.size > BUSINESS_IMPORT_MAX_FILE_BYTES) {
    throw new Error('文件不能超过 20 MB，请拆分后重试');
  }
}

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

function safeWorkbookValue(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '');
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

function rowValues(type: BusinessImportType, row?: BusinessImportRow): Array<string | number> {
  if (!row) return (type === 'orders' ? ORDER_IMPORT_HEADERS : RECOVERY_IMPORT_HEADERS).map(() => '');
  if (type === 'orders') {
    const input = row as Extract<BusinessImportRow, { productName: string }>;
    return [
      input.customerName, input.customerPhone, input.customerWechat, input.productName, input.orderType,
      input.paymentAmount, input.paymentChannel, input.paidAt, input.salesUserName, input.paymentOrderNo,
      input.thirdPartyOrderNo, input.creatorName, input.notes || input.remark,
    ].map(safeWorkbookValue);
  }
  const input = row as Extract<BusinessImportRow, { originalProduct: string }>;
  return [
    input.customerName, input.customerPhone, input.customerWechat, input.thirdPartyOrderNo, input.originalProduct,
    input.recoveryAmount, input.recoveryAt, input.recoveryUserName, input.sourcePlatform, input.sourceShop,
    input.originalAmount, input.paymentChannel, input.paymentOrderNo, input.paymentAt, input.assistUserName,
    input.creatorName, input.remark,
  ].map(safeWorkbookValue);
}

function reportStatus(result: BusinessImportRowResult | BusinessImportJobRow): string {
  if ('executionStatus' in result && result.executionStatus === 'failed') return '失败';
  if (result.status === 'blocked') return '已阻止';
  if (result.status === 'warning') return '警告';
  return '可导入';
}

export async function createBusinessImportErrorWorkbook(
  type: BusinessImportType,
  results: Array<BusinessImportRowResult | BusinessImportJobRow>,
  sourceRows: BusinessImportRow[] = [],
): Promise<ArrayBuffer> {
  if (!results.length) throw new Error('没有可生成的导入错误数据');
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '极享OS';
  const isOrder = type === 'orders';
  const headers = isOrder ? ORDER_IMPORT_HEADERS : RECOVERY_IMPORT_HEADERS;
  const sheet = workbook.addWorksheet(isOrder ? '订单导入错误报告' : '售后挽回订单导入错误报告', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.addRow(['Excel行', ...headers, '状态', '警告/错误原因']);
  const sourceByRow = new Map(sourceRows.map((row) => [row.rowNumber, row]));
  for (const result of results) {
    const normalized = 'normalized' in result ? result.normalized : undefined;
    const source = normalized || sourceByRow.get(result.rowNumber);
    const reason = 'errorMessage' in result && result.errorMessage ? result.errorMessage : result.reason;
    sheet.addRow([
      result.rowNumber,
      ...rowValues(type, source),
      reportStatus(result),
      safeWorkbookValue(reason),
    ]);
  }
  styleHeader(sheet.getRow(1));
  sheet.autoFilter = `A1:${sheet.getRow(1).getCell(headers.length + 3).address.replace('1', String(sheet.rowCount))}`;
  const reportWidths: Record<string, number> = { 备注: 42, 客户姓名: 18, 原产品: 24 };
  sheet.columns = [12, ...headers.map((header) => reportWidths[header] || 20), 12, 48]
    .map((width) => ({ width }));
  const offset = 1;
  if (isOrder) {
    sheet.getColumn(offset + 6).numFmt = '#,##0.00;[Red]-#,##0.00';
    sheet.getColumn(offset + 8).numFmt = 'yyyy-mm-dd hh:mm:ss';
  } else {
    sheet.getColumn(offset + 6).numFmt = '#,##0.00;[Red]-#,##0.00';
    sheet.getColumn(offset + 7).numFmt = 'yyyy-mm-dd hh:mm:ss';
    sheet.getColumn(offset + 11).numFmt = '#,##0.00;[Red]-#,##0.00';
    sheet.getColumn(offset + 14).numFmt = 'yyyy-mm-dd hh:mm:ss';
  }
  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}

function cellText(cell: Cell): string {
  return cell.text.trim();
}

function cellAmount(cell: Cell): string | number {
  return typeof cell.value === 'number' ? cell.value : cellText(cell);
}

function formatDate(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
}

function validDateText(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  return day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function cellDate(cell: Cell, rowNumber: number, header: string, required: boolean): string {
  if (cell.value === null || cell.value === undefined || cellText(cell) === '') {
    if (required) throw new Error(`第 ${rowNumber} 行：${header}不能为空`);
    return '';
  }
  if (cell.value instanceof Date && !Number.isNaN(cell.value.getTime())) return formatDate(cell.value);
  if (typeof cell.value === 'string' && validDateText(cell.value.trim())) return cell.value.trim();
  throw new Error(`第 ${rowNumber} 行：${header}必须是有效日期或时间`);
}

function validMoney(value: string | number): boolean {
  return typeof value === 'number'
    ? Number.isFinite(value)
    : /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(value);
}

const TEXT_MAX_LENGTHS: Partial<Record<string, number>> = {
  客户姓名: 100, 手机号: 50, 微信: 100, 产品名称: 200, 原产品: 200,
  订单类型: 100, 官方收款渠道: 100, 销售负责人: 100, 挽回人员: 100,
  协助人员: 100, 订单创建人: 100, 来源平台: 100, 来源店铺: 100,
  付款订单号: 191, 第三方平台订单号: 191, 备注: 2000,
};

function assertTextCells(row: Row, rowNumber: number, headers: readonly string[], indexes: Map<string, number>): void {
  const typedHeaders = new Set(['实付金额', '挽回成交金额', '原付款金额', '付款时间', '挽回时间']);
  for (const header of headers) {
    if (typedHeaders.has(header)) continue;
    const column = indexes.get(header);
    if (!column) continue;
    const cell = row.getCell(column);
    if (cell.value !== null && cell.value !== undefined && typeof cell.value !== 'string') {
      throw new Error(`第 ${rowNumber} 行：${header}必须使用文本格式`);
    }
    const limit = TEXT_MAX_LENGTHS[header];
    if (limit && cellText(cell).length > limit) throw new Error(`第 ${rowNumber} 行：${header}不能超过 ${limit} 个字符`);
  }
}

function assertMoney(value: string | number, rowNumber: number, header: string, required: boolean, positive: boolean): void {
  if (value === '') {
    if (required) throw new Error(`第 ${rowNumber} 行：${header}不能为空`);
    return;
  }
  if (!validMoney(value)) throw new Error(`第 ${rowNumber} 行：${header}必须是最多两位小数的数值`);
  const numeric = Number(value);
  if (positive ? numeric <= 0 : numeric < 0) throw new Error(`第 ${rowNumber} 行：${header}${positive ? '必须大于 0' : '不能小于 0'}`);
}

function findImportSheet(workbook: import('exceljs').Workbook, type: BusinessImportType): Worksheet {
  const expectedName = type === 'orders' ? '订单导入模板' : '售后挽回订单导入模板';
  const sheet = workbook.getWorksheet(expectedName) || workbook.worksheets[0];
  if (!sheet) throw new Error('Excel 文件中没有工作表');
  return sheet;
}

const REQUIRED_HEADERS: Record<BusinessImportType, readonly string[]> = {
  orders: ['客户姓名', '产品名称', '订单类型', '实付金额', '官方收款渠道', '付款时间', '销售负责人'],
  recovery_orders: ['客户姓名', '第三方平台订单号', '原产品', '挽回成交金额', '挽回时间', '挽回人员'],
};

function readHeaderIndexes(sheet: Worksheet, type: BusinessImportType): Map<string, number> {
  const allowed = new Set<string>(type === 'orders' ? ORDER_IMPORT_HEADERS : RECOVERY_IMPORT_HEADERS);
  const indexes = new Map<string, number>();
  const unknown: string[] = [];
  const duplicate: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const header = cellText(cell);
    if (!header) return;
    if (!allowed.has(header)) unknown.push(header);
    else if (indexes.has(header)) duplicate.push(header);
    else indexes.set(header, column);
  });
  if (duplicate.length) throw new Error(`重复表头：${[...new Set(duplicate)].join('、')}`);
  if (unknown.length) throw new Error(`未知表头：${[...new Set(unknown)].join('、')}`);
  const missing = REQUIRED_HEADERS[type].filter((header) => !indexes.has(header));
  if (!indexes.has('手机号') && !indexes.has('微信')) missing.push('手机号或微信');
  if (missing.length) throw new Error(`缺少必需表头：${missing.join('、')}`);
  return indexes;
}

function assertNoFormulas(sheet: Worksheet): void {
  sheet.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const value = cell.value;
      if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
        throw new Error(`${cell.address} 包含公式，导入文件不允许使用公式`);
      }
    });
  });
}

export async function parseBusinessImportWorkbook(
  type: BusinessImportType,
  buffer: ArrayBuffer | ArrayBufferView,
): Promise<BusinessImportRow[]> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(toArrayBuffer(buffer));
  } catch {
    throw new Error('无法读取 .xlsx 文件，请使用极享OS标准模板');
  }
  const sheet = findImportSheet(workbook, type);
  assertNoFormulas(sheet);
  const headers = type === 'orders' ? ORDER_IMPORT_HEADERS : RECOVERY_IMPORT_HEADERS;
  const indexes = readHeaderIndexes(sheet, type);
  const read = (row: Row, header: string) => {
    const column = indexes.get(header);
    return column ? cellText(row.getCell(column)) : '';
  };
  const readAmount = (row: Row, header: string) => {
    const column = indexes.get(header);
    return column ? cellAmount(row.getCell(column)) : '';
  };
  const rows: BusinessImportRow[] = [];
  const mappedColumns = new Set(indexes.values());
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    row.eachCell({ includeEmpty: false }, (cell, column) => {
      if (!mappedColumns.has(column) && cellText(cell)) {
        throw new Error(`第 ${rowNumber} 行：第 ${column} 列没有有效表头`);
      }
    });
    if (!headers.some((header) => read(row, header))) return;
    assertTextCells(row, rowNumber, headers, indexes);
    const requireText = (header: string) => {
      const value = read(row, header);
      if (!value) throw new Error(`第 ${rowNumber} 行：${header}不能为空`);
      return value;
    };
    const date = (header: string, required: boolean) => {
      const column = indexes.get(header);
      return column ? cellDate(row.getCell(column), rowNumber, header, required) : '';
    };
    const customerPhone = read(row, '手机号');
    const customerWechat = read(row, '微信');
    if (!customerPhone && !customerWechat) throw new Error(`第 ${rowNumber} 行：手机号或微信至少填写一项`);
    if (type === 'orders') {
      const paymentAmount = readAmount(row, '实付金额');
      assertMoney(paymentAmount, rowNumber, '实付金额', true, true);
      rows.push({
        rowNumber,
        customerName: requireText('客户姓名'), customerPhone, customerWechat,
        productName: requireText('产品名称'), orderType: requireText('订单类型'), paymentAmount,
        paymentChannel: requireText('官方收款渠道'), paidAt: date('付款时间', true), salesUserName: requireText('销售负责人'),
        paymentOrderNo: read(row, '付款订单号'), thirdPartyOrderNo: read(row, '第三方平台订单号'),
        creatorName: read(row, '订单创建人'), notes: read(row, '备注'), remark: '',
      });
      return;
    }
    const recoveryAmount = readAmount(row, '挽回成交金额');
    const originalAmount = readAmount(row, '原付款金额');
    assertMoney(recoveryAmount, rowNumber, '挽回成交金额', true, true);
    assertMoney(originalAmount, rowNumber, '原付款金额', false, false);
    rows.push({
      rowNumber,
      customerName: requireText('客户姓名'), customerPhone, customerWechat,
      thirdPartyOrderNo: requireText('第三方平台订单号'), originalProduct: requireText('原产品'),
      recoveryAmount, recoveryAt: date('挽回时间', true), recoveryUserName: requireText('挽回人员'),
      sourcePlatform: read(row, '来源平台'), sourceShop: read(row, '来源店铺'), originalAmount,
      paymentChannel: read(row, '官方收款渠道'), paymentOrderNo: read(row, '付款订单号'), paymentAt: date('付款时间', false),
      assistUserName: read(row, '协助人员'), creatorName: read(row, '订单创建人'), remark: read(row, '备注'),
    });
  });
  if (!rows.length) throw new Error('导入文件没有可处理的数据');
  if (rows.length > BUSINESS_IMPORT_MAX_ROWS) throw new Error(`单次最多导入 ${BUSINESS_IMPORT_MAX_ROWS} 条数据，请拆分文件后重试`);
  return rows;
}

function styleHeader(row: Row): void {
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

function applyValidation(sheet: Worksheet, column: number, optionColumn: string, count: number): void {
  if (!count) return;
  const formula = `'${OPTIONS_SHEET}'!$${optionColumn}$2:$${optionColumn}$${count + 1}`;
  for (let row = 2; row <= BUSINESS_IMPORT_MAX_ROWS + 1; row += 1) {
    sheet.getCell(row, column).dataValidation = {
      type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true,
      errorTitle: '请选择有效选项', error: '请使用模板提供的下拉选项。',
    };
  }
}

export async function createBusinessImportTemplateWorkbook(
  type: BusinessImportType,
  options: BusinessImportTemplateOptions,
): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '极享OS';
  const isOrder = type === 'orders';
  const headers = isOrder ? ORDER_IMPORT_HEADERS : RECOVERY_IMPORT_HEADERS;
  const sheet = workbook.addWorksheet(isOrder ? '订单导入模板' : '售后挽回订单导入模板', { views: [{ state: 'frozen', ySplit: 1 }] });
  const instructions = workbook.addWorksheet('填写说明');
  const optionSheet = workbook.addWorksheet(OPTIONS_SHEET);
  sheet.addRow([...headers]);
  styleHeader(sheet.getRow(1));
  sheet.autoFilter = `A1:${sheet.getRow(1).getCell(headers.length).address}`;
  sheet.columns = (isOrder
    ? [18, 18, 20, 24, 18, 16, 22, 20, 20, 22, 24, 20, 40]
    : [18, 18, 20, 24, 24, 18, 20, 20, 18, 22, 18, 22, 22, 20, 20, 20, 40]
  ).map((width) => ({ width }));
  headers.forEach((_header, index) => { sheet.getColumn(index + 1).numFmt = '@'; });

  const optionColumns = [
    { title: '产品名称', values: options.products.map((item) => item.name) },
    { title: '订单类型', values: options.orderTypes.map((item) => item.name) },
    { title: '官方收款渠道', values: options.paymentChannels },
    { title: '在职员工', values: options.users.map((item) => item.name) },
    { title: '来源平台', values: options.recoveryPlatforms.map((item) => item.name) },
    { title: '来源店铺', values: options.recoveryShops.map((item) => item.name) },
  ];
  optionSheet.addRow(optionColumns.map((item) => item.title));
  const optionRowCount = Math.max(1, ...optionColumns.map((item) => item.values.length));
  for (let index = 0; index < optionRowCount; index += 1) {
    optionSheet.addRow(optionColumns.map((item) => item.values[index] || ''));
  }
  optionSheet.columns = optionColumns.map(() => ({ width: 28 }));
  optionSheet.state = 'hidden';
  if (isOrder) {
    applyValidation(sheet, 4, 'A', optionColumns[0].values.length);
    applyValidation(sheet, 5, 'B', optionColumns[1].values.length);
    applyValidation(sheet, 7, 'C', optionColumns[2].values.length);
    applyValidation(sheet, 9, 'D', optionColumns[3].values.length);
    applyValidation(sheet, 12, 'D', optionColumns[3].values.length);
    sheet.getColumn(6).numFmt = '#,##0.00;[Red]-#,##0.00';
    sheet.getColumn(8).numFmt = 'yyyy-mm-dd hh:mm:ss';
  } else {
    applyValidation(sheet, 8, 'D', optionColumns[3].values.length);
    applyValidation(sheet, 9, 'E', optionColumns[4].values.length);
    applyValidation(sheet, 10, 'F', optionColumns[5].values.length);
    applyValidation(sheet, 12, 'C', optionColumns[2].values.length);
    applyValidation(sheet, 15, 'D', optionColumns[3].values.length);
    applyValidation(sheet, 16, 'D', optionColumns[3].values.length);
    sheet.getColumn(6).numFmt = '#,##0.00;[Red]-#,##0.00';
    sheet.getColumn(7).numFmt = 'yyyy-mm-dd hh:mm:ss';
    sheet.getColumn(11).numFmt = '#,##0.00;[Red]-#,##0.00';
    sheet.getColumn(14).numFmt = 'yyyy-mm-dd hh:mm:ss';
  }

  instructions.addRows([
    [`极享OS ${isOrder ? '订单' : '售后挽回订单'}批量导入说明`],
    ['必填字段', isOrder
      ? '客户姓名、产品名称、订单类型、实付金额、官方收款渠道、付款时间、销售负责人；手机号和微信至少填写一项。'
      : '客户姓名、第三方平台订单号、原产品、挽回成交金额、挽回时间、挽回人员；手机号和微信至少填写一项。'],
    ['文本字段', '手机号、微信、付款订单号和第三方平台订单号请设置为文本，保留前导零。'],
    ['导入流程', '上传后先本地校验和服务端预检。被阻止的行必须修正；警告行可以确认导入。'],
    ['文件限制', `仅支持 .xlsx；请勿修改表头；不得使用公式；单次最多 ${BUSINESS_IMPORT_MAX_ROWS} 条。`],
  ]);
  instructions.getColumn(1).width = 20;
  instructions.getColumn(2).width = 96;
  styleHeader(instructions.getRow(1));
  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}
