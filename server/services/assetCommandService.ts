import { randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '@prisma/client';
import { failure, success, type ApiResponse } from '../api/response';
import { mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { buildDataVisibilityScopeForUser, type DataVisibilityScope } from '../../src/shared/utils/dataVisibility';
import { hasPermission, PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  AssetDevice,
  AssetDeviceInput,
  AssetInternetAccount,
  AssetInternetAccountInput,
  AssetMatrixPublishTask,
  AssetOffboardingTask,
  AssetOperationLog,
  AssetPhoneNumber,
  AssetPhoneNumberInput,
  AssetRisk,
} from '../../src/types/asset';
import type { Department } from '../../src/types/department';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';

type AssetCommandPrisma = Pick<PrismaClient, 'appStorage' | 'user' | 'role' | 'department' | '$transaction'>;
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
  risks: AssetRisk[];
  logs: AssetOperationLog[];
  offboardingTasks: AssetOffboardingTask[];
  matrixTasks: AssetMatrixPublishTask[];
};

export interface AssetCommandServiceOptions {
  now?: () => Date;
  id?: (prefix: string) => string;
}

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
  STORAGE_KEYS.ASSET_RISKS,
  STORAGE_KEYS.ASSET_OPERATION_LOGS,
  STORAGE_KEYS.ASSET_OFFBOARDING_TASKS,
  STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS,
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
    devices: readArray<AssetDevice>(values, STORAGE_KEYS.ASSET_DEVICES),
    phones: readArray<AssetPhoneNumber>(values, STORAGE_KEYS.ASSET_PHONE_NUMBERS),
    accounts: readArray<AssetInternetAccount>(values, STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS),
    risks: readArray<AssetRisk>(values, STORAGE_KEYS.ASSET_RISKS),
    logs: readArray<AssetOperationLog>(values, STORAGE_KEYS.ASSET_OPERATION_LOGS),
    offboardingTasks: readArray<AssetOffboardingTask>(values, STORAGE_KEYS.ASSET_OFFBOARDING_TASKS),
    matrixTasks: readArray<AssetMatrixPublishTask>(values, STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS),
  };
}

