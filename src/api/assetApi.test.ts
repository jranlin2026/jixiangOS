import assert from 'node:assert/strict';
import { assetApi } from './assetApi';
import { settingsApi } from './settingsApi';
import { AUTH_SESSION_STORAGE_KEY } from '../shared/utils/auth';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { AssetOperationLog, AssetRisk } from '../types/asset';

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

async function resetAssets() {
  storage.clear();
  localStorage.removeItem(STORAGE_KEYS.INITIALIZED);
  await assetApi.fetchDashboard();
  localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({
    userId: 'user-005',
    account: 'admin',
    role: '超级管理员',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }));
}

await resetAssets();

{
  const created = await assetApi.createDevice({
    deviceName: '测试资产机',
    brandModel: 'iPhone Test',
    imei: 'TEST-IMEI-0001',
    simType: '双卡',
    ownerSubject: '公司',
    department: '运营管理部',
    owner: '测试员',
    currentUser: '测试员',
    status: '使用中',
    riskLevel: '低',
    monthlyCost: 0,
  });
  assert.equal(created.code, 0);
  assert.equal(created.data.deviceName, '测试资产机');

  const duplicate = await assetApi.createDevice({
    deviceName: '重复设备',
    brandModel: 'iPhone Test',
    imei: 'TEST-IMEI-0001',
  });
  assert.notEqual(duplicate.code, 0);
  assert.match(duplicate.message, /IMEI已存在/);
}

{
  const conflict = await assetApi.createPhoneNumber({
    phoneNumber: '13900001111',
    operator: '移动',
    deviceId: 'asset-device-001',
    slotType: '卡槽1',
    packageName: '测试套餐',
    monthlyFee: 39,
    owner: '测试员',
    status: '使用中',
  });
  assert.notEqual(conflict.code, 0);
  assert.match(conflict.message, /卡槽已绑定/);
}

{
  const singleCardDevice = await assetApi.createDevice({
    deviceName: '单卡规则设备',
    brandModel: 'Single SIM Test',
    imei: 'SINGLE-SIM-IMEI-0001',
    simType: '单卡',
    ownerSubject: '公司',
    department: '运营管理部',
    owner: '测试员',
    currentUser: '测试员',
    status: '使用中',
    riskLevel: '低',
    monthlyCost: 0,
  });
  assert.equal(singleCardDevice.code, 0);

  const slot2Phone = await assetApi.createPhoneNumber({
    phoneNumber: '13900001112',
    operator: '移动',
    deviceId: singleCardDevice.data.id,
    slotType: '卡槽2',
    packageName: '单卡错误套餐',
    monthlyFee: 39,
    owner: '测试员',
    status: '使用中',
  });
  assert.notEqual(slot2Phone.code, 0);
  assert.match(slot2Phone.message, /单卡设备只能绑定卡槽1/);

  const slot1Phone = await assetApi.createPhoneNumber({
    phoneNumber: '13900001113',
    operator: '移动',
    deviceId: singleCardDevice.data.id,
    slotType: '卡槽1',
    packageName: '单卡正确套餐',
    monthlyFee: 39,
    owner: '测试员',
    status: '使用中',
  });
  assert.equal(slot1Phone.code, 0);

  const secondPhone = await assetApi.createPhoneNumber({
    phoneNumber: '13900001114',
    operator: '移动',
    deviceId: singleCardDevice.data.id,
    slotType: '卡槽1',
    packageName: '单卡重复套餐',
    monthlyFee: 39,
    owner: '测试员',
    status: '使用中',
  });
  assert.notEqual(secondPhone.code, 0);
  assert.match(secondPhone.message, /卡槽已绑定|单卡设备最多绑定1个手机号/);
}

{
  const dualCardDevice = await assetApi.createDevice({
    deviceName: '双卡改单卡规则设备',
    brandModel: 'Dual SIM Test',
    imei: 'DUAL-SIM-IMEI-0001',
    simType: '双卡',
    ownerSubject: '公司',
    department: '运营管理部',
    owner: '测试员',
    currentUser: '测试员',
    status: '使用中',
    riskLevel: '低',
    monthlyCost: 0,
  });
  assert.equal(dualCardDevice.code, 0);

  const slot2Phone = await assetApi.createPhoneNumber({
    phoneNumber: '13900001115',
    operator: '移动',
    deviceId: dualCardDevice.data.id,
    slotType: '卡槽2',
    packageName: '双卡套餐',
    monthlyFee: 39,
    owner: '测试员',
    status: '使用中',
  });
  assert.equal(slot2Phone.code, 0);

  const downgrade = await assetApi.updateDevice(dualCardDevice.data.id, { simType: '单卡' });
  assert.notEqual(downgrade.code, 0);
  assert.match(downgrade.message, /不能保留卡槽2手机号/);
}

