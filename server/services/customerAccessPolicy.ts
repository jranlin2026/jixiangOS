import type { Customer } from '../../src/types/customer';
import { LIFECYCLE_STATUS_CODES } from '../../src/shared/utils/constants';
import type { AuthenticatedUser } from '../../src/types/auth';
import type { CustomerDataScopeLevel } from '../../src/types/role';
import type { Department } from '../../src/types/department';
import type { Role } from '../../src/types/role';
import type { User } from '../../src/types/settings';
import {
  PERMISSION_KEYS,
  roleHasPermission,
} from '../../src/shared/utils/permissions';
import {
  getDepartmentDescendantIds,
  normalizeRoleDataScopes,
} from '../../src/shared/utils/organizationConfig';
import { mapPrismaDepartment, mapPrismaRole, mapPrismaUser } from '../db/prismaMappers';

export type CustomerMutationAction =
  | 'transfer'
  | 'release_to_pool'
  | 'set_progress'
  | 'update_tags'
  | 'add_todo'
  | 'soft_delete';

export interface CustomerAccessContext {
  actorId: string;
  actorName: string;
  /** Stable IDs visible for read compatibility; never use names from this set for writes. */
  readableUserIds: ReadonlySet<string>;
  /** Legacy display-name snapshots retained only for read compatibility. */
  legacyReadableNames: ReadonlySet<string>;
  manageableOwnerIds: ReadonlySet<string>;
  canReadPublicPool: boolean;
  /** Server-authoritative capability to disclose customer-list details. */
  canReadCustomerList: boolean;
  /**
   * Contains only permissions granted for their authoritative mutation action.
   * In particular CUSTOMER_DELETE is added only for an explicit `delete` grant.
   */
  grantedPermissions: ReadonlySet<string>;
}

type CustomerAccessDirectory = {
  user: { findMany(args?: unknown): Promise<any[]> };
  role: { findMany(args?: unknown): Promise<any[]> };
  department: { findMany(args?: unknown): Promise<any[]> };
};

type CustomerFieldGroup = 'profile' | 'progress' | 'tags' | 'attribution';

const PROFILE_FIELDS = new Set([
  'name',
  'company',
  'phone',
  'wechat',
  'customerLevel',
  'industry',
  'city',
  'remark',
  'score',
]);

const ATTRIBUTION_FIELDS = new Set([
  'leadInputBy',
  'leadContributorId',
  'leadContributorName',
  'leadSource',
  'originalSalesTransferBy',
  'sourceType',
  'sourceName',
  'sourceAccount',
]);

const FIELD_GROUP_PERMISSION: Record<CustomerFieldGroup, { key: string; label: string }> = {
  profile: { key: PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, label: '编辑客户资料' },
  progress: { key: PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, label: '设置客户进展' },
  tags: { key: PERMISSION_KEYS.CUSTOMER_SET_TAGS, label: '设置客户标签' },
  attribution: { key: PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION, label: '编辑客户归属' },
};

const ACTION_PERMISSION: Record<CustomerMutationAction, { key: string; label: string }> = {
  transfer: { key: PERMISSION_KEYS.CUSTOMER_TRANSFER, label: '转让客户' },
  release_to_pool: { key: PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, label: '释放客户至公海' },
  set_progress: { key: PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, label: '设置客户进展' },
  update_tags: { key: PERMISSION_KEYS.CUSTOMER_SET_TAGS, label: '设置客户标签' },
  add_todo: { key: PERMISSION_KEYS.CUSTOMER_SET_TODOS, label: '设置客户待办' },
  soft_delete: { key: PERMISSION_KEYS.CUSTOMER_DELETE, label: '删除客户' },
};

