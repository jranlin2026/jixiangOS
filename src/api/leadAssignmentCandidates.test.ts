import assert from 'node:assert/strict';
import {
  getLeadAssignmentCandidates,
  getLeadReceiveEligibleUsers,
  getScopedLeadAssignmentCandidates,
  NO_LEAD_FLOW_PARTICIPANTS_MARKER,
} from '../shared/utils/leadAssignment';
import { STORAGE_KEYS } from '../shared/utils/constants';
import type { AuthenticatedUser } from '../types/auth';
import type { Department } from '../types/department';
import type { LeadFlowConfig } from '../types/lead';
import type { Role } from '../types/role';
import type { User } from '../types/settings';
import { CAPABILITY_KEYS } from '../shared/utils/permissions';

const storage = (() => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: storage,
  configurable: true,
});

const now = '2026-07-02T00:00:00.000Z';

const roles: Role[] = [
  {
    id: 'role-super-admin',
    name: '超级管理员',
    code: 'super_admin',
    permissions: [{ module: '*', actions: ['admin'] }],
    dataScopes: { leads: 'all', customers: 'all' },
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-sales-manager',
    name: '销售经理',
    code: 'sales_manager',
    permissions: [{ module: CAPABILITY_KEYS.LEADS_RECEIVE, actions: ['read'] }],
    dataScopes: { leads: 'department', customers: 'department' },
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-sales',
    name: '销售顾问',
    code: 'sales_consultant',
    permissions: [{ module: CAPABILITY_KEYS.LEADS_RECEIVE, actions: ['read'] }],
    dataScopes: { leads: 'self', customers: 'self' },
    memberCount: 2,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'role-finance',
    name: '财务专员',
    code: 'finance_specialist',
    permissions: [],
    dataScopes: { leads: 'self', customers: 'self' },
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const departments: Department[] = [
  {
    id: 'dept-sales',
    name: '销售部',
    code: 'SALES',
    memberCount: 2,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'dept-sales-a',
    name: '销售一部',
    code: 'SALES-A',
    parentId: 'dept-sales',
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'dept-finance',
    name: '财务部',
    code: 'FIN',
    memberCount: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
];

const users: User[] = [
  {
    id: 'user-super-admin',
    name: '超级管理员',
    account: 'admin',
    email: '',
    phone: '',
    role: '超级管理员',
    roleId: 'role-super-admin',
    departmentId: 'dept-sales',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-sales-manager',
    name: '销售经理',
    account: 'manager',
    email: '',
    phone: '',
    role: '销售经理',
    roleId: 'role-sales-manager',
    departmentId: 'dept-sales',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-sales-a',
    name: '销售一',
    account: 'sales-a',
    email: '',
    phone: '',
    role: '销售顾问',
    roleId: 'role-sales',
    departmentId: 'dept-sales',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-sales-child',
    name: '销售二',
    account: 'sales-child',
    email: '',
    phone: '',
    role: '销售顾问',
    roleId: 'role-sales',
    departmentId: 'dept-sales-a',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-finance',
    name: '财务',
    account: 'finance',
    email: '',
    phone: '',
    role: '财务专员',
    roleId: 'role-finance',
    departmentId: 'dept-finance',
    isActive: true,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'user-left',
    name: '离职员工',
    account: 'left',
    email: '',
    phone: '',
    role: '销售顾问',
    roleId: 'role-sales',
    departmentId: 'dept-sales',
    isActive: true,
    employmentStatus: 'left',
    createdAt: now,
    updatedAt: now,
  },
];

const baseConfig: LeadFlowConfig = {
  id: 'lead-flow-global',
  uniqueKeyMode: 'phone_or_wechat',
  interceptionEnabled: true,
  autoAssignEnabled: true,
  autoClaimAfterAssignmentEnabled: false,
  assignmentMode: 'round_robin',
  participantUserIds: [],
  dailyLimitEnabled: false,
  dailyLimit: 200,
  lastAssignedIndex: -1,
  updatedAt: now,
};

function seedOrganization(): void {
  storage.clear();
  storage.setItem(STORAGE_KEYS.ORGANIZATION_SCHEMA_VERSION, '999');
  storage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  storage.setItem(STORAGE_KEYS.ROLES, JSON.stringify(roles));
  storage.setItem(STORAGE_KEYS.DEPARTMENTS, JSON.stringify(departments));
  storage.setItem(STORAGE_KEYS.POSITIONS, JSON.stringify([]));
}

function currentUser(id: string): AuthenticatedUser {
  const user = users.find((item) => item.id === id);
  assert.ok(user);
  return {
    id: user.id,
    name: user.name,
    account: user.account || '',
    email: user.email,
    phone: user.phone,
    role: user.role,
    roleId: user.roleId,
    departmentId: user.departmentId,
    permissions: [],
    isActive: user.isActive,
  };
}

function currentUserWithoutDepartment(id: string): AuthenticatedUser {
  const user = currentUser(id);
  return {
    ...user,
    departmentId: undefined,
  };
}

function ids(items: User[]): string[] {
  return items.map((user) => user.id).sort();
}

seedOrganization();

assert.deepEqual(
  getLeadAssignmentCandidates(users, baseConfig).map((user) => user.id),
  ['user-super-admin', 'user-sales-manager', 'user-sales-a', 'user-sales-child'],
  '默认候选必须排除没有领取线索权限的在职员工',
);

assert.deepEqual(
  getLeadAssignmentCandidates(users, { ...baseConfig, participantUserIds: ['user-super-admin'] }).map((user) => user.id),
  ['user-super-admin'],
);

assert.deepEqual(
  getLeadAssignmentCandidates(users, { ...baseConfig, participantUserIds: [NO_LEAD_FLOW_PARTICIPANTS_MARKER] }).map((user) => user.id),
  [],
);

assert.deepEqual(
  ids(getLeadReceiveEligibleUsers(users, roles)),
  ['user-sales-a', 'user-sales-child', 'user-sales-manager', 'user-super-admin'],
  '默认参与人数只统计在职、启用且拥有领取线索权限的员工',
);

assert.deepEqual(
  ids(getScopedLeadAssignmentCandidates(users, baseConfig, 'leads', currentUser('user-sales-manager'))),
  ['user-sales-a', 'user-sales-child', 'user-sales-manager', 'user-super-admin'],
);

assert.deepEqual(
  ids(getScopedLeadAssignmentCandidates(users, baseConfig, 'customers', currentUserWithoutDepartment('user-sales-manager'))),
  ['user-sales-manager'],
  '缺少可信部门 ID 时不得从浏览器存储补权，应收敛为本人范围',
);

assert.deepEqual(
  ids(getScopedLeadAssignmentCandidates(
    users.filter((user) => user.id === 'user-sales-manager'),
    { ...baseConfig, participantUserIds: ['user-sales-a', 'user-sales-child', 'user-finance'] },
    'customers',
    currentUser('user-sales-manager'),
  )),
  ['user-sales-a', 'user-sales-child'],
);

assert.deepEqual(
  ids(getScopedLeadAssignmentCandidates(
    users,
    { ...baseConfig, participantUserIds: ['user-sales-a', 'user-finance'] },
    'leads',
    currentUser('user-sales-manager'),
  )),
  ['user-sales-a'],
);

assert.deepEqual(
  ids(getScopedLeadAssignmentCandidates(
    users,
    { ...baseConfig, participantUserIds: ['user-finance'] },
    'leads',
    currentUser('user-sales-manager'),
  )),
  [],
);

assert.deepEqual(
  ids(getScopedLeadAssignmentCandidates(
    users,
    { ...baseConfig, participantUserIds: ['user-finance', 'user-sales-a'] },
    'customers',
    currentUser('user-super-admin'),
  )),
  ['user-sales-a'],
  '超级管理员的数据范围不能绕过候选人的领取权限',
);
