type DeviceReference = { id: string };

export function normalizeAccountLoginDeviceIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean)));
}

export function validateAccountLoginDeviceIds(
  value: unknown,
  devices: DeviceReference[],
): string | null {
  const deviceIds = new Set(devices.map((device) => device.id));
  return normalizeAccountLoginDeviceIds(value).some((id) => !deviceIds.has(id))
    ? '登录设备不存在'
    : null;
}
