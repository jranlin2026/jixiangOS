import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  AssetDevice,
  AssetInternetAccount,
  AssetMatrixPublishTask,
  AssetOffboardingTask,
  AssetOperationLog,
  AssetPhoneNumber,
  AssetRisk,
} from '../../src/types/asset';
import { createAssetCommandService } from './assetCommandService';

const NOW = '2026-07-12T20:00:00.000Z';
const clone = <T>(value: T): T => structuredClone(value);

const deviceWriter: AuthenticatedUser = {
  id: 'user-device',
  name: '设备专员',
  account: 'device_writer',
  email: 'device@example.com',
  phone: '',
  role: '设备专员',
  roleId: 'role-device',
  departmentId: 'dept-assets',
  isActive: true,
  permissions: [{ module: PERMISSION_KEYS.ASSETS_DEVICES, actions: ['read', 'write'] }],
};

const otherUser: AuthenticatedUser = {
  ...deviceWriter,
  id: 'user-other',
  name: '其他员工',
  account: 'other',
  email: 'other@example.com',
};

const assetAdmin: AuthenticatedUser = {
  ...deviceWriter,
  id: 'user-asset-admin',
  name: '资产管理员',
  account: 'asset_admin',
  email: 'asset-admin@example.com',
  role: '资产管理员',
  roleId: 'role-asset-admin',
  permissions: [
    { module: PERMISSION_KEYS.ASSETS_DEVICES, actions: ['read', 'write', 'delete'] },
    { module: PERMISSION_KEYS.ASSETS_PHONES, actions: ['read', 'write', 'delete'] },
    { module: PERMISSION_KEYS.ASSETS_ACCOUNTS, actions: ['read', 'write', 'delete'] },
    { module: PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ASSETS_OFFBOARDING, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.TASK_ASSIGN, actions: ['read', 'write'] },
  ],
};

const sensitiveAssetAdmin: AuthenticatedUser = {
  ...assetAdmin,
  permissions: [
    ...assetAdmin.permissions,
    { module: PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW, actions: ['read'] },
  ],
};