{
  const account = await assetApi.createInternetAccount({
    platform: '测试平台',
    accountName: '未绑定账号',
    loginAccount: 'unbound_account',
    ownerSubject: '公司',
    department: '运营管理部',
    owner: '测试员',
    currentUser: '测试员',
    permissionStatus: '正常',
    accountStatus: '正常',
    riskLevel: '低',
    serviceProvider: '测试服务商',
    monthlyFee: 0,
    purpose: '测试',
  });
  assert.equal(account.code, 0);

  const risks = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSET_RISKS) || '[]') as AssetRisk[];
  assert.ok(risks.some((risk) => risk.riskKey === `account-unbound-phone-${account.data.id}`));

  const updated = await assetApi.updateInternetAccount(account.data.id, { phoneId: 'asset-phone-001' });
  assert.equal(updated.code, 0);
  assert.equal(updated.data.phoneId, 'asset-phone-001');

  const nextRisks = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSET_RISKS) || '[]') as AssetRisk[];
  assert.equal(nextRisks.some((risk) => risk.riskKey === `account-unbound-phone-${account.data.id}`), false);

  const logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSET_OPERATION_LOGS) || '[]') as AssetOperationLog[];
  assert.ok(logs.some((log) => log.targetId === account.data.id && log.action === '绑定资产'));
}

{
  const revealed = await assetApi.revealSensitiveField('phone', 'asset-phone-001', 'phoneNumber');
  assert.equal(revealed.code, 0);
  assert.equal(revealed.data.value, '13890566721');

  const logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSET_OPERATION_LOGS) || '[]') as AssetOperationLog[];
  assert.ok(logs.some((log) => (
    log.targetId === 'asset-phone-001'
    && log.action === '查看敏感字段'
    && log.detail.includes('完整手机号')
  )));
}

{
  const imported = await assetApi.importAssetsFromCsv('devices', [
    '设备名称*,品牌型号*,IMEI*,SIM类型,所属主体,所属部门,负责人,当前使用人,状态,风险等级,月费用,备注',
    '导入测试设备,iPhone Import,IMPORT-IMEI-0001,双卡,公司,运营管理部,测试员,测试员,使用中,低,0,首批导入',
    '重复导入设备,iPhone Import,IMPORT-IMEI-0001,双卡,公司,运营管理部,测试员,测试员,使用中,低,0,重复 IMEI',
  ].join('\n'));

  assert.equal(imported.code, 0);
  assert.equal(imported.data.totalRows, 2);
  assert.equal(imported.data.successCount, 1);
  assert.equal(imported.data.failedCount, 1);
  assert.equal(imported.data.createdIds.length, 1);
  assert.equal(imported.data.failedRows[0].rowNumber, 3);
  assert.match(imported.data.failedRows[0].reason, /IMEI/);

  const listed = await assetApi.fetchDevices({ search: '导入测试设备', pageSize: 20 });
  assert.equal(listed.code, 0);
  assert.equal(listed.data.items.length, 1);
}

{
  const imported = await assetApi.importAssetsFromCsv('phones', [
    '手机号*,运营商,所属设备编号*,SIM卡槽,套餐,月费用,负责人,状态',
    '13900002222,移动,DEV-011,卡槽2,导入套餐,59,测试员,使用中',
    '13900003333,移动,DEV-NOT-FOUND,卡槽1,导入套餐,59,测试员,使用中',
  ].join('\n'));

  assert.equal(imported.code, 0);
  assert.equal(imported.data.totalRows, 2);
  assert.equal(imported.data.successCount, 1);
  assert.equal(imported.data.failedCount, 1);
  assert.match(imported.data.failedRows[0].reason, /设备不存在/);

  const listed = await assetApi.fetchPhoneNumbers({ search: '13900002222', pageSize: 20 });
  assert.equal(listed.code, 0);
  assert.equal(listed.data.items.length, 1);
  assert.equal(listed.data.items[0].deviceId, 'asset-device-003');
  assert.equal(listed.data.items[0].slotType, '卡槽2');
}

