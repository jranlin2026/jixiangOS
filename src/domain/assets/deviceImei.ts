export type DeviceSimType = '单卡' | '双卡';
export type DeviceCommunicationType = '无SIM' | '单卡' | '双卡' | 'eSIM';

export type DeviceImeiLike = {
  id?: string;
  simType?: DeviceSimType | string;
  communicationType?: DeviceCommunicationType | string;
  imei1?: unknown;
  imei1Masked?: unknown;
  imei2?: unknown;
  imei2Masked?: unknown;
  imei?: unknown;
  imeiMasked?: unknown;
};

export type DeviceImeiFields = {
  imei1: string;
  imei1Masked: string;
  imei2?: string;
  imei2Masked?: string;
};

export type DeviceImeiValidationKind = 'required' | 'cardinality' | 'duplicate' | 'masked';

export class DeviceImeiValidationError extends Error {
  constructor(
    message: string,
    readonly kind: DeviceImeiValidationKind,
  ) {
    super(message);
    this.name = 'DeviceImeiValidationError';
  }
}

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

export function maskDeviceImei(value: string): string {
  const text = clean(value);
  return text.length > 8 ? `${text.slice(0, 6)}******${text.slice(-4)}` : text;
}

export function readDeviceImeis(device: DeviceImeiLike): DeviceImeiFields {
  const imei1 = clean(device.imei1) || clean(device.imei);
  const storedImei1Mask = clean(device.imei1Masked) || clean(device.imeiMasked);
  const imei2 = clean(device.imei2) || undefined;
  const storedImei2Mask = clean(device.imei2Masked);
  return {
    imei1,
    imei1Masked: storedImei1Mask || maskDeviceImei(imei1),
    imei2,
    imei2Masked: imei2 ? storedImei2Mask || maskDeviceImei(imei2) : undefined,
  };
}

function assertRawImei(value: string, label: 'IMEI 1' | 'IMEI 2'): void {
  if (/[*•]/.test(value)) {
    throw new DeviceImeiValidationError(`${label}不能使用掩码值`, 'masked');
  }
}

export function validateDeviceImeis(
  input: DeviceImeiLike,
  devices: Array<DeviceImeiLike & { id?: string }>,
  currentDeviceId?: string,
): DeviceImeiFields {
  const { imei1, imei2 } = readDeviceImeis(input);
  const communicationType: DeviceCommunicationType = input.communicationType === '无SIM'
    || input.communicationType === '单卡'
    || input.communicationType === 'eSIM'
    || input.communicationType === '双卡'
    ? input.communicationType
    : input.simType === '单卡' ? '单卡' : '双卡';

  if (communicationType === '无SIM') {
    if (imei1 || imei2) {
      throw new DeviceImeiValidationError('无SIM设备不能填写IMEI', 'cardinality');
    }
    return { imei1: '', imei1Masked: '', imei2: undefined, imei2Masked: undefined };
  }

  if (!imei1) throw new DeviceImeiValidationError('IMEI 1不能为空', 'required');
  assertRawImei(imei1, 'IMEI 1');
  if (imei2) assertRawImei(imei2, 'IMEI 2');

  if (communicationType === '双卡' && !imei2) {
    throw new DeviceImeiValidationError('双卡设备的IMEI 2不能为空', 'required');
  }
  if ((communicationType === '单卡' || communicationType === 'eSIM') && imei2) {
    throw new DeviceImeiValidationError(`${communicationType}设备不能填写IMEI 2，请先清空`, 'cardinality');
  }
  if (imei2 && imei1 === imei2) {
    throw new DeviceImeiValidationError('IMEI 1和IMEI 2不能相同', 'duplicate');
  }

  const occupied = new Set<string>();
  devices.forEach((device) => {
    if (currentDeviceId && device.id === currentDeviceId) return;
    const values = readDeviceImeis(device);
    if (values.imei1) occupied.add(values.imei1);
    if (values.imei2) occupied.add(values.imei2);
  });

  if (occupied.has(imei1)) {
    throw new DeviceImeiValidationError('IMEI 1已存在', 'duplicate');
  }
  if (imei2 && occupied.has(imei2)) {
    throw new DeviceImeiValidationError('IMEI 2已存在', 'duplicate');
  }

  return {
    imei1,
    imei1Masked: maskDeviceImei(imei1),
    imei2,
    imei2Masked: imei2 ? maskDeviceImei(imei2) : undefined,
  };
}
