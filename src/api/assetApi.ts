import type {
  AssetDashboard,
  AssetDetailBundle,
  AssetDevice,
  AssetDeviceInput,
  AssetFilters,
  AssetImportFailedRow,
  AssetImportResult,
  AssetImportType,
  AssetInternetAccount,
  AssetInternetAccountInput,
  AssetMatrixPublishStats,
  AssetMatrixPublishTarget,
  AssetMatrixPublishTask,
  AssetMatrixPublishTaskInput,
  AssetOffboardingTask,
  AssetOperationLog,
  AssetPhoneNumber,
  AssetPhoneNumberInput,
  AssetRisk,
  AssetRiskStatus,
  AssetSensitiveField,
  AssetSensitiveRevealResult,
  AssetType,
} from '../types/asset';
import type { Department } from '../types/department';
import type { User } from '../types/settings';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { getBackendBaseUrl, readBackendToken, shouldUseBackendApi } from './backendClient';
import { DEFAULT_PAGE_SIZE, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';
import {
  canViewAssetAccount,
  canViewAssetDevice,
  canViewAssetOffboardingTask,
  canViewAssetPhone,
  getCurrentDataVisibilityScope,
} from '../shared/utils/dataVisibility';
import { ensureOrganizationConfigData } from '../shared/utils/organizationConfig';

function ensureInit(): void {
  initializeMockData();
}

const now = () => new Date().toISOString();

function paginate<T>(items: T[], filters?: AssetFilters): PaginatedResponse<T> {
  const page = filters?.page || 1;
  const pageSize = filters?.pageSize || DEFAULT_PAGE_SIZE;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    pagination: {
      page,
      pageSize,
      total: items.length,
      totalPages: Math.max(1, Math.ceil(items.length / pageSize)),
    },
  };
}

function includesKeyword(value: unknown, keyword: string): boolean {
  return String(value || '').toLowerCase().includes(keyword);
}

function devices(): AssetDevice[] {
  return getStorageData<AssetDevice[]>(STORAGE_KEYS.ASSET_DEVICES) || [];
}

function phones(): AssetPhoneNumber[] {
  return getStorageData<AssetPhoneNumber[]>(STORAGE_KEYS.ASSET_PHONE_NUMBERS) || [];
}

function accounts(): AssetInternetAccount[] {
  return getStorageData<AssetInternetAccount[]>(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS) || [];
}

function risks(): AssetRisk[] {
  return getStorageData<AssetRisk[]>(STORAGE_KEYS.ASSET_RISKS) || [];
}

function logs(): AssetOperationLog[] {
  return getStorageData<AssetOperationLog[]>(STORAGE_KEYS.ASSET_OPERATION_LOGS) || [];
}

function offboardingTasks(): AssetOffboardingTask[] {
  return getStorageData<AssetOffboardingTask[]>(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS) || [];
}

function matrixPublishTasks(): AssetMatrixPublishTask[] {
  return getStorageData<AssetMatrixPublishTask[]>(STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS) || [];
}

function maskPhone(value: string): string {
  const text = String(value || '').trim();
  return text.length >= 7 ? `${text.slice(0, 3)}****${text.slice(-4)}` : text;
}

function maskLongValue(value: string): string {
  const text = String(value || '').trim();
  return text.length > 8 ? `${text.slice(0, 6)}******${text.slice(-4)}` : text;
}

function maskLogin(value: string): string {
  const text = String(value || '').trim();
  if (!text) return '';
  const prefix = text.split(/[_@.-]/)[0] || text.slice(0, 5);
  return `${prefix}_***`;
}

function maskEmail(value?: string): string | undefined {
  if (!value) return undefined;
  const [name, domain] = value.split('@');
  if (!domain) return maskLogin(value);
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskRealName(value?: string): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (text.length === 1) return '*';
  return `${text.slice(0, 1)}*${text.slice(2)}`;
}

