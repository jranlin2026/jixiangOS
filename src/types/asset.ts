export type AssetRiskLevel = '低' | '中' | '高';

export type AssetDeviceCategory = '手机' | '平板' | '电脑' | '摄影设备' | '其他';

export type AssetDeviceCommunicationType = '无SIM' | '单卡' | '双卡' | 'eSIM';

export type AssetAcquisitionType = '购买' | '租赁' | '借用';

export type AssetDeviceStatus = '库存中' | '使用中' | '维修中' | '闲置' | '已停用' | '已报废' | '正常' | '已注销';

export type AssetPhoneStatus = '待启用' | '使用中' | '停机保号' | '已停用' | '已注销' | '闲置';

export type AssetSimForm = '实体SIM' | 'eSIM';

export type AssetPhoneOperator = '移动' | '联通' | '电信' | '广电' | '未知';

export type AssetPermissionStatus = '正常' | '离职待回收' | '已回收';

export type AssetAccountControlStatus = '已掌控' | '待交接' | '离职待回收' | '已回收';

export type AssetAccountCategory = '主账号' | '员工号' | '直播号' | '投放号' | '客服号' | '其他';

export type AssetAccountStatus = '使用中' | '闲置' | '异常' | '封禁' | '已注销' | '正常';

export type AssetAccountLoginMethod = '密码登录' | '手机验证码' | '扫码登录' | 'SSO';

export type AssetAccountCredentialStatus = '已设置' | '待补齐' | '不适用';

export type AssetRiskStatus = 'open' | 'resolved' | 'ignored';

export type AssetType = 'device' | 'phone' | 'account';

export type AssetSensitiveField = 'imei' | 'imei1' | 'imei2' | 'phoneNumber' | 'phoneRealName' | 'iccid' | 'imsi' | 'servicePassword' | 'loginAccount' | 'accountRealName' | 'boundEmail' | 'loginPassword' | 'paymentPassword';

export type AssetImportType = 'devices' | 'phones' | 'accounts';

export interface AssetFilterOption {
  value: string;
  label: string;
}

export interface AssetFilterOptions {
  deviceCategories: AssetFilterOption[];
  brands: AssetFilterOption[];
  communicationTypes: AssetFilterOption[];
  acquisitionTypes: AssetFilterOption[];
  statuses: AssetFilterOption[];
  operators: AssetFilterOption[];
  attributionLocations: AssetFilterOption[];
  simForms: AssetFilterOption[];
  packageNames: AssetFilterOption[];
  platforms: AssetFilterOption[];
  controlStatuses: AssetFilterOption[];
  accountCategories: AssetFilterOption[];
  departments: AssetFilterOption[];
  owners: AssetFilterOption[];
  currentUsers: AssetFilterOption[];
  loginDevices: AssetFilterOption[];
}

export interface AssetDevice {
  id: string;
  deviceCode: string;
  deviceName: string;
  deviceCategory?: AssetDeviceCategory;
  brand?: string;
  model?: string;
  serialNumber?: string;
  communicationType?: AssetDeviceCommunicationType;
  acquisitionType?: AssetAcquisitionType;
  purchaseAmount?: number;
  monthlyRent?: number;
  acquiredAt?: string;
  warrantyExpiresAt?: string;
  /** Legacy read alias. Canonical writes use brand and model. */
  brandModel: string;
  imei1: string;
  imei1Masked: string;
  imei2?: string;
  imei2Masked?: string;
  /** Legacy read alias. New writes use imei1. */
  imei?: string;
  /** Legacy read alias. New writes use imei1Masked. */
  imeiMasked?: string;
  simType: '单卡' | '双卡';
  ownerSubject: '公司' | '法人' | '员工个人';
  departmentId?: string;
  department: string;
  ownerId?: string;
  owner: string;
  currentUserId?: string;
  currentUser: string;
  status: AssetDeviceStatus;
  riskLevel: AssetRiskLevel;
  monthlyCost: number;
  remark?: string;
  createdAt: string;
  updatedAt: string;
  /** 当前数据范围内，明确将该设备配置为登录设备的互联网账号数量。 */
  internetAccountCount?: number;
}

