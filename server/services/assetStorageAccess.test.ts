import assert from 'node:assert/strict';
import {
  canReadStorageKey,
  canWriteStorageKey,
  filterAssetStorageData,
  filterRecoveryOrderStorageData,
  filterSingleRecoveryOrderStorageKey,
} from './assetStorageAccess';
import { STORAGE_KEYS } from '../../src/shared/utils/constants';
import { PERMISSION_KEYS, toAuthenticatedUser } from '../../src/shared/utils/permissions';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';

const now = new Date().toISOString();

function role(code: string, permissions: Role['permissions'], assets: 'self' | 'department' | 'all'): Role {
  return {
    id: `role-${code}`,
    name: code,
    code,
    permissions,
    dataScopes: { assets },
    memberCount: 0,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

const salesRole = role('sales_consultant', [{ module: PERMISSION_KEYS.ASSETS_OVERVIEW, actions: ['read'] }], 'self');
const opsRole = role('ops_admin', [
  { module: PERMISSION_KEYS.ASSETS, actions: ['read', 'write'] },
  { module: PERMISSION_KEYS.ASSETS_SENSITIVE_VIEW, actions: ['read'] },
  { module: PERMISSION_KEYS.ASSETS_IMPORT_EXPORT, actions: ['read', 'write'] },
], 'all');

const users: User[] = [
  {
    id: 'user-sales',
    name: '童双全',
    account: 'shuangquan',
    email: 'sales@example.com',
    phone: '',
    role: '销售专员' as User['role'],
    roleId: salesRole.id,
    departmentId: 'dept-sales',
    isActive: true,
    employmentStatus: 'active',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-other',
    name: '其他员工',
    account: 'other',
    email: 'other@example.com',
    phone: '',
    role: '销售专员' as User['role'],
    roleId: salesRole.id,
    departmentId: 'dept-sales',
    isActive: true,
    employmentStatus: 'active',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-ops',
    name: '运营',
    account: 'ops',
    email: 'ops@example.com',
    phone: '',
    role: '运营管理员' as User['role'],
    roleId: opsRole.id,
    departmentId: 'dept-ops',
    isActive: true,
    employmentStatus: 'active',
    createdAt: now,
    updatedAt: now,
  },
];

const salesAuth: AuthenticatedUser = {
  id: 'user-sales',
  name: '童双全',
  account: 'shuangquan',
  email: 'sales@example.com',
  phone: '',
  role: '销售专员' as User['role'],
  roleId: salesRole.id,
  departmentId: 'dept-sales',
  isActive: true,
  permissions: salesRole.permissions,
};

const opsAuth: AuthenticatedUser = {
  id: 'user-ops',
  name: '运营',
  account: 'ops',
  email: 'ops@example.com',
  phone: '',
  role: '运营管理员' as User['role'],
  roleId: opsRole.id,
  departmentId: 'dept-ops',
  isActive: true,
  permissions: opsRole.permissions,
};
const resolvedOpsAuth = toAuthenticatedUser(users[2], [salesRole, opsRole]);
assert.equal(canWriteStorageKey(resolvedOpsAuth, STORAGE_KEYS.ASSET_DEVICES), true);
assert.equal(canWriteStorageKey(resolvedOpsAuth, STORAGE_KEYS.ASSET_PHONE_NUMBERS), true);
assert.equal(canWriteStorageKey(resolvedOpsAuth, STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS), false);
assert.equal(canWriteStorageKey(resolvedOpsAuth, STORAGE_KEYS.ASSET_RISKS), true);
assert.equal(canWriteStorageKey(resolvedOpsAuth, STORAGE_KEYS.ASSET_OPERATION_LOGS), true);
assert.equal(canWriteStorageKey(resolvedOpsAuth, STORAGE_KEYS.ASSET_OFFBOARDING_TASKS), true);
assert.equal(canWriteStorageKey(resolvedOpsAuth, STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS), true);

const matrixPublisherAuth: AuthenticatedUser = {
  ...salesAuth,
  id: 'user-matrix-publisher',
  name: '矩阵发布专员',
  account: 'matrix_publisher',
  permissions: [{ module: PERMISSION_KEYS.ASSETS_MATRIX_PUBLISH, actions: ['read', 'write'] }],
};

assert.equal(canWriteStorageKey(matrixPublisherAuth, STORAGE_KEYS.ASSET_MATRIX_PUBLISH_TASKS), true);
assert.equal(canWriteStorageKey(matrixPublisherAuth, STORAGE_KEYS.ASSET_DEVICES), false);
assert.equal(canWriteStorageKey(matrixPublisherAuth, STORAGE_KEYS.ASSET_PHONE_NUMBERS), false);
assert.equal(canWriteStorageKey(matrixPublisherAuth, STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS), false);
assert.equal(canWriteStorageKey(matrixPublisherAuth, STORAGE_KEYS.ASSET_RISKS), false);
assert.equal(canWriteStorageKey(matrixPublisherAuth, STORAGE_KEYS.ASSET_OPERATION_LOGS), false);
assert.equal(canWriteStorageKey(matrixPublisherAuth, STORAGE_KEYS.ASSET_OFFBOARDING_TASKS), false);

const storageData = {
  [STORAGE_KEYS.ASSET_DEVICES]: [
    {
      id: 'device-self',
      owner: '童双全',
      currentUser: '童双全',
      imei1: 'IMEI-RAW-1',
      imei1Masked: 'IMEI-***-1',
      imei2: 'IMEI-RAW-2',
      imei2Masked: 'IMEI-***-2',
    },
    { id: 'device-other', owner: '其他员工', currentUser: '其他员工', imei: 'OTHER-RAW', imeiMasked: 'OTHER-***' },
  ],
  [STORAGE_KEYS.ASSET_PHONE_NUMBERS]: [
    {
      id: 'phone-self',
      owner: '童双全',
      deviceId: 'device-self',
      phoneNumber: '13800001111',
      phoneNumberMasked: '138****1111',
      realName: '童双全',
      realNameMasked: '童**',
      iccid: '89860012345678901234',
      iccidMasked: '898600**********1234',
      imsi: '460001234567890',
      imsiMasked: '46000******7890',
      servicePassword: '123456',
      servicePasswordMasked: '******',
    },
    { id: 'phone-other', owner: '其他员工', deviceId: 'device-other', phoneNumber: '13900002222', phoneNumberMasked: '139****2222' },
  ],
  [STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS]: [
    {
      id: 'account-self',
      owner: '童双全',
      currentUser: '童双全',
      phoneId: 'phone-self',
      loginDeviceIds: ['device-self', 'device-other'],
      identityAccountIds: ['account-other'],
      loginAccount: 'self_raw',
      loginPassword: 'must-never-leak',
      loginAccountMasked: 'self_***',
      realName: '童双全',
      realNameMasked: '童**',
      boundEmail: 'self@example.com',
      boundEmailMasked: 'se***@example.com',
    },
    {
      id: 'account-other',
      owner: '其他员工',
      currentUser: '其他员工',
      phoneId: 'phone-other',
      loginAccount: 'other_raw',
      loginAccountMasked: 'other_***',
    },
    {
      id: 'account-device-visible',
      owner: '其他员工',
      currentUser: '其他员工',
      loginDeviceIds: ['device-self'],
      loginAccount: 'device_visible_raw',
      loginAccountMasked: 'device_visible_***',
    },
  ],
  [STORAGE_KEYS.ASSET_ACCOUNT_CREDENTIALS]: [{ accountId: 'account-self', ciphertext: 'encrypted-secret' }],
  [STORAGE_KEYS.ASSET_RISKS]: [
    { id: 'risk-self', targetId: 'account-self' },
    { id: 'risk-other', targetId: 'account-other' },
  ],
  [STORAGE_KEYS.ASSET_OPERATION_LOGS]: [
    { id: 'log-self', targetId: 'account-self' },
    { id: 'log-other', targetId: 'account-other' },
  ],
  [STORAGE_KEYS.ASSET_OFFBOARDING_TASKS]: [
    { id: 'task-self', employeeName: '童双全', assetId: 'account-self' },
    { id: 'task-other', employeeName: '其他员工', assetId: 'account-other' },
  ],
};

const salesData = filterAssetStorageData(storageData, salesAuth, { roles: [salesRole, opsRole], users });
assert.deepEqual((salesData[STORAGE_KEYS.ASSET_DEVICES] as any[]).map((item) => item.id), ['device-self']);
assert.equal((salesData[STORAGE_KEYS.ASSET_DEVICES] as any[])[0].imei1, 'IMEI-RAW-1');
assert.equal((salesData[STORAGE_KEYS.ASSET_DEVICES] as any[])[0].imei2, 'IMEI-RAW-2');
assert.equal((salesData[STORAGE_KEYS.ASSET_PHONE_NUMBERS] as any[])[0].phoneNumber, '13800001111');
assert.equal((salesData[STORAGE_KEYS.ASSET_PHONE_NUMBERS] as any[])[0].realName, '童**');
assert.equal((salesData[STORAGE_KEYS.ASSET_PHONE_NUMBERS] as any[])[0].iccid, '89860012345678901234');
assert.equal((salesData[STORAGE_KEYS.ASSET_PHONE_NUMBERS] as any[])[0].imsi, '460001234567890');
assert.equal((salesData[STORAGE_KEYS.ASSET_PHONE_NUMBERS] as any[])[0].servicePassword, undefined);
assert.deepEqual((salesData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[]).map((item) => item.id), ['account-self', 'account-device-visible']);
assert.equal((salesData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[])[0].loginAccount, 'self_raw');
assert.equal((salesData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[])[0].realName, '童**');
assert.equal((salesData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[])[0].boundEmail, 'self@example.com');
assert.equal((salesData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[])[0].loginPassword, undefined);
assert.deepEqual((salesData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[])[0].loginDeviceIds, ['device-self']);
assert.deepEqual((salesData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[])[1].loginDeviceIds, ['device-self']);
assert.deepEqual((salesData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[])[0].identityAccountIds, []);
assert.deepEqual((salesData[STORAGE_KEYS.ASSET_RISKS] as any[]).map((item) => item.id), ['risk-self']);
assert.equal(canWriteStorageKey(salesAuth, STORAGE_KEYS.ASSET_DEVICES), false);

const opsData = filterAssetStorageData(storageData, opsAuth, { roles: [salesRole, opsRole], users });
assert.equal((opsData[STORAGE_KEYS.ASSET_DEVICES] as any[]).length, 2);
assert.equal((opsData[STORAGE_KEYS.ASSET_DEVICES] as any[])[0].imei1, 'IMEI-RAW-1');
assert.equal((opsData[STORAGE_KEYS.ASSET_DEVICES] as any[])[0].imei2, 'IMEI-RAW-2');
assert.equal((opsData[STORAGE_KEYS.ASSET_DEVICES] as any[])[1].imei1, 'OTHER-RAW');
assert.equal((opsData[STORAGE_KEYS.ASSET_PHONE_NUMBERS] as any[])[0].servicePassword, undefined);
assert.equal((opsData[STORAGE_KEYS.ASSET_PHONE_NUMBERS] as any[])[0].realName, '童双全');
assert.equal((opsData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[])[0].realName, '童双全');
assert.equal((opsData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[])[0].loginPassword, undefined);
assert.deepEqual((opsData[STORAGE_KEYS.ASSET_INTERNET_ACCOUNTS] as any[])[0].identityAccountIds, ['account-other']);
assert.equal(STORAGE_KEYS.ASSET_ACCOUNT_CREDENTIALS in opsData, false);
assert.equal(canWriteStorageKey(opsAuth, STORAGE_KEYS.ASSET_DEVICES), true);
assert.equal(canReadStorageKey(opsAuth, STORAGE_KEYS.ASSET_ACCOUNT_CREDENTIALS), false);
assert.equal(canWriteStorageKey(opsAuth, STORAGE_KEYS.ASSET_ACCOUNT_CREDENTIALS), false);

const recoveryStorageData = {
  [STORAGE_KEYS.RECOVERY_ORDERS]: [
    { id: 'recovery-self', createdBy: 'user-sales' },
    { id: 'recovery-other', createdBy: 'user-other' },
  ],
};
const recoveryReadOnlyAuth: AuthenticatedUser = {
  ...salesAuth,
  permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read'] }],
};
const recoveryReviewerAuth: AuthenticatedUser = {
  ...salesAuth,
  permissions: [{ module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read', 'write'] }],
};
const financeRecoveryReviewerAuth: AuthenticatedUser = {
  ...opsAuth,
  permissions: [
    { module: PERMISSION_KEYS.AFTER_SALES_RECOVERY_REVIEW, actions: ['read', 'write'] },
    { module: PERMISSION_KEYS.FINANCE_RECOVERY_SETTLEMENT, actions: ['read', 'write'] },
  ],
};

const readOnlyRecoveryData = filterRecoveryOrderStorageData(recoveryStorageData, recoveryReadOnlyAuth);
assert.deepEqual(
  (readOnlyRecoveryData[STORAGE_KEYS.RECOVERY_ORDERS] as any[]).map((item) => item.id),
  ['recovery-self'],
);
assert.deepEqual(
  (filterSingleRecoveryOrderStorageKey(STORAGE_KEYS.RECOVERY_ORDERS, recoveryStorageData, recoveryReadOnlyAuth) as any[])
    .map((item) => item.id),
  ['recovery-self'],
);
assert.equal(
  (filterRecoveryOrderStorageData(recoveryStorageData, recoveryReviewerAuth)[STORAGE_KEYS.RECOVERY_ORDERS] as any[]).length,
  1,
);
assert.equal(
  (filterRecoveryOrderStorageData(recoveryStorageData, financeRecoveryReviewerAuth)[STORAGE_KEYS.RECOVERY_ORDERS] as any[]).length,
  0,
);
