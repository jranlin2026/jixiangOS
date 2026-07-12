import type { Row } from 'exceljs';
import excelJsBrowserUrl from 'exceljs/dist/exceljs.min.js?url';
import type { Lead } from '../types/lead';
import type { LeadSourceConfig, User } from '../types/settings';
import { LEAD_STATUS, STORAGE_KEYS, normalizeResourceOwnership } from '../shared/utils/constants';
import { getCurrentOperatorName } from '../shared/utils/currentOperator';
import { ensureOrganizationConfigData } from '../shared/utils/organizationConfig';
import { canReceiveLead } from '../shared/utils/permissions';
import { createSuccessResponse, delay, type ApiResponse } from './types';
import { initializeMockData } from './mock';
import { getStorageData } from './mock/storage';
import { leadFlowApi } from './leadFlowApi';
import type { CustomerTag, CustomerTagGroup } from '../types/tag';

const TEXT = {
  name: '\u59d3\u540d*',
  company: '\u516c\u53f8',
  phone: '\u624b\u673a\u53f7',
  wechat: '\u5fae\u4fe1',
  sourceType: '\u8d44\u6e90\u5f52\u5c5e',
  source: '\u7ebf\u7d22\u6765\u6e90*',
  industry: '\u884c\u4e1a',
  city: '\u57ce\u5e02',
  inputBy: '\u7ebf\u7d22\u5f55\u5165\u4eba',
  leadContributor: '\u7ebf\u7d22\u8d21\u732e\u4eba',
  owner: '\u5206\u914d\u9500\u552e',
  tags: '\u6807\u7b7e',
  remark: '\u5907\u6ce8',
  companyResource: '\u516c\u53f8\u8d44\u6e90',
  toAssign: '\u5f85\u5206\u914d',
  nameRequired: '\u59d3\u540d\u4e0d\u80fd\u4e3a\u7a7a',
  contactRequired: '\u624b\u673a\u53f7\u6216\u5fae\u4fe1\u81f3\u5c11\u586b\u5199\u4e00\u9879',
  sourceRequired: '\u7ebf\u7d22\u6765\u6e90\u4e0d\u80fd\u4e3a\u7a7a',
  sourceMissing: '\u7ebf\u7d22\u6765\u6e90\u4e0d\u5b58\u5728',
  inputUserMissing: '\u7ebf\u7d22\u5f55\u5165\u4eba\u4e0d\u5b58\u5728',
  leadContributorMissing: '\u7ebf\u7d22\u8d21\u732e\u4eba\u4e0d\u5b58\u5728',
  leadContributorRequired: '\u4e2a\u4eba\u8d44\u6e90\u5fc5\u987b\u586b\u5199\u7ebf\u7d22\u8d21\u732e\u4eba',
  ownerMissing: '\u5206\u914d\u9500\u552e\u4e0d\u5b58\u5728',
  templateSheet: '\u7ebf\u7d22\u6279\u91cf\u5165\u5e93\u6a21\u677f',
  optionsSheet: '\u5b57\u6bb5\u9009\u9879',
  instructionsSheet: '填写说明',
  exampleName: '\u5f20\u4e09',
  exampleCompany: '\u793a\u4f8b\u516c\u53f8',
  exampleSource: '\u5b98\u7f51',
  exampleIndustry: '\u6559\u80b2',
  exampleCity: '\u4e0a\u6d77',
  exampleTags: '\u91cd\u70b9,\u9ad8\u610f\u5411',
  exampleRemark: '\u793a\u4f8b\u6570\u636e\uff0c\u5bfc\u5165\u524d\u8bf7\u5220\u9664',
} as const;

const TEMPLATE_MAX_ROWS = 500;

export const LEAD_BULK_IMPORT_HEADERS = [
  TEXT.name,
  TEXT.company,
  TEXT.phone,
  TEXT.wechat,
  TEXT.sourceType,
  TEXT.source,
  TEXT.industry,
  TEXT.city,
  TEXT.inputBy,
  TEXT.leadContributor,
  TEXT.owner,
  TEXT.tags,
  TEXT.remark,
] as const;