export interface AssetPhoneNumber {
  id: string;
  phoneNumber: string;
  phoneNumberMasked: string;
  simForm?: AssetSimForm;
  iccid?: string;
  iccidMasked?: string;
  imsi?: string;
  imsiMasked?: string;
  servicePassword?: string;
  servicePasswordMasked?: string;
  realNameSubject?: string;
  realName?: string;
  realNameMasked?: string;
  operator: AssetPhoneOperator;
  attributionLocation?: string;
  deviceId?: string;
  slotType?: '卡槽1' | '卡槽2';
  packageName: string;
  monthlyFee: number;
  contractExpiresAt?: string;
  ownerSubject?: '公司' | '法人' | '员工个人';
  departmentId?: string;
  department?: string;
  ownerId?: string;
  owner: string;
  currentUserId?: string;
  currentUser?: string;
  status: AssetPhoneStatus;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetInternetAccount {
  id: string;
  accountNo: string;
  platform: string;
  accountName: string;
  accountCategory?: AssetAccountCategory;
  loginAccount: string;
  loginAccountMasked: string;
  realNameSubject?: string;
  realName?: string;
  realNameMasked?: string;
  phoneId?: string;
  /** 该账号实际登录或使用的设备；独立于绑定手机号关系，可多选。 */
  loginDeviceIds?: string[];
  /** Apple ID / Google 账号等用于登录或恢复该账号的独立身份账号资产。 */
  identityAccountIds?: string[];
  boundEmail?: string;
  boundEmailMasked?: string;
  ownerSubject: '公司' | '法人' | '员工个人';
  departmentId?: string;
  department: string;
  ownerId?: string;
  owner: string;
  currentUserId?: string;
  currentUser: string;
  permissionStatus: AssetPermissionStatus;
  controlStatus?: AssetAccountControlStatus;
  accountStatus: AssetAccountStatus;
  riskLevel: AssetRiskLevel;
  serviceProvider: string;
  monthlyFee: number;
  expiresAt?: string;
  purpose: string;
  businessScene?: string;
  loginMethod?: AssetAccountLoginMethod;
  requiresPaymentPassword?: boolean;
  loginCredentialStatus?: AssetAccountCredentialStatus;
  paymentCredentialStatus?: AssetAccountCredentialStatus;
  credentialUpdatedAt?: string;
  twoFactorMethod?: string;
  remark?: string;
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

export type AssetMatrixPublishTargetStatus = 'pending' | 'completed';

export interface AssetMatrixPublishTarget {
  id: string;
  accountId: string;
  accountNo: string;
  platform: string;
  accountName: string;
  assignee: string;
  department: string;
  phoneId?: string;
  phoneNumberMasked?: string;
  deviceId?: string;
  deviceCode?: string;
  deviceName?: string;
  status: AssetMatrixPublishTargetStatus;
  completedAt?: string;
}

export interface AssetMatrixPublishTask {
  id: string;
  title: string;
  videoUrl?: string;
  videoFileName?: string;
  copywriting: string;
  remark?: string;
  dueAt: string;
  targets: AssetMatrixPublishTarget[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssetMatrixPublishTaskInput {
  title: string;
  videoUrl?: string;
  videoFileName?: string;
  copywriting: string;
  remark?: string;
  dueAt: string;
  accountIds: string[];
}

export interface AssetMatrixPublishStats {
  totalTargets: number;
  completedTargets: number;
  pendingTargets: number;
  overdueTargets: number;
  completionRate: number;
  overdueAccounts: AssetMatrixPublishTarget[];
  byPlatform: Array<{ platform: string; total: number; completed: number; overdue: number }>;
  byDepartment: Array<{ department: string; total: number; completed: number; overdue: number }>;
  byAssignee: Array<{ assignee: string; total: number; completed: number; overdue: number }>;
}

export interface AssetFilters {
  search?: string;
  platform?: string;
  loginDeviceId?: string;
  bindingStatus?: 'unassigned-user' | 'bound-device' | 'unbound-device' | 'bound-phone' | 'unbound-phone' | 'with-login-device' | 'without-login-device' | 'credential-pending';
  permissionStatus?: string;
  riskLevel?: string;
  status?: string;
  deviceCategory?: string;
  brand?: string;
  communicationType?: string;
  acquisitionType?: string;
  profileStatus?: 'complete' | 'incomplete';
  operator?: string;
  attributionLocation?: string;
  simForm?: string;
  accountCategory?: string;
  departmentId?: string;
  ownerId?: string;
  currentUserId?: string;
  userAssignment?: 'assigned' | 'unassigned';
  phoneBinding?: 'bound' | 'unbound';
  deviceBinding?: 'bound' | 'unbound';
  loginDeviceBinding?: 'with' | 'without';
  accountBinding?: 'with' | 'without';
  identityBinding?: 'apple' | 'google' | 'any' | 'none';
  credentialStatus?: 'complete' | 'pending';
  twoFactorStatus?: 'configured' | 'unconfigured';
  servicePasswordStatus?: 'configured' | 'unconfigured';
  packageName?: string;
  contractStatus?: 'active' | 'expired' | 'unset';
  monthlyFeeMin?: number;
  monthlyFeeMax?: number;
  page?: number;
  pageSize?: number;
}

export interface AssetOverviewRelationshipRow {
  device: AssetDevice;
  phones: AssetPhoneNumber[];
  accounts: AssetInternetAccount[];
}

export interface AssetDashboard {
  deviceCount: number;
  phoneCount: number;
  accountCount: number;
  openRiskCount: number;
  offboardingCount: number;
  monthlyCost: number;
  unboundAccountCount: number;
  deviceSummary: {
    total: number;
    inUse: number;
    inventory: number;
    attention: number;
    unassignedUser: number;
    monthlyCost: number;
  };
  phoneSummary: {
    total: number;
    boundDevice: number;
    unboundDevice: number;
    inUse: number;
    inactive: number;
    monthlyCost: number;
  };
  accountSummary: {
    total: number;
    withLoginDevice: number;
    withoutLoginDevice: number;
    boundPhone: number;
    unboundPhone: number;
    credentialPending: number;
    monthlyCost: number;
  };
  relationshipHealth: {
    openRisks: number;
    offboarding: number;
    unassignedDevices: number;
    unboundPhones: number;
    accountsWithoutLoginDevice: number;
    accountsWithoutPhone: number;
    credentialPending: number;
  };
}

export interface AssetDetailBundle {
  type: AssetType;
  device?: AssetDevice;
  phone?: AssetPhoneNumber;
  account?: AssetInternetAccount;
  relatedDevice?: AssetDevice;
  relatedDevices?: AssetDevice[];
  relatedPhones: AssetPhoneNumber[];
  relatedAccounts: AssetInternetAccount[];
  risks: AssetRisk[];
  logs: AssetOperationLog[];
}

export interface AssetSensitiveRevealResult {
  field: AssetSensitiveField;
  label: string;
  value: string;
}

export interface AssetImportFailedRow {
  rowNumber: number;
  reason: string;
  raw: Record<string, string>;
}

export interface AssetImportResult {
  type: AssetImportType;
  totalRows: number;
  successCount: number;
  failedCount: number;
  createdIds: string[];
  failedRows: AssetImportFailedRow[];
}

export type AssetDeviceInput = Omit<AssetDevice, 'id' | 'deviceCode' | 'imei1Masked' | 'imei2Masked' | 'imeiMasked' | 'createdAt' | 'updatedAt'> & {
  deviceCode?: string;
};

export type AssetPhoneNumberInput = Omit<AssetPhoneNumber, 'id' | 'phoneNumberMasked' | 'iccidMasked' | 'imsiMasked' | 'servicePasswordMasked' | 'createdAt' | 'updatedAt'> & {
  /** Command-only flag. It is never persisted on the phone asset. */
  clearServicePassword?: boolean;
};

export type AssetInternetAccountInput = Omit<AssetInternetAccount, 'id' | 'accountNo' | 'loginAccountMasked' | 'boundEmailMasked' | 'createdAt' | 'updatedAt'> & {
  accountNo?: string;
  /** Command-only secrets. They are stored separately from the account asset. */
  loginPassword?: string;
  paymentPassword?: string;
};
