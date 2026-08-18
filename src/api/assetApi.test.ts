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

for (const platform of ['Apple ID', 'Google账号', 'LINE', 'Instagram', 'TikTok']) {
  assert.ok(assetApi.getAccountPlatformOptions().includes(platform), `互联网账号平台应包含 ${platform}`);
}

{
  const unassigned = await assetApi.createInternetAccount({
    platform: 'Douyin',
    accountName: 'No Assignee Matrix Account',
    loginAccount: 'matrix_no_assignee',
    ownerSubject: '公司',
    department: 'Market',
    owner: 'Market Owner',
    currentUser: '',
    permissionStatus: '正常',
    accountStatus: '正常',
    riskLevel: '低',
    serviceProvider: 'Self',
    monthlyFee: 0,
    purpose: 'Matrix publishing regression',
  });
  assert.equal(unassigned.code, 0);

  const blocked = await assetApi.createMatrixPublishTask({
    title: 'Launch Video',
    videoUrl: 'https://pan.example.com/video-001',
    copywriting: 'Please publish today',
    remark: 'Matrix publishing',
    dueAt: '2026-07-01T12:00:00.000Z',
    accountIds: [unassigned.data.id],
  });
  assert.notEqual(blocked.code, 0);
  assert.match(blocked.message, /当前使用人|assignee/i);
}

{
  const created = await assetApi.createMatrixPublishTask({
    title: 'July Campaign Video',
    videoUrl: 'https://pan.example.com/video-002',
    copywriting: '统一发布文案',
    remark: '逾期账号需要标红',
    dueAt: '2026-07-01T12:00:00.000Z',
    accountIds: ['asset-account-001', 'asset-account-003'],
  });
  assert.equal(created.code, 0);
  assert.equal(created.data.targets.length, 2);
  assert.deepEqual(
    created.data.targets.map((target) => target.accountId).sort(),
    ['asset-account-001', 'asset-account-003'],
  );
  assert.ok(created.data.targets.every((target) => target.assignee));

  const listed = await assetApi.fetchMatrixPublishTasks({ search: 'July Campaign', pageSize: 20 });
  assert.equal(listed.code, 0);
  assert.equal(listed.data.items.length, 1);
  assert.equal(listed.data.items[0].targets.length, 2);

  const statsBefore = await assetApi.fetchMatrixPublishStats('2026-07-02T00:00:00.000Z');
  assert.equal(statsBefore.code, 0);
  assert.equal(statsBefore.data.totalTargets, 2);
  assert.equal(statsBefore.data.completedTargets, 0);
  assert.equal(statsBefore.data.overdueTargets, 2);
  assert.equal(statsBefore.data.overdueAccounts.length, 2);

  const completed = await assetApi.completeMatrixPublishTarget(created.data.id, 'asset-account-001');
  assert.equal(completed.code, 0);
  assert.equal(completed.data?.status, 'completed');

  const statsAfter = await assetApi.fetchMatrixPublishStats('2026-07-02T00:00:00.000Z');
  assert.equal(statsAfter.code, 0);
  assert.equal(statsAfter.data.totalTargets, 2);
  assert.equal(statsAfter.data.completedTargets, 1);
  assert.equal(statsAfter.data.overdueTargets, 1);
  assert.deepEqual(statsAfter.data.overdueAccounts.map((item) => item.accountId), ['asset-account-003']);
}

