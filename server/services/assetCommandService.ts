import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser, type DataVisibilityScope } from '../../src/shared/utils/dataVisibility';
import { hasExplicitPermission, hasPermission, isSuperAdmin, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import {
  DeviceImeiValidationError,
  validateDeviceImeis,
} from '../../src/domain/assets/deviceImei';
import {
  hasDuplicateDeviceBrandModel,
  normalizeAssetAccount,
  normalizeAssetDevice,
  normalizeAssetPhone,
  readAccountControlStatus,
  readDeviceCommunicationType,
} from '../../src/domain/assets/assetFields';
import {
  normalizeIdentityAccountIds,
  validateIdentityAccountIds,
} from '../../src/domain/assets/accountIdentityBindings';
import {
  normalizeAccountLoginDeviceIds,
  validateAccountLoginDeviceIds,
} from '../../src/domain/assets/accountDeviceBindings';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  AssetDevice,
  AssetDeviceInput,
  AssetInternetAccount,
  AssetInternetAccountInput,
  AssetMatrixPublishTask,
  AssetMatrixPublishTaskInput,
  AssetOffboardingTask,
  AssetOperationLog,
  AssetPhoneNumber,
  AssetPhoneNumberInput,
  AssetRisk,
  AssetSensitiveRevealResult,
} from '../../src/types/asset';
import type { Department } from '../../src/types/department';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';
import { createAssetCredentialCrypto, type AssetCredentialCrypto, type AssetEncryptedCredential } from './assetCredentialCrypto';
import { assertMarketingContentReadyForPublish } from '../../src/domain/marketing/marketingContent';
import type { MarketingContent } from '../../src/types/marketing';

type AssetCommandPrisma = Pick<PrismaClient, 'appStorage' | 'user' | 'role' | 'department' | 'employeeTask' | '$transaction'>;
type LockedStorageRow = { key: string; value: unknown };
type Directory = { users: User[]; roles: Role[]; departments: Department[] };
type AssetOrgInput = {
  ownerId?: string;
  owner?: string;
  currentUserId?: string;
  currentUser?: string;
  departmentId?: string;
  department?: string;
};

type AssetState = {
  devices: AssetDevice[];
  phones: AssetPhoneNumber[];
  accounts: AssetInternetAccount[];
  accountCredentials: AssetAccountCredentialRecord[];
  risks: AssetRisk[];
  logs: AssetOperationLog[];
  offboardingTasks: AssetOffboardingTask[];
  matrixTasks: AssetMatrixPublishTask[];
  marketingContents: MarketingContent[];
};

export interface AssetCommandServiceOptions {
  now?: () => Date;
  id?: (prefix: string) => string;
  credentialCrypto?: AssetCredentialCrypto;
}

type AssetAccountCredentialRecord = AssetEncryptedCredential & {
  id: string;
  accountId: string;
  type: 'loginPassword' | 'paymentPassword';
  updatedAt: string;
  updatedBy: string;
};

class AssetCommandError extends Error {
  constructor(readonly responseCode: number, message: string) {
    super(message);
    this.name = 'AssetCommandError';
  }
}

const STATE_KEYS = [
  STORAGE_KEYS.ASSET_DEVICES,
  STORAGE_KEYS.ASSET_PHONE_NUMBERS,
  STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS,
  STORAGE_KEYS.ASSET_ACCOUNT_CREDENTIALS,
  STORAGE_KEYS.ASSET_RISKS,
  STORAGE_KEYS.ASSET_OPERATION_LOGS,
  STORAGE_KEYS.ASSET_OFFBOARDING_TASKS,
  STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS,
  STORAGE_KEYS.MARKETING_CONTENTS,
] as const;

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readArray<T>(values: Map<string, unknown>, key: string): T[] {
  const value = values.get(key);
  if (!Array.isArray(value)) throw new AssetCommandError(409, `${key}数据损坏，请先修复数据`);
  return structuredClone(value) as T[];
}

async function lockState(transaction: Prisma.TransactionClient): Promise<AssetState> {
  for (const key of STATE_KEYS) {
    await transaction.appStorage.upsert({
      where: { key },
      update: {},
      create: { key, value: [] },
    });
  }
  const rows = await transaction.$queryRaw<LockedStorageRow[]>(Prisma.sql`
    SELECT \`key\`, value
    FROM app_storage
    WHERE \`key\` IN (${Prisma.join([...STATE_KEYS])})
    ORDER BY \`key\`
    FOR UPDATE
  `);
  const values = new Map(rows.map((row) => [row.key, row.value]));
  return {
    devices: readArray<AssetDevice>(values, STORAGE_KEYS.ASSET_DEVICES).map((device) => normalizeAssetDevice({ ...device })),
    phones: readArray<AssetPhoneNumber>(values, STORAGE_KEYS.ASSET_PHONE_NUMBERS).map((phone) => normalizeAssetPhone({ ...phone })),
    accounts: readArray<AssetInternetAccount>(values, STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS).map((account) => normalizeAssetAccount({ ...account })),
    accountCredentials: readArray<AssetAccountCredentialRecord>(values, STORAGE_KEYS.ASSET_ACCOUNT_CREDENTIALS),
    risks: readArray<AssetRisk>(values, STORAGE_KEYS.ASSET_RISKS),
    logs: readArray<AssetOperationLog>(values, STORAGE_KEYS.ASSET_OPERATION_LOGS),
    offboardingTasks: readArray<AssetOffboardingTask>(values, STORAGE_KEYS.ASSET_OFFBOARDING_TASKS),
    matrixTasks: readArray<AssetMatrixPublishTask>(values, STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS),
    marketingContents: readArray<MarketingContent>(values, STORAGE_KEYS.MARKETING_CONTENTS),
  };
}

async function persistState(transaction: Prisma.TransactionClient, state: AssetState): Promise<void> {
  const values: Array<[string, unknown]> = [
    [STORAGE_KEYS.ASSET_DEVICES, state.devices],
    [STORAGE_KEYS.ASSET_PHONE_NUMBERS, state.phones],
    [STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, state.accounts],
    [STORAGE_KEYS.ASSET_ACCOUNT_CREDENTIALS, state.accountCredentials],
    [STORAGE_KEYS.ASSET_RISKS, state.risks],
    [STORAGE_KEYS.ASSET_OPERATION_LOGS, state.logs],
    [STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, state.offboardingTasks],
    [STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS, state.matrixTasks],
    [STORAGE_KEYS.MARKETING_CONTENTS, state.marketingContents],
  ];
  for (const [key, value] of values) {
    await transaction.appStorage.upsert({
      where: { key },
      update: { value: jsonValue(value) },
      create: { key, value: jsonValue(value) },
    });
  }
}

async function loadDirectory(prisma: AssetCommandPrisma): Promise<Directory> {
  const [users, roles, departments] = await Promise.all([
    prisma.user.findMany(),
    prisma.role.findMany({ where: { isActive: true } }),
    prisma.department.findMany(),
  ]);
  return {
    users: users.map(mapPrismaUser),
    roles: roles.map(mapPrismaRole),
    departments: departments as unknown as Department[],
  };
}

function cleanText(value: unknown): string {
  return String(value || '').trim();
}

function shanghaiBusinessDate(value: unknown): string {
  const date = new Date(cleanText(value));
  if (Number.isNaN(date.getTime())) throw new AssetCommandError(400, '计划发布时间格式不正确');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function requiredText(value: unknown, message: string): string {
  const text = cleanText(value);
  if (!text) throw new AssetCommandError(400, message);
  return text;
}

function masked(value: unknown): boolean {
  return /[*•]/.test(cleanText(value));
}

function validateCommandDeviceImeis(
  input: Parameters<typeof validateDeviceImeis>[0],
  devices: AssetDevice[],
  currentDeviceId?: string,
) {
  try {
    return validateDeviceImeis(input, devices, currentDeviceId);
  } catch (error) {
    if (error instanceof DeviceImeiValidationError) {
      throw new AssetCommandError(error.kind === 'duplicate' ? 409 : 400, error.message);
    }
    throw error;
  }
}

function maskPhone(value: string): string {
  return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
}

function maskRealName(value: unknown): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  if (text.length === 1) return '*';
  return `${text.slice(0, 1)}*${text.slice(2)}`;
}

function maskLogin(value: string): string {
  const prefix = value.split(/[_@.-]/)[0] || value.slice(0, 5);
  return `${prefix}_***`;
}

function maskEmail(value: unknown): string | undefined {
  const text = cleanText(value);
  if (!text) return undefined;
  const [name, domain] = text.split('@');
  if (!domain) return maskLogin(text);
  return `${name.slice(0, 2)}***@${domain}`;
}

function maskIdentifier(value: unknown): string | undefined {
  const raw = cleanText(value);
  if (!raw) return undefined;
  if (raw.length <= 8) return `${raw.slice(0, 2)}****${raw.slice(-2)}`;
  return `${raw.slice(0, 6)}${'*'.repeat(Math.min(8, raw.length - 10))}${raw.slice(-4)}`;
}