type Header = (typeof LEAD_BULK_IMPORT_HEADERS)[number];
type ExcelJsNamespace = typeof import('exceljs');
type ExcelJsModule = ExcelJsNamespace & { default?: ExcelJsNamespace };
type WindowWithExcelJs = Window & { ExcelJS?: ExcelJsNamespace };

let browserExcelJsPromise: Promise<ExcelJsNamespace> | null = null;

export interface LeadBulkImportRowResult {
  rowNumber: number;
  name: string;
  status: 'success' | 'failed';
  reason?: string;
  leadId?: string;
}

export interface LeadBulkImportResult {
  successCount: number;
  failureCount: number;
  rows: LeadBulkImportRowResult[];
}

interface SourceOption {
  label: string;
  source: string;
  sourceName: string;
}

interface CleanRow {
  rowNumber: number;
  data: Record<Header, string>;
}

function ensureInit(): void {
  initializeMockData();
}

function toText(value: unknown): string {
  if (value && typeof value === 'object') {
    const cellValue = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> };
    if (cellValue.text !== undefined) return String(cellValue.text).trim();
    if (cellValue.result !== undefined) return String(cellValue.result).trim();
    if (Array.isArray(cellValue.richText)) {
      return cellValue.richText.map((item) => item.text || '').join('').trim();
    }
  }
  return String(value ?? '').trim();
}

function getCell(row: Record<string, unknown>, header: Header): string {
  return toText(row[header]);
}

function loadBrowserExcelJs(): Promise<ExcelJsNamespace> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.reject(new Error('Browser ExcelJS runtime is unavailable'));
  }
  const existing = (window as WindowWithExcelJs).ExcelJS;
  if (existing?.Workbook) return Promise.resolve(existing);
  if (browserExcelJsPromise) return browserExcelJsPromise;

  const promise = new Promise<ExcelJsNamespace>((resolve, reject) => {
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
  }).finally(() => {
    browserExcelJsPromise = null;
  });
  browserExcelJsPromise = promise;

  return promise;
}

async function loadExcelJs(): Promise<ExcelJsNamespace> {
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return loadBrowserExcelJs();
  }
  const importExcelJs = new Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<ExcelJsModule>;
  const imported = await importExcelJs('exceljs');
  return typeof imported.Workbook === 'function' ? imported : imported.default || imported;
}

function getActiveUsers(): User[] {
  return (getStorageData<User[]>(STORAGE_KEYS.USERS) || [])
    .filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active');
}