{
  const created = await assetApi.createDevice({
    deviceName: '测试资产机',
    brandModel: 'iPhone Test',
    imei1: 'TEST-IMEI-0001',
    imei2: 'TEST-IMEI-0002',
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
  assert.equal(created.data.imei1, 'TEST-IMEI-0001');
  assert.equal(created.data.imei2, 'TEST-IMEI-0002');

  const duplicate = await assetApi.createDevice({
    deviceName: '重复设备',
    brandModel: 'iPhone Test',
    imei1: 'TEST-IMEI-0002',
    simType: '单卡',
  });
  assert.notEqual(duplicate.code, 0);
  assert.match(duplicate.message, /IMEI 1已存在/);

  const missingSecond = await assetApi.createDevice({
    deviceName: '缺少第二IMEI设备',
    brandModel: 'iPhone Test',
    imei1: 'TEST-IMEI-MISSING-2',
    simType: '双卡',
  });
  assert.notEqual(missingSecond.code, 0);
  assert.match(missingSecond.message, /IMEI 2不能为空/);

  const searchedBySecondImei = await assetApi.fetchDevices({ search: '0002', pageSize: 20 });
  assert.ok(searchedBySecondImei.data.items.some((item) => item.id === created.data.id));

  const revealedImei2 = await assetApi.revealSensitiveField('device', created.data.id, 'imei2');
  assert.equal(revealedImei2.code, 0);
  assert.equal(revealedImei2.data.value, 'TEST-IMEI-0002');
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
    imei1: 'SINGLE-SIM-IMEI-0001',
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
    imei1: 'DUAL-SIM-IMEI-0001',
    imei2: 'DUAL-SIM-IMEI-0002',
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
  const realNameDevice = await assetApi.createDevice({
    deviceName: '实名测试设备',
    brandModel: 'Real Name Test',
    imei1: 'REAL-NAME-IMEI-0001',
    imei2: 'REAL-NAME-IMEI-0002',
    simType: '双卡',
    ownerSubject: '公司',
    department: '运营管理部',
    owner: '测试员',
    currentUser: '测试员',
    status: '使用中',
    riskLevel: '低',
    monthlyCost: 0,
  });
  assert.equal(realNameDevice.code, 0);

  const realNamePhone = await assetApi.createPhoneNumber({
    phoneNumber: '13900006661',
    realName: '欧阳娜娜',
    operator: '移动',
    deviceId: realNameDevice.data.id,
    slotType: '卡槽1',
    packageName: '实名测试套餐',
    monthlyFee: 39,
    owner: '测试员',
    status: '使用中',
  });
  assert.equal(realNamePhone.code, 0);
  assert.equal(realNamePhone.data.realNameMasked, '欧*娜娜');

  const realNameAccount = await assetApi.createInternetAccount({
    platform: '实名测试平台',
    accountName: '实名测试账号',
    loginAccount: 'real_name_account',
    realName: '张三',
    phoneId: realNamePhone.data.id,
    ownerSubject: '公司',
    department: '运营管理部',
    owner: '测试员',
    currentUser: '测试员',
    permissionStatus: '正常',
    accountStatus: '正常',
    riskLevel: '低',
    serviceProvider: '测试服务商',
    monthlyFee: 0,
    purpose: '实名脱敏测试',
  });
  assert.equal(realNameAccount.code, 0);
  assert.equal(realNameAccount.data.realNameMasked, '张*');

  const revealedPhoneName = await assetApi.revealSensitiveField('phone', realNamePhone.data.id, 'phoneRealName');
  assert.equal(revealedPhoneName.code, 0);
  assert.equal(revealedPhoneName.data.value, '欧阳娜娜');

  const revealedAccountName = await assetApi.revealSensitiveField('account', realNameAccount.data.id, 'accountRealName');
  assert.equal(revealedAccountName.code, 0);
  assert.equal(revealedAccountName.data.value, '张三');
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
  const device = await assetApi.createDevice({
    deviceName: 'Delete Phone Device',
    brandModel: 'iPhone Delete Phone',
    imei1: 'DELETE-PHONE-IMEI-0001',
    imei2: 'DELETE-PHONE-IMEI-0002',
    simType: '双卡',
    ownerSubject: '公司',
    department: 'Ops',
    owner: 'Asset Tester',
    currentUser: 'Asset Tester',
    status: '使用中',
    riskLevel: '低',
    monthlyCost: 0,
  });
  assert.equal(device.code, 0);

  const phone = await assetApi.createPhoneNumber({
    phoneNumber: '13900004441',
    operator: '移动',
    deviceId: device.data.id,
    slotType: '卡槽1',
    packageName: 'Delete Phone Plan',
    monthlyFee: 39,
    owner: 'Asset Tester',
    status: '使用中',
  });
  assert.equal(phone.code, 0);

  const account = await assetApi.createInternetAccount({
    platform: 'Delete Phone Platform',
    accountName: 'Delete Phone Account',
    loginAccount: 'delete_phone_account',
    phoneId: phone.data.id,
    ownerSubject: '公司',
    department: 'Ops',
    owner: 'Asset Tester',
    currentUser: 'Asset Tester',
    permissionStatus: '正常',
    accountStatus: '正常',
    riskLevel: '低',
    serviceProvider: 'Self',
    monthlyFee: 0,
    purpose: 'Delete phone regression',
  });
  assert.equal(account.code, 0);

  const deleted = await assetApi.deletePhoneNumber(phone.data.id);
  assert.equal(deleted.code, 0);

  const listedPhones = await assetApi.fetchPhoneNumbers({ search: '13900004441', pageSize: 20 });
  assert.equal(listedPhones.data.items.length, 0);

  const listedAccounts = await assetApi.fetchInternetAccounts({ search: 'Delete Phone Account', pageSize: 20 });
  assert.equal(listedAccounts.data.items.length, 1);
  assert.equal(listedAccounts.data.items[0].phoneId, undefined);

  const logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSET_OPERATION_LOGS) || '[]') as AssetOperationLog[];
  assert.ok(logs.some((log) => log.targetId === phone.data.id && log.action === '删除资产'));
}