function nextNumber<T>(rows: T[], readValue: (row: T) => string, prefix: string): string {
  const max = rows.reduce((value, row) => {
    const raw = readValue(row);
    const numeric = Number(raw.replace(/\D/g, ''));
    return Number.isFinite(numeric) ? Math.max(value, numeric) : value;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

function normalizePhoneId(value?: string | null): string | undefined {
  return value ? String(value) : undefined;
}

function logAssetOperation(action: string, targetType: string, targetId: string, targetName: string, detail: string): void {
  const nextLogs: AssetOperationLog[] = [{
    id: `asset-log-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    time: now(),
    action,
    targetType,
    targetId,
    targetName,
    operator: '当前用户',
    detail,
  }, ...logs()];
  setStorageData(STORAGE_KEYS.ASSET_OPERATION_LOGS, nextLogs);
}

function makeRisk(
  riskKey: string,
  type: string,
  targetType: AssetType,
  targetId: string,
  targetName: string,
  level: AssetRisk['level'],
  description: string,
  existing?: AssetRisk,
): AssetRisk {
  return {
    id: existing?.id || `asset-risk-${riskKey}`,
    riskKey,
    type,
    targetType,
    targetId,
    targetName,
    level,
    status: existing?.status || 'open',
    description,
    createdAt: existing?.createdAt || now(),
    handledAt: existing?.handledAt,
    handledBy: existing?.handledBy,
    remark: existing?.remark,
  };
}

function assetBelongsToEmployee(
  asset: { owner?: string; currentUser?: string },
  employeeName: string,
): boolean {
  const name = employeeName.trim();
  return Boolean(name && (asset.owner === name || asset.currentUser === name));
}

function makeOffboardingTask(
  input: {
    assetId: string;
    assetType: AssetOffboardingTask['assetType'];
    assetName: string;
    employeeName: string;
    department: string;
    permissionStatus?: AssetOffboardingTask['permissionStatus'];
  },
  existing?: AssetOffboardingTask,
): AssetOffboardingTask {
  return {
    id: existing?.id || `asset-offboarding-${input.assetId}`,
    employeeName: input.employeeName || existing?.employeeName || '待确认',
    department: input.department || existing?.department || '',
    assetType: input.assetType,
    assetId: input.assetId,
    assetName: input.assetName,
    permissionStatus: input.permissionStatus || existing?.permissionStatus || '离职待回收',
    status: existing?.status || '待回收',
    dueAt: existing?.dueAt || now().slice(0, 10),
    handledAt: existing?.handledAt,
    handler: existing?.handler,
  };
}

function assetStillExistsForTask(task: AssetOffboardingTask, deviceRows: AssetDevice[], phoneRows: AssetPhoneNumber[], accountRows: AssetInternetAccount[]): boolean {
  if (task.assetType === '设备资产') return deviceRows.some((device) => device.id === task.assetId);
  if (task.assetType === '手机号资产') return phoneRows.some((phone) => phone.id === task.assetId);
  return accountRows.some((account) => account.id === task.assetId);
}

function rebuildRisksAndOffboarding(): void {
  const existingByKey = new Map(risks().map((risk) => [risk.riskKey, risk]));
  const deviceRows = devices();
  const phoneRows = phones();
  const accountRows = accounts();
  const nextRisks: AssetRisk[] = [];

  accountRows.forEach((account) => {
    if (!account.phoneId) {
      const key = `account-unbound-phone-${account.id}`;
      nextRisks.push(makeRisk(
        key,
        '未绑定手机号账号',
        'account',
        account.id,
        `${account.platform} / ${account.accountName}`,
        '中',
        '互联网账号未绑定手机号，后续登录、验证和回收链路不完整。',
        existingByKey.get(key),
      ));
    }
    if (account.permissionStatus === '离职待回收') {
      const key = `offboarding-account-${account.id}`;
      nextRisks.push(makeRisk(
        key,
        '离职待回收账号',
        'account',
        account.id,
        `${account.platform} / ${account.accountName}`,
        '高',
        '账号当前权限状态为离职待回收，需要确认控制权已收回。',
        existingByKey.get(key),
      ));
    }
    if (!account.owner) {
      const key = `account-no-owner-${account.id}`;
      nextRisks.push(makeRisk(
        key,
        '无负责人资产',
        'account',
        account.id,
        `${account.platform} / ${account.accountName}`,
        '高',
        '账号负责人为空，责任归属不清。',
        existingByKey.get(key),
      ));
    }
  });

  deviceRows.forEach((device) => {
    if (!device.owner) {
      const key = `device-no-owner-${device.id}`;
      nextRisks.push(makeRisk(key, '无负责人资产', 'device', device.id, device.deviceName, '高', '设备负责人为空，责任归属不清。', existingByKey.get(key)));
    }
    if (device.status === '闲置' && relatedAccountsForDevice(device.id).length) {
      const key = `idle-device-has-accounts-${device.id}`;
      nextRisks.push(makeRisk(key, '闲置设备仍有关联账号', 'device', device.id, device.deviceName, '中', '设备已闲置，但仍有关联互联网账号。', existingByKey.get(key)));
    }
  });

  phoneRows.forEach((phone) => {
    if (!phone.owner) {
      const key = `phone-no-owner-${phone.id}`;
      nextRisks.push(makeRisk(key, '无负责人资产', 'phone', phone.id, phone.phoneNumberMasked, '中', '手机号负责人为空，责任归属不清。', existingByKey.get(key)));
    }
  });

  setStorageData(STORAGE_KEYS.ASSET_RISKS, nextRisks);

  const currentTasks = offboardingTasks();
  const existingTasks = new Map(currentTasks.map((task) => [task.assetId, task]));
  const preservedTasks = currentTasks.filter((task) => (
    task.status === '已回收'
    || task.assetType === '设备资产'
    || task.assetType === '手机号资产'
  ) && assetStillExistsForTask(task, deviceRows, phoneRows, accountRows));
  const preservedIds = new Set(preservedTasks.map((task) => task.assetId));
  const accountTasks = accountRows
    .filter((account) => account.permissionStatus === '离职待回收')
    .filter((account) => !preservedIds.has(account.id))
    .map((account) => {
      const existing = existingTasks.get(account.id);
      return makeOffboardingTask({
        employeeName: account.currentUser || account.owner || '待确认',
        department: account.department,
        assetType: '互联网账号',
        assetId: account.id,
        assetName: `${account.platform} / ${account.accountName}`,
        permissionStatus: account.permissionStatus,
      }, existing);
    });
  setStorageData(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, [...preservedTasks, ...accountTasks]);
}

function requiredText(value: unknown, message: string): string {
  const text = String(value || '').trim();
  if (!text) throw new Error(message);
  return text;
}

type AssetOrgInput = {
  ownerId?: string;
  owner?: string;
  currentUserId?: string;
  currentUser?: string;
  departmentId?: string;
  department?: string;
};

function activeUsers(): User[] {
  return (getStorageData<User[]>(STORAGE_KEYS.USERS) || []).filter((user) => (
    user.isActive && (user.employmentStatus || 'active') === 'active'
  ));
}

function activeDepartments(): Department[] {
  return ensureOrganizationConfigData().departments.filter((department) => department.isActive);
}

function resolveUserReference(userId?: string, userName?: string): User | undefined {
  const users = activeUsers();
  const id = String(userId || '').trim();
  const name = String(userName || '').trim();
  return users.find((user) => user.id === id) || users.find((user) => user.name === name);
}

function resolveDepartmentReference(departmentId?: string, departmentName?: string): Department | undefined {
  const departments = activeDepartments();
  const id = String(departmentId || '').trim();
  const name = String(departmentName || '').trim();
  return departments.find((department) => department.id === id) || departments.find((department) => department.name === name);
}

function resolveAssetOrgFields(input: AssetOrgInput, existing: AssetOrgInput = {}): Required<Pick<AssetOrgInput, 'owner' | 'currentUser' | 'department'>> & AssetOrgInput {
  const owner = resolveUserReference(input.ownerId ?? existing.ownerId, input.owner ?? existing.owner);
  const currentUser = resolveUserReference(input.currentUserId ?? existing.currentUserId, input.currentUser ?? existing.currentUser);
  const explicitDepartment = resolveDepartmentReference(input.departmentId ?? existing.departmentId, input.department ?? existing.department);
  const inheritedDepartment = currentUser?.departmentId
    ? resolveDepartmentReference(currentUser.departmentId)
    : owner?.departmentId
      ? resolveDepartmentReference(owner.departmentId)
      : undefined;
  const department = explicitDepartment || inheritedDepartment;

  return {
    ownerId: owner?.id || input.ownerId || existing.ownerId || '',
    owner: owner?.name || input.owner || existing.owner || '',
    currentUserId: currentUser?.id || input.currentUserId || existing.currentUserId || '',
    currentUser: currentUser?.name || input.currentUser || existing.currentUser || '',
    departmentId: department?.id || input.departmentId || existing.departmentId || '',
    department: department?.name || input.department || existing.department || '',
  };
}

const PHONE_OPERATOR_PREFIXES = {
  移动: ['134', '135', '136', '137', '138', '139', '147', '150', '151', '152', '157', '158', '159', '172', '178', '182', '183', '184', '187', '188', '195', '197', '198'],
  联通: ['130', '131', '132', '145', '155', '156', '166', '171', '175', '176', '185', '186', '196'],
  电信: ['133', '149', '153', '173', '177', '180', '181', '189', '190', '191', '193', '199'],
  广电: ['192'],
} as const;

const PHONE_LOCATION_PREFIXES: Record<string, string> = {
  '1389056': '重庆',
  '1862301': '重庆',
  '1896020': '福建厦门',
  '1575900': '福建福州',
};

function normalizePhoneNumber(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function inferPhoneOperator(phoneNumber: unknown): AssetPhoneNumber['operator'] {
  const normalized = normalizePhoneNumber(phoneNumber);
  const prefix = normalized.slice(0, 3);
  const matched = Object.entries(PHONE_OPERATOR_PREFIXES).find(([, prefixes]) => prefixes.includes(prefix as never));
  return (matched?.[0] as AssetPhoneNumber['operator'] | undefined) || '未知';
}

function inferPhoneAttributionLocation(phoneNumber: unknown): string {
  const normalized = normalizePhoneNumber(phoneNumber);
  return PHONE_LOCATION_PREFIXES[normalized.slice(0, 7)] || '';
}

const ASSET_IMPORT_LABELS: Record<AssetImportType, string> = {
  devices: '设备资产',
  phones: '手机号资产',
  accounts: '互联网账号',
};

export const ASSET_IMPORT_TEMPLATES: Record<AssetImportType, string[]> = {
  devices: ['设备名称*', '品牌型号*', 'IMEI*', 'SIM类型', '所属主体', '所属部门', '负责人', '当前使用人', '状态', '月费用', '备注'],
  phones: ['手机号*', '实名信息', '运营商', '归属地', '所属设备编号*', 'SIM卡槽', '套餐', '月费用', '所属部门', '负责人', '当前使用人', '状态'],
  accounts: ['平台*', '账号名称*', '登录账号*', '实名信息', '绑定手机号', '绑定邮箱', '所属主体', '所属部门', '负责人', '当前使用人', '权限状态', '账号状态', '用途'],
};

const ASSET_IMPORT_SAMPLE_ROWS: Record<AssetImportType, Record<string, string>> = {
  devices: {
    '设备名称*': '业务备用机',
    '品牌型号*': 'iPhone 15',
    'IMEI*': 'IMPORT-IMEI-0001',
    SIM类型: '双卡',
    所属主体: '公司',
    所属部门: '运营管理部',
    负责人: '张三',
    当前使用人: '李四',
    状态: '使用中',
    月费用: '0',
    备注: '示例行，导入前可删除',
  },
  phones: {
    '手机号*': '13900001111',
    实名信息: '张三',
    运营商: '',
    归属地: '',
    '所属设备编号*': 'DEV-0001',
    SIM卡槽: '卡槽1',
    套餐: '商务套餐',
    月费用: '59',
    所属部门: '运营管理部',
    负责人: '张三',
    当前使用人: '李四',
    状态: '使用中',
  },
  accounts: {
    '平台*': '抖音企业号',
    '账号名称*': '极享本地生活',
    '登录账号*': 'jx_import_demo',
    实名信息: '张三',
    绑定手机号: '13900001111',
    绑定邮箱: 'ops@example.com',
    所属主体: '公司',
    所属部门: '运营管理部',
    负责人: '张三',
    当前使用人: '李四',
    权限状态: '正常',
    账号状态: '正常',
    用途: '示例行，导入前可删除',
  },
};

function escapeCsvValue(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function rowsToCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return '';
  const columns = Object.keys(rows[0]);
  return [
    columns.map(escapeCsvValue).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvValue(row[column])).join(',')),
  ].join('\n');
}

function getImportTemplateCsv(type: AssetImportType): string {
  const headers = ASSET_IMPORT_TEMPLATES[type];
  const sample = ASSET_IMPORT_SAMPLE_ROWS[type];
  return [
    headers.map(escapeCsvValue).join(','),
    headers.map((header) => escapeCsvValue(sample[header] || '')).join(','),
  ].join('\n');
}

function getImportFailureCsv(result: AssetImportResult): string {
  const rawColumns = ASSET_IMPORT_TEMPLATES[result.type];
  return rowsToCsv(result.failedRows.map((row) => ({
    行号: row.rowNumber,
    失败原因: row.reason,
    ...rawColumns.reduce<Record<string, string>>((acc, column) => {
      acc[column] = row.raw[column] || '';
      return acc;
    }, {}),
  })));
}

function parseCsv(csvText: string): Array<{ lineNumber: number; cells: string[] }> {
  const text = String(csvText || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: Array<{ lineNumber: number; cells: string[] }> = [];
  let lineNumber = 1;
  let rowLineNumber = 1;
  let cell = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    pushCell();
    rows.push({ lineNumber: rowLineNumber, cells: row });
    row = [];
    rowLineNumber = lineNumber + 1;
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      pushCell();
    } else if (char === '\n' && !inQuotes) {
      pushRow();
      lineNumber += 1;
    } else {
      cell += char;
    }
  }
  if (cell || row.length) pushRow();

  return rows.filter((item) => item.cells.some((value) => value.trim()));
}

function readCsvRows(csvText: string): Array<{ rowNumber: number; raw: Record<string, string> }> {
  const rows = parseCsv(csvText);
  const headerRow = rows[0]?.cells.map((header) => header.trim());
  if (!headerRow?.length) throw new Error('CSV内容为空');
  return rows.slice(1).map((row) => ({
    rowNumber: row.lineNumber,
    raw: headerRow.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = (row.cells[index] || '').trim();
      return acc;
    }, {}),
  }));
}

function csvCell(raw: Record<string, string>, ...aliases: string[]): string {
  for (const alias of aliases) {
    if (raw[alias] !== undefined) return raw[alias].trim();
    const normalizedAlias = alias.replace(/\*$/, '');
    const matchedKey = Object.keys(raw).find((key) => key.replace(/\*$/, '') === normalizedAlias);
    if (matchedKey) return raw[matchedKey].trim();
  }
  return '';
}

function importNumber(value: string): number {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function findPhoneForImport(value: string): AssetPhoneNumber | undefined {
  const keyword = value.trim();
  if (!keyword) return undefined;
  return phones().find((phone) => (
    phone.id === keyword
    || phone.phoneNumber === keyword
    || phone.phoneNumberMasked === keyword
  ));
}

function deviceInputFromCsv(raw: Record<string, string>): Partial<AssetDeviceInput> {
  return {
    deviceName: csvCell(raw, '设备名称*', '设备名称'),
    brandModel: csvCell(raw, '品牌型号*', '品牌型号'),
    imei: csvCell(raw, 'IMEI*', 'IMEI'),
    simType: (csvCell(raw, 'SIM类型') || '双卡') as AssetDeviceInput['simType'],
    ownerSubject: (csvCell(raw, '所属主体') || '公司') as AssetDeviceInput['ownerSubject'],
    department: csvCell(raw, '所属部门'),
    owner: csvCell(raw, '负责人'),
    currentUser: csvCell(raw, '当前使用人'),
    status: (csvCell(raw, '状态') || '正常') as AssetDeviceInput['status'],
    monthlyCost: importNumber(csvCell(raw, '月费用')),
    remark: csvCell(raw, '备注'),
  };
}

function phoneInputFromCsv(raw: Record<string, string>): Partial<AssetPhoneNumberInput> {
  const deviceCode = csvCell(raw, '所属设备编号*', '所属设备编号');
  const device = devices().find((item) => item.deviceCode === deviceCode || item.id === deviceCode);
  const phoneNumber = csvCell(raw, '手机号*', '手机号');
  return {
    phoneNumber,
    realName: csvCell(raw, '实名信息'),
    operator: (csvCell(raw, '运营商') || inferPhoneOperator(phoneNumber)) as AssetPhoneNumberInput['operator'],
    attributionLocation: csvCell(raw, '归属地') || inferPhoneAttributionLocation(phoneNumber),
    deviceId: device?.id || deviceCode,
    slotType: (csvCell(raw, 'SIM卡槽') || '卡槽1') as AssetPhoneNumberInput['slotType'],
    packageName: csvCell(raw, '套餐'),
    monthlyFee: importNumber(csvCell(raw, '月费用')),
    department: csvCell(raw, '所属部门'),
    owner: csvCell(raw, '负责人'),
    currentUser: csvCell(raw, '当前使用人'),
    status: (csvCell(raw, '状态') || '使用中') as AssetPhoneNumberInput['status'],
  };
}

function accountInputFromCsv(raw: Record<string, string>): Partial<AssetInternetAccountInput> {
  const phoneKeyword = csvCell(raw, '绑定手机号');
  const phone = findPhoneForImport(phoneKeyword);
  if (phoneKeyword && !phone) throw new Error('绑定手机号不存在');
  return {
    platform: csvCell(raw, '平台*', '平台'),
    accountName: csvCell(raw, '账号名称*', '账号名称'),
    loginAccount: csvCell(raw, '登录账号*', '登录账号'),
    realName: csvCell(raw, '实名信息'),
    phoneId: phone?.id,
    boundEmail: csvCell(raw, '绑定邮箱'),
    ownerSubject: (csvCell(raw, '所属主体') || '公司') as AssetInternetAccountInput['ownerSubject'],
    department: csvCell(raw, '所属部门'),
    owner: csvCell(raw, '负责人'),
    currentUser: csvCell(raw, '当前使用人'),
    permissionStatus: (csvCell(raw, '权限状态') || '正常') as AssetInternetAccountInput['permissionStatus'],
    accountStatus: (csvCell(raw, '账号状态') || '正常') as AssetInternetAccountInput['accountStatus'],
    serviceProvider: csvCell(raw, '服务商'),
    monthlyFee: importNumber(csvCell(raw, '月费用')),
    expiresAt: csvCell(raw, '到期时间'),
    purpose: csvCell(raw, '用途'),
  };
}

async function guarded<T>(task: () => T): Promise<ApiResponse<T>> {
  ensureInit();
  await delay(120);
  try {
    return createSuccessResponse(task());
  } catch (error: any) {
    return createErrorResponse(error.message || '资产操作失败');
  }
}

function getDevice(deviceId?: string): AssetDevice | undefined {
  return devices().find((device) => device.id === deviceId);
}

function getPhone(phoneId?: string): AssetPhoneNumber | undefined {
  return phones().find((phone) => phone.id === phoneId);
}

function getAccount(accountId?: string): AssetInternetAccount | undefined {
  return accounts().find((account) => account.id === accountId);
}

function visibleDevices(scope = getCurrentDataVisibilityScope('assets')): AssetDevice[] {
  const rows = devices();
  if (scope.unrestricted) return rows;
  return rows.filter((device) => canViewAssetDevice(device, scope));
}

function visiblePhones(scope = getCurrentDataVisibilityScope('assets')): AssetPhoneNumber[] {
  const rows = phones();
  if (scope.unrestricted) return rows;
  const visibleDeviceIds = new Set(visibleDevices(scope).map((device) => device.id));
  return rows.filter((phone) => canViewAssetPhone(phone, scope) || visibleDeviceIds.has(phone.deviceId));
}

function visibleAccounts(scope = getCurrentDataVisibilityScope('assets')): AssetInternetAccount[] {
  const rows = accounts();
  if (scope.unrestricted) return rows;
  const visiblePhoneIds = new Set(visiblePhones(scope).map((phone) => phone.id));
  return rows.filter((account) => (
    canViewAssetAccount(account, scope)
    || Boolean(account.phoneId && visiblePhoneIds.has(account.phoneId))
  ));
}

function visibleAssetIds(scope = getCurrentDataVisibilityScope('assets')): Record<AssetType | 'all', Set<string>> {
  const deviceIds = new Set(visibleDevices(scope).map((device) => device.id));
  const phoneIds = new Set(visiblePhones(scope).map((phone) => phone.id));
  const accountIds = new Set(visibleAccounts(scope).map((account) => account.id));
  return {
    device: deviceIds,
    phone: phoneIds,
    account: accountIds,
    all: new Set([...deviceIds, ...phoneIds, ...accountIds]),
  };
}

function visibleRisks(scope = getCurrentDataVisibilityScope('assets')): AssetRisk[] {
  const rows = risks();
  if (scope.unrestricted) return rows;
  const idsByType = visibleAssetIds(scope);
  return rows.filter((risk) => idsByType[risk.targetType].has(risk.targetId));
}

function visibleLogs(scope = getCurrentDataVisibilityScope('assets')): AssetOperationLog[] {
  const rows = logs();
  if (scope.unrestricted) return rows;
  const ids = visibleAssetIds(scope).all;
  return rows.filter((log) => ids.has(log.targetId));
}

function visibleOffboardingTasks(scope = getCurrentDataVisibilityScope('assets')): AssetOffboardingTask[] {
  const rows = offboardingTasks();
  if (scope.unrestricted) return rows;
  const ids = visibleAssetIds(scope).all;
  return rows.filter((task) => canViewAssetOffboardingTask(task, scope) || ids.has(task.assetId));
}

function visibleMatrixPublishTasks(scope = getCurrentDataVisibilityScope('assets')): AssetMatrixPublishTask[] {
  const rows = matrixPublishTasks();
  if (scope.unrestricted) return rows;
  const visibleAccountIds = new Set(visibleAccounts(scope).map((account) => account.id));
  return rows
    .map((task) => ({
      ...task,
      targets: task.targets.filter((target) => visibleAccountIds.has(target.accountId)),
    }))
    .filter((task) => task.targets.length);
}

function getPhoneDevice(phone?: AssetPhoneNumber): AssetDevice | undefined {
  return phone ? getDevice(phone.deviceId) : undefined;
}

function filterDevices(rows: AssetDevice[], filters?: AssetFilters): AssetDevice[] {
  const keyword = filters?.search?.trim().toLowerCase();
  return rows.filter((row) => {
    const matchesKeyword = !keyword || [
      row.deviceCode,
      row.deviceName,
      row.brandModel,
      row.imeiMasked,
      row.department,
      row.owner,
      row.currentUser,
      row.status,
    ].some((value) => includesKeyword(value, keyword));
    const matchesRisk = !filters?.riskLevel || row.riskLevel === filters.riskLevel;
    const matchesStatus = !filters?.status || row.status === filters.status;
    return matchesKeyword && matchesRisk && matchesStatus;
  });
}

function filterPhones(rows: AssetPhoneNumber[], filters?: AssetFilters): AssetPhoneNumber[] {
  const keyword = filters?.search?.trim().toLowerCase();
  return rows.filter((row) => {
    const device = getDevice(row.deviceId);
    const matchesKeyword = !keyword || [
      row.phoneNumber,
      row.phoneNumberMasked,
      row.realName,
      row.realNameMasked,
      row.operator,
      row.attributionLocation,
      row.packageName,
      row.owner,
      row.status,
      device?.deviceCode,
      device?.deviceName,
    ].some((value) => includesKeyword(value, keyword));
    const matchesStatus = !filters?.status || row.status === filters.status;
    return matchesKeyword && matchesStatus;
  });
}

function filterAccounts(rows: AssetInternetAccount[], filters?: AssetFilters): AssetInternetAccount[] {
  const keyword = filters?.search?.trim().toLowerCase();
  return rows.filter((row) => {
    const phone = getPhone(row.phoneId);
    const device = getPhoneDevice(phone);
    const matchesKeyword = !keyword || [
      row.accountNo,
      row.platform,
      row.accountName,
      row.loginAccountMasked,
      row.realName,
      row.realNameMasked,
      row.department,
      row.owner,
      row.currentUser,
      row.permissionStatus,
      row.accountStatus,
      phone?.phoneNumberMasked,
      device?.deviceCode,
      device?.deviceName,
    ].some((value) => includesKeyword(value, keyword));
    const matchesPlatform = !filters?.platform || row.platform === filters.platform;
    const matchesPermission = !filters?.permissionStatus || row.permissionStatus === filters.permissionStatus;
    const matchesRisk = !filters?.riskLevel || row.riskLevel === filters.riskLevel;
    const matchesStatus = !filters?.status || row.accountStatus === filters.status;
    return matchesKeyword && matchesPlatform && matchesPermission && matchesRisk && matchesStatus;
  });
}

function relatedAccountsForPhone(phoneId: string): AssetInternetAccount[] {
  return accounts().filter((account) => account.phoneId === phoneId);
}

function relatedAccountsForDevice(deviceId: string): AssetInternetAccount[] {
  const phoneIds = phones().filter((phone) => phone.deviceId === deviceId).map((phone) => phone.id);
  return accounts().filter((account) => account.phoneId && phoneIds.includes(account.phoneId));
}

function detailLogs(assetIds: string[]): AssetOperationLog[] {
  const idSet = new Set(assetIds.filter(Boolean));
  return visibleLogs()
    .filter((log) => idSet.has(log.targetId))
    .slice(0, 12);
}

function detailRisks(assetIds: string[]): AssetRisk[] {
  const idSet = new Set(assetIds.filter(Boolean));
  return visibleRisks().filter((risk) => idSet.has(risk.targetId));
}

function matrixTargetFromAccount(account: AssetInternetAccount): AssetMatrixPublishTarget {
  const phone = getPhone(account.phoneId);
  const device = getPhoneDevice(phone);
  return {
    id: `matrix-target-${Date.now()}-${account.id}-${Math.random().toString(16).slice(2, 8)}`,
    accountId: account.id,
    accountNo: account.accountNo,
    platform: account.platform,
    accountName: account.accountName,
    assignee: account.currentUser,
    department: account.department,
    phoneId: phone?.id,
    phoneNumberMasked: phone?.phoneNumberMasked,
    deviceId: device?.id,
    deviceCode: device?.deviceCode,
    deviceName: device?.deviceName,
    status: 'pending',
  };
}

function filterMatrixPublishTasks(rows: AssetMatrixPublishTask[], filters?: AssetFilters): AssetMatrixPublishTask[] {
  const keyword = filters?.search?.trim().toLowerCase();
  return rows.filter((task) => {
    const matchesKeyword = !keyword || [
      task.title,
      task.copywriting,
      task.remark,
      ...task.targets.flatMap((target) => [
        target.platform,
        target.accountName,
        target.accountNo,
        target.assignee,
        target.department,
      ]),
    ].some((value) => includesKeyword(value, keyword));
    const matchesPlatform = !filters?.platform || task.targets.some((target) => target.platform === filters.platform);
    const matchesStatus = !filters?.status || task.targets.some((target) => target.status === filters.status);
    return matchesKeyword && matchesPlatform && matchesStatus;
  });
}

function isMatrixTargetOverdue(target: AssetMatrixPublishTarget, dueAt: string, nowIso: string): boolean {
  return target.status !== 'completed' && new Date(dueAt).getTime() < new Date(nowIso).getTime();
}

function summarizeMatrixTargets(
  targets: AssetMatrixPublishTarget[],
  dueAtByTargetId: Map<string, string>,
  nowIso: string,
  groupKey: keyof Pick<AssetMatrixPublishTarget, 'platform' | 'department' | 'assignee'>,
): Array<{ platform?: string; department?: string; assignee?: string; total: number; completed: number; overdue: number }> {
  const groups = new Map<string, { total: number; completed: number; overdue: number }>();
  targets.forEach((target) => {
    const key = String(target[groupKey] || '未分组');
    const current = groups.get(key) || { total: 0, completed: 0, overdue: 0 };
    current.total += 1;
    if (target.status === 'completed') current.completed += 1;
    if (isMatrixTargetOverdue(target, dueAtByTargetId.get(target.id) || '', nowIso)) current.overdue += 1;
    groups.set(key, current);
  });
  return Array.from(groups.entries()).map(([key, value]) => ({ [groupKey]: key, ...value }));
}

async function fetchDashboard(): Promise<ApiResponse<AssetDashboard>> {
  ensureInit();
  await delay(120);
  const scope = getCurrentDataVisibilityScope('assets');
  const deviceRows = visibleDevices(scope);
  const phoneRows = visiblePhones(scope);
  const accountRows = visibleAccounts(scope);
  const dashboard: AssetDashboard = {
    deviceCount: deviceRows.length,
    phoneCount: phoneRows.length,
    accountCount: accountRows.length,
    openRiskCount: visibleRisks(scope).filter((risk) => risk.status === 'open').length,
    offboardingCount: visibleOffboardingTasks(scope).filter((task) => task.status === '待回收').length,
    monthlyCost: [
      ...deviceRows.map((item) => item.monthlyCost),
      ...phoneRows.map((item) => item.monthlyFee),
    ].reduce((sum, value) => sum + Number(value || 0), 0),
    unboundAccountCount: accountRows.filter((account) => !account.phoneId).length,
  };
  return createSuccessResponse(dashboard);
}

async function fetchDevices(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetDevice>>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(paginate(filterDevices(visibleDevices(), filters), filters));
}

async function createDevice(input: Partial<AssetDeviceInput>): Promise<ApiResponse<AssetDevice>> {
  return guarded(() => {
    const rows = devices();
    const imei = requiredText(input.imei, 'IMEI不能为空');
    if (rows.some((device) => device.imei === imei)) throw new Error('IMEI已存在');
    const createdAt = now();
    const orgFields = resolveAssetOrgFields(input);
    const device: AssetDevice = {
      id: `asset-device-${Date.now()}`,
      deviceCode: input.deviceCode || nextNumber(rows, (device) => device.deviceCode, 'DEV'),
      deviceName: requiredText(input.deviceName, '设备名称不能为空'),
      brandModel: requiredText(input.brandModel, '品牌型号不能为空'),
      imei,
      imeiMasked: maskLongValue(imei),
      simType: input.simType || '双卡',
      ownerSubject: input.ownerSubject || '公司',
      departmentId: orgFields.departmentId,
      department: orgFields.department,
      ownerId: orgFields.ownerId,
      owner: orgFields.owner,
      currentUserId: orgFields.currentUserId,
      currentUser: orgFields.currentUser,
      status: input.status || '正常',
      riskLevel: input.riskLevel || '低',
      monthlyCost: Number(input.monthlyCost || 0),
      remark: input.remark || '',
      createdAt,
      updatedAt: createdAt,
    };
    setStorageData(STORAGE_KEYS.ASSET_DEVICES, [device, ...rows]);
    logAssetOperation('新增资产', '设备资产', device.id, device.deviceName, `新增设备 ${device.deviceCode}`);
    rebuildRisksAndOffboarding();
    return device;
  });
}

async function updateDevice(id: string, input: Partial<AssetDeviceInput>): Promise<ApiResponse<AssetDevice>> {
  return guarded(() => {
    const rows = devices();
    const existing = rows.find((device) => device.id === id);
    if (!existing) throw new Error('设备不存在');
    const imei = input.imei === undefined ? existing.imei : requiredText(input.imei, 'IMEI不能为空');
    if (rows.some((device) => device.id !== id && device.imei === imei)) throw new Error('IMEI已存在');
    const nextSimType = input.simType || existing.simType;
    if (nextSimType === '单卡' && phones().some((phone) => phone.deviceId === id && phone.slotType === '卡槽2')) {
      throw new Error('单卡设备不能保留卡槽2手机号，请先解绑或迁移卡槽2手机号');
    }
    const orgFields = resolveAssetOrgFields(input, existing);
    const updated: AssetDevice = {
      ...existing,
      ...input,
      imei,
      imeiMasked: maskLongValue(imei),
      departmentId: orgFields.departmentId,
      department: orgFields.department,
      ownerId: orgFields.ownerId,
      owner: orgFields.owner,
      currentUserId: orgFields.currentUserId,
      currentUser: orgFields.currentUser,
      monthlyCost: Number(input.monthlyCost ?? existing.monthlyCost),
      updatedAt: now(),
    };
    setStorageData(STORAGE_KEYS.ASSET_DEVICES, rows.map((device) => (device.id === id ? updated : device)));
    logAssetOperation('编辑资料', '设备资产', updated.id, updated.deviceName, `编辑设备 ${updated.deviceCode}`);
    rebuildRisksAndOffboarding();
    return updated;
  });
}

async function deleteDevice(id: string): Promise<ApiResponse<AssetDevice>> {
  return guarded(() => {
    const rows = devices();
    const existing = rows.find((device) => device.id === id);
    if (!existing) throw new Error('设备不存在');

    const phoneIds = phones().filter((phone) => phone.deviceId === id).map((phone) => phone.id);
    const relatedAccounts = accounts().filter((account) => account.phoneId && phoneIds.includes(account.phoneId));

    setStorageData(STORAGE_KEYS.ASSET_DEVICES, rows.filter((device) => device.id !== id));
    setStorageData(STORAGE_KEYS.ASSET_PHONE_NUMBERS, phones().filter((phone) => phone.deviceId !== id));
    if (relatedAccounts.length) {
      setStorageData(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, accounts().map((account) => (
        account.phoneId && phoneIds.includes(account.phoneId)
          ? { ...account, phoneId: undefined, updatedAt: now() }
          : account
      )));
    }
    setStorageData(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, offboardingTasks().filter((task) => (
      !(task.assetType === '设备资产' && task.assetId === id)
      && !(task.assetType === '手机号资产' && phoneIds.includes(task.assetId))
    )));
    logAssetOperation(
      '删除资产',
      '设备资产',
      existing.id,
      existing.deviceName,
      `删除设备 ${existing.deviceCode}，同步移除${phoneIds.length}个手机号，解绑${relatedAccounts.length}个账号`,
    );
    rebuildRisksAndOffboarding();
    return existing;
  });
}

async function fetchPhoneNumbers(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetPhoneNumber>>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(paginate(filterPhones(visiblePhones(), filters), filters));
}

function assertPhoneBinding(input: Partial<AssetPhoneNumberInput>, excludeId?: string): void {
  const deviceId = requiredText(input.deviceId, '所属设备不能为空');
  const device = getDevice(deviceId);
  if (!device) throw new Error('所属设备不存在');
  const slotType = input.slotType || '卡槽1';
  if (device.simType === '单卡' && slotType === '卡槽2') {
    throw new Error('单卡设备只能绑定卡槽1手机号');
  }
  if (phones().some((phone) => phone.id !== excludeId && phone.deviceId === deviceId && phone.slotType === slotType)) {
    throw new Error('该设备卡槽已绑定手机号');
  }
  const boundCount = phones().filter((phone) => phone.id !== excludeId && phone.deviceId === deviceId).length;
  const maxPhoneCount = device.simType === '双卡' ? 2 : 1;
  if (boundCount >= maxPhoneCount) throw new Error(`${device.simType}设备最多绑定${maxPhoneCount}个手机号`);
}

async function createPhoneNumber(input: Partial<AssetPhoneNumberInput>): Promise<ApiResponse<AssetPhoneNumber>> {
  return guarded(() => {
    assertPhoneBinding(input);
    const rows = phones();
    const phoneNumber = requiredText(input.phoneNumber, '手机号不能为空');
    if (rows.some((phone) => phone.phoneNumber === phoneNumber)) throw new Error('手机号已存在');
    const createdAt = now();
    const orgFields = resolveAssetOrgFields(input);
    const phone: AssetPhoneNumber = {
      id: `asset-phone-${Date.now()}`,
      phoneNumber,
      phoneNumberMasked: maskPhone(phoneNumber),
      realName: input.realName || '',
      realNameMasked: maskRealName(input.realName),
      operator: input.operator || inferPhoneOperator(phoneNumber),
      attributionLocation: input.attributionLocation || inferPhoneAttributionLocation(phoneNumber),
      deviceId: requiredText(input.deviceId, '所属设备不能为空'),
      slotType: input.slotType || '卡槽1',
      packageName: input.packageName || '',
      monthlyFee: Number(input.monthlyFee || 0),
      departmentId: orgFields.departmentId,
      department: orgFields.department,
      ownerId: orgFields.ownerId,
      owner: orgFields.owner,
      currentUserId: orgFields.currentUserId,
      currentUser: orgFields.currentUser,
      status: input.status || '使用中',
      createdAt,
      updatedAt: createdAt,
    };
    setStorageData(STORAGE_KEYS.ASSET_PHONE_NUMBERS, [phone, ...rows]);
    logAssetOperation('新增资产', '手机号资产', phone.id, phone.phoneNumberMasked, `新增手机号 ${phone.phoneNumberMasked}`);
    rebuildRisksAndOffboarding();
    return phone;
  });
}

async function updatePhoneNumber(id: string, input: Partial<AssetPhoneNumberInput>): Promise<ApiResponse<AssetPhoneNumber>> {
  return guarded(() => {
    const rows = phones();
    const existing = rows.find((phone) => phone.id === id);
    if (!existing) throw new Error('手机号不存在');
    assertPhoneBinding({ ...existing, ...input }, id);
    const phoneNumber = input.phoneNumber === undefined ? existing.phoneNumber : requiredText(input.phoneNumber, '手机号不能为空');
    if (rows.some((phone) => phone.id !== id && phone.phoneNumber === phoneNumber)) throw new Error('手机号已存在');
    const orgFields = resolveAssetOrgFields(input, existing);
    const updated: AssetPhoneNumber = {
      ...existing,
      ...input,
      phoneNumber,
      phoneNumberMasked: maskPhone(phoneNumber),
      realNameMasked: maskRealName(input.realName ?? existing.realName),
      operator: input.operator || (input.phoneNumber !== undefined ? inferPhoneOperator(phoneNumber) : existing.operator),
      attributionLocation: input.attributionLocation || (input.phoneNumber !== undefined ? inferPhoneAttributionLocation(phoneNumber) : existing.attributionLocation),
      departmentId: orgFields.departmentId,
      department: orgFields.department,
      ownerId: orgFields.ownerId,
      owner: orgFields.owner,
      currentUserId: orgFields.currentUserId,
      currentUser: orgFields.currentUser,
      monthlyFee: Number(input.monthlyFee ?? existing.monthlyFee),
      updatedAt: now(),
    };
    setStorageData(STORAGE_KEYS.ASSET_PHONE_NUMBERS, rows.map((phone) => (phone.id === id ? updated : phone)));
    logAssetOperation('编辑资料', '手机号资产', updated.id, updated.phoneNumberMasked, `编辑手机号 ${updated.phoneNumberMasked}`);
    rebuildRisksAndOffboarding();
    return updated;
  });
}

async function deletePhoneNumber(id: string): Promise<ApiResponse<AssetPhoneNumber>> {
  return guarded(() => {
    const rows = phones();
    const existing = rows.find((phone) => phone.id === id);
    if (!existing) throw new Error('手机号不存在');
    const relatedAccounts = accounts().filter((account) => account.phoneId === id);

    setStorageData(STORAGE_KEYS.ASSET_PHONE_NUMBERS, rows.filter((phone) => phone.id !== id));
    if (relatedAccounts.length) {
      setStorageData(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, accounts().map((account) => (
        account.phoneId === id ? { ...account, phoneId: undefined, updatedAt: now() } : account
      )));
    }
    setStorageData(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, offboardingTasks().filter((task) => (
      !(task.assetType === '手机号资产' && task.assetId === id)
    )));
    logAssetOperation(
      '删除资产',
      '手机号资产',
      existing.id,
      existing.phoneNumberMasked,
      `删除手机号 ${existing.phoneNumberMasked}，解绑${relatedAccounts.length}个账号`,
    );
    rebuildRisksAndOffboarding();
    return existing;
  });
}

async function fetchInternetAccounts(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetInternetAccount>>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(paginate(filterAccounts(visibleAccounts(), filters), filters));
}

function assertAccountBinding(input: Partial<AssetInternetAccountInput>, excludeId?: string): void {
  const platform = requiredText(input.platform, '平台不能为空');
  const loginAccount = requiredText(input.loginAccount, '登录账号不能为空');
  if (accounts().some((account) => account.id !== excludeId && account.platform === platform && account.loginAccount === loginAccount)) {
    throw new Error('同一平台下登录账号已存在');
  }
  const phoneId = normalizePhoneId(input.phoneId);
  if (phoneId && !getPhone(phoneId)) throw new Error('绑定手机号不存在');
}

async function createInternetAccount(input: Partial<AssetInternetAccountInput>): Promise<ApiResponse<AssetInternetAccount>> {
  return guarded(() => {
    assertAccountBinding(input);
    const rows = accounts();
    const loginAccount = requiredText(input.loginAccount, '登录账号不能为空');
    const createdAt = now();
    const orgFields = resolveAssetOrgFields(input);
    const account: AssetInternetAccount = {
      id: `asset-account-${Date.now()}`,
      accountNo: input.accountNo || nextNumber(rows, (account) => account.accountNo, 'A'),
      platform: requiredText(input.platform, '平台不能为空'),
      accountName: requiredText(input.accountName, '账号名称不能为空'),
      loginAccount,
      loginAccountMasked: maskLogin(loginAccount),
      realName: input.realName || '',
      realNameMasked: maskRealName(input.realName),
      phoneId: normalizePhoneId(input.phoneId),
      boundEmail: input.boundEmail || '',
      boundEmailMasked: maskEmail(input.boundEmail),
      ownerSubject: input.ownerSubject || '公司',
      departmentId: orgFields.departmentId,
      department: orgFields.department,
      ownerId: orgFields.ownerId,
      owner: orgFields.owner,
      currentUserId: orgFields.currentUserId,
      currentUser: orgFields.currentUser,
      permissionStatus: input.permissionStatus || '正常',
      accountStatus: input.accountStatus || '正常',
      riskLevel: input.riskLevel || '低',
      serviceProvider: input.serviceProvider || '',
      monthlyFee: Number(input.monthlyFee || 0),
      expiresAt: input.expiresAt || '',
      purpose: input.purpose || '',
      createdAt,
      updatedAt: createdAt,
    };
    setStorageData(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, [account, ...rows]);
    logAssetOperation('新增资产', '互联网账号', account.id, account.accountName, `新增账号 ${account.accountNo}`);
    if (account.phoneId) logAssetOperation('绑定资产', '互联网账号', account.id, account.accountName, `绑定手机号 ${getPhone(account.phoneId)?.phoneNumberMasked || account.phoneId}`);
    rebuildRisksAndOffboarding();
    return account;
  });
}

async function updateInternetAccount(id: string, input: Partial<AssetInternetAccountInput>): Promise<ApiResponse<AssetInternetAccount>> {
  return guarded(() => {
    const rows = accounts();
    const existing = rows.find((account) => account.id === id);
    if (!existing) throw new Error('互联网账号不存在');
    assertAccountBinding({ ...existing, ...input }, id);
    const loginAccount = input.loginAccount === undefined ? existing.loginAccount : requiredText(input.loginAccount, '登录账号不能为空');
    const nextPhoneId = input.phoneId === undefined ? existing.phoneId : normalizePhoneId(input.phoneId);
    const orgFields = resolveAssetOrgFields(input, existing);
    const updated: AssetInternetAccount = {
      ...existing,
      ...input,
      phoneId: nextPhoneId,
      loginAccount,
      loginAccountMasked: maskLogin(loginAccount),
      realNameMasked: maskRealName(input.realName ?? existing.realName),
      boundEmailMasked: maskEmail(input.boundEmail ?? existing.boundEmail),
      departmentId: orgFields.departmentId,
      department: orgFields.department,
      ownerId: orgFields.ownerId,
      owner: orgFields.owner,
      currentUserId: orgFields.currentUserId,
      currentUser: orgFields.currentUser,
      monthlyFee: Number(input.monthlyFee ?? existing.monthlyFee),
      updatedAt: now(),
    };
    setStorageData(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, rows.map((account) => (account.id === id ? updated : account)));
    logAssetOperation('编辑资料', '互联网账号', updated.id, updated.accountName, `编辑账号 ${updated.accountNo}`);
    if (existing.phoneId !== updated.phoneId) {
      logAssetOperation(
        updated.phoneId ? '绑定资产' : '解绑资产',
        '互联网账号',
        updated.id,
        updated.accountName,
        updated.phoneId ? `绑定手机号 ${getPhone(updated.phoneId)?.phoneNumberMasked || updated.phoneId}` : '解绑手机号',
      );
    }
    rebuildRisksAndOffboarding();
    return updated;
  });
}

async function deleteInternetAccount(id: string): Promise<ApiResponse<AssetInternetAccount>> {
  return guarded(() => {
    const rows = accounts();
    const existing = rows.find((account) => account.id === id);
    if (!existing) throw new Error('互联网账号不存在');

    setStorageData(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, rows.filter((account) => account.id !== id));
    setStorageData(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, offboardingTasks().filter((task) => (
      !(task.assetType === '互联网账号' && task.assetId === id)
    )));
    logAssetOperation('删除资产', '互联网账号', existing.id, existing.accountName, `删除账号 ${existing.accountNo}`);
    rebuildRisksAndOffboarding();
    return existing;
  });
}

async function createOffboardingTasksForEmployee(employeeName: string, department = ''): Promise<ApiResponse<AssetOffboardingTask[]>> {
  return guarded(() => {
    const name = requiredText(employeeName, '员工姓名不能为空');
    const deviceRows = devices();
    const phoneRows = phones();
    const accountRows = accounts();
    const currentTasks = offboardingTasks();
    const existingByAssetId = new Map(currentTasks.map((task) => [task.assetId, task]));
    const touchedTasks: AssetOffboardingTask[] = [];
    let nextTasks = [...currentTasks];

    const upsertTask = (task: AssetOffboardingTask) => {
      const index = nextTasks.findIndex((item) => item.assetId === task.assetId);
      if (index === -1) nextTasks = [task, ...nextTasks];
      else nextTasks[index] = { ...nextTasks[index], ...task, id: nextTasks[index].id };
      touchedTasks.push(index === -1 ? task : nextTasks[index]);
    };

    deviceRows
      .filter((device) => assetBelongsToEmployee(device, name))
      .forEach((device) => {
        upsertTask(makeOffboardingTask({
          assetId: device.id,
          assetType: '设备资产',
          assetName: `${device.deviceCode} / ${device.deviceName}`,
          employeeName: name,
          department: device.department || department,
          permissionStatus: '离职待回收',
        }, existingByAssetId.get(device.id)));
      });

    phoneRows
      .filter((phone) => assetBelongsToEmployee(phone, name))
      .forEach((phone) => {
        upsertTask(makeOffboardingTask({
          assetId: phone.id,
          assetType: '手机号资产',
          assetName: phone.phoneNumberMasked,
          employeeName: name,
          department,
          permissionStatus: '离职待回收',
        }, existingByAssetId.get(phone.id)));
      });

    let accountChanged = false;
    const nextAccounts = accountRows.map((account) => {
      if (!assetBelongsToEmployee(account, name)) return account;
      const marked: AssetInternetAccount = {
        ...account,
        permissionStatus: '离职待回收',
        updatedAt: now(),
      };
      accountChanged = accountChanged || marked.permissionStatus !== account.permissionStatus;
      upsertTask(makeOffboardingTask({
        assetId: marked.id,
        assetType: '互联网账号',
        assetName: `${marked.platform} / ${marked.accountName}`,
        employeeName: name,
        department: marked.department || department,
        permissionStatus: marked.permissionStatus,
      }, existingByAssetId.get(marked.id)));
      return marked;
    });

    if (accountChanged) setStorageData(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, nextAccounts);
    if (touchedTasks.length) {
      setStorageData(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, nextTasks);
      logAssetOperation('生成离职回收', '离职回收', name, name, `为${name}生成${touchedTasks.length}条资产回收任务`);
    }
    rebuildRisksAndOffboarding();
    return touchedTasks;
  });
}

async function fetchRisks(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetRisk>>> {
  ensureInit();
  await delay(120);
  const keyword = filters?.search?.trim().toLowerCase();
  const filtered = visibleRisks().filter((risk) => {
    const matchesKeyword = !keyword || [risk.type, risk.targetName, risk.description].some((value) => includesKeyword(value, keyword));
    const matchesRisk = !filters?.riskLevel || risk.level === filters.riskLevel;
    const matchesStatus = !filters?.status || risk.status === filters.status;
    return matchesKeyword && matchesRisk && matchesStatus;
  });
  return createSuccessResponse(paginate(filtered, filters));
}

async function fetchOperationLogs(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetOperationLog>>> {
  ensureInit();
  await delay(120);
  const keyword = filters?.search?.trim().toLowerCase();
  const filtered = visibleLogs().filter((log) => (
    !keyword || [log.action, log.targetType, log.targetName, log.operator, log.detail].some((value) => includesKeyword(value, keyword))
  ));
  return createSuccessResponse(paginate(filtered, filters));
}

async function fetchOffboardingTasks(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetOffboardingTask>>> {
  ensureInit();
  await delay(120);
  const keyword = filters?.search?.trim().toLowerCase();
  const filtered = visibleOffboardingTasks().filter((task) => {
    const matchesKeyword = !keyword || [
      task.employeeName,
      task.department,
      task.assetType,
      task.assetName,
      task.status,
    ].some((value) => includesKeyword(value, keyword));
    const matchesStatus = !filters?.status || task.status === filters.status;
    return matchesKeyword && matchesStatus;
  });
  return createSuccessResponse(paginate(filtered, filters));
}

async function fetchDetail(type: AssetType, id: string): Promise<ApiResponse<AssetDetailBundle | null>> {
  ensureInit();
  await delay(120);
  const scope = getCurrentDataVisibilityScope('assets');
  const visibleDeviceRows = visibleDevices(scope);
  const visiblePhoneRows = visiblePhones(scope);
  const visibleAccountRows = visibleAccounts(scope);
  if (type === 'device') {
    const device = visibleDeviceRows.find((item) => item.id === id);
    if (!device) return createSuccessResponse(null);
    const relatedPhones = visiblePhoneRows.filter((phone) => phone.deviceId === id);
    const relatedAccounts = relatedAccountsForDevice(id).filter((account) => visibleAccountRows.some((item) => item.id === account.id));
    const detailAssetIds = [device.id, ...relatedPhones.map((phone) => phone.id), ...relatedAccounts.map((account) => account.id)];
    return createSuccessResponse({
      type,
      device,
      relatedPhones,
      relatedAccounts,
      risks: detailRisks(detailAssetIds),
      logs: detailLogs(detailAssetIds),
    });
  }
  if (type === 'phone') {
    const phone = visiblePhoneRows.find((item) => item.id === id);
    if (!phone) return createSuccessResponse(null);
    const relatedDevice = getDevice(phone.deviceId);
    const relatedAccounts = relatedAccountsForPhone(id).filter((account) => visibleAccountRows.some((item) => item.id === account.id));
    const detailAssetIds = [relatedDevice?.id || '', phone.id, ...relatedAccounts.map((account) => account.id)];
    return createSuccessResponse({
      type,
      phone,
      relatedDevice,
      relatedPhones: [phone],
      relatedAccounts,
      risks: detailRisks(detailAssetIds),
      logs: detailLogs(detailAssetIds),
    });
  }
  const account = visibleAccountRows.find((item) => item.id === id);
  if (!account) return createSuccessResponse(null);
  const phone = getPhone(account.phoneId);
  const relatedDevice = getPhoneDevice(phone);
  const detailAssetIds = [relatedDevice?.id || '', phone?.id || '', account.id];
  return createSuccessResponse({
    type,
    account,
    relatedDevice,
    relatedPhones: phone ? [phone] : [],
    relatedAccounts: [account],
    risks: detailRisks(detailAssetIds),
    logs: detailLogs(detailAssetIds),
  });
}

async function updateRiskStatus(riskId: string, status: AssetRiskStatus): Promise<ApiResponse<AssetRisk | null>> {
  ensureInit();
  await delay(120);
  if (!visibleRisks().some((risk) => risk.id === riskId)) return createSuccessResponse(null);
  let updated: AssetRisk | null = null;
  const nextRisks = risks().map((risk) => {
    if (risk.id !== riskId) return risk;
    updated = {
      ...risk,
      status,
      handledAt: new Date().toISOString(),
      handledBy: '当前用户',
    };
    return updated;
  });
  setStorageData(STORAGE_KEYS.ASSET_RISKS, nextRisks);
  return createSuccessResponse(updated);
}

async function completeOffboardingTask(taskId: string): Promise<ApiResponse<AssetOffboardingTask | null>> {
  ensureInit();
  await delay(120);
  const targetTask = visibleOffboardingTasks().find((task) => task.id === taskId);
  if (!targetTask) return createSuccessResponse(null);
  let updated: AssetOffboardingTask | null = null;
  const nextTasks = offboardingTasks().map((task) => {
    if (task.id !== taskId) return task;
    updated = {
      ...task,
      status: '已回收',
      permissionStatus: '已回收',
      handledAt: new Date().toISOString(),
      handler: '当前用户',
    };
    return updated;
  });
  if (targetTask?.assetType === '互联网账号') {
    setStorageData(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, accounts().map((account) => (
      account.id === targetTask.assetId
        ? { ...account, permissionStatus: '已回收', accountStatus: account.accountStatus === '已注销' ? account.accountStatus : '闲置', updatedAt: now() }
        : account
    )));
  }
  if (targetTask?.assetType === '设备资产') {
    setStorageData(STORAGE_KEYS.ASSET_DEVICES, devices().map((device) => (
      device.id === targetTask.assetId
        ? { ...device, status: '闲置', currentUser: '', updatedAt: now() }
        : device
    )));
  }
  if (targetTask?.assetType === '手机号资产') {
    setStorageData(STORAGE_KEYS.ASSET_PHONE_NUMBERS, phones().map((phone) => (
      phone.id === targetTask.assetId
        ? { ...phone, status: '闲置', updatedAt: now() }
        : phone
    )));
  }
  setStorageData(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, nextTasks);
  if (targetTask) {
    logAssetOperation('完成离职回收', targetTask.assetType, targetTask.assetId, targetTask.assetName, `${targetTask.employeeName}的${targetTask.assetType}已标记回收`);
    rebuildRisksAndOffboarding();
  }
  return createSuccessResponse(updated);
}

async function fetchMatrixPublishTasks(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetMatrixPublishTask>>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(paginate(filterMatrixPublishTasks(visibleMatrixPublishTasks(), filters), filters));
}

async function createMatrixPublishTask(input: Partial<AssetMatrixPublishTaskInput>): Promise<ApiResponse<AssetMatrixPublishTask>> {
  return guarded(() => {
    const title = requiredText(input.title, '任务标题不能为空');
    const dueAt = requiredText(input.dueAt, '截止时间不能为空');
    const accountIds = Array.from(new Set((input.accountIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (!accountIds.length) throw new Error('请选择发布账号');

    const availableAccounts = accounts();
    const selectedAccounts = accountIds.map((accountId) => {
      const account = availableAccounts.find((item) => item.id === accountId);
      if (!account) throw new Error('发布账号不存在或无权查看');
      if (!String(account.currentUser || '').trim()) throw new Error(`${account.platform} / ${account.accountName} 缺少当前使用人，不能派发`);
      return account;
    });
    const createdAt = now();
    const task: AssetMatrixPublishTask = {
      id: `matrix-task-${Date.now()}`,
      title,
      videoUrl: input.videoUrl || '',
      videoFileName: input.videoFileName || '',
      copywriting: input.copywriting || '',
      remark: input.remark || '',
      dueAt,
      targets: selectedAccounts.map(matrixTargetFromAccount),
      createdBy: '当前用户',
      createdAt,
      updatedAt: createdAt,
    };
    setStorageData(STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS, [task, ...matrixPublishTasks()]);
    logAssetOperation('创建矩阵发布', '矩阵发布', task.id, task.title, `创建发布任务，目标账号${task.targets.length}个`);
    return task;
  });
}

async function uploadMatrixPublishVideo(file: File): Promise<ApiResponse<{ url: string; fileName: string } | null>> {
  if (!shouldUseBackendApi()) return createErrorResponse('当前环境未启用后端上传');
  try {
    const headers = new Headers({
      'Content-Type': file.type || 'application/octet-stream',
      'X-File-Name': encodeURIComponent(file.name),
    });
    const token = readBackendToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(`${getBackendBaseUrl()}/uploads/matrix-video`, {
      method: 'POST',
      headers,
      body: file,
    });
    const payload = await response.json().catch(() => null) as ApiResponse<{ url: string; fileName: string }> | null;
    if (payload) return payload;
    return createErrorResponse(`视频上传失败：HTTP ${response.status}`);
  } catch (error: any) {
    return createErrorResponse(error.message || '视频上传失败');
  }
}

async function completeMatrixPublishTarget(taskId: string, accountId: string): Promise<ApiResponse<AssetMatrixPublishTarget | null>> {
  return guarded(() => {
    let completedTarget: AssetMatrixPublishTarget | null = null;
    const visibleAccountIds = new Set(visibleAccounts().map((account) => account.id));
    const nextTasks = matrixPublishTasks().map((task) => {
      if (task.id !== taskId) return task;
      const nextTargets = task.targets.map((target) => {
        if (target.accountId !== accountId) return target;
        if (!visibleAccountIds.has(target.accountId)) throw new Error('无权完成该账号任务');
        completedTarget = {
          ...target,
          status: 'completed',
          completedAt: now(),
        };
        return completedTarget;
      });
      return {
        ...task,
        targets: nextTargets,
        updatedAt: now(),
      };
    });
    if (!completedTarget) throw new Error('发布任务不存在');
    setStorageData(STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS, nextTasks);
    const target = completedTarget as AssetMatrixPublishTarget;
    logAssetOperation('完成矩阵发布', '矩阵发布', taskId, target.accountName, `${target.platform} / ${target.accountName} 已完成发布`);
    return target;
  });
}

async function fetchMatrixPublishStats(nowIso = now()): Promise<ApiResponse<AssetMatrixPublishStats>> {
  ensureInit();
  await delay(120);
  const visibleTasks = visibleMatrixPublishTasks();
  const dueAtByTargetId = new Map<string, string>();
  const targets = visibleTasks.flatMap((task) => {
    task.targets.forEach((target) => dueAtByTargetId.set(target.id, task.dueAt));
    return task.targets;
  });
  const overdueAccounts = targets.filter((target) => isMatrixTargetOverdue(target, dueAtByTargetId.get(target.id) || '', nowIso));
  const completedTargets = targets.filter((target) => target.status === 'completed').length;
  const stats: AssetMatrixPublishStats = {
    totalTargets: targets.length,
    completedTargets,
    pendingTargets: targets.length - completedTargets,
    overdueTargets: overdueAccounts.length,
    completionRate: targets.length ? Math.round((completedTargets / targets.length) * 100) : 0,
    overdueAccounts,
    byPlatform: summarizeMatrixTargets(targets, dueAtByTargetId, nowIso, 'platform') as AssetMatrixPublishStats['byPlatform'],
    byDepartment: summarizeMatrixTargets(targets, dueAtByTargetId, nowIso, 'department') as AssetMatrixPublishStats['byDepartment'],
    byAssignee: summarizeMatrixTargets(targets, dueAtByTargetId, nowIso, 'assignee') as AssetMatrixPublishStats['byAssignee'],
  };
  return createSuccessResponse(stats);
}

function getAccountPlatformOptions(): string[] {
  return Array.from(new Set(visibleAccounts().map((account) => account.platform))).filter(Boolean);
}

async function revealSensitiveField(
  type: AssetType,
  id: string,
  field: AssetSensitiveField,
): Promise<ApiResponse<AssetSensitiveRevealResult>> {
  return guarded(() => {
    if (type === 'device') {
      const device = visibleDevices().find((item) => item.id === id);
      if (!device) throw new Error('设备不存在');
      if (field !== 'imei') throw new Error('该字段不属于设备资产');
      logAssetOperation('查看敏感字段', '设备资产', device.id, device.deviceName, '查看敏感字段：IMEI');
      return { field, label: 'IMEI', value: device.imei };
    }
    if (type === 'phone') {
      const phone = visiblePhones().find((item) => item.id === id);
      if (!phone) throw new Error('手机号不存在');
      if (field === 'phoneNumber') {
        logAssetOperation('查看敏感字段', '手机号资产', phone.id, phone.phoneNumberMasked, '查看敏感字段：完整手机号');
        return { field, label: '完整手机号', value: phone.phoneNumber };
      }
      if (field === 'phoneRealName') {
        logAssetOperation('查看敏感字段', '手机号资产', phone.id, phone.phoneNumberMasked, '查看敏感字段：实名信息');
        return { field, label: '实名信息', value: phone.realName || '' };
      }
      throw new Error('该字段不属于手机号资产');
    }
    const account = visibleAccounts().find((item) => item.id === id);
    if (!account) throw new Error('互联网账号不存在');
    if (field === 'loginAccount') {
      logAssetOperation('查看敏感字段', '互联网账号', account.id, account.accountName, '查看敏感字段：登录账号');
      return { field, label: '登录账号', value: account.loginAccount };
    }
    if (field === 'accountRealName') {
      logAssetOperation('查看敏感字段', '互联网账号', account.id, account.accountName, '查看敏感字段：实名信息');
      return { field, label: '实名信息', value: account.realName || '' };
    }
    if (field === 'boundEmail') {
      logAssetOperation('查看敏感字段', '互联网账号', account.id, account.accountName, '查看敏感字段：绑定邮箱');
      return { field, label: '绑定邮箱', value: account.boundEmail || '' };
    }
    throw new Error('该字段不属于互联网账号');
  });
}

async function importAssetsFromCsv(type: AssetImportType, csvText: string): Promise<ApiResponse<AssetImportResult>> {
  ensureInit();
  await delay(120);

  try {
    const rows = readCsvRows(csvText);
    const failedRows: AssetImportFailedRow[] = [];
    const createdIds: string[] = [];

    for (const row of rows) {
      try {
        const response = type === 'devices'
          ? await createDevice(deviceInputFromCsv(row.raw))
          : type === 'phones'
            ? await createPhoneNumber(phoneInputFromCsv(row.raw))
            : await createInternetAccount(accountInputFromCsv(row.raw));
        if (response.code !== 0) {
          failedRows.push({ rowNumber: row.rowNumber, raw: row.raw, reason: response.message });
        } else {
          createdIds.push(response.data.id);
        }
      } catch (error: any) {
        failedRows.push({ rowNumber: row.rowNumber, raw: row.raw, reason: error.message || '导入失败' });
      }
    }

    const result: AssetImportResult = {
      type,
      totalRows: rows.length,
      successCount: createdIds.length,
      failedCount: failedRows.length,
      createdIds,
      failedRows,
    };
    logAssetOperation('CSV导入', '资产管理', type, ASSET_IMPORT_LABELS[type], `${ASSET_IMPORT_LABELS[type]}导入：成功${result.successCount}行，失败${result.failedCount}行`);
    rebuildRisksAndOffboarding();
    return createSuccessResponse(result);
  } catch (error: any) {
    return createErrorResponse(error.message || 'CSV导入失败');
  }
}

export const assetApi = {
  fetchDashboard,
  fetchDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  fetchPhoneNumbers,
  createPhoneNumber,
  updatePhoneNumber,
  deletePhoneNumber,
  fetchInternetAccounts,
  createInternetAccount,
  updateInternetAccount,
  deleteInternetAccount,
  createOffboardingTasksForEmployee,
  fetchRisks,
  fetchOperationLogs,
  fetchOffboardingTasks,
  fetchMatrixPublishTasks,
  createMatrixPublishTask,
  uploadMatrixPublishVideo,
  completeMatrixPublishTarget,
  fetchMatrixPublishStats,
  fetchDetail,
  updateRiskStatus,
  completeOffboardingTask,
  revealSensitiveField,
  importAssetsFromCsv,
  getImportTemplateCsv,
  getImportFailureCsv,
  getAccountPlatformOptions,
  inferPhoneOperator,
  inferPhoneAttributionLocation,
};