function maskSecret(value: unknown): string | undefined {
  return cleanText(value) ? '••••••' : undefined;
}

function sanitizePhoneCommandResult(phone: AssetPhoneNumber): AssetPhoneNumber {
  return { ...phone, servicePassword: undefined };
}

function nextNumber(rows: AssetDevice[]): string {
  const max = rows.reduce((current, row) => {
    const value = Number(String(row.deviceCode || '').replace(/\D/g, ''));
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 0);
  return `DEV-${String(max + 1).padStart(4, '0')}`;
}

function nextAccountNumber(rows: AssetInternetAccount[]): string {
  const max = rows.reduce((current, row) => {
    const value = Number(String(row.accountNo || '').replace(/\D/g, ''));
    return Number.isFinite(value) ? Math.max(current, value) : current;
  }, 0);
  return `A-${String(max + 1).padStart(4, '0')}`;
}

function activeUser(user: User): boolean {
  return user.isActive && (user.employmentStatus || 'active') === 'active';
}

function resolveUser(directory: Directory, id: unknown, name: unknown, label: string): User | undefined {
  const userId = cleanText(id);
  const userName = cleanText(name);
  if (!userId && !userName) return undefined;
  const candidates = directory.users.filter(activeUser).filter((user) => (
    userId ? user.id === userId : user.name === userName
  ));
  if (candidates.length !== 1) throw new AssetCommandError(400, `${label}不存在、已停用或姓名不唯一`);
  const user = candidates[0];
  if (userName && user.name !== userName) throw new AssetCommandError(400, `${label}标识与姓名不一致`);
  return user;
}

function resolveDepartment(directory: Directory, id: unknown, name: unknown): Department | undefined {
  const departmentId = cleanText(id);
  const departmentName = cleanText(name);
  if (!departmentId && !departmentName) return undefined;
  const candidates = directory.departments.filter((department) => department.isActive).filter((department) => (
    departmentId ? department.id === departmentId : department.name === departmentName
  ));
  if (candidates.length !== 1) throw new AssetCommandError(400, '所属部门不存在或已停用');
  const department = candidates[0];
  if (departmentName && department.name !== departmentName) throw new AssetCommandError(400, '部门标识与名称不一致');
  return department;
}

function resolveOrgFields(input: AssetOrgInput, directory: Directory) {
  const owner = resolveUser(directory, input.ownerId, input.owner, '负责人');
  const currentUser = resolveUser(directory, input.currentUserId, input.currentUser, '当前使用人');
  const explicitDepartment = resolveDepartment(directory, input.departmentId, input.department);
  const inheritedDepartmentId = currentUser?.departmentId || owner?.departmentId;
  const inheritedDepartment = inheritedDepartmentId
    ? directory.departments.find((department) => department.id === inheritedDepartmentId && department.isActive)
    : undefined;
  const department = explicitDepartment || inheritedDepartment;
  return {
    ownerId: owner?.id || '',
    owner: owner?.name || '',
    currentUserId: currentUser?.id || '',
    currentUser: currentUser?.name || '',
    departmentId: department?.id || '',
    department: department?.name || '',
  };
}

function visibleToScope(
  asset: {
    ownerId?: string;
    owner?: string;
    currentUserId?: string;
    currentUser?: string;
    departmentId?: string;
  },
  scope: DataVisibilityScope,
  directory: Directory,
): boolean {
  if (scope.unrestricted) return true;
  if (asset.ownerId && scope.visibleUserIds.includes(asset.ownerId)) return true;
  if (asset.currentUserId && scope.visibleUserIds.includes(asset.currentUserId)) return true;
  if (asset.owner && scope.visibleUserNames.includes(asset.owner)) return true;
  if (asset.currentUser && scope.visibleUserNames.includes(asset.currentUser)) return true;
  if (scope.dataScopeLevel === 'department' && asset.departmentId) {
    return directory.users.some((user) => (
      user.departmentId === asset.departmentId && scope.visibleUserIds.includes(user.id)
    ));
  }
  return false;
}

function addLog(
  state: AssetState,
  id: string,
  time: string,
  actor: AuthenticatedUser,
  action: string,
  targetType: string,
  targetId: string,
  targetName: string,
  detail: string,
): void {
  state.logs.unshift({ id, time, action, targetType, targetId, targetName, operator: actor.name, detail });
}

function syncDeviceRisks(state: AssetState, changedAt: string): void {
  const managed = (risk: AssetRisk) => (
    risk.riskKey.startsWith('device-no-owner-')
    || risk.riskKey.startsWith('idle-device-has-accounts-')
  );
  const existing = new Map(state.risks.filter(managed).map((risk) => [risk.riskKey, risk]));
  const derived: AssetRisk[] = [];
  state.devices.forEach((device) => {
    if (!cleanText(device.owner)) {
      const riskKey = `device-no-owner-${device.id}`;
      const previous = existing.get(riskKey);
      derived.push({
        id: previous?.id || `asset-risk-${riskKey}`,
        riskKey,
        type: '无负责人资产',
        targetType: 'device',
        targetId: device.id,
        targetName: device.deviceName,
        level: '高',
        status: previous?.status || 'open',
        description: '设备负责人为空，责任归属不清。',
        createdAt: previous?.createdAt || changedAt,
        handledAt: previous?.handledAt,
        handledBy: previous?.handledBy,
        remark: previous?.remark,
      });
    }
    if (device.status === '闲置' && state.accounts.some((account) => normalizeAccountLoginDeviceIds(account.loginDeviceIds).includes(device.id))) {
      const riskKey = `idle-device-has-accounts-${device.id}`;
      const previous = existing.get(riskKey);
      derived.push({
        id: previous?.id || `asset-risk-${riskKey}`,
        riskKey,
        type: '闲置设备仍有关联账号',
        targetType: 'device',
        targetId: device.id,
        targetName: device.deviceName,
        level: '中',
        status: previous?.status || 'open',
        description: '设备已闲置，但仍有关联互联网账号。',
        createdAt: previous?.createdAt || changedAt,
        handledAt: previous?.handledAt,
        handledBy: previous?.handledBy,
        remark: previous?.remark,
      });
    }
  });
  state.risks = [...derived, ...state.risks.filter((risk) => !managed(risk))];
}

function syncPhoneRisks(state: AssetState, changedAt: string): void {
  const managed = (risk: AssetRisk) => risk.riskKey.startsWith('phone-no-owner-');
  const existing = new Map(state.risks.filter(managed).map((risk) => [risk.riskKey, risk]));
  const derived = state.phones.filter((phone) => !cleanText(phone.owner)).map((phone): AssetRisk => {
    const riskKey = `phone-no-owner-${phone.id}`;
    const previous = existing.get(riskKey);
    return {
      id: previous?.id || `asset-risk-${riskKey}`,
      riskKey,
      type: '无负责人资产',
      targetType: 'phone',
      targetId: phone.id,
      targetName: phone.phoneNumberMasked,
      level: '中',
      status: previous?.status || 'open',
      description: '手机号负责人为空，责任归属不清。',
      createdAt: previous?.createdAt || changedAt,
      handledAt: previous?.handledAt,
      handledBy: previous?.handledBy,
      remark: previous?.remark,
    };
  });
  state.risks = [...derived, ...state.risks.filter((risk) => !managed(risk))];
}

function syncAccountRisks(state: AssetState, changedAt: string): void {
  const managed = (risk: AssetRisk) => (
    risk.riskKey.startsWith('account-unbound-phone-')
    || risk.riskKey.startsWith('offboarding-account-')
    || risk.riskKey.startsWith('account-no-owner-')
    || risk.riskKey.startsWith('account-login-credential-missing-')
    || risk.riskKey.startsWith('account-payment-credential-missing-')
    || risk.riskKey.startsWith('account-identity-unavailable-')
  );
  const existing = new Map(state.risks.filter(managed).map((risk) => [risk.riskKey, risk]));
  const derived: AssetRisk[] = [];
  const add = (
    account: AssetInternetAccount,
    riskKey: string,
    type: string,
    level: AssetRisk['level'],
    description: string,
  ) => {
    const previous = existing.get(riskKey);
    derived.push({
      id: previous?.id || `asset-risk-${riskKey}`,
      riskKey,
      type,
      targetType: 'account',
      targetId: account.id,
      targetName: `${account.platform} / ${account.accountName}`,
      level,
      status: previous?.status || 'open',
      description,
      createdAt: previous?.createdAt || changedAt,
      handledAt: previous?.handledAt,
      handledBy: previous?.handledBy,
      remark: previous?.remark,
    });
  };
  state.accounts.forEach((account) => {
    normalizeIdentityAccountIds(account.identityAccountIds).forEach((identityAccountId) => {
      const identityAccount = state.accounts.find((item) => item.id === identityAccountId);
      if (!identityAccount || ['异常', '封禁', '已注销'].includes(identityAccount.accountStatus) || readAccountControlStatus(identityAccount) !== '已掌控') {
        add(
          account,
          `account-identity-unavailable-${account.id}-${identityAccountId}`,
          '身份账号异常',
          '高',
          '关联的 Apple ID 或 Google账号不可用，登录与恢复链路可能中断。',
        );
      }
    });
    if (account.loginMethod === '密码登录' && account.loginCredentialStatus !== '已设置') {
      add(account, `account-login-credential-missing-${account.id}`, '登录凭证待补齐', '高', '账号采用密码登录，但登录密码尚未进入企业凭证库。');
    }
    if (account.requiresPaymentPassword && account.paymentCredentialStatus !== '已设置') {
      add(account, `account-payment-credential-missing-${account.id}`, '支付凭证待补齐', '高', '账号涉及支付，但支付密码尚未进入企业凭证库。');
    }
    if (!account.phoneId) {
      add(
        account,
        `account-unbound-phone-${account.id}`,
        '未绑定手机号账号',
        '中',
        '互联网账号未绑定手机号，后续登录、验证和回收链路不完整。',
      );
    }
    if (readAccountControlStatus(account) === '离职待回收') {
      add(
        account,
        `offboarding-account-${account.id}`,
        '离职待回收账号',
        '高',
        '账号当前权限状态为离职待回收，需要确认控制权已收回。',
      );
    }
    if (!cleanText(account.owner)) {
      add(
        account,
        `account-no-owner-${account.id}`,
        '无负责人资产',
        '高',
        '账号负责人为空，责任归属不清。',
      );
    }
  });
  state.risks = [...derived, ...state.risks.filter((risk) => !managed(risk))];
}

function syncAccountOffboardingTasks(state: AssetState, changedAt: string): void {
  const existingByAssetId = new Map(state.offboardingTasks.map((task) => [task.assetId, task]));
  const preserved = state.offboardingTasks.filter((task) => (
    task.assetType !== '互联网账号'
    || task.status === '已回收'
  ));
  const pending = state.accounts.filter((account) => readAccountControlStatus(account) === '离职待回收').map((account) => {
    const previous = existingByAssetId.get(account.id);
    return {
      id: previous?.id || `asset-offboarding-${account.id}`,
      employeeName: account.currentUser || account.owner || '待确认',
      department: account.department,
      assetType: '互联网账号' as const,
      assetId: account.id,
      assetName: `${account.platform} / ${account.accountName}`,
      permissionStatus: account.permissionStatus,
      status: previous?.status || '待回收' as const,
      dueAt: previous?.dueAt || changedAt.slice(0, 10),
      handledAt: previous?.handledAt,
      handler: previous?.handler,
    };
  });
  state.offboardingTasks = [...preserved, ...pending];
}

export function createAssetCommandService(
  prisma: AssetCommandPrisma,
  options: AssetCommandServiceOptions = {},
) {
  const now = options.now || (() => new Date());
  const makeId = options.id || ((prefix: string) => `${prefix}-${randomUUID()}`);
  const credentialCrypto = options.credentialCrypto || createAssetCredentialCrypto();

  const saveCredential = (
    state: AssetState,
    accountId: string,
    type: AssetAccountCredentialRecord['type'],
    secret: unknown,
    actor: AuthenticatedUser,
    changedAt: string,
  ) => {
    const value = cleanText(secret);
    if (!value) return false;
    const encrypted = credentialCrypto.encrypt(value, `${accountId}:${type}`);
    const previous = state.accountCredentials.find((item) => item.accountId === accountId && item.type === type);
    const record: AssetAccountCredentialRecord = {
      id: previous?.id || makeId('asset-credential'),
      accountId,
      type,
      ...encrypted,
      updatedAt: changedAt,
      updatedBy: actor.id,
    };
    state.accountCredentials = [
      ...state.accountCredentials.filter((item) => !(item.accountId === accountId && item.type === type)),
      record,
    ];
    return true;
  };

  return {
    async revealAccountCredential(
      id: string,
      field: 'loginPassword' | 'paymentPassword',
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetSensitiveRevealResult | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW, 'read')) {
        return failure('无权查看账号密码', 403);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const result = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const account = state.accounts.find((item) => item.id === id);
          if (!account) throw new AssetCommandError(404, '互联网账号不存在');
          if (!visibleToScope(account, scope, directory)) throw new AssetCommandError(403, '无权查看该互联网账号');
          const credential = state.accountCredentials.find((item) => item.accountId === id && item.type === field);
          if (!credential) throw new AssetCommandError(404, field === 'loginPassword' ? '该账号未保存登录密码' : '该账号未保存支付密码');
          const revealedAt = now().toISOString();
          const label = field === 'loginPassword' ? '登录密码' : '支付密码';
          addLog(state, makeId('asset-log'), revealedAt, actor, '查看敏感字段', '互联网账号', account.id, account.accountName, `查看敏感字段：${label}`);
          await persistState(transaction, state);
          return { field, label, value: credentialCrypto.decrypt(credential, `${id}:${field}`) };
        });
        return success(result);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },
    async revealPhoneServicePassword(
      id: string,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetSensitiveRevealResult | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW, 'read')) {
        return failure('无权查看服务密码', 403);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const revealed = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const phone = state.phones.find((item) => item.id === id);
          if (!phone) throw new AssetCommandError(404, '手机号不存在');
          const linkedDevice = phone.deviceId ? state.devices.find((device) => device.id === phone.deviceId) : undefined;
          const canViewPhone = visibleToScope(phone, scope, directory)
            || Boolean(linkedDevice && visibleToScope(linkedDevice, scope, directory));
          if (!canViewPhone) throw new AssetCommandError(403, '无权查看该手机号资产');
          if (!phone.servicePassword) throw new AssetCommandError(404, '该手机号未保存服务密码');
          const revealedAt = now().toISOString();
          addLog(
            state,
            makeId('asset-log'),
            revealedAt,
            actor,
            '查看敏感字段',
            '手机号资产',
            phone.id,
            phone.phoneNumberMasked,
            '查看敏感字段：服务密码',
          );
          await persistState(transaction, state);
          return { field: 'servicePassword' as const, label: '服务密码', value: phone.servicePassword };
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success(revealed);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async createDevice(
      input: Partial<AssetDeviceInput>,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetDevice | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_DEVICES, 'write')) {
        return failure('无权新增设备资产', 403);
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return failure('设备资产数据无效', 400);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const createdAt = now().toISOString();
        const org = resolveOrgFields(input, directory);
        const created = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const normalized = normalizeAssetDevice(input);
          const brand = requiredText(normalized.brand, '设备品牌不能为空');
          const model = requiredText(normalized.model, '设备型号不能为空');
          if (hasDuplicateDeviceBrandModel(brand, model)) {
            throw new AssetCommandError(400, '品牌和型号不能填写为同一内容');
          }
          const imeiFields = validateCommandDeviceImeis(normalized, state.devices);
          const device = normalizeAssetDevice({
            id: makeId('asset-device'),
            deviceCode: cleanText(input.deviceCode) || nextNumber(state.devices),
            deviceName: requiredText(input.deviceName, '设备名称不能为空'),
            deviceCategory: normalized.deviceCategory,
            brand,
            model,
            brandModel: [brand, model].join(' '),
            ...imeiFields,
            communicationType: normalized.communicationType,
            simType: normalized.simType,
            serialNumber: normalized.serialNumber,
            acquisitionType: normalized.acquisitionType,
            purchaseAmount: normalized.purchaseAmount,
            monthlyRent: normalized.acquisitionType === '租赁' ? normalized.monthlyRent : 0,
            acquiredAt: normalized.acquiredAt,
            warrantyExpiresAt: normalized.warrantyExpiresAt,
            ownerSubject: input.ownerSubject || '公司',
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            status: input.status || '库存中',
            riskLevel: input.riskLevel || '低',
            monthlyCost: normalized.acquisitionType === '租赁' ? normalized.monthlyRent : 0,
            remark: cleanText(input.remark) || undefined,
            createdAt,
            updatedAt: createdAt,
          });
          if (!visibleToScope(device, scope, directory)) {
            throw new AssetCommandError(403, '无权为该员工或部门新增设备资产');
          }
          state.devices.unshift(device);
          syncDeviceRisks(state, createdAt);
          addLog(
            state,
            makeId('asset-log'),
            createdAt,
            actor,
            '新增资产',
            '设备资产',
            device.id,
            device.deviceName,
            `新增设备 ${device.deviceCode}`,
          );
          await persistState(transaction, state);
          return device;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success(created);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async updateDevice(
      id: string,
      input: Partial<AssetDeviceInput>,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetDevice | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_DEVICES, 'write')) {
        return failure('无权编辑设备资产', 403);
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return failure('设备资产数据无效', 400);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const updatedAt = now().toISOString();
        const updated = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const existing = state.devices.find((device) => device.id === id);
          if (!existing) throw new AssetCommandError(404, '设备不存在');
          if (!visibleToScope(existing, scope, directory)) throw new AssetCommandError(403, '无权编辑该设备资产');
          const normalized = normalizeAssetDevice({
            ...existing,
            ...input,
            communicationType: input.communicationType ?? (input.simType ? input.simType : existing.communicationType),
          });
          const communicationType = readDeviceCommunicationType(normalized);
          if (hasDuplicateDeviceBrandModel(normalized.brand, normalized.model)) {
            throw new AssetCommandError(400, '品牌和型号不能填写为同一内容');
          }
          if (communicationType !== '双卡' && state.phones.some((phone) => phone.deviceId === id && phone.slotType === '卡槽2')) {
            throw new AssetCommandError(409, '非双卡设备不能保留卡槽2手机号');
          }
          if (communicationType === '无SIM' && state.phones.some((phone) => phone.deviceId === id)) {
            throw new AssetCommandError(409, '无SIM设备不能保留已绑定手机号');
          }
          const org = resolveOrgFields({ ...existing, ...input }, directory);
          const imeiFields = validateCommandDeviceImeis({
            ...existing,
            ...input,
            communicationType,
            imei1: input.imei1 === undefined
              ? input.imei === undefined ? existing.imei1 || existing.imei : input.imei
              : input.imei1,
          }, state.devices, id);
          const {
            imei: _legacyImei,
            imeiMasked: _legacyImeiMasked,
            ...existingWithoutLegacyImei
          } = existing;
          const next = normalizeAssetDevice({
            ...existingWithoutLegacyImei,
            deviceCode: input.deviceCode === undefined ? existing.deviceCode : requiredText(input.deviceCode, '设备编号不能为空'),
            deviceName: input.deviceName === undefined ? existing.deviceName : requiredText(input.deviceName, '设备名称不能为空'),
            brand: requiredText(normalized.brand, '设备品牌不能为空'),
            model: requiredText(normalized.model, '设备型号不能为空'),
            brandModel: [normalized.brand, normalized.model].join(' '),
            deviceCategory: normalized.deviceCategory,
            serialNumber: normalized.serialNumber,
            ...imeiFields,
            communicationType,
            acquisitionType: normalized.acquisitionType,
            purchaseAmount: normalized.purchaseAmount,
            monthlyRent: normalized.acquisitionType === '租赁' ? normalized.monthlyRent : 0,
            acquiredAt: normalized.acquiredAt,
            warrantyExpiresAt: normalized.warrantyExpiresAt,
            ownerSubject: input.ownerSubject || existing.ownerSubject,
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            status: input.status || existing.status,
            riskLevel: input.riskLevel || existing.riskLevel,
            monthlyCost: normalized.acquisitionType === '租赁' ? normalized.monthlyRent : 0,
            remark: input.remark === undefined ? existing.remark : cleanText(input.remark) || undefined,
            updatedAt,
          });
          if (!visibleToScope(next, scope, directory)) {
            throw new AssetCommandError(403, '无权将设备资产转移给该员工或部门');
          }
          state.devices = state.devices.map((device) => device.id === id ? next : device);
          syncDeviceRisks(state, updatedAt);
          addLog(
            state,
            makeId('asset-log'),
            updatedAt,
            actor,
            '编辑资料',
            '设备资产',
            next.id,
            next.deviceName,
            `编辑设备 ${next.deviceCode}`,
          );
          await persistState(transaction, state);
          return next;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success(updated);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async deleteDevice(
      id: string,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetDevice | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_DEVICES, 'delete')) {
        return failure('无权删除设备资产', 403);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const deletedAt = now().toISOString();
        const deleted = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const existing = state.devices.find((device) => device.id === id);
          if (!existing) throw new AssetCommandError(404, '设备不存在');
          if (!visibleToScope(existing, scope, directory)) throw new AssetCommandError(403, '无权删除该设备资产');
          const relatedPhones = state.phones.filter((phone) => phone.deviceId === id);
          const relatedPhoneIds = new Set(relatedPhones.map((phone) => phone.id));
          const relatedAccounts = state.accounts.filter((account) => (
            Boolean(account.phoneId && relatedPhoneIds.has(account.phoneId))
            || normalizeAccountLoginDeviceIds(account.loginDeviceIds).includes(id)
          ));
          if (relatedPhones.length && !hasPermission(actor, PERMISSION_KEYS.ASSETS_PHONES, 'delete')) {
            throw new AssetCommandError(403, '删除该设备会同步删除手机号，需要手机号删除权限');
          }
          if (relatedAccounts.length && !hasPermission(actor, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'write')) {
            throw new AssetCommandError(403, '删除该设备会解绑互联网账号，需要账号编辑权限');
          }
          if (!scope.unrestricted && relatedPhones.some((phone) => !visibleToScope(phone, scope, directory))) {
            throw new AssetCommandError(403, '设备关联了无权删除的手机号资产');
          }
          if (!scope.unrestricted && relatedAccounts.some((account) => !visibleToScope(account, scope, directory))) {
            throw new AssetCommandError(403, '设备关联了无权修改的互联网账号');
          }
          state.devices = state.devices.filter((device) => device.id !== id);
          state.phones = state.phones.filter((phone) => phone.deviceId !== id);
          state.accounts = state.accounts.map((account) => {
            const unbindPhone = Boolean(account.phoneId && relatedPhoneIds.has(account.phoneId));
            const loginDeviceIds = normalizeAccountLoginDeviceIds(account.loginDeviceIds).filter((deviceId) => deviceId !== id);
            if (!unbindPhone && loginDeviceIds.length === normalizeAccountLoginDeviceIds(account.loginDeviceIds).length) return account;
            return { ...account, phoneId: unbindPhone ? undefined : account.phoneId, loginDeviceIds, updatedAt: deletedAt };
          });
          state.offboardingTasks = state.offboardingTasks.filter((task) => (
            !(task.assetType === '设备资产' && task.assetId === id)
            && !(task.assetType === '手机号资产' && relatedPhoneIds.has(task.assetId))
          ));
          syncDeviceRisks(state, deletedAt);
          syncPhoneRisks(state, deletedAt);
          syncAccountRisks(state, deletedAt);
          addLog(
            state,
            makeId('asset-log'),
            deletedAt,
            actor,
            '删除资产',
            '设备资产',
            existing.id,
            existing.deviceName,
            `删除设备 ${existing.deviceCode}，同步移除${relatedPhones.length}个手机号，解绑${relatedAccounts.length}个账号`,
          );
          await persistState(transaction, state);
          return existing;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success(deleted);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async createPhoneNumber(
      input: Partial<AssetPhoneNumberInput>,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetPhoneNumber | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_PHONES, 'write')) {
        return failure('无权新增手机号资产', 403);
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return failure('手机号资产数据无效', 400);
      }
      const phoneNumber = cleanText(input.phoneNumber).replace(/\D/g, '');
      if (!phoneNumber) return failure('手机号不能为空', 400);
      if (masked(input.phoneNumber) || masked(input.realName) || masked(input.servicePassword)) {
        return failure('手机号、实名信息或服务密码不能使用掩码值', 400);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const createdAt = now().toISOString();
        const org = resolveOrgFields(input, directory);
        const created = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const deviceId = cleanText(input.deviceId) || undefined;
          const device = deviceId ? state.devices.find((item) => item.id === deviceId) : undefined;
          if (deviceId && !device) throw new AssetCommandError(400, '所属设备不存在');
          if (device && !visibleToScope(device, scope, directory)) throw new AssetCommandError(403, '无权绑定该设备');
          if (state.phones.some((phone) => phone.phoneNumber === phoneNumber)) {
            throw new AssetCommandError(409, '手机号已存在');
          }
          if (!deviceId && input.slotType) throw new AssetCommandError(400, '未选择设备时不能指定卡槽');
          const slotType = deviceId ? input.slotType || '卡槽1' : undefined;
          const communicationType = device ? readDeviceCommunicationType(device) : undefined;
          if (communicationType === '无SIM') throw new AssetCommandError(409, '无SIM设备不能绑定手机号');
          if (communicationType && communicationType !== '双卡' && slotType === '卡槽2') {
            throw new AssetCommandError(409, '单卡设备只能绑定卡槽1手机号');
          }
          if (deviceId && state.phones.some((phone) => phone.deviceId === deviceId && phone.slotType === slotType)) {
            throw new AssetCommandError(409, '该设备卡槽已绑定手机号');
          }
          const maxPhoneCount = communicationType === '双卡' ? 2 : 1;
          if (deviceId && state.phones.filter((phone) => phone.deviceId === deviceId).length >= maxPhoneCount) {
            throw new AssetCommandError(409, `${communicationType}设备最多绑定${maxPhoneCount}个手机号`);
          }
          const phone = normalizeAssetPhone({
            id: makeId('asset-phone'),
            phoneNumber,
            phoneNumberMasked: maskPhone(phoneNumber),
            realNameSubject: cleanText(input.realNameSubject) || undefined,
            realName: cleanText(input.realName) || undefined,
            realNameMasked: maskRealName(input.realName),
            operator: input.operator || '未知',
            attributionLocation: cleanText(input.attributionLocation) || undefined,
            simForm: input.simForm || '实体SIM',
            iccid: cleanText(input.iccid) || undefined,
            iccidMasked: maskIdentifier(input.iccid),
            imsi: cleanText(input.imsi) || undefined,
            imsiMasked: maskIdentifier(input.imsi),
            servicePassword: cleanText(input.servicePassword) || undefined,
            servicePasswordMasked: maskSecret(input.servicePassword),
            deviceId,
            slotType,
            packageName: cleanText(input.packageName),
            monthlyFee: Number(input.monthlyFee || 0),
            ownerSubject: input.ownerSubject || '公司',
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            status: input.status || '待启用',
            contractExpiresAt: cleanText(input.contractExpiresAt) || undefined,
            remark: cleanText(input.remark) || undefined,
            createdAt,
            updatedAt: createdAt,
          });
          if (!visibleToScope(phone, scope, directory)) {
            throw new AssetCommandError(403, '无权为该员工或部门新增手机号资产');
          }
          state.phones.unshift(phone);
          syncPhoneRisks(state, createdAt);
          syncDeviceRisks(state, createdAt);
          addLog(
            state,
            makeId('asset-log'),
            createdAt,
            actor,
            '新增资产',
            '手机号资产',
            phone.id,
            phone.phoneNumberMasked,
            `新增手机号 ${phone.phoneNumberMasked}`,
          );
          await persistState(transaction, state);
          return phone;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success(sanitizePhoneCommandResult(created));
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async updatePhoneNumber(
      id: string,
      input: Partial<AssetPhoneNumberInput>,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetPhoneNumber | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_PHONES, 'write')) {
        return failure('无权编辑手机号资产', 403);
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return failure('手机号资产数据无效', 400);
      }
      if (
        (input.phoneNumber !== undefined && masked(input.phoneNumber))
        || (input.realName !== undefined && masked(input.realName))
        || (input.servicePassword !== undefined && masked(input.servicePassword))
      ) {
        return failure('手机号、实名信息或服务密码不能使用掩码值覆盖', 400);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const updatedAt = now().toISOString();
        const updated = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const existing = state.phones.find((phone) => phone.id === id);
          if (!existing) throw new AssetCommandError(404, '手机号不存在');
          if (!visibleToScope(existing, scope, directory)) throw new AssetCommandError(403, '无权编辑该手机号资产');
          const phoneNumber = input.phoneNumber === undefined
            ? existing.phoneNumber
            : requiredText(input.phoneNumber, '手机号不能为空').replace(/\D/g, '');
          if (state.phones.some((phone) => phone.id !== id && phone.phoneNumber === phoneNumber)) {
            throw new AssetCommandError(409, '手机号已存在');
          }
          const deviceId = input.deviceId === undefined ? existing.deviceId : cleanText(input.deviceId) || undefined;
          const device = deviceId ? state.devices.find((item) => item.id === deviceId) : undefined;
          if (deviceId && !device) throw new AssetCommandError(400, '所属设备不存在');
          if (device && !visibleToScope(device, scope, directory)) throw new AssetCommandError(403, '无权绑定该设备');
          const slotType = deviceId ? input.slotType || existing.slotType || '卡槽1' : undefined;
          const communicationType = device ? readDeviceCommunicationType(device) : undefined;
          if (communicationType === '无SIM') throw new AssetCommandError(409, '无SIM设备不能绑定手机号');
          if (communicationType && communicationType !== '双卡' && slotType === '卡槽2') {
            throw new AssetCommandError(409, '单卡设备只能绑定卡槽1手机号');
          }
          if (deviceId && state.phones.some((phone) => phone.id !== id && phone.deviceId === deviceId && phone.slotType === slotType)) {
            throw new AssetCommandError(409, '该设备卡槽已绑定手机号');
          }
          const maxPhoneCount = communicationType === '双卡' ? 2 : 1;
          if (deviceId && state.phones.filter((phone) => phone.id !== id && phone.deviceId === deviceId).length >= maxPhoneCount) {
            throw new AssetCommandError(409, `${communicationType}设备最多绑定${maxPhoneCount}个手机号`);
          }
          const realName = input.realName === undefined ? existing.realName : cleanText(input.realName) || undefined;
          const { clearServicePassword, ...phoneChanges } = input;
          const servicePassword = clearServicePassword
            ? undefined
            : cleanText(input.servicePassword) || existing.servicePassword;
          const org = resolveOrgFields({ ...existing, ...phoneChanges }, directory);
          const next = normalizeAssetPhone({
            ...existing,
            ...phoneChanges,
            phoneNumber,
            phoneNumberMasked: maskPhone(phoneNumber),
            realNameSubject: input.realNameSubject === undefined ? existing.realNameSubject : cleanText(input.realNameSubject) || undefined,
            realName,
            realNameMasked: maskRealName(realName),
            simForm: input.simForm || existing.simForm,
            iccid: input.iccid === undefined ? existing.iccid : cleanText(input.iccid) || undefined,
            iccidMasked: maskIdentifier(input.iccid ?? existing.iccid),
            imsi: input.imsi === undefined ? existing.imsi : cleanText(input.imsi) || undefined,
            imsiMasked: maskIdentifier(input.imsi ?? existing.imsi),
            servicePassword,
            servicePasswordMasked: maskSecret(servicePassword),
            operator: input.operator || existing.operator,
            attributionLocation: input.attributionLocation === undefined
              ? existing.attributionLocation
              : cleanText(input.attributionLocation) || undefined,
            deviceId,
            slotType,
            packageName: input.packageName === undefined ? existing.packageName : cleanText(input.packageName),
            monthlyFee: Number(input.monthlyFee ?? existing.monthlyFee),
            ownerSubject: input.ownerSubject || existing.ownerSubject,
            contractExpiresAt: input.contractExpiresAt === undefined ? existing.contractExpiresAt : cleanText(input.contractExpiresAt) || undefined,
            remark: input.remark === undefined ? existing.remark : cleanText(input.remark) || undefined,
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            status: input.status || existing.status,
            updatedAt,
          });
          if (!visibleToScope(next, scope, directory)) {
            throw new AssetCommandError(403, '无权将手机号资产转移给该员工或部门');
          }
          state.phones = state.phones.map((phone) => phone.id === id ? next : phone);
          syncPhoneRisks(state, updatedAt);
          syncDeviceRisks(state, updatedAt);
          addLog(
            state,
            makeId('asset-log'),
            updatedAt,
            actor,
            '编辑资料',
            '手机号资产',
            next.id,
            next.phoneNumberMasked,
            `编辑手机号 ${next.phoneNumberMasked}`,
          );
          await persistState(transaction, state);
          return next;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success(sanitizePhoneCommandResult(updated));
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async deletePhoneNumber(id: string, actor: AuthenticatedUser): Promise<ApiResponse<AssetPhoneNumber | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_PHONES, 'delete')) return failure('无权删除手机号资产', 403);
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const deleted = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const phone = state.phones.find((item) => item.id === id);
          if (!phone) throw new AssetCommandError(404, '手机号不存在');
          const linkedDevice = phone.deviceId ? state.devices.find((item) => item.id === phone.deviceId) : undefined;
          if (!visibleToScope(phone, scope, directory) && !(linkedDevice && visibleToScope(linkedDevice, scope, directory))) {
            throw new AssetCommandError(403, '无权删除该手机号资产');
          }
          const relatedAccounts = state.accounts.filter((account) => account.phoneId === id);
          if (relatedAccounts.length && !hasPermission(actor, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'write')) {
            throw new AssetCommandError(403, '删除该手机号会解绑互联网账号，需要账号编辑权限');
          }
          if (!scope.unrestricted && relatedAccounts.some((account) => !visibleToScope(account, scope, directory))) {
            throw new AssetCommandError(403, '手机号关联了无权修改的互联网账号');
          }
          const changedAt = now().toISOString();
          state.phones = state.phones.filter((item) => item.id !== id);
          state.accounts = state.accounts.map((account) => account.phoneId === id ? { ...account, phoneId: undefined, updatedAt: changedAt } : account);
          state.offboardingTasks = state.offboardingTasks.filter((item) => !(item.assetType === '手机号资产' && item.assetId === id));
          syncPhoneRisks(state, changedAt);
          syncAccountRisks(state, changedAt);
          syncDeviceRisks(state, changedAt);
          addLog(state, makeId('asset-log'), changedAt, actor, '删除资产', '手机号资产', phone.id, phone.phoneNumberMasked, `删除手机号 ${phone.phoneNumberMasked}`);
          await persistState(transaction, state);
          return sanitizePhoneCommandResult(phone);
        });
        return success(deleted);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async createInternetAccount(
      input: Partial<AssetInternetAccountInput>,
      actor: AuthenticatedUser,
      allowCredentialBackfill = false,
    ): Promise<ApiResponse<AssetInternetAccount | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'write')) {
        return failure('无权新增互联网账号', 403);
      }
      if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return failure('互联网账号数据无效', 400);
      }
      if (masked(input.loginAccount) || masked(input.realName) || masked(input.boundEmail)) {
        return failure('登录账号、实名或邮箱不能使用掩码值', 400);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const createdAt = now().toISOString();
        const org = resolveOrgFields(input, directory);
        const platform = requiredText(input.platform, '平台不能为空');
        const loginAccount = requiredText(input.loginAccount, '登录账号不能为空');
        const loginMethod = input.loginMethod || '密码登录';
        const requiresPaymentPassword = input.requiresPaymentPassword === true || String(input.requiresPaymentPassword) === 'true';
        if (loginMethod === '密码登录' && !allowCredentialBackfill && !cleanText(input.loginPassword)) {
          throw new AssetCommandError(400, '密码登录必须填写登录密码');
        }
        if (requiresPaymentPassword && !cleanText(input.paymentPassword)) {
          throw new AssetCommandError(400, '涉及支付的账号必须填写支付密码');
        }
        const created = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          if (state.accounts.some((account) => account.platform === platform && account.loginAccount === loginAccount)) {
            throw new AssetCommandError(409, '同一平台下登录账号已存在');
          }
          const phoneId = cleanText(input.phoneId) || undefined;
          if (phoneId) {
            const phone = state.phones.find((item) => item.id === phoneId);
            if (!phone) throw new AssetCommandError(400, '绑定手机号不存在');
            if (!visibleToScope(phone, scope, directory)) throw new AssetCommandError(403, '无权绑定该手机号');
          }
          const loginDeviceIds = normalizeAccountLoginDeviceIds(input.loginDeviceIds);
          const loginDeviceError = validateAccountLoginDeviceIds(loginDeviceIds, state.devices);
          if (loginDeviceError) throw new AssetCommandError(400, loginDeviceError);
          for (const loginDeviceId of loginDeviceIds) {
            const loginDevice = state.devices.find((item) => item.id === loginDeviceId)!;
            if (!visibleToScope(loginDevice, scope, directory)) throw new AssetCommandError(403, '无权绑定该登录设备');
          }
          const identityAccountIds = normalizeIdentityAccountIds(input.identityAccountIds);
          const identityError = validateIdentityAccountIds({ sourcePlatform: platform, identityAccountIds, accounts: state.accounts });
          if (identityError) throw new AssetCommandError(400, identityError);
          for (const identityAccountId of identityAccountIds) {
            const identityAccount = state.accounts.find((item) => item.id === identityAccountId)!;
            if (!visibleToScope(identityAccount, scope, directory)) throw new AssetCommandError(403, '无权绑定该身份账号');
          }
          const controlStatus = input.controlStatus || (input.permissionStatus === '离职待回收' || input.permissionStatus === '已回收' ? input.permissionStatus : '已掌控');
          const account = normalizeAssetAccount({
            id: makeId('asset-account'),
            accountNo: cleanText(input.accountNo) || nextAccountNumber(state.accounts),
            platform,
            accountName: requiredText(input.accountName, '账号名称不能为空'),
            loginAccount,
            loginAccountMasked: maskLogin(loginAccount),
            realNameSubject: cleanText(input.realNameSubject) || undefined,
            realName: cleanText(input.realName) || undefined,
            realNameMasked: maskRealName(input.realName),
            phoneId,
            loginDeviceIds,
            identityAccountIds,
            boundEmail: cleanText(input.boundEmail) || undefined,
            boundEmailMasked: maskEmail(input.boundEmail),
            accountCategory: input.accountCategory || '主账号',
            ownerSubject: input.ownerSubject || '公司',
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            controlStatus,
            permissionStatus: controlStatus === '已掌控' || controlStatus === '待交接' ? '正常' : controlStatus,
            accountStatus: input.accountStatus || '使用中',
            riskLevel: input.riskLevel || '低',
            serviceProvider: cleanText(input.serviceProvider),
            monthlyFee: Number(input.monthlyFee || 0),
            expiresAt: cleanText(input.expiresAt) || undefined,
            purpose: cleanText(input.purpose),
            businessScene: cleanText(input.businessScene) || undefined,
            loginMethod,
            requiresPaymentPassword,
            loginCredentialStatus: loginMethod === '密码登录' ? (cleanText(input.loginPassword) ? '已设置' : '待补齐') : '不适用',
            paymentCredentialStatus: requiresPaymentPassword ? '已设置' : '不适用',
            credentialUpdatedAt: cleanText(input.loginPassword) || cleanText(input.paymentPassword) ? createdAt : undefined,
            twoFactorMethod: cleanText(input.twoFactorMethod) || undefined,
            remark: cleanText(input.remark) || undefined,
            createdAt,
            updatedAt: createdAt,
          });
          if (!visibleToScope(account, scope, directory)) {
            throw new AssetCommandError(403, '无权为该员工或部门新增互联网账号');
          }
          state.accounts.unshift(account);
          saveCredential(state, account.id, 'loginPassword', input.loginPassword, actor, createdAt);
          saveCredential(state, account.id, 'paymentPassword', input.paymentPassword, actor, createdAt);
          syncAccountRisks(state, createdAt);
          syncAccountOffboardingTasks(state, createdAt);
          syncDeviceRisks(state, createdAt);
          addLog(
            state,
            makeId('asset-log'),
            createdAt,
            actor,
            '新增资产',
            '互联网账号',
            account.id,
            account.accountName,
            `新增账号 ${account.accountNo}`,
          );
          if (account.phoneId) {
            const phone = state.phones.find((item) => item.id === account.phoneId);
            addLog(
              state,
              makeId('asset-log'),
              createdAt,
              actor,
              '绑定资产',
              '互联网账号',
              account.id,
              account.accountName,
              `绑定手机号 ${phone?.phoneNumberMasked || account.phoneId}`,
            );
          }
          if (account.identityAccountIds?.length) {
            addLog(state, makeId('asset-log'), createdAt, actor, '绑定资产', '互联网账号', account.id, account.accountName, `绑定${account.identityAccountIds.length}个身份账号`);
          }
          if (account.loginDeviceIds?.length) {
            addLog(state, makeId('asset-log'), createdAt, actor, '绑定资产', '互联网账号', account.id, account.accountName, `配置${account.loginDeviceIds.length}台登录设备`);
          }
          await persistState(transaction, state);
          return account;
        }, {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 5_000,
          timeout: 10_000,
        });
        return success(created);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async updateInternetAccount(
      id: string,
      input: Partial<AssetInternetAccountInput>,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetInternetAccount | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'write')) return failure('无权编辑互联网账号', 403);
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const changedAt = now().toISOString();
        const updated = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const existing = state.accounts.find((item) => item.id === id);
          if (!existing) throw new AssetCommandError(404, '互联网账号不存在');
          if (!visibleToScope(existing, scope, directory)) throw new AssetCommandError(403, '无权编辑该互联网账号');
          const platform = cleanText(input.platform) || existing.platform;
          if (platform !== existing.platform) {
            const dependents = state.accounts.filter((item) => normalizeIdentityAccountIds(item.identityAccountIds).includes(id));
            if (dependents.length) throw new AssetCommandError(409, `该账号正在被${dependents.length}个业务账号绑定，请先解绑再修改平台`);
          }
          const loginAccount = cleanText(input.loginAccount) || existing.loginAccount;
          if (state.accounts.some((item) => item.id !== id && item.platform === platform && item.loginAccount === loginAccount)) {
            throw new AssetCommandError(409, '同一平台下登录账号已存在');
          }
          const org = resolveOrgFields({ ...existing, ...input }, directory);
          const phoneId = input.phoneId === undefined ? existing.phoneId : cleanText(input.phoneId) || undefined;
          if (phoneId && !state.phones.some((item) => item.id === phoneId)) throw new AssetCommandError(400, '绑定手机号不存在');
          const loginDeviceIds = input.loginDeviceIds === undefined
            ? normalizeAccountLoginDeviceIds(existing.loginDeviceIds)
            : normalizeAccountLoginDeviceIds(input.loginDeviceIds);
          const loginDeviceError = validateAccountLoginDeviceIds(loginDeviceIds, state.devices);
          if (loginDeviceError) throw new AssetCommandError(400, loginDeviceError);
          for (const loginDeviceId of loginDeviceIds) {
            const loginDevice = state.devices.find((item) => item.id === loginDeviceId)!;
            if (!visibleToScope(loginDevice, scope, directory)) throw new AssetCommandError(403, '无权绑定该登录设备');
          }
          const identityAccountIds = input.identityAccountIds === undefined
            ? normalizeIdentityAccountIds(existing.identityAccountIds)
            : normalizeIdentityAccountIds(input.identityAccountIds);
          const identityError = validateIdentityAccountIds({
            sourceAccountId: existing.id,
            sourcePlatform: platform,
            identityAccountIds,
            accounts: state.accounts,
          });
          if (identityError) throw new AssetCommandError(400, identityError);
          for (const identityAccountId of identityAccountIds) {
            const identityAccount = state.accounts.find((item) => item.id === identityAccountId)!;
            if (!visibleToScope(identityAccount, scope, directory)) throw new AssetCommandError(403, '无权绑定该身份账号');
          }
          const loginMethod = input.loginMethod || existing.loginMethod || '密码登录';
          const requiresPaymentPassword = input.requiresPaymentPassword === undefined
            ? Boolean(existing.requiresPaymentPassword)
            : input.requiresPaymentPassword === true || String(input.requiresPaymentPassword) === 'true';
          const loginChanged = saveCredential(state, id, 'loginPassword', input.loginPassword, actor, changedAt);
          const paymentChanged = saveCredential(state, id, 'paymentPassword', input.paymentPassword, actor, changedAt);
          if (loginMethod !== '密码登录') {
            state.accountCredentials = state.accountCredentials.filter((item) => !(item.accountId === id && item.type === 'loginPassword'));
          }
          if (!requiresPaymentPassword) {
            state.accountCredentials = state.accountCredentials.filter((item) => !(item.accountId === id && item.type === 'paymentPassword'));
          }
          const hasLoginCredential = state.accountCredentials.some((item) => item.accountId === id && item.type === 'loginPassword');
          const hasPaymentCredential = state.accountCredentials.some((item) => item.accountId === id && item.type === 'paymentPassword');
          const next = normalizeAssetAccount({
            ...existing,
            ...input,
            platform,
            loginAccount,
            loginAccountMasked: maskLogin(loginAccount),
            accountName: cleanText(input.accountName) || existing.accountName,
            realNameMasked: maskRealName(input.realName ?? existing.realName),
            boundEmailMasked: maskEmail(input.boundEmail ?? existing.boundEmail),
            phoneId,
            loginDeviceIds,
            identityAccountIds,
            loginMethod,
            requiresPaymentPassword,
            loginCredentialStatus: loginMethod === '密码登录' ? (hasLoginCredential ? '已设置' : '待补齐') : '不适用',
            paymentCredentialStatus: requiresPaymentPassword ? (hasPaymentCredential ? '已设置' : '待补齐') : '不适用',
            credentialUpdatedAt: loginChanged || paymentChanged ? changedAt : existing.credentialUpdatedAt,
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            monthlyFee: Number(input.monthlyFee ?? existing.monthlyFee),
            updatedAt: changedAt,
          });
          delete (next as AssetInternetAccount & { loginPassword?: string }).loginPassword;
          delete (next as AssetInternetAccount & { paymentPassword?: string }).paymentPassword;
          const index = state.accounts.findIndex((item) => item.id === id);
          state.accounts[index] = next;
          if (!visibleToScope(next, scope, directory)) throw new AssetCommandError(403, '无权将账号转移到当前数据范围之外');
          if (phoneId) {
            const phone = state.phones.find((item) => item.id === phoneId)!;
            const linkedDevice = phone.deviceId ? state.devices.find((item) => item.id === phone.deviceId) : undefined;
            if (!visibleToScope(phone, scope, directory) && !(linkedDevice && visibleToScope(linkedDevice, scope, directory))) {
              throw new AssetCommandError(403, '无权绑定该手机号');
            }
          }
          syncAccountRisks(state, changedAt);
          syncAccountOffboardingTasks(state, changedAt);
          syncDeviceRisks(state, changedAt);
          addLog(state, makeId('asset-log'), changedAt, actor, '编辑资料', '互联网账号', next.id, next.accountName, `编辑账号 ${next.accountNo}`);
          if (normalizeIdentityAccountIds(existing.identityAccountIds).join(',') !== identityAccountIds.join(',')) {
            const identityCount = identityAccountIds.length;
            addLog(
              state,
              makeId('asset-log'),
              changedAt,
              actor,
              identityCount ? '绑定资产' : '解绑资产',
              '互联网账号',
              next.id,
              next.accountName,
              identityCount ? `更新${identityCount}个身份账号绑定` : '解除身份账号绑定',
            );
          }
          if (normalizeAccountLoginDeviceIds(existing.loginDeviceIds).join(',') !== loginDeviceIds.join(',')) {
            addLog(
              state,
              makeId('asset-log'),
              changedAt,
              actor,
              loginDeviceIds.length ? '绑定资产' : '解绑资产',
              '互联网账号',
              next.id,
              next.accountName,
              loginDeviceIds.length ? `更新为${loginDeviceIds.length}台登录设备` : '清空登录设备',
            );
          }
          await persistState(transaction, state);
          return next;
        });
        return success(updated);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async markInternetAccountsForOffboarding(
      accountIds: string[],
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetInternetAccount[] | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_OFFBOARDING, 'write')) {
        return failure('无权发起资产交接', 403);
      }
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'write')) {
        return failure('无权编辑互联网账号', 403);
      }
      const ids = Array.from(new Set((Array.isArray(accountIds) ? accountIds : [])
        .map((id) => cleanText(id))
        .filter(Boolean)));
      if (!ids.length) return success([]);
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const changedAt = now().toISOString();
        const updated = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const selected = ids.map((id) => {
            const account = state.accounts.find((item) => item.id === id);
            if (!account) throw new AssetCommandError(404, '互联网账号不存在');
            if (!visibleToScope(account, scope, directory)) throw new AssetCommandError(403, '无权处理该互联网账号的资产交接');
            return account;
          });
          const idSet = new Set(ids);
          state.accounts = state.accounts.map((account) => idSet.has(account.id) ? normalizeAssetAccount({
            ...account,
            controlStatus: '离职待回收',
            permissionStatus: '离职待回收',
            updatedAt: changedAt,
          }) : account);
          syncAccountRisks(state, changedAt);
          syncAccountOffboardingTasks(state, changedAt);
          syncDeviceRisks(state, changedAt);
          addLog(
            state,
            makeId('asset-log'),
            changedAt,
            actor,
            '发起资产交接',
            '互联网账号',
            ids.join(','),
            `${selected.length}个互联网账号`,
            `批量标记${selected.length}个账号为离职待回收`,
          );
          await persistState(transaction, state);
          return state.accounts.filter((account) => idSet.has(account.id));
        });
        return success(updated);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async completeOffboardingTask(
      taskId: string,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetOffboardingTask | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_OFFBOARDING, 'write')) {
        return failure('无权完成资产交接', 403);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const changedAt = now().toISOString();
        const completed = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const task = state.offboardingTasks.find((item) => item.id === cleanText(taskId));
          if (!task) throw new AssetCommandError(404, '资产交接任务不存在');
          const permissionKey = task.assetType === '设备资产' ? PERMISSION_KEYS.ASSETS_DEVICES
            : task.assetType === '手机号资产' ? PERMISSION_KEYS.ASSETS_PHONES
              : PERMISSION_KEYS.ASSETS_ACCOUNTS;
          if (!hasPermission(actor, permissionKey, 'write')) {
            throw new AssetCommandError(403, `无权处理该${task.assetType}`);
          }

          if (task.assetType === '设备资产') {
            const device = state.devices.find((item) => item.id === task.assetId);
            if (!device) throw new AssetCommandError(404, '交接设备不存在');
            if (!visibleToScope(device, scope, directory)) throw new AssetCommandError(403, '无权处理该设备的资产交接');
            state.devices = state.devices.map((item) => item.id === device.id ? normalizeAssetDevice({
              ...item,
              status: '闲置',
              currentUserId: '',
              currentUser: '',
              updatedAt: changedAt,
            }) : item);
          } else if (task.assetType === '手机号资产') {
            const phone = state.phones.find((item) => item.id === task.assetId);
            if (!phone) throw new AssetCommandError(404, '交接手机号不存在');
            if (!visibleToScope(phone, scope, directory)) throw new AssetCommandError(403, '无权处理该手机号的资产交接');
            state.phones = state.phones.map((item) => item.id === phone.id ? normalizeAssetPhone({
              ...item,
              status: '闲置',
              currentUserId: '',
              currentUser: '',
              updatedAt: changedAt,
            }) : item);
          } else {
            const account = state.accounts.find((item) => item.id === task.assetId);
            if (!account) throw new AssetCommandError(404, '交接账号不存在');
            if (!visibleToScope(account, scope, directory)) throw new AssetCommandError(403, '无权处理该账号的资产交接');
            state.accounts = state.accounts.map((item) => item.id === account.id ? normalizeAssetAccount({
              ...item,
              controlStatus: '已回收',
              permissionStatus: '已回收',
              accountStatus: item.accountStatus === '已注销' ? '已注销' : '闲置',
              currentUserId: '',
              currentUser: '',
              updatedAt: changedAt,
            }) : item);
          }

          const nextTask: AssetOffboardingTask = {
            ...task,
            status: '已回收',
            permissionStatus: '已回收',
            handledAt: changedAt,
            handler: actor.name,
          };
          state.offboardingTasks = state.offboardingTasks.map((item) => item.id === task.id ? nextTask : item);
          syncDeviceRisks(state, changedAt);
          syncPhoneRisks(state, changedAt);
          syncAccountRisks(state, changedAt);
          syncAccountOffboardingTasks(state, changedAt);
          addLog(state, makeId('asset-log'), changedAt, actor, '完成资产交接', task.assetType, task.assetId, task.assetName, `${task.employeeName}的${task.assetType}已完成交接`);
          await persistState(transaction, state);
          return nextTask;
        });
        return success(completed);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async createMatrixPublishTask(
      input: Partial<AssetMatrixPublishTaskInput>,
      actor: AuthenticatedUser,
    ): Promise<ApiResponse<AssetMatrixPublishTask | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, 'write')
        && !hasPermission(actor, PERMISSION_KEYS.MARKETING_PUBLISH, 'write')) {
        return failure('无权创建发布计划', 403);
      }
      const marketingPublisher = Boolean(cleanText(input.contentId))
        && (hasExplicitPermission(actor, PERMISSION_KEYS.MARKETING_PUBLISH, 'write') || isSuperAdmin(actor));
      if (!hasPermission(actor, PERMISSION_KEYS.TASK_ASSIGN, 'write') && !marketingPublisher) {
        return failure('无权向员工工作台派发任务', 403);
      }
      const title = cleanText(input.title);
      const dueAt = cleanText(input.dueAt);
      const accountIds = Array.from(new Set((Array.isArray(input.accountIds) ? input.accountIds : [])
        .map((id) => cleanText(id))
        .filter(Boolean)));
      const dueDate = new Date(dueAt);
      if (!title || !accountIds.length || !dueAt || Number.isNaN(dueDate.getTime())) {
        return failure('计划标题、截止时间和发布账号不能为空', 400);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const createdAt = now().toISOString();
        const batchId = makeId('matrix-task');
        const created = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const contentId = cleanText(input.contentId);
          const content = contentId ? state.marketingContents.find((item) => item.id === contentId) : undefined;
          if (contentId && !content) throw new AssetCommandError(404, '营销内容不存在');
          if (content) {
            try {
              assertMarketingContentReadyForPublish(content);
            } catch (error) {
              throw new AssetCommandError(400, error instanceof Error ? error.message : '营销内容不可发布');
            }
          }
          const taskVideoUrl = cleanText(content?.videoUrl || input.videoUrl);
          const taskCopywriting = cleanText(content?.copywriting || input.copywriting);
          const selected = accountIds.map((accountId) => {
            const account = state.accounts.find((item) => item.id === accountId);
            if (!account) throw new AssetCommandError(404, '发布账号不存在');
            if (content && !content.platforms.includes(account.platform)) {
              throw new AssetCommandError(400, `${account.platform} / ${account.accountName} 与内容适用平台不一致`);
            }
            if (!marketingPublisher && !visibleToScope(account, scope, directory)) {
              throw new AssetCommandError(403, '无权派发该互联网账号');
            }
            const employeeId = cleanText(account.currentUserId);
            const employeeById = employeeId ? directory.users.find((item) => item.id === employeeId) : undefined;
            const employeesByLegacyName = employeeById ? [] : directory.users.filter((item) => (
              cleanText(item.name) === cleanText(account.currentUser)
              && (!account.departmentId || item.departmentId === account.departmentId)
            ));
            const employee = employeeById || (employeesByLegacyName.length === 1 ? employeesByLegacyName[0] : undefined);
            if (!employee || !employee.isActive || employee.employmentStatus === 'left') {
              throw new AssetCommandError(400, `${account.platform} / ${account.accountName} 缺少有效的主要使用人，不能派发`);
            }
            return { account, employee };
          });
          const targets = [] as AssetMatrixPublishTask['targets'];
          for (const { account, employee } of selected) {
            const employeeTaskId = makeId('task');
            await transaction.employeeTask.create({
              data: {
                id: employeeTaskId,
                templateId: null,
                sourceKey: `marketing_publish:${batchId}:${account.id}`,
                employeeId: employee.id,
                employeeName: employee.name,
                departmentIdSnapshot: employee.departmentId || null,
                departmentNameSnapshot: account.department || null,
                positionIdSnapshot: employee.positionId || null,
                positionNameSnapshot: employee.positionName || null,
                standardVersionIdSnapshot: null,
                workDate: new Date(`${shanghaiBusinessDate(input.plannedAt || content?.plannedAt || createdAt)}T00:00:00Z`),
                title: `发布执行：${title}`,
                description: [
                  `平台账号：${account.platform} / ${account.accountName}`,
                  taskVideoUrl ? `素材链接：${taskVideoUrl}` : '',
                  (content?.imageLinks || input.imageLinks || []).length ? `图片链接：${(content?.imageLinks || input.imageLinks || []).join('、')}` : '',
                  taskCopywriting ? `发布文案：${taskCopywriting}` : '',
                  cleanText(input.remark) ? `备注：${cleanText(input.remark)}` : '',
                ].filter(Boolean).join('\n'),
                targetValue: 1,
                actualValue: null,
                unit: '条',
                evidenceRequired: true,
                status: 'PENDING',
                result: null,
                dueAt: dueDate,
                assignedById: actor.id,
                assignedByName: actor.name,
                sourceType: 'MARKETING_PUBLISH',
                sourceId: batchId,
                sourceItemId: account.id,
              },
            });
            const phone = state.phones.find((item) => item.id === account.phoneId);
            const device = state.devices.find((item) => normalizeAccountLoginDeviceIds(account.loginDeviceIds)[0] === item.id);
            targets.push({
              id: makeId('matrix-target'),
              accountId: account.id,
              accountNo: account.accountNo,
              platform: account.platform,
              accountName: account.accountName,
              assignee: employee.name,
              department: account.department || '',
              phoneId: phone?.id,
              phoneNumberMasked: phone?.phoneNumberMasked,
              deviceId: device?.id,
              deviceCode: device?.deviceCode,
              deviceName: device?.deviceName,
              employeeTaskId,
              status: 'pending',
            });
          }
          const batch: AssetMatrixPublishTask = {
            id: batchId,
            title,
            contentId: content?.id || contentId || undefined,
            contentTitle: content?.title || cleanText(input.contentTitle) || undefined,
            contentVersion: content?.version || Number(input.contentVersion || 0) || undefined,
            contentType: content?.contentType || cleanText(input.contentType) || undefined,
            contentPlatforms: content?.platforms || input.contentPlatforms || [],
            imageLinks: content?.imageLinks || input.imageLinks || [],
            groupNames: Array.from(new Set((input.groupNames || []).map((item) => cleanText(item)).filter(Boolean))),
            plannedAt: cleanText(input.plannedAt || content?.plannedAt) || undefined,
            videoUrl: taskVideoUrl,
            videoFileName: cleanText(input.videoFileName),
            copywriting: taskCopywriting,
            remark: cleanText(input.remark),
            dueAt: dueDate.toISOString(),
            targets,
            createdBy: actor.name,
            createdAt,
            updatedAt: createdAt,
          };
          state.matrixTasks = [batch, ...state.matrixTasks];
          addLog(state, makeId('asset-log'), createdAt, actor, '创建发布计划', '发布计划', batch.id, batch.title, `向员工工作台派发${targets.length}条执行任务`);
          await persistState(transaction, state);
          return batch;
        });
        return success(created);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async deleteInternetAccount(id: string, actor: AuthenticatedUser): Promise<ApiResponse<AssetInternetAccount | null>> {
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_ACCOUNTS, 'delete')) return failure('无权删除互联网账号', 403);
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const deleted = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const existing = state.accounts.find((item) => item.id === id);
          if (!existing) throw new AssetCommandError(404, '互联网账号不存在');
          if (!visibleToScope(existing, scope, directory)) throw new AssetCommandError(403, '无权删除该互联网账号');
          const dependents = state.accounts.filter((item) => normalizeIdentityAccountIds(item.identityAccountIds).includes(id));
          if (dependents.length) {
            throw new AssetCommandError(409, `该账号正在被${dependents.length}个业务账号绑定，请先解绑或转移`);
          }
          state.accounts = state.accounts.filter((item) => item.id !== id);
          state.accountCredentials = state.accountCredentials.filter((item) => item.accountId !== id);
          state.offboardingTasks = state.offboardingTasks.filter((item) => !(item.assetType === '互联网账号' && item.assetId === id));
          const changedAt = now().toISOString();
          syncAccountRisks(state, changedAt);
          syncDeviceRisks(state, changedAt);
          addLog(state, makeId('asset-log'), changedAt, actor, '删除资产', '互联网账号', existing.id, existing.accountName, `删除账号 ${existing.accountNo}`);
          await persistState(transaction, state);
          return existing;
        });
        return success(deleted);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },
  };
}