{
  const device = await assetApi.createDevice({
    deviceName: 'Delete Device Cascade',
    brandModel: 'iPhone Delete Device',
    imei1: 'DELETE-DEVICE-IMEI-0001',
    imei2: 'DELETE-DEVICE-IMEI-0002',
    simType: '双卡',
    ownerSubject: '公司',
    department: 'Ops',
    owner: 'Asset Tester',
    currentUser: 'Asset Tester',
    status: '使用中',
    riskLevel: '低',
    monthlyCost: 0,
  });
  assert.equal(device.code, 0);

  const phone = await assetApi.createPhoneNumber({
    phoneNumber: '13900004442',
    operator: '移动',
    deviceId: device.data.id,
    slotType: '卡槽1',
    packageName: 'Delete Device Plan',
    monthlyFee: 39,
    owner: 'Asset Tester',
    status: '使用中',
  });
  assert.equal(phone.code, 0);

  const account = await assetApi.createInternetAccount({
    platform: 'Delete Device Platform',
    accountName: 'Delete Device Account',
    loginAccount: 'delete_device_account',
    phoneId: phone.data.id,
    ownerSubject: '公司',
    department: 'Ops',
    owner: 'Asset Tester',
    currentUser: 'Asset Tester',
    permissionStatus: '正常',
    accountStatus: '正常',
    riskLevel: '低',
    serviceProvider: 'Self',
    monthlyFee: 0,
    purpose: 'Delete device regression',
  });
  assert.equal(account.code, 0);

  const deleted = await assetApi.deleteDevice(device.data.id);
  assert.equal(deleted.code, 0);

  const listedDevices = await assetApi.fetchDevices({ search: 'Delete Device Cascade', pageSize: 20 });
  assert.equal(listedDevices.data.items.length, 0);

  const listedPhones = await assetApi.fetchPhoneNumbers({ search: '13900004442', pageSize: 20 });
  assert.equal(listedPhones.data.items.length, 0);

  const listedAccounts = await assetApi.fetchInternetAccounts({ search: 'Delete Device Account', pageSize: 20 });
  assert.equal(listedAccounts.data.items.length, 1);
  assert.equal(listedAccounts.data.items[0].phoneId, undefined);

  const logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSET_OPERATION_LOGS) || '[]') as AssetOperationLog[];
  assert.ok(logs.some((log) => log.targetId === device.data.id && log.action === '删除资产'));
}

{
  const account = await assetApi.createInternetAccount({
    platform: 'Delete Account Platform',
    accountName: 'Delete Account Only',
    loginAccount: 'delete_account_only',
    ownerSubject: '公司',
    department: 'Ops',
    owner: 'Asset Tester',
    currentUser: 'Asset Tester',
    permissionStatus: '正常',
    accountStatus: '正常',
    riskLevel: '低',
    serviceProvider: 'Self',
    monthlyFee: 0,
    purpose: 'Delete account regression',
  });
  assert.equal(account.code, 0);

  const deleted = await assetApi.deleteInternetAccount(account.data.id);
  assert.equal(deleted.code, 0);

  const listedAccounts = await assetApi.fetchInternetAccounts({ search: 'Delete Account Only', pageSize: 20 });
  assert.equal(listedAccounts.data.items.length, 0);

  const logs = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSET_OPERATION_LOGS) || '[]') as AssetOperationLog[];
  assert.ok(logs.some((log) => log.targetId === account.data.id && log.action === '删除资产'));
}

