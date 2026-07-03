import type {
  AssetDashboard,
  AssetDetailBundle,
  AssetDevice,
  AssetDeviceInput,
  AssetFilters,
  AssetInternetAccount,
  AssetInternetAccountInput,
  AssetOffboardingTask,
  AssetOperationLog,
  AssetPhoneNumber,
  AssetPhoneNumberInput,
  AssetRisk,
  AssetRiskStatus,
  AssetType,
} from '../types/asset';
import type { ApiResponse, PaginatedResponse } from './types';
import { createErrorResponse, createSuccessResponse, delay } from './types';
import { getStorageData, setStorageData } from './mock/storage';
import { DEFAULT_PAGE_SIZE, STORAGE_KEYS } from '../shared/utils/constants';
import { initializeMockData } from './mock';

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

  const existingTasks = new Map(offboardingTasks().map((task) => [task.assetId, task]));
  const nextTasks = accountRows
    .filter((account) => account.permissionStatus === '离职待回收')
    .map((account) => {
      const existing = existingTasks.get(account.id);
      return {
        id: existing?.id || `asset-offboarding-${account.id}`,
        employeeName: account.currentUser || account.owner || '待确认',
        department: account.department,
        assetType: '互联网账号' as const,
        assetId: account.id,
        assetName: `${account.platform} / ${account.accountName}`,
        permissionStatus: account.permissionStatus,
        status: existing?.status || '待回收' as const,
        dueAt: existing?.dueAt || now().slice(0, 10),
        handledAt: existing?.handledAt,
        handler: existing?.handler,
      };
    });
  setStorageData(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, nextTasks);
}

