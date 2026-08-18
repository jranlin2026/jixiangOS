import assert from 'node:assert/strict';
import {
  formatDeviceBrandModel,
  hasDuplicateDeviceBrandModel,
  normalizeAssetAccount,
  normalizeAssetDevice,
  normalizeAssetPhone,
  readAccountControlStatus,
  readDeviceCommunicationType,
} from './assetFields';

const legacyDevice = normalizeAssetDevice({
  id: 'device-legacy',
  deviceCode: 'DEV-0001',
  deviceName: '荣耀30-01',
  brandModel: 'HONOR 30 Pro',
  simType: '双卡',
  imei1: '111',
  imei1Masked: '***111',
  imei2: '222',
  imei2Masked: '***222',
  ownerSubject: '公司',
  department: '',
  owner: '',
  currentUser: '',
  status: '正常',
  riskLevel: '低',
  monthlyCost: 199,
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});

assert.equal(legacyDevice.deviceCategory, '手机');
assert.equal(legacyDevice.brand, '荣耀');
assert.equal(legacyDevice.model, '30 Pro');
assert.equal(legacyDevice.communicationType, '双卡');
assert.equal(legacyDevice.acquisitionType, '租赁');
assert.equal(legacyDevice.monthlyRent, 199);
assert.equal(legacyDevice.status, '库存中');
assert.equal(readDeviceCommunicationType({ simType: '单卡' }), '单卡');

const normalizedHonorDevice = normalizeAssetDevice({
  brand: '荣耀 HONOR',
  model: '  HONOR   30 Pro  ',
  brandModel: '荣耀 HONOR HONOR 30 Pro',
});
assert.equal(normalizedHonorDevice.brand, '荣耀');
assert.equal(normalizedHonorDevice.model, 'HONOR 30 Pro');
assert.equal(normalizedHonorDevice.brandModel, '荣耀 HONOR 30 Pro');
assert.equal(formatDeviceBrandModel(normalizedHonorDevice), '荣耀 / HONOR 30 Pro');
assert.equal(hasDuplicateDeviceBrandModel('荣耀', 'HONOR'), true);
assert.equal(hasDuplicateDeviceBrandModel('荣耀', 'HONOR 30 Pro'), false);
assert.equal(normalizeAssetDevice({ brand: 'Samsung', model: 'Galaxy S24' }).brand, '三星');
assert.equal(normalizeAssetDevice({ brand: 'iPhone', model: '15 Pro' }).brand, '苹果');

const unboundPhone = normalizeAssetPhone({
  id: 'phone-legacy',
  phoneNumber: '13800000000',
  phoneNumberMasked: '138****0000',
  operator: '移动',
  deviceId: '',
  slotType: '卡槽1',
  packageName: '',
  monthlyFee: 0,
  owner: '',
  status: '闲置',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});

assert.equal(unboundPhone.simForm, '实体SIM');
assert.equal(unboundPhone.ownerSubject, '公司');
assert.equal(unboundPhone.deviceId, undefined);
assert.equal(unboundPhone.slotType, undefined);
assert.equal(unboundPhone.status, '待启用');

const legacyAccount = normalizeAssetAccount({
  id: 'account-legacy',
  accountNo: 'A-0001',
  platform: '抖音',
  accountName: '主播号',
  loginAccount: 'anchor',
  loginAccountMasked: 'anchor***',
  ownerSubject: '公司',
  department: '',
  owner: '',
  currentUser: '',
  permissionStatus: '正常',
  accountStatus: '正常',
  riskLevel: '低',
  serviceProvider: '',
  monthlyFee: 0,
  purpose: '',
  loginPassword: 'legacy-plaintext-must-be-removed',
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
});

assert.equal(legacyAccount.accountCategory, '主账号');
assert.equal(legacyAccount.controlStatus, '已掌控');
assert.equal(legacyAccount.accountStatus, '使用中');
assert.equal(legacyAccount.loginMethod, '密码登录');
assert.equal(legacyAccount.loginCredentialStatus, '待补齐');
assert.equal(legacyAccount.paymentCredentialStatus, '不适用');
assert.equal('loginPassword' in legacyAccount, false);
assert.equal(readAccountControlStatus({ permissionStatus: '离职待回收' }), '离职待回收');