function dbUser(user: AuthenticatedUser) {
  return {
    id: user.id,
    name: user.name,
    account: user.account,
    email: user.email,
    phone: user.phone,
    role: user.role,
    avatar: null,
    departmentId: user.departmentId || null,
    positionId: null,
    positionName: null,
    roleId: user.roleId || null,
    passwordHash: null,
    passwordSalt: null,
    passwordUpdatedAt: null,
    lastLoginAt: null,
    isActive: true,
    employmentStatus: 'active',
    leftAt: null,
    leftBy: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
}

const oldDevice = {
  id: 'asset-device-other',
  deviceCode: 'DEV-0009',
  deviceName: '其他人设备',
  brandModel: 'iPhone 14',
  imei: 'RAW-OTHER-IMEI',
  imeiMasked: 'RAW-OT******IMEI',
  simType: '双卡',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  department: '资产部',
  ownerId: otherUser.id,
  owner: otherUser.name,
  currentUserId: otherUser.id,
  currentUser: otherUser.name,
  status: '使用中',
  riskLevel: '低',
  monthlyCost: 0,
  createdAt: NOW,
  updatedAt: NOW,
} as unknown as AssetDevice;

const ASSET_KEYS = [
  STORAGE_KEYS.ASSET_DEVICES,
  STORAGE_KEYS.ASSET_PHONE_NUMBERS,
  STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS,
  STORAGE_KEYS.ASSET_ACCOUNT_CREDENTIALS,
  STORAGE_KEYS.ASSET_RISKS,
  STORAGE_KEYS.ASSET_OPERATION_LOGS,
  STORAGE_KEYS.ASSET_OFFBOARDING_TASKS,
  STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS,
] as const;

class FakePrisma {
  values = new Map<string, unknown>(ASSET_KEYS.map((key) => [key, []]));
  employeeTasks: Array<Record<string, unknown>> = [];

  constructor() {
    this.values.set(STORAGE_KEYS.ASSET_DEVICES, [clone(oldDevice)]);
  }

  readonly user = { findMany: async () => [dbUser(deviceWriter), dbUser(otherUser), dbUser(assetAdmin)] };
  readonly role = { findMany: async () => [
    {
      id: 'role-device',
      name: '设备专员',
      code: 'device_writer',
      departmentId: 'dept-assets',
      permissions: deviceWriter.permissions,
      dataScopes: { assets: 'self' },
      memberCount: 2,
      isActive: true,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
      description: null,
    },
    {
      id: 'role-asset-admin',
      name: '资产管理员',
      code: 'asset_admin',
      departmentId: 'dept-assets',
      permissions: assetAdmin.permissions,
      dataScopes: { assets: 'all' },
      memberCount: 1,
      isActive: true,
      createdAt: new Date(NOW),
      updatedAt: new Date(NOW),
      description: null,
    },
  ] };
  readonly department = { findMany: async () => [{
    id: 'dept-assets',
    name: '资产部',
    code: 'ASSETS',
    parentId: null,
    managerId: null,
    memberCount: 2,
    sortOrder: 1,
    isActive: true,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  }] };

  async $transaction<T>(callback: (transaction: any) => Promise<T>): Promise<T> {
    const staged = new Map(Array.from(this.values.entries()).map(([key, value]) => [key, clone(value)]));
    const transaction = {
      appStorage: {
        upsert: async ({ where, create, update }: any) => {
          const key = where.key;
          const next = staged.has(key) ? (update.value ?? staged.get(key)) : create.value;
          staged.set(key, clone(next));
          return { key, value: clone(next) };
        },
      },
      employeeTask: {
        create: async ({ data }: any) => {
          const task = { ...clone(data), status: data.status || 'PENDING' };
          this.employeeTasks.push(task);
          return clone(task);
        },
      },
      $queryRaw: async () => Array.from(staged.entries()).map(([key, value]) => ({ key, value: clone(value) })),
    };
    const result = await callback(transaction);
    this.values = staged;
    return result;
  }

  read<T>(key: string): T {
    return clone(this.values.get(key) as T);
  }
}

const prisma = new FakePrisma();
const service = createAssetCommandService(prisma as any, {
  now: () => new Date(NOW),
  id: (prefix) => `${prefix}-created`,
});

const created = await service.createDevice({
  deviceName: '新设备',
  brandModel: 'iPhone 16',
  imei1: 'RAW-NEW-IMEI-1',
  imei2: 'RAW-NEW-IMEI-2',
  simType: '双卡',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  ownerId: deviceWriter.id,
  currentUserId: deviceWriter.id,
  status: '使用中',
  riskLevel: '低',
  monthlyCost: 0,
}, deviceWriter);

assert.equal(created.code, 0);
assert.equal(created.data?.deviceCode, 'DEV-0010', '编号必须基于未裁剪全量数据生成');
assert.equal(created.data?.owner, deviceWriter.name, '组织字段必须由服务端目录解析');
assert.equal(created.data?.imei1, 'RAW-NEW-IMEI-1');
assert.equal(created.data?.imei2, 'RAW-NEW-IMEI-2');
assert.equal(created.data?.imei1Masked.includes('*'), true);
assert.equal(created.data?.imei2Masked?.includes('*'), true);
assert.deepEqual(
  prisma.read<AssetDevice[]>(STORAGE_KEYS.ASSET_DEVICES).map((item) => item.id).sort(),
  ['asset-device-created', oldDevice.id].sort(),
  '记录命令不得用 self 投影覆盖其他员工设备',
);
assert.equal(prisma.read<AssetOperationLog[]>(STORAGE_KEYS.ASSET_OPERATION_LOGS)[0]?.operator, deviceWriter.name);
assert.equal(prisma.read<AssetRisk[]>(STORAGE_KEYS.ASSET_RISKS).length, 0);

const missingSecondImei = await service.createDevice({
  deviceName: '缺少第二标识设备',
  brandModel: 'iPhone 16',
  imei1: 'RAW-MISSING-IMEI-2',
  simType: '双卡',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  ownerId: deviceWriter.id,
  currentUserId: deviceWriter.id,
}, deviceWriter);
assert.equal(missingSecondImei.code, 400);
assert.match(missingSecondImei.message, /IMEI 2不能为空/);

const singleWithSecondImei = await service.createDevice({
  deviceName: '单卡错误设备',
  brandModel: 'iPhone SE',
  imei1: 'RAW-SINGLE-IMEI-1',
  imei2: 'RAW-SINGLE-IMEI-2',
  simType: '单卡',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  ownerId: deviceWriter.id,
  currentUserId: deviceWriter.id,
}, deviceWriter);
assert.equal(singleWithSecondImei.code, 400);
assert.match(singleWithSecondImei.message, /单卡设备不能填写IMEI 2/);

const duplicateAcrossSlots = await service.createDevice({
  deviceName: '跨卡槽重复设备',
  brandModel: 'Android Test',
  imei1: 'RAW-NEW-IMEI-2',
  simType: '单卡',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  ownerId: deviceWriter.id,
  currentUserId: deviceWriter.id,
}, deviceWriter);
assert.equal(duplicateAcrossSlots.code, 409);
assert.match(duplicateAcrossSlots.message, /IMEI 1已存在/);

const sameImeis = await service.createDevice({
  deviceName: '同标识错误设备',
  brandModel: 'Android Test',
  imei1: 'RAW-SAME-IMEI',
  imei2: 'RAW-SAME-IMEI',
  simType: '双卡',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  ownerId: deviceWriter.id,
  currentUserId: deviceWriter.id,
}, deviceWriter);
assert.equal(sameImeis.code, 409);
assert.match(sameImeis.message, /不能相同/);

const maskedUpdate = await service.updateDevice(created.data!.id, {
  imei1: created.data!.imei1Masked,
  remark: '这次更新不得覆盖原始 IMEI',
}, deviceWriter);
assert.equal(maskedUpdate.code, 400);
assert.match(maskedUpdate.message, /掩码/);
assert.equal(
  prisma.read<AssetDevice[]>(STORAGE_KEYS.ASSET_DEVICES).find((item) => item.id === created.data!.id)?.imei1,
  'RAW-NEW-IMEI-1',
);

const forbiddenDelete = await service.deleteDevice(oldDevice.id, deviceWriter);
assert.equal(forbiddenDelete.code, 403);
assert.ok(
  prisma.read<AssetDevice[]>(STORAGE_KEYS.ASSET_DEVICES).some((item) => item.id === oldDevice.id),
  'self 范围不得删除其他员工的设备',
);
const forbiddenOwnDeleteWithoutDeletePermission = await service.deleteDevice(created.data!.id, deviceWriter);
assert.equal(forbiddenOwnDeleteWithoutDeletePermission.code, 403);
assert.ok(
  prisma.read<AssetDevice[]>(STORAGE_KEYS.ASSET_DEVICES).some((item) => item.id === created.data!.id),
  '只有设备编辑权时不得删除本人范围设备',
);

const riskPrisma = new FakePrisma();
let riskIdSequence = 0;
const riskService = createAssetCommandService(riskPrisma as any, {
  now: () => new Date(NOW),
  id: (prefix) => `${prefix}-risk-${++riskIdSequence}`,
});
const unowned = await riskService.createDevice({
  deviceName: '待分配设备',
  brandModel: 'iPhone SE',
  imei: 'RAW-UNOWNED-IMEI',
  simType: '单卡',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  status: '闲置',
  riskLevel: '低',
  monthlyCost: 0,
}, assetAdmin);
assert.equal(unowned.code, 0);
assert.ok(
  riskPrisma.read<AssetRisk[]>(STORAGE_KEYS.ASSET_RISKS).some((risk) => (
    risk.riskKey === `device-no-owner-${unowned.data?.id}` && risk.status === 'open'
  )),
  '无负责人设备必须在同一事务中生成风险',
);

const createdPhone = await riskService.createPhoneNumber({
  phoneNumber: '13900001111',
  realName: '资产管理员',
  operator: '移动',
  deviceId: oldDevice.id,
  slotType: '卡槽1',
  packageName: '商务套餐',
  monthlyFee: 59,
  departmentId: 'dept-assets',
  ownerId: assetAdmin.id,
  currentUserId: assetAdmin.id,
  status: '使用中',
}, assetAdmin);
assert.equal(createdPhone.code, 0);
assert.equal(createdPhone.data?.phoneNumber, '13900001111');
assert.equal(createdPhone.data?.phoneNumberMasked, '139****1111');
assert.equal(createdPhone.data?.owner, assetAdmin.name);
assert.ok(
  riskPrisma.read<AssetPhoneNumber[]>(STORAGE_KEYS.ASSET_PHONE_NUMBERS).some((phone) => phone.id === createdPhone.data?.id),
);

const maskedPhoneUpdate = await riskService.updatePhoneNumber(createdPhone.data!.id, {
  phoneNumber: createdPhone.data!.phoneNumberMasked,
  packageName: '不应保存',
}, assetAdmin);
assert.equal(maskedPhoneUpdate.code, 400);
assert.equal(
  riskPrisma.read<AssetPhoneNumber[]>(STORAGE_KEYS.ASSET_PHONE_NUMBERS).find((phone) => phone.id === createdPhone.data!.id)?.phoneNumber,
  '13900001111',
);

const createdAccount = await riskService.createInternetAccount({
  platform: '抖音',
  accountName: '官方号',
  loginAccount: 'jx_official_001',
  loginMethod: '密码登录',
  loginPassword: 'test-password',
  realName: '资产管理员',
  phoneId: createdPhone.data!.id,
  loginDeviceIds: [oldDevice.id, unowned.data!.id],
  boundEmail: 'asset-admin@example.com',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  ownerId: assetAdmin.id,
  currentUserId: assetAdmin.id,
  permissionStatus: '正常',
  accountStatus: '正常',
  riskLevel: '低',
  serviceProvider: '自营',
  monthlyFee: 0,
  purpose: '品牌运营',
}, assetAdmin);
assert.equal(createdAccount.code, 0);
assert.equal(createdAccount.data?.loginAccount, 'jx_official_001');
assert.equal(createdAccount.data?.loginAccountMasked.includes('*'), true);
assert.equal(createdAccount.data?.boundEmailMasked?.includes('*'), true);
assert.deepEqual(createdAccount.data?.loginDeviceIds, [oldDevice.id, unowned.data!.id], '互联网账号应支持独立绑定多台登录设备');
assert.ok(
  riskPrisma.read<AssetInternetAccount[]>(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS).some((account) => account.id === createdAccount.data?.id),
);
const storedCredentials = riskPrisma.read<any[]>(STORAGE_KEYS.ASSET_ACCOUNT_CREDENTIALS);
assert.equal(storedCredentials.length, 1);
assert.equal(JSON.stringify(storedCredentials).includes('test-password'), false);
const revealedLoginPassword = await riskService.revealAccountCredential(createdAccount.data!.id, 'loginPassword', sensitiveAssetAdmin);
assert.equal(revealedLoginPassword.code, 0);
assert.equal(revealedLoginPassword.data?.value, 'test-password');
const rejectedMissingLoginDevice = await riskService.updateInternetAccount(createdAccount.data!.id, {
  loginDeviceIds: ['missing-device'],
}, assetAdmin);
assert.equal(rejectedMissingLoginDevice.code, 400);
assert.match(rejectedMissingLoginDevice.message, /登录设备不存在/);
const appleIdentity = await riskService.createInternetAccount({
  platform: 'Apple ID',
  accountName: '企业 Apple ID',
  loginAccount: 'server-identity-apple@example.com',
  loginPassword: 'apple-password',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  ownerId: assetAdmin.id,
}, assetAdmin);
const googleIdentity = await riskService.createInternetAccount({
  platform: 'Google账号',
  accountName: '企业 Google 账号',
  loginAccount: 'server-identity-google@example.com',
  loginPassword: 'google-password',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  ownerId: assetAdmin.id,
}, assetAdmin);
assert.equal(appleIdentity.code, 0);
assert.equal(googleIdentity.code, 0);
const linkedIdentityAccounts = await riskService.updateInternetAccount(createdAccount.data!.id, {
  identityAccountIds: [appleIdentity.data!.id, googleIdentity.data!.id],
}, assetAdmin);
assert.equal(linkedIdentityAccounts.code, 0);
assert.deepEqual(linkedIdentityAccounts.data?.identityAccountIds, [appleIdentity.data!.id, googleIdentity.data!.id]);
const blockedProviderChange = await riskService.updateInternetAccount(appleIdentity.data!.id, { platform: 'LINE' }, assetAdmin);
assert.equal(blockedProviderChange.code, 409);
assert.match(blockedProviderChange.message, /正在被.*绑定/);
await riskService.updateInternetAccount(appleIdentity.data!.id, { accountStatus: '异常' }, assetAdmin);
assert.ok(riskPrisma.read<AssetRisk[]>(STORAGE_KEYS.ASSET_RISKS).some((risk) => (
  risk.riskKey === `account-identity-unavailable-${createdAccount.data!.id}-${appleIdentity.data!.id}`
)));
await riskService.updateInternetAccount(appleIdentity.data!.id, { accountStatus: '使用中' }, assetAdmin);
const blockedIdentityDelete = await riskService.deleteInternetAccount(appleIdentity.data!.id, assetAdmin);
assert.equal(blockedIdentityDelete.code, 409);
assert.match(blockedIdentityDelete.message, /正在被.*绑定/);
const rejectedSelfIdentity = await riskService.updateInternetAccount(createdAccount.data!.id, {
  identityAccountIds: [createdAccount.data!.id],
}, assetAdmin);
assert.equal(rejectedSelfIdentity.code, 400);
assert.match(rejectedSelfIdentity.message, /自己/);
await riskService.updateInternetAccount(createdAccount.data!.id, { identityAccountIds: [] }, assetAdmin);
assert.equal((await riskService.deleteInternetAccount(appleIdentity.data!.id, assetAdmin)).code, 0);
assert.equal((await riskService.deleteInternetAccount(googleIdentity.data!.id, assetAdmin)).code, 0);
const rejectedPasswordlessAccount = await riskService.createInternetAccount({
  platform: 'Apple ID',
  accountName: '不能绕过密码',
  loginAccount: 'no-password@example.com',
}, assetAdmin);
assert.equal(rejectedPasswordlessAccount.code, 400);
const publishBatch = await riskService.createMatrixPublishTask({
  title: '八月矩阵发布',
  dueAt: '2026-08-31T18:00:00.000Z',
  videoUrl: 'https://example.com/video',
  copywriting: '统一发布文案',
  accountIds: [createdAccount.data!.id],
}, assetAdmin);
assert.equal(publishBatch.code, 0);
assert.equal(publishBatch.data?.targets.length, 1);
assert.equal(riskPrisma.employeeTasks.length, 1, '每个发布账号必须创建一条员工执行任务');
assert.equal(riskPrisma.employeeTasks[0]?.employeeId, assetAdmin.id);
assert.equal(riskPrisma.employeeTasks[0]?.sourceType, 'ASSET_MATRIX_PUBLISH');
assert.equal(riskPrisma.employeeTasks[0]?.sourceId, publishBatch.data?.id);
assert.equal(riskPrisma.employeeTasks[0]?.sourceItemId, createdAccount.data!.id);
assert.equal(publishBatch.data?.targets[0]?.employeeTaskId, riskPrisma.employeeTasks[0]?.id);
assert.equal(
  riskPrisma.read<AssetMatrixPublishTask[]>(STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS)[0]?.targets[0]?.status,
  'pending',
  '发布批次只能汇总员工任务状态，创建时不得直接完成',
);
const deniedOffboarding = await riskService.markInternetAccountsForOffboarding([createdAccount.data!.id], deviceWriter);
assert.equal(deniedOffboarding.code, 403);
const markedOffboarding = await riskService.markInternetAccountsForOffboarding([createdAccount.data!.id], assetAdmin);
assert.equal(markedOffboarding.code, 0);
assert.deepEqual(markedOffboarding.data?.map((account) => account.id), [createdAccount.data!.id]);
assert.equal(markedOffboarding.data?.[0]?.controlStatus, '离职待回收');
assert.ok(
  riskPrisma.read<AssetOffboardingTask[]>(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS)
    .some((task) => task.assetId === createdAccount.data!.id),
  '批量标记离职账号必须在同一事务中同步回收任务',
);
const createdHandoverTask = riskPrisma.read<AssetOffboardingTask[]>(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS)
  .find((task) => task.assetId === createdAccount.data!.id)!;
const completedHandover = await riskService.completeOffboardingTask(createdHandoverTask.id, assetAdmin);
assert.equal(completedHandover.code, 0);
assert.equal(completedHandover.data?.status, '已回收');
assert.equal(
  riskPrisma.read<AssetInternetAccount[]>(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS)
    .find((account) => account.id === createdAccount.data!.id)?.controlStatus,
  '已回收',
  '生产环境完成资产交接必须在同一事务中回收账号',
);

const noSimDevice = await riskService.createDevice({
  deviceName: '无SIM摄影机',
  deviceCategory: '摄影设备',
  brand: 'Sony',
  model: 'FX3',
  communicationType: '无SIM',
  acquisitionType: '购买',
  purchaseAmount: 20_000,
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  status: '库存中',
}, assetAdmin);
assert.equal(noSimDevice.code, 0);
assert.equal(noSimDevice.data?.communicationType, '无SIM');
assert.equal(noSimDevice.data?.imei1, '');
const updatedNoSimDevice = await riskService.updateDevice(noSimDevice.data!.id, {
  serialNumber: 'FX3-SN-001',
  acquisitionType: '租赁',
  monthlyRent: 880,
  monthlyCost: 0,
}, assetAdmin);
assert.equal(updatedNoSimDevice.code, 0);
assert.equal(updatedNoSimDevice.data?.serialNumber, 'FX3-SN-001');
assert.equal(updatedNoSimDevice.data?.monthlyRent, 880);
assert.equal(updatedNoSimDevice.data?.monthlyCost, 880);
const purchasedNoSimDevice = await riskService.updateDevice(noSimDevice.data!.id, {
  acquisitionType: '购买',
  monthlyRent: 880,
  monthlyCost: 880,
}, assetAdmin);
assert.equal(purchasedNoSimDevice.data?.monthlyRent, 0);
assert.equal(purchasedNoSimDevice.data?.monthlyCost, 0);

const unboundPhone = await riskService.createPhoneNumber({
  phoneNumber: '13900009999',
  simForm: 'eSIM',
  iccid: '89860012345678901234',
  imsi: '460001234567890',
  servicePassword: '123456',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  ownerId: assetAdmin.id,
  packageName: '备用套餐',
  monthlyFee: 0,
  status: '待启用',
}, assetAdmin);
assert.equal(unboundPhone.code, 0);
assert.equal(unboundPhone.data?.deviceId, undefined);
assert.equal(unboundPhone.data?.slotType, undefined);
assert.match(unboundPhone.data?.iccidMasked || '', /\*/);
assert.match((unboundPhone.data as any)?.servicePasswordMasked || '', /[*•]/);
assert.equal((unboundPhone.data as any)?.servicePassword, undefined);
const deniedServicePassword = await riskService.revealPhoneServicePassword(unboundPhone.data!.id, assetAdmin);
assert.equal(deniedServicePassword.code, 403);
const revealedServicePassword = await riskService.revealPhoneServicePassword(unboundPhone.data!.id, sensitiveAssetAdmin);
assert.equal(revealedServicePassword.code, 0);
assert.equal(revealedServicePassword.data?.value, '123456');
assert.ok(
  riskPrisma.read<AssetOperationLog[]>(STORAGE_KEYS.ASSET_OPERATION_LOGS)
    .some((log) => log.targetId === unboundPhone.data!.id && log.detail === '查看敏感字段：服务密码'),
);
const updatedUnboundPhone = await riskService.updatePhoneNumber(unboundPhone.data!.id, {
  simForm: '实体SIM',
  iccid: '89860099999999999999',
  contractExpiresAt: '2027-08-18',
  remark: '已更换SIM',
  servicePassword: '',
}, assetAdmin);
assert.equal(updatedUnboundPhone.code, 0);
assert.equal(updatedUnboundPhone.data?.iccid, '89860099999999999999');
assert.equal(updatedUnboundPhone.data?.contractExpiresAt, '2027-08-18');
assert.equal(updatedUnboundPhone.data?.remark, '已更换SIM');
assert.equal((updatedUnboundPhone.data as any)?.servicePassword, undefined);
const clearedUnboundPhone = await riskService.updatePhoneNumber(unboundPhone.data!.id, {
  clearServicePassword: true,
}, assetAdmin);
assert.equal(clearedUnboundPhone.code, 0);
assert.equal((clearedUnboundPhone.data as any)?.servicePassword, undefined);
assert.equal((clearedUnboundPhone.data as any)?.servicePasswordMasked, undefined);
const clearedServicePasswordReveal = await riskService.revealPhoneServicePassword(unboundPhone.data!.id, sensitiveAssetAdmin);
assert.notEqual(clearedServicePasswordReveal.code, 0);

const pendingAccount = await riskService.createInternetAccount({
  platform: '小红书',
  accountCategory: '直播号',
  accountName: '待回收账号',
  loginAccount: 'pending_recycle_account',
  loginPassword: 'test-password',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  ownerId: assetAdmin.id,
  controlStatus: '离职待回收',
  accountStatus: '闲置',
  monthlyFee: 0,
}, assetAdmin);
assert.equal(pendingAccount.code, 0);
assert.equal(pendingAccount.data?.controlStatus, '离职待回收');
assert.ok(
  riskPrisma.read<AssetOffboardingTask[]>(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS).some((task) => task.assetId === pendingAccount.data?.id),
);

const ownerlessPhone = await riskService.createPhoneNumber({
  phoneNumber: '13900008888',
  simForm: '实体SIM',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  monthlyFee: 0,
  status: '待启用',
}, assetAdmin);
assert.equal(ownerlessPhone.code, 0);
assert.ok(
  riskPrisma.read<AssetRisk[]>(STORAGE_KEYS.ASSET_RISKS)
    .some((risk) => risk.riskKey === `phone-no-owner-${ownerlessPhone.data!.id}`),
);
const deletedOwnerlessPhone = await riskService.deletePhoneNumber(ownerlessPhone.data!.id, assetAdmin);
assert.equal(deletedOwnerlessPhone.code, 0);
assert.equal(
  riskPrisma.read<AssetRisk[]>(STORAGE_KEYS.ASSET_RISKS)
    .some((risk) => risk.riskKey === `phone-no-owner-${ownerlessPhone.data!.id}`),
  false,
  '删除手机号后必须同步清理其派生风险',
);

const relatedOwnerlessPhone = await riskService.createPhoneNumber({
  phoneNumber: '13900007777',
  simForm: '实体SIM',
  deviceId: oldDevice.id,
  slotType: '卡槽2',
  ownerSubject: '公司',
  departmentId: 'dept-assets',
  monthlyFee: 0,
  status: '待启用',
}, assetAdmin);
assert.equal(relatedOwnerlessPhone.code, 0);
assert.ok(
  riskPrisma.read<AssetRisk[]>(STORAGE_KEYS.ASSET_RISKS)
    .some((risk) => risk.riskKey === `phone-no-owner-${relatedOwnerlessPhone.data!.id}`),
);
const deletedDeviceWithRelations = await riskService.deleteDevice(oldDevice.id, assetAdmin);
assert.equal(deletedDeviceWithRelations.code, 0);
assert.deepEqual(
  riskPrisma.read<AssetInternetAccount[]>(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS)
    .find((account) => account.id === createdAccount.data!.id)?.loginDeviceIds,
  [unowned.data!.id],
  '删除设备后应从账号登录设备关系中移除该设备，但保留其他登录设备',
);
assert.equal(
  riskPrisma.read<AssetRisk[]>(STORAGE_KEYS.ASSET_RISKS)
    .some((risk) => risk.riskKey === `phone-no-owner-${relatedOwnerlessPhone.data!.id}`),
  false,
  '级联删除手机号后不得残留手机号风险',
);
assert.ok(
  riskPrisma.read<AssetRisk[]>(STORAGE_KEYS.ASSET_RISKS)
    .some((risk) => risk.riskKey === `account-unbound-phone-${createdAccount.data!.id}`),
  '设备删除导致账号解绑后必须生成账号风险',
);
