import excelJsBrowserUrl from 'exceljs/dist/exceljs.min.js?url';
import type { Cell, Row, Worksheet } from 'exceljs';
import JSZip from 'jszip';
import type { BusinessAttachmentCategory } from '../types/businessAttachment';
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
  '付款截图文件名', '成交资料图片文件名',
] as const;

export const RECOVERY_IMPORT_HEADERS = [
  '客户姓名', '手机号', '微信', '第三方平台订单号', '原产品', '挽回成交金额', '挽回时间',
  '挽回人员', '来源平台', '来源店铺', '原产品付款金额', '原订单付款时间', '官方收款渠道', '付款订单号',
  '付款时间', '协助人员', '订单创建人', '备注', '挽回凭证文件名',
] as const;

const RECOVERY_IMPORT_HEADER_ALIASES = new Map<string, string>([
  ['原付款金额', '原产品付款金额'],
]);

const OPTIONS_SHEET = '字段选项';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FORMULA_PREFIX = /^\s*[=+\-@]/u;
export const BUSINESS_IMPORT_MAX_FILE_BYTES = 20 * 1024 * 1024;
export const BUSINESS_IMPORT_MAX_PACKAGE_BYTES = 200 * 1024 * 1024;
export const BUSINESS_IMPORT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const BUSINESS_IMPORT_MAX_ZIP_ENTRIES = BUSINESS_IMPORT_MAX_ROWS * 9 + 1;
let browserExcelJsPromise: Promise<ExcelJsNamespace> | null = null;

export type BusinessImportDownloadEnvironment = {
  createObjectUrl: (blob: Blob) => string;
  revokeObjectUrl: (url: string) => void;
  clickAnchor: (url: string, fileName: string) => void;
};

function browserDownloadEnvironment(): BusinessImportDownloadEnvironment {
  if (typeof document === 'undefined' || typeof URL === 'undefined') throw new Error('当前环境无法下载文件');
  return {
    createObjectUrl: (blob) => URL.createObjectURL(blob),
    revokeObjectUrl: (url) => URL.revokeObjectURL(url),
    clickAnchor: (url, fileName) => {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
    },
  };
}

export function downloadBusinessImportWorkbook(
  fileName: string,
  buffer: ArrayBuffer,
  environment: BusinessImportDownloadEnvironment = browserDownloadEnvironment(),
): void {
  const url = environment.createObjectUrl(new Blob([buffer], { type: XLSX_MIME }));
  try {
    environment.clickAnchor(url, fileName);
  } finally {
    environment.revokeObjectUrl(url);
  }
}

export function validateBusinessImportFile(file: Pick<File, 'name' | 'size' | 'type'>): void {
  const lowerName = String(file.name || '').toLocaleLowerCase('en-US');
  const isWorkbook = lowerName.endsWith('.xlsx');
  const isPackage = lowerName.endsWith('.zip');
  if (!isWorkbook && !isPackage) throw new Error('仅支持 .xlsx 文件或 .zip 导入包');
  const mime = String(file.type || '').toLocaleLowerCase('en-US');
  const allowedMimes = isWorkbook
    ? new Set([XLSX_MIME, 'application/octet-stream'])
    : new Set(['application/zip', 'application/x-zip-compressed', 'application/octet-stream']);
  if (mime && !allowedMimes.has(mime)) {
    throw new Error(`文件类型与 ${isWorkbook ? '.xlsx' : '.zip'} 不匹配，请重新选择导入文件`);
  }
  const maxBytes = isWorkbook ? BUSINESS_IMPORT_MAX_FILE_BYTES : BUSINESS_IMPORT_MAX_PACKAGE_BYTES;
  if (file.size > maxBytes) {
    throw new Error(`文件不能超过 ${maxBytes / 1024 / 1024} MB，请拆分后重试`);
  }
}

export type BusinessImportPackageImage = {
  rowNumber: number;
  category: Extract<BusinessAttachmentCategory, 'order-payment-proof' | 'order-deal-evidence' | 'recovery-payment-proof'>;
  name: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  bytes: Uint8Array;
};

export type BusinessImportPackage = {
  rows: BusinessImportRow[];
  images: BusinessImportPackageImage[];
};

