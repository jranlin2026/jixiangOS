import type {
  AssetAccountControlStatus,
  AssetAccountStatus,
  AssetDevice,
  AssetDeviceCommunicationType,
  AssetDeviceStatus,
  AssetInternetAccount,
  AssetPhoneNumber,
  AssetPhoneStatus,
} from '../../types/asset';

type LooseAsset = Record<string, unknown>;

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function compactText(value: unknown): string {
  return text(value).replace(/\s+/g, ' ');
}

const DEVICE_BRAND_ALIASES: Array<{ aliases: string[]; canonical: string }> = [
  { aliases: ['荣耀', 'honor', '荣耀honor', 'honor荣耀'], canonical: '荣耀' },
  { aliases: ['华为', 'huawei', '华为huawei', 'huawei华为'], canonical: '华为' },
  { aliases: ['苹果', 'apple', 'iphone', '苹果apple', 'apple苹果'], canonical: '苹果' },
  { aliases: ['小米', 'xiaomi', '小米xiaomi', 'xiaomi小米'], canonical: '小米' },
  { aliases: ['红米', 'redmi', '红米redmi', 'redmi红米'], canonical: '红米' },
  { aliases: ['oppo'], canonical: 'OPPO' },
  { aliases: ['vivo'], canonical: 'vivo' },
  { aliases: ['三星', 'samsung', '三星samsung', 'samsung三星'], canonical: '三星' },
];

function brandKey(value: unknown): string {
  return compactText(value).toLocaleLowerCase().replace(/[\s/|+·_-]+/g, '');
}

export function normalizeDeviceBrand(value: unknown): string {
  const normalized = compactText(value);
  const key = brandKey(normalized);
  return DEVICE_BRAND_ALIASES.find((item) => item.aliases.includes(key))?.canonical || normalized;
}

export function formatDeviceBrandModel(
  device: Pick<AssetDevice, 'brand' | 'model' | 'brandModel'> | LooseAsset,
): string {
  const brand = normalizeDeviceBrand(device.brand);
  const model = compactText(device.model);
  if (brand && model) return `${brand} / ${model}`;
  return brand || model || compactText(device.brandModel);
}

export function hasDuplicateDeviceBrandModel(brand: unknown, model: unknown): boolean {
  const normalizedBrand = brandKey(normalizeDeviceBrand(brand));
  const normalizedModel = brandKey(normalizeDeviceBrand(model));
  return Boolean(normalizedBrand && normalizedModel && normalizedBrand === normalizedModel);
}

