import type { Row } from 'exceljs';
import excelJsBrowserUrl from 'exceljs/dist/exceljs.min.js?url';
import { v4 as uuidv4 } from 'uuid';
import type { Customer, CustomerActivityRecord } from '../types/customer';
import type { CustomerTag, CustomerTagCatalog } from '../types/tag';
import type { LeadSourceConfig, User } from '../types/settings';
import { DEFAULT_LEAD_SOURCE_CONFIGS, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { getStorageData, setStorageData } from './mock/storage';
import { backendRequest, shouldUseBackendApi } from './backendClient';
import { createErrorResponse, createSuccessResponse, delay, type ApiResponse } from './types';
import {
  createCustomerTag,
  createCustomerTagGroup,
  fetchCustomerTagCatalog,
} from './customerTagApi';

export type CrmMigrationFileKey =
  | 'teamCustomers'
  | 'teamContacts'
  | 'publicPool';

export type CrmMigrationFileMap = Partial<Record<CrmMigrationFileKey, File>>;

export type MigrationRow = Record<string, string>;

export interface CrmMigrationTables {
  teamCustomers?: MigrationRow[];
  teamContacts?: MigrationRow[];
  publicPool?: MigrationRow[];
}

export interface CrmMigrationSourceCandidate {
  parentName: string;
  childName: string;
  label: string;
}

export interface CrmMigrationNameGroup {
  all: string[];
  matched: string[];
  missing: string[];
  system: string[];
}

export interface CrmMigrationSourceGroup {
  all: CrmMigrationSourceCandidate[];
  matched: CrmMigrationSourceCandidate[];
  missing: CrmMigrationSourceCandidate[];
}

export interface CrmMigrationPrecheckResult {
  generatedAt: string;
  fileCounts: Record<CrmMigrationFileKey, number>;
  employees: CrmMigrationNameGroup;
  departments: string[];
  sources: CrmMigrationSourceGroup;
  tags: CrmMigrationNameGroup;
  customerProgresses: string[];
  customerStats: {
    teamCustomers: number;
    publicPoolCustomers: number;
    teamContacts: number;
    uniqueTeamPhones: number;
    uniquePublicPhones: number;
  };
  importSuggestion: {
    teamCustomerAction: string;
    publicPoolAction: string;
  };
}

export interface CrmMigrationImportResult {
  customers: {
    teamCreated: number;
    publicCreated: number;
    skippedDuplicates: number;
  };
}

type CrmMigrationPersistenceResult = {
  createdIds: string[];
  skippedDuplicates: number;
};

export interface CrmMigrationExistingData {
  users?: Array<Pick<User, 'name' | 'isActive' | 'employmentStatus'>>;
  leadSourceConfigs?: LeadSourceConfig[];
  tags?: Array<Pick<CustomerTag, 'name' | 'isActive'>>;
}

type ExcelJsNamespace = typeof import('exceljs');
type ExcelJsModule = ExcelJsNamespace & { default?: ExcelJsNamespace };
type WindowWithExcelJs = Window & { ExcelJS?: ExcelJsNamespace };

let browserExcelJsPromise: Promise<ExcelJsNamespace> | null = null;

const FILE_KEYS: CrmMigrationFileKey[] = [
  'teamCustomers',
  'teamContacts',
  'publicPool',
];

const EMPTY_FILE_COUNTS: Record<CrmMigrationFileKey, number> = {
  teamCustomers: 0,
  teamContacts: 0,
  publicPool: 0,
};

const EMPLOYEE_FIELDS = [
  '客户跟进人',
  '上一个跟进人',
  '客户创建人',
  '线索录入人',
  '最后跟进人',
  '当前商机接收人',
  '当前跟进人',
  '分配人',
  '创建人',
];

const DEPARTMENT_FIELDS = ['部门', '上一个跟进人部门', '最后跟进人部门', '所属部门'];
const TAG_FIELDS = ['标签', '客户标签'];
const SOURCE_FIELDS = ['来源', '线索来源', '商机来源'];
const PROGRESS_FIELDS = ['客户进展', '客户状态', '阶段'];

const SYSTEM_NAMES = new Set(['系统', '系统管理员', '自动分配']);
const EMPTY_MARKERS = new Set(['', '-', '--', '无', '暂无', '待分配', '未分配']);

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

function normalizeValue(value: unknown): string {
  return toText(value).replace(/\uFEFF/g, '').replace(/\s+/g, ' ').trim();
}

function getAny(row: MigrationRow, fields: string[]): string {
  for (const field of fields) {
    const value = normalizeValue(row[field]);
    if (value) return value;
  }
  return '';
}

function normalizePhone(value: unknown): string {
  const digits = normalizeValue(value).replace(/\D/g, '');
  if (digits.length > 11 && digits.startsWith('86')) return digits.slice(-11);
  return digits;
}

function splitList(value: string): string[] {
  return normalizeValue(value)
    .split(/[,\uFF0C\u3001;；/|]+/)
    .map((item) => item.trim())
    .filter((item) => item && !EMPTY_MARKERS.has(item));
}

function addSorted(set: Set<string>, value: string): void {
  const normalized = normalizeValue(value);
  if (!normalized || EMPTY_MARKERS.has(normalized)) return;
  set.add(normalized);
}

function addNameValues(set: Set<string>, systemSet: Set<string>, value: string): void {
  splitList(value).forEach((name) => {
    if (SYSTEM_NAMES.has(name)) {
      systemSet.add(name);
      return;
    }
    set.add(name);
  });
}

function collectPhones(rows: MigrationRow[] = []): Set<string> {
  const phones = new Set<string>();
  rows.forEach((row) => {
    ['手机', '手机1', '手机号', '联系方式'].forEach((field) => {
      const phone = normalizePhone(row[field]);
      if (phone) phones.add(phone);
    });
  });
  return phones;
}

function collectWechat(rows: Array<{ wechat?: string }> = []): Set<string> {
  return new Set(rows.map((row) => normalizeValue(row.wechat)).filter(Boolean));
}

function getRowPhone(row: MigrationRow): string {
  return normalizePhone(row['手机']) || normalizePhone(row['手机1']) || normalizePhone(row['手机号']) || normalizePhone(row['联系方式']);
}

function getRowWechat(row: MigrationRow): string {
  return getAny(row, ['微信', '客户微信', '微信号/昵称']);
}

function getRowName(row: MigrationRow): string {
  return getAny(row, ['客户全名', '客户名称', '联系人姓名', '姓名', '客户']);
}

function customerReferenceKey(row: MigrationRow): string {
  return normalizeValue(getAny(row, ['客户全名', '客户名称', '公司名称', '企业名称'])).toLowerCase();
}

function buildCustomerContactSummaries(rows: MigrationRow[] = []): Map<string, string[]> {
  const contactsByCustomer = new Map<string, string[]>();
  rows.forEach((row) => {
    const customerKey = customerReferenceKey(row);
    if (!customerKey) return;
    const name = getAny(row, ['姓名', '联系人姓名']) || '未命名联系人';
    const title = getAny(row, ['职务', '称呼']);
    const phone = getRowPhone(row);
    const wechat = getRowWechat(row);
    const details = [title, phone, wechat].filter(Boolean).join('，');
    const detail = details ? `${name}（${details}）` : name;
    const contacts = contactsByCustomer.get(customerKey) || [];
    if (!contacts.includes(detail)) contacts.push(detail);
    contactsByCustomer.set(customerKey, contacts);
  });
  return contactsByCustomer;
}

function getSourceParts(row: MigrationRow): { source: string; sourceName: string } {
  const parsed = parseMigrationSource(getAny(row, SOURCE_FIELDS));
  if (!parsed) return { source: '', sourceName: '' };
  return { source: parsed.parentName === '历史导入' ? parsed.childName : parsed.parentName, sourceName: parsed.parentName === '历史导入' ? '' : parsed.childName };
}

function getTags(row: MigrationRow): string[] {
  return TAG_FIELDS.flatMap((field) => splitList(row[field]));
}

function createImportActivity(content: string, now: string): CustomerActivityRecord {
  return {
    id: `act-${uuidv4().slice(0, 8)}`,
    type: 'create',
    title: 'EC CRM迁移导入',
    content,
    operator: '系统',
    createdAt: now,
  };
}

function createMigrationFollowActivity(content: string, now: string): CustomerActivityRecord {
  return {
    id: `act-${uuidv4().slice(0, 8)}`,
    type: 'follow',
    title: '历史最后跟进记录',
    content,
    operator: '系统',
    createdAt: now,
  };
}

function createCustomerFromMigrationRow(
  row: MigrationRow,
  scope: 'team' | 'public',
  now: string,
  contactSummaries: string[] = [],
): Customer {
  const name = getRowName(row) || getRowPhone(row) || getRowWechat(row) || '历史客户';
  const phone = getRowPhone(row);
  const wechat = getRowWechat(row);
  const source = getSourceParts(row);
  const lastFollowUpRecord = normalizeValue(row['最后跟进记录']);
  const owner = scope === 'public'
    ? '公海'
    : getAny(row, ['客户跟进人', '最后跟进人', '当前跟进人', '上一个跟进人']) || '待分配';
  const remarkParts = [
    row['客户备注'] || row['备注'] || '',
    row['CRMID'] ? `EC CRMID：${row['CRMID']}` : '',
    row['所属公海'] ? `所属公海：${row['所属公海']}` : '',
    contactSummaries.length ? `企业联系人：${contactSummaries.join('；')}` : '',
  ].filter(Boolean);

  return {
    id: `cust-mig-${uuidv4().slice(0, 8)}`,
    name,
    company: row['公司名称'] || row['公司'] || row['企业名称'] || '',
    phone,
    wechat,
    industry: row['客户行业'] || row['行业'] || '',
    city: row['城市'] || '',
    customerLevel: 'L1',
    lifecycleStatusCode: scope === 'public' ? 'public_pool' : 'pending_followup',
    lifecycleStatusUpdatedAt: now,
    publicPoolAt: scope === 'public' ? now : undefined,
    owner,
    previousOwner: getAny(row, ['上一个跟进人']),
    ownerSince: now,
    ownerProtectDays: 730,
    totalSpent: 0,
    orderCount: 0,
    growthPath: [],
    growthRecords: [],
    activityRecords: [
      ...(lastFollowUpRecord ? [createMigrationFollowActivity(lastFollowUpRecord, now)] : []),
      createImportActivity(`从EC CRM${scope === 'public' ? '公海客户' : '团队客户'}导入`, now),
    ],
    tags: getTags(row),
    leadInputBy: getAny(row, ['线索录入人', '客户创建人', '创建人']),
    leadSource: source.source,
    sourceName: source.sourceName,
    sourceType: '公司资源',
    remark: remarkParts.join('\n'),
    createdAt: now,
    updatedAt: now,
  };
}

function hasSameContact(phone: string, wechat: string, phones: Set<string>, wechats: Set<string>): boolean {
  return Boolean((phone && phones.has(phone)) || (wechat && wechats.has(wechat)));
}

export function parseMigrationSource(value: string): CrmMigrationSourceCandidate | null {
  const normalized = normalizeValue(value);
  if (!normalized || EMPTY_MARKERS.has(normalized)) return null;

  const source = normalized.replace(/\s*[-－]\s*/g, '-').replace(/\s*[\/／]\s*/g, '/');
  const slashParts = source.split('/').map((item) => item.trim()).filter(Boolean);
  if (slashParts.length >= 2) {
    return {
      parentName: slashParts[0],
      childName: slashParts.slice(1).join('-'),
      label: `${slashParts[0]}-${slashParts.slice(1).join('-')}`,
    };
  }

  const hyphenParts = source.split('-').map((item) => item.trim()).filter(Boolean);
  if (hyphenParts.length >= 2) {
    return {
      parentName: hyphenParts[0],
      childName: hyphenParts.slice(1).join('-'),
      label: `${hyphenParts[0]}-${hyphenParts.slice(1).join('-')}`,
    };
  }

  return {
    parentName: '历史导入',
    childName: source,
    label: `历史导入-${source}`,
  };
}

function sourceKey(source: CrmMigrationSourceCandidate): string {
  return `${source.parentName}::${source.childName}`.toLowerCase();
}

function getExistingData(overrides: CrmMigrationExistingData = {}): Required<CrmMigrationExistingData> {
  const hasCompleteOverrides = Boolean(overrides.users && overrides.leadSourceConfigs && overrides.tags);
  if (!hasCompleteOverrides) ensureInit();
  return {
    users: overrides.users || getStorageData<User[]>(STORAGE_KEYS.USERS) || [],
    leadSourceConfigs: overrides.leadSourceConfigs || getStorageData<LeadSourceConfig[]>(STORAGE_KEYS.LEAD_SOURCE_CONFIGS) || DEFAULT_LEAD_SOURCE_CONFIGS,
    tags: overrides.tags || getStorageData<CustomerTag[]>(STORAGE_KEYS.TAGS) || [],
  };
}

function buildExistingSourceKeys(configs: LeadSourceConfig[]): Set<string> {
  const parents = new Map(configs.filter((item) => !item.parentId).map((item) => [item.id, item.name]));
  const keys = new Set<string>();

  configs.forEach((item) => {
    if (!item.parentId) return;
    const parentName = parents.get(item.parentId);
    if (!parentName) return;
    keys.add(`${parentName}::${item.name}`.toLowerCase());
  });

  configs.filter((item) => !item.parentId).forEach((item) => {
    const hasChildren = configs.some((child) => child.parentId === item.id);
    if (!hasChildren) keys.add(`历史导入::${item.name}`.toLowerCase());
  });

  return keys;
}

function groupNames(values: Set<string>, existingNames: Set<string>, systemSet: Set<string> = new Set()): CrmMigrationNameGroup {
  const all = [...values].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  return {
    all,
    matched: all.filter((name) => existingNames.has(name.toLowerCase())),
    missing: all.filter((name) => !existingNames.has(name.toLowerCase())),
    system: [...systemSet].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
  };
}

export function analyzeCrmMigrationTables(
  tables: CrmMigrationTables,
  existingOverrides: CrmMigrationExistingData = {},
): CrmMigrationPrecheckResult {
  const existing = getExistingData(existingOverrides);
  const users = existing.users.filter((user) => user.isActive && (user.employmentStatus || 'active') === 'active');
  const existingUserNames = new Set(users.map((user) => user.name.trim().toLowerCase()).filter(Boolean));
  const existingTagNames = new Set(existing.tags.map((tag) => tag.name.trim().toLowerCase()).filter(Boolean));
  const existingSourceKeys = buildExistingSourceKeys(existing.leadSourceConfigs);

  const employeeNames = new Set<string>();
  const systemNames = new Set<string>();
  const departments = new Set<string>();
  const tags = new Set<string>();
  const progresses = new Set<string>();
  const sourcesByKey = new Map<string, CrmMigrationSourceCandidate>();

  const allRows = FILE_KEYS.flatMap((key) => tables[key] || []);
  allRows.forEach((row) => {
    EMPLOYEE_FIELDS.forEach((field) => addNameValues(employeeNames, systemNames, row[field]));
    DEPARTMENT_FIELDS.forEach((field) => addSorted(departments, row[field]));
    TAG_FIELDS.forEach((field) => splitList(row[field]).forEach((tag) => tags.add(tag)));
    PROGRESS_FIELDS.forEach((field) => addSorted(progresses, row[field]));
    SOURCE_FIELDS.forEach((field) => {
      const source = parseMigrationSource(row[field]);
      if (source) sourcesByKey.set(sourceKey(source), source);
    });
  });

  const allSources = [...sourcesByKey.values()].sort((a, b) => a.label.localeCompare(b.label, 'zh-Hans-CN'));
  const matchedSources = allSources.filter((source) => existingSourceKeys.has(sourceKey(source)));
  const missingSources = allSources.filter((source) => !existingSourceKeys.has(sourceKey(source)));

  const teamPhones = collectPhones(tables.teamCustomers);
  const publicPhones = collectPhones(tables.publicPool);

  return {
    generatedAt: new Date().toISOString(),
    fileCounts: FILE_KEYS.reduce((acc, key) => {
      acc[key] = (tables[key] || []).length;
      return acc;
    }, { ...EMPTY_FILE_COUNTS }),
    employees: groupNames(employeeNames, existingUserNames, systemNames),
    departments: [...departments].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    sources: {
      all: allSources,
      matched: matchedSources,
      missing: missingSources,
    },
    tags: groupNames(tags, existingTagNames),
    customerProgresses: [...progresses].sort((a, b) => a.localeCompare(b, 'zh-Hans-CN')),
    customerStats: {
      teamCustomers: (tables.teamCustomers || []).length,
      publicPoolCustomers: (tables.publicPool || []).length,
      teamContacts: (tables.teamContacts || []).length,
      uniqueTeamPhones: teamPhones.size,
      uniquePublicPhones: publicPhones.size,
    },
    importSuggestion: {
      teamCustomerAction: '导入到客户列表，保留原客户跟进人和最后跟进记录',
      publicPoolAction: '导入到公海客户，资源归属标记为公海',
    },
  };
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

async function readXlsxRows(file: File): Promise<MigrationRow[]> {
  const ExcelJS = await loadExcelJs();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const firstSheet = workbook.worksheets[0];
  if (!firstSheet) return [];

  const headers: string[] = [];
  const rows: MigrationRow[] = [];
  firstSheet.eachRow({ includeEmpty: false }, (sheetRow: Row, rowNumber: number) => {
    if (rowNumber === 1) {
      sheetRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        headers[colNumber - 1] = normalizeValue(cell.value);
      });
      return;
    }
    const row: MigrationRow = {};
    headers.forEach((header, index) => {
      if (!header) return;
      row[header] = normalizeValue(sheetRow.getCell(index + 1).value);
    });
    if (Object.values(row).some(Boolean)) rows.push(row);
  });
  return rows;
}

