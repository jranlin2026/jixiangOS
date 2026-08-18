import assert from 'node:assert/strict';
import { readDeviceImeis, validateDeviceImeis } from './deviceImei';

assert.deepEqual(
  readDeviceImeis({ imei: 'LEGACY-IMEI-0001', imeiMasked: 'LEGACY******0001' }),
  {
    imei1: 'LEGACY-IMEI-0001',
    imei1Masked: 'LEGACY******0001',
    imei2: undefined,
    imei2Masked: undefined,
  },
  'legacy single-IMEI records must remain readable as IMEI 1',
);

assert.deepEqual(
  readDeviceImeis({
    imei1: 'CANONICAL-IMEI-0001',
    imei1Masked: 'CANONI******0001',
    imei2: 'CANONICAL-IMEI-0002',
    imei2Masked: 'CANONI******0002',
    imei: 'STALE-LEGACY-VALUE',
  }),
  {
    imei1: 'CANONICAL-IMEI-0001',
    imei1Masked: 'CANONI******0001',
    imei2: 'CANONICAL-IMEI-0002',
    imei2Masked: 'CANONI******0002',
  },
  'canonical fields must take precedence over stale legacy aliases',
);

assert.deepEqual(
  validateDeviceImeis({ simType: '单卡', imei1: 'SINGLE-IMEI-0001' }, []),
  {
    imei1: 'SINGLE-IMEI-0001',
    imei1Masked: 'SINGLE******0001',
    imei2: undefined,
    imei2Masked: undefined,
  },
  'single-SIM devices must be valid with exactly one IMEI',
);

assert.throws(
  () => validateDeviceImeis({ simType: '双卡', imei1: 'DUAL-IMEI-0001' }, []),
  /IMEI 2不能为空/,
  'dual-SIM devices without IMEI 2 must be rejected',
);

assert.throws(
  () => validateDeviceImeis({ simType: '单卡', imei1: 'SINGLE-IMEI-0001', imei2: 'SINGLE-IMEI-0002' }, []),
  /单卡设备不能填写IMEI 2/,
  'single-SIM devices with IMEI 2 must be rejected',
);

assert.throws(
  () => validateDeviceImeis({ simType: '双卡', imei1: 'SAME-IMEI', imei2: 'SAME-IMEI' }, []),
  /IMEI 1和IMEI 2不能相同/,
  'the two IMEI slots on one device must not contain the same value',
);

const existingDevices = [
  { id: 'legacy', simType: '单卡', imei: 'LEGACY-IMEI-0001', imeiMasked: 'LEGACY******0001' },
  {
    id: 'dual',
    simType: '双卡',
    imei1: 'EXISTING-IMEI-0001',
    imei1Masked: 'EXISTI******0001',
    imei2: 'EXISTING-IMEI-0002',
    imei2Masked: 'EXISTI******0002',
  },
];

assert.throws(
  () => validateDeviceImeis(
    { simType: '双卡', imei1: 'NEW-IMEI-0001', imei2: 'LEGACY-IMEI-0001' },
    existingDevices,
  ),
  /IMEI 2已存在/,
  'IMEI 2 must be checked against a legacy IMEI 1 value',
);

assert.throws(
  () => validateDeviceImeis(
    { simType: '单卡', imei1: 'EXISTING-IMEI-0002' },
    existingDevices,
  ),
  /IMEI 1已存在/,
  'IMEI 1 must be checked against another device IMEI 2 value',
);

assert.doesNotThrow(
  () => validateDeviceImeis(
    { simType: '双卡', imei1: 'EXISTING-IMEI-0001', imei2: 'EXISTING-IMEI-0002' },
    existingDevices,
    'dual',
  ),
  'editing a device without changing its own IMEIs must remain valid',
);

assert.throws(
  () => validateDeviceImeis({ simType: '单卡', imei1: 'MASKED******0001' }, []),
  /IMEI 1不能使用掩码值/,
  'masked values must never overwrite a raw IMEI',
);
