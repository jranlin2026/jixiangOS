import assert from 'node:assert/strict';
import { assetApi } from './assetApi';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import { PERMISSION_KEYS } from '../shared/utils/permissions';
import type {
  AssetDevice,
  AssetInternetAccount,
  AssetOffboardingTask,
  AssetOperationLog,
  AssetPhoneNumber,
  AssetRisk,
} from '../types/asset';
import type { Role } from '../types/role';
import type { User } from '../types/settings';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const timestamp = '2026-07-01T00:00:00.000Z';

const users: User[] = [
  {
    id: 'user-self',
    name: 'Asset Self',
    account: 'asset_self',
    role: 'Asset Self Role',
    roleId: 'role-asset-self',
    departmentId: 'dept-sales',
    positionId: 'pos-sales',
    isActive: true,
    employmentStatus: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  } as User,
  {
    id: 'user-peer',
    name: 'Asset Peer',
    account: 'asset_peer',
    role: 'Asset Manager Role',
    roleId: 'role-asset-manager',
    departmentId: 'dept-sales',
    positionId: 'pos-sales',
    isActive: true,
    employmentStatus: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  } as User,
  {
    id: 'user-other',
    name: 'Asset Other',
    account: 'asset_other',
    role: 'Asset Self Role',
    roleId: 'role-asset-self',
    departmentId: 'dept-ops',
    positionId: 'pos-ops',
    isActive: true,
    employmentStatus: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  } as User,
  {
    id: 'user-admin',
    name: 'Asset Admin',
    account: 'asset_admin',
    role: 'Super Admin',
    roleId: 'role-asset-admin',
    departmentId: 'dept-general',
    positionId: 'pos-general',
    isActive: true,
    employmentStatus: 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  } as User,
];