function attachmentNames(value: unknown, max: number, rowNumber: number, label: string): string[] {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const names = raw.split(/[;；\n\r]+/u).map((item) => item.trim()).filter(Boolean);
  if (names.length > max) throw new Error(`第 ${rowNumber} 行：${label}最多填写 ${max} 张图片`);
  if (new Set(names.map((name) => name.toLocaleLowerCase('zh-CN'))).size !== names.length) {
    throw new Error(`第 ${rowNumber} 行：${label}不能重复填写同一文件`);
  }
  return names;
}

function rowAttachmentReferences(type: BusinessImportType, row: BusinessImportRow) {
  if (type === 'orders') {
    const order = row as Extract<BusinessImportRow, { productName: string }>;
    return [
      ...attachmentNames(order.paymentProofFileName, 1, row.rowNumber, '付款截图').map((name) => ({ name, category: 'order-payment-proof' as const })),
      ...attachmentNames(order.dealEvidenceFileNames, 8, row.rowNumber, '成交资料').map((name) => ({ name, category: 'order-deal-evidence' as const })),
    ];
  }
  const recovery = row as Extract<BusinessImportRow, { originalProduct: string }>;
  return attachmentNames(recovery.recoveryEvidenceFileNames, 8, row.rowNumber, '挽回凭证')
    .map((name) => ({ name, category: 'recovery-payment-proof' as const }));
}

function normalizePackagePath(value: string): string {
  const normalized = value.replace(/\\/gu, '/').replace(/^\.\//u, '').replace(/\/{2,}/gu, '/').trim();
  if (!normalized || normalized.startsWith('/') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`ZIP 中包含不安全的文件路径：${value || '未命名文件'}`);
  }
  return normalized;
}

