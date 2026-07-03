import type { Row } from 'exceljs';
import excelJsBrowserUrl from 'exceljs/dist/exceljs.min.js?url';
import { v4 as uuidv4 } from 'uuid';
import type { CustomerTag } from '../types/tag';
import type { LeadSourceConfig, User } from '../types/settings';
import { DEFAULT_LEAD_SOURCE_CONFIGS, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import { getStorageData, setStorageData } from './mock/storage';
import { createSuccessResponse, delay, type ApiResponse } from './types';

export type CrmMigrationFileKey =
  | 'teamCustomers'
  | 'teamContacts'
  | 'publicPool'
  | 'assignedLeads'
  | 'failedLeads';

export type CrmMigrationFileMap = Partial<Record<CrmMigrationFileKey, File>>;

export type MigrationRow = Record<string, string>;

export interface CrmMigrationTables {
  teamCustomers?: MigrationRow[];
  teamContacts?: MigrationRow[];
  publicPool?: MigrationRow[];
  assignedLeads?: MigrationRow[];
  failedLeads?: MigrationRow[];
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
  leadStats: {
    assignedLeads: number;
    failedLeads: number;
    assignedPhones: number;
    assignedOverlapTeam: number;
    assignedOverlapPublic: number;
    assignedMissingInCustomers: number;
    failedOverlapAssigned: number;
    failedOnlyArchive: number;
  };
  importSuggestion: {
    teamCustomerAction: string;
    publicPoolAction: string;
    assignedLeadAction: string;
    failedLeadAction: string;
  };
}

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
  'assignedLeads',
  'failedLeads',
];

const EMPTY_FILE_COUNTS: Record<CrmMigrationFileKey, number> = {
  teamCustomers: 0,
  teamContacts: 0,
  publicPool: 0,
  assignedLeads: 0,
  failedLeads: 0,
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

function hasPhone(row: MigrationRow, phones: Set<string>): boolean {
  return ['手机', '手机1', '手机号', '联系方式'].some((field) => {
    const phone = normalizePhone(row[field]);
    return phone ? phones.has(phone) : false;
  });
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
  const assignedPhones = collectPhones(tables.assignedLeads);
  const failedPhones = collectPhones(tables.failedLeads);
  const customerPhones = new Set([...teamPhones, ...publicPhones]);
  const assignedOverlapTeam = [...assignedPhones].filter((phone) => teamPhones.has(phone)).length;
  const assignedOverlapPublic = [...assignedPhones].filter((phone) => publicPhones.has(phone)).length;
  const assignedMissingInCustomers = [...assignedPhones].filter((phone) => !customerPhones.has(phone)).length;
  const failedOverlapAssigned = [...failedPhones].filter((phone) => assignedPhones.has(phone)).length;
  const failedOnlyArchive = (tables.failedLeads || []).filter((row) => (
    !hasPhone(row, customerPhones) && !hasPhone(row, assignedPhones)
  )).length;

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
    leadStats: {
      assignedLeads: (tables.assignedLeads || []).length,
      failedLeads: (tables.failedLeads || []).length,
      assignedPhones: assignedPhones.size,
      assignedOverlapTeam,
      assignedOverlapPublic,
      assignedMissingInCustomers,
      failedOverlapAssigned,
      failedOnlyArchive,
    },
    importSuggestion: {
      teamCustomerAction: '导入到客户列表，保留原客户跟进人和最后跟进记录',
      publicPoolAction: '导入到公海客户，资源归属标记为公海',
      assignedLeadAction: '只把未出现在客户导出里的商机作为补充线索，其余用于补齐来源、标签和员工映射',
      failedLeadAction: '作为失败归档记录，不进入正式线索池，避免重复污染客户库',
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
  return createSuccessResponse(analyzeCrmMigrationTables(tables));
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
  ensureInit();
  await delay(120);
  const now = new Date().toISOString();
  const tags = [...(getStorageData<CustomerTag[]>(STORAGE_KEYS.TAGS) || [])];
  const existingNames = new Set(tags.map((tag) => tag.name.trim().toLowerCase()));
  let created = 0;

  tagNames.forEach((name) => {
    const normalized = normalizeValue(name);
    if (!normalized || existingNames.has(normalized.toLowerCase())) return;
    tags.push({
      id: `tag-mig-${uuidv4().slice(0, 8)}`,
      name: normalized,
      category: '其他' as CustomerTag['category'],
      color: '#64748b',
      usageCount: 0,
      isActive: true,
      createdAt: now,
    });
    existingNames.add(normalized.toLowerCase());
    created += 1;
  });

  setStorageData(STORAGE_KEYS.TAGS, tags);
  return createSuccessResponse({ created });
}

export const crmMigrationApi = {
  precheckFiles,
  syncLeadSources,
  syncTags,
};
