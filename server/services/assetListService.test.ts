import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { AssetInternetAccount, AssetPhoneNumber } from '../../src/types/asset';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';
import { createAssetListService } from './assetListService';

const now = new Date().toISOString();
const permissions = [{ module: '全部', actions: ['admin'] }];
const adminRole: Role = {
  id: 'role-admin',
  name: '超级管理员',
  code: 'super_admin',
  permissions,
  dataScopes: { assets: 'all' },
  memberCount: 1,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};
const adminUser: User = {
  id: 'user-admin',
  name: '管理员',
  account: 'admin',
  email: 'admin@example.com',
  phone: '',
  role: '超级管理员',
  roleId: adminRole.id,
  isActive: true,
  employmentStatus: 'active',
  createdAt: now,
  updatedAt: now,
};
const authenticatedAdmin: AuthenticatedUser = {
  id: adminUser.id,
  name: adminUser.name,
  account: adminUser.account || 'admin',
  email: adminUser.email,
  phone: adminUser.phone,
  role: adminUser.role,
  roleId: adminUser.roleId,
  isActive: adminUser.isActive,
  permissions,
};

const data: Record<string, unknown> = {
  [STORAGE_KEYS.ASSET_DEVICES]: [
    { id: 'device-a', deviceCode: 'DEV-0001', deviceName: '直播一号机', owner: '管理员', currentUser: '管理员', imei1: '111', imei1Masked: '***111' },
    { id: 'device-b', deviceCode: 'DEV-0002', deviceName: '剪辑二号机', owner: '管理员', currentUser: '管理员', imei1: '222', imei1Masked: '***222' },
  ],
  [STORAGE_KEYS.ASSET_PHONE_NUMBERS]: [
    { id: 'phone-1', owner: '管理员', deviceId: 'device-a', phoneNumber: '13800000000', phoneNumberMasked: '138****0000' },
  ],
  [STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS]: [],
  [STORAGE_KEYS.ASSET_RISKS]: [],
  [STORAGE_KEYS.ASSET_OPERATION_LOGS]: [],
  [STORAGE_KEYS.ASSET_OFFBOARDING_TASKS]: [],
  [STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS]: [],
};

let storageReadCount = 0;
const service = createAssetListService(
  {
    get: async (key) => {
      storageReadCount += 1;
      return { code: 0, data: data[key] ?? [] };
    },
  },
  async () => ({ roles: [adminRole], users: [adminUser] }),
);

const first = await service.list('phones', { page: 1, pageSize: 20 }, authenticatedAdmin);
assert.equal((first.data.items[0] as AssetPhoneNumber | undefined)?.deviceId, 'device-a');
await service.list('phones', { page: 1, pageSize: 20 }, authenticatedAdmin);
assert.equal(storageReadCount, 7, '未写入时应复用同一资产快照');

data[STORAGE_KEYS.ASSET_PHONE_NUMBERS] = [
  { id: 'phone-1', owner: '管理员', deviceId: 'device-b', phoneNumber: '13800000000', phoneNumberMasked: '138****0000' },
];
service.invalidate();

const second = await service.list('phones', { page: 1, pageSize: 20 }, authenticatedAdmin);
assert.equal((second.data.items[0] as AssetPhoneNumber | undefined)?.deviceId, 'device-b');

