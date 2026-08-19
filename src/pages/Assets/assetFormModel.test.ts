import assert from 'node:assert/strict';
import {
  ASSET_FORM_SECTIONS,
  buildDeviceSlotRows,
  createAssetFormDefaults,
  formatPhoneSlotImeiLabel,
} from './assetFormModel';

assert.deepEqual(ASSET_FORM_SECTIONS.device.map((section) => section.title), [
  '设备信息', '硬件与通信标识', '归属与使用', '状态与成本',
]);
assert.deepEqual(ASSET_FORM_SECTIONS.phone.map((section) => section.title), [
  '号码与SIM', '设备绑定', '归属与使用', '套餐与状态',
]);
assert.deepEqual(ASSET_FORM_SECTIONS.account.map((section) => section.title), [
  '平台与账号', '登录与安全', '归属与使用', '经营与状态',
]);

const device = createAssetFormDefaults('device');
assert.equal(device.communicationType, '无SIM');
assert.equal(device.deviceCategory, '手机');
assert.equal(device.status, '库存中');

const phone = createAssetFormDefaults('phone');
assert.equal(phone.deviceId, '');
assert.equal(phone.slotType, '');
assert.equal(phone.status, '待启用');

const dualSimDevice = {
  imei1: '111111111111111',
  imei1Masked: '111111******1111',
  imei2: '222222222222222',
  imei2Masked: '222222******2222',
};
assert.equal(formatPhoneSlotImeiLabel('卡槽1', dualSimDevice), '卡槽1（IMEI 1：111111111111111）');
assert.equal(formatPhoneSlotImeiLabel('卡槽2', dualSimDevice), '卡槽2（IMEI 2：222222222222222）');

assert.deepEqual(buildDeviceSlotRows({
  communicationType: '双卡',
  simType: '双卡',
  imei1: '111111111111111',
  imei1Masked: '111111******1111',
  imei2: '222222222222222',
  imei2Masked: '222222******2222',
}, [{ id: 'phone-1', slotType: '卡槽1', phoneNumber: '13800000001', phoneNumberMasked: '138****0001' }]), [
  { slotType: '卡槽1', imeiLabel: 'IMEI 1', imeiDisplay: '111111111111111', phoneId: 'phone-1', phoneNumberDisplay: '13800000001' },
  { slotType: '卡槽2', imeiLabel: 'IMEI 2', imeiDisplay: '222222222222222', phoneId: undefined, phoneNumberDisplay: '' },
]);

const account = createAssetFormDefaults('account');
assert.equal(account.controlStatus, '已掌控');
assert.equal(account.accountStatus, '使用中');
assert.equal(account.appleIdentityAccountId, '');
assert.equal(account.googleIdentityAccountId, '');
