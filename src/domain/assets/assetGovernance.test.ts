import assert from 'node:assert/strict';
import type { AssetDevice, AssetInternetAccount, AssetPhoneNumber } from '../../types/asset';
import {
  buildAssetHandoverCase,
  canCompleteAssetHandoverCase,
  groupAssetHandoverTasks,
  isMatrixTargetDone,
  responsibilityLabelForAsset,
  usageLabelForAsset,
} from './assetGovernance';

const employee = { id: 'user-1', name: '执行员工', departmentId: 'dept-1', department: '运营部' };
const device = {
  id: 'device-1', deviceCode: 'DEV-0001', deviceName: '直播机', ownerId: employee.id,
  owner: employee.name, currentUserId: employee.id, currentUser: employee.name,
} as AssetDevice;
const phone = {
  id: 'phone-1', phoneNumber: '13800000000', ownerId: employee.id, owner: employee.name,
  currentUserId: 'user-2', currentUser: '其他员工',
} as AssetPhoneNumber;
const account = {
  id: 'account-1', accountNo: 'A-0001', platform: '抖音', accountName: '直播账号',
  ownerId: employee.id, owner: employee.name, currentUserId: employee.id, currentUser: employee.name,
} as AssetInternetAccount;

assert.equal(responsibilityLabelForAsset('device'), '管理责任人');
assert.equal(responsibilityLabelForAsset('phone'), '管理责任人');
assert.equal(responsibilityLabelForAsset('account'), '账号负责人');
assert.equal(usageLabelForAsset('device'), '当前使用人');
assert.equal(usageLabelForAsset('phone'), '当前使用人');
assert.equal(usageLabelForAsset('account'), '主要使用人');

const handover = buildAssetHandoverCase({
  employee,
  reason: '离职',
  dueAt: '2026-08-31',
  devices: [device],
  phones: [phone],
  accounts: [account],
  id: 'handover-1',
  createdAt: '2026-08-20T10:00:00.000Z',
});

assert.equal(handover.items.length, 3, '同一资产同时由员工管理和使用时只能生成一个交接项');
assert.deepEqual(handover.items.find((item) => item.assetId === device.id)?.relationships, ['managed', 'used']);
assert.deepEqual(handover.items.find((item) => item.assetId === phone.id)?.relationships, ['managed']);
assert.deepEqual(handover.items.find((item) => item.assetId === account.id)?.relationships, ['managed', 'used']);
assert.equal(handover.status, '待确认');
assert.equal(canCompleteAssetHandoverCase(handover), false, '存在未完成交接项时不能关闭交接单');
assert.equal(canCompleteAssetHandoverCase({
  ...handover,
  items: handover.items.map((item) => ({ ...item, status: '已完成' as const })),
}), true);

const grouped = groupAssetHandoverTasks([
  { id: 'task-1', employeeName: employee.name, department: employee.department, assetType: '设备资产', assetId: device.id, assetName: '直播机', permissionStatus: '离职待回收', status: '待回收', dueAt: '2026-08-31' },
  { id: 'task-2', employeeName: employee.name, department: employee.department, assetType: '互联网账号', assetId: account.id, assetName: '抖音 / 直播账号', permissionStatus: '离职待回收', status: '已回收', dueAt: '2026-08-31' },
]);
assert.equal(grouped.length, 1, '同一员工的交接项应聚合为一张交接单');
assert.equal(grouped[0]?.total, 2);
assert.equal(grouped[0]?.completed, 1);
assert.equal(grouped[0]?.status, '处理中');
assert.equal(isMatrixTargetDone('completed'), true);
assert.equal(isMatrixTargetDone('confirmed'), true);
assert.equal(isMatrixTargetDone('returned'), false);

console.log('asset governance domain tests passed');