function imageMime(name: string, bytes: Uint8Array): BusinessImportPackageImage['mimeType'] {
  const extension = name.split('.').pop()?.toLocaleLowerCase('en-US');
  if ((extension === 'jpg' || extension === 'jpeg') && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (extension === 'png' && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)) return 'image/png';
  if (extension === 'webp'
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  throw new Error(`图片文件格式不支持或内容与扩展名不匹配：${name}`);
}

function declaredUncompressedSize(entry: JSZip.JSZipObject): number {
  const size = (entry as unknown as { _data?: { uncompressedSize?: unknown } })._data?.uncompressedSize;
  return typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : 0;
}

export async function parseBusinessImportPackage(
  type: BusinessImportType,
  fileName: string,
  buffer: ArrayBuffer | ArrayBufferView,
): Promise<BusinessImportPackage> {
  const lowerName = String(fileName || '').toLocaleLowerCase('en-US');
  if (lowerName.endsWith('.xlsx')) {
    const rows = await parseBusinessImportWorkbook(type, buffer);
    if (rows.some((row) => rowAttachmentReferences(type, row).length)) {
      throw new Error('已填写图片文件名时，请将 Excel 和对应图片一起压缩为 ZIP 导入包后上传');
    }
    return { rows, images: [] };
  }
  if (!lowerName.endsWith('.zip')) throw new Error('仅支持 .xlsx 文件或 .zip 导入包');
  let zip: JSZip;
  try {
    // Do not enable JSZip's checkCRC32 here: it inflates every entry before our
    // size checks and turns an otherwise bounded import into a decompression-bomb risk.
    zip = await JSZip.loadAsync(toArrayBuffer(buffer), { checkCRC32: false, createFolders: false });
  } catch {
    throw new Error('无法读取 ZIP 导入包，请重新压缩后上传');
  }
  const entries = Object.values(zip.files).filter((entry) => !entry.dir && !entry.name.startsWith('__MACOSX/'));
  if (entries.length > BUSINESS_IMPORT_MAX_ZIP_ENTRIES) throw new Error('ZIP 中的文件数量过多，请拆分后重试');
  const workbookEntries = entries.filter((entry) => entry.name.toLocaleLowerCase('en-US').endsWith('.xlsx'));
  if (workbookEntries.length !== 1) throw new Error('ZIP 导入包必须且只能包含 1 个 .xlsx 标准模板');
  if (declaredUncompressedSize(workbookEntries[0]) > BUSINESS_IMPORT_MAX_FILE_BYTES) throw new Error('ZIP 中的 Excel 文件不能超过 20 MB');
  const workbookBuffer = await workbookEntries[0].async('arraybuffer');
  if (workbookBuffer.byteLength > BUSINESS_IMPORT_MAX_FILE_BYTES) throw new Error('ZIP 中的 Excel 文件不能超过 20 MB');
  const rows = await parseBusinessImportWorkbook(type, workbookBuffer);
  const imagesByPath = new Map<string, JSZip.JSZipObject>();
  const imagesByBaseName = new Map<string, JSZip.JSZipObject[]>();
  for (const entry of entries) {
    if (entry === workbookEntries[0]) continue;
    const path = normalizePackagePath(entry.name);
    const key = path.toLocaleLowerCase('zh-CN');
    if (imagesByPath.has(key)) throw new Error(`ZIP 中存在重复文件路径：${path}`);
    imagesByPath.set(key, entry);
    const baseName = path.split('/').pop()!.toLocaleLowerCase('zh-CN');
    imagesByBaseName.set(baseName, [...(imagesByBaseName.get(baseName) || []), entry]);
  }
  const usedEntries = new Set<string>();
  const images: BusinessImportPackageImage[] = [];
  let totalImageBytes = 0;
  for (const row of rows) {
    for (const reference of rowAttachmentReferences(type, row)) {
      const requested = normalizePackagePath(reference.name);
      const exactEntry = imagesByPath.get(requested.toLocaleLowerCase('zh-CN'));
      const baseMatches = imagesByBaseName.get(requested.split('/').pop()!.toLocaleLowerCase('zh-CN')) || [];
      const entry = exactEntry || (baseMatches.length === 1 ? baseMatches[0] : undefined);
      if (!entry) {
        if (baseMatches.length > 1) throw new Error(`第 ${row.rowNumber} 行：图片 ${reference.name} 在 ZIP 中有多个同名文件，请填写完整相对路径`);
        throw new Error(`第 ${row.rowNumber} 行：图片 ${reference.name} 在 ZIP 中不存在`);
      }
      const entryKey = entry.name.toLocaleLowerCase('zh-CN');
      if (usedEntries.has(entryKey)) throw new Error(`第 ${row.rowNumber} 行：图片 ${reference.name} 已被其他导入行引用，每张图片只能对应一条记录`);
      usedEntries.add(entryKey);
      const declaredBytes = declaredUncompressedSize(entry);
      if (declaredBytes > BUSINESS_IMPORT_MAX_IMAGE_BYTES) throw new Error(`第 ${row.rowNumber} 行：图片 ${reference.name} 不能超过 10 MB`);
      if (totalImageBytes + declaredBytes > BUSINESS_IMPORT_MAX_PACKAGE_BYTES) throw new Error('ZIP 中实际使用的图片解压后不能超过 200 MB');
      const bytes = await entry.async('uint8array');
      if (!bytes.length) throw new Error(`第 ${row.rowNumber} 行：图片 ${reference.name} 内容为空`);
      if (bytes.byteLength > BUSINESS_IMPORT_MAX_IMAGE_BYTES) throw new Error(`第 ${row.rowNumber} 行：图片 ${reference.name} 不能超过 10 MB`);
      totalImageBytes += bytes.byteLength;
      if (totalImageBytes > BUSINESS_IMPORT_MAX_PACKAGE_BYTES) throw new Error('ZIP 中实际使用的图片解压后不能超过 200 MB');
      images.push({ rowNumber: row.rowNumber, category: reference.category, name: requested, mimeType: imageMime(requested, bytes), bytes });
    }
  }
  return { rows, images };
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
      input.paymentProofFileName, input.dealEvidenceFileNames,
    ].map(safeWorkbookValue);
  }
  const input = row as Extract<BusinessImportRow, { originalProduct: string }>;
  return [
    input.customerName, input.customerPhone, input.customerWechat, input.thirdPartyOrderNo, input.originalProduct,
    input.recoveryAmount, input.recoveryAt, input.recoveryUserName, input.sourcePlatform, input.sourceShop,
    input.originalAmount, input.originalPaymentAt || '', input.paymentChannel, input.paymentOrderNo, input.paymentAt, input.assistUserName,
    input.creatorName, input.remark, input.recoveryEvidenceFileNames,
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
    sheet.getColumn(offset + 12).numFmt = 'yyyy-mm-dd hh:mm:ss';
    sheet.getColumn(offset + 15).numFmt = 'yyyy-mm-dd hh:mm:ss';
  }
  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}