function numberValue(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function splitBrandModel(value: unknown): { brand: string; model: string } {
  const combined = text(value);
  const [brand = '', ...modelParts] = combined.split(/\s+/).filter(Boolean);
  return { brand, model: modelParts.join(' ') };
}

export function readDeviceCommunicationType(
  device: Pick<AssetDevice, 'communicationType' | 'simType'> | LooseAsset,
): AssetDeviceCommunicationType {
  const canonical = text(device.communicationType);
  if (['无SIM', '单卡', '双卡', 'eSIM'].includes(canonical)) {
    return canonical as AssetDeviceCommunicationType;
  }
  return text(device.simType) === '单卡' ? '单卡' : '双卡';
}

function normalizeDeviceStatus(value: unknown, currentUser: unknown): AssetDeviceStatus {
  const status = text(value);
  if (status === '正常') return text(currentUser) ? '使用中' : '库存中';
  if (status === '已注销') return '已报废';
  return (status || '库存中') as AssetDeviceStatus;
}

export function normalizeAssetDevice<T extends LooseAsset>(source: T): T & AssetDevice {
  const legacy = splitBrandModel(source.brandModel);
  const brand = normalizeDeviceBrand(source.brand || legacy.brand);
  const model = compactText(source.model || legacy.model);
  const communicationType = readDeviceCommunicationType(source);
  const legacyMonthlyCost = numberValue(source.monthlyCost);
  const monthlyRent = source.monthlyRent === undefined ? legacyMonthlyCost : numberValue(source.monthlyRent);
  return {
    ...source,
    deviceCategory: (text(source.deviceCategory) || '手机') as AssetDevice['deviceCategory'],
    brand,
    model,
    brandModel: [brand, model].filter(Boolean).join(' ') || compactText(source.brandModel),
    serialNumber: text(source.serialNumber) || undefined,
    communicationType,
    simType: communicationType === '双卡' ? '双卡' : '单卡',
    acquisitionType: (text(source.acquisitionType) || (monthlyRent > 0 ? '租赁' : '购买')) as AssetDevice['acquisitionType'],
    purchaseAmount: numberValue(source.purchaseAmount),
    monthlyRent,
    monthlyCost: legacyMonthlyCost || monthlyRent,
    acquiredAt: text(source.acquiredAt) || undefined,
    warrantyExpiresAt: text(source.warrantyExpiresAt) || undefined,
    status: normalizeDeviceStatus(source.status, source.currentUser),
  } as T & AssetDevice;
}

function normalizePhoneStatus(value: unknown): AssetPhoneStatus {
  const status = text(value);
  if (!status || status === '闲置') return '待启用';
  return status as AssetPhoneStatus;
}

export function normalizeAssetPhone<T extends LooseAsset>(source: T): T & AssetPhoneNumber {
  const deviceId = text(source.deviceId) || undefined;
  return {
    ...source,
    simForm: (text(source.simForm) || '实体SIM') as AssetPhoneNumber['simForm'],
    iccid: text(source.iccid) || undefined,
    iccidMasked: text(source.iccidMasked) || undefined,
    imsi: text(source.imsi) || undefined,
    imsiMasked: text(source.imsiMasked) || undefined,
    servicePassword: text(source.servicePassword) || undefined,
    servicePasswordMasked: text(source.servicePasswordMasked) || undefined,
    realNameSubject: text(source.realNameSubject) || undefined,
    deviceId,
    slotType: deviceId ? (text(source.slotType) || '卡槽1') as AssetPhoneNumber['slotType'] : undefined,
    ownerSubject: (text(source.ownerSubject) || '公司') as AssetPhoneNumber['ownerSubject'],
    contractExpiresAt: text(source.contractExpiresAt) || undefined,
    status: normalizePhoneStatus(source.status),
    remark: text(source.remark) || undefined,
  } as T & AssetPhoneNumber;
}

export function readAccountControlStatus(
  account: Pick<AssetInternetAccount, 'controlStatus' | 'permissionStatus'> | LooseAsset,
): AssetAccountControlStatus {
  const canonical = text(account.controlStatus);
  if (canonical) return canonical as AssetAccountControlStatus;
  const legacy = text(account.permissionStatus);
  if (legacy === '离职待回收' || legacy === '已回收') return legacy;
  return '已掌控';
}

function normalizeAccountStatus(value: unknown): AssetAccountStatus {
  const status = text(value);
  return status === '正常' || !status ? '使用中' : status as AssetAccountStatus;
}

export function normalizeAssetAccount<T extends LooseAsset>(source: T): T & AssetInternetAccount {
  const controlStatus = readAccountControlStatus(source);
  return {
    ...source,
    accountCategory: (text(source.accountCategory) || '主账号') as AssetInternetAccount['accountCategory'],
    realNameSubject: text(source.realNameSubject) || undefined,
    controlStatus,
    permissionStatus: controlStatus === '已掌控' ? '正常' : controlStatus === '待交接' ? '正常' : controlStatus,
    accountStatus: normalizeAccountStatus(source.accountStatus),
    businessScene: text(source.businessScene) || undefined,
    twoFactorMethod: text(source.twoFactorMethod) || undefined,
    remark: text(source.remark) || undefined,
  } as T & AssetInternetAccount;
}