const CUSTOMER_MUTATION_PERMISSION_ACTIONS = new Map<string, string>([
  [PERMISSION_KEYS.CUSTOMER_EDIT_PROFILE, 'write'],
  [PERMISSION_KEYS.CUSTOMER_SET_PROGRESS, 'write'],
  [PERMISSION_KEYS.CUSTOMER_SET_TAGS, 'write'],
  [PERMISSION_KEYS.CUSTOMER_SET_TODOS, 'write'],
  [PERMISSION_KEYS.CUSTOMER_EDIT_ATTRIBUTION, 'write'],
  [PERMISSION_KEYS.CUSTOMER_TRANSFER, 'write'],
  [PERMISSION_KEYS.CUSTOMER_RELEASE_TO_POOL, 'write'],
  [PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW, 'read'],
  [PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM, 'write'],
  [PERMISSION_KEYS.CUSTOMER_DELETE, 'delete'],
  // Batch permissions are leaf grants too. Keeping them in the authoritative
  // server-side context prevents routes from trusting a browser-supplied
  // permission list while still allowing the batch layer to revalidate them.
  [PERMISSION_KEYS.CUSTOMER_BATCH_MANAGE, 'write'],
  [PERMISSION_KEYS.CUSTOMER_BATCH_CANCEL, 'write'],
  [PERMISSION_KEYS.CUSTOMER_BATCH_AUDIT_READ, 'read'],
  [PERMISSION_KEYS.CUSTOMER_MERGE, 'write'],
  [PERMISSION_KEYS.CUSTOMER_MERGE_UNDO, 'write'],
]);

function explicitCustomerScope(value: unknown): CustomerDataScopeLevel | null | undefined {
  if (value === undefined) return undefined;
  if (value === 'department' || value === 'department_only' || value === 'department_and_descendants') return 'department';
  if (value === 'self' || value === 'all') return value;
  return null;
}

function emptyContext(actorId: string, actorName = ''): CustomerAccessContext {
  return {
    actorId,
    actorName,
    readableUserIds: new Set(),
    legacyReadableNames: new Set(),
    manageableOwnerIds: new Set(),
    canReadPublicPool: false,
    canReadCustomerList: false,
    grantedPermissions: new Set(),
  };
}

/** Build customer authorization solely from the fresh server-side directory. */
export async function loadCustomerAccessContext(
  directory: CustomerAccessDirectory,
  currentUser: AuthenticatedUser,
): Promise<CustomerAccessContext> {
  const [userRows, roleRows, departmentRows] = await Promise.all([
    directory.user.findMany(),
    directory.role.findMany({ where: { isActive: true } }),
    directory.department.findMany(),
  ]);
  const users = userRows.map(mapPrismaUser);
  const roles = roleRows.map(mapPrismaRole);
  const departments = departmentRows.map(mapPrismaDepartment);
  return buildCustomerAccessContextFromDirectory(currentUser, users, roles, departments);
}

export function buildCustomerAccessContextFromDirectory(
  currentUser: AuthenticatedUser,
  users: User[],
  roles: Role[],
  departments: Department[],
): CustomerAccessContext {
  const actor = users.find((user) => (
    user.id === currentUser.id
    && user.isActive
    && (user.employmentStatus || 'active') === 'active'
  ));
  if (!actor) return emptyContext(currentUser.id);

  // Stable roleId is required. Names and role labels are display snapshots only.
  const role = roles.find((candidate) => candidate.id === actor.roleId && candidate.isActive);
  if (!role) return emptyContext(actor.id, actor.name);
  const rawScope = explicitCustomerScope(role.dataScopes?.customers);
  if (rawScope === null) return emptyContext(actor.id, actor.name);
  const scope = rawScope ?? normalizeRoleDataScopes(role).customers;
  const activeUsers = users.filter((user) => (
    user.isActive && (user.employmentStatus || 'active') === 'active'
  ));

  let manageableUsers: typeof activeUsers = [];
  if (scope === 'self') {
    manageableUsers = [actor];
  } else if (scope === 'all') {
    manageableUsers = activeUsers;
  } else if (actor.departmentId && scope === 'department') {
    const departmentIds = new Set([
      actor.departmentId,
      ...getDepartmentDescendantIds(departments, actor.departmentId),
    ]);
    manageableUsers = activeUsers.filter((user) => Boolean(
      user.departmentId && departmentIds.has(user.departmentId),
    ));
  }

  const grantedPermissions = new Set<string>();
  for (const [permissionKey, action] of CUSTOMER_MUTATION_PERMISSION_ACTIONS) {
    if (roleHasPermission(role, permissionKey, action)) grantedPermissions.add(permissionKey);
  }
  return {
    actorId: actor.id,
    actorName: actor.name,
    readableUserIds: new Set(manageableUsers.map((user) => user.id)),
    legacyReadableNames: new Set(manageableUsers.map((user) => user.name).filter(Boolean)),
    manageableOwnerIds: new Set(manageableUsers.map((user) => user.id)),
    canReadPublicPool: roleHasPermission(role, PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_VIEW, 'read'),
    canReadCustomerList: roleHasPermission(role, PERMISSION_KEYS.CUSTOMER_LIST, 'read'),
    grantedPermissions,
  };
}