{
  const template = assetApi.getImportTemplateCsv('devices');
  assert.match(template.split('\n')[0], /^设备类型\*,设备名称\*,品牌\*,型号\*,序列号,通信方式\*/);

  const imported = await assetApi.importAssetsFromCsv('devices', [
    '设备名称*,品牌型号*,IMEI 1*,IMEI 2,SIM类型,所属主体,所属部门,负责人,当前使用人,状态,风险等级,月费用,备注',
    '导入测试设备,iPhone Import,IMPORT-IMEI-0001,IMPORT-IMEI-0002,双卡,公司,运营管理部,测试员,测试员,使用中,低,0,首批导入',
    '缺少第二IMEI设备,iPhone Import,IMPORT-IMEI-0003,,双卡,公司,运营管理部,测试员,测试员,使用中,低,0,缺少 IMEI 2',
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

  const legacyImported = await assetApi.importAssetsFromCsv('devices', [
    '设备名称*,品牌型号*,IMEI*,SIM类型,所属主体',
    '旧模板单卡设备,Legacy Phone,LEGACY-IMPORT-IMEI-0001,单卡,公司',
  ].join('\n'));
  assert.equal(legacyImported.code, 0);
  assert.equal(legacyImported.data.successCount, 1);
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
    '平台*,账号名称*,登录账号*,实名信息,绑定手机号,绑定邮箱,所属主体,所属部门,负责人,当前使用人,权限状态,账号状态,用途',
    '导入平台,导入绑定账号,import_account_001,张三,13900002222,import@example.com,公司,运营管理部,测试员,测试员,正常,正常,导入测试',
    '导入平台,未知手机号账号,import_account_002,李四,13999999999,import2@example.com,公司,运营管理部,测试员,测试员,正常,正常,导入测试',
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
    imei1: 'OFFBOARD-IMEI-0001',
    imei2: 'OFFBOARD-IMEI-0002',
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

{
  const device = await assetApi.createDevice({
    deviceName: '无SIM摄影机',
    deviceCategory: '摄影设备',
    brand: 'Sony',
    model: 'FX3',
    communicationType: '无SIM',
    acquisitionType: '购买',
    purchaseAmount: 20_000,
    ownerSubject: '公司',
    status: '库存中',
  });
  assert.equal(device.code, 0);
  assert.equal(device.data.brand, 'Sony');
  assert.equal(device.data.model, 'FX3');
  assert.equal(device.data.communicationType, '无SIM');
  assert.equal(device.data.imei1, '');
  const updated = await assetApi.updateDevice(device.data.id, {
    serialNumber: 'FX3-SN-001',
    acquisitionType: '租赁',
    monthlyRent: 880,
    monthlyCost: 0,
  });
  assert.equal(updated.code, 0);
  assert.equal(updated.data.serialNumber, 'FX3-SN-001');
  assert.equal(updated.data.monthlyRent, 880);
  assert.equal(updated.data.monthlyCost, 880);
  const purchased = await assetApi.updateDevice(device.data.id, {
    acquisitionType: '购买',
    monthlyRent: 880,
    monthlyCost: 880,
  });
  assert.equal(purchased.data.monthlyRent, 0);
  assert.equal(purchased.data.monthlyCost, 0);
}

{
  const phone = await assetApi.createPhoneNumber({
    phoneNumber: '13900009999',
    simForm: 'eSIM',
    iccid: '89860012345678901234',
    imsi: '460001234567890',
    servicePassword: '123456',
    ownerSubject: '公司',
    packageName: '备用套餐',
    monthlyFee: 0,
    owner: '测试员',
    status: '待启用',
  });
  assert.equal(phone.code, 0);
  assert.equal(phone.data.deviceId, undefined);
  assert.equal(phone.data.slotType, undefined);
  assert.match(phone.data.iccidMasked || '', /\*/);
  assert.match(phone.data.imsiMasked || '', /\*/);
  assert.match((phone.data as any).servicePasswordMasked || '', /[*•]/);
  assert.equal((phone.data as any).servicePassword, undefined);
  const revealedServicePassword = await assetApi.revealSensitiveField('phone', phone.data.id, 'servicePassword' as any);
  assert.equal(revealedServicePassword.code, 0);
  assert.equal(revealedServicePassword.data.value, '123456');
  const updated = await assetApi.updatePhoneNumber(phone.data.id, {
    simForm: '实体SIM',
    iccid: '89860099999999999999',
    contractExpiresAt: '2027-08-18',
    remark: '已更换SIM',
    servicePassword: '',
  });
  assert.equal(updated.code, 0);
  assert.equal(updated.data.iccid, '89860099999999999999');
  assert.equal(updated.data.contractExpiresAt, '2027-08-18');
  assert.equal(updated.data.remark, '已更换SIM');
  assert.equal((updated.data as any).servicePassword, undefined);
  const preservedServicePassword = await assetApi.revealSensitiveField('phone', phone.data.id, 'servicePassword' as any);
  assert.equal(preservedServicePassword.data.value, '123456');
  const cleared = await assetApi.updatePhoneNumber(phone.data.id, { clearServicePassword: true });
  assert.equal(cleared.code, 0);
  assert.equal((cleared.data as any).servicePassword, undefined);
  assert.equal((cleared.data as any).servicePasswordMasked, undefined);
  const clearedReveal = await assetApi.revealSensitiveField('phone', phone.data.id, 'servicePassword' as any);
  assert.notEqual(clearedReveal.code, 0);
}

{
  const account = await assetApi.createInternetAccount({
    platform: '小红书',
    accountCategory: '直播号',
    accountName: '待回收账号',
    loginAccount: 'pending_recycle_account',
    ownerSubject: '公司',
    controlStatus: '离职待回收',
    accountStatus: '闲置',
    monthlyFee: 0,
  });
  assert.equal(account.code, 0);
  assert.equal(account.data.controlStatus, '离职待回收');
  const tasks = await assetApi.fetchOffboardingTasks({ search: '待回收账号', pageSize: 20 });
  assert.ok(tasks.data.items.some((task) => task.assetId === account.data.id));
}
