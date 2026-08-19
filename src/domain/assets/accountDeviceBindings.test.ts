import assert from 'node:assert/strict';
import { normalizeAccountLoginDeviceIds, validateAccountLoginDeviceIds } from './accountDeviceBindings';

const devices = [
  { id: 'device-1' },
  { id: 'device-2' },
];

assert.deepEqual(
  normalizeAccountLoginDeviceIds(['device-1', ' device-2 ', 'device-1', '']),
  ['device-1', 'device-2'],
  '登录设备应支持多选、去重并清理空值',
);
assert.deepEqual(normalizeAccountLoginDeviceIds('device-1'), [], '旧的单值或异常值不能被误当成设备关系');
assert.equal(validateAccountLoginDeviceIds(['device-1', 'device-2'], devices), null);
assert.match(validateAccountLoginDeviceIds(['missing-device'], devices) || '', /不存在/);