function buildSourceOptions(): SourceOption[] {
  const configs = (getStorageData<LeadSourceConfig[]>(STORAGE_KEYS.LEAD_SOURCE_CONFIGS) || []).filter((item) => item.isActive);
  const parents = configs
    .filter((item) => !item.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const children = configs
    .filter((item) => item.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return parents.flatMap((parent) => {
    const childOptions = children.filter((child) => child.parentId === parent.id);
    if (!childOptions.length) {
      return [{ label: parent.name, source: parent.name, sourceName: '' }];
    }
    return [
      { label: parent.name, source: parent.name, sourceName: '' },
      ...childOptions.map((child) => ({
        label: `${parent.name}-${child.name}`,
        source: parent.name,
        sourceName: child.name,
      })),
    ];
  });
}

function findByName<T extends { name: string }>(items: T[], name: string): T | undefined {
  const normalized = name.trim().toLowerCase();
  return items.find((item) => item.name.trim().toLowerCase() === normalized);
}

function parseTags(value: string): string[] {
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readRows(arrayBuffer: ArrayBuffer): Promise<CleanRow[]> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const firstSheet = workbook.worksheets[0];
  if (!firstSheet) return [];

  const rows: CleanRow[] = [];
  firstSheet.eachRow({ includeEmpty: false }, (sheetRow: Row, rowNumber: number) => {
    if (rowNumber === 1) return;
    const data = LEAD_BULK_IMPORT_HEADERS.reduce((acc, header, index) => {
      acc[header] = toText(sheetRow.getCell(index + 1).value);
      return acc;
    }, {} as Record<Header, string>);
    if (Object.values(data).some(Boolean)) rows.push({ rowNumber, data });
  });
  return rows;
}

function quoteSheetName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function optionRange(columnIndex: number, optionCount: number): string | null {
  if (!optionCount) return null;
  const column = String.fromCharCode(64 + columnIndex);
  return `${quoteSheetName(TEXT.optionsSheet)}!$${column}$2:$${column}$${optionCount + 1}`;
}

function applyListValidation(sheet: import('exceljs').Worksheet, columnIndex: number, formula: string | null): void {
  if (!formula) return;
  for (let rowIndex = 2; rowIndex <= TEMPLATE_MAX_ROWS; rowIndex += 1) {
    sheet.getCell(rowIndex, columnIndex).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [formula],
      showErrorMessage: true,
      errorTitle: '\u8bf7\u9009\u62e9\u6709\u6548\u9009\u9879',
      error: '\u8bf7\u4ece\u4e0b\u62c9\u5217\u8868\u4e2d\u9009\u62e9\uff0c\u6216\u7559\u7a7a\u7531\u7cfb\u7edf\u81ea\u52a8\u5904\u7406\u3002',
    };
  }
}

function validateRow(row: CleanRow) {
  const data = row.data;
  const errors: string[] = [];
  const users = getActiveUsers();
  const { roles } = ensureOrganizationConfigData();
  const salesUsers = users.filter((user) => canReceiveLead(user, roles));
  const sourceOptions = buildSourceOptions();
  const sourceValue = data[TEXT.source];
  const sourceType = normalizeResourceOwnership(data[TEXT.sourceType] || TEXT.companyResource);
  const inputByValue = data[TEXT.inputBy];
  const contributorValue = data[TEXT.leadContributor];
  const ownerValue = data[TEXT.owner];
  const requestedTags = parseTags(data[TEXT.tags]);
  const groups = (getStorageData<CustomerTagGroup[]>(STORAGE_KEYS.TAG_GROUPS) || []).filter((group) => group.isActive && (group.scope === 'lead' || group.scope === 'both'));
  const groupIds = new Set(groups.map((group) => group.id));
  const presetTags = (getStorageData<CustomerTag[]>(STORAGE_KEYS.TAGS) || []).filter((tag) => tag.isActive && groupIds.has(tag.groupId));
  const resolvedTags = requestedTags.map((label) => presetTags.find((tag) => tag.name.trim().toLowerCase() === label.toLowerCase()));

  const sourceOption = sourceValue
    ? sourceOptions.find((option) => option.label.trim().toLowerCase() === sourceValue.trim().toLowerCase())
    : undefined;
  const inputUser = inputByValue ? findByName(users, inputByValue) : undefined;
  const contributorUser = contributorValue ? findByName(users, contributorValue) : undefined;
  const ownerUser = ownerValue && ownerValue !== TEXT.toAssign ? findByName(salesUsers, ownerValue) : undefined;
  const inputBy = inputByValue ? inputUser?.name : getCurrentOperatorName(users[0]?.name || '');
  const owner = ownerValue ? (ownerValue === TEXT.toAssign ? TEXT.toAssign : ownerUser?.name) : TEXT.toAssign;

  if (!data[TEXT.name]) errors.push(TEXT.nameRequired);
  if (!data[TEXT.phone] && !data[TEXT.wechat]) errors.push(TEXT.contactRequired);
  if (!sourceValue) errors.push(TEXT.sourceRequired);
  if (sourceValue && !sourceOption) errors.push(`${TEXT.sourceMissing}\uff1a${sourceValue}`);
  if (inputByValue && !inputUser) errors.push(`${TEXT.inputUserMissing}\uff1a${inputByValue}`);
  if (contributorValue && !contributorUser) errors.push(`${TEXT.leadContributorMissing}\uff1a${contributorValue}`);
  if (sourceType === '\u4e2a\u4eba\u8d44\u6e90' && !contributorUser) errors.push(TEXT.leadContributorRequired);
  if (ownerValue && ownerValue !== TEXT.toAssign && !ownerUser) errors.push(`${TEXT.ownerMissing}\uff1a${ownerValue}`);
  requestedTags.forEach((label, index) => {
    if (!resolvedTags[index]) errors.push(`标签“${label}”未在系统设置中预设`);
  });

  if (errors.length) {
    return { errors, payload: null };
  }

  const payload: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'followUpRecords'> = {
    name: data[TEXT.name],
    company: data[TEXT.company],
    phone: data[TEXT.phone],
    wechat: data[TEXT.wechat],
    source: sourceOption?.source || sourceValue,
    sourceName: sourceOption?.sourceName || '',
    sourceType,
    status: LEAD_STATUS.NEW,
    owner: owner || TEXT.toAssign,
    inputBy,
    leadContributorId: contributorUser?.id,
    leadContributorName: contributorUser?.name,
    industry: data[TEXT.industry],
    city: data[TEXT.city],
    manualTagIds: resolvedTags.filter((tag): tag is CustomerTag => Boolean(tag)).map((tag) => tag.id),
    tags: resolvedTags.filter((tag): tag is CustomerTag => Boolean(tag)).map((tag) => tag.name),
    remark: data[TEXT.remark],
  };

  return { errors, payload };
}

function toArrayBuffer(value: ArrayBuffer | ArrayBufferView): ArrayBuffer {
  const view = value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

async function createTemplateWorkbook(): Promise<ArrayBuffer> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(TEXT.templateSheet);
  const instructionsSheet = workbook.addWorksheet(TEXT.instructionsSheet);
  const optionsSheet = workbook.addWorksheet(TEXT.optionsSheet);
  const users = getActiveUsers();
  const { roles } = ensureOrganizationConfigData();
  const sourceOptions = buildSourceOptions().map((option) => option.label);
  const userNames = users.map((user) => user.name);
  const salesNames = users.filter((user) => canReceiveLead(user, roles)).map((user) => user.name);
  const optionColumns = [
    { title: TEXT.sourceType, options: [TEXT.companyResource, '\u4e2a\u4eba\u8d44\u6e90'] },
    { title: TEXT.source, options: sourceOptions },
    { title: TEXT.inputBy, options: userNames },
    { title: TEXT.leadContributor, options: userNames },
    { title: TEXT.owner, options: [TEXT.toAssign, ...salesNames] },
  ];

  optionsSheet.addRow(optionColumns.map((column) => column.title));
  const maxOptionRows = Math.max(...optionColumns.map((column) => column.options.length), 1);
  for (let rowIndex = 0; rowIndex < maxOptionRows; rowIndex += 1) {
    optionsSheet.addRow(optionColumns.map((column) => column.options[rowIndex] || ''));
  }
  optionsSheet.columns = optionColumns.map((column) => ({ width: Math.max(16, column.title.length + 8) }));
  optionsSheet.state = 'hidden';

  instructionsSheet.addRows([
    ['线索批量入库填写说明'],
    ['必填字段', '姓名、线索来源、手机号/微信二选一'],
    ['条件必填', '资源归属为“个人资源”时，必须填写线索贡献人'],
    ['手机号格式', '国内手机号填写 11 位，例如 13800000000；也支持 +8613800000000'],
    ['线索来源', '必须从模板下拉选项中选择；下拉选项会按系统设置里的最新线索来源自动生成'],
    ['资源归属', '只能选择“公司资源”或“个人资源”；不填默认公司资源'],
    ['线索录入人', '可留空，留空时默认当前导入人；填写时必须是系统内在职员工姓名'],
    ['线索贡献人', '个人资源必填；填写时必须是系统内在职员工姓名'],
    ['分配销售', '可留空或选择“待分配”；填写员工时必须是可接收线索的在职员工'],
    ['标签', '多个标签用英文逗号分隔，例如：重点,高意向'],
    ['查重规则', '系统会按手机号或微信查重；已存在客户或线索时，该行会导入失败'],
    ['使用提醒', '请勿修改模板表头和顺序；导入前删除示例行；仅支持 .xlsx 文件'],
  ]);
  instructionsSheet.getColumn(1).width = 18;
  instructionsSheet.getColumn(2).width = 92;
  instructionsSheet.getRow(1).font = { bold: true, size: 14 };
  instructionsSheet.getRow(1).height = 24;
  instructionsSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  instructionsSheet.getCell('B1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
  instructionsSheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFDDE4EC' } },
        left: { style: 'thin', color: { argb: 'FFDDE4EC' } },
        bottom: { style: 'thin', color: { argb: 'FFDDE4EC' } },
        right: { style: 'thin', color: { argb: 'FFDDE4EC' } },
      };
    });
    if (rowNumber > 1) row.getCell(1).font = { bold: true };
  });

  sheet.addRows([
    [...LEAD_BULK_IMPORT_HEADERS],
    [
      TEXT.exampleName,
      TEXT.exampleCompany,
      '13800000000',
      'wx_zhangsan',
      TEXT.companyResource,
      TEXT.exampleSource,
      TEXT.exampleIndustry,
      TEXT.exampleCity,
      '',
      '',
      '',
      TEXT.exampleTags,
      TEXT.exampleRemark,
    ],
  ]);
  sheet.columns = LEAD_BULK_IMPORT_HEADERS.map((header) => ({
    width: Math.max(14, header.length + 8),
  }));
  sheet.getRow(1).font = { bold: true };
  applyListValidation(sheet, LEAD_BULK_IMPORT_HEADERS.indexOf(TEXT.sourceType) + 1, optionRange(1, optionColumns[0].options.length));
  applyListValidation(sheet, LEAD_BULK_IMPORT_HEADERS.indexOf(TEXT.source) + 1, optionRange(2, optionColumns[1].options.length));
  applyListValidation(sheet, LEAD_BULK_IMPORT_HEADERS.indexOf(TEXT.inputBy) + 1, optionRange(3, optionColumns[2].options.length));
  applyListValidation(sheet, LEAD_BULK_IMPORT_HEADERS.indexOf(TEXT.leadContributor) + 1, optionRange(4, optionColumns[3].options.length));
  applyListValidation(sheet, LEAD_BULK_IMPORT_HEADERS.indexOf(TEXT.owner) + 1, optionRange(5, optionColumns[4].options.length));
  const buffer = await workbook.xlsx.writeBuffer();
  return toArrayBuffer(buffer);
}