const roles: Role[] = [
  {
    id: 'role-asset-self',
    name: 'Asset Self Role',
    code: 'asset_self',
    permissions: [{ module: PERMISSION_KEYS.ASSETS, actions: ['read'] }],
    dataScopes: { assets: 'self' },
    memberCount: 0,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'role-asset-manager',
    name: 'Asset Manager Role',
    code: 'asset_manager',
    permissions: [{ module: PERMISSION_KEYS.ASSETS, actions: ['read'] }],
    dataScopes: { assets: 'department' },
    memberCount: 0,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'role-asset-admin',
    name: 'Super Admin',
    code: 'super_admin',
    permissions: [{ module: '全部', actions: ['read', 'write', 'admin'] }],
    dataScopes: { assets: 'all' },
    memberCount: 0,
    isActive: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const devices: AssetDevice[] = [
  {
    id: 'device-self',
    deviceCode: 'DEV-SELF',
    deviceName: 'Self Device',
    brandModel: 'iPhone',
    imei: 'IMEI-SELF',
    imeiMasked: 'IMEI-***-SELF',
    simType: '双卡' as AssetDevice['simType'],
    ownerSubject: '公司' as AssetDevice['ownerSubject'],
    department: 'Sales',
    owner: 'Asset Self',
    currentUser: 'Asset Self',
    status: '使用中' as AssetDevice['status'],
    riskLevel: '低' as AssetDevice['riskLevel'],
    monthlyCost: 99,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'device-peer',
    deviceCode: 'DEV-PEER',
    deviceName: 'Peer Device',
    brandModel: 'iPhone',
    imei: 'IMEI-PEER',
    imeiMasked: 'IMEI-***-PEER',
    simType: '双卡' as AssetDevice['simType'],
    ownerSubject: '公司' as AssetDevice['ownerSubject'],
    department: 'Sales',
    owner: 'Asset Peer',
    currentUser: 'Asset Peer',
    status: '使用中' as AssetDevice['status'],
    riskLevel: '低' as AssetDevice['riskLevel'],
    monthlyCost: 88,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'device-other',
    deviceCode: 'DEV-OTHER',
    deviceName: 'Other Device',
    brandModel: 'iPhone',
    imei: 'IMEI-OTHER',
    imeiMasked: 'IMEI-***-OTHER',
    simType: '双卡' as AssetDevice['simType'],
    ownerSubject: '公司' as AssetDevice['ownerSubject'],
    department: 'Ops',
    owner: 'Asset Other',
    currentUser: 'Asset Other',
    status: '使用中' as AssetDevice['status'],
    riskLevel: '低' as AssetDevice['riskLevel'],
    monthlyCost: 77,
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const phones: AssetPhoneNumber[] = [
  {
    id: 'phone-self',
    phoneNumber: '13900000001',
    phoneNumberMasked: '139****0001',
    operator: '移动' as AssetPhoneNumber['operator'],
    deviceId: 'device-self',
    slotType: '卡槽1' as AssetPhoneNumber['slotType'],
    packageName: 'Self Plan',
    monthlyFee: 39,
    owner: 'Asset Self',
    status: '使用中' as AssetPhoneNumber['status'],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'phone-peer',
    phoneNumber: '13900000002',
    phoneNumberMasked: '139****0002',
    operator: '移动' as AssetPhoneNumber['operator'],
    deviceId: 'device-peer',
    slotType: '卡槽1' as AssetPhoneNumber['slotType'],
    packageName: 'Peer Plan',
    monthlyFee: 29,
    owner: 'Asset Peer',
    status: '使用中' as AssetPhoneNumber['status'],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'phone-other',
    phoneNumber: '13900000003',
    phoneNumberMasked: '139****0003',
    operator: '移动' as AssetPhoneNumber['operator'],
    deviceId: 'device-other',
    slotType: '卡槽1' as AssetPhoneNumber['slotType'],
    packageName: 'Other Plan',
    monthlyFee: 19,
    owner: 'Asset Other',
    status: '使用中' as AssetPhoneNumber['status'],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

const accounts: AssetInternetAccount[] = [
  {
    id: 'account-self',
    accountNo: 'A-SELF',
    platform: 'Demo',
    accountName: 'Self Account',
    loginAccount: 'self_account',
    loginAccountMasked: 'self_***',
    phoneId: 'phone-self',
    ownerSubject: '公司' as AssetInternetAccount['ownerSubject'],
    department: 'Sales',
    owner: 'Asset Self',
    currentUser: 'Asset Self',
    permissionStatus: '正常' as AssetInternetAccount['permissionStatus'],
    accountStatus: '正常' as AssetInternetAccount['accountStatus'],
    riskLevel: '低' as AssetInternetAccount['riskLevel'],
    serviceProvider: 'Demo',
    monthlyFee: 10,
    purpose: 'Visibility test',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'account-peer',
    accountNo: 'A-PEER',
    platform: 'Demo',
    accountName: 'Peer Account',
    loginAccount: 'peer_account',
    loginAccountMasked: 'peer_***',
    phoneId: 'phone-peer',
    ownerSubject: '公司' as AssetInternetAccount['ownerSubject'],
    department: 'Sales',
    owner: 'Asset Peer',
    currentUser: 'Asset Peer',
    permissionStatus: '正常' as AssetInternetAccount['permissionStatus'],
    accountStatus: '正常' as AssetInternetAccount['accountStatus'],
    riskLevel: '低' as AssetInternetAccount['riskLevel'],
    serviceProvider: 'Demo',
    monthlyFee: 10,
    purpose: 'Visibility test',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  {
    id: 'account-other',
    accountNo: 'A-OTHER',
    platform: 'Demo',
    accountName: 'Other Account',
    loginAccount: 'other_account',
    loginAccountMasked: 'other_***',
    phoneId: 'phone-other',
    ownerSubject: '公司' as AssetInternetAccount['ownerSubject'],
    department: 'Ops',
    owner: 'Asset Other',
    currentUser: 'Asset Other',
    permissionStatus: '正常' as AssetInternetAccount['permissionStatus'],
    accountStatus: '正常' as AssetInternetAccount['accountStatus'],
    riskLevel: '低' as AssetInternetAccount['riskLevel'],
    serviceProvider: 'Demo',
    monthlyFee: 10,
    purpose: 'Visibility test',
    createdAt: timestamp,
    updatedAt: timestamp,
  },
];

function seed(userId: string): void {
  storage.clear();
  storage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
  storage.setItem(STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION, '5');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));
  storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify([
    { id: 'dept-sales', name: 'Sales', code: 'SALES', managerId: 'user-peer', memberCount: 2, isActive: true, createdAt: timestamp, updatedAt: timestamp },
    { id: 'dept-ops', name: 'Ops', code: 'OPS', memberCount: 1, isActive: true, createdAt: timestamp, updatedAt: timestamp },
    { id: 'dept-general', name: 'General', code: 'GENERAL', memberCount: 1, isActive: true, createdAt: timestamp, updatedAt: timestamp },
  ]));
  storage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify([]));
  storage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    userId,
    account: users.find((user) => user.id === userId)?.account,
    role: users.find((user) => user.id === userId)?.role,
    expiresAt: '2099-01-01T00:00:00.000Z',
  }));
  storage.setItem(STORAGE_KEYS.ASSET_DEVICES, JSON.stringify(devices));
  storage.setItem(STORAGE_KEYS.ASSET_PHONE_NUMBERS, JSON.stringify(phones));
  storage.setItem(STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS, JSON.stringify(accounts));
  storage.setItem(STORAGE_KEYS.ASSET_RISKS, JSON.stringify([
    { id: 'risk-self', riskKey: 'risk-self', type: 'Risk', targetType: 'account', targetId: 'account-self', targetName: 'Self Account', level: '高', status: 'open', description: 'Self risk', createdAt: timestamp },
    { id: 'risk-peer', riskKey: 'risk-peer', type: 'Risk', targetType: 'account', targetId: 'account-peer', targetName: 'Peer Account', level: '高', status: 'open', description: 'Peer risk', createdAt: timestamp },
    { id: 'risk-other', riskKey: 'risk-other', type: 'Risk', targetType: 'account', targetId: 'account-other', targetName: 'Other Account', level: '高', status: 'open', description: 'Other risk', createdAt: timestamp },
  ] satisfies AssetRisk[]));
  storage.setItem(STORAGE_KEYS.ASSET_OPERATION_LOGS, JSON.stringify([
    { id: 'log-self', time: timestamp, action: 'Edit', targetType: '账号', targetId: 'account-self', targetName: 'Self Account', operator: 'Asset Self', detail: 'Self log' },
    { id: 'log-peer', time: timestamp, action: 'Edit', targetType: '账号', targetId: 'account-peer', targetName: 'Peer Account', operator: 'Asset Peer', detail: 'Peer log' },
    { id: 'log-other', time: timestamp, action: 'Edit', targetType: '账号', targetId: 'account-other', targetName: 'Other Account', operator: 'Asset Other', detail: 'Other log' },
  ] satisfies AssetOperationLog[]));
  storage.setItem(STORAGE_KEYS.ASSET_OFFBOARDING_TASKS, JSON.stringify([
    { id: 'task-self', employeeName: 'Asset Self', department: 'Sales', assetType: '互联网账号', assetId: 'account-self', assetName: 'Self Account', permissionStatus: '离职待回收', status: '待回收', dueAt: '2026-07-02' },
    { id: 'task-peer', employeeName: 'Asset Peer', department: 'Sales', assetType: '互联网账号', assetId: 'account-peer', assetName: 'Peer Account', permissionStatus: '离职待回收', status: '待回收', dueAt: '2026-07-02' },
    { id: 'task-other', employeeName: 'Asset Other', department: 'Ops', assetType: '互联网账号', assetId: 'account-other', assetName: 'Other Account', permissionStatus: '离职待回收', status: '待回收', dueAt: '2026-07-02' },
  ] satisfies AssetOffboardingTask[]));
}

