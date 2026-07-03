export type AssetRiskLevel = '低' | '中' | '高';

export type AssetDeviceStatus = '正常' | '使用中' | '闲置' | '已注销';

export type AssetPhoneStatus = '使用中' | '闲置' | '已停用';

export type AssetPermissionStatus = '正常' | '离职待回收' | '已回收';

export type AssetAccountStatus = '使用中' | '正常' | '闲置' | '异常' | '已注销';

export type AssetRiskStatus = 'open' | 'resolved' | 'ignored';

export type AssetType = 'device' | 'phone' | 'account';

export interface AssetDevice {
  id: string;
  deviceCode: string;
  deviceName: string;
  brandModel: string;
  imei: string;
  imeiMasked: string;
  simType: '单卡' | '双卡';
  ownerSubject: '公司' | '法人' | '员工个人';
  department: string;
  owner: string;
  currentUser: string;
  status: AssetDeviceStatus;
  riskLevel: AssetRiskLevel;
  monthlyCost: number;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetPhoneNumber {
  id: string;
  phoneNumber: string;
  phoneNumberMasked: string;
  operator: '移动' | '联通' | '电信' | '广电';
  deviceId: string;
  slotType: '卡槽1' | '卡槽2';
  packageName: string;
  monthlyFee: number;
  owner: string;
  status: AssetPhoneStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AssetInternetAccount {
  id: string;
  accountNo: string;
  platform: string;
  accountName: string;
  loginAccount: string;
  loginAccountMasked: string;
  phoneId?: string;
  boundEmail?: string;
  boundEmailMasked?: string;
  ownerSubject: '公司' | '法人' | '员工个人';
  department: string;
  owner: string;
  currentUser: string;
  permissionStatus: AssetPermissionStatus;
  accountStatus: AssetAccountStatus;
  riskLevel: AssetRiskLevel;
  serviceProvider: string;
  monthlyFee: number;
  expiresAt?: string;
  purpose: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetRisk {
  id: string;
  riskKey: string;
  type: string;
  targetType: AssetType;
  targetId: string;
  targetName: string;
  level: AssetRiskLevel;
  status: AssetRiskStatus;
  description: string;
  createdAt: string;
  handledAt?: string;
  handledBy?: string;
  remark?: string;
}

export interface AssetOperationLog {
  id: string;
  time: string;
  action: string;
  targetType: string;
  targetId: string;
  targetName: string;
  operator: string;
  detail: string;
}

export interface AssetOffboardingTask {
  id: string;
  employeeName: string;
  department: string;
  assetType: '互联网账号' | '设备资产' | '手机号资产';
  assetId: string;
  assetName: string;
  permissionStatus: AssetPermissionStatus;
  status: '待回收' | '已回收';
  dueAt: string;
  handledAt?: string;
  handler?: string;
}

export interface AssetFilters {
  search?: string;
  platform?: string;
  permissionStatus?: string;
  riskLevel?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface AssetDashboard {
  deviceCount: number;
  phoneCount: number;
  accountCount: number;
  openRiskCount: number;
  offboardingCount: number;
  monthlyCost: number;
  unboundAccountCount: number;
}

export interface AssetDetailBundle {
  type: AssetType;
  device?: AssetDevice;
  phone?: AssetPhoneNumber;
  account?: AssetInternetAccount;
  relatedDevice?: AssetDevice;
  relatedPhones: AssetPhoneNumber[];
  relatedAccounts: AssetInternetAccount[];
  risks: AssetRisk[];
  logs: AssetOperationLog[];
}

export type AssetDeviceInput = Omit<AssetDevice, 'id' | 'deviceCode' | 'imeiMasked' | 'createdAt' | 'updatedAt'> & {
  deviceCode?: string;
};

export type AssetPhoneNumberInput = Omit<AssetPhoneNumber, 'id' | 'phoneNumberMasked' | 'createdAt' | 'updatedAt'>;

export type AssetInternetAccountInput = Omit<AssetInternetAccount, 'id' | 'accountNo' | 'loginAccountMasked' | 'boundEmailMasked' | 'createdAt' | 'updatedAt'> & {
  accountNo?: string;
};