function assertPermission(context: CustomerAccessContext, permission: { key: string; label: string }): void {
  if (!context.grantedPermissions.has(permission.key)) {
    throw new Error(`无权${permission.label}`);
  }
}

export function canManageCustomer(context: CustomerAccessContext, customer: Customer): boolean {
  if (customer.deletedAt || customer.mergedIntoId) return false;
  if (customer.ownerIdentityStatus !== 'resolved' || !customer.ownerId) return false;
  return context.manageableOwnerIds.has(customer.ownerId);
}

export function canManageHistoricalMergedCustomer(
  context: CustomerAccessContext,
  customer: Customer,
  expectedMainCustomerId: string,
  expectedLedgerId: string,
): boolean {
  if (customer.deletedAt
    || customer.mergedIntoId !== expectedMainCustomerId
    || customer.mergeLedgerId !== expectedLedgerId
    || customer.ownerIdentityStatus !== 'resolved'
    || !customer.ownerId) return false;
  return context.manageableOwnerIds.has(customer.ownerId);
}

export function canReadCustomer(context: CustomerAccessContext, customer: Customer): boolean {
  if (customer.deletedAt) return false;
  if (customer.lifecycleStatusCode === LIFECYCLE_STATUS_CODES.PUBLIC_POOL) {
    return context.canReadPublicPool;
  }
  if (!context.canReadCustomerList) return false;
  if (canManageCustomer(context, customer)) return true;
  const canReadByStableOwner = Boolean(
    customer.ownerId && context.readableUserIds.has(customer.ownerId),
  );
  const canReadByLegacyOwner = customer.ownerIdentityStatus !== 'resolved'
    && !customer.ownerId
    && Boolean(customer.owner && context.legacyReadableNames.has(customer.owner));
  const canReadByContributor = Boolean(
    (customer.leadContributorId && context.readableUserIds.has(customer.leadContributorId))
    || (
      !customer.leadContributorId
      && customer.leadContributorName
      && context.legacyReadableNames.has(customer.leadContributorName)
    )
  );
  return canReadByStableOwner
    || canReadByLegacyOwner
    || canReadByContributor;
}

export function assertCanManageCustomer(context: CustomerAccessContext, customer: Customer): void {
  if (!canManageCustomer(context, customer)) throw new Error('无权操作该客户');
}

export function assertCustomerActionPermission(
  context: CustomerAccessContext,
  action: CustomerMutationAction,
): void {
  assertPermission(context, ACTION_PERMISSION[action]);
}

export function assertCustomerClaimPermission(context: CustomerAccessContext): void {
  assertPermission(context, {
    key: PERMISSION_KEYS.CUSTOMER_PUBLIC_POOL_CLAIM,
    label: '领取公海客户',
  });
}

export function assertCustomerFieldPermissions(
  context: CustomerAccessContext,
  patch: Record<string, unknown>,
): void {
  const groups = new Set<CustomerFieldGroup>();
  const keys = Object.keys(patch);
  if (keys.some((key) => PROFILE_FIELDS.has(key))) groups.add('profile');
  if ('lifecycleStatusCode' in patch) groups.add('progress');
  if ('manualTagIds' in patch) groups.add('tags');
  if (keys.some((key) => ATTRIBUTION_FIELDS.has(key))) groups.add('attribution');
  for (const group of groups) assertPermission(context, FIELD_GROUP_PERMISSION[group]);
}