function ids<T extends { id: string }>(rows: T[]): string[] {
  return rows.map((row) => row.id).sort();
}

seed('user-self');
{
  const visibleDevices = await assetApi.fetchDevices({ pageSize: 10 });
  const visiblePhones = await assetApi.fetchPhoneNumbers({ pageSize: 10 });
  const visibleAccounts = await assetApi.fetchInternetAccounts({ pageSize: 10 });
  const visibleRisks = await assetApi.fetchRisks({ pageSize: 10 });
  const visibleLogs = await assetApi.fetchOperationLogs({ pageSize: 10 });
  const visibleTasks = await assetApi.fetchOffboardingTasks({ pageSize: 10 });
  const hiddenDetail = await assetApi.fetchDetail('device', 'device-peer');
  const dashboard = await assetApi.fetchDashboard();

  assert.deepEqual(ids(visibleDevices.data.items), ['device-self']);
  assert.deepEqual(ids(visiblePhones.data.items), ['phone-self']);
  assert.deepEqual(ids(visibleAccounts.data.items), ['account-self']);
  assert.deepEqual(ids(visibleRisks.data.items), ['risk-self']);
  assert.deepEqual(ids(visibleLogs.data.items), ['log-self']);
  assert.deepEqual(ids(visibleTasks.data.items), ['task-self']);
  assert.equal(hiddenDetail.data, null);
  assert.equal(dashboard.data.deviceCount, 1);
  assert.equal(dashboard.data.monthlyCost, 148);
}

seed('user-peer');
{
  const visibleDevices = await assetApi.fetchDevices({ pageSize: 10 });
  const visibleAccounts = await assetApi.fetchInternetAccounts({ pageSize: 10 });
  const visibleRisks = await assetApi.fetchRisks({ pageSize: 10 });
  const visibleTasks = await assetApi.fetchOffboardingTasks({ pageSize: 10 });

  assert.deepEqual(ids(visibleDevices.data.items), ['device-peer', 'device-self']);
  assert.deepEqual(ids(visibleAccounts.data.items), ['account-peer', 'account-self']);
  assert.deepEqual(ids(visibleRisks.data.items), ['risk-peer', 'risk-self']);
  assert.deepEqual(ids(visibleTasks.data.items), ['task-peer', 'task-self']);
}

seed('user-admin');
{
  const visibleDevices = await assetApi.fetchDevices({ pageSize: 10 });
  const visibleAccounts = await assetApi.fetchInternetAccounts({ pageSize: 10 });
  const visibleRisks = await assetApi.fetchRisks({ pageSize: 10 });

  assert.equal(visibleDevices.data.items.length, 3);
  assert.equal(visibleAccounts.data.items.length, 3);
  assert.equal(visibleRisks.data.items.length, 3);
}