async function persistState(transaction: Prisma.TransactionClient, state: AssetState): Promise<void> {
  const values: Array<[string, unknown]> = [
    [STORAGE_KEYS.ASSET_DEVICES, state.devices],
    [STORAGE_KEYS.ASSET_PHONE_NUMBERS, state.phones],
    [STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, state.accounts],
    [STORAGE_KEYS.ASSET_RISKS, state.risks],
    [STORAGE_KEYS.ASSET_OPERATION_LOGS, state.logs],
    [STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, state.offboardingTasks],
    [STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS, state.matrixTasks],
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

function requiredText(value: unknown, message: string): string {
  const text = cleanText(value);
  if (!text) throw new AssetCommandError(400, message);
  return text;
}

function masked(value: unknown): boolean {
  return /[*•]/.test(cleanText(value));
}

function maskLongValue(value: string): string {
  return value.length > 8 ? `${value.slice(0, 6)}******${value.slice(-4)}` : value;
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
  const phoneIdsByDevice = new Map<string, Set<string>>();
  state.phones.forEach((phone) => {
    const ids = phoneIdsByDevice.get(phone.deviceId) || new Set<string>();
    ids.add(phone.id);
    phoneIdsByDevice.set(phone.deviceId, ids);
  });
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
    const phoneIds = phoneIdsByDevice.get(device.id) || new Set<string>();
    if (device.status === '闲置' && state.accounts.some((account) => Boolean(account.phoneId && phoneIds.has(account.phoneId)))) {
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
    if (!account.phoneId) {
      add(
        account,
        `account-unbound-phone-${account.id}`,
        '未绑定手机号账号',
        '中',
        '互联网账号未绑定手机号，后续登录、验证和回收链路不完整。',
      );
    }
    if (account.permissionStatus === '离职待回收') {
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
  const pending = state.accounts.filter((account) => account.permissionStatus === '离职待回收').map((account) => {
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

  return {
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
        const imei = requiredText(input.imei, 'IMEI不能为空');
        if (masked(imei)) throw new AssetCommandError(400, 'IMEI不能使用掩码值');
        const createdAt = now().toISOString();
        const org = resolveOrgFields(input, directory);
        const created = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          if (state.devices.some((device) => device.imei === imei)) {
            throw new AssetCommandError(409, 'IMEI已存在');
          }
          const device: AssetDevice = {
            id: makeId('asset-device'),
            deviceCode: cleanText(input.deviceCode) || nextNumber(state.devices),
            deviceName: requiredText(input.deviceName, '设备名称不能为空'),
            brandModel: requiredText(input.brandModel, '品牌型号不能为空'),
            imei,
            imeiMasked: maskLongValue(imei),
            simType: input.simType || '双卡',
            ownerSubject: input.ownerSubject || '公司',
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            status: input.status || '正常',
            riskLevel: input.riskLevel || '低',
            monthlyCost: Number(input.monthlyCost || 0),
            remark: cleanText(input.remark) || undefined,
            createdAt,
            updatedAt: createdAt,
          };
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
      if (input.imei !== undefined && masked(input.imei)) {
        return failure('IMEI不能使用掩码值覆盖', 400);
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
          const imei = input.imei === undefined ? existing.imei : requiredText(input.imei, 'IMEI不能为空');
          if (state.devices.some((device) => device.id !== id && device.imei === imei)) {
            throw new AssetCommandError(409, 'IMEI已存在');
          }
          const simType = input.simType || existing.simType;
          if (simType === '单卡' && state.phones.some((phone) => phone.deviceId === id && phone.slotType === '卡槽2')) {
            throw new AssetCommandError(409, '单卡设备不能保留卡槽2手机号');
          }
          const org = resolveOrgFields({ ...existing, ...input }, directory);
          const next: AssetDevice = {
            ...existing,
            deviceCode: input.deviceCode === undefined ? existing.deviceCode : requiredText(input.deviceCode, '设备编号不能为空'),
            deviceName: input.deviceName === undefined ? existing.deviceName : requiredText(input.deviceName, '设备名称不能为空'),
            brandModel: input.brandModel === undefined ? existing.brandModel : requiredText(input.brandModel, '品牌型号不能为空'),
            imei,
            imeiMasked: maskLongValue(imei),
            simType,
            ownerSubject: input.ownerSubject || existing.ownerSubject,
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            status: input.status || existing.status,
            riskLevel: input.riskLevel || existing.riskLevel,
            monthlyCost: Number(input.monthlyCost ?? existing.monthlyCost),
            remark: input.remark === undefined ? existing.remark : cleanText(input.remark) || undefined,
            updatedAt,
          };
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
      if (!hasPermission(actor, PERMISSION_KEYS.ASSETS_DEVICES, 'write')) {
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
          const relatedAccounts = state.accounts.filter((account) => Boolean(account.phoneId && relatedPhoneIds.has(account.phoneId)));
          if (!scope.unrestricted && relatedPhones.some((phone) => !visibleToScope(phone, scope, directory))) {
            throw new AssetCommandError(403, '设备关联了无权删除的手机号资产');
          }
          if (!scope.unrestricted && relatedAccounts.some((account) => !visibleToScope(account, scope, directory))) {
            throw new AssetCommandError(403, '设备关联了无权修改的互联网账号');
          }
          state.devices = state.devices.filter((device) => device.id !== id);
          state.phones = state.phones.filter((phone) => phone.deviceId !== id);
          state.accounts = state.accounts.map((account) => (
            account.phoneId && relatedPhoneIds.has(account.phoneId)
              ? { ...account, phoneId: undefined, updatedAt: deletedAt }
              : account
          ));
          state.offboardingTasks = state.offboardingTasks.filter((task) => (
            !(task.assetType === '设备资产' && task.assetId === id)
            && !(task.assetType === '手机号资产' && relatedPhoneIds.has(task.assetId))
          ));
          syncDeviceRisks(state, deletedAt);
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
      if (masked(input.phoneNumber) || masked(input.realName)) {
        return failure('手机号或实名信息不能使用掩码值', 400);
      }
      try {
        const directory = await loadDirectory(prisma);
        const scope = buildDataVisibilityScopeForUser(actor, directory.users, directory.roles, directory.departments, 'assets');
        const createdAt = now().toISOString();
        const org = resolveOrgFields(input, directory);
        const created = await prisma.$transaction(async (transaction) => {
          const state = await lockState(transaction);
          const deviceId = requiredText(input.deviceId, '所属设备不能为空');
          const device = state.devices.find((item) => item.id === deviceId);
          if (!device) throw new AssetCommandError(400, '所属设备不存在');
          if (!visibleToScope(device, scope, directory)) throw new AssetCommandError(403, '无权绑定该设备');
          if (state.phones.some((phone) => phone.phoneNumber === phoneNumber)) {
            throw new AssetCommandError(409, '手机号已存在');
          }
          const slotType = input.slotType || '卡槽1';
          if (device.simType === '单卡' && slotType === '卡槽2') {
            throw new AssetCommandError(409, '单卡设备只能绑定卡槽1手机号');
          }
          if (state.phones.some((phone) => phone.deviceId === deviceId && phone.slotType === slotType)) {
            throw new AssetCommandError(409, '该设备卡槽已绑定手机号');
          }
          const maxPhoneCount = device.simType === '双卡' ? 2 : 1;
          if (state.phones.filter((phone) => phone.deviceId === deviceId).length >= maxPhoneCount) {
            throw new AssetCommandError(409, `${device.simType}设备最多绑定${maxPhoneCount}个手机号`);
          }
          const phone: AssetPhoneNumber = {
            id: makeId('asset-phone'),
            phoneNumber,
            phoneNumberMasked: maskPhone(phoneNumber),
            realName: cleanText(input.realName) || undefined,
            realNameMasked: maskRealName(input.realName),
            operator: input.operator || '未知',
            attributionLocation: cleanText(input.attributionLocation) || undefined,
            deviceId,
            slotType,
            packageName: cleanText(input.packageName),
            monthlyFee: Number(input.monthlyFee || 0),
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            status: input.status || '使用中',
            createdAt,
            updatedAt: createdAt,
          };
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
        return success(created);
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
      ) {
        return failure('手机号或实名信息不能使用掩码值覆盖', 400);
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
          const deviceId = input.deviceId === undefined ? existing.deviceId : requiredText(input.deviceId, '所属设备不能为空');
          const device = state.devices.find((item) => item.id === deviceId);
          if (!device) throw new AssetCommandError(400, '所属设备不存在');
          if (!visibleToScope(device, scope, directory)) throw new AssetCommandError(403, '无权绑定该设备');
          const slotType = input.slotType || existing.slotType;
          if (device.simType === '单卡' && slotType === '卡槽2') {
            throw new AssetCommandError(409, '单卡设备只能绑定卡槽1手机号');
          }
          if (state.phones.some((phone) => phone.id !== id && phone.deviceId === deviceId && phone.slotType === slotType)) {
            throw new AssetCommandError(409, '该设备卡槽已绑定手机号');
          }
          const maxPhoneCount = device.simType === '双卡' ? 2 : 1;
          if (state.phones.filter((phone) => phone.id !== id && phone.deviceId === deviceId).length >= maxPhoneCount) {
            throw new AssetCommandError(409, `${device.simType}设备最多绑定${maxPhoneCount}个手机号`);
          }
          const realName = input.realName === undefined ? existing.realName : cleanText(input.realName) || undefined;
          const org = resolveOrgFields({ ...existing, ...input }, directory);
          const next: AssetPhoneNumber = {
            ...existing,
            phoneNumber,
            phoneNumberMasked: maskPhone(phoneNumber),
            realName,
            realNameMasked: maskRealName(realName),
            operator: input.operator || existing.operator,
            attributionLocation: input.attributionLocation === undefined
              ? existing.attributionLocation
              : cleanText(input.attributionLocation) || undefined,
            deviceId,
            slotType,
            packageName: input.packageName === undefined ? existing.packageName : cleanText(input.packageName),
            monthlyFee: Number(input.monthlyFee ?? existing.monthlyFee),
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            status: input.status || existing.status,
            updatedAt,
          };
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
        return success(updated);
      } catch (error) {
        if (error instanceof AssetCommandError) return failure(error.message, error.responseCode);
        throw error;
      }
    },

    async createInternetAccount(
      input: Partial<AssetInternetAccountInput>,
      actor: AuthenticatedUser,
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
          const account: AssetInternetAccount = {
            id: makeId('asset-account'),
            accountNo: cleanText(input.accountNo) || nextAccountNumber(state.accounts),
            platform,
            accountName: requiredText(input.accountName, '账号名称不能为空'),
            loginAccount,
            loginAccountMasked: maskLogin(loginAccount),
            realName: cleanText(input.realName) || undefined,
            realNameMasked: maskRealName(input.realName),
            phoneId,
            boundEmail: cleanText(input.boundEmail) || undefined,
            boundEmailMasked: maskEmail(input.boundEmail),
            ownerSubject: input.ownerSubject || '公司',
            departmentId: org.departmentId,
            department: org.department,
            ownerId: org.ownerId,
            owner: org.owner,
            currentUserId: org.currentUserId,
            currentUser: org.currentUser,
            permissionStatus: input.permissionStatus || '正常',
            accountStatus: input.accountStatus || '正常',
            riskLevel: input.riskLevel || '低',
            serviceProvider: cleanText(input.serviceProvider),
            monthlyFee: Number(input.monthlyFee || 0),
            expiresAt: cleanText(input.expiresAt) || undefined,
            purpose: cleanText(input.purpose),
            createdAt,
            updatedAt: createdAt,
          };
          if (!visibleToScope(account, scope, directory)) {
            throw new AssetCommandError(403, '无权为该员工或部门新增互联网账号');
          }
          state.accounts.unshift(account);
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
  };
}