data[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] = [
  { id: 'account-apple', platform: 'Apple ID', accountName: '企业身份', loginAccount: 'brand-identity@icloud.com', owner: '管理员', currentUser: '管理员' },
  { id: 'account-business', platform: 'TikTok', accountName: '品牌业务号', loginAccount: 'brand-business', loginDeviceIds: ['device-b'], identityAccountIds: ['account-apple'], owner: '管理员', currentUser: '管理员' },
];
service.invalidate();
const searchedByIdentity = await service.list('accounts', { search: 'brand-identity@icloud.com', page: 1, pageSize: 20 }, authenticatedAdmin);
assert.deepEqual(
  (searchedByIdentity.data.items as AssetInternetAccount[]).map((account) => account.id).sort(),
  ['account-apple', 'account-business'],
  '通过身份账号登录名搜索时应找到被绑定的业务账号',
);
const searchedByLoginDevice = await service.list('accounts', { search: '剪辑二号机', page: 1, pageSize: 20 }, authenticatedAdmin);
assert.deepEqual(
  (searchedByLoginDevice.data.items as AssetInternetAccount[]).map((account) => account.id),
  ['account-business'],
  '互联网账号应能通过独立配置的登录设备名称搜索',
);
const filteredByLoginDevice = await service.list('accounts', { loginDeviceId: 'device-b', page: 1, pageSize: 10 }, authenticatedAdmin);
assert.deepEqual(
  (filteredByLoginDevice.data.items as AssetInternetAccount[]).map((account) => account.id),
  ['account-business'],
  '设备互联网账号明细应只返回当前设备的登录账号',
);
assert.equal(filteredByLoginDevice.data.pagination.total, 1, '设备互联网账号明细必须返回可分页的准确总数');
const devicesWithAccountCount = await service.list('devices', { page: 1, pageSize: 10 }, authenticatedAdmin);
assert.equal(
  (devicesWithAccountCount.data.items.find((device) => device.id === 'device-b') as { internetAccountCount?: number } | undefined)?.internetAccountCount,
  1,
  '设备列表应返回当前数据范围内的准确互联网账号数量',
);
const accountDetail = await service.detail('account', 'account-business', authenticatedAdmin);
assert.equal(accountDetail.data?.account?.id, 'account-business', '生产模式应能读取服务端实时账号详情');
assert.deepEqual(accountDetail.data?.relatedDevices?.map((device) => device.id), ['device-b']);
assert.deepEqual(accountDetail.data?.relatedAccounts?.map((account) => account.id).sort(), ['account-apple', 'account-business']);

{
  let releaseOldRead!: () => void;
  const oldReadGate = new Promise<void>((resolve) => {
    releaseOldRead = resolve;
  });
  let signalOldReadStarted!: () => void;
  const oldReadStarted = new Promise<void>((resolve) => {
    signalOldReadStarted = resolve;
  });
  let holdFirstPhoneRead = true;
  const concurrentData = { ...data };
  concurrentData[STORAGE_KEYS.ASSET_PHONE_NUMBERS] = [
    { id: 'phone-race', owner: '管理员', deviceId: 'device-a', phoneNumber: '13900000000', phoneNumberMasked: '139****0000' },
  ];
  const concurrentService = createAssetListService(
    {
      get: async (key) => {
        const snapshot = structuredClone(concurrentData[key] ?? []);
        if (key === STORAGE_KEYS.ASSET_PHONE_NUMBERS && holdFirstPhoneRead) {
          holdFirstPhoneRead = false;
          signalOldReadStarted();
          await oldReadGate;
        }
        return { code: 0, data: snapshot };
      },
    },
    async () => ({ roles: [adminRole], users: [adminUser] }),
  );

  const oldRead = concurrentService.list('phones', { page: 1, pageSize: 20 }, authenticatedAdmin);
  await oldReadStarted;
  concurrentData[STORAGE_KEYS.ASSET_PHONE_NUMBERS] = [
    { id: 'phone-race', owner: '管理员', deviceId: 'device-b', phoneNumber: '13900000000', phoneNumberMasked: '139****0000' },
  ];
  concurrentService.invalidate();
  const refreshedRead = concurrentService.list('phones', { page: 1, pageSize: 20 }, authenticatedAdmin);
  releaseOldRead();

  await oldRead;
  const refreshed = await refreshedRead;
  assert.equal((refreshed.data.items[0] as AssetPhoneNumber | undefined)?.deviceId, 'device-b');
}