async function importWorkbook(arrayBuffer: ArrayBuffer): Promise<ApiResponse<LeadBulkImportResult>> {
  ensureInit();
  await delay(80);

  const results: LeadBulkImportRowResult[] = [];
  for (const row of await readRows(arrayBuffer)) {
    const { errors, payload } = validateRow(row);
    const rowName = row.data[TEXT.name] || row.data[TEXT.company] || `Row ${row.rowNumber}`;

    if (!payload || errors.length) {
      results.push({
        rowNumber: row.rowNumber,
        name: rowName,
        status: 'failed',
        reason: errors.join('\uff1b'),
      });
      continue;
    }

    const intakeResult = leadFlowApi.intakeLead(payload);
    if (intakeResult.lead) {
      results.push({
        rowNumber: row.rowNumber,
        name: payload.name,
        status: 'success',
        leadId: intakeResult.lead.id,
      });
    } else {
      results.push({
        rowNumber: row.rowNumber,
        name: payload.name,
        status: 'failed',
        reason: intakeResult.message,
      });
    }
  }

  const successCount = results.filter((item) => item.status === 'success').length;
  return createSuccessResponse({
    successCount,
    failureCount: results.length - successCount,
    rows: results,
  });
}

export const leadBulkImportApi = {
  createTemplateWorkbook,
  importWorkbook,
};
