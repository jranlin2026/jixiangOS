import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type {
  AssetDevice,
  AssetInternetAccount,
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
    { module: PERMISSION_KEYS.ASSETS_DEVICES, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ASSETS_PHONES, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ASSETS_ACCOUNTS, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.ASSETS_OFFBOARDING, actions: ['read', 'write'] },
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

const oldDevice: AssetDevice = {
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
};

const ASSET_KEYS = [
  STORAGE_KEYS.ASSET_DEVICES,
  STORAGE_KEYS.ASSET_PHONE_NUMBERS,
  STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS,
  STORAGE_KEYS.ASSET_RISKS,
  STORAGE_KEYS.ASSET_OPERATION_LOGS,
  STORAGE_KEYS.ASSET_OFFBOARDING_TASKS,
  STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS,
] as const;

class FakePrisma {
  values = new Map<string, unknown>(ASSET_KEYS.map((key) => [key, []]));

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
  imei: 'RAW-NEW-IMEI',
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
assert.equal(created.data?.imeiMasked.includes('*'), true);
assert.deepEqual(
  prisma.read<AssetDevice[]>(STORAGE_KEYS.ASSET_DEVICES).map((item) => item.id).sort(),
  ['asset-device-created', oldDevice.id].sort(),
  '记录命令不得用 self 投影覆盖其他员工设备',
);
assert.equal(prisma.read<AssetOperationLog[]>(STORAGE_KEYS.ASSET_OPERATION_LOGS)[0]?.operator, deviceWriter.name);
assert.equal(prisma.read<AssetRisk[]>(STORAGE_KEYS.ASSET_RISKS).length, 0);

const maskedUpdate = await service.updateDevice(created.data!.id, {
  imei: created.data!.imeiMasked,
  remark: '这次更新不得覆盖原始 IMEI',
}, deviceWriter);
assert.equal(maskedUpdate.code, 400);
assert.match(maskedUpdate.message, /掩码/);
assert.equal(
  prisma.read<AssetDevice[]>(STORAGE_KEYS.ASSET_DEVICES).find((item) => item.id === created.data!.id)?.imei,
  'RAW-NEW-IMEI',
);

const forbiddenDelete = await service.deleteDevice(oldDevice.id, deviceWriter);
assert.equal(forbiddenDelete.code, 403);
assert.ok(
  prisma.read<AssetDevice[]>(STORAGE_KEYS.ASSET_DEVICES).some((item) => item.id === oldDevice.id),
  'self 范围不得删除其他员工的设备',
);

const riskPrisma = new FakePrisma();
const riskService = createAssetCommandService(riskPrisma as any, {
  now: () => new Date(NOW),
  id: (prefix) => `${prefix}-risk`,
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
  realName: '资产管理员',
  phoneId: createdPhone.data!.id,
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
assert.ok(
  riskPrisma.read<AssetInternetAccount[]>(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS).some((account) => account.id === createdAccount.data?.id),
);