function parseCsv(text: string): MigrationRow[] {
  const cleanText = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < cleanText.length; index += 1) {
    const char = cleanText[index];
    const next = cleanText[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      row.push(current);
      current = '';
      continue;
    }
    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current);
      if (row.some((cell) => normalizeValue(cell))) rows.push(row);
      row = [];
      current = '';
      continue;
    }
    current += char;
  }
  row.push(current);
  if (row.some((cell) => normalizeValue(cell))) rows.push(row);

  const headers = (rows.shift() || []).map(normalizeValue);
  return rows.map((cells) => headers.reduce((acc, header, index) => {
    if (header) acc[header] = normalizeValue(cells[index]);
    return acc;
  }, {} as MigrationRow)).filter((item) => Object.values(item).some(Boolean));
}

async function readCsvRows(file: File): Promise<MigrationRow[]> {
  const text = await file.text();
  return parseCsv(text);
}

async function readTableFile(file: File): Promise<MigrationRow[]> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.csv')) return readCsvRows(file);
  return readXlsxRows(file);
}

async function precheckFiles(files: CrmMigrationFileMap): Promise<ApiResponse<CrmMigrationPrecheckResult>> {
  ensureInit();
  await delay(120);
  const entries = await Promise.all(FILE_KEYS.map(async (key) => {
    const file = files[key];
    return [key, file ? await readTableFile(file) : []] as const;
  }));
  const tables = entries.reduce((acc, [key, rows]) => {
    acc[key] = rows;
    return acc;
  }, {} as CrmMigrationTables);
  const catalogResponse = await fetchCustomerTagCatalog('all', true);
  if (catalogResponse.code !== 0 || !catalogResponse.data) return catalogResponse as unknown as ApiResponse<CrmMigrationPrecheckResult>;
  return createSuccessResponse(analyzeCrmMigrationTables(tables, { tags: catalogResponse.data.tags }));
}

