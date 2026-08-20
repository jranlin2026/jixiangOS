import type {
  AssetDevice,
  AssetHandoverCase,
  AssetHandoverItem,
  AssetHandoverReason,
  AssetInternetAccount,
  AssetMatrixPublishTargetStatus,
  AssetOffboardingTask,
  AssetPhoneNumber,
} from '../../types/asset';

export type GovernedAssetType = 'device' | 'phone' | 'account';

export function responsibilityLabelForAsset(type: GovernedAssetType): string {
  return type === 'account' ? '账号负责人' : '管理责任人';
}

export function usageLabelForAsset(type: GovernedAssetType): string {
  return type === 'account' ? '主要使用人' : '当前使用人';
}

type EmployeeIdentity = { id: string; name: string; departmentId?: string; department?: string };
type BuildHandoverInput = {
  id: string;
  employee: EmployeeIdentity;
  reason: AssetHandoverReason;
  dueAt: string;
  devices: AssetDevice[];
  phones: AssetPhoneNumber[];
  accounts: AssetInternetAccount[];
  createdAt: string;
};

const text = (value: unknown) => String(value || '').trim();

function isEmployee(asset: { ownerId?: string; owner?: string; currentUserId?: string; currentUser?: string }, employee: EmployeeIdentity, field: 'owner' | 'currentUser') {
  const id = field === 'owner' ? asset.ownerId : asset.currentUserId;
  const name = field === 'owner' ? asset.owner : asset.currentUser;
  return text(id) ? text(id) === employee.id : text(name) === employee.name;
}

function itemFor(type: GovernedAssetType, asset: AssetDevice | AssetPhoneNumber | AssetInternetAccount, employee: EmployeeIdentity): AssetHandoverItem | null {
  const relationships: AssetHandoverItem['relationships'] = [];
  if (isEmployee(asset, employee, 'owner')) relationships.push('managed');
  if (isEmployee(asset, employee, 'currentUser')) relationships.push('used');
  if (!relationships.length) return null;
  const name = type === 'device'
    ? `${text((asset as AssetDevice).deviceCode)} / ${text((asset as AssetDevice).deviceName)}`
    : type === 'phone'
      ? text((asset as AssetPhoneNumber).phoneNumber || (asset as AssetPhoneNumber).phoneNumberMasked)
      : `${text((asset as AssetInternetAccount).platform)} / ${text((asset as AssetInternetAccount).accountName)}`;
  return {
    id: `handover-item-${type}-${asset.id}`,
    assetType: type,
    assetId: asset.id,
    assetName: name || asset.id,
    relationships,
    action: relationships.includes('managed') && relationships.includes('used') ? '移交管理并变更使用人' : relationships.includes('managed') ? '移交管理责任' : '变更使用人',
    status: '待处理',
  };
}

export function buildAssetHandoverCase(input: BuildHandoverInput): AssetHandoverCase {
  const items = [
    ...input.devices.map((asset) => itemFor('device', asset, input.employee)),
    ...input.phones.map((asset) => itemFor('phone', asset, input.employee)),
    ...input.accounts.map((asset) => itemFor('account', asset, input.employee)),
  ].filter((item): item is AssetHandoverItem => Boolean(item));
  return {
    id: input.id,
    employeeId: input.employee.id,
    employeeName: input.employee.name,
    departmentId: input.employee.departmentId,
    department: input.employee.department || '',
    reason: input.reason,
    status: '待确认',
    dueAt: input.dueAt,
    items,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function canCompleteAssetHandoverCase(handover: AssetHandoverCase): boolean {
  return handover.items.length > 0 && handover.items.every((item) => item.status === '已完成' || item.status === '无需处理');
}

export type AssetHandoverTaskGroup = {
  id: string;
  employeeName: string;
  department: string;
  reason: AssetHandoverReason;
  dueAt: string;
  tasks: AssetOffboardingTask[];
  total: number;
  completed: number;
  status: '待处理' | '处理中' | '已完成';
};

export function groupAssetHandoverTasks(tasks: AssetOffboardingTask[]): AssetHandoverTaskGroup[] {
  const groups = new Map<string, AssetOffboardingTask[]>();
  tasks.forEach((task) => {
    const key = `${text(task.employeeName)}::${text(task.department)}`;
    groups.set(key, [...(groups.get(key) || []), task]);
  });
  return Array.from(groups.entries()).map<AssetHandoverTaskGroup>(([key, items]) => {
    const completed = items.filter((item) => item.status === '已回收').length;
    const dueAt = [...items].map((item) => item.dueAt).filter(Boolean).sort()[0] || '';
    return {
      id: `handover-${key}`,
      employeeName: items[0]?.employeeName || '待确认',
      department: items[0]?.department || '',
      reason: '离职' as const,
      dueAt,
      tasks: items,
      total: items.length,
      completed,
      status: completed === items.length ? '已完成' : completed > 0 ? '处理中' : '待处理',
    };
  }).sort((left, right) => left.dueAt.localeCompare(right.dueAt) || left.employeeName.localeCompare(right.employeeName, 'zh-CN'));
}

export function isMatrixTargetDone(status: AssetMatrixPublishTargetStatus): boolean {
  return status === 'completed' || status === 'confirmed';
}