function requiredText(value: unknown, message: string): string {
  const text = String(value || '').trim();
  if (!text) throw new Error(message);
  return text;
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
      row.operator,
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

function detailLogs(type: AssetType, id: string): AssetOperationLog[] {
  const targetType: Record<AssetType, string> = {
    device: '设备资产',
    phone: '手机号资产',
    account: '互联网账号',
  };
  return logs()
    .filter((log) => log.targetId === id || log.targetType === targetType[type])
    .slice(0, 5);
}

function detailRisks(type: AssetType, id: string): AssetRisk[] {
  return risks().filter((risk) => risk.targetType === type && risk.targetId === id);
}

async function fetchDashboard(): Promise<ApiResponse<AssetDashboard>> {
  ensureInit();
  await delay(120);
  const deviceRows = devices();
  const phoneRows = phones();
  const accountRows = accounts();
  const dashboard: AssetDashboard = {
    deviceCount: deviceRows.length,
    phoneCount: phoneRows.length,
    accountCount: accountRows.length,
    openRiskCount: risks().filter((risk) => risk.status === 'open').length,
    offboardingCount: offboardingTasks().filter((task) => task.status === '待回收').length,
    monthlyCost: [
      ...deviceRows.map((item) => item.monthlyCost),
      ...phoneRows.map((item) => item.monthlyFee),
      ...accountRows.map((item) => item.monthlyFee),
    ].reduce((sum, value) => sum + Number(value || 0), 0),
    unboundAccountCount: accountRows.filter((account) => !account.phoneId).length,
  };
  return createSuccessResponse(dashboard);
}

async function fetchDevices(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetDevice>>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(paginate(filterDevices(devices(), filters), filters));
}

async function createDevice(input: Partial<AssetDeviceInput>): Promise<ApiResponse<AssetDevice>> {
  return guarded(() => {
    const rows = devices();
    const imei = requiredText(input.imei, 'IMEI不能为空');
    if (rows.some((device) => device.imei === imei)) throw new Error('IMEI已存在');
    const createdAt = now();
    const device: AssetDevice = {
      id: `asset-device-${Date.now()}`,
      deviceCode: input.deviceCode || nextNumber(rows, (device) => device.deviceCode, 'DEV'),
      deviceName: requiredText(input.deviceName, '设备名称不能为空'),
      brandModel: requiredText(input.brandModel, '品牌型号不能为空'),
      imei,
      imeiMasked: maskLongValue(imei),
      simType: input.simType || '双卡',
      ownerSubject: input.ownerSubject || '公司',
      department: input.department || '',
      owner: input.owner || '',
      currentUser: input.currentUser || '',
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
    const updated: AssetDevice = {
      ...existing,
      ...input,
      imei,
      imeiMasked: maskLongValue(imei),
      monthlyCost: Number(input.monthlyCost ?? existing.monthlyCost),
      updatedAt: now(),
    };
    setStorageData(STORAGE_KEYS.ASSET_DEVICES, rows.map((device) => (device.id === id ? updated : device)));
    logAssetOperation('编辑资料', '设备资产', updated.id, updated.deviceName, `编辑设备 ${updated.deviceCode}`);
    rebuildRisksAndOffboarding();
    return updated;
  });
}

async function fetchPhoneNumbers(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetPhoneNumber>>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(paginate(filterPhones(phones(), filters), filters));
}

function assertPhoneBinding(input: Partial<AssetPhoneNumberInput>, excludeId?: string): void {
  const deviceId = requiredText(input.deviceId, '所属设备不能为空');
  if (!getDevice(deviceId)) throw new Error('所属设备不存在');
  const slotType = input.slotType || '卡槽1';
  if (phones().some((phone) => phone.id !== excludeId && phone.deviceId === deviceId && phone.slotType === slotType)) {
    throw new Error('该设备卡槽已绑定手机号');
  }
  const boundCount = phones().filter((phone) => phone.id !== excludeId && phone.deviceId === deviceId).length;
  if (boundCount >= 2) throw new Error('设备最多绑定2个手机号');
}

async function createPhoneNumber(input: Partial<AssetPhoneNumberInput>): Promise<ApiResponse<AssetPhoneNumber>> {
  return guarded(() => {
    assertPhoneBinding(input);
    const rows = phones();
    const phoneNumber = requiredText(input.phoneNumber, '手机号不能为空');
    if (rows.some((phone) => phone.phoneNumber === phoneNumber)) throw new Error('手机号已存在');
    const createdAt = now();
    const phone: AssetPhoneNumber = {
      id: `asset-phone-${Date.now()}`,
      phoneNumber,
      phoneNumberMasked: maskPhone(phoneNumber),
      operator: input.operator || '移动',
      deviceId: requiredText(input.deviceId, '所属设备不能为空'),
      slotType: input.slotType || '卡槽1',
      packageName: input.packageName || '',
      monthlyFee: Number(input.monthlyFee || 0),
      owner: input.owner || '',
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
    const updated: AssetPhoneNumber = {
      ...existing,
      ...input,
      phoneNumber,
      phoneNumberMasked: maskPhone(phoneNumber),
      monthlyFee: Number(input.monthlyFee ?? existing.monthlyFee),
      updatedAt: now(),
    };
    setStorageData(STORAGE_KEYS.ASSET_PHONE_NUMBERS, rows.map((phone) => (phone.id === id ? updated : phone)));
    logAssetOperation('编辑资料', '手机号资产', updated.id, updated.phoneNumberMasked, `编辑手机号 ${updated.phoneNumberMasked}`);
    rebuildRisksAndOffboarding();
    return updated;
  });
}

async function fetchInternetAccounts(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetInternetAccount>>> {
  ensureInit();
  await delay(120);
  return createSuccessResponse(paginate(filterAccounts(accounts(), filters), filters));
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
    const account: AssetInternetAccount = {
      id: `asset-account-${Date.now()}`,
      accountNo: input.accountNo || nextNumber(rows, (account) => account.accountNo, 'A'),
      platform: requiredText(input.platform, '平台不能为空'),
      accountName: requiredText(input.accountName, '账号名称不能为空'),
      loginAccount,
      loginAccountMasked: maskLogin(loginAccount),
      phoneId: normalizePhoneId(input.phoneId),
      boundEmail: input.boundEmail || '',
      boundEmailMasked: maskEmail(input.boundEmail),
      ownerSubject: input.ownerSubject || '公司',
      department: input.department || '',
      owner: input.owner || '',
      currentUser: input.currentUser || '',
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
    const updated: AssetInternetAccount = {
      ...existing,
      ...input,
      phoneId: nextPhoneId,
      loginAccount,
      loginAccountMasked: maskLogin(loginAccount),
      boundEmailMasked: maskEmail(input.boundEmail ?? existing.boundEmail),
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

async function fetchRisks(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetRisk>>> {
  ensureInit();
  await delay(120);
  const keyword = filters?.search?.trim().toLowerCase();
  const filtered = risks().filter((risk) => {
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
  const filtered = logs().filter((log) => (
    !keyword || [log.action, log.targetType, log.targetName, log.operator, log.detail].some((value) => includesKeyword(value, keyword))
  ));
  return createSuccessResponse(paginate(filtered, filters));
}

async function fetchOffboardingTasks(filters?: AssetFilters): Promise<ApiResponse<PaginatedResponse<AssetOffboardingTask>>> {
  ensureInit();
  await delay(120);
  const keyword = filters?.search?.trim().toLowerCase();
  const filtered = offboardingTasks().filter((task) => {
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
  if (type === 'device') {
    const device = getDevice(id);
    if (!device) return createSuccessResponse(null);
    const relatedPhones = phones().filter((phone) => phone.deviceId === id);
    return createSuccessResponse({
      type,
      device,
      relatedPhones,
      relatedAccounts: relatedAccountsForDevice(id),
      risks: detailRisks(type, id),
      logs: detailLogs(type, id),
    });
  }
  if (type === 'phone') {
    const phone = getPhone(id);
    if (!phone) return createSuccessResponse(null);
    return createSuccessResponse({
      type,
      phone,
      relatedDevice: getDevice(phone.deviceId),
      relatedPhones: [phone],
      relatedAccounts: relatedAccountsForPhone(id),
      risks: detailRisks(type, id),
      logs: detailLogs(type, id),
    });
  }
  const account = getAccount(id);
  if (!account) return createSuccessResponse(null);
  const phone = getPhone(account.phoneId);
  return createSuccessResponse({
    type,
    account,
    relatedDevice: getPhoneDevice(phone),
    relatedPhones: phone ? [phone] : [],
    relatedAccounts: [account],
    risks: detailRisks(type, id),
    logs: detailLogs(type, id),
  });
}

async function updateRiskStatus(riskId: string, status: AssetRiskStatus): Promise<ApiResponse<AssetRisk | null>> {
  ensureInit();
  await delay(120);
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
  setStorageData(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, nextTasks);
  return createSuccessResponse(updated);
}

function getAccountPlatformOptions(): string[] {
  return Array.from(new Set(accounts().map((account) => account.platform))).filter(Boolean);
}

export const assetApi = {
  fetchDashboard,
  fetchDevices,
  createDevice,
  updateDevice,
  fetchPhoneNumbers,
  createPhoneNumber,
  updatePhoneNumber,
  fetchInternetAccounts,
  createInternetAccount,
  updateInternetAccount,
  fetchRisks,
  fetchOperationLogs,
  fetchOffboardingTasks,
  fetchDetail,
  updateRiskStatus,
  completeOffboardingTask,
  getAccountPlatformOptions,
};