async function persistImportedMigration(customers: Customer[]): Promise<ApiResponse<CrmMigrationPersistenceResult>> {
  if (shouldUseBackendApi()) {
    const response = await backendRequest<CrmMigrationPersistenceResult>('/crm-migration/import', {
      method: 'POST',
      body: JSON.stringify({ customers }),
    });
    if (response.code !== 0) {
      return response;
    }
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    return response;
  } else {
    setStorageData(STORAGE_KEYS.CUSTOMERS, customers);
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
    return createSuccessResponse({ createdIds: customers.map((customer) => customer.id), skippedDuplicates: 0 });
  }
}

async function importMigrationTables(tables: CrmMigrationTables): Promise<ApiResponse<CrmMigrationImportResult>> {
  ensureInit();
  const now = new Date().toISOString();
  // Import payloads must be derived only from the files selected in this run.
  // Reusing browser cache here causes stale customers to be posted again.
  const customers: Customer[] = [];
  const contactSummariesByCustomer = buildCustomerContactSummaries(tables.teamContacts);
  const customerPhones = collectPhones(customers.map((customer) => ({ 手机: customer.phone })));
  const customerWechats = collectWechat(customers.map((customer) => ({ wechat: customer.wechat })));
  const customerScopes = new Map<string, 'team' | 'public'>();
  const result: CrmMigrationImportResult = {
    customers: {
      teamCreated: 0,
      publicCreated: 0,
      skippedDuplicates: 0,
    },
  };

  const importCustomerRows = (rows: MigrationRow[], scope: 'team' | 'public') => {
    rows.forEach((row) => {
      const phone = getRowPhone(row);
      const wechat = getRowWechat(row);
      if (hasSameContact(phone, wechat, customerPhones, customerWechats)) {
        result.customers.skippedDuplicates += 1;
        return;
      }
      const customer = createCustomerFromMigrationRow(
        row,
        scope,
        now,
        contactSummariesByCustomer.get(customerReferenceKey(row)),
      );
      customers.unshift(customer);
      customerScopes.set(customer.id, scope);
      if (customer.phone) customerPhones.add(customer.phone);
      if (customer.wechat) customerWechats.add(customer.wechat);
    });
  };

  importCustomerRows(tables.teamCustomers || [], 'team');
  importCustomerRows(tables.publicPool || [], 'public');

  const persistResult = await persistImportedMigration(customers);
  if (persistResult.code !== 0) {
    return createErrorResponse(`EC CRM 迁移数据保存失败：${persistResult.message || '未知错误'}`);
  }

  const createdIds = new Set(persistResult.data?.createdIds || customers.map((customer) => customer.id));
  customers.forEach((customer) => {
    if (!createdIds.has(customer.id)) return;
    if (customerScopes.get(customer.id) === 'team') result.customers.teamCreated += 1;
    else result.customers.publicCreated += 1;
  });
  result.customers.skippedDuplicates += persistResult.data?.skippedDuplicates || 0;

  return createSuccessResponse(result);
}

