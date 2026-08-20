import assert from 'node:assert/strict';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { AssetInternetAccount, AssetMatrixPublishTask, AssetPhoneNumber } from '../../src/types/asset';
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
const deviceOnlyRole: Role = {
  ...adminRole,
  id: 'role-device-only',
  name: '设备查看员',
  code: 'device_reader',
  permissions: [{ module: PERMISSION_KEYS.ASSETS_DEVICES, actions: ['read'] }],
};
const deviceOnlyUser: User = { ...adminUser, id: 'user-device-only', role: deviceOnlyRole.name, roleId: deviceOnlyRole.id };
const authenticatedDeviceOnly: AuthenticatedUser = {
  ...authenticatedAdmin,
  id: deviceOnlyUser.id,
  role: deviceOnlyRole.name,
  roleId: deviceOnlyRole.id,
  permissions: deviceOnlyRole.permissions,
};

const data: Record<string, unknown> = {
  [STORAGE_KEYS.ASSET_DEVICES]: [
    { id: 'device-a', deviceCode: 'DEV-0001', deviceName: '直播一号机', deviceCategory: '手机', brand: '苹果', model: '15 Pro', communicationType: '双卡', acquisitionType: '购买', departmentId: 'dept-live', ownerId: 'user-admin', currentUserId: 'user-admin', owner: '管理员', currentUser: '管理员', imei1: '111', imei1Masked: '***111', status: '使用中', riskLevel: '低', monthlyCost: 50 },
    { id: 'device-b', deviceCode: 'DEV-0002', deviceName: '剪辑二号机', deviceCategory: '电脑', brand: '苹果', model: '', communicationType: '无SIM', acquisitionType: '租赁', departmentId: 'dept-edit', department: '剪辑部', ownerId: 'user-admin', owner: '管理员', currentUser: '', imei1: '222', imei1Masked: '***222', status: '库存中', riskLevel: '中', monthlyCost: 30 },
  ],
  [STORAGE_KEYS.ASSET_PHONE_NUMBERS]: [
    { id: 'phone-1', owner: '管理员', ownerId: 'user-admin', deviceId: 'device-a', phoneNumber: '13800000000', phoneNumberMasked: '138****0000', operator: '移动', attributionLocation: '福建厦门', simForm: '实体SIM', servicePasswordMasked: '******', status: '使用中', monthlyFee: 38 },
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
  async () => ({ roles: [adminRole, deviceOnlyRole], users: [adminUser, deviceOnlyUser] }),
);

const matrixService = createAssetListService(
  {
    get: async (key) => ({
      code: 0,
      data: key === STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS ? [{
        id: 'batch-1', title: '发布批次', dueAt: '2026-08-31T18:00:00.000Z', createdBy: '管理员',
        createdAt: now, updatedAt: now, copywriting: '', targets: [{
          id: 'target-1', accountId: 'account-business', accountNo: 'A-0001', platform: 'TikTok',
          accountName: '品牌业务号', assignee: '管理员', department: '运营部', employeeTaskId: 'employee-task-1', status: 'pending',
        }],
      }] : data[key] ?? [],
    }),
  },
  async () => ({ roles: [adminRole], users: [adminUser] }),
  async () => [{ id: 'employee-task-1', status: 'CONFIRMED', completedAt: now }],
);
const confirmedBatches = await matrixService.list('matrix-publish', { status: 'confirmed', page: 1, pageSize: 10 }, authenticatedAdmin);
assert.equal(confirmedBatches.data.pagination.total, 1, '发布批次状态必须由员工任务中心实时汇总');
assert.equal((confirmedBatches.data.items[0] as AssetMatrixPublishTask).targets[0]?.status, 'confirmed');
const confirmedStats = await matrixService.matrixStats(authenticatedAdmin, '2099-01-01T00:00:00.000Z');
assert.equal(confirmedStats.data.totalTargets, 1);
assert.equal(confirmedStats.data.completedTargets, 1, '已确认员工任务应计入发布批次完成数');
assert.equal(confirmedStats.data.overdueTargets, 0, '已确认员工任务不得计入逾期');

const first = await service.list('phones', { page: 1, pageSize: 20 }, authenticatedAdmin);
assert.equal((first.data.items[0] as AssetPhoneNumber | undefined)?.deviceId, 'device-a');
await service.list('phones', { page: 1, pageSize: 20 }, authenticatedAdmin);
assert.equal(storageReadCount, 7, '未写入时应复用同一资产快照');

data[STORAGE_KEYS.ASSET_PHONE_NUMBERS] = [
  { id: 'phone-1', owner: '管理员', ownerId: 'user-admin', deviceId: 'device-b', phoneNumber: '13800000000', phoneNumberMasked: '138****0000', operator: '中国移动', attributionLocation: '福建厦门', simForm: '实体SIM', servicePasswordMasked: '******', packageName: '企业畅联', contractExpiresAt: '2099-12-31', status: '使用中', monthlyFee: 38 },
];
service.invalidate();

const second = await service.list('phones', { page: 1, pageSize: 20 }, authenticatedAdmin);
assert.equal((second.data.items[0] as AssetPhoneNumber | undefined)?.deviceId, 'device-b');

data[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] = [
  { id: 'account-apple', platform: 'Apple ID', accountName: '企业身份', accountCategory: '主账号', loginAccount: 'brand-identity@icloud.com', owner: '管理员', currentUser: '管理员', accountStatus: '使用中', loginCredentialStatus: '待补齐', monthlyFee: 12 },
  { id: 'account-business', platform: 'TikTok', accountName: '品牌业务号', accountCategory: '直播号', loginAccount: 'brand-business', phoneId: 'phone-1', loginDeviceIds: ['device-b'], identityAccountIds: ['account-apple'], ownerId: 'user-admin', owner: '管理员', currentUser: '管理员', accountStatus: '使用中', loginCredentialStatus: '已设置', twoFactorMethod: '验证器', monthlyFee: 20 },
];
service.invalidate();
const dashboard = await service.dashboard(authenticatedAdmin);
assert.deepEqual(dashboard.data.deviceSummary, {
  total: 2,
  inUse: 1,
  inventory: 1,
  attention: 0,
  unassignedUser: 1,
  monthlyCost: 80,
});
assert.equal(dashboard.data.phoneSummary.boundDevice, 1);
assert.equal(dashboard.data.accountSummary.withLoginDevice, 1);
assert.equal(dashboard.data.accountSummary.unboundPhone, 1);
assert.equal(dashboard.data.accountSummary.credentialPending, 1);
assert.equal(dashboard.data.monthlyCost, 150, '总月费用应包含设备、手机号和互联网账号');
const relationshipPage = await service.relationships({ search: '品牌业务号', page: 1, pageSize: 10 }, authenticatedAdmin);
assert.equal(relationshipPage.data.pagination.total, 1, '关系明细应支持通过关联账号搜索设备');
assert.equal(relationshipPage.data.items[0]?.device.id, 'device-b');
assert.deepEqual(relationshipPage.data.items[0]?.accounts.map((account) => account.id), ['account-business']);
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
const searchedPhoneByDevice = await service.list('phones', { search: '剪辑二号机', page: 1, pageSize: 20 }, authenticatedAdmin);
assert.deepEqual(searchedPhoneByDevice.data.items.map((phone) => phone.id), ['phone-1'], '手机号应能通过所属设备名称搜索');
const searchedAccountByPhone = await service.list('accounts', { search: '13800000000', page: 1, pageSize: 20 }, authenticatedAdmin);
assert.deepEqual(searchedAccountByPhone.data.items.map((account) => account.id), ['account-business'], '互联网账号应能通过绑定手机号搜索');
const filteredByLoginDevice = await service.list('accounts', { loginDeviceId: 'device-b', page: 1, pageSize: 10 }, authenticatedAdmin);
assert.deepEqual(
  (filteredByLoginDevice.data.items as AssetInternetAccount[]).map((account) => account.id),
  ['account-business'],
  '设备互联网账号明细应只返回当前设备的登录账号',
);
assert.equal(filteredByLoginDevice.data.pagination.total, 1, '设备互联网账号明细必须返回可分页的准确总数');
const filteredDeviceCombination = await service.list('devices', {
  deviceCategory: '电脑', profileStatus: 'incomplete', phoneBinding: 'bound', loginDeviceBinding: 'with', page: 1, pageSize: 10,
}, authenticatedAdmin);
assert.deepEqual(filteredDeviceCombination.data.items.map((item) => item.id), ['device-b'], '设备高级筛选应支持跨维度 AND 组合');
const filteredPhoneCombination = await service.list('phones', {
  operator: '移动', deviceBinding: 'bound', accountBinding: 'with', servicePasswordStatus: 'configured',
  packageName: '企业畅联', contractStatus: 'active', monthlyFeeMin: 30, monthlyFeeMax: 40, page: 1, pageSize: 10,
}, authenticatedAdmin);
assert.deepEqual(filteredPhoneCombination.data.items.map((item) => item.id), ['phone-1'], '手机号筛选应同时识别设备、账号与服务密码配置状态');
const phoneOptions = await service.filterOptions('phones', authenticatedAdmin);
assert.deepEqual(phoneOptions.data.operators, [{ value: '移动', label: '移动' }], '旧运营商名称应归一为标准筛选项');
const accountOptions = await service.filterOptions('accounts', authenticatedAdmin);
for (const platform of ['抖音', '快手', '小红书', '微信', '视频号', '企业微信', '百度', 'Apple ID', 'Google账号', 'LINE', 'Instagram', 'TikTok']) {
  assert.ok(accountOptions.data.platforms.some((option) => option.value === platform), `新增账号平台 ${platform} 应映射到平台筛选`);
}
const restrictedDevices = await service.list('devices', { phoneBinding: 'bound', loginDeviceBinding: 'with', page: 1, pageSize: 10 }, authenticatedDeviceOnly);
assert.equal(restrictedDevices.data.pagination.total, 2, '无关联模块权限时应忽略关系筛选，不得推断隐藏关系');
assert.equal('phoneNumberCount' in (restrictedDevices.data.items[0] as object), false, '无手机号权限时不得返回关系计数');
assert.equal('internetAccountCount' in (restrictedDevices.data.items[0] as object), false, '无账号权限时不得返回关系计数');
const filteredAccountCombination = await service.list('accounts', {
  accountCategory: '直播号', phoneBinding: 'bound', loginDeviceBinding: 'with', identityBinding: 'apple',
  credentialStatus: 'complete', twoFactorStatus: 'configured', page: 1, pageSize: 10,
}, authenticatedAdmin);
assert.deepEqual(filteredAccountCombination.data.items.map((item) => item.id), ['account-business'], '账号筛选应保持手机号、登录设备和身份账号为独立关系');
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
data[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] = [
  ...(data[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as AssetInternetAccount[]),
  { id: 'account-phone-only', platform: '微信', accountName: '仅绑手机号', loginAccount: 'phone-only', phoneId: 'phone-1', loginDeviceIds: [], owner: '管理员', accountStatus: '使用中' },
  { id: 'account-device-only', platform: 'LINE', accountName: '无卡设备账号', loginAccount: 'device-only', loginDeviceIds: ['device-a'], owner: '管理员', accountStatus: '使用中' },
];
service.invalidate();
const deviceWithPhoneDetail = await service.detail('device', 'device-b', authenticatedAdmin);
assert.deepEqual(
  deviceWithPhoneDetail.data?.relatedAccounts.map((account) => account.id).sort(),
  ['account-business', 'account-phone-only'],
  '设备详情应同时返回本机登录账号和绑定该设备手机号的账号',
);
const deviceWithoutPhoneDetail = await service.detail('device', 'device-a', authenticatedAdmin);
assert.deepEqual(
  deviceWithoutPhoneDetail.data?.relatedAccounts.map((account) => account.id),
  ['account-device-only'],
  '无 SIM 设备仍应返回独立配置的登录账号',
);
const deviceOnlyReader: AuthenticatedUser = {
  ...authenticatedAdmin,
  permissions: [
    { module: PERMISSION_KEYS.ASSETS_DEVICES, actions: ['read'] },
  ],
};
const deviceOnlyDetail = await service.detail('device', 'device-b', deviceOnlyReader);
assert.equal(deviceOnlyDetail.data?.device?.id, 'device-b');
assert.deepEqual(deviceOnlyDetail.data?.relatedPhones, [], '仅设备权限不应泄露关联手机号');
assert.deepEqual(deviceOnlyDetail.data?.relatedAccounts, [], '仅设备权限不应泄露关联互联网账号');
assert.deepEqual(deviceOnlyDetail.data?.risks, [], '无风险权限时不应返回风险');
assert.deepEqual(deviceOnlyDetail.data?.logs, [], '无日志权限时不应返回日志');
const deviceOnlyDashboard = await service.dashboard(deviceOnlyReader);
assert.equal(deviceOnlyDashboard.data.deviceCount, 2);
assert.equal(deviceOnlyDashboard.data.phoneCount, 0, '总览必须按叶子读取权限隐藏手机号统计');
assert.equal(deviceOnlyDashboard.data.accountCount, 0, '总览必须按叶子读取权限隐藏账号统计');
assert.equal(deviceOnlyDashboard.data.monthlyCost, 80, '总费用只能汇总有权限的资产类型');
const deviceOnlyRelationships = await service.relationships({ page: 1, pageSize: 10 }, deviceOnlyReader);
assert.equal(deviceOnlyRelationships.data.items.length, 2);
assert.deepEqual(deviceOnlyRelationships.data.items[0]?.phones, []);
assert.deepEqual(deviceOnlyRelationships.data.items[0]?.accounts, []);

const phoneOnlyReader: AuthenticatedUser = {
  ...authenticatedAdmin,
  permissions: [{ module: PERMISSION_KEYS.ASSETS_PHONES, actions: ['read'] }],
};
const phoneOnlyList = await service.list('phones', { page: 1, pageSize: 10 }, phoneOnlyReader);
assert.equal('deviceId' in (phoneOnlyList.data.items[0] as object), false, '仅手机号权限不得返回设备关联 ID');
const phoneOnlySearch = await service.list('phones', { search: 'device-b', page: 1, pageSize: 10 }, phoneOnlyReader);
assert.equal(phoneOnlySearch.data.pagination.total, 0, '仅手机号权限不得搜索隐藏设备 ID');
const phoneOnlyDashboard = await service.dashboard(phoneOnlyReader);
assert.equal(phoneOnlyDashboard.data.phoneSummary.boundDevice, 0);
assert.equal(phoneOnlyDashboard.data.phoneSummary.unboundDevice, 0, '无设备权限时不得推断手机号设备绑定关系');

const accountOnlyReader: AuthenticatedUser = {
  ...authenticatedAdmin,
  permissions: [{ module: PERMISSION_KEYS.ASSETS_ACCOUNTS, actions: ['read'] }],
};
const accountOnlyList = await service.list('accounts', { page: 1, pageSize: 10 }, accountOnlyReader);
const accountOnlyBusiness = accountOnlyList.data.items.find((account) => account.id === 'account-business') as AssetInternetAccount;
assert.equal('phoneId' in accountOnlyBusiness, false, '仅账号权限不得返回手机号关联 ID');
assert.equal('loginDeviceIds' in accountOnlyBusiness, false, '仅账号权限不得返回登录设备关联 ID');
const accountOnlyPhoneSearch = await service.list('accounts', { search: 'phone-1', page: 1, pageSize: 10 }, accountOnlyReader);
const accountOnlyDeviceSearch = await service.list('accounts', { search: 'device-b', page: 1, pageSize: 10 }, accountOnlyReader);
assert.equal(accountOnlyPhoneSearch.data.pagination.total, 0, '仅账号权限不得搜索隐藏手机号 ID');
assert.equal(accountOnlyDeviceSearch.data.pagination.total, 0, '仅账号权限不得搜索隐藏设备 ID');
const accountOnlyDashboard = await service.dashboard(accountOnlyReader);
assert.deepEqual({
  withLoginDevice: accountOnlyDashboard.data.accountSummary.withLoginDevice,
  withoutLoginDevice: accountOnlyDashboard.data.accountSummary.withoutLoginDevice,
  boundPhone: accountOnlyDashboard.data.accountSummary.boundPhone,
  unboundPhone: accountOnlyDashboard.data.accountSummary.unboundPhone,
}, { withLoginDevice: 0, withoutLoginDevice: 0, boundPhone: 0, unboundPhone: 0 }, '无关联叶子权限时不得返回账号绑定统计');

{
  const originalDevices = structuredClone(data[STORAGE_KEYS.ASSET_DEVICES]);
  data[STORAGE_KEYS.ASSET_DEVICES] = (data[STORAGE_KEYS.ASSET_DEVICES] as Array<Record<string, unknown>>).map((device) => (
    device.id === 'device-b' ? { ...device, ownerId: 'user-other', owner: '管理员' } : device
  ));
  service.invalidate();
  const exactOwner = await service.list('devices', {
    ownerId: `org:${encodeURIComponent('user-admin')}:${encodeURIComponent('管理员')}`,
    page: 1,
    pageSize: 10,
  }, authenticatedAdmin);
  assert.deepEqual(exactOwner.data.items.map((device) => device.id), ['device-a'], '有 ID 时同名人员必须按 ID 精确筛选');
  data[STORAGE_KEYS.ASSET_DEVICES] = originalDevices;
  service.invalidate();
}

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
  async () => ({ roles: [adminRole, deviceOnlyRole], users: [adminUser, deviceOnlyUser] }),
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