function cellText(cell: Cell): string {
  return cell.text.trim();
}

function cellAmount(cell: Cell): string | number {
  return typeof cell.value === 'number' ? cell.value : cellText(cell);
}

/**
 * Excel dates are timezone-free serial wall-clock values. ExcelJS represents
 * that serial as a Date whose UTC fields carry the original spreadsheet
 * fields, so using local getters would apply the browser timezone a second
 * time (for example 10:30 -> 18:30 in China Standard Time).
 */
function formatExcelSerialDate(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())} ${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}:${pad(value.getUTCSeconds())}`;
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
  if (cell.value instanceof Date && !Number.isNaN(cell.value.getTime())) return formatExcelSerialDate(cell.value);
  if (typeof cell.value === 'string' && validDateText(cell.value.trim())) return cell.value.trim();
  throw new Error(`第 ${rowNumber} 行：${header}必须是有效日期或时间`);
}

function validMoney(value: string | number): boolean {
  if (typeof value !== 'number') return /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u.test(value);
  if (!Number.isFinite(value)) return false;
  const cents = value * 100;
  const floatingTolerance = Number.EPSILON * Math.max(1, Math.abs(cents)) * 4;
  return Math.abs(cents - Math.round(cents)) <= floatingTolerance;
}

const TEXT_MAX_LENGTHS: Partial<Record<string, number>> = {
  客户姓名: 100, 手机号: 50, 微信: 100, 产品名称: 200, 原产品: 200,
  订单类型: 100, 官方收款渠道: 100, 销售负责人: 100, 挽回人员: 100,
  协助人员: 100, 订单创建人: 100, 来源平台: 100, 来源店铺: 100,
  付款订单号: 191, 第三方平台订单号: 191, 备注: 2000,
  付款截图文件名: 255, 成交资料图片文件名: 2000, 挽回凭证文件名: 2000,
};

function isSafeNumericMainlandMobile(cell: Cell): boolean {
  if (typeof cell.value !== 'number' || !Number.isSafeInteger(cell.value)) return false;
  return /^1[3-9]\d{9}$/u.test(String(cell.value));
}

function isSafeNumericIdentifier(cell: Cell): boolean {
  return typeof cell.value === 'number' && Number.isSafeInteger(cell.value) && cell.value >= 0;
}

function assertTextCells(row: Row, rowNumber: number, headers: readonly string[], indexes: Map<string, number>): void {
  const typedHeaders = new Set(['实付金额', '挽回成交金额', '原产品付款金额', '原订单付款时间', '付款时间', '挽回时间']);
  for (const header of headers) {
    if (typedHeaders.has(header)) continue;
    const column = indexes.get(header);
    if (!column) continue;
    const cell = row.getCell(column);
    if (cell.value !== null && cell.value !== undefined && typeof cell.value !== 'string') {
      // Excel/WPS can persist a manually entered mainland mobile number as a
      // numeric cell even when the template column uses the text format (`@`).
      // Eleven digits are within JS's safe-integer range, so this conversion is
      // lossless. Other numeric identifiers remain blocked to avoid precision or
      // leading-zero loss.
      if (header === '手机号' && isSafeNumericMainlandMobile(cell)) continue;
      if (header === '第三方平台订单号' && isSafeNumericIdentifier(cell)) continue;
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
  const allowed = new Set<string>(type === 'orders'
    ? ORDER_IMPORT_HEADERS
    : [...RECOVERY_IMPORT_HEADERS, ...RECOVERY_IMPORT_HEADER_ALIASES.keys()]);
  const indexes = new Map<string, number>();
  const unknown: string[] = [];
  const duplicate: string[] = [];
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, column) => {
    const rawHeader = cellText(cell);
    if (!rawHeader) return;
    if (!allowed.has(rawHeader)) unknown.push(rawHeader);
    else {
      const header = RECOVERY_IMPORT_HEADER_ALIASES.get(rawHeader) || rawHeader;
      if (indexes.has(header)) duplicate.push(header);
      else indexes.set(header, column);
    }
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
        creatorName: read(row, '订单创建人'), notes: read(row, '备注'),
        paymentProofFileName: read(row, '付款截图文件名'), dealEvidenceFileNames: read(row, '成交资料图片文件名'), remark: '',
      });
      return;
    }
    const recoveryAmount = readAmount(row, '挽回成交金额');
    const originalAmount = readAmount(row, '原产品付款金额');
    assertMoney(recoveryAmount, rowNumber, '挽回成交金额', true, true);
    assertMoney(originalAmount, rowNumber, '原产品付款金额', false, false);
    rows.push({
      rowNumber,
      customerName: requireText('客户姓名'), customerPhone, customerWechat,
      thirdPartyOrderNo: requireText('第三方平台订单号'), originalProduct: requireText('原产品'),
      recoveryAmount, recoveryAt: date('挽回时间', true), recoveryUserName: requireText('挽回人员'),
      sourcePlatform: read(row, '来源平台'), sourceShop: read(row, '来源店铺'), originalAmount,
      originalPaymentAt: date('原订单付款时间', false),
      paymentChannel: read(row, '官方收款渠道'), paymentOrderNo: read(row, '付款订单号'), paymentAt: date('付款时间', false),
      assistUserName: read(row, '协助人员'), creatorName: read(row, '订单创建人'), remark: read(row, '备注'),
      recoveryEvidenceFileNames: read(row, '挽回凭证文件名'),
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
    ? [18, 18, 20, 24, 18, 16, 22, 20, 20, 22, 24, 20, 40, 30, 48]
    : [18, 18, 20, 24, 24, 18, 20, 20, 18, 22, 18, 22, 22, 20, 20, 20, 40, 48]
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
    applyValidation(sheet, 13, 'C', optionColumns[2].values.length);
    applyValidation(sheet, 16, 'D', optionColumns[3].values.length);
    applyValidation(sheet, 17, 'D', optionColumns[3].values.length);
    sheet.getColumn(6).numFmt = '#,##0.00;[Red]-#,##0.00';
    sheet.getColumn(7).numFmt = 'yyyy-mm-dd hh:mm:ss';
    sheet.getColumn(11).numFmt = '#,##0.00;[Red]-#,##0.00';
    sheet.getColumn(12).numFmt = 'yyyy-mm-dd hh:mm:ss';
    sheet.getColumn(15).numFmt = 'yyyy-mm-dd hh:mm:ss';
  }

  instructions.addRows([
    [`极享OS ${isOrder ? '订单' : '售后挽回订单'}批量导入说明`],
    ['必填字段', isOrder
      ? '客户姓名、产品名称、订单类型、实付金额、官方收款渠道、付款时间、销售负责人；手机号和微信至少填写一项。'
      : '客户姓名、第三方平台订单号、原产品、挽回成交金额、挽回时间、挽回人员；手机号和微信至少填写一项。'],
    ['编号字段', '手机号和第三方平台订单号可直接填写常规数字，系统会自动转为文本；需保留前导零或超长编号时，请使用文本格式。'],
    ['导入流程', '上传后先本地校验和服务端预检。被阻止的行必须修正；警告行可以确认导入。'],
    ['图片资料', isOrder
      ? '如需导入图片，请填写付款截图文件名（最多1张）、成交资料图片文件名（最多8张，英文分号分隔），并将 Excel 和图片一起压缩为 ZIP 上传。'
      : '如需导入图片，请填写挽回凭证文件名（最多8张，英文分号分隔），并将 Excel 和图片一起压缩为 ZIP 上传。'],
    ['文件限制', `支持标准 .xlsx 或包含标准 Excel 的 .zip；请勿修改表头；不得使用公式；单次最多 ${BUSINESS_IMPORT_MAX_ROWS} 条。`],
  ]);
  instructions.getColumn(1).width = 20;
  instructions.getColumn(2).width = 96;
  styleHeader(instructions.getRow(1));
  return toArrayBuffer(await workbook.xlsx.writeBuffer());
}
