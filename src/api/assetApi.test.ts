import assert from 'node:assert/strict';
import { assetApi } from './assetApi';
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