{
  const imported = await assetApi.importAssetsFromCsv('accounts', [
    '平台*,账号名称*,登录账号*,绑定手机号,绑定邮箱,所属主体,所属部门,负责人,当前使用人,权限状态,账号状态,风险等级,服务商,月费用,到期时间,用途',
    '导入平台,导入绑定账号,import_account_001,13900002222,import@example.com,公司,运营管理部,测试员,测试员,正常,正常,低,自营,0,,导入测试',
    '导入平台,未知手机号账号,import_account_002,13999999999,import2@example.com,公司,运营管理部,测试员,测试员,正常,正常,低,自营,0,,导入测试',
  ].join('\n'));

  assert.equal(imported.code, 0);
  assert.equal(imported.data.totalRows, 2);
  assert.equal(imported.data.successCount, 1);
  assert.equal(imported.data.failedCount, 1);
  assert.match(imported.data.failedRows[0].reason, /绑定手机号不存在/);

  const phone = await assetApi.fetchPhoneNumbers({ search: '13900002222', pageSize: 20 });
  const account = await assetApi.fetchInternetAccounts({ search: '导入绑定账号', pageSize: 20 });
  assert.equal(phone.code, 0);
  assert.equal(account.code, 0);
  assert.equal(account.data.items.length, 1);
  assert.equal(account.data.items[0].phoneId, phone.data.items[0].id);
}

{
  const user = await settingsApi.createUser({
    name: '资产离职员工',
    account: 'asset_leave_user',
    email: 'asset_leave_user@example.com',
    phone: '13900008888',
    role: '运营管理员',
    roleId: 'role-ops-admin',
    departmentId: 'dept-ops',
    positionId: 'pos-ops-admin',
    positionName: '运营管理员',
    isActive: true,
    password: '1234567',
  });
  assert.equal(user.code, 0);
  assert.ok(user.data);

  const device = await assetApi.createDevice({
    deviceName: '离职回收设备',
    brandModel: 'iPhone Offboard',
    imei: 'OFFBOARD-IMEI-0001',
    simType: '双卡',
    ownerSubject: '公司',
    department: '运营管理部',
    owner: '资产离职员工',
    currentUser: '资产离职员工',
    status: '使用中',
    riskLevel: '低',
    monthlyCost: 0,
  });
  assert.equal(device.code, 0);

  const phone = await assetApi.createPhoneNumber({
    phoneNumber: '13900008889',
    operator: '移动',
    deviceId: device.data.id,
    slotType: '卡槽1',
    packageName: '离职测试套餐',
    monthlyFee: 39,
    owner: '资产离职员工',
    status: '使用中',
  });
  assert.equal(phone.code, 0);

  const account = await assetApi.createInternetAccount({
    platform: '离职测试平台',
    accountName: '离职测试账号',
    loginAccount: 'asset_leave_account',
    phoneId: phone.data.id,
    ownerSubject: '公司',
    department: '运营管理部',
    owner: '资产离职员工',
    currentUser: '资产离职员工',
    permissionStatus: '正常',
    accountStatus: '正常',
    riskLevel: '低',
    serviceProvider: '自营',
    monthlyFee: 0,
    purpose: '离职回收测试',
  });
  assert.equal(account.code, 0);

  const leave = await settingsApi.leaveUser(user.data.id);
  assert.equal(leave.code, 0);

  const tasks = await assetApi.fetchOffboardingTasks({ search: '资产离职员工', pageSize: 20 });
  assert.equal(tasks.code, 0);
  assert.equal(tasks.data.items.length, 3);
  assert.deepEqual(new Set(tasks.data.items.map((task) => task.assetType)), new Set(['设备资产', '手机号资产', '互联网账号']));

  const accountAfterLeave = await assetApi.fetchInternetAccounts({ search: '离职测试账号', pageSize: 20 });
  assert.equal(accountAfterLeave.data.items[0].permissionStatus, '离职待回收');

  const accountTask = tasks.data.items.find((task) => task.assetType === '互联网账号');
  assert.ok(accountTask);
  const completed = await assetApi.completeOffboardingTask(accountTask.id);
  assert.equal(completed.code, 0);
  assert.equal(completed.data?.status, '已回收');

  const accountAfterComplete = await assetApi.fetchInternetAccounts({ search: '离职测试账号', pageSize: 20 });
  assert.equal(accountAfterComplete.data.items[0].permissionStatus, '已回收');
}
