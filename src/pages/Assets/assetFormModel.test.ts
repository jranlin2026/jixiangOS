import assert from 'node:assert/strict';
import {
  ASSET_FORM_SECTIONS,
  createAssetFormDefaults,
} from './assetFormModel';

assert.deepEqual(ASSET_FORM_SECTIONS.device.map((section) => section.title), [
  '设备信息', '硬件与通信标识', '归属与使用', '状态与成本',
]);
assert.deepEqual(ASSET_FORM_SECTIONS.phone.map((section) => section.title), [
  '号码与SIM', '设备绑定', '归属与使用', '套餐与状态',
]);
assert.deepEqual(ASSET_FORM_SECTIONS.account.map((section) => section.title), [
  '平台与账号', '安全与绑定', '归属与使用', '经营与状态',
]);

const device = createAssetFormDefaults('device');
assert.equal(device.communicationType, '无SIM');
assert.equal(device.deviceCategory, '手机');
assert.equal(device.status, '库存中');

const phone = createAssetFormDefaults('phone');
assert.equal(phone.deviceId, '');
assert.equal(phone.slotType, '');
assert.equal(phone.status, '待启用');

const account = createAssetFormDefaults('account');
assert.equal(account.controlStatus, '已掌控');
assert.equal(account.accountStatus, '使用中');