async function importFiles(files: CrmMigrationFileMap): Promise<ApiResponse<CrmMigrationImportResult>> {
  ensureInit();
  await delay(160);
  const entries = await Promise.all(FILE_KEYS.map(async (key) => {
    const file = files[key];
    return [key, file ? await readTableFile(file) : []] as const;
  }));
  const tables = entries.reduce((acc, [key, rows]) => {
    acc[key] = rows;
    return acc;
  }, {} as CrmMigrationTables);
  return importMigrationTables(tables);
}

function ensureSourceParent(configs: LeadSourceConfig[], parentName: string, now: string): LeadSourceConfig {
  const existing = configs.find((item) => !item.parentId && item.name.trim().toLowerCase() === parentName.trim().toLowerCase());
  if (existing) return existing;
  const parent: LeadSourceConfig = {
    id: `ls-mig-parent-${uuidv4().slice(0, 8)}`,
    name: parentName,
    isActive: true,
    sortOrder: configs.filter((item) => !item.parentId).length + 1,
    description: 'EC CRM 迁移预同步创建',
    createdAt: now,
    updatedAt: now,
  };
  configs.push(parent);
  return parent;
}

async function syncLeadSources(sources: CrmMigrationSourceCandidate[]): Promise<ApiResponse<{ created: number }>> {
  ensureInit();
  await delay(120);
  const now = new Date().toISOString();
  const configs = [...(getStorageData<LeadSourceConfig[]>(STORAGE_KEYS.LEAD_SOURCE_CONFIGS) || DEFAULT_LEAD_SOURCE_CONFIGS)];
  const beforeCount = configs.length;

  sources.forEach((source) => {
    const parent = ensureSourceParent(configs, source.parentName, now);
    const exists = configs.some((item) => (
      item.parentId === parent.id && item.name.trim().toLowerCase() === source.childName.trim().toLowerCase()
    ));
    if (exists) return;
    configs.push({
      id: `ls-mig-child-${uuidv4().slice(0, 8)}`,
      name: source.childName,
      parentId: parent.id,
      isActive: true,
      sortOrder: configs.filter((item) => item.parentId === parent.id).length + 1,
      description: 'EC CRM 迁移预同步创建',
      createdAt: now,
      updatedAt: now,
    });
  });

  setStorageData(STORAGE_KEYS.LEAD_SOURCE_CONFIGS, configs);
  return createSuccessResponse({ created: configs.length - beforeCount });
}

async function syncTags(tagNames: string[]): Promise<ApiResponse<{ created: number }>> {
  const loadCatalog = async (): Promise<ApiResponse<CustomerTagCatalog>> => fetchCustomerTagCatalog('all', true);
  let catalogResponse = await loadCatalog();
  if (catalogResponse.code !== 0 || !catalogResponse.data) return catalogResponse as unknown as ApiResponse<{ created: number }>;
  let catalog = catalogResponse.data;
  const normalizedNames = [...new Map(tagNames.map((item) => normalizeValue(item)).filter(Boolean).map((item) => [item.toLowerCase(), item])).values()];
  const hasName = (name: string) => catalog.tags.some((tag) => tag.name.trim().toLowerCase() === name.toLowerCase());
  const missing = normalizedNames.filter((item) => !hasName(item));
  if (!missing.length) return createSuccessResponse({ created: 0 });

  const legacyGroupName = '历史未归类';
  let group = catalog.groups.find((item) => item.name.trim().toLowerCase() === legacyGroupName.toLowerCase());
  if (!group) {
    const createdGroup = await createCustomerTagGroup({
      name: legacyGroupName,
      color: '#64748b',
      selectionMode: 'multiple',
      scope: 'both',
      isActive: true,
    });
    if (createdGroup.code === 0 && createdGroup.data) {
      group = createdGroup.data;
    } else if (createdGroup.code === 409) {
      catalogResponse = await loadCatalog();
      if (catalogResponse.code !== 0 || !catalogResponse.data) return catalogResponse as unknown as ApiResponse<{ created: number }>;
      catalog = catalogResponse.data;
      group = catalog.groups.find((item) => item.name.trim().toLowerCase() === legacyGroupName.toLowerCase());
      if (!group) return createdGroup as unknown as ApiResponse<{ created: number }>;
    } else {
      return createdGroup as unknown as ApiResponse<{ created: number }>;
    }
  }

  let created = 0;
  for (const normalized of missing) {
    const result = await createCustomerTag({ groupId: group.id, name: normalized, color: '#64748b', isActive: true });
    if (result.code === 0) {
      created += 1;
      continue;
    }
    if (result.code === 409) {
      catalogResponse = await loadCatalog();
      if (catalogResponse.code !== 0 || !catalogResponse.data) return catalogResponse as unknown as ApiResponse<{ created: number }>;
      catalog = catalogResponse.data;
      if (hasName(normalized)) continue;
    }
    return result as unknown as ApiResponse<{ created: number }>;
  }
  return createSuccessResponse({ created });
}

export const crmMigrationApi = {
  precheckFiles,
  importFiles,
  syncLeadSources,
  syncTags,
};

export const crmMigrationTestUtils = {
  importMigrationTables,
};
